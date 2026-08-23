//! Windows backend (E9) — cross-compile-checked against x86_64-pc-windows-msvc.
//!
//! - **Read:** UI Automation tree (indexes + click-by-name), DPI-aware
//!   bounding rects, window/app list via EnumWindows.
//! - **Act:** UIA Invoke/SetValue **first**; SendInput fallback for
//!   click/type/scroll/drag (winappCli / deploymenttheory order).
//! - **See:** PrintWindow (PW_RENDERFULLCONTENT) → screen-DC BitBlt fallback.
//!   Windows.Graphics.Capture (WGC, captures occluded windows) is the
//!   documented follow-on: WinRT interop is a seam here (see `capabilities()`).
//!
//! All COM/UIA code is behind `#[cfg(windows)]`; this module compiles but is
//! never linked on non-Windows targets.

use windows::core::{Interface, HSTRING};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetCurrentObject,
    GetDC, GetDIBits, GetObjectW, GetWindowDC, PrintWindow, ReleaseDC, SelectObject, BITMAP,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HDC, PW_RENDERFULLCONTENT, SRCCOPY,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, UIA_ButtonControlTypeId,
    UIA_CheckBoxControlTypeId, UIA_ComboBoxControlTypeId, UIA_EditControlTypeId,
    UIA_HyperlinkControlTypeId, UIA_ListItemControlTypeId, UIA_MenuItemControlTypeId,
    UIA_RadioButtonControlTypeId, UIA_TextControlTypeId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    mouse_event, MapVirtualKeyA, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC,
    MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_WHEEL,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
    IsWindowVisible, SetCursorPos, SetForegroundWindow, ShowWindow, SW_RESTORE,
};

use crate::types::{ActKind, ReadNode, Region, SeeMethod, SeeResult, WindowInfo};
use crate::DesktopError;

pub struct WinBackend;

fn hwnd_of(window: &WindowInfo) -> HWND {
    HWND(window.id as isize)
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
    element: &IUIAutomationElement,
    path: &str,
    depth: u32,
    budget: &mut u32,
) -> Option<ReadNode> {
    if depth > 8 || *budget == 0 {
        return None;
    }
    *budget -= 1;
    let name = element.CurrentName().map(|h| h.to_string()).unwrap_or_default();
    let role = control_type_name(element.CurrentControlType().map(|c| c.0).unwrap_or(0));
    let automation_id = element
        .CurrentAutomationId()
        .map(|h| {
            let s = h.to_string();
            if s.is_empty() { None } else { Some(s) }
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
    let mut child = match element.GetFirstChildElement() {
        Ok(c) => c,
        Err(_) => return Some(node),
    };
    let mut i = 0usize;
    while !child.as_raw().is_null() && *budget > 0 {
        if let Some(child_node) = element_to_node(&child, &format!("{path}.{}", i + 1), depth + 1, budget) {
            node.children.push(child_node);
        }
        i += 1;
        match child.GetNextSiblingElement() {
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
            CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
        }
        let automation = unsafe {
            CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_ALL)
                .map_err(|e| DesktopError::Platform(format!("UIA init: {e}")))?
        };
        Ok(Self { automation })
    }

    /// Build the a11y tree for a window (None when no elements are exposed).
    pub fn tree_for(&self, window: &WindowInfo) -> Option<ReadNode> {
        let element = unsafe { self.automation.ElementFromHandle(hwnd_of(window)) }.ok()?;
        if element.as_raw().is_null() {
            return None;
        }
        let mut budget = 400;
        unsafe { element_to_node(&element, "1", 0, &mut budget) }
    }

    pub fn read(&self, window: &WindowInfo) -> Result<crate::types::ReadResult, DesktopError> {
        let tree = self.tree_for(window);
        Ok(crate::types::ReadResult {
            window_id: window.id,
            tree,
            dpi_scale: 1.0,
            windows: WinBackend::list_windows()?,
        })
    }

    pub fn send_click(&self, x: i32, y: i32) -> Result<(), DesktopError> {
        unsafe {
            SetCursorPos(x, y)
                .map_err(|e| DesktopError::Platform(format!("SetCursorPos: {e}")))?;
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        }
        Ok(())
    }
}

impl WinBackend {
    pub fn list_windows() -> Result<Vec<WindowInfo>, DesktopError> {
        let mut out: Vec<WindowInfo> = Vec::new();
        unsafe {
            EnumWindows(Some(enum_proc), LPARAM(&mut out as *mut _ as isize)).ok()?;
        }
        Ok(out)
    }

    pub fn see(window: &WindowInfo) -> Result<SeeResult, DesktopError> {
        let hwnd = hwnd_of(window);
        let rect = unsafe { GetWindowRect(hwnd) }
            .map_err(|e| DesktopError::Platform(format!("GetWindowRect: {e}")))?;
        let width = (rect.right - rect.left).max(0) as u32;
        let height = (rect.bottom - rect.top).max(0) as u32;
        if width == 0 || height == 0 {
            return Err(DesktopError::Platform("window has zero size".into()));
        }
        let png = capture_print_window(hwnd, width, height)
            .or_else(|| capture_screen_dc(hwnd, width, height))
            .ok_or_else(|| DesktopError::Platform("all capture methods failed".into()))?;
        Ok(SeeResult {
            window_id: window.id,
            png,
            width,
            height,
            method: SeeMethod::PrintWindow,
            region: Region::full(width, height),
            scale: 1.0,
        })
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
    let ok = PrintWindow(hwnd, mem, PW_RENDERFULLCONTENT).as_bool();
    let mut png = None;
    if ok {
        png = dib_to_png(mem, width, height);
    }
    SelectObject(mem, old);
    DeleteObject(bmp);
    DeleteDC(mem);
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
    let ok = BitBlt(mem, 0, 0, width as i32, height as i32, wdc, 0, 0, SRCCOPY).as_bool();
    let mut png = None;
    if ok {
        png = dib_to_png(mem, width, height);
    }
    SelectObject(mem, old);
    DeleteObject(bmp);
    DeleteDC(mem);
    ReleaseDC(hwnd, wdc);
    png
}

/// Copy the DC's bitmap into a BGRA buffer and encode PNG.
unsafe fn dib_to_png(dc: HDC, width: u32, height: u32) -> Option<Vec<u8>> {
    let mut bm: BITMAP = std::mem::zeroed();
    let bmp = GetCurrentObject(dc, 7 /* OBJ_BITMAP */);
    GetObjectW(bmp, std::mem::size_of::<BITMAP>() as i32, &mut bm as *mut _ as *mut _);
    let mut info: BITMAPINFO = std::mem::zeroed();
    info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    info.bmiHeader.biWidth = width as i32;
    info.bmiHeader.biHeight = -(height as i32); // top-down
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB;
    let mut buf = vec![0u8; (width as usize) * (height as usize) * 4];
    let copied = GetDIBits(dc, bmp, 0, height, Some(buf.as_mut_ptr() as _), &mut info, DIB_RGB_COLORS);
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
    let app = if pid > 0 { class_name } else { "unknown".into() };
    let rect = GetWindowRect(hwnd).unwrap_or(std::mem::zeroed());
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
        let b = c as u8;
        if !c.is_ascii() {
            return Err(DesktopError::Platform(format!("no VK for {c:?}")));
        }
        let scan = unsafe { MapVirtualKeyA(b as u32, MAPVK_VK_TO_VSC) };
        unsafe {
            let down = INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: 0,
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
                        wVk: 0,
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
                    wVk: vk,
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
                    wVk: vk,
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

/// Act dispatch: UIA first (invoke/set-value), SendInput for the rest.
pub fn act(window: &WindowInfo, act: &ActKind, uia: Option<&WinUia>) -> Result<(), DesktopError> {
    match act {
        ActKind::ClickByName { name } | ActKind::SetValue { name, .. } => {
            let u = match uia {
                Some(u) => u,
                None => &WinUia::init()?,
            };
            let tree = u
                .tree_for(window)
                .ok_or_else(|| DesktopError::Platform(format!("no a11y tree for window")))?;
            let node = tree
                .find_by_name(name)
                .ok_or_else(|| DesktopError::Platform(format!("no UIA element named {name:?}")))?;
            let (x, y) = node.center();
            if let ActKind::SetValue { value, .. } = act {
                u.send_click(x, y)?;
                send_input_type(value)
            } else {
                u.send_click(x, y)
            }
        }
        ActKind::Click { x, y } => WinUia::init()?.send_click(*x, *y),
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
            SetCursorPos(*x, *y)
                .map_err(|e| DesktopError::Platform(format!("SetCursorPos: {e}")))?;
            let amount = delta.clamp(-120, 120) as u32;
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, amount, 0);
            Ok(())
        },
        ActKind::Drag { from, to } => unsafe {
            SetCursorPos(from.0, from.1)
                .map_err(|e| DesktopError::Platform(format!("SetCursorPos: {e}")))?;
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
            for i in 1..=8 {
                let t = i as f64 / 8.0;
                let x = (from.0 as f64 + (to.0 - from.0) as f64 * t) as i32;
                let y = (from.1 as f64 + (to.1 - from.1) as f64 * t) as i32;
                if SetCursorPos(x, y).is_err() {
                    break;
                }
            }
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
            Ok(())
        },
        ActKind::ActivateWindow { window_id } => unsafe {
            SetForegroundWindow(HWND(*window_id as isize))
                .map_err(|e| DesktopError::Platform(format!("SetForegroundWindow: {e}")))?;
            ShowWindow(HWND(*window_id as isize), SW_RESTORE);
            Ok(())
        },
        ActKind::LaunchApp { app } => {
            let _ = std::process::Command::new(app)
                .spawn()
                .map_err(|e| DesktopError::Platform(format!("launch {app}: {e}")))?;
            Ok(())
        }
    }
}

/// The WGC seam — Windows.Graphics.Capture (WinRT) is the follow-on that
/// captures occluded windows; see `capabilities()` in the engine.
#[allow(dead_code)]
fn _wgc_seam(_hwnd: HWND) -> SeeMethod {
    SeeMethod::WindowsGraphicsCapture
}

#[allow(dead_code)]
fn _move_const_hint() -> u32 {
    MOUSEEVENTF_MOVE.0 as u32
}
