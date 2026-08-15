# 64 — Giants Code-Level Deep-Dive (rustdesk · ladybird · serenity · brave · chromium + lightpanda re-read)

> **Pass:** 2026-08-15 — the five repos previously only web-level checked are now **cloned + source-read at code level** (per user directive "deep-dive the remaining web-level repos to code level and extract steal candidates"):
> - **rustdesk** (`rustdesk/rustdesk`, full clone, 26 MB) — NAT traversal + rendezvous + relay
> - **ladybird** (`LadybirdBrowser/ladybird`, full clone, 294 MB) — process model + layered sandbox + .ipc DSL + process-per-navigation
> - **serenity** (`SerenityOS/serenity`, blobless sparse: LibWeb/LibIPC/LibCore/Kernel/WebContent/WebWorker, 34 MB) — pledge/unveil + typed IPC
> - **brave-core** (`brave/brave-core`, blobless sparse: brave_shields/adblock rs, 17 MB) — adblock-rust engine + shields provider model
> - **chromium** (`chromium/chromium`, blobless sparse: content/zygote/sandbox/network/a11y, 113 MB) — sandbox bitmask + syscall-broker + seccomp policies + AX tree snapshot
> - **lightpanda** (already cloned as `browser/`) — re-read for MCP server + CDP WebMCP domain + SemanticTree/interactive classification
>
> **Doctrine (unchanged):** steal = reimplement in our own stack (Rust for crates, TS for coordinator) with source-pattern credit; never vendor/copy code. **Ledger: unchanged at 255 repos** (all six already tracked — this pass upgrades depth tags to code-level, no new entries).
> **Cross-refs:** doc 63 §0 (verdicts were: chromium/ladybird/serenity/brave CONFIRMED web-level, rustdesk REF P11.5+, lightpanda CONFIRMED E1) · SPEC rows · ARCH/02 (module layout) · ARCH/06 §6.15 (network containment) · ARCH/09 (matrix) · TODO P2/P7 phases.

---

## 0. What this pass changes vs doc 63

| Repo | doc 63 said | doc 64 (code-verified) | Verdict delta |
|---|---|---|---|
| chromium | web-level CONFIRMED ("we're a driver, not an engine") | sandbox bitmask + syscall-broker + seccomp arg-filtering + AX snapshot combiner — **all directly stealable patterns for everyaios-guard / everyaios-cdp** | ✅ confirmed + **2 concrete steals** |
| ladybird | web-level CONFIRMED (WebContent split) | 6-process model + **Landlock+seccomp layered sandbox** + .ipc DSL + process-per-navigation | ✅ confirmed + **3 concrete steals** |
| serenity | web-level CONFIRMED (WebContent split) | pledge/unveil capability strings + typed IPC endpoint magic | ✅ confirmed + **1 concrete steal** (IPC DSL lineage) |
| brave | web-level (Chromium fork + Rust adblock) | **`adblock` crate v0.13.0 (brave/adblock-rust) is a real crates.io dep** — MIT, directly usable | ⬆️ upgrade: **direct crate dependency candidate** (not just pattern) |
| rustdesk | REF (P11.5+, out of scope) | NAT-type probe (2-port same-local-addr), UDP/TCP hole-punch, relay fallback, KCP — full algorithm | ✅ REF confirmed; steal-spec written for the P11.5+ candidate |
| lightpanda | CONFIRMED E1 | MCP server (136 tools, 4 protocol versions, Cancelled/Timeout error codes), CDP WebMCP domain, SemanticTree role taxonomy + 5-step interactivity classifier | ✅ confirmed + **3 concrete steals for E16/E-catalog** |

---

## 1. rustdesk — NAT traversal / rendezvous / relay (code-verified)

**Files read:** `src/rendezvous_mediator.rs` (handle_punch_hole / punch_udp_hole / create_relay / start_ipv6 / udp_nat_listen), `src/common.rs` (test_nat_type / test_nat_type_), `src/server.rs` (create_relay_connection).

### 1.1 NAT-type probe (the core trick)
`test_nat_type_()` opens **two TCP connections to two rendezvous-server ports** (`server1`, `server2 = increase_port(server1, -1)`) **reusing the same local addr** (`connect_tcp_local(server, local_addr, …)` — the local socket is bound once, then both connections reuse it). The server echoes back the **observed source port** per connection. Decision:
- `port1 == port2` → `NatType::ASYMMETRIC` (full-cone / address-restricted behavior — the mapping is stable)
- `port1 != port2` → `NatType::SYMMETRIC` (each connection got a new mapping)
- Reuses the same local-ip for the whole session (`Config::set_option("local-ip-addr")`).
- Runs on a background thread once at startup, exponential backoff (1→3→7→…→300 s) until success or user-set override; **never blocks startup**.

### 1.2 Hole punching
- **UDP:** `punch_udp_hole` sends `PunchHoleSent` once, then spawns a task that re-sends it **2 more times with randomized 10–20 ms jitter** (`time_based_rand() % 20 + 10` ms); then `udp_nat_listen` **connects** the socket to the peer and hands it to **KCP** (`kcp_stream::KcpStream::accept` — lossy UDP transport with reliability on top).
- **TCP:** `connect_tcp` to the rendezvous server first (learns local addr), then `connect_tcp_local(peer_addr, Some(local_addr))` **reusing that local addr** — the key comment: *"it can not be async here, because local_addr can not be reused, we must close the connection before use it again"*.
- **Duplicate suppression:** `LAST_MSG` — identical punch-hole within 100 ms is dropped.
- **Relay fallback** (any of): peer NAT is SYMMETRIC, local config is SYMMETRIC, WebSocket/proxy mode, `ph.force_relay`, or TCP-listen disabled + no UDP port → `create_relay` with a fresh `Uuid` to the relay server (default port via `check_port(relay_server, RELAY_PORT)`).
- **IPv6 first:** if peer's v6 addr has a port, `start_ipv6` is attempted before v4.

### 1.3 Key-exchange / identity
- `register_pk` — device registers its **public key + uuid + id** with the rendezvous server; retry throttled while awaiting deployment (`DEPLOY_RETRY_INTERVAL`), `SENT_REGISTER_PK` flag.
- `CheckIfResendPk` (RAII guard) — if the local key-pair changed between registration attempts (e.g. root overwrote config), sets `key_confirmed = false` so the new pk re-registers.

### STEAL-SPEC (P11.5+ remote-assist candidate — NOT in current scope, doc 63 §5)
If/when remote-assist lands:
1. **NAT-type probe** — 2-port same-local-addr TCP probe, compare observed ports → asymmetric/symmetric; background thread + backoff. (Reuses our existing `everyaios-core` network stack; no new deps.)
2. **UDP hole-punch w/ 3× jittered retransmits + KCP** — kcp crate is small and MIT; but for a desktop product the **TCP reuse-local-addr** punch + relay fallback matters more (most corp NATs are symmetric).
3. **Relay design** — rendezvous server picks relay, both sides connect, UUID-multiplexed. Our relay would be a **self-hosted optional** component (user directive: local-first; no cloud dependency).
4. **RAII pk-change detection** — our `everyaios-vault` key rotation can reuse the `CheckIfResendPk` pattern to re-register after rotation.
- **Row mapping:** P11.5+ (new, deferred) — no matrix row added this pass.

---

## 2. ladybird — process model + layered sandbox + IPC DSL (code-verified)

**Files read:** `Services/{WebContent,Compositor,WebDriver,RequestServer,ImageDecoder,WebWorker}/*`, `Services/RendererSandboxLinux.cpp`, `Libraries/LibSandbox/Seccomp.cpp`, `Services/WebContent/WebContentClient.ipc`, `Documentation/ProcessArchitecture.md`.

### 2.1 Process model (6 processes)
- **Browser** (UI, unsandboxed) → per-tab **WebContent** (LibWeb+LibJS, paints to shared bitmaps) → per-WebContent **RequestServer** (all network) → fresh **ImageDecoder** per image (maximally sandboxed) → **Compositor** (backing-store mgmt, WebGL object map, VSyncScheduler) → **WebDriver** (test/automation sessions) → **WebWorker**.
- **Process-per-navigation** (cross-process navigable): `decide_navigation_process(page_id, frame_id, current_url, target_url, target)` → `NavigationProcessDecision`; then `did_request_new_process_for_navigation` with `CrossProcessId` frame ids + `ReplicatedNavigableState` (the state that lets the new process take over a tab mid-navigation). Child frames can also move processes (`did_request_new_process_for_child_frame_navigation`, `did_create_child_frame`, `did_commit_child_frame_navigation`).
- Spawn via **SystemServer portal socket** (`/tmp/session/%sid/portal/webcontent`) — one fresh WebContent per connection (service-per-connection pattern).

### 2.2 Layered sandbox (Linux) — the steal
`RendererSandboxLinux.cpp::apply_sandbox` — **three layers composed**:
1. `Sandbox::install_no_new_privileges()` (PR_SET_NO_NEW_PRIVS — blocks setuid escalation).
2. **Landlock** (`restrict_filesystem_with_landlock`): explicit path allowlist with per-path access (`ReadOnly`, `ReadAndExecute`, `ReadWrite`) — resource root, config, executable + build libs, `/proc/self`, font dirs, cranelift-compiler, pulse runtime (rw). Paths added only **if they exist** (`add_landlock_path_if_exists`).
3. **seccomp-bpf policy groups** (`Libraries/LibSandbox/Seccomp.cpp`): `allow_readonly_file_opens` / `allow_filesystem_metadata_queries` / `allow_filesystem_writes` / `allow_file_descriptor_operations` / `allow_process_creation` / `allow_ipc` / `allow_common_runtime` / `allow_executable_memory_mappings` — composed per-service; `SeccompPolicy` is a builder (append_architecture_check / append_load_syscall_number / append_kill / deny_readonly_filesystem_probes).
- Compositor sandbox is **tighter**: read-only Landlock (fonts + system libs) — no filesystem writes at all.

### 2.3 IPC: `.ipc` DSL → generated typed endpoints
`WebContentClient.ipc` / `WebContentServer.ipc` declare the whole surface (≈80+ messages): `did_start_loading(u64 page_id, URL url, bool is_redirect) =|` (async fire-and-forget) vs `allocate_compositor_context_id(...) => (CompositorContextId)` (sync request/response). Message bodies are typed (URL, Cookie, Selector, ShareableBitmap, …). The codegen produces `ConnectionFromClient`/`WebContentClient` with per-message handlers — the same pattern serenity shares (see §3).

### STEAL-SPEC
1. **Landlock-first path allowlisting** (guard layer under our path-floor): compose `no_new_privs` + Landlock allowlist + seccomp groups. Linux-only (Landlock ≥ 5.13); macOS/Windows get the analogous App Sandbox / restricted tokens. → **everyaios-guard `sandbox.rs`** (new module, P7 harness wiring): `SandboxProfile::Renderer` (read-only fs), `SandboxProfile::Worker` (rw scratch), `SandboxProfile::Network` (no fs). This is the **code-level form** of ARCH/06 §6.15 (network containment) + our F11 row.
2. **Process-per-navigation decision API** — our browser layer (E10 tiered engines) doesn't need cross-process navigables, but the **decision function shape** (`decide(prev_url, target_url, target) → decision`) is exactly the shape for our **challenge-handler / site-trust escalation** (E12): decide before navigating whether this site gets full engine, lightweight engine, or read-only fetch. → E12 extension note.
3. **`.ipc` DSL lineage** — we already have `everyaios-ipc` (framing handshake mirrors ACP initialize, doc 45). The sync `=>` / async `=|` message grammar + per-endpoint `static_magic()` is a clean reference for tightening our IPC surface if we grow many endpoints. → ARCH/02 note only (no new row).

---

## 3. serenity — pledge/unveil + typed IPC (code-verified)

**Files read:** `Userland/Services/WebContent/main.cpp`, `Userland/Services/WebContent/WebContentClient.ipc`, `Userland/Libraries/LibIPC/Connection.h`, `Userland/Libraries/LibIPC/{SingleServer,MultiServer}.h`.

### 3.1 pledge/unveil (capability strings + path sealing)
`WebContent/main.cpp`:
- `pledge("stdio recvfd sendfd accept unix rpath thread proc map_fixed")` — a **comma-string of capability groups** (rpath = read-only fs access, proc = process control, map_fixed = mmap) — the process *starts* with a closed capability set and never grows it.
- `unveil(path, perms)` per path (`/res` r, `/etc/timezone` r, `/usr/lib` r, audio/request/image portals rw), then **`unveil(nullptr, nullptr)` seals the veil** — no further paths can be added. Any access outside the unveiled tree fails.
- WebDriver socket unveiled first (must check existence pre-seal).

### 3.2 Typed IPC (the template engine)
`Connection<LocalEndpoint, PeerEndpoint>`:
- Each endpoint has `static_magic()` (u32) + each message `static_message_id()`; frames carry magic so `try_parse_message` can decode **either** local or peer encoding.
- `send_sync<RequestType>(args...)` posts with `MessageKind::Sync` then blocks on the matching `ResponseType`; `send_sync_but_allow_failure` for optional responses.
- **FD passing** (`Queue<IPC::File>`) — file descriptors travel with messages (shared bitmaps, sockets) — no copying.
- `MultiServer` / `SingleServer` — accept loop pattern for service-per-connection.

### STEAL-SPEC
1. **Capability-string + path-seal doctrine** for our **script-eval sandbox (E4/rquickjs)** and **connector workers**: start with `pledge`-equivalent caps (our Rust side: rlimit + seccomp profile groups from §2.2), `unveil`-equivalent path allowlist (our `everyaios-guard::pathfloor` canonicalized allowlist), then **seal** (no runtime path additions). This is the OS-level enforcement under our policy layer (J21). → everyaios-guard `sandbox.rs` (same module as §2.2 steal).
2. **Magic-prefixed dual-decode IPC** — our `everyaios-ipc` handshake already does ACP-style capability negotiation; the per-message magic lets us version-decode. Note only.

---

## 4. brave-core — adblock-rust engine + shields provider model (code-verified)

**Files read:** `components/brave_shields/core/common/adblock/rs/{lib.rs,engine.rs,Cargo.toml,README.md}`, shields tree (`ad_block_*_filters_provider.*`, `brave_shields_util.*`).

### 4.1 The engine is a real, usable crate
`Cargo.toml`: `adblock = { version = "0.13.0", default-features = false, features = ["full-regex-handling", "debug-info", "css-validation"] }` — i.e. **brave/adblock-rust (MIT) is a crates.io dependency**, wrapped in a cxx FFI (`adblock_rust_ffi`) for C++ consumption. The FFI surface (`engine.rs`):
- `FilterSet` → `new_filter_set(debug)`, `add_filter_list(&[u8])`, `add_filter_list_with_permissions(rules, permission_mask)`.
- `Engine` → `engine_with_rules`, `engine_from_filter_set`, `set_domain_resolver` (hostname→eTLD+1 resolver injected from the embedder), `read_list_metadata`, `convert_rules_to_content_blocking` (iOS content-blocking JSON), `serialize`/`deserialize` (compiled engine cache), `use_resource_storage`.
- **`matches(url, hostname, initiator_hostname, request_type, third_party_request, method, previously_matched_rule, force_check_exceptions) → BlockerResult`** — the core decision: returns whether blocked + matching rule + actions.
- **`get_csp_directives(url, source_hostname, request_type)`** — returns additional CSP (e.g. `script-src` from `$csp` filters) to inject into the response.
- Cosmetic filtering: `url_cosmetic_resources(url)` + `hidden_class_id_selectors` (element-hiding CSS classes/ids).
- Regex manager: `set_regex_discard_policy(RegexManagerDiscardPolicy)`, `discard_regex(id)` — LRU-style budget for expensive regex filters (the "full-regex-handling" feature).
- `get_debug_info` — per-rule match traces for the `brave://adblock` internals UI.

### 4.2 Shields provider model (C++ side)
- `AdBlockFiltersProvider` base + `AdBlockComponentFiltersProvider` (bundled/updated lists) + `AdBlockCustomFiltersProvider` (user rules) + `AdBlockSubscriptionFiltersProvider` (user subscriptions) + `AdBlockLocalhostFiltersProvider`; all feed a `FiltersProviderManager` that rebuilds the FilterSet on change.
- `AdBlockEngine::ShouldStartRequest` + `brave_shields_util` — per-site shields on/off + domain pattern allowlist.

### STEAL-SPEC (direct dependency — the one "crate, not pattern" steal of this pass)
1. **Add `adblock` (brave/adblock-rust, MIT, crates.io) as a dependency** of a new `everyaios-content` module (or fold into `everyaios-browser`) for a **page-cleanup / ad-and-tracker-stripping tool**: `FilterSet` from bundled + user lists, `matches()` for request blocking, `hidden_class_id_selectors` + `url_cosmetic_resources` for DOM cleanup before snapshot/read, `get_csp_directives` for response hardening. No need for cxx FFI — we're Rust-native.
   - **But note licensing/focus:** our product is a *desktop agent*, not an ad-blocker browser; the steal is scoped to **"read cleaner"** (strip ads/trackers/consent walls before `read`/`snapshot`/markdown-export) and **domain/network filtering** (blocklist for the F11 containment layer). It also validates our own `everyaios-guard::blocklist` regex approach for the *shell/command* domain (different regexes, same pattern taxonomy).
2. **Provider composition model** — `FiltersProviderManager` (component/custom/subscription providers → one merged FilterSet, rebuild-on-change) maps to our **config-store composition** (built-in defaults + user rules + BYOK-sourced lists with versioning). → I6/extension note.
- **Row mapping:** new **G9 "read-cleaner / content filter"** candidate under G-series (search/read tooling) — or fold into G8 cascade as a pre-read transform. **Propose matrix row G9** (doc-64 addition, mirrors doc 52's G8 pattern of adding a row with clear scope).

---

## 5. chromium — sandbox bitmask + syscall-broker + seccomp arg-filtering + AX snapshot (code-verified)

**Files read:** `sandbox/policy/linux/sandbox_linux.h` (Status bitmask), `content/zygote/zygote_linux.{h,cc}` (sandbox_flags over fd, SUID/NS pre-check), `sandbox/linux/seccomp-bpf-helpers/{baseline_policy,syscall_sets}.h`, `sandbox/linux/syscall_broker/{broker_process,broker_file_permission,broker_host,broker_client}.h`, `sandbox/policy/linux/bpf_network_policy_linux.cc`, `ui/accessibility/{ax_node_data,ax_tree,ax_enums.mojom}.h`, `third_party/blink/renderer/modules/accessibility/ax_object.h`, `content/browser/accessibility/accessibility_tree_snapshot_combiner.h`.

### 5.1 Sandbox Status bitmask (the composition model)
`SandboxLinux::Status`: `kSUID(1<<0) | kPIDNS(1<<1) | kNetNS(1<<2) | kSeccompBPF(1<<3) | kYama(1<<4) | kSeccompTSYNC(1<<5) | kUserNS(1<<6)`. `Options`: `engage_namespace_sandbox` (when no zygote), `allow_threads_during_sandbox_init` → TSYNC (sync the seccomp policy to all threads).
- **Zygote** (`zygote_linux.cc`): the zygote fork()s children, passes `sandbox_flags_` over a **socketpair fd** to the child, and the child applies the sandbox before exec. SUID/NS sandbox decided *before* spawning; seccomp applied in the child post-fork.

### 5.2 syscall-broker (filesystem mediation) — the headline steal
`sandbox/linux/syscall_broker/`:
- `BrokerFilePermission` — path grants with **six orthogonal axes**: `RecursionOption{kNonRecursive,kRecursive}` · `PersistenceOption{kPermanent,kTemporaryOnly}` · `ReadPermission{kBlockRead,kAllowRead}` · `WritePermission{kBlockWrite,kAllowWrite}` · `CreatePermission{kBlockCreate,kAllowCreate}` · `StatWithIntermediatesPermission`. Factories: `ReadOnly(path)`, `ReadOnlyRecursive(path)`, `ReadWriteCreate(path)`, `ReadWriteCreateTemporaryRecursive(path)`.
- `BrokerProcess` (host side) — owns the allowlist; **`CheckOpen`/`CheckAccess` are async-signal-safe** (usable from the seccomp trap handler). `BrokerHost`/`BrokerClient` — the sandboxed process sends `openat`/`stat`/`access`/`inotify` syscalls to the broker over an IPC channel; the broker validates against the allowlist and returns the fd/result. Policy file access is *denied in-sandbox* (EPERM/EACCES → the trap reroutes to the broker).
- `broker_command.h` — the command enum (open/access/stat/mkdir/unlink/…) + `BrokerSimpleMessage` framing.
- Per-service policies compose: `bpf_broker_policy_linux.cc` (only the broker syscalls allowed), `bpf_base_policy_linux.cc`, `bpf_cdm_policy_linux.cc`.

### 5.3 seccomp arg-filtering (network service example)
`bpf_network_policy_linux.cc`:
- `RestrictIoctlForNetworkService` — `Switch(request).Case(F2FS_IOC_GET_FEATURES, Error(EPERM)).Cases({SIOCETHTOOL, SIOCGIWNAME, SIOCGIFNAME}, Allow()).Case(SIOCGIFINDEX, Allow()).Default(RestrictIoctl())`.
- `RestrictGetSockoptForNetworkService` — **nested arg filtering**: `Switch(level).Case(SOL_SOCKET, socket_optname_switch).Case(SOL_IPV6, …).Case(SOL_TCP, …).Case(SOL_IP, …).Default(CrashSIGSYSSockopt())`; each optname switch allows only the specific options needed (SO_ERROR, TCP_INFO, IP_TOS, …).
- **Default = `CrashSIGSYS()`** — policy violations crash the process (SIGSYS) rather than silently failing, so regressions are loud and testable (vs EPERM which code may swallow).

### 5.4 AX tree snapshot (a11y)
- `ax_enums.mojom` — **634 roles**; the AXObject hierarchy in Blink: `DetermineRawAriaRoleWithContext`, `ComputeIsIgnored(IgnoredReasons*)`, `IsIgnoredButIncludedInTree`, `RoleValue() == kRootWebArea`, control-type helpers (button/link/textfield by role).
- `AXNodeData` — `SetNameChecked`/`SetNameExplicitlyEmpty`/`SetDescription` (with DCHECKs distinguishing empty vs explicit-empty — a correctness nuance for name computation).
- `AXTree::Unserialize(const AXTreeUpdate&)` — **incremental tree updates**; `AXTreeUpdate` = node id + role + state + name + child ids (the delta, not the whole tree).
- `AccessibilityTreeSnapshotCombiner` (browser side) — collects per-frame `AXTreeUpdate`s (from the renderer) and **combines them into a single one-off snapshot** (`AXTreeCombiner::Combine`) with a RefCounted lifetime → matches CDP `Accessibility.getFullAXTree` including OOPIF frames.

### STEAL-SPEC
1. **Permission-axes model → our path-floor** (upgrade `everyaios-guard::pathfloor`): adopt the **six-axis grant** (recursive / temporary / read / write / create / stat-intermediates) instead of the current flat allow/deny. This gives us "read-only recursive under X, but no create" semantics the J21 permissions.toml needs (e.g. `multi_file_edit` policies). → **P7.5 path-floor upgrade** (small, pure-Rust, test-gated).
2. **Broker pattern for the script-eval sandbox (E4)** — instead of "sandbox denies all FS syscalls" (which breaks useful scripts), mediate FS through a **broker with an allowlist**: rquickjs worker asks the Rust side for `open_at(path)`; the broker checks the canonicalized allowlist (our pathfloor) and returns a validated handle. Async-signal-safe CheckOpen not needed (we're not in a seccomp trap — we're in-process broker), but the **host/client split + command enum + simple-message framing** map directly onto our existing `everyaios-ipc`. → **E4 upgrade**.
3. **Arg-filtered seccomp policies** — our `everyaios-guard::sandbox` (from §2.2) should generate **arg-filtered** policies (Switch on arg 1/2 with per-value Cases), not just flat syscall sets — the network policy (level/optname nested switch) is the reference for a "network worker" profile. And **default to crash-on-violation** (SIGSYS) in dev builds so violations surface in tests.
4. **AXTreeUpdate delta + snapshot combiner** — our `everyaios-browser` diff (URL-change short-circuit + line-diff) could adopt the **node-id-keyed delta model**: snapshot = `Vec<AXNodeDelta{id, role, name, state, parent_id, children}>`, diff = set of changed node ids. The combiner pattern (per-frame updates → one snapshot) is exactly our **iframe stitching** (`capture.rs`) — we already do this; this validates the design and adds the "explicit-empty name" nuance. → **E16/slim + diff note**.
5. **Zygote-for-kids** — our ProcessSupervisor spawn path (E10 tiers) can pre-fork a lightweight **worker pool** (Bun-compiled sidecar + sandboxed workers) to cut cold-start — the zygote's "fork then sandbox in child, flags over fd" is the reference for our `everyaios-core` process supervisor. → J13/warm-pool note (doc 43 already flags warm pool).

---

## 6. lightpanda re-read (already cloned) — MCP server + CDP WebMCP + SemanticTree

**Files read:** `src/mcp/{protocol,Server,HttpServer,Transport,router,tools,resources}.zig`, `src/cdp/domains/{accessibility,webmcp}.zig`, `src/SemanticTree.zig`, `src/browser/interactive.zig`, `src/network/{RobotsGate,Robots,SingleFlight,IpFilter,UrlBlocklist,WebBotAuth}.zig`, `src/{Watchdog,cookies}.zig`.

### 6.1 MCP server (in-browser, agent-facing)
- **Protocol version negotiation** — `Version` enum: 2024-11-05 → 2025-03-26 → 2025-06-18 → 2025-11-25, default oldest; mirrors MCP spec versioning (doc 61 MRTR/ttlMs).
- **Error taxonomy** beyond spec: `FrameNotLoaded(-32604)`, `NotFound(-32605)`, **`Cancelled(-32001)`** (aborted by caller — SIGINT/session shutdown; distinct so clients don't retry loops), **`Timeout(-32002)`** (tool exceeded deadline — tool-state outcome, not caller signal). **This Cancelled-vs-Timeout distinction is a steal** for our `everyaios-mcp` tool registry.
- **136 tools** in `tools.zig`; session model with `enableIsolateParking`/`enterIsolate`/`exitIsolate` (VM isolate parking for idle sessions — token/RAM economy).

### 6.2 CDP WebMCP domain (E16 reference)
`cdp/domains/webmcp.zig` — `enable/disable/invokeTool/cancelInvocation`; `Invocation{id, bc, frame_id, name, canceled}`; async tool invocation **with cancellation** — a first-class "cancel a running page tool" primitive. Our `webmcp.rs`/`webmcp_http.rs` landed the handshake + HTTP transport; **cancellation is the missing piece** → E16 follow-on.

### 6.3 SemanticTree + interactivity classification (a11y)
- `SemanticTree.zig` — JSON + text serializers, role field, **structural vs interactive vs content role split** (`isStructuralRole` 20+, `isInteractiveRole` 18: button/checkbox/combobox/iframe/link/listbox/menuitem/option/radio/searchbox/slider/spinbutton/switch/tab/textbox/treeitem…; `isContentRole` 10: article/cell/columnheader/gridcell/heading/listitem/main/navigation/region/rowheader), leaf-semantic roles (link/button/heading/code), StaticText handling, parent-aware suppression.
- `interactive.zig` — **5-step interactivity detection** (`classifyElement`): (1) native tag (button/summary/details/select/textarea/anchor-with-href/input-not-hidden), (2) ARIA role, (3) `contenteditable`, (4) **event listeners** (`addEventListener` or inline handlers on the element — via `listener_targets` map), (5) explicit `tabindex ≥ 0`. **Step 4 (event-listener detection) is the improvement over Chrome's role-based heuristic** — elements that are clickable only via JS (SPA divs with onClick) get caught. → **our `tree.rs` interactivity classifier upgrade** (E16/slim: "keep actionables" currently role-based; add listener-based detection where CDP exposes it).

### 6.4 Network hygiene primitives
- `RobotsGate` — robots.txt gate in the request pipeline: allow/deny/pending, **single-flight coalescing** of concurrent robots.txt fetches, parked transfers resume on resolution.
- `SingleFlight` — per-key in-flight dedup with waiter list (a general primitive).
- `IpFilter` — CIDR allowlist + `block_private` (SSRF defense).
- `UrlBlocklist` — wildcard patterns, lowercase-normalized, empty-pattern-safe.
- `WebBotAuth` — TLS-client-auth for the bot (mutual TLS between bot and site).
- `Watchdog` — per-entry heartbeats with touch/disarm/enterWait (hang detection).
- `cookies` — session jar load/save to file.

### STEAL-SPEC
1. **Cancelled vs Timeout tool error codes** → `everyaios-mcp` tool-result taxonomy (aligns with our eval status taxonomy: blocked-correctly vs failed — same distinction, tool-level). → E16/MCP follow-on.
2. **5-step interactivity (event-listener step)** → `everyaios-browser::tree` slim mode upgrade. → E16 follow-on.
3. **SingleFlight + RobotsGate** → generic dedup primitive for `everyaios-core` (parallel tool calls hitting the same URL/robots) → F11/G8 note.

---

## 7. Steal inventory (master list for the build)

| # | Steal | Source (file) | Lands in | Type |
|---|---|---|---|---|
| S1 | Landlock + no_new_privs + seccomp groups (layered sandbox builder) | ladybird `RendererSandboxLinux.cpp` + `LibSandbox/Seccomp.cpp` | everyaios-guard `sandbox.rs` (new) | pattern |
| S2 | pledge-style capability strings + path seal | serenity `WebContent/main.cpp` | everyaios-guard `sandbox.rs` (cap strings) + pathfloor seal | pattern |
| S3 | 6-axis file permission grants (recursive/temp/read/write/create/stat) | chromium `broker_file_permission.h` | everyaios-guard::pathfloor upgrade (P7.5) | pattern |
| S4 | FS syscall broker (host/client + command enum) | chromium `syscall_broker/` | E4 script-eval sandbox (in-process broker over everyaios-ipc) | pattern |
| S5 | Arg-filtered seccomp (nested level/optname switch) + crash-on-violation | chromium `bpf_network_policy_linux.cc` | everyaios-guard::sandbox network profile | pattern |
| S6 | AXTreeUpdate node-id delta + snapshot combiner | chromium `ax_tree.h` + `accessibility_tree_snapshot_combiner.h` | everyaios-browser diff/stitch (validates + nuancing) | pattern |
| S7 | `adblock` crate (MIT) as direct dep — read-cleaner + F11 blocklists | brave `adblock/rs/Cargo.toml` + `engine.rs` | **new G9 row** (read-cleaner / content filter) | **crate dep** |
| S8 | FiltersProvider composition (component/custom/subscription → merged set) | brave `ad_block_*_filters_provider.*` | config-store composition (I6 note) | pattern |
| S9 | NAT-type probe (2-port same-local-addr) + UDP/TCP hole-punch + relay fallback | rustdesk `rendezvous_mediator.rs` + `common.rs` | P11.5+ deferred candidate | pattern |
| S10 | MCP Cancelled-vs-Timeout + tool-cancellation primitive | lightpanda `mcp/protocol.zig` + `cdp/domains/webmcp.zig` | everyaios-mcp (E16 follow-on) | pattern |
| S11 | 5-step interactivity (incl. event-listener detection) | lightpanda `interactive.zig` | everyaios-browser::tree slim mode (E16 follow-on) | pattern |
| S12 | SingleFlight dedup + robots gate | lightpanda `SingleFlight.zig` + `RobotsGate.zig` | everyaios-core (F11/G8 note) | pattern |
| S13 | Process-per-navigation decision API shape | ladybird `WebContentClient.ipc` (`decide_navigation_process`) | E12 challenge/site-trust escalation shape | pattern |
| S14 | Zygote warm-pool (fork-then-sandbox, flags over fd) | chromium `zygote_linux.cc` | everyaios-core ProcessSupervisor (J13/warm-pool) | pattern |
| S15 | `.ipc` DSL sync/async message grammar + endpoint magic | ladybird/serenity `.ipc` + `Connection.h` | everyaios-ipc note | reference |

**Priority:** S7 (crate dep, immediate value for read-cleaner + F11) > S3/S4 (path-floor + E4 broker, pure-Rust, test-gated) > S1/S2/S5 (sandbox profiles — Linux-first, P7 wiring) > S10/S11 (E16 polish) > rest.

---

## 8. Ledger & provenance

- **Ledger: 255 repos unchanged** (all six repos already tracked; depth upgraded to ⬛ code-level for rustdesk/ladybird/serenity/brave/chromium — lightpanda already ⬛).
- **New proposed matrix row: G9** (read-cleaner / content filter via `adblock` crate) — mirrors doc 52's G8 pattern; kept separate from G8 (search cascade) because it's a *pre-read transform*, not a search tier.
- **New module proposal: `everyaios-guard::sandbox`** (SandboxProfile builder: no_new_privs + Landlock/App-Sandbox + seccomp groups, per-service profiles) — the code-level form of ARCH/06 §6.15.
- **Deferred:** rustdesk S9 (P11.5+ remote-assist, out of current scope per doc 63 §5); S13/S15 are reference-only.
- All claims above verified against the cloned source (file paths cited). No vendor-marketing numbers used.
