import { describe, expect, test } from "bun:test";
import { runWithReflection, suggestedCheckFor } from "./reflection";
import {
  decodeAgui,
  dispatchAguiLine,
  encodeAgui,
  isArtifact,
  isInterrupt,
  isToolCall,
  onAguiEvent,
} from "./agui";

describe("P11.5.11 AG-UI live transport", () => {
  test("notifyAgui encodes a decodable wire line", () => {
    // notifyAgui writes to stdout in production; here we verify the codec
    // contract it uses is byte-compatible with the Rust twin (decodeAgui).
    const line = encodeAgui("tool_call_created", "s1", {
      call_id: "t1",
      name: "read_file",
      args: { path: "a.rs" },
      state: "running",
    });
    const env = decodeAgui(line);
    expect(isToolCall(env)).toBe(true);
    expect((env!.data as { name?: string }).name).toBe("read_file");
  });

  test("dispatchAguiLine routes to registered handlers", () => {
    const seen: string[] = [];
    const off = onAguiEvent("interrupt_resolved", (env) => {
      seen.push((env.data as { interrupt_id?: string }).interrupt_id ?? "");
    });
    const line = encodeAgui("interrupt_resolved", "i1", { interrupt_id: "i1" });
    expect(dispatchAguiLine(line)).toBe(true);
    expect(seen).toEqual(["i1"]);
    off();
    // Unregistered after unsubscribe → unhandled.
    expect(dispatchAguiLine(line)).toBe(false);
  });

  test("dispatchAguiLine tolerates malformed or unhandled lines", () => {
    expect(dispatchAguiLine("not json")).toBe(false);
    expect(dispatchAguiLine(encodeAgui("session_created", "x", { session_id: "s" }))).toBe(false);
  });

  test("artifact events decode with kind + version", () => {
    const line = encodeAgui("artifact_created", "s1", {
      artifact_id: "art-1",
      version: 1,
      kind: "mermaid",
      payload: { title: "flow", format: "mermaid" },
    });
    expect(isArtifact(decodeAgui(line))).toBe(true);
  });
});

describe("P11.5.9 lint/test reflection", () => {
  test("passes on first attempt", async () => {
    const r = await runWithReflection(async () => ({ code: 0, output: "clean" }));
    expect(r.passed).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.fixPrompt).toBe("");
  });

  test("retries on failure with escalating fix prompts", async () => {
    let calls = 0;
    const prompts: string[] = [];
    const r = await runWithReflection(async (fix) => {
      calls++;
      prompts.push(fix);
      return { code: 1, output: `error TS2304: 'x' not found (run ${calls})` };
    });
    expect(r.passed).toBe(false);
    expect(calls).toBe(4); // 1 + 3 retries
    expect(r.fixPrompt).toContain("4/4");
    // The FIRST run has no prior diagnostics (empty prompt); every RETRY
    // carries the escalating fix prompt with the quoted diagnostics.
    expect(prompts[0]).toBe("");
    for (let i = 1; i < prompts.length; i++) {
      expect(prompts[i]!.length).toBeGreaterThan(0);
      expect(prompts[i]).toContain("error TS2304");
      expect(prompts[i]).toContain(`${i}/${4}`);
    }
  });

  test("passes on a later retry", async () => {
    let calls = 0;
    const r = await runWithReflection(async () => {
      calls++;
      return calls >= 2 ? { code: 0, output: "ok" } : { code: 1, output: "still broken" };
    });
    expect(r.passed).toBe(true);
    expect(calls).toBe(2);
  });

  test("tolerate regex passes", async () => {
    const r = await runWithReflection(
      async () => ({ code: 1, output: "3 warnings, 0 errors" }),
      { tolerate: /0 errors/ },
    );
    expect(r.passed).toBe(true);
  });

  test("suggests the right check per language", () => {
    expect(suggestedCheckFor("a.rs")).toBe("cargo check --message-format short");
    expect(suggestedCheckFor("a.ts")).toBe("tsc --noEmit");
    expect(suggestedCheckFor("a.py")).toBe("python -m py_compile");
  });
});

describe("P11.5.11 AG-UI wire protocol", () => {
  test("round-trips every event type", () => {
    for (const t of [
      "user_message_created",
      "assistant_message_created",
      "assistant_message_delta",
      "tool_call_created",
      "tool_call_delta",
      "tool_call_result",
      "agent_message",
      "agent_state_changed",
      "artifact_created",
      "artifact_updated",
      "interrupt_created",
      "interrupt_resolved",
      "session_created",
      "session_updated",
      "error",
      "done",
    ] as const) {
      const line = encodeAgui(t, "id-1", { hello: 1 });
      const decoded = decodeAgui(line);
      expect(decoded?.type).toBe(t);
      expect(decoded?.id).toBe("id-1");
    }
  });

  test("rejects malformed lines (never throws)", () => {
    expect(decodeAgui("not json")).toBeNull();
    expect(decodeAgui('{"type":"unknown_thing","id":"x","ts":"t","data":{}}')).toBeNull();
    expect(decodeAgui('{"type":"done","data":{}}')).toBeNull(); // missing id/ts
  });

  test("narrowing helpers work", () => {
    const tool = decodeAgui(encodeAgui("tool_call_created", "t1", { call_id: "c", name: "read", args: {} }));
    expect(isToolCall(tool)).toBe(true);
    const art = decodeAgui(encodeAgui("artifact_updated", "a1", { artifact_id: "a", version: 2, kind: "html", payload: {} }));
    expect(isArtifact(art)).toBe(true);
    const intr = decodeAgui(encodeAgui("interrupt_created", "i1", { interrupt_id: "i", kind: "permission", title: "t", description: "d", options: [] }));
    expect(isInterrupt(intr)).toBe(true);
    const done = decodeAgui(encodeAgui("done", "d1", {}));
    expect(isToolCall(done)).toBe(false);
  });

  test("artifact version bumps ride artifact_updated", () => {
    const line = encodeAgui("artifact_updated", "a1", { artifact_id: "a", version: 3, kind: "mermaid", payload: "graph TD; A-->B" });
    const e = decodeAgui(line);
    expect(isArtifact(e) && e.data.version).toBe(3);
  });
});
