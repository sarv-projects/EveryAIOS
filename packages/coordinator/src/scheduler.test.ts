import { test, expect, mock } from "bun:test";
import { startWebhookIngress, webhookIdempotencyKey } from "./scheduler";
import * as schedulerModule from "./scheduler";

/** Build a scripted Rust-side fake that answers scheduler/* from an in-memory map. */
function scriptedRust() {
  const calls: string[] = [];
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const request = mock(async (method: string, params: unknown) => {
    calls.push(method);
    const p = (params ?? {}) as Record<string, unknown>;
    requests.push({ method, params: p });
    switch (method) {
      case "scheduler/fire_webhook":
        return { fired: [String(p.path)] };
      default:
        return {};
    }
  });
  return { request, calls, requests };
}

test("webhook listener answers POST and forwards to scheduler/fire_webhook", async () => {
  const r = scriptedRust();
  const ingress = startWebhookIngress(r.request);
  ingress.start();
  const port = ingress.webhookPort();

  // In the test runner Bun.serve may be unavailable — then the port is 0 and
  // the listener is a no-op (non-fatal by design). Only assert when it exists.
  if (port > 0) {
    const res = await fetch(`http://127.0.0.1:${port}/hooks/ci`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "delivery-ci-1",
      },
      body: JSON.stringify({ ref: "main", sha: "abc" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; fired: string[] };
    expect(body.ok).toBe(true);
    expect(body.fired).toEqual(["/hooks/ci"]);
    expect(r.calls).toContain("scheduler/fire_webhook");
    expect(r.requests.at(-1)?.params.idempotencyKey).toBe("delivery-ci-1");
  }
  ingress.stop();
});

test("webhook ingress requires a caller key and preserves explicit header/body keys", () => {
  const headerRequest = new Request("http://127.0.0.1/hooks/ci", {
    headers: { "Idempotency-Key": "  delivery-header-1  " },
  });
  expect(webhookIdempotencyKey(headerRequest, { ref: "main" })).toBe("delivery-header-1");

  const bodyRequest = new Request("http://127.0.0.1/hooks/ci");
  expect(webhookIdempotencyKey(bodyRequest, { deliveryId: "delivery-body-1" })).toBe(
    "delivery-body-1",
  );

  expect(() => webhookIdempotencyKey(new Request("http://127.0.0.1/hooks/ci"), {})).toThrow(
    /requires a caller idempotency key/,
  );
  expect(() =>
    webhookIdempotencyKey(headerRequest, { deliveryId: "different-delivery" }),
  ).toThrow(/conflict/);
});

test("webhook listener rejects a new request without an idempotency key", async () => {
  const r = scriptedRust();
  const ingress = startWebhookIngress(r.request);
  ingress.start();
  const port = ingress.webhookPort();

  if (port > 0) {
    const res = await fetch(`http://127.0.0.1:${port}/hooks/ci`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: "main", sha: "abc" }),
    });
    expect(res.status).toBe(400);
    expect(r.calls).not.toContain("scheduler/fire_webhook");
  }
  ingress.stop();
});

test("webhook listener rejects non-POST and malformed JSON", async () => {
  const r = scriptedRust();
  const ingress = startWebhookIngress(r.request);
  ingress.start();
  const port = ingress.webhookPort();

  if (port > 0) {
    const get = await fetch(`http://127.0.0.1:${port}/hooks/ci`);
    expect(get.status).toBe(405);

    const bad = await fetch(`http://127.0.0.1:${port}/hooks/ci`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(bad.status).toBe(400);
    // A rejected body never reaches the trigger plane.
    expect(r.calls).not.toContain("scheduler/fire_webhook");
  }
  ingress.stop();
});

test("an unmatched body is a 422 from Rust, never a fire", async () => {
  const request = mock(async (method: string) => {
    if (method === "scheduler/fire_webhook") throw new Error("no trigger");
    return {};
  });
  const ingress = startWebhookIngress(request);
  ingress.start();
  const port = ingress.webhookPort();
  if (port > 0) {
    const res = await fetch(`http://127.0.0.1:${port}/nope`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deliveryId: "unmatched-1" }),
    });
    expect(res.status).toBe(422);
  }
  ingress.stop();
});

test("the sidecar owns no firing path — the host does", () => {
  // P71.2c: no due ticker, no execution pass, no monitor verdict here. The
  // sidecar's whole scheduler surface is the webhook ingress; firing lives in
  // `src-tauri/src/scheduler_fire.rs` (ARCH/AUTOMATION.md §9).
  expect(Object.keys(schedulerModule).sort()).toEqual([
    "startWebhookIngress",
    "webhookIdempotencyKey",
  ]);
});
