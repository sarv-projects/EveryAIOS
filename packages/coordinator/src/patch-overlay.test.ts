import { describe, expect, test } from "bun:test";
import { LayeredSpec, applyPatch, parsePatchDoc } from "./patch-overlay";

describe("P30.9 patch overlay", () => {
  test("parses flat + nested YAML-subset", () => {
    const patch = parsePatchDoc(`
# user patch
agent: Mira
max_steps: 12
allowed:
  fs.write: true
  shell.exec: false
`);
    expect(patch.agent).toBe("Mira");
    expect(patch.max_steps).toBe(12);
    expect(patch.allowed).toEqual({ "fs.write": true, "shell.exec": false });
  });

  test("null deletes, nested merges, scalar replaces", () => {
    const base = { name: "a", steps: 5, nested: { x: 1, y: 2 }, keep: true };
    const patched = applyPatch(base, {
      name: "b",
      steps: null,
      nested: { y: 9, z: 3 },
    });
    expect(patched).toEqual({ name: "b", nested: { x: 1, y: 9, z: 3 }, keep: true });
    expect("steps" in patched).toBe(false);
    // Base is never mutated.
    expect(base.steps).toBe(5);
  });

  test("LayeredSpec applies patches in order, later wins", () => {
    const spec = new LayeredSpec({ name: "a", steps: 5 });
    spec.addPatch(parsePatchDoc("name: b\n"));
    spec.addPatch(parsePatchDoc("steps: 7\n"));
    expect(spec.effective()).toEqual({ name: "b", steps: 7 });
    expect(spec.get("name")).toBe("b");
  });

  test("parses scalars: booleans, numbers, quoted strings", () => {
    const p = parsePatchDoc("a: true\nb: 3.5\nc: \"hello: world\"\nd: null\n");
    expect(p.a).toBe(true);
    expect(p.b).toBe(3.5);
    expect(p.c).toBe("hello: world");
    expect(p.d).toBeNull();
  });
});
