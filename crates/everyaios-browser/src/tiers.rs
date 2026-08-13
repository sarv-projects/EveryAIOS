//! P2.4 — Tiered Engine Stack (E10; doc 08 §8.8, doc 55 Obscura/Lightpanda;
//! ARCH/08 §8.8 tier table, ARCH/06 §6.15 containment).
//!
//! Three engine tiers with automatic escalation (E8) — render only as heavy
//! as the task needs:
//!
//! | tier | engine    | cost        | JS  | auth | notes                                  |
//! |------|-----------|-------------|-----|------|----------------------------------------|
//! | 0    | static    | ~0 (no proc)| no  | no   | HTTP + markdown negotiation + llms.txt walk (`read::read_http`), HTML→markdown via `html2md`, SSRF guard at the orchestration layer |
//! | 1    | light     | ~30–60MB RSS| yes | no   | Lightpanda (default) or Obscura — `serve` on loopback, Chrome-compatible CDP, native SSRF/worker containment |
//! | 2    | chrome    | ~300MB+     | yes | yes  | full engine via `everyaios-cdp::spawn_browser` (login-needed pages, fallback) |
//!
//! Security posture (doc 55 §2 / ARCH/06 §6.15, copied from Obscura):
//! loopback/RFC1918/link-local destinations blocked by default (SSRF),
//! `file://` blocked, bounded CDP connections, workers disabled in light
//! engines (fail-closed), 2MB `--max-output` body cap. Every opt-in is
//! explicit (`EngineConfig::allow_private_network`, `allow_file_access`).

use crate::actions::DOM_WALKER_MARKDOWN;
use crate::read::{looks_like_html, read_http, ReadOptions, ReadSource};
use everyaios_cdp::discovery::connect_to_browser;
use everyaios_cdp::{
    spawn_browser, BrowserEndpoint, CdpClient, CdpError, LaunchOptions, TargetType,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::{IpAddr, TcpListener, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use url::Url;

/// Which lightweight engine tier 1 prefers (doc 55 — both speak the same
/// Chrome-compatible CDP surface).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LightEngine {
    #[default]
    Lightpanda,
    Obscura,
}

/// Why the caller is fetching — drives the starting tier (E8).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum FetchIntent {
    /// Plain content fetch — tier 0 handles most URLs.
    #[default]
    Static,
    /// The page needs JS rendering — start at tier 1.
    NeedsJs,
    /// Authenticated/session page — go straight to tier 2 (Chrome).
    NeedsLogin,
}

/// Which tier produced the result (E8 escalation trace).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineTier {
    Static,
    Lightpanda,
    Obscura,
    Chrome,
}

/// Result of a tiered fetch.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EngineResult {
    pub tier: EngineTier,
    pub markdown: String,
    /// Provenance: negotiation source (tier 0) or `DomWalked` (tier 1/2).
    pub source: ReadSource,
    pub truncated: bool,
}

/// Configuration for the tiered stack.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    /// SSRF opt-in: allow loopback/RFC1918/link-local destinations (doc 55
    /// §2 — blocked by default).
    pub allow_private_network: bool,
    /// `file://` opt-in (doc 55 §2 — blocked by default).
    pub allow_file_access: bool,
    /// Bounded CDP connections for light engines (doc 55:
    /// `DEFAULT_MAX_CONNECTIONS=128`).
    pub max_connections: u32,
    /// Max output bytes (doc 55 `--max-output`; default 2MB read cap).
    pub max_output: usize,
    /// Per-tier timeout.
    pub timeout: Duration,
    /// Preferred light engine.
    pub light_engine: LightEngine,
    /// Explicit light-engine binary paths (defaults to PATH lookup).
    pub lightpanda_bin: Option<PathBuf>,
    pub obscura_bin: Option<PathBuf>,
    /// Browser containment: when non-empty, only these domains may be loaded
    /// (agent-browser `--allowed-domains` semantics, doc 55 §1 / ARCH/06
    /// §6.15) — enforced at the orchestration layer on every tier.
    pub allowed_domains: Vec<String>,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            allow_private_network: false,
            allow_file_access: false,
            max_connections: 128,
            max_output: crate::read::READ_BODY_CAP,
            timeout: Duration::from_secs(15),
            light_engine: LightEngine::Lightpanda,
            lightpanda_bin: None,
            obscura_bin: None,
            allowed_domains: Vec::new(),
        }
    }
}

/// Errors from the tiered stack.
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("no such engine binary: {0} (install it or set the config path)")]
    BinaryNotFound(&'static str),
    #[error("failed to spawn {0}: {1}")]
    Spawn(&'static str, std::io::Error),
    #[error("SSRF guard: private/loopback/link-local destination blocked (set allow_private_network to opt in)")]
    SsrfBlocked,
    #[error("file:// blocked by default (set allow_file_access to opt in)")]
    FileBlocked,
    #[error("bad url: {0}")]
    BadUrl(String),
    #[error("domain not in allowed_domains: {0}")]
    DomainNotAllowed(String),
    #[error("http: {0}")]
    Http(#[from] Box<ureq::Error>),
    #[error("cdp: {0}")]
    Cdp(#[from] CdpError),
    #[error("engine timeout after {0:?}")]
    Timeout(Duration),
    #[error("no readable content")]
    NotFound,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

impl EngineError {
    /// A heavier tier can plausibly succeed where this tier failed (render
    /// may fix a broken negotiation; a bigger engine may fix a CDP gap).
    fn escalatable(&self) -> bool {
        matches!(
            self,
            EngineError::Http(_)
                | EngineError::Timeout(_)
                | EngineError::NotFound
                | EngineError::Cdp(_)
        )
    }

    /// A capability gap (missing binary / engine failure) rather than a
    /// policy rejection — heavier tiers are worth trying.
    fn is_capability_gap(&self) -> bool {
        matches!(
            self,
            EngineError::BinaryNotFound(_)
                | EngineError::Spawn(_, _)
                | EngineError::Cdp(_)
                | EngineError::Io(_)
        )
    }
}

impl From<LightEngine> for EngineTier {
    fn from(e: LightEngine) -> Self {
        match e {
            LightEngine::Lightpanda => EngineTier::Lightpanda,
            LightEngine::Obscura => EngineTier::Obscura,
        }
    }
}

/// The tiered engine stack. Owns no processes; spawns engines per fetch and
/// tears them down on exit.
#[derive(Debug, Clone)]
pub struct TieredEngine {
    pub config: EngineConfig,
    /// Explicit Chrome binary override (falls back to system Chrome).
    pub chrome_binary: Option<PathBuf>,
}

impl TieredEngine {
    pub fn new(config: EngineConfig) -> Self {
        Self {
            config,
            chrome_binary: None,
        }
    }

    pub fn with_chrome_binary(mut self, bin: PathBuf) -> Self {
        self.chrome_binary = Some(bin);
        self
    }

    /// Fetch `url` with the cheapest tier that can satisfy `intent`,
    /// escalating 0→1→2 on failure (E8).
    pub fn fetch(&self, url: &str, intent: FetchIntent) -> Result<EngineResult, EngineError> {
        let start = match intent {
            FetchIntent::NeedsLogin => EngineTier::Chrome,
            FetchIntent::NeedsJs => self.config.light_engine.into(),
            FetchIntent::Static => EngineTier::Static,
        };
        let mut tier = start;
        loop {
            let result = match tier {
                EngineTier::Static => self.static_fetch(url),
                EngineTier::Lightpanda | EngineTier::Obscura => self.light_fetch(url),
                EngineTier::Chrome => self.chrome_fetch(url),
            };
            match result {
                Ok(r) => return Ok(r),
                Err(err) => match self.escalate_from(tier, &err) {
                    Some(next) => tier = next,
                    None => return Err(err),
                },
            }
        }
    }

    /// After `tier` failed with `err`, which tier to try next (None = stop).
    pub fn escalate_from(&self, tier: EngineTier, err: &EngineError) -> Option<EngineTier> {
        match tier {
            EngineTier::Static => {
                // Policy rejections (SSRF/file://domains) are not capability
                // problems — a heavier engine would hit the same wall.
                if err.escalatable() || err.is_capability_gap() {
                    Some(self.config.light_engine.into())
                } else {
                    None
                }
            }
            EngineTier::Lightpanda | EngineTier::Obscura => {
                if err.is_capability_gap() {
                    Some(EngineTier::Chrome)
                } else {
                    None
                }
            }
            EngineTier::Chrome => None,
        }
    }

    // ------------------------------------------------------------------
    // tier 0 — static extraction (no browser)
    // ------------------------------------------------------------------

    fn static_fetch(&self, url: &str) -> Result<EngineResult, EngineError> {
        if url.starts_with("file:") {
            return Err(EngineError::FileBlocked);
        }
        self.guard_ssrf(url)?;
        self.guard_domain(url)?;
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(self.config.timeout)
            .timeout_read(self.config.timeout)
            .build();
        // read_http does Accept: text/markdown → .md retry → llms.txt walk
        // (doc 55 read.rs). When only plain HTML came back, convert it.
        let mut res = read_http(&agent, url, &ReadOptions::default())?;
        if res.source == ReadSource::PlainHtml && looks_like_html(&res.markdown) {
            res.markdown = html2md::parse_html(&res.markdown);
        }
        let truncated = cap_output(&mut res.markdown, self.config.max_output);
        Ok(EngineResult {
            tier: EngineTier::Static,
            markdown: res.markdown,
            source: res.source,
            truncated,
        })
    }

    /// SSRF guard (doc 55 §2, ARCH/06 §6.15): loopback/RFC1918/link-local/
    /// unique-local blocked unless `allow_private_network`. Checks literal
    /// IPs — including IPv4-mapped IPv6 (`::ffff:127.0.0.1` bypasses plain
    /// `is_loopback()`) — and, for hostnames, the DNS-resolved addresses.
    ///
    /// Known gap (documented decision, not oversight): the DNS resolution is
    /// checked once here, then ureq re-resolves at fetch time — a classic
    /// DNS-rebinding TOCTOU window. For a local desktop tool this is an
    /// accepted residual risk; a hardened build would pin the resolved IP.
    fn guard_ssrf(&self, url: &str) -> Result<(), EngineError> {
        if self.config.allow_private_network {
            return Ok(());
        }
        let parsed = Url::parse(url).map_err(|e| EngineError::BadUrl(e.to_string()))?;
        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(EngineError::BadUrl(format!(
                "scheme {} not allowed",
                parsed.scheme()
            )));
        }
        match parsed.host() {
            Some(url::Host::Ipv4(ip)) => {
                if ip.is_loopback() || ip.is_private() || ip.is_link_local() {
                    return Err(EngineError::SsrfBlocked);
                }
            }
            Some(url::Host::Ipv6(ip)) => {
                if is_private_ipv6(ip) {
                    return Err(EngineError::SsrfBlocked);
                }
            }
            Some(url::Host::Domain(domain)) => {
                if domain.eq_ignore_ascii_case("localhost") {
                    return Err(EngineError::SsrfBlocked);
                }
                // Hostname → resolve and re-check (a name pointing at a
                // private IP is still an SSRF vector).
                if let Ok(addrs) = (domain, 443).to_socket_addrs() {
                    for addr in addrs {
                        match addr.ip() {
                            IpAddr::V4(v4) => {
                                if v4.is_loopback() || v4.is_private() || v4.is_link_local() {
                                    return Err(EngineError::SsrfBlocked);
                                }
                            }
                            IpAddr::V6(v6) => {
                                if is_private_ipv6(v6) {
                                    return Err(EngineError::SsrfBlocked);
                                }
                            }
                        }
                    }
                }
            }
            None => return Err(EngineError::BadUrl("no host".into())),
        }
        Ok(())
    }

    /// Browser containment (agent-browser `--allowed-domains`, doc 55 §1).
    fn guard_domain(&self, url: &str) -> Result<(), EngineError> {
        if self.config.allowed_domains.is_empty() {
            return Ok(());
        }
        let host = Url::parse(url)
            .map_err(|e| EngineError::BadUrl(e.to_string()))?
            .host_str()
            .unwrap_or_default()
            .to_string();
        let allowed = self
            .config
            .allowed_domains
            .iter()
            .any(|d| host == *d || host.ends_with(&format!(".{d}")));
        if allowed {
            Ok(())
        } else {
            Err(EngineError::DomainNotAllowed(host))
        }
    }

    // ------------------------------------------------------------------
    // tier 1 — light engine (Lightpanda / Obscura)
    // ------------------------------------------------------------------

    fn light_fetch(&self, url: &str) -> Result<EngineResult, EngineError> {
        self.guard_ssrf(url)?;
        self.guard_domain(url)?;
        let spawned = self.spawn_light()?;
        let client = connect_to_browser(&spawned.endpoint)?;
        let tier = self.config.light_engine.into();
        // SpawnedLight's Drop kills + reaps the engine process.
        let res = self.fetch_via_cdp(&client, url, tier);
        drop(spawned);
        res
    }

    /// Spawn the configured light engine on loopback with its security
    /// defaults, and wait for its Chrome-compatible CDP endpoint.
    fn spawn_light(&self) -> Result<SpawnedLight, EngineError> {
        let port = free_port()?;
        match self.config.light_engine {
            LightEngine::Lightpanda => {
                let bin = self
                    .lightpanda_bin()
                    .filter(|p| p.is_file())
                    .ok_or(EngineError::BinaryNotFound("lightpanda"))?;
                let mut cmd = Command::new(bin);
                cmd.arg("serve")
                    .arg("--host")
                    .arg("127.0.0.1")
                    .arg("--port")
                    .arg(port.to_string());
                // SSRF default: block private networks unless opted in.
                if !self.config.allow_private_network {
                    cmd.arg("--block-private-networks");
                }
                // Worker fail-closed (doc 55 §1) + bounded connections.
                cmd.arg("--disable-workers")
                    .arg("--cdp-max-connections")
                    .arg(self.config.max_connections.to_string());
                cmd.stdout(Stdio::null()).stderr(Stdio::null());
                let child = cmd
                    .spawn()
                    .map_err(|e| EngineError::Spawn("lightpanda", e))?;
                let ws = wait_for_cdp_endpoint(port, self.config.timeout)?;
                Ok(SpawnedLight {
                    child,
                    endpoint: BrowserEndpoint {
                        browser_ws_url: ws,
                        version: "lightpanda".into(),
                    },
                })
            }
            LightEngine::Obscura => {
                let bin = self
                    .obscura_bin()
                    .filter(|p| p.is_file())
                    .ok_or(EngineError::BinaryNotFound("obscura"))?;
                let mut cmd = Command::new(bin);
                cmd.arg("serve")
                    .arg("--host")
                    .arg("127.0.0.1")
                    .arg("--port")
                    .arg(port.to_string());
                // Obscura blocks private networks + file:// by default;
                // both are explicit opt-ins here (doc 55 §2).
                if self.config.allow_private_network {
                    cmd.arg("--allow-private-network");
                }
                if self.config.allow_file_access {
                    cmd.arg("--allow-file-access");
                }
                cmd.arg("--max-connections")
                    .arg(self.config.max_connections.to_string());
                cmd.stdout(Stdio::null()).stderr(Stdio::null());
                let child = cmd.spawn().map_err(|e| EngineError::Spawn("obscura", e))?;
                let ws = wait_for_cdp_endpoint(port, self.config.timeout)?;
                Ok(SpawnedLight {
                    child,
                    endpoint: BrowserEndpoint {
                        browser_ws_url: ws,
                        version: "obscura".into(),
                    },
                })
            }
        }
    }

    fn lightpanda_bin(&self) -> Option<PathBuf> {
        self.config
            .lightpanda_bin
            .clone()
            .or_else(|| find_in_path("lightpanda"))
    }

    fn obscura_bin(&self) -> Option<PathBuf> {
        self.config
            .obscura_bin
            .clone()
            .or_else(|| find_in_path("obscura"))
    }

    // ------------------------------------------------------------------
    // tier 2 — Chrome (full engine)
    // ------------------------------------------------------------------

    fn chrome_fetch(&self, url: &str) -> Result<EngineResult, EngineError> {
        self.guard_ssrf(url)?;
        self.guard_domain(url)?;
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let profile = TempProfile(std::env::temp_dir().join(format!(
            "everyaios-chrome-tier-{}-{nanos}",
            std::process::id()
        )));
        let opts = LaunchOptions {
            user_data_dir: profile.0.clone(),
            headless: true,
            browser_binary: self.chrome_binary.clone(),
            // WebRTC containment (ARCH/06 §6.15) — the light engines carry
            // the full fail-closed worker guards natively.
            extra_args: vec![
                "--disable-features=WebRTC".into(),
                "--disable-background-networking".into(),
            ],
            wait_timeout: self.config.timeout,
        };
        let spawned = spawn_browser(&opts)?;
        let client = connect_to_browser(spawned.endpoint())?;
        // BrowserChild's Drop kills + reaps Chrome; TempProfile's Drop
        // removes the profile dir on every exit path.
        let res = self.fetch_via_cdp(&client, url, EngineTier::Chrome);
        drop(spawned);
        res
    }

    // ------------------------------------------------------------------
    // shared CDP driver (tier 1 and tier 2)
    // ------------------------------------------------------------------

    /// Drive any Chrome-compatible engine: create a page, attach, navigate,
    /// wait for load, extract markdown via the DOM walker.
    fn fetch_via_cdp(
        &self,
        client: &CdpClient,
        url: &str,
        tier: EngineTier,
    ) -> Result<EngineResult, EngineError> {
        // Reuse the engine's existing page target when present (both fresh
        // Chrome and Lightpanda's `serve` expose one); create one only as a
        // fallback — Lightpanda doesn't implement Target.createTarget.
        // Note: `call` returns the *unwrapped* CDP result object, so
        // `targetId`/`sessionId` sit at the top level, not under `/result`.
        let targets = client.list_targets()?;
        let target_id = targets
            .iter()
            .find(|t| t.target_type == TargetType::Page)
            .map(|t| t.target_id.clone())
            .unwrap_or_else(|| {
                client
                    .call("Target.createTarget", json!({ "url": "about:blank" }))
                    .ok()
                    .and_then(|v| {
                        v.get("targetId")
                            .and_then(serde_json::Value::as_str)
                            .map(str::to_string)
                    })
                    .unwrap_or_default()
            });
        if target_id.is_empty() {
            return Err(EngineError::Cdp(CdpError::Protocol {
                code: -1,
                message: "no page target available".into(),
            }));
        }
        let attached = client.call(
            "Target.attachToTarget",
            json!({ "targetId": target_id, "flatten": true }),
        )?;
        let session_id = attached
            .get("sessionId")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| CdpError::Protocol {
                code: -1,
                message: format!("Target.attachToTarget: missing sessionId (got {attached})"),
            })?
            .to_string();
        client.call_session(&session_id, "Page.navigate", json!({ "url": url }))?;
        self.wait_ready(client, &session_id)?;
        let out = client.call_session(
            &session_id,
            "Runtime.evaluate",
            json!({
                "expression": DOM_WALKER_MARKDOWN,
                "returnByValue": true,
            }),
        )?;
        let mut markdown = out
            .pointer("/result/value")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string();
        if markdown.trim().is_empty() {
            return Err(EngineError::NotFound);
        }
        let truncated = cap_output(&mut markdown, self.config.max_output);
        Ok(EngineResult {
            tier,
            markdown,
            source: ReadSource::DomWalked,
            truncated,
        })
    }

    /// Poll `document.readyState == "complete"` (the light engines don't
    /// emit reliable load events through our sync facade, so poll).
    fn wait_ready(&self, client: &CdpClient, session_id: &str) -> Result<(), EngineError> {
        let deadline = Instant::now() + self.config.timeout;
        loop {
            if let Ok(out) = client.call_session(
                session_id,
                "Runtime.evaluate",
                json!({ "expression": "document.readyState", "returnByValue": true }),
            ) {
                if out
                    .pointer("/result/value")
                    .and_then(serde_json::Value::as_str)
                    == Some("complete")
                {
                    return Ok(());
                }
            }
            if Instant::now() >= deadline {
                return Err(EngineError::Timeout(self.config.timeout));
            }
            std::thread::sleep(Duration::from_millis(150));
        }
    }
}

/// A spawned light engine plus its discovered CDP endpoint. Killing happens
/// on drop (mirrors `everyaios_cdp::BrowserChild`).
struct SpawnedLight {
    child: Child,
    endpoint: BrowserEndpoint,
}

impl Drop for SpawnedLight {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Grab a free loopback port (small TOCTOU race — acceptable for a local
/// engine; if the port is taken the spawn fails fast and the caller escalates).
fn free_port() -> Result<u16, EngineError> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

/// Poll `/json/version` until the engine serves its `webSocketDebuggerUrl`.
fn wait_for_cdp_endpoint(port: u16, timeout: Duration) -> Result<String, EngineError> {
    let deadline = Instant::now() + timeout;
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(2))
        .timeout_read(Duration::from_secs(2))
        .build();
    let url = format!("http://127.0.0.1:{port}/json/version");
    loop {
        if let Ok(resp) = agent.get(&url).call() {
            if let Ok(body) = resp.into_string() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                    if let Some(ws) = v.get("webSocketDebuggerUrl").and_then(|x| x.as_str()) {
                        return Ok(ws.to_string());
                    }
                }
            }
        }
        if Instant::now() >= deadline {
            return Err(EngineError::Timeout(timeout));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// IPv6 SSRF test: `::1` loopback, `::` unspecified, `fe80::/10` link-local,
/// `fc00::/7` unique-local, and IPv4-mapped `::ffff:a.b.c.d` (the embedded
/// IPv4 is re-checked — `Ipv6Addr::is_loopback()` alone misses it).
fn is_private_ipv6(ip: std::net::Ipv6Addr) -> bool {
    let mapped = ip.to_ipv4_mapped();
    ip.is_loopback()
        || ip.is_unspecified()
        || (ip.segments()[0] & 0xffc0) == 0xfe80
        || (ip.segments()[0] & 0xfe00) == 0xfc00
        || mapped.is_some_and(|v4| v4.is_loopback() || v4.is_private() || v4.is_link_local())
}

/// Enforce the `--max-output` byte cap (doc 55): truncate at a char
/// boundary and append a marker. Returns true when truncated.
fn cap_output(markdown: &mut String, max_output: usize) -> bool {
    if markdown.len() <= max_output {
        return false;
    }
    let mut idx = max_output;
    while idx > 0 && !markdown.is_char_boundary(idx) {
        idx -= 1;
    }
    markdown.truncate(idx);
    markdown.push_str("\n… [truncated]");
    true
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(name))
            .find(|p| p.is_file())
    })
}

/// RAII cleanup for the Chrome tier's temp profile dir — removed on every
/// exit path (including early `?` returns and panics).
struct TempProfile(PathBuf);

impl Drop for TempProfile {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssrf_blocks_private_destinations_by_default() {
        let engine = TieredEngine::new(EngineConfig::default());
        for bad in [
            "http://127.0.0.1/x",
            "http://localhost/x",
            "http://10.0.0.1/x",
            "http://192.168.1.1/x",
            "http://172.16.5.5/x",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]/x",
            "http://[::]/x",
            // IPv4-mapped IPv6 bypasses plain is_loopback() — must be blocked.
            "http://[::ffff:127.0.0.1]/x",
            "http://[::ffff:10.0.0.1]/x",
            // IPv6 unique-local (private) range.
            "http://[fc00::1]/x",
            "http://[fd12:3456::1]/x",
        ] {
            assert!(
                matches!(engine.static_fetch(bad), Err(EngineError::SsrfBlocked)),
                "{bad} should be SSRF-blocked"
            );
        }
        // Opt-in flips the guard: now a private destination fails with a
        // connection error (nothing listening on :1), not SSRF.
        let engine = TieredEngine::new(EngineConfig {
            allow_private_network: true,
            ..Default::default()
        });
        assert!(!matches!(
            engine.static_fetch("http://127.0.0.1:1/x"),
            Err(EngineError::SsrfBlocked)
        ));
    }

    #[test]
    fn file_urls_blocked_by_default() {
        let engine = TieredEngine::new(EngineConfig::default());
        assert!(matches!(
            engine.static_fetch("file:///etc/passwd"),
            Err(EngineError::FileBlocked)
        ));
    }

    #[test]
    fn allowed_domains_containment() {
        let engine = TieredEngine::new(EngineConfig {
            allowed_domains: vec!["example.com".into()],
            ..Default::default()
        });
        assert!(matches!(
            engine.static_fetch("https://evil.example.net/"),
            Err(EngineError::DomainNotAllowed(_))
        ));
        // Exact host and subdomains pass.
        let r = engine.guard_domain("https://sub.example.com/x");
        assert!(r.is_ok(), "subdomain should pass: {r:?}");
    }

    #[test]
    fn missing_light_binary_reports_binary_not_found() {
        let engine = TieredEngine::new(EngineConfig {
            lightpanda_bin: Some("/nonexistent/lightpanda".into()),
            obscura_bin: Some("/nonexistent/obscura".into()),
            ..Default::default()
        });
        assert!(matches!(
            engine.light_fetch("https://example.com/"),
            Err(EngineError::BinaryNotFound(_))
        ));
    }

    #[test]
    fn static_html_converts_to_markdown() {
        let body = "<html><body><h1>Hello</h1><p>World <b>bold</b></p></body></html>";
        let (addr, server) = spawn_http_server(body);
        let engine = TieredEngine::new(EngineConfig {
            allow_private_network: true,
            ..Default::default()
        });
        let res = engine.static_fetch(&format!("http://{addr}/page")).unwrap();
        assert_eq!(res.tier, EngineTier::Static);
        assert!(res.markdown.contains("Hello"), "md: {}", res.markdown);
        assert!(
            res.markdown.contains("bold") || res.markdown.contains("**bold**"),
            "md: {}",
            res.markdown
        );
        drop(server);
    }

    #[test]
    fn escalation_rules() {
        let engine = TieredEngine::new(EngineConfig::default());
        // Static failures escalate to the light tier.
        assert_eq!(
            engine.escalate_from(EngineTier::Static, &EngineError::NotFound),
            Some(EngineTier::Lightpanda)
        );
        assert_eq!(
            engine.escalate_from(
                EngineTier::Static,
                &EngineError::Timeout(Duration::from_secs(1))
            ),
            Some(EngineTier::Lightpanda)
        );
        assert_eq!(
            engine.escalate_from(EngineTier::Static, &EngineError::BinaryNotFound("x")),
            Some(EngineTier::Lightpanda)
        );
        // Policy rejections never escalate — a heavier engine hits the same wall.
        assert_eq!(
            engine.escalate_from(EngineTier::Static, &EngineError::SsrfBlocked),
            None
        );
        assert_eq!(
            engine.escalate_from(EngineTier::Static, &EngineError::FileBlocked),
            None
        );
        assert_eq!(
            engine.escalate_from(
                EngineTier::Static,
                &EngineError::DomainNotAllowed("x".into())
            ),
            None
        );
        // Light capability gaps escalate to Chrome; policy rejections don't.
        assert_eq!(
            engine.escalate_from(
                EngineTier::Lightpanda,
                &EngineError::BinaryNotFound("lightpanda")
            ),
            Some(EngineTier::Chrome)
        );
        assert_eq!(
            engine.escalate_from(EngineTier::Obscura, &EngineError::SsrfBlocked),
            None
        );
        // Chrome is terminal.
        assert_eq!(
            engine.escalate_from(EngineTier::Chrome, &EngineError::NotFound),
            None
        );
    }

    #[test]
    fn max_output_caps_and_truncates_at_char_boundary() {
        let mut md = "hello ".repeat(100);
        let truncated = cap_output(&mut md, 32);
        assert!(truncated);
        assert!(md.ends_with("… [truncated]"));
        assert!(md.is_char_boundary(md.len()));
        // Multibyte char right at the cap: byte 3 of "héllo" splits the é.
        let mut s = "héllo wörld".to_string();
        let t = cap_output(&mut s, 3);
        assert!(t);
        assert!(s.is_char_boundary(s.len()));
        assert_eq!(s, "hé\n… [truncated]");
        // Under the cap: untouched.
        let mut s2 = "short".to_string();
        assert!(!cap_output(&mut s2, 100));
        assert_eq!(s2, "short");
    }

    #[test]
    fn tier_from_light_engine_maps() {
        assert_eq!(
            EngineTier::from(LightEngine::Lightpanda),
            EngineTier::Lightpanda
        );
        assert_eq!(EngineTier::from(LightEngine::Obscura), EngineTier::Obscura);
    }

    /// Minimal HTTP server serving `body` for any path (enough for the
    /// negotiation probes read_http makes).
    fn spawn_http_server(
        body: &'static str,
    ) -> (std::net::SocketAddr, std::thread::JoinHandle<()>) {
        use std::io::Write;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            for mut s in listener.incoming().take(20).flatten() {
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = s.write_all(resp.as_bytes());
                let _ = s.flush();
            }
        });
        (addr, handle)
    }
}
