import { useEffect, useRef, useState } from "react";
import {
  chatCancel,
  chatStream,
  inTauri,
  onChatEvent,
  type ChatWireEvent,
} from "../lib/tauri";
import {
  acpAgents,
  acpAuthenticate,
  acpInstallCommit,
  acpInstallRequest,
  acpInstallStatus,
  acpLaunch,
  acpPrompt,
  type AuthMethod,
  type HarnessManifest,
  type InstallState,
} from "../lib/acp";
import {
  guardRespond,
  guardTickets,
  type GuardTicket,
} from "../lib/guard";
import Markdown from "../components/Markdown";

/** Persona presets — mirror of core-ai PERSONA_PRESETS (P1.5 A-7). */
const PERSONAS: Record<string, string> = {
  "straight-shooter": "Direct and blunt. Short sentences. Skip small talk.",
  warm: "Warm and friendly. Polite, encouraging, natural.",
  coach: "Socratic. Guiding questions, explains the why, ends with an action step.",
  terse: "One-sentence answers. No greetings, no sign-offs.",
};

const DEFAULT_PERSONA = "straight-shooter";
const CUSTOM_SOUL = "__custom_soul__";

// P1.8 (A5) — context windows. Cloud models: nominal 128K. Local models: the
// broker forces num_ctx = 16,384 on every call (doc 33 §7.4 floor — Ollama's
// 4,096 default makes agents loop), so the EFFECTIVE window is min(model max,
// forced). The real per-model catalog feed arrives with the settings page
// (P1.9 sidecar catalog is built; UI wiring is the later pass).
const FORCED_LOCAL_CTX = 16_384;
const CLOUD_CTX = 128_000;
const LOCAL_CTX_OVERRIDES: Record<string, number> = {
  // (model max, forced 16K) — a genuinely sub-15K model trips the loud band.
  "ollama/qwen3:4b": 16_384,
  "ollama/llama3.2:1b": 16_384,
  "ollama/qwen2.5:0.5b": 16_384,
  "ollama/demo-4k-ctx": 4_096, // demo of the loud warning band (4K model)
};

/** Effective context window for a (provider, model) pair (P1.8 UI gauge). */
function ctxWindowFor(provider: string, model: string): number {
  const override = LOCAL_CTX_OVERRIDES[`${provider}/${model}`];
  if (override !== undefined) return override;
  if (provider === "ollama" || provider === "llamafile") return FORCED_LOCAL_CTX;
  return CLOUD_CTX;
}

/** P1.9 — desktop model picker (bridge of broker providers → catalog ids). */
const MODEL_OPTIONS: Array<{ provider: string; model: string; label: string }> = [
  { provider: "nvidia", model: "meta/llama-3.1-70b-instruct", label: "nvidia · Llama 3.1 70B" },
  { provider: "openai", model: "gpt-4o", label: "openai · GPT-4o" },
  { provider: "anthropic", model: "claude-sonnet-4-5", label: "anthropic · Claude Sonnet 4.5" },
  { provider: "deepseek", model: "deepseek-chat", label: "deepseek · DeepSeek Chat" },
  { provider: "groq", model: "llama-3.3-70b-versatile", label: "groq · Llama 3.3 70B" },
  { provider: "copilot", model: "gpt-4o", label: "copilot · GPT-4o (OAuth)" },
  { provider: "ollama", model: "qwen3:4b", label: "ollama · qwen3:4b (local)" },
  { provider: "ollama", model: "demo-4k-ctx", label: "ollama · demo-4k-ctx (local, 4K)" },
];

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
}

let msgId = 0;

const WELCOME: Msg = {
  id: -1,
  role: "assistant",
  text: "EveryAIOS coordinator is standing by. Chat streams through the Rust core → coordinator engine → broker with a byte-stable prompt prefix, J11 budget cap, and cancellable 33ms-batched streaming (P1.3–P1.6).",
};

// F12/J17 — inbuilt fallback manifest (preview mode / before acp_agents lands).
const INBUILT: HarnessManifest = {
  id: "everyaios",
  name: "EveryAIOS",
  description: "Inbuilt agent — office, browser, memory, guard, eval, all models.",
  authMode: "local",
  protocol: "inbuilt",
  isDefault: true,
};

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [persona, setPersona] = useState<string>(DEFAULT_PERSONA);
  const [soulMd, setSoulMd] = useState<string>("");
  const [showSoul, setShowSoul] = useState(false);
  const [forkMark, setForkMark] = useState<number | null>(null);
  // P1.9 — model picker state (provider/model pair → chat_stream args).
  const [modelKey, setModelKey] = useState("nvidia/meta/llama-3.1-70b-instruct");
  const [provider, model] = modelKey.split("/", 2) as [string, string];
  // F12/J17 — agent picker: same chat bar, agent differs. Default = the
  // inbuilt engine (all first-party capabilities); others are ACP CLIs.
  const [agents, setAgents] = useState<HarnessManifest[]>([]);
  const [agentId, setAgentId] = useState("everyaios");
  const [agentHandle, setAgentHandle] = useState<Record<string, string>>({});
  // F8 — per-agent install state (flip Install ↔ Launch in the picker).
  const [installState, setInstallState] = useState<Record<string, InstallState>>({});
  const [installing, setInstalling] = useState<Record<string, boolean>>({});
  // The pending Guard-2 install ticket (approved here → install executes).
  const [installTicket, setInstallTicket] = useState<GuardTicket | null>(null);
  // The pending sign-in surface for an ACP agent (authMethods from launch).
  const [authSurface, setAuthSurface] = useState<{
    agentId: string;
    handle: string;
    methods: AuthMethod[];
    url?: string;
  } | null>(null);
  const selectedAgent = agents.find((a) => a.id === agentId);
  const isInbuilt = !selectedAgent || selectedAgent.protocol === "inbuilt";
  // Token streamer state.
  const [tokensSec, setTokensSec] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [activeKey, setActiveKey] = useState<string>("—");

  const endRef = useRef<HTMLDivElement>(null);
  const live = useRef<{ index: number; text: string } | null>(null);
  // Token-rate sliding window: {t, tokens} samples.
  const rateSamples = useRef<Array<{ t: number; tokens: number }>>([]);

  function appendToLive(more: string, tokenCount: number) {
    if (!live.current) return;
    live.current.text += more;
    const idx = live.current.index;
    const full = live.current.text;
    setMsgs((m) =>
      m.map((x, i) =>
        i === idx ? { id: x.id, role: "assistant" as const, text: full } : x,
      ),
    );
    if (tokenCount > 0) {
      const now = performance.now();
      rateSamples.current.push({ t: now, tokens: tokenCount });
      // Drop samples older than 3s; rate = tokens in window / seconds.
      rateSamples.current = rateSamples.current.filter(
        (s) => now - s.t <= 3000,
      );
      const win = rateSamples.current;
      if (win.length >= 2) {
        const dt = (win[win.length - 1].t - win[0].t) / 1000;
        const tokens = win.reduce((a, s) => a + s.tokens, 0);
        setTokensSec(dt > 0 ? Math.round(tokens / dt) : 0);
      }
    }
  }

  function finishLive(finalText?: string) {
    if (live.current) {
      const idx = live.current.index;
      const text = finalText ?? live.current.text;
      setMsgs((m) =>
        m.map((x, i) =>
          i === idx ? { id: x.id, role: "assistant" as const, text } : x,
        ),
      );
      live.current = null;
    } else if (finalText) {
      setMsgs((m) => [
        ...m,
        { id: msgId++, role: "assistant" as const, text: finalText },
      ]);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  // F12/J17 — load the agent launch registry (the picker) once on mount.
  useEffect(() => {
    if (!inTauri()) return;
    void acpAgents()
      .then((list) => setAgents(list.length ? list : [INBUILT]))
      .catch(() => setAgents([INBUILT]));
    // F8 — install state per agent (flip Install ↔ Launch).
    void acpInstallStatus()
      .then(setInstallState)
      .catch(() => {});
  }, []);

  // F8 — the Guard-2 install ticket resolves as it's approved/rejected in the
  // shared ticket store (the Cockpit card and this inline card are the same
  // ticket — one source of truth).
  useEffect(() => {
    if (!installTicket) return;
    const t = window.setInterval(() => {
      void guardTickets().then((list) => {
        const still = list.find((x) => x.ticketId === installTicket.ticketId);
        if (!still) setInstallTicket(null); // resolved elsewhere (Cockpit)
      }).catch(() => {});
    }, 2000);
    return () => window.clearInterval(t);
  }, [installTicket]);

  // P1.4/P1.6: subscribe once to Rust chat events.
  useEffect(() => {
    if (!inTauri()) return;
    let unsub: (() => void) | undefined;
    void onChatEvent((e: ChatWireEvent) => {
      if (e.type === "ttft") {
        setMsgs((m) => {
          const next = [...m, { id: msgId++, role: "assistant" as const, text: "" }];
          live.current = { index: next.length - 1, text: "" };
          return next;
        });
      } else if (e.type === "batch" && e.text) {
        appendToLive(e.text, e.tokenCount ?? 0);
      } else if (e.type === "done") {
        finishLive(e.fullText);
        if (e.totalTokens) setTotalTokens(e.totalTokens);
        setBusy(false);
        setStreamId(null);
        setTokensSec(0);
      } else if (e.type === "error") {
        finishLive(e.message ?? "Stream error");
        setBusy(false);
        setStreamId(null);
        setTokensSec(0);
      } else if (e.type === "cancelled") {
        finishLive();
        setBusy(false);
        setStreamId(null);
        setTokensSec(0);
      } else if (e.type === "budgetExceeded") {
        const limit = e.limit ?? 2.0;
        const spent = e.spent ?? 0;
        finishLive(`⛔ stopped: $${spent.toFixed(2)} / $${limit.toFixed(2)} limit reached.`);
        setBusy(false);
        setStreamId(null);
        setTokensSec(0);
      }
    }).then((u) => {
      unsub = u;
    });
    return () => unsub?.();
  }, []);

  /** F8 — one-click install: request (mint ticket or auto-allow) → show the
   *  Guard-2 card when asked → commit on approve. */
  async function installAgent(id: string) {
    setInstalling((s) => ({ ...s, [id]: true }));
    try {
      const req = await acpInstallRequest(id);
      if (req.action === "allow") {
        // Policy auto-allowed (user set write=allow): commit directly.
        const out = await acpInstallCommit(id);
        setInstallState((s) => ({
          ...s,
          [id]: { installed: true, version: out.version, kind: out.kind, binaryPath: out.binaryPath },
        }));
        setMsgs((m) => [
          ...m,
          { id: msgId++, role: "assistant" as const, text: `**${id}** v${out.version} installed (${out.kind}).` },
        ]);
        return;
      }
      // ask → the ticket is live in the shared store; render the same card
      // inline (Cockpit shows it too — one ticket, two UIs).
      const list = await guardTickets();
      const t = list.find((x) => x.ticketId === req.ticketId);
      if (t) setInstallTicket(t);
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { id: msgId++, role: "assistant" as const, text: `install error: ${String(err)}` },
      ]);
    } finally {
      setInstalling((s) => ({ ...s, [id]: false }));
    }
  }

  /** F8 — approve the install ticket inline (same ticket as the Cockpit
   *  card), then commit: consume the ticket + download/verify/extract. */
  async function approveInstall(action: "approve" | "reject") {
    if (!installTicket) return;
    const id = installTicket.agentId;
    const ticketId = installTicket.ticketId;
    setInstallTicket(null);
    try {
      await guardRespond(ticketId, action);
      if (action === "reject") return;
      setInstalling((s) => ({ ...s, [id]: true }));
      const out = await acpInstallCommit(id, ticketId);
      setInstallState((s) => ({
        ...s,
        [id]: { installed: true, version: out.version, kind: out.kind, binaryPath: out.binaryPath },
      }));
      setMsgs((m) => [
        ...m,
        { id: msgId++, role: "assistant" as const, text: `**${id}** v${out.version} installed (${out.kind}). Pick it and send a message to launch.` },
      ]);
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { id: msgId++, role: "assistant" as const, text: `install error: ${String(err)}` },
      ]);
    } finally {
      setInstalling((s) => ({ ...s, [id]: false }));
    }
  }

  /** F12/J17 — drive the ACP `authenticate` flow: agent-type completes
   *  immediately; url-type opens the browser and re-calls after login. */
  async function signIn(methodId: string) {
    if (!authSurface) return;
    try {
      const res = await acpAuthenticate(authSurface.handle, methodId);
      if (res.pending && res.url) {
        window.open(res.url, "_blank", "noopener");
        setAuthSurface({ ...authSurface, url: res.url });
        return;
      }
      if (res.ok) {
        setAuthSurface(null);
        setMsgs((m) => [
          ...m,
          { id: msgId++, role: "assistant" as const, text: `**${authSurface.agentId}** signed in — send a message to start working.` },
        ]);
      }
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { id: msgId++, role: "assistant" as const, text: `sign-in error: ${String(err)}` },
      ]);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { id: msgId++, role: "user", text }]);
    setBusy(true);
    setActiveKey(
      isInbuilt ? `${provider} / ${model}` : `${agentId} · ${selectedAgent?.authMode ?? "acp"}`,
    );
    rateSamples.current = [];
    try {
      if (inTauri() && isInbuilt) {
        const sid = await chatStream({
          sessionId: "",
          text,
          provider,
          model,
          agentId,
          personaId: persona === CUSTOM_SOUL ? DEFAULT_PERSONA : persona,
          ...(persona === CUSTOM_SOUL && soulMd.trim()
            ? { soulMd: soulMd.trim() }
            : {}),
        });
        setStreamId(sid);
      } else if (inTauri() && !isInbuilt) {
        // F8 — the agent must be installed before it can be launched.
        if (!installState[agentId]?.installed) {
          setMsgs((m) => [
            ...m,
            { id: msgId++, role: "assistant" as const, text: `**${agentId}** is not installed yet — click **Install** in the picker above (the download is Guard-2 gated), then send again.` },
          ]);
          setBusy(false);
          return;
        }
        // F12/J17 — ACP harness: launch once, then drive a synchronous turn.
        let handle = agentHandle[agentId];
        if (!handle) {
          const info = await acpLaunch(agentId, "");
          handle = info.handle;
          setAgentHandle((h) => ({ ...h, [agentId]: handle as string }));
          // The agent needs sign-in before it accepts a session — surface
          // its authMethods instead of prompting.
          if (info.authRequired) {
            setAuthSurface({ agentId, handle, methods: info.authMethods });
            setMsgs((m) => [
              ...m,
              { id: msgId++, role: "assistant" as const, text: `**${agentId}** needs sign-in before it can start a session.` },
            ]);
            setBusy(false);
            return;
          }
        }
        const res = await acpPrompt(handle, text);
        const tickets = res.pendingTickets.length
          ? `\n\n⛔ Guard-2: ${res.pendingTickets.length} ticket(s) pending approval — ${res.pendingTickets.join(", ")}`
          : "";
        setMsgs((m) => [
          ...m,
          {
            id: msgId++,
            role: "assistant",
            text: `**${agentId}** (${res.stopReason}) — ${res.updateCount} update(s), ${res.permissionCount} permission request(s).${tickets}`,
          },
        ]);
        setBusy(false);
      } else {
        setMsgs((m) => [
          ...m,
          {
            id: msgId++,
            role: "assistant",
            text: `echo: ${text}\n\n> preview mode — start the Tauri shell for real streaming (persona: **${persona}**).`,
          },
        ]);
        setBusy(false);
      }
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { id: msgId++, role: "assistant" as const, text: `error: ${String(err)}` },
      ]);
      setBusy(false);
    }
  }

  function cancel() {
    if (streamId) void chatCancel(streamId);
    else {
      finishLive();
      setBusy(false);
    }
  }

  /** P1.6 — fork from any message: truncate history at that message. */
  function forkAt(index: number) {
    if (busy) return;
    setMsgs((m) => m.slice(0, index + 1));
    setForkMark(index);
    setTotalTokens(0);
    setTokensSec(0);
    rateSamples.current = [];
  }

  // P1.8 — per-model context window: the gauge denominator AND the warning
  // threshold source (doc 33 §7.4: below 15K the agent loops; warn 15–20K).
  const ctxWindow = ctxWindowFor(provider, model);
  const isLocal = provider === "ollama" || provider === "llamafile";
  const ctxWarning = isLocal && ctxWindow < 20_000;
  const ctxLoud = isLocal && ctxWindow < 15_000;
  const contextPct = Math.min(100, Math.round((totalTokens / ctxWindow) * 100));

  return (
    <div className="page chat-page">
      <header className="page-head">
        <h1>Chat</h1>
        <div className="chat-tools">
          {/* F12/J17 — agent picker: same chat bar, agent differs. Default =
              inbuilt engine (all capabilities); others are ACP CLIs. */}
          <label className="persona-wrap">
            <span className="pill pill-label">agent</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              aria-label="Agent"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.isDefault ? " · default" : ""}
                </option>
              ))}
            </select>
          </label>
          {!isInbuilt && selectedAgent && (
            <span className="pill" title={selectedAgent.description}>
              {selectedAgent.authMode}
            </span>
          )}
          {/* F8 — Install / installed badge (one-click, Guard-2-gated). */}
          {!isInbuilt && selectedAgent && installState[agentId]?.installed && (
            <span className="pill installed" title={`v${installState[agentId].version ?? ""}`}>
              ✓ installed
            </span>
          )}
          {!isInbuilt && selectedAgent && !installState[agentId]?.installed && (
            <button
              className="install-btn"
              disabled={!!installing[agentId]}
              onClick={() => void installAgent(agentId)}
              title="Install from the official ACP registry (download is Guard-2 gated)"
            >
              {installing[agentId] ? "installing…" : "Install"}
            </button>
          )}
          {/* P1.6 — persona selector (A-7 presets + Hermes SOUL.md, B-2). */}
          <label className="persona-wrap">
            <span className="pill pill-label">persona</span>
            <select
              value={persona}
              onChange={(e) => {
                const v = e.target.value;
                setPersona(v);
                setShowSoul(v === CUSTOM_SOUL);
              }}
              aria-label="Persona"
            >
              {Object.keys(PERSONAS).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
              <option value={CUSTOM_SOUL}>custom SOUL.md…</option>
            </select>
          </label>
          {/* P1.9 — model picker (A6 catalog feed → broker provider/model).
              Shown only for the inbuilt engine: an ACP agent drives its own
              backend via its auth mode (per-agent model surface). */}
          {isInbuilt && (
            <label className="persona-wrap">
              <span className="pill pill-label">model</span>
              <select
                value={modelKey}
                onChange={(e) => setModelKey(e.target.value)}
                aria-label="Model"
              >
                {MODEL_OPTIONS.map((o) => (
                  <option key={`${o.provider}/${o.model}`} value={`${o.provider}/${o.model}`}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="pill">
            {inTauri() ? "shell connected · streaming" : "preview mode"}
          </span>
        </div>
      </header>

      {/* F8 — inline Guard-2 install card (same ticket as the Cockpit card).
          Approving here consumes the ticket and runs the download. */}
      {installTicket && (
        <div className={`ticket-card install-card${installTicket.decision?.webAction ? " web-confirm" : ""}`}>
          <div className="interrupt-head">
            <span className="chip wait">INSTALL</span>
            <span className="mono small muted">{installTicket.ticketId}</span>
            <span className={`risk-chip risk-${installTicket.risk}`}>{installTicket.risk}</span>
          </div>
          <p className="interrupt-prompt">
            Install <strong>{installTicket.agentId}</strong>
            {installTicket.decision?.goal && (
              <span className="muted"> — {installTicket.decision.goal}</span>
            )}
          </p>
          <div className="ticket-paths mono small">
            {installTicket.paths.map((p) => (
              <div key={p}>{p}</div>
            ))}
          </div>
          {installTicket.decision && (
            <div className="ticket-details">
              {installTicket.decision.scriptLines.length > 0 && (
                <div className="ticket-script">
                  <div className="ticket-detail-label">Script</div>
                  <pre className="mono small">{installTicket.decision.scriptLines.join("\n")}</pre>
                </div>
              )}
              {installTicket.decision.networkDestinations.length > 0 && (
                <div className="ticket-script">
                  <div className="ticket-detail-label">Network destinations</div>
                  <pre className="mono small">{installTicket.decision.networkDestinations.join("\n")}</pre>
                </div>
              )}
            </div>
          )}
          <div className="interrupt-options">
            <button className="approve" disabled={!!installing[installTicket.agentId]} onClick={() => void approveInstall("approve")}>
              {installing[installTicket.agentId] ? "installing…" : "Approve & install"}
            </button>
            <button className="reject" disabled={!!installing[installTicket.agentId]} onClick={() => void approveInstall("reject")}>
              Reject
            </button>
          </div>
        </div>
      )}

      {/* F12/J17 — ACP sign-in surface (authMethods from `initialize`).
          agent-type methods complete in the agent's own flow; url-type opens
          the browser and re-calls `acp_authenticate` after login. */}
      {authSurface && (
        <div className="ticket-card auth-card">
          <div className="interrupt-head">
            <span className="chip warn">SIGN IN</span>
            <span className="small muted">{authSurface.agentId}</span>
          </div>
          <p className="interrupt-prompt">
            <strong>{authSurface.agentId}</strong> needs you to authenticate before it
            will start a session.
          </p>
          {authSurface.url ? (
            <div className="interrupt-options">
              <span className="muted small">Browser opened — complete login, then:</span>
              <button className="approve" onClick={() => void signIn(authSurface.methods[0]?.id ?? "")}>
                I've signed in
              </button>
            </div>
          ) : (
            <div className="interrupt-options">
              {authSurface.methods.length === 0 && (
                <span className="muted small">No auth methods advertised — the agent may print a login URL in its own output.</span>
              )}
              {authSurface.methods.map((m) => (
                <button key={m.id} className="approve" onClick={() => void signIn(m.id)}>
                  Sign in with {m.name}
                </button>
              ))}
              <button className="reject" onClick={() => setAuthSurface(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* P1.8 — context-window warning (doc 33 §7.4: below 15K the agent
          loops trying to recover; warn loudly under 15–20K). */}
      {ctxWarning && (
        <div className={ctxLoud ? "ctx-warning loud" : "ctx-warning"} role="status">
          {ctxLoud ? "⚠" : "ℹ"} local model {model} — context {ctxWindow.toLocaleString()} tokens
          {ctxLoud
            ? ". Below 15K the agent loops trying to recover; set 15–20K (Ollama's default 4,096 is too low)."
            : ". 15–20K is the reliable floor; the broker forces num_ctx=16,384 on every call."}
        </div>
      )}

      {/* P1.6 — Hermes SOUL.md identity editor (Slot #1, injection-scanned in Rust/sidecar). */}
      {showSoul && (
        <section className="card soul-card">
          <h2>SOUL.md identity (Hermes Slot #1)</h2>
          <textarea
            value={soulMd}
            onChange={(e) => setSoulMd(e.target.value)}
            placeholder={"You are EveryAIOS. Core rule: …\nIdentity: …"}
            rows={4}
            aria-label="SOUL.md content"
          />
          <p className="hint">
            Injected above the stable prefix and scanned for prompt-injection
            patterns (doc 16 §38, B-16) before assembly.
          </p>
        </section>
      )}

      <div className="thread">
        {msgs.map((m, i) => (
          <div key={m.id}>
            {forkMark === i && (
              <div className="fork-chip">✦ forked — continuing from here</div>
            )}
            <div className={`bubble ${m.role}`}>
              {m.role === "assistant" ? (
                <Markdown text={m.text} />
              ) : (
                <span className="user-text">{m.text}</span>
              )}
              {i > 0 && !busy && (
                <button
                  className="fork-btn"
                  onClick={() => forkAt(i)}
                  title="Fork conversation from this message"
                  aria-label="Fork from this message"
                >
                  ⑂
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && !live.current && (
          <div className="bubble assistant typing">…</div>
        )}
        <div ref={endRef} />
      </div>

      {/* P1.6 — token streamer: tokens/sec, context %, active key. */}
      <div className="streamer">
        <span className="streamer-item">
          <span className="streamer-label">tokens/s</span>
          <span className="streamer-value">{busy ? tokensSec : 0}</span>
        </span>
        <span className="streamer-item" title={`${totalTokens} / ${ctxWindow} tokens (${provider} / ${model})`}>
          <span className="streamer-label">context</span>
          <span className="streamer-bar">
            <span
              className="streamer-fill"
              style={{ width: `${contextPct}%` }}
            />
          </span>
          <span className="streamer-value">{contextPct}%</span>
        </span>
        <span className="streamer-item">
          <span className="streamer-label">active key</span>
          <span className="streamer-value streamer-key">{activeKey}</span>
        </span>
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
        {busy ? (
          <button type="button" onClick={cancel}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}
