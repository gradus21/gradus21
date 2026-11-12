import { describe, it, expect } from 'vitest';
import { validateGradeInput } from './gradeValidation';

describe('validateGradeInput (#41)', () => {
  it('accepts empty, dash, and excused markers across all input modes', () => {
    expect(validateGradeInput('', 'percent').isValid).toBe(true);
    expect(validateGradeInput('-', 'points').isValid).toBe(true);
    expect(validateGradeInput('K', 'grade_scale').isValid).toBe(true);
    expect(validateGradeInput('a', 'grade_scale').isValid).toBe(true);
  });

  it('validates percent mode strictly between 0 and 100', () => {
    expect(validateGradeInput('85', 'percent').isValid).toBe(true);
    expect(validateGradeInput('85,5%', 'percent').isValid).toBe(true);
    expect(validateGradeInput('105', 'percent').isValid).toBe(false);
    expect(validateGradeInput('-5', 'percent').isValid).toBe(false);
    expect(validateGradeInput('abc', 'percent').isValid).toBe(false);
  });

  it('validates points mode against maxPoints', () => {
    expect(validateGradeInput('18', 'points', 'de_classic_1_to_6', 20).isValid).toBe(true);
    expect(validateGradeInput('20', 'points', 'de_classic_1_to_6', 20).isValid).toBe(true);
    const over = validateGradeInput('21', 'points', 'de_classic_1_to_6', 20);
    expect(over.isValid).toBe(false);
    expect(over.errorHint).toContain('20');
  });

  it('rejects out-of-range numbers like 7 in classic 1-6 grade_scale unless % is provided', () => {
    expect(validateGradeInput('2+', 'grade_scale', 'de_classic_1_to_6').isValid).toBe(true);
    expect(validateGradeInput('1,7', 'grade_scale', 'de_classic_1_to_6').isValid).toBe(true);
    expect(validateGradeInput('7', 'grade_scale', 'de_classic_1_to_6').isValid).toBe(false);
    expect(validateGradeInput('0', 'grade_scale', 'de_classic_1_to_6').isValid).toBe(false);
    expect(validateGradeInput('80%', 'grade_scale', 'de_classic_1_to_6').isValid).toBe(true);
  });

  it('validates Oberstufe 0-15 points in grade_scale mode', () => {
    expect(validateGradeInput('15', 'grade_scale', 'de_oberstufe_0_to_15').isValid).toBe(true);
    expect(validateGradeInput('0', 'grade_scale', 'de_oberstufe_0_to_15').isValid).toBe(true);
    expect(validateGradeInput('16', 'grade_scale', 'de_oberstufe_0_to_15').isValid).toBe(false);
  });
});
