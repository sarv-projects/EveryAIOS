#!/usr/bin/env node
// P70.A4 — app metadata + assets.
//
// A4 is about what the *installer and the OS* are told about the app: product
// name, identity, category, descriptions, publisher, icons at the sizes the
// installers require, and the OS integrations (file associations, URL scheme).
// Almost all of it is declarative, so the failure mode is not a crash — it is
// an installer whose Manufacturer falls back to a fragment of the identifier,
// an MSI whose upgrade identity silently changes when the product is renamed,
// or an icon path that only fails at release time on the packaging host.
//
// What is checked:
//   1. the required metadata fields are present and not placeholders;
//   2. `identifier` is reverse-DNS and stable-looking;
//   3. `category` is one of the values Tauri accepts;
//   4. every declared icon path exists, the Windows-required icon set is
//      present, and the icon files carry their expected magic bytes;
//   5. the MSI `upgradeCode` is **pinned and correct**: unset means the
//      bundler derives it from `<productName>.exe.app.x64`, so renaming the
//      product changes the app's upgrade identity behind Windows' back. The
//      gate recomputes the derived value (UUIDv5, DNS namespace) and requires
//      the pinned value to match it — pinning must not silently move identity;
//   6. the updater's Windows install mode is compatible with the NSIS install
//      mode (per-user, no elevation);
//   7. **claim versus handler**: file associations may only be declared when
//      the shell has an open-document entry point, and a deep-link URL scheme
//      only when the deep-link plugin is actually a dependency. Declaring an
//      association the app cannot receive is a claim the OS will route to us
//      and we cannot honour.
//
// Read-only; no arguments.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (msg) => failures.push(msg);

// RFC 4122 DNS namespace, as bytes (UUIDv5 = SHA-1(namespace || name)).
const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/** UUIDv5 in the DNS namespace — the same derivation the Tauri MSI bundler uses. */
function uuid5Dns(name) {
  const ns = Buffer.from(DNS_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Tauri's accepted bundle categories (tauri-utils BundleConfig::category).
const CATEGORIES = new Set([
  'Business', 'DeveloperTool', 'Education', 'Entertainment', 'Finance', 'Game', 'ActionGame',
  'AdventureGame', 'ArcadeGame', 'BoardGame', 'CardGame', 'CasinoGame', 'DiceGame',
  'EducationalGame', 'FamilyGame', 'KidsGame', 'MusicGame', 'PuzzleGame', 'RacingGame',
  'RolePlayingGame', 'SimulationGame', 'SportsGame', 'StrategyGame', 'TriviaGame', 'WordGame',
  'GraphicsAndDesign', 'HealthcareAndFitness', 'Lifestyle', 'Medical', 'Music', 'News',
  'Photography', 'Productivity', 'Reference', 'SocialNetworking', 'Sports', 'Travel', 'Utility',
  'Video', 'Weather',
]);

const PLACEHOLDERS = /^(tbd|todo|changeme|com\.example|example|placeholder|productname|myapp)$/i;

let conf;
const confPath = join(root, 'src-tauri/tauri.conf.json');
try {
  conf = JSON.parse(readFileSync(confPath, 'utf8'));
} catch (err) {
  console.error(`app-metadata: FAIL — cannot read src-tauri/tauri.conf.json: ${err.message}`);
  process.exit(1);
}
const bundle = conf.bundle ?? {};

// --- 1 + 2 + 3: the declared metadata ---------------------------------------
const required = [
  ['productName', conf.productName],
  ['identifier', conf.identifier],
  ['bundle.category', bundle.category],
  ['bundle.shortDescription', bundle.shortDescription],
  ['bundle.longDescription', bundle.longDescription],
  ['bundle.publisher', bundle.publisher],
  ['bundle.copyright', bundle.copyright],
  ['bundle.homepage', bundle.homepage],
];
for (const [name, value] of required) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`src-tauri/tauri.conf.json: ${name} is missing — the installer would show a default or empty value`);
    continue;
  }
  if (PLACEHOLDERS.test(value.trim())) {
    fail(`src-tauri/tauri.conf.json: ${name} is a placeholder (${JSON.stringify(value)})`);
  }
}
if (typeof conf.identifier === 'string') {
  const segments = conf.identifier.split('.');
  if (segments.length < 2 || segments.some((s) => s === '')) {
    fail(`src-tauri/tauri.conf.json: identifier \`${conf.identifier}\` is not reverse-DNS`);
  }
}
if (typeof bundle.category === 'string' && !CATEGORIES.has(bundle.category)) {
  fail(`src-tauri/tauri.conf.json: bundle.category \`${bundle.category}\` is not a Tauri bundle category`);
}
if (typeof bundle.shortDescription === 'string' && bundle.shortDescription.length > 120) {
  fail('src-tauri/tauri.conf.json: bundle.shortDescription exceeds 120 characters — it is truncated in installer lists');
}

// --- 4: icons ----------------------------------------------------------------
const icons = Array.isArray(bundle.icon) ? bundle.icon : [];
const REQUIRED_WINDOWS_ICONS = ['icons/icon.ico', 'icons/32x32.png', 'icons/128x128.png'];
for (const rel of REQUIRED_WINDOWS_ICONS) {
  if (!icons.includes(rel)) {
    fail(`src-tauri/tauri.conf.json: bundle.icon is missing \`${rel}\` — the Windows installers need it`);
  }
}
const MAGIC = [
  ['.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  ['.ico', Buffer.from([0x00, 0x00, 0x01, 0x00])],
];
let checkedIcons = 0;
for (const rel of icons) {
  const abs = resolve(root, 'src-tauri', rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    fail(`src-tauri/${rel}: declared in bundle.icon but not present on disk (a bundle would fail at release time)`);
    continue;
  }
  checkedIcons += 1;
  const magic = MAGIC.find(([ext]) => abs.toLowerCase().endsWith(ext));
  if (!magic) continue;
  const head = readFileSync(abs).subarray(0, magic[1].length);
  if (!head.equals(magic[1])) {
    fail(`src-tauri/${rel}: content is not a valid ${magic[0].slice(1).toUpperCase()} file (bad magic bytes)`);
  }
}
if (icons.length === 0) fail('src-tauri/tauri.conf.json: bundle.icon is empty');

// --- 5: stable MSI upgrade identity -----------------------------------------
const wix = bundle.windows?.wix ?? {};
const productName = typeof conf.productName === 'string' ? conf.productName : '';
const derived = productName ? uuid5Dns(`${productName}.exe.app.x64`) : '';
const pinned = wix.upgradeCode;
if (!pinned) {
  fail(
    'src-tauri/tauri.conf.json: bundle.windows.wix.upgradeCode is unset — the MSI upgrade identity is then derived from ' +
      `\`${productName}.exe.app.x64\` (currently ${derived}), so renaming the product would make Windows treat the next ` +
      'release as a different application (duplicate installs, failed upgrades)',
  );
} else {
  const normalized = String(pinned).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    fail(`src-tauri/tauri.conf.json: wix.upgradeCode \`${pinned}\` is not a UUID`);
  } else if (derived && normalized !== derived) {
    fail(
      `src-tauri/tauri.conf.json: wix.upgradeCode \`${pinned}\` differs from the value the bundler derives from the ` +
        `current productName (\`${derived}\`). That is only correct as a deliberate identity change — installing this ` +
        'build next to a previously released one would produce two applications instead of an upgrade.',
    );
  }
}

// --- 6: installer / updater install-mode agreement ---------------------------
const nsisMode = bundle.windows?.nsis?.installMode ?? 'currentUser';
const updaterMode = conf.plugins?.updater?.windows?.installMode;
if (updaterMode === 'passive' && nsisMode !== 'currentUser') {
  fail(
    `src-tauri/tauri.conf.json: updater windows.installMode is \`passive\` while the NSIS installMode is \`${nsisMode}\` — ` +
      'a passive (silent, non-elevated) update install requires the per-user installer the support matrix promises',
  );
}

// --- 7: claim versus handler -------------------------------------------------
const associations = bundle.fileAssociations ?? [];
if (associations.length > 0) {
  const shellCargo = existsSync(join(root, 'src-tauri/Cargo.toml'))
    ? readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8')
    : '';
  const shellSrc = ['src-tauri/src/lib.rs', 'src-tauri/src/main.rs']
    .filter((p) => existsSync(join(root, p)))
    .map((p) => readFileSync(join(root, p), 'utf8'))
    .join('\n');
  const hasSingleInstance = /tauri-plugin-single-instance/.test(shellCargo);
  // A double-click delivers the path either as an argv entry or through the
  // macOS/iOS `RunEvent::Opened` hook; either satisfies "the file can arrive".
  const hasOpenHandler = /RunEvent::Opened|opened_urls|OpenUrl/.test(shellSrc) || /args\(\)/.test(shellSrc);
  if (!hasSingleInstance) {
    fail(
      `src-tauri/tauri.conf.json: ${associations.length} file association(s) declared, but the shell has no ` +
        'single-instance handling — a double-click can only start a second copy of the app, which then never receives the file',
    );
  }
  if (!hasOpenHandler) {
    fail(
      `src-tauri/tauri.conf.json: ${associations.length} file association(s) declared, but the shell has no ` +
        'open-document entry point (no argv handling, no `RunEvent::Opened`) — the OS would route documents to the app and the app would drop them',
    );
  }
}

const scheme = conf.plugins?.['deep-link'] ?? conf.plugins?.deepLink;
if (scheme) {
  const shellCargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
  if (!/tauri-plugin-deep-link/.test(shellCargo)) {
    fail(
      'src-tauri/tauri.conf.json: a deep-link URL scheme is configured, but tauri-plugin-deep-link is not a shell ' +
        'dependency — the scheme would be registered with nothing registered to receive it',
    );
  }
}

if (failures.length > 0) {
  console.error('app-metadata: FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `app-metadata: PASS — identity \`${conf.identifier}\` (${bundle.publisher}), ` +
    `${checkedIcons}/${icons.length} icon(s) present, MSI upgradeCode pinned (${pinned}), ` +
    `file associations declared: ${associations.length}`,
);
