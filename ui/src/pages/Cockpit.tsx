import { useCallback, useEffect, useRef, useState } from "react";
import {
  agentStop,
  agentUndo,
  cockpitQuiet,
  cockpitSnapshot,
  interruptRespond,
  type AgentCard,
  type CockpitState,
  type InterruptCard,
} from "../lib/cockpit";
import {
  guardEstop,
  guardPolicy,
  guardReceipts,
  guardRespond,
  guardTickets,
  type GuardPolicy,
  type GuardReceipt,
  type GuardTicket,
} from "../lib/guard";

const STATUS_LABEL: Record<string, string> = {
  running: "LIVE",
  waiting: "WAIT",
  done: "DONE",
  failed: "FAILED",
  idle: "idle",
};

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function AgentCardView({
  card,
  onStop,
  onUndo,
  nowTick,
}: {
  card: AgentCard;
  onStop: (id: string) => void;
  onUndo: (id: string) => void;
  nowTick: number;
}) {
  const live = card.status === "running";
  const waiting = card.status === "waiting";
  const actions = card.actions.slice(-4);
  return (
    <div className={`agent-card${live ? " live" : ""}${waiting ? " waiting" : ""}`}>
      <div className="agent-card-head">
        <span className="agent-name">{card.label}</span>
        <span className={`chip ${live ? "live" : waiting ? "wait" : ""}`}>
          {STATUS_LABEL[card.status]}
        </span>
      </div>
      <div className="muted small">
        {card.model} · {card.provider} · {fmtClock(nowTick - card.started_ms)}
      </div>

      <div className="action-trail">
        {actions.map((a, i) => (
          <div key={i} className="action-row">
            <span className="mono small tool">{a.tool}</span>
            <span className="small">{a.summary}</span>
          </div>
        ))}
        {actions.length === 0 && <span className="muted small">no actions yet</span>}
      </div>

      <div className="agent-card-foot">
        <div className="tokens mono small">
          in {fmtTokens(card.tokens.tokens_in)} · out {fmtTokens(card.tokens.tokens_out)}
        </div>
        <div className="card-actions">
          <button className="ghost" disabled={!live && !waiting} onClick={() => onUndo(card.agent_id)}>
            UNDO
          </button>
          <button className="stop" disabled={!live && !waiting} onClick={() => onStop(card.agent_id)}>
            STOP
          </button>
        </div>
      </div>
    </div>
  );
}

function DecisionDetails({ d }: { d: GuardTicket["decision"] }) {
  if (!d) return null;
  const hasScript = d.scriptLines.length > 0 || d.executionTarget !== "";
  const hasNet = d.networkDestinations.length > 0;
  const hasEnv = d.envVars.length > 0;
  if (!hasScript && !hasNet && !hasEnv && !d.proposedDiff) return null;
  return (
    <div className="ticket-details">
      {d.proposedDiff && (
        <div className="ticket-diff">
          <div className="ticket-detail-label">Proposed diff</div>
          <pre className="mono small">{d.proposedDiff}</pre>
        </div>
      )}
      {hasScript && (
        <div className="ticket-script">
          <div className="ticket-detail-label">Script</div>
          {d.executionTarget && <div className="mono small muted">target: {d.executionTarget}</div>}
          <pre className="mono small">{d.scriptLines.join("\n")}</pre>
        </div>
      )}
      {hasEnv && (
        <div className="ticket-script">
          <div className="ticket-detail-label">Env vars</div>
          <pre className="mono small">{d.envVars.join("\n")}</pre>
        </div>
      )}
      {hasNet && (
        <div className="ticket-script">
          <div className="ticket-detail-label">Network destinations</div>
          <pre className="mono small">{d.networkDestinations.join("\n")}</pre>
        </div>
      )}
    </div>
  );
}

function TicketCardView({
  ticket,
  onRespond,
  responded,
}: {
  ticket: GuardTicket;
  onRespond: (id: string, action: "approve" | "reject") => void;
  responded?: string;
}) {
  const d = ticket.decision;
  const web = d?.webAction;
  return (
    <div className={`ticket-card${web ? " web-confirm" : ""}`}>
      <div className="interrupt-head">
        {web ? <span className="chip warn">WEB ACTION</span> : <span className="chip wait">APPROVE</span>}
        <span className="mono small muted">{ticket.ticketId}</span>
        <span className={`risk-chip risk-${ticket.risk}`}>{ticket.risk}</span>
      </div>
      <p className="interrupt-prompt">
        {ticket.agentId} wants to <strong>{ticket.operation}</strong> via{" "}
        <span className="mono">{ticket.toolId}</span>
        {d?.goal && <span className="muted"> — {d.goal}</span>}
      </p>
      {web && (
        <div className="web-confirm-banner">
          ⚠ Sensitive web action: <strong>{web}</strong> (checkout / payment / account change).
          This needs your explicit confirmation.
        </div>
      )}
      <div className="ticket-paths mono small">
        {ticket.paths.length === 0
          ? "(no path scope)"
          : ticket.paths.map((p) => <div key={p}>{p}</div>)}
      </div>
      <DecisionDetails d={d} />
      <div className="interrupt-options">
        <button
          className="approve"
          disabled={responded !== undefined}
          onClick={() => onRespond(ticket.ticketId, "approve")}
        >
          {responded === "approve" ? "Approved ✓" : web ? "Confirm & run" : "Approve & run"}
        </button>
        <button
          className="reject"
          disabled={responded !== undefined}
          onClick={() => onRespond(ticket.ticketId, "reject")}
        >
          {responded === "reject" ? "Rejected" : "Reject"}
        </button>
      </div>
    </div>
  );
}

function InterruptCardView({
  card,
  onAnswer,
}: {
  card: InterruptCard;
  onAnswer: (id: string, choice: number) => void;
}) {
  return (
    <div className="interrupt-card">
      <div className="interrupt-head">
        <span className="chip wait">NEEDS YOU</span>
        <span className="small muted">{card.agent_id}</span>
      </div>
      <p className="interrupt-prompt">{card.prompt}</p>
      <div className="interrupt-options">
        {card.options.map((opt, i) => (
          <button key={i} className="mcq" onClick={() => onAnswer(card.id, i)}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Cockpit() {
  const [state, setState] = useState<CockpitState>({ agents: [], interrupts: [], quiet: false });
  const [tickets, setTickets] = useState<GuardTicket[]>([]);
  const [ticketResponses, setTicketResponses] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState<GuardPolicy | null>(null);
  const [receipts, setReceipts] = useState<GuardReceipt[]>([]);
  const [slideOpen, setSlideOpen] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [sent, setSent] = useState<Record<string, string>>({});
  const timer = useRef<number | null>(null);

  // Poll the flight-deck snapshot every 2s (same pattern as Audit watch).
  useEffect(() => {
    const poll = async () => {
      try {
        setState(await cockpitSnapshot());
      } catch {
        /* transient — keep polling */
      }
    };
    poll();
    timer.current = window.setInterval(poll, 2000);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, []);

  // Poll the Guard-2 ticket queue (same 2s cadence).
  useEffect(() => {
    const poll = async () => {
      try {
        setTickets(await guardTickets());
      } catch {
        /* transient — keep polling */
      }
    };
    poll();
    const t = window.setInterval(poll, 2000);
    return () => window.clearInterval(t);
  }, []);

  // Poll the Guard-2 policy + receipts (lower cadence — they change rarely).
  useEffect(() => {
    const poll = async () => {
      try {
        setPolicy(await guardPolicy());
        setReceipts(await guardReceipts());
      } catch {
        /* transient — keep polling */
      }
    };
    poll();
    const t = window.setInterval(poll, 5000);
    return () => window.clearInterval(t);
  }, []);

  // Tick the elapsed clocks every second.
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const onStop = useCallback(async (id: string) => {
    setSent((s) => ({ ...s, [id]: "stop" }));
    try {
      await agentStop(id);
    } catch {
      /* control channel may be absent — the card still flips */
    }
    setState((s) => ({ ...s, agents: s.agents.map((a) => (a.agent_id === id ? { ...a, status: "done" } : a)) }));
  }, []);

  const onUndo = useCallback(async (id: string) => {
    setSent((s) => ({ ...s, [id]: "undo" }));
    try {
      await agentUndo(id);
    } catch {
      /* control channel may be absent — the card still flips */
    }
    setState((s) => ({
      ...s,
      agents: s.agents.map((a) =>
        a.agent_id === id
          ? {
              ...a,
              status: "waiting",
              actions: [...a.actions, { ts_ms: Date.now(), tool: "agent.undo", summary: "reverting last action…" }],
            }
          : a,
      ),
    }));
  }, []);

  const onInterrupt = useCallback(async (id: string, choice: number) => {
    setSent((s) => ({ ...s, [id]: `choice ${choice}` }));
    try {
      await interruptRespond(id, choice);
    } catch {
      /* control channel may be absent — the card still resolves */
    }
    setState((s) => ({
      ...s,
      interrupts: s.interrupts.map((c) => (c.id === id ? { ...c, responded: choice } : c)),
    }));
  }, []);

  const onQuiet = useCallback(async (quiet: boolean) => {
    setState((s) => ({ ...s, quiet }));
    try {
      await cockpitQuiet(quiet);
    } catch {
      /* non-Tauri preview ignores */
    }
  }, []);

  const onTicket = useCallback(async (id: string, action: "approve" | "reject") => {
    setTicketResponses((r) => ({ ...r, [id]: action }));
    try {
      await guardRespond(id, action);
    } catch {
      /* control channel may be absent — the card still flips */
    }
    setTickets((ts) => ts.filter((t) => t.ticketId !== id));
  }, []);

  const onEstop = useCallback(async (pulled: boolean) => {
    try {
      const v = await guardEstop(pulled);
      setPolicy((p) => (p ? { ...p, estopPulled: v } : p));
    } catch {
      /* non-Tauri preview ignores */
    }
  }, []);

  const totals = state.agents.reduce(
    (acc, a) => ({
      in: acc.in + a.tokens.tokens_in,
      out: acc.out + a.tokens.tokens_out,
    }),
    { in: 0, out: 0 },
  );
  const openInterrupts = state.interrupts.filter((c) => c.responded === null);
  const quietLine = state.agents.length
    ? `EveryAIOS: ${state.agents[0].actions.at(-1)?.summary ?? state.agents[0].label}`
    : "EveryAIOS: idle";

  return (
    <div className="cockpit">
      <header className="cockpit-head">
        <div>
          <h2 className="panel-title">Cockpit</h2>
          <p className="muted small">Ambient flight deck — live agents, interrupts, control.</p>
        </div>
        <div className="cockpit-head-actions">
          <button
            className={`ghost${state.quiet ? " active" : ""}`}
            onClick={() => onQuiet(!state.quiet)}
            title="Collapse to a single-sentence tray status"
          >
            {state.quiet ? "Quiet: on" : "Quiet mode"}
          </button>
          <button className="ghost" onClick={() => setSlideOpen((o) => !o)}>
            {slideOpen ? "Close panel" : "Slide-over panel"}
          </button>
        </div>
      </header>

      {state.quiet && (
        <div className="quiet-line mono small">
          {quietLine} · tokens in {fmtTokens(totals.in)} / out {fmtTokens(totals.out)}
        </div>
      )}

      {/* Guard-2 policy + estop strip (J21). */}
      {policy && (
        <div className={`guard-strip${policy.estopPulled ? " estopped" : ""}`}>
          <span className="mono small">profile: {policy.profile}</span>
          <span className="mono small">min confidence: {policy.minConfidenceForAuto}</span>
          <span className="mono small">feedback learning: {policy.userFeedbackLearning ? "on" : "off"}</span>
          <button
            className={policy.estopPulled ? "estop active" : "estop"}
            onClick={() => onEstop(!policy.estopPulled)}
          >
            {policy.estopPulled ? "⛔ ESTOPPED — click to reset" : "ESTOP"}
          </button>
        </div>
      )}

      {/* Guard-2 approval cards (authorization tickets) — blocking. */}
      {tickets.length > 0 && (
        <div className="interrupts">
          {tickets.map((t) => (
            <TicketCardView
              key={t.ticketId}
              ticket={t}
              onRespond={onTicket}
              responded={ticketResponses[t.ticketId]}
            />
          ))}
        </div>
      )}

      {/* Approval/denial audit receipts (P7.5). */}
      {receipts.length > 0 && (
        <div className="receipts">
          <div className="panel-subtitle muted small">Audit receipts ({receipts.length})</div>
          {receipts.slice(-5).map((r) => (
            <div key={r.receiptId} className="receipt-row mono small">
              <span className={`chip ${r.action === "approve" ? "live" : ""}`}>{r.action}</span>
              <span>{r.operation}</span>
              <span className="muted">{r.ticketId}</span>
              <span className="muted">{r.hash.slice(0, 10)}…</span>
            </div>
          ))}
        </div>
      )}

      {/* MCQ interrupt cards (circuit-break) — most prominent. */}
      {openInterrupts.length > 0 && (
        <div className="interrupts">
          {openInterrupts.map((c) => (
            <InterruptCardView
              key={c.id}
              card={c}
              onAnswer={onInterrupt}
            />
          ))}
        </div>
      )}

      {/* Running-now agent cards. */}
      <div className="agent-grid">
        {state.agents.length === 0 && (
          <div className="empty">
            <h3>Nothing running</h3>
            <p className="muted">Agent cards appear here the moment a task starts.</p>
          </div>
        )}
        {state.agents.map((card) => (
          <AgentCardView key={card.agent_id} card={card} onStop={onStop} onUndo={onUndo} nowTick={nowTick} />
        ))}
      </div>

      {/* Slide-over panel: live action cards + token counters. */}
      {slideOpen && (
        <div className="slide-over">
          <div className="slide-over-head">
            <h3 className="panel-title">Live panel</h3>
            <button className="ghost" onClick={() => setSlideOpen(false)}>
              ✕
            </button>
          </div>
          <div className="slide-totals mono small">
            tokens in {fmtTokens(totals.in)} · out {fmtTokens(totals.out)}
          </div>
          {state.agents.length === 0 && <p className="muted small">No live agents.</p>}
          {state.agents.map((a) => (
            <div key={a.agent_id} className="slide-agent">
              <div className="slide-agent-head">
                <span className="small">{a.label}</span>
                <span className={`chip ${a.status === "running" ? "live" : ""}`}>{STATUS_LABEL[a.status]}</span>
              </div>
              {a.actions.map((act, i) => (
                <div key={i} className="action-row">
                  <span className="mono small tool">{act.tool}</span>
                  <span className="small">{act.summary}</span>
                </div>
              ))}
            </div>
          ))}
          {Object.keys(sent).length > 0 && (
            <div className="muted small sent-log">
              sent: {Object.entries(sent).map(([k, v]) => `${k} → ${v}`).join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
