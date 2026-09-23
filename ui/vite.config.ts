import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Tauri expects a fixed frontend port for `devUrl` (see src-tauri/tauri.conf.json).
const host = process.env.TAURI_DEV_HOST;

// P58.2 — inject the application version at build time so the About stamp can
// never rot. A plain literal in settings-sections-extra.tsx drifted (claimed
// v0.7.2 · build 2026.01.15 while package.json says 2.0.0).
//
// P70.A7 — the source of that version is `src-tauri/tauri.conf.json`, **not**
// `ui/package.json`. That file's `version` is what Tauri writes into the
// installer metadata and the updater manifest, so injecting it here is what
// stops the badge from disagreeing with what was actually installed (it read
//
//   2.0.0 (ui/package.json)  vs  0.1.0 (installer/updater)
//
// — two surfaces stating different versions of the same product).
// `scripts/check-versions.mjs` fails the build if any consumer drifts.
import tauriConf from "../src-tauri/tauri.conf.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  // P58.2/P70.A7 — __APP_VERSION__ is compile-time only (see the About section).
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // WSL: Windows browsers need 0.0.0.0, not loopback-only.
    host: host || true,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // Rust changes don't need a frontend reload
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2021",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // F1 — the dedicated Guard-2 approval window is its own tiny page
      // (guard.html + src/guard-main.ts), built as a second entry so the
      // guard webview loads a fixed local asset, never the SPA.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        guard: fileURLToPath(new URL("./guard.html", import.meta.url)),
      },
      output: {
        manualChunks: {
          // Heavy vendors split out of the app chunk (Tauri caches them).
          // Monaco is ~5MB ESM; its own chunk keeps the app chunk small and
          // lets Tauri cache the editor separately.
          monaco: ["monaco-editor", "@monaco-editor/react"],
          charts: ["recharts"],
          motion: ["framer-motion"],
          radix: [
            "@radix-ui/react-accordion",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
          ],
          markdown: ["react-markdown"],
        },
      },
    },
  },
});
