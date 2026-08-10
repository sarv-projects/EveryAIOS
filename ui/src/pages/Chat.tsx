import { useEffect, useRef, useState } from "react";
import { inTauri, invoke } from "../lib/tauri";

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const WELCOME: Msg = {
  role: "assistant",
  text: "EveryAIOS coordinator is standing by. Engine stages (chat, memory, office, connectors) plug in from P1 — the shell already talks to the Rust core.",
};

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      if (inTauri()) {
        // Prove the Tauri → Rust bridge: the core's boot banner answers.
        const v = await invoke<string>("version");
        setMsgs((m) => [
          ...m,
          { role: "assistant", text: `core: ${v.split("(")[0].trim()}` },
        ]);
      } else {
        throw new Error("preview");
      }
    } catch {
      // Browser preview (no Tauri) — local echo keeps the UI explorable.
      setMsgs((m) => [...m, { role: "assistant", text: `echo: ${text}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page chat-page">
      <header className="page-head">
        <h1>Chat</h1>
        <span className="pill">{inTauri() ? "shell connected" : "preview mode"}</span>
      </header>

      <div className="thread">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="bubble assistant typing">…</div>}
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
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
