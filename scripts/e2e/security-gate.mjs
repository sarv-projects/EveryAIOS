#!/usr/bin/env node
/**
 * P50.5.7 — Security release gate (crate suites + shell-integration proofs).
 *
 * The row demands authorization, compromise, floor, redaction, egress,
 * containment, nonce, and audit-integrity evidence "against the packaged
 * shell, not only crate/unit fixtures". The packaged shell needs a display
 * and installers (P50.5.8); this gate runs everything below that line:
 *
 *   S1 guard deny suites    — everyaios-guard: blocklist/deny, tickets
 *      (single-use/expiry/nonce), path floors, injection, egress, redteam.
 *   S2 adversarial boundary — everyaios-core p10_security (two-path
 *      anti-impersonation, renderer-compromise rejection).
 *   S3 audit integrity      — everyaios-audit: Merkle chain, retention,
 *      repair classification (started-unknown, never fabricated).
 *   S4 MCP containment      — everyaios-mcp: hijack validation + attach
 *      reconciliation (external tools cannot smuggle native names).
 *   S5 IPC parity           — scripts/ipc-parity.mjs: zero broken commands,
 *      zero unregistered definitions (no shadow command surface).
 *   S6 approval provenance  — static: `guard_respond` refuses any window
 *      whose label is not the dedicated guard window (main renderer cannot
 *      approve even though lib/guard.ts can invoke); the guard window
 *      surface (guard.html + guard-main.ts) exists and is dependency-free.
 *
 * Exit: 0 PASS / 1 FAIL / 2 SKIP (no cargo/node toolchain).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const CRATES = join(REPO_ROOT, "crates");

const failures = [];

function pass(label) {
  console.log(`  ok — ${label}`);
}
function fail(label) {
  console.error(`  FAIL — ${label}`);
  failures.push(label);
}
function have(cmd) {
  try {
    execFileSync(cmd, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

// Cargo is not on PATH in every shell (notably non-interactive WSL shells);
// resolve it like failure-injection.mjs does: explicit env, else the rustup
// default install location, else PATH.
const CARGO_BIN =
  process.env.EVERYAIOS_E2E_CARGO_BIN ??
  (existsSync(join(homedir(), ".cargo/bin/cargo")) ? join(homedir(), ".cargo/bin/cargo") : "cargo");

if (!have(CARGO_BIN)) {
  console.log("[P50.5.7] SKIP — no cargo toolchain");
  process.exit(2);
}

function cargo(args, label, cwd = CRATES) {
  try {
    const out = execFileSync(CARGO_BIN, args, {
      cwd,
      encoding: "utf8",
      timeout: 600_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const m = out.match(/test result: ok\. (\d+) passed/) ?? out.match(/(\d+) passed/);
    pass(`${label} (${m ? m[0] : "ok"})`);
  } catch (e) {
    const tail = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.split("\n").filter((l) => /FAILED|failed|error(\[|:)/i.test(l)).slice(0, 5).join(" | ");
    fail(`${label} (${tail.slice(0, 160) || e.message.slice(0, 120)})`);
  }
}

// ---- S1 guard suites -------------------------------------------------------
console.log("S1 — guard deny/permission/ticket/floor suites…");
cargo(["test", "-p", "everyaios-guard", "--quiet"], "everyaios-guard suites");

// ---- S2 adversarial boundary ----------------------------------------------
console.log("S2 — adversarial two-path boundary (p10_security)…");
cargo(["test", "-p", "everyaios-core", "--test", "p10_security", "--quiet"], "p10_security suite");

// ---- S3 audit integrity ----------------------------------------------------
console.log("S3 — audit Merkle/retention/repair suites…");
cargo(["test", "-p", "everyaios-audit", "--quiet"], "everyaios-audit suites");

// ---- S4 MCP containment ----------------------------------------------------
console.log("S4 — MCP hijack + attach suites…");
cargo(["test", "-p", "everyaios-mcp", "--quiet"], "everyaios-mcp suites");

// ---- S5 IPC parity ----------------------------------------------------------
console.log("S5 — IPC parity (no shadow command surface)…");
if (!have("node")) {
  fail("ipc-parity needs node");
} else {
  try {
    execFileSync("node", ["scripts/ipc-parity.mjs"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    pass("ipc-parity: 0 broken / 0 unregistered");
  } catch (e) {
    fail(`ipc-parity failed (${`${e.stdout ?? ""}`.slice(0, 120)})`);
  }
}

// ---- S6 approval provenance (static, shell-integration shaped) --------------
console.log("S6 — approval provenance (guard-window-only approve)…");
{
  const read = (p) => readFileSync(join(REPO_ROOT, p), "utf8");
  // (a) Rust refuses guard_respond from any non-guard window.
  const cmds = read("src-tauri/src/guard_cmds.rs");
  const labelRef = /GUARD_WINDOW_LABEL/.test(cmds);
  const refuses = /main renderer cannot approve|!= *GUARD_WINDOW_LABEL/.test(cmds);
  if (labelRef && refuses) pass("guard_respond is window-label gated in Rust");
  else fail("guard_respond window-label gate missing in guard_cmds.rs");

  // (b) the dedicated guard surface exists.
  const html = existsSync(join(REPO_ROOT, "ui/guard.html"));
  const main = existsSync(join(REPO_ROOT, "ui/src/guard-main.ts"));
  if (html && main) pass("guard.html + guard-main.ts surface exists");
  else fail("guard window surface missing (ui/guard.html, ui/src/guard-main.ts)");

  // (c) guard_respond call sites are exactly the guard window + the
  // main-renderer bridge (which Rust refuses — see (a)). Any third caller
  // is a new approval path and fails the gate.
  const allowed = new Set(["ui/src/guard-main.ts", "ui/src/lib/guard.ts"]);
  const bad = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        const src = readFileSync(p, "utf8");
        if (/(["'])guard_respond\1/.test(src)) {
          const rel = p.slice(REPO_ROOT.length + 1).replace(/\\/g, "/");
          if (!allowed.has(rel)) bad.push(rel);
        }
      }
    }
  };
  walk(join(REPO_ROOT, "ui/src"));
  if (bad.length === 0) pass("guard_respond callers: guard window + refused bridge only");
  else fail(`unexpected guard_respond callers: ${bad.join(", ")}`);

  // (d) the nonce rule: approvals bind ticket + card nonce (no bare approve).
  const ticketSrc = read("crates/everyaios-guard/src/ticket.rs");
  if (/approve_with_nonce/.test(ticketSrc) && /approval_nonce/.test(ticketSrc)) {
    pass("ticket approval is nonce-bound (no bare id-only approve path bypass)");
  } else fail("nonce-bound approval missing in ticket.rs");
}

if (failures.length > 0) {
  console.error(`[P50.5.7] FAIL — ${failures.length} gate(s) failed`);
  process.exit(1);
}
console.log("[P50.5.7] PASS — security release gate (suites + shell-integration proofs)");
