import { describe, expect, test } from "bun:test";
import { DreamDiary, briefFor, headlineFor } from "./dream-diary";

describe("P30.15 dream diary", () => {
  test("headline is plain language", () => {
    expect(headlineFor({ foldedFacts: 3, decayedFacts: 1, topics: ["Q3 plan"], atMs: 0 })).toBe(
      "Folded 3 facts about Q3 plan · let go of 1 old fact",
    );
  });

  test("record appends and caps at 30", () => {
    const diary = new DreamDiary(() => 1000);
    for (let i = 0; i < 35; i++) diary.record({ foldedFacts: 1, decayedFacts: 0, topics: [], atMs: i });
    expect(diary.list().length).toBe(30);
  });

  test("morning brief summarizes the last 24h", () => {
    let t = 1000;
    const diary = new DreamDiary(() => t);
    diary.record({ foldedFacts: 5, decayedFacts: 2, topics: ["research"], atMs: t });
    t = 2000;
    const brief = diary.morningBrief();
    expect(brief).toContain("folded 5 new facts");
    expect(brief).toContain("pruned 2 outdated details");
  });

  test("morning brief with no recent runs", () => {
    const diary = new DreamDiary(() => 100_000_000);
    diary.record({ foldedFacts: 1, decayedFacts: 0, topics: [], atMs: 1000 });
    expect(diary.morningBrief()).toBe("No consolidation since the last brief.");
  });

  test("briefFor singular/plural", () => {
    expect(briefFor({ foldedFacts: 1, decayedFacts: 1, topics: [], atMs: 0 })).toContain(
      "remembered 1 thing",
    );
  });
});
