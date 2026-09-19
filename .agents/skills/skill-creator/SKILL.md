---
name: skill-creator
description: Create, review, validate, and maintain portable Agent Skills. Use when designing a reusable skill, deciding what belongs in SKILL.md versus references/scripts, checking activation descriptions, adding deterministic helpers, or auditing a skill for agent/model portability and progressive disclosure.
license: MIT
metadata:
  version: "2.0.0"
  purpose: portable-skill-authoring
---

# Skill Creator

Create reusable capabilities, not giant product-specific prompts.

## Required structure

```text
skill-name/
├── SKILL.md
├── scripts/       # deterministic helpers, optional
├── references/    # focused technical material, optional
└── assets/        # templates/resources, optional
```

`SKILL.md` must have valid YAML frontmatter with `name` and `description`. Keep the name lowercase, hyphenated, and matched to the directory. Keep the description concrete about both capability and trigger conditions.

## Authoring workflow

1. Define the recurring task and the observable output.
2. Define when the skill should activate and when it should not.
3. Separate universal procedure from client/product-specific integration.
4. Put the happy-path instructions in `SKILL.md`.
5. Put large references, schemas, examples, and language matrices in `references/`.
6. Put deterministic parsing/building/validation in `scripts/`.
7. Specify dependencies honestly and provide fallbacks.
8. Define uncertainty and failure behavior.
9. Test on a realistic task.
10. Run the Agent Skills validator when available.

## Portability rules

Use capability language rather than a vendor-specific persona:

- read files;
- run commands;
- inspect Git;
- query an index;
- run tests;
- retrieve structured evidence.

A skill may document optional integrations separately, but its core procedure must remain useful without them unless the dependency is the actual purpose of the skill.

## Progressive disclosure

Keep `SKILL.md` below the recommended loading budget. Use one-level-deep relative references. Do not create chains of references that require an agent to recursively discover the instructions.

## Deterministic tooling

Prefer scripts when correctness depends on:

- parsers;
- hashing;
- database writes;
- ranking;
- graph traversal;
- schema validation;
- repeatable formatting.

Use model instructions for judgment, interpretation, and project-specific decisions.

## Validation checklist

- frontmatter valid;
- directory/name match;
- clear trigger description;
- no hard-coded private paths;
- no secret material;
- scripts have explicit dependencies;
- references resolve;
- failure modes defined;
- output contract documented;
- vendor-specific details isolated;
- examples match current behavior.

Use `skills-ref validate <skill-directory>` when installed.
