import { describe, expect, it } from "bun:test";
import {
  mcpInstall,
  mcpQuarantine,
  mcpRun,
  mcpServers,
  mcpStop,
  mcpTools,
  type ManagerApproval,
} from "./mcp-manager";

function approvalFor(id: string): ManagerApproval {
  return { ticketId: `t-${id}`, target: id, used: false };
}

describe("mcp-manager (P22-2 Tauri/Connectors surface)", () => {
  it("lists the seed as discovered", () => {
    const servers = mcpServers();
    expect(servers.length).toBeGreaterThanOrEqual(21);
    const github = servers.find((s) => s.entry.id === "github");
    expect(github?.state).toBe("discovered");
  });

  it("installs only with approval + a pinned version (K6)", () => {
    const noApproval = mcpInstall("github");
    expect(noApproval.ok).toBe(false);
    // unpinned install is refused — no floating packages
    const floating = mcpInstall("github", approvalFor("github"));
    expect(floating.ok).toBe(false);
    const approved = mcpInstall("github", approvalFor("github"), "0.6.2");
    expect(approved.ok).toBe(true);
    if (approved.ok) {
      expect(approved.plan.resolved).toContain("@0.6.2");
    }
  });

  it("refuses servers with no install command", () => {
    const v = mcpInstall("notion", approvalFor("notion"), "1.0.0");
    expect(v.ok).toBe(false);
  });

  it("run → tools → stop lifecycle", () => {
    mcpInstall("github", approvalFor("github"), "0.6.2");
    const run = mcpRun("github");
    expect(run.ok).toBe(true);
    expect(mcpServers().find((s) => s.entry.id === "github")?.state).toBe("running");
    expect(mcpTools("github").length).toBeGreaterThan(0);
    mcpStop("github");
    expect(mcpServers().find((s) => s.entry.id === "github")?.state).toBe("installed");
    expect(mcpTools("github").length).toBe(0);
  });

  it("quarantine is permanent and blocks install", () => {
    mcpQuarantine("stripe");
    const v = mcpInstall("stripe", approvalFor("stripe"), "1.0.0");
    expect(v.ok).toBe(false);
    expect(mcpServers().find((s) => s.entry.id === "stripe")?.state).toBe("quarantined");
  });
});
