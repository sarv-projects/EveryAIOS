# Retrieval Protocol

## Query intents

Classify repository questions into one or more intents:

- `find`: where is the implementation?
- `symbol`: what is this symbol and where is it defined?
- `trace`: how does A reach B?
- `references`: what uses X?
- `impact`: what may break if X changes?
- `architecture`: what subsystems own this behavior?
- `behavior`: what happens at runtime?
- `data-flow`: where does this data originate/end up?
- `config`: what controls this behavior?
- `test`: how is this behavior verified?
- `history`: why was this designed this way?
- `security`: where are trust/data-flow boundaries?

## Candidate generation

Use whichever providers exist:

1. exact path/name match;
2. symbol index;
3. import/export relations;
4. FTS5/BM25;
5. semantic SCIP/LSP relations;
6. graph neighbors/paths;
7. Git history;
8. local embedding retrieval (optional).

## Fusion

A practical default is reciprocal-rank fusion:

`score(d) = Σ 1 / (k + rank_i(d))`

Use deterministic source priors and explicit boosts for exact symbol/path matches. Keep the scoring explainable.

## Evidence packing

Return:

- ranked file/range results;
- why each result ranked;
- exact definitions where available;
- graph paths/edges relevant to the question;
- recommended reads, bounded by token budget;
- coverage and uncertainty.

Do not send full repository maps on every request. Build a small packet tailored to the question.
