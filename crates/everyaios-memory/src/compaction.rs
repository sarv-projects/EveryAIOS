//! Compaction pipeline (Algorithm #21 — Reasonix ratio knobs + BrowserOS
//! callSummarizer + opencode compaction + Hermes tool-result persistence).
//!
//! Stale tool results are snipped to head/tail anchors; the context is
//! soft-compacted (notice) at 0.5 and force-summarized at 0.9; splits never
//! land mid-turn; `prefix_dirty` tracks cache-break events; the OpenCode
//! PRUNE_PROTECT budget erases surplus tool output.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CompactionConfig {
    /// Stale tool result → head/tail anchor when stale fraction ≥ this.
    pub snip_ratio: f64,
    /// Notice-only threshold (soft compact).
    pub soft_ratio: f64,
    /// Force-summarize threshold.
    pub force_ratio: f64,
    /// OpenCode PRUNE_PROTECT: cap on retained tool-output tokens.
    pub prune_protect_tokens: usize,
}

impl Default for CompactionConfig {
    fn default() -> Self {
        CompactionConfig {
            snip_ratio: 0.6,
            soft_ratio: 0.5,
            force_ratio: 0.9,
            prune_protect_tokens: 40_000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContextAction {
    None,
    /// A stale tool result crossed the snip ratio.
    Snip,
    /// Context crossed the soft ratio — notice only.
    SoftCompact,
    /// Context crossed the force ratio — summarize older turns.
    ForceCompact,
}

/// Decide the context-level action from tokens used vs the budget.
pub fn decide_context_action(used: usize, max: usize, cfg: &CompactionConfig) -> ContextAction {
    if max == 0 {
        return ContextAction::None;
    }
    let r = used as f64 / max as f64;
    if r >= cfg.force_ratio {
        ContextAction::ForceCompact
    } else if r >= cfg.soft_ratio {
        ContextAction::SoftCompact
    } else {
        ContextAction::None
    }
}

/// Should a stale tool result be snipped to a head/tail anchor?
pub fn should_snip(stale_ratio: f64, cfg: &CompactionConfig) -> bool {
    stale_ratio >= cfg.snip_ratio
}

/// Head/tail anchor: keep the first `head` and last `tail` chars, ellipsis
/// in the middle.
pub fn snip_anchor(text: &str, head: usize, tail: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= head + tail {
        return text.to_string();
    }
    let mut out: String = chars[..head].iter().collect();
    out.push_str("\n…[snip]…\n");
    out.extend(&chars[chars.len() - tail..]);
    out
}

/// Find a split point (in turns) so the leading turns fit within
/// `target_tokens` and the boundary never lands mid-turn. Returns the number
/// of leading turns to keep.
pub fn find_safe_split(turn_tokens: &[usize], target_tokens: usize) -> usize {
    let mut acc = 0usize;
    let mut keep = 0usize;
    for &t in turn_tokens {
        if acc + t > target_tokens {
            break;
        }
        acc += t;
        keep += 1;
    }
    keep
}

/// Sliding window: keep the most recent `recent_tokens` of turns; the rest
/// are candidates for summarization.
pub fn sliding_window(turn_tokens: &[usize], recent_tokens: usize) -> (usize, usize) {
    // (summarize_end, keep_start) indices into turn_tokens
    let mut keep = 0usize;
    let mut acc = 0usize;
    for (i, &t) in turn_tokens.iter().enumerate().rev() {
        if acc + t > recent_tokens {
            break;
        }
        acc += t;
        keep = i;
    }
    (keep, turn_tokens.len())
}

/// Summarize-or-passthrough (BrowserOS callSummarizer): if the summarizer
/// returns `None` (timeout / abort), fail-open with the original text.
pub fn summarize_or_passthrough<F>(text: &str, summarize: F) -> String
where
    F: FnOnce(&str) -> Option<String>,
{
    summarize(text).unwrap_or_else(|| text.to_string())
}

/// Cache-break event kinds that set `prefix_dirty`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheBreak {
    KeyRotation,
    ProviderSwitch,
    ModelSwitch,
    SystemPromptEdit,
}

/// Tracks whether the prompt-cache prefix is dirty (must be re-cached).
#[derive(Debug, Clone, Copy, Default)]
pub struct PrefixCache {
    pub dirty: bool,
}

impl PrefixCache {
    pub fn mark_dirty(&mut self, _reason: CacheBreak) {
        self.dirty = true;
    }

    pub fn mark_clean(&mut self) {
        self.dirty = false;
    }
}

/// Hermes 3-layer tool-result persistence decision: small results stay
/// inline; large results are persisted to a path and only a preview enters
/// context.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PersistDecision {
    Inline,
    PreviewAndPath,
}

/// `inline_cap_tokens` is the inline threshold; above it we persist.
pub fn persist_decision(tokens: usize, inline_cap_tokens: usize) -> PersistDecision {
    if tokens <= inline_cap_tokens {
        PersistDecision::Inline
    } else {
        PersistDecision::PreviewAndPath
    }
}

/// OpenCode PRUNE_PROTECT: retain tool outputs up to the protect budget,
/// erasing the surplus (oldest first). `outputs` = (id, tokens).
pub fn prune_protect(outputs: &[(String, usize)], budget: usize) -> Vec<String> {
    let mut used = 0usize;
    let mut kept = Vec::new();
    for (id, tokens) in outputs.iter().rev() {
        if used + tokens > budget {
            break;
        }
        used += tokens;
        kept.push(id.clone());
    }
    kept.reverse();
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_actions_by_ratio() {
        let cfg = CompactionConfig::default();
        assert_eq!(decide_context_action(40, 100, &cfg), ContextAction::None);
        assert_eq!(
            decide_context_action(50, 100, &cfg),
            ContextAction::SoftCompact
        );
        assert_eq!(
            decide_context_action(90, 100, &cfg),
            ContextAction::ForceCompact
        );
        assert_eq!(decide_context_action(10, 0, &cfg), ContextAction::None);
    }

    #[test]
    fn snip_anchor_keeps_head_tail() {
        let text = "A".repeat(100);
        let s = snip_anchor(&text, 10, 10);
        assert!(s.starts_with("AAAAAAAAAA"));
        assert!(s.ends_with("AAAAAAAAAA"));
        assert!(s.contains("[snip]"));
        // Short text is returned verbatim.
        assert_eq!(snip_anchor("hi", 10, 10), "hi");
    }

    #[test]
    fn safe_split_never_mid_turn() {
        let turns = [100, 100, 100, 100];
        assert_eq!(find_safe_split(&turns, 250), 2); // 200 fits, 300 doesn't
        assert_eq!(find_safe_split(&turns, 0), 0);
    }

    #[test]
    fn sliding_window_keeps_recent() {
        let turns = [50, 50, 50, 50];
        // recent 100 tokens → last two turns (indices 2..4)
        let (summarize_end, _) = sliding_window(&turns, 100);
        assert_eq!(summarize_end, 2);
    }

    #[test]
    fn summarize_fails_open() {
        assert_eq!(summarize_or_passthrough("abc", |_| None), "abc");
        assert_eq!(
            summarize_or_passthrough("abc", |t| Some(format!("<{t}>"))),
            "<abc>"
        );
    }

    #[test]
    fn prefix_dirty_flag() {
        let mut p = PrefixCache::default();
        assert!(!p.dirty);
        p.mark_dirty(CacheBreak::KeyRotation);
        assert!(p.dirty);
        p.mark_clean();
        assert!(!p.dirty);
    }

    #[test]
    fn persist_decision_threshold() {
        assert_eq!(persist_decision(100, 200), PersistDecision::Inline);
        assert_eq!(persist_decision(201, 200), PersistDecision::PreviewAndPath);
    }

    #[test]
    fn prune_protect_erases_surplus() {
        let outputs = vec![
            ("a".to_string(), 10_000),
            ("b".to_string(), 20_000),
            ("c".to_string(), 15_000),
        ];
        // budget 30k → keeps c (15k) + b (20k) = 35k > 30k, so only c fits
        // then b would push over → keep c only? iterate rev: c(15k) ok, b(+20k)=35k>30k stop.
        let kept = prune_protect(&outputs, 30_000);
        assert_eq!(kept, vec!["c".to_string()]);

        // 35k keeps c (15k) + b (20k) = 35k, then a (+10k = 45k) > 35k → erased.
        let kept2 = prune_protect(&outputs, 35_000);
        assert_eq!(kept2, vec!["b".to_string(), "c".to_string()]);
    }
}
