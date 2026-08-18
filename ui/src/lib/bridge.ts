// Live-data bridge (P0.7): when running inside the Tauri shell, replaces the
// demo layer with real data — ACP agents + install states, spend snapshot,
// and the chat streaming relay. In a plain-browser preview it no-ops and the
// UI stays fully explorable on the mock dataset.
//
// The bridge is deliberately additive: every surface keeps its demo fallback,
// so a missing command or a dead shell never blanks a panel.

import { useAppStore, type LiveBudget } from "./store";
import {
  inTauri,
  chatStream,
  onChatEvent,
  type ChatWireEvent,
} from "./tauri";
import { acpAgents, acpInstallStatus, type HarnessManifest } from "./acp";
import { usageSnapshot } from "./spend";
import { AGENTS, type AgentRuntime } from "./agents";

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

/** Route a live chat wire event into the active session's transcript. */
function handleChatEvent(e: ChatWireEvent): void {
  const st = useAppStore.getState();

  switch (e.type) {
    case "ttft":
      st.streamStart();
      break;
    case "batch":
      st.streamAppend(e.text ?? "", false);
      break;
    case "done":
      st.streamAppend(e.fullText ?? e.text ?? "", true);
      break;
    case "error":
      st.streamFail(e.message ?? "Agent error");
      break;
    case "toolCall":
      st.streamStep(`tool · ${e.text ?? e.code ?? ""}`);
      break;
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

export async function initBridge(): Promise<void> {
  if (!inTauri()) return;

  // 1. Agents — real registry + install states merged into the picker.
  try {
    const manifests = await acpAgents();
    const installs = await acpInstallStatus();
    const merged: AgentRuntime[] = AGENTS.map((a) => ({ ...a }));
    const seen = new Set(merged.map((a) => a.id));

    for (const m of manifests) {
      const catalogId = ACP_TO_CATALOG[m.id] ?? m.id;
      const state = installs[m.id];
      const status = state?.installed || m.id === "everyaios" ? "installed" : "available";
      const existing = merged.find((a) => a.id === catalogId);
      if (existing) {
        existing.status = status;
        existing.version = state?.version ?? existing.version;
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
    useAppStore.getState().setLiveAgents(merged);
  } catch {
    /* preview mode — keep the demo catalog */
  }

  // 2. Spend — live budget into the composer strip.
  try {
    const snap = await usageSnapshot();
    const spent = snap.byKey.reduce((s, k) => s + (k.costUsd ?? 0), 0);
    const budget: LiveBudget = {
      spent,
      cap: 2,
      tokens: snap.total.tokensIn + snap.total.tokensOut,
      cacheHitRate: snap.cacheHitRate,
    };
    useAppStore.getState().setLiveBudget(budget);
  } catch {
    /* demo */
  }

  // 3. Chat relay — stream real turns into the active session.
  try {
    void onChatEvent(handleChatEvent);
  } catch {
    /* demo */
  }

  // 4. Guard-2 tickets — poll pending approvals into the transcript as
  //    permission cards (same ticket id the Cockpit card shows).
  try {
    const { guardTickets } = await import("./guard");
    const seen = new Set<string>();
    setInterval(async () => {
      try {
        const tickets = await guardTickets();
        for (const t of tickets) {
          if (seen.has(t.ticketId)) continue;
          seen.add(t.ticketId);
          const st = useAppStore.getState();
          st.pushMcq(
            {
              id: t.ticketId,
              title: `${t.operation} · ${t.paths.join(", ")}`,
              description:
                t.decision?.goal ??
                `${t.operation} on ${t.paths.length} path(s) — ${t.risk} risk`,
              kind: "permission",
              options: [
                { label: "Approve & run", value: "approve" },
                { label: "Reject", value: "reject" },
              ],
            },
            t.sessionId,
          );
        }
      } catch {
        /* shell may not be ready yet */
      }
    }, 2000);
  } catch {
    /* demo */
  }
}

/** Send a user turn: live chat_stream when in the shell, demo toast otherwise. */
export async function sendUserMessage(text: string): Promise<void> {
  const st = useAppStore.getState();
  const trimmed = text.trim();
  if (!trimmed) return;

  const sessionId = st.activeSessionId;
  const agentId =
    st.selectedAgentId === "everyaios-native" ? undefined : st.selectedAgentId;
  st.pushUserMessage(trimmed);

  if (!inTauri()) {
    st.notify("Preview mode — run inside the Tauri shell for the live agent loop");
    return;
  }

  try {
    await chatStream({ sessionId, text: trimmed, agentId });
  } catch (err) {
    st.streamFail(err instanceof Error ? err.message : "Failed to reach the agent");
  }
}
