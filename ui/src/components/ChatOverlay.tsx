import { useState } from "react";
import { chatStream, inTauri } from "../lib/tauri";

/**
 * P4.7 (H5) — collapsible chat overlay on an open document. The question is
 * dispatched as a page-scoped chat turn (the document context line is
 * prepended); the streamed answer lands in the main Chat page.
 */
export default function ChatOverlay({ scope }: { scope: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const tauri = inTauri();

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    if (tauri) {
      try {
        await chatStream({
          sessionId: "office-overlay",
          text: `About the open document (${scope}):\n${q}`,
        });
      } catch (e) {
        setSent(`failed: ${String(e)}`);
        return;
      }
    }
    setSent(q);
    setQuestion("");
  };

  return (
    <div className={`chat-overlay${open ? " open" : ""}`}>
      <button className="ghost chat-overlay-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "Close" : "Ask about this document"}
      </button>
      {open && (
        <div className="chat-overlay-body">
          <textarea
            className="chat-overlay-input"
            placeholder="Ask a page-scoped question…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
          />
          <button className="primary small" onClick={() => void ask()} disabled={!question.trim()}>
            Ask
          </button>
          {sent && <p className="muted small">{tauri ? `sent: ${sent}` : `preview: ${sent}`}</p>}
        </div>
      )}
    </div>
  );
}
