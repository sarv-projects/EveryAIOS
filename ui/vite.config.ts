import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Tauri expects a fixed frontend port for `devUrl` (see src-tauri/tauri.conf.json).
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
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
  },
});
