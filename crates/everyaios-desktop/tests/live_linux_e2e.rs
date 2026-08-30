//! Live Linux E2E — E9 desktop computer-use under Xvfb.
//!
//! Requires: `EVERYAIOS_LIVE_TEST=1`, an X server on DISPLAY, `python3` with
//! tkinter (for the fixture app), `Xvfb` + `xdpyinfo`. Spawns a small Xvfb
//! on a free display if none is running.

use everyaios_computeruse::ocr::{locate_phrase, OcrEngine, TesseractCli, VisionHit};
use everyaios_computeruse::platform::linux::X11Backend;
use everyaios_computeruse::types::{ActKind, Region};
use everyaios_computeruse::verify::{Locator, Verifier};

/// Find a free display number by probing /tmp/.X11-unix.
fn free_display() -> String {
    for n in 90..=110u32 {
        let lock = std::path::Path::new("/tmp").join(format!(".X{n}-lock"));
        if !lock.exists() {
            return format!(":{n}");
        }
    }
    ":99".into()
}

fn display_live(display: &str) -> bool {
    std::process::Command::new("xdpyinfo")
        .arg("-display")
        .arg(display)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn ensure_xvfb() -> Option<std::process::Child> {
    // If DISPLAY is already live, don't spawn our own.
    if display_live(&std::env::var("DISPLAY").unwrap_or_default()) {
        return None;
    }
    let display = free_display();
    std::env::set_var("DISPLAY", &display);
    let child = std::process::Command::new("Xvfb")
        .args([&display, "-screen", "0", "1280x800x24", "-nolisten", "tcp"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("Xvfb spawn failed — is Xvfb installed?");
    for _ in 0..50 {
        if display_live(&display) {
            return Some(child);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    panic!("Xvfb on {display} never became ready");
}

#[test]
#[ignore = "live E2E — needs EVERYAIOS_LIVE_TEST=1 + an X server + python3/tkinter"]
fn live_x11_list_capture_ocr_act_verify() {
    if std::env::var("EVERYAIOS_LIVE_TEST").as_deref() != Ok("1") {
        eprintln!("skipping: set EVERYAIOS_LIVE_TEST=1");
        return;
    }
    let _xvfb = ensure_xvfb();
    let tesseract = TesseractCli::default();
    assert!(tesseract.available(), "tesseract binary missing");

    // 1. Open a window we control: a tiny tkinter app with a "GO" button
    //    that flips a label to "CLICKED" — OCR + XTEST + verify end-to-end.
    let app = std::env::temp_dir().join("e9_app.py");
    assert!(app.exists(), "fixture /tmp/e9_app.py missing");
    let mut tk = std::process::Command::new("python3")
        .arg(&app)
        .env("DISPLAY", std::env::var("DISPLAY").unwrap())
        .spawn()
        .expect("python3 spawn failed");
    std::thread::sleep(std::time::Duration::from_millis(2000));

    // 2. List windows — the tk window must be visible.
    let backend = X11Backend::connect().expect("X11 connect");
    let windows = backend.list_windows().expect("list_windows");
    let target = windows
        .iter()
        .find(|w| w.title.contains("everyaios-e2e"))
        .expect("tk window not listed");
    assert!(target.width > 0 && target.height > 0, "window has size");

    // 3. Capture the window — PNG with plausible dimensions.
    let see = backend
        .see(target, Region::full(target.width, target.height))
        .expect("see");
    assert!(!see.png.is_empty(), "capture is empty");
    assert_eq!(
        &see.png[..8],
        &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a],
        "PNG header"
    );

    // 4. OCR the capture — the fixture text must be readable.
    let words = tesseract.ocr(&see.png);
    let joined: String = words
        .iter()
        .map(|w| w.text.clone())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(
        joined.contains("E9") || joined.contains("OK") || joined.contains("hello"),
        "OCR did not read the fixture text, got: {joined:?}"
    );

    // 5. Locate the GO button via vision fallback (window coords), then
    //    translate to screen coords and click it with XTEST.
    let hit = locate_phrase(&words, "GO");
    let (cx, cy) = match hit {
        VisionHit::Point { x, y } => (x, y),
        VisionHit::RegionCenter {
            x,
            y,
            width,
            height,
        } => (x + width as i32 / 2, y + height as i32 / 2),
        VisionHit::NotFound => panic!("GO button not found via OCR (words: {joined:?})"),
    };
    backend
        .act(
            target,
            &ActKind::ActivateWindow {
                window_id: target.id,
            },
        )
        .expect("activate");
    std::thread::sleep(std::time::Duration::from_millis(300));
    // ActKind::Click takes window-relative coords (the backend adds the
    // window's screen origin itself). OCR words are window-relative, so
    // pass them straight through.
    backend
        .act(target, &ActKind::Click { x: cx, y: cy })
        .expect("click");
    std::thread::sleep(std::time::Duration::from_millis(800));

    // 6. Re-capture + re-OCR — the label must now read CLICKED.
    let see2 = backend
        .see(target, Region::full(target.width, target.height))
        .expect("see2");
    let words2 = tesseract.ocr(&see2.png);
    let joined2: String = words2
        .iter()
        .map(|w| w.text.clone())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(
        joined2.contains("CLICKED"),
        "click did not flip the label, OCR after: {joined2:?}"
    );

    // 7. Verify cascade — the CLICKED text locator is satisfied against OCR.
    let ok_locator = Locator::OcrText {
        text: "CLICKED".into(),
        region: Region::full(target.width, target.height),
    };
    assert!(
        Verifier::satisfied(&ok_locator, None, &words2),
        "verify locator not satisfied (OCR {joined2:?})"
    );

    let _ = tk.kill();
    let _ = tk.wait();
}
