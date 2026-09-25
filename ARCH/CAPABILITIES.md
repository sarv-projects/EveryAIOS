# ARCH/CAPABILITIES — capability packs, tools, actions, skills, viewers

> **Status:** Subsystem contract, derived from [`CORE.md`](CORE.md) §9. Owns how capability is packaged,
> enabled, exposed and consumed. Invariants it must not weaken: **I4, I12, I16, I26**.
>
> **Projection/lease amendment (2026-09-24):** [`ADR/0008`](ADR/0008-session-workbench-projection-and-resource-leases.md)
> limits a capability pack to typed handles, resource descriptors, viewers, and safe projections. Packs cannot
> own SessionWorkbench state, resource leases/fences, Work/Run execution, retries, or audit.

---

## 1. The three-way distinction (inherited, restated only as a pointer)

**Capability** = what the system can do. **Tool** = how a model asks for it. **Executor** = who performs it.
CORE §3.1 defines this; it is repeated here only because every mistake in this document is a variant of
collapsing them.

---

## 2. The shared plane is a capability platform

The mistake this document exists to prevent: treating the shared plane as a fixed list
(browser + office + memory + …) so that every new feature means touching every agent integration.

```
SHARED PLANE
└── Capability Runtime
    ├── Capability Packs          browser · office · desktop · search · memory · codeintel · connectors …
    ├── Skills                    procedural knowledge (portable format)
    └── Resources                 large data, addressed not inlined
```

> **Invariant I26: adding a capability must never require modifying an agent integration.**

If tomorrow brings OCR, a CAD viewer, a 3D renderer, a database client or a transcription pack, the
answer is **a new pack** — not `ClaudeBrowserIntegration`, `CodexBrowserIntegration`,
`OpenCodeBrowserIntegration`. That shape is \"architectural death by a thousand adapters\": growth becomes
`N agents × M capabilities` instead of `N agents + M packs`.

---

## 3. The pack

```
capability-pack/
├── manifest.yaml
├── capabilities/      what the system can do
├── skills/            procedural knowledge
├── resources/         large data
├── viewers/           how humans inspect resources
└── scripts/ · assets/
```

```yaml
id: everyaios.office
version: 1.0
provides:
  capabilities: [office.open, office.inspect, office.edit, office.calculate, office.render, office.verify]
  skills: [office-editing, spreadsheet-analysis]
  viewers: [docx, xlsx, pptx, pdf]
requires:   [workspace]
optional:   [codeintel]
permissions: [filesystem.read, filesystem.write]
settings:
  enabled_by_default: false
```

`requires` vs `optional` is what makes **graceful degradation** possible: a research skill that `requires`
search and merely `optional`s browser still works with the browser pack disabled (search-only mode) instead
of failing.

---

## 4. The effective set

The runtime resolves, never the agent:

```
effective = Core ∪ EnabledPacks ∩ AgentSupported ∩ SessionAllowed ∩ WorkScope ∩ GuardPolicy
```

Because this is an intersection, **an agent that supports less simply receives less** — with no adapter
change and no special case. An agent reporting `MCP ✅ · resources ✅ · prompts ❌` gets MCP tools and
resources, no prompt templates, and no error.

The local-runtime surface is the `shared:local-runtime` capability pack. Its actions are **inventory · acquire · attach · hand-off**; the effective set is the §4 intersection with the bound agent's `RuntimeControl`, and it never exposes model selection for a `NativeOnly` agent. See [`16-LOCAL-RUNTIME-INTEROP.md`](16-LOCAL-RUNTIME-INTEROP.md) §3.

---

## 5. States and scopes

**Four states:** `Unavailable` (platform/runtime dependency missing) · `Disabled` · `Enabled` (activatable)
· `Active` (mounted for this session/Work).

**Three scopes:** Global · Space · Session. More specific wins, narrowing only.

> **Disabled must mean actually disabled:** no tools, no skill inventory, no server, no processes, no
> context contribution, no tokens. A "hidden but running" pack is a second source of truth about whether a
> capability is active (I4), and it wastes the user's memory and battery.

Four states rather than a boolean exists because "off" and "cannot work here" are different facts, and a
toggle that renders both identically teaches the user to distrust the toggle.

---

## 6. Skills, actions, tools

| Thing | Meaning | Loaded |
|---|---|---|
| **Tool** | the invocation surface for one capability | when relevant |
| **Action** | a deterministic higher-level operation that collapses many round trips | when invoked |
| **Skill** | procedural knowledge — *how* to do a class of tasks | **progressively** |

### 6.1 Skills are not tools

A skill is not a callable. It is instructions, references and scripts that explain how to use capabilities
well. It uses the **portable open `SKILL.md` + `references/` + `scripts/` + `assets/` format** — there is no
EveryAIOS-proprietary skill concept. A skill produced here should be usable by another compatible system,
and vice versa.

Skills **declare dependencies** so resolution happens before loading:

```yaml
id: research-company
requires:  capabilities: [search.query]
optional:  capabilities: [browser.research, memory.remember]
outputs:   [report, citations]
```

If a required pack is disabled, the pack explains what is missing rather than loading a broken skill.

### 6.2 Progressive disclosure

Never inject every skill or every tool schema. The model sees a **small inventory**, task-relevant packs are
selected, and only relevant capabilities are mounted. Loading 100 skill descriptions and 80 tool schemas on
every turn recreates context-window failure by another route.

### 6.3 Actions are where tokens are saved

```
snapshot → click → wait → snapshot → read → click → wait → read      (the model narrating a loop)
```

becomes

```
browser.extract_table                                                (one action, deterministic inside)
```

This is "structure instead of narrate" applied to tool use: a deterministic action replaces a token-priced
conversation about doing the thing.

---

## 7. Stable façades, asynchronous backends

The provider-visible schema set must be **stable**, while the implementation behind it may be slow to start.

```
capability manifest / cache → stable tool façade → session starts immediately
                                    ↓
                          real backend initializes asynchronously
                                    ↓
                          façade forwards once ready
```

The same rule that is obvious for external MCP servers applies to browser, office, desktop, connectors,
search, codeintel and the built-in runtime: **the agent sees a stable façade; the implementation may load,
start or handshake underneath it.** This is where a large part of the perceived speed comes from, and it is
free — it costs nothing but discipline about not mutating the provider-visible surface mid-session.

Related: a cached third-party schema is registered as a **stable placeholder** for the session. If the live
server reports a different schema, the fresh schema becomes available to the **next** session rather than
mutating the running prefix. Fast startup and cache stability, both, without a lie.

---

## 8. Capability availability is a four-way state, not a boolean

```
Capability available  ≠  capability process active  ≠  tool schema mounted  ≠  call currently executable
```

A pack can be enabled and its tool mounted while its backend has not started; the call starts it on demand.
Conflating these is what produces either eager-process bloat or "enabled but mysteriously refuses".

---

## 9. Viewers are part of the pack

A viewer is *how a human inspects a resource* — not a model capability, and not a separate subsystem. Packs
contribute viewers, so the File Workbench's viewer registry is populated by the same manifest that supplies
capabilities. See [UI.md](UI.md) §4.

---

## 10. No pack owns execution state

> **A capability pack declares capabilities. It does not invent work.**

There is no `BrowserWork`, `OfficeWork`, `MemoryWork` or `SearchRuntime`. Every side effect returns to the
single path: `Work → Step → Effect → Guard → Executor → Receipt → Event`. A pack that acquires its own
progress state, its own retry loop, or its own audit trail has become a runtime and will be rejected in
review (I4, I12).

### 10.1 Typed handles and the projection boundary

A capability pack may contribute a typed `ResourceRef` shape, a capability/viewer descriptor, a bounded
read-only projection, or a safe availability/generation result. Those are adapters into the shared plane. They
are not a place to keep `SessionWorkbenchProjection`/`LensState`, acquire or release a `ResourceLease`, decide
Guard policy, execute a Work/Run, retry an effect, or write an audit/Receipt.

The ownership path remains:

```text
capability pack → typed handle/projection → ToolService + Work/Run → Guard → shared engine
                                      ↘ resource lease/fence (Work/Run owner)
```

The pack's manifest may declare required permissions and resource identity requirements, but the effective
set still intersects Session/Work scope and Guard policy (§4). A pack that needs its own state machine,
resource owner, retry loop, or receipt store is a runtime and is rejected under §10. The full projection/lease
contention and edge-case rules are normative in [`ADR/0008`](ADR/0008-session-workbench-projection-and-resource-leases.md)
§2–§6; no Channel B or pack implementation is claimed by this amendment.

---

## 11. Invariants this document must not weaken

| Invariant | How |
|---|---|
| I4 — one owner per state | §5 (actually-disabled), §10 (no pack-owned work) |
| I12 — one authorization model | §4's `GuardPolicy` intersection; §10's single path |
| I16 — prefix stability | §7's stable façades and placeholder schemas |
| I26 — new capability ⇒ no agent change | §2, §4 |
| I17/I18 — bounded view, retrievable content | §9 via resources and viewers |

---

## 12. Migration notes

The existing type-level extension bundle concept and the per-agent tool-scoping work are the ancestors of
this contract; packs generalize them. The consolidation rows that remove duplicate tool registries and
duplicate capability definitions are `P69.D2`, `P69.D18` and `P69.B7`.
