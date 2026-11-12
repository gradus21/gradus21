/**
 * Inline Validation for Grade Inputs (Issue #41).
 *
 * Verhindert stille Fehlinterpretationen (z. B. "7" in einem 1-6 Schulnotenfeld
 * als 7% = Note 6) und liefert unmittelbares visuelles & semantisches Feedback.
 */

export interface GradeValidationResult {
  isValid: boolean;
  errorHint?: string;
}

export function validateGradeInput(
  rawValue: string,
  inputMode: 'percent' | 'points' | 'grade_scale' | 'excused' = 'percent',
  scaleId: string = 'de_classic_1_to_6',
  maxPoints: number = 15
): GradeValidationResult {
  const trimmed = rawValue.trim();
  if (trimmed === '' || trimmed === '-') {
    return { isValid: true };
  }

  const upper = trimmed.toUpperCase();
  if (inputMode === 'excused' || upper === 'K' || upper === 'A') {
    return { isValid: true };
  }

  if (inputMode === 'percent') {
    const clean = trimmed.replace(/%$/, '').trim();
    if (!/^\d+([.,]\d*)?$/.test(clean)) {
      return { isValid: false, errorHint: 'Erlaubt: 0 bis 100 %' };
    }
    const num = parseFloat(clean.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 100) {
      return { isValid: false, errorHint: 'Erlaubt: 0 bis 100 %' };
    }
    return { isValid: true };
  }

  if (inputMode === 'points') {
    const limit = maxPoints > 0 ? maxPoints : 15;
    const clean = trimmed.replace(/\s*(pkt\.?|p\.?)$/i, '').trim();
    if (!/^\d+([.,]\d*)?$/.test(clean)) {
      return { isValid: false, errorHint: `Erlaubt: 0 bis ${limit} Pkt.` };
    }
    const num = parseFloat(clean.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > limit) {
      return { isValid: false, errorHint: `Maximal ${limit} Punkte erlaubt` };
    }
    return { isValid: true };
  }

  // inputMode === 'grade_scale'
  // Explicit percentage input with '%' is supported in grade_scale fields
  if (trimmed.endsWith('%')) {
    const cleanPct = trimmed.slice(0, -1).trim();
    if (!/^\d+([.,]\d*)?$/.test(cleanPct)) {
      return { isValid: false, errorHint: 'Erlaubt: 0% bis 100%' };
    }
    const pct = parseFloat(cleanPct.replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return { isValid: false, errorHint: 'Erlaubt: 0% bis 100%' };
    }
    return { isValid: true };
  }

  if (scaleId === 'de_oberstufe_0_to_15') {
    if (!/^\d+([.,]\d*)?$/.test(trimmed)) {
      return { isValid: false, errorHint: 'Erlaubt: 0 bis 15 Notenpunkte' };
    }
    const num = parseFloat(trimmed.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 15) {
      return { isValid: false, errorHint: 'Erlaubt: 0 bis 15 Notenpunkte' };
    }
    return { isValid: true };
  }

  // Classic German school grades 1.0 to 6.0 (including 1+, 2-, etc.)
  if (!/^[+-]?\d+([.,]\d*)?[+-]?$/.test(trimmed)) {
    return { isValid: false, errorHint: 'Erlaubt: Note 1,0 bis 6,0 (oder K für Attest)' };
  }

  const clean = trimmed.replace(/[+-]/g, '').replace(',', '.').trim();
  const base = parseFloat(clean);
  if (isNaN(base) || base < 1 || base > 6) {
    return { isValid: false, errorHint: 'Erlaubt: Note 1,0 bis 6,0 (oder mit %-Zeichen)' };
  }

  return { isValid: true };
}
