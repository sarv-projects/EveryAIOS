# Understanding Pipeline

```text
                           Repository
                               |
               +---------------+---------------+
               |                               |
          Discovery layer                Git/history layer
               |                               |
      files / manifests / tests         commits / blame / diffs
               |                               |
               +---------------+---------------+
                               |
                         Parse / Index
                               |
        +----------------------+-----------------------+
        |                      |                       |
    Tree-sitter           SCIP / LSP           Native analyzers
        |                      |                       |
        +----------------------+-----------------------+
                               |
                        Unified evidence graph
                               |
       +-----------+-----------+-----------+-----------+
       |           |           |           |           |
      file      symbol      runtime       test       config
      graph      graph       graph       graph       graph
       |           |           |           |           |
       +-----------+-----------+-----------+-----------+
                               |
                       Retrieval / Analysis
                               |
             +-----------------+------------------+
             |                 |                  |
         FTS / BM25       graph ranking      optional vectors
             |                 |                  |
             +-----------------+------------------+
                               |
                      Evidence packet
                               |
             +-----------------+------------------+
             |                 |                  |
         find / trace       impact          architecture
             |                 |                  |
             +-----------------+------------------+
                               |
                      Understanding layer
                               |
     architecture / behavior / data / intent / changeability
                               |
                       durable knowledge
                               |
                       docs/codebase/
```

## Separation of concerns

**Index** answers what is mechanically observable.

**Graph** connects observations.

**Retrieval** selects evidence for a question.

**Understanding** synthesizes behavior and architecture from that evidence.

**Memory** persists only stable, evidence-backed facts.

Do not let a generated summary replace its underlying evidence.
