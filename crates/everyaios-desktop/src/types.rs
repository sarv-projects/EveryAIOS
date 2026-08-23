//! Core E9 types — the union contract shared by every platform backend.
//!
//! One surface, three backends: X11 (Linux, live-tested), Win32 UIA +
//! SendInput + PrintWindow/screen-DC (Windows, cross-compiled), macOS AX +
//! ScreenCapture (subprocess). Everything here is platform-neutral.

use serde::{Deserialize, Serialize};

/// A desktop window as seen by the agent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WindowInfo {
    /// Stable id for this window on this platform (HWND / window-id / CGWindowID).
    pub id: u64,
    /// Human title / name.
    pub title: String,
    /// Owning application / process name.
    pub app: String,
    /// Position + size in *physical* pixels.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// UI-Automation / a11y tree availability for this window (Read uses it).
    pub has_a11y_tree: bool,
}

/// How a window capture was produced (honesty: never claim a method we didn't use).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SeeMethod {
    /// Windows.Graphics.Capture per-HWND — captures occluded windows.
    /// WGC is a WinRT interop seam on this build (see `capabilities()`).
    WindowsGraphicsCapture,
    /// PrintWindow with PW_RENDERFULLCONTENT (Windows).
    PrintWindow,
    /// BitBlt from the window's screen DC (Windows popups/fallback).
    ScreenDc,
    /// XGetImage over the X11 window (Linux).
    X11GetImage,
    /// `screencapture -l <windowid>` (macOS).
    MacScreenCapture,
    /// No capture backend available — honest failure.
    Unsupported,
}

/// The result of `see()` — a window image + provenance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeeResult {
    pub window_id: u64,
    /// PNG-encoded window pixels (physical resolution).
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub method: SeeMethod,
    /// Region this capture covers within the window (full window for `see()`,
    /// a sub-rect for region zoom).
    pub region: Region,
    /// Scale factor applied (1.0 unless a DPI-aware zoom was requested).
    pub scale: f64,
}

/// A rectangular region in window/physical coordinates.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Region {
    pub fn full(w: u32, h: u32) -> Self {
        Self {
            x: 0,
            y: 0,
            width: w,
            height: h,
        }
    }

    pub fn contains(&self, px: i32, py: i32) -> bool {
        px >= self.x
            && py >= self.y
            && px < self.x + self.width as i32
            && py < self.y + self.height as i32
    }

    /// Clamp an inner region to this region (never overflows).
    pub fn intersect(&self, other: &Region) -> Option<Region> {
        let x0 = self.x.max(other.x);
        let y0 = self.y.max(other.y);
        let x1 = (self.x + self.width as i32).min(other.x + other.width as i32);
        let y1 = (self.y + self.height as i32).min(other.y + other.height as i32);
        if x1 <= x0 || y1 <= y0 {
            return None;
        }
        Some(Region {
            x: x0,
            y: y0,
            width: (x1 - x0) as u32,
            height: (y1 - y0) as u32,
        })
    }

    /// Center point (the canonical click target).
    pub fn center(&self) -> (i32, i32) {
        (
            self.x + (self.width as i32) / 2,
            self.y + (self.height as i32) / 2,
        )
    }
}

/// One node of the a11y/UI-Automation tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadNode {
    /// Index path like `1.3.2` (ChatGPT `sky` style click-by-name/index).
    pub index_path: String,
    /// Control-type name: "Button", "Edit", "ListItem", "Text"…
    pub role: String,
    pub name: String,
    /// AutomationId / native id when available (stable locator).
    pub automation_id: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// Whether this node can be invoked (UIA InvokePattern) / has a value settable.
    pub actionable: bool,
    pub children: Vec<ReadNode>,
}

impl ReadNode {
    /// Depth-first flatten in document order (indexes precomputed).
    pub fn flatten(&self) -> Vec<&ReadNode> {
        let mut out = vec![self];
        for c in &self.children {
            out.extend(c.flatten());
        }
        out
    }

    pub fn find_by_name(&self, name: &str) -> Option<&ReadNode> {
        self.flatten()
            .into_iter()
            .find(|n| n.name.to_ascii_lowercase().contains(&name.to_ascii_lowercase()))
    }

    /// Click target for a named node (used by act-by-name).
    pub fn center(&self) -> (i32, i32) {
        Region {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
        .center()
    }
}

/// The result of `read()` — either an a11y tree or an honest absence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadResult {
    pub window_id: u64,
    /// None when the platform/a11y surface is absent → vision-fallback path.
    pub tree: Option<ReadNode>,
    /// Effective DPI scale for this window (for coordinate math).
    pub dpi_scale: f64,
    /// The window list snapshot used (apps + windows).
    pub windows: Vec<WindowInfo>,
}

/// A text word + its bounding box (OCR vision fallback).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OcrWord {
    pub text: String,
    /// Confidence 0..=100 (tesseract TSV `conf`).
    pub confidence: f64,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl OcrWord {
    pub fn region(&self) -> Region {
        Region {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }

    pub fn center(&self) -> (i32, i32) {
        self.region().center()
    }
}

/// The action vocabulary — deliberately small and human-reviewable.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ActKind {
    Click { x: i32, y: i32 },
    /// UIA InvokePattern on a named element (Windows); xdotool-name on X11.
    ClickByName { name: String },
    Type { text: String },
    /// UIA ValuePattern::SetValue (Windows) / osascript set value (mac).
    SetValue { name: String, value: String },
    Press { key: String },
    Scroll { x: i32, y: i32, delta: i32 },
    Drag { from: (i32, i32), to: (i32, i32) },
    /// Open an app / bring a window forward.
    LaunchApp { app: String },
    ActivateWindow { window_id: u64 },
}

impl ActKind {
    /// A human-readable one-liner for the Guard-2 card / audit line.
    pub fn describe(&self) -> String {
        match self {
            ActKind::Click { x, y } => format!("click at ({x},{y})"),
            ActKind::ClickByName { name } => format!("click \"{name}\""),
            ActKind::Type { text } => format!("type {} char(s)", text.chars().count()),
            ActKind::SetValue { name, .. } => format!("set value of \"{name}\""),
            ActKind::Press { key } => format!("press {key}"),
            ActKind::Scroll { x, y, delta } => format!("scroll at ({x},{y}) by {delta}"),
            ActKind::Drag { from, to } => format!("drag {from:?} → {to:?}"),
            ActKind::LaunchApp { app } => format!("launch {app}"),
            ActKind::ActivateWindow { window_id } => format!("activate window {window_id}"),
        }
    }
}

/// Outcome of one `act()` step (observe → one action → re-observe).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActOutcome {
    pub kind: ActKind,
    pub ok: bool,
    /// Post-action re-observe (tree diff / OCR text) when a verifier ran.
    pub verification: Option<VerifyOutcome>,
    pub error: Option<String>,
}

/// Verify cascade outcome — halt-over-guess is the contract.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum VerifyOutcome {
    /// The expected state was observed after the action.
    Confirmed,
    /// Retried and eventually satisfied.
    ConfirmedAfterRetry { attempts: u32 },
    /// Max retries exhausted without confirmation — we HALT, never guess.
    Halt { attempts: u32, reason: String },
}

/// What the platform reports it can actually do (honest capability surface).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Capabilities {
    pub see: SeeMethod,
    pub see_occluded: bool,
    pub uia_tree: bool,
    pub invoke_set_value: bool,
    pub send_input: bool,
    pub ocr: bool,
    pub window_list: bool,
    pub launch_app: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn region_center_and_containment() {
        let r = Region {
            x: 10,
            y: 20,
            width: 100,
            height: 50,
        };
        assert_eq!(r.center(), (60, 45));
        assert!(r.contains(10, 20));
        assert!(!r.contains(110, 20));
    }

    #[test]
    fn region_intersect_clamps() {
        let a = Region::full(100, 100);
        let b = Region {
            x: 50,
            y: 50,
            width: 200,
            height: 200,
        };
        let i = a.intersect(&b).unwrap();
        assert_eq!((i.x, i.y, i.width, i.height), (50, 50, 50, 50));
        // Disjoint → None
        let c = Region {
            x: 500,
            y: 500,
            width: 10,
            height: 10,
        };
        assert!(a.intersect(&c).is_none());
    }

    #[test]
    fn read_node_flatten_and_find() {
        let mut child = ReadNode {
            index_path: "1.1".into(),
            role: "Button".into(),
            name: "Save".into(),
            automation_id: None,
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            actionable: true,
            children: vec![],
        };
        child.x = 100;
        child.y = 200;
        let root = ReadNode {
            index_path: "1".into(),
            role: "Pane".into(),
            name: "window".into(),
            automation_id: None,
            x: 0,
            y: 0,
            width: 300,
            height: 300,
            actionable: false,
            children: vec![child],
        };
        assert_eq!(root.flatten().len(), 2);
        let save = root.find_by_name("save").expect("find by name");
        assert_eq!(save.center(), (105, 205));
    }

    #[test]
    fn act_kind_describes_human_readably() {
        let d = ActKind::Type {
            text: "hello".into(),
        }
        .describe();
        assert!(d.contains("type 5 char(s)"), "{d}");
        let d2 = ActKind::Click { x: 1, y: 2 }.describe();
        assert!(d2.contains("click at (1,2)"), "{d2}");
    }
}
