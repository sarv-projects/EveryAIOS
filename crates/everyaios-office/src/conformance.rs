//! D6 — conformance (doc 29 §5, ARCH/04 §4.4): the round-trip oracle.
//!
//! Two guarantees, two tools:
//! - **Byte-stability** — [`parts_diff`] reports exactly which ZIP parts
//!   changed between two files (decompressed comparison), so tests can assert
//!   "only `word/document.xml` changed" and nothing else was touched.
//! - **Opens clean** — [`LibreOfficeOracle`] runs headless `soffice` and
//!   reports whether a file reparses without repair warnings.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::zip::{ArchiveError, OoxmlArchive};

/// Which parts differ between two OOXML files.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PartsDiff {
    /// Parts present in both whose decompressed bytes differ.
    pub changed: Vec<String>,
    /// Parts present only in `modified`.
    pub added: Vec<String>,
    /// Parts present only in `original`.
    pub removed: Vec<String>,
}

impl PartsDiff {
    pub fn is_empty(&self) -> bool {
        self.changed.is_empty() && self.added.is_empty() && self.removed.is_empty()
    }
}

/// Zip-level diff: which parts changed between two OOXML files (decompressed
/// byte comparison — the conformance oracle's "untouched parts byte-stable"
/// assertion, P4.5).
pub fn parts_diff(original: &[u8], modified: &[u8]) -> Result<PartsDiff, ArchiveError> {
    let mut a = OoxmlArchive::open(original.to_vec())?;
    let mut b = OoxmlArchive::open(modified.to_vec())?;
    let a_names: BTreeSet<String> = a.parts()?.into_iter().collect();
    let b_names: BTreeSet<String> = b.parts()?.into_iter().collect();

    let mut changed = Vec::new();
    for name in a_names.intersection(&b_names) {
        if a.read_part(name)? != b.read_part(name)? {
            changed.push(name.clone());
        }
    }
    let added = b_names.difference(&a_names).cloned().collect();
    let removed = a_names.difference(&b_names).cloned().collect();

    Ok(PartsDiff {
        changed,
        added,
        removed,
    })
}

#[derive(Debug, thiserror::Error)]
pub enum OracleError {
    #[error("LibreOffice (soffice) is not installed or not on PATH")]
    NotAvailable,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("LibreOffice conversion failed: {0}")]
    ConversionFailed(String),
    #[error("LibreOffice reported repair warnings (file did not open clean): {0}")]
    RepairWarnings(String),
}

/// A headless LibreOffice process used to assert a file opens without repair
/// warnings (doc 29 §5: open our edited file, assert no "repair").
pub struct LibreOfficeOracle {
    soffice: Option<PathBuf>,
}

impl Default for LibreOfficeOracle {
    fn default() -> Self {
        Self::new()
    }
}

impl LibreOfficeOracle {
    /// Locate the `soffice`/`libreoffice` binary (PATH + common install dirs).
    pub fn new() -> Self {
        Self {
            soffice: find_soffice(),
        }
    }

    /// Whether LibreOffice is available on this machine.
    pub fn available(&self) -> bool {
        self.soffice.is_some()
    }

    /// Open `file` headlessly and assert it reparses cleanly. Conversion to
    /// PDF forces a full parse + layout, so any repair/damage surfaces as a
    /// warning. Returns `Ok(())` if the file opens clean.
    pub fn check_opens(&self, file: &Path) -> Result<(), OracleError> {
        let soffice = self.soffice.as_ref().ok_or(OracleError::NotAvailable)?;
        let outdir =
            std::env::temp_dir().join(format!("everyaios-oracle-{}-{}", std::process::id(), seq()));
        std::fs::create_dir_all(&outdir)?;

        let output = Command::new(soffice)
            .args(["--headless", "--convert-to", "pdf", "--outdir"])
            .arg(&outdir)
            .arg(file)
            .output()?;

        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_dir_all(&outdir);

        if !output.status.success() {
            return Err(OracleError::ConversionFailed(stderr.into_owned()));
        }
        let lower = stderr.to_lowercase();
        if lower.contains("repair") || lower.contains("damaged") {
            return Err(OracleError::RepairWarnings(stderr.into_owned()));
        }
        Ok(())
    }
}

/// Monotonic counter for unique temp dirs (parallel invocations).
pub(crate) fn seq() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    SEQ.fetch_add(1, Ordering::Relaxed)
}

/// Find the LibreOffice binary on PATH or in common install locations.
pub(crate) fn find_soffice() -> Option<PathBuf> {
    for name in ["soffice", "libreoffice"] {
        if let Some(p) = find_on_path(name) {
            return Some(p);
        }
    }
    #[cfg(target_os = "macos")]
    let candidates = ["/Applications/LibreOffice.app/Contents/MacOS/soffice"];
    #[cfg(target_os = "windows")]
    let candidates = [
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ];
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let candidates = [
        "/usr/bin/soffice",
        "/usr/local/bin/soffice",
        "/snap/bin/libreoffice",
        "/usr/bin/libreoffice",
    ];
    candidates.iter().map(PathBuf::from).find(|p| p.exists())
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(target_os = "windows")]
        {
            let exe = dir.join(format!("{name}.exe"));
            if exe.is_file() {
                return Some(exe);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::zip::OoxmlArchive;

    #[test]
    fn parts_diff_detects_changed_part_only() {
        let original = crate::zip::tests::sample_docx();
        let mut engine = crate::docx::DocxEngine::open(original.clone()).unwrap();
        engine.patch_block("p1", "Hello, universe!").unwrap();
        let modified = engine.save().unwrap();

        let diff = parts_diff(&original, &modified).unwrap();
        assert_eq!(diff.changed, vec!["word/document.xml".to_string()]);
        assert!(diff.added.is_empty());
        assert!(diff.removed.is_empty());
    }

    #[test]
    fn parts_diff_identity_is_empty() {
        let original = crate::zip::tests::sample_docx();
        let diff = parts_diff(&original, &original).unwrap();
        assert!(diff.is_empty());
    }

    #[test]
    fn parts_diff_detects_added_and_removed() {
        let original = crate::zip::tests::sample_docx();
        let mut a = OoxmlArchive::open(original.clone()).unwrap();
        let modified = a
            .save_changes(
                &[],
                &[("word/extra.xml".to_string(), b"<x/>".to_vec())],
                &["_rels/.rels".to_string()],
            )
            .unwrap();

        let diff = parts_diff(&original, &modified).unwrap();
        assert_eq!(diff.added, vec!["word/extra.xml".to_string()]);
        assert_eq!(diff.removed, vec!["_rels/.rels".to_string()]);
        assert!(diff.changed.is_empty());
    }

    // ---- gated live oracle (needs LibreOffice) ------------------------------
    // Run with `EVERYAIOS_LIVE_TEST=1 cargo test -p everyaios-office --lib \
    //   conformance::tests::live_oracle_opens_clean -- --ignored`
    #[ignore = "live: needs LibreOffice (soffice) on PATH"]
    #[test]
    fn live_oracle_opens_clean_docx() {
        if !oracle_available() {
            return;
        }
        let oracle = LibreOfficeOracle::new();
        // Write a valid docx to a temp file and assert it opens clean.
        let path =
            std::env::temp_dir().join(format!("everyaios-oracle-{}.docx", std::process::id()));
        std::fs::write(&path, crate::zip::tests::sample_docx()).unwrap();
        oracle.check_opens(&path).expect("valid docx opens clean");
        let _ = std::fs::remove_file(&path);
        eprintln!("LIVE PASS: LibreOffice oracle opened a clean docx");
    }

    /// The real conformance guarantee (P4.5 CI gate): our surgical docx patch
    /// round-trips through LibreOffice headless without a repair warning.
    #[ignore = "live: needs LibreOffice (soffice) on PATH"]
    #[test]
    fn live_oracle_opens_clean_after_docx_patch() {
        if !oracle_available() {
            return;
        }
        let oracle = LibreOfficeOracle::new();
        let mut engine = crate::docx::DocxEngine::open(crate::zip::tests::sample_docx()).unwrap();
        engine.patch_block("p1", "Hello, conformance oracle!").unwrap();
        let patched = engine.save().unwrap();
        let path = std::env::temp_dir().join(format!(
            "everyaios-oracle-patched-{}.docx",
            std::process::id()
        ));
        std::fs::write(&path, patched).unwrap();
        oracle
            .check_opens(&path)
            .expect("patched docx opens clean in LibreOffice");
        let _ = std::fs::remove_file(&path);
        eprintln!("LIVE PASS: LibreOffice oracle opened a patched docx clean");
    }

    fn oracle_available() -> bool {
        if std::env::var("EVERYAIOS_LIVE_TEST").as_deref() != Ok("1") {
            eprintln!("skipped: set EVERYAIOS_LIVE_TEST=1 to run the live oracle test");
            return false;
        }
        let oracle = LibreOfficeOracle::new();
        if !oracle.available() {
            eprintln!("skipped: LibreOffice (soffice) not found");
            return false;
        }
        true
    }
}
