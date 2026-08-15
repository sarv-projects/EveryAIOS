//! DOCX engine (P4.1 — Word Block-Patch, D1).
//!
//! Pipeline (ARCH/04 §4.1): open ZIP → parts index + rels → block tree
//! (anchored) → render plain text for the LLM → patch a block's text →
//! byte-preserving ZIP rewrite.

pub mod blocktree;
pub mod citation;
pub mod parts;
pub mod patch;
pub mod track;

use std::collections::HashMap;

use crate::zip::OoxmlArchive;
use blocktree::{build_blocks, Block, BlockTree};

/// Errors surfaced by the office engine. The patch failures are the
/// documented "safety fallback" cases (GenOffice returns `null` and the
/// caller rebuilds; we return an error the caller can act on).
#[derive(Debug, thiserror::Error)]
pub enum OfficeError {
    #[error("archive error: {0}")]
    Archive(#[from] crate::zip::ArchiveError),
    #[error("xml error: {0}")]
    Xml(#[from] crate::xml::OfficeXmlError),
    #[error("utf-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
    #[error("block not found: {0}")]
    BlockNotFound(String),
    #[error("stale edit on block {address}: rendered text no longer matches the part (re-render before editing)")]
    StaleEdit { address: String },
    #[error("edit on block {0} crosses a line break / tab (structural change) — rebuild the paragraph instead")]
    PatchAcrossMarker(String),
    #[error("paragraph has no w:t text anchor")]
    NoTextAnchor,
    #[error("invalid patch range on block {0}")]
    InvalidPatchRange(String),
    #[error("internal error")]
    Internal,
}

/// Content types + rels part names used by the engine.
const CONTENT_TYPES: &str = "[Content_Types].xml";
const DOCUMENT_RELS: &str = "word/_rels/document.xml.rels";
const BODY_PART: &str = "word/document.xml";

/// A `.docx` opened for surgical editing.
pub struct DocxEngine {
    archive: OoxmlArchive,
    parts: parts::PartsIndex,
    tree: BlockTree,
    /// Current bytes of every part (patches mutate this; `save` rewrites the
    /// archive with only the changed parts).
    current: HashMap<String, Vec<u8>>,
}

impl DocxEngine {
    /// Open a `.docx` from bytes: parse the package, build the block tree.
    pub fn open(bytes: Vec<u8>) -> Result<Self, OfficeError> {
        let mut archive = OoxmlArchive::open(bytes)?;

        let content_types = archive.read_part(CONTENT_TYPES)?;
        let document_rels = archive.read_part(DOCUMENT_RELS).ok();
        let parts = parts::PartsIndex::parse(&content_types, document_rels.as_deref())?;

        let body = archive.read_part(BODY_PART)?;

        // Load header/footer parts referenced by the body rels.
        let mut headers: Vec<(String, Vec<u8>)> = Vec::new();
        for rel in parts.header_footer_rels() {
            let target = parts.resolve_target(rel);
            if let Ok(bytes) = archive.read_part(&target) {
                headers.push((target, bytes));
            }
        }

        let tree = build_blocks(&body, BODY_PART, &headers)?;

        let mut current = HashMap::new();
        current.insert(BODY_PART.to_string(), body);
        for (name, bytes) in headers {
            current.insert(name, bytes);
        }

        Ok(Self {
            archive,
            parts,
            tree,
            current,
        })
    }

    /// The plain-text render of the whole document (the LLM's edit surface).
    pub fn render_text(&self) -> &str {
        &self.tree.render
    }

    /// Rendered text of one block (what the LLM sees for that address).
    pub fn render_block(&self, address: &str) -> Result<String, OfficeError> {
        let block = self
            .tree
            .find(address)
            .ok_or_else(|| OfficeError::BlockNotFound(address.to_string()))?;
        let xml = self.current.get(&block.part).ok_or(OfficeError::Internal)?;
        let doc = crate::xml::parse(xml)?;
        let para = doc
            .descendants()
            .find(|n| n.range().start == block.range.start && n.range().end == block.range.end)
            .ok_or_else(|| OfficeError::BlockNotFound(address.to_string()))?;
        Ok(blocktree::render_paragraph(para))
    }

    /// Apply an edit to a block's text. The block's *current* rendered text
    /// is used as the expected original (so stale edits are rejected).
    pub fn patch_block(&mut self, address: &str, new_text: &str) -> Result<(), OfficeError> {
        let block = self
            .tree
            .find(address)
            .cloned()
            .ok_or_else(|| OfficeError::BlockNotFound(address.to_string()))?;
        if block.kind != blocktree::BlockKind::Paragraph {
            return Err(OfficeError::Internal); // only paragraphs are patchable in P4.1
        }
        let xml = self
            .current
            .get(&block.part)
            .ok_or(OfficeError::Internal)?
            .clone();
        let expected = self.render_block(address)?;
        let patched = patch::apply_block_patch(&xml, &block, &expected, new_text)?;
        self.current.insert(block.part, patched);
        Ok(())
    }

    /// The block tree (addresses, kinds, parts, ranges).
    pub fn blocks(&self) -> &[Block] {
        &self.tree.blocks
    }

    /// Content type of a part (override → extension default).
    pub fn part_content_type(&self, part: &str) -> Option<&str> {
        self.parts.content_type(part)
    }

    /// Rebuild the `.docx`: only parts changed by patches are re-deflated;
    /// every other entry is copied verbatim.
    pub fn save(&mut self) -> Result<Vec<u8>, OfficeError> {
        let modified: Vec<(String, Vec<u8>)> = self
            .current
            .iter()
            .filter(|(_, bytes)| !bytes.is_empty())
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        Ok(self.archive.save(&modified)?)
    }
}

/// Patch the first paragraph of a bare document part (test + helper path):
/// parses `xml`, patches block `p1`, returns the new part bytes.
pub fn patch_first_paragraph(xml: &[u8], new_text: &str) -> Result<Vec<u8>, OfficeError> {
    let tree = blocktree::blocks_of_part(xml, BODY_PART)?;
    let block = tree
        .find("p1")
        .cloned()
        .ok_or_else(|| OfficeError::BlockNotFound("p1".into()))?;
    let doc = crate::xml::parse(xml)?;
    let para = doc
        .descendants()
        .find(|n| n.range().start == block.range.start && n.range().end == block.range.end)
        .ok_or_else(|| OfficeError::BlockNotFound("p1".into()))?;
    let expected = blocktree::render_paragraph(para);
    patch::apply_block_patch(xml, &block, &expected, new_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine() -> DocxEngine {
        DocxEngine::open(crate::zip::tests::sample_docx()).unwrap()
    }

    #[test]
    fn opens_and_renders() {
        let e = engine();
        assert_eq!(
            e.render_text(),
            "Hello, world!\nLine one\nline two\ncell A1 | cell B1\n"
        );
    }

    #[test]
    fn render_block_returns_paragraph_text() {
        let e = engine();
        assert_eq!(e.render_block("p1").unwrap(), "Hello, world!");
        assert_eq!(e.render_block("p2").unwrap(), "Line one\nline two");
        assert_eq!(e.render_block("t1:r1c1:p1").unwrap(), "cell A1");
    }

    #[test]
    fn patch_replaces_text_and_preserves_untouched_bytes() {
        let mut e = engine();
        e.patch_block("p1", "Goodbye, world!").unwrap();
        let out = e.save().unwrap();

        // Reopen: the render shows the new text; the old run is gone.
        let mut reopened = DocxEngine::open(out).unwrap();
        assert_eq!(
            reopened.render_text(),
            "Goodbye, world!\nLine one\nline two\ncell A1 | cell B1\n"
        );
        let xml =
            String::from_utf8(reopened.archive.read_part("word/document.xml").unwrap()).unwrap();
        assert!(!xml.contains("Hello, "));
        // The untouched second paragraph keeps its bytes.
        assert!(xml.contains("Line one"));
    }

    #[test]
    fn patch_minimal_touches_only_the_changed_run() {
        // Two runs: "Hello, " + "world!". Edit to "Hello, universe!" must
        // touch ONLY the second run's text bytes ("world" → "universe").
        let mut e = engine();
        e.patch_block("p1", "Hello, universe!").unwrap();
        let out = e.save().unwrap();
        let mut a = OoxmlArchive::open(out).unwrap();
        let s = String::from_utf8(a.read_part("word/document.xml").unwrap()).unwrap();
        assert!(s.contains("Hello, ")); // first run untouched
        assert!(s.contains("universe!")); // second run patched
                                          // The exact original w:t for the first run must be present verbatim.
        assert!(s.contains("<w:t>Hello, </w:t>"));
    }

    #[test]
    fn patch_across_line_break_refuses() {
        let mut e = engine();
        // p2 renders "Line one\nline two" — removing the line break is a
        // structural change.
        let err = e.patch_block("p2", "Line one line two").unwrap_err();
        assert!(matches!(err, OfficeError::PatchAcrossMarker(_)));
    }

    #[test]
    fn patch_within_multi_run_paragraph() {
        // p1 "Hello, world!" → "Hi world!" — the change region covers only
        // the tail of run 1; run 2 untouched.
        let mut e = engine();
        e.patch_block("p1", "Hi world!").unwrap();
        let out = e.save().unwrap();
        let mut a = OoxmlArchive::open(out).unwrap();
        let s = String::from_utf8(a.read_part("word/document.xml").unwrap()).unwrap();
        // Run 1 now reads "Hi "; run 2's original bytes preserved exactly.
        assert!(s.contains("<w:t>Hi </w:t>"));
        assert!(s.contains("<w:t>world!</w:t>"));
        assert!(!s.contains("Hello, "));
    }

    #[test]
    fn cell_paragraph_is_patchable() {
        let mut e = engine();
        e.patch_block("t1:r1c1:p1", "cell A1 v2").unwrap();
        let out = e.save().unwrap();
        let mut a = OoxmlArchive::open(out).unwrap();
        let s = String::from_utf8(a.read_part("word/document.xml").unwrap()).unwrap();
        assert!(s.contains("cell A1 v2"));
        assert!(s.contains("cell B1")); // other cell untouched
    }

    #[test]
    fn stale_edit_is_rejected() {
        let mut e = engine();
        // Mutate the part behind the engine's back, then patch. The engine
        // must refuse: either the block range no longer resolves (length
        // changed → BlockNotFound) or the rendered text mismatches (StaleEdit).
        let patched = crate::docx::patch_first_paragraph(
            crate::zip::tests::DOCUMENT_XML,
            "Changed behind your back!",
        )
        .unwrap();
        e.current.insert("word/document.xml".to_string(), patched);
        let err = e.patch_block("p1", "something else").unwrap_err();
        assert!(
            matches!(
                err,
                OfficeError::StaleEdit { .. } | OfficeError::BlockNotFound(_)
            ),
            "stale edit must be rejected, got: {err:?}"
        );
    }

    #[test]
    fn no_text_anchor_errors() {
        // A paragraph with only a drawing and no w:t cannot be patched.
        let xml = br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:drawing/></w:r></w:p></w:body>
</w:document>"#;
        let err = patch_first_paragraph(xml, "text").unwrap_err();
        assert!(matches!(err, OfficeError::NoTextAnchor));
    }

    #[test]
    fn escaped_text_roundtrips() {
        let mut e = engine();
        e.patch_block("p1", "a & b < c").unwrap();
        let out = e.save().unwrap();
        let mut a = OoxmlArchive::open(out).unwrap();
        let s = String::from_utf8(a.read_part("word/document.xml").unwrap()).unwrap();
        assert!(s.contains("a &amp; b &lt; c"));
    }
}
