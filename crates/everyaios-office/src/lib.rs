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

pub mod docx;
pub mod xml;
pub mod zip;

pub use docx::{DocxEngine, OfficeError};
