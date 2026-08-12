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

// ---------------------------------------------------------------------------
// P2.3 — action engine live test: navigate → snapshot → act → read
// ---------------------------------------------------------------------------

#[test]
#[ignore]
fn live_act_loop_navigate_click_read() {
    if !live_enabled() {
        return;
    }
    let (child, client, session) = spawn_and_connect("actions");

    // A page with a button that toggles a paragraph.
    let html = "<html><body>\
        <h1>P2.3 Test</h1>\
        <button id=b onclick=\"document.getElementById('out').textContent='clicked!'\">Go</button>\
        <p id=out>initial</p>\
        </body></html>";
    client
        .call_session(
            &session.session_id,
            "Page.navigate",
            serde_json::json!({ "url": format!("data:text/html,{html}") }),
        )
        .expect("navigate");
    std::thread::sleep(std::time::Duration::from_millis(1500));

    let actions = crate::BrowserActions::new(&client, Some(&session.session_id));

    // snapshot → find the button ref.
    let snap = actions.snapshot("live-act").expect("snapshot");
    let rendered = snap.root.render();
    assert!(rendered.contains("button Go [ref=e1"), "expected button ref:\n{rendered}");
    eprintln!("=== LIVE ACT SNAPSHOT ===\n{rendered}\n=== END ===");

    // act: click the button (ref → geometry → Input.dispatchMouseEvent).
    let res = actions
        .act(crate::ActKind::Click { ref_id: "e1".into() })
        .expect("act click");
    assert_eq!(res.kind, "click");
    assert!(res.diff.is_some(), "act must return a post-settle diff");

    // verify the click landed via read (DOM walker sees the new text).
    let read = actions.read(crate::ReadMode::Raw).expect("read");
    assert!(
        read.text.contains("clicked!"),
        "click should have updated the DOM:\n{}",
        read.text
    );

    // navigate: back/forward/reload round-trip.
    actions
        .navigate(crate::NavigateAction::Reload)
        .expect("reload");
    std::thread::sleep(std::time::Duration::from_millis(1000));

    eprintln!("LIVE PASS: act loop (navigate → snapshot → click → read → reload)");
    drop(child);
}

/// P2.4 — tiered engine stack live: static tier handles a plain page, and a
/// NeedsJs intent escalates to the installed light engine (Lightpanda). With
/// the light engine pointed at a missing binary, escalation lands on real
/// headless Chrome (the TODO's "escalates to Chrome" check, adapted: Obscura
/// isn't installed, so we exercise the gap path with it).
#[test]
#[ignore]
fn live_tiered_stack_escalation() {
    if !live_enabled() {
        return;
    }
    use crate::tiers::{EngineConfig, EngineTier, FetchIntent, LightEngine, TieredEngine};

    let engine = TieredEngine::new(EngineConfig::default());

    // Static intent: tier 0 handles a plain page with no browser process.
    let r0 = engine
        .fetch("https://example.com/", FetchIntent::Static)
        .expect("static fetch");
    assert_eq!(r0.tier, EngineTier::Static);
    assert!(
        r0.markdown.contains("Example Domain"),
        "static tier should read example.com:\n{}",
        r0.markdown
    );

    // NeedsJs intent: escalates to the light engine (Lightpanda, installed).
    let r1 = engine
        .fetch("https://example.com/", FetchIntent::NeedsJs)
        .expect("light fetch");
    assert!(
        matches!(r1.tier, EngineTier::Lightpanda),
        "expected Lightpanda tier, got {:?}",
        r1.tier
    );
    assert!(
        r1.markdown.contains("Example Domain"),
        "light tier should render example.com:\n{}",
        r1.markdown
    );

    // Light-engine capability gap (Obscura not installed) → escalates to
    // real headless Chrome (tier 2).
    let engine2 = TieredEngine::new(EngineConfig {
        light_engine: LightEngine::Obscura,
        obscura_bin: Some("/nonexistent/obscura".into()),
        ..Default::default()
    });
    let r2 = engine2
        .fetch("https://example.com/", FetchIntent::NeedsJs)
        .expect("escalate to chrome");
    assert_eq!(r2.tier, EngineTier::Chrome);
    assert!(
        r2.markdown.contains("Example Domain"),
        "chrome tier should render example.com:\n{}",
        r2.markdown
    );

    eprintln!("LIVE PASS: tiered stack — static → light → chrome escalation");
}
