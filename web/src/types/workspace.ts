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
  1: { bg: '#DCFCE7', text: '#15803D', border: '#BBF7D0', label: 'Sehr gut (1)' },
  2: { bg: '#CCFBF1', text: '#0F766E', border: '#99F6E4', label: 'Gut (2)' },
  3: { bg: '#FEF9C3', text: '#A16207', border: '#FEF08A', label: 'Befriedigend (3)' },
  4: { bg: '#FFEDD5', text: '#C2410C', border: '#FED7AA', label: 'Ausreichend (4)' },
  5: { bg: '#FFE4E6', text: '#BE123C', border: '#FECDD3', label: 'Mangelhaft (5)' },
  6: { bg: '#FFE4E6', text: '#9F1239', border: '#FDA4AF', label: 'Ungenügend (6)' },
};

export const LEVEL_BADGE_STYLES: Record<string, { bg: string; text: string; desc: string }> = {
  G: { bg: '#F3E8FF', text: '#6B21A8', desc: 'Grundlegendes Niveau' },
  M: { bg: '#E0F2FE', text: '#0369A1', desc: 'Mittleres Niveau' },
  E: { bg: '#CCFBF1', text: '#0F766E', desc: 'Erweitertes Niveau' },
};
