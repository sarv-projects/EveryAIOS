import { describe, expect, it } from "bun:test";
import {
  CATALOG_SEED,
  catalogEntry,
  OFFICIAL_REMOTE,
  POPULAR_SAAS,
  validateSeed,
  type McpCatalogEntry,
} from "./mcp-catalog";

describe("mcp-catalog (P18-4 connector catalog seed)", () => {
  it("ships the official remote set + the popular SaaS names", () => {
    expect(OFFICIAL_REMOTE.length).toBeGreaterThanOrEqual(9);
    expect(POPULAR_SAAS.length).toBeGreaterThanOrEqual(12);
    expect(CATALOG_SEED.length).toBe(OFFICIAL_REMOTE.length + POPULAR_SAAS.length);
    for (const name of ["github", "google", "supabase", "cloudflare", "exa", "firecrawl"]) {
      expect(catalogEntry(name)).toBeDefined();
    }
    for (const name of ["gmail", "slack", "notion", "linear", "figma", "stripe"]) {
      expect(catalogEntry(name)).toBeDefined();
    }
  });

  it("every seed entry is hosted, never inbuilt", () => {
    for (const e of CATALOG_SEED) {
      expect(e.inbuilt).toBe(false);
    }
    expect(validateSeed(CATALOG_SEED)).toEqual({ ok: true, count: CATALOG_SEED.length });
  });

  it("rejects an entry that claims inbuilt or duplicates an id", () => {
    // deliberately-constructed invalid entries (the type forbids inbuilt:true,
    // which is the point — so the test casts)
    const bad = [
      { ...OFFICIAL_REMOTE[0]!, inbuilt: true },
      { ...POPULAR_SAAS[0]!, id: "atlassian" }, // collides with entry 0
    ] as unknown as McpCatalogEntry[];
    const verdict = validateSeed(bad);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reasons.join("\n")).toContain("claims inbuilt");
      expect(verdict.reasons.join("\n")).toContain("duplicate id");
    }
  });
});
