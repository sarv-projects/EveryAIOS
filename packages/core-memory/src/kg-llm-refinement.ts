/**
 * KG LLM Refinement — Tier 2 (Paid, optional, one-time per file).
 *
 * Runs AFTER deterministic Tier 1 extraction completes. Uses LLM calls to:
 * 1. Synthesize semantic relationships (supersedes, contradicts, is_part_of)
 * 2. Disambiguate entities ("Apple Inc." vs "apple the fruit")
 * 3. Extract abstract topics (domain concepts beyond regex)
 * 4. Summarize communities (GraphRAG-style cluster summaries)
 * 5. Extract sentiment/opinion on entities
 *
 * Cost model:
 * - Per-file LLM prompt (one call per file, ~0.05-0.15 credits)
 * - Uses the existing provider infrastructure (BYOK or managed)
 * - Billing: tries spend via core-billing; gracefully degrades if insufficient
 */

import type { KgObject, KgEdgeType } from './kg-extraction.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Tier2Input {
  sourceId: string;
  sourceLabel: string;
  /** Sample text from the file (first ~4000 tokens) */
  sampleText: string;
  /** Objects extracted by Tier 1 */
  tier1Objects: KgObject[];
  /** Relations extracted by Tier 1 */
  tier1Relations: Array<{
    fromLabel: string;
    toLabel: string;
    edgeType: KgEdgeType;
    confidence: number;
    extractionRule: string;
  }>;
}

export interface Tier2Output {
  /** Refined objects (with disambiguated types, added topics) */
  objects: KgObject[];
  /** New semantic relations (supersedes, contradicts, etc.) */
  relations: Array<{
    fromLabel: string;
    toLabel: string;
    edgeType: KgEdgeType;
    confidence: number;
  }>;
  /** Disambiguation map: label → correct canonical label */
  disambiguations: Map<string, string>;
  /** Community summaries: topic → short description */
  communitySummaries: Map<string, string>;
  /** Estimated cost in credits */
  estimatedCost: number;
}

// ============================================================================
// LLM PROMPT TEMPLATES
// ============================================================================

const RELATIONSHIP_SYNTHESIS_PROMPT = (
  sourceLabel: string,
  objects: string,
  sampleText: string,
): string => `You are analyzing a document titled "${sourceLabel}" for a personal knowledge graph.

Extracted objects (people, orgs, places, concepts):
${objects}

Document excerpt:
---
${sampleText.slice(0, 3000)}
---

Identify semantic relationships between these objects. Return a JSON array of relations:
[
  {
    "from": "Object A label",
    "to": "Object B label",
    "edge": "supersedes" | "contradicts" | "is_part_of" | "references" | "derives_from" | "discusses",
    "confidence": 0.0-1.0
  }
]

Rules:
- "supersedes": A replaces or overrides B
- "contradicts": A directly conflicts with B
- "is_part_of": A is a component/subsection of B
- "references": A mentions or cites B
- "derives_from": A is based on or derived from B
- "discusses": A discusses or analyzes B

Only output valid JSON. No explanation.`;

const DISAMBIGUATION_PROMPT = (
  objects: string,
  sampleText: string,
): string => `Disambiguate entity names in this document excerpt.

Objects found:
${objects}

Excerpt:
---
${sampleText.slice(0, 2000)}
---

Return a JSON object mapping ambiguous names to their canonical form:
{
  "Apple": "Apple Inc.",
  "Java": "Java (programming language)",
  ...
}

Only include entries where disambiguation is needed. Only output valid JSON.`;

const TOPIC_EXTRACTION_PROMPT = (sampleText: string): string => `Extract 3-8 domain-specific abstract topics from this document excerpt.

Excerpt:
---
${sampleText.slice(0, 3000)}
---

Return a JSON array of topic strings. Topics should be:
- Abstract domain concepts not just surface keywords
- Useful for categorization and retrieval
- Examples: "supply chain risk", "machine learning deployment", "constitutional law"

Only output a valid JSON array of strings.`;

const COMMUNITY_SUMMARIZATION_PROMPT = (
  topicLabel: string,
  relatedObjects: string,
  sampleText: string,
): string => `Summarize the relationship between the topic "${topicLabel}" and these related objects:

${relatedObjects}

Based on this excerpt:
---
${sampleText.slice(0, 2000)}
---

Return a JSON object:
{
  "summary": "one-sentence summary of the relationship",
  "sentiment": "positive" | "negative" | "neutral" | "mixed"
}

Only output valid JSON.`;

// ============================================================================
// COST ESTIMATION
// ============================================================================

/** Estimated LLM call cost in credits for Tier 2 refinement. */
export function estimateTier2Cost(tier1Objects: KgObject[]): {
  callCount: number;
  estimatedCredits: number;
} {
  // Fixed cost: 1 relationship synthesis call = ~0.05 cr
  // Per-community summarization: ~0.01 cr per community
  // Disambiguation + topics = ~0.03 cr total
  const relationshipCallCost = 0.05;
  const disambigCost = 0.02;
  const topicCost = 0.02;
  const communityCost = 0.01;
  const communityCount = Math.min(5, Math.max(1, Math.floor(tier1Objects.length / 10)));

  const totalCallCount = 3 + communityCount; // relationship + disambig + topic + N communities
  const estimatedCredits = relationshipCallCost + disambigCost + topicCost + communityCost * communityCount;

  return {
    callCount: totalCallCount,
    estimatedCredits: Math.round(estimatedCredits * 100) / 100,
  };
}

// ============================================================================
// TIER 2 SERVICE (with billing hook)
// ============================================================================

export interface Tier2LlmProvider {
  /** Generate a completion from the LLM. Returns raw text. */
  generate(prompt: string, systemPrompt?: string): Promise<string>;
}

export interface Tier2Billing {
  /** Attempt to spend credits. Returns { ok: true } if affordable. */
  trySpend(cost: number): Promise<{ ok: boolean; reason?: string }>;
}

export interface Tier2Options {
  llm: Tier2LlmProvider;
  billing?: Tier2Billing;
  /** Max credits this refinement is allowed to consume */
  budgetCredits?: number;
}

/**
 * Run Tier 2 LLM refinement on Tier 1 extraction results.
 *
 * Billing: tries `billing.trySpend(cost)` before each call.
 * If billing is not available (BYOK mode with user's own key), runs without charging.
 * If budget is exhausted, returns partial results.
 */
export async function refineTier2(
  input: Tier2Input,
  opts: Tier2Options,
): Promise<Tier2Output> {
  const { llm, billing, budgetCredits } = opts;
  const costEstimate = estimateTier2Cost(input.tier1Objects);

  // Check budget
  if (budgetCredits !== undefined && budgetCredits < costEstimate.estimatedCredits) {
    // Not enough budget — return empty, don't call LLM
    return {
      objects: [],
      relations: [],
      disambiguations: new Map(),
      communitySummaries: new Map(),
      estimatedCost: costEstimate.estimatedCredits,
    };
  }

  // Object labels for prompts
  const objectList = input.tier1Objects
    .map((o) => `  - [${o.type}] ${o.label}`)
    .join('\n');

  let spent = 0;
  const output: Tier2Output = {
    objects: [],
    relations: [],
    disambiguations: new Map(),
    communitySummaries: new Map(),
    estimatedCost: costEstimate.estimatedCredits,
  };

  // --- 1. Relationship synthesis ---
  if (billing) {
    const r = await billing.trySpend(0.05);
    if (!r.ok) return output; // insufficient credits
  }
  try {
    const relJson = await llm.generate(
      RELATIONSHIP_SYNTHESIS_PROMPT(input.sourceLabel, objectList, input.sampleText),
      'You are a knowledge graph refinement system. Return only valid JSON.',
    );
    spent += 0.05;

    // Parse JSON array of relations
    const jsonMatch = relJson.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        from: string; to: string; edge: string; confidence: number;
      }>;
      for (const r of parsed) {
        const validEdges = new Set([
          'supersedes', 'contradicts', 'is_part_of', 'references', 'derives_from', 'discusses',
        ]);
        if (r.from && r.to && validEdges.has(r.edge)) {
          output.relations.push({
            fromLabel: r.from,
            toLabel: r.to,
            edgeType: r.edge as KgEdgeType,
            confidence: r.confidence ?? 0.7,
          });
        }
      }
    }
  } catch {
    // LLM call failed — gracefully continue with empty relations
  }

  // --- 2. Entity disambiguation ---
  if (billing) {
    const r = await billing.trySpend(0.02);
    if (!r.ok) return output;
  }
  try {
    const disambJson = await llm.generate(
      DISAMBIGUATION_PROMPT(objectList, input.sampleText),
      'You are a knowledge graph entity disambiguation system. Return only valid JSON.',
    );
    spent += 0.02;

    const jsonMatch = disambJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
      for (const [ambig, canonical] of Object.entries(parsed)) {
        output.disambiguations.set(ambig, canonical);
        // Add the canonical form as a refined object
        output.objects.push({
          type: 'concept',
          label: canonical,
          aliases: [ambig],
        });
      }
    }
  } catch {
    // graceful skip
  }

  // --- 3. Topic extraction ---
  if (billing) {
    const r = await billing.trySpend(0.02);
    if (!r.ok) return output;
  }
  try {
    const topicJson = await llm.generate(
      TOPIC_EXTRACTION_PROMPT(input.sampleText),
      'You are a topic extraction system. Return only valid JSON.',
    );
    spent += 0.02;

    const jsonMatch = topicJson.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as string[];
      for (const topic of parsed) {
        if (typeof topic === 'string' && topic.length > 2) {
          output.objects.push({ type: 'topic', label: topic });
        }
      }
    }
  } catch {
    // graceful skip
  }

  // --- 4. Community summarization (sample up to 5 topic clusters) ---
  const topics = input.tier1Objects.filter((o) => o.type === 'topic').slice(0, 5);
  for (const topic of topics) {
    if (billing) {
      const r = await billing.trySpend(0.01);
      if (!r.ok) break;
    }
    try {
      const relatedObjs = input.tier1Relations
        .filter((r) => r.fromLabel === topic.label || r.toLabel === topic.label)
        .map((r) => `  - ${r.fromLabel} → ${r.edgeType} → ${r.toLabel}`)
        .slice(0, 10)
        .join('\n');

      const summaryJson = await llm.generate(
        COMMUNITY_SUMMARIZATION_PROMPT(topic.label, relatedObjs || 'none', input.sampleText),
        'You are a graph community summarization system. Return only valid JSON.',
      );
      spent += 0.01;

      const jsonMatch = summaryJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { summary: string; sentiment?: string };
        if (parsed.summary) {
          output.communitySummaries.set(topic.label, parsed.summary);
        }
      }
    } catch {
      // graceful skip
    }
  }

  output.estimatedCost = spent;
  return output;
}
