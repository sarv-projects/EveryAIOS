//! X11 backend (Linux) — live-tested under Xvfb in the E2E suite.
//!
//! - **See:** `GetImage` (Z_PIXMAP) on the window drawable → PNG.
//! - **Read:** EWMH `_NET_CLIENT_LIST` + `_NET_WM_NAME` + geometry; no UIA
//!   equivalent on bare X11 (AT-SPI is a follow-on) — `read_tree` returns
//!   `None` and the vision fallback (OCR) takes over.
//! - **Act:** XTEST fake input (button / motion / key), keysym lookup via
//!   `GetKeyboardMapping`, `set_input_focus` + raise for activation, PATH
//!   resolve for launch.
//! - **DPI:** `Xft.dpi` root property (default 96 → scale 1.0).

use std::process::Command;

use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::xproto::ConnectionExt;
use x11rb::protocol::xproto::{
    AtomEnum, ConfigureWindowAux, ImageFormat, InputFocus, StackMode, Window, BUTTON_PRESS_EVENT,
    BUTTON_RELEASE_EVENT, KEY_PRESS_EVENT, KEY_RELEASE_EVENT, MOTION_NOTIFY_EVENT,
};
use x11rb::protocol::xtest;
use x11rb::rust_connection::RustConnection;

use crate::types::{ActKind, ReadResult, Region, SeeMethod, SeeResult, WindowInfo};
use crate::DesktopError;

pub struct X11Backend {
    conn: RustConnection,
    root: Window,
}

fn prop_string(conn: &RustConnection, window: Window, atom: u32) -> Option<String> {
    let reply = conn
        .get_property(false, window, atom, AtomEnum::ANY, 0, 4096)
        .ok()?
        .reply()
        .ok()?;
    let bytes: Vec<u8> = reply.value8()?.collect();
    let text = String::from_utf8_lossy(&bytes).to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

impl X11Backend {
    pub fn connect() -> Result<Self, DesktopError> {
        let (conn, screen_num) = x11rb::connect(None).map_err(|e| {
            DesktopError::Platform(format!("X11 connect failed (DISPLAY set?): {e}"))
        })?;
        let root = conn.setup().roots[screen_num].root;
        Ok(Self { conn, root })
    }

    pub fn is_available() -> bool {
        std::env::var("DISPLAY").is_ok() && x11rb::connect(None).is_ok()
    }

    fn atom(&self, name: &[u8]) -> Option<u32> {
        self.conn
            .intern_atom(false, name)
            .ok()?
            .reply()
            .ok()
            .map(|r| r.atom)
    }

    fn window_app(&self, window: Window) -> String {
        if let Some(pid_atom) = self.atom(b"_NET_WM_PID") {
            if let Some(reply) = self
                .conn
                .get_property(false, window, pid_atom, AtomEnum::ANY, 0, 1)
                .ok()
                .and_then(|c| c.reply().ok())
            {
                if let Some(pid) = reply.value32().and_then(|mut v| v.next()) {
                    if let Ok(comm) = std::fs::read_to_string(format!("/proc/{pid}/comm")) {
                        return comm.trim().to_string();
                    }
                }
            }
        }
        "unknown".into()
    }

    fn window_geometry(&self, window: Window) -> Option<(i32, i32, u32, u32)> {
        let geo = self.conn.get_geometry(window).ok()?.reply().ok()?;
        let tr = self
            .conn
            .translate_coordinates(window, self.root, 0, 0)
            .ok()?
            .reply()
            .ok()?;
        Some((
            i32::from(tr.dst_x),
            i32::from(tr.dst_y),
            u32::from(geo.width),
            u32::from(geo.height),
        ))
    }

    fn window_title(&self, window: Window) -> String {
        if let Some(a) = self.atom(b"_NET_WM_NAME") {
            if let Some(t) = prop_string(&self.conn, window, a) {
                return t;
            }
        }
        if let Some(a) = self.atom(b"WM_NAME") {
            if let Some(t) = prop_string(&self.conn, window, a) {
                return t;
            }
        }
        String::new()
    }

    pub fn list_windows(&self) -> Result<Vec<WindowInfo>, DesktopError> {
        // Prefer the EWMH client list (set by a WM); fall back to a raw
        // XQueryTree walk of mapped top-level windows when no WM is running
        // (headless Xvfb, minimal sessions).
        if let Some(ewmh) = self.list_windows_ewmh() {
            return Ok(ewmh);
        }
        self.list_windows_query_tree()
    }

    fn list_windows_ewmh(&self) -> Option<Vec<WindowInfo>> {
        let client_list = self.atom(b"_NET_CLIENT_LIST")?;
        let reply = self
            .conn
            .get_property(false, self.root, client_list, AtomEnum::ANY, 0, 4096)
            .ok()?
            .reply()
            .ok()?;
        let mut out = Vec::new();
        for w in reply.value32()? {
            let window = Window::from(w);
            if let Some(info) = self.window_info(window) {
                out.push(info);
            }
        }
        Some(out)
    }

    fn list_windows_query_tree(&self) -> Result<Vec<WindowInfo>, DesktopError> {
        let mut out = Vec::new();
        let mut stack = vec![self.root];
        // Only direct children of the root are top-level candidates; children
        // of other windows are reparented frames we must not double-count.
        let mut seen = std::collections::HashSet::new();
        while let Some(window) = stack.pop() {
            if !seen.insert(window) {
                continue;
            }
            let Some(reply) = self
                .conn
                .query_tree(window)
                .ok()
                .and_then(|c| c.reply().ok())
            else {
                continue;
            };
            let children: Vec<Window> = reply.children;
            if window == self.root {
                // Root children: mapped + viewable → top-level window.
                for child in children {
                    let mapped = self
                        .conn
                        .get_window_attributes(child)
                        .ok()
                        .and_then(|c| c.reply().ok())
                        .map(|a| a.map_state == x11rb::protocol::xproto::MapState::VIEWABLE)
                        .unwrap_or(false);
                    if mapped {
                        if let Some(info) = self.window_info(child) {
                            out.push(info);
                        }
                    }
                }
            } else {
                // Reparented frame — descend to find the client window.
                stack.extend(children);
            }
        }
        Ok(out)
    }

    fn window_info(&self, window: Window) -> Option<WindowInfo> {
        let title = self.window_title(window);
        let app = self.window_app(window);
        if title.is_empty() && app == "unknown" {
            return None;
        }
        let (x, y, width, height) = self.window_geometry(window)?;
        Some(WindowInfo {
            id: u64::from(window),
            title,
            app,
            x,
            y,
            width,
            height,
            has_a11y_tree: false,
        })
    }

    pub fn read(&self, window: &WindowInfo) -> Result<ReadResult, DesktopError> {
        let windows = self.list_windows()?;
        Ok(ReadResult {
            window_id: window.id,
            tree: None, // no UIA equivalent on bare X11 → OCR fallback
            dpi_scale: self.dpi_scale(),
            windows,
        })
    }

    fn dpi_scale(&self) -> f64 {
        if let Some(a) = self.atom(b"Xft.dpi") {
            if let Some(reply) = self
                .conn
                .get_property(false, self.root, a, AtomEnum::ANY, 0, 1)
                .ok()
                .and_then(|c| c.reply().ok())
            {
                if let Some(dpi) = reply.value32().and_then(|mut v| v.next()) {
                    if dpi > 0 {
                        return f64::from(dpi) / 96.0;
                    }
                }
            }
        }
        1.0
    }

    pub fn see(&self, window: &WindowInfo, region: Region) -> Result<SeeResult, DesktopError> {
        let win = Window::from(window.id as u32);
        let (gx, gy, gw, gh) = self
            .window_geometry(win)
            .ok_or_else(|| DesktopError::Platform(format!("window {} gone", window.id)))?;
        // `region` is window-relative; `get_image` offsets are window-relative
        // too (NOT screen coords — screen-relative would mis-capture windows
        // that are not at the origin). Clamp to the window's own bounds.
        let bounds = Region {
            x: 0,
            y: 0,
            width: gw,
            height: gh,
        };
        let r = bounds
            .intersect(&region)
            .ok_or_else(|| DesktopError::InvalidRegion("requested region outside window".into()))?;
        let x = r.x.clamp(i16::MIN as i32, i16::MAX as i32) as i16;
        let y = r.y.clamp(i16::MIN as i32, i16::MAX as i32) as i16;
        let width = r.width.min(u16::MAX as u32) as u16;
        let height = r.height.min(u16::MAX as u32) as u16;
        let _ = (gx, gy); // screen origin is caller knowledge, not used here
        let img = self
            .conn
            .get_image(ImageFormat::Z_PIXMAP, win, x, y, width, height, !0)
            .ok()
            .and_then(|c| c.reply().ok())
            .ok_or_else(|| DesktopError::Platform("GetImage failed".into()))?;
        let bpp = 4; // ZPixmap 24/32-depth windows → 4 bytes/pixel
        let bytes_per_row = (width as usize) * bpp;
        let data = &img.data;
        let mut rgba = Vec::with_capacity((width as usize) * (height as usize) * 4);
        for row in 0..height as usize {
            let start = row * bytes_per_row;
            for col in 0..width as usize {
                let i = start + col * bpp;
                if i + 2 >= data.len() {
                    continue;
                }
                let b = data[i];
                let g = data[i + 1];
                let rp = data[i + 2];
                rgba.extend_from_slice(&[rp, g, b, 255]);
            }
        }
        let buf = image::RgbaImage::from_raw(u32::from(width), u32::from(height), rgba)
            .ok_or_else(|| DesktopError::Platform("image buffer malformed".into()))?;
        let mut png: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png);
        image::DynamicImage::ImageRgba8(buf)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| DesktopError::Platform(format!("png encode: {e}")))?;
        Ok(SeeResult {
            window_id: window.id,
            png,
            width: u32::from(width),
            height: u32::from(height),
            method: SeeMethod::X11GetImage,
            region: r,
            scale: self.dpi_scale(),
        })
    }

    // ---- Act (XTEST) ----

    fn xtest_available(&self) -> bool {
        self.conn
            .extension_information(xtest::X11_EXTENSION_NAME)
            .ok()
            .flatten()
            .is_some()
    }

    fn fake_button(&self, button: u8, press: bool, x: i16, y: i16) -> Result<(), DesktopError> {
        let event = if press {
            BUTTON_PRESS_EVENT
        } else {
            BUTTON_RELEASE_EVENT
        };
        xtest::fake_input(&self.conn, event, button, 0, self.root, x, y, 0)
            .map_err(|e| DesktopError::Platform(format!("xtest button: {e}")))?;
        self.conn
            .flush()
            .map_err(|e| DesktopError::Platform(format!("flush: {e}")))
    }

    fn fake_motion(&self, x: i16, y: i16) -> Result<(), DesktopError> {
        xtest::fake_input(&self.conn, MOTION_NOTIFY_EVENT, 0, 0, self.root, x, y, 0)
            .map_err(|e| DesktopError::Platform(format!("xtest motion: {e}")))?;
        self.conn
            .flush()
            .map_err(|e| DesktopError::Platform(format!("flush: {e}")))
    }

    /// Resolve a keysym → (keycode, needs_shift) via GetKeyboardMapping.
    fn keysym_to_keycode(&self, keysym: u32) -> Option<(u8, bool)> {
        let setup = self.conn.setup();
        let min = setup.min_keycode;
        let count = setup.max_keycode - min;
        let reply = self
            .conn
            .get_keyboard_mapping(min, count)
            .ok()?
            .reply()
            .ok()?;
        let per = reply.keysyms_per_keycode as usize;
        let min = min as usize;
        for (i, chunk) in reply.keysyms.chunks(per).enumerate() {
            let keycode = (min + i) as u8;
            for (idx, ks) in chunk.iter().enumerate() {
                if *ks == keysym {
                    return Some((keycode, idx >= 1));
                }
            }
        }
        None
    }

    fn fake_key(&self, keysym: u32) -> Result<(), DesktopError> {
        let (keycode, needs_shift) = self
            .keysym_to_keycode(keysym)
            .ok_or_else(|| DesktopError::Platform(format!("no keycode for keysym 0x{keysym:x}")))?;
        if needs_shift {
            // Shift_L = 0xffe1
            if let Some((shift_code, _)) = self.keysym_to_keycode(0xffe1) {
                xtest::fake_input(
                    &self.conn,
                    KEY_PRESS_EVENT,
                    shift_code,
                    0,
                    self.root,
                    0,
                    0,
                    0,
                )
                .map_err(|e| DesktopError::Platform(format!("xtest shift: {e}")))?;
            }
        }
        xtest::fake_input(&self.conn, KEY_PRESS_EVENT, keycode, 0, self.root, 0, 0, 0)
            .map_err(|e| DesktopError::Platform(format!("xtest key: {e}")))?;
        xtest::fake_input(
            &self.conn,
            KEY_RELEASE_EVENT,
            keycode,
            0,
            self.root,
            0,
            0,
            0,
        )
        .map_err(|e| DesktopError::Platform(format!("xtest key: {e}")))?;
        if needs_shift {
            if let Some((shift_code, _)) = self.keysym_to_keycode(0xffe1) {
                xtest::fake_input(
                    &self.conn,
                    KEY_RELEASE_EVENT,
                    shift_code,
                    0,
                    self.root,
                    0,
                    0,
                    0,
                )
                .map_err(|e| DesktopError::Platform(format!("xtest shift: {e}")))?;
            }
        }
        self.conn
            .flush()
            .map_err(|e| DesktopError::Platform(format!("flush: {e}")))
    }

    fn named_key_to_keysym(key: &str) -> Option<u32> {
        match key.to_ascii_lowercase().as_str() {
            "enter" | "return" => Some(0xff0d),
            "tab" => Some(0xff09),
            "space" => Some(0x20),
            "escape" | "esc" => Some(0xff1b),
            "backspace" => Some(0xff08),
            "delete" => Some(0xffff),
            "left" => Some(0xff51),
            "up" => Some(0xff52),
            "right" => Some(0xff53),
            "down" => Some(0xff54),
            "home" => Some(0xff50),
            "end" => Some(0xff57),
            "pageup" => Some(0xff55),
            "pagedown" => Some(0xff56),
            "f1" => Some(0xffbe),
            "f2" => Some(0xffbf),
            "f3" => Some(0xffc0),
            "f4" => Some(0xffc1),
            "f5" => Some(0xffc2),
            "f6" => Some(0xffc3),
            "f7" => Some(0xffc4),
            "f8" => Some(0xffc5),
            "f9" => Some(0xffc6),
            "f10" => Some(0xffc7),
            "f11" => Some(0xffc8),
            "f12" => Some(0xffc9),
            _ => {
                let b = key.as_bytes();
                if b.len() == 1 {
                    Some(u32::from(b[0]))
                } else {
                    None
                }
            }
        }
    }

    fn type_char(&self, c: char) -> Result<(), DesktopError> {
        let keysym = c as u32; // ASCII/Latin-1 keysyms equal the codepoint
        self.fake_key(keysym)
    }

    pub fn act(&self, window: &WindowInfo, act: &ActKind) -> Result<(), DesktopError> {
        if !self.xtest_available() {
            return Err(DesktopError::Platform(
                "XTEST extension not available on this X server".into(),
            ));
        }
        let (wx, wy, _, _) = self
            .window_geometry(Window::from(window.id as u32))
            .ok_or_else(|| DesktopError::Platform(format!("window {} gone", window.id)))?;
        match act {
            ActKind::Click { x, y } => {
                let (sx, sy) = (wx + x, wy + y);
                self.fake_motion(sx as i16, sy as i16)?;
                self.fake_button(1, true, sx as i16, sy as i16)?;
                self.fake_button(1, false, sx as i16, sy as i16)
            }
            ActKind::Scroll { x, y, delta } => {
                let (sx, sy) = (wx + x, wy + y);
                self.fake_motion(sx as i16, sy as i16)?;
                let (up, down) = (4u8, 5u8);
                let n = delta.abs().min(50);
                for _ in 0..n {
                    let btn = if *delta > 0 { up } else { down };
                    self.fake_button(btn, true, sx as i16, sy as i16)?;
                    self.fake_button(btn, false, sx as i16, sy as i16)?;
                }
                Ok(())
            }
            ActKind::Drag { from, to } => {
                let (x0, y0) = (wx + from.0, wy + from.1);
                let (x1, y1) = (wx + to.0, wy + to.1);
                self.fake_motion(x0 as i16, y0 as i16)?;
                self.fake_button(1, true, x0 as i16, y0 as i16)?;
                for i in 1..=8 {
                    let t = i as f64 / 8.0;
                    let mx = (x0 as f64 + (x1 - x0) as f64 * t) as i16;
                    let my = (y0 as f64 + (y1 - y0) as f64 * t) as i16;
                    self.fake_motion(mx, my)?;
                }
                self.fake_button(1, false, x1 as i16, y1 as i16)
            }
            ActKind::Press { key } => {
                let ks = Self::named_key_to_keysym(key)
                    .ok_or_else(|| DesktopError::Platform(format!("unknown key {key}")))?;
                self.fake_key(ks)
            }
            ActKind::Type { text } => {
                for c in text.chars() {
                    if c == '\n' {
                        self.fake_key(0xff0d)?;
                    } else {
                        self.type_char(c)?;
                    }
                }
                Ok(())
            }
            ActKind::ActivateWindow { window_id } => {
                let w = Window::from(*window_id as u32);
                let _ = self
                    .conn
                    .configure_window(w, &ConfigureWindowAux::new().stack_mode(StackMode::ABOVE));
                self.conn
                    .set_input_focus(InputFocus::PARENT, w, 0u32)
                    .map_err(|e| DesktopError::Platform(format!("set_input_focus: {e}")))?;
                self.conn
                    .flush()
                    .map_err(|e| DesktopError::Platform(format!("flush: {e}")))
            }
            ActKind::ClickByName { name } => Err(DesktopError::Platform(format!(
                "ClickByName has no X11 surface (OCR must resolve \"{name}\" first)"
            ))),
            ActKind::SetValue { name, .. } => Err(DesktopError::Platform(format!(
                "SetValue has no X11 surface (name \"{name}\")"
            ))),
            ActKind::LaunchApp { app } => {
                let resolved = Command::new("sh")
                    .arg("-c")
                    .arg(format!("command -v {app}"))
                    .output()
                    .map_err(|e| DesktopError::Platform(format!("resolve {app}: {e}")))?;
                let path = String::from_utf8_lossy(&resolved.stdout).trim().to_string();
                if path.is_empty() {
                    return Err(DesktopError::Platform(format!("{app} not on PATH")));
                }
                Command::new("sh")
                    .arg("-c")
                    .arg(format!("{path} >/dev/null 2>&1 &"))
                    .spawn()
                    .map_err(|e| DesktopError::Platform(format!("launch {app}: {e}")))?;
                Ok(())
            }
        }
    }
}
