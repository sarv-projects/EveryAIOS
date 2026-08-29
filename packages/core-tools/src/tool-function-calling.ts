/**
 * Dynamic native function calling — converts Zod tool schemas to OpenAI-compatible
 * function definitions for native tool use (not string-ID based prompt injection).
 *
 * Compatible with both Zod v3 (`_def.typeName`) and Zod v4 (`type` / `def.type`).
 */
import { z } from 'zod';

export type OpenAITool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type ZodLike = z.ZodTypeAny & {
  _def?: {
    typeName?: string;
    type?: unknown;
    values?: unknown;
    value?: unknown;
    items?: unknown;
    options?: unknown;
    shape?: (() => Record<string, z.ZodTypeAny>) | Record<string, z.ZodTypeAny>;
    innerType?: z.ZodTypeAny;
    schema?: z.ZodTypeAny;
  };
  def?: { type?: string };
  type?: string;
  isOptional?: () => boolean;
};

function getTypeName(schema: ZodLike): string {
  // Zod 3
  if (schema._def?.typeName) return String(schema._def.typeName);
  // Zod 4 often exposes `type` or `def.type`
  if (typeof schema.type === 'string') {
    const t = schema.type;
    // Map short names to Zod3-style for switch below
    const map: Record<string, string> = {
      string: 'ZodString',
      number: 'ZodNumber',
      boolean: 'ZodBoolean',
      enum: 'ZodEnum',
      array: 'ZodArray',
      object: 'ZodObject',
      optional: 'ZodOptional',
      nullable: 'ZodOptional',
      default: 'ZodOptional',
    };
    return map[t] ?? t;
  }
  if (schema.def?.type) {
    const t = String(schema.def.type);
    const map: Record<string, string> = {
      string: 'ZodString',
      number: 'ZodNumber',
      boolean: 'ZodBoolean',
      enum: 'ZodEnum',
      array: 'ZodArray',
      object: 'ZodObject',
      optional: 'ZodOptional',
    };
    return map[t] ?? t;
  }
  return '';
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const s = schema as ZodLike;
  const def = s._def;
  if (!def && !s.type && !s.def) return { type: 'string' };

  const typeName = getTypeName(s);

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum': {
      const values =
        (def?.values as unknown) ??
        // Zod4 enum may store values on schema.enum or options
        (s as unknown as { options?: unknown[] }).options ??
        [];
      return { type: 'string', enum: Array.isArray(values) ? values : [] };
    }
    case 'ZodArray': {
      const rawItem =
        def?.type ??
        def?.innerType ??
        (s as unknown as { element?: z.ZodTypeAny }).element;
      const itemSchema =
        rawItem && typeof rawItem === 'object'
          ? (rawItem as z.ZodTypeAny)
          : undefined;
      return {
        type: 'array',
        items: itemSchema ? zodToJsonSchema(itemSchema) : { type: 'string' },
      };
    }
    case 'ZodObject': {
      const shapeRaw = def?.shape;
      const shape: Record<string, z.ZodTypeAny> =
        typeof shapeRaw === 'function'
          ? shapeRaw()
          : shapeRaw && typeof shapeRaw === 'object'
            ? (shapeRaw as Record<string, z.ZodTypeAny>)
            : ((s as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape ??
              {});
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const shapeField = value as ZodLike;
        properties[key] = zodToJsonSchema(shapeField as z.ZodTypeAny);
        const optional =
          typeof shapeField.isOptional === 'function'
            ? shapeField.isOptional()
            : getTypeName(shapeField) === 'ZodOptional';
        if (!optional) required.push(key);
      }
      return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    case 'ZodOptional': {
      const inner =
        def?.innerType ?? def?.schema ?? (s as unknown as { unwrap?: () => z.ZodTypeAny }).unwrap?.();
      return inner ? zodToJsonSchema(inner) : { type: 'string' };
    }
    case 'ZodLiteral': {
      const value = def?.value ?? (s as unknown as { value?: unknown }).value;
      if (typeof value === 'number') return { type: 'number', enum: [value] };
      if (typeof value === 'boolean') return { type: 'boolean', enum: [value] };
      return { type: 'string', enum: [String(value)] };
    }
    case 'ZodDate':
      return { type: 'string', format: 'date-time' };
    case 'ZodRecord':
      return { type: 'object', additionalProperties: true };
    case 'ZodTuple': {
      const itemsRaw = def?.items ?? (s as unknown as { items?: z.ZodTypeAny[] }).items;
      return {
        type: 'array',
        items:
          Array.isArray(itemsRaw) && itemsRaw.length > 0
            ? zodToJsonSchema(itemsRaw[0]!)
            : { type: 'string' },
      };
    }
    case 'ZodUnion': {
      const optionsRaw = def?.options ?? (s as unknown as { options?: z.ZodTypeAny[] }).options;
      const options = Array.isArray(optionsRaw) ? optionsRaw : [];
      return { type: 'any', anyOf: options.map((o) => zodToJsonSchema(o)) };
    }
    default: {
      // #33: never silently emit a wrong schema — the LLM would then call the
      // tool with bad args and every invocation fails at parse. Log loudly so
      // tool authors fix the schema, but keep a usable fallback.
      const name = getTypeName(s);
      console.warn(`[tools] Unsupported Zod type in tool schema: ${name} — mapped to string`);
      return { type: 'string' };
    }
  }
}

export function toolsToOpenAI(
  tools: Array<{
    name: string;
    description: string;
    schema: z.ZodTypeAny;
  }>,
): OpenAITool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.schema),
    },
  }));
}
