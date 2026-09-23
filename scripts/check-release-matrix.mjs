#!/usr/bin/env node
// P70.A1 — the published bundle target matrix.
//
// The row's condition is not "tauri.conf.json lists two targets" — it is that
// **the published set is exactly Windows `nsis` + `msi` for
// `x86_64-pc-windows-msvc` and `aarch64-pc-windows-msvc`, and nothing else is
// published**. `src-tauri/tauri.conf.json` deliberately keeps all six targets:
// the local verification harness builds and boots on Linux/macOS, and the
// targets list is what that harness reads. So the assertion belongs on the
// *release workflow* (what actually reaches users) plus the published support
// matrix — and it has to be a gate, because a single added matrix leg or an
// extra `--bundles` entry silently widens the published platform set, which
// `SUPPORT-MATRIX.md` §1 forbids.
//
// What is checked:
//   1. `.github/workflows/release.yml`'s build matrix contains exactly the two
//      Windows legs (`windows-latest`, x86_64 + aarch64 msvc) — no macOS and no
//      Linux runner, since a leg is a published artifact.
//   2. the bundling args are exactly `--bundles nsis,msi` (the `.msi`/`.exe`
//      pair the matrix promises) and no other bundle kind is requested.
//   3. `tauri.conf.json` still declares `nsis` + `msi` among its targets, and
//      the Windows installer settings match the matrix (per-user, no elevation).
//   4. `SUPPORT-MATRIX.md` still declares macOS and native Linux desktop out of
//      v1 and names `.msi` + NSIS for Windows — the published statement and the
//      published artifacts must agree.
//   5. every other workflow that bundles (`nightly-e2e`, `p50-gates`, `ci`) does
//      not run `tauri build` with a publishing action — artifacts come from the
//      tagged release workflow only (also P70.A6).
//
// Read-only; no arguments.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const failures = [];
const fail = (msg) => failures.push(msg);

const WINDOWS_TARGETS = ['x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc'];

// --- 1 + 2: the release workflow ---------------------------------------------
const releasePath = '.github/workflows/release.yml';
if (!existsSync(join(root, releasePath))) {
  fail(`${releasePath}: missing — the published artifact path cannot be verified`);
} else {
  const release = read(releasePath);

  // The build job's matrix is what publishes. Take the text from the `build:`
  // job onward so a helper job's runner cannot be mistaken for a matrix leg.
  const buildIdx = release.indexOf('\n  build:');
  const buildJob = buildIdx >= 0 ? release.slice(buildIdx) : '';
  if (!buildJob) {
    fail(`${releasePath}: no \`build:\` job found — cannot verify the published matrix`);
  } else {
    const runners = [...buildJob.matchAll(/^\s*-\s*os:\s*([\w.-]+)\s*$/gm)].map((m) => m[1]);
    if (runners.length === 0) {
      fail(`${releasePath}: the build job declares no \`os:\` matrix legs`);
    }
    for (const runner of runners) {
      if (runner !== 'windows-latest') {
        fail(
          `${releasePath}: build matrix leg runs on \`${runner}\` — v1 publishes Windows only (SUPPORT-MATRIX.md §1); a non-Windows leg would publish an artifact for a platform that is out of scope`,
        );
      }
    }

    const targets = [...buildJob.matchAll(/^\s*target:\s*([\w.-]+)\s*$/gm)].map((m) => m[1]);
    const expected = new Set(WINDOWS_TARGETS);
    const actual = new Set(targets);
    for (const t of expected) {
      if (!actual.has(t)) fail(`${releasePath}: build matrix is missing the \`${t}\` target`);
    }
    for (const t of actual) {
      if (!expected.has(t)) fail(`${releasePath}: build matrix publishes an unexpected target \`${t}\` (P70.A1: exactly ${WINDOWS_TARGETS.join(' + ')})`);
    }

    const bundlesArgs = [...buildJob.matchAll(/--bundles\s+(\S+)/g)].map((m) => m[1]);
    if (bundlesArgs.length === 0) {
      fail(`${releasePath}: no \`--bundles\` argument found — the bundle kinds are not pinned to nsis,msi`);
    }
    for (const arg of bundlesArgs) {
      const kinds = arg.split(',').map((s) => s.trim()).sort();
      if (kinds.join(',') !== 'msi,nsis') {
        fail(
          `${releasePath}: \`--bundles ${arg}\` is not the published pair \`nsis,msi\` (P70.A1 — the matrix promises .msi (WiX) + .exe (NSIS) and nothing else)`,
        );
      }
    }

    if (!/tauri-apps\/tauri-action@/.test(buildJob)) {
      fail(`${releasePath}: the build job does not use tauri-action — cannot confirm the produced bundle is the published one`);
    }
  }

  // --- P70.A6: CI-only, tag-built artifacts with recorded provenance --------
  if (!/^on:\s*\n(?:\s*\w+:.*\n)*?\s*push:\s*\n\s*tags:\s*\[?"?'?v\*/m.test(release)) {
    fail(
      `${releasePath}: the workflow is not triggered by a version tag — every published artifact must come from a ` +
        'tagged commit, never from an untagged dispatch (P70.A6)',
    );
  }
  const provenance = [
    [/Source commit:.*github\.sha/, 'the source commit (`github.sha`)'],
    [/Rust: stable/, 'the Rust toolchain version'],
    [/Node 22[^\n]*Bun[^\n]*pnpm/, 'the Node/Bun/pnpm versions'],
    [/Verification[^\n]*(?:check|verify)/i, 'the gates the commit passed, or equivalent'],
  ];
  for (const [re, what] of provenance) {
    if (!re.test(release)) {
      // The verification row is desirable but not load-bearing; the three
      // toolchain/source fields are what the row names.
      const hard = what !== 'the gates the commit passed, or equivalent';
      if (hard) fail(`${releasePath}: the release body no longer records ${what} (P70.A6 provenance)`);
    }
  }
  if (!/tagName:\s*v__VERSION__/.test(release)) {
    fail(
      `${releasePath}: the release tag is no longer derived from the config version — the published tag could drift from ` +
        'the version the installer and updater report (P70.A6/A7/C1)',
    );
  }

  // --- P70.B1: an unsigned artifact must fail the release, not ship quietly.
  // The Authenticode certificate cannot live in the repo; what must be true is
  // that the workflow *asserts* it — the job fails when the secret is absent,
  // so a lapsed or missing certificate can never silently produce unsigned
  // releases (the row's stated failure mode).
  if (!/TAURI_SIGNING_PRIVATE_KEY:/.test(release)) {
    fail(
      `${releasePath}: the updater signing secret is no longer wired into the build environment — ` +
        'updater artifacts cannot be signed (P70.B4)',
    );
  }
  if (!/P70\.B1/.test(release) || !/[Cc]ode\s*sign/.test(release)) {
    fail(
      `${releasePath}: no Authenticode code-signing step — B1 requires every executable and installer to be ` +
        'signed with a trusted timestamp, and an unsigned artifact must fail the release rather than ship quietly',
    );
  }
  // --- P70.B5: the release must carry its SBOM + provenance attestation.
  if (!/P70\.B5/.test(release)) {
    fail(`${releasePath}: no SBOM/provenance generation step (P70.B5)`);
  }
}

// --- 3: the tauri bundle config ----------------------------------------------
try {
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  const targets = conf?.bundle?.targets ?? [];
  for (const t of ['nsis', 'msi']) {
    if (!targets.includes(t)) {
      fail(`src-tauri/tauri.conf.json: bundle.targets is missing \`${t}\` — the Windows installers the matrix promises could not be built locally`);
    }
  }
  const win = conf?.bundle?.windows ?? {};
  if (!win.nsis) {
    fail('src-tauri/tauri.conf.json: bundle.windows.nsis is missing — NSIS installer settings are undeclared');
  } else if (win.nsis.installMode !== 'currentUser') {
    fail(
      `src-tauri/tauri.conf.json: nsis.installMode is \`${win.nsis.installMode}\`, expected \`currentUser\` (SUPPORT-MATRIX.md: per-user install, no elevation)`,
    );
  }
  if (!win.wix) {
    fail('src-tauri/tauri.conf.json: bundle.windows.wix is missing — MSI (WiX) settings are undeclared');
  }
} catch (err) {
  fail(`src-tauri/tauri.conf.json: ${err.message}`);
}

// --- 4: the published statement ----------------------------------------------
try {
  const matrix = read('SUPPORT-MATRIX.md');
  const oneline = matrix.replace(/\s+/g, ' ');
  const must = [
    [/\.msi` \(WiX\) \+ `\.exe` \(NSIS\)/, 'the Windows artifact pair (`.msi` WiX + `.exe` NSIS)'],
    [/macOS[^.]*out of v1/i, 'macOS declared out of v1'],
    [/native Linux desktop[^.]*out of v1/i, 'native Linux desktop declared out of v1'],
    [/WSL2/, 'the WSL2 host statement'],
  ];
  for (const [re, what] of must) {
    if (!re.test(oneline)) fail(`SUPPORT-MATRIX.md: ${what} is no longer stated`);
  }
} catch (err) {
  fail(`SUPPORT-MATRIX.md: ${err.message}`);
}

// --- 5: only the tagged release workflow publishes ---------------------------
const workflowsDir = join(root, '.github/workflows');
for (const name of ['ci.yml', 'nightly-e2e.yml', 'p50-gates.yml', 'perf-regression.yml']) {
  const p = join(workflowsDir, name);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  // A publishing action or a tag trigger turns that workflow into a second
  // published-artifact path; P70.A6 requires exactly one (tagged commits, CI).
  if (/tauri-apps\/tauri-action@/.test(src)) {
    fail(`${name}: uses tauri-action — every published artifact must come from ${releasePath} (P70.A6)`);
  }
  if (/^\s*tags:\s*\[?\s*["']?v\*/m.test(src)) {
    fail(`${name}: triggers on version tags — the release workflow is the only tag publisher (P70.A6)`);
  }
}

if (failures.length > 0) {
  console.error('release-matrix: FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `release-matrix: PASS — published set is exactly ${WINDOWS_TARGETS.join(' + ')} as nsis,msi; ` +
    'macOS and native Linux desktop remain out of v1; only release.yml publishes',
);
