import { CoordinatorClient, defaultRustReplies } from "./lib/protocol.mjs";
import { resolveProvider, streamChatCompletion } from "./lib/provider.mjs";

const provider = resolveProvider();
const c = new CoordinatorClient();
c.on("notification", (m, p) => {
  if (["chat/ttft", "chat/batch", "chat/done", "chat/error", "chat/cancelled", "chat/stage"].includes(m)) {
    console.log("NOTIF:", m, JSON.stringify(p).slice(0, 120));
  }
});
c.on("request", (m) => console.log("REQ:", m));
defaultRustReplies(c, {
  providerStreamHandler: async (params) => {
    await streamChatCompletion(provider, Array.isArray(params.messages) ? params.messages : [], {
      preferredModel: params.model,
      onDelta: (t) => c.notify("chat/provider_chunk", { streamId: params.streamId, delta: t }),
      onDone: () => c.notify("chat/provider_chunk", { streamId: params.streamId, ended: true }),
    });
  },
});
await c.waitForNotification("session/ready");
await c.request("initialize", { protocolVersion: 1 });
const ack = await c.request("chat/stream", {
  sessionId: "dbg-c1", streamId: "dbg-cs1",
  text: "Write a 200-word essay about the history of typewriters.",
  surface: "chat", provider: "nvidia", model: provider.models[0],
});
console.log("ack:", JSON.stringify(ack));
// wait for first batch
await new Promise((r) => setTimeout(r, 25_000));
console.log("--- sending chat/cancel ---");
c.notify("chat/cancel", { streamId: "dbg-cs1" });
await new Promise((r) => setTimeout(r, 8_000));
console.log("--- end probe ---");
await c.kill();
