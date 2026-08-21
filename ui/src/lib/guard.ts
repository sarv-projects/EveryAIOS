// P7.5 (Guard-2) / J21 — the human-in-the-loop approval-card bridge. Mirrors
// the `guard_cmds` / `PendingGuardCard` shape (camelCase); in a plain-browser
// preview the caller falls back to demo data so the card is explorable.

import { inTauri, invoke } from "./tauri";

/** The structured escalation bundle (doc 52 §2) rendered on the card. */
export interface GuardDecision {
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

/** One pending Guard-2 card. */
export interface GuardTicket {
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

/** An approve/reject audit receipt. */
export interface GuardReceipt {
  receiptId: string;
  ticketId: string;
  sessionId: string;
  toolId: string;
  operation: string;
  action: "approve" | "reject";
  tsMs: number;
  hash: string;
}

/** The policy + profile + estop summary (Settings guard panel). */
export interface GuardPolicy {
  minConfidenceForAuto: number;
  userFeedbackLearning: boolean;
  profile: string;
  estopPulled: boolean;
}

/** The pending tickets waiting on a human decision (polled by the page). */
export async function guardTickets(): Promise<GuardTicket[]> {
  if (!inTauri()) return demoTickets();
  return invoke<GuardTicket[]>("guard_tickets");
}

/** Record a human decision: `approve` or `reject`. */
export async function guardRespond(
  ticketId: string,
  action: "approve" | "reject",
  approvalNonce: string,
): Promise<boolean> {
  if (!inTauri()) return true;
  return invoke<boolean>("guard_respond", { ticketId, action, approvalNonce });
}

/** The append-only approve/reject receipts. */
export async function guardReceipts(): Promise<GuardReceipt[]> {
  if (!inTauri()) return demoReceipts();
  return invoke<GuardReceipt[]>("guard_receipts");
}

/** The policy + profile + estop summary. */
export async function guardPolicy(): Promise<GuardPolicy> {
  if (!inTauri()) {
    return {
      minConfidenceForAuto: 0.85,
      userFeedbackLearning: true,
      profile: "standard",
      estopPulled: false,
    };
  }
  return invoke<GuardPolicy>("guard_policy");
}

/** Pull (`pulled=true`) or reset the global estop. */
export async function guardEstop(pulled: boolean): Promise<boolean> {
  if (!inTauri()) return pulled;
  return invoke<boolean>("guard_estop", { pulled });
}

function demoTickets(): GuardTicket[] {
  return [
    {
      ticketId: "tkt-demo-1",
      agentId: "agent-researcher",
      sessionId: "sess-q3-budget",
      toolId: "fs.write",
      operation: "write",
      paths: ["/workspace/Q3-Budget.xlsx"],
      risk: "high",
      riskTier: "R3",
      approvalSource: "policy",
      approvalNonce: "demo-approval-nonce",
      expiresAtMs: Date.now() + 60_000,
      decision: {
        goal: "Update the Q3 budget with the 14 extracted receipts",
        proposedDiff: "  cell C2: 4500.00\n- cell C2: 4200.00\n+ cell C2: 4500.00",
        risk: "high",
        affectedPaths: ["/workspace/Q3-Budget.xlsx"],
        scriptLines: [],
        executionTarget: "",
        envVars: [],
        networkDestinations: [],
        webAction: null,
        confidence: 0.93,
      },
    },
    {
      ticketId: "tkt-demo-2",
      agentId: "agent-researcher",
      sessionId: "sess-q3-budget",
      toolId: "browser.navigate",
      operation: "web_action",
      paths: ["https://invoices.example.com/pay"],
      risk: "high",
      riskTier: "R3",
      approvalSource: "policy",
      approvalNonce: "demo-approval-nonce-2",
      expiresAtMs: Date.now() + 60_000,
      decision: {
        goal: "Submit the approved invoice payment on the vendor portal",
        proposedDiff: "POST https://invoices.example.com/pay (invoice #1042)",
        risk: "high",
        affectedPaths: ["https://invoices.example.com/pay"],
        scriptLines: [],
        executionTarget: "browser (owned tab)",
        envVars: [],
        networkDestinations: ["invoices.example.com"],
        webAction: "payment",
        confidence: 0.91,
      },
    },
  ];
}

function demoReceipts(): GuardReceipt[] {
  return [
    {
      receiptId: "rcpt:0",
      ticketId: "tkt-demo-1",
      sessionId: "sess-q3-budget",
      toolId: "fs.write",
      operation: "write",
      action: "approve",
      tsMs: Date.now() - 30_000,
      hash: "0".repeat(64),
    },
  ];
}
