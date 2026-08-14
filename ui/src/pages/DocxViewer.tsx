import { useEffect, useState } from "react";
import ChatOverlay from "../components/ChatOverlay";
import { demoDocx, docxOpen, type DocxPayload } from "../lib/office";
import { inTauri } from "../lib/tauri";

export default function DocxViewer() {
  const [path, setPath] = useState("");
  const [doc, setDoc] = useState<DocxPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tauri = inTauri();

  const open = async () => {
    setError(null);
    if (!tauri) {
      setDoc(demoDocx);
      return;
    }
    setLoading(true);
    try {
      setDoc(await docxOpen(path));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tauri) setDoc(demoDocx);
  }, [tauri]);

  const paragraphs = (doc?.text ?? "").split("\n");

  return (
    <div className="docview">
      <header className="spreadsheet-head">
        <div>
          <h2 className="panel-title">Word</h2>
          <p className="muted small">Block-patch engine render (D1) — styled paragraphs + block tree.</p>
        </div>
        {tauri && (
          <div className="open-row">
            <input
              className="path-input mono small"
              placeholder="/path/to/document.docx"
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

      <div className="docview-body">
        <article className="doc-paper">
          {paragraphs.map((p, i) =>
            p.trim() === "" ? <div key={i} className="doc-gap" /> : <p key={i} className="doc-para">{p}</p>,
          )}
        </article>
        {doc && doc.blocks.length > 0 && (
          <aside className="doc-blocks">
            <h4 className="muted small">Blocks</h4>
            {doc.blocks.map((b) => (
              <div key={b.address} className="block-chip mono small">
                <span>{b.address}</span>
                <span className="muted">{b.kind}</span>
              </div>
            ))}
          </aside>
        )}
      </div>

      <ChatOverlay scope={doc?.path ?? "document"} />
    </div>
  );
}
