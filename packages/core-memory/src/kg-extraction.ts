/**
 * Deterministic KG Extraction — Tier 1 (Free, always runs).
 *
 * Extracts objects, events, and relations from text using ONLY deterministic methods:
 * - Structure parser (PDF TOC, heading hierarchy)
 * - Key-value regex (₹ amounts, dates, emails, phones, IDs, URLs)
 * - Gazetteer NER (dictionary of known entities)
 * - Co-occurrence inference (entities in same chunk → relation)
 * - Event extraction (dates + surrounding context)
 * - Project linker
 *
 * Zero LLM calls. Zero API cost. Runs during indexing (one-time per file).
 */

// ============================================================================
// TYPES
// ============================================================================

export type KgObjectType =
  | 'person' | 'org' | 'place' | 'concept' | 'file' | 'project'
  | 'topic' | 'event' | 'document' | 'image' | 'chat' | 'note';

export type KgEdgeType =
  | 'mentions' | 'contains' | 'discusses' | 'co_occurs' | 'happened_at'
  | 'authored' | 'founded' | 'located_in' | 'owns' | 'works_at'
  | 'is_about' | 'is_part_of' | 'supersedes' | 'contradicts'
  | 'references' | 'derives_from';

export interface KgObject {
  type: KgObjectType;
  label: string;
  aliases?: string[];
  extra?: Record<string, unknown>;
}

export interface KgEvent {
  label: string;
  eventTime: string;
  timePrecision: 'exact' | 'day' | 'month' | 'year';
  locationLabel?: string;
  confidence: number;
}

export interface KgRelation {
  fromLabel: string;
  toLabel: string;
  edgeType: KgEdgeType;
  weight: number;
  confidence: number;
  extractionRule: string;
}

export interface Tier1Result {
  objects: KgObject[];
  events: KgEvent[];
  relations: KgRelation[];
}

// ============================================================================
// GAZETTEER — Dictionary of known entities (India-focused, extensible)
// ============================================================================

const GAZETTEER: Map<string, { type: KgObjectType; aliases?: string[] }> = new Map();

// Indian companies
const INDIAN_COMPANIES: Record<string, string[]> = {
  'Tata Consultancy Services': ['TCS'],
  'Reliance Industries': ['Reliance', 'RIL'],
  'Infosys': [],
  'Wipro': [],
  'HDFC Bank': ['HDFC'],
  'ICICI Bank': ['ICICI'],
  'State Bank of India': ['SBI'],
  'Bharti Airtel': ['Airtel'],
  'Adani Group': ['Adani'],
  'Mahindra & Mahindra': ['Mahindra'],
  'Tata Motors': [],
  'Larsen & Toubro': ['L&T'],
  'ITC Limited': ['ITC'],
  'Axis Bank': [],
  'Kotak Mahindra Bank': ['Kotak'],
  'Bajaj Finance': [],
  'HCL Technologies': ['HCL'],
  'Tech Mahindra': [],
  'Zomato': [],
  'Swiggy': [],
  'Ola': [],
  'Flipkart': [],
  'Paytm': [],
  'PhonePe': [],
  'BYJU\'S': [],
  'Unacademy': [],
  'CRED': [],
  'Razorpay': [],
  'Zerodha': [],
};

// Indian cities
const INDIAN_CITIES: string[] = [
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata',
  'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Surat', 'Indore',
  'Coimbatore', 'Kochi', 'Nagpur', 'Bhopal', 'Chandigarh', 'Goa',
  'Gurgaon', 'Noida', 'Thane', 'Visakhapatnam', 'Bhubaneswar',
  'Guwahati', 'Mysore', 'Mangalore', 'Trivandrum', 'Patna', 'Vadodara',
];

// Indian states
const INDIAN_STATES: string[] = [
  'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Delhi', 'Uttar Pradesh',
  'Gujarat', 'Rajasthan', 'West Bengal', 'Telangana', 'Kerala',
  'Andhra Pradesh', 'Madhya Pradesh', 'Haryana', 'Punjab', 'Bihar',
  'Odisha', 'Assam', 'Chhattisgarh', 'Jharkhand', 'Uttarakhand',
  'Himachal Pradesh', 'Goa', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Sikkim', 'Tripura',
];

// Global known entities
const GLOBAL_ORGS: string[] = [
  'Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'OpenAI', 'Anthropic',
  'Tesla', 'SpaceX', 'NASA', 'ISRO', 'WHO', 'UN', 'EU', 'IMF', 'World Bank',
  'Goldman Sachs', 'JP Morgan', 'McKinsey', 'BCG', 'Bain', 'Deloitte',
  'Accenture', 'IBM', 'Intel', 'NVIDIA', 'AMD', 'Samsung', 'Sony', 'Toyota',
];

// High-confidence person names (public figures)
const PUBLIC_FIGURES: Map<string, string[]> = new Map([
  ['Narendra Modi', []],
  ['Elon Musk', []],
  ['Satya Nadella', []],
  ['Sundar Pichai', []],
  ['Sam Altman', ['Samuel Altman']],
  ['Dario Amodei', []],
  ['Jensen Huang', []],
  ['Mukesh Ambani', []],
  ['Ratan Tata', []],
  ['Narayana Murthy', []],
  ['Azim Premji', []],
  ['Deepinder Goyal', []],
  ['Nandan Nilekani', []],
]);

// Initialize gazetteer
for (const [name, aliases] of Object.entries(INDIAN_COMPANIES)) {
  GAZETTEER.set(name.toLowerCase(), { type: 'org', aliases });
  for (const alias of aliases) {
    GAZETTEER.set(alias.toLowerCase(), { type: 'org' });
  }
}
for (const city of INDIAN_CITIES) {
  GAZETTEER.set(city.toLowerCase(), { type: 'place' });
}
for (const state of INDIAN_STATES) {
  GAZETTEER.set(state.toLowerCase(), { type: 'place' });
}
for (const org of GLOBAL_ORGS) {
  GAZETTEER.set(org.toLowerCase(), { type: 'org' });
}
for (const [name, aliases] of PUBLIC_FIGURES) {
  GAZETTEER.set(name.toLowerCase(), { type: 'person', aliases });
  for (const alias of aliases) {
    GAZETTEER.set(alias.toLowerCase(), { type: 'person' });
  }
}

// ============================================================================
// 1. STRUCTURE EXTRACTOR — PDF TOC, heading hierarchy
// ============================================================================

/** Heading pattern: markdown-style headings, numbered sections, etc. */
const HEADING_PATTERN = /^(?:#+\s+(.+)|((?:\d+\.?)+)\s+(.+)|([A-Z][A-Za-z\s]{2,60})$)/gm;

export function extractStructure(text: string, sourceLabel: string, sourceId: string): Tier1Result {
  const objects: KgObject[] = [];
  const relations: KgRelation[] = [];

  // Source file as a kg_object
  const fileObj: KgObject = {
    type: 'file',
    label: sourceLabel,
    aliases: [sourceId],
  };
  objects.push(fileObj);

  const lines = text.split('\n');
  let lastTopic: string | null = null;

  for (const line of lines) {
    HEADING_PATTERN.lastIndex = 0;
    const m = HEADING_PATTERN.exec(line.trim());
    if (m) {
      const heading = (m[1] || m[3] || m[4] || '').trim();
      if (heading.length > 2 && heading.length < 120) {
        objects.push({ type: 'topic', label: heading });
        relations.push({
          fromLabel: heading,
          toLabel: sourceLabel,
          edgeType: 'is_part_of',
          weight: 1.0,
          confidence: 0.9,
          extractionRule: 'structure_heading',
        });
        if (lastTopic) {
          relations.push({
            fromLabel: lastTopic,
            toLabel: heading,
            edgeType: 'contains',
            weight: 0.7,
            confidence: 0.6,
            extractionRule: 'structure_sequence',
          });
        }
        lastTopic = heading;
      }
    }
  }

  return { objects, events: [], relations };
}

// ============================================================================
// 2. KEY-VALUE EXTRACTOR — ₹ amounts, dates, emails, phones, IDs, URLs
// ============================================================================

const KV_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  objType: KgObjectType;
  extractLabel: (m: RegExpExecArray) => string;
  extra?: (m: RegExpExecArray) => Record<string, unknown>;
}> = [
  {
    name: 'currency_inr',
    regex: /₹\s*([\d,]+(?:\.\d{1,2})?)\s*(crore|lakh|thousand|k)?/gi,
    objType: 'concept',
    extractLabel: (m) => `₹${m[1]?.replace(/,/g, '') ?? '0'}${m[2] ? ' ' + m[2] : ''}`,
  },
  {
    name: 'currency_usd',
    regex: /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(million|billion|trillion|M|B|T)?/gi,
    objType: 'concept',
    extractLabel: (m) => `$${m[1]?.replace(/,/g, '') ?? '0'}${m[2] ? ' ' + m[2] : ''}`,
  },
  {
    name: 'email',
    regex: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    objType: 'concept',
    extractLabel: (m) => m[1] ?? '',
  },
  {
    name: 'phone_india',
    regex: /(?:\+91[\s-]?)?[6789]\d{9}\b/g,
    objType: 'concept',
    extractLabel: (m) => m[0],
  },
  {
    name: 'url',
    regex: /\bhttps?:\/\/[^\s,;)\]}>"]+/g,
    objType: 'concept',
    extractLabel: (m) => m[0].replace(/[.,;)\]}>"]+$/, ''),
  },
  {
    name: 'pan_card',
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    objType: 'concept',
    extractLabel: (m) => m[0],
  },
  {
    name: 'gstin',
    regex: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d\b/g,
    objType: 'concept',
    extractLabel: (m) => m[0],
  },
  {
    name: 'percentage',
    regex: /\b(\d{1,3}(?:\.\d{1,2})?)\s*%/g,
    objType: 'concept',
    extractLabel: (m) => `${m[1] ?? '0'}%`,
  },
];

export function extractKeyValues(text: string): Tier1Result {
  const objects: KgObject[] = [];
  const relations: KgRelation[] = [];

  for (const pat of KV_PATTERNS) {
    pat.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.regex.exec(text)) !== null) {
      const label = pat.extractLabel(m).trim();
      if (label.length < 2 || label.length > 120) continue;

      objects.push({
        type: pat.objType,
        label,
        extra: pat.extra?.(m),
      } as KgObject);

      relations.push({
        fromLabel: label,
        toLabel: '__source__',
        edgeType: 'mentions',
        weight: 1.0,
        confidence: 0.8,
        extractionRule: pat.name,
      });
    }
  }

  return { objects, events: [], relations };
}

// ============================================================================
// 3. GAZETTEER NER — Dictionary lookup
// ============================================================================

export function extractGazetteer(text: string): Tier1Result {
  const objects: KgObject[] = [];
  const relations: KgRelation[] = [];
  const seen = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const [key, { type, aliases }] of GAZETTEER) {
    const displayName = key.charAt(0).toUpperCase() + key.slice(1);
    if (lowerText.includes(key) && !seen.has(key)) {
      seen.add(key);
      objects.push({ type, label: displayName, aliases } as KgObject);
      relations.push({
        fromLabel: displayName,
        toLabel: '__source__',
        edgeType: 'mentions',
        weight: 1.0,
        confidence: 0.85,
        extractionRule: 'gazetteer',
      });
    }
    // Check aliases that aren't already in the gazetteer keys
    for (const alias of aliases ?? []) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower !== key && lowerText.includes(aliasLower) && !seen.has(aliasLower)) {
        seen.add(aliasLower);
        objects.push({ type, label: alias, aliases: [displayName] } as KgObject);
        relations.push({
          fromLabel: alias,
          toLabel: displayName,
          edgeType: 'references',
          weight: 1.0,
          confidence: 0.7,
          extractionRule: 'gazetteer_alias',
        });
      }
    }
  }

  return { objects, events: [], relations };
}

// ============================================================================
// 4. CO-OCCURRENCE ENGINE — Entities in same paragraph → co_occurs relation
// ============================================================================

export function extractCoOccurrence(
  chunkText: string,
  existingObjects: KgObject[],
): KgRelation[] {
  const relations: KgRelation[] = [];
  const present = existingObjects.filter((o) =>
    chunkText.toLowerCase().includes(o.label.toLowerCase()),
  );

  // Create co_occurs relations between every pair in the same chunk
  // (capped at n² for small n; chunk-level entities are typically <20)
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      if (present[i]!.label === present[j]!.label) continue;
      relations.push({
        fromLabel: present[i]!.label,
        toLabel: present[j]!.label,
        edgeType: 'co_occurs',
        weight: 0.5,
        confidence: 0.4,
        extractionRule: 'co_occurrence',
      });
    }
  }

  return relations;
}

// ============================================================================
// 5. EVENT EXTRACTOR — Dates + surrounding context → kg_events
// ============================================================================

const EVENT_DATE_PATTERNS: Array<{
  precision: 'exact' | 'day' | 'month' | 'year';
  regex: RegExp;
  formatDate: (m: RegExpExecArray) => string; // ISO 8601
}> = [
  {
    precision: 'exact',
    regex: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    formatDate: (m) => `${m[1]}-${m[2]}-${m[3]}`,
  },
  {
    precision: 'day',
    regex: /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/gi,
    formatDate: (m) => {
      const d = new Date(m[1]!);
      return d.toISOString().slice(0, 10);
    },
  },
  {
    precision: 'day',
    regex: /\b(\d{1,2}[/-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[/-]\d{4})\b/gi,
    formatDate: (m) => {
      const d = new Date(m[1]!);
      return d.toISOString().slice(0, 10);
    },
  },
  {
    precision: 'day',
    regex: /\b(\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g,
    formatDate: (m) => {
      const parts = m[1]!.split(/[/-]/);
      if (parts.length === 3) {
        return `${parts[2]}-${(parts[0] ?? '01').padStart(2, '0')}-${(parts[1] ?? '01').padStart(2, '0')}`;
      }
      return m[1]!;
    },
  },
  {
    precision: 'month',
    regex: /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/gi,
    formatDate: (m) => {
      const d = new Date(m[1]!);
      return d.toISOString().slice(0, 7);
    },
  },
  {
    precision: 'year',
    regex: /\b(19\d{2}|20\d{2})\b/g,
    formatDate: (m) => m[1]!,
  },
];

export function extractEvents(text: string): KgEvent[] {
  const events: KgEvent[] = [];
  const seen = new Set<string>();

  for (const pat of EVENT_DATE_PATTERNS) {
    pat.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.regex.exec(text)) !== null) {
      const iso = pat.formatDate(m);
      if (!iso || seen.has(iso)) continue;
      seen.add(iso);

      // Get surrounding context (±50 chars) for event label
      const start = Math.max(0, m.index - 50);
      const end = Math.min(text.length, m.index + m[0].length + 50);
      const context = text.slice(start, end).replace(/\s+/g, ' ').trim();

      events.push({
        label: `Event: ${context.slice(0, 80)}`,
        eventTime: iso,
        timePrecision: pat.precision,
        confidence: pat.precision === 'exact' ? 0.95 : pat.precision === 'day' ? 0.9 : 0.7,
      });
    }
  }

  return events;
}

// ============================================================================
// 6. PROJECT LINKER — Match entities against known project names
// ============================================================================

export function extractProjectLinks(
  text: string,
  knownProjects: Array<{ id: string; name: string }>,
): Tier1Result {
  const objects: KgObject[] = [];
  const relations: KgRelation[] = [];

  for (const proj of knownProjects) {
    if (text.toLowerCase().includes(proj.name.toLowerCase())) {
      objects.push({ type: 'project', label: proj.name });
      relations.push({
        fromLabel: proj.name,
        toLabel: '__source__',
        edgeType: 'discusses',
        weight: 1.0,
        confidence: 0.7,
        extractionRule: 'project_match',
      });
    }
  }

  return { objects, events: [], relations };
}

// ============================================================================
// MASTER TIER-1 PIPELINE — Runs all deterministic extractors
// ============================================================================

export interface Tier1Options {
  sourceLabel: string;
  sourceId: string;
  knownProjects?: Array<{ id: string; name: string }>;
}

/**
 * Run ALL deterministic extractors on text and return a merged result.
 * Zero LLM calls. Zero API cost. Runs once per file during indexing.
 */
export function extractTier1(text: string, opts: Tier1Options): Tier1Result {
  const results: Tier1Result[] = [];

  // Phase 1: Structure
  results.push(extractStructure(text, opts.sourceLabel, opts.sourceId));

  // Phase 2: Key-value
  results.push(extractKeyValues(text));

  // Phase 3: Gazetteer
  results.push(extractGazetteer(text));

  // Phase 5: Events
  const events = extractEvents(text);

  // Phase 6: Project links
  if (opts.knownProjects?.length) {
    results.push(extractProjectLinks(text, opts.knownProjects));
  }

  // Merge: deduplicate objects by label, union relations + events
  const objMap = new Map<string, KgObject>();
  const relSet = new Set<string>();
  const mergedRelations: KgRelation[] = [];
  const mergedEvents: KgEvent[] = [...events];
  const evtSet = new Set(events.map((e) => e.eventTime + e.label));

  for (const r of results) {
    for (const obj of r.objects) {
      const key = `${obj.label.toLowerCase()}:${obj.type}`;
      if (!objMap.has(key)) {
        objMap.set(key, obj);
      } else {
        // Merge aliases
        const existing = objMap.get(key)!;
        if (obj.aliases) {
          existing.aliases = [...new Set([...(existing.aliases ?? []), ...obj.aliases])];
        }
      }
    }
    for (const rel of r.relations) {
      const sig = `${rel.fromLabel}|${rel.edgeType}|${rel.toLabel}`;
      if (!relSet.has(sig)) {
        relSet.add(sig);
        mergedRelations.push(rel);
      }
    }
    for (const evt of r.events) {
      const sig = evt.eventTime + evt.label;
      if (!evtSet.has(sig)) {
        evtSet.add(sig);
        mergedEvents.push(evt);
      }
    }
  }

  // Phase 4: Co-occurrence (runs AFTER merge, using merged objects)
  const allObjects = [...objMap.values()];
  // Sample text for co-occurrence: first 8000 chars
  const sampleText = text.slice(0, 8000);
  const coOccurRels = extractCoOccurrence(sampleText, allObjects);
  for (const rel of coOccurRels) {
    const sig = `${rel.fromLabel}|${rel.edgeType}|${rel.toLabel}`;
    if (!relSet.has(sig)) {
      relSet.add(sig);
      mergedRelations.push(rel);
    }
  }

  return {
    objects: allObjects,
    events: mergedEvents,
    relations: mergedRelations,
  };
}
