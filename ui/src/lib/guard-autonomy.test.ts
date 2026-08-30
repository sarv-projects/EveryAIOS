// P44.5 — H34 autonomy level wiring tests: the UI `full` ↔ Rust `maximum`
// mapping, and the store's sync-on-load + push-on-change behavior (the Rust
// GuardService preset is authoritative over stale localStorage).

import { describe, expect, test } from "bun:test";
import { toRustLevel, toUILevel, guardAutonomy, guardSetAutonomy } from "./guard";
import { useAppStore } from "./store";

describe("autonomy level wire mapping", () => {
  test("UI full ↔ Rust maximum, others pass through", () => {
    expect(toRustLevel("full")).toBe("maximum");
    expect(toRustLevel("sandbox")).toBe("sandbox");
    expect(toRustLevel("ask")).toBe("ask");
    expect(toRustLevel("auto")).toBe("auto");
    expect(toUILevel("maximum")).toBe("full");
    expect(toUILevel("sandbox")).toBe("sandbox");
    expect(toUILevel("ask")).toBe("ask");
    expect(toUILevel("auto")).toBe("auto");
    // Round-trip is stable for every level.
    for (const l of ["sandbox", "ask", "auto", "full"] as const) {
      expect(toUILevel(toRustLevel(l))).toBe(l);
    }
  });
});

describe("autonomy sync outside the Tauri shell", () => {
  test("guardAutonomy short-circuits (no shell → null, never throws)", async () => {
    // `inTauri()` is false in the bun test env, so the bridge returns null
    // without invoking the shell.
    const level = await guardAutonomy();
    expect(level).toBeNull();
  });

  test("guardSetAutonomy short-circuits (no shell → null)", async () => {
    const applied = await guardSetAutonomy("auto");
    expect(applied).toBeNull();
  });

  test("syncAutonomyFromRust is a no-op outside the shell and keeps the UI level", async () => {
    useAppStore.setState({ permissionMode: "ask" });
    await useAppStore.getState().syncAutonomyFromRust();
    expect(useAppStore.getState().permissionMode).toBe("ask");
  });

  test("setPermissionMode still updates the store without a shell", () => {
    useAppStore.setState({ permissionMode: "ask" });
    useAppStore.getState().setPermissionMode("full");
    expect(useAppStore.getState().permissionMode).toBe("full");
  });
});
