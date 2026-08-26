import { describe, expect, test } from "bun:test";
import { ExternalInbox, unattendedVerdict } from "./external-inbox";

describe("P30.3 external inbox", () => {
  test("parks EXTERNAL asks and lists them", () => {
    const inbox = new ExternalInbox(() => 1000);
    const ask = inbox.park({
      summary: "Send the report by email",
      riskClass: "EXTERNAL",
      operation: "network",
      argsHash: "abc",
      sourceRun: "job-1",
    });
    expect(ask.state).toBe("open");
    expect(inbox.pendingCount()).toBe(1);
    expect(inbox.list()[0]!.id).toBe(ask.id);
  });

  test("approve mints a consumable ticket; never auto-approves", () => {
    const inbox = new ExternalInbox(() => 1000);
    const ask = inbox.park({
      summary: "Publish to the web",
      riskClass: "EXTERNAL",
      operation: "web",
      argsHash: "xyz",
      sourceRun: "job-2",
    });
    expect(ask.state).toBe("open"); // parked, NOT approved
    expect(inbox.approve(ask.id, "ticket-42")).toBe(true);
    const updated = inbox.list();
    expect(updated.length).toBe(0); // resolved leaves the open list
    expect(ask.state).toBe("approved");
    expect(ask.ticketId).toBe("ticket-42");
  });

  test("reject and reaper", () => {
    const inbox = new ExternalInbox(() => 10_000);
    const a = inbox.park({ summary: "s", riskClass: "EXEC", operation: "exec", argsHash: "h", sourceRun: "r" });
    expect(inbox.reject(a.id)).toBe(true);
    expect(a.state).toBe("rejected");

    let t = 1000;
    const old = new ExternalInbox(() => t);
    old.park({ summary: "old", riskClass: "EXTERNAL", operation: "network", argsHash: "h", sourceRun: "r" });
    t = 100_000_000; // clock advances past the TTL
    expect(old.expireOlderThan(1000)).toBe(1);
  });

  test("unattended verdict mirrors the Rust gradient", () => {
    expect(unattendedVerdict("READ", false)).toBe("act");
    expect(unattendedVerdict("WRITE_LOCAL", false)).toBe("act");
    expect(unattendedVerdict("WRITE_LOCAL", true)).toBe("park_in_inbox");
    expect(unattendedVerdict("EXEC", false)).toBe("park_in_inbox");
    expect(unattendedVerdict("EXTERNAL", false)).toBe("park_in_inbox");
  });
});
