#!/usr/bin/env node
// P69.E11 — cross-document reference validator.
//
// This is the only mechanical signal that a heading or a claim has been
// silently removed. It earned its place during the 2026-09-20 final pass: a
// heading (`ARCH/EXTERNAL-AGENTS.md` §4) had been deleted while a reference to
// it survived in `ARCH/SECURITY.md`, and a citation pointed at spec
// §9.5/§9.10 (the spec's §9 has only 9.1–9.3). A reader cannot see either, and
// no other gate caught them.
//
// Three checks:
//   A. `<Doc>.md §<n>` — the document must exist AND define that section.
//   B. bare `§<n>`     — resolves against the document named nearest before it
//                        on the same line, else the file itself.
//   C. relative markdown links — the target file must exist.
//
// **Accepted exceptions are enumerated below, each with a reason.** The rule is
// never weakened to hide one: if a reference is wrong, the reference is fixed.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Accepted exceptions — each one named, with the reason it is not a defect.
 * Format: file → list of exact reference strings to ignore.
 */
const ACCEPTED = [
  {
    file: 'CURRENT_RUN.md',
    refs: '*',
    reason:
      "the historical ledger quotes dated agents' reports verbatim; rewriting their section pointers would falsify the record this row's own note calls out as the one accepted exception",
  },
  {
    file: 'TODO.md',
    refs: '*',
    reason:
      'the delivery ledger is a dated record; after the v0 corpus was archived (ARCHIVE/v0/), its historical citations name v0 documents (e.g. `ARCH/CORE.md §n`) and its links point at v0 paths (e.g. `ARCH/ADR/*`, `SUPPORT-MATRIX.md`); the ledger is not rewritten by policy, and live pointers are checked in the live docs',
  },
];

/** Docs that participate (the contracts + their subsystems + the process docs). */
function collectDocs() {
  const out = [];
  for (const name of readdirSync(ROOT)) {
    if (name.endsWith('.md')) out.push(name.replace(/\\/g, '/'));
  }
  for (const dir of ['ARCH', 'docs', 'docs/release', 'docs/packaging', 'RESEARCH']) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (name.endsWith('.md')) out.push(join(dir, name).replace(/\\/g, '/'));
    }
  }
  return out;
}

/**
 * The bare-reference rule (check B) applies to documents that cite *themselves*
 * by number — the ARCH contracts and the root architecture docs. The others are
 * cross-citing prose or archives, and applying the rule there produces
 * thousands of false positives:
 *
 * - `SPEC-CHANGELOG.md` is a historical archive; it cites sections of many
 *   documents in prose, and its entries are never rewritten by policy.
 * - `DESKTOP-APP-SPEC.md` cites the *archived* `ARCH/17` by number ("§17.1"),
 *   which is a deliberate pointer into `ARCH/archive/`, not a broken cite.
 *
 * They are still checked for named references and links (A/C), where the intent
 * is unambiguous.
 */
const B_EXEMPT = new Set([
  'SPEC-CHANGELOG.md',
  'DESKTOP-APP-SPEC.md',
  'CURRENT_RUN.md',
  'README.md',
  'THIRD-PARTY-NOTICES.md',
  // TODO.md's rows are a dated delivery record that quotes citation *shapes*
  // as examples ("a research-transfer row's `(README.md §4)` names a cloned
  // external repository's README") — prose about references, not references.
  // Check A (named `X.md §n`) still runs against it, where a cite is real.
  'TODO.md',
]);

/**
 * Relative-link exception for check C (same reason as B_EXEMPT): TODO.md is a
 * dated delivery record whose historical links point at v0 paths archived
 * under `ARCHIVE/v0/` (e.g. `ARCH/ADR/*`, `SUPPORT-MATRIX.md`); the ledger is
 * not rewritten by policy.
 */
const C_EXEMPT = new Set(['TODO.md']);

/**
 * Is a citation satisfied by a document?
 *
 * - the exact number is defined → yes;
 * - `top.more` where the document defines `top` but numbers **no** subsections
 *   under it → yes (the subsections are unnumbered prose, and a plausible
 *   pointer into them is not a defect);
 * - `top.more` where the document *does* number subsections under `top` → only
 *   an exact match counts. This is the rule that catches a citation such as
 *   `§9.5` in a document whose §9 defines 9.1–9.3.
 */
function satisfies(defs, num) {
  if (defs.has(num)) return true;
  const parts = num.split('.');
  if (parts.length === 1) return false;
  const parent = parts[0];
  if (!defs.has(parent)) return false;
  const numbersSubsections = [...defs].some((d) => d.startsWith(`${parent}.`));
  return !numbersSubsections;
}

/** Section numbers a document defines: `## 4.`, `### 4.2`, `#### 4.2.5a`… */
function sectionsOf(body) {
  const defined = new Set();
  for (const line of body.split('\n')) {
    const m = /^#{1,6}\s+§?(\d+(?:\.\d+)*[a-z]?)\b/.exec(line);
    if (m) defined.add(m[1]);
    // `## §11.1 Context Passport` and `## 11.1` both count.
  }
  // A numbered parent implies its sub-numbers are "declared" by presence only;
  // we validate the exact number, which is what a citation names.
  return defined;
}

const docs = collectDocs();
const bodyOf = new Map();
const sectionsOfDoc = new Map();
/**
 * Blank out fenced code blocks before searching: a fence is where this
 * repository *shows* a reference (an example, a JSON snippet, a sample link)
 * rather than making one. Inline code is deliberately NOT stripped — cites
 * like `ARCH/07 §7.5.1` are written in backticks throughout these docs.
 */
const stripFences = (body) =>
  body.replace(/^(?:```|~~~)[\s\S]*?^(?:```|~~~).*$/gm, (m) => m.replace(/[^\n]/g, ' '));
for (const p of docs) {
  const raw = readFileSync(join(ROOT, p), 'utf8');
  bodyOf.set(p, stripFences(raw));
  sectionsOfDoc.set(p, sectionsOf(raw));
}
const byBasename = new Map();
for (const p of docs) {
  const norm = p.replace(/\\/g, '/');
  const base = norm.split('/').pop();
  if (!byBasename.has(base)) byBasename.set(base, []);
  byBasename.get(base).push(norm);
}

const BASELINE_FILE = 'scripts/doc-ref-baseline.json';
const WRITE_BASELINE = process.argv.includes('--write-baseline');
const problems = [];
const acceptedHits = [];
const isAccepted = (file, ref) =>
  ACCEPTED.some((a) => a.file === file && (a.refs === '*' || a.refs.includes(ref)));

/**
 * The short names this repository actually uses when citing a document in
 * prose: `CORE §2`, `SPEC §9.5`, `ARCH/13 §3.2`. A bare `§n` is only a
 * self-reference when **none** of these (and no `X.md`) precedes it on the
 * line — otherwise the paragraph is talking about that other document.
 */
function resolveIdentifier(token) {
  const normToken = token.replace(/\\/g, '/');
  if (normToken.endsWith('.md')) {
    const base = normToken.split('/').pop();
    const found = byBasename.get(base) ?? [];
    return found.length ? found : null;
  }
  if (normToken === 'CORE') return byBasename.get('CORE.md') ?? null;
  if (normToken === 'SPEC') return byBasename.get('DESKTOP-APP-SPEC.md') ?? null;
  // ARCH/<n> — match by numeric prefix (ARCH/13 → ARCH/13-PROMPT-ANATOMY.md).
  const arch = /^ARCH\/(\d+)$/.exec(normToken);
  if (arch) {
    const hit = docs.filter((d) => new RegExp(`^ARCH/${arch[1]}(-|\\.md$)`).test(d.replace(/\\/g, '/')));
    return hit.length ? hit : null;
  }
  return null;
}

const TOKEN_RE = /([A-Za-z0-9_.-]+\/[\dA-Za-z_.-]*\d|CORE|SPEC|[A-Za-z0-9_-]+\.md)/g;

// ---------------------------------------------------------------- A + B
for (const [file, body] of bodyOf) {
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    // A. `<Doc>.md §<n>`
    for (const m of line.matchAll(/([A-Za-z0-9_./-]+\.md)\s*§\s*(\d+(?:\.\d+)*)(?![\w.-])/g)) {
      const named = m[1];
      const num = m[2];
      const ref = `${named} §${num}`;
      const candidates = byBasename.get(named.split('/').pop()) ?? [];
      if (candidates.length === 0) {
        if (isAccepted(file, ref)) acceptedHits.push({ file, ref, why: 'accepted' });
        else problems.push(`${file}:${i + 1} → ${ref}: no such document in the repo`);
        continue;
      }
      const ok = candidates.some((c) => satisfies(sectionsOfDoc.get(c) ?? new Set(), num));
      if (!ok) {
        if (isAccepted(file, ref)) acceptedHits.push({ file, ref, why: 'accepted' });
        else
          problems.push(
            `${file}:${i + 1} → ${ref}: ${candidates.join('/')} defines no section §${num}`,
          );
      }
    }

    // B. bare `§<n>` — the CURRENT document, unless the line names another
    //    document immediately before the §. Lines that mention several docs
    //    are left alone rather than guessed at: a wrong guess here produces
    //    false positives, and a false positive gets a rule deleted.
    if (B_EXEMPT.has(file)) return;
    const tokens = [...line.matchAll(TOKEN_RE)].map((x) => ({ name: x[1], at: x.index ?? 0 }));
    const selfDefs = sectionsOfDoc.get(file) ?? new Set();
    if (selfDefs.size === 0) return;
    for (const m of line.matchAll(/§\s*(\d+(?:\.\d+)*)(?![\w.-])/g)) {
      const at = m.index ?? 0;
      const prev = tokens.filter((n) => n.at < at).pop();
      // `X.md §n` pairs are check A's job (already validated there).
      if (prev && at - (prev.at + prev.name.length) <= 4 && prev.name.endsWith('.md')) continue;
      const num = m[1];
      // Only the UNAMBIGUOUS short names bind: `CORE §n`, `SPEC §n`,
      // `ARCH/nn §n`. A bare filename is deliberately not bound in a
      // non-adjacent position: these docs are dense citation surfaces where
      // `ARCH/03 + doc 19 §7` means doc 19's §7, `A == B == spec §0` means
      // spec's §0, and a research-transfer row's `(README.md §4)` names a
      // *cloned external repository's* README. Binding those produced 17 false
      // positives out of 20 — a rule that misfires that often is a rule that
      // gets deleted, so this one binds only what it can prove. Adjacent
      // `X.md §n` pairs are still check A's, where they are unambiguous.
      // …and it must be ADJACENT: `ARCH/03 §2` binds, `ARCH/03 + doc 19 §7`
      // does not (another number sits between them, so the § belongs to a
      // different citation).
      const between = prev ? line.slice(prev.at + prev.name.length, at) : '';
      const binds =
        prev &&
        (prev.name === 'CORE' || prev.name === 'SPEC' || /^ARCH\/\d+$/.test(prev.name)) &&
        /^[\s,:–—-]*$/.test(between);
      const resolved = binds ? resolveIdentifier(prev.name) : null;
      // SCOPE — only references bound to a document in THIS repository are
      // validated. The repository's other, dominant citation form is
      // `(doc 33 §5)`: a *research document number*, not a repo file. Research
      // docs are external source material (some never checked in), and a
      // paragraph may cite one several lines after naming it, so a bare `§n`
      // cannot be resolved mechanically without guessing — and a guessed rule
      // that misfires is a rule that gets deleted. What remains is precisely
      // the class this row exists for: `CORE §2`, `SPEC §9.5`,
      // `ARCH/04 §4.5`, `<Doc>.md §4` — a repo document that must define the
      // section it is cited for.
      if (!resolved) continue;
      const ok = resolved.some((t) => satisfies(sectionsOfDoc.get(t) ?? new Set(), num));
      if (!ok) {
        const ref = `§${num}`;
        if (isAccepted(file, ref)) acceptedHits.push({ file, ref, why: 'accepted' });
        else
          problems.push(
            `${file}:${i + 1} → ${prev?.name} §${num}: ${resolved.join('/')} defines no such section`,
          );
      }
    }
  });
}

// ---------------------------------------------------------------- C
for (const [file, body] of bodyOf) {
  if (C_EXEMPT.has(file)) continue;
  const dir = dirname(join(ROOT, file));
  for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const [pathPart] = href.split('#');
    if (!pathPart || pathPart.startsWith('#')) continue;
    const abs = resolve(dir, pathPart);
    if (!existsSync(abs)) {
      problems.push(`${file} → link target missing: ${href}`);
    } else if (/\.md$/.test(pathPart) && statSync(abs).isFile()) {
      // A link with an anchor must land on a heading whose text contains it.
      const anchor = href.includes('#') ? href.split('#')[1] : '';
      if (anchor) {
        const target = readFileSync(abs, 'utf8');
        const slug = (s) =>
          s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
        const slugs = target
          .split('\n')
          .filter((l) => l.startsWith('#'))
          .map((l) => slug(l.replace(/^#+\s*/, '')));
        if (!slugs.includes(anchor)) {
          problems.push(`${file} → link anchor not found: ${href}`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- baseline
//
// The rule is adopted in *recorded-backlog* mode, the same way a new linter is
// adopted without rewriting a repository in one commit: every finding that
// exists today is written to a baseline file with its text, and the gate fails
// only on a finding that is **not** in it. The backlog is a burn-down list, not
// a waiver — an entry that stops reproducing is reported so the list cannot
// quietly grow stale, and the count is printed on every run.
const baselinePath = join(ROOT, BASELINE_FILE);
let baseline = null;
if (existsSync(baselinePath)) {
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch (e) {
    console.error(`check-doc-refs: ${BASELINE_FILE} is not valid JSON: ${e.message}`);
    process.exit(1);
  }
}

if (WRITE_BASELINE) {
  const payload = {
    _note:
      'P69.E11 recorded backlog. Each entry is a section reference that does not resolve against ' +
      'the document it cites. The gate fails on any finding NOT listed here, so this list can only ' +
      'shrink by fixing the reference. Do not hand-edit: re-run with --write-baseline after fixing.',
    generated: new Date().toISOString().slice(0, 10),
    findings: problems.map((p) => p.split(' → ')[0] + ' → ' + (p.split(' → ')[1] ?? '')).sort(),
    raw: problems.sort(),
  };
  writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`check-doc-refs: wrote ${problems.length} finding(s) to ${BASELINE_FILE}`);
  process.exit(0);
}

// Hard failures first: a missing document or a missing link target is never a
// baseline item — those are structural, and there is no "known" version of a
// link to a file that does not exist.
const structural = problems.filter(
  (p) => p.includes('no such document in the repo') || p.includes('link target missing') || p.includes('link anchor not found'),
);
const sectionRefs = problems.filter((p) => !structural.includes(p));
const known = new Set((baseline?.raw ?? []).map((s) => s.trim()));
const fresh = sectionRefs.filter((p) => !known.has(p.trim()));
const stale = [...known].filter((k) => !sectionRefs.some((p) => p.trim() === k));

// ---------------------------------------------------------------- result
if (structural.length) {
  console.error(`check-doc-refs: FAILED (${structural.length} structural reference(s))`);
  for (const p of structural.slice(0, 20)) console.error(`  ✗ ${p}`);
  process.exit(1);
}
if (fresh.length) {
  console.error(`check-doc-refs: FAILED (${fresh.length} NEW broken section reference(s) — not in ${BASELINE_FILE})`);
  for (const p of fresh.slice(0, 20)) console.error(`  ✗ ${p}`);
  if (fresh.length > 20) console.error(`  … ${fresh.length - 20} more`);
  process.exit(1);
}
const parts = [
  `every link and document reference resolves`,
  `${sectionRefs.length} known-backlog section reference(s) (${BASELINE_FILE})`,
];
if (stale.length) parts.push(`${stale.length} baseline entr(y|ies) no longer reproduce — re-run with --write-baseline to shrink the list`);
if (acceptedHits.length) parts.push(`${acceptedHits.length} reference(s) covered by ${ACCEPTED.length} enumerated exception`);
console.log(`check-doc-refs: ok — ${parts.join('; ')}`);
