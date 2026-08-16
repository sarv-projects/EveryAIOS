//! P4.7 — office viewer commands (H5): `docx_open`, `pptx_open`, `pdf_open`.
//!
//! These are **read surfaces** — the engines render their plain-text/outline
//! view for the webview. Surgical edits (P4.1–P4.4) stay behind their own
//! engines; the viewers here feed the H5 "open + read + chat-overlay" flow.

use everyaios_office::docx::DocxEngine;
use everyaios_office::pdf;
use everyaios_office::pptx::PptxEngine;
use std::path::PathBuf;

fn read_bytes(path: &str) -> Result<Vec<u8>, String> {
    std::fs::read(PathBuf::from(path)).map_err(|e| e.to_string())
}

/// One addressable block of a docx (for the viewer's block sidebar).
#[derive(Debug, serde::Serialize)]
pub struct DocxBlockInfo {
    pub address: String,
    pub kind: String,
    pub part: String,
}

#[derive(Debug, serde::Serialize)]
pub struct DocxPayload {
    pub path: String,
    pub text: String,
    pub blocks: Vec<DocxBlockInfo>,
}

/// Open a `.docx` and render its plain text + block tree.
#[tauri::command]
pub fn docx_open(path: String) -> Result<DocxPayload, String> {
    let bytes = read_bytes(&path)?;
    let engine = DocxEngine::open(bytes).map_err(|e| e.to_string())?;
    let text = engine.render_text().to_string();
    let blocks = engine
        .blocks()
        .iter()
        .map(|b| DocxBlockInfo {
            address: b.address.clone(),
            kind: format!("{:?}", b.kind),
            part: b.part.clone(),
        })
        .collect();
    Ok(DocxPayload { path, text, blocks })
}

#[derive(Debug, serde::Serialize)]
pub struct PptxSlideInfo {
    pub part: String,
    pub text: String,
}

#[derive(Debug, serde::Serialize)]
pub struct PptxPayload {
    pub path: String,
    pub slides: Vec<PptxSlideInfo>,
    pub deck: String,
}

/// Open a `.pptx` and render its deck outline + per-slide text.
#[tauri::command]
pub fn pptx_open(path: String) -> Result<PptxPayload, String> {
    let bytes = read_bytes(&path)?;
    let mut engine = PptxEngine::open(bytes).map_err(|e| e.to_string())?;
    let deck = engine.render_deck().map_err(|e| e.to_string())?;
    let parts: Vec<String> = engine.slides().iter().map(|s| s.part.clone()).collect();
    let slides = parts
        .iter()
        .map(|p| PptxSlideInfo {
            part: p.clone(),
            text: engine.render_slide(p).unwrap_or_default(),
        })
        .collect();
    Ok(PptxPayload {
        path,
        slides,
        deck,
    })
}

#[derive(Debug, serde::Serialize)]
pub struct PdfPayload {
    pub path: String,
    pub pages: u32,
    pub texts: Vec<String>,
}

/// Open a `.pdf` and return the page count + per-page extracted text.
#[tauri::command]
pub fn pdf_open(path: String) -> Result<PdfPayload, String> {
    let bytes = read_bytes(&path)?;
    let info = pdf::inspect(&bytes).map_err(|e| e.to_string())?;
    Ok(PdfPayload {
        path,
        pages: info.pages,
        texts: info.texts,
    })
}

/// P4.4 — the raw PDF bytes as a base64 `data:application/pdf;base64,` URL,
/// so the webview's pdf.js canvas renderer can draw real pages (the text-only
/// `pdf_open` stays as the accessibility / extraction layer).
#[tauri::command]
pub fn pdf_bytes(path: String) -> Result<String, String> {
    let bytes = read_bytes(&path)?;
    Ok(format!(
        "data:application/pdf;base64,{}",
        base64_encode(&bytes)
    ))
}

fn base64_encode(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}
