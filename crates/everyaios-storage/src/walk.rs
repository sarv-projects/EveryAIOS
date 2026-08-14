//! Parallel work-stealing disk walker + u32-indexed tree arena
//! (eDirStat traversal/arena pattern, doc 49 §2).
//!
//! Each scanner thread owns a `crossbeam_deque::Worker`; when its own queue
//! runs dry it *steals* from its siblings. Symlink entries are always skipped
//! (their target is scanned at its real path — avoids double-counting and
//! cycles). `same_filesystem` pins the scan to the root's device
//! (device-boundary safety). The arena mirrors eDirStat's zero-copy u32 node
//! index; we use a plain `Vec<FileNode>` instead of a bytemuck Pod slab — the
//! unsafe zero-copy cast is a later optimization, not a correctness concern.

use std::collections::HashMap;
use std::fs::{self, Metadata};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::time::UNIX_EPOCH;

use crossbeam_deque::{Steal, Stealer, Worker};
use serde::{Deserialize, Serialize};

use crate::StorageError;

/// Sentinel arena index meaning "no parent" (the arena root's parent).
pub const ROOT_ID: u32 = u32::MAX;

/// Flat record emitted by the walker (pre-arena).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileRecord {
    pub path: PathBuf,
    pub is_dir: bool,
    pub size: u64,
    pub mtime: u64,
    pub nlink: u32,
    pub dev: u64,
    pub ino: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScanOptions {
    pub threads: usize,
    pub follow_symlinks: bool,
    pub same_filesystem: bool,
    pub min_file_size: u64,
    pub skip_hidden: bool,
}

impl Default for ScanOptions {
    fn default() -> Self {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        ScanOptions {
            threads,
            follow_symlinks: false,
            same_filesystem: false,
            min_file_size: 0,
            skip_hidden: false,
        }
    }
}

/// A node in the u32-indexed tree arena.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileNode {
    pub id: u32,
    pub parent: u32,
    pub name: String,
    pub path: String,
    /// Files: own size. Directories: aggregate size of all descendants.
    pub size: u64,
    pub mtime: u64,
    pub is_dir: bool,
    pub nlink: u32,
    pub dev: u64,
    pub ino: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Arena {
    pub nodes: Vec<FileNode>,
}

impl Arena {
    pub fn get(&self, id: u32) -> Option<&FileNode> {
        self.nodes.get(id as usize)
    }

    /// Direct children of `id`, in arena order.
    pub fn children(&self, id: u32) -> Vec<u32> {
        self.nodes
            .iter()
            .filter(|n| n.parent == id)
            .map(|n| n.id)
            .collect()
    }

    /// Root id (always node 0).
    pub fn root(&self) -> Option<u32> {
        self.nodes.first().map(|_| 0)
    }
}

/// Canonicalize `path` for stable keys; fall back to the raw path.
fn normalize(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn depth(path: &str) -> usize {
    path.matches(['/', '\\']).count()
}

fn mtime_secs(m: &Metadata) -> u64 {
    m.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .map(|n| n.to_string_lossy().starts_with('.'))
        .unwrap_or(false)
}

#[cfg(unix)]
fn dev_of(m: &Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    m.dev()
}
#[cfg(unix)]
fn ino_of(m: &Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    m.ino()
}
#[cfg(unix)]
fn nlink_of(m: &Metadata) -> u32 {
    use std::os::unix::fs::MetadataExt;
    m.nlink() as u32
}
#[cfg(not(unix))]
fn dev_of(_: &Metadata) -> u64 {
    0
}
#[cfg(not(unix))]
fn ino_of(_: &Metadata) -> u64 {
    0
}
#[cfg(not(unix))]
fn nlink_of(_: &Metadata) -> u32 {
    1
}

/// Scan `root` with a work-stealing pool, returning flat records.
pub fn scan(root: &Path, opts: &ScanOptions) -> Result<Vec<FileRecord>, StorageError> {
    let root = normalize(root);
    let threads = opts.threads.max(1);

    let root_dev = if opts.same_filesystem {
        fs::metadata(&root).ok().map(|m| dev_of(&m))
    } else {
        None
    };

    let (sender, receiver) = mpsc::channel::<FileRecord>();
    let pending = Arc::new(AtomicUsize::new(1));

    let workers: Vec<Worker<PathBuf>> = (0..threads).map(|_| Worker::new_fifo()).collect();
    let stealers: Vec<Stealer<PathBuf>> = workers.iter().map(|w| w.stealer()).collect();
    workers[0].push(root.clone());

    let handles: Vec<_> = workers
        .into_iter()
        .enumerate()
        .map(|(i, worker)| {
            let sender = sender.clone();
            let pending = pending.clone();
            let stealers = stealers.clone();
            let opts = *opts;
            std::thread::spawn(move || loop {
                let dir = worker.pop().or_else(|| {
                    let mut stolen = None;
                    for (j, s) in stealers.iter().enumerate() {
                        if j == i {
                            continue;
                        }
                        loop {
                            match s.steal() {
                                Steal::Success(d) => {
                                    stolen = Some(d);
                                    break;
                                }
                                Steal::Empty => break,
                                Steal::Retry => continue,
                            }
                        }
                        if stolen.is_some() {
                            break;
                        }
                    }
                    stolen
                });

                match dir {
                    Some(d) => {
                        pending.fetch_sub(1, Ordering::SeqCst);
                        walk_dir(&d, &opts, root_dev, &sender, &worker, &pending);
                    }
                    None => {
                        if pending.load(Ordering::SeqCst) == 0 {
                            break;
                        }
                        std::thread::yield_now();
                    }
                }
            })
        })
        .collect();

    for h in handles {
        let _ = h.join();
    }
    drop(sender);

    let mut records: Vec<FileRecord> = receiver.into_iter().collect();
    records.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(records)
}

fn walk_dir(
    dir: &Path,
    opts: &ScanOptions,
    root_dev: Option<u64>,
    sender: &mpsc::Sender<FileRecord>,
    worker: &Worker<PathBuf>,
    pending: &AtomicUsize,
) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let meta = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        // Skip symlinks entirely (their target is scanned at its real path).
        if meta.file_type().is_symlink() {
            continue;
        }
        let is_dir = meta.is_dir();

        // Device-boundary safety.
        if let Some(rd) = root_dev {
            if dev_of(&meta) != rd {
                continue;
            }
        }
        if opts.skip_hidden && is_hidden(&path) {
            continue;
        }

        let size = if is_dir { 0 } else { meta.len() };
        if !is_dir && size < opts.min_file_size {
            continue;
        }

        let rec = FileRecord {
            path: path.clone(),
            is_dir,
            size,
            mtime: mtime_secs(&meta),
            nlink: nlink_of(&meta),
            dev: dev_of(&meta),
            ino: ino_of(&meta),
        };
        let _ = sender.send(rec);

        if is_dir {
            pending.fetch_add(1, Ordering::SeqCst);
            worker.push(path);
        }
    }
}

/// Build a u32-indexed tree arena from flat records, aggregating sizes
/// bottom-up so every directory's `size` is the sum of its descendants.
pub fn build_arena(records: Vec<FileRecord>, root: &Path) -> Arena {
    let root = normalize(root);
    let root_key = path_key(&root);

    let mut nodes = Vec::new();
    let mut map: HashMap<String, u32> = HashMap::new();

    // Synthetic root node (id 0).
    nodes.push(FileNode {
        id: 0,
        parent: ROOT_ID,
        name: root
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| root_key.clone()),
        path: root_key.clone(),
        size: 0,
        mtime: 0,
        is_dir: true,
        nlink: 0,
        dev: 0,
        ino: 0,
    });
    map.insert(root_key.clone(), 0);

    for rec in records {
        let key = path_key(&rec.path);
        let parent_key = rec
            .path
            .parent()
            .map(path_key)
            .unwrap_or_else(|| root_key.clone());

        let parent_id = if let Some(&id) = map.get(&parent_key) {
            id
        } else {
            // Parent dir wasn't scanned (edge case) — synthesize a placeholder.
            let id = nodes.len() as u32;
            nodes.push(FileNode {
                id,
                parent: ROOT_ID,
                name: Path::new(&parent_key)
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                path: parent_key.clone(),
                size: 0,
                mtime: 0,
                is_dir: true,
                nlink: 0,
                dev: 0,
                ino: 0,
            });
            map.insert(parent_key, id);
            id
        };

        let id = nodes.len() as u32;
        nodes.push(FileNode {
            id,
            parent: parent_id,
            name: rec
                .path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: key.clone(),
            size: if rec.is_dir { 0 } else { rec.size },
            mtime: rec.mtime,
            is_dir: rec.is_dir,
            nlink: rec.nlink,
            dev: rec.dev,
            ino: rec.ino,
        });
        map.insert(key, id);
    }

    // Bottom-up aggregation: deepest nodes first.
    let mut order: Vec<u32> = (0..nodes.len() as u32).collect();
    order.sort_by_key(|&i| std::cmp::Reverse(depth(&nodes[i as usize].path)));
    for &i in &order {
        let p = nodes[i as usize].parent;
        if p != ROOT_ID && p != i && (p as usize) < nodes.len() {
            let s = nodes[i as usize].size;
            nodes[p as usize].size += s;
        }
    }

    Arena { nodes }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let p =
            std::env::temp_dir().join(format!("everyaios-storage-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn scan_and_aggregate_sizes() {
        let root = tmpdir("walk");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("a.txt"), b"hello").unwrap();
        fs::write(root.join("sub/b.txt"), b"world world").unwrap();

        let opts = ScanOptions {
            threads: 4,
            ..Default::default()
        };
        let records = scan(&root, &opts).unwrap();
        assert!(records.iter().any(|r| r.path.ends_with("a.txt")));
        assert!(records.iter().any(|r| r.path.ends_with("sub") && r.is_dir));
        assert!(records.iter().any(|r| r.path.ends_with("b.txt")));

        let arena = build_arena(records, &root);
        let root_id = arena.root().unwrap();
        // a.txt (5) + sub/b.txt (11) = 16
        assert_eq!(arena.get(root_id).unwrap().size, 16);

        let sub = arena
            .children(root_id)
            .into_iter()
            .find(|&id| arena.get(id).unwrap().name == "sub")
            .unwrap();
        assert_eq!(arena.get(sub).unwrap().size, 11);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn skip_hidden_and_min_size() {
        let root = tmpdir("filter");
        fs::write(root.join(".hidden"), vec![0u8; 10]).unwrap();
        fs::write(root.join("big.bin"), vec![0u8; 500]).unwrap();
        fs::write(root.join("tiny.bin"), vec![0u8; 5]).unwrap();

        let opts = ScanOptions {
            threads: 2,
            skip_hidden: true,
            min_file_size: 100,
            ..Default::default()
        };
        let records = scan(&root, &opts).unwrap();
        assert_eq!(records.len(), 1);
        assert!(records[0].path.ends_with("big.bin"));

        let _ = fs::remove_dir_all(&root);
    }
}
