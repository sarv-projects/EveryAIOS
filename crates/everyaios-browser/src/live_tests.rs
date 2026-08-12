//! Live integration tests (P2.1/P2.2) — `#[ignore]`d by default; run with
//! `EVERYAIOS_LIVE_TEST=1` when Chrome is available.
//!
//! Exercises the real path end to end: `spawn_browser` →
//! `DevToolsActivePort` → `connect_to_browser` → attach → a11y snapshot →
//! iframe stitching.

use crate::{SnapshotEngine, SnapshotMode};
use everyaios_cdp::TargetType;

fn live_enabled() -> bool {
    std::env::var("EVERYAIOS_LIVE_TEST").map(|v| v == "1").unwrap_or(false)
}

/// Spawn headless Chrome and return a connected client + the first page
/// target's session.
fn spawn_and_connect(tag: &str) -> (
    everyaios_cdp::BrowserChild,
    everyaios_cdp::CdpClient,
    everyaios_cdp::Session,
) {
    let opts = everyaios_cdp::LaunchOptions {
        headless: true,
        // Unique per (pid, tag) so parallel runs never contend on the same
        // Chrome profile lock.
        user_data_dir: std::env::temp_dir().join(format!(
            "everyaios-live-profile-{}-{tag}",
            std::process::id()
        )),
        ..Default::default()
    };
    let child = everyaios_cdp::spawn_browser(&opts)
        .expect("spawn headless Chrome (is google-chrome installed?)");
    let endpoint = child.endpoint().clone();
    let client = everyaios_cdp::connect_to_browser(&endpoint).expect("connect to browser");
    let targets = client.list_targets().expect("list targets");
    let page = targets
        .iter()
        .find(|t| t.target_type == TargetType::Page)
        .cloned()
        .unwrap_or_else(|| {
            client
                .call(
                    "Target.createTarget",
                    serde_json::json!({ "url": "about:blank" }),
                )
                .expect("create target");
            client
                .list_targets()
                .expect("list targets after create")
                .into_iter()
                .find(|t| t.target_type == TargetType::Page)
                .expect("page target")
        });
    let session = client.attach(&page.target_id).expect("attach to page");
    (child, client, session)
}

#[test]
#[ignore]
fn live_spawn_connect_attach_snapshot() {
    if !live_enabled() {
        return;
    }
    let (child, client, session) = spawn_and_connect("snapshot");

    // Navigate to a simple page and wait for it to settle.
    client
        .call_session(
            &session.session_id,
            "Page.navigate",
            serde_json::json!({ "url": "data:text/html,<html><body><h1>Hello</h1><button id=b>Go</button></body></html>" }),
        )
        .expect("navigate");
    std::thread::sleep(std::time::Duration::from_millis(1500));

    let engine = SnapshotEngine::default().with_mode(SnapshotMode::Interactive);
    let snap = engine
        .capture(&client, Some(&session.session_id), "live-doc")
        .expect("capture snapshot");
    let rendered = snap.root.render();
    eprintln!("=== LIVE SNAPSHOT ===\n{rendered}\n=== END ===");
    assert!(
        rendered.contains("button Go [ref=e"),
        "expected an actionable button with a ref, got:\n{rendered}"
    );
    assert!(
        rendered.contains("heading"),
        "expected a heading:\n{rendered}"
    );
    eprintln!("LIVE PASS: real Chrome a11y snapshot with stable refs");

    drop(child);
}

#[test]
#[ignore]
fn live_iframe_stitching() {
    if !live_enabled() {
        return;
    }
    let (child, client, session) = spawn_and_connect("iframe");

    // A page with a srcdoc iframe — same-process, no separate target; the
    // engine must stitch it via Accessibility.getFullAXTree({frameId}).
    let html = "<html><body><h1>Outer</h1><iframe srcdoc=\"<button id=inner>Inside</button>\"></iframe></body></html>";
    client
        .call_session(
            &session.session_id,
            "Page.navigate",
            serde_json::json!({ "url": format!("data:text/html,{html}") }),
        )
        .expect("navigate");
    std::thread::sleep(std::time::Duration::from_millis(2000));

    let engine = SnapshotEngine::default().with_mode(SnapshotMode::Interactive);
    let snap = engine
        .capture(&client, Some(&session.session_id), "live-doc-iframe")
        .expect("capture snapshot");
    let rendered = snap.root.render();
    eprintln!("=== LIVE IFRAME SNAPSHOT ===\n{rendered}\n=== END ===");
    assert!(
        rendered.contains("heading Outer"),
        "expected outer heading:\n{rendered}"
    );
    assert!(
        rendered.contains("button Inside"),
        "expected stitched iframe content:\n{rendered}"
    );
    eprintln!("LIVE PASS: iframe content stitched inline");

    drop(child);
}
