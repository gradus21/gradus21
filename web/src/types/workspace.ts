export interface CategoryResult {
  category_id: string;
  category_name: string;
  average_percent: number | null;
  average_grade_numeric: number | null;
  display_grade: string;
  graded_count: number;
  effective_weight_percent: number;
}

export interface StudentCalculatedSummary {
  student_id: string;
  overall_percent: number | null;
  overall_grade_numeric: number | null;
  overall_display_grade: string;
  semantic_tier: number;
  is_preliminary: boolean;
  category_results: CategoryResult[];
}

export interface ClassCalculationReport {
  student_summaries: StudentCalculatedSummary[];
  class_average_percent: number | null;
  class_average_grade_numeric: number | null;
  class_display_grade: string;
  distribution_buckets: [number, number, number, number, number, number];
}

export type WorkspaceMode = 'matrix' | 'speed_grading' | 'student_360' | 'configurator';

export const TIER_BADGE_STYLES: Record<
  number,
  { bg: string; text: string; border: string; label: string }
> = {
  1: {
    bg: 'var(--tier-1-bg, #DCFCE7)',
    text: 'var(--tier-1-text, #15803D)',
    border: 'var(--tier-1-border, #BBF7D0)',
    label: 'Sehr gut (1)',
  },
  2: {
    bg: 'var(--tier-2-bg, #CCFBF1)',
    text: 'var(--tier-2-text, #0F766E)',
    border: 'var(--tier-2-border, #99F6E4)',
    label: 'Gut (2)',
  },
  3: {
    bg: 'var(--tier-3-bg, #FEF9C3)',
    text: 'var(--tier-3-text, #854D0E)',
    border: 'var(--tier-3-border, #FEF08A)',
    label: 'Befriedigend (3)',
  },
  4: {
    bg: 'var(--tier-4-bg, #FFEDD5)',
    text: 'var(--tier-4-text, #C2410C)',
    border: 'var(--tier-4-border, #FED7AA)',
    label: 'Ausreichend (4)',
  },
  5: {
    bg: 'var(--tier-5-bg, #FFE4E6)',
    text: 'var(--tier-5-text, #BE123C)',
    border: 'var(--tier-5-border, #FECDD3)',
    label: 'Mangelhaft (5)',
  },
  6: {
    bg: 'var(--tier-6-bg, #FFE4E6)',
    text: 'var(--tier-6-text, #9F1239)',
    border: 'var(--tier-6-border, #FDA4AF)',
    label: 'Ungenügend (6)',
  },
};

export const LEVEL_BADGE_STYLES: Record<string, { bg: string; text: string; desc: string }> = {
  G: {
    bg: 'var(--level-g-bg, #F3E8FF)',
    text: 'var(--level-g-text, #6B21A8)',
    desc: 'Grundlegendes Niveau',
  },
  M: {
    bg: 'var(--level-m-bg, #E0F2FE)',
    text: 'var(--level-m-text, #0369A1)',
    desc: 'Mittleres Niveau',
  },
  E: {
    bg: 'var(--level-e-bg, #CCFBF1)',
    text: 'var(--level-e-text, #0F766E)',
    desc: 'Erweitertes Niveau',
  },
};
