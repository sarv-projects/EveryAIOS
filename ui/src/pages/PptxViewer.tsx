import { useEffect, useState } from "react";
import ChatOverlay from "../components/ChatOverlay";
import { demoPptx, pptxOpen, type PptxPayload } from "../lib/office";
import { inTauri } from "../lib/tauri";

export default function PptxViewer() {
  const [path, setPath] = useState("");
  const [deck, setDeck] = useState<PptxPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tauri = inTauri();

  const open = async () => {
    setError(null);
    if (!tauri) {
      setDeck(demoPptx);
      return;
    }
    setLoading(true);
    try {
      setDeck(await pptxOpen(path));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tauri) setDeck(demoPptx);
  }, [tauri]);

  return (
    <div className="pptview">
      <header className="spreadsheet-head">
        <div>
          <h2 className="panel-title">Slides</h2>
          <p className="muted small">PowerPoint part-editor render (D3) — slides as styled divs.</p>
        </div>
        {tauri && (
          <div className="open-row">
            <input
              className="path-input mono small"
              placeholder="/path/to/deck.pptx"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void open()}
            />
            <button className="ghost" onClick={() => void open()} disabled={!path.trim() || loading}>
              {loading ? "Loading…" : "Open"}
            </button>
          </div>
        )}
      </header>

      {error && <div className="error-banner small">{error}</div>}

      <div className="slide-strip">
        {deck?.slides.map((s, i) => (
          <section key={s.part} className="slide-card">
            <header className="slide-num">{i + 1}</header>
            {s.text.split("\n").map((line, j) => (
              <div key={j} className={`slide-line${line.startsWith("[") ? " shape-head" : ""}${line.startsWith("•") ? " bullet" : ""}`}>
                {line || "\u00a0"}
              </div>
            ))}
          </section>
        ))}
      </div>

      <ChatOverlay scope={deck?.path ?? "deck"} />
    </div>
  );
}
