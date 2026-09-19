# Security and Privacy Rules

## Default posture

- Local-only indexing by default.
- No telemetry requirement.
- No source upload requirement.
- No external embedding calls without explicit opt-in.

## Exclusions before parsing

Exclude, unless explicitly requested:

- `.env*`
- private keys/certificates
- credential/config files with secrets
- tokens/JWTs
- binary blobs
- dependency caches
- generated artifacts
- build output
- huge vendored/generated files

Honor repository ignore rules plus project-specific code-intelligence ignore rules if present.

## Output redaction

Before returning source snippets to an agent, redact obvious secrets when practical. A redaction failure must never be interpreted as proof that source is safe to transmit externally.

## External providers

Any external semantic, embedding, or analysis provider must be opt-in and named in the configuration. The generated freshness/evidence metadata should record the provider so the user can audit what ran.
