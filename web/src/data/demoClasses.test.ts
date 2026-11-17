import { describe, it, expect } from 'vitest';
import {
  ensureValidUuid,
  buildCurveThresholdsFromMainCutoffs,
  INITIAL_CLASS_DATASETS,
  percentToGradeThreshold,
  gradeToPercent,
  formatGradeDisplayLabel,
  GMS_LEVEL_THRESHOLDS,
  SubjectGradingConfig,
} from './demoClasses';

describe('demoClasses - ensureValidUuid', () => {
  it('returns canonical zero UUID on empty string', () => {
    expect(ensureValidUuid('')).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('preserves and lowercases existing valid UUID v4', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(ensureValidUuid(validUuid.toUpperCase())).toBe(validUuid.toLowerCase());
  });

  it('deterministically maps known legacy class IDs', () => {
    expect(ensureValidUuid('class-eng-6-2627')).toBe('c1a55000-0000-4000-8000-000000000001');
    expect(ensureValidUuid('class-math-9b-2627')).toBe('c1a55000-0000-4000-8000-000000000002');
    expect(ensureValidUuid('class-inf-q1-2627')).toBe('c1a55000-0000-4000-8000-000000000003');
  });

  it('generates a valid RFC-4122 v4 UUID from arbitrary input', () => {
    const generated = ensureValidUuid('custom_random_class_name_2026');
    // Must be RFC-4122 v4 compliant (4 in version nibble, 8/9/a/b in variant nibble)
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(generated).toMatch(uuidV4Regex);
  });

  it('is deterministic for the same input string', () => {
    const a = ensureValidUuid('my-special-gradebook-key');
    const b = ensureValidUuid('my-special-gradebook-key');
    expect(a).toBe(b);
  });
});

describe('demoClasses - buildCurveThresholdsFromMainCutoffs', () => {
  it('builds 16 fine grade thresholds with correct descending percentages', () => {
    const cutoffs = { n1: 92, n2: 81, n3: 67, n4: 50, n5: 30 };
    const thresholds = buildCurveThresholdsFromMainCutoffs(cutoffs);

    expect(thresholds).toHaveLength(16);
    expect(thresholds[0].display_label).toBe('1+');
    expect(thresholds[thresholds.length - 1].display_label).toBe('6');
    expect(thresholds[thresholds.length - 1].min_percent).toBe(0);

    // Verify percentages are strictly monotonically non-increasing
    for (let i = 0; i < thresholds.length - 1; i++) {
      expect(thresholds[i].min_percent).toBeGreaterThanOrEqual(thresholds[i + 1].min_percent);
    }
  });
});

describe('demoClasses - percentToGradeThreshold and gradeToPercent', () => {
  it('converts percent to correct grade threshold', () => {
    const t95 = percentToGradeThreshold(95);
    expect(t95.display_label).toBe('1+');
    expect(t95.numeric_value).toBe(0.75);

    const t80 = percentToGradeThreshold(80);
    expect(t80.display_label).toBe('2+');
    expect(t80.numeric_value).toBe(1.75);

    const t50 = percentToGradeThreshold(50);
    expect(t50.display_label).toBe('4+');

    const t10 = percentToGradeThreshold(10);
    expect(t10.display_label).toBe('6');
  });

  it('converts direct grade to percent', () => {
    const p1 = gradeToPercent(1.0);
    expect(p1).toBe(90);

    const p2 = gradeToPercent(2.0);
    expect(p2).toBe(75);
  });

  it('correctly calculates continuous decimal grades (de_decimal_1_to_6)', () => {
    const config: SubjectGradingConfig = {
      scale_id: 'de_decimal_1_to_6',
      weighting_mode: 'category_buckets',
      scale_empty_categories: true,
      enable_student_levels: false,
      level_threshold_offsets: {},
    };

    // percent to grade
    expect(percentToGradeThreshold(100, config)).toMatchObject({ display_label: '1,0', numeric_value: 1.0, semantic_tier: 1 });
    expect(percentToGradeThreshold(92, config)).toMatchObject({ display_label: '1,4', numeric_value: 1.4, semantic_tier: 1 });
    expect(percentToGradeThreshold(80, config)).toMatchObject({ display_label: '2,0', numeric_value: 2.0, semantic_tier: 2 });
    expect(percentToGradeThreshold(64, config)).toMatchObject({ display_label: '2,8', numeric_value: 2.8, semantic_tier: 3 });
    expect(percentToGradeThreshold(0, config)).toMatchObject({ display_label: '6,0', numeric_value: 6.0, semantic_tier: 6 });

    // grade to percent
    expect(gradeToPercent(1.0, config)).toBe(100);
    expect(gradeToPercent(1.4, config)).toBe(92);
    expect(gradeToPercent(2.8, config)).toBe(64);
    expect(gradeToPercent(6.0, config)).toBe(0);

    // format display label
    expect(formatGradeDisplayLabel(1.4, config)).toBe('1,4');
    expect(formatGradeDisplayLabel(2.8, config)).toBe('2,8');
    expect(formatGradeDisplayLabel(2, config)).toBe('2,0');
  });

  it('supports generic level-specific matrix thresholds (GMS_LEVEL_THRESHOLDS)', () => {
    const config: SubjectGradingConfig = {
      scale_id: 'de_classic_1_to_6',
      weighting_mode: 'category_buckets',
      scale_empty_categories: true,
      enable_student_levels: true,
      level_threshold_offsets: {},
      level_custom_thresholds: GMS_LEVEL_THRESHOLDS,
    };

    // When all 3 students achieve 50% on the joint GMS test:
    // E-Level student gets Note 4 (48-52%)
    expect(percentToGradeThreshold(50, config, 'E')).toMatchObject({ display_label: '4', numeric_value: 4.0 });

    // M-Level student gets Note 3/4 (48-50%)
    expect(percentToGradeThreshold(50, config, 'M')).toMatchObject({ display_label: '3/4', numeric_value: 3.5 });

    // G-Level student gets Note 1 (48-50%)
    expect(percentToGradeThreshold(50, config, 'G')).toMatchObject({ display_label: '1', numeric_value: 1.0 });
  });
});

describe('demoClasses - INITIAL_CLASS_DATASETS', () => {
  it('contains valid datasets with required structure', () => {
    expect(INITIAL_CLASS_DATASETS.length).toBeGreaterThan(0);

    for (const ds of INITIAL_CLASS_DATASETS) {
      expect(ensureValidUuid(ds.id)).toBe(ds.id);
      expect(ds.className).toBeTruthy();
      expect(ds.subjectName).toBeTruthy();
      expect(ds.categories.length).toBeGreaterThan(0);
      expect(ds.students.length).toBeGreaterThan(0);
      expect(ds.config.scale_id).toBeTruthy();
      expect(ds.config.weighting_mode).toBeTruthy();

      // Check category weights
      for (const cat of ds.categories) {
        expect(cat.weight).toBeGreaterThan(0);
        expect(cat.name).toBeTruthy();
      }
    }
  });
});
