// Live-data bridge (P0.7): when running inside the Tauri shell, hydrates
// real agent, usage, session, work, Guard, and chat state. In a plain-browser
// run it remains inactive and the UI may use explicitly labelled preview fixtures.
// Native command failures are recorded as degraded runtime state and are never
// converted into preview data or synthetic success.

import { useAppStore, sanitizeSessionRows, type LiveBudget } from "./store";
import {
  inTauri,
  chatStream,
  onChatEvent,
  planExecute,
  type ChatWireEvent,
} from "./tauri";
import {
  acpAgents,
  acpIdFor,
  acpInstallStatus,
  acpLaunch,
  acpPrompt,
  type HarnessManifest,
  type InstallState,
} from "./acp";
import { limitationFor } from "./plain-language";
import { usageSnapshot } from "./spend";
import { AGENTS, type AgentRuntime } from "./agents";
import { resolveProviderModel } from "./model-routing";
import { workList, workSnapshot } from "./work";
import {
  markRuntimeBooting,
  markRuntimeLive,
  nativeCall,
  markSidecarOffline,
  markVaultLocked,
  markVaultSetup,
  runtimeError,
  setRuntimeState,
} from "./runtime";
import { runtimeStatus as readRuntimeStatus, type RuntimeStatus } from "./tauri";

/** ACP registry id → the v2 catalog's agent id (same brain, curated skin). */
const ACP_TO_CATALOG: Record<string, string> = {
  everyaios: "everyaios-native",
  claude: "claude-code",
  codex: "codex-cli",
  grok: "grok-build",
  gemini: "gemini-cli",
  cursor: "cursor-agent",
  aider: "aider",
  opencode: "opencode",
};

/** Merge the live ACP registry + per-agent install state over the static
 * catalog. Install truth comes from the shell: an agent is `installed` only
 * when EveryAIOS installed it (`acp_install_status`) or auto-discovery found
 * its CLI on PATH (kind "path"). PATH-discovered agents carry no version —
 * never fall back to a static example version. */
function mergeAgentCatalog(
  seed: AgentRuntime[],
  manifests: HarnessManifest[],
  installs: Record<string, InstallState>,
): AgentRuntime[] {
  const merged = seed.map((a) => ({ ...a }));
  const seen = new Set(merged.map((a) => a.id));
  for (const m of manifests) {
    const catalogId = ACP_TO_CATALOG[m.id] ?? m.id;
    const state = installs[m.id];
    const status = state?.installed || m.id === "everyaios" ? "installed" : "available";
    const existing = merged.find((a) => a.id === catalogId);
    if (existing) {
      existing.status = status;
      existing.version =
        state?.version ?? (state?.kind === "path" ? undefined : existing.version);
      existing.path = state?.binaryPath ?? existing.path;
      existing.note = m.description;
    } else if (!seen.has(catalogId)) {
      const row = synthesizeAgent(m);
      row.status = status;
      row.version = state?.version;
      row.path = state?.binaryPath ?? undefined;
      merged.push(row);
      seen.add(catalogId);
    }
  }
  return merged;
}

/** Re-run agent discovery on demand (Settings → Refresh / Health): re-fetch
 * the ACP registry + install status (incl. PATH auto-discovery) and republish
 * the merged catalog to the picker + settings. Throws on failure so callers
 * can surface the error instead of silently keeping stale rows. */
export async function refreshAgentCatalog(): Promise<void> {
  const manifests = await acpAgents();
  const installs = await acpInstallStatus();
  const merged = mergeAgentCatalog(AGENTS, manifests, installs);
  useAppStore.getState().setLiveAgents(merged);
}

/** Every ACP agent that has no curated catalog entry gets a synthesized
 * picker row (mark + accent + install state), so the full registry is
 * choosable even before its curated models land. */
function synthesizeAgent(m: HarnessManifest): AgentRuntime {
  const mark =
    m.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "A";
  return {
    id: m.id,
    name: m.name,
    vendor:
      m.authMode === "subscription"
        ? "subscription"
        : m.authMode === "api_key"
          ? "API key"
          : "local",
    tagline: m.description,
    status: "available",
    mark,
    accent: "bg-orange-500 text-black",
    capabilities: [],
    models: [],
    defaultModel: "",
    headless: true,
    sandbox: "soft",
    governance: m.governance,
    note: "Installed from the ACP registry (F8)",
  };
}

/** Map a circuit-break option value (from the Rust McqOption) to the
 * human label the card renders. Values are lowercase; labels title-case. */
function mcqLabel(value: string): string {
  switch (value) {
    case "skip":
      return "Skip this task";
    case "retry":
      return "Retry once";
    case "escalate":
      return "Escalate to me";
    case "takeover":
      return "Take over manually";
    case "approve":
      return "Approve & continue";
    case "reject":
      return "Reject";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

/**
 * J11 budget-kill surface: the broker's message is
 * `session 'X' stopped: $2.00 limit (spent $2.10)`. Normalize it to the
 * canonical `stopped: $spent / $limit` form the composer strip shows.
 */
function budgetKillText(message: string): string {
  const m = message.match(/stopped:\s*\$([\d.]+)\s*limit\s*\(spent\s*\$([\d.]+)\)/i);
  if (!m) return message.includes("stopped") ? message : `stopped: limit ${message}`;
  return `stopped: $${m[2]} / $${m[1]}`;
}

/** Route a live chat wire event into the session it belongs to. Chat-events
 * carry a `sessionId` so switching chats mid-stream never lands tokens on the
 * wrong transcript (bugfix 2); fall back to the active session only when the
 * event omits one. */
function handleChatEvent(e: ChatWireEvent): void {
  const st = useAppStore.getState();
  const sid = e.sessionId ?? st.activeSessionId;

  switch (e.type) {
    case "ttft":
      st.streamStart(sid);
      break;
    case "batch":
      st.streamAppend(e.text ?? "", false, sid);
      st.noteStreamTick(e.tokenCount ?? Math.max(1, Math.round((e.text ?? "").length / 4)));
      break;
    case "done":
      // `fullText` is the authoritative whole message; `batch` deltas were
      // already appended token-by-token, so replace (never concat) it.
      if (e.fullText) {
        st.streamFinalize(e.fullText, sid);
      } else if (e.text) {
        st.streamAppend(e.text, true, sid);
      }
      break;
    case "error":
      if (e.code === "budget_exceeded") {
        st.streamBudgetKill(budgetKillText(e.message ?? ""), sid);
        st.pushLiveNotification({
          id: `live:cost:${e.streamId ?? sid}:${Date.now()}`,
          kind: 'cost',
          title: 'Budget limit reached',
          detail: budgetKillText(e.message ?? ""),
          ts: Date.now(),
          unread: true,
          source: 'Spend',
        });
      } else if (e.code === "tool_failed" || e.toolId) {
        st.streamToolResult(e.toolId ?? "tool", undefined, e.message ?? "tool failed");
        st.pushLiveNotification({
          id: `live:tool:${e.toolId ?? 'tool'}:${Date.now()}`,
          kind: 'warning',
          title: `Tool failed: ${e.toolId ?? 'tool'}`,
          detail: e.message ?? "tool failed",
          ts: Date.now(),
          unread: true,
          source: 'Agent',
        });
      } else {
        // P32.4 — honest-limitation surfacing: say plainly what failed +
        // offer the nearest alternative (Wharton: no technical framing).
        const lim = limitationFor(e.message ?? "Agent error");
        st.streamFail(`${lim.plain} — ${lim.alternative}`, sid);
        st.pushLiveNotification({
          id: `live:error:${e.streamId ?? sid}:${Date.now()}`,
          kind: 'error',
          title: 'Turn failed',
          detail: lim.plain,
          ts: Date.now(),
          unread: true,
          source: 'Agent',
        });
      }
      break;
    case "stage":
      if (typeof e.stage === "string" && e.stage.startsWith("tool:")) {
        const parts = e.stage.split(":");
        const toolId = parts[1] ?? "tool";
        const phase = parts[2] ?? "";
        st.streamToolProgress(toolId, phase);
      }
      break;
    case "monitor":
      if (e.notified || e.stopped) {
        st.pushMonitor({
          notified: e.notified ?? false,
          stopped: e.stopped ?? false,
          current: e.current ?? "",
          jobId: e.jobId,
        });
        st.pushLiveNotification({
          id: `live:monitor:${e.jobId ?? e.streamId ?? 'job'}:${Date.now()}`,
          kind: 'info',
          title: e.stopped ? 'Monitor stopped' : 'Monitor updated',
          detail: e.current ?? "",
          ts: Date.now(),
          unread: true,
          source: 'Automation',
        });
      }
      break;
    case "toolCall":
      st.streamToolCall(e.toolId ?? e.text ?? e.code ?? "tool", e.args, e.risk);
      break;
    case "verification": {
      // P41.4 — K1 verification receipt: model-reported pass/fail per check,
      // surfaced inline in the editor's Diff rail.
      st.pushVerification({
        taskId: e.taskId ?? "",
        checks: e.checks ?? [],
        report: e.report ?? "",
        passed: e.passed === undefined ? null : e.passed,
        tsMs: Date.now(),
      });
      break;
    }
    case "toolResult": {
      const err =
        e.error ??
        (e.result && typeof e.result === "object" && e.result !== null && "error" in e.result
          ? String((e.result as { error?: unknown }).error ?? "")
          : undefined);
      st.streamToolResult(e.toolId ?? "tool", e.result, err || undefined);
      break;
    }
    // P6.3 Stage-0: the plan executor's circuit breaker tripped — render the
    // H2 cockpit MCQ card. The card's choice goes back via planRespond
    // (store.respondMcq routes by kind === 'mcq').
    case "interrupt":
      st.pushMcq(
        {
          id: e.breakId ?? `${e.planId ?? "plan"}-break`,
          title: e.title ?? "Agent needs a decision",
          description:
            e.description ?? "The plan hit a limit or loop. Choose how to continue.",
          kind: "mcq",
          options: (e.options ?? []).map((v) => ({ label: mcqLabel(v), value: v })),
        },
        undefined,
      );
      break;
    // P6.3 Stage-0: the plan finished (or halted) — end the streaming state.
    case "planDone":
      st.streamAppend(
        e.error
          ? `⚠ Plan halted: ${e.error}`
          : `✅ Plan complete · ${e.tasksDone ?? 0} task(s) done`,
        true,
      );
      break;
    default:
      break;
  }
}

type BridgeDisposer = () => void;

// `main.tsx` mounts the bootstrap effect inside React.StrictMode. Keep one
// shared bridge with reference-counted cleanup so setup→cleanup→setup does not
// duplicate listeners, polling, or side effects.
let bridgeUsers = 0;
let bridgeStart: Promise<BridgeDisposer> | null = null;

export function initBridge(): Promise<BridgeDisposer> {
  bridgeUsers += 1;
  if (!bridgeStart) bridgeStart = startBridge();
  return bridgeStart.then((dispose) => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      bridgeUsers = Math.max(0, bridgeUsers - 1);
      if (bridgeUsers === 0) {
        dispose();
        bridgeStart = null;
      }
    };
  });
}

async function startBridge(): Promise<BridgeDisposer> {
  if (!inTauri()) return () => undefined;

  let alive = true;
  let hydrated = false;
  let hydrating = false;
  let wasSidecarReady = false;
  let fault: string | undefined;
  let readinessTimer: ReturnType<typeof setInterval> | undefined;
  let guardTimer: ReturnType<typeof setInterval> | undefined;
  let unlistenChat: (() => void) | undefined;
  const seenTickets = new Set<string>();

  const recordFault = (operation: string, error: unknown) => {
    fault = `${operation}: ${runtimeError(error)}`;
    setRuntimeState('degraded', fault);
  };

  const updateReadiness = async (): Promise<RuntimeStatus | null> => {
    if (!alive) return null;
    try {
      const status = await readRuntimeStatus();
      if (!alive) return status;
      if (status.vault === 'setup') {
        markVaultSetup();
      } else if (status.vault === 'locked') {
        markVaultLocked();
      } else if (!status.sidecar) {
        wasSidecarReady = false;
        markSidecarOffline();
      } else {
        // A supervisor restart is a new live session. Rehydrate native
        // projections and discard transient errors from the old relay.
        if (!wasSidecarReady) {
          hydrated = false;
          fault = undefined;
        }
        wasSidecarReady = true;
        if (status.persistence === 'ephemeral') {
          setRuntimeState('degraded', 'Vault persistence is unavailable.');
        } else if (fault) {
          setRuntimeState('degraded', fault);
        } else {
          markRuntimeLive();
        }
      }
      return status;
    } catch (error) {
      recordFault('runtime readiness probe', error);
      return null;
    }
  };

  const loadLiveData = async () => {
    if (!alive || hydrating) return;
    hydrating = true;
    fault = undefined;
    try {
      try {
        const manifests = await acpAgents();
        const installs = await acpInstallStatus();
        const merged = mergeAgentCatalog(AGENTS, manifests, installs);
        if (alive) useAppStore.getState().setLiveAgents(merged);
      } catch (error) {
        recordFault('agent registry', error);
      }

      try {
        const snap = await usageSnapshot();
        const budget: LiveBudget = {
          spent: snap.byKey.reduce((s, k) => s + (k.costUsd ?? 0), 0),
          cap: 2,
          tokens: snap.total.tokensIn + snap.total.tokensOut,
          cacheHitRate: snap.cacheHitRate,
        };
        if (alive) {
          useAppStore.getState().setLiveBudget(budget);
          const top = snap.byKey[0];
          if (top?.key) {
            const st = useAppStore.getState();
            useAppStore.setState({ streamStats: { ...st.streamStats, activeKey: top.key } });
          }
        }
      } catch (error) {
        recordFault('usage ledger', error);
      }

      try {
        const { invoke } = await import('./tauri');
        const listed = await nativeCall('session list', () => invoke<{ sessions?: Array<import('./store').Session> }>('session_list'));
        if (alive) {
          // An empty native list is authoritative. It replaces the browser
          // seed with an empty real vault and prevents fake chats persisting.
          useAppStore.getState().markSessionsHydrated();
          // P50.2.1 — schema-wrong rows (valid JSON, no usable id) are
          // dropped, never rendered as broken chats.
          const sessions = sanitizeSessionRows(listed?.sessions);
          // P38 — rehydrate per-session Chief pins from the vault round-trip
          // (each Session carries its durable `chiefPin`), so pins set before
          // the app restarted are live again in the store mirror.
          const sessionChiefs: Record<string, string> = {}
          for (const s of sessions) {
            if (s.chiefPin) sessionChiefs[s.id] = s.chiefPin
          }
          useAppStore.setState({
            sessions,
            activeSessionId: sessions[0]?.id ?? '',
            ...(Object.keys(sessionChiefs).length > 0 ? { sessionChiefs } : {}),
          });
        }
      } catch (error) {
        recordFault('session store', error);
      }

      try {
        const items = await workList();
        if (alive) {
          const active = useAppStore.getState().activeSessionId;
          const current = items.find((w) => w.sessionId === active) ?? items[0];
          const snapshot = current ? await workSnapshot(current.workId) : null;
          useAppStore.getState().setWorkProjection(items, snapshot?.presence, snapshot?.events);
        }
      } catch (error) {
        recordFault('work gateway', error);
      }

      // P50.4.1/4.9 — the live provider-configured fact (vault has ≥1 BYOK
      // key). Drives the first-run setup gate, the no-provider chat empty
      // state, and the capability matrix. `null` until first probe.
      try {
        const { invoke } = await import('./tauri');
        const listed = await nativeCall('vault keys', () =>
          invoke<{ keys?: unknown[] }>('vault_keys_list'),
        );
        if (alive) {
          useAppStore.getState().setProviderKeysConfigured((listed?.keys?.length ?? 0) > 0);
        }
      } catch (error) {
        // Vault locked is a normal early state — the fact stays `null`
        // (unknown) until the vault opens; never guess.
        if (alive && (useAppStore.getState().providerKeysConfigured === null)) {
          const status = await readRuntimeStatus().catch(() => null);
          if (status?.vault === 'ready') recordFault('vault keys', error);
        }
      }

      // P38 — the user's primary_chief default, read live at hydration so the
      // chat send path resolves the effective Chief without stale config.
      try {
        const { chiefDefaultGet } = await import('./acp');
        const cfg = await chiefDefaultGet();
        if (alive && cfg?.primaryChief) useAppStore.getState().setUserDefaultChief(cfg.primaryChief);
      } catch (error) {
        recordFault('chief default', error);
      }

      if (alive) {
        const { guardTickets } = await import('./guard');
        const pollGuard = async () => {
          try {
            const tickets = await guardTickets();
            for (const t of tickets) {
              if (!alive || seenTickets.has(t.ticketId)) continue;
              seenTickets.add(t.ticketId);
              const st = useAppStore.getState();
              st.pushLiveNotification({
                id: `live:guard:${t.ticketId}`,
                kind: 'guard',
                title: `Approval needed: ${t.operation}`,
                detail: `${t.paths.join(', ')} — ${t.risk} risk`,
                ts: Date.now(),
                unread: true,
                source: 'Guard',
              });
              const snap = st.taskSnapshot;
              const frozenLow = !!snap && snap.sessionId === t.sessionId &&
                (snap.autonomyLevel === 'sandbox' || snap.autonomyLevel === 'ask');
              if (frozenLow) {
                st.pushAutonomyLimit({
                  id: t.ticketId,
                  action: `${t.operation} · ${t.paths.join(', ')}`,
                  reason: t.decision?.goal ?? `${t.operation} on ${t.paths.length} path(s) — ${t.risk} risk`,
                  sessionId: t.sessionId,
                });
              } else {
                st.pushMcq({
                  id: t.ticketId,
                  title: `${t.operation} · ${t.paths.join(', ')}`,
                  description: t.decision?.goal ?? `${t.operation} on ${t.paths.length} path(s) — ${t.risk} risk`,
                  kind: 'permission',
                  approvalNonce: t.approvalNonce,
                  options: [
                    { label: 'Approve & run', value: 'approve' },
                    { label: 'Reject', value: 'reject' },
                  ],
                }, t.sessionId);
              }
            }
          } catch (error) {
            recordFault('Guard-2 ticket poll', error);
          }
        };
        await pollGuard();
        guardTimer = setInterval(() => void pollGuard(), 2000);
      }
      hydrated = true;
      if (alive) {
        const status = await readRuntimeStatus().catch(() => null);
        if (status?.vault === 'ready' && status.sidecar && !fault && status.persistence !== 'ephemeral') {
          markRuntimeLive();
        }
      }
    } finally {
      hydrating = false;
    }
  };

  markRuntimeBooting();
  try {
    // Tauri events are process-wide. Attach exactly once for this bridge
    // lifetime; sidecar restarts reuse the same event channel and must not
    // create duplicate transcript updates.
    unlistenChat = await onChatEvent(handleChatEvent);
    if (!alive) {
      unlistenChat();
      unlistenChat = undefined;
    }
  } catch (error) {
    recordFault('chat event listener', error);
  }
  const initial = await updateReadiness();
  if (initial?.vault === 'ready' && initial.sidecar) {
    await loadLiveData();
  }
  readinessTimer = setInterval(() => {
    void updateReadiness().then((status) => {
      if (status?.vault === 'ready' && status.sidecar && !hydrated) void loadLiveData();
    });
    // 5s: a status probe needs no faster cadence — sidecar restart detection
    // within ~5s is fine and each tick is a Tauri IPC round-trip that can
    // otherwise keep the UI busy on slower machines (P45 R4 micro-perf).
  }, 5000);

  return () => {
    alive = false;
    if (readinessTimer) clearInterval(readinessTimer);
    if (guardTimer) clearInterval(guardTimer);
    unlistenChat?.();
    unlistenChat = undefined;
    seenTickets.clear();
  };
}

// Single source of truth for catalog→registry id translation lives in
// `./acp` (`acpIdFor`); do not re-introduce a second map here.
function isInbuilt(agentId: string): boolean {
  return agentId === "everyaios-native" || agentId === "everyaios" || agentId === "";
}

/**
 * P50.3.6 — resolve the provider/model a turn should run on.
 * - An explicit local runtime selection always wins (the user picked it).
 * - When auto-route is on, return undefined/undefined so the coordinator's
 *   live task→model router (health/cost/latency observations, `router.ts`
 *   `selectModelForTask`) decides per turn; the Rust `chat_stream` boundary
 *   accepts `None` for both and routes accordingly.
 * - Otherwise fall back to the static catalog mapping for the picked model.
 */
function selectedProviderModel(modelId: string): { provider?: string; model?: string } {
  // P50.3.6 — pure decision (tested in model-routing.test.ts).
  const st = useAppStore.getState();
  return resolveProviderModel({
    modelId,
    localRuntime: st.localRuntime,
    autoRoute: st.autoRoute,
  });
}

/**
 * Send a user turn: live chat_stream when in the shell, demo toast otherwise.
 * `context` (P4.7 chat-overlay) injects an open document's text below the
 * cache boundary as a J6 `<user_document>`.
 */
export async function sendUserMessage(
  text: string,
  context?: { title: string; content: string },
): Promise<void> {
  const st = useAppStore.getState();
  const trimmed = text.trim();
  if (!trimmed) return;

  // P50.2.1 — never dispatch a turn against a session that does not exist.
  // An empty vault (or a wiped id) means the first message opens the work:
  // create the session first so the turn has a real target and the message
  // is never silently dropped by pushUserMessage's id match.
  let sessionId = st.activeSessionId;
  if (!st.sessions.some((s) => s.id === sessionId)) {
    st.newSession();
    sessionId = useAppStore.getState().activeSessionId;
  }
  const catalogId = st.selectedAgentId;
  const selectedInbuilt = isInbuilt(catalogId);
  // P38 — the session's effective Chief: session pin → user default →
  // inbuilt. The pin is store-owned (set via the picker's per-session pin);
  // the user default is read live so an out-of-date cached default never
  // misroutes. When the Chief is an external ACP agent, the session's turns
  // route through the ACP channel under that Chief (spec F12: an external
  // Chief is the session's top brain, EveryAIOS is the governed shell); the
  // coordinator additionally refuses any inbuilt dispatch that carries an
  // external `primaryChief` (fail-closed, never silent fallback).
  const pin = st.sessionChiefs[sessionId];
  const userDefault = useAppStore.getState().userDefaultChief;
  const sessionChief = pin ?? userDefault ?? "inbuilt";
  const chiefInbuilt = isInbuilt(sessionChief);
  // A session governed by an external Chief runs on the ACP channel no matter
  // which chat agent the user has selected — the pinned Chief outranks the
  // selected agent for that session's turns.
  const inbuilt = selectedInbuilt && chiefInbuilt;
  const agentId = inbuilt ? undefined : sessionChief;
  const { provider, model } = selectedProviderModel(st.selectedModelId);
  // P33 scoped-PDF fix — when the study-mode chip is set (chat scoped to an
  // open document) and no explicit context was passed, attach the open
  // document's extracted text so answers are grounded in it.
  let effectiveContext = context;
  if (!effectiveContext && st.scopedView === 'office-pdf' && st.scopedDoc) {
    effectiveContext = { title: st.scopedDoc.title, content: st.scopedDoc.content };
  }
  st.pushUserMessage(trimmed);
  // P44.6 — freeze the autonomy scope (level + mode + workspace + agent) into
  // the task's config_hash at start. Live chatbar changes never mutate an
  // in-flight Work; the snapshot + any temporary elevation clear at turn end.
  st.freezeTaskSnapshot();

  if (!inTauri()) {
    st.notify("Preview mode — run inside the Tauri shell for the live agent loop");
    return;
  }

  // P50.4.1/4.9 — no provider configured: open the setup gate instead of
  // dispatching a turn that dies with a generic "agent error". The vault
  // fact is `false` (probed), not `null` (unknown — let the wire decide and
  // surface its error honestly). A picked local runtime always counts.
  if (st.providerKeysConfigured === false && !st.localRuntime) {
    st.openSetup();
    st.notify("No model provider configured — add a BYOK key or use a local model first.");
    return;
  }

  try {
    if (st.composerMode === "plan") {
      const { draftPlanTasks } = await import("./plan-draft");
      const tasks = draftPlanTasks(trimmed);
      const planId = `plan-${Date.now()}`;
      st.setPendingPlan({ planId, tasks });
      st.streamStart();
      const body = [
        "Plan (read-only — Codex/Claude plan mode). Approve to execute:",
        ...tasks.map((t, i) => `${i + 1}. ${t.goal}`),
      ].join("\n");
      st.streamAppend(body, false);
      st.pushMcq({
        id: planId,
        title: "Approve this plan?",
        description: `${tasks.length} task(s). Nothing has been executed.`,
        kind: "plan",
        options: [
          { label: "Approve & run", value: "approve" },
          { label: "Discard", value: "reject" },
        ],
      });
      return;
    }
    if (!inbuilt) {
      // P38 — the session runs under its Chief. When the Chief is external
      // (pinned or defaulted), launch THAT agent on the ACP channel; when
      // only the selected agent is external, that agent is the Chief.
      const chiefId = !chiefInbuilt ? sessionChief : catalogId;
      const acpId = acpIdFor(chiefId);
      let handle = st.acpHandles[catalogId];
      if (!handle) {
        const folder =
          st.sessions.find((s) => s.id === sessionId)?.folder ?? "~";
        const info = await acpLaunch(acpId, folder);
        handle = info.handle;
        st.setAcpHandle(catalogId, handle);
      }
      const result = await acpPrompt(handle, trimmed);
      const pending = result.pendingTickets?.length
        ? ` · ${result.pendingTickets.length} approval(s)`
        : "";
      st.streamStart();
      st.streamAppend(
        `ACP ${result.stopReason ?? "done"}${pending}`,
        true,
      );
      return;
    }
    const { SOUL_PRESETS } = await import("./personas");
    const streamId = await chatStream({
      sessionId,
      text: trimmed,
      agentId,
      provider,
      model,
      personaId: st.personaId,
      soulMd: SOUL_PRESETS[st.soulId] || undefined,
      ...(effectiveContext ? { userDocuments: [effectiveContext] } : {}),
      // P38 — always assert the session's Chief at the wire boundary (inbuilt
      // here, since the external-Chief case took the ACP branch above). The
      // coordinator guard refuses if it ever sees a non-inbuilt value on the
      // inbuilt engine path.
      primaryChief: sessionChief,
    });
    // Bugfix — remember the live stream id so Pause/Stop can `chat_cancel`
    // the real Rust stream instead of only flipping local state.
    if (streamId) useAppStore.getState().setLiveStreamId(sessionId, streamId);
  } catch (err) {
    // P11.5.12 — a dropped IPC mid-stream surfaces the reconnect chip instead
    // of a hard failure; the coordinator's StreamRegistry holds the last-token
    // cursor so a resume replays byte-continuously (the chip auto-clears when
    // the next batch lands via streamAppend).
    const stNow = useAppStore.getState();
    const activeSess = stNow.sessions.find((s) => s.id === stNow.activeSessionId);
    const running = activeSess?.status === "running";
    if (running) {
      stNow.setReconnect({
        show: true,
        lastToken: stNow.streamStats.tokensThisTurn > 0 ? "…" : "",
        tokens: stNow.streamStats.tokensThisTurn,
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Failed to reach the agent";
    setRuntimeState('degraded', `chat stream: ${message}`);
    st.streamFail(message);
  }
}
