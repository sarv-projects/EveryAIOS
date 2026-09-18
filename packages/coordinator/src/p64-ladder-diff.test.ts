/**
 * Differential harness: the same fixtures Rust `apply_edit_ladder` runs
 * (crates/everyaios-core/tests/fixtures/p64_edit_ladder.json) must produce
 * the same strategy/output from coordinator `applyEditLadder`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyEditLadder } from "./tools";

const FIXTURE = `${import.meta.dir}/../../../crates/everyaios-core/tests/fixtures/p64_edit_ladder.json`;

describe("P64.5 differential ladder vs Rust fixtures", () => {
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    cases: Array<{
      id: string;
      content: string;
      old: string;
      new: string;
      strategy?: string;
      out?: string;
      outContains?: string;
      error?: boolean;
    }>;
  };

  for (const c of raw.cases) {
    test(c.id, () => {
      if (c.error) {
        expect(() => applyEditLadder(c.content, c.old, c.new)).toThrow();
        return;
      }
      const got = applyEditLadder(c.content, c.old, c.new);
      expect(got.strategy).toBe(c.strategy as typeof got.strategy);
      if (c.out !== undefined) expect(got.content).toBe(c.out);
      if (c.outContains !== undefined) expect(got.content).toContain(c.outContains);
    });
  }
});
