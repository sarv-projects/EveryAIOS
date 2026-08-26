/**
 * P37 — MCP directory Install actually attaches a user-supplied server
 * (P6.6/P22): the install flow turns a directory entry into an attach plan
 * that the Rust `AttachedServer::spawn` executes. Validation is the seam —
 * the install only produces a plan when the command is a recognized
 * distribution (npx/uvx/path), never a floating or arbitrary shell string.
 */

/** The directory entry the user picked. */
export interface McpDirectoryEntry {
  id: string;
  name: string;
  /** e.g. `npx @modelcontextprotocol/server-filesystem` */
  command: string;
  /** Optional pinned version. */
  version?: string;
}

/** The validated attach plan (what Rust `AttachedServer::spawn` runs). */
export interface AttachPlan {
  command: string;
  args: string[];
  /** The resolved distribution (command + pinned version). */
  resolved: string;
}

export type InstallVerdict =
  | { ok: true; plan: AttachPlan }
  | { ok: false; reason: "floating" | "unsupported_distribution" | "empty" };

/** Parse a command into (bin, args). */
function splitCommand(cmd: string): { bin: string; args: string[] } {
  const parts = cmd.trim().split(/\s+/);
  return { bin: parts[0] ?? "", args: parts.slice(1) };
}

/** The version part of a package spec: `@scope/name@1.2.3` → `1.2.3`,
 * `name@1.2.3` → `1.2.3`, scoped-unversioned / plain → `undefined`. */
function pkgVersion(pkg: string): string | undefined {
  const rest = pkg.startsWith("@") ? pkg.slice(pkg.indexOf("/") + 1) : pkg;
  const at = rest.indexOf("@");
  if (at > 0) return rest.slice(at + 1);
  return undefined;
}

/**
 * The install→attach validation: recognized distributions only
 * (`npx <pkg>[@<ver>]`, `uvx <pkg>`, or an absolute path to a server
 * binary). Anything else is refused — no arbitrary shell execution.
 */
export function installPlan(entry: McpDirectoryEntry): InstallVerdict {
  const { bin, args } = splitCommand(entry.command);
  if (!bin) {
    return { ok: false, reason: "empty" };
  }
  if (bin === "npx" || bin === "uvx") {
    const pkg = args[0] ?? "";
    if (!pkg) return { ok: false, reason: "empty" };
    const pinned = pkgVersion(pkg);
    if (entry.version && pinned === undefined) {
      return {
        ok: true,
        plan: {
          command: bin,
          args: [`${pkg}@${entry.version}`, ...args.slice(1)],
          resolved: `${bin} ${pkg}@${entry.version}`,
        },
      };
    }
    if (pinned !== undefined) {
      return { ok: true, plan: { command: bin, args, resolved: `${bin} ${pkg}` } };
    }
    // Floating unpinned package — refused (K6 version-pinning discipline).
    return { ok: false, reason: "floating" };
  }
  if (bin.startsWith("/") || bin.startsWith("./") || bin.startsWith("~")) {
    return { ok: true, plan: { command: bin, args, resolved: bin } };
  }
  return { ok: false, reason: "unsupported_distribution" };
}

/** List the attachable plans for a batch of directory entries (the
 * "Install" button's payload). */
export function attachablePlans(entries: McpDirectoryEntry[]): {
  plans: Array<{ id: string; plan: AttachPlan }>;
  rejected: Array<{ id: string; reason: string }>;
} {
  const plans = [];
  const rejected = [];
  for (const e of entries) {
    const v = installPlan(e);
    if (v.ok) {
      plans.push({ id: e.id, plan: v.plan });
    } else {
      rejected.push({ id: e.id, reason: v.reason });
    }
  }
  return { plans, rejected };
}
