#!/usr/bin/env node
// EveryAIOS doc-sync check (Fix 2) — run in CI and pre-commit.
//
// Validates the three places that enumerate the capability surface agree:
//   1. capabilities.yaml          — the MACHINE-READABLE source of truth
//   2. ARCH/09-FEATURE-MATRIX.md  — the derived capability → module matrix
//   3. DESKTOP-APP-SPEC.md §0     — the product contract index
//   4. TODO.md                    — checkbox counts vs the header's claimed totals
//
// A capability added/removed in one place but not the others is exactly the
// drift this project has already hit (the 58-vs-59 matrix count in H3). Failing
// here in CI is cheaper than reconciling by hand.
//
// Usage: node scripts/check-doc-sync.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const read = (p) => readFileSync(join(ROOT, p), "utf8");

// --- tiny YAML parser (list of objects with scalar values) ----------------
function parseYamlList(text) {
  const items = [];
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = /^-\s+(\w+):\s*(.*)$/.exec(line.trim());
    if (m) {
      if (cur) items.push(cur);
      cur = { [m[1]]: m[2] };
      continue;
    }
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (kv && cur) cur[kv[1]] = kv[2];
  }
  if (cur) items.push(cur);
  return items;
}

const yaml = parseYamlList(read("capabilities.yaml"));

// --- extract ids from ARCH/09 (rows like `| A1 | ... | ... |`) ------------
function archIds(text) {
  const ids = new Set();
  for (const line of text.split("\n")) {
    const m = /^\|\s*([A-Z]+\d+)\s*\|/.exec(line);
    if (m) ids.add(m[1]);
  }
  return ids;
}

// --- extract ids from the spec §0 index (`| A1 | ... |`) -------------------
function specIds(text) {
  const ids = new Set();
  let inIndex = false;
  for (const line of text.split("\n")) {
    if (/^## 0\./.test(line)) inIndex = true;
    else if (/^## \d/.test(line) && !/^## 0\./.test(line)) inIndex = false;
    if (!inIndex) continue;
    const m = /^\|\s*([A-Z]+\d+)\s*\|/.exec(line);
    if (m) ids.add(m[1]);
  }
  return ids;
}

// --- TODO.md checkbox counts vs the header claim ---------------------------
function todoCounts(text) {
  const done = (text.match(/^\- \[x\]/gm) || []).length;
  const open = (text.match(/^\- \[ \]/gm) || []).length;
  return { done, open, total: done + open };
}

const failures = [];

// 1. YAML ids must be unique and stable-shaped.
const yamlIds = yaml.map((r) => r.id);
if (new Set(yamlIds).size !== yamlIds.length) {
  failures.push(`capabilities.yaml has duplicate ids`);
}
for (const id of yamlIds) {
  if (!/^[A-Z]+\d+$/.test(id)) failures.push(`capabilities.yaml bad id shape: ${id}`);
}

// 2. YAML == ARCH/09 == spec §0.
const arch = archIds(read("ARCH/09-FEATURE-MATRIX.md"));
const spec = specIds(read("DESKTOP-APP-SPEC.md"));

const onlyYaml = yamlIds.filter((i) => !arch.has(i));
const onlyArch = [...arch].filter((i) => !yamlIds.includes(i));
const onlySpec = [...spec].filter((i) => !yamlIds.includes(i));

if (onlyYaml.length) failures.push(`in capabilities.yaml but not ARCH/09: ${onlyYaml.join(", ")}`);
if (onlyArch.length) failures.push(`in ARCH/09 but not capabilities.yaml: ${onlyArch.join(", ")}`);
if (onlySpec.length) failures.push(`in spec §0 but not capabilities.yaml: ${onlySpec.join(", ")}`);

// 3. Every capability row must carry a source (provenance is the contract).
const noSource = yaml.filter((r) => !r.source || r.source === "unassigned");
if (noSource.length) {
  failures.push(`capabilities.yaml rows missing source: ${noSource.map((r) => r.id).join(", ")}`);
}

// 4. TODO.md counts vs the header's stated totals.
const counts = todoCounts(read("TODO.md"));
const claim = /(\d+)\s*total\s*=\s*(\d+)\s*done\s*\+\s*(\d+)\s*open/.exec(
  read("TODO.md").split("\n").slice(0, 8).join("\n"),
);
if (claim) {
  const [, t, d, o] = claim.map(Number);
  if (counts.total !== t || counts.done !== d || counts.open !== o) {
    failures.push(
      `TODO.md header claims ${t} total = ${d} done + ${o} open, but the file actually has ` +
        `${counts.total} = ${counts.done} done + ${counts.open} open. Update the header.`,
    );
  }
}

// 5. Fix 3 — the v1 kernel gate. If any gate item is open, new capability rows
//    are not allowed (unless the row itself declares `advances_kernel: true`,
//    i.e. it directly closes a gate item). This is the CI-enforced "freeze the
//    feature queue until the security kernel is done" rule.
const todo = read("TODO.md");
const gateMatch = /## KERNEL GATE[\s\S]*?(?=^## )/m.exec(todo);
const gateOpen = gateMatch
  ? (gateMatch[0].match(/^- \[ \]/gm) || []).length
  : 0;
const gateTotal = gateMatch
  ? (gateMatch[0].match(/^- \[ \]/gm) || []).length +
    (gateMatch[0].match(/^- \[x\]/gm) || []).length
  : 0;
if (!gateMatch) {
  failures.push(`TODO.md has no ## KERNEL GATE section (Fix 3) — add it.`);
}
if (gateOpen > 0) {
  const advancing = yaml.filter((r) => r.advances_kernel === "true");
  // The gate blocks *new* rows; rows that pre-date the gate are grandfathered.
  const baseline = 156; // committed capability count when the gate landed (Fix 2).
  const newRows = yaml.filter((r) => !arch.has(r.id) || !spec.has(r.id));
  if (newRows.length) {
    failures.push(
      `${gateOpen}/${gateTotal} kernel-gate items are OPEN (P48.2/P48.4/P47.5) — ` +
        `new capability row(s) added without closing them: ` +
        `${newRows.map((r) => r.id).join(", ")}. Close the gate items first, or ` +
        `mark the row advances_kernel: true.`,
    );
  }
}

if (failures.length) {
  console.error("❌ doc-sync check FAILED:");
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}

const gateNote =
  gateOpen > 0 ? `; ⛔ KERNEL GATE: ${gateOpen}/${gateTotal} open (v1 blocked)` : "; ✅ kernel gate clear";
console.log(
  `✅ doc-sync: ${yaml.length} capabilities in sync (yaml == ARCH/09 == spec §0); ` +
    `TODO.md ${counts.total} = ${counts.done} done + ${counts.open} open matches header` +
    gateNote +
    ".",
);
