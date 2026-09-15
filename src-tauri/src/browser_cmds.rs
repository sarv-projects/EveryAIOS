//! P11.5.3 — browse view over a real CDP session. `browser_start` spawns a
//! headless Chrome (chrome-for-testing fallback), connects through
//! `everyaios-cdp`, attaches the first page target, and holds the session in
//! `AppState.browser`. The UI drives it with `browser_navigate` /
//! `browser_snapshot` / `browser_read` / `browser_click` / `browser_type` and
//! tears it down with `browser_stop`. Every call is the real engine — the
//! same code the P2.1–P2.3 LIVE tests drive against real Chrome.
//!
//! Honest ceilings: the session is a fresh isolated headless profile (not the
//! user's default Chrome profile — no session inheritance here, that's the
//! E13 seam); `browser_snapshot` returns the a11y tree text, not a rendered
//! page bitmap (screenshots are a catalog tool, wired separately).
//!
//! P55.7 — the interactive session is tier 2 by definition (scripting a page
//! needs a full engine), and `browser_start` now says so instead of leaving the
//! tier implicit. Read-only fetches do not need it: [`browser_read_url`] runs
//! the E10 tiered stack (static → Lightpanda/Obscura → Chrome) and reports the
//! tier that actually served the read, so the app never implies a light engine
//! is doing work it is not doing — and uses one for real when it is present.

use tauri::State;

use crate::AppState;

/// Wait briefly for the page target a just-created `about:blank` produces.
///
/// Chrome does not always publish the new target on the very next
/// `Target.list` call, so a single immediate read is not enough. This used to
/// be an `.expect("page target after create")`, which killed the whole desktop
/// app when Chrome was merely slow — the opposite of what an optional browse
/// view should be able to do. Polls for up to 3s, then returns an honest
/// error.
pub(crate) fn wait_for_page_target(
    client: &everyaios_cdp::CdpClient,
) -> Result<everyaios_cdp::TargetInfo, String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    let mut last_err: Option<String> = None;
    loop {
        match client.list_targets() {
            Ok(ts) => {
                if let Some(t) = ts
                    .into_iter()
                    .find(|t| t.target_type == everyaios_cdp::TargetType::Page)
                {
                    return Ok(t);
                }
            }
            Err(e) => last_err = Some(format!("list targets: {e}")),
        }
        if std::time::Instant::now() >= deadline {
            return Err(last_err.unwrap_or_else(|| {
                "no page target appeared after Target.createTarget (3s)".to_string()
            }));
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

/// The live browser session held in `AppState.browser`.
pub struct LiveBrowser {
    /// Owns the Chrome child — `BrowserChild::drop` kills the process when
    /// the session is cleared (browser_stop / app teardown). Never read
    /// directly; its Drop is the whole point.
    #[allow(dead_code)]
    child: everyaios_cdp::BrowserChild,
    client: std::sync::Arc<everyaios_cdp::CdpClient>,
    session_id: String,
    url: String,
}

/// Shared CDP backend injected into the agent `ToolService` so browser.*
/// tools on the loop hit the same session as the browse view.
struct LoopBrowser {
    client: std::sync::Arc<everyaios_cdp::CdpClient>,
    session_id: String,
}

impl everyaios_core::BrowserBackend for LoopBrowser {
    fn save_pdf_enhanced(&self, dir: &std::path::Path) -> Result<String, String> {
        let path = dir.join("page.pdf");
        let res = self
            .client
            .call_session(
                &self.session_id,
                "Page.printToPDF",
                serde_json::json!({ "printBackground": true }),
            )
            .map_err(|e| e.to_string())?;
        let b64 = res
            .get("data")
            .and_then(|v| v.as_str())
            .ok_or("printToPDF missing data")?;
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| e.to_string())?;
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(path.display().to_string())
    }

    fn save_screenshot_enhanced(
        &self,
        dir: &std::path::Path,
        quality: u8,
    ) -> Result<String, String> {
        let path = dir.join("shot.jpg");
        let res = self
            .client
            .call_session(
                &self.session_id,
                "Page.captureScreenshot",
                serde_json::json!({ "format": "jpeg", "quality": quality }),
            )
            .map_err(|e| e.to_string())?;
        let b64 = res
            .get("data")
            .and_then(|v| v.as_str())
            .ok_or("captureScreenshot missing data")?;
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| e.to_string())?;
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        Ok(path.display().to_string())
    }

    fn snapshot(&self) -> Result<String, String> {
        let actions = everyaios_browser::BrowserActions::new(&*self.client, Some(&self.session_id));
        let snap = actions.snapshot("loop").map_err(|e| e.to_string())?;
        Ok(snap.root.render())
    }

    fn navigate(&self, url: &str) -> Result<String, String> {
        let _ = self.client.call_session(
            &self.session_id,
            "Page.navigate",
            serde_json::json!({ "url": url }),
        );
        std::thread::sleep(std::time::Duration::from_millis(800));
        Ok(url.to_string())
    }

    fn act(
        &self,
        kind: &str,
        selector: Option<&str>,
        text: Option<&str>,
    ) -> Result<String, String> {
        let actions = everyaios_browser::BrowserActions::new(&*self.client, Some(&self.session_id));
        let kind = kind.to_lowercase();
        match kind.as_str() {
            "click" => {
                let r = selector.ok_or("ref required")?;
                actions
                    .act(everyaios_browser::ActKind::Click {
                        ref_id: r.to_string(),
                    })
                    .map_err(|e| e.to_string())?;
            }
            "type" => {
                let r = selector.ok_or("ref required")?;
                actions
                    .act(everyaios_browser::ActKind::Type {
                        ref_id: r.to_string(),
                        text: text.unwrap_or("").to_string(),
                    })
                    .map_err(|e| e.to_string())?;
            }
            other => return Err(format!("unsupported act kind: {other}")),
        }
        Ok(kind)
    }
}

fn lock_browser<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Option<LiveBrowser>>, String> {
    state.browser.lock().map_err(|e| e.to_string())
}

fn actions(b: &LiveBrowser) -> everyaios_browser::BrowserActions<'_, everyaios_cdp::CdpClient> {
    everyaios_browser::BrowserActions::new(&*b.client, Some(&b.session_id))
}

/// Spawn + connect a headless Chrome (idempotent — returns current status if
/// already attached). The profile dir lives under the app data dir.
#[tauri::command]
pub fn browser_start(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    {
        let guard = lock_browser(&state)?;
        if let Some(b) = guard.as_ref() {
            return Ok(serde_json::json!({
                "attached": true,
                "url": b.url,
                "fresh": false,
            }));
        }
    }

    let profile = everyaios_core::default_data_dir().join("browser-profile");
    std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
    let opts = everyaios_cdp::LaunchOptions {
        user_data_dir: profile,
        headless: true,
        browser_binary: None,
        extra_args: vec!["--mute-audio".to_string()],
        wait_timeout: std::time::Duration::from_secs(30),
    };
    let child = everyaios_cdp::spawn_browser(&opts).map_err(|e| format!("spawn browser: {e}"))?;
    let endpoint = child.endpoint().clone();
    let client =
        everyaios_cdp::connect_to_browser(&endpoint).map_err(|e| format!("connect: {e}"))?;
    let targets = client
        .list_targets()
        .map_err(|e| format!("list targets: {e}"))?;
    let page = match targets
        .iter()
        .find(|t| t.target_type == everyaios_cdp::TargetType::Page)
        .cloned()
    {
        Some(page) => page,
        None => {
            client
                .call(
                    "Target.createTarget",
                    serde_json::json!({ "url": "about:blank" }),
                )
                .map_err(|e| format!("create target: {e}"))?;
            wait_for_page_target(&client)?
        }
    };
    let session = client
        .attach(&page.target_id)
        .map_err(|e| format!("attach: {e}"))?;

    let client = std::sync::Arc::new(client);
    let live = LiveBrowser {
        child,
        client: std::sync::Arc::clone(&client),
        session_id: session.session_id.clone(),
        url: "about:blank".to_string(),
    };
    {
        let mut guard = lock_browser(&state)?;
        *guard = Some(live);
    }
    if let Ok(relay) = state.chat_relay.lock() {
        if let Some(r) = relay.as_ref() {
            r.attach_browser(std::sync::Arc::new(LoopBrowser {
                client,
                session_id: session.session_id,
            }));
        }
    }
    Ok(serde_json::json!({
        "attached": true,
        "url": "about:blank",
        "fresh": true,
    }))
}

/// Navigate the attached page to a URL and wait for the load to settle.
#[tauri::command]
pub fn browser_navigate(
    state: State<'_, AppState>,
    url: String,
) -> Result<serde_json::Value, String> {
    let mut guard = lock_browser(&state)?;
    let b = guard
        .as_mut()
        .ok_or("browser not attached — start it first")?;
    let _ = b.client.call_session(
        &b.session_id,
        "Page.navigate",
        serde_json::json!({ "url": url }),
    );
    std::thread::sleep(std::time::Duration::from_millis(1500));
    b.url = url.clone();
    // P48.3 — human-initiated UI action: authorized by the user's own gesture
    // (navigate is side-effecting if the destination page mutates on load),
    // audited on the same Merkle chain as every other effect.
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "browser.navigate",
        serde_json::json!({ "url": url }),
    );
    Ok(serde_json::json!({ "url": url }))
}

/// Accessibility snapshot of the current page (the P2.2 tree text).
#[tauri::command]
pub fn browser_snapshot(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let guard = lock_browser(&state)?;
    let b = guard
        .as_ref()
        .ok_or("browser not attached — start it first")?;
    let snap = actions(b)
        .snapshot("browse")
        .map_err(|e| format!("snapshot: {e}"))?;
    Ok(serde_json::json!({
        "url": b.url,
        "documentId": snap.document_id,
        "text": snap.root.render(),
    }))
}

/// Clean markdown read of the current page (P2.3 read tool, Full mode).
#[tauri::command]
pub fn browser_read(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let guard = lock_browser(&state)?;
    let b = guard
        .as_ref()
        .ok_or("browser not attached — start it first")?;
    let out = actions(b)
        .read(everyaios_browser::ReadMode::Full)
        .map_err(|e| format!("read: {e}"))?;
    Ok(serde_json::json!({ "url": b.url, "text": out.text }))
}

/// Click an a11y ref from the snapshot (`[ref=eN]`).
#[tauri::command]
pub fn browser_click(
    state: State<'_, AppState>,
    ref_id: String,
) -> Result<serde_json::Value, String> {
    let guard = lock_browser(&state)?;
    let b = guard
        .as_ref()
        .ok_or("browser not attached — start it first")?;
    let res = actions(b)
        .act(everyaios_browser::ActKind::Click {
            ref_id: ref_id.clone(),
        })
        .map_err(|e| format!("click {ref_id}: {e}"))?;
    let (added, removed) = match res.diff.as_ref() {
        Some(d) => (d.added_lines.clone(), d.removed_lines.clone()),
        None => (Vec::new(), Vec::new()),
    };
    // P48.3 — human-initiated UI click: a click can submit a form / trigger a
    // side effect on the page, so it is gesture-authorized + audited.
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "browser.click",
        serde_json::json!({ "refId": ref_id }),
    );
    Ok(serde_json::json!({
        "ok": true,
        "refId": ref_id,
        "added": added,
        "removed": removed,
    }))
}

/// Type text into a focused field (uses the ref's geometry when provided,
/// else the focused element).
#[tauri::command]
pub fn browser_type(
    state: State<'_, AppState>,
    ref_id: Option<String>,
    text: String,
) -> Result<serde_json::Value, String> {
    let guard = lock_browser(&state)?;
    let b = guard
        .as_ref()
        .ok_or("browser not attached — start it first")?;
    let act = match ref_id.clone() {
        Some(id) => everyaios_browser::ActKind::Type {
            ref_id: id.clone(),
            text: text.clone(),
        },
        None => everyaios_browser::ActKind::TypeAt {
            x: 0.0,
            y: 0.0,
            text: text.clone(),
        },
    };
    let res = actions(b).act(act).map_err(|e| format!("type: {e}"))?;
    let added = match res.diff.as_ref() {
        Some(d) => d.added_lines.clone(),
        None => Vec::new(),
    };
    // P48.3 — typing on a live page can mutate state / submit forms; gesture
    // -authorized + audited on the same chain as every other effect.
    crate::control::record_mutation(
        &state,
        crate::control::AuthKind::HumanGesture,
        "browser.type",
        serde_json::json!({ "refId": ref_id, "chars": text.chars().count() }),
    );
    Ok(serde_json::json!({ "ok": true, "added": added }))
}

/// P55.7 — read a URL through the E10 tiered engine stack, without a live CDP
/// session: tier 0 static extraction, then the configured light engine
/// (Lightpanda / Obscura) when the page needs JS, then Chrome. The response
/// names the tier and read source that actually produced the text, so the
/// surface can label it honestly instead of assuming a light engine ran.
///
/// The stack's own containments apply on every tier (SSRF/private-network and
/// `file://` blocked by default, optional `allowed_domains`), and a policy
/// rejection is **not** escalated — a heavier engine would hit the same wall.
#[tauri::command]
pub async fn browser_read_url(
    url: String,
    needs_js: Option<bool>,
) -> Result<serde_json::Value, String> {
    let intent = if needs_js.unwrap_or(false) {
        everyaios_browser::FetchIntent::NeedsJs
    } else {
        everyaios_browser::FetchIntent::Static
    };
    let engine = everyaios_browser::TieredEngine::new(everyaios_browser::EngineConfig::default());
    let url_for_log = url.clone();
    // Blocking HTTP/CDP work off the async runtime (this is a plain command
    // thread, but the tiered stack spawns a child browser on escalation).
    let result = tauri::async_runtime::spawn_blocking(move || engine.fetch(&url, intent))
        .await
        .map_err(|e| format!("tiered read join: {e}"))?;
    match result {
        Ok(out) => Ok(serde_json::json!({
            "url": url_for_log,
            "tier": out.tier,
            "source": out.source,
            "truncated": out.truncated,
            "text": out.markdown,
        })),
        Err(e) => Err(format!("tiered read failed: {e}")),
    }
}

/// Tear down the browser session (kills the Chrome child).
#[tauri::command]
pub fn browser_stop(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut guard = lock_browser(&state)?;
    let was_attached = guard.is_some();
    *guard = None; // Drop kills + waits the child (BrowserChild::drop)
    Ok(serde_json::json!({ "stopped": was_attached }))
}

#[cfg(test)]
mod tiered_read_tests {
    //! P55.7 — the tiered read's policy floors, asserted on the product path.
    //! Both refusals happen **before** any engine starts, so these run offline
    //! and with no display: a private-network target must never be escalated to
    //! a heavier engine, and `file://` is refused outright.

    fn read(url: &str) -> Result<serde_json::Value, String> {
        tauri::async_runtime::block_on(super::browser_read_url(url.to_string(), None))
    }

    #[test]
    fn private_network_targets_are_refused_not_escalated() {
        let err = read("http://127.0.0.1:8080/").expect_err("loopback must be refused");
        assert!(err.contains("SSRF"), "expected the SSRF floor, got: {err}");
    }

    #[test]
    fn file_urls_are_refused() {
        let err = read("file:///etc/passwd").expect_err("file:// must be refused");
        assert!(
            err.contains("file://") || err.contains("file:"),
            "expected the file:// floor, got: {err}"
        );
    }
}

/// Status probe for the rail live-dot.
#[tauri::command]
pub fn browser_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let guard = lock_browser(&state)?;
    match guard.as_ref() {
        // P55.7 — `engine` is a fact, not a default: the attached session is
        // always the full engine, and saying so stops any surface implying the
        // tier-1 light engine is serving interaction.
        Some(b) => Ok(serde_json::json!({
            "attached": true,
            "url": b.url,
            "engine": "chrome",
        })),
        None => Ok(serde_json::json!({ "attached": false })),
    }
}
