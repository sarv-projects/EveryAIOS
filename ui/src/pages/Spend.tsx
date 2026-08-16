import { useEffect, useState } from "react";
import {
  usageSnapshot,
  type KeyUsage,
  type SessionUsage,
  type UsageSnapshot,
} from "../lib/spend";

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(3)}`;
}

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function KeyRow({ k }: { k: KeyUsage }) {
  return (
    <tr>
      <td className="mono">{k.key}</td>
      <td className="mono">{fmtTokens(k.tokensIn)}</td>
      <td className="mono">{fmtTokens(k.tokensOut)}</td>
      <td className="mono">{fmtTokens(k.cachedTokens)}</td>
      <td className="mono">{fmtPct(k.cacheHitRate)}</td>
      <td className="mono">{fmtUsd(k.costUsd)}</td>
    </tr>
  );
}

function SessionRow({ s }: { s: SessionUsage }) {
  return (
    <tr>
      <td className="mono">{s.sessionId}</td>
      <td className="mono">{fmtTokens(s.tokensIn)}</td>
      <td className="mono">{fmtTokens(s.tokensOut)}</td>
      <td className="mono">{fmtPct(s.cacheHitRate)}</td>
    </tr>
  );
}

export default function Spend() {
  const [snap, setSnap] = useState<UsageSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        setSnap(await usageSnapshot());
        setErr(null);
      } catch (e) {
        setErr(String(e));
      }
    };
    poll();
    const t = window.setInterval(poll, 2000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Spend</h1>
        <span className="pill">token &amp; cost dashboard</span>
      </header>

      {err && <p className="scan-result">{err}</p>}

      {snap && (
        <>
          <section className="card">
            <h2>Today</h2>
            <div className="spend-totals mono">
              <div className="spend-total">
                <span className="muted small">tokens in</span>
                <strong>{fmtTokens(snap.total.tokensIn)}</strong>
              </div>
              <div className="spend-total">
                <span className="muted small">tokens out</span>
                <strong>{fmtTokens(snap.total.tokensOut)}</strong>
              </div>
              <div className="spend-total">
                <span className="muted small">cached</span>
                <strong>{fmtTokens(snap.total.cachedTokens)}</strong>
              </div>
              <div className="spend-total">
                <span className="muted small">cache hit</span>
                <strong>{fmtPct(snap.cacheHitRate)}</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Per key</h2>
            {snap.byKey.length === 0 ? (
              <p className="muted small">No usage recorded yet.</p>
            ) : (
              <table className="spend-table">
                <thead>
                  <tr>
                    <th>key</th>
                    <th>in</th>
                    <th>out</th>
                    <th>cached</th>
                    <th>hit rate</th>
                    <th>cost</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.byKey.map((k) => (
                    <KeyRow key={k.key} k={k} />
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2>Per session</h2>
            {snap.bySession.length === 0 ? (
              <p className="muted small">No sessions recorded yet.</p>
            ) : (
              <table className="spend-table">
                <thead>
                  <tr>
                    <th>session</th>
                    <th>in</th>
                    <th>out</th>
                    <th>hit rate</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.bySession.map((s) => (
                    <SessionRow key={s.sessionId} s={s} />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {!snap && !err && <p className="muted small">Loading usage…</p>}
    </div>
  );
}
