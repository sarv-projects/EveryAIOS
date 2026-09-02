import { CoordinatorClient, defaultRustReplies } from "./lib/protocol.mjs";
import { resolveProvider, streamChatCompletion } from "./lib/provider.mjs";

const provider = resolveProvider();
console.log("provider:", provider?.name, provider?.model);
const c = new CoordinatorClient();
c.on("notification", (m, p) => {
  const line = JSON.stringify(p) ?? "";
  console.log("NOTIF:", m, line.slice(0, 140));
});
c.on("request", (m) => console.log("REQ:", m));
c.on("stderr", (s) => console.log("STDERR:", s.trim().slice(0, 200)));
defaultRustReplies(c, {
  providerStreamHandler: async (params) => {
    console.log("PROVIDER-CALL: stream", params.model, params.messages.length, "messages");
    await streamChatCompletion(provider, Array.isArray(params.messages) ? params.messages : [], {
      onDelta: (t) => c.notify("chat/provider_chunk", { streamId: params.streamId, delta: t }),
      onDone: (u) => {
        c.notify("chat/provider_chunk", { streamId: params.streamId, ended: true });
      },
    });
    console.log("PROVIDER-CALL: done");
  },
});
await c.waitForNotification("session/ready");
console.log("--- ready ---");
await c.request("initialize", { protocolVersion: 1 });
console.log("--- sending chat/stream ---");
const ack = await c.request("chat/stream", {
  sessionId: "dbg-s2",
  streamId: "dbg-st2",
  text: "Reply with exactly the word: hello",
  surface: "chat",
  provider: "nvidia",
  model: provider.model,
});
console.log("ack:", JSON.stringify(ack));
await new Promise((r) => setTimeout(r, 45_000));
console.log("--- probe end ---");
await c.kill();
