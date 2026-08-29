import type { ToolContract, ToolContext } from './types';

export class ToolRuntime {
  private tools = new Map<string, ToolContract>();

  register(tool: ToolContract): void {
    this.tools.set(tool.id, tool);
  }

  registerMany(tools: ToolContract[]): void {
    for (const t of tools) this.register(t);
  }

  getTool(id: string): ToolContract | undefined {
    return this.tools.get(id);
  }

  listTools(family?: string): ToolContract[] {
    const all = [...this.tools.values()];
    return family ? all.filter((t) => t.family === family) : all;
  }

  async execute(
    toolId: string,
    ctx: ToolContext,
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; durationMs: number }> {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error(`Tool not found: ${toolId}`);

    const start = Date.now();
    try {
      const parsed = tool.inputSchema.parse(args);
      const result = await tool.execute(ctx, parsed);
      return { result, durationMs: Date.now() - start };
    } catch (err) {
      // Preserve Zod / structured errors for debuggability.
      if (err && typeof err === 'object' && 'issues' in err) {
        const issues = (err as { issues: unknown }).issues;
        throw new Error(
          `Tool ${toolId} validation failed: ${JSON.stringify(issues).slice(0, 500)}`,
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Tool ${toolId} execution failed: ${msg}`);
    }
  }
}
