/**
 * Contextual query rewrite — uses recent chat turns to expand ambiguous queries.
 * "How about Samsung?" in an iPhone discussion → "Samsung Galaxy specs comparison"
 */

export function contextualRewrite(
  query: string,
  recentTurns?: Array<{ role: string; content: string }>,
): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;

  // If query is already long/specific (>60 chars), don't rewrite
  if (trimmed.length > 60) return trimmed;

  // If no context, just return original
  if (!recentTurns || recentTurns.length === 0) return trimmed;

  // Check if query is a follow-up (short, uses pronouns/deictics)
  const followUpPatterns = [
    /^(and|but|what about|how about|tell me more|more about|also|compare|vs)\b/i,
    /\b(it|its|this|that|them|they|those|these|the same|the other)\b/i,
    /^(why|how|when|where)\??\s*$/i,
  ];

  const isFollowUp = followUpPatterns.some((p) => p.test(trimmed)) || trimmed.length < 25;
  if (!isFollowUp) return trimmed;

  // Extract key topics from last 3 turns
  const last3 = recentTurns.slice(-6); // up to 3 pairs (user + assistant)
  const topics: string[] = [];

  for (const turn of last3) {
    if (turn.role !== 'user') continue;
    // Extract nouns/entities (simple heuristic: capitalized words, multi-word phrases)
    const words = turn.content
      .replace(/[?!.,;:'"]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && /^[A-Z]/.test(w));
    topics.push(...words.slice(0, 3));
  }

  // Also check assistant's last response for key entities
  const lastAssistant = last3.filter((t) => t.role === 'assistant').pop();
  if (lastAssistant) {
    const assistantWords = lastAssistant.content
      .replace(/[?!.,;:'"*#\-_`]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4 && /^[A-Z]/.test(w));
    topics.push(...assistantWords.slice(0, 3));
  }

  // Remove duplicates
  const uniqueTopics = [...new Set(topics)].slice(0, 5);

  if (uniqueTopics.length === 0) return trimmed;

  // Append topic context to the query
  const expanded = `${trimmed} ${uniqueTopics.join(' ')}`;
  return expanded.slice(0, 120);
}
