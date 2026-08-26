import { describe, expect, it } from "bun:test";
import { isAcpAgent, modelColumnState, sanitizeRequest, shouldForwardModel } from "./h32";

describe("H32 send policy", () => {
  it("inbuilt engine may carry a model selection", () => {
    expect(shouldForwardModel("everyaios-native")).toBe(true);
    const req = sanitizeRequest({ model: "claude-3-5-sonnet", messages: [] }, "everyaios-native");
    expect(req).toHaveProperty("model");
  });

  it("ACP sends never carry a per-agent model", () => {
    for (const agent of ["claude-code", "codex", "opencode", "acp:custom-agent"]) {
      expect(isAcpAgent(agent)).toBe(true);
      expect(shouldForwardModel(agent)).toBe(false);
      const req = sanitizeRequest({ model: "gpt-5", messages: [] }, agent);
      expect(req).not.toHaveProperty("model");
    }
  });

  it("model column is always visible, selectable only for inbuilt", () => {
    expect(modelColumnState("everyaios-native")).toMatchObject({ visible: true, selectable: true });
    const acp = modelColumnState("claude-code");
    expect(acp).toMatchObject({ visible: true, selectable: false });
    expect(acp.hint).toContain("claude-code");
  });
});
