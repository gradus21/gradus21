use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Supported modular grading scale plugins
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GradingScaleId {
    /// German standard school grades 1.0 to 6.0 (with +/- tendencies like 2+, 3-)
    #[serde(rename = "de_classic_1_to_6", alias = "de_classic1_to6")]
    DeClassic1To6,
    /// German Oberstufe (MSS / Abitur) 0 to 15 points
    #[serde(rename = "de_oberstufe_0_to_15", alias = "de_oberstufe0_to15")]
    DeOberstufe0To15,
    /// US Letter Grades A+ to F with 4.0 GPA
    #[serde(rename = "us_letter_gpa")]
    UsLetterGpa,
}

/// Visual configuration mode ("Visueller Gewichtungs-Baukasten" without Excel formulas)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WeightingMode {
    /// Assessments are grouped into buckets (e.g. LNW 50%, Mündlich 30%, Tests 20%)
    CategoryBuckets,
    /// Every assessment has a direct weight multiplier (e.g. 2x, 1x, 0.5x)
    DirectWeights,
    /// All achieved raw points are summed and divided by total max points
    TotalPoints,
}

/// Custom threshold step mapping a minimum percentage (0..=100) to a grade label and numeric value
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeThreshold {
    pub min_percent: f64,
    pub display_label: String,
    pub numeric_value: f64,
    pub semantic_tier: u8, // 1 = emerald, 2 = teal, 3 = amber, 4 = orange, 5 = rose, 6 = deep rose
}

/// Complete subject calculation configuration (matches the Visual Weighting Configurator + Notenschlüssel-Editor)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubjectGradingConfig {
    pub scale_id: GradingScaleId,
    pub weighting_mode: WeightingMode,
    /// If true, empty categories (like LNW in Englisch 6 when only Test 1 exists) scale proportionally
    pub scale_empty_categories: bool,
    /// Enable differentiation levels (e.g. "G", "M", "E")
    pub enable_student_levels: bool,
    /// Optional level-specific percentage offset (e.g. {"G": -5.0, "M": 0.0, "E": 5.0})
    #[serde(default)]
    pub level_threshold_offsets: HashMap<String, f64>,
    /// Optional custom grading curve thresholds (from the Interactive Notenschlüssel-Editor)
    #[serde(default)]
    pub custom_thresholds: Option<Vec<GradeThreshold>>,
}

impl Default for SubjectGradingConfig {
    fn default() -> Self {
        Self {
            scale_id: GradingScaleId::DeClassic1To6,
            weighting_mode: WeightingMode::CategoryBuckets,
            scale_empty_categories: true,
            enable_student_levels: true,
            level_threshold_offsets: HashMap::new(),
            custom_thresholds: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryConfig {
    pub id: String,
    pub name: String,
    pub short_code: String,
    /// Relative weight (e.g. 0.50 for 50% or 2.0 for ratio 2:1:1 — automatically normalized!)
    pub weight: f64,
    /// Optional: drop the N lowest scores in this category (e.g. "best 3 of 4 tests")
    #[serde(default)]
    pub drop_lowest_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssessmentInputMode {
    Percent,
    Points,
    GradeScale,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssessmentConfig {
    pub id: String,
    pub category_id: String,
    pub title: String,
    pub term_id: String, // "hj1" or "hj2"
    pub weight: f64,     // weight within the category (default 1.0)
    pub input_mode: AssessmentInputMode,
    pub max_points: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GradeStatus {
    Graded,
    Excused,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeEntry {
    pub student_id: String,
    pub assessment_id: String,
    pub status: GradeStatus,
    pub percent_value: Option<f64>,
    pub raw_points: Option<f64>,
    pub direct_grade_value: Option<f64>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentProfile {
    pub id: String,
    pub name: String,
    pub level: Option<String>, // e.g. "G", "M", "E"
    pub is_not_graded: bool,   // Excluded from class averages if true
    #[serde(default)]
    pub is_archived: bool,     // Archived students are excluded from active grading & class averages
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryResult {
    pub category_id: String,
    pub category_name: String,
    pub average_percent: Option<f64>,
    pub average_grade_numeric: Option<f64>,
    pub display_grade: String,
    pub graded_count: usize,
    pub effective_weight_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentCalculatedSummary {
    pub student_id: String,
    pub overall_percent: Option<f64>,
    pub overall_grade_numeric: Option<f64>,
    pub overall_display_grade: String,
    pub semantic_tier: u8,
    pub is_preliminary: bool, // true if some categories have 0 assessments yet
    pub category_results: Vec<CategoryResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassCalculationReport {
    pub student_summaries: Vec<StudentCalculatedSummary>,
    pub class_average_percent: Option<f64>,
    pub class_average_grade_numeric: Option<f64>,
    pub class_display_grade: String,
    /// Distribution across semantic tiers 1..=6 for the live Notenspiegel histogram
    pub distribution_buckets: [usize; 6],
}

/// Returns the default threshold table for the selected scale
pub fn default_thresholds_for_scale(scale: GradingScaleId) -> Vec<GradeThreshold> {
    match scale {
        GradingScaleId::DeClassic1To6 => vec![
            GradeThreshold { min_percent: 95.0, display_label: "1+".into(), numeric_value: 0.75, semantic_tier: 1 },
            GradeThreshold { min_percent: 90.0, display_label: "1".into(),  numeric_value: 1.00, semantic_tier: 1 },
            GradeThreshold { min_percent: 85.0, display_label: "1-".into(), numeric_value: 1.25, semantic_tier: 1 },
            GradeThreshold { min_percent: 80.0, display_label: "2+".into(), numeric_value: 1.75, semantic_tier: 2 },
            GradeThreshold { min_percent: 75.0, display_label: "2".into(),  numeric_value: 2.00, semantic_tier: 2 },
            GradeThreshold { min_percent: 70.0, display_label: "2-".into(), numeric_value: 2.25, semantic_tier: 2 },
            GradeThreshold { min_percent: 65.0, display_label: "3+".into(), numeric_value: 2.75, semantic_tier: 3 },
            GradeThreshold { min_percent: 58.0, display_label: "3".into(),  numeric_value: 3.00, semantic_tier: 3 },
            GradeThreshold { min_percent: 52.0, display_label: "3-".into(), numeric_value: 3.25, semantic_tier: 3 },
            GradeThreshold { min_percent: 48.0, display_label: "4+".into(), numeric_value: 3.75, semantic_tier: 4 },
            GradeThreshold { min_percent: 42.0, display_label: "4".into(),  numeric_value: 4.00, semantic_tier: 4 },
            GradeThreshold { min_percent: 36.0, display_label: "4-".into(), numeric_value: 4.25, semantic_tier: 4 },
            GradeThreshold { min_percent: 28.0, display_label: "5+".into(), numeric_value: 4.75, semantic_tier: 5 },
            GradeThreshold { min_percent: 20.0, display_label: "5".into(),  numeric_value: 5.00, semantic_tier: 5 },
            GradeThreshold { min_percent: 12.0, display_label: "5-".into(), numeric_value: 5.25, semantic_tier: 5 },
            GradeThreshold { min_percent: 0.0,  display_label: "6".into(),  numeric_value: 6.00, semantic_tier: 6 },
        ],
        GradingScaleId::DeOberstufe0To15 => vec![
            GradeThreshold { min_percent: 95.0, display_label: "15 Pkt (1+)".into(), numeric_value: 15.0, semantic_tier: 1 },
            GradeThreshold { min_percent: 90.0, display_label: "14 Pkt (1)".into(),  numeric_value: 14.0, semantic_tier: 1 },
            GradeThreshold { min_percent: 85.0, display_label: "13 Pkt (1-)".into(), numeric_value: 13.0, semantic_tier: 1 },
            GradeThreshold { min_percent: 80.0, display_label: "12 Pkt (2+)".into(), numeric_value: 12.0, semantic_tier: 2 },
            GradeThreshold { min_percent: 75.0, display_label: "11 Pkt (2)".into(),  numeric_value: 11.0, semantic_tier: 2 },
            GradeThreshold { min_percent: 70.0, display_label: "10 Pkt (2-)".into(), numeric_value: 10.0, semantic_tier: 2 },
            GradeThreshold { min_percent: 65.0, display_label: "9 Pkt (3+)".into(),  numeric_value: 9.0,  semantic_tier: 3 },
            GradeThreshold { min_percent: 60.0, display_label: "8 Pkt (3)".into(),   numeric_value: 8.0,  semantic_tier: 3 },
            GradeThreshold { min_percent: 55.0, display_label: "7 Pkt (3-)".into(),  numeric_value: 7.0,  semantic_tier: 3 },
            GradeThreshold { min_percent: 50.0, display_label: "6 Pkt (4+)".into(),  numeric_value: 6.0,  semantic_tier: 4 },
            GradeThreshold { min_percent: 45.0, display_label: "5 Pkt (4)".into(),   numeric_value: 5.0,  semantic_tier: 4 },
            GradeThreshold { min_percent: 40.0, display_label: "4 Pkt (4-)".into(),  numeric_value: 4.0,  semantic_tier: 4 },
            GradeThreshold { min_percent: 33.0, display_label: "3 Pkt (5+)".into(),  numeric_value: 3.0,  semantic_tier: 5 },
            GradeThreshold { min_percent: 27.0, display_label: "2 Pkt (5)".into(),   numeric_value: 2.0,  semantic_tier: 5 },
            GradeThreshold { min_percent: 20.0, display_label: "1 Pkt (5-)".into(),  numeric_value: 1.0,  semantic_tier: 5 },
            GradeThreshold { min_percent: 0.0,  display_label: "0 Pkt (6)".into(),   numeric_value: 0.0,  semantic_tier: 6 },
        ],
        GradingScaleId::UsLetterGpa => vec![
            GradeThreshold { min_percent: 97.0, display_label: "A+".into(), numeric_value: 4.0, semantic_tier: 1 },
            GradeThreshold { min_percent: 93.0, display_label: "A".into(),  numeric_value: 4.0, semantic_tier: 1 },
            GradeThreshold { min_percent: 90.0, display_label: "A-".into(), numeric_value: 3.7, semantic_tier: 1 },
            GradeThreshold { min_percent: 87.0, display_label: "B+".into(), numeric_value: 3.3, semantic_tier: 2 },
            GradeThreshold { min_percent: 83.0, display_label: "B".into(),  numeric_value: 3.0, semantic_tier: 2 },
            GradeThreshold { min_percent: 80.0, display_label: "B-".into(), numeric_value: 2.7, semantic_tier: 2 },
            GradeThreshold { min_percent: 77.0, display_label: "C+".into(), numeric_value: 2.3, semantic_tier: 3 },
            GradeThreshold { min_percent: 73.0, display_label: "C".into(),  numeric_value: 2.0, semantic_tier: 3 },
            GradeThreshold { min_percent: 70.0, display_label: "C-".into(), numeric_value: 1.7, semantic_tier: 3 },
            GradeThreshold { min_percent: 65.0, display_label: "D".into(),  numeric_value: 1.0, semantic_tier: 4 },
            GradeThreshold { min_percent: 0.0,  display_label: "F".into(),  numeric_value: 0.0, semantic_tier: 6 },
        ],
    }
}

#[inline]
pub fn round1(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    (v * 10.0).round() / 10.0
}

/// Converts a percentage (0..=100) into a GradeThreshold, taking custom thresholds and optional student level (G/M/E) into account
pub fn percent_to_grade(
    percent: f64,
    config: &SubjectGradingConfig,
    student_level: Option<&str>,
) -> GradeThreshold {
    let clean_percent = if percent.is_finite() { percent } else { 0.0 };
    let offset = if config.enable_student_levels {
        student_level
            .and_then(|lvl| config.level_threshold_offsets.get(lvl).copied())
            .filter(|o| o.is_finite())
            .unwrap_or(0.0)
    } else {
        0.0
    };

    let adjusted_percent = (clean_percent - offset).clamp(0.0, 100.0);
    let mut thresholds = config
        .custom_thresholds
        .clone()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default_thresholds_for_scale(config.scale_id));

    // Ensure thresholds are sorted descending by min_percent
    thresholds.sort_by(|a, b| b.min_percent.partial_cmp(&a.min_percent).unwrap_or(std::cmp::Ordering::Equal));

    for t in &thresholds {
        if adjusted_percent >= t.min_percent {
            return t.clone();
        }
    }
    thresholds.last().cloned().unwrap_or(GradeThreshold {
        min_percent: 0.0,
        display_label: "—".into(),
        numeric_value: 0.0,
        semantic_tier: 6,
    })
}

/// Resolves a single GradeEntry into a normalized percentage (0..=100) using active scale context
pub fn resolve_entry_percent_with_config(
    entry: &GradeEntry,
    assessment: &AssessmentConfig,
    config: &SubjectGradingConfig,
) -> Option<f64> {
    if entry.status != GradeStatus::Graded {
        return None;
    }
    if let Some(pct) = entry.percent_value {
        if pct.is_finite() {
            return Some(pct.clamp(0.0, 100.0));
        }
    }
    if let (Some(pts), Some(max_pts)) = (entry.raw_points, assessment.max_points) {
        if pts.is_finite() && max_pts.is_finite() && max_pts > 0.0 {
            return Some(((pts / max_pts) * 100.0).clamp(0.0, 100.0));
        }
    }
    if let Some(grade_val) = entry.direct_grade_value {
        if !grade_val.is_finite() {
            return None;
        }
        // Scale-aware resolution for direct grade values (Issue #6)
        match config.scale_id {
            GradingScaleId::DeOberstufe0To15 => {
                let clamped_pts = grade_val.clamp(0.0, 15.0);
                let thresholds = config
                    .custom_thresholds
                    .clone()
                    .unwrap_or_else(|| default_thresholds_for_scale(GradingScaleId::DeOberstufe0To15));
                if let Some(matching) = thresholds.iter().find(|t| (t.numeric_value - clamped_pts).abs() < 0.25) {
                    return Some(matching.min_percent);
                }
                return Some(((clamped_pts / 15.0) * 100.0).clamp(0.0, 100.0));
            }
            GradingScaleId::DeClassic1To6 => {
                let clamped_grade = grade_val.clamp(0.75, 6.0);
                let thresholds = config
                    .custom_thresholds
                    .clone()
                    .unwrap_or_else(|| default_thresholds_for_scale(GradingScaleId::DeClassic1To6));
                if let Some(matching) = thresholds.iter().find(|t| (t.numeric_value - clamped_grade).abs() < 0.15) {
                    return Some(matching.min_percent);
                }
                // Linear fallback across 1..=6
                let pct = ((6.0 - clamped_grade) / 5.0) * 100.0;
                return Some(pct.clamp(0.0, 100.0));
            }
            GradingScaleId::UsLetterGpa => {
                let clamped_gpa = grade_val.clamp(0.0, 4.0);
                return Some(((clamped_gpa / 4.0) * 100.0).clamp(0.0, 100.0));
            }
        }
    }
    None
}

/// Backwards-compatible wrapper
pub fn resolve_entry_percent(entry: &GradeEntry, assessment: &AssessmentConfig) -> Option<f64> {
    let default_cfg = SubjectGradingConfig::default();
    resolve_entry_percent_with_config(entry, assessment, &default_cfg)
}

/// Calculates the entire class grading report 100% client-side
pub fn calculate_class_report(
    config: &SubjectGradingConfig,
    categories: &[CategoryConfig],
    assessments: &[AssessmentConfig],
    students: &[StudentProfile],
    grades: &[GradeEntry],
    term_filter: Option<&str>,
) -> ClassCalculationReport {
    let filtered_assessments: Vec<&AssessmentConfig> = assessments
        .iter()
        .filter(|a| match term_filter {
            None | Some("all") => true,
            Some(t) => a.term_id == t,
        })
        .collect();

    let mut student_summaries = Vec::with_capacity(students.len());
    let mut class_pct_sum = 0.0;
    let mut class_graded_students = 0usize;
    let mut distribution_buckets = [0usize; 6];

    let total_defined_cat_weight: f64 = categories
        .iter()
        .map(|c| if c.weight.is_finite() { c.weight.max(0.0) } else { 0.0 })
        .sum();

    for student in students {
        let mut category_results = Vec::with_capacity(categories.len());
        let mut active_cat_weight_sum = 0.0;
        let mut weighted_cat_pct_sum = 0.0;
        let mut empty_categories_count = 0usize;

        for cat in categories {
            let cat_assessments: Vec<&&AssessmentConfig> = filtered_assessments
                .iter()
                .filter(|a| a.category_id == cat.id)
                .collect();

            let mut scored_items: Vec<(f64, f64)> = Vec::new();
            for assess in cat_assessments {
                if let Some(entry) = grades
                    .iter()
                    .find(|g| g.student_id == student.id && g.assessment_id == assess.id)
                {
                    if let Some(pct) = resolve_entry_percent_with_config(entry, assess, config) {
                        let w = if assess.weight.is_finite() && assess.weight > 0.0 {
                            assess.weight
                        } else {
                            1.0
                        };
                        scored_items.push((pct, w));
                    }
                }
            }

            if cat.drop_lowest_count > 0 && scored_items.len() > cat.drop_lowest_count {
                scored_items.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
                scored_items = scored_items.into_iter().skip(cat.drop_lowest_count).collect();
            }

            let graded_count = scored_items.len();
            let cat_w = if cat.weight.is_finite() { cat.weight.max(0.0) } else { 0.0 };

            if graded_count > 0 {
                let w_sum: f64 = scored_items.iter().map(|(_, w)| *w).sum();
                let pct_avg = if w_sum > 0.0 {
                    scored_items.iter().map(|(p, w)| p * w).sum::<f64>() / w_sum
                } else {
                    0.0
                };
                let rounded_cat_pct = round1(pct_avg);
                // Issue #5: Call percent_to_grade with rounded_cat_pct for 100% UI consistency!
                let threshold = percent_to_grade(rounded_cat_pct, config, student.level.as_deref());

                active_cat_weight_sum += cat_w;
                weighted_cat_pct_sum += rounded_cat_pct * cat_w;

                category_results.push(CategoryResult {
                    category_id: cat.id.clone(),
                    category_name: cat.name.clone(),
                    average_percent: Some(rounded_cat_pct),
                    average_grade_numeric: Some(threshold.numeric_value),
                    display_grade: threshold.display_label,
                    graded_count,
                    effective_weight_percent: 0.0,
                });
            } else {
                empty_categories_count += 1;
                category_results.push(CategoryResult {
                    category_id: cat.id.clone(),
                    category_name: cat.name.clone(),
                    average_percent: None,
                    average_grade_numeric: None,
                    display_grade: "—".into(),
                    graded_count: 0,
                    effective_weight_percent: 0.0,
                });
            }
        }

        for (idx, cr) in category_results.iter_mut().enumerate() {
            let raw_w = if categories[idx].weight.is_finite() { categories[idx].weight.max(0.0) } else { 0.0 };
            if cr.graded_count > 0 && active_cat_weight_sum > 0.0 && config.scale_empty_categories {
                cr.effective_weight_percent = round1((raw_w / active_cat_weight_sum) * 100.0);
            } else if total_defined_cat_weight > 0.0 {
                cr.effective_weight_percent = round1((raw_w / total_defined_cat_weight) * 100.0);
            }
        }

        let overall_pct_opt = match config.weighting_mode {
            WeightingMode::CategoryBuckets => {
                if active_cat_weight_sum > 0.0 {
                    if config.scale_empty_categories {
                        Some(weighted_cat_pct_sum / active_cat_weight_sum)
                    } else if total_defined_cat_weight > 0.0 {
                        Some(weighted_cat_pct_sum / total_defined_cat_weight)
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            WeightingMode::DirectWeights => {
                let mut total_w = 0.0;
                let mut total_score = 0.0;
                for assess in &filtered_assessments {
                    if let Some(entry) = grades
                        .iter()
                        .find(|g| g.student_id == student.id && g.assessment_id == assess.id)
                    {
                        if let Some(pct) = resolve_entry_percent_with_config(entry, assess, config) {
                            let w = if assess.weight.is_finite() && assess.weight > 0.0 {
                                assess.weight
                            } else {
                                1.0
                            };
                            total_w += w;
                            total_score += pct * w;
                        }
                    }
                }
                if total_w > 0.0 {
                    Some(total_score / total_w)
                } else {
                    None
                }
            }
            WeightingMode::TotalPoints => {
                let mut earned_pts = 0.0;
                let mut possible_pts = 0.0;
                for assess in &filtered_assessments {
                    if let Some(entry) = grades
                        .iter()
                        .find(|g| g.student_id == student.id && g.assessment_id == assess.id)
                    {
                        if entry.status == GradeStatus::Graded {
                            let max_p = assess.max_points.unwrap_or(100.0);
                            if let Some(raw_p) = entry.raw_points {
                                if raw_p.is_finite() && max_p.is_finite() && max_p > 0.0 {
                                    earned_pts += raw_p;
                                    possible_pts += max_p;
                                }
                            } else if let Some(pct) = entry.percent_value {
                                if pct.is_finite() && max_p.is_finite() && max_p > 0.0 {
                                    earned_pts += (pct / 100.0) * max_p;
                                    possible_pts += max_p;
                                }
                            } else if let Some(pct) = resolve_entry_percent_with_config(entry, assess, config) {
                                if max_p.is_finite() && max_p > 0.0 {
                                    earned_pts += (pct / 100.0) * max_p;
                                    possible_pts += max_p;
                                }
                            }
                        }
                    }
                }
                if possible_pts > 0.0 {
                    Some((earned_pts / possible_pts) * 100.0)
                } else {
                    None
                }
            }
        };

        if let Some(overall_pct) = overall_pct_opt {
            let rounded_pct = round1(overall_pct);
            let threshold = percent_to_grade(rounded_pct, config, student.level.as_deref());

            if !student.is_not_graded && !student.is_archived {
                class_pct_sum += rounded_pct;
                class_graded_students += 1;
                let tier_idx = (threshold.semantic_tier.saturating_sub(1) as usize).min(5);
                distribution_buckets[tier_idx] += 1;
            }

            let is_prelim = match config.weighting_mode {
                WeightingMode::CategoryBuckets => empty_categories_count > 0,
                WeightingMode::DirectWeights | WeightingMode::TotalPoints => {
                    filtered_assessments.is_empty() || filtered_assessments.len() < 2
                }
            };

            student_summaries.push(StudentCalculatedSummary {
                student_id: student.id.clone(),
                overall_percent: Some(rounded_pct),
                overall_grade_numeric: Some(threshold.numeric_value),
                overall_display_grade: if student.is_not_graded {
                    "o.B.".into()
                } else {
                    threshold.display_label
                },
                semantic_tier: threshold.semantic_tier,
                is_preliminary: is_prelim,
                category_results,
            });
        } else {
            student_summaries.push(StudentCalculatedSummary {
                student_id: student.id.clone(),
                overall_percent: None,
                overall_grade_numeric: None,
                overall_display_grade: if student.is_not_graded { "o.B.".into() } else { "—".into() },
                semantic_tier: 0,
                is_preliminary: true,
                category_results,
            });
        }
    }

    let (class_average_percent, class_average_grade_numeric, class_display_grade) =
        if class_graded_students > 0 {
            let avg_pct = round1(class_pct_sum / class_graded_students as f64);
            let threshold = percent_to_grade(avg_pct, config, None);
            (
                Some(avg_pct),
                Some(threshold.numeric_value),
                threshold.display_label,
            )
        } else {
            (None, None, "—".into())
        };

    ClassCalculationReport {
        student_summaries,
        class_average_percent,
        class_average_grade_numeric,
        class_display_grade,
        distribution_buckets,
    }
}

/// "Was-wäre-wenn"-Simulator for Student 360° Elterngespräch View (Issue #7 support)
pub fn simulate_needed_score_for_target(
    current_summary: &StudentCalculatedSummary,
    categories: &[CategoryConfig],
    target_category_id: &str,
    target_overall_percent: f64,
) -> Option<f64> {
    let total_w: f64 = categories
        .iter()
        .map(|c| if c.weight.is_finite() { c.weight.max(0.0) } else { 0.0 })
        .sum();
    if total_w <= 0.0 || !target_overall_percent.is_finite() {
        return None;
    }

    let mut other_weighted_sum = 0.0;
    let mut active_total_w = 0.0;
    let mut target_cat_w = 0.0;
    let mut target_existing_avg = None;
    let mut target_existing_count = 0usize;

    for cat in categories {
        let cr = current_summary
            .category_results
            .iter()
            .find(|r| r.category_id == cat.id);
        let cat_w = if cat.weight.is_finite() { cat.weight.max(0.0) } else { 0.0 };

        if cat.id == target_category_id {
            target_cat_w = cat_w;
            active_total_w += target_cat_w;
            if let Some(r) = cr {
                target_existing_avg = r.average_percent;
                target_existing_count = r.graded_count;
            }
        } else if let Some(r) = cr {
            if let Some(avg) = r.average_percent {
                other_weighted_sum += avg * cat_w;
                active_total_w += cat_w;
            }
        }
    }

    if target_cat_w <= 0.0 || active_total_w <= 0.0 {
        return None;
    }

    let required_cat_avg =
        (target_overall_percent * active_total_w - other_weighted_sum) / target_cat_w;

    let needed_single_score = if let Some(existing_avg) = target_existing_avg {
        required_cat_avg * (target_existing_count as f64 + 1.0)
            - existing_avg * (target_existing_count as f64)
    } else {
        required_cat_avg
    };

    Some(round1(needed_single_score))
}

/// What-If Simulator v2: supports CategoryBuckets, DirectWeights, and TotalPoints modes (Issue #7).
/// Inverts calculate_class_report for the active weighting mode.
pub fn simulate_needed_score_v2(
    config: &SubjectGradingConfig,
    categories: &[CategoryConfig],
    assessments: &[AssessmentConfig],
    grades: &[GradeEntry],
    student: &StudentProfile,
    current_summary: &StudentCalculatedSummary,
    target_category_id: &str,
    target_overall_percent: f64,
    term_filter: Option<&str>,
    simulated_weight: Option<f64>,
    simulated_max_points: Option<f64>,
) -> Option<f64> {
    if !target_overall_percent.is_finite() {
        return None;
    }

    match config.weighting_mode {
        WeightingMode::CategoryBuckets => {
            simulate_needed_score_for_target(
                current_summary,
                categories,
                target_category_id,
                target_overall_percent,
            )
        }
        WeightingMode::DirectWeights => {
            let filtered_assessments: Vec<&AssessmentConfig> = assessments
                .iter()
                .filter(|a| match term_filter {
                    None | Some("all") => true,
                    Some(t) => a.term_id == t,
                })
                .collect();

            let mut total_w = 0.0;
            let mut total_score = 0.0;
            for assess in &filtered_assessments {
                if let Some(entry) = grades
                    .iter()
                    .find(|g| g.student_id == student.id && g.assessment_id == assess.id)
                {
                    if let Some(pct) = resolve_entry_percent_with_config(entry, assess, config) {
                        let w = if assess.weight.is_finite() && assess.weight > 0.0 {
                            assess.weight
                        } else {
                            1.0
                        };
                        total_w += w;
                        total_score += pct * w;
                    }
                }
            }

            let new_w = simulated_weight
                .filter(|w| w.is_finite() && *w > 0.0)
                .unwrap_or(1.0);
            let needed = if total_w > 0.0 {
                (target_overall_percent * (total_w + new_w) - total_score) / new_w
            } else {
                target_overall_percent
            };
            Some(round1(needed))
        }
        WeightingMode::TotalPoints => {
            let filtered_assessments: Vec<&AssessmentConfig> = assessments
                .iter()
                .filter(|a| match term_filter {
                    None | Some("all") => true,
                    Some(t) => a.term_id == t,
                })
                .collect();

            let mut earned_pts = 0.0;
            let mut possible_pts = 0.0;
            for assess in &filtered_assessments {
                if let Some(entry) = grades
                    .iter()
                    .find(|g| g.student_id == student.id && g.assessment_id == assess.id)
                {
                    if entry.status == GradeStatus::Graded {
                        let max_p = assess.max_points.unwrap_or(100.0);
                        if let Some(raw_p) = entry.raw_points {
                            if raw_p.is_finite() && max_p.is_finite() && max_p > 0.0 {
                                earned_pts += raw_p;
                                possible_pts += max_p;
                            }
                        } else if let Some(pct) = entry.percent_value {
                            if pct.is_finite() && max_p.is_finite() && max_p > 0.0 {
                                earned_pts += (pct / 100.0) * max_p;
                                possible_pts += max_p;
                            }
                        } else if let Some(pct) = resolve_entry_percent_with_config(entry, assess, config) {
                            if max_p.is_finite() && max_p > 0.0 {
                                earned_pts += (pct / 100.0) * max_p;
                                possible_pts += max_p;
                            }
                        }
                    }
                }
            }

            let new_max_p = simulated_max_points
                .filter(|p| p.is_finite() && *p > 0.0)
                .unwrap_or(20.0);

            let needed_pct = if possible_pts > 0.0 {
                ((target_overall_percent / 100.0) * (possible_pts + new_max_p) - earned_pts) / new_max_p * 100.0
            } else {
                target_overall_percent
            };
            Some(round1(needed_pct))
        }
    }
}
