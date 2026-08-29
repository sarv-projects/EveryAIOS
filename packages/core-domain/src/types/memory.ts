/** Canonical memory categories — spec §8 scoped retrieval. */
export const MEMORY_CATEGORIES = [
  'personal',
  'books',
  'finance',
  'health',
  'work',
  'projects',
  'other',
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_CATEGORY_META: Record<
  MemoryCategory,
  { label: string; description: string }
> = {
  personal: { label: 'Personal', description: 'Preferences, habits, family, goals' },
  books: { label: 'Books', description: 'Summaries, characters, quotes (reader mode)' },
  finance: { label: 'Finance', description: 'Investments, bills, tax info' },
  health: { label: 'Health', description: 'Medical history, prescriptions' },
  work: { label: 'Work', description: 'Projects, meetings, clients' },
  projects: { label: 'Projects', description: 'Side projects and long-running goals' },
  other: { label: 'Other', description: 'User-defined / uncategorized' },
};

/** A single turn in working (RAM) memory */
export interface WorkingTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sessionId?: string;
}

/** A compressed session summary in episodic memory */
export interface EpisodicSummary {
  id: number;
  sessionId: string;
  summary: string;
  turnCount: number;
  createdAt: string;
}

/** Emotional/lesson polarity of a memory fact — algorithm #7 (Forgetting-to-Remember). */
export type FactPolarity = 'positive' | 'negative' | 'neutral';

/** A stored memory fact with decay, versioning, and scoping fields */
export interface MemoryFact {
  id: number;
  content: string;
  category: MemoryCategory | string;
  subcategory?: string;
  tags: string[];
  source: string;
  sourceId?: string;
  projectId?: string;
  isActive: boolean;
  supersedesId?: number;
  decayScore: number;
  accessCount: number;
  lastAccess?: string;
  confidence: number;
  pinned: boolean;
  storedAt: string;
  updatedAt: string;
  /** DB column is NOT NULL; default 'proposed' until user approves. */
  status: 'proposed' | 'approved' | 'rejected';
  provenanceJson?: string;
  /** Algorithm #7: learned polarity — negative = "lesson to avoid". */
  polarity?: FactPolarity;
  /** Algorithm #7: how many times the user signaled frustration on this. */
  frustrationCount?: number;
}

/** Scoped recall filters */
export interface RecallOptions {
  categories?: Array<MemoryCategory | string>;
  subcategory?: string;
  sourceId?: string;
  limit?: number;
  minDecay?: number;
  includeInactive?: boolean;
  /** Algorithm #7: when true, negative-polarity lessons are NOT suppressed. */
  includeLessons?: boolean;
}

/** A candidate fact extracted from conversation */
export interface FactCandidate {
  content: string;
  category: MemoryCategory | string;
  subcategory?: string;
  tags?: string[];
  source: string;
  sourceId?: string;
  projectId?: string;
  confidence: 'high' | 'low';
  relatedFactId?: number;
  /** Algorithm #7: learned polarity — negative = "lesson to avoid". */
  polarity?: FactPolarity;
  /** Algorithm #7: how many times the user signaled frustration on this fact. */
  frustrationCount?: number;
}

/** Result of attempting to write a fact */
export type FactWriteResult =
  | 'stored'
  | 'superseded'
  | 'drafted'
  | 'conflict'
  | 'duplicate';

/** Options for listing semantic memory facts */
export interface ListFactsOptions {
  includeInactive?: boolean;
  query?: string;
  category?: string;
  categories?: Array<MemoryCategory | string>;
  sourceId?: string;
  limit?: number;
}

/** Repository interface for episodic (session summary) memory */
export interface EpisodicMemoryRepository {
  store(
    summary: Pick<EpisodicSummary, 'sessionId' | 'summary' | 'turnCount'>,
  ): Promise<EpisodicSummary>;
  listRecent(days?: number): Promise<EpisodicSummary[]>;
  pruneOlderThan(days: number): Promise<void>;
}

/** Repository interface for semantic memory operations */
export interface MemoryRepository {
  recall(query: string, options?: RecallOptions): Promise<MemoryFact[]>;
  listFacts(options?: ListFactsOptions): Promise<MemoryFact[]>;
  getById(id: number): Promise<MemoryFact | null>;
  store(fact: FactCandidate): Promise<FactWriteResult>;
  supersede(oldId: number, next: FactCandidate): Promise<void>;
  pin(id: number): Promise<void>;
  unpin(id: number): Promise<void>;
  delete(id: number): Promise<void>;
  decay(): Promise<void>;
  bumpAccessCount(id: number): Promise<void>;
  approveFact(id: number): Promise<void>;
  rejectFact(id: number): Promise<void>;
  listProposed(): Promise<MemoryFact[]>;
}

export function isMemoryCategory(value: string): value is MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeMemoryCategory(value: string): MemoryCategory | string {
  const lower = value.toLowerCase();
  if (lower === 'location' || lower === 'preference') {
    return 'personal';
  }
  if (isMemoryCategory(lower)) {
    return lower;
  }
  return 'other';
}