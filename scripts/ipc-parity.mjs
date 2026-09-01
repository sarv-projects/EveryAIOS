#!/usr/bin/env node
// P50.3.1 — IPC parity inventory (checked, not hand-maintained).
//
// Cross-references, on every run:
//   1. every command registered in src-tauri/src/commands.rs `generate_handler!`
//   2. every `invoke("<name>")` call site in ui/src + packages/coordinator/src
//   3. every `#[tauri::command] pub fn` definition in src-tauri/src/*.rs
//   4. every `listen("<event>")` in the UI vs `emit("<event>")` in the shell
//
// Reports:
//   - BROKEN  — the UI invokes a command that is not registered (runtime "command not found" error)
//   - GHOST   — a registered command with no UI caller (drive from coordinator/Rust only — verify)
//   - EVENT gaps — UI listens for an event nothing emits, or vice versa
//
// Usage: node scripts/ipc-parity.mjs [--md]   (exit 1 on any BROKEN entry)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const uiDirs = ["ui/src", "packages/coordinator/src"];
const shellDir = "src-tauri/src";

function walk(dir, out = []) {
  for (const ent of readdirSync(join(root, dir))) {
    const p = join(dir, ent);
    if (statSync(join(root, p)).isDirectory()) {
      walk(p, out);
    } else if (/\.(ts|tsx|rs|mjs)$/.test(ent) && !/\.(test|spec)\./.test(ent)) {
      out.push(p);
    }
  }
  return out;
}

const read = (p) => readFileSync(join(root, p), "utf8");

// 1 — registered commands (the single generate_handler! list in commands.rs.

const commandsRs = read("src-tauri/src/commands.rs");
const registered = new Set();
for (const m of commandsRs.matchAll(/generate_handler!\[([\s\S]*?)\]/g)) {
  for (const line of m[1].split("\n")) {
    const seg = line.trim().replace(/,$/, "");
    if (!seg || seg.startsWith("//")) continue;
    const name = seg.split("::").pop();
    if (name) registered.add(name);
  }
}

// 2 — UI invoke call sites: `invoke("name")` incl. generic `invoke<T>("name")`.
// Scans the whole file (not line-by-line) so a multi-line `invoke<{…}>(<newline> "name")`
// — generic type on the invoke line, quote on the next — is still caught.

const uiFiles = uiDirs.flatMap((d) => walk(d));
const invocations = new Map(); // name -> [{file, line}]
for (const f of uiFiles) {
  const src = read(f);
  const re = /invoke(?:<[^>(]*>)?\(\s*["']([a-z0-9_]+)["']/gi;
  for (const m of src.matchAll(re)) {
    const name = m[1];
    const line = src.slice(0, m.index).split("\n").length; // 1-based
    if (!invocations.has(name)) invocations.set(name, []);
    invocations.get(name).push({ file: f, line });
  }
}// 3 — defined #[tauri::command] fns (name -> file) — detects drift between a
// definition its registration (the registration_sync test guards the other
// direction: defined-but-unregistered would break the shell test).
const defined = new Map();
for (const f of walk(shellDir)) {
  if (!f.endsWith(".rs")) continue;
  const src = read(f);
  for (const m of src.matchAll(/#\[tauri::command\]\s*(?:pub(?:\s*\(.*?\s)?\s+)?(?:async\s+)?fn\s+([a-z0-9_]+)/g)) {
    defined.set(m[1], f);
  }
}

// 4 — events: UI `listen("x")` vs shell `emit("x")`. Both literal strings and
// `pub const X: &str = "x"` references are resolved (the shell emits `chat-event`
// through `handle.emit(CHAT_EVENT, …)` where `pub const CHAT_EVENT: &str = "chat-event"`).
const shellSrc = walk(shellDir)
  .filter((f) => f.endsWith(".rs"))
  .map(read)
  .join("\n");

// `pub const NAME: &str = "value"` → name ↦ value.
 const consts = new Map();
for (const m of shellSrc.matchAll(/pub\s+const\s+([A-Z0-9_]+)\s*:\s*&str\s*=\s*"([^"]+)"/g)) consts.set(m[1], m[2]);

// UI listens with literal strings (renderer side never uses a const ref).
const listened = new Set();
for (const f of uiFiles) {
  for (const m of read(f).matchAll(/listen(?:<[^>(]*>)?\(\s*["']([a-z0-9_.-]+)["']/g)) listened.add(m[1]);
}
// Shell emits with literal strings OR a const ref (e.g. `emit(CHAT_EVENT,…)`).
const emitted = new Set();
for (const m of shellSrc.matchAll(/\.emit(?:_all)?\(\s*([A-Z0-9_]+)\s*[,)]/g)) emitted.add(consts.get(m[1]) ?? m[1]);
for (const m of shellSrc.matchAll(/\.emit(?:_all)?\(\s*"([a-z0-9_.-]+)"\s*[,)]/g)) emitted.add(m[1]);
const broken = [...invocations.keys()].filter((n) => !registered.has(n));
const ghosts = [...registered].filter((n) => !invocations.has(n));
const unregisteredDefs = [...defined.keys()].filter((n) => !registered.has(n));
const deadEvents = [...listened].filter((e) => !emitted.has(e) && !emitted.has(e.replace(/-/g, "_")));
const unusedEvents = [...emitted].filter((e) => !listened.has(e) && !listened.has(e.replace(/_/g, "-")));

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    registered: registered.size,
    defined: defined.size,
    uiInvocations: invocations.size,
    broken: broken.length,
    ghosts: ghosts.length,
  },
  broken,
  ghosts,
  unregisteredDefinitions: unregisteredDefs,
  events: {
    uiListens: [...listened].sort(),
    shellEmits: [...emitted].sort(),
    deadEvents,
    unusedEvents,
  },
  invocations: Object.fromEntries([...invocations.entries()].sort(([a], [b]) => a.localeCompare(b))),
};

const md = process.argv.includes("--md");
if (md) {
  console.log(`# IPC Parity Inventory (P50.3.1)

> Generated by \`node scripts/ipc-parity.mjs --md\` — ${report.generatedAt}. Do not edit by hand.

Registered commands: **${report.counts.registered}** · UI-invoked: **${report.counts.uiInvocations}** · Broken: **${broken.length}** · Ghost (no UI caller): **${ghosts.length}**
`);
  if (broken.length) {
    console.log(`## BROKEN — invoked but not registered\n`);
    for (const b of broken) console.log(`- \`${b}\``);
  }
console.log(`\n## Ghost commands --- registered never invoked from ui/ or coordinator/\n`);
console.log(ghosts.map((g) => "- " + g).join("\n"));
console.log(`\n## Events\n`);
console.log(`- UI listens: ${[...listened].sort().join(", ") || "---"}`);
  console.log(`- Shell emits: ${[...emitted].sort().join(", ") || "—"}`);
  if (deadEvents.length) console.log(`- DEAD (listened, never emitted): ${deadEvents.join(", ")}`);
} else {
  console.log(JSON.stringify(report, null, 2));
}

let failed = false;
if (broken.length) {
  console.error(`\nIPC PARITY FAIL: ${broken.length} UI invoke(s) target unregistered commands: ${broken.join(", ")}`);
  failed = true;
}
if (unregisteredDefs.length) {
  console.error(`IPC PARITY FAIL: ${unregisteredDefs.length} #[tauri::command] fns notin generate_handler: ${unregisteredDefs.join(", ")}`);
  failed = true;
}
if (deadEvents.length) {
  console.error(`IPC PARITY WARN: UI listens on events nothing emits: ${deadEvents.join(", ")}`);
}
process.exit(failed ? 1 : 0);