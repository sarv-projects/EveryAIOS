import { describe, expect, it } from "bun:test";
import { Inbox, repeat, routeCapture, Studio, type RepeatTarget } from "./surfaces";

describe("ADD-1 capture routing", () => {
  it("routes each capture kind to its engine", () => {
    expect(routeCapture({ kind: "file", path: "a.docx" })).toBe("office");
    expect(routeCapture({ kind: "screenshot", ref: "e1" })).toBe("browser");
    expect(routeCapture({ kind: "clipboard", text: "x" })).toBe("memory");
    expect(routeCapture({ kind: "url", url: "https://x" })).toBe("browser");
    expect(routeCapture({ kind: "selection", text: "y" })).toBe("memory");
    expect(routeCapture({ kind: "voice_memo", audioRef: "a" })).toBe("report");
  });
});

describe("ADD-2 inbox", () => {
  it("composes and queries by kind, newest first", () => {
    const inbox = new Inbox();
    inbox.push({ kind: "notification", id: "n1", text: "approved", at: 1 });
    inbox.push({ kind: "memory", id: "m1", text: "fact", at: 2 });
    inbox.push({ kind: "notification", id: "n2", text: "blocked", at: 3 });
    const all = inbox.all();
    expect(all[0]!.id).toBe("n2");
    expect(inbox.byKind("notification")).toHaveLength(2);
    expect(inbox.byKind("task")).toHaveLength(0);
    inbox.ack("n1");
    expect(inbox.byKind("notification")).toHaveLength(1);
  });
});

describe("ADD-3 repeat-it", () => {
  const t: RepeatTarget = {
    ticketId: "t-1",
    idempotencyKey: "k-1",
    effectClass: "reversible",
    argsHash: "abc",
  };

  it("repeats reversible entries with the same args hash", () => {
    expect(repeat(t, true)).toEqual({ ok: true, argsHash: "abc" });
  });

  it("refuses irreversible and uncertain repeats", () => {
    expect(repeat({ ...t, effectClass: "irreversible" }, true)).toEqual({
      ok: false,
      reason: "irreversible",
    });
    expect(repeat({ ...t, effectClass: "uncertain" }, true)).toEqual({
      ok: false,
      reason: "uncertain",
    });
  });

  it("quiet mode requires a ticket", () => {
    expect(repeat({ ...t, ticketId: "" }, true)).toEqual({
      ok: false,
      reason: "missing_ticket",
    });
  });
});

describe("ADD-4 studio", () => {
  it("composes deliverables with format per kind", () => {
    const studio = new Studio();
    const rep = studio.compose("report", "Weekly brief", ["card-1", "card-2"]);
    expect(rep.format).toBe("docx");
    expect(rep.state).toBe("draft");
    const wb = studio.compose("workbook", "Budget", ["card-3"]);
    expect(wb.format).toBe("xlsx");
    studio.markRendered(rep.id);
    expect(studio.all()[0]!.state).toBe("rendered");
    studio.export(rep.id);
    expect(studio.all()[0]!.state).toBe("exported");
  });
});
