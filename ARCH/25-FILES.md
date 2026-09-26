# 25 — Files

> **Status:** Draft P3 (early — file-world evidence integrated 2026-09-26). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **P7 pass (2026-09-26):** line-checked; requirements seeded (`REQ-FILES-*`, Requirements section).
> **Role:** the filesystem as structured state — **identity · watchers · deltas · write leases · metadata index**. Content indexing is deliberately deferred (metadata-first, `21` W7).
> **Dependencies:** `10-KERNEL` · `12-TRUST` (path scopes) · `19-RUNTIME-ENVIRONMENTS` (helper/leases hosts) · `21-WORLD-MODEL` (W1 collector) · `30-EVENTS` (deltas). **Consumers:** `16`, `26-CODE` (worktrees), `29` (artifact locations), `15`.
> **Evidence:** `ARCHIVE/v1-research/world-model-verification.md` §3 (identity, cursors, freshness; MS `FILE_ID_INFO` / MFT / USN docs) · local `crates/everyaios-storage` (`walk.rs:131-157`, `dedup.rs:106-118`, `usn.rs:77-90`, `usn_winapi.rs`) · DEC-029 · INV-20.

## 1. Purpose & rules

**Owns:** file identity (per platform, with incarnation) · watchers/deltas (USN journal · RDCW · inotify/fanotify · FSEvents) · the cursor/epoch model · the metadata index (names · IDs · size · times · attrs · links) · **write leases** for overlapping edits · workspace/project identity (DM-024) · path scopes for policy.
**Never owns:** content indexing/OCR (deferred) · the world graph (`21`) · policy decisions (`12`) · git semantics (`26`).

1. **Metadata-first** — the collector never reads file content (`21` §5).
2. **Identity before path** — paths are labels; identity is `(volume, file id, incarnation)` / `(dev, ino, nlink)`.
3. **Every watcher is lossy on overflow** — gaps force a bounded rescan; never a silent gap.
4. **Overlapping writes go through leases** — no silent overwrite (DEC-029).

## 2. File identity (DM — see `21` §3)

| Platform | Identity | Stability notes |
|---|---|---|
| Windows | `(VolumeSerialNumber, FILE_ID_128)` via `FileIdInfo`; 64-bit index + serial fallback; USN FRN for event correlation | Stable across rename/move within a volume; **reused after delete** → identity = `(volume, fileId, incarnation)` (creation-time/sequence evidence); FAT IDs can change |
| POSIX | `(st_dev, st_ino)` + `st_nlink` | Inodes reusable after delete; link count distinguishes hardlinks; pair with size/mtime guards |
| Content hash | content identity, **separate** from file identity | Many files → one blob (`dedup.rs`) |

**Code-phase fix (frozen code):** `walk.rs:131-157` zeroes `dev`/`ino` on Windows, corrupting dedup (`dedup.rs:106-118`); replace with the MFT-based identity above.

## 3. Collectors & deltas (W1 mechanics)

- **Initial inventory:** `FSCTL_ENUM_USN_DATA` MFT enumeration (bulk per-directory alternative: `GetFileInformationByHandleEx(FileIdBothDirectoryInfo)`); no per-file opens for metadata.
- **Deltas:** `FSCTL_READ_USN_JOURNAL` from a stored `(VolumeSerial, JournalID, NextUsn)` cursor; renames resolve as old/new-name records; `SourceInfo` filters antivirus/indexer noise.
- **Staleness:** journal ID change · deletion (`ERROR_JOURNAL_DELETE_IN_PROGRESS`) · truncated history → discard cursor, rescan that volume.
- **Fallback:** `ReadDirectoryChangesW` per consented root + periodic bounded re-walk; zero-length buffer / `ERROR_NOTIFY_ENUM_DIR` → enumerate subtree.
- **POSIX equivalents:** inotify per-directory watches (+ `IN_Q_OVERFLOW` → scoped rescan); fanotify `FAN_REPORT_FID` where available; macOS FSEvents with event IDs (`MustScanSubDirs` → rescan directory).
- **Consent:** USN/MFT require admin (helper or per-scan elevation, `19` §6); the running mode is recorded per instance (`21` §5).

## 4. Cursors, freshness, bounds

- Cursor row per collector instance: `(source, scope, epoch, cursor, observed_at)` (`21` §4).
- Use-time freshness: writes re-validate the object (identity + mtime/size guard) before mutating; staleness TTLs mark objects `unknown` (file metadata: minutes).
- Queries read the index; they never walk the filesystem (INV-20).

## 5. Workspace & project identity (DM-024)

- **Workspace:** `folder` · `repo` · `multi-root`; `roots[]`; `trust_level`; policy refs.
- **Project identity keying (OQ-FILES-1, shared with OQ-MEM-05):** proposal — key by **canonical repo root path**, with git remote as a secondary attribute; explicit re-key on move/clone; worktrees share the parent project identity.
- Project identity is the anchor for memory scopes (`17`), repo intelligence (`26`), and policy scopes (`12`).

## 6. Write leases (overlap protection, DEC-029)

- `lease(scope[])` → grant | conflict; scopes are path patterns resolved through pathfloor canonicalization.
- Conflict handling: queue · rebase (VCS-aware, `26`) · ask — never silent overwrite.
- Leases expire (crash-safe) and are audited; lease ownership ties to `work_id`/worker.
- Worktree-isolated writers (`19`/`26`) hold leases on their checkout; the parent applies merges explicitly.

## 7. Path scopes & policy binding

- pathfloor: `allowed_paths` / `read_only_paths`; **interception, not un-discovery** (`12` §8).
- Canonicalization: symlinks/junctions resolved before policy checks (TOCTOU-aware); case sensitivity per platform; Windows long-path handling declared.
- Protected subpaths (e.g. VCS hooks, system dirs) stay read-only inside writable roots (`12` §2).

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Journal deleted/truncated | Cursor discard + volume rescan; epoch reset recorded. |
| Watcher overflow | Scoped rescan + freshness anomaly (never silent). |
| File moved/renamed | Identity survives (MFT/inode); path index updated via delta. |
| File replaced | Incarnation change → new identity; dedup/lease checks re-key. |
| Permission denied | Scoped skip + surfaced count (metadata mode honesty). |
| Symlink swap (TOCTOU) | Re-validate canonical path at use time; deny on mismatch. |

## 9. Interop

**Depends on:** `10` · `12` (scopes) · `19` (helper hosts) · `21` (W1) · `30`.
**Exposes to:** `16` (file context), `26` (repo/worktrees), `29` (artifact locations), `15` (file capabilities), UI (explorer).
**DAG check:** Files owns identity/leases; the world model owns collection state; git semantics stay in `26`.

## 10. Not in v1

Content index/OCR · thumbnails · SMB/network shares · ReFS 128-bit edge cases beyond `FileIdInfo` · fanotify permission classes · macOS kqueue parity.

## 11. Open questions (`OQ-FILES-*`)

1. Project identity keying (with OQ-MEM-05) — repo root vs git remote precedence.
2. Lease granularity (file vs directory pattern) and conflict UX.
3. Symlink/junction policy details (follow/deny per scope class).
4. Windows long-path + case-sensitivity declarations.
5. Elevation-mode defaults per workspace (helper vs per-scan vs non-admin).

## 12. Evidence

`ARCHIVE/v1-research/world-model-verification.md` §3 (identity table, collector mechanics, cursor/freshness) with MS docs (`FILE_ID_INFO`, MFT, USN change-journal identifiers) · local `walk.rs:131-157`, `dedup.rs:106-118`, `usn.rs:77-90`, `usn_winapi.rs` (unwired) · DEC-029 · INV-20 · `ARCH/21-WORLD-MODEL.md` §3–§5.

## 13. Requirements (`REQ-FILES-*`)

Testable behaviors owned by this module live in `ARCH/08-REQUIREMENTS.md`; the traceability chain is in `ARCH/09-FEATURE-MATRIX.md`. This table is a pointer, not a second copy.

| REQ | Behavior (one line) |
|---|---|
| `REQ-FILES-001` | Platform file identity is incarnation-aware — `(volume, fileId, incarnation)` / `(dev, ino, nlink)`; reused ids never resume old identity; no zeroed Windows `dev`/`ino` (DM-026, INV-20) |
| `REQ-FILES-002` | Rename/move preserves identity; replacement re-keys dedup/lease/index dependents explicitly, never silently |
| `REQ-FILES-003` | The metadata index is the query surface — queries never walk the filesystem; deltas (and bounded rescans) keep it fresh (INV-20) |
| `REQ-FILES-004` | Every watcher is lossy on overflow — gaps abort to the smallest-scope rescan + freshness anomaly, never a silent gap (INV-20) |
| `REQ-FILES-005` | Cursor/epoch row `(source, scope, epoch, cursor, observed_at)`; journal reset discards + rescans; replayed records rejected |
| `REQ-FILES-006` | Writes re-validate identity/size/mtime before mutating; staleness TTL marks objects `unknown` — no blind writes |
| `REQ-FILES-007` | Overlapping writes are serialized by path-scoped leases with explicit conflict results — never a silent overwrite (DEC-029) |
| `REQ-FILES-008` | Leases expire crash-safe, are audited and work-bound; worktree checkouts are leased; merges are explicit (DEC-029, INV-24) |
| `REQ-FILES-009` | Canonicalization (symlinks/junctions, case, long paths) precedes policy checks and is re-checked at use — TOCTOU-safe |
| `REQ-FILES-010` | Path scopes intercept (`allowed_paths`/`read_only_paths`); protected subpaths stay read-only inside writable roots — no un-discovery |
| `REQ-FILES-011` | Workspace/project identity (`DM-024`) anchors memory/policy scopes; re-key on move/clone is explicit; worktrees share the parent identity |
| `REQ-FILES-012` | Unreadable scopes are skipped without aborting, surfaced with counts; consent/elevation mode is recorded per collector instance (INV-20, INV-24) |
