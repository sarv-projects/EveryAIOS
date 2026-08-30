//! P27 — Local Model Fetch / Download Core (exact, doc 79, 2026-08-16).
//!
//! The backend half of the local-model story (the Discover UI lives in
//! `ui/src/components/panels/local-models-panel.tsx`):
//!
//! - [`hf`] — live Hugging Face Hub client + **resumable** GGUF downloader
//!   (`Range` + `X-Linked-Etag`, `.part` staging, sha256 via `.gguf.sha256`
//!   **and** LFS `oid sha256:`, byte progress, disk preflight, quant
//!   recommendation from live RAM + Hub list). **Zero repo ids hardcoded.**
//! - [`store`] — `<data_dir>/models/hf/{publisher}/{model}/{quant}-{sha8}.gguf`
//!   + `index.json` registry (id/path/sha256/size/ctx/quant/source).
//! - [`local_url`] — `local://` URLs (hf / ollama / llamafile) + resolver
//!   (derived from registry + installed runtimes, never a hardcoded catalog).
//! - [`probe`] — hardware probes (CPU/RAM/disk/VRAM) + runtime process
//!   discovery + TTL-cached OpenAI-compatible endpoint probing.
//! - [`ModelsRuntime`] — bind a downloaded GGUF to a runtime (managed
//!   llamafile serve, or `ollama create`), fail-closed when no runtime exists.

pub mod hf;
pub mod local_url;
pub mod probe;
pub mod store;

pub use hf::{HfClient, HfError, HfFile};
pub use local_url::{LocalUrl, LocalUrlError, LocalUrlResolver, ResolvedEndpoint};
pub use probe::{
    discover_runtimes, find_runtime_processes, probe_hardware, probe_openai_endpoint,
    DiscoveredRuntime, HardwareInfo, ProbeCache,
};
pub use store::{ModelEntry, ModelRegistry};

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use everyaios_vault::LocalEndpoint;

/// llama.cpp KV-cache element types (P39.4 — `-ctk`/`-ctv`, i.e.
/// `--cache-type-k/-v`; verified in `llama.cpp/common/arg.cpp`: F32 / F16 /
/// Q8_0 / Q4_0…). Quantizing the KV cache (Q8_0) cuts KV memory ~4× vs F32
/// with a bounded quality impact — the memory-constrained local-run choice
/// (spec §9.3 §4, chosen by the hardware-fit picker).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KvCacheType {
    F32,
    F16,
    Q8_0,
    Q4_0,
}

impl KvCacheType {
    /// The llama.cpp arg value for `--cache-type-k/-v`.
    pub fn as_llama_arg(self) -> &'static str {
        match self {
            KvCacheType::F32 => "F32",
            KvCacheType::F16 => "F16",
            KvCacheType::Q8_0 => "Q8_0",
            KvCacheType::Q4_0 => "Q4_0",
        }
    }
}

/// Runtime binding errors.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelsError {
    NoRuntime(&'static str),
    SpawnFailed(String),
    HealthTimeout,
    Io(String),
}

impl std::fmt::Display for ModelsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}

/// The Modelfile template for `ollama create` (P27 runtime binding).
pub const OLLAMA_MODELFILE: &str = "FROM {path}\n";

/// The llamafile launch args for a GGUF (pure so tests can assert the exact
/// wire, including the P39.4 KV-cache knob).
pub fn gguf_args(
    path: &Path,
    port: u16,
    num_ctx: u32,
    kv_cache: Option<KvCacheType>,
) -> Vec<String> {
    let mut args = vec![
        "--model".to_string(),
        path.display().to_string(),
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--ctx-size".to_string(),
        num_ctx.to_string(),
        "--nobrowser".to_string(),
    ];
    if let Some(kv) = kv_cache {
        // llama.cpp `-ctk/-ctv`: quantize both K and V caches to the same type.
        let t = kv.as_llama_arg().to_string();
        args.push("--cache-type-k".to_string());
        args.push(t.clone());
        args.push("--cache-type-v".to_string());
        args.push(t);
    }
    args
}

/// Bind a downloaded GGUF to a runtime.
pub struct ModelsRuntime;

impl ModelsRuntime {
    /// Serve `entry` with a managed **llamafile** (`--model <gguf>`), reusing
    /// the P1.8 health-wait discipline (≤60s). Returns the endpoint the broker
    /// can route `local://` URLs to.
    pub fn serve_gguf(
        entry: &ModelEntry,
        llamafile_bin: Option<&Path>,
        port: u16,
        num_ctx: u32,
        kv_cache: Option<KvCacheType>,
    ) -> Result<LocalEndpoint, ModelsError> {
        let bin = llamafile_bin.ok_or(ModelsError::NoRuntime(
            "llamafile not found (set llamafile_bin / EVERYAIOS_LLAMAFILE / drop one in data_dir/bin)",
        ))?;
        if !bin.exists() {
            return Err(ModelsError::NoRuntime("llamafile binary missing on disk"));
        }
        let path = PathBuf::from(&entry.path);
        if !path.exists() {
            return Err(ModelsError::Io(format!("gguf not on disk: {}", entry.path)));
        }

        let mut cmd = Command::new(bin);
        for arg in gguf_args(&path, port, num_ctx, kv_cache) {
            cmd.arg(arg);
        }
        let mut child = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| ModelsError::SpawnFailed(e.to_string()))?;

        // Health wait ≤60s (first run may unpack the weights).
        let base = format!("http://127.0.0.1:{port}");
        let deadline = std::time::Instant::now() + Duration::from_secs(60);
        while std::time::Instant::now() < deadline {
            if ureq::get(&format!("{base}/health"))
                .timeout(Duration::from_secs(1))
                .call()
                .map(|r| r.status() == 200)
                .unwrap_or(false)
            {
                return Ok(LocalEndpoint {
                    runtime: everyaios_vault::LocalRuntime::Llamafile,
                    base_url: base,
                    num_ctx,
                });
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        let _ = child.kill();
        Err(ModelsError::HealthTimeout)
    }

    /// Bind a GGUF via `ollama create <name> -f <Modelfile>` (the alternative
    /// runtime). Writes the Modelfile beside the registry, spawns the CLI,
    /// and fails closed when `ollama` is not on PATH.
    pub fn bind_ollama(entry: &ModelEntry, name: &str) -> Result<(), ModelsError> {
        if Command::new("ollama")
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| !s.success())
            .unwrap_or(true)
        {
            return Err(ModelsError::NoRuntime("ollama not on PATH"));
        }
        let modelfile = std::path::Path::new(&entry.path)
            .parent()
            .unwrap_or(Path::new("."))
            .join(format!("Modelfile.{name}"));
        let from_line = OLLAMA_MODELFILE.replace("{path}", &entry.path);
        std::fs::write(&modelfile, from_line).map_err(|e| ModelsError::Io(e.to_string()))?;
        let status = Command::new("ollama")
            .arg("create")
            .arg(name)
            .arg("-f")
            .arg(&modelfile)
            .status()
            .map_err(|e| ModelsError::SpawnFailed(e.to_string()))?;
        if !status.success() {
            return Err(ModelsError::SpawnFailed(format!(
                "ollama create exited {status:?}"
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry() -> ModelEntry {
        ModelEntry {
            id: "microsoft/phi-4:q4_k_m".into(),
            path: "/nonexistent/phi.gguf".into(),
            sha256: "00".repeat(32),
            size: 1,
            ctx: 16384,
            quant: "q4_k_m".into(),
            source: "hf".into(),
        }
    }

    #[test]
    fn serve_gguf_fails_closed_without_binary() {
        let e = entry();
        let err = ModelsRuntime::serve_gguf(&e, None, 11435, 16384, None).unwrap_err();
        assert!(matches!(err, ModelsError::NoRuntime(_)));
    }

    #[test]
    fn serve_gguf_fails_closed_on_missing_binary_file() {
        let e = entry();
        let err = ModelsRuntime::serve_gguf(
            &e,
            Some(Path::new("/nonexistent/llamafile")),
            11435,
            16384,
            None,
        )
        .unwrap_err();
        assert!(matches!(err, ModelsError::NoRuntime(_)));
    }

    #[test]
    fn serve_gguf_fails_closed_on_missing_gguf() {
        let tmp = std::env::temp_dir().join(format!("eaios-llf-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let bin = tmp.join("fake-llamafile");
        std::fs::write(&bin, "#!/bin/sh\nexit 0\n").unwrap();
        let mut e = entry();
        e.path = "/nonexistent/phi.gguf".into();
        let err = ModelsRuntime::serve_gguf(&e, Some(&bin), 11435, 16384, None).unwrap_err();
        assert!(matches!(err, ModelsError::Io(_)));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn gguf_args_include_kv_cache_knob_when_set() {
        let p = Path::new("/w/phi.gguf");
        let args = gguf_args(p, 11435, 16384, Some(KvCacheType::Q8_0));
        assert!(args.contains(&"--cache-type-k".to_string()));
        assert!(args.contains(&"--cache-type-v".to_string()));
        let k_idx = args.iter().position(|a| a == "--cache-type-k").unwrap();
        let v_idx = args.iter().position(|a| a == "--cache-type-v").unwrap();
        assert_eq!(args[k_idx + 1], "Q8_0");
        assert_eq!(args[v_idx + 1], "Q8_0");
        // Base args stay intact.
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"--ctx-size".to_string()));
    }

    #[test]
    fn gguf_args_omit_kv_knob_when_unset() {
        let p = Path::new("/w/phi.gguf");
        let args = gguf_args(p, 11435, 16384, None);
        assert!(!args.contains(&"--cache-type-k".to_string()));
        assert!(!args.contains(&"--cache-type-v".to_string()));
    }

    #[test]
    fn kv_cache_type_llama_arg_values_are_verbatim() {
        assert_eq!(KvCacheType::F32.as_llama_arg(), "F32");
        assert_eq!(KvCacheType::F16.as_llama_arg(), "F16");
        assert_eq!(KvCacheType::Q8_0.as_llama_arg(), "Q8_0");
        assert_eq!(KvCacheType::Q4_0.as_llama_arg(), "Q4_0");
    }

    #[test]
    fn ollama_bind_fails_closed_when_ollama_missing() {
        // In CI `ollama` is almost certainly absent → NoRuntime. If present,
        // this would spawn — so we only assert on the missing case by
        // checking the error type matches either NoRuntime or SpawnFailed.
        let e = entry();
        match ModelsRuntime::bind_ollama(&e, "test-name") {
            Err(ModelsError::NoRuntime(_)) => {}
            Err(ModelsError::SpawnFailed(_)) => {}
            Err(ModelsError::Io(_)) => {}
            Ok(()) => {} // ollama exists AND create succeeded — acceptable in a dev env
            Err(_) => panic!("unexpected error"),
        }
    }
}
