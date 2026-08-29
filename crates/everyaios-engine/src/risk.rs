//! Algorithm #8 — Hallucination Risk Compass (port of risk-compass.ts).
//!
//! The TS version's score contract, mirrored exactly so the port is diffable:
//!   base = 0.15
//!   +0.35 × (1 − retrievalConfidence)
//!   +0.30 × (1 − sourceCoverage)
//!   +0.10 × (hasSources ? 0 : 1)
//!   +0.04 × min(3, uncertaintyMarkers)
//!   −0.10 × (groundedOnly ? 1 : 0)
//!   +0.05 if answerLength < 80 tokens and !groundedOnly
//!   clamp [0,1]. Bands: <0.35 low · <0.65 medium · else high.

use serde::Serialize;

/// Risk band from the score.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskBand {
    Low,
    Medium,
    High,
}

/// Inputs to the compass (all cheap-to-collect inference-time signals).
#[derive(Debug, Clone, Default)]
pub struct RiskSignals {
    pub retrieval_confidence: f64,
    pub source_coverage: f64,
    pub has_sources: bool,
    pub uncertainty_markers: u64,
    pub answer_length: Option<u64>,
    pub grounded_only: bool,
}

impl RiskSignals {
    pub fn retrieval_confidence(mut self, v: f64) -> Self {
        self.retrieval_confidence = v;
        self
    }
    pub fn source_coverage(mut self, v: f64) -> Self {
        self.source_coverage = v;
        self
    }
    pub fn has_sources(mut self, v: bool) -> Self {
        self.has_sources = v;
        self
    }
    pub fn uncertainty_markers(mut self, v: u64) -> Self {
        self.uncertainty_markers = v;
        self
    }
    pub fn answer_length(mut self, v: u64) -> Self {
        self.answer_length = Some(v);
        self
    }
    pub fn grounded_only(mut self, v: bool) -> Self {
        self.grounded_only = v;
        self
    }
}

/// Output of the compass.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RiskAssessment {
    pub score: f64,
    pub band: RiskBand,
    /// Human-readable flags explaining what pushed the score.
    pub flags: Vec<String>,
}

const MIN_GROUNDED_ANSWER_LENGTH: u64 = 80;

fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

/// `assessHallucinationRisk(signals)` — same arithmetic as the TS version.
pub fn assess_hallucination_risk(s: RiskSignals) -> RiskAssessment {
    let mut flags: Vec<String> = Vec::new();
    let rc = clamp01(s.retrieval_confidence);
    let sc = clamp01(s.source_coverage);
    let markers = s.uncertainty_markers;
    let grounded_only = s.grounded_only;

    let mut score: f64 = 0.15;
    score += 0.35 * (1.0 - rc);
    if rc < 0.5 {
        flags.push("weak retrieval confidence".to_string());
    }
    score += 0.30 * (1.0 - sc);
    if sc < 0.5 {
        flags.push("low source coverage".to_string());
    }
    if !s.has_sources {
        score += 0.10;
        flags.push("no sources retrieved".to_string());
    }
    let marker_bonus = 0.04 * (markers.min(3)) as f64;
    score += marker_bonus;
    if markers > 0 {
        flags.push(format!("{markers} uncertainty marker(s)"));
    }
    if grounded_only {
        score -= 0.10;
        flags.push("grounding-enforced".to_string());
    }
    let length = s.answer_length.unwrap_or(u64::MAX);
    if length < MIN_GROUNDED_ANSWER_LENGTH && !grounded_only {
        score += 0.05;
        flags.push("suspiciously short answer".to_string());
    }

    score = clamp01(score);
    let band = if score < 0.35 {
        RiskBand::Low
    } else if score < 0.65 {
        RiskBand::Medium
    } else {
        RiskBand::High
    };
    RiskAssessment { score, band, flags }
}

/// Simple keyword hedge counter (mirrors HEDGE_RE): "probably / I think /
/// might / not sure / maybe / could be / seems like / I believe" etc.
pub fn count_uncertainty_markers(text: &str) -> u64 {
    let lower = text.to_lowercase();
    let hedges = [
        "probably",
        "i think",
        "i guess",
        "might",
        "maybe",
        "not sure",
        "not certain",
        "could be",
        "possibly",
        "seems like",
        "i believe",
    ];
    // Count occurrences via windowed search (mirrors regex /g on word-ish substrings).
    let mut count = 0u64;
    for h in hedges {
        let mut start = 0;
        while let Some(rel) = lower[start..].find(h) {
            count += 1;
            start += rel + h.len();
        }
    }
    count
}

/// Calibration report over (score, wasCorrect) samples — a useful compass
/// must show strictly increasing error rate low → medium → high.
#[derive(Debug, Clone, Default)]
pub struct CalibrationReport {
    pub low: BandStat,
    pub medium: BandStat,
    pub high: BandStat,
    /// 1.0 = perfect monotone ordering of error rate with risk.
    pub monotonicity: f64,
    pub overall_error_rate: f64,
}

#[derive(Debug, Clone, Default)]
pub struct BandStat {
    pub total: u64,
    pub wrong: u64,
    pub error_rate: f64,
}

/// `evaluateCalibration(samples)`.
pub fn evaluate_calibration(
    scores: &[(f64, bool)], // (score, wasCorrect)
) -> CalibrationReport {
    let mut low = BandStat::default();
    let mut medium = BandStat::default();
    let mut high = BandStat::default();
    for &(score, was_correct) in scores {
        let band = if score < 0.35 {
            RiskBand::Low
        } else if score < 0.65 {
            RiskBand::Medium
        } else {
            RiskBand::High
        };
        let stat = match band {
            RiskBand::Low => &mut low,
            RiskBand::Medium => &mut medium,
            RiskBand::High => &mut high,
        };
        stat.total += 1;
        if !was_correct {
            stat.wrong += 1;
        }
    }
    for stat in [&mut low, &mut medium, &mut high] {
        stat.error_rate = if stat.total > 0 {
            stat.wrong as f64 / stat.total as f64
        } else {
            0.0
        };
    }
    let mut monotonic_steps = 0u32;
    for pair in [(&low, &medium), (&medium, &high)] {
        let (prev, cur) = pair;
        if prev.total == 0 || cur.total == 0 {
            continue;
        }
        if cur.error_rate >= prev.error_rate {
            monotonic_steps += 1;
        }
    }
    let overall_total = low.total + medium.total + high.total;
    let overall_wrong = low.wrong + medium.wrong + high.wrong;
    CalibrationReport {
        low,
        medium,
        high,
        monotonicity: monotonic_steps as f64 / 2.0,
        overall_error_rate: if overall_total > 0 {
            overall_wrong as f64 / overall_total as f64
        } else {
            0.0
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neutral_inputs_are_medium() {
        // rc=.5, sc=.5, no sources, 0 markers → base + no-sources bonus.
        let a = assess_hallucination_risk(
            RiskSignals::default()
                .retrieval_confidence(0.5)
                .source_coverage(0.5),
        );
        // rc=.5, sc=.5, no sources, len=None → not short:
        // .15 + .35*.5 + .30*.5 + .10 = .575 → medium
        assert!((a.score - 0.575).abs() < 1e-9);
        assert_eq!(a.band, RiskBand::Medium);
    }

    #[test]
    fn strong_grounded_answer_is_low() {
        let a = assess_hallucination_risk(
            RiskSignals::default()
                .retrieval_confidence(0.9)
                .source_coverage(0.9)
                .has_sources(true)
                .answer_length(500),
        );
        // .15 + .35*.1 + .30*.1 + 0 = .15+.035+.03 = .215 → low
        assert!((a.score - 0.215).abs() < 1e-9);
        assert_eq!(a.band, RiskBand::Low);
    }

    #[test]
    fn no_sources_and_short_is_high() {
        let a = assess_hallucination_risk(
            RiskSignals::default()
                .retrieval_confidence(0.2)
                .source_coverage(0.1)
                .has_sources(false)
                .answer_length(30),
        );
        // .15 + .35*.8 + .30*.9 + .10 + .05 = .15+.28+.27+.10+.05 = .85 → high
        assert!((a.score - 0.85).abs() < 1e-9);
        assert_eq!(a.band, RiskBand::High);
        assert!(!a.flags.is_empty());
    }

    #[test]
    fn grounded_only_reduces_score() {
        let a = assess_hallucination_risk(
            RiskSignals::default()
                .source_coverage(0.0)
                .retrieval_confidence(0.0)
                .grounded_only(true),
        );
        // .15 + .35 + .30 + .10 − .10 = .80 → high (but grounding-enforced flag)
        assert!((a.score - 0.80).abs() < 1e-9);
        assert!(a.flags.iter().any(|f| f == "grounding-enforced"));
    }

    #[test]
    fn hedge_counter_counts_known_phrases() {
        let t = "I think this might work, but probably not sure. Maybe.";
        // i-think + might + probably + not-sure + maybe = 5
        assert_eq!(count_uncertainty_markers(t), 5);
        assert_eq!(count_uncertainty_markers("no hedges here"), 0);
    }

    #[test]
    fn short_nongrounded_answer_is_additionally_flagged() {
        let a = assess_hallucination_risk(
            RiskSignals::default().answer_length(50),
        );
        assert!(a.flags.iter().any(|f| f == "suspiciously short answer"));
        let b = assess_hallucination_risk(
            RiskSignals::default().answer_length(50).grounded_only(true),
        );
        assert!(!b.flags.iter().any(|f| f == "suspiciously short answer"));
    }

    #[test]
    fn calibration_monotone_when_useful() {
        // Low-band: mostly correct; high-band: mostly wrong → useful compass.
        let samples = vec![
            (0.2, true), (0.2, true), (0.2, false),
            (0.5, true), (0.5, false),
            (0.9, false), (0.9, false),
        ];
        let report = evaluate_calibration(&samples);
        assert!(report.high.error_rate > report.low.error_rate);
        assert_eq!(report.monotonicity, 1.0);
        assert!(report.high.wrong == 2 && report.low.wrong == 1);
    }
}