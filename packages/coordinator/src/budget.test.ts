import { describe, expect, test } from "bun:test";
import {
  applyBudget,
  budgetFor,
  budgetJson,
  DEFAULT_REF_TTL_MS,
  MAX_REF_HANDLES,
  MessageKind,
  RefRegistry,
} from "./budget";

describe("budgetFor — the doc-42 §1.4 table", () => {
  test("tool results are bounded at 50 KB", () => {
    expect(budgetFor(MessageKind.ToolResult).inlineLimit).toBe(50 * 1024);
  });
  test("scraped pages are ref-first at 2 KB", () => {
    expect(budgetFor(MessageKind.ScrapedPage).inlineLimit).toBe(2 * 1024);
  });
  test("a11y snapshots stay slim", () => {
    expect(budgetFor(MessageKind.A11ySnapshot).inlineLimit).toBe(8 * 1024);
  });
});

describe("applyBudget", () => {
  test("60 KB tool result truncates to ≤50 KB with a marker", () => {
    const b = applyBudget(MessageKind.ToolResult, new Uint8Array(60 * 1024).fill(0x61));
    expect(b.truncated).toBe(true);
    expect(b.inline.byteLength).toBeLessThanOrEqual(50 * 1024);
    expect(b.full?.byteLength).toBe(60 * 1024);
    const text = new TextDecoder().decode(b.inline);
    expect(text).toContain("truncated by payload budget");
  });

  test("small payload passes through untouched", () => {
    const bytes = new TextEncoder().encode("tiny result");
    const b = applyBudget(MessageKind.ToolResult, bytes);
    expect(b.truncated).toBe(false);
    expect(b.full).toBeUndefined();
    expect(b.inline).toEqual(bytes);
  });

  test("every kind stays within its own inline limit", () => {
    for (const kind of [
      MessageKind.ToolResult,
      MessageKind.ScrapedPage,
      MessageKind.A11ySnapshot,
      MessageKind.AuditExport,
      MessageKind.Default,
    ]) {
      const b = applyBudget(kind, new Uint8Array(1024 * 1024));
      expect(b.inline.byteLength).toBeLessThanOrEqual(budgetFor(kind).inlineLimit + 512);
    }
  });
});

describe("RefRegistry — C10 pass-by-reference seam", () => {
  test("put/take round-trips one-shot", () => {
    const r = new RefRegistry();
    const wire = r.put(new Uint8Array([1, 2, 3]));
    expect(wire).toMatch(/^ref:handle:\d+$/);
    expect(r.take(wire)?.byteLength).toBe(3);
    expect(r.take(wire)).toBeUndefined(); // one-shot
    expect(r.size).toBe(0);
  });

  test("unresolved handles expire after the TTL (W5 — no unbounded leak)", () => {
    let t = 0;
    const r = new RefRegistry(() => t);
    const wire = r.put(new Uint8Array([9]));
    expect(r.size).toBe(1);
    t = DEFAULT_REF_TTL_MS; // exactly at expiry → already dead
    expect(r.size).toBe(0); // lazy sweep on size
    expect(r.take(wire)).toBeUndefined();
    expect(r.sweep()).toBe(0);
  });

  test("expiry is per-handle, not global", () => {
    let t = 0;
    const r = new RefRegistry(() => t);
    const a = r.put(new Uint8Array([1]), 10_000);
    const b = r.put(new Uint8Array([2]), 60_000);
    t = 15_000;
    expect(r.take(a)).toBeUndefined();
    expect(r.take(b)?.byteLength).toBe(1);
  });

  test("capacity cap evicts oldest first (bounded memory)", () => {
    const r = new RefRegistry();
    const wires: string[] = [];
    for (let i = 0; i < MAX_REF_HANDLES + 10; i++) {
      wires.push(r.put(new Uint8Array([i])));
    }
    expect(r.size).toBeLessThanOrEqual(MAX_REF_HANDLES);
    // Oldest 10 handles were evicted; the newest are still resolvable.
    expect(r.take(wires[0])).toBeUndefined();
    for (let i = wires.length - MAX_REF_HANDLES; i < wires.length; i++) {
      expect(r.take(wires[i])).toBeDefined();
    }
  });

  test("clear revokes everything (teardown)", () => {
    const r = new RefRegistry();
    const a = r.put(new Uint8Array([1]));
    const b = r.put(new Uint8Array([2]));
    r.clear();
    expect(r.size).toBe(0);
    expect(r.take(a)).toBeUndefined();
    expect(r.take(b)).toBeUndefined();
  });
});

describe("budgetJson — emit-point helper", () => {
  test("oversized result becomes { ref, preview, truncated }", () => {
    const r = new RefRegistry();
    const big = { data: "x".repeat(60 * 1024) };
    const out = budgetJson(big, r) as { ref: string; preview: string; truncated: boolean };
    expect(out.truncated).toBe(true);
    expect(out.ref).toMatch(/^ref:handle:\d+$/);
    expect(out.preview.length).toBeLessThanOrEqual(2 * 1024 + 512);
    // Full payload is fetchable through the ref.
    const full = r.take(out.ref);
    expect(full?.byteLength).toBeGreaterThan(50 * 1024);
  });

  test("small result passes through unchanged", () => {
    const r = new RefRegistry();
    const small = { tool: "search_web", ok: true };
    expect(budgetJson(small, r)).toBe(small);
    expect(r.size).toBe(0);
  });
});
