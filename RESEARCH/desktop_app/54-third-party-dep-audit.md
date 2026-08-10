# 54 — Third-Party Dependency & Catalog Verification Audit

> **Date:** 2026-08-09 · **Method:** every load-bearing third-party name in the corpus re-verified live (GitHub API + crates.io, 2026-08-09). Two goals: (1) catch abandoned/unmaintained deps before they harden — the **Kuzu lesson** (archived Oct 2025, team acquired by Apple); (2) settle the tool-catalog naming question (`focus_window`). All data below fetched today, not from memory.
> **Actions applied:** ledger kuzu row flagged archived + LadybugDB added (section 23, 218→**219 repos**); ARCH/08 enumeration completed with `focus_window`; xxhash-rust BSL flag recorded at the storage-crate row (ARCH/02).

## §1 Verdict table

### 1.1 Graph backend: Kuzu → LadybugDB (CONFIRMED — ledger updated)

| | Kuzu (`kuzudb/kuzu`) | LadybugDB (`LadybugDB/ladybug`) |
|---|---|---|
| Status | ⚠️ **archived Oct 2025** (team acquired by Apple) | ✅ **active — pushed 2026-08-09** |
| Stars | 4,026 | 1,557 |
| License | MIT | MIT |
| Model | embedded, zero-dep C++, Cypher | embedded **"DuckDB for graphs"** — columnar, Cypher, built-in vector + FTS |
| Bindings | Python/C++ | Python (`ladybug`) · Node (`@ladybugdb/core`) · **Rust (`lbug` 0.19.1, 260K dl)** · Go/Swift/Java |
| Org | archived | multi-repo org incl. an MCP server |

- Corpus story **confirmed**: ARCH/07 already says "Kuzu abandoned Oct 2025; LadybugDB is the active community fork" (v3.7 era) — the audit found no hallucination.
- **Risk flag:** LadybugDB is early-stage with no corporate backing → pin exact versions (`lbug` 0.19.x), keep the SQLite+FTS5 path as the always-works fallback (P5.2 builds both), reassess at P5.2 gate.

### 1.2 Planned runtime deps (live-verified 2026-08-09)

| Dep | Use (crate/row) | Verified | Verdict |
|---|---|---|---|
| rquickjs 0.12.2 | script-eval (E4, `everyaios-script`) | crates.io: updated 2026-07-27, 3.35M dl | ✅ active (GitHub org 404 — canonical source is crates.io) |
| arboard 3.6.1 | clipboard (H26) | `1Password/arboard` 959⭐, Apache-2.0, pushed 2026-07-29 | ✅ |
| crossbeam | storage walker (D9) | 8,541⭐, Apache-2.0 | ✅ |
| arc-swap | arena snapshots (D9) | 1,401⭐, Apache-2.0 | ✅ |
| zstd-rs | snapshot save/load (D9) | 651⭐, BSD-3-Clause | ✅ |
| blake3 | dedup hashing (D9/D10) | 6,361⭐, Apache-2.0 | ✅ |
| **xxhash-rust** | dedup stage-1 (D9) | 293⭐, **BSL-1.0** | ⚠️ **BSL ≠ OSI-open.** Use is permitted (not a competing product), but if strict-OSI matters: **`twox-hash` 2.1.3 (216M dl, XXH3, MIT/Apache)** is the drop-in swap |
| notify | FTS5 index watcher (G7) | `notify-rs/notify` 3,429⭐, pushed 2026-08-07 | ✅ |
| modelcontextprotocol/rust-sdk | MCP server (P6.7) | 3,775⭐, pushed 2026-08-09, license NOASSERTION (official, permissive) | ✅ pin releases |
| rusqlite (+SQLCipher build) | vault / audit / memory | workspace dep | ✅ |
| tantivy 0.26.1 | optional full-text (UltraSearch path, doc 49) | crates.io 16.4M dl | ✅ available; spec keeps SQLite FTS5 default |
| **LadybugDB `lbug` 0.19.1** | graph backend (C6) | crates.io: updated 2026-08-04, 260K dl | ✅ (see §1.1 risk) |

### 1.3 Deliberately NOT adopted
Kuzu (archived) · Neo4j (server) · Qdrant (server) · hosted Klavis/Strata (doc 33 flag — cloud) · Porcupine (proprietary, BYO-only, doc 50) · Piper (archived, doc 50 — sherpa-onnx hosts its voices).

## §2 Tool-catalog verification — `focus_window` (ARCH/08 §8.2)

- The 34-tool bucket math (17 core + `enhanced_snapshot` + bookmarks×6 + tab-groups×5 + **window×5**) requires **5** window tools; ARCH/08's enumeration listed 4 (`list_windows · create_window · close_window · activate_window`).
- 2026-08-09: `focus_window` added as the pattern-consistent 5th (list → create → close → activate → focus), completing the documented count.
- **External naming check (3 independent attempts, 2026-08-09):** browser-use uses `switch_tab` (tabs, not windows); official Chrome DevTools MCP has **no** window tools; Playwright MCP uses `browser_*` verbs; BrowserOS's 17-tool Rust set has only `windows`. **No canonical cross-ecosystem "focus window" tool name exists.**
- **Conclusion:** `focus_window` is our completion of a documented bucket — rename-safe (referenced only in ARCH/08's enumeration, ARCH/02 is unaffected) if a standard emerges. Flagged transparently; not load-bearing beyond the enumeration.

## §3 Audit actions applied
1. **Ledger (doc 27):** kuzu row flagged ⚠️ archived; LadybugDB added (section 23, ⭐1,557, 🟦) → **218 → 219 repos**.
2. **ARCH/08 §8.2:** enumeration completed with `focus_window` (see §2).
3. **ARCH/02 §2.2 storage row:** xxhash-rust BSL-1.0 note → `twox-hash` swap.
4. No code changes — docs only; the crate stubs are unchanged.
