//! D7 — atomic writes (ARCH/04 §4.4): write a sibling temp file, fsync it,
//! then rename over the target. Same-directory rename is atomic on POSIX, so
//! a crash mid-save can never leave a half-written OOXML file on disk (the
//! pre-edit file is untouched until the rename lands).

use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

/// Monotonic temp-suffix counter (parallel tests/writers never collide).
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, thiserror::Error)]
pub enum AtomicError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Write `bytes` to `path` atomically. Returns `()` on success; the target
/// file either contains the old bytes or the new bytes, never a mix.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), AtomicError> {
    let dir = match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => std::path::PathBuf::from("."),
    };
    let file_name = path.file_name().ok_or_else(|| {
        AtomicError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "path has no file name",
        ))
    })?;

    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp_path = dir.join(format!(
        ".{}.tmp-{}-{}",
        file_name.to_string_lossy(),
        std::process::id(),
        seq
    ));

    // Write the temp file, fsync it, then atomically rename over the target.
    let mut tmp = File::create(&tmp_path)?;
    tmp.write_all(bytes)?;
    tmp.sync_all()?;
    drop(tmp);
    std::fs::rename(&tmp_path, path)?;

    // Best-effort directory fsync (POSIX) so the rename itself is durable.
    #[cfg(unix)]
    {
        if let Ok(d) = File::open(&dir) {
            let _ = d.sync_all();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_file(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("everyaios-atomic-{tag}-{}", std::process::id()))
    }

    #[test]
    fn writes_bytes_and_leaves_no_temp() {
        let path = tmp_file("new");
        let _ = std::fs::remove_file(&path);
        write_atomic(&path, b"hello").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"hello");
        // No leftover temp file in the directory.
        let dir = path.parent().unwrap();
        let leftovers: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains("everyaios-atomic-new") && n.contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "leftover temp files: {leftovers:?}");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn overwrites_existing_file() {
        let path = tmp_file("overwrite");
        std::fs::write(&path, b"old").unwrap();
        write_atomic(&path, b"new content").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new content");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn missing_filename_errors() {
        // A path with no file name (root or trailing dir) cannot be written.
        let err = write_atomic(std::path::Path::new("."), b"x").unwrap_err();
        assert!(matches!(err, AtomicError::Io(_)));
    }
}
