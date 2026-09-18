import { describe, expect, test } from "bun:test";
import { citationsFromSearchResult } from "./citations";

describe("citationsFromSearchResult (P52.20)", () => {
  test("numbers live search hits and skips rows without a url", () => {
    const got = citationsFromSearchResult({
      ok: true,
      query: "agent s worker",
      count: 3,
      results: [
        { url: "https://example.com/a", title: "A", snippet: "one", source: "searxng" },
        { title: "no url" },
        { url: "https://example.com/b", title: "B" },
      ],
    });
    expect(got).toEqual([
      { index: 1, title: "A", url: "https://example.com/a", snippet: "one", source: "searxng" },
      { index: 2, title: "B", url: "https://example.com/b" },
    ]);
  });

  test("empty or failed search produces zero citations (never invented)", () => {
    expect(citationsFromSearchResult({ ok: false, error: "offline" })).toEqual([]);
    expect(citationsFromSearchResult(null)).toEqual([]);
    expect(citationsFromSearchResult({ results: [] })).toEqual([]);
  });
})
