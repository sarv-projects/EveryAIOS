# 14 — Providers

> **Status:** Frozen v1 (frozen 2026-09-26; drafted P2).
> **P7 pass (2026-09-26):** line-checked; requirements seeded (`REQ-PROV-*`, Requirements section).
> **P9 verification pass (2026-09-26):** read line-by-line; fixes applied where needed (owner-directed; re-freeze follows).
> **Role:** the only layer where protocols exist. Providers implement capabilities; nothing above the Capability Plane knows the transport (INV-15).
> **Dependencies:** `13-CAPABILITY` (resolution) · `12-TRUST` (guard/egress/vault) · `19-RUNTIME-ENVIRONMENTS` (where adapters run) · `30-EVENTS` (health/events).
> **Evidence:** `ARCHIVE/v1-research/mcp-provider-verification.md` (641 lines, verified citations) · `ARCHIVE/v1-research/agent-harness-verification.md` (§A4 sandbox/approval/exec layers, §B1 ACP surface, §D1 adapter patterns) · product-owner brief.

## 1. Purpose & rules

**Owns:** the `ProviderAdapter` contract (CTR-010) · the provider registry (DM-013) · health and epochs · the adapter classes (native · MCP · ACP · HTTP · CLI · plugin · remote) · capability discovery mapping · egress compliance.
**Never owns:** capability semantics (`13`) · permissions (`12`) · scheduling (`11`).

1. **Adapters are interchangeable** — one provider may implement many capabilities; one capability may have many providers (DEC-004).
2. **No protocol vocabulary above this layer** — callers speak `capability.invoke`; they never see MCP tool names, ACP methods, or HTTP paths.
3. **Credentials via vault only** (CTR-013, INV-02); **egress via Guard** (INV-05).
4. **Epoch discipline:** every adapter instance has a `provider_epoch`; a restart bumps it and invalidates outstanding handles (DEC-002).
5. **Health is first-class:** degraded providers are skipped by the resolver before they fail a call.

## 2. Adapter contract (CTR-010)

```
discover() → ProviderInfo
connect() → void
health() → HealthStatus                    // ok | degraded | down
capabilities() → CapabilityDescriptor[]
execute(op: CapabilityInvocation) → CapabilityResult
shutdown() → void
events() → AsyncIterable<ProviderEvent>
```

Lifecycle: register (discover) → connect → serve → shutdown. `execute` receives an operation bound to a validated `CapabilityHandle` and is **never** called without a ticket (INV-03).

## 3. Adapter classes

| Class | Wraps | Notes |
|---|---|---|
| `native` | In-process domain runtimes (Office · Browser · Computer · Files · Code · Search · Comms) | Default, highest-trust providers; no process boundary. |
| `mcp` | External MCP servers | §4 dual-era policy; server lifecycle managed by `19`. |
| `acp` | External agents as capability executors (`code.*`, `research.*`) and as agents (`15`/`32`) | Session-based; capability mapping preserves the agent's native tools (DEC-025). |
| `http` | REST/GraphQL connectors | Auth via vault; schema validation at the adapter. |
| `cli` | Declaratively wrapped binaries | Command allowlist + arg schema; exec policy (DEC-028) applies before spawn. |
| `plugin` | In-process extensions (`31`) | Same trust rules as native after review. |
| `remote` | Remote AgentCowork instances / hosted providers | Projection semantics identical to local — no special path. |

## 4. MCP policy — `DEC-030` (verified against the 2026-07-28 spec)

**Client (we consume MCP servers):**
- Modern first: revision `2026-07-28` (stateless, context carried in `_meta`, mandatory `server/discover`); legacy fallback `2025-11-25` (`initialize`).
- Detection per transport: **stdio** probes `server/discover` (10 s cap) and falls back to `initialize`; **HTTP** classifies the `400` body to distinguish era. Era is cached per process/origin; a per-server **force-legacy** escape hatch exists.
- Implementation: `rmcp` 3.4.x (verified to carry both revisions). The sidecar's current MCP dependency is the TS SDK **v1** line (`@modelcontextprotocol/sdk`, `packages/core-search`), which does not carry `2026-07-28`; the v2 line (`@modelcontextprotocol/client`/`server` 2.1.0) does — relevant if the sidecar façade moves to TS.

**Server façade (we expose ourselves over MCP):**
- Stateless modern + `initialize` compatibility; MUST implement `server/discover`; MUST validate `Mcp-Method` / `Mcp-Name` headers.

**Non-goals:** HTTP+SSE transport · protocol sessions/resumability · sampling · roots · logging.

**Corrections on record:** HTTP+SSE has been deprecated since `2025-03-26` (~18 months; the removal clock is SEP-2596 — Final 2026-05-18 + 3 months ⇒ eligible ≈2026-08-18, not yet removed) — the earlier “≥12 months” framing was wrong. Code-phase fixes identified: the existing remote client sends no `_meta`/modern headers; `server/discover` is absent from the current façade.

**Evidence:** `ARCHIVE/v1-research/mcp-provider-verification.md` — spec changelog/versioning/transports/deprecated pages · `clone2/grok-build/crates/codegen/xai-grok-mcp/src/servers.rs:3782-3910` · `clone2/codex/codex-rs/rmcp-client/src/protocol_mode.rs:9-51` · `rmcp@3.4.1` · SEP-2596.

## 5. Registry, epochs, resolution

- `DM-013 ProviderInfo`: id · kind · version · health · capabilities ref · environments · epoch.
- Resolver inputs (`13`): capability id → candidate providers ranked by (health, environment fit, permission fit, cost, latency class).
- **Loading modes** (`eager` / `catalog` / `on-demand`) define what the model sees vs what the catalog exposes vs what resolves on demand — the semantic compression layer that keeps raw tool counts out of context.
- Health events publish on `30`; the UI provider surface reads the registry (no separate store).

**Id mapping (absorbed, A10):** registry entries carry distinct `catalog_ref` (catalog key) and `transport_ref` (runtime transport id) alongside the canonical provider id — several transports may share one catalog entry.

**Auth methods (absorbed, G4):** provider auth is a typed surface — `api` (key) · `oauth` (authorize/callback/refresh/expiry) · `well-known` — with optional prompt/validation metadata. Credentials still land in the vault (`12` §6); only the *method* is modeled here.

**Client identity & session headers (gateway class, `DEC-035`):** gateway providers may mandate (a) a client User-Agent identifying the actual client and (b) a session-affinity header per conversation (`x-opencode-session` class). Adapters inject both from the session identity (`18` §4; `11` §2). One gateway may host several wire protocols (`/v1/responses` · `/v1/chat/completions` · `/v1/messages` — the OpenCode Go shape), so a provider entry carries multiple `transport_ref`s (A10).

## 6. Execution & egress

- Adapters run inside an environment (`19`): local process · sandbox · remote. The environment is part of the handle.
- Network egress passes Guard (INV-05); local FS access is pathfloor-scoped by the environment; resource limits are declared per provider.
- Secrets: `use`-style vault references (CTR-013), never values.

## 7. Failure modes

| Failure | Behavior |
|---|---|
| Adapter crash | Epoch bump → handles invalidated → health `down` → resolver failover; work re-plans. |
| Protocol mismatch (dual-era) | Detection retries the other era once; permanent mismatch → provider marked incompatible with reason. |
| Schema drift (MCP tools changed) | `discover` diffs capabilities; removals update descriptors + emit events; calls to removed caps fail typed. |
| Schema-violating provider result | The adapter validates against the descriptor/contract schema before anything applies; malformed output is a typed failure, the provider is marked degraded, nothing partial is applied, and it is audited (EDGE-018). |
| Connect timeout | Bounded retry with backoff; provider degraded; UI never blocks (work is async). |
| Partial capability failure | Per-capability health; resolver avoids only the failing capability. |
| Unauthorized egress | Guard DENY → typed error; logged; no silent fallback. |
| Stream idle/read timeout | Watchdog aborts with a typed reason; retry per the single-owner rule (`18` §4). |
| Auth token expiry mid-turn | Typed provider error `Authentication` (`18` §4); refresh where supported; else re-auth guidance. |
| Provider-reported cost mismatch | Actual overrides estimate; audit event emitted. |

## 8. Interop

**Depends on:** `10` kernel · `12` trust · `19` environments · `30` events.
**Exposes to:** `13` (capability implementations) · `32` (protocol surfaces) · `15` (adapter-based agents).
**DAG check:** providers never call the capability resolver or agents; they only implement what the registry asked for.

## 9. Not in v1 / deferred

MCP server marketplace/auto-install · remote provider federation · per-provider billing beyond usage events · A2A transport (surface later via `32`).

## 10. Open questions (`OQ-PRV-*`)

1. Hand-rolled vs `rmcp` for the client core (confirm dual-era behavior under guard/egress constraints in the code phase).
2. Façade compatibility-window advertising (`supported` vs `preferred` revisions).
3. CLI adapter schema format + its interaction with exec-policy rules (DEC-028).
4. Provider isolation default: per-provider process vs shared runtime (`19` decides).
5. HTTP connector auth patterns for v1 (`28` decides).

## 11. Evidence

**Wave-2 addition:** `ARCHIVE/v1-research/provider-layer-absorption.md` — id-mapping, auth-method enum, and failure rows (A10, G4).

`ARCHIVE/v1-research/mcp-provider-verification.md` (all §4 citations) · `ARCHIVE/v1-research/agent-harness-verification.md` §A4 (three-layer guard), §B1 (ACP server/session/tool-registry), §D1 (handle/factory) · owner brief (adapter classes, capability ≠ provider).

## 12. Requirements (`REQ-PROV-*`)

Testable behaviors owned by this module live in `ARCH/08-REQUIREMENTS.md`; the traceability chain is in `ARCH/09-FEATURE-MATRIX.md`. This table is a pointer, not a second copy.

| REQ | Behavior (one line) |
|---|---|
| `REQ-PROV-001` | Adapters interchangeable; no protocol vocabulary above this layer (INV-15, DEC-004). |
| `REQ-PROV-002` | `ProviderAdapter` contract + lifecycle; `execute` only with validated handle and ticket (CTR-010, INV-03). |
| `REQ-PROV-003` | Declared adapter classes (native · mcp · acp · http · cli · plugin · remote); ACP preserves native tools (DEC-025). |
| `REQ-PROV-004` | MCP client dual-era: modern `2026-07-28` first, legacy `2025-11-25` fallback, detection + force-legacy hatch (DEC-030). |
| `REQ-PROV-005` | MCP server façade: stateless modern + `initialize` compatibility, mandatory `server/discover`, header validation. |
| `REQ-PROV-006` | Epoch discipline + health-first resolution; degraded skipped before a call fails (DEC-002). |
| `REQ-PROV-007` | Registry entry shape + id mapping (`catalog_ref`/`transport_ref`); auth-method enum, no values (DM-013). |
| `REQ-PROV-008` | Adapter egress + custody compliance; typed denial, no silent fallback (INV-02/05, CTR-013). |
| `REQ-PROV-009` | Gateway client identity + session affinity headers per conversation; multi-protocol gateways (DEC-035). |
| `REQ-PROV-010` | Provider failures typed and bounded: epoch-bump failover, one era retry, descriptor diff, audit on cost mismatch. |
