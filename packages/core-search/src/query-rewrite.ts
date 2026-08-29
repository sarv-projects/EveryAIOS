/** Heuristic query rewrite for web search — no on-device LLM. */

const FILLER_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'please',
  'tell',
  'me',
  'about',
  'what',
  'whats',
  "what's",
  'how',
  'why',
  'when',
  'where',
  'who',
  'which',
  'give',
  'find',
  'show',
  'get',
  'know',
  'want',
  'need',
  'like',
  'just',
  'really',
  'actually',
  'basically',
  'literally',
  'um',
  'uh',
  'hey',
  'hi',
  'hello',
  'thanks',
  'thank',
  'you',
  'your',
  'i',
  'im',
  "i'm",
  'my',
  'we',
  'our',
  'they',
  'their',
  'it',
  'its',
  "it's",
  'this',
  'that',
  'these',
  'those',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'by',
  'and',
  'or',
  'but',
  'so',
  'if',
  'as',
]);

const TEMPORAL_PHRASES: Array<{ pattern: RegExp; resolve: (now: Date) => string }> = [
  {
    pattern: /\btoday\b/gi,
    resolve: (now) => now.toISOString().slice(0, 10),
  },
  {
    pattern: /\byesterday\b/gi,
    resolve: (now) => {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    },
  },
  {
    pattern: /\btomorrow\b/gi,
    resolve: (now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    },
  },
  {
    pattern: /\bthis week\b/gi,
    resolve: (now) => {
      const d = new Date(now);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return `${monday.toISOString().slice(0, 10)} to ${sunday.toISOString().slice(0, 10)}`;
    },
  },
  {
    pattern: /\blast week\b/gi,
    resolve: (now) => {
      const d = new Date(now);
      const day = d.getDay();
      const thisMonday = new Date(d);
      thisMonday.setDate(d.getDate() - ((day + 6) % 7));
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return `${lastMonday.toISOString().slice(0, 10)} to ${lastSunday.toISOString().slice(0, 10)}`;
    },
  },
  {
    pattern: /\bthis month\b/gi,
    resolve: (now) => now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  },
  {
    pattern: /\bthis year\b/gi,
    resolve: (now) => String(now.getFullYear()),
  },
  {
    pattern: /\bnow\b/gi,
    resolve: (now) => now.toISOString().slice(0, 16).replace('T', ' '),
  },
  {
    pattern: /\bcurrent(?:ly)?\b/gi,
    resolve: (now) => now.toISOString().slice(0, 10),
  },
  {
    pattern: /\blatest\b/gi,
    resolve: (now) => `${now.getFullYear()} latest`,
  },
];

/** Multi-word phrases worth quoting for exact-match search. */
const EXACT_PHRASE_PATTERNS = [
  /\b(?:openai|chatgpt|google|microsoft|apple|meta|anthropic)\b/gi,
  /\b(?:19|20)\d{2}\b(?![-/]\d)/g,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
];

function expandTemporalPhrases(query: string, now = new Date()): string {
  let expanded = query;
  for (const { pattern, resolve } of TEMPORAL_PHRASES) {
    expanded = expanded.replace(pattern, (match) => {
      const value = resolve(now);
      return `${match} (${value})`;
    });
  }
  return expanded;
}

function stripFillerWords(query: string): string {
  const tokens = query.split(/\s+/).filter(Boolean);
  const filtered = tokens.filter((token) => {
    const normalized = token.toLowerCase().replace(/[^a-z0-9'-]/g, '');
    if (!normalized) return true;
    return !FILLER_WORDS.has(normalized);
  });
  return filtered.length > 0 ? filtered.join(' ') : query.trim();
}

function addExactPhraseQuotes(query: string): string {
  let result = query;
  for (const pattern of EXACT_PHRASE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (match.startsWith('"') && match.endsWith('"')) {
        return match;
      }
      return `"${match}"`;
    });
  }
  return result;
}

/**
 * Rewrite a conversational query into a tighter web-search query.
 * - Expands temporal phrases ("today" → current date)
 * - Strips filler words
 * - Adds quotes around exact phrases (proper nouns, years)
 */
export function rewriteSearchQuery(query: string, now = new Date()): string {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return '';
  }

  let rewritten = expandTemporalPhrases(trimmed, now);
  rewritten = stripFillerWords(rewritten);
  rewritten = addExactPhraseQuotes(rewritten);

  return rewritten.replace(/\s+/g, ' ').trim();
}