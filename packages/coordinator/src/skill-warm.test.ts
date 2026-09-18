import { describe, expect, test } from "bun:test";
import { filterModelWarmSkills, slashSkillNames } from "./skill-warm";

describe("P51.28 skill invocation flags", () => {
  const rows = [
    { name: "notes", description: "Take notes" },
    {
      name: "deploy",
      description: "Deploy the branch",
      userInvocable: true,
      disableModelInvocation: true,
    },
  ];

  test("model warm set omits disable-model-invocation", () => {
    expect(filterModelWarmSkills(rows)).toEqual(["notes: Take notes"]);
  });

  test("slash catalog keeps user-only deploy", () => {
    expect(slashSkillNames(rows)).toEqual(["deploy"]);
  });
});
