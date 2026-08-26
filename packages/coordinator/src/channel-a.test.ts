import { describe, expect, it } from "bun:test";
import { mediate, readTokenFootprint } from "./channel-a";

describe("Channel A fs/read", () => {
  it("mediates reads to bounded pass-by-ref previews", () => {
    const a = mediate("fs/read", { path: "/repo/main.ts" });
    expect(a).toMatchObject({ kind: "read", passByRef: true, previewTokens: 2000 });
  });

  it("refuses reads without a path", () => {
    expect(mediate("fs/read", {})).toMatchObject({ kind: "refused" });
  });
});

describe("Channel A fs/write", () => {
  it("always tickets writes at the boundary", () => {
    const a = mediate("fs/write", { path: "/repo/x.ts", content: "code" });
    expect(a).toMatchObject({ kind: "write", needsTicket: true });
  });
});

describe("Channel A terminal", () => {
  it("guard-1 + audits every terminal create", () => {
    const a = mediate("terminal/create", { command: "ls -la" });
    expect(a).toMatchObject({ kind: "terminal_create", guard1: true, audited: true });
  });

  it("compresses output per config", () => {
    const a = mediate("terminal/output", { sessionId: "s1" });
    expect(a).toMatchObject({ kind: "terminal_output", compress: true });
    const off = mediate("terminal/output", { sessionId: "s1" }, { previewTokens: 2000, passByRef: true, compressTerminal: false });
    expect(off).toMatchObject({ compress: false });
  });
});

describe("readTokenFootprint", () => {
  it("measures the minimization", () => {
    const { injected, saved } = readTokenFootprint(10_000, 2_000, true);
    expect(saved).toBeGreaterThan(7_000);
    expect(injected).toBeLessThan(2_100);
    expect(readTokenFootprint(100, 2000, true).injected).toBe(100 + 24);
    expect(readTokenFootprint(5000, 2000, false).saved).toBe(0);
  });
});
