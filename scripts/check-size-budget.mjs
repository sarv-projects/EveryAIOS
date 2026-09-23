#!/usr/bin/env node
// P70.A5 — size + footprint budgets.
//
// Three modes:
//
//   node scripts/check-size-budget.mjs
//     Validates the budget file itself (schema, both Windows targets, positive
//     ceilings, a sane regression threshold) and prints what is budgeted and
//     whether a baseline has been recorded. This is the CI mode: the budget
//     file cannot silently rot or lose a target.
//
//   node scripts/check-size-budget.mjs --bundle <dir> [--target <triple>]
//     Measures a PRODUCED bundle: the installer artifacts it contains and the
//     installed footprint (the application binary plus the bundled sidecar) and
//     fails when either exceeds its ceiling or regresses beyond the threshold.
//     Used by the release workflow after `tauri build`.
//
//   node scripts/check-size-budget.mjs --measurements <file.json> [--target <triple>]
//     Reads idle/warm RSS from a measurement file (`{ "idle_mb": …, "warm_mb": … }`,
//     also accepting the `p45_8_idle_footprint.rss_mb` shape) and applies the
//     same ceiling + regression rule.
//
// Exit codes: 0 pass, 1 budget violated or regression beyond threshold, 2 usage
// or configuration error (a mode that could not measure anything never passes
// silently).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_PATH = join(root, 'docs/packaging/budgets.json');

function usage(msg) {
  console.error(`size-budget: ${msg}`);
  console.error(
    'usage: check-size-budget.mjs [--bundle <dir> | --measurements <file>] [--target <triple>]',
  );
  process.exit(2);
}

const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const bundleDir = argOf('--bundle');
const measurementsFile = argOf('--measurements');
const targetFilter = argOf('--target');
if (bundleDir && measurementsFile) usage('--bundle and --measurements are mutually exclusive');
for (const flag of argv.filter((a) => a.startsWith('--'))) {
  if (!['--bundle', '--measurements', '--target'].includes(flag)) usage(`unknown flag ${flag}`);
}

const MI_B = 1048576;

/** Recursively sum file sizes in a directory. */
function dirBytes(dir) {
  let total = 0;
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = dirBytes(p);
      total += inner.bytes;
      files += inner.files;
    } else {
      total += statSync(p).size;
      files += 1;
    }
  }
  return { bytes: total, files };
}

// --- the budget file ---------------------------------------------------------
let budgets;
try {
  budgets = JSON.parse(readFileSync(BUDGET_PATH, 'utf8'));
} catch (err) {
  console.error(`size-budget: FAIL — cannot read docs/packaging/budgets.json: ${err.message}`);
  process.exit(2);
}

const configErrors = [];
const REQUIRED_TARGETS = ['x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc'];
const targets = budgets.targets ?? {};
for (const t of REQUIRED_TARGETS) {
  if (!targets[t]) configErrors.push(`budgets.targets.${t} is missing (v1 publishes this target)`);
}
for (const [name, b] of Object.entries(targets)) {
  if (!b.installer_bytes?.nsis || !b.installer_bytes?.msi) {
    configErrors.push(`${name}: installer_bytes must budget both \`nsis\` and \`msi\``);
  }
  for (const [key, value] of [
    ['installer_bytes.nsis', b.installer_bytes?.nsis],
    ['installer_bytes.msi', b.installer_bytes?.msi],
    ['installed_bytes', b.installed_bytes],
    ['idle_rss_mb', b.idle_rss_mb],
    ['warm_rss_mb', b.warm_rss_mb],
  ]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      configErrors.push(`${name}: ${key} must be a positive number (got ${JSON.stringify(value)})`);
    }
  }
  if (b.warm_rss_mb && b.idle_rss_mb && b.warm_rss_mb < b.idle_rss_mb) {
    configErrors.push(`${name}: warm_rss_mb (${b.warm_rss_mb}) is below idle_rss_mb (${b.idle_rss_mb})`);
  }
}
const threshold = budgets.regression_threshold_pct;
if (typeof threshold !== 'number' || threshold <= 0 || threshold > 50) {
  configErrors.push(
    `regression_threshold_pct must be a number in (0, 50] — got ${JSON.stringify(threshold)}`,
  );
}
if (configErrors.length > 0) {
  console.error('size-budget: FAIL — the budget file is not usable:');
  for (const e of configErrors) console.error(`  - ${e}`);
  process.exit(2);
}

// --- measurement modes -------------------------------------------------------
const violations = [];
const notes = [];

/** Apply a ceiling and the regression threshold to one measured value. */
function enforce(target, key, value, ceiling, baseline) {
  if (value > ceiling) {
    violations.push(
      `${target}: ${key} ${fmt(value)} exceeds the budget of ${fmt(ceiling)} ` +
        `(over by ${fmt(value - ceiling)})`,
    );
  }
  if (typeof baseline === 'number' && baseline > 0) {
    const allowed = baseline * (1 + threshold / 100);
    if (value > allowed) {
      violations.push(
        `${target}: ${key} regressed to ${fmt(value)} from a baseline of ${fmt(baseline)} ` +
          `(+${(((value - baseline) / baseline) * 100).toFixed(1)}%, allowed +${threshold}%)`,
      );
    }
    // Only report a genuine record, never a placeholder.
    if (value < baseline) {
      notes.push(
        `${target}: ${key} improved to ${fmt(value)} from ${fmt(baseline)} — record the new baseline in ` +
          'docs/packaging/budgets.json',
      );
    }
  }
}

function fmt(value) {
  if (value >= MI_B) return `${(value / MI_B).toFixed(1)} MiB`;
  return `${value.toFixed(1)} MB`;
}

function resolveTarget() {
  if (targetFilter) {
    if (!targets[targetFilter]) {
      console.error(`size-budget: FAIL — \`${targetFilter}\` is not a budgeted target`);
      process.exit(2);
    }
    return targetFilter;
  }
  if (REQUIRED_TARGETS.length === 1) return REQUIRED_TARGETS[0];
  usage('--target <triple> is required when more than one target is budgeted');
}

if (bundleDir) {
  const target = resolveTarget();
  const b = targets[target];
  if (!existsSync(bundleDir)) {
    console.error(`size-budget: FAIL — bundle directory does not exist: ${bundleDir}`);
    process.exit(2);
  }

  // Installer artifacts: NSIS `.exe` under a `nsis/` directory, `.msi` under `msi/`.
  const found = { nsis: [], msi: [] };
  for (const dir of readdirSync(bundleDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const sub = join(bundleDir, dir.name);
    for (const f of readdirSync(sub)) {
      const p = join(sub, f);
      if (!statSync(p).isFile()) continue;
      if (dir.name === 'nsis' && f.toLowerCase().endsWith('.exe')) found.nsis.push(p);
      if (dir.name === 'msi' && f.toLowerCase().endsWith('.msi')) found.msi.push(p);
    }
  }
  for (const kind of ['nsis', 'msi']) {
    if (found[kind].length === 0) {
      violations.push(
        `${kind}: no ${kind.toUpperCase()} artifact found under ${bundleDir} — the budgeted artifact ` +
          'was not produced, so its size was never checked',
      );
      continue;
    }
    const size = Math.max(...found[kind].map((p) => statSync(p).size));
    enforce(
      target,
      `installer_bytes.${kind}`,
      size,
      b.installer_bytes[kind],
      b.baseline?.installer_bytes?.[kind] ?? null,
    );
    console.log(`  ${kind}: ${fmt(size)} (${basename(found[kind][0])})`);
  }

  // Installed footprint: the app binary plus the bundled resources that sit
  // beside it (the coordinator sidecar and its bin/ siblings).
  const releaseDir = join(bundleDir, '..');
  let installed = 0;
  let pieces = 0;
  if (existsSync(releaseDir)) {
    for (const entry of readdirSync(releaseDir, { withFileTypes: true })) {
      const p = join(releaseDir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        installed += statSync(p).size;
        pieces += 1;
      } else if (entry.isDirectory() && entry.name === 'bin') {
        const inner = dirBytes(p);
        installed += inner.bytes;
        pieces += inner.files;
      }
    }
  }
  if (pieces === 0) {
    violations.push(
      `installed_bytes: nothing measured beside ${bundleDir} — the installed footprint could not be ` +
        'read, so its budget was never checked',
    );
  } else {
    enforce(target, 'installed_bytes', installed, b.installed_bytes, b.baseline?.installed_bytes ?? null);
    console.log(`  installed: ${fmt(installed)} across ${pieces} file(s)`);
  }
} else if (measurementsFile) {
  const target = resolveTarget();
  const b = targets[target];
  if (!existsSync(measurementsFile)) {
    console.error(`size-budget: FAIL — measurements file does not exist: ${measurementsFile}`);
    process.exit(2);
  }
  let m;
  try {
    m = JSON.parse(readFileSync(measurementsFile, 'utf8'));
  } catch (err) {
    console.error(`size-budget: FAIL — cannot parse ${measurementsFile}: ${err.message}`);
    process.exit(2);
  }
  const idle =
    typeof m.idle_mb === 'number'
      ? m.idle_mb
      : typeof m.idle_rss_mb === 'number'
        ? m.idle_rss_mb
        : m.metrics?.p45_8_idle_footprint?.rss_mb;
  const warm = typeof m.warm_mb === 'number' ? m.warm_mb : m.warm_rss_mb;
  if (typeof idle !== 'number') {
    console.error(
      'size-budget: FAIL — no idle RSS reading in the measurements file (expected `idle_mb`, ' +
        '`idle_rss_mb` or `metrics.p45_8_idle_footprint.rss_mb`)',
    );
    process.exit(2);
  }
  enforce(target, 'idle_rss_mb', idle, b.idle_rss_mb, b.baseline?.idle_rss_mb ?? null);
  console.log(`  idle RSS: ${fmt(idle)}`);
  if (typeof warm === 'number') {
    enforce(target, 'warm_rss_mb', warm, b.warm_rss_mb, b.baseline?.warm_rss_mb ?? null);
    console.log(`  warm RSS: ${fmt(warm)}`);
  } else {
    notes.push('no warm RSS reading in the measurements file — only the idle budget was checked');
  }
}

// --- report ------------------------------------------------------------------
if (violations.length > 0) {
  console.error('size-budget: FAIL');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

const baselined = Object.entries(targets).filter(([, b]) => b.baseline?.installed_bytes !== null);
for (const n of notes) console.log(`  note: ${n}`);

if (!bundleDir && !measurementsFile) {
  const rows = Object.entries(targets).map(
    ([name, b]) =>
      `${name}: nsis ≤ ${fmt(b.installer_bytes.nsis)}, msi ≤ ${fmt(b.installer_bytes.msi)}, ` +
      `installed ≤ ${fmt(b.installed_bytes)}, idle ≤ ${b.idle_rss_mb} MB, warm ≤ ${b.warm_rss_mb} MB`,
  );
  console.log('size-budget: PASS — budget file valid');
  for (const r of rows) console.log(`  ${r}`);
  console.log(
    baselined.length === 0
      ? '  no artifact has been measured yet (baseline null in every target) — the ceilings apply at release time, where the bundle is measured'
      : `  regression threshold: +${threshold}% against the recorded baseline`,
  );
} else {
  console.log(`size-budget: PASS — measured within budget (regression threshold +${threshold}%)`);
}
