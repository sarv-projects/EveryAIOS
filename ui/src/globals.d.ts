// P58.2 — __APP_VERSION__ is injected at build time by vite.config.ts
// `define` (from package.json version). Declared here so tsc accepts the
// global reference in settings-sections-extra.tsx.
declare const __APP_VERSION__: string
