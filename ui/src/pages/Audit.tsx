import { useCallback, useEffect, useRef, useState } from "react";
import {
  agentStop,
  replayScreenshot,
  replaySessions,
  replayTimeline,
  watchEvents,
  type Segment,
  type Timeline,
} from "../lib/audit";

const KIND_COLORS: Record<string, string> = {
  navigate: "#2563eb",
  click: "#7c3aed",
  input: "#22c55e",
  scroll: "#f59e0b",
  dom_mutation: "#e2e8f0",
  screenshot: "#ec4899",
};

function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? "#64748b";
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour12: false });
}

export default function Audit() {
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<Segment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [shot, setShot] = useState<{ step: number; url: string | null } | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const lastSeq = useRef(0);
  const watchTimer = useRef<number | null>(null);

  // Load the searchable sessions list (P3.1 item 3).
  useEffect(() => {
    const t = setTimeout(() => {
      replaySessions(query).then(setSessions);
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  // Load a document's timeline when selected.
  const open = useCallback(async (documentId: string) => {
    setSelected(documentId);
    const tl = await replayTimeline(documentId);
    setTimeline(tl);
    lastSeq.current = tl.events.reduce((m, e) => Math.max(m, e.seq), 0);
    const steps = tl.screenshot_steps;
    if (steps.length > 0) {
      const step = steps[0];
      setShot({ step, url: await replayScreenshot(documentId, step) });
    } else {
      setShot(null);
    }
  }, []);

  // Watch mode (P3.1 item 4): poll the live tail of the stream every 2s.
  useEffect(() => {
    if (!selected) return;
    const poll = async () => {
      try {
        const fresh = await watchEvents(selected, lastSeq.current);
        if (fresh.length > 0) {
          setTimeline((tl) =>
            tl
              ? { ...tl, events: [...tl.events, ...fresh], screenshot_steps: tl.screenshot_steps }
              : tl,
          );
          lastSeq.current = fresh[fresh.length - 1].seq;
        }
      } catch {
        /* poll errors are transient — keep watching */
      }
    };
    watchTimer.current = window.setInterval(poll, 2000);
    return () => {
      if (watchTimer.current !== null) window.clearInterval(watchTimer.current);
    };
  }, [selected]);

  // Click a timeline tick → show that step's screenshot (nearest ≤ step).
  const seekTo = async (seq: number) => {
    const step = seq;
    if (!selected) return;
    const url = await replayScreenshot(selected, step);
    setShot({ step, url });
  };

  const onStop = async (sessionId: string) => {
    try {
      await agentStop(sessionId);
      setStopped(sessionId);
    } catch {
      setStopped(null);
    }
  };

  const evs = timeline?.events ?? [];
  const maxSeq = evs.reduce((m, e) => Math.max(m, e.seq), 1);

  return (
    <div className="audit">
      <aside className="audit-side">
        <h2 className="panel-title">Sessions</h2>
        <input
          className="search"
          placeholder="Search document / tab id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="session-list">
          {sessions.length === 0 && <p className="muted small">No recordings yet.</p>}
          {sessions.map((s) => (
            <button
              key={s.document_id}
              className={`session-row${selected === s.document_id ? " active" : ""}`}
              onClick={() => open(s.document_id)}
            >
              <div className="session-row-top">
                <span className="mono small">{s.document_id}</span>
                {s.has_gap && <span className="gap-badge">has_gap</span>}
              </div>
              <div className="muted small">
                {s.tab_id} · {s.event_count} events · {fmtTime(s.first_ts_ms)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="audit-main">
        {!selected ? (
          <div className="empty">
            <h3>Replay &amp; Audit</h3>
            <p className="muted">Select a session to scrub its timeline.</p>
          </div>
        ) : (
          <>
            <header className="audit-head">
              <div>
                <h3 className="mono">{selected}</h3>
                <p className="muted small">
                  {timeline?.segment?.tab_id} · {evs.length} events
                  {timeline?.segment?.has_gap ? " · ⚠ has_gap (incomplete)" : ""}
                </p>
              </div>
              <button
                className="stop"
                disabled={stopped === (timeline?.segment?.tab_id ?? "")}
                onClick={() => onStop(timeline?.segment?.tab_id ?? selected)}
              >
                {stopped === (timeline?.segment?.tab_id ?? "") ? "Stop sent" : "Stop agent"}
              </button>
            </header>

            {/* Scrubber (P3.1 item 1): action timeline per session. */}
            <div className="scrubber">
              {evs.map((e) => (
                <button
                  key={e.seq}
                  className={`tick${shot?.step === e.seq ? " active" : ""}`}
                  title={`#${e.seq} ${e.kind} ${fmtTime(e.ts_ms)}`}
                  style={{ background: kindColor(e.kind) }}
                  onClick={() => seekTo(e.seq)}
                />
              ))}
              <span className="scrubber-max mono small">#{maxSeq}</span>
            </div>

            {/* Screenshot strip (P3.1 item 2): per-step display synced. */}
            <div className="shots">
              {shot ? (
                <img className="shot" src={shot.url ?? undefined} alt={`step ${shot.step}`} />
              ) : (
                <div className="shot placeholder">
                  <span className="muted">no screenshot for this step</span>
                </div>
              )}
              <div className="shot-meta mono small">
                step {shot?.step ?? "—"}
                {shot?.url ? "" : " · (recorder writes screenshots per step)"}
              </div>
            </div>

            {/* Event list (live-appended by watch). */}
            <ul className="event-list">
              {evs.map((e) => (
                <li key={e.seq}>
                  <span className="tick-dot" style={{ background: kindColor(e.kind) }} />
                  <span className="mono small seq">#{e.seq}</span>
                  <span className="small">{e.kind}</span>
                  <span className="muted small">{fmtTime(e.ts_ms)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
