// P58.2/P70.A7 — __APP_VERSION__ is injected at build time by vite.config.ts
// `define`, from the authoritative `src-tauri/tauri.conf.json` `version` (the
// string Tauri writes into the installer metadata and the updater manifest).
// Declared here so tsc accepts the global reference in
// settings-sections-extra.tsx. `scripts/check-versions.mjs` fails the build if
// any version surface drifts from that authority.
declare const __APP_VERSION__: string
