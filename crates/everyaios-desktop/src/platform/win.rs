//! Windows backend (E9) — cross-compile-checked against x86_64-pc-windows-msvc.
//!
//! - **Read:** UI Automation tree via `RawViewWalker` (indexes + click-by-name),
//!   window/app list via EnumWindows.
//! - **Act:** UIA Invoke/SetValue **first**; SendInput fallback for
//!   click/type/scroll/drag (winappCli / deploymenttheory order).
//!   **P57.3:** activation (`SetForegroundWindow` + `ShowWindow`) and
//!   focus-stealing launches (`SW_SHOWNOACTIVATE` vs `SW_SHOWNORMAL`) are
//!   decided by the policy's interaction default — the Background path never
//!   calls `SetForegroundWindow`.
//!   **P57.4:** a *coordinate* click under the Background default also refuses
//!   SendInput. It is delivered either as a UIA `InvokePattern` on the element
//!   at the hit-test point or as a `WM_LBUTTONDOWN`/`WM_LBUTTONUP` message to
//!   the deepest child under the point — neither warps the cursor nor takes
//!   focus. If no element is invokable and the app ignores the message, the
//!   action fails honestly instead of silently moving the user's pointer.
//!   **P57.1:** launch goes through `ShellExecuteExW` on the canonical path.
//! - **See:** PrintWindow (PW_RENDERFULLCONTENT) → screen-DC BitBlt fallback.
//!   Windows.Graphics.Capture (WGC, captures occluded windows) is the
//!   documented follow-on: WinRT interop is a seam here (see `capabilities()`).
//!
//! All COM/UIA code is behind `#[cfg(windows)]`; this module compiles but is
//! never linked on non-Windows targets.

use windows::core::Interface;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetCurrentObject,
    GetDC, GetDIBits, GetObjectW, GetWindowDC, ReleaseDC, SelectObject, BITMAP, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, OBJ_BITMAP, SRCCOPY,
};
// `ScreenToClient` is declared in the Gdi module by the windows-rs bindings.
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationInvokePattern,
    IUIAutomationTreeWalker, IUIAutomationValuePattern, UIA_ButtonControlTypeId,
    UIA_CheckBoxControlTypeId, UIA_ComboBoxControlTypeId, UIA_EditControlTypeId,
    UIA_HyperlinkControlTypeId, UIA_InvokePatternId, UIA_ListItemControlTypeId,
    UIA_MenuItemControlTypeId, UIA_RadioButtonControlTypeId, UIA_TextControlTypeId,
    UIA_ValuePatternId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    mouse_event, MapVirtualKeyA, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC,
    MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_WHEEL, VIRTUAL_KEY,
};
use windows::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    ChildWindowFromPointEx, EnumWindows, GetClassNameW, GetForegroundWindow, GetWindowRect,
    GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, SetCursorPos,
    SetForegroundWindow, ShowWindow, CWP_SKIPINVISIBLE, SW_RESTORE, SW_SHOWNOACTIVATE,
    SW_SHOWNORMAL, WM_LBUTTONDOWN, WM_LBUTTONUP,
};

/// `MK_LBUTTON` — the modifier key state a mouse-down message carries. The
/// constant lives behind the `Win32_System_SystemServices` feature; the value is
/// fixed by the Win32 API (1), so it is spelled once here with its name.
const MK_LBUTTON: usize = 0x0001;

use crate::launch;
use crate::policy::InteractionMode;
use crate::types::{ActKind, ReadNode, ReadResult, Region, SeeMethod, SeeResult, WindowInfo};
use crate::DesktopError;

pub struct WinBackend;

fn hwnd_of(window: &WindowInfo) -> HWND {
    HWND(window.id as usize as *mut core::ffi::c_void)
}

/// `ActKind::Click` is **window-relative** on every platform (the X11 backend
/// adds the window origin; the live E2E test asserts it). UIA hit-testing and
/// `SetCursorPos` both want screen coordinates, so translate once, here.
fn screen_point(window: &WindowInfo, x: i32, y: i32) -> (i32, i32) {
    (window.x + x, window.y + y)
}

fn control_type_name(id: i32) -> String {
    match id {
        v if v == UIA_ButtonControlTypeId.0 => "Button".into(),
        v if v == UIA_EditControlTypeId.0 => "Edit".into(),
        v if v == UIA_ComboBoxControlTypeId.0 => "ComboBox".into(),
        v if v == UIA_CheckBoxControlTypeId.0 => "CheckBox".into(),
        v if v == UIA_RadioButtonControlTypeId.0 => "RadioButton".into(),
        v if v == UIA_MenuItemControlTypeId.0 => "MenuItem".into(),
        v if v == UIA_ListItemControlTypeId.0 => "ListItem".into(),
        v if v == UIA_HyperlinkControlTypeId.0 => "Hyperlink".into(),
        v if v == UIA_TextControlTypeId.0 => "Text".into(),
        other => format!("Type{other}"),
    }
}

/// Windows UIA element → our ReadNode (bounded depth + node budget).
unsafe fn element_to_node(
    walker: &IUIAutomationTreeWalker,
    element: &IUIAutomationElement,
    path: &str,
    depth: u32,
    budget: &mut u32,
) -> Option<ReadNode> {
    if depth > 8 || *budget == 0 {
        return None;
    }
    *budget -= 1;
    let name = element
        .CurrentName()
        .map(|b| b.to_string())
        .unwrap_or_default();
    let role = control_type_name(element.CurrentControlType().map(|c| c.0).unwrap_or(0));
    let automation_id = element
        .CurrentAutomationId()
        .map(|b| {
            let s = b.to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        })
        .unwrap_or(None);
    let mut rect: RECT = std::mem::zeroed();
    if let Ok(r) = element.CurrentBoundingRectangle() {
        rect = r;
    }
    let actionable = role != "Text" && role != "Pane" && role != "Group";
    let mut node = ReadNode {
        index_path: path.to_string(),
        role,
        name,
        automation_id,
        x: rect.left,
        y: rect.top,
        width: (rect.right - rect.left).max(0) as u32,
        height: (rect.bottom - rect.top).max(0) as u32,
        actionable,
        children: vec![],
    };
    let mut child = match walker.GetFirstChildElement(element) {
        Ok(c) => c,
        Err(_) => return Some(node),
    };
    let mut i = 0usize;
    while !child.as_raw().is_null() && *budget > 0 {
        if let Some(child_node) = element_to_node(
            walker,
            &child,
            &format!("{path}.{}", i + 1),
            depth + 1,
            budget,
        ) {
            node.children.push(child_node);
        }
        i += 1;
        match walker.GetNextSiblingElement(&child) {
            Ok(next) => child = next,
            Err(_) => break,
        }
    }
    Some(node)
}

pub struct WinUia {
    automation: IUIAutomation,
}

impl WinUia {
    pub fn init() -> Result<Self, DesktopError> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let automation = unsafe {
            CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL)
                .map_err(|e| DesktopError::Platform(format!("UIA init: {e}")))?
        };
        Ok(Self { automation })
    }

    fn walker(&self) -> Result<IUIAutomationTreeWalker, DesktopError> {
        unsafe {
            self.automation
                .RawViewWalker()
                .map_err(|e| DesktopError::Platform(format!("RawViewWalker: {e}")))
        }
    }

    /// Build the a11y tree for a window (None when no elements are exposed).
    pub fn tree_for(&self, window: &WindowInfo) -> Option<ReadNode> {
        let element = unsafe { self.automation.ElementFromHandle(hwnd_of(window)) }.ok()?;
        if element.as_raw().is_null() {
            return None;
        }
        let walker = self.walker().ok()?;
        let mut budget = 400;
        unsafe { element_to_node(&walker, &element, "1", 0, &mut budget) }
    }

    pub fn read(&self, window: &WindowInfo) -> Result<ReadResult, DesktopError> {
        let tree = self.tree_for(window);
        Ok(ReadResult {
            window_id: window.id,
            tree,
            dpi_scale: 1.0,
            windows: WinBackend::list_windows()?,
        })
    }

    pub fn send_click(&self, x: i32, y: i32) -> Result<(), DesktopError> {
        unsafe {
            SetCursorPos(x, y).map_err(|e| DesktopError::Platform(format!("SetCursorPos: {e}")))?;
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        }
        Ok(())
    }

    /// UIA-first invoke/click-by-name (InvokePattern when actionable, else a
    /// center-click on the resolved bounding rect).
    pub fn click_by_name(&self, window: &WindowInfo, name: &str) -> Result<(), DesktopError> {
        let tree = self
            .tree_for(window)
            .ok_or_else(|| DesktopError::Platform("no a11y tree for window".into()))?;
        let node = tree
            .find_by_name(name)
            .ok_or_else(|| DesktopError::Platform(format!("no UIA element named {name:?}")))?;
        let element = unsafe { self.automation.ElementFromHandle(hwnd_of(window)) }
            .map_err(|e| DesktopError::Platform(format!("UIA handle: {e}")))?;
        // InvokePattern first, SendInput click as the fallback.
        if let Ok(pattern) = unsafe { element.GetCurrentPattern(UIA_InvokePatternId) } {
            if let Ok(invoke) = pattern.cast::<IUIAutomationInvokePattern>() {
                if !invoke.as_raw().is_null() {
                    unsafe {
                        invoke
                            .Invoke()
                            .map_err(|e| DesktopError::Platform(format!("UIA Invoke: {e}")))?;
                    }
                    return Ok(());
                }
            }
        }
        let (x, y) = node.center();
        // `node.center()` is already in screen coordinates (UIA bounding rects
        // are screen-space), so this is the raw pointer painter — not the
        // window-relative entry point.
        self.send_click(x, y)
    }

    /// P57.4 — activate the control **at the point** via UIA, without moving the
    /// cursor. Returns `Ok(false)` when there is no invokable element there (a
    /// canvas, a game surface, an occluding window) — a normal answer that lets
    /// the caller fall back to a message click.
    pub fn invoke_at(&self, window: &WindowInfo, x: i32, y: i32) -> Result<bool, DesktopError> {
        let (sx, sy) = screen_point(window, x, y);
        let point = POINT { x: sx, y: sy };
        let target = hwnd_of(window);
        let mut target_pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(target, Some(&mut target_pid));
        }
        let element = match unsafe { self.automation.ElementFromPoint(point) } {
            Ok(e) if !e.as_raw().is_null() => e,
            _ => return Ok(false),
        };
        // The hit-test is a screen-space lookup, so an overlapping window can
        // answer for a point inside our target. Only invoke when the element
        // really belongs to the window we were asked to act on.
        let same_process = unsafe { element.CurrentProcessId() }
            .map(|pid| pid as u32 == target_pid && target_pid != 0)
            .unwrap_or(false);
        if !same_process {
            return Ok(false);
        }
        let pattern = match unsafe { element.GetCurrentPattern(UIA_InvokePatternId) } {
            Ok(p) => p,
            Err(_) => return Ok(false),
        };
        let invoke = match pattern.cast::<IUIAutomationInvokePattern>() {
            Ok(i) if !i.as_raw().is_null() => i,
            _ => return Ok(false),
        };
        unsafe {
            invoke
                .Invoke()
                .map_err(|e| DesktopError::Platform(format!("UIA Invoke at ({sx},{sy}): {e}")))?;
        }
        Ok(true)
    }
}

/// P57.4 — a click delivered as a window message, which no component of Win32
/// turns into pointer motion: no `SetCursorPos`, no `SendInput`, no focus.
///
/// The target is the deepest child of the requested window under the point
/// (children are separate HWNDs and route their own input), and the search never
/// leaves that window, so an overlapping app cannot receive the click.
fn post_click(window: &WindowInfo, x: i32, y: i32) -> Result<(), DesktopError> {
    let (sx, sy) = screen_point(window, x, y);
    let mut target = hwnd_of(window);
    let mut client = POINT { x: sx, y: sy };
    for _ in 0..8 {
        let mut rect: RECT = RECT::default();
        unsafe {
            GetWindowRect(target, &mut rect)
                .map_err(|e| DesktopError::Platform(format!("GetWindowRect: {e}")))?;
        }
        client = POINT {
            x: sx - rect.left,
            y: sy - rect.top,
        };
        let child = unsafe { ChildWindowFromPointEx(target, client, CWP_SKIPINVISIBLE) };
        if child.is_invalid() || child == target {
            break;
        }
        target = child;
    }
    let lparam = LPARAM(((client.y as isize) << 16) | (client.x as isize & 0xffff));
    unsafe {
        PostMessageW(target, WM_LBUTTONDOWN, WPARAM(MK_LBUTTON), lparam)
            .map_err(|e| DesktopError::Platform(format!("PostMessage WM_LBUTTONDOWN: {e}")))?;
        PostMessageW(target, WM_LBUTTONUP, WPARAM(0), lparam)
            .map_err(|e| DesktopError::Platform(format!("PostMessage WM_LBUTTONUP: {e}")))?;
    }
    Ok(())
}

/// P57.4 — the Background coordinate-click path: UIA invoke first (a real
/// activation of the control under the point), message click as the fallback.
/// Both leave the cursor and the keyboard focus alone; when neither can be
/// delivered the action refuses with the escalation the user needs, rather than
/// quietly warping the pointer.
fn background_click(
    window: &WindowInfo,
    uia: Option<&WinUia>,
    x: i32,
    y: i32,
) -> Result<(), DesktopError> {
    let invoked = match uia {
        Some(u) => u.invoke_at(window, x, y)?,
        None => WinUia::init()?.invoke_at(window, x, y)?,
    };
    if invoked {
        return Ok(());
    }
    post_click(window, x, y)
}

impl WinBackend {
    pub fn list_windows() -> Result<Vec<WindowInfo>, DesktopError> {
        let mut out: Vec<WindowInfo> = Vec::new();
        unsafe {
            EnumWindows(Some(enum_proc), LPARAM(&mut out as *mut _ as isize))
                .map_err(|e| DesktopError::Platform(format!("EnumWindows: {e}")))?;
        }
        Ok(out)
    }

    pub fn see(window: &WindowInfo, region: Region) -> Result<SeeResult, DesktopError> {
        let hwnd = hwnd_of(window);
        let mut rect: RECT = RECT::default();
        unsafe {
            GetWindowRect(hwnd, &mut rect)
                .map_err(|e| DesktopError::Platform(format!("GetWindowRect: {e}")))?;
        }
        let width = (rect.right - rect.left).max(0) as u32;
        let height = (rect.bottom - rect.top).max(0) as u32;
        if width == 0 || height == 0 {
            return Err(DesktopError::Platform("window has zero size".into()));
        }
        // P57.6 — prefer Windows.Graphics.Capture: it composites the window's
        // own surface, so occlusion is irrelevant. Its capture size is the
        // item's, not the rect's, so take the dimensions back from it.
        if let Some((png, w, h)) = crate::platform::wgc::capture(hwnd) {
            let region = if region.is_full(w, h) {
                Region::full(w, h)
            } else {
                region.clamp_to(w, h)
            };
            return Ok(SeeResult {
                window_id: window.id,
                png,
                width: w,
                height: h,
                method: SeeMethod::WindowsGraphicsCapture,
                region,
                scale: 1.0,
            });
        }

        // Fallback: PrintWindow renders the window directly (independent of
        // screen occlusion), then BitBlt from the screen DC for popups.
        let png = unsafe { capture_print_window(hwnd, width, height) }
            .or_else(|| unsafe { capture_screen_dc(hwnd, width, height) })
            .ok_or_else(|| DesktopError::Platform("all capture methods failed".into()))?;
        let region = if region.is_full(width, height) {
            Region::full(width, height)
        } else {
            region.clamp_to(width, height)
        };
        Ok(SeeResult {
            window_id: window.id,
            png,
            width,
            height,
            method: SeeMethod::PrintWindow,
            region,
            scale: 1.0,
        })
    }

    /// P57.4 — the HWND that currently owns the foreground. Real HWNDs are
    /// restorable, so an approved escalation can hand the foreground back.
    pub fn foreground_window() -> Option<u64> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_invalid() {
            None
        } else {
            Some(hwnd.0 as u64)
        }
    }

    /// P57.4 — give the foreground back after an approved escalation.
    pub fn restore_foreground(window_id: u64) -> Result<(), DesktopError> {
        let hwnd = HWND(window_id as *mut _);
        let ok = unsafe { SetForegroundWindow(hwnd) };
        if ok.as_bool() {
            Ok(())
        } else {
            // Windows refuses foreground changes from a non-foreground process;
            // say so instead of pretending the restore happened.
            Err(DesktopError::Platform(
                "SetForegroundWindow refused the restore (this process does not own the \
                 foreground)"
                    .into(),
            ))
        }
    }

    /// P57.5 — Session 0 (the services session) has no interactive desktop: a
    /// process there can neither see nor drive a user's windows. Windows exposes
    /// the session name it was started in, so this is a fact, not a guess.
    pub fn interactive_desktop() -> bool {
        !std::env::var("SESSIONNAME")
            .map(|v| v.eq_ignore_ascii_case("Services"))
            .unwrap_or(false)
    }
}

/// PrintWindow with PW_RENDERFULLCONTENT → DIB → PNG.
unsafe fn capture_print_window(hwnd: HWND, width: u32, height: u32) -> Option<Vec<u8>> {
    let dc = GetDC(hwnd);
    if dc.is_invalid() {
        return None;
    }
    let mem = CreateCompatibleDC(dc);
    let bmp = CreateCompatibleBitmap(dc, width as i32, height as i32);
    if bmp.is_invalid() {
        ReleaseDC(hwnd, dc);
        return None;
    }
    let old = SelectObject(mem, bmp);
    // PW_RENDERFULLCONTENT (0x2) asks the window to render its full content —
    // including DirectComposition / hardware-composited surfaces — which is what
    // makes this the occluded-window path rather than a plain client redraw.
    const PW_RENDERFULLCONTENT: u32 = 0x0000_0002;
    let ok = PrintWindow(hwnd, mem, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT)).as_bool();
    let mut png = None;
    if ok {
        png = dib_to_png(mem, width, height);
    }
    SelectObject(mem, old);
    let _ = DeleteObject(bmp);
    let _ = DeleteDC(mem);
    ReleaseDC(hwnd, dc);
    png
}

/// Screen-DC BitBlt fallback (captures popups / non-Windows-rendered content).
unsafe fn capture_screen_dc(hwnd: HWND, width: u32, height: u32) -> Option<Vec<u8>> {
    let wdc = GetWindowDC(hwnd);
    if wdc.is_invalid() {
        return None;
    }
    let mem = CreateCompatibleDC(wdc);
    let bmp = CreateCompatibleBitmap(wdc, width as i32, height as i32);
    if bmp.is_invalid() {
        ReleaseDC(hwnd, wdc);
        return None;
    }
    let old = SelectObject(mem, bmp);
    let ok = BitBlt(mem, 0, 0, width as i32, height as i32, wdc, 0, 0, SRCCOPY).is_ok();
    let mut png = None;
    if ok {
        png = dib_to_png(mem, width, height);
    }
    SelectObject(mem, old);
    let _ = DeleteObject(bmp);
    let _ = DeleteDC(mem);
    ReleaseDC(hwnd, wdc);
    png
}

/// Copy the DC's bitmap into a BGRA buffer and encode PNG.
unsafe fn dib_to_png(dc: HDC, width: u32, height: u32) -> Option<Vec<u8>> {
    let mut bm: BITMAP = BITMAP::default();
    let bmp = GetCurrentObject(dc, OBJ_BITMAP);
    GetObjectW(
        bmp,
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut _ as *mut _),
    );
    let mut info: BITMAPINFO = BITMAPINFO::default();
    info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    info.bmiHeader.biWidth = width as i32;
    info.bmiHeader.biHeight = -(height as i32); // top-down
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB.0;
    let mut buf = vec![0u8; (width as usize) * (height as usize) * 4];
    let copied = GetDIBits(
        dc,
        HBITMAP(bmp.0),
        0,
        height,
        Some(buf.as_mut_ptr() as *mut core::ffi::c_void),
        &mut info,
        DIB_RGB_COLORS,
    );
    if copied == 0 {
        return None;
    }
    // BGRA → RGBA.
    for px in buf.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    let img = image::RgbaImage::from_raw(width, height, buf)?;
    let mut png = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png);
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut cursor, image::ImageFormat::Png)
        .ok()?;
    Some(png)
}

unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let out = &mut *(lparam.0 as *mut Vec<WindowInfo>);
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }
    let mut title = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut title);
    if len == 0 {
        return BOOL(1);
    }
    let title = String::from_utf16_lossy(&title[..len as usize]);
    let mut class = [0u16; 256];
    let clen = GetClassNameW(hwnd, &mut class);
    let class_name = if clen > 0 {
        String::from_utf16_lossy(&class[..clen as usize])
    } else {
        String::new()
    };
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    let app = if pid > 0 {
        class_name
    } else {
        "unknown".into()
    };
    let mut rect: RECT = std::mem::zeroed();
    let _ = GetWindowRect(hwnd, &mut rect);
    out.push(WindowInfo {
        id: hwnd.0 as u64,
        title,
        app,
        x: rect.left,
        y: rect.top,
        width: (rect.right - rect.left).max(0) as u32,
        height: (rect.bottom - rect.top).max(0) as u32,
        has_a11y_tree: true,
    });
    BOOL(1)
}

/// SendInput text typing (per-char keydown/keyup with scan codes).
pub fn send_input_type(text: &str) -> Result<(), DesktopError> {
    for c in text.chars() {
        if c == '\n' {
            press_vk(13)?;
            continue;
        }
        if !c.is_ascii() {
            return Err(DesktopError::Platform(format!("no VK for {c:?}")));
        }
        let scan = unsafe { MapVirtualKeyA(c as u32, MAPVK_VK_TO_VSC) };
        unsafe {
            let down = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: scan as u16,
                        dwFlags: KEYEVENTF_SCANCODE,
                        ..Default::default()
                    },
                },
            };
            let up = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: scan as u16,
                        dwFlags: KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP,
                        ..Default::default()
                    },
                },
            };
            SendInput(&[down], std::mem::size_of::<INPUT>() as i32);
            SendInput(&[up], std::mem::size_of::<INPUT>() as i32);
        }
    }
    Ok(())
}

fn press_vk(vk: u16) -> Result<(), DesktopError> {
    unsafe {
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: KEYEVENTF_EXTENDEDKEY,
                    ..Default::default()
                },
            },
        };
        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                    ..Default::default()
                },
            },
        };
        SendInput(&[down], std::mem::size_of::<INPUT>() as i32);
        SendInput(&[up], std::mem::size_of::<INPUT>() as i32);
    }
    Ok(())
}

/// P57.1 — launch through the shell, with the show-state the interaction
/// default requires: `SW_SHOWNOACTIVATE` on the Background path so the program
/// appears without becoming the foreground window (the Cua contract),
/// `SW_SHOWNORMAL` only when the user switched to Foreground. `lpFile` is the
/// canonical path (a bare name stays a Shell fallback, which is what the spec
/// allows for a name with no resolved path).
fn shell_launch(target: &str, mode: InteractionMode) -> Result<(), DesktopError> {
    let file: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI,
        lpVerb: windows::core::PCWSTR(verb.as_ptr()),
        lpFile: windows::core::PCWSTR(file.as_ptr()),
        nShow: if mode == InteractionMode::Background {
            SW_SHOWNOACTIVATE.0 as i32
        } else {
            SW_SHOWNORMAL.0 as i32
        },
        ..Default::default()
    };
    unsafe {
        ShellExecuteExW(&mut info)
            .map_err(|e| DesktopError::Platform(format!("ShellExecuteEx {target}: {e}")))?;
    }
    Ok(())
}

/// Act dispatch: UIA first (invoke/set-value), SendInput for the rest.
pub fn act(
    window: &WindowInfo,
    act: &ActKind,
    uia: Option<&WinUia>,
    mode: InteractionMode,
) -> Result<(), DesktopError> {
    // P57.1 — resolve the launch target before anything else so a bad path is
    // refused without touching the shell.
    if let ActKind::LaunchApp { path, app } = act {
        let target = launch::resolve_target(path.as_deref(), app, &launch::path_dirs())?;
        return shell_launch(&target.to_string_lossy(), mode);
    }
    match act {
        ActKind::ClickByName { name } => {
            let u = match uia {
                Some(u) => u,
                None => &WinUia::init()?,
            };
            u.click_by_name(window, name)
        }
        ActKind::SetValue { name, value } => {
            let u = match uia {
                Some(u) => u,
                None => &WinUia::init()?,
            };
            let tree = u
                .tree_for(window)
                .ok_or_else(|| DesktopError::Platform("no a11y tree for window".into()))?;
            let node = tree
                .find_by_name(name)
                .ok_or_else(|| DesktopError::Platform(format!("no UIA element named {name:?}")))?;
            let element = unsafe { u.automation.ElementFromHandle(hwnd_of(window)) }
                .map_err(|e| DesktopError::Platform(format!("UIA handle: {e}")))?;
            if let Ok(pattern) = unsafe { element.GetCurrentPattern(UIA_ValuePatternId) } {
                if let Ok(value_pattern) = pattern.cast::<IUIAutomationValuePattern>() {
                    if !value_pattern.as_raw().is_null() {
                        unsafe {
                            value_pattern
                                .SetValue(&windows::core::BSTR::from(value.as_str()))
                                .map_err(|e| {
                                    DesktopError::Platform(format!("UIA SetValue: {e}"))
                                })?;
                        }
                        return Ok(());
                    }
                }
            }
            // ValuePattern unavailable → click + select-all + type.
            let (x, y) = node.center();
            u.send_click(x, y)?;
            send_input_type(value)
        }
        ActKind::Click { x, y } => {
            // P57.4 — Background never synthesizes global input. The click is a
            // UIA invoke at the hit-test point, or a window message.
            if mode == InteractionMode::Background {
                return background_click(window, uia, *x, *y);
            }
            let (sx, sy) = screen_point(window, *x, *y);
            match uia {
                Some(u) => u.send_click(sx, sy),
                None => WinUia::init()?.send_click(sx, sy),
            }
        }
        ActKind::Type { text } => send_input_type(text),
        ActKind::Press { key } => {
            let vk = match key.to_ascii_lowercase().as_str() {
                "enter" | "return" => 13,
                "tab" => 9,
                "escape" | "esc" => 27,
                "backspace" => 8,
                "delete" => 46,
                "space" => 32,
                "left" => 37,
                "up" => 38,
                "right" => 39,
                "down" => 40,
                "home" => 36,
                "end" => 35,
                "pageup" => 33,
                "pagedown" => 34,
                other => {
                    let b = other.as_bytes();
                    if b.len() == 1 && b[0].is_ascii_alphabetic() {
                        b[0].to_ascii_uppercase() as u16
                    } else {
                        return Err(DesktopError::Platform(format!("unknown key {key}")));
                    }
                }
            };
            press_vk(vk)
        }
        ActKind::Scroll { x, y, delta } => unsafe {
            // P57.4 — scrolling is pointer motion + a wheel event, so it is a
            // foreground escalation under the background contract.
            if mode == InteractionMode::Background {
                return Err(DesktopError::Unsupported(
                    "background contract: scrolling moves the real pointer — switch the \
                     interaction default to Foreground"
                        .into(),
                ));
            }
            let (sx, sy) = screen_point(window, *x, *y);
            SetCursorPos(sx, sy)
                .map_err(|e| DesktopError::Platform(format!("SetCursorPos: {e}")))?;
            let amount = (*delta).clamp(-120, 120);
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, amount, 0);
            Ok(())
        },
        ActKind::Drag { from, to } => unsafe {
            // P57.4 — a drag is pointer motion by definition.
            if mode == InteractionMode::Background {
                return Err(DesktopError::Unsupported(
                    "background contract: dragging moves the real pointer — switch the \
                     interaction default to Foreground"
                        .into(),
                ));
            }
            let (fx, fy) = screen_point(window, from.0, from.1);
            let (tx, ty) = screen_point(window, to.0, to.1);
            SetCursorPos(fx, fy)
                .map_err(|e| DesktopError::Platform(format!("SetCursorPos: {e}")))?;
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
            for i in 1..=8 {
                let t = i as f64 / 8.0;
                let x = (fx as f64 + (tx - fx) as f64 * t) as i32;
                let y = (fy as f64 + (ty - fy) as f64 * t) as i32;
                if SetCursorPos(x, y).is_err() {
                    break;
                }
            }
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
            Ok(())
        },
        ActKind::ActivateWindow { window_id } => {
            // P57.3 — `SetForegroundWindow` + `SW_RESTORE` is exactly the raise
            // the Background contract forbids. It happens only on the
            // Foreground path (the engine refuses earlier for the policy path;
            // this is the backend's own floor).
            if mode == InteractionMode::Background {
                return Err(DesktopError::Unsupported(
                    "background contract: SetForegroundWindow/ShowWindow is a foreground \
                     escalation — switch the interaction default to Foreground"
                        .into(),
                ));
            }
            unsafe {
                let hwnd = HWND(*window_id as usize as *mut core::ffi::c_void);
                let _ = SetForegroundWindow(hwnd);
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            Ok(())
        }
        // Handled above (before the UIA/SendInput paths).
        ActKind::LaunchApp { .. } => Err(DesktopError::Platform(
            "launch was not handled on the pre-input path".into(),
        )),
    }
}

// P57.6 — Windows.Graphics.Capture (occluded capture) lives in
// [`crate::platform::wgc`]; `see()` above calls it first and falls back here.
