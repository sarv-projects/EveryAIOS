//! S0.6 / J21 — TOCTOU hardening for tickets.
//!
//! Bind a ticket to the *identity* of the resources it may touch, then
//! re-verify that identity immediately before mutation:
//!
//! * filesystem: canonical path + parent-dir identity (dev/ino) + file
//!   inode/size/mtime when the target already exists
//! * network: parsed host + resolved IPs + a DNS/IP policy (metadata /
//!   unspecified / rebinding-to-blocked)
//! * executable: SHA-256 digest of script source or on-disk binary
//!
//! Holding a live parent-dir file descriptor is the executor's job
//! (`ToolService`); this module is the serializable snapshot.

use crate::pathfloor::{canonicalize_no_follow, enforce_floor, FloorVerdict};
use crate::urlfloor::{check_url, UrlVerdict};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::net::{IpAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};

/// One resource identity captured at ticket mint and checked at consume.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ResourceBinding {
    File(FileBinding),
    Net(NetBinding),
    Exec(ExecBinding),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileBinding {
    pub canonical: String,
    pub parent_canonical: String,
    /// Present when the target existed at bind time.
    pub ino: Option<u64>,
    pub dev: Option<u64>,
    pub size: Option<u64>,
    pub mtime_ns: Option<u64>,
    pub parent_ino: Option<u64>,
    pub parent_dev: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetBinding {
    pub url: String,
    pub host: String,
    pub resolved_ips: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecBinding {
    pub digest_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ToctouError {
    #[error("path floor refused: {0}")]
    Floor(String),
    #[error("inode/identity drift on {0}")]
    IdentityDrift(String),
    #[error("parent directory replaced: {0}")]
    ParentDrift(String),
    #[error("url refused: {0}")]
    Url(String),
    #[error("blocked destination IP: {0}")]
    BlockedIp(String),
    #[error("DNS rebinding (host {host} resolved to blocked {ip})")]
    Rebind { host: String, ip: String },
    #[error("executable digest mismatch")]
    DigestMismatch,
}

/// Snapshot a filesystem path against `roots`. New files bind the parent dir.
pub fn bind_path(path: &str, roots: &[&str]) -> Result<FileBinding, ToctouError> {
    let joined = PathBuf::from(path);
    let as_str = joined.to_string_lossy();
    match enforce_floor(&as_str, roots) {
        FloorVerdict::Allowed => {}
        other => return Err(ToctouError::Floor(format!("{other:?}"))),
    }
    let canonical = canonicalize_no_follow(&as_str);
    let parent = Path::new(&canonical)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.clone());
    let file_id = identity_of(Path::new(&canonical));
    let parent_id = identity_of(Path::new(&parent));
    Ok(FileBinding {
        canonical,
        parent_canonical: parent,
        ino: file_id.as_ref().map(|i| i.ino),
        dev: file_id.as_ref().map(|i| i.dev),
        size: file_id.as_ref().map(|i| i.size),
        mtime_ns: file_id.as_ref().map(|i| i.mtime_ns),
        parent_ino: parent_id.as_ref().map(|i| i.ino),
        parent_dev: parent_id.as_ref().map(|i| i.dev),
    })
}

/// Re-check floor + inode/parent identity immediately before mutation.
pub fn reverify_path(binding: &FileBinding, roots: &[&str]) -> Result<(), ToctouError> {
    match enforce_floor(&binding.canonical, roots) {
        FloorVerdict::Allowed => {}
        other => return Err(ToctouError::Floor(format!("{other:?}"))),
    }
    let now = canonicalize_no_follow(&binding.canonical);
    if now != binding.canonical {
        return Err(ToctouError::IdentityDrift(binding.canonical.clone()));
    }
    if let (Some(ino), Some(dev)) = (binding.ino, binding.dev) {
        let cur = identity_of(Path::new(&binding.canonical))
            .ok_or_else(|| ToctouError::IdentityDrift(binding.canonical.clone()))?;
        if cur.ino != ino || cur.dev != dev {
            return Err(ToctouError::IdentityDrift(binding.canonical.clone()));
        }
    }
    if let (Some(pino), Some(pdev)) = (binding.parent_ino, binding.parent_dev) {
        let cur = identity_of(Path::new(&binding.parent_canonical))
            .ok_or_else(|| ToctouError::ParentDrift(binding.parent_canonical.clone()))?;
        if cur.ino != pino || cur.dev != pdev {
            return Err(ToctouError::ParentDrift(binding.parent_canonical.clone()));
        }
    }
    Ok(())
}

/// Bind a URL: scheme floor + host + resolved IPs + destination policy.
pub fn bind_url(url: &str, roots: &[&str]) -> Result<NetBinding, ToctouError> {
    match check_url(url, roots) {
        UrlVerdict::Allowed => {}
        other => return Err(ToctouError::Url(format!("{other:?}"))),
    }
    let parsed = url::Url::parse(url).map_err(|e| ToctouError::Url(e.to_string()))?;
    let host = parsed.host_str().unwrap_or("").to_string();
    let mut resolved_ips = Vec::new();
    if !host.is_empty() {
        let port = parsed.port_or_known_default().unwrap_or(80);
        if let Ok(addrs) = (host.as_str(), port).to_socket_addrs() {
            for a in addrs {
                let ip = a.ip();
                if is_blocked_ip(ip) {
                    return Err(ToctouError::BlockedIp(ip.to_string()));
                }
                resolved_ips.push(ip.to_string());
            }
        }
    }
    Ok(NetBinding {
        url: url.to_string(),
        host,
        resolved_ips,
    })
}

/// Re-resolve and refuse DNS rebinding onto a blocked address.
pub fn reverify_url(binding: &NetBinding, roots: &[&str]) -> Result<(), ToctouError> {
    match check_url(&binding.url, roots) {
        UrlVerdict::Allowed => {}
        other => return Err(ToctouError::Url(format!("{other:?}"))),
    }
    if binding.host.is_empty() {
        return Ok(());
    }
    let port = url::Url::parse(&binding.url)
        .ok()
        .and_then(|u| u.port_or_known_default())
        .unwrap_or(80);
    if let Ok(addrs) = (binding.host.as_str(), port).to_socket_addrs() {
        for a in addrs {
            let ip = a.ip();
            if is_blocked_ip(ip) {
                return Err(ToctouError::Rebind {
                    host: binding.host.clone(),
                    ip: ip.to_string(),
                });
            }
        }
    }
    Ok(())
}

/// SHA-256 of executable / script source.
pub fn bind_exec_bytes(bytes: &[u8]) -> ExecBinding {
    let mut h = Sha256::new();
    h.update(bytes);
    ExecBinding {
        digest_sha256: h.finalize().iter().map(|b| format!("{b:02x}")).collect(),
    }
}

pub fn reverify_exec(binding: &ExecBinding, bytes: &[u8]) -> Result<(), ToctouError> {
    let now = bind_exec_bytes(bytes);
    if now.digest_sha256 != binding.digest_sha256 {
        return Err(ToctouError::DigestMismatch);
    }
    Ok(())
}

/// Cloud-metadata, unspecified, and broadcast destinations are never a
/// legitimate tool target.
pub fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            v.octets() == [169, 254, 169, 254]
                || v.is_unspecified()
                || v.is_broadcast()
                || v.is_documentation()
        }
        IpAddr::V6(v) => v.is_unspecified(),
    }
}

/// Open the parent directory so the executor can hold an fd across the
/// ticket's lifetime (the strongest portable TOCTOU bind we can keep in
/// process without serializing fds).
pub fn open_parent_dir(path: &str) -> Option<std::fs::File> {
    let p = Path::new(path);
    let parent = if p.exists() {
        p.parent()?
    } else {
        p.parent().unwrap_or(p)
    };
    std::fs::File::open(parent).ok()
}

struct Id {
    ino: u64,
    dev: u64,
    size: u64,
    mtime_ns: u64,
}

fn identity_of(path: &Path) -> Option<Id> {
    let meta = std::fs::metadata(path).ok()?;
    let (ino, dev) = ino_dev(&meta);
    let mtime_ns = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    Some(Id {
        ino,
        dev,
        size: meta.len(),
        mtime_ns,
    })
}

#[cfg(unix)]
fn ino_dev(meta: &std::fs::Metadata) -> (u64, u64) {
    use std::os::unix::fs::MetadataExt;
    (meta.ino(), meta.dev())
}

#[cfg(not(unix))]
fn ino_dev(meta: &std::fs::Metadata) -> (u64, u64) {
    (meta.len(), 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "everyaios-toctou-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::create_dir_all(&p);
        p
    }

    #[test]
    fn bind_and_reverify_same_file() {
        let dir = tmp();
        let f = dir.join("a.txt");
        std::fs::write(&f, b"hi").unwrap();
        let root = dir.to_string_lossy().to_string();
        let b = bind_path(&f.to_string_lossy(), &[&root]).unwrap();
        assert!(b.ino.is_some());
        reverify_path(&b, &[&root]).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn inode_swap_is_refused() {
        let dir = tmp();
        let f = dir.join("a.txt");
        let other = dir.join("b.txt");
        std::fs::write(&f, b"hi").unwrap();
        std::fs::write(&other, b"other-inode").unwrap();
        let root = dir.to_string_lossy().to_string();
        let b = bind_path(&f.to_string_lossy(), &[&root]).unwrap();
        // Rename a sibling over the bound path so the inode is guaranteed
        // different (tmpfs often reuses inodes on unlink+create).
        std::fs::remove_file(&f).unwrap();
        std::fs::rename(&other, &f).unwrap();
        let err = reverify_path(&b, &[&root]).unwrap_err();
        assert!(matches!(err, ToctouError::IdentityDrift(_)), "{err:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parent_dir_open_holds() {
        let dir = tmp();
        let f = dir.join("a.txt");
        std::fs::write(&f, b"x").unwrap();
        assert!(open_parent_dir(&f.to_string_lossy()).is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn metadata_ip_blocked() {
        assert!(is_blocked_ip("169.254.169.254".parse().unwrap()));
        assert!(!is_blocked_ip("1.1.1.1".parse().unwrap()));
    }

    #[test]
    fn exec_digest_detects_swap() {
        let a = bind_exec_bytes(b"console.log(1)");
        assert!(reverify_exec(&a, b"console.log(1)").is_ok());
        assert_eq!(
            reverify_exec(&a, b"console.log(2)").unwrap_err(),
            ToctouError::DigestMismatch
        );
    }

    #[test]
    fn javascript_url_refused() {
        let err = bind_url("javascript:alert(1)", &["/workspace"]).unwrap_err();
        assert!(matches!(err, ToctouError::Url(_)));
    }

    #[test]
    fn floor_escape_refused() {
        let dir = tmp();
        let root = dir.to_string_lossy().to_string();
        let err = bind_path("/etc/passwd", &[&root]).unwrap_err();
        assert!(matches!(err, ToctouError::Floor(_)));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
