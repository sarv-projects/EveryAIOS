import { spreadActivation, rankByActivation } from './spreading-activation.js';

/**
 * KnowledgeGraphService — entity triple extraction + graph queries (spec §8.6).
 *
 * Strategy: Lazy chat extraction — extract (subject, predicate, object) triples
 * as a side-effect of chat by parsing the assistant's response or user's query
 * for entity mentions. Zero additional LLM calls; extraction is rule-based
 * (regex NER + co-occurrence) to keep the free tier cost-free.
 *
 * Entities are stored with embeddings for entity-level vector search, and
 * triples link entities to chunks/sources for provenance tracking.
 *
 * --- V2 (schema v19) ---
 * New tables: kg_objects, kg_events, kg_relations, kg_objects_fts.
 * Two-tier: deterministic Tier-1 (free) + LLM Tier-2 refinement (paid).
 * Multi-hop traversal via SQL CTEs.
 */
/**
 * Minimal DB surface used by KnowledgeGraphService (SQLite-compatible).
 * Mirrors the DatabaseHandle interface from core-files without a cross-package dependency.
 */
export interface KGraphDb {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  executeSql(sql: string, params?: unknown[]): Promise<unknown>;
}

/** An entity extracted from text. */
export interface ExtractedEntity {
  name: string;
  type: EntityType;
}

/** An (subject, predicate, object) triple extracted from text. */
export interface ExtractedTriple {
  subject: string;
  predicate: string;
  object: string;
  objectType: 'entity' | 'literal';
  confidence: number;
}

export type EntityType = 'person' | 'org' | 'concept' | 'place' | 'date' | 'other';

/** A stored entity row from the DB. */
export interface EntityRow {
  id: number;
  name: string;
  type: EntityType | null;
  mentionCount: number;
}

/** A stored triple row from the DB. */
export interface TripleRow {
  id: number;
  subjectName: string;
  predicate: string;
  objectName: string;
  objectText: string | null;
  sourceFilename: string | null;
  confidence: number;
}

/** Result of a graph query — entities + triples about a topic. */
export interface GraphQueryResult {
  entities: EntityRow[];
  triples: TripleRow[];
}

// ============================================================================
// CROSS-PLATFORM UUID (Node, Hermes, JSC, browser)
// ============================================================================

function newId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (arr: Uint8Array) => void } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ============================================================================
// REGEX-BASED ENTITY EXTRACTION (no LLM required)
// ============================================================================

/** Common Indian + international name patterns. */
const PERSON_PATTERNS: RegExp[] = [
  /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:said|wrote|stated|mentioned|argued|claimed|proposed|discovered|invented|founded|created|developed)/g,
];

/** Organization patterns. */
const ORG_PATTERNS: RegExp[] = [
  /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s+(?:Inc|Corp|Ltd|LLC|Company|Corporation|University|Institute|Foundation|Bank|Group)\b/g,
  /\b(University\s+of\s+[A-Z][a-z]+|Google|Microsoft|Apple|Amazon|OpenAI|Anthropic|Meta|NASA|ISRO|WHO|UN|EU)\b/g,
];

/** Place patterns. */
const PLACE_PATTERNS: RegExp[] = [
  /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:city|country|state|river|mountain|island)\b/g,
];

/** Date patterns. */
const DATE_PATTERNS: RegExp[] = [
  /\b(\d{4}\s+(?:BCE|BC|CE|AD))\b/g,
  /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/g,
  /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/g,
];

/** Relationship predicate patterns. */
const PREDICATE_PATTERNS: Array<{ predicate: string; regex: RegExp }> = [
  { predicate: 'wrote', regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+wrote\s+(?:the\s+)?([A-Z][a-z]+)/g },
  { predicate: 'authored', regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+authored\s+(?:the\s+)?([A-Z][a-z]+)/g },
  { predicate: 'discovered', regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+discovered\s+([a-z]+)/g },
  { predicate: 'invented', regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+invented\s+(?:the\s+)?([a-z]+)/g },
  { predicate: 'founded', regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+founded\s+([A-Z][a-z]+)/g },
  { predicate: 'is_about', regex: /\babout\s+([A-Z][a-z]+)/g },
  { predicate: 'mentions', regex: /\bmentions?\s+([A-Z][a-z]+)/g },
  { predicate: 'located_in', regex: /\blocated\s+in\s+([A-Z][a-z]+)/g },
];

/**
 * Extract entities + triples from text using rule-based NER.
 * This is the "free tier" extraction — no LLM calls, just regex patterns.
 * Quality is medium but cost is zero.
 */
export function extractEntitiesAndTriples(
  text: string,
): { entities: ExtractedEntity[]; triples: ExtractedTriple[] } {
  const entities = new Map<string, ExtractedEntity>();
  const triples: ExtractedTriple[] = [];

  // Extract persons
  for (const pattern of PERSON_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 2 && !entities.has(name.toLowerCase())) {
        entities.set(name.toLowerCase(), { name, type: 'person' });
      }
    }
  }

  // Extract organizations
  for (const pattern of ORG_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim() ?? match[0];
      if (name && name.length > 2 && !entities.has(name.toLowerCase())) {
        entities.set(name.toLowerCase(), { name, type: 'org' });
      }
    }
  }

  // Extract places
  for (const pattern of PLACE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 2 && !entities.has(name.toLowerCase())) {
        entities.set(name.toLowerCase(), { name, type: 'place' });
      }
    }
  }

  // Extract dates
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim() ?? match[0];
      if (name && !entities.has(name.toLowerCase())) {
        entities.set(name.toLowerCase(), { name, type: 'date' });
      }
    }
  }

  // Extract triples via predicate patterns
  for (const { predicate, regex } of PREDICATE_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const subject = match[1]?.trim();
      const object = match[2]?.trim();
      if (subject && object && subject.length > 2 && object.length > 2) {
        // Ensure subject is tracked as an entity
        if (!entities.has(subject.toLowerCase())) {
          entities.set(subject.toLowerCase(), { name: subject, type: 'other' });
        }
        // Object can be an entity or a literal
        const objectIsCapitalized = /^[A-Z]/.test(object);
        if (objectIsCapitalized && !entities.has(object.toLowerCase())) {
          entities.set(object.toLowerCase(), { name: object, type: 'concept' });
        }
        triples.push({
          subject,
          predicate,
          object,
          objectType: objectIsCapitalized ? 'entity' : 'literal',
          confidence: 0.6,
        });
      }
    }
  }

  return { entities: [...entities.values()], triples };
}

// ============================================================================
// KNOWLEDGE GRAPH SERVICE
// ============================================================================

/**
 * KnowledgeGraphService — persists extracted entities + triples to SQLite,
 * and provides graph query functions for retrieval.
 *
 * Tables (created by migration v15):
 *   entities(id, name, type, embedding, mention_count, created_at, updated_at)
 *   entity_triples(id, subject_id, predicate, object_id, object_text,
 *                   chunk_id, source_id, confidence, extraction_method, created_at)
 *   chunk_entities(chunk_id, entity_id)
 *
 * V2 Tables (created by migration v19):
 *   kg_objects(id, type, label, aliases_json, extra_json, embedding, mention_count)
 *   kg_objects_fts(FTS5 on label + aliases_json)
 *   kg_events(id, label, event_time, time_precision, source_id, chunk_id, confidence)
 *   kg_relations(id, from_id, to_id, edge_type, weight, confidence, source_id, chunk_id, extraction_rule, tier)
 */
export class KnowledgeGraphService {
  constructor(private readonly db: KGraphDb) {}

  /**
   * Store extracted entities + triples from a chunk of text.
   * Called lazily during chat (after a response is generated) or during indexing.
   */
  async storeExtraction(
    text: string,
    chunkId: number | null,
    sourceId: string | null,
    method: 'chat_lazy' | 'rule_based' | 'manual' = 'rule_based',
  ): Promise<{ entitiesStored: number; triplesStored: number }> {
    const { entities, triples } = extractEntitiesAndTriples(text);
    if (entities.length === 0 && triples.length === 0) {
      return { entitiesStored: 0, triplesStored: 0 };
    }

    // Store entities and build name→id map
    const entityIdMap = new Map<string, number>();
    for (const entity of entities) {
      const id = await this.upsertEntity(entity.name, entity.type);
      entityIdMap.set(entity.name.toLowerCase(), id);
      // Link chunk to entity (only when chunkId is provided)
      if (chunkId !== null) {
        await this.db.executeSql(
          `INSERT OR IGNORE INTO chunk_entities (chunk_id, entity_id) VALUES (?, ?)`,
          [chunkId, id],
        ).catch(() => {});
      }
    }

    // Store triples
    let triplesStored = 0;
    for (const triple of triples) {
      const subjectId = entityIdMap.get(triple.subject.toLowerCase());
      if (!subjectId) continue;

      let objectId: number | null = null;
      if (triple.objectType === 'entity') {
        objectId = entityIdMap.get(triple.object.toLowerCase()) ?? null;
      }

      await this.db.executeSql(
        `INSERT INTO entity_triples
           (subject_id, predicate, object_id, object_text, chunk_id, source_id, confidence, extraction_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [subjectId, triple.predicate, objectId, triple.objectType === 'literal' ? triple.object : null,
         chunkId, sourceId, triple.confidence, method],
      ).catch(() => {});
      triplesStored += 1;
    }

    return { entitiesStored: entities.length, triplesStored };
  }

  /** Insert or update an entity, returning its id. Increments mention_count. */
  private async upsertEntity(name: string, type: EntityType): Promise<number> {
    const existing = await this.db.query<{ id: number }>(
      `SELECT id FROM entities WHERE lower(name) = lower(?) LIMIT 1`,
      [name],
    );
    if (existing.length > 0 && existing[0]) {
      await this.db.executeSql(
        `UPDATE entities SET mention_count = mention_count + 1, updated_at = datetime('now') WHERE id = ?`,
        [existing[0].id],
      );
      return existing[0].id;
    }

    await this.db.executeSql(
      `INSERT INTO entities (name, type, mention_count) VALUES (?, ?, 1)`,
      [name, type],
    );
    const row = await this.db.query<{ id: number }>(
      `SELECT id FROM entities WHERE lower(name) = lower(?) LIMIT 1`,
      [name],
    );
    if (!row[0]?.id) throw new Error(`Failed to upsert entity: ${name}`);
    return row[0].id;
  }

  /**
   * Query the knowledge graph for entities + triples about a topic.
   * Supports 1-hop traversal.
   */
  async queryGraph(query: string, limit = 20): Promise<GraphQueryResult> {
    const entities = await this.db.query<EntityRow>(
      `SELECT id, name, type, mention_count FROM entities
       WHERE name LIKE '%' || ? || '%'
       ORDER BY mention_count DESC
       LIMIT ?`,
      [query, limit],
    );

    if (entities.length === 0) {
      return { entities: [], triples: [] };
    }

    const entityIds = entities.map((e) => e.id);
    const placeholders = entityIds.map(() => '?').join(', ');

    const triples = await this.db.query<TripleRow>(
      `SELECT
         t.id,
         es.name AS subjectName,
         t.predicate,
         eo.name AS objectName,
         t.object_text AS objectText,
         s.filename AS sourceFilename,
         t.confidence
       FROM entity_triples t
       INNER JOIN entities es ON t.subject_id = es.id
       LEFT JOIN entities eo ON t.object_id = eo.id
       LEFT JOIN sources s ON t.source_id = s.id
       WHERE t.subject_id IN (${placeholders}) OR t.object_id IN (${placeholders})
       ORDER BY t.confidence DESC
       LIMIT ?`,
      [...entityIds, ...entityIds, limit],
    );

    return { entities, triples };
  }

  /** Get all entities mentioned in a specific chunk. */
  async getChunkEntities(chunkId: number): Promise<EntityRow[]> {
    return this.db.query<EntityRow>(
      `SELECT e.id, e.name, e.type, e.mention_count
       FROM entities e
       INNER JOIN chunk_entities ce ON e.id = ce.entity_id
       WHERE ce.chunk_id = ?
       ORDER BY e.mention_count DESC`,
      [chunkId],
    );
  }

  /** Get all triples associated with a source (file). */
  async getSourceTriples(sourceId: string, limit = 50): Promise<TripleRow[]> {
    return this.db.query<TripleRow>(
      `SELECT
         t.id,
         es.name AS subjectName,
         t.predicate,
         eo.name AS objectName,
         t.object_text AS objectText,
         s.filename AS sourceFilename,
         t.confidence
       FROM entity_triples t
       INNER JOIN entities es ON t.subject_id = es.id
       LEFT JOIN entities eo ON t.object_id = eo.id
       LEFT JOIN sources s ON t.source_id = s.id
       WHERE t.source_id = ?
       ORDER BY t.confidence DESC
       LIMIT ?`,
      [sourceId, limit],
    );
  }

  /** Total entity + triple counts (for diagnostics/settings UI). */
  async getStats(): Promise<{ entityCount: number; tripleCount: number }> {
    const entityRow = await this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM entities`);
    const tripleRow = await this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM entity_triples`);
    return {
      entityCount: entityRow[0]?.c ?? 0,
      tripleCount: tripleRow[0]?.c ?? 0,
    };
  }

  /** Delete all KG data for a source (called from file-forget). */
  async deleteBySourceId(sourceId: string): Promise<void> {
    await this.db.executeSql(
      `DELETE FROM entity_triples WHERE source_id = ?`,
      [sourceId],
    ).catch(() => {});
    await this.db.executeSql(
      `DELETE FROM chunk_entities WHERE chunk_id IN (SELECT id FROM file_chunks WHERE file_id = ?)`,
      [sourceId],
    ).catch(() => {});
    await this.db.executeSql(
      `DELETE FROM entities WHERE id NOT IN (SELECT DISTINCT entity_id FROM chunk_entities)
       AND id NOT IN (SELECT DISTINCT subject_id FROM entity_triples)
       AND id NOT IN (SELECT DISTINCT object_id FROM entity_triples WHERE object_id IS NOT NULL)`,
    ).catch(() => {});
    // Also clean v2 KG tables
    await this.db.executeSql(`DELETE FROM kg_relations WHERE source_id = ?`, [sourceId]).catch(() => {});
    await this.db.executeSql(`DELETE FROM kg_events WHERE source_id = ?`, [sourceId]).catch(() => {});
  }

  // ==========================================================================
  // KG V2 METHODS — kg_objects / kg_events / kg_relations (schema v19)
  // ==========================================================================

  /**
   * Store a Tier 1 (deterministic) extraction result to the v2 KG tables.
   * Idempotent: skips if kg_enrichment_status is already past 'pending'.
   * Runs after file indexing completes. Zero LLM cost.
   */
  async storeTier1Result(
    sourceId: string,
    result: {
      objects: Array<{ type: string; label: string; aliases?: string[]; extra?: Record<string, unknown> }>;
      events: Array<{ label: string; eventTime: string; timePrecision: string; locationLabel?: string; confidence: number }>;
      relations: Array<{ fromLabel: string; toLabel: string; edgeType: string; weight: number; confidence: number; extractionRule: string }>;
    },
  ): Promise<{ objectsStored: number; eventsStored: number; relationsStored: number }> {
    // Idempotency guard: skip if already enriched
    const statusRow = await this.db.query<{ s: string }>(
      `SELECT kg_enrichment_status AS s FROM sources WHERE id = ?`, [sourceId],
    );
    if (statusRow[0]?.s !== 'pending' && statusRow[0]?.s != null) {
      return { objectsStored: 0, eventsStored: 0, relationsStored: 0 };
    }

    // Phase 1: Insert/update objects, build label→id map
    const objectIdMap = new Map<string, string>();
    let objectsStored = 0;

    for (const obj of result.objects) {
      const existing = await this.db.query<{ id: string; mention_count: number }>(
        `SELECT id, mention_count FROM kg_objects WHERE lower(label) = lower(?) LIMIT 1`,
        [obj.label],
      );

      let id: string;
      if (existing.length > 0 && existing[0]) {
        id = existing[0].id;
        await this.db.executeSql(
          `UPDATE kg_objects SET mention_count = mention_count + 1, updated_at = datetime('now') WHERE id = ?`,
          [id],
        );
      } else {
        id = newId();
        await this.db.executeSql(
          `INSERT INTO kg_objects (id, type, label, aliases_json, extra_json)
           VALUES (?, ?, ?, ?, ?)`,
          [id, obj.type, obj.label, obj.aliases ? JSON.stringify(obj.aliases) : null, obj.extra ? JSON.stringify(obj.extra) : null],
        );
        objectsStored++;
      }
      objectIdMap.set(obj.label.toLowerCase(), id);
    }

    // Phase 2: Insert events
    let eventsStored = 0;
    for (const evt of result.events) {
      const id = newId();
      try {
        await this.db.executeSql(
          `INSERT INTO kg_events (id, label, event_time, time_precision, source_id, confidence, extraction_method)
           VALUES (?, ?, ?, ?, ?, ?, 'regex_date')`,
          [id, evt.label.slice(0, 200), evt.eventTime, evt.timePrecision, sourceId, evt.confidence],
        );
        eventsStored++;
      } catch { /* duplicate or invalid — skip */ }
    }

    // Phase 3: Insert relations — skip __source__ placeholder (these are metadata, not graph edges)
    let relationsStored = 0;
    for (const rel of result.relations) {
      if (rel.toLabel === '__source__') continue; // skip metadata-only relations

      const fromId = objectIdMap.get(rel.fromLabel.toLowerCase());
      const toId = objectIdMap.get(rel.toLabel.toLowerCase());
      if (!fromId || !toId) continue;

      const id = newId();
      try {
        await this.db.executeSql(
          `INSERT OR IGNORE INTO kg_relations (id, from_id, to_id, edge_type, weight, confidence, source_id, extraction_rule, tier)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'free')`,
          [id, fromId, toId, rel.edgeType, rel.weight, rel.confidence, sourceId, rel.extractionRule],
        );
        relationsStored++;
      } catch { /* duplicate — skip */ }
    }

    // Mark source as tier1 done
    await this.db.executeSql(
      `UPDATE sources SET kg_enrichment_status = 'tier1_done' WHERE id = ? AND kg_enrichment_status = 'pending'`,
      [sourceId],
    ).catch(() => {});

    return { objectsStored, eventsStored, relationsStored };
  }

  /**
   * Query the v2 KG with true multi-hop traversal.
   *
   * Uses a recursive CTE (`WITH RECURSIVE ... walk`) seeded by label matches,
   * expanding outward along kg_relations edges up to `maxHops` (default 3).
   * SQLite's recursive CTE dedupes visited node ids, so cycles terminate;
   * the `depth < maxHops` guard bounds the walk on large graphs.
   */
  async queryGraphV2(
    query: string,
    limit = 30,
    options: { maxHops?: number } = {},
  ): Promise<{
    objects: Array<{ id: string; type: string; label: string; mentionCount: number; hop: number }>;
    relations: Array<{
      fromLabel: string; toLabel: string; edgeType: string;
      confidence: number; tier: string; sourceFilename: string | null;
    }>;
    events: Array<{ label: string; eventTime: string; timePrecision: string }>;
  }> {
    const maxHops = options.maxHops ?? 3;

    let seedRows: Array<{ id: string }>;
    try {
      seedRows = await this.db.query<{ id: string }>(
        `SELECT id FROM kg_objects WHERE label LIKE '%' || ? || '%' ORDER BY mention_count DESC LIMIT ?`,
        [query, limit],
      );
    } catch {
      seedRows = await this.db.query<{ id: string }>(
        `SELECT id FROM kg_objects WHERE label LIKE '%' || ? || '%' ORDER BY mention_count DESC LIMIT ?`,
        [query, limit],
      );
    }

    if (seedRows.length === 0) {
      return { objects: [], relations: [], events: [] };
    }

    const seedIds = seedRows.map((r) => r.id);
    const seedPlaceholders = seedIds.map(() => '?').join(', ');

    // Recursive multi-hop walk: seeds at hop 0, expand along both edge directions.
    // SQLite recursive CTE UNION (not UNION ALL) dedupes visited ids — safe on cycles.
    const walked = await this.db.query<{ id: string; hop: number }>(
      `WITH RECURSIVE walk(id, hop) AS (
         SELECT id, 0 FROM kg_objects WHERE id IN (${seedPlaceholders})
         UNION
         SELECT r.to_id, w.hop + 1
           FROM walk w JOIN kg_relations r ON r.from_id = w.id
          WHERE w.hop < ?
         UNION
         SELECT r.from_id, w.hop + 1
           FROM walk w JOIN kg_relations r ON r.to_id = w.id
          WHERE w.hop < ?
       )
       SELECT id, MIN(hop) AS hop FROM walk GROUP BY id
       ORDER BY hop ASC
       LIMIT ?`,
      [...seedIds, maxHops, maxHops, limit],
    );

    if (walked.length === 0) {
      return { objects: [], relations: [], events: [] };
    }

    const hopById = new Map(walked.map((w) => [w.id, w.hop]));
    const objIds = walked.map((w) => w.id);
    const placeholders = objIds.map(() => '?').join(', ');

    // Fetch objects for every walked node (chats/documents included — unified graph).
    const objects = await this.db.query<{
      id: string; type: string; label: string; mention_count: number;
    }>(
      `SELECT id, type, label, mention_count
       FROM kg_objects WHERE id IN (${placeholders})
       ORDER BY mention_count DESC
       LIMIT ?`,
      [...objIds, limit],
    );

    // Relations strictly WITHIN the walked node set (both directions) — this is
    // the multi-hop subgraph, not just 1-hop from seeds.
    const relations = await this.db.query<{
      fromLabel: string; toLabel: string; edgeType: string; confidence: number; tier: string; sourceFilename: string | null;
    }>(
      `SELECT
         ko_from.label AS fromLabel,
         ko_to.label AS toLabel,
         kr.edge_type AS edgeType,
         kr.confidence,
         kr.tier,
         s.filename AS sourceFilename
       FROM kg_relations kr
       INNER JOIN kg_objects ko_from ON kr.from_id = ko_from.id
       INNER JOIN kg_objects ko_to ON kr.to_id = ko_to.id
       LEFT JOIN sources s ON kr.source_id = s.id
       WHERE kr.from_id IN (${placeholders}) AND kr.to_id IN (${placeholders})
       ORDER BY kr.confidence DESC
       LIMIT ?`,
      [...objIds, ...objIds, limit],
    );

    // Events attached to any walked node's source context
    const events = await this.db.query<{
      label: string; eventTime: string; timePrecision: string;
    }>(
      `SELECT ke.label, ke.event_time AS eventTime, ke.time_precision AS timePrecision
       FROM kg_events ke
       WHERE ke.source_id IN (
         SELECT DISTINCT source_id FROM kg_relations WHERE from_id IN (${placeholders}) AND source_id IS NOT NULL
       )
       ORDER BY ke.event_time DESC
       LIMIT ?`,
      [...objIds, Math.floor(limit / 2)],
    );

    return {
      objects: objects.map((o) => ({
        id: o.id,
        type: o.type,
        label: o.label,
        mentionCount: o.mention_count,
        hop: hopById.get(o.id) ?? 0,
      })),
      relations: relations.map((r) => ({
        fromLabel: r.fromLabel,
        toLabel: r.toLabel,
        edgeType: r.edgeType,
        confidence: r.confidence,
        tier: r.tier,
        sourceFilename: r.sourceFilename,
      })),
      events: events.map((e) => ({
        label: e.label,
        eventTime: e.eventTime,
        timePrecision: e.timePrecision,
      })),
    };
  }

  // ==========================================================================
  // CHAT SESSIONS AS UNIFIED GRAPH OBJECTS
  // ==========================================================================

  /**
   * Register a chat session (and optionally its latest messages) as unified
   * kg_objects so conversations participate in graph traversal, timelines, and
   * provenance — not just files. Type 'chat' (session) and 'note' (message).
   *
   * Relations written:
   *   session ──is_part_of──▶ project   (when projectId present)
   *   message ──is_part_of──▶ session   (for each message)
   *
   * Idempotent by (idempotencyKey) — safe to call after every turn.
   */
  async registerChatObject(input: {
    sessionId: string;
    title: string;
    projectId?: string | null;
    /** Optional latest message(s) to attach as 'note' objects. */
    messages?: Array<{ id: string; role: string; content: string }>;
    idempotencyKey?: string;
  }): Promise<{ sessionObjectId: string | null; messagesStored: number }> {
    // Idempotency guard: same (sessionId, idempotencyKey) pair is a no-op. The
    // key advances each turn, so identical re-runs skip; new turns still sync.
    if (input.idempotencyKey) {
      const prior = await this.db.query<{ value: string }>(
        `SELECT value FROM app_meta WHERE key = ? LIMIT 1`,
        [`kg.chat.${input.sessionId}`],
      );
      if (prior[0]?.value === input.idempotencyKey) {
        return { sessionObjectId: null, messagesStored: 0 };
      }
    }

    // Idempotency guard via a deterministic object id.
    const sessionObjectId = `chat:${input.sessionId}`;
    const exists = await this.db.query<{ id: string }>(
      `SELECT id FROM kg_objects WHERE id = ? LIMIT 1`,
      [sessionObjectId],
    );

    if (exists.length === 0) {
      await this.db.executeSql(
        `INSERT OR IGNORE INTO kg_objects (id, type, label, aliases_json, extra_json)
         VALUES (?, 'chat', ?, ?, ?)`,
        [
          sessionObjectId,
          input.title.slice(0, 200),
          JSON.stringify(['chat-session', input.sessionId]),
          JSON.stringify({ sessionId: input.sessionId, surface: 'chat' }),
        ],
      ).catch(() => {});
    } else {
      // Refresh title + updated_at so the session stays current in the graph.
      await this.db.executeSql(
        `UPDATE kg_objects SET label = ?, updated_at = datetime('now') WHERE id = ?`,
        [input.title.slice(0, 200), sessionObjectId],
      ).catch(() => {});
    }

    // Link session → project (is_part_of), upserting a project object if needed.
    if (input.projectId) {
      const projectObjectId = `project:${input.projectId}`;
      await this.db.executeSql(
        `INSERT OR IGNORE INTO kg_objects (id, type, label, aliases_json)
         VALUES (?, 'project', ?, ?)`,
        [projectObjectId, input.projectId.slice(0, 80), JSON.stringify(['project'])]
      ).catch(() => {});
      await this.db.executeSql(
        `INSERT OR IGNORE INTO kg_relations (id, from_id, to_id, edge_type, weight, confidence, extraction_rule, tier)
         VALUES (?, ?, ?, 'is_part_of', 1.0, 0.9, 'chat_register', 'free')`,
        [newId(), sessionObjectId, projectObjectId],
      ).catch(() => {});
    }

    // Attach messages as 'note' objects linked to the session.
    let messagesStored = 0;
    if (input.messages) {
      for (const message of input.messages) {
        const messageObjectId = `message:${message.id}`;
        const text = message.content.trim();
        if (!text) continue;
        const label = text.slice(0, 80);
        await this.db.executeSql(
          `INSERT OR IGNORE INTO kg_objects (id, type, label, aliases_json, extra_json)
           VALUES (?, 'note', ?, ?, ?)`,
          [
            messageObjectId,
            label,
            JSON.stringify(['chat-message']),
            JSON.stringify({ sessionId: input.sessionId, messageId: message.id, role: message.role }),
          ],
        ).catch(() => {});
        await this.db.executeSql(
          `INSERT OR IGNORE INTO kg_relations (id, from_id, to_id, edge_type, weight, confidence, extraction_rule, tier)
           VALUES (?, ?, ?, 'is_part_of', 1.0, 0.9, 'chat_register', 'free')`,
          [newId(), messageObjectId, sessionObjectId],
        ).catch(() => {});
        messagesStored += 1;
      }
    }

    // Record the idempotency key so repeated calls are cheap no-ops.
    if (input.idempotencyKey) {
      await this.db.executeSql(
        `INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)`,
        [`kg.chat.${input.sessionId}`, input.idempotencyKey],
      ).catch(() => {});
    }

    return { sessionObjectId, messagesStored };
  }

  /**
   * Bulk-register recent chat sessions (+ their last messages) into the graph.
   * Called from the library/settings UI and from a background hook; safe to run
   * repeatedly (idempotent INSERT OR IGNORE). Bounded to keep it cheap.
   */
  async syncChatsToGraph(options: {
    maxSessions?: number;
    maxMessagesPerSession?: number;
  } = {}): Promise<{ sessionsSynced: number; messagesSynced: number }> {
    const maxSessions = options.maxSessions ?? 20;
    const maxMessagesPerSession = options.maxMessagesPerSession ?? 10;

    const sessions = await this.db.query<{
      id: string; title: string; project_id: string | null;
    }>(
      `SELECT id, title, project_id FROM chat_sessions
       ORDER BY updated_at DESC LIMIT ?`,
      [maxSessions],
    ).catch(() => []);

    let sessionsSynced = 0;
    let messagesSynced = 0;
    for (const session of sessions) {
      const messages = await this.db.query<{
        id: string; role: string; content: string;
      }>(
        `SELECT id, role, content FROM messages
         WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
        [session.id, maxMessagesPerSession],
      ).catch(() => []);

      const result = await this.registerChatObject({
        sessionId: session.id,
        title: session.title || 'Chat',
        projectId: session.project_id,
        messages,
      });
      if (result.sessionObjectId) sessionsSynced += 1;
      messagesSynced += result.messagesStored;
    }

    return { sessionsSynced, messagesSynced };
  }

  /**
   * SYNAPSE-style graph-aware re-rank: query matched entities seed a
   * spreading-activation pass over the entity-triple graph. Entities linked
   * to the query topic (via shared predicates) get boosted above raw
   * mention-count order — the "related to what you asked" signal.
   *
   * Returns the same GraphQueryResult shape, but `entities` are re-ranked by
   * activation and a `activationMap` is attached (id → activation) for
   * callers that want the raw signal.
   */
  async queryGraphWithActivation(
    query: string,
    limit = 20,
  ): Promise<GraphQueryResult & { activationMap: Map<string, number> }> {
    const base = await this.queryGraph(query, limit);
    const activationMap = new Map<string, number>();
    if (base.entities.length === 0) {
      return { ...base, activationMap };
    }

    const edges: Array<{ from: string; to: string; weight: number }> = [];
    for (const t of base.triples) {
      const w = t.confidence > 0 ? t.confidence : 0.5;
      edges.push({ from: t.subjectName, to: t.objectName ?? t.objectText ?? '', weight: w });
    }

    const seeds = base.entities.map((e) => ({
      id: e.name,
      weight: Math.max(0.2, Math.min(1, e.mentionCount / 10)),
    }));

    const spread = spreadActivation(edges, seeds, {
      maxHops: 2,
      decay: 0.5,
      lateralInhibition: 0.2,
      normalize: true,
    });
    for (const r of spread) {
      activationMap.set(r.id, r.activation);
    }

    const rank = rankByActivation(spread, base.entities.map((e) => e.name));
    const reRanked = [...base.entities].sort((a, b) => {
      const d = (rank.get(b.name) ?? 0) - (rank.get(a.name) ?? 0);
      return d !== 0 ? d : b.mentionCount - a.mentionCount;
    });

    return { entities: reRanked, triples: base.triples, activationMap };
  }

  /** Get the timeline for a source — all extracted events in time order. */
  async getTimeline(sourceId: string): Promise<
    Array<{ label: string; eventTime: string; timePrecision: string; confidence: number }>
  > {
    return this.db.query(
      `SELECT label, event_time AS eventTime, time_precision AS timePrecision, confidence
       FROM kg_events WHERE source_id = ? ORDER BY event_time ASC`,
      [sourceId],
    );
  }

  /** Get all objects + relations for a file. */
  async getSourceGraph(sourceId: string, limit = 100): Promise<{
    objects: Array<{ id: string; type: string; label: string }>;
    relations: Array<{ fromLabel: string; toLabel: string; edgeType: string; confidence: number }>;
  }> {
    const objects = await this.db.query<{ id: string; type: string; label: string }>(
      `SELECT DISTINCT ko.id, ko.type, ko.label
       FROM kg_objects ko
       INNER JOIN kg_relations kr ON (kr.from_id = ko.id OR kr.to_id = ko.id)
       WHERE kr.source_id = ?
       LIMIT ?`,
      [sourceId, limit],
    );

    const relations = await this.db.query<{
      fromLabel: string; toLabel: string; edgeType: string; confidence: number;
    }>(
      `SELECT ko_from.label AS fromLabel, ko_to.label AS toLabel,
              kr.edge_type AS edgeType, kr.confidence
       FROM kg_relations kr
       INNER JOIN kg_objects ko_from ON kr.from_id = ko_from.id
       INNER JOIN kg_objects ko_to ON kr.to_id = ko_to.id
       WHERE kr.source_id = ?
       ORDER BY kr.confidence DESC
       LIMIT ?`,
      [sourceId, limit],
    );

    return { objects, relations };
  }

  /** Get objects for a specific chunk. */
  async getChunkObjects(chunkId: number): Promise<
    Array<{ id: string; type: string; label: string }>
  > {
    return this.db.query(
      `SELECT DISTINCT ko.id, ko.type, ko.label
       FROM kg_objects ko
       INNER JOIN kg_relations kr ON (kr.from_id = ko.id OR kr.to_id = ko.id)
       WHERE kr.chunk_id = ?`,
      [chunkId],
    );
  }

  /** Store Tier 2 LLM refinement results. */
  async storeTier2Result(
    sourceId: string,
    tier2: {
      objects: Array<{ type: string; label: string; aliases?: string[] }>;
      relations: Array<{ fromLabel: string; toLabel: string; edgeType: string; confidence: number }>;
      disambiguations: Map<string, string>;
      communitySummaries: Map<string, string>;
    },
    chunkId?: number,
  ): Promise<{ objectsStored: number; relationsStored: number }> {
    // Build label→id map from existing objects
    const allLabels = new Set<string>();
    for (const obj of tier2.objects) allLabels.add(obj.label.toLowerCase());
    for (const [ambig, canonical] of tier2.disambiguations) {
      allLabels.add(ambig.toLowerCase());
      allLabels.add(canonical.toLowerCase());
    }
    for (const r of tier2.relations) {
      allLabels.add(r.fromLabel.toLowerCase());
      allLabels.add(r.toLabel.toLowerCase());
    }

    const labelIds = new Map<string, string>();
    for (const label of allLabels) {
      const row = await this.db.query<{ id: string }>(
        `SELECT id FROM kg_objects WHERE lower(label) = lower(?) LIMIT 1`,
        [label],
      );
      if (row[0]) labelIds.set(label, row[0].id);
    }

    // Insert new refined objects
    let objectsStored = 0;
    for (const obj of tier2.objects) {
      if (!labelIds.has(obj.label.toLowerCase())) {
        const id = newId();
        await this.db.executeSql(
          `INSERT OR IGNORE INTO kg_objects (id, type, label, aliases_json)
           VALUES (?, ?, ?, ?)`,
          [id, obj.type, obj.label, obj.aliases ? JSON.stringify(obj.aliases) : null],
        );
        labelIds.set(obj.label.toLowerCase(), id);
        objectsStored++;
      }
    }

    // Insert refined relations (paid tier)
    let relationsStored = 0;
    for (const rel of tier2.relations) {
      const fromId = labelIds.get(rel.fromLabel.toLowerCase());
      const toId = labelIds.get(rel.toLabel.toLowerCase());
      if (!fromId || !toId) continue;

      const id = newId();
      try {
        await this.db.executeSql(
          `INSERT OR IGNORE INTO kg_relations (id, from_id, to_id, edge_type, weight, confidence, source_id, chunk_id, extraction_rule, tier)
           VALUES (?, ?, ?, ?, 1.0, ?, ?, ?, 'llm_refinement', 'paid')`,
          [id, fromId, toId, rel.edgeType, rel.confidence, sourceId, chunkId ?? null],
        );
        relationsStored++;
      } catch { /* duplicate */ }
    }

    // Store community summaries as objects
    for (const [topic, summary] of tier2.communitySummaries) {
      if (!labelIds.has(topic.toLowerCase())) {
        const id = newId();
        await this.db.executeSql(
          `INSERT OR IGNORE INTO kg_objects (id, type, label, extra_json)
           VALUES (?, 'topic', ?, ?)`,
          [id, topic, JSON.stringify({ summary })],
        ).catch(() => {});
        objectsStored++;
      }
    }

    // Mark source as tier2 done
    await this.db.executeSql(
      `UPDATE sources SET kg_enrichment_status = 'tier2_done' WHERE id = ? AND kg_enrichment_status IN ('tier1_done', 'tier2_in_progress')`,
      [sourceId],
    ).catch(() => {});

    return { objectsStored, relationsStored };
  }

  /** Get updated stats including v2 tables. */
  async getStatsV2(): Promise<{
    objectCount: number;
    relationCount: number;
    eventCount: number;
    freeRelations: number;
    paidRelations: number;
  }> {
    const [objRow, relRow, evtRow, freeRow, paidRow] = await Promise.all([
      this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM kg_objects`),
      this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM kg_relations`),
      this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM kg_events`),
      this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM kg_relations WHERE tier = 'free'`),
      this.db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM kg_relations WHERE tier = 'paid'`),
    ]);
    return {
      objectCount: objRow[0]?.c ?? 0,
      relationCount: relRow[0]?.c ?? 0,
      eventCount: evtRow[0]?.c ?? 0,
      freeRelations: freeRow[0]?.c ?? 0,
      paidRelations: paidRow[0]?.c ?? 0,
    };
  }

  /** Get enrichment progress across all sources. */
  async getEnrichmentProgress(): Promise<{
    total: number;
    pending: number;
    tier1Done: number;
    tier2Done: number;
  }> {
    const rows = await this.db.query<{ kg_enrichment_status: string; c: number }>(
      `SELECT kg_enrichment_status, COUNT(*) AS c
       FROM sources WHERE status = 'ready'
       GROUP BY kg_enrichment_status`,
    );
    const map = new Map(rows.map((r) => [r.kg_enrichment_status, r.c]));
    const total = [...map.values()].reduce((a, b) => a + b, 0);
    return {
      total,
      pending: map.get('pending') ?? 0,
      tier1Done: (map.get('tier1_done') ?? 0) + (map.get('tier2_done') ?? 0) + (map.get('tier2_in_progress') ?? 0),
      tier2Done: map.get('tier2_done') ?? 0,
    };
  }
}
