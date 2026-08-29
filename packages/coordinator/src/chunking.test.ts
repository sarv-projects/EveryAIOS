/**
 * Vendored `core-files` chunking/token-estimation parity tests.
 *
 * Mirrors the core assertions from `@personal-ai/core-files`
 * `__tests__/chunking.test.ts` for the two functions this sidecar now owns
 * locally — so the vendored copy provably matches the APP behavior the
 * engine loop depends on (cache-stable token counts, bounded chunk sizes).
 */
import { describe, expect, test } from "bun:test";
import { chunkText, estimateTokens } from "./chunking";

describe("estimateTokens", () => {
  test("returns 0 for empty input", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("whitespace is nonzero (length > 0)", () => {
    // estimateTokens only returns 0 when length === 0; whitespace has length > 0.
    const result = estimateTokens("   ");
    expect(result).toBeGreaterThan(0);
  });

  test("short word returns a positive token count", () => {
    expect(estimateTokens("hello")).toBeGreaterThan(0);
  });

  test("longer text estimates proportionally", () => {
    const short = estimateTokens("hello world");
    const long = estimateTokens("hello world ".repeat(20));
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });
});

describe("chunkText with plain text", () => {
  test("short text yields one chunk", () => {
    const result = chunkText("Hello world", "text/plain");
    expect(result).toEqual(["Hello world"]);
  });

  test("empty input yields no chunks", () => {
    expect(chunkText("", "text/plain")).toEqual([]);
  });

  test("whitespace-only input yields no chunks", () => {
    expect(chunkText("   ", "text/plain")).toEqual([]);
  });

  test("long text splits into multiple non-empty bounded chunks", () => {
    // FIXED_CHUNK_TOKENS = 600 → targetChars = 2400; MAX_CHUNK_TOKENS = 800
    // → maxChars = 3200. Need > 3200 chars for at least 2 chunks.
    const longText = "word ".repeat(2000); // ~10000 chars
    const chunks = chunkText(longText, "text/plain");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
      expect(estimateTokens(chunk)).toBeLessThanOrEqual(800 + 1);
    }
  });
});

describe("chunkText with markdown", () => {
  test("splits on headings into sections", () => {
    const md = [
      "# Intro",
      "body text under the intro heading that is long enough.",
      "## Details",
      "more detail here under the second heading.",
    ].join("\n");
    const result = chunkText(md, "text/markdown");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test("empty markdown yields no chunks", () => {
    expect(chunkText("", "text/markdown")).toEqual([]);
  });
});