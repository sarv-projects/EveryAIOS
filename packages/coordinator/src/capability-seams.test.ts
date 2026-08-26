import { describe, expect, test } from "bun:test";
import { CapabilityError, CapabilitySeamRegistry } from "./capability-seams";

describe("P30.10 capability seams", () => {
  test("declare → register → resolve", async () => {
    const reg = new CapabilitySeamRegistry();
    reg.declare({ id: "office.docx.render", version: "1.0", description: "render docx" });
    reg.register("office.docx.render", "native-engine", async (args) => ({ pages: 3, ...(args as object) }));
    const out = await reg.resolve("office.docx.render", { path: "a.docx" });
    expect(out).toEqual({ pages: 3, path: "a.docx" });
  });

  test("refuses undeclared services", () => {
    const reg = new CapabilitySeamRegistry();
    expect(() => reg.register("nope", "x", async () => 1)).toThrow(CapabilityError);
  });

  test("bind refuses when no provider; unregister unwinds consumers", async () => {
    const reg = new CapabilitySeamRegistry();
    reg.declare({ id: "mem.retrieve", version: "1.0", description: "retrieve" });
    expect(() => reg.bind("agent-1", "mem.retrieve")).toThrow(CapabilityError);
    reg.register("mem.retrieve", "memory-store", async () => "hit");
    reg.bind("agent-1", "mem.retrieve");
    const report = reg.unregister("memory-store");
    expect(report.unregisteredProviders).toEqual(["memory-store"]);
    expect(report.notifiedConsumers).toContain("agent-1");
    // Resolution now fails — the consumer was unwound.
    await expect(reg.resolve("mem.retrieve", {})).rejects.toThrow(CapabilityError);
  });

  test("re-register after unload works (reversible registration)", async () => {
    const reg = new CapabilitySeamRegistry();
    reg.declare({ id: "s", version: "1.0", description: "s" });
    reg.register("s", "impl-1", async () => "v1");
    reg.unregister("impl-1");
    reg.register("s", "impl-2", async () => "v2");
    expect(await reg.resolve("s", {})).toBe("v2");
  });
});
