# 49 — Storage Intelligence Deep Dive (eDirStat / UltraSearch / WinDirStat / fclones)

> **Date:** 2026-08-09 · **Status:** 🟦 web-verified (README + docs + secondary sources; not a full source read)
> **Repos:** eDirStat (`xangelix/edirstat`, MIT, Rust), UltraSearch (`Dicklesworthstone/ultrasearch`, Windows Rust), WinDirStat (`windirstat/windirstat`, GPL-2.0), fclones (`pkolaczk/fclones`, MIT, Rust) + landscape: ncdu / gdu / dust / dua-cli / filelight / baobab / QDirStat
> **Purpose:** Close the **storage-intelligence gap** (0 research mentions, 0 TODO tasks before this doc) — the most valuable new idea from the gap audit. Derive a new `everyaios-storage` crate + matrix rows D9–D11 + G7.
> **Cross-refs:** doc 04 (reality-check — the pasted chat's storage idea), doc 28 (GenOffice — same "steal architecture, own code" doctrine), ARCH/06 (dual-guard — cleanup actions must be ticketed), ARCH/02 §2.2 (crate table), J16 (battery-aware scheduling — indexing/scanning must respect it).

---

## 1. Why this matters (the gap)

The gap audit found **zero** storage-intelligence capability in the corpus: no disk-usage analyzer, no treemap, no duplicate detection, no large-file finder, no instant filename search. Meanwhile the three tools below prove the patterns are cheap, proven, and library-embeddable. Storage intelligence is the kind of local-first, high-value feature that makes a desktop OS-shell app feel like an *OS* — and every pattern below is MIT/Apache-2.0 (except WinDirStat GPL-2.0 → pattern only).

---

## 2. eDirStat (`xangelix/edirstat`) — the core reference ⬛/🟦

**MIT · Rust · actively developed (v2.0.x line, Windows/macOS/Linux) · dual GUI + headless CLI.**

### 2.1 Architecture (source-derived)
| Mechanism | Implementation | Why it matters for us |
|---|---|---|
| **Parallel work-stealing walker** | `crossbeam-deque` task injector queues (same pattern as ripgrep) keep all CPU cores saturated | Direct pattern for a fast first scan — reuse the corpus's ripgrep familiarity (doc 33 also uses this class of concurrency) |
| **Cycle + boundary safety** | device/inode checks against an ancestor stack; `.gitignore` globset filtering; device-boundary restrictions | Prevents infinite loops on mount points/bind mounts; `ignore` crate already in our stack |
| **Lock-free snapshot coordinator** | scan events stream over lock-free channels to a background coordinator thread; GUI reads an **immutable `FileNode` arena snapshot through `arc_swap` at ~100ms cadence** | The GUI never blocks the walker; 100ms ≈ real-time updates while scanning huge trees |
| **Cache-friendly arena + string pool** | directory tree flattened into a contiguous `u32`-indexed `FileNode` array, `bytemuck::Pod`/`Zeroable`, 8-byte aligned, **zero-copy deserialization** | Snapshot memory stays tiny even for millions of files; enables mmap save/load |
| **Windows MFT scanner** | parses raw NTFS physical handles to bypass OS traversal on Windows | Only relevant if we want Windows-native speed; UltraSearch does the equivalent via `usn-journal-rs` (§3) |
| **Headless CLI + snapshots** | `edirstat /path --to mysnapshot.edst` writes **Zstd-compressed snapshots** | Our agent can `scan → save snapshot → query later`; snapshots are the persistence format |

### 2.2 Duplicate detection — the 7-stage engine 🟦
eDirStat's deduplicator is a **7-stage pipeline**:
1. size partitioning → 2. prefix-block hash → 3. midpoint-block hash → 4. suffix-block hash → 5. multi-range periodic block sampling → 6. full **BLAKE3** hash for confirmations → 7. **hardlink-aware** safety checks (same-inode candidates are *not* "duplicates").

This is nearly identical to fclones' design (§5) — two independent implementations of the same proven shape → we can confidently implement it ourselves.

### 2.3 What we take
- **STEAL (pattern, MIT):** work-stealing walker + arena snapshot + `arc_swap` 100ms cadence + zstd snapshots + 7-stage dedup pipeline. MIT permits reuse with attribution; we implement our own (dogfood rule, I6) — same doctrine as doc 28's GenOffice steals.

---

## 3. UltraSearch (`Dicklesworthstone/ultrasearch`) — the instant-search reference 🟦

**Windows-only Rust search engine (tightly coupled to NTFS).** Architecture:
- **`searchd` service** — always-on background service (tens of MB RSS) that enumerates NTFS **MFT** via `usn-journal-rs` and **tails USN journals** for real-time change tracking.
- **`search-index-worker`** — short-lived processes that extract + index **file contents** (Extractous/IFilter/OCR backends) **only when the system is idle**.
- **`search-ui`** — GPU-accelerated UI over **named pipes**, Spotlight-style quick palette (`Alt+Space`).

**What we take (cross-platform version):**
- **STEAL (pattern):** *filename index from the filesystem journal, not re-walks*. On Windows we can read MFT/USN (via `usn-journal-rs` or Everything's HTTP IPC, §6); on macOS `mdfind`/FSEvents; on Linux `inotify` + an initial walk. Our portable core = **SQLite FTS5 filename index + `notify`-crate incremental updates** (see §7 G7 design). The *instant search UX* (type → results in ms) is the transferable part, not the NTFS internals.
- **ADAPT:** idle-only content indexing (respects J16 battery-aware scheduling — suppress on battery).

---

## 4. WinDirStat (`windirstat/windirstat`) — the feature reference ⚠️ GPL-2.0

**GPL-2.0 · Windows · the classic.** Feature set: sortable directory tree, extension/type statistics, **interactive treemap**, duplicate detection by hash, cleanup actions (open/copy/delete/recycle/Recycle-Bin empty + Windows maintenance shortcuts: Disk Cleanup, defrag, CHKDSK, shadow copies, hibernate compression).

**Decision:** WinDirStat is GPL-2.0 → **pattern only, no code** (consistent with the corpus's AGPL/ELv2/NOASSERTION policy in spec §8). The *feature list* is the product checklist for our treemap + cleanup UI; the *implementation* comes from eDirStat (MIT) + fclones (MIT).

---

## 5. fclones (`pkolaczk/fclones`) — dedup at scale 🟦

**MIT · Rust · CLI.** The gold standard for hash-based duplicate detection:
- Multi-stage: **size grouping → fast non-cryptographic hashes (metro/xxHash3) on prefix/suffix → upgrade to cryptographic (BLAKE3/SHA-256/512) only when needed**.
- **Reflink** copy-on-write dedup on Btrfs/XFS/APFS (not Windows).
- Path-prefix compression + device-aware scheduling (SSD vs HDD) → handles **millions of files with low RSS**.

**What we take:** the exact stage ordering (size → cheap hash → crypto hash) and the hardlink-inode check. Our dedup tool = eDirStat 7-stage + fclones ordering, implemented in `everyaios-storage`.

---

## 6. Cross-platform landscape (context)

| Tool | Lang/License | Notes for us |
|---|---|---|
| ncdu | C (ncurses) | TUI only; reference UX, not library |
| gdu | Go (package API) | Go — not our stack |
| dust / du-dust | Rust | CLI only, but its bar-graph output is a nice chat-artifact idea |
| dua-cli | Rust | TUI **and usable as a library crate** (walk → structured data) |
| filelight / baobab | C++ Qt / GTK | GUI treemaps; design reference for the treemap UX |
| QDirStat | C++/Qt | `qdirstat-cache-writer` = headless background crawler pattern |
| **Everything** (voidtools) | Windows freeware (proprietary source, free to use) | MFT-based; exposes an **HTTP/IPC API** → we can drive it as an *optional* Windows accelerator, never a dependency |
| **fclones** | Rust MIT | dedup (§5) |

---

## 7. Synthesis → `everyaios-storage` crate + matrix rows

### 7.1 The crate (ARCH/02 §2.2 addition)

**`everyaios-storage`** (Rust, new) — owns the walker, snapshots, treemap data, dedup, and the filename index:

| Concern | Pattern source | Key rules |
|---|---|---|
| Parallel walker | eDirStat `traversal.rs` (crossbeam-deque) + `ignore` | cycle detection (device/inode), device-boundary, `.gitignore`-aware |
| Snapshot | eDirStat `arena.rs`/`coordinator.rs` | immutable `u32`-indexed arena, `arc_swap` handoff, **zstd save/load**, ~100ms cadence |
| Treemap data | WinDirStat (feature) + eDirStat (impl) + squarified layout | stable extension-hashing for color stability; per-dir aggregation |
| Dedup | eDirStat 7-stage + fclones ordering | size → xxHash3 prefix/suffix → BLAKE3; hardlink-aware; optional reflink (btrfs/xfs/apfs) |
| Cleanup | WinDirStat feature list | **every action Guard-2 ticketed** (ARCH/06) — recycle-bin-aware, never bypass dual-guard |
| Filename index (G7) | UltraSearch pattern, portable | **SQLite FTS5** path index + `notify`-debouncer incremental updates; OS-native accelerators *optional* (Everything HTTP on Windows, `mdfind` macOS, Baloo KDE) |
| Content index (later) | UltraSearch `search-index-worker` | idle-only, battery-aware (J16), Tantivy or FTS5 |

Crates: `crossbeam-deque`, `ignore`, `notify`/`notify-debouncer-full`, `rusqlite` (FTS5), `bytemuck`, `arc-swap`, `zstd`, `egui` (treemap canvas), `xxhash-rust`, `blake3`.

### 7.2 Matrix rows
- **D9 Storage intelligence** (🔵) — parallel disk walker + treemap + per-dir aggregation + Guard-2-gated cleanup.
- **D10 Duplicate detection by hash** (🔵) — 7-stage pipeline, hardlink-aware, group reports.
- **D11 Large-file finder** (🔵) — top-N by size/age + filters + cleanup actions.
- **G7 Instant filename/content search** (🔵) — FTS5 filename index + watcher + OS hooks; the UltraSearch UX, cross-platform.

### 7.3 Phasing
Storage slots into **P4 (office & files domain)** — the walker's exit test is trivially verifiable (`scan fixture tree → treemap data + dedup report → byte-stable snapshot round-trip`). The filename index (G7) ships with it. All scans/indexing respect J16 battery-awareness.

---

## 8. License & honesty notes
- eDirStat **MIT**, fclones **MIT**, dua-cli **MIT/Apache** → patterns + architecture reusable (own implementation, I6 dogfood rule).
- WinDirStat **GPL-2.0** → feature list only, never code.
- Star counts are **as-of-research-date estimates, verify live** before citing (⚪ depth on numbers, 🟦 on mechanisms).

**Ledger: 170 → 181 repos.** Reading-order: docs 01–48 → **49** (storage) → 50 (generative UI/image/voice/email) → 51 (aider recheck) → spec v3.8.
