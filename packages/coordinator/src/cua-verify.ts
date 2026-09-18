/**
 * P60.6 — mechanical verify on the live turn.
 *
 * Fetched OpenAdapt: VERIFIED only if an independent system-of-record read
 * agrees. A Worker/banner claim is not evidence. Disk is truth.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export type EvidenceKind =
  | "none"
  | "file-exists"
  | "file-contains"
  | "file-equals"
  | "command-exit"
  | "close-read";

export interface MechanicalEvidence {
  kind: EvidenceKind;
  path?: string;
  expect?: string;
  exitCode?: number;
  text?: string;
}

export function evidenceFromToolArgs(args: Record<string, unknown>): MechanicalEvidence | undefined {
  if (args.evidence && typeof args.evidence === "object") {
    const o = args.evidence as Record<string, unknown>;
    const kind = typeof o.kind === "string" ? (o.kind as EvidenceKind) : "none";
    const ev: MechanicalEvidence = { kind };
    if (typeof o.path === "string") ev.path = o.path;
    if (typeof o.expect === "string") ev.expect = o.expect;
    if (typeof o.exitCode === "number") ev.exitCode = o.exitCode;
    if (typeof o.exit_code === "number") ev.exitCode = o.exit_code;
    if (typeof o.text === "string") ev.text = o.text;
    return ev;
  }
  if (typeof args.verifyPath === "string") {
    const ev: MechanicalEvidence = {
      kind: typeof args.verifyExpect === "string" ? "file-contains" : "file-exists",
      path: args.verifyPath,
    };
    if (typeof args.verifyExpect === "string") ev.expect = args.verifyExpect;
    return ev;
  }
  return undefined;
}

export async function applyCuaMechanicalVerifyIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
  result?: unknown,
): Promise<{ applied: boolean; workerClaimed: boolean }> {
  const root = typeof args.cuaRoot === "string" ? args.cuaRoot : undefined;
  const nodeId = typeof args.nodeId === "string" ? args.nodeId : undefined;
  const evidence = evidenceFromToolArgs(args);
  if (!root || !nodeId || !evidence) return { applied: false, workerClaimed: false };
  const fromResult =
    typeof result === "object" &&
    result !== null &&
    (result as { ok?: unknown }).ok === true;
  const workerClaimed = fromResult || args.verifyOk === true;
  await request("execution/cua_verify", {
    root,
    nodeId,
    workerClaimed,
    evidence,
  });
  return { applied: true, workerClaimed };
}
