// Tauri IPC bridge (P0.7). `invoke` proxies the Tauri v2 command bridge; in a
// plain-browser preview (vite dev without the shell) it throws, and callers
// fall back to demo data so the UI is still explorable.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/** True when running inside the Tauri webview (v2 sets this global). */
export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Invoke a Rust command through the Tauri bridge. */
export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}
