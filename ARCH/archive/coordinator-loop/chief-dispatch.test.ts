// P38 (spec §4.2.5a §1/§2) — the coordinator's single Chief dispatch through
// the ChiefAdapter interface (TS mirror of `everyaios-acp::ChiefAdapter`).
// The coordinator owns the inbuilt engine; a session pinned to an external
// ACP Chief must never silently run inbuilt. `chiefAdapterFor(chiefId)` builds
// the adapter, `runChatStream` dispatches through it, and the external
// adapter refuses with an honest routing instruction so the turn goes through
// the ACP channel (`acp_prompt`) instead.

import { describe, expect, test } from "bun:test";
import {
  dispatchByChief,
  chiefAdapterFor,
  ExternalChiefAdapter,
  InbuiltChiefAdapter,
  runChatStream,
  type ChatEvent,
  type ProviderBridge,
  type ChatStreamParams,
} from "./chat";
import { chiefRegistry } from "./chief";

const PARAMS: ChatStreamParams = {
  sessionId: "s1",
  streamId: "st-1",
  text: "hi",
  surface: "chat",
};

function scriptedBridge(): ProviderBridge {
  return {
    async *streamChat() {
      throw new Error("bridge must not be called when an external Chief is refused");
    },
  };
}

describe("chiefAdapterFor — adapter selection", () => {
  test("inbuilt Chief resolves to the inbuilt engine adapter", () => {
    expect(chiefAdapterFor("inbuilt")).toBeInstanceOf(InbuiltChiefAdapter);
  });

  test("external ACP Chief resolves to the external adapter (never inbuilt)", () => {
    const a = chiefAdapterFor("codex");
    expect(a).toBeInstanceOf(ExternalChiefAdapter);
    expect(a.chiefId).toBe("codex");
  });

  test("unknown Chief id lands on the external adapter and is refused — no silent fallback", () => {
    const a = chiefAdapterFor("ghost-chief");
    expect(a).toBeInstanceOf(ExternalChiefAdapter);
    expect(a.chiefId).toBe("ghost-chief");
  });
});

describe("ExternalChiefAdapter.runTurn — honest routing refusal", () => {
  test("emits chief:refused stage + routing error, never touches the bridge", async () => {
    const events: ChatEvent[] = [];
    await new ExternalChiefAdapter("codex").runTurn({
      params: { ...PARAMS, primaryChief: "codex" },
      emit: (e) => events.push(e),
      bridge: scriptedBridge(),
      batchIntervalMs: 10,
    });
    expect(events.some((e) => e.type === "stage" && e.stage.includes("chief:refused"))).toBe(true);
    const err = events.find((e) => e.type === "error");
    expect(err).toBeDefined();
    expect((err as { code?: string }).code).toBe("routing");
  });
});

describe("runChatStream — dispatches through the adapter", () => {
  test("inbuilt Chief runs the engine (no refusal events)", async () => {
    const events: ChatEvent[] = [];
    let bridgeCalled = false;
    const bridge: ProviderBridge = {
      async *streamChat() {
        bridgeCalled = true;
        yield { type: "text", text: "ok" };
        yield { type: "done" };
      },
    };
    await runChatStream(
      { ...PARAMS, primaryChief: "inbuilt", provider: "nvidia", model: "m" },
      (e) => events.push(e),
      bridge,
      10,
    );
    expect(bridgeCalled).toBe(true);
    expect(events.some((e) => e.type === "done" || e.type === "error")).toBe(true);
    expect(events.some((e) => e.type === "error" && (e as { code?: string }).code === "routing")).toBe(false);
  });

  test("external Chief is refused through the adapter — bridge never runs", async () => {
    const events: ChatEvent[] = [];
    await runChatStream(
      { ...PARAMS, primaryChief: "claude-code" },
      (e) => events.push(e),
      scriptedBridge(),
      10,
    );
    expect(events.some((e) => e.type === "error" && (e as { code?: string }).code === "routing")).toBe(true);
  });

  test("absent wire Chief falls back to the registry pin (Work-survives-Chief)", async () => {
    chiefRegistry.setSessionPin("s-pinned", "codex");
    try {
      const events: ChatEvent[] = [];
      await runChatStream(
        { ...PARAMS, sessionId: "s-pinned", streamId: "st-2" },
        (e) => events.push(e),
        scriptedBridge(),
        10,
      );
      expect(events.some((e) => e.type === "error" && (e as { code?: string }).code === "routing")).toBe(true);
    } finally {
      chiefRegistry.clearSessionPin("s-pinned");
    }
  });

  test("wire Chief pin is learned into the registry for later RPC reads", async () => {
    chiefRegistry.clearSessionPin("s-pin2");
    try {
      const events: ChatEvent[] = [];
      await runChatStream(
        { ...PARAMS, sessionId: "s-pin2", primaryChief: "codex" },
        (e) => events.push(e),
        scriptedBridge(),
        10,
      );
      expect(chiefRegistry.sessionPin("s-pin2")).toBe("codex");
    } finally {
      chiefRegistry.clearSessionPin("s-pin2");
    }
  });
});

describe("dispatchByChief — decision helper (kept for RPC/testing callers)", () => {
  test("inbuilt Chief dispatches through the coordinator engine", () => {
    const d = dispatchByChief({ chiefId: "inbuilt" });
    expect(d.refused).toBeUndefined();
    expect(d.chiefId).toBe("inbuilt");
  });

  test("external ACP Chief is refused — never silently runs inbuilt", () => {
    const d = dispatchByChief({ chiefId: "codex" });
    expect(d.refused).toBe(true);
    expect(d.reason).toContain("codex");
    expect(d.reason).toContain("acp_prompt");
    expect(d.reason).toContain("silently");
  });
});