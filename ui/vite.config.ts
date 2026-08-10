import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expectations (tauri.conf.json build): a FIXED dev port (devUrl),
// no auto-open, and the dist dir the shell ships. `strictPort` turns a port
// conflict into a loud error instead of a silent redirect.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Ignore the Rust side — editing Rust must not restart the dev server.
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
