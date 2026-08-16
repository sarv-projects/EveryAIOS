import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import ChatOverlay from "../components/ChatOverlay";
import { demoPdf, pdfBytes, pdfOpen, type PdfPayload } from "../lib/office";
import { inTauri } from "../lib/tauri";

// P4.4 — pdf.js canvas renderer. One worker for the whole app.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const SCALE_STEP = 0.25;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;

export default function PdfViewer() {
  const [path, setPath] = useState("");
  const [pdf, setPdf] = useState<PdfPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [showText, setShowText] = useState(false);

  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const tauri = inTauri();

  // Load the document (pdf.js from the base64 data URL in Tauri; text-only
  // demo otherwise) and reset the page cursor.
  const open = useCallback(async () => {
    setError(null);
    setLoading(true);
    // Cancel any in-flight render before swapping documents.
    renderTaskRef.current?.cancel();
    try {
      if (!tauri) {
        setPdf(demoPdf);
        docRef.current = null;
        setPage(1);
        setLoading(false);
        return;
      }
      const [payload, dataUrl] = await Promise.all([pdfOpen(path), pdfBytes(path)]);
      setPdf(payload);
      const doc = await pdfjsLib.getDocument({ data: atob(dataUrl.split(",")[1]) }).promise;
      docRef.current = doc;
      setPage(1);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, tauri]);

  // Draw the current page onto the canvas (cancels cleanly on re-render).
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    let cancelled = false;

    const render = async () => {
      try {
        const pageProxy = await doc.getPage(page);
        const viewport = pageProxy.getViewport({ scale });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTaskRef.current = pageProxy.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTaskRef.current.promise;
        if (!cancelled) renderTaskRef.current = null;
      } catch (e) {
        // Cancelled renders throw; swallow only that case.
        if (e instanceof Error && e.name === "RenderingCancelledException") return;
        if (!cancelled) setError(String(e));
      }
    };
    void render();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [page, scale]);

  // In plain-browser preview, show the demo text pages.
  useEffect(() => {
    if (!tauri) setPdf(demoPdf);
  }, [tauri]);

  const total = pdf?.pages ?? 0;

  return (
    <div className="pdfview">
      <header className="spreadsheet-head">
        <div>
          <h2 className="panel-title">PDF</h2>
          <p className="muted small">
            pdf.js canvas renderer (P4.4) · {total} page{total === 1 ? "" : "s"}
          </p>
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

      {/* Render toolbar: page nav + zoom + text/visual toggle. */}
      {total > 0 && (
        <div className="pdf-toolbar">
          <button className="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹ Prev
          </button>
          <span className="mono small">
            {page} / {total}
          </span>
          <button className="ghost" disabled={page >= total} onClick={() => setPage((p) => p + 1)}>
            Next ›
          </button>
          <span className="toolbar-gap" />
          <button
            className="ghost"
            disabled={scale <= MIN_SCALE}
            onClick={() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))}
          >
            −
          </button>
          <span className="mono small">{Math.round(scale * 100)}%</span>
          <button
            className="ghost"
            disabled={scale >= MAX_SCALE}
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}
          >
            +
          </button>
          <span className="toolbar-gap" />
          <button className="ghost" onClick={() => setShowText((v) => !v)}>
            {showText ? "Canvas" : "Text"}
          </button>
        </div>
      )}

      <div className="pdf-pages">
        {/* Canvas render (Tauri) — the real page, drawn by pdf.js. */}
        {tauri && !showText && (
          <section className="pdf-canvas-wrap">
            <canvas ref={canvasRef} className="pdf-canvas" />
          </section>
        )}

        {/* Text extraction layer — accessibility + non-Tauri preview. */}
        {(showText || !tauri) &&
          pdf?.texts.map((t, i) => (
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
