//! P1.8 (A5) — local model runtimes: Ollama detection + managed spawn,
//! llamafile single-binary launch, and model listing with context windows.
//!
//! - **Ollama** is detected via `OLLAMA_HOST` (default `http://127.0.0.1:11434`)
//!   by probing `GET /api/tags`; if absent, [`LocalManager::ensure_ollama`]
//!   spawns `ollama serve` detached and waits for the endpoint.
//! - **llamafile** (doc 34 §2: weights + server in one binary, zero install)
//!   is launched with `--host 127.0.0.1 --port {p} --ctx-size {num_ctx}
//!   --nobrowser` and health-checked via `/health`.
//!
//! Context windows (doc 33 §7.4): Ollama's default 4,096 is too low — below
//! 15K the agent loops. We force `num_ctx` (default 16,384) on every call
//! (the vault broker does that per-request) and surface the effective window
//! to the UI so it can warn loudly under 15K.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// The doc-33 §7.4 context floor: 15–20K. `DEFAULT_NUM_CTX` lives in the
/// vault crate too; this mirrors it for config defaults.
pub const DEFAULT_NUM_CTX: u32 = 16_384;

/// `[local]` section of `everyaios.toml` (P1.8/A5).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LocalConfig {
    /// Ollama endpoint (env `OLLAMA_HOST` wins at runtime when set).
    #[serde(default = "default_ollama_host")]
    pub ollama_host: String,
    /// Explicit `ollama` binary; `None` = resolve from `PATH`.
    #[serde(default)]
    pub ollama_bin: Option<PathBuf>,
    /// Explicit llamafile binary; `None` = search `<data_dir>/bin/*.llamafile`
    /// then `EVERYAIOS_LLAMAFILE`.
    #[serde(default)]
    pub llamafile_bin: Option<PathBuf>,
    /// Port for the managed llamafile server (avoids ollama's 11434).
    #[serde(default = "default_llamafile_port")]
    pub llamafile_port: u16,
    /// Context window forced on every local call (doc 33 §7.4 floor).
    #[serde(default = "default_num_ctx")]
    pub num_ctx: u32,
}

fn default_ollama_host() -> String {
    "http://127.0.0.1:11434".to_string()
}
fn default_llamafile_port() -> u16 {
    11435
}
fn default_num_ctx() -> u32 {
    DEFAULT_NUM_CTX
}

impl Default for LocalConfig {
    fn default() -> Self {
        Self {
            ollama_host: default_ollama_host(),
            ollama_bin: None,
            llamafile_bin: None,
            llamafile_port: default_llamafile_port(),
            num_ctx: DEFAULT_NUM_CTX,
        }
    }
}

/// One installed local model (for the catalog + context-warning UI).
#[derive(Debug, Clone, PartialEq)]
pub struct LocalModelInfo {
    pub name: String,
    pub size_bytes: u64,
    /// Effective context window (min of forced num_ctx and the model's own
    /// max). This is what the UI compares against the 15K warning floor.
    pub context_window: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum LocalError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("http probe failed: {0}")]
    Http(String),
    #[error("invalid endpoint URL: {0}")]
    BadUrl(String),
    #[error("ollama did not come up within {0}s")]
    OllamaTimeout(u64),
    #[error("llamafile did not become healthy within {0}s")]
    LlamafileTimeout(u64),
    #[error(
        "no llamafile binary found (set llamafile_bin, EVERYAIOS_LLAMAFILE, or drop one in {0})"
    )]
    NoLlamafile(String),
}

/// Local runtime management (A5). Stateless probes + spawn helpers.
#[derive(Debug, Clone)]
pub struct LocalManager {
    pub cfg: LocalConfig,
}

impl LocalManager {
    pub fn new(cfg: LocalConfig) -> Self {
        Self { cfg }
    }

    pub fn from_config(config: &crate::Config) -> Self {
        Self {
            cfg: config.local.clone(),
        }
    }

    /// The runtime-resolved ollama host: `OLLAMA_HOST` env wins, else config.
    pub fn ollama_host(&self) -> String {
        std::env::var("OLLAMA_HOST")
            .map(|h| h.trim_end_matches('/').to_string())
            .unwrap_or_else(|_| self.cfg.ollama_host.trim_end_matches('/').to_string())
    }

    /// Is ollama answering `GET /api/tags` right now? Retries briefly — a
    /// freshly spawned server (or a test mock) may not have its accept loop
    /// up on the very first connection.
    pub fn ollama_running(&self) -> bool {
        for _ in 0..3 {
            match self.get_json("/api/tags", Duration::from_secs(2)) {
                Ok(b) if b.contains("\"models\"") => return true,
                _ => std::thread::sleep(Duration::from_millis(200)),
            }
        }
        false
    }

    /// Managed spawn: start `ollama serve` detached and wait (≤20s) for
    /// `/api/tags`. Returns `Ok(false)` when already running, `Ok(true)`
    /// when this call started it.
    pub fn ensure_ollama(&self) -> Result<bool, LocalError> {
        if self.ollama_running() {
            return Ok(false);
        }
        let bin = self
            .cfg
            .ollama_bin
            .clone()
            .unwrap_or_else(|| PathBuf::from("ollama"));
        let mut cmd = Command::new(&bin);
        cmd.arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        // Detach from our process group so the app exiting never orphans it
        // mid-request (same setsid pattern as the supervisor's macOS path).
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        cmd.spawn().map_err(|e| {
            LocalError::Http(format!(
                "could not spawn `{} serve`: {e} (install ollama or set ollama_bin)",
                bin.display()
            ))
        })?;
        let deadline = Duration::from_secs(20);
        let start = std::time::Instant::now();
        while start.elapsed() < deadline {
            if self.ollama_running() {
                return Ok(true);
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        Err(LocalError::OllamaTimeout(20))
    }

    /// Locate a bundled llamafile: explicit config → `EVERYAIOS_LLAMAFILE`
    /// → first `*.llamafile` in `<data_dir>/bin`.
    pub fn find_llamafile(&self, data_dir: &Path) -> Option<PathBuf> {
        if let Some(bin) = &self.cfg.llamafile_bin {
            if bin.exists() {
                return Some(bin.clone());
            }
        }
        if let Ok(bin) = std::env::var("EVERYAIOS_LLAMAFILE") {
            let p = PathBuf::from(bin);
            if p.exists() {
                return Some(p);
            }
        }
        let bin_dir = data_dir.join("bin");
        let Ok(entries) = std::fs::read_dir(&bin_dir) else {
            return None;
        };
        let mut found: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x == "llamafile"))
            .collect();
        found.sort();
        found.into_iter().next()
    }

    /// Launch a llamafile single binary with our context floor and wait for
    /// `/health` (≤60s — first run may unpack). `Ok(false)` = already up.
    pub fn ensure_llamafile(&self, bin: PathBuf, port: u16) -> Result<bool, LocalError> {
        if self.llamafile_healthy(port) {
            return Ok(false);
        }
        let mut cmd = Command::new(&bin);
        cmd.args([
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
            "--ctx-size",
            &self.cfg.num_ctx.to_string(),
            "--nobrowser",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        cmd.spawn().map_err(|e| {
            LocalError::Http(format!(
                "could not spawn llamafile `{}`: {e}",
                bin.display()
            ))
        })?;
        let deadline = Duration::from_secs(60);
        let start = std::time::Instant::now();
        while start.elapsed() < deadline {
            if self.llamafile_healthy(port) {
                return Ok(true);
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        Err(LocalError::LlamafileTimeout(60))
    }

    /// llama.cpp server `/health` probe (llamafile exposes the same). Retries
    /// — first launch unpacks the model for seconds.
    pub fn llamafile_healthy(&self, port: u16) -> bool {
        for _ in 0..3 {
            match self.get_raw("127.0.0.1", port, "/health", Duration::from_secs(2)) {
                Ok(b) if b.contains("ok") => return true,
                _ => std::thread::sleep(Duration::from_millis(200)),
            }
        }
        false
    }

    /// Installed ollama models with their effective context windows.
    pub fn list_ollama_models(&self) -> Vec<LocalModelInfo> {
        let Ok(tags) = self.get_json("/api/tags", Duration::from_secs(3)) else {
            return Vec::new();
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&tags) else {
            return Vec::new();
        };
        let Some(models) = v.get("models").and_then(|m| m.as_array()) else {
            return Vec::new();
        };
        models
            .iter()
            .filter_map(|m| {
                let name = m.get("name").and_then(|n| n.as_str())?.to_string();
                let size = m.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                let window = self.ollama_model_context(&name);
                Some(LocalModelInfo {
                    name,
                    size_bytes: size,
                    context_window: window,
                })
            })
            .collect()
    }

    /// Effective context for one ollama model: `min(num_ctx, model max)`.
    /// Model max comes from `/api/show` (a **POST** with `{"name": ...}` —
    /// ollama does not serve it over GET) `model_info`
    /// (`general.context_length` or `llama.context_length`); unknown max =
    /// the forced `num_ctx`.
    fn ollama_model_context(&self, name: &str) -> u32 {
        let model_max = self
            .post_json(
                "/api/show",
                &serde_json::json!({ "name": name }),
                Duration::from_secs(3),
            )
            .ok()
            .and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok())
            .and_then(|v| {
                let info = v.get("model_info")?;
                info.get("general.context_length")
                    .or_else(|| info.get("llama.context_length"))
                    .and_then(|c| c.as_u64())
            })
            .unwrap_or(u64::MAX) as u32;
        model_max.min(self.cfg.num_ctx)
    }

    /// The vault broker endpoint for a local provider name (if configured).
    pub fn endpoint_for(&self, provider: &str) -> Option<everyaios_vault::LocalEndpoint> {
        match provider {
            "ollama" => Some(
                everyaios_vault::LocalEndpoint::ollama(self.ollama_host())
                    .with_num_ctx(self.cfg.num_ctx),
            ),
            "llamafile" => {
                let port = self.cfg.llamafile_port;
                Some(
                    everyaios_vault::LocalEndpoint::llamafile(format!("http://127.0.0.1:{port}"))
                        .with_num_ctx(self.cfg.num_ctx),
                )
            }
            _ => None,
        }
    }

    /// A map of every configured local provider → endpoint (for the broker).
    pub fn endpoints(&self) -> HashMap<String, everyaios_vault::LocalEndpoint> {
        let mut out = HashMap::new();
        if let Some(ep) = self.endpoint_for("ollama") {
            out.insert("ollama".to_string(), ep);
        }
        if let Some(ep) = self.endpoint_for("llamafile") {
            out.insert("llamafile".to_string(), ep);
        }
        out
    }

    // ---- minimal HTTP helpers (no extra deps; localhost only) -----------

    /// GET a path on the ollama host, return the raw body. Retries 3× — a
    /// freshly spawned ollama (or a busy test box) can drop the first probe.
    fn get_json(&self, path: &str, timeout: Duration) -> Result<String, LocalError> {
        let (host, port) = parse_host_port(&self.ollama_host())?;
        let mut last = LocalError::Http("no attempt".into());
        for _ in 0..3 {
            match self.get_raw(&host, port, path, timeout) {
                Ok(b) => return Ok(b),
                Err(e) => {
                    last = e;
                    std::thread::sleep(Duration::from_millis(150));
                }
            }
        }
        Err(last)
    }

    /// POST a JSON body to a path on the ollama host (e.g. `/api/show`,
    /// which ollama only serves over POST). Retries 3× like the GET probe.
    fn post_json(
        &self,
        path: &str,
        body: &serde_json::Value,
        timeout: Duration,
    ) -> Result<String, LocalError> {
        let (host, port) = parse_host_port(&self.ollama_host())?;
        let mut last = LocalError::Http("no attempt".into());
        for _ in 0..3 {
            match self.post_raw(&host, port, path, body, timeout) {
                Ok(b) => return Ok(b),
                Err(e) => {
                    last = e;
                    std::thread::sleep(Duration::from_millis(150));
                }
            }
        }
        Err(last)
    }

    fn get_raw(
        &self,
        host: &str,
        port: u16,
        path: &str,
        timeout: Duration,
    ) -> Result<String, LocalError> {
        let mut stream = connect(host, port, timeout)?;
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n"
        )?;
        read_response(stream, path, timeout)
    }

    fn post_raw(
        &self,
        host: &str,
        port: u16,
        path: &str,
        body: &serde_json::Value,
        timeout: Duration,
    ) -> Result<String, LocalError> {
        let body_str = serde_json::to_string(body).map_err(|e| LocalError::Http(e.to_string()))?;
        let mut stream = connect(host, port, timeout)?;
        write!(
            stream,
            "POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body_str.len(),
            body_str
        )?;
        read_response(stream, path, timeout)
    }
}

/// Connect to a localhost HTTP endpoint with connect + read timeouts.
fn connect(host: &str, port: u16, timeout: Duration) -> Result<TcpStream, LocalError> {
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .map_err(|_| LocalError::BadUrl(format!("{host}:{port}")))?;
    let stream = TcpStream::connect_timeout(&addr, timeout)?;
    stream.set_read_timeout(Some(timeout))?;
    Ok(stream)
}

/// Read an HTTP response to EOF and extract the body (2xx only).
fn read_response(
    mut stream: TcpStream,
    path: &str,
    timeout: Duration,
) -> Result<String, LocalError> {
    stream.set_read_timeout(Some(timeout))?;
    let mut resp = String::new();
    stream.read_to_string(&mut resp)?;
    let body = resp.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
    if resp.starts_with("HTTP/1.1 2") {
        Ok(body)
    } else {
        Err(LocalError::Http(format!(
            "{} -> {}",
            path,
            resp.lines().next().unwrap_or("no status")
        )))
    }
}

/// Split `http://host:port` into `(host, port)`.
fn parse_host_port(url: &str) -> Result<(String, u16), LocalError> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| LocalError::BadUrl(url.to_string()))?;
    let (host, port) = match rest.rsplit_once(':') {
        Some((h, p)) => (
            h.to_string(),
            p.parse::<u16>()
                .map_err(|_| LocalError::BadUrl(url.to_string()))?,
        ),
        None => (rest.to_string(), 11434),
    };
    Ok((host, port))
}

#[cfg(test)]
#[path = "local_tests.rs"]
mod tests;
