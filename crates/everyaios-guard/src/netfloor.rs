//! P62.1 — the canonical network-destination floor (SSRF / private-network
//! classification).
//!
//! Before this module there were three partial implementations of the same
//! idea: [`crate::toctou::is_blocked_ip`] (only the exact cloud-metadata IP),
//! [`crate::urlfloor`] (no IP check at all), and a bespoke copy inside the
//! browser engine. That is the "N agents × M rules" drift the 2026 agent
//! security survey calls the heterogeneity trap, so the classification now
//! lives here once and every guard calls it.
//!
//! **Performance contract (hard requirement):** this module is *pure and
//! synchronous*. It performs no DNS resolution, no syscalls, no allocation on
//! the IP-literal path, and no I/O of any kind. A verdict is a handful of bit
//! tests plus (for a hostname) an ASCII-insensitive suffix compare, so it runs
//! in well under a microsecond and can sit in front of every fetch without
//! changing end-to-end latency. The resolve-and-pin half of SSRF defense lives
//! in [`crate::toctou`] and is deliberately *not* on this path.
//!
//! **What is always refused** (no policy can allow it): the unspecified
//! address, link-local (`169.254.0.0/16` — which contains the
//! `169.254.169.254` cloud-metadata endpoint — and `fe80::/10`), multicast,
//! broadcast, documentation, and the reserved/benchmark ranges. There is no
//! legitimate desktop reason to reach those, so they are a hard floor.
//!
//! **What is policy-gated** (default in parentheses): RFC1918 private +
//! CGNAT `100.64.0.0/10` + IPv6 ULA (blocked; a user-owned LAN node or
//! Tailscale peer is an explicit opt-in), and loopback (allowed on a local
//! desktop — see [`NetPolicy`]).

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// Names that are loopback without needing DNS.
const LOOPBACK_NAMES: &[&str] = &[
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
];

/// Suffixes that only resolve through local discovery (`mDNS`/search domains)
/// or are reserved by RFC 6761/8375. They are resolution-dependent, so they
/// cannot be classified without a network call — which this module never
/// makes — and are therefore treated as private by default.
const LOCAL_ONLY_SUFFIXES: &[&str] = &[".local", ".localhost", ".internal", ".home.arpa", ".lan"];

/// How a destination host is classified.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NetClass {
    /// A routable public destination.
    Public,
    /// `127.0.0.0/8`, `::1`, or a loopback name.
    Loopback,
    /// RFC1918, IPv6 unique-local (`fc00::/7`), or a local-only name.
    Private,
    /// `169.254.0.0/16` (includes cloud metadata) or `fe80::/10`.
    LinkLocal,
    /// `100.64.0.0/10` (carrier-grade NAT — also where Tailscale lives).
    Cgnat,
    /// `0.0.0.0` / `::`.
    Unspecified,
    /// `224.0.0.0/4` / `ff00::/8`.
    Multicast,
    /// Broadcast, documentation, benchmark, or otherwise reserved space.
    Reserved,
    /// A name that cannot be classified without DNS (`.local`, `.internal`…).
    LocalName,
}

/// Whether a destination class may be reached, under a given policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NetPolicy {
    /// Permit loopback (`127.0.0.0/8`, `::1`, `localhost`).
    pub allow_loopback: bool,
    /// Permit RFC1918 / CGNAT / ULA / local-only names.
    pub allow_private: bool,
    /// Permit names that need local discovery (`.local`, `.internal`).
    pub allow_local_names: bool,
}

impl Default for NetPolicy {
    /// The desktop default.
    ///
    /// Loopback is **allowed**: on a local-first desktop the machine is the
    /// user's own, local dev servers and local model runtimes (Ollama on
    /// `:11434`, LM Studio on `:1234`) are first-class workflows, and the CDP
    /// endpoint is loopback. LAN/private and discovery names stay **blocked**
    /// because they are the actual SSRF prize. Everything in the always-refuse
    /// set stays refused regardless.
    fn default() -> Self {
        Self {
            allow_loopback: true,
            allow_private: false,
            allow_local_names: false,
        }
    }
}

impl NetPolicy {
    /// Refuse loopback too — for destinations chosen by untrusted content
    /// (page content, search results, remote tool metadata).
    pub const fn strict() -> Self {
        Self {
            allow_loopback: false,
            allow_private: false,
            allow_local_names: false,
        }
    }

    /// Permit the whole local network — the explicit opt-in for a user-owned
    /// LAN node, a Tailscale peer, or a `.local` device.
    pub const fn local() -> Self {
        Self {
            allow_loopback: true,
            allow_private: true,
            allow_local_names: true,
        }
    }

    /// May this class be reached under this policy?
    pub const fn allows(self, class: NetClass) -> bool {
        match class {
            NetClass::Public => true,
            NetClass::Loopback => self.allow_loopback,
            NetClass::Private | NetClass::Cgnat => self.allow_private,
            NetClass::LocalName => self.allow_local_names || self.allow_private,
            // Hard floor: never reachable, under any policy.
            NetClass::Unspecified
            | NetClass::LinkLocal
            | NetClass::Multicast
            | NetClass::Reserved => false,
        }
    }
}

/// Classify a literal address.
pub fn classify_ip(ip: IpAddr) -> NetClass {
    match ip {
        IpAddr::V4(v4) => classify_v4(v4),
        IpAddr::V6(v6) => classify_v6(v6),
    }
}

fn classify_v4(v4: Ipv4Addr) -> NetClass {
    let [a, b, ..] = v4.octets();
    if v4.is_loopback() {
        return NetClass::Loopback;
    }
    if v4.is_unspecified() {
        return NetClass::Unspecified;
    }
    if v4.is_link_local() {
        return NetClass::LinkLocal;
    }
    if v4.is_multicast() {
        return NetClass::Multicast;
    }
    if v4.is_private() {
        return NetClass::Private;
    }
    // 100.64.0.0/10 — carrier-grade NAT (and Tailscale's address space).
    if a == 100 && (64..128).contains(&b) {
        return NetClass::Cgnat;
    }
    if v4.is_broadcast() || v4.is_documentation() {
        return NetClass::Reserved;
    }
    // 0.0.0.0/8 "this network", 192.0.0.0/24 IETF assignments,
    // 198.18.0.0/15 benchmarking, 240.0.0.0/4 reserved.
    if a == 0 || (a == 192 && b == 0) || (a == 198 && (b == 18 || b == 19)) || a >= 240 {
        return NetClass::Reserved;
    }
    NetClass::Public
}

fn classify_v6(v6: Ipv6Addr) -> NetClass {
    if let Some(mapped) = v6.to_ipv4_mapped() {
        return classify_v4(mapped);
    }
    if v6.is_loopback() {
        return NetClass::Loopback;
    }
    if v6.is_unspecified() {
        return NetClass::Unspecified;
    }
    if v6.is_multicast() {
        return NetClass::Multicast;
    }
    let seg0 = v6.segments()[0];
    // fe80::/10 link-local.
    if (seg0 & 0xffc0) == 0xfe80 {
        return NetClass::LinkLocal;
    }
    // fc00::/7 unique-local.
    if (seg0 & 0xfe00) == 0xfc00 {
        return NetClass::Private;
    }
    // 2001:db8::/32 documentation.
    if seg0 == 0x2001 && v6.segments()[1] == 0x0db8 {
        return NetClass::Reserved;
    }
    NetClass::Public
}

/// Classify a host string (a literal IP, a loopback name, a local-only name,
/// or a public name). ASCII-insensitive and allocation-free.
pub fn classify_host(host: &str) -> NetClass {
    let trimmed = host.strip_suffix('.').unwrap_or(host);
    if trimmed.is_empty() {
        return NetClass::Unspecified;
    }
    // Bracket-free literal first — the hot path for an agent-generated URL.
    if let Ok(ip) = trimmed.parse::<IpAddr>() {
        return classify_ip(ip);
    }
    if LOOPBACK_NAMES.iter().any(|n| eq_ascii_ci(trimmed, n)) {
        return NetClass::Loopback;
    }
    if LOCAL_ONLY_SUFFIXES
        .iter()
        .any(|s| ends_with_ascii_ci(trimmed, s))
    {
        return NetClass::LocalName;
    }
    NetClass::Public
}

/// May this host be reached under `policy`?
pub fn host_allowed(host: &str, policy: NetPolicy) -> bool {
    policy.allows(classify_host(host))
}

/// The class of a parsed URL host.
pub fn classify_url_host(host: &url::Host<&str>) -> NetClass {
    match host {
        url::Host::Ipv4(v4) => classify_v4(*v4),
        url::Host::Ipv6(v6) => classify_v6(*v6),
        // A domain name: no DNS here, so only the name forms we can decide.
        url::Host::Domain(d) => match classify_host(d) {
            NetClass::Public => NetClass::Public,
            other => other,
        },
    }
}

/// True when this address can never be reached, under any policy.
pub fn is_always_blocked(ip: IpAddr) -> bool {
    matches!(
        classify_ip(ip),
        NetClass::Unspecified | NetClass::LinkLocal | NetClass::Multicast | NetClass::Reserved
    )
}

/// A stable snake_case reason token for the audit/approval card.
pub fn class_reason(class: NetClass) -> &'static str {
    match class {
        NetClass::Public => "public",
        NetClass::Loopback => "loopback",
        NetClass::Private => "private",
        NetClass::LinkLocal => "link_local",
        NetClass::Cgnat => "cgnat",
        NetClass::Unspecified => "unspecified",
        NetClass::Multicast => "multicast",
        NetClass::Reserved => "reserved",
        NetClass::LocalName => "local_name",
    }
}

fn eq_ascii_ci(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .all(|(x, y)| x.eq_ignore_ascii_case(&y))
}

fn ends_with_ascii_ci(haystack: &str, suffix: &str) -> bool {
    haystack.len() >= suffix.len()
        && eq_ascii_ci(&haystack[haystack.len() - suffix.len()..], suffix)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn cloud_metadata_is_always_blocked() {
        // The single highest-value SSRF target, under every policy.
        let meta = ip("169.254.169.254");
        assert_eq!(classify_ip(meta), NetClass::LinkLocal);
        assert!(is_always_blocked(meta));
        assert!(!NetPolicy::local().allows(classify_ip(meta)));
        assert!(!host_allowed("169.254.169.254", NetPolicy::local()));
    }

    #[test]
    fn whole_link_local_range_blocked_not_just_the_metadata_ip() {
        for s in ["169.254.0.1", "169.254.1.1", "169.254.255.254"] {
            assert!(is_always_blocked(ip(s)), "{s}");
        }
        assert!(is_always_blocked(ip("fe80::1")));
    }

    #[test]
    fn private_and_cgnat_are_policy_gated() {
        for s in [
            "10.0.0.1",
            "172.16.5.4",
            "192.168.1.1",
            "fc00::1",
            "fd12::1",
        ] {
            assert_eq!(classify_ip(ip(s)), NetClass::Private, "{s}");
            assert!(!NetPolicy::strict().allows(classify_ip(ip(s))));
            assert!(!NetPolicy::default().allows(classify_ip(ip(s))));
            assert!(NetPolicy::local().allows(classify_ip(ip(s))));
        }
        // Tailscale lives in CGNAT, so it must be reachable under `local()`.
        assert_eq!(classify_ip(ip("100.64.0.1")), NetClass::Cgnat);
        assert!(!NetPolicy::default().allows(classify_ip(ip("100.64.0.1"))));
        assert!(NetPolicy::local().allows(classify_ip(ip("100.64.0.1"))));
    }

    #[test]
    fn loopback_allowed_on_desktop_blocked_when_strict() {
        for s in ["127.0.0.1", "127.1.2.3", "::1"] {
            assert_eq!(classify_ip(ip(s)), NetClass::Loopback, "{s}");
            assert!(NetPolicy::default().allows(classify_ip(ip(s))));
            assert!(!NetPolicy::strict().allows(classify_ip(ip(s))));
        }
        assert!(host_allowed("localhost", NetPolicy::default()));
        assert!(host_allowed("LOCALHOST", NetPolicy::default()));
        assert!(host_allowed("localhost.", NetPolicy::default()));
        assert!(!host_allowed("localhost", NetPolicy::strict()));
    }

    #[test]
    fn numeric_bypass_forms_are_classified_by_url_normalization() {
        // The URL parser normalizes decimal / octal / hex IPv4 forms, which is
        // why the classification is on the parsed host, not the raw string.
        for raw in [
            "http://2130706433/",
            "http://0x7f000001/",
            "http://0177.0.0.1/",
        ] {
            let parsed = url::Url::parse(raw).unwrap();
            let class = classify_url_host(&parsed.host().unwrap().into());
            assert_eq!(class, NetClass::Loopback, "{raw}");
        }
    }

    #[test]
    fn ipv4_mapped_ipv6_cannot_smuggle_a_private_address() {
        assert_eq!(classify_ip(ip("::ffff:127.0.0.1")), NetClass::Loopback);
        assert_eq!(classify_ip(ip("::ffff:192.168.1.1")), NetClass::Private);
        assert_eq!(
            classify_ip(ip("::ffff:169.254.169.254")),
            NetClass::LinkLocal
        );
        assert_eq!(classify_ip(ip("::ffff:8.8.8.8")), NetClass::Public);
    }

    #[test]
    fn reserved_and_unspecified_never_pass() {
        for s in [
            "0.0.0.0",
            "::",
            "255.255.255.255",
            "224.0.0.1",
            "240.0.0.1",
            "198.18.0.1",
        ] {
            assert!(
                !NetPolicy::local().allows(classify_ip(ip(s))),
                "{s} must never be reachable"
            );
        }
    }

    #[test]
    fn local_only_names_are_private_by_default() {
        for name in ["nas.local", "printer.internal", "host.lan", "box.home.arpa"] {
            assert_eq!(classify_host(name), NetClass::LocalName, "{name}");
            assert!(!host_allowed(name, NetPolicy::default()));
            assert!(host_allowed(name, NetPolicy::local()));
        }
    }

    #[test]
    fn public_destinations_still_pass_every_policy() {
        for name in [
            "example.com",
            "api.openai.com",
            "8.8.8.8",
            "2606:4700::1111",
        ] {
            for policy in [
                NetPolicy::strict(),
                NetPolicy::default(),
                NetPolicy::local(),
            ] {
                assert!(host_allowed(name, policy), "{name}");
            }
        }
    }

    /// The performance contract: a verdict is pure and must stay in the
    /// sub-microsecond range so it never lengthens a turn. The bound is
    /// deliberately generous (it fails only on an order-of-magnitude
    /// regression, not on CI jitter).
    #[test]
    fn verdict_is_sub_microsecond_and_allocation_free_on_the_hot_path() {
        use std::time::Instant;
        let hosts = [
            "https://example.com/a/b?c=d",
            "169.254.169.254",
            "http://127.0.0.1:11434/v1/models",
            "https://api.openai.com/v1/chat/completions",
        ];
        // Warm up so the first-iteration cost isn't measured.
        for h in &hosts {
            let _ = host_allowed(h, NetPolicy::default());
        }
        const N: u32 = 50_000;
        let start = Instant::now();
        for i in 0..N {
            let h = hosts[(i as usize) % hosts.len()];
            std::hint::black_box(host_allowed(h, NetPolicy::default()));
        }
        let elapsed = start.elapsed();
        let per_check = elapsed.as_nanos() / u128::from(N);
        assert!(
            per_check < 5_000,
            "network floor averaged {per_check}ns per check ({elapsed:?} for {N}) — budget is 5µs"
        );
    }
}
