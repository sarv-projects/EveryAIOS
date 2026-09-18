import { describe, expect, test } from "bun:test";
import { refuseDesktopIfWrongSurface, routeWorkSurface } from "./cua-route";

describe("routeWorkSurface (P59.1)", () => {
  test("office before browse before desktop", () => {
    expect(routeWorkSurface("report.xlsx")).toBe("office");
    expect(routeWorkSurface("/tmp/a.DOCX")).toBe("office");
    expect(routeWorkSurface("https://example.com/app")).toBe("browse");
    expect(routeWorkSurface("C:\\\\Program Files\\\\Chrome.exe")).toBe("desktop");
    expect(routeWorkSurface("QuickBooks")).toBe("desktop");
  });

  test("desktop.act refuses office and URL targets before any CUA attach", () => {
    const office = refuseDesktopIfWrongSurface("desktop.act", { path: "a.xlsx" });
    expect(office.ok).toBe(false);
    if (!office.ok) expect(office.surface).toBe("office");
    const url = refuseDesktopIfWrongSurface("desktop.act", { url: "https://ex.test" });
    expect(url.ok).toBe(false);
    if (!url.ok) expect(url.surface).toBe("browse");
    expect(refuseDesktopIfWrongSurface("desktop.act", { target: "Notepad" }).ok).toBe(true);
    expect(refuseDesktopIfWrongSurface("file_ops.read", { path: "a.xlsx" }).ok).toBe(true);
  });
});
