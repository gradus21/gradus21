export type GradingScaleId = 'de_classic_1_to_6' | 'de_oberstufe_0_to_15' | 'us_letter_gpa';
export type WeightingMode = 'category_buckets' | 'direct_weights' | 'total_points';
export type AssessmentInputMode = 'percent' | 'points' | 'grade_scale';
export type GradeStatus = 'graded' | 'excused' | 'missing';
export type TermFilterId = 'hj1' | 'hj2' | 'all';

export interface GradeThreshold {
  min_percent: number;
  display_label: string;
  numeric_value: number;
  semantic_tier: number;
}

export interface SubjectGradingConfig {
  scale_id: GradingScaleId;
  weighting_mode: WeightingMode;
  scale_empty_categories: boolean;
  enable_student_levels: boolean;
  level_threshold_offsets: Record<string, number>;
  custom_thresholds?: GradeThreshold[] | null;
}

export interface CategoryConfig {
  id: string;
  name: string;
  short_code: string;
  weight: number;
  drop_lowest_count: number;
}

export interface AssessmentConfig {
  id: string;
  category_id: string;
  title: string;
  term_id: string; // 'hj1' | 'hj2'
  weight: number;
  input_mode: AssessmentInputMode;
  max_points: number | null;
}

export interface StudentProfile {
  id: string;
  name: string;
  level: string | null;
  is_not_graded: boolean;
  is_archived?: boolean;
  archived_at?: string;
  notes?: string;
}

export type ThemePreset = 'teal' | 'indigo' | 'sage' | 'terracotta';
export type ThemeMode = 'system' | 'light' | 'dark';
export type CellDisplayFormat = 'combined' | 'percent_only' | 'grade_only';

export interface CustomWeightingTemplate {
  id: string;
  name: string;
  description: string;
  weighting_mode: WeightingMode;
  categories: CategoryConfig[];
}

/**
 * Cross-device synchronized settings (persisted in E2EE envelope + /api/preferences)
 */
export interface UserSyncSettings {
  themePreset: ThemePreset;
  darkMode: boolean;
  themeMode?: ThemeMode;
  defaultScaleId: GradingScaleId;
  defaultWeightingMode: WeightingMode;
  defaultCellFormat: CellDisplayFormat;
  defaultCurvePreset: string;
  favoriteWeightingPresets: string[];
  showStudentLevelsByDefault: boolean;
  showReportCardColumn: boolean;
  showCategoryAveragesInMatrix: boolean;
  showWhatIfSimulator: boolean;
  showCurveEditorInSpeedGrading: boolean;
  showGuideButtonInHeader?: boolean;
  cloudSyncEnabled?: boolean;
  customWeightingTemplates: CustomWeightingTemplate[];
}

export function getEffectiveThemeMode(settings: {
  themeMode?: ThemeMode;
  darkMode?: boolean;
}): ThemeMode {
  if (settings.themeMode) {
    return settings.themeMode;
  }
  if (settings.darkMode === true) {
    return 'dark';
  }
  return 'system';
}

export function resolveIsDarkMode(themeMode?: ThemeMode, fallbackDarkMode?: boolean): boolean {
  const mode = getEffectiveThemeMode({ themeMode, darkMode: fallbackDarkMode });
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  }
  return mode === 'dark';
}

export const DEFAULT_USER_SYNC_SETTINGS: UserSyncSettings = {
  themePreset: 'teal',
  darkMode: false,
  themeMode: 'system',
  defaultScaleId: 'de_classic_1_to_6',
  defaultWeightingMode: 'category_buckets',
  defaultCellFormat: 'combined',
  defaultCurvePreset: 'standard',
  favoriteWeightingPresets: ['50_30_20', '60_40', '2_1_1', '1_1_1'],
  showStudentLevelsByDefault: true,
  showReportCardColumn: true,
  showCategoryAveragesInMatrix: true,
  showWhatIfSimulator: true,
  showCurveEditorInSpeedGrading: true,
  showGuideButtonInHeader: false,
  cloudSyncEnabled: false,
  customWeightingTemplates: [
    {
      id: 'tpl_hauptfach_60_40',
      name: 'Hauptfach Klassisch (60% Schriftlich / 40% Mündlich)',
      description: 'Zwei Töpfe ohne separate Kurztest-Kategorie',
      weighting_mode: 'category_buckets',
      categories: [
        { id: 'cat_schr', name: 'Schriftlich (Klassenarbeiten)', short_code: 'Schr', weight: 0.6, drop_lowest_count: 0 },
        { id: 'cat_muendl', name: 'Mündlich & Mitarbeit', short_code: 'Mündl', weight: 0.4, drop_lowest_count: 0 },
      ],
    },
    {
      id: 'tpl_nebenfach_40_60',
      name: 'Nebenfach / Gesellschaft (40% Tests / 60% Mitarbeit & Praxis)',
      description: 'Stärkere Gewichtung der laufenden Unterrichtsbeiträge',
      weighting_mode: 'category_buckets',
      categories: [
        { id: 'cat_tests', name: 'Tests & Nachweise', short_code: 'Tests', weight: 0.4, drop_lowest_count: 0 },
        { id: 'cat_praxis', name: 'Mündlich & Praxis', short_code: 'Praxis', weight: 0.6, drop_lowest_count: 0 },
      ],
    },
  ],
};

export interface GradeEntry {
  student_id: string;
  assessment_id: string;
  status: GradeStatus;
  percent_value: number | null;
  raw_points: number | null;
  direct_grade_value: number | null;
  comment: string | null;
}

export interface ReportCardOverride {
  hj1?: string;
  hj2?: string;
  all?: string;
  reason?: string;
}

export interface ClassroomSubjectDataset {
  id: string;
  schoolName: string;
  schoolYear: string;
  className: string;
  subjectName: string;
  shortName: string;
  description: string;
  config: SubjectGradingConfig;
  categories: CategoryConfig[];
  assessments: AssessmentConfig[];
  students: StudentProfile[];
  grades: GradeEntry[];
  reportCardOverrides?: Record<string, ReportCardOverride>;
}

/**
 * Built-in Grading Curve Presets for the Interactive Notenschlüssel-Editor
 */
export function buildCurveThresholdsFromMainCutoffs(cutoffs: {
  n1: number;
  n2: number;
  n3: number;
  n4: number;
  n5: number;
}): GradeThreshold[] {
  const { n1, n2, n3, n4, n5 } = cutoffs;
  const span1 = Math.max(3, Math.round((100 - n1) / 2));
  const span2 = Math.max(3, Math.round((n1 - n2) / 3));
  const span3 = Math.max(3, Math.round((n2 - n3) / 3));
  const span4 = Math.max(3, Math.round((n3 - n4) / 3));
  const span5 = Math.max(3, Math.round((n4 - n5) / 3));

  return [
    { min_percent: Math.min(99, n1 + span1), display_label: '1+', numeric_value: 0.75, semantic_tier: 1 },
    { min_percent: n1, display_label: '1', numeric_value: 1.0, semantic_tier: 1 },
    { min_percent: Math.max(n2 + 1, n1 - span2), display_label: '1-', numeric_value: 1.25, semantic_tier: 1 },
    { min_percent: Math.min(n1 - 1, n2 + span2), display_label: '2+', numeric_value: 1.75, semantic_tier: 2 },
    { min_percent: n2, display_label: '2', numeric_value: 2.0, semantic_tier: 2 },
    { min_percent: Math.max(n3 + 1, n2 - span2), display_label: '2-', numeric_value: 2.25, semantic_tier: 2 },
    { min_percent: Math.min(n2 - 1, n3 + span3), display_label: '3+', numeric_value: 2.75, semantic_tier: 3 },
    { min_percent: n3, display_label: '3', numeric_value: 3.0, semantic_tier: 3 },
    { min_percent: Math.max(n4 + 1, n3 - span3), display_label: '3-', numeric_value: 3.25, semantic_tier: 3 },
    { min_percent: Math.min(n3 - 1, n4 + span4), display_label: '4+', numeric_value: 3.75, semantic_tier: 4 },
    { min_percent: n4, display_label: '4', numeric_value: 4.0, semantic_tier: 4 },
    { min_percent: Math.max(n5 + 1, n4 - span4), display_label: '4-', numeric_value: 4.25, semantic_tier: 4 },
    { min_percent: Math.min(n4 - 1, n5 + span5), display_label: '5+', numeric_value: 4.75, semantic_tier: 5 },
    { min_percent: n5, display_label: '5', numeric_value: 5.0, semantic_tier: 5 },
    { min_percent: Math.max(5, n5 - span5), display_label: '5-', numeric_value: 5.25, semantic_tier: 5 },
    { min_percent: 0, display_label: '6', numeric_value: 6.0, semantic_tier: 6 },
  ];
}

export const GRADING_CURVE_PRESETS: Record<
  string,
  { name: string; description: string; cutoffs: { n1: number; n2: number; n3: number; n4: number; n5: number } }
> = {
  standard: {
    name: 'Sek-I Standard (Linear)',
    description: 'Note 1 ab 90%, Note 2 ab 75%, Note 3 ab 58%, Note 4 ab 42%',
    cutoffs: { n1: 90, n2: 75, n3: 58, n4: 42, n5: 20 },
  },
  ihk: {
    name: 'IHK / Berufsschul-Schlüssel (50%-Hürde)',
    description: 'Note 1 ab 92%, Note 2 ab 81%, Note 3 ab 67%, Note 4 ab 50%, Note 5 ab 30%',
    cutoffs: { n1: 92, n2: 81, n3: 67, n4: 50, n5: 30 },
  },
  mild: {
    name: 'Pädagogisch Mild / Differenzierend',
    description: 'Note 1 ab 86%, Note 2 ab 70%, Note 3 ab 54%, Note 4 bereits ab 38%',
    cutoffs: { n1: 86, n2: 70, n3: 54, n4: 38, n5: 18 },
  },
  strict: {
    name: 'Strenger Gymnasial-Schlüssel',
    description: 'Note 1 ab 93%, Note 2 ab 80%, Note 3 ab 65%, Note 4 ab 50%',
    cutoffs: { n1: 93, n2: 80, n3: 65, n4: 50, n5: 25 },
  },
};

/**
 * Exact 29 students & Test 1 scores from /home/julian/Downloads/Englisch 6 SJ 2627.xlsx
 */
const ENGLISCH_6_RAW_STUDENTS: Array<{
  name: string;
  level: 'G' | 'M' | 'E';
  test1Pct: number | null;
  notes?: string;
}> = [
  { name: 'Safia', level: 'M', test1Pct: 73, notes: 'Sehr engagiert im mündlichen Unterricht.' },
  { name: 'Kira', level: 'G', test1Pct: 47, notes: 'Vokabeltraining empfohlen.' },
  { name: 'Leni', level: 'M', test1Pct: 73 },
  { name: 'Sofija B.', level: 'G', test1Pct: 7, notes: 'Förderbedarf Grammatik & Wortschatz.' },
  { name: 'Lorenzo', level: 'E', test1Pct: 87 },
  { name: 'Vincent', level: 'M', test1Pct: null, notes: 'Bei Test 1 entschuldigt gefehlt.' },
  { name: 'Jorin', level: 'M', test1Pct: 53 },
  { name: 'Martin', level: 'M', test1Pct: 73 },
  { name: 'Dominik', level: 'G', test1Pct: 27 },
  { name: 'Chiara', level: 'E', test1Pct: 87 },
  { name: 'Mario', level: 'M', test1Pct: 67 },
  { name: 'Luis', level: 'E', test1Pct: 93, notes: 'Starke Aussprache & sichere Grammatik.' },
  { name: 'Jasmin', level: 'M', test1Pct: 53 },
  { name: 'Marwa', level: 'E', test1Pct: 93 },
  { name: 'Fernando', level: 'M', test1Pct: null, notes: 'Nachschreibtermin geplant.' },
  { name: 'Luna', level: 'E', test1Pct: 87 },
  { name: 'Helene', level: 'M', test1Pct: null, notes: 'Bei Test 1 krank.' },
  { name: 'Julia', level: 'E', test1Pct: 93 },
  { name: 'Enisa', level: 'G', test1Pct: 47 },
  { name: 'Aitan', level: 'M', test1Pct: 73 },
  { name: 'Sofija K.', level: 'M', test1Pct: 73 },
  { name: 'Dejan', level: 'G', test1Pct: 47 },
  { name: 'Mia', level: 'M', test1Pct: 53 },
  { name: 'Matteo', level: 'M', test1Pct: 60 },
  { name: 'Miguel', level: 'M', test1Pct: 53 },
  { name: 'Marko', level: 'M', test1Pct: 67 },
  { name: 'Tim', level: 'M', test1Pct: 67 },
  { name: 'Shakira', level: 'E', test1Pct: 87 },
  { name: 'Agatha', level: 'E', test1Pct: 93 },
];

/**
 * Ensures any class dataset ID is a valid canonical RFC-4122 UUID v4.
 * Deterministically maps known legacy IDs and arbitrary strings to stable UUIDs.
 */
export function ensureValidUuid(id: string): string {
  if (!id) {
    return '00000000-0000-4000-8000-000000000000';
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) {
    return id.toLowerCase();
  }
  if (id === 'class-eng-6-2627') {
    return 'c1a55000-0000-4000-8000-000000000001';
  }
  if (id === 'class-math-9b-2627') {
    return 'c1a55000-0000-4000-8000-000000000002';
  }
  if (id === 'class-inf-q1-2627') {
    return 'c1a55000-0000-4000-8000-000000000003';
  }
  // Deterministic 16-byte UUID from arbitrary string
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x7fed211b, h4 = 0x9e3779b9;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822519);
    h4 = Math.imul(h4 ^ ch, 3266489917);
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const hex = toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const INITIAL_CLASS_DATASETS: ClassroomSubjectDataset[] = [
  {
    id: 'c1a55000-0000-4000-8000-000000000001',
    schoolName: 'Gemeinschaftsschule am Park',
    schoolYear: '2026/2027',
    className: 'Klasse 6',
    subjectName: 'Englisch',
    shortName: 'EN 6',
    description: 'Originaldaten aus Englisch 6 SJ 2627.xlsx (LNW, Mündlich, Tests 1–4 + Niveau G/M/E)',
    config: {
      scale_id: 'de_classic_1_to_6',
      weighting_mode: 'category_buckets',
      scale_empty_categories: true,
      enable_student_levels: true,
      level_threshold_offsets: { G: -5, M: 0, E: 3 },
      custom_thresholds: null,
    },
    categories: [
      { id: 'cat_lnw', name: 'Große LNW (Klassenarbeiten)', short_code: 'LNW', weight: 0.5, drop_lowest_count: 0 },
      { id: 'cat_muendl', name: 'Mündliche Leistung', short_code: 'Mündl', weight: 0.3, drop_lowest_count: 0 },
      { id: 'cat_tests', name: 'Tests (Vokabeln & Kurztests)', short_code: 'Tests', weight: 0.2, drop_lowest_count: 0 },
    ],
    assessments: [
      { id: 'lnw_1', category_id: 'cat_lnw', title: 'LNW 1', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 45 },
      { id: 'lnw_2', category_id: 'cat_lnw', title: 'LNW 2', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 45 },
      { id: 'muendl_1', category_id: 'cat_muendl', title: 'Mündl 1', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 15 },
      { id: 'muendl_2', category_id: 'cat_muendl', title: 'Mündl. 2', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 15 },
      { id: 'test_1', category_id: 'cat_tests', title: 'Test 1', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 15 },
      { id: 'test_2', category_id: 'cat_tests', title: 'Test 2', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 15 },
      { id: 'test_3', category_id: 'cat_tests', title: 'Test 3', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 15 },
      { id: 'test_4', category_id: 'cat_tests', title: 'Test 4', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 15 },
      // 2. Halbjahr assessments
      { id: 'lnw_3_hj2', category_id: 'cat_lnw', title: 'LNW 3 (HJ2)', term_id: 'hj2', weight: 1, input_mode: 'percent', max_points: 45 },
      { id: 'muendl_3_hj2', category_id: 'cat_muendl', title: 'Mündl 3 (HJ2)', term_id: 'hj2', weight: 1, input_mode: 'percent', max_points: 15 },
      { id: 'test_5_hj2', category_id: 'cat_tests', title: 'Test 5 (HJ2)', term_id: 'hj2', weight: 1, input_mode: 'percent', max_points: 15 },
    ],
    students: ENGLISCH_6_RAW_STUDENTS.map((s, idx) => ({
      id: `stu_eng6_${idx + 1}`,
      name: s.name,
      level: s.level,
      is_not_graded: false,
      notes: s.notes,
    })),
    grades: ENGLISCH_6_RAW_STUDENTS.flatMap<GradeEntry>((s, idx) => {
      if (s.test1Pct === null) {
        return [
          {
            student_id: `stu_eng6_${idx + 1}`,
            assessment_id: 'test_1',
            status: 'excused' as GradeStatus,
            percent_value: null,
            raw_points: null,
            direct_grade_value: null,
            comment: 'Fehlte entschuldigt',
          },
        ];
      }
      return [
        {
          student_id: `stu_eng6_${idx + 1}`,
          assessment_id: 'test_1',
          status: 'graded' as GradeStatus,
          percent_value: s.test1Pct,
          raw_points: Math.round((s.test1Pct / 100) * 15),
          direct_grade_value: null,
          comment: null,
        },
      ];
    }),
    reportCardOverrides: {
      stu_eng6_1: { hj1: '2', reason: 'Pädagogischer Aufrundungsentscheid durch starke mündliche Mitarbeit' },
    },
  },
  {
    id: 'c1a55000-0000-4000-8000-000000000002',
    schoolName: 'Goethe-Gymnasium',
    schoolYear: '2026/2027',
    className: 'Klasse 9b',
    subjectName: 'Mathematik',
    shortName: 'MA 9b',
    description: 'Andere Fachlogik: 2:1 Gewichtung (Schriftlich 67% / Sonstige 33%), beste 2 von 3 Kurztests zählen',
    config: {
      scale_id: 'de_classic_1_to_6',
      weighting_mode: 'category_buckets',
      scale_empty_categories: true,
      enable_student_levels: false,
      level_threshold_offsets: {},
      custom_thresholds: null,
    },
    categories: [
      { id: 'm_ka', name: 'Klassenarbeiten', short_code: 'KA', weight: 2, drop_lowest_count: 0 },
      { id: 'm_so', name: 'Sonstige Mitarbeit & Tests', short_code: 'SoMi', weight: 1, drop_lowest_count: 1 },
    ],
    assessments: [
      { id: 'm_ka1', category_id: 'm_ka', title: '1. KA: Quadratische Funktionen', term_id: 'hj1', weight: 1, input_mode: 'points', max_points: 40 },
      { id: 'm_t1', category_id: 'm_so', title: 'Kurztest Parabeln', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 20 },
      { id: 'm_t2', category_id: 'm_so', title: 'Mündlich Q1', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 100 },
    ],
    students: [
      { id: 'm_s1', name: 'Jonas Weber', level: null, is_not_graded: false, notes: 'Sehr stark in analytischer Geometrie.' },
      { id: 'm_s2', name: 'Emilia Hartmann', level: null, is_not_graded: false },
      { id: 'm_s3', name: 'Noah Yilmaz', level: null, is_not_graded: false },
      { id: 'm_s4', name: 'Hannah Lindner (Inklusion)', level: null, is_not_graded: true, notes: 'Zieldifferent unterrichtet (o.B.).' },
    ],
    grades: [
      { student_id: 'm_s1', assessment_id: 'm_ka1', status: 'graded', percent_value: 88, raw_points: 35, direct_grade_value: null, comment: null },
      { student_id: 'm_s1', assessment_id: 'm_t1', status: 'graded', percent_value: 60, raw_points: 12, direct_grade_value: null, comment: 'Wird als schwächster Test gestrichen' },
      { student_id: 'm_s1', assessment_id: 'm_t2', status: 'graded', percent_value: 92, raw_points: 92, direct_grade_value: null, comment: null },
      { student_id: 'm_s2', assessment_id: 'm_ka1', status: 'graded', percent_value: 75, raw_points: 30, direct_grade_value: null, comment: null },
      { student_id: 'm_s2', assessment_id: 'm_t1', status: 'graded', percent_value: 80, raw_points: 16, direct_grade_value: null, comment: null },
      { student_id: 'm_s3', assessment_id: 'm_ka1', status: 'graded', percent_value: 52, raw_points: 21, direct_grade_value: null, comment: null },
      { student_id: 'm_s3', assessment_id: 'm_t1', status: 'graded', percent_value: 65, raw_points: 13, direct_grade_value: null, comment: null },
    ],
    reportCardOverrides: {},
  },
  {
    id: 'c1a55000-0000-4000-8000-000000000003',
    schoolName: 'Goethe-Gymnasium',
    schoolYear: '2026/2027',
    className: 'Kursstufe Q1',
    subjectName: 'Informatik (Oberstufe)',
    shortName: 'INF Q1',
    description: 'Oberstufen-Punktesystem (0–15 MSS-Punkte) mit Klausuren & Praxis-Projekt',
    config: {
      scale_id: 'de_oberstufe_0_to_15',
      weighting_mode: 'category_buckets',
      scale_empty_categories: true,
      enable_student_levels: false,
      level_threshold_offsets: {},
      custom_thresholds: null,
    },
    categories: [
      { id: 'inf_kl', name: 'Klausuren', short_code: 'Klausur', weight: 0.5, drop_lowest_count: 0 },
      { id: 'inf_pr', name: 'Praxis & GFS', short_code: 'Praxis', weight: 0.5, drop_lowest_count: 0 },
    ],
    assessments: [
      { id: 'inf_k1', category_id: 'inf_kl', title: 'Klausur 1: Kryptografie & Graphen', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 60 },
      { id: 'inf_p1', category_id: 'inf_pr', title: 'Rust Projekt-Meilenstein', term_id: 'hj1', weight: 1, input_mode: 'percent', max_points: 30 },
    ],
    students: [
      { id: 'inf_1', name: 'Lukas Bergmann', level: null, is_not_graded: false },
      { id: 'inf_2', name: 'Maja Kowalski', level: null, is_not_graded: false },
      { id: 'inf_3', name: 'Timon Becker', level: null, is_not_graded: false },
    ],
    grades: [
      { student_id: 'inf_1', assessment_id: 'inf_k1', status: 'graded', percent_value: 92, raw_points: 55, direct_grade_value: null, comment: null },
      { student_id: 'inf_1', assessment_id: 'inf_p1', status: 'graded', percent_value: 96, raw_points: 29, direct_grade_value: null, comment: null },
      { student_id: 'inf_2', assessment_id: 'inf_k1', status: 'graded', percent_value: 78, raw_points: 47, direct_grade_value: null, comment: null },
      { student_id: 'inf_2', assessment_id: 'inf_p1', status: 'graded', percent_value: 85, raw_points: 25.5, direct_grade_value: null, comment: null },
      { student_id: 'inf_3', assessment_id: 'inf_k1', status: 'graded', percent_value: 62, raw_points: 37, direct_grade_value: null, comment: null },
    ],
    reportCardOverrides: {},
  },
];
