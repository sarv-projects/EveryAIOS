// F1 — the dedicated Guard-2 approval window script.
//
// Runs only inside the `guard` webview. Deliberately standalone: no React, no
// vendor imports, no iframes. It polls the pending ticket stack straight from
// Rust (`guard_tickets`) and records human decisions via `guard_respond` —
// which the Rust side only accepts from this window's label.
//
// In a plain browser (no Tauri) the page shows the empty state; there is no
// demo data here on purpose — this surface must never pretend an approval
// happened.

import { invoke } from "@tauri-apps/api/core";
import { recordApprovalDecision } from "./lib/ux-metrics";

interface GuardDecision {
  goal: string;
  proposedDiff: string;
  risk: string;
  affectedPaths: string[];
  scriptLines: string[];
  executionTarget: string;
  envVars: string[];
  networkDestinations: string[];
  webAction: string | null;
  confidence: number | null;
}

interface GuardTicket {
  ticketId: string;
  agentId: string;
  sessionId: string;
  toolId: string;
  operation: string;
  paths: string[];
  risk: string;
  riskTier?: string;
  approvalSource: string;
  approvalNonce: string;
  expiresAtMs: number;
  decision?: GuardDecision;
}

const stackEl = document.getElementById("stack") as HTMLElement;
const countEl = document.getElementById("count") as HTMLElement;

const riskTone = (risk: string): string => {
  const r = risk.toLowerCase();
  if (r.includes("high") || r.includes("critical")) return "high";
  if (r.includes("medium")) return "medium";
  if (r.includes("low")) return "low";
  return "unknown";
};

const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function render(tickets: GuardTicket[]): void {
  countEl.textContent = `${tickets.length} pending`;
  stackEl.replaceChildren();
  if (tickets.length === 0) {
    const empty = el("div", "empty", "No pending approvals. Everything is quiet.");
    stackEl.appendChild(empty);
    return;
  }
  for (const t of tickets) {
    const card = el("div", "card");
    const h = el("h2", undefined, `${t.operation}${t.paths.length ? " · " + t.paths.join(", ") : ""}`);
    card.appendChild(h);
    const sub = el("div", "sub", `ticket ${t.ticketId.slice(0, 8)} · agent ${t.agentId} · ${t.toolId}`);
    card.appendChild(sub);
    const risk = el("span", `risk ${riskTone(t.risk)}`, t.riskTier ?? t.risk);
    card.appendChild(risk);

    const d = t.decision;
    if (d?.goal) {
      const g = el("div", "section");
      g.appendChild(el("div", "label", "Goal"));
      g.appendChild(el("div", undefined, d.goal));
      card.appendChild(g);
    }
    if (d?.affectedPaths?.length) {
      const p = el("div", "section");
      p.appendChild(el("div", "label", "Paths"));
      p.appendChild(el("pre", "paths", d.affectedPaths.join("\n")));
      card.appendChild(p);
    }
    if (d?.proposedDiff) {
      const x = el("div", "section");
      x.appendChild(el("div", "label", "Proposed change"));
      x.appendChild(el("pre", undefined, d.proposedDiff));
      card.appendChild(x);
    }
    if (d?.scriptLines?.length) {
      const s = el("div", "section");
      s.appendChild(el("div", "label", "Script"));
      s.appendChild(el("pre", "lines", d.scriptLines.join("\n")));
      card.appendChild(s);
    }
    if (d?.networkDestinations?.length) {
      const n = el("div", "section");
      n.appendChild(el("div", "label", "Network"));
      const ul = document.createElement("ul");
      d.networkDestinations.forEach((dst) => ul.appendChild(el("li", undefined, dst)));
      n.appendChild(ul);
      card.appendChild(n);
    }
    if (d?.envVars?.length) {
      const e = el("div", "section");
      e.appendChild(el("div", "label", "Env vars"));
      e.appendChild(el("pre", "lines", d.envVars.join("\n")));
      card.appendChild(e);
    }

    const actions = el("div", "actions");
    const approve = el("button", "approve", "Approve & run") as HTMLButtonElement;
    const reject = el("button", "reject", "Reject") as HTMLButtonElement;
    let busy = false;
    const setBusy = (b: boolean) => {
      busy = b;
      approve.disabled = b;
      reject.disabled = b;
    };
    const respond = async (action: "approve" | "reject") => {
      if (busy) return;
      setBusy(true);
      try {
        await invoke<boolean>("guard_respond", {
          ticketId: t.ticketId,
          action,
          approvalNonce: t.approvalNonce,
        });
        // P11.6.4 — local UX metric: a recorded human approval decision.
        recordApprovalDecision(action === "approve");
        render(await ticketsNow());
      } catch (e) {
        const err = el("div", "error", `Guard-2 refused: ${e}`);
        card.appendChild(err);
      } finally {
        setBusy(false);
      }
    };
    approve.addEventListener("click", () => void respond("approve"));
    reject.addEventListener("click", () => void respond("reject"));
    actions.append(approve, reject);
    card.appendChild(actions);

    const expiry = t.expiresAtMs - Date.now();
    if (expiry > 0 && expiry < 60_000) {
      card.appendChild(el("div", "note", `Expires in ${Math.max(1, Math.round(expiry / 1000))}s — the nonce binds this card to the ticket.`));
    }
    stackEl.appendChild(card);
  }
}

async function ticketsNow(): Promise<GuardTicket[]> {
  try {
    return await invoke<GuardTicket[]>("guard_tickets");
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  // First paint immediately, then poll (the main UI opens this window when a
  // ticket is waiting, so a fast first paint matters).
  render(await ticketsNow());
  setInterval(async () => {
    try {
      render(await ticketsNow());
    } catch {
      /* shell not ready */
    }
  }, 2000);
}

void main();
