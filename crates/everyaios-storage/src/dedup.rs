//! 7-stage duplicate detection (fclones + eDirStat ordering, doc 49 §4).
//!
//! Stages: (1) size bucket → (2) xxHash3 prefix → (3) xxHash3 suffix →
//! (4) BLAKE3 full → (5) hardlink grouping (dev+ino) → (6) reflink eligibility
//! (single device) → (7) report ordered by wasted bytes. The prefix/suffix
//! xxHash3 passes avoid reading whole files when they already differ.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::StorageError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DedupOptions {
    pub min_size: u64,
    pub prefix_len: usize,
    pub suffix_len: usize,
}

impl Default for DedupOptions {
    fn default() -> Self {
        DedupOptions {
            min_size: 1,
            prefix_len: 64 * 1024,
            suffix_len: 64 * 1024,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DupCandidate {
    pub path: PathBuf,
    pub size: u64,
    pub dev: u64,
    pub ino: u64,
    pub nlink: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DupGroup {
    pub size: u64,
    pub files: Vec<DupCandidate>,
    pub wasted_bytes: u64,
    pub hardlink_groups: usize,
    pub reflink_eligible: bool,
}

pub fn find_duplicates(
    cands: &[DupCandidate],
    opts: &DedupOptions,
) -> Result<Vec<DupGroup>, StorageError> {
    // Stage 1: size bucket.
    let mut by_size: HashMap<u64, Vec<usize>> = HashMap::new();
    for (i, c) in cands.iter().enumerate() {
        if c.size >= opts.min_size && c.size > 0 {
            by_size.entry(c.size).or_default().push(i);
        }
    }

    let mut groups = Vec::new();
    for (_size, idxs) in by_size {
        if idxs.len() < 2 {
            continue;
        }

        // Stage 2: xxHash3 prefix.
        let mut by_prefix: HashMap<u64, Vec<usize>> = HashMap::new();
        for &i in &idxs {
            let h = prefix_hash(&cands[i].path, opts.prefix_len)?;
            by_prefix.entry(h).or_default().push(i);
        }
        for (_p, sub) in by_prefix {
            if sub.len() < 2 {
                continue;
            }

            // Stage 3: xxHash3 suffix.
            let mut by_suffix: HashMap<u64, Vec<usize>> = HashMap::new();
            for &i in &sub {
                let h = suffix_hash(&cands[i].path, opts.suffix_len)?;
                by_suffix.entry(h).or_default().push(i);
            }
            for (_s, sub2) in by_suffix {
                if sub2.len() < 2 {
                    continue;
                }

                // Stage 4: BLAKE3 full content.
                let mut by_full: HashMap<[u8; 32], Vec<usize>> = HashMap::new();
                for &i in &sub2 {
                    let h = full_hash(&cands[i].path)?;
                    by_full.entry(h).or_default().push(i);
                }
                for (_h, idxs3) in by_full {
                    if idxs3.len() < 2 {
                        continue;
                    }
                    let files: Vec<DupCandidate> =
                        idxs3.iter().map(|&i| cands[i].clone()).collect();
                    let size = files[0].size;

                    // Stage 5: hardlink groups (unique dev+ino).
                    let mut hardlinks: HashSet<(u64, u64)> = HashSet::new();
                    let mut devs: HashSet<u64> = HashSet::new();
                    for f in &files {
                        hardlinks.insert((f.dev, f.ino));
                        devs.insert(f.dev);
                    }
                    let hardlink_groups = hardlinks.len();
                    // Stage 6: reflink eligible = all on one device.
                    let reflink_eligible = devs.len() == 1;
                    // Stage 7: wasted bytes = distinct physical copies
                    // beyond the one we keep (same-inode hardlinks waste 0).
                    let wasted = size.saturating_mul(hardlink_groups.saturating_sub(1) as u64);

                    groups.push(DupGroup {
                        size,
                        files,
                        wasted_bytes: wasted,
                        hardlink_groups,
                        reflink_eligible,
                    });
                }
            }
        }
    }

    groups.sort_by_key(|g| std::cmp::Reverse(g.wasted_bytes));
    Ok(groups)
}

fn prefix_hash(path: &PathBuf, len: usize) -> Result<u64, StorageError> {
    let mut f = File::open(path)?;
    let mut out = Vec::with_capacity(len.min(1 << 20));
    let mut chunk = vec![0u8; 64 * 1024];
    let mut remaining = len;
    while remaining > 0 {
        let k = remaining.min(chunk.len());
        let n = f.read(&mut chunk[..k])?;
        if n == 0 {
            break;
        }
        out.extend_from_slice(&chunk[..n]);
        remaining -= n;
    }
    Ok(crate::xxh3(&out))
}

fn suffix_hash(path: &PathBuf, len: usize) -> Result<u64, StorageError> {
    let mut f = File::open(path)?;
    let flen = f.metadata()?.len();
    if flen == 0 {
        return Ok(crate::xxh3(&[]));
    }
    let start = flen.saturating_sub(len as u64);
    f.seek(SeekFrom::Start(start))?;
    let mut out = Vec::new();
    f.read_to_end(&mut out)?;
    Ok(crate::xxh3(&out))
}

fn full_hash(path: &PathBuf) -> Result<[u8; 32], StorageError> {
    let mut f = File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(*hasher.finalize().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmpdir(tag: &str) -> PathBuf {
        let p =
            std::env::temp_dir().join(format!("everyaios-storage-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn finds_duplicates_not_distinct() {
        let root = tmpdir("dedup");
        fs::write(root.join("x1.bin"), vec![0u8; 4096]).unwrap();
        fs::write(root.join("x2.bin"), vec![0u8; 4096]).unwrap();
        fs::write(root.join("y1.bin"), vec![1u8; 4096]).unwrap();
        fs::write(root.join("y2.bin"), vec![1u8; 4096]).unwrap();
        fs::write(root.join("z.bin"), vec![2u8; 100]).unwrap();

        let paths = ["x1.bin", "x2.bin", "y1.bin", "y2.bin", "z.bin"];
        let cands: Vec<DupCandidate> = paths
            .iter()
            .enumerate()
            .map(|(i, name)| {
                let path = root.join(name);
                let size = fs::metadata(&path).unwrap().len();
                DupCandidate {
                    path,
                    size,
                    dev: 0,
                    ino: (i + 1) as u64,
                    nlink: 1,
                }
            })
            .collect();

        let groups = find_duplicates(
            &cands,
            &DedupOptions {
                min_size: 1,
                prefix_len: 4096,
                suffix_len: 4096,
            },
        )
        .unwrap();

        assert_eq!(groups.len(), 2); // x pair + y pair; z singleton dropped
        for g in &groups {
            assert_eq!(g.size, 4096);
            assert_eq!(g.files.len(), 2);
            assert_eq!(g.wasted_bytes, 4096);
            assert_eq!(g.hardlink_groups, 2);
            assert!(g.reflink_eligible);
        }
        // Descending wasted order (equal here).
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn same_inode_is_one_hardlink_group() {
        let root = tmpdir("hardlink");
        fs::write(root.join("orig.bin"), vec![7u8; 1024]).unwrap();
        fs::hard_link(root.join("orig.bin"), root.join("link.bin")).unwrap();

        let files = vec![
            DupCandidate {
                path: root.join("orig.bin"),
                size: 1024,
                dev: 0,
                ino: 1,
                nlink: 2,
            },
            DupCandidate {
                path: root.join("link.bin"),
                size: 1024,
                dev: 0,
                ino: 1,
                nlink: 2,
            },
        ];
        let groups = find_duplicates(&files, &DedupOptions::default()).unwrap();
        assert_eq!(groups.len(), 1);
        // Same inode → one physical copy → nothing actually wasted.
        assert_eq!(groups[0].hardlink_groups, 1);
        assert_eq!(groups[0].wasted_bytes, 0);

        let _ = fs::remove_dir_all(&root);
    }
}
