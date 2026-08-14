//! everyaios-office — surgical OOXML editing (P4, D1–D8).
//!
//! The core principle (ARCH/04 §4.1): an OOXML file is a ZIP of XML parts;
//! **byte-preserving editing = open the ZIP, patch only the targeted XML
//! part(s), write those parts back, and copy every other entry byte-for-byte.**
//!
//! P4.1 ships the Word block-patch engine (D1, GenOffice pattern doc 28):
//! - ZIP open + parts index (`zip`)
//! - anchored block tree with stable addresses (`p3`, `t1:r1c2:p1`,
//!   `hdr1:p1`, `sec1`) across body + headers/footers
//! - plain-text rendering (the LLM's edit surface)
//! - minimal `w:t` prefix/suffix patch — untouched bytes never re-serialized
//! - byte-preserving ZIP rewrite (`raw_copy_file` verbatim copy)
//!
//! P4.2 ships the Excel engine (D2, doc 28 §4–5):
//! - `xlsx::read` — calamine windowed reader (virtualized 100K+ row view)
//! - `xlsx::recalc` — IronCalc truth engine (100% math integrity: numeric
//!   claims come from IronCalc, never the LLM)
//! - `xlsx::dsl` — workbook DSL (cell-address, formula-shift, sort-range,
//!   flash-fill, pivot) with the Excel-accurate reference-rewrite engine
//! - `xlsx::planner` — deterministic regex NLP → DSL (zero-LLM common ops),
//!   `NeedsLlm` fallback (audit-flagged, permission-gated)
//! - `xlsx::patch` — surgical `sheetN.xml`/`sharedStrings.xml` part-patch
//!
//! P4.3 ships the PowerPoint part-editor (D3, ARCH/04 §PowerPoint):
//! - `pptx::parts` — package index (content types + presentation rels +
//!   `<p:sldIdLst>` slide order)
//! - `pptx::text` — slide shapes → paragraphs → `<a:t>` runs; render + minimal
//!   byte-surgery patch (bullets/line-breaks are read-only markers)
//! - `pptx::PptxEngine` — render/patch + add/remove slides (clone part + rels
//!   + `[Content_Types].xml` registration) + byte-preserving save
//!
//! P4.5 ships conformance + rollback (D6/D7, ARCH/04 §4.4):
//! - `atomic::write_atomic` — temp → fsync → rename (no half-written files)
//! - `rollback::Snapshot` — `snapshotBefore` pre-edit bytes, one-click undo
//! - `conformance::parts_diff` — zip-level diff of changed/added/removed parts
//! - `conformance::LibreOfficeOracle` — headless soffice "opens clean" check
//!
//! P4.6 ships legacy formats (D8, doc 29 §3a):
//! - `legacy` — `.doc`/`.xls`/`.ppt` detection + headless conversion to modern
//!   OOXML, surfaced read-only with an "edit as new" path

pub mod atomic;
pub mod conformance;
pub mod docx;
pub mod legacy;
pub mod pptx;
pub mod rollback;
pub mod xlsx;
pub mod xml;
pub mod zip;

pub use atomic::write_atomic;
pub use conformance::{parts_diff, LibreOfficeOracle, PartsDiff};
pub use docx::{DocxEngine, OfficeError};
pub use legacy::{convert_to_modern, LegacyKind, LegacyOpen};
pub use pptx::PptxEngine;
pub use rollback::Snapshot;
