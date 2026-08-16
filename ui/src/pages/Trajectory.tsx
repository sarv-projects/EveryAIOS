import { useEffect, useMemo, useState } from "react";
import {
  groupBySource,
  trajectorySessions,
  trajectorySnapshot,
  type ContextInjection,
  type TrajectorySource,
} from "../lib/trajectory";

const SOURCE_COLORS: Record<TrajectorySource, string> = {
  persona: "#ec4899",
  user_document: "#2563eb",
  memory: "#22c55e",
  tool_result: "#f59e0b",
  blueprint: "#7c3aed",
  other: "#64748b",
};

function fmtTokens(n: number | undefined): string {
  return n == null ? "—" : `${n}`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour12: false });
}

function SourceGroup({
  source,
  records,
}: {
  source: TrajectorySource;
  records: ContextInjection[];
}) {
  if (records.length === 0) return null;
  const tokens = records.reduce((s, r) => s + (r.tokens ?? 0), 0);
  return (
    <section className="traj-group">
      <h3 className="traj-source">
        <span
          className="traj-dot"
          style={{ background: SOURCE_COLORS[source] }}
        />
        {source}
        <span className="muted small">
          {records.length} inj · {tokens} tok
        </span>
      </h3>
      <ul className="traj-list">
        {records.map((r) => (
          <li key={r.seq}>
            <span className="mono small seq">#{r.seq}</span>
            <span className="mono small ref">{r.ref_id || "—"}</span>
            <span className="mono small muted">{fmtTokens(r.tokens)} tok</span>
            <span className="muted small">{fmtTime(r.ts_ms)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Trajectory() {
  const [sessions, setSessions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [records, setRecords] = useState<ContextInjection[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    trajectorySessions()
      .then(setSessions)
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setErr(null);
    trajectorySnapshot(selected)
      .then(setRecords)
      .catch((e) => setErr(String(e)));
  }, [selected]);

  const grouped = useMemo(() => groupBySource(records), [records]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Trajectory</h1>
        <span className="pill">inspect context by source</span>
      </header>

      {err && <p className="scan-result">{err}</p>}

      <section className="card">
        <h2>Sessions</h2>
        {sessions.length === 0 ? (
          <p className="muted small">
            No context-injection logs yet — run a turn and the injected blocks
            will show up here.
          </p>
        ) : (
          <div className="traj-sessions">
            {sessions.map((s) => (
              <button
                key={s}
                className={`session-row${selected === s ? " active" : ""}`}
                onClick={() => setSelected(s)}
              >
                <span className="mono small">{s}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="traj-groups">
          {(["persona", "user_document", "memory", "tool_result", "blueprint", "other"] as const).map(
            (src) => (
              <SourceGroup key={src} source={src} records={grouped.get(src) ?? []} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
