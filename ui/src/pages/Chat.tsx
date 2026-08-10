import { useEffect, useRef, useState } from "react";
import {
  chatCancel,
  chatStream,
  inTauri,
  onChatEvent,
  type ChatWireEvent,
} from "../lib/tauri";
import Markdown from "../components/Markdown";

/** Persona presets — mirror of core-ai PERSONA_PRESETS (P1.5 A-7). */
const PERSONAS: Record<string, string> = {
  "straight-shooter": "Direct and blunt. Short sentences. Skip small talk.",
  warm: "Warm and friendly. Polite, encouraging, natural.",
  coach: "Socratic. Guiding questions, explains the why, ends with an action step.",
  terse: "One-sentence answers. No greetings, no sign-offs.",
};

const DEFAULT_PERSONA = "straight-shooter";
const CUSTOM_SOUL = "__custom_soul__";
const CONTEXT_WINDOW = 128_000; // nominal context window for the % gauge

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
}

let msgId = 0;

const WELCOME: Msg = {
  id: -1,
  role: "assistant",
  text: "EveryAIOS coordinator is standing by. Chat streams through the Rust core → coordinator engine → broker with a byte-stable prompt prefix, J11 budget cap, and cancellable 33ms-batched streaming (P1.3–P1.6).",
};

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [persona, setPersona] = useState<string>(DEFAULT_PERSONA);
  const [soulMd, setSoulMd] = useState<string>("");
  const [showSoul, setShowSoul] = useState(false);
  const [forkMark, setForkMark] = useState<number | null>(null);
  // Token streamer state.
  const [tokensSec, setTokensSec] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [activeKey, setActiveKey] = useState<string>("—");

  const endRef = useRef<HTMLDivElement>(null);
  const live = useRef<{ index: number; text: string } | null>(null);
  // Token-rate sliding window: {t, tokens} samples.
  const rateSamples = useRef<Array<{ t: number; tokens: number }>>([]);

  function appendToLive(more: string, tokenCount: number) {
    if (!live.current) return;
    live.current.text += more;
    const idx = live.current.index;
    const full = live.current.text;
    setMsgs((m) =>
      m.map((x, i) =>
        i === idx ? { id: x.id, role: "assistant" as const, text: full } : x,
      ),
    );
    if (tokenCount > 0) {
      const now = performance.now();
      rateSamples.current.push({ t: now, tokens: tokenCount });
      // Drop samples older than 3s; rate = tokens in window / seconds.
      rateSamples.current = rateSamples.current.filter(
        (s) => now - s.t <= 3000,
      );
      const win = rateSamples.current;
      if (win.length >= 2) {
        const dt = (win[win.length - 1].t - win[0].t) / 1000;
        const tokens = win.reduce((a, s) => a + s.tokens, 0);
        setTokensSec(dt > 0 ? Math.round(tokens / dt) : 0);
      }
    }
  }

  function finishLive(finalText?: string) {
    if (live.current) {
      const idx = live.current.index;
      const text = finalText ?? live.current.text;
      setMsgs((m) =>
        m.map((x, i) =>
          i === idx ? { id: x.id, role: "assistant" as const, text } : x,
        ),
      );
      live.current = null;
    } else if (finalText) {
      setMsgs((m) => [
        ...m,
        { id: msgId++, role: "assistant" as const, text: finalText },
      ]);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  // P1.4/P1.6: subscribe once to Rust chat events.
  useEffect(() => {
    if (!inTauri()) return;
    let unsub: (() => void) | undefined;
    void onChatEvent((e: ChatWireEvent) => {
      if (e.type === "ttft") {
        setMsgs((m) => {
          const next = [...m, { id: msgId++, role: "assistant" as const, text: "" }];
          live.current = { index: next.length - 1, text: "" };
          return next;
        });
      } else if (e.type === "batch" && e.text) {
        appendToLive(e.text, e.tokenCount ?? 0);
      } else if (e.type === "done") {
        finishLive(e.fullText);
        if (e.totalTokens) setTotalTokens(e.totalTokens);
        setBusy(false);
        setStreamId(null);
        setTokensSec(0);
      } else if (e.type === "error") {
        finishLive(e.message ?? "Stream error");
        setBusy(false);
        setStreamId(null);
        setTokensSec(0);
      } else if (e.type === "cancelled") {
        finishLive();
        setBusy(false);
        setStreamId(null);
        setTokensSec(0);
      } else if (e.type === "budgetExceeded") {
        const limit = e.limit ?? 2.0;
        const spent = e.spent ?? 0;
        finishLive(`⛔ stopped: $${spent.toFixed(2)} / $${limit.toFixed(2)} limit reached.`);
        setBusy(false);
        setStreamId(null);
        setTokensSec(0);
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
    setMsgs((m) => [...m, { id: msgId++, role: "user", text }]);
    setBusy(true);
    setActiveKey("nvidia / meta/llama");
    rateSamples.current = [];
    try {
      if (inTauri()) {
        const sid = await chatStream({
          sessionId: "",
          text,
          personaId: persona === CUSTOM_SOUL ? DEFAULT_PERSONA : persona,
          ...(persona === CUSTOM_SOUL && soulMd.trim()
            ? { soulMd: soulMd.trim() }
            : {}),
        });
        setStreamId(sid);
      } else {
        setMsgs((m) => [
          ...m,
          {
            id: msgId++,
            role: "assistant",
            text: `echo: ${text}\n\n> preview mode — start the Tauri shell for real streaming (persona: **${persona}**).`,
          },
        ]);
        setBusy(false);
      }
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { id: msgId++, role: "assistant" as const, text: `error: ${String(err)}` },
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

  /** P1.6 — fork from any message: truncate history at that message. */
  function forkAt(index: number) {
    if (busy) return;
    setMsgs((m) => m.slice(0, index + 1));
    setForkMark(index);
    setTotalTokens(0);
    setTokensSec(0);
    rateSamples.current = [];
  }

  const contextPct = Math.min(
    100,
    Math.round((totalTokens / CONTEXT_WINDOW) * 100),
  );

  return (
    <div className="page chat-page">
      <header className="page-head">
        <h1>Chat</h1>
        <div className="chat-tools">
          {/* P1.6 — persona selector (A-7 presets + Hermes SOUL.md, B-2). */}
          <label className="persona-wrap">
            <span className="pill pill-label">persona</span>
            <select
              value={persona}
              onChange={(e) => {
                const v = e.target.value;
                setPersona(v);
                setShowSoul(v === CUSTOM_SOUL);
              }}
              aria-label="Persona"
            >
              {Object.keys(PERSONAS).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
              <option value={CUSTOM_SOUL}>custom SOUL.md…</option>
            </select>
          </label>
          <span className="pill">
            {inTauri() ? "shell connected · streaming" : "preview mode"}
          </span>
        </div>
      </header>

      {/* P1.6 — Hermes SOUL.md identity editor (Slot #1, injection-scanned in Rust/sidecar). */}
      {showSoul && (
        <section className="card soul-card">
          <h2>SOUL.md identity (Hermes Slot #1)</h2>
          <textarea
            value={soulMd}
            onChange={(e) => setSoulMd(e.target.value)}
            placeholder={"You are EveryAIOS. Core rule: …\nIdentity: …"}
            rows={4}
            aria-label="SOUL.md content"
          />
          <p className="hint">
            Injected above the stable prefix and scanned for prompt-injection
            patterns (doc 16 §38, B-16) before assembly.
          </p>
        </section>
      )}

      <div className="thread">
        {msgs.map((m, i) => (
          <div key={m.id}>
            {forkMark === i && (
              <div className="fork-chip">✦ forked — continuing from here</div>
            )}
            <div className={`bubble ${m.role}`}>
              {m.role === "assistant" ? (
                <Markdown text={m.text} />
              ) : (
                <span className="user-text">{m.text}</span>
              )}
              {i > 0 && !busy && (
                <button
                  className="fork-btn"
                  onClick={() => forkAt(i)}
                  title="Fork conversation from this message"
                  aria-label="Fork from this message"
                >
                  ⑂
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && !live.current && (
          <div className="bubble assistant typing">…</div>
        )}
        <div ref={endRef} />
      </div>

      {/* P1.6 — token streamer: tokens/sec, context %, active key. */}
      <div className="streamer">
        <span className="streamer-item">
          <span className="streamer-label">tokens/s</span>
          <span className="streamer-value">{busy ? tokensSec : 0}</span>
        </span>
        <span className="streamer-item" title={`${totalTokens} / ${CONTEXT_WINDOW} tokens`}>
          <span className="streamer-label">context</span>
          <span className="streamer-bar">
            <span
              className="streamer-fill"
              style={{ width: `${contextPct}%` }}
            />
          </span>
          <span className="streamer-value">{contextPct}%</span>
        </span>
        <span className="streamer-item">
          <span className="streamer-label">active key</span>
          <span className="streamer-value streamer-key">{activeKey}</span>
        </span>
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
