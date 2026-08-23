//! P27 — hardware probes + runtime process discovery (exact, doc 79).
//!
//! - Hardware: CPU name, total/available RAM, disk free, GPU VRAM (best-effort
//!   via `nvidia-smi` when present — never required).
//! - Processes: discover llama.cpp / ollama / llamafile processes from the
//!   OS process table, and probe OpenAI-compatible localhost endpoints.
//! - TTL cache so repeated discovery is cheap (default 10s).

use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default)]
pub struct HardwareInfo {
    pub cpu_name: String,
    pub total_ram_bytes: u64,
    pub available_ram_bytes: u64,
    pub disk_free_bytes: Option<u64>,
    /// VRAM in bytes; `None` when no GPU tool is present/working.
    pub gpu_vram_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DiscoveredRuntime {
    pub name: String,     // "ollama" | "llamafile" | "llama.cpp" | ...
    pub pid: Option<u32>,
    pub endpoint: Option<String>, // OpenAI-compatible base URL when probed
}

/// Probe the host hardware.
pub fn probe_hardware() -> HardwareInfo {
    let sys = sysinfo::System::new_all();
    let total_ram_bytes = sys.total_memory() * 1024;
    let available_ram_bytes = sys.available_memory() * 1024;

    let cpu_name = std::fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("model name"))
                .map(|l| l.split(':').nth(1).unwrap_or("").trim().to_string())
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    let disk_free_bytes = sysinfo::Disks::new_with_refreshed_list()
        .iter()
        .map(|d| d.available_space())
        .max();

    HardwareInfo {
        cpu_name,
        total_ram_bytes,
        available_ram_bytes,
        disk_free_bytes,
        gpu_vram_bytes: probe_nvidia_vram(),
    }
}

/// Best-effort NVIDIA VRAM via `nvidia-smi` (absent on non-NVIDIA machines).
fn probe_nvidia_vram() -> Option<u64> {
    let out = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=memory.total", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mb: f64 = text
        .lines()
        .next()?
        .split_whitespace()
        .next()?
        .parse()
        .ok()?;
    Some((mb * 1024.0 * 1024.0) as u64)
}

const RUNTIME_NAMES: &[&str] = &["ollama", "llamafile", "llama-server", "llama.cpp", "llama-cli"];

/// Process-table scan for local AI runtimes (Linux `/proc`, best-effort).
pub fn find_runtime_processes() -> Vec<DiscoveredRuntime> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return out;
    };
    for entry in entries.flatten() {
        let pid: u32 = match entry.file_name().to_string_lossy().parse() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let name = std::fs::read_to_string(format!("/proc/{pid}/comm"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let cmdline = std::fs::read_to_string(format!("/proc/{pid}/cmdline"))
            .map(|s| s.replace('\0', " "))
            .unwrap_or_default();
        for rt in RUNTIME_NAMES {
            if name.contains(rt) || cmdline.contains(rt) {
                out.push(DiscoveredRuntime {
                    name: rt.to_string(),
                    pid: Some(pid),
                    endpoint: None,
                });
                break;
            }
        }
    }
    out
}

/// OpenAI-compatible endpoint probe: `GET {base}/v1/models` must 200.
pub fn probe_openai_endpoint(base: &str) -> bool {
    let url = format!("{base}/v1/models");
    ureq::get(&url)
        .timeout(Duration::from_secs(2))
        .call()
        .map(|r| r.status() == 200)
        .unwrap_or(false)
}

/// TTL-cached probe of candidate localhost endpoints (default 10s).
#[derive(Debug, Default)]
pub struct ProbeCache {
    hits: HashMap<String, (bool, Instant)>,
    ttl: Duration,
}

impl ProbeCache {
    pub fn new(ttl: Duration) -> Self {
        Self {
            hits: HashMap::new(),
            ttl,
        }
    }

    pub fn with_default_ttl() -> Self {
        Self::new(Duration::from_secs(10))
    }

    /// Probe `base` (cached for the TTL). Deterministic, cheap to call
    /// repeatedly — e.g. every picker open.
    pub fn probe(&mut self, base: &str) -> bool {
        if let Some((ok, at)) = self.hits.get(base) {
            if at.elapsed() < self.ttl {
                return *ok;
            }
        }
        let ok = probe_openai_endpoint(base);
        self.hits.insert(base.to_string(), (ok, Instant::now()));
        ok
    }
}

/// Full discovery: process table + endpoint probes, TTL-cached.
pub fn discover_runtimes(cache: &mut ProbeCache, candidate_bases: &[String]) -> Vec<DiscoveredRuntime> {
    let mut out = find_runtime_processes();
    for base in candidate_bases {
        if cache.probe(base) {
            if let Some(existing) = out.iter_mut().find(|r| r.name == "ollama" && base.contains("11434")) {
                existing.endpoint = Some(base.clone());
            } else if let Some(existing) = out.iter_mut().find(|r| r.name == "llamafile") {
                existing.endpoint = Some(base.clone());
            } else {
                out.push(DiscoveredRuntime {
                    name: "openai-compatible".into(),
                    pid: None,
                    endpoint: Some(base.clone()),
                });
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_cache_honors_ttl() {
        let mut cache = ProbeCache::new(Duration::from_millis(50));
        // localhost with nothing listening → false, cached.
        let base = "http://127.0.0.1:59999".to_string();
        let first = cache.probe(&base);
        let second = cache.probe(&base); // cached (same result)
        assert_eq!(first, second);
        // After the TTL, it re-probes (still false — nothing listening).
        std::thread::sleep(Duration::from_millis(60));
        let third = cache.probe(&base);
        assert!(!third);
    }

    #[test]
    fn hardware_probe_returns_basics() {
        let h = probe_hardware();
        assert!(h.total_ram_bytes > 0, "RAM probe must find something");
        assert!(h.available_ram_bytes <= h.total_ram_bytes);
    }

    #[test]
    fn runtime_name_matching_covers_all() {
        // The RUNTIME_NAMES list is what the process scan keys on.
        assert!(RUNTIME_NAMES.contains(&"ollama"));
        assert!(RUNTIME_NAMES.contains(&"llamafile"));
    }
}
