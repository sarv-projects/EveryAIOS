//! Browser discovery & launch (P2.1, E1) — system Chrome/Edge first, then
//! chrome-for-testing fallback (ARCH/08 §8.1/§8.8, doc 34 §2.1).
//!
//! Launch contract: `--remote-debugging-port=0 --user-data-dir=<dir>` +
//! first-run flags; the real port is read back from `<dir>/DevToolsActivePort`
//! (never trust a fixed port). All CDP traffic is loopback-only.

use crate::discovery::read_devtools_active_port;
use crate::{BrowserEndpoint, CdpError};
use std::env;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Wait budget for a freshly launched browser to write DevToolsActivePort.
pub const DEFAULT_LAUNCH_WAIT: Duration = Duration::from_secs(20);
/// Download size cap for the chrome-for-testing zip (~500MB).
const MAX_DOWNLOAD_BYTES: u64 = 600 * 1024 * 1024;
/// Official last-known-good chrome-for-testing manifest.
pub const CFT_KNOWN_GOOD_URL: &str =
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
/// Cache dir under the user's data dir.
pub const CFT_SUBDIR: &str = "browser/chrome-for-testing";

/// Options for launching the managed browser.
#[derive(Debug, Clone)]
pub struct LaunchOptions {
    /// Profile/data dir — also where DevToolsActivePort lands. Defaults to
    /// `~/.everyaios/browser-profile`.
    pub user_data_dir: PathBuf,
    /// Run headless (scrape tier, ARCH/08 §8.8 tier 2).
    pub headless: bool,
    /// Explicit browser binary (config override). If None, search PATH +
    /// platform defaults, then chrome-for-testing cache.
    pub browser_binary: Option<PathBuf>,
    /// Extra launch flags.
    pub extra_args: Vec<String>,
    /// How long to wait for DevToolsActivePort.
    pub wait_timeout: Duration,
}

impl Default for LaunchOptions {
    fn default() -> Self {
        let user_data_dir = default_profile_dir();
        Self {
            user_data_dir,
            headless: false,
            browser_binary: None,
            extra_args: Vec::new(),
            wait_timeout: DEFAULT_LAUNCH_WAIT,
        }
    }
}

/// A spawned browser child. Killing/cleanup happens on drop.
pub struct BrowserChild {
    child: Child,
    endpoint: BrowserEndpoint,
}

impl BrowserChild {
    pub fn endpoint(&self) -> &BrowserEndpoint {
        &self.endpoint
    }
}

impl Drop for BrowserChild {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Default profile dir: `$EVERYAIOS_HOME/browser-profile` or
/// `~/.everyaios/browser-profile`.
fn default_profile_dir() -> PathBuf {
    if let Ok(home) = env::var("EVERYAIOS_HOME") {
        if !home.is_empty() {
            return PathBuf::from(home).join("browser-profile");
        }
    }
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".everyaios")
        .join("browser-profile")
}

/// Platform-appropriate candidate binaries for system Chrome/Edge.
fn platform_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(target_os = "linux")]
    {
        out.extend([
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
            "microsoft-edge-stable",
        ]
        .iter()
        .map(PathBuf::from));
        out.extend(["/usr/bin/google-chrome", "/usr/bin/chromium-browser"].iter().map(PathBuf::from));
    }
    #[cfg(target_os = "macos")]
    {
        out.extend(
            [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
            ]
            .iter()
            .map(PathBuf::from),
        );
    }
    #[cfg(target_os = "windows")]
    {
        out.extend(
            [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            ]
            .iter()
            .map(PathBuf::from),
        );
    }
    out
}

/// Find an executable by name on PATH.
fn find_on_path(name: &str) -> Option<PathBuf> {
    env::split_paths(&env::var_os("PATH").unwrap_or_default()).find_map(|dir| {
        let candidate = dir.join(name);
        if candidate.is_file() {
            Some(candidate)
        } else {
            None
        }
    })
}

/// Locate a usable browser binary: explicit config override → system
/// Chrome/Edge (PATH + platform defaults) → chrome-for-testing cache.
pub fn locate_system_browser(browser_binary: Option<&Path>) -> Result<PathBuf, CdpError> {
    if let Some(p) = browser_binary {
        if p.is_file() {
            return Ok(p.to_path_buf());
        }
        return Err(CdpError::BrowserNotFound(format!(
            "configured browser binary missing: {}",
            p.display()
        )));
    }
    for candidate in platform_candidates() {
        if candidate.is_file() {
            return Ok(candidate);
        }
        if let Some(name) = candidate.file_name().and_then(|n| n.to_str()) {
            if let Some(found) = find_on_path(name) {
                return Ok(found);
            }
        }
    }
    // chrome-for-testing cache fallback.
    if let Some(cached) = cached_cft_binary() {
        if cached.is_file() {
            return Ok(cached);
        }
    }
    Err(CdpError::BrowserNotFound(
        "no system Chrome/Edge found; use install_chrome_for_testing() or set a browser binary".into(),
    ))
}

/// Spawn the browser with `--remote-debugging-port=0` and wait for
/// DevToolsActivePort. Fails closed on early exit or timeout.
pub fn spawn_browser(opts: &LaunchOptions) -> Result<BrowserChild, CdpError> {
    let binary = locate_system_browser(opts.browser_binary.as_deref())?;
    std::fs::create_dir_all(&opts.user_data_dir).map_err(CdpError::Io)?;
    // Remove a stale DevToolsActivePort from a previous run with the same
    // profile dir — otherwise the wait below could read a dead port.
    let _ = std::fs::remove_file(opts.user_data_dir.join("DevToolsActivePort"));
    let mut cmd = Command::new(&binary);
    cmd.arg("--remote-debugging-port=0");
    cmd.arg(format!("--user-data-dir={}", opts.user_data_dir.display()));
    cmd.arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-background-networking")
        .arg("--disable-component-update")
        .arg("--disable-default-apps");
    if opts.headless {
        cmd.arg("--headless=new");
    }
    for arg in &opts.extra_args {
        cmd.arg(arg);
    }
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = cmd
        .spawn()
        .map_err(|e| CdpError::BrowserNotFound(format!("spawn {}: {e}", binary.display())))?;

    let deadline = Instant::now() + opts.wait_timeout;
    loop {
        if let Ok(endpoint) = read_devtools_active_port(&opts.user_data_dir) {
            return Ok(BrowserChild { child, endpoint });
        }
        if let Ok(Some(status)) = child.try_wait() {
            let _ = child.kill();
            return Err(CdpError::BrowserNotFound(format!(
                "browser exited early ({status}); check that the binary supports --remote-debugging-port"
            )));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            return Err(CdpError::Timeout(format!(
                "browser did not write DevToolsActivePort within {:?}",
                opts.wait_timeout
            )));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

// ---------------------------------------------------------------------------
// chrome-for-testing fallback
// ---------------------------------------------------------------------------

/// Current platform identifier used by the chrome-for-testing manifest.
pub fn cft_platform() -> &'static str {
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "mac-arm64"
    }
    #[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
    {
        "mac-x64"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "win64"
    }
    #[cfg(all(target_os = "windows", not(target_arch = "x86_64")))]
    {
        "win32"
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "linux64"
    }
}

/// Folder name inside the extracted zip for this platform.
fn cft_zip_folder() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "chrome-linux64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "chrome-mac-arm64"
    }
    #[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
    {
        "chrome-mac-x64"
    }
    #[cfg(target_os = "windows")]
    {
        "chrome-win64"
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "chrome-linux64"
    }
}

/// Relative path of the actual binary inside the extracted folder.
fn cft_binary_rel_path() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "chrome"
    }
    #[cfg(target_os = "macos")]
    {
        "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    }
    #[cfg(target_os = "windows")]
    {
        "chrome.exe"
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "chrome"
    }
}

/// Cache root: `$EVERYAIOS_HOME/browser/chrome-for-testing` or
/// `~/.everyaios/browser/chrome-for-testing`.
fn cft_cache_root() -> PathBuf {
    if let Ok(home) = env::var("EVERYAIOS_HOME") {
        if !home.is_empty() {
            return PathBuf::from(home).join("browser").join("chrome-for-testing");
        }
    }
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".everyaios")
        .join(CFT_SUBDIR)
}

/// Find an already-installed chrome-for-testing binary in the cache.
fn cached_cft_binary() -> Option<PathBuf> {
    let root = cft_cache_root();
    let entries = std::fs::read_dir(&root).ok()?;
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let bin = dir.join(cft_zip_folder()).join(cft_binary_rel_path());
        if bin.is_file() {
            return Some(bin);
        }
    }
    None
}

/// Download + install chrome-for-testing when no system browser exists.
///
/// `json_url` overrides the manifest (test hook); the manifest's download URL
/// may also be a local mock. Returns the path to the installed `chrome`
/// binary. Idempotent — reuses an existing install.
pub fn install_chrome_for_testing(json_url: Option<&str>) -> Result<PathBuf, CdpError> {
    let url = json_url.unwrap_or(CFT_KNOWN_GOOD_URL);
    let manifest = crate::discovery::http_get(url)?;
    let v: serde_json::Value = serde_json::from_str(&manifest).map_err(|e| {
        CdpError::Discovery(format!("chrome-for-testing manifest: {e}"))
    })?;
    let version = v
        .pointer("/channels/Stable/version")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| CdpError::Discovery("cft manifest: no Stable version".into()))?;
    let platform = cft_platform();
    let download_url = v
        .pointer("/channels/Stable/downloads/chrome")
        .and_then(serde_json::Value::as_array)
        .and_then(|arr| {
            arr.iter().find_map(|d| {
                if d.get("platform").and_then(serde_json::Value::as_str) == Some(platform) {
                    d.get("url").and_then(serde_json::Value::as_str)
                } else {
                    None
                }
            })
        })
        .ok_or_else(|| {
            CdpError::Discovery(format!(
                "cft manifest: no chrome download for platform {platform}"
            ))
        })?;

    let install_dir = cft_cache_root().join(version);
    let binary_path = install_dir.join(cft_zip_folder()).join(cft_binary_rel_path());
    if binary_path.is_file() {
        return Ok(binary_path); // already installed
    }

    std::fs::create_dir_all(&install_dir).map_err(CdpError::Io)?;
    let bytes = download_zip(download_url)?;
    extract_zip(&bytes, &install_dir)?;

    if !binary_path.is_file() {
        return Err(CdpError::Discovery(format!(
            "cft install: extracted binary missing at {}",
            binary_path.display()
        )));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&binary_path, std::fs::Permissions::from_mode(0o755));
    }
    Ok(binary_path)
}

fn download_zip(url: &str) -> Result<Vec<u8>, CdpError> {
    let resp = ureq::get(url)
        .call()
        .map_err(|e| CdpError::Http(format!("cft download {url}: {e}")))?;
    let mut bytes = Vec::new();
    resp.into_reader()
        .take(MAX_DOWNLOAD_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|e| CdpError::Http(format!("cft download {url}: {e}")))?;
    if bytes.is_empty() {
        return Err(CdpError::Http(format!("cft download {url}: empty body")));
    }
    Ok(bytes)
}

/// Extract a zip archive, guarding against zip-slip (entries escaping the
/// target dir).
fn extract_zip(bytes: &[u8], dest: &Path) -> Result<(), CdpError> {
    let reader = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| CdpError::Discovery(format!("cft zip: {e}")))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| CdpError::Discovery(format!("cft zip entry {i}: {e}")))?;
        let Some(name) = file.enclosed_name() else {
            return Err(CdpError::Security("cft zip: entry escapes the extract dir".into()));
        };
        let out_path = dest.join(name);
        if file.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(CdpError::Io)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(CdpError::Io)?;
            }
            let mut out = std::fs::File::create(&out_path).map_err(CdpError::Io)?;
            std::io::copy(&mut file, &mut out).map_err(CdpError::Io)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_profile_dir_points_into_everyaios() {
        let dir = default_profile_dir();
        assert!(dir.to_string_lossy().contains(".everyaios") || dir.to_string_lossy().contains("browser-profile"));
        assert!(dir.ends_with("browser-profile"));
    }

    #[test]
    fn cft_platform_is_valid() {
        let p = cft_platform();
        assert!(["linux64", "mac-arm64", "mac-x64", "win64", "win32"].contains(&p));
    }

    #[test]
    fn locate_browser_missing_errors() {
        let err = locate_system_browser(Some(Path::new("/nonexistent/chrome"))).unwrap_err();
        assert!(matches!(err, CdpError::BrowserNotFound(_)), "got {err:?}");
    }

    #[test]
    fn extract_zip_rejects_slip_entries() {
        use std::io::Write;
        let mut buf = Cursor::new(Vec::new());
        let mut zipw = zip::ZipWriter::new(&mut buf);
        let opts = zip::write::SimpleFileOptions::default();
        // A malicious entry that would escape the destination dir.
        zipw.start_file("../escape.txt", opts).unwrap();
        zipw.write_all(b"evil").unwrap();
        zipw.finish().unwrap();
        let dir = tempfile_dir();
        let err = extract_zip(&buf.into_inner(), &dir).unwrap_err();
        assert!(matches!(err, CdpError::Security(_)), "got {err:?}");
    }

    #[test]
    fn extract_zip_writes_files() {
        use std::io::Write;
        let mut buf = Cursor::new(Vec::new());
        {
            let mut zipw = zip::ZipWriter::new(&mut buf);
            let opts = zip::write::SimpleFileOptions::default();
            zipw.start_file("chrome-linux64/chrome", opts).unwrap();
            zipw.write_all(b"#!/bin/sh\necho hi\n").unwrap();
            zipw.finish().unwrap();
        }
        let dir = tempfile_dir();
        extract_zip(&buf.into_inner(), &dir).unwrap();
        let bin = dir.join("chrome-linux64/chrome");
        assert!(bin.is_file());
        assert_eq!(std::fs::read_to_string(&bin).unwrap(), "#!/bin/sh\necho hi\n");
    }

    #[test]
    fn install_chrome_for_testing_downloads_and_extracts() {
        use std::io::Write;
        // Build a zip payload.
        let mut zip_bytes = Cursor::new(Vec::new());
        {
            let mut zipw = zip::ZipWriter::new(&mut zip_bytes);
            let opts = zip::write::SimpleFileOptions::default();
            zipw.start_file("chrome-linux64/chrome", opts).unwrap();
            zipw.write_all(b"#!/bin/sh\necho mock-chrome\n").unwrap();
            zipw.finish().unwrap();
        }
        let payload = zip_bytes.into_inner();
        // The manifest's `platform` is the cft platform id (linux64), while
        // the zip's inner folder is the cft folder name (chrome-linux64).
        let platform = cft_platform().to_string();

        // Mock server: manifest + zip.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            use std::io::Read as _;
            for stream in listener.incoming() {
                let Ok(mut s) = stream else { continue };
                let mut req = String::new();
                let mut buf = [0u8; 8192];
                let mut header_end = None;
                loop {
                    let n = match s.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(_) => break,
                    };
                    req.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if let Some(pos) = req.find("\r\n\r\n") {
                        header_end = Some(pos);
                        break;
                    }
                }
                let _ = header_end;
                let first = req.lines().next().unwrap_or_default().to_string();
                if first.contains("manifest.json") {
                    let manifest = format!(
                        r#"{{"channels":{{"Stable":{{"version":"120.0.6099.71","downloads":{{"chrome":[{{"platform":"{platform}","url":"http://127.0.0.1:{port}/chrome.zip"}}]}}}}}}}}"#
                    );
                    let body = manifest.as_bytes();
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\n\r\n",
                        body.len()
                    );
                    let _ = s.write_all(resp.as_bytes());
                    let _ = s.write_all(body);
                    let _ = s.flush();
                } else if first.contains("chrome.zip") {
                    // Serve the raw zip bytes.
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\n\r\n",
                        payload.len()
                    );
                    let _ = s.write_all(resp.as_bytes());
                    let _ = s.write_all(&payload);
                    let _ = s.flush();
                } else {
                    let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
                    let _ = s.write_all(resp.as_bytes());
                    let _ = s.flush();
                };
            }
        });

        // Point install at the mock.
        let manifest_url = format!("http://127.0.0.1:{port}/manifest.json");
        let bin = install_chrome_for_testing(Some(&manifest_url)).unwrap();
        assert!(bin.is_file(), "installed binary missing: {}", bin.display());
        assert_eq!(std::fs::read_to_string(&bin).unwrap(), "#!/bin/sh\necho mock-chrome\n");
    }

    fn tempfile_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "everyaios-cdp-browser-test-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        dir
    }
}
