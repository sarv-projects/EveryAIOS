/**
 * Scheduled-task **webhook ingress** (P6.4 — B7; re-scoped by `P71.2c` /
 * `ARCH/AUTOMATION.md` §9).
 *
 * Until `P71.2c` this module was also the *executor*: it ticked
 * `scheduler/due`, reawakened each job's session through its own built-in chat
 * turn (`runChatStream` → `core-engine`) and then recorded the firing. That
 * path assumed an EveryAIOS-owned model, which `ARCH/ADR/0005` retires for v1 —
 * and `ARCH/AUTOMATION.md` §9/§6 are explicit that
 * **agent execution is never the scheduler's**: a firing runs through the
 * session's *bound agent*.
 *
 * The firing therefore lives in the shell (`src-tauri/src/scheduler_fire.rs`),
 * which already owns the trigger plane, the Work gateway and the ACP channel.
 * What remains here is the one piece the Rust core deliberately does not host:
 * the **F11 loopback webhook listener** — `127.0.0.1` only, body validation and
 * occurrence recording still owned by Rust (`scheduler/fire_webhook`).
 *
 * Nothing in this module reasons, executes or holds credentials; it is a
 * transport adapter onto the trigger plane.
 */

/** Outbound JSON-RPC request to Rust. */
type Request = (method: string, params: unknown) => Promise<unknown>;

/** The loopback webhook listener handle (tests call `stop()`; `0` port = not started). */
export interface WebhookIngress {
  start(): void;
  stop(): void;
  webhookPort(): number;
}

/**
 * Start the F11 loopback webhook listener: `127.0.0.1` only, POST bodies
 * forwarded verbatim to Rust, which checks the path against the registered
 * webhook triggers and the required keys against the trigger's schema. A body
 * that matches no trigger (or misses a required key) is a `422`, never a fire.
 */
export function startWebhookIngress(request: Request): WebhookIngress {
  let stopped = false;
  let webhookPort = 0;

  function start(): void {
    if (webhookPort > 0 || stopped) return;
    const port = process.env.EVERYAIOS_WEBHOOK_PORT
      ? Number(process.env.EVERYAIOS_WEBHOOK_PORT)
      : 0;
    try {
      const server = Bun.serve({
        port,
        hostname: "127.0.0.1",
        async fetch(req) {
          if (req.method !== "POST") {
            return new Response("method not allowed", { status: 405 });
          }
          const url = new URL(req.url);
          const raw = await req.text();
          let body: unknown;
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            return new Response("invalid JSON", { status: 400 });
          }
          try {
            const out = (await request("scheduler/fire_webhook", {
              path: url.pathname,
              body,
              now: Math.floor(Date.now() / 1000),
            })) as { fired: string[] };
            return new Response(
              JSON.stringify({ ok: true, fired: out.fired }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          } catch {
            return new Response(JSON.stringify({ ok: false }), {
              status: 422,
              headers: { "content-type": "application/json" },
            });
          }
        },
      });
      webhookPort = server.port ?? 0;
    } catch {
      // No Bun.serve in the test runner / platform without it — non-fatal.
      webhookPort = 0;
    }
  }

  function stop(): void {
    stopped = true;
  }

  return { start, stop, webhookPort: () => webhookPort };
}
