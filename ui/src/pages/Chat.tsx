import { useEffect, useRef, useState } from "react";
import {
  chatCancel,
  chatStream,
  inTauri,
  onChatEvent,
  type ChatWireEvent,
} from "../lib/tauri";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const WELCOME: Msg = {
  role: "assistant",
  text: "EveryAIOS coordinator is standing by. Chat streams through the Rust core → coordinator engine → broker; budget-capped, cancellable, with TTFT + 33ms batch flush (P1.3/P1.4).",
};

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Live bubble id (index into msgs) + accumulated streaming text, kept in a
  // ref so the chat-event listener (registered once) can append without
  // re-subscribing.
  const live = useRef<{ index: number; text: string } | null>(null);

  function appendToLive(more: string) {
    if (!live.current) return;
    live.current.text += more;
    const idx = live.current.index;
    const full = live.current.text;
    setMsgs((m) =>
      m.map((x, i) => (i === idx ? { role: "assistant", text: full } : x)),
    );
  }

  /** Finalize the live bubble (or append a fresh one if no token ever
   *  arrived — e.g. an error/budgetExceeded before the first ttft). */
  function finishLive(finalText?: string) {
    if (live.current) {
      const idx = live.current.index;
      const text = finalText ?? live.current.text;
      setMsgs((m) =>
        m.map((x, i) => (i === idx ? { role: "assistant", text } : x)),
      );
      live.current = null;
    } else if (finalText) {
      // No live bubble yet — surface the terminal message anyway.
      setMsgs((m) => [...m, { role: "assistant", text: finalText }]);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  // P1.4: subscribe once to Rust chat events; each event either appends to the
  // live bubble or finalizes it. Works with an empty sessionId (Rust allocates).
  useEffect(() => {
    if (!inTauri()) return;
    let unsub: (() => void) | undefined;
    void onChatEvent((e: ChatWireEvent) => {
      if (e.type === "ttft") {
        // Time-to-first-token — create the live assistant bubble.
        setMsgs((m) => {
          const next = [...m, { role: "assistant" as const, text: "" }];
          live.current = { index: next.length - 1, text: "" };
          return next;
        });
      } else if (e.type === "batch" && e.text) {
        appendToLive(e.text);
      } else if (e.type === "done") {
        finishLive(e.fullText);
        setBusy(false);
        setStreamId(null);
      } else if (e.type === "error") {
        finishLive(e.message ?? "Stream error");
        setBusy(false);
        setStreamId(null);
      } else if (e.type === "cancelled") {
        finishLive();
        setBusy(false);
        setStreamId(null);
      } else if (e.type === "budgetExceeded") {
        const limit = e.limit ?? 2.0;
        const spent = e.spent ?? 0;
        finishLive(`⛔ stopped: $${spent.toFixed(2)} / $${limit.toFixed(2)} limit reached.`);
        setBusy(false);
        setStreamId(null);
      }
    }).then((u) => {
      unsub = u;
    });
    return () => unsub?.();
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      if (inTauri()) {
        const sid = await chatStream({ sessionId: "", text });
        setStreamId(sid);
      } else {
        // Browser preview (no Tauri) — local echo keeps the UI explorable.
        setMsgs((m) => [...m, { role: "assistant", text: `echo: ${text}` }]);
        setBusy(false);
      }
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: `error: ${String(err)}` },
      ]);
      setBusy(false);
    }
  }

  function cancel() {
    if (streamId) void chatCancel(streamId);
    else {
      finishLive();
      setBusy(false);
    }
  }

  return (
    <div className="page chat-page">
      <header className="page-head">
        <h1>Chat</h1>
        <span className="pill">
          {inTauri() ? "shell connected · streaming" : "preview mode"}
        </span>
      </header>

      <div className="thread">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && !live.current && (
          <div className="bubble assistant typing">…</div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message EveryAIOS…"
          aria-label="Message"
        />
        {busy ? (
          <button type="button" onClick={cancel}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}
