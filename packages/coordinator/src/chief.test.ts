import { describe, expect, test, beforeEach } from "bun:test";
import {
  buildResumePrompt,
  checkSpawn,
  chiefRegistry,
  deriveChildPermissions,
  governanceBadge,
  injectChiefContext,
  resolveChiefId,
  resolveSessionChief,
  validateSessionChiefPin,
  type SpawnState,
} from "./chief";

describe("resolveSessionChief — per-session pin precedence", () => {
  beforeEach(() => {
    // Module-singleton registry: clear any pin a prior test may have left on
    // the session ids this suite touches.
    chiefRegistry.clearSessionPin("s-pin");
    chiefRegistry.clearSessionPin("s2");
  });

  test("session pin outranks the user default", () => {
    chiefRegistry.setSessionPin("s-pin", "codex");
    const pin = chiefRegistry.sessionPin("s-pin");
    expect(pin).toBe("codex");
    expect(
      resolveSessionChief({
        ...(pin !== undefined ? { sessionPin: pin } : {}),
        userDefault: "claude-code",
      }),
    ).toBe("codex");
  });

  test("no pin → user default → inbuilt", () => {
    expect(resolveSessionChief({ userDefault: "claude-code" })).toBe("claude-code");
    expect(resolveSessionChief({})).toBe("inbuilt");
  });

  test("P53.3 installed-any Chief: any non-empty pin pins (no enum gate)", () => {
    expect(chiefRegistry.setSessionPin("s-pin", "grok")).toBe("grok");
    expect(chiefRegistry.sessionPin("s-pin")).toBe("grok");
    chiefRegistry.clearSessionPin("s-pin");
    expect(chiefRegistry.setSessionPin("s-pin", "not-a-chief")).toBe("not-a-chief");
    expect(chiefRegistry.sessionPin("s-pin")).toBe("not-a-chief");
  });

  test("empty pin refuses fail-closed (would silently read as no pin)", () => {
    chiefRegistry.clearSessionPin("s-pin");
    expect(() => validateSessionChiefPin("")).toThrow(/fail-closed/);
    expect(() => chiefRegistry.setSessionPin("s-pin", "")).toThrow(/fail-closed/);
    expect(chiefRegistry.sessionPin("s-pin")).toBeUndefined();
  });

  test("setSessionPin keeps the Work-survives-Chief record in sync", () => {
    chiefRegistry.record({
      sessionId: "s-pin",
      chiefId: "inbuilt",
      governance: { kind: "mediated", fs: true, terminal: true },
      lastCompletedTurn: 3,
      configHash: "abc",
    });
    chiefRegistry.setSessionPin("s-pin", "codex");
    expect(chiefRegistry.get("s-pin")?.chiefId).toBe("codex");
    expect(chiefRegistry.get("s-pin")?.lastCompletedTurn).toBe(3);
  });
});

describe("resolveChiefId — installed-any resolution (P53.3)", () => {
  test("explicit session value wins (any non-empty id, not an enum)", () => {
    expect(resolveChiefId("codex", "inbuilt")).toBe("codex");
    expect(resolveChiefId("claude-code", "inbuilt")).toBe("claude-code");
    expect(resolveChiefId("grok", "inbuilt")).toBe("grok");
    expect(resolveChiefId("opencode", "codex")).toBe("opencode");
  });

  test("falls back to the user default then inbuilt", () => {
    expect(resolveChiefId(undefined, "codex")).toBe("codex");
    expect(resolveChiefId(undefined, "grok")).toBe("grok");
    expect(resolveChiefId(undefined, undefined)).toBe("inbuilt");
    expect(resolveChiefId(undefined, "inbuilt")).toBe("inbuilt");
    expect(resolveChiefId("", undefined)).toBe("inbuilt");
    expect(resolveChiefId("", "codex")).toBe("codex");
  });
});

describe("injectChiefContext — passport + taste in both paths", () => {
  test("injects passport, taste, and governance into the initial prompt", () => {
    const out = injectChiefContext(
      {
        passport: "user prefers concise replies",
        taste: "typescript, minimal deps",
        governance: { kind: "mediated", fs: true, terminal: true },
      },
      "You are the chief.",
    );
    expect(out).toContain("Memory passport");
    expect(out).toContain("user prefers concise replies");
    expect(out).toContain("Taste profile");
    expect(out).toContain("Governed-Mediated");
  });
});

describe("SubagentPolicy — delegation limits (B3)", () => {
  const base: SpawnState = {
    depth: 1,
    active: 0,
    stepsUsed: 0,
    parentPermissions: new Set(["read", "edit"]),
    denies: new Set(),
    grants: new Set(),
  };

  test("depth ≤2 is enforced", () => {
    expect(checkSpawn({ ...base, depth: 0 }).allowed).toBe(true);
    expect(checkSpawn({ ...base, depth: 1 }).allowed).toBe(true);
    const v = checkSpawn({ ...base, depth: 2 });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toContain("depth");
  });

  test("concurrency ≤6 is enforced", () => {
    expect(checkSpawn({ ...base, active: 5 }).allowed).toBe(true);
    const v = checkSpawn({ ...base, active: 6 });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toContain("concurrency");
  });

  test("chain budget is enforced", () => {
    const v = checkSpawn({ ...base, stepsUsed: 1000 });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toContain("budget");
  });

  test("derived child permissions = parent ∩ deny + grants", () => {
    const child = deriveChildPermissions({
      ...base,
      denies: new Set(["edit"]),
      grants: new Set(["delete"]),
    });
    expect(child.has("read")).toBe(true);
    expect(child.has("edit")).toBe(false);
    expect(child.has("delete")).toBe(true);
  });
});

describe("ChiefRegistry — Work survives Chief death", () => {
  test("swap keeps the intent/plan/receipt chain", () => {
    chiefRegistry.record({
      sessionId: "s1",
      chiefId: "inbuilt",
      governance: { kind: "not_governed" },
      lastCompletedTurn: 7,
      configHash: "abc123def456",
    });
    const next = chiefRegistry.swap("s1", "claude-code", {
      kind: "self_contained",
      channelB: true,
    });
    expect(next?.chiefId).toBe("claude-code");
    // The Work chain is untouched — same config hash + completed turns.
    expect(next?.configHash).toBe("abc123def456");
    expect(next?.lastCompletedTurn).toBe(7);
  });

  test("resume prompt continues without re-explanation", () => {
    const resume = buildResumePrompt(
      {
        sessionId: "s1",
        chiefId: "claude-code",
        governance: { kind: "self_contained", channelB: true },
        lastCompletedTurn: 7,
        configHash: "abc123def456",
      },
      "Ship the parser",
      "checkpoint 3 done; receipt #42 committed",
    );
    expect(resume).toContain("do not re-explain");
    expect(resume).toContain("checkpoint 3 done");
  });
});
