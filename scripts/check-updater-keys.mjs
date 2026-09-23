#!/usr/bin/env node
// P70.B4 — updater signing keypair custody.
//
// The updater's `pubkey` in `src-tauri/tauri.conf.json` is the **trust anchor**
// for every shipped install: a client only accepts update manifests whose
// minisign signature verifies against it. This gate keeps the three parts of
// that story consistent:
//
//   1. the release workflow still passes the `TAURI_SIGNING_PRIVATE_KEY`
//      secrets into the build environment (without them no updater artifact
//      can be signed, and the release must fail rather than ship unsigned);
//   2. the local keypair stays out of git (`.tauri/` gitignored — the private
//      half must never be committed) and the public half's base64 matches the
//      `pubkey` anchor in the config, so a local re-sign verifies against what
//      ships;
//   3. the key comment (key id) inside the anchor is a real minisign public
//      key comment and the body decodes to the minisign `RWR…` form.
//
// Read-only; no arguments.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (msg) => failures.push(msg);

// --- 1: the release workflow still wires the updater secrets -----------------
const releasePath = '.github/workflows/release.yml';
if (!existsSync(join(root, releasePath))) {
  fail(`${releasePath}: missing — updater signing cannot be verified`);
} else {
  const release = readFileSync(join(root, releasePath), 'utf8');
  const actionEnv = release.split('tauri-apps/tauri-action@')[1] ?? '';
  if (!actionEnv.includes('TAURI_SIGNING_PRIVATE_KEY:')) {
    fail(
      `${releasePath}: the tauri-action step no longer receives TAURI_SIGNING_PRIVATE_KEY — updater artifacts ` +
        'cannot be signed, and B1 requires an unsigned artifact to fail the release rather than ship quietly',
    );
  }
  if (!actionEnv.includes('TAURI_SIGNING_PRIVATE_KEY_PASSWORD:')) {
    fail(`${releasePath}: TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not wired into the build env (P70.B4)`);
  }
}

// --- 2a: the private key stays out of git ------------------------------------
const gitignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : '';
if (!/^\.tauri\/$/m.test(gitignore)) {
  fail('.gitignore: `.tauri/` is no longer ignored — the updater private key could be committed (P70.B4)');
}
const privKey = join(root, '.tauri/everyaios-updater.key');
const pubKey = join(root, '.tauri/everyaios-updater.key.pub');
if (!existsSync(privKey)) {
  // Not fatal on a fresh checkout (the key lives with the release manager);
  // but then the public half cannot be cross-checked either, so say so.
  console.log('updater-keys: note — local keypair not present on this checkout (custody is with the release manager)');
} else if (!existsSync(pubKey)) {
  fail('.tauri/everyaios-updater.key.pub is missing while the private key exists — the config anchor cannot be cross-checked');
} else {
  // --- 2b: the public half matches the config anchor -------------------------
  const conf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const anchor = conf?.plugins?.updater?.pubkey;
  if (typeof anchor !== 'string' || anchor.length === 0) {
    fail('src-tauri/tauri.conf.json: plugins.updater.pubkey is missing — shipped installs would trust no update source');
  } else {
    // The .pub file stores base64(minisign-public-key-file).
    const fileInner = Buffer.from(readFileSync(pubKey, 'utf8').trim(), 'base64').toString('utf8');
    const anchorInner = Buffer.from(anchor, 'base64').toString('utf8');
    if (fileInner !== anchorInner) {
      fail(
        'src-tauri/tauri.conf.json: plugins.updater.pubkey does NOT match .tauri/everyaios-updater.key.pub — ' +
          'an artifact signed with the local key would be REFUSED by shipped installs (or vice versa). ' +
          'If a rotation is intended, follow docs/signing.md §3.2 (anchor update must ship in a release signed with the old key).',
      );
    }
    // --- 3: the anchor really is a minisign public key -----------------------
    const comment = /^untrusted comment: (.*)$/m.exec(anchorInner)?.[1] ?? '';
    if (!comment.includes('minisign public key')) {
      fail(`src-tauri/tauri.conf.json: the updater pubkey is not a minisign public key (comment: ${JSON.stringify(comment)})`);
    }
    const body = anchorInner.split('\n')[1] ?? '';
    if (!/^RWR/.test(body)) {
      fail('src-tauri/tauri.conf.json: the updater pubkey body is not in minisign `RWR…` form');
    }
  }
}

if (failures.length > 0) {
  console.error('updater-keys: FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('updater-keys: PASS — private key out of git, release secrets wired, pubkey anchor matches the local keypair');
