import { describe, expect, test } from "bun:test";
import { searchExternalMcp } from "./mcp-bridge";

describe("external MCP bridge (P6.7)", () => {
  test("rejects non-HTTPS and non-loopback endpoints before opening a client", async () => {
    await expect(searchExternalMcp("http://example.com/mcp", "hello")).rejects.toThrow(
      "HTTPS or loopback",
    );
    await expect(searchExternalMcp("file:///tmp/mcp", "hello")).rejects.toThrow(
      "HTTPS or loopback",
    );
  });
});
