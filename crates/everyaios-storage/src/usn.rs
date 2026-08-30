//! P36 (G7) — USN journal (Windows) incremental index that scales.
//!
//! Windows NTFS exposes a change journal (`fsutil usn`) that lists file
//! deltas since a cursor *without rescans*. This module defines the typed
//! contract (what a real journal read yields + how the index consumes it)
//! and ships the cross-platform fallback: on Linux/macOS the same incremental
//! surface is fed by the notify-debounced walker (already in `events.rs`).
//!
//! **Honest ceiling:** reading the raw journal requires the Windows API
//! (`DeviceIoControl`/`FSCTL_READ_USN_JOURNAL`) — this crate stays
//! cross-platform; the WinAPI reader is the platform-gated follow-on. The
//! consumer contract + tests are the part that is real today.

use std::path::PathBuf;

/// Why a file changed (the USN reason vocabulary, mapped to our events).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsnReason {
    Create,
    Delete,
    RenameOld,
    RenameNew,
    DataOverwrite,
    DataExtend,
    DataTruncate,
}

/// One journal record (the minimal slice the index needs).
#[derive(Debug, Clone, PartialEq)]
pub struct UsnRecord {
    /// Monotonic journal cursor (the upper bound of the read).
    pub usn: u64,
    pub reason: UsnReason,
    pub path: PathBuf,
}

/// Who consumes journal deltas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JournalSource {
    /// Real NTFS journal (Windows; platform-gated reader).
    Ntfs,
    /// Cross-platform debounced walker fallback (notify events).
    DebouncedWatch,
}

#[allow(clippy::derivable_impls)]
impl Default for JournalSource {
    fn default() -> Self {
        JournalSource::DebouncedWatch
    }
}

/// The incremental ingest interface both backends satisfy.
pub trait JournalSink {
    /// Apply a journal delta batch. Returns the next cursor.
    fn apply(&mut self, batch: &[UsnRecord]) -> Result<u64, String>;
}

/// The in-memory cursor holder + ingest buffer. The index owns one of these;
/// the backend (NTFS reader or debounced walker) feeds it.
#[derive(Debug, Default)]
pub struct UsnCursor {
    pub source: JournalSource,
    pub next_usn: u64,
    pub applied: u64,
}

impl UsnCursor {
    pub fn new(source: JournalSource) -> Self {
        Self {
            source,
            next_usn: 0,
            applied: 0,
        }
    }

    /// Feed a batch whose first `usn` is > `next_usn` (journal ordering).
    /// Records are consumed in order; any gap aborts the batch (honest: a
    /// missing journal range must never be silently applied).
    pub fn ingest(&mut self, batch: &[UsnRecord]) -> Result<u64, String> {
        if batch.iter().any(|r| r.usn <= self.next_usn) {
            return Err("journal record at/below cursor skipped (duplicate or rewind)".into());
        }
        let Some(last) = batch.last() else {
            return Ok(self.next_usn);
        };
        self.next_usn = last.usn;
        self.applied += batch.len() as u64;
        Ok(self.next_usn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(usn: u64) -> UsnRecord {
        UsnRecord {
            usn,
            reason: UsnReason::DataOverwrite,
            path: PathBuf::from("/tmp/f.txt"),
        }
    }

    #[test]
    fn cursor_advances_in_order() {
        let mut c = UsnCursor::new(JournalSource::DebouncedWatch);
        let batch = vec![rec(1), rec(2), rec(3)];
        assert_eq!(c.ingest(&batch).unwrap(), 3);
        assert_eq!(c.applied, 3);
        assert_eq!(c.ingest(&[rec(5), rec(7)]).unwrap(), 7);
        assert_eq!(c.applied, 5);
    }

    #[test]
    fn gap_aborts() {
        let mut c = UsnCursor::new(JournalSource::DebouncedWatch);
        c.ingest(&vec![rec(10)]).unwrap();
        let err = c.ingest(&vec![rec(5)]).unwrap_err();
        assert!(err.contains("at/below"), "{err}");
        // Cursor unchanged after the failed batch.
        assert_eq!(c.next_usn, 10);
    }

    #[test]
    fn empty_batch_is_noop() {
        let mut c = UsnCursor::new(JournalSource::DebouncedWatch);
        assert_eq!(c.ingest(&[]).unwrap(), 0);
    }
}
