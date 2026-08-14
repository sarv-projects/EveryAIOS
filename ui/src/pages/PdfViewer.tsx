import { useEffect, useState } from "react";
import ChatOverlay from "../components/ChatOverlay";
import { demoPdf, pdfOpen, type PdfPayload } from "../lib/office";
import { inTauri } from "../lib/tauri";

export default function PdfViewer() {
  const [path, setPath] = useState("");
  const [pdf, setPdf] = useState<PdfPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tauri = inTauri();

  const open = async () => {
    setError(null);
    if (!tauri) {
      setPdf(demoPdf);
      return;
    }
    setLoading(true);
    try {
      setPdf(await pdfOpen(path));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tauri) setPdf(demoPdf);
  }, [tauri]);

  return (
    <div className="pdfview">
      <header className="spreadsheet-head">
        <div>
          <h2 className="panel-title">PDF</h2>
          <p className="muted small">lopdf text extraction (D4) — per-page view; pdf.js canvas renderer is the next step.</p>
        </div>
        {tauri && (
          <div className="open-row">
            <input
              className="path-input mono small"
              placeholder="/path/to/file.pdf"
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

      <div className="pdf-pages">
        {pdf?.texts.map((t, i) => (
          <section key={i} className="pdf-page">
            <header className="slide-num">{i + 1}</header>
            <pre className="pdf-text">{t || "(no extractable text)"}</pre>
          </section>
        ))}
      </div>

      <ChatOverlay scope={pdf?.path ?? "pdf"} />
    </div>
  );
}
