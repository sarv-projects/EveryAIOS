/**
 * P7.5/J21 — coordinator Guard-2 driving tests.
 *
 * The sidecar talks to Rust over JSON-RPC; these tests inject a fake
 * responder that mimics `GuardService::handle` semantics (estop → block,
 * delete → ask + mint, use → single-use), and assert the helpers send the
 * right method/params and parse the decisions correctly.
 */
import { describe, expect, test } from "bun:test";
import {
  evaluateGuard,
  guardGate,
  setEstop,
  useTicket,
  type GuardRequest,
} from "./guard";

/** A scripted Rust-side responder (mirrors GuardService::handle). */
function fakeRust(): {
  request: GuardRequest;
  calls: Array<{ method: string; params: unknown }>;
  estopPulled: boolean;
  usedTickets: string[];
} {
  const state = {
    calls: [] as Array<{ method: string; params: unknown }>,
    estopPulled: false,
    usedTickets: [] as string[],
  };
  const request: GuardRequest = async (method, params) => {
    state.calls.push({ method, params });
    const p = params as Record<string, unknown>;
    switch (method) {
      case "guard/evaluate": {
        if (state.estopPulled) return { action: "block", reason: "estop pulled" };
        if (p.operation === "delete") return { action: "ask", ticketId: "tkt:1" };
        return { action: "allow" };
      }
      case "guard/use": {
        state.usedTickets.push(String(p.ticketId));
        return { consumed: true };
      }
      case "guard/estop": {
        state.estopPulled = true;
        return { pulled: true };
      }
      case "guard/reset": {
        state.estopPulled = false;
        return { pulled: false };
      }
      default:
        return {};
    }
  };
  return { ...state, request };
}

describe("coordinator Guard-2 driving (J21)", () => {
  test("evaluateGuard sends guard/evaluate and parses ask + ticketId", async () => {
    const { request, calls } = fakeRust();
    const d = await evaluateGuard(request, {
      sessionId: "s1",
      agentId: "a1",
      toolId: "fs.delete",
      operation: "delete",
      argsHash: "h1",
      auditSeq: 7,
      decision: { goal: "rm", risk: "high", affectedPaths: ["/w/x"] },
    });

    expect(d.action).toBe("ask");
    if (d.action === "ask") expect(d.ticketId).toBe("tkt:1");
    expect(calls[0]!.method).toBe("guard/evaluate");
    const body = calls[0]!.params as Record<string, unknown>;
    expect(body.operation).toBe("delete");
    expect(body.argsHash).toBe("h1");
    expect(body.decision).toEqual({ goal: "rm", risk: "high", affectedPaths: ["/w/x"] });
  });

  test("useTicket consumes the minted ticket (executor call-site)", async () => {
    const { request, usedTickets } = fakeRust();
    const ok = await useTicket(request, "tkt:1", "h1");
    expect(ok).toBe(true);
    expect(usedTickets).toEqual(["tkt:1"]);
  });

  test("estop blocks subsequent evaluations", async () => {
    const { request } = fakeRust();
    await setEstop(request, true);
    const d = await guardGate(request, {
      sessionId: "s1",
      agentId: "a1",
      toolId: "fs.delete",
      operation: "delete",
      argsHash: "h2",
    });
    expect(d.action).toBe("block");
  });

  test("non-delete operations auto-allow", async () => {
    const { request } = fakeRust();
    const d = await evaluateGuard(request, {
      sessionId: "s1",
      agentId: "a1",
      toolId: "fs.write",
      operation: "write",
      argsHash: "h3",
    });
    expect(d.action).toBe("allow");
  });
});
