#!/usr/bin/env node
// EveryAIOS architecture-invariant gate (P69.E).
//
// The repo has already paid for these regressions once (P69.C/P69.D). Each
// check below asserts a CORE invariant structurally, so a future edit cannot
// quietly re-introduce a second authority, a second schema, or a credential
// path outside the Rust vault. Cheap (no build), so it runs on every PR.
//
// Invariants enforced here:
//   CRED-1  no TypeScript module seals/unseals provider keys
//   CRED-2  no TS package takes a dependency on the crypto pack for custody
//   CRED-3  no TS module reads a provider secret out of `process.env`
//   AUTH-1  one auth-mode wire vocabulary (no `local_cli` / `*_cli` spellings)
//   AUTH-2  `AuthMode` is declared exactly once — in `everyaios-types`
//   AUTH-3  the UI derives its auth type from the canonical union (no rewrite)
//   SCHEMA-1 the canonical schema objects exist in `everyaios-types`
//   DECIDE-1 permission classification is not exported from `core-tools`
//   DECIDE-2 the ACP permission path never hardcodes `Approval::allow()`
//   LAYER-1 `core-engine` is policies/helpers only — no transport, no egress
//   LAYER-2 `everyaios-eval` stays outside the runtime (no production dep)
//   TS-DUP   TypeScript never re-declares a canonical record/id (P69.D15/D25)
//   RUST-DUP Rust declares each canonical primitive once (P69.B2)
//   LAYER-3  the TS search cascade is not wired into the turn loop (P69.D9)
//   LAYER-4  the coordinator orchestrates only — no privileged IO (P69.D22)
//   PURITY-1 `everyaios-ipc` is transport only (D26)
//   PURITY-3 `everyaios-catalog` is metadata only — no vault/guard (D28)
//   PURITY-4 CDP is a backend under BrowserService, not a kernel dependency (D31)
//
// Usage: node scripts/check-arch-invariants.mjs

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "target",
  ".git",
  ".venv",
  ".code-intelligence",
  "build",
]);

/** Recursively collect files under `dir` whose extension is in `exts`. */
function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split("\\").join("/");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const failures = [];
const fail = (id, file, detail) => failures.push({ id, file, detail });

/** For Rust files: everything before the in-file test module. */
function productionPart(src) {
  const idx = src.indexOf("#[cfg(test)]");
  return idx === -1 ? src : src.slice(0, idx);
}

/**
 * Fail when `pattern` matches `src` outside of a line comment.
 * Keeps prose ("no `getApiKey`") from tripping identifier checks.
 */
function matchesInCode(src, pattern) {
  const hits = [];
  for (const [i, line] of src.split("\n").entries()) {
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "");
    if (pattern.test(code)) hits.push({ line: i + 1, text: line.trim() });
  }
  return hits;
}

// --- CRED-1 / CRED-2: TS credential custody -------------------------------
const TS = new Set([".ts", ".tsx"]);
const PACKAGE_DIRS = join(ROOT, "packages");

for (const file of walk(PACKAGE_DIRS, TS)) {
  if (file.includes(`${join("packages", "")}core-tools`) && file.includes("node_modules")) continue;
  const src = readFileSync(file, "utf8");
  for (const [id, pattern] of [
    ["CRED-1", /\b(?:seal|unseal)ApiKey\s*\(/],
    ["CRED-1", /\bencryptSecret\s*\(\s*(?:apiKey|plaintextKey)/],
    ["CRED-1", /\bgetApiKey\s*\(/],
  ]) {
    const hits = matchesInCode(src, pattern);
    if (hits.length) fail(id, rel(file), `${pattern} at line ${hits[0].line}: ${hits[0].text}`);
  }
}

for (const file of walk(PACKAGE_DIRS, new Set([".json"]))) {
  const name = rel(file);
  if (!name.endsWith("package.json")) continue;
  if (name.startsWith("packages/core-security/")) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (name.startsWith("packages/core-providers/") && deps["@everyaios/core-security"]) {
    fail(
      "CRED-2",
      name,
      "core-providers must not depend on core-security: custody belongs to the Rust vault (P69.C4/D4)",
    );
  }
}

// --- CRED-3: no secret read from the environment --------------------------
const SECRET_ENV = /process\.env(?:\.|\[['"]?)([A-Z0-9_]*(?:API_?KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)/i;
for (const root of ["packages", "ui/src"]) {
  for (const file of walk(join(ROOT, root), TS)) {
    const name = rel(file);
    if (name.includes("__tests__")) continue;
    const src = readFileSync(file, "utf8");
    for (const hit of matchesInCode(src, SECRET_ENV)) {
      fail(
        "CRED-3",
        name,
        `secret read from the environment at line ${hit.line}: ${hit.text} — resolve it from everyaios-vault through the host instead`,
      );
    }
  }
}

// --- AUTH-1 / AUTH-2: one auth vocabulary ---------------------------------
const SOURCE_EXTS = new Set([".ts", ".tsx", ".rs", ".mjs", ".js", ".json", ".yaml", ".yml"]);
const SCAN_ROOTS = ["crates", "packages", "src-tauri", "ui/src", "scripts"];

for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root), SOURCE_EXTS)) {
    const src = readFileSync(file, "utf8");
    if (file.endsWith("check-arch-invariants.mjs")) continue;
    // `local_cli` remains a legitimate *readiness* state (DESKTOP-APP-SPEC.md
    // §Settings), so only flag it where the line also speaks about auth — the
    // shape a hand-maintained auth union takes (`authMode: 'local_cli'`).
    for (const hit of matchesInCode(src, /local_cli/) ) {
      if (!/auth/i.test(hit.text)) continue;
      fail("AUTH-1", rel(file), `non-canonical auth spelling at line ${hit.line}: ${hit.text}`);
    }
  }
}

{
  const authModeDecls = [];
  for (const file of walk(join(ROOT, "crates"), new Set([".rs"]))) {
    const src = productionPart(readFileSync(file, "utf8"));
    if (/\benum\s+AuthMode\b/.test(src)) authModeDecls.push(rel(file));
  }
  const expected = "crates/everyaios-types/src/lib.rs";
  if (authModeDecls.length !== 1 || authModeDecls[0] !== expected) {
    fail(
      "AUTH-2",
      expected,
      `AuthMode must be declared once in ${expected}; found: ${authModeDecls.join(", ") || "none"}`,
    );
  }
}

// --- AUTH-3: the UI derives its auth type --------------------------------
{
  const acpPath = "ui/src/lib/acp.ts";
  const settingsPath = "ui/src/lib/settings.ts";
  if (!/export type AuthMode\b/.test(read(acpPath))) {
    fail("AUTH-3", acpPath, "the canonical UI AuthMode union must be declared here (P69.C11)");
  }
  const settingsSrc = read(settingsPath);
  if (!/AgentAuthMode\s*=\s*AuthMode\b/.test(settingsSrc)) {
    fail("AUTH-3", settingsPath, "AgentAuthMode must alias the canonical union, not re-declare it");
  }
  for (const file of walk(join(ROOT, "ui", "src"), TS)) {
    const name = rel(file);
    if (name === acpPath) continue;
    const src = readFileSync(file, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (/'subscription'/.test(line) && /'api_key'/.test(line) && /\|/.test(line)) {
        fail(
          "AUTH-3",
          name,
          `hand-maintained auth union at line ${i + 1} (derive it from AuthMode instead): ${line.trim()}`,
        );
      }
    }
  }
}

// --- SCHEMA-1: canonical schema objects -----------------------------------
{
  const typesPath = "crates/everyaios-types/src/lib.rs";
  const src = read(typesPath);
  const required = [
    "CANONICAL_SCHEMA_VERSION",
    "pub enum AuthMode",
    "pub struct AgentDefinition",
    "pub struct AgentBinding",
    "pub struct EffectRequest",
    "pub struct ContextSnapshot",
    "pub struct ContextPassport",
    "pub struct EventEnvelope",
  ];
  for (const symbol of required) {
    if (!src.includes(symbol)) {
      fail("SCHEMA-1", typesPath, `canonical schema symbol missing: ${symbol} (P69.D25)`);
    }
  }
}

// --- DECIDE-1: one authorization decider ----------------------------------
{
  const toolsSrc = join(ROOT, "packages", "core-tools", "src");
  for (const file of walk(toolsSrc, TS)) {
    const src = readFileSync(file, "utf8");
    for (const [name, pattern] of [
      ["evaluatePermissionGate", /\bevaluatePermissionGate\b/],
      ["TrustLadder", /\bTrustLadder\b/],
      ["maxRiskForScore", /\bmaxRiskForScore\b/],
    ]) {
      const hits = matchesInCode(src, pattern);
      if (hits.length) {
        fail(
          "DECIDE-1",
          rel(file),
          `${name} must live in @everyaios/core-engine/src/policy (advisory), not core-tools; line ${hits[0].line}`,
        );
      }
    }
  }
}

// --- DECIDE-2: ACP permission path never hardcodes an allow ---------------
{
  const acpSrc = join(ROOT, "crates", "everyaios-acp", "src");
  for (const file of walk(acpSrc, new Set([".rs"]))) {
    const src = productionPart(readFileSync(file, "utf8"));
    for (const pattern of [/Approval::allow\s*\(/, /Approval::Allow\b/]) {
      const hits = matchesInCode(src, pattern);
      if (hits.length) {
        fail(
          "DECIDE-2",
          rel(file),
          `ACP permission must be decided by the host gate, never hardcoded; line ${hits[0].line}: ${hits[0].text}`,
        );
      }
    }
  }
}

// --- LAYER-1: no second turn runtime in the TS workspace ------------------
// P71.2c (ADR-0005 §2) — the built-in engine is deferred to post-v1, so the
// strongest form of P69.D8's invariant is now the literal one: `packages/core-engine`
// must **not exist**. It held the ConversationEngine, its stages and the
// advisory policy classifiers; the engine and the coordinator loop moved to
// `ARCH/archive/core-engine/` and `ARCH/archive/coordinator-loop/`, which are
// outside the workspace and outside every tsconfig/build. A resurrected copy in
// `packages/` (or a package that re-declares the engine class) is exactly the
// competing-runtime regression this guards.
{
  const engineSrc = join(ROOT, "packages", "core-engine", "src");
  if (existsSync(engineSrc)) {
    fail(
      "LAYER-1",
      "packages/core-engine/src",
      "the built-in engine package is back in the workspace — it is deferred to post-v1 (ADR-0005 §2, P71.2c) and lives in ARCH/archive/core-engine/",
    );
  }
  const engineClass = /\bclass\s+ConversationEngine\b/;
  const loopEntry = /\brunChatStream\b\s*\(/;
  for (const root of ["packages", "ui/src", "src-tauri/src"]) {
    for (const file of walk(join(ROOT, root), TS)) {
      const src = readFileSync(file, "utf8");
      for (const [name, pattern] of [
        ["ConversationEngine", engineClass],
        ["runChatStream", loopEntry],
      ]) {
        const hits = matchesInCode(src, pattern);
        if (hits.length) {
          fail(
            "LAYER-1",
            rel(file),
            `${name} re-declared outside ARCH/archive at line ${hits[0].line} — everyaios has no turn loop (ADR-0005 §2)`,
          );
        }
      }
    }
  }
}

// --- LAYER-2: evaluation stays outside the runtime ------------------------
// P69.D32 — `everyaios-eval` is a harness, not a runtime dependency. Kernel
// crates verify through the contract (`everyaios_blueprint::verify`); only the
// shell may link the harness itself, for its eval/debug surface.
{
  const offenders = [];
  for (const file of walk(join(ROOT, "crates"), new Set([".toml"]))) {
    const name = rel(file);
    if (name === "crates/everyaios-eval/Cargo.toml") continue;
    if (!/everyaios-eval\s*=/.test(readFileSync(file, "utf8"))) continue;
    offenders.push(name);
  }
  if (offenders.length) {
    fail(
      "LAYER-2",
      offenders[0],
      `production crates must not depend on the eval harness (P69.D32): ${offenders.join(", ")}`,
    );
  }
}

// --- PURITY: crate ownership boundaries -----------------------------------
/** Read a crate manifest's `[dependencies]` section only (dev-deps allowed). */
function productionDeps(crateName) {
  const src = read(`crates/${crateName}/Cargo.toml`);
  const lines = src.split("\n");
  const start = lines.findIndex((l) => l.trim() === "[dependencies]");
  if (start === -1) return [];
  const deps = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\[/.test(line.trim())) break;
    const m = /^([A-Za-z0-9_-]+)\s*=/.exec(line.trim());
    if (m) deps.push(m[1]);
  }
  return deps;
}

{
  // D26 — serialization, framing, streaming, lifecycle; no business logic.
  const ipcDeps = productionDeps("everyaios-ipc").filter((d) => d.startsWith("everyaios-"));
  if (ipcDeps.length) {
    fail("PURITY-1", "crates/everyaios-ipc/Cargo.toml", `transport crate must not depend on ${ipcDeps.join(", ")}`);
  }

  // D27 (PURITY-2) retired 2026-09-23 with the `everyaios-engine` deletion (P72):
  // the pure policy crate had zero dependents, so there is no purity left to gate.

  // D28 — provider/model metadata only; credentials and custody are elsewhere.
  const catalogDeps = productionDeps("everyaios-catalog");
  for (const banned of ["everyaios-vault", "everyaios-guard"]) {
    if (catalogDeps.includes(banned)) {
      fail("PURITY-3", "crates/everyaios-catalog/Cargo.toml", `catalog is metadata — ${banned} must not be a dependency`);
    }
  }

  // D31 — CDP is a backend under BrowserService.
  for (const crate of ["everyaios-core", "everyaios-acp", "everyaios-office", "everyaios-desktop", "everyaios-script", "everyaios-codeintel", "everyaios-memory", "everyaios-storage", "everyaios-mcp", "everyaios-catalog", "everyaios-blueprint", "everyaios-browser", "everyaios-search", "everyaios-agents"]) {
    const deps = productionDeps(crate);
    if (crate === "everyaios-browser") continue;
    if (deps.includes("everyaios-cdp")) {
      fail(
        "PURITY-4",
        `crates/${crate}/Cargo.toml`,
        "cdp is a backend under BrowserService (everyaios-browser); kernel crates must not depend on it",
      );
    }
  }
}

// --- LAYER-3: one search implementation (the kernel's) --------------------
// P69.D9 — `everyaios-search` (Rust) owns search; the TypeScript package is a
// projection/facade. Re-wiring the TS cascade into the turn loop would be a
// second implementation again, which is exactly what D9 removes.
{
  const cascadeSymbols = [
    'buildDefaultCascade',
    'WebSearchCascade',
    'runResearch',
    'buildCascadeProviders',
    'fetchAndRerankSearchResults',
  ];
  for (const root of ["packages/coordinator/src"]) {
    for (const file of walk(join(ROOT, root), TS)) {
      const src = readFileSync(file, "utf8");
      for (const symbol of cascadeSymbols) {
        const hits = matchesInCode(src, new RegExp(`\\b${symbol}\\b`));
        if (hits.length) {
          fail(
            "LAYER-3",
            rel(file),
            `${symbol} wired into the turn loop at line ${hits[0].line} — search is kernel-owned (P69.D9)`,
          );
        }
      }
    }
  }
}

// --- LAYER-4: the coordinator owns orchestration only (P69.D22) -----------
// The turn loop loads state, builds context, selects a route, projects tools,
// delegates, observes, verifies, recovers and finishes — through the host
// channel. Filesystem/shell/browser execution, credentials, authorization,
// sandbox enforcement and durable persistence all belong to the Rust core,
// which is why the coordinator's production files must not import an IO
// builtin or call an fs/process function at all. A coordinator that can write
// a file or spawn a process is a second execution path around Guard.
{
  const bannedImports =
    /from\s+["']node:(?:fs|fs\/promises|child_process|net|http|https|dgram|tls|worker_threads)["']/;
  const bannedCalls =
    /(?<![.\w])(?:writeFile|writeFileSync|readFile|readFileSync|appendFile|createWriteStream|mkdir|mkdirSync|unlink|unlinkSync|rm|rmSync|spawn|spawnSync|execSync|execFileSync|exec|execFile|fork)\s*\(/;
  for (const file of walk(join(ROOT, "packages/coordinator/src"), TS)) {
    if (file.endsWith(".test.ts")) continue;
    const src = readFileSync(file, "utf8");
    const imports = matchesInCode(src, bannedImports);
    if (imports.length) {
      fail(
        "LAYER-4",
        rel(file),
        `privileged IO import at line ${imports[0].line}: ${imports[0].text} — the coordinator orchestrates through the host channel (P69.D22)`,
      );
      continue;
    }
    const calls = matchesInCode(src, bannedCalls);
    if (calls.length) {
      fail(
        "LAYER-4",
        rel(file),
        `privileged IO call at line ${calls[0].line}: ${calls[0].text} — effects belong to the Rust core`,
      );
    }
  }
}

// --- TS-DUP: TypeScript never re-declares the canonical schema -------------
// P69.D15/D25 — `everyaios-types` (Rust) owns the canonical records and id
// newtypes; a TS file may *project* them (a projection is named for its job —
// `AgentDirectoryEntry`, `AgentProfile`, `AgentPersonaOverlay`) but must never
// declare a second `AgentDefinition` or a second `WorkId`. Three different
// `AgentDefinition`s used to exist in TS alongside the real one.
{
  const patterns = [
    [/(?:export\s+)?interface\s+AgentDefinition\b/, 'AgentDefinition (Rust owns the agent record — project it, e.g. AgentDirectoryEntry)'],
    [/(?:export\s+)?type\s+AgentDefinition\b/, 'AgentDefinition (Rust owns the agent record)'],
    [/(?:export\s+)?(?:interface|type)\s+(?:WorkId|SessionId|EventId|EffectId|StepId|TicketId|AgentBindingId)\b/, 'canonical id newtype (everyaios-types owns these)'],
  ];
  for (const root of ["packages", "ui/src"]) {
    for (const file of walk(join(ROOT, root), TS)) {
      const name = rel(file);
      if (name.includes("/dist/") || name.includes("node_modules")) continue;
      const src = readFileSync(file, "utf8");
      for (const [pattern, what] of patterns) {
        for (const hit of matchesInCode(src, pattern)) {
          fail("TS-DUP", name, `re-declares ${what} at line ${hit.line}: ${hit.text}`);
        }
      }
    }
  }
}

// --- RUST-DUP: one declaration per canonical primitive ---------------------
// The TS-DUP failure mode on the Rust side: `everyaios-blueprint`'s plugin
// manifest used to declare a second `AgentBinding` (a `bind: Vec<String>`
// manifest declaration) beside the canonical durable primitive. A local shape
// is fine — shadowing a canonical name is not; name it for its job.
{
  const canonical = {
    AgentBinding: "crates/everyaios-types/src/lib.rs",
  };
  for (const file of walk(join(ROOT, "crates"), new Set([".rs"]))) {
    const name = rel(file);
    const src = productionPart(readFileSync(file, "utf8"));
    for (const [symbol, owner] of Object.entries(canonical)) {
      const pattern = new RegExp(`\\b(?:pub\\s+)?(?:struct|enum)\\s+${symbol}\\b`);
      if (pattern.test(src) && name !== owner) {
        fail(
          "RUST-DUP",
          name,
          `declares a second ${symbol}; the canonical primitive lives in ${owner} — name the local shape for its job`,
        );
      }
    }
  }
}

// --- report ---------------------------------------------------------------
if (failures.length) {
  console.error(`architecture-invariant gate: ${failures.length} violation(s)\n`);
  for (const f of failures) console.error(`  [${f.id}] ${f.file}\n        ${f.detail}`);
  console.error(
    "\nThese invariants are the structural form of ARCH/CORE.md §2 (sidecar proposes,\n" +
      "Rust disposes) and §6 (keys live only in the vault). Fix the code, not the gate.",
  );
  process.exit(1);
}

console.log(
  "architecture-invariant gate: OK (CRED-1/2/3, AUTH-1/2/3, SCHEMA-1, DECIDE-1/2, LAYER-1/2/3/4, PURITY-1/3/4, TS-DUP, RUST-DUP)",
);
