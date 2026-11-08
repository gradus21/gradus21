import {
  ClassroomSubjectDataset,
  StudentProfile,
  TermFilterId,
} from '../data/demoClasses';
import {
  isAppleTouchDevice,
  isDesktopTauri,
  isMobileDevice,
  isMobileTauri,
  isTauri,
} from '../utils/platform';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface StudentSummaryForExport {
  student_id: string;
  overall_percent: number | null;
  overall_grade_numeric: number | null;
  overall_display_grade: string;
  semantic_tier: number;
  is_preliminary: boolean;
  category_results: Array<{
    category_id: string;
    category_name: string;
    average_percent: number | null;
    display_grade: string;
    graded_count: number;
    effective_weight_percent: number;
  }>;
}

export interface ClassReportForExport {
  student_summaries: StudentSummaryForExport[];
  class_average_percent: number | null;
  class_display_grade: string;
  distribution_buckets: [number, number, number, number, number, number];
}

export type ExportFormat = 'xlsx' | 'csv' | 'txt';
export type ExportDelimiter = ';' | ',' | '\t';
export type ExportDecimalSeparator = ',' | '.';
export type ExportPresetId = 'schild_nrw' | 'standard' | 'matrix_full' | 'custom';

export interface ExportColumnDefinition {
  id: string;
  label: string;
  description: string;
  category: 'student' | 'grades' | 'meta';
}

export const AVAILABLE_EXPORT_COLUMNS: ExportColumnDefinition[] = [
  { id: 'nr', label: 'Nr.', description: 'Laufende Nummerierung', category: 'student' },
  { id: 'name', label: 'Name (vollständig)', description: 'Vollständiger Anzeigename', category: 'student' },
  { id: 'lastName', label: 'Nachname', description: 'Amtlicher Nachname oder Familienname', category: 'student' },
  { id: 'firstName', label: 'Vorname', description: 'Amtlicher Vorname oder Rufname', category: 'student' },
  { id: 'birthDate', label: 'Geburtsdatum', description: 'Geburtsdatum (TT.MM.JJJJ, essenziell für SchILD)', category: 'student' },
  { id: 'studentId', label: 'Schüler-ID', description: 'Amtliche Identifikationsnummer der Schule', category: 'student' },
  { id: 'className', label: 'Klasse', description: 'Bezeichnung der Klasse (z.B. 6b, 9a)', category: 'student' },
  { id: 'level', label: 'Niveau (G/M/E)', description: 'Binnendifferenzierungs-Stufe', category: 'student' },
  { id: 'subject', label: 'Fachname', description: 'Ausgeschriebener Fachname (z.B. Englisch)', category: 'meta' },
  { id: 'subjectCode', label: 'Fach-Kürzel', description: 'Amtliches Fachkürzel (z.B. E, M, D für SchILD)', category: 'meta' },
  { id: 'courseType', label: 'Kursart', description: 'Kursbezeichnung (z.B. GKM, GK, LK)', category: 'meta' },
  { id: 'finalGrade', label: 'Zeugnisnote', description: 'Festgesetzte Zeugnisnote (oder berechnete Note als Fallback)', category: 'grades' },
  { id: 'calculatedGrade', label: 'Berechnete Note', description: 'Mathematisch exakt berechnete Note', category: 'grades' },
  { id: 'gradePoints', label: 'Oberstufen-Punkte (0–15)', description: 'Punktzahl für gymnasiale Oberstufen & SchILD', category: 'grades' },
  { id: 'overallPercent', label: 'Gesamtleistung (%)', description: 'Gesamterreichter Prozentsatz', category: 'grades' },
  { id: 'remarks', label: 'Bemerkung', description: 'Zeugnisbemerkung oder pädagogische Notiz', category: 'meta' },
];

export interface ConfigurableExportOptions {
  format: ExportFormat;
  delimiter: ExportDelimiter;
  decimalSeparator: ExportDecimalSeparator;
  includeBom: boolean;
  presetId: ExportPresetId;
  selectedColumns: string[];
  term: TermFilterId;
  subjectCode?: string;
  courseType?: string;
}

export const DEFAULT_EXPORT_OPTIONS: ConfigurableExportOptions = {
  format: 'xlsx',
  delimiter: ';',
  decimalSeparator: ',',
  includeBom: true,
  presetId: 'standard',
  selectedColumns: ['nr', 'lastName', 'firstName', 'className', 'subject', 'finalGrade', 'calculatedGrade', 'overallPercent', 'remarks'],
  term: 'hj1',
};

/**
 * Splits a student's name into clean first and last name.
 * Respects official fields if set, otherwise heuristics for "Nachname, Vorname" or "Vorname Nachname".
 */
export function splitStudentName(stu: StudentProfile): { firstName: string; lastName: string } {
  if (stu.officialLastName !== undefined || stu.officialFirstName !== undefined) {
    return {
      lastName: stu.officialLastName || stu.name || '',
      firstName: stu.officialFirstName || '',
    };
  }
  const trimmed = (stu.name || '').trim();
  if (!trimmed) {
    return { firstName: '', lastName: '' };
  }
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    return {
      lastName: parts[0] || '',
      firstName: parts.slice(1).join(' ') || '',
    };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1] || '',
  };
}

/**
 * Formats a date string as German TT.MM.JJJJ (required by SchILD-NRW).
 */
export function formatGermanDate(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  }
  return trimmed;
}

/**
 * Converts a German grade or display string to Oberstufe 0-15 points if applicable.
 */
export function gradeToPoints(gradeStr: string, isAlreadyPoints: boolean = false): number | string {
  const trimmed = (gradeStr || '').trim();
  if (!trimmed) return '';
  if (isAlreadyPoints) {
    const num = parseInt(trimmed, 10);
    return !isNaN(num) && num >= 0 && num <= 15 ? num : trimmed;
  }
  // Standard 1-6 conversion table to 0-15 MSS-Punkte
  switch (trimmed) {
    case '1+': return 15;
    case '1': return 14;
    case '1-': return 13;
    case '2+': return 12;
    case '2': return 11;
    case '2-': return 10;
    case '3+': return 9;
    case '3': return 8;
    case '3-': return 7;
    case '4+': return 6;
    case '4': return 5;
    case '4-': return 4;
    case '5+': return 3;
    case '5': return 2;
    case '5-': return 1;
    case '6': return 0;
    default: {
      const num = parseInt(trimmed, 10);
      return !isNaN(num) && num >= 0 && num <= 15 ? num : '';
    }
  }
}

/**
 * Builds the tabular matrix (headers and cell rows) according to the configured preset and columns.
 */
export function buildExportTableData(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  options: ConfigurableExportOptions
): { headers: string[]; rows: Array<Array<string | number>> } {
  const activeTerm = options.term;
  const dec = options.decimalSeparator;

  // SchILD-NRW official 9-column export format
  if (options.presetId === 'schild_nrw') {
    const headers = [
      'Name',
      'Vorname',
      'Geburtsdatum',
      'Klasse',
      'Fach-Kürzel',
      'Kursart',
      'Note',
      'Punkte',
      'Zeugnisbemerkung',
    ];

    const subjectCode = options.subjectCode || dataset.subjectCode || dataset.shortName || dataset.subjectName.slice(0, 3).toUpperCase();
    const courseType = options.courseType || dataset.courseType || (dataset.config.scale_id === 'de_oberstufe_0_to_15' ? 'GKM' : '');

    const rows = dataset.students.map((stu) => {
      const { firstName, lastName } = splitStudentName(stu);
      const sum = report?.student_summaries.find((s) => s.student_id === stu.id);
      const override = dataset.reportCardOverrides?.[stu.id];
      const finalGrade =
        (activeTerm === 'hj1'
          ? override?.hj1
          : activeTerm === 'hj2'
          ? override?.hj2
          : override?.all) ||
        sum?.overall_display_grade ||
        '';

      const isPointsScale = dataset.config.scale_id === 'de_oberstufe_0_to_15';
      const gradeVal = isPointsScale ? '' : (finalGrade === '—' ? '' : finalGrade);
      const pointsVal = isPointsScale
        ? (finalGrade === '—' ? '' : finalGrade)
        : (finalGrade ? gradeToPoints(finalGrade, false) : '');

      const remark = override?.reason || stu.notes || '';

      return [
        lastName,
        firstName,
        formatGermanDate(stu.birthDate),
        dataset.className,
        subjectCode,
        courseType,
        gradeVal,
        pointsVal,
        remark,
      ];
    });

    return { headers, rows };
  }

  // Full Matrix preset (with all assessments & category averages)
  if (options.presetId === 'matrix_full') {
    const termAssessments = dataset.assessments.filter((a) =>
      activeTerm === 'all' ? true : a.term_id === activeTerm
    );

    const headers = [
      'Nr.',
      'Name',
      ...(dataset.config.enable_student_levels ? ['Niveau'] : []),
      ...termAssessments.map((a) => `${a.title} (%)`),
      ...dataset.categories.map((c) => `Ø ${c.short_code} (%)`),
      'Gesamt (%)',
      'Berechnete Note',
      'Festgesetzte Zeugnisnote',
      'Pädagogische Bemerkung',
    ];

    const rows = dataset.students.map((stu, idx) => {
      const sum = report?.student_summaries.find((s) => s.student_id === stu.id);
      const override = dataset.reportCardOverrides?.[stu.id];
      const finalGrade =
        (activeTerm === 'hj1'
          ? override?.hj1
          : activeTerm === 'hj2'
          ? override?.hj2
          : override?.all) ||
        sum?.overall_display_grade ||
        '—';

      const assessCells = termAssessments.map((a) => {
        const entry = dataset.grades.find(
          (g) => g.student_id === stu.id && g.assessment_id === a.id
        );
        if (!entry) return '';
        if (entry.status === 'excused') return 'Attest';
        if (entry.percent_value == null) return '';
        return dec === ','
          ? String(entry.percent_value).replace('.', ',')
          : entry.percent_value;
      });

      const catCells = dataset.categories.map((c) => {
        const cr = sum?.category_results.find((r) => r.category_id === c.id);
        if (cr?.average_percent == null) return '';
        const pctFormatted = dec === ','
          ? String(cr.average_percent).replace('.', ',')
          : cr.average_percent;
        return `${pctFormatted}% (${cr.display_grade})`;
      });

      const overallPct = sum?.overall_percent != null
        ? dec === ',' ? String(sum.overall_percent).replace('.', ',') : sum.overall_percent
        : '';

      return [
        idx + 1,
        stu.name,
        ...(dataset.config.enable_student_levels ? [stu.level || 'M'] : []),
        ...assessCells,
        ...catCells,
        overallPct,
        sum?.overall_display_grade ?? '—',
        finalGrade,
        override?.reason || stu.notes || '',
      ];
    });

    return { headers, rows };
  }

  // Standard or Custom Configurable Column Selection
  const activeColDefs = options.selectedColumns
    .map((colId) => AVAILABLE_EXPORT_COLUMNS.find((c) => c.id === colId))
    .filter((c): c is ExportColumnDefinition => Boolean(c));

  const headers = activeColDefs.map((c) => c.label);

  const rows = dataset.students.map((stu, idx) => {
    const { firstName, lastName } = splitStudentName(stu);
    const sum = report?.student_summaries.find((s) => s.student_id === stu.id);
    const override = dataset.reportCardOverrides?.[stu.id];
    const finalGrade =
      (activeTerm === 'hj1'
        ? override?.hj1
        : activeTerm === 'hj2'
        ? override?.hj2
        : override?.all) ||
      sum?.overall_display_grade ||
      '';

    const overallPct = sum?.overall_percent != null
      ? dec === ',' ? String(sum.overall_percent).replace('.', ',') : sum.overall_percent
      : '';

    const subjectCode = options.subjectCode || dataset.subjectCode || dataset.shortName || '';
    const courseType = options.courseType || dataset.courseType || '';

    return activeColDefs.map((col) => {
      switch (col.id) {
        case 'nr':
          return idx + 1;
        case 'name':
          return stu.name;
        case 'lastName':
          return lastName;
        case 'firstName':
          return firstName;
        case 'birthDate':
          return formatGermanDate(stu.birthDate);
        case 'studentId':
          return stu.studentId || '';
        case 'className':
          return dataset.className;
        case 'level':
          return stu.level || '';
        case 'subject':
          return dataset.subjectName;
        case 'subjectCode':
          return subjectCode;
        case 'courseType':
          return courseType;
        case 'finalGrade':
          return finalGrade;
        case 'calculatedGrade':
          return sum?.overall_display_grade || '';
        case 'gradePoints':
          return finalGrade ? gradeToPoints(finalGrade) : '';
        case 'overallPercent':
          return overallPct;
        case 'remarks':
          return override?.reason || stu.notes || '';
        default:
          return '';
      }
    });
  });

  return { headers, rows };
}

/**
 * Neutralizes spreadsheet formula injection (OWASP CSV/Formula Injection) in string cells.
 * Strings starting with `=`, `+`, `-`, or `@` (that are not plain numeric literals like `-5` or `-3,5`)
 * are prefixed with `'` so Excel and LibreOffice Calc treat them strictly as text.
 */
export function sanitizeSpreadsheetCell(val: unknown): string | number {
  if (val == null) return '';
  if (typeof val === 'number') return val;
  const str = String(val);
  if (/^[=+\-@]/.test(str) && !/^[+-]?\d+([.,]\d+)?%?$/.test(str.trim())) {
    return `'${str}`;
  }
  return str;
}

/**
 * Escapes a single value for CSV output according to RFC 4180 and neutralizes formula injection.
 */
export function escapeCsvCell(val: unknown, delimiter: string = ';'): string {
  if (val == null) return '';
  const str = String(sanitizeSpreadsheetCell(val));
  const needsQuotes =
    str.includes(delimiter) ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r');

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 CSV string with configurable delimiter and optional UTF-8 BOM.
 */
export function generateCsvContent(
  headers: string[],
  rows: Array<Array<string | number>>,
  delimiter: ExportDelimiter = ';',
  includeBom: boolean = true
): string {
  const headerLine = headers.map((h) => escapeCsvCell(h, delimiter)).join(delimiter);
  const rowLines = rows.map((row) =>
    row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter)
  );
  const body = [headerLine, ...rowLines].join('\r\n');
  return includeBom ? `\uFEFF${body}` : body;
}

/**
 * Efficiently converts a BlobPart (string, ArrayBuffer, Uint8Array, Blob) to a base64 string.
 */
export async function blobPartToBase64(content: BlobPart): Promise<string> {
  if (typeof content === 'string') {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(content, 'utf-8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(content)));
  }

  const blob = content instanceof Blob ? content : new Blob([content]);

  // Standard browser environment: use native FileReader.readAsDataURL (handles any binary Blob safely)
  if (typeof FileReader !== 'undefined') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const comma = res.indexOf(',');
        resolve(comma !== -1 ? res.slice(comma + 1) : res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Node.js test environment
  if (typeof Buffer !== 'undefined') {
    const buf = await blob.arrayBuffer();
    return Buffer.from(buf).toString('base64');
  }

  // Headless fallback
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Triggers a client-side file download or native share sheet:
 * - Native Tauri (Android / iOS): Writes file to disk via native_save_file and opens native system Share Sheet (Save to Downloads, Drive, etc.)
 * - Desktop Tauri: Saves file natively and opens it
 * - Mobile web browsers: Web Share API if supported
 * - Desktop browsers: Standard <a> tag download
 */
export async function triggerFileDownload(
  content: BlobPart,
  filename: string,
  mimeType: string,
  title?: string
): Promise<void> {
  // 1. Native Tauri application (Android, iOS, Desktop):
  if (isTauri()) {
    try {
      const base64 = await blobPartToBase64(content);
      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string>('native_save_file', {
        filename,
        contentBase64: base64,
      });

      // Mobile Tauri (Android & iOS): directly trigger native system Share Sheet!
      if (isMobileTauri() || isMobileDevice() || isAppleTouchDevice()) {
        try {
          await invoke('plugin:sharekit|share_file', {
            url: savedPath,
            mimeType,
            title: title || filename,
          });
          return;
        } catch (shareErr: any) {
          const errStr = String(shareErr || '');
          if (errStr.includes('cancelled') || shareErr?.name === 'AbortError') {
            return;
          }
          console.warn('[Download] Native sharekit failed, attempting opener:', shareErr);
        }
      }

      // Desktop Tauri: open the saved file via opener plugin
      if (isDesktopTauri()) {
        try {
          const { openPath } = await import('@tauri-apps/plugin-opener');
          await openPath(savedPath);
          return;
        } catch (openErr) {
          console.warn('[Download] Opener openPath failed:', openErr);
        }
      }
    } catch (tauriErr) {
      console.warn('[Download] Tauri native file handling failed, falling back to web download:', tauriErr);
    }
  }

  // 2. Web Share API (mobile web browsers supporting file sharing):
  const blob = new Blob([content], { type: mimeType });
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || filename,
        });
        return;
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') return;
      console.warn('[Download] Web Share failed, falling back to <a> tag:', shareErr);
    }
  }

  // 3. Fallback: Standard browser download via <a> tag
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports a configurable CSV or TXT table and triggers an automatic browser download or share sheet.
 */
export async function exportClassToCsv(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  options: ConfigurableExportOptions
): Promise<void> {
  const { headers, rows } = buildExportTableData(dataset, report, options);
  const csvContent = generateCsvContent(headers, rows, options.delimiter, options.includeBom);
  const ext = options.format === 'txt' ? 'txt' : 'csv';
  const mime = options.format === 'txt' ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8';
  const filename = `${dataset.subjectName}_${dataset.className}_${options.term.toUpperCase()}_${options.presetId}.${ext}`.replace(/\s+/g, '_');
  await triggerFileDownload(csvContent, filename, mime);
}

/**
 * Exports a configurable Excel (.xlsx) file using SheetJS and triggers browser download or share sheet.
 */
export async function exportConfigurableClassToXlsx(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  options: ConfigurableExportOptions
): Promise<void> {
  const XLSX = await import('@e965/xlsx');
  const { headers, rows } = buildExportTableData(dataset, report, options);
  const safeHeaders = headers.map((h) => sanitizeSpreadsheetCell(h));
  const safeRows = rows.map((r) => r.map((cell) => sanitizeSpreadsheetCell(cell)));

  const ws = XLSX.utils.aoa_to_sheet([safeHeaders, ...safeRows]);
  const wb = XLSX.utils.book_new();
  const sheetName = `${dataset.subjectName}_${dataset.className}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const filename = `${dataset.subjectName}_${dataset.className}_${options.term.toUpperCase()}_${options.presetId}.xlsx`.replace(/\s+/g, '_');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  await triggerFileDownload(wbout, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/**
 * Legacy convenience wrapper for backward-compatibility with existing code.
 */
export async function exportClassToXlsx(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  activeTerm: TermFilterId
) {
  return exportConfigurableClassToXlsx(dataset, report, {
    ...DEFAULT_EXPORT_OPTIONS,
    format: 'xlsx',
    presetId: 'matrix_full',
    term: activeTerm,
  });
}

/**
 * Escapes HTML special characters to prevent DOM-XSS in generated print/PDF documents.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips any inline <script>window.print();</script> tags to avoid double triggers or CSP issues.
 */
export function stripInlinePrintScripts(html: string): string {
  return html.replace(/<script[^>]*>\s*window\.print\(\);\s*<\/script>/gi, '');
}

/**
 * Converts an HTML document string to a high-resolution DIN A4 Portrait PDF Blob.
 * Uses jsPDF and html2canvas with high-DPI (scale: 2) rendering and auto-paging.
 */
export async function htmlToPdfBlob(htmlContent: string, title?: string): Promise<Blob> {
  const cleanHtml = stripInlinePrintScripts(htmlContent);

  // In headless/test environments without full DOM or canvas 2D support
  const hasCanvasSupport = (() => {
    try {
      if (typeof document === 'undefined' || typeof window === 'undefined') return false;
      if ('_virtualConsole' in window) return false;
      if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) return false;
      const canvas = document.createElement('canvas');
      return !!canvas.getContext && !!canvas.getContext('2d');
    } catch {
      return false;
    }
  })();

  if (!hasCanvasSupport) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    doc.setFontSize(16);
    doc.text(title || 'Gradus21 Dokument', 15, 20);
    doc.setFontSize(10);
    const plainText = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
    doc.text(plainText, 15, 30, { maxWidth: 180 });
    return doc.output('blob');
  }

  // Use a DOM container positioned inside the viewport coordinates (top: 0, left: 0)
  // but completely invisible to the user (z-index: -99999, opacity: 0.01) so that
  // html2canvas accurately computes positive bounding coordinates, fonts, and styles.
  const container = document.createElement('div');
  container.setAttribute(
    'style',
    'position:fixed;top:0;left:0;width:794px;min-width:794px;max-width:794px;min-height:1123px;z-index:-99999;opacity:0.01;pointer-events:none;background:#ffffff;color:#0f172a;overflow:visible;box-sizing:border-box;'
  );
  container.setAttribute('aria-hidden', 'true');
  container.innerHTML = cleanHtml;
  document.body.appendChild(container);

  try {
    // Small delay to allow the browser layout engine to parse DOM, styles and font metrics
    await new Promise((resolve) => setTimeout(resolve, 80));

    await import('html2canvas');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    let finished = false;
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };

      try {
        const promiseOrWorker = pdf.html(container, {
          callback: () => finish(),
          width: 190,
          windowWidth: 794,
          autoPaging: 'slice',
          margin: [10, 10, 10, 10],
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: 794,
            width: 794,
          },
        });

        if (promiseOrWorker && typeof (promiseOrWorker as any).then === 'function') {
          (promiseOrWorker as any).then(finish).catch(reject);
        }
      } catch (renderErr) {
        reject(renderErr);
      }
    });

    const pdfBlob = pdf.output('blob');
    if (pdfBlob && pdfBlob.size > 200) {
      return pdfBlob;
    }
    throw new Error('Generated PDF was empty or too small');
  } catch (err) {
    console.warn('[PDF] HTML-to-PDF rendering failed, fallback to plain text PDF:', err);
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    doc.setFontSize(16);
    doc.text(title || 'Gradus21 Dokument', 15, 20);
    doc.setFontSize(10);
    const plainText = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
    doc.text(plainText, 15, 30, { maxWidth: 180 });
    return doc.output('blob');
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Directly exports an HTML document as a downloadable or shareable DIN A4 PDF file.
 */
export async function exportPdfDocument(htmlContent: string, title: string = 'Dokument'): Promise<void> {
  const cleanFilename = (title.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'Dokument') + '.pdf';
  const pdfBlob = await htmlToPdfBlob(htmlContent, title);
  await triggerFileDownload(pdfBlob, cleanFilename, 'application/pdf', title);
}

/**
 * Universal print and document export helper.
 * Automatically converts documents to genuine DIN A4 Portrait PDF:
 * - Mobile apps (Android, iOS via Tauri):
 *   Generates true PDF, saves natively to cache, and triggers native system Share Sheet
 *   (enabling "Drucken" / AirPrint / Android Print Service, "In Dateien sichern", "In Google Drive speichern", WhatsApp, Mail)
 *   without any trapped in-app overlay window!
 * - Desktop Tauri: Saves PDF natively and opens it in default system PDF viewer
 * - Mobile web browsers: Web Share API if supported with PDF file, or direct PDF download
 * - Desktop browsers: Directly triggers the browser/OS print preview dialog via an offscreen iframe.
 */
export async function printHtmlDocument(htmlContent: string, title: string = 'Dokument'): Promise<void> {
  const cleanHtml = stripInlinePrintScripts(htmlContent);
  const cleanFilename = (title.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'Dokument') + '.pdf';

  // 1. Mobile native apps (Tauri Android / iOS):
  // Generate real PDF and directly open native system Share/Print sheet!
  if (isTauri() && (isMobileTauri() || isMobileDevice() || isAppleTouchDevice())) {
    try {
      const pdfBlob = await htmlToPdfBlob(cleanHtml, title);
      const base64 = await blobPartToBase64(pdfBlob);
      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string>('native_save_file', {
        filename: cleanFilename,
        contentBase64: base64,
      });

      try {
        await invoke('plugin:sharekit|share_file', {
          url: savedPath,
          mimeType: 'application/pdf',
          title: title,
        });
        return;
      } catch (shareErr: any) {
        const errStr = String(shareErr || '');
        if (errStr.includes('cancelled') || shareErr?.name === 'AbortError') {
          return;
        }
        console.warn('[Print] Native sharekit failed, falling back to print:', shareErr);
      }
    } catch (tauriErr) {
      console.warn('[Print] Native PDF save/share failed, falling back to web print:', tauriErr);
    }
  }

  // 2. Desktop Tauri: Save PDF and open in the system default PDF viewer
  if (isTauri() && isDesktopTauri()) {
    try {
      const pdfBlob = await htmlToPdfBlob(cleanHtml, title);
      const base64 = await blobPartToBase64(pdfBlob);
      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string>('native_save_file', {
        filename: cleanFilename,
        contentBase64: base64,
      });

      try {
        const { openPath } = await import('@tauri-apps/plugin-opener');
        await openPath(savedPath);
        return;
      } catch (openErr) {
        console.warn('[Print] Opener openPath failed on desktop Tauri:', openErr);
      }
    } catch (tauriErr) {
      console.warn('[Print] Desktop Tauri PDF generation failed, falling back to browser print:', tauriErr);
    }
  }

  // 3. Mobile web browsers / devices with Web Share API:
  if (isMobileDevice() || isAppleTouchDevice()) {
    try {
      const pdfBlob = await htmlToPdfBlob(cleanHtml, title);
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        const file = new File([pdfBlob], cleanFilename, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: title,
          });
          return;
        }
      }
      // If Web Share API is not available or does not support files, trigger PDF file download
      await triggerFileDownload(pdfBlob, cleanFilename, 'application/pdf', title);
      return;
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') return;
      console.warn('[Print] Mobile web PDF share/download failed, falling back to print:', shareErr);
    }
  }

  // 4. Desktop browsers:
  // Directly trigger the system print preview dialog via an offscreen iframe.
  if (typeof document !== 'undefined') {
    try {
      const iframe = document.createElement('iframe');
      iframe.setAttribute(
        'style',
        'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0.01;pointer-events:none;border:none;'
      );
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const cleanup = () => {
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 2000);
      };

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.warn('[Print] iframe print failed:', err);
            window.print();
          } finally {
            cleanup();
          }
        }, 250);
      };

      iframe.srcdoc = cleanHtml;
      return;
    } catch (err) {
      console.warn('[Print] Fallback to direct window.print:', err);
      window.print();
    }
  }
}

/**
 * Universal PDF delivery helper.
 * - Mobile apps (Android, iOS via Tauri):
 *   Generates genuine DIN A4 vector PDF, saves natively to app cache, and triggers native system Share Sheet
 *   (enabling "Drucken" / AirPrint / Android Print Service, "In Dateien sichern", "In Google Drive speichern", WhatsApp, Mail)
 *   without any trapped in-app overlay window!
 * - Desktop Tauri: Saves PDF natively and opens it in default system PDF viewer
 * - Mobile web browsers: Web Share API if supported with PDF file, or direct PDF download
 * - Desktop browsers: Directly triggers the browser/OS print preview dialog via an offscreen iframe if HTML fallback is provided,
 *   or triggers direct download of the vector PDF file.
 */
export async function deliverPdfDocument(
  doc: jsPDF,
  filename: string,
  title: string,
  htmlContentFallback?: string
): Promise<void> {
  const cleanFilename =
    (filename.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'Dokument') +
    (filename.endsWith('.pdf') ? '' : '.pdf');
  const pdfBlob = doc.output('blob');

  // 1. Mobile native apps (Tauri Android / iOS):
  if (isTauri() && (isMobileTauri() || isMobileDevice() || isAppleTouchDevice())) {
    try {
      const base64 = await blobPartToBase64(pdfBlob);
      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string>('native_save_file', {
        filename: cleanFilename,
        contentBase64: base64,
      });

      try {
        await invoke('plugin:sharekit|share_file', {
          url: savedPath,
          mimeType: 'application/pdf',
          title: title,
        });
        return;
      } catch (shareErr: any) {
        const errStr = String(shareErr || '');
        if (errStr.includes('cancelled') || shareErr?.name === 'AbortError') {
          return;
        }
        console.warn('[Print] Native sharekit failed, falling back to download:', shareErr);
      }
    } catch (tauriErr) {
      console.warn('[Print] Native PDF save/share failed, falling back to web download:', tauriErr);
    }
  }

  // 2. Desktop Tauri: Save PDF and open in the system default PDF viewer
  if (isTauri() && isDesktopTauri()) {
    try {
      const base64 = await blobPartToBase64(pdfBlob);
      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string>('native_save_file', {
        filename: cleanFilename,
        contentBase64: base64,
      });

      try {
        const { openPath } = await import('@tauri-apps/plugin-opener');
        await openPath(savedPath);
        return;
      } catch (openErr) {
        console.warn('[Print] Opener openPath failed on desktop Tauri:', openErr);
      }
    } catch (tauriErr) {
      console.warn('[Print] Desktop Tauri PDF generation failed, falling back to download:', tauriErr);
    }
  }

  // 3. Mobile web browsers / devices with Web Share API:
  if (isMobileDevice() || isAppleTouchDevice()) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        const file = new File([pdfBlob], cleanFilename, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: title,
          });
          return;
        }
      }
      await triggerFileDownload(pdfBlob, cleanFilename, 'application/pdf', title);
      return;
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') return;
      console.warn('[Print] Mobile web PDF share/download failed, falling back to download:', shareErr);
    }
  }

  // 4. Desktop browsers:
  // If htmlContentFallback is provided, trigger the browser print dialog via an offscreen iframe
  if (htmlContentFallback && typeof document !== 'undefined') {
    await printHtmlDocument(htmlContentFallback, title);
    return;
  }

  // Fallback: direct PDF download
  await triggerFileDownload(pdfBlob, cleanFilename, 'application/pdf', title);
}

/**
 * Builds the HTML markup for single-student report for Elterngespräche (used for desktop browser iframe print).
 */
export function generateStudentParentReportHtml(
  dataset: ClassroomSubjectDataset,
  student: StudentProfile,
  summary: StudentSummaryForExport | undefined,
  activeTerm: TermFilterId
): string {
  const termLabel =
    activeTerm === 'hj1'
      ? '1. Halbjahr'
      : activeTerm === 'hj2'
      ? '2. Halbjahr'
      : 'Gesamtes Schuljahr';
  const override = dataset.reportCardOverrides?.[student.id];
  const zeugnisNote =
    (activeTerm === 'hj1'
      ? override?.hj1
      : activeTerm === 'hj2'
      ? override?.hj2
      : override?.all) ||
    summary?.overall_display_grade ||
    '—';

  const studentGradesRows = dataset.assessments
    .filter((a) => (activeTerm === 'all' ? true : a.term_id === activeTerm))
    .map((a) => {
      const cat = dataset.categories.find((c) => c.id === a.category_id);
      const g = dataset.grades.find(
        (x) => x.student_id === student.id && x.assessment_id === a.id
      );
      const valStr =
        g?.status === 'excused'
          ? 'Entschuldigt (Attest)'
          : g?.percent_value != null
          ? `${escapeHtml(g.percent_value)}% (${escapeHtml(g.raw_points ?? '—')}/${escapeHtml(a.max_points ?? 15)} Pkt)`
          : '—';
      return `<tr>
        <td>${escapeHtml(a.title)}</td>
        <td>${escapeHtml(cat?.name || '')}</td>
        <td><strong>${valStr}</strong></td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Elterngesprächs-Bogen – ${escapeHtml(student.name)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 12px;
            line-height: 1.45;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0d9488;
            padding-bottom: 12px;
          }
          .badge {
            background: #ccfbf1;
            color: #0f766e;
            padding: 3px 8px;
            border-radius: 9999px;
            font-size: 10px;
            font-weight: 700;
            display: inline-block;
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }
          .student-name {
            margin: 6px 0 2px;
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
          }
          .meta-sub {
            color: #475569;
            font-size: 11.5px;
          }
          .grade-box {
            text-align: right;
            background: #f0fdfa;
            border: 1px solid #ccfbf1;
            border-radius: 10px;
            padding: 6px 12px;
          }
          .grade-label {
            font-size: 10px;
            color: #64748b;
            font-weight: 600;
          }
          .grade-value {
            font-size: 22px;
            font-weight: 800;
            color: #0d9488;
            margin-top: 2px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
            gap: 10px;
            margin: 14px 0;
          }
          .card {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px 12px;
            background: #f8fafc;
          }
          .card-label {
            font-size: 11px;
            color: #64748b;
            font-weight: 600;
          }
          .card-val {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 3px;
          }
          h3 {
            font-size: 13.5px;
            font-weight: 700;
            margin: 16px 0 6px;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            font-size: 11.5px;
          }
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          th, td {
            border-bottom: 1px solid #e2e8f0;
            padding: 7px 8px;
            text-align: left;
          }
          th {
            background: #f1f5f9;
            color: #334155;
            font-size: 10.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          tbody tr:nth-child(even) td {
            background-color: #fafafa;
          }
          .notes-box {
            margin-top: 16px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 12px;
            background: #f8fafc;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .sig-section {
            margin-top: 36px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #475569;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <span class="badge">Datenschutzkonformer Einzelbogen (Schüler:innen-360°-Akte)</span>
            <div class="student-name">${escapeHtml(student.name)} ${
    student.level ? `(Niveau ${escapeHtml(student.level)})` : ''
  }</div>
            <div class="meta-sub">
              ${escapeHtml(dataset.schoolName)} · ${escapeHtml(dataset.className)} · Fach: <strong>${escapeHtml(
    dataset.subjectName
  )}</strong> · ${escapeHtml(termLabel)} (${escapeHtml(dataset.schoolYear)})
            </div>
          </div>
          <div class="grade-box">
            <div class="grade-label">Berechneter Stand / Note</div>
            <div class="grade-value">
              ${summary?.overall_percent != null ? `${escapeHtml(summary.overall_percent)}%` : ''} · Note ${escapeHtml(zeugnisNote)}
            </div>
          </div>
        </div>

        <div class="summary-grid">
          ${(summary?.category_results || [])
            .map(
              (cr) => `
            <div class="card">
              <div class="card-label">${escapeHtml(cr.category_name)} (${escapeHtml(cr.effective_weight_percent)}%)</div>
              <div class="card-val">
                ${cr.average_percent != null ? `${escapeHtml(cr.average_percent)}% · Note ${escapeHtml(cr.display_grade)}` : '—'}
              </div>
            </div>`
            )
            .join('')}
        </div>

        <h3>Einzelleistungen (${escapeHtml(termLabel)})</h3>
        <table>
          <thead>
            <tr><th>Leistungsnachweis</th><th>Kategorie</th><th>Ergebnis</th></tr>
          </thead>
          <tbody>${studentGradesRows}</tbody>
        </table>

        <div class="notes-box">
          <strong>Pädagogische Bemerkungen & Förderhinweise:</strong>
          <p style="margin: 6px 0 0; font-size: 12px; color: #334155;">
            ${escapeHtml(override?.reason || student.notes || 'Keine besonderen Vermerke hinterlegt.')}
          </p>
        </div>

        <div class="sig-section">
          <div>________________________________________<br/>Datum, Unterschrift Lehrkraft</div>
          <div>________________________________________<br/>Kenntnisnahme Erziehungsberechtigte/r</div>
        </div>
      </body>
    </html>`;
}

/**
 * Directly generates a genuine, high-resolution vector DIN A4 Portrait PDF for the Elterngesprächs-Bogen.
 * Fits on 1 single DIN A4 page, zero viewport clipping, razor-sharp typography.
 */
export function generateStudentParentReportPdf(
  dataset: ClassroomSubjectDataset,
  student: StudentProfile,
  summary: StudentSummaryForExport | undefined,
  activeTerm: TermFilterId
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  const termLabel =
    activeTerm === 'hj1'
      ? '1. Halbjahr'
      : activeTerm === 'hj2'
      ? '2. Halbjahr'
      : 'Gesamtes Schuljahr';

  const override = dataset.reportCardOverrides?.[student.id];
  const zeugnisNote =
    (activeTerm === 'hj1'
      ? override?.hj1
      : activeTerm === 'hj2'
      ? override?.hj2
      : override?.all) ||
    summary?.overall_display_grade ||
    '—';

  // 1. Top Header Badge
  doc.setFillColor(204, 251, 241); // #ccfbf1 light teal
  doc.roundedRect(margin, 12, 102, 5.5, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 118, 110); // #0f766e
  doc.text('DATENSCHUTZKONFORMER EINZELBOGEN (360°-AKTE)', margin + 3, 16);

  // 2. Student Name & Metadata (Left)
  const studentTitle = `${student.name}${student.level ? ` (Niveau ${student.level})` : ''}`;
  doc.setFont('helvetica', 'bold');
  let nameFontSize = 16;
  doc.setFontSize(nameFontSize);
  while (nameFontSize > 10 && doc.getTextWidth(studentTitle) > 124) {
    nameFontSize -= 0.5;
    doc.setFontSize(nameFontSize);
  }
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.text(studentTitle, margin, 24);

  const metaSubtitle = `${dataset.schoolName} · Klasse ${dataset.className} · Fach: ${dataset.subjectName} · ${termLabel} (${dataset.schoolYear})`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // #475569
  const truncatedMeta =
    doc.getTextWidth(metaSubtitle) > 124
      ? doc.splitTextToSize(metaSubtitle, 124)[0] + '…'
      : metaSubtitle;
  doc.text(truncatedMeta, margin, 29);

  // 3. Grade Box (Top Right)
  const boxWidth = 50;
  const boxHeight = 17;
  const boxX = pageWidth - margin - boxWidth;
  const boxY = 12.5;

  doc.setFillColor(240, 253, 250); // #f0fdfa
  doc.setDrawColor(204, 251, 241); // #ccfbf1
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139); // #64748b
  doc.text('BERECHNETER STAND / NOTE', boxX + boxWidth / 2, boxY + 4.8, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(13, 148, 136); // #0d9488
  const gradeStr =
    summary?.overall_percent != null
      ? `${summary.overall_percent}% · Note ${zeugnisNote}`
      : `Note ${zeugnisNote}`;
  doc.text(gradeStr, boxX + boxWidth / 2, boxY + 12.2, { align: 'center' });

  // 4. Teal Divider Line
  doc.setDrawColor(13, 148, 136);
  doc.setLineWidth(0.4);
  doc.line(margin, 34, pageWidth - margin, 34);

  // 5. Category Summary Cards
  const catResults = summary?.category_results || [];
  let nextSectionY = 38;

  if (catResults.length > 0) {
    const catCardGap = 3;
    const catCardWidth = (contentWidth - (catResults.length - 1) * catCardGap) / catResults.length;
    const catCardHeight = 13;
    const catCardY = 38;

    catResults.forEach((cr, idx) => {
      const cardX = margin + idx * (catCardWidth + catCardGap);
      doc.setFillColor(248, 250, 252); // #f8fafc
      doc.setDrawColor(226, 232, 240); // #e2e8f0
      doc.setLineWidth(0.2);
      doc.roundedRect(cardX, catCardY, catCardWidth, catCardHeight, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      let catLabel = `${cr.category_name} (${cr.effective_weight_percent}%)`;
      if (doc.getTextWidth(catLabel) > catCardWidth - 4) {
        catLabel = `${cr.category_name.slice(0, 12)}… (${cr.effective_weight_percent}%)`;
      }
      doc.text(catLabel, cardX + 2.5, catCardY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      const valStr =
        cr.average_percent != null
          ? `${cr.average_percent}% · Note ${cr.display_grade}`
          : '—';
      doc.text(valStr, cardX + 2.5, catCardY + 10);
    });

    nextSectionY = catCardY + catCardHeight + 5;
  }

  // 6. Einzelleistungen Section & Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Einzelleistungen (${termLabel})`, margin, nextSectionY);

  const filteredAssessments = dataset.assessments.filter((a) =>
    activeTerm === 'all' ? true : a.term_id === activeTerm
  );

  const tableRows = filteredAssessments.map((a) => {
    const cat = dataset.categories.find((c) => c.id === a.category_id);
    const g = dataset.grades.find(
      (x) => x.student_id === student.id && x.assessment_id === a.id
    );
    const valStr =
      g?.status === 'excused'
        ? 'Entschuldigt (Attest)'
        : g?.percent_value != null
        ? `${g.percent_value}% (${g.raw_points ?? '—'}/${a.max_points ?? 15} Pkt)`
        : '—';
    return [a.title || 'Leistungsnachweis', cat?.name || '—', valStr];
  });

  if (tableRows.length === 0) {
    tableRows.push(['Keine Leistungsnachweise in diesem Zeitraum eingetragen', '—', '—']);
  }

  autoTable(doc, {
    startY: nextSectionY + 2.5,
    margin: { left: margin, right: margin },
    head: [['LEISTUNGSNACHWEIS', 'KATEGORIE', 'ERGEBNIS']],
    body: tableRows,
    theme: 'plain',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
    },
    bodyStyles: {
      textColor: [15, 23, 42],
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 92 },
      1: { cellWidth: 45 },
      2: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalTableY = (doc as any).lastAutoTable?.finalY ?? nextSectionY + 30;

  // 7. Pedagogical Remarks Box
  let remarksY = finalTableY + 5;
  const remarksText =
    override?.reason ||
    student.notes ||
    'Keine besonderen Vermerke hinterlegt.';
  const splitRemarks = doc.splitTextToSize(remarksText, contentWidth - 6);
  const remarksBoxHeight = Math.max(14, 7 + splitRemarks.length * 3.8);

  if (remarksY + remarksBoxHeight + 25 > pageHeight - 12) {
    doc.addPage();
    remarksY = 14;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, remarksY, contentWidth, remarksBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Pädagogische Bemerkungen & Förderhinweise:', margin + 3, remarksY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(splitRemarks, margin + 3, remarksY + 8.5);

  // 8. Signature Lines
  const sigBoxY = remarksY + remarksBoxHeight;
  let sigY = Math.max(sigBoxY + 12, 262);
  if (sigBoxY + 22 > pageHeight - 14) {
    doc.addPage();
    sigY = 262;
  }

  doc.setDrawColor(148, 163, 184); // #94a3b8
  doc.setLineWidth(0.3);
  doc.line(margin, sigY, margin + 65, sigY);
  doc.line(pageWidth - margin - 65, sigY, pageWidth - margin, sigY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Datum, Unterschrift Lehrkraft', margin, sigY + 4);
  doc.text('Kenntnisnahme Erziehungsberechtigte/r', pageWidth - margin - 65, sigY + 4);

  // 9. Page Footers (on all pages)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Seite ${i} von ${totalPages} · Erstellt mit Gradus21 · Datenschutzkonform nach Art. 5 DSGVO`,
      pageWidth / 2,
      pageHeight - 7,
      { align: 'center' }
    );
  }

  return doc;
}

/**
 * Opens a clean, privacy-safe single-student report for Elterngespräche (Print / Save as PDF).
 * Fully optimized for DIN A4 Portrait.
 */
export async function printStudentParentReport(
  dataset: ClassroomSubjectDataset,
  student: StudentProfile,
  summary: StudentSummaryForExport | undefined,
  activeTerm: TermFilterId
): Promise<void> {
  const doc = generateStudentParentReportPdf(dataset, student, summary, activeTerm);
  const docHtml = generateStudentParentReportHtml(dataset, student, summary, activeTerm);
  await deliverPdfDocument(
    doc,
    `Elterngesprächs-Bogen – ${student.name}`,
    `Elterngesprächs-Bogen – ${student.name}`,
    docHtml
  );
}

/**
 * Builds the HTML markup for Zeugniskonferenz-Liste (used for desktop browser iframe print).
 */
export function generateClassConferenceReportHtml(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  activeTerm: TermFilterId
): string {
  const termLabel =
    activeTerm === 'hj1'
      ? '1. Halbjahr'
      : activeTerm === 'hj2'
      ? '2. Halbjahr'
      : 'Gesamtjahr';

  const rowsHtml = dataset.students
    .map((stu, idx) => {
      const sum = report?.student_summaries.find((s) => s.student_id === stu.id);
      const override = dataset.reportCardOverrides?.[stu.id];
      const zeugnisNote =
        (activeTerm === 'hj1'
          ? override?.hj1
          : activeTerm === 'hj2'
          ? override?.hj2
          : override?.all) ||
        sum?.overall_display_grade ||
        '—';

      return `<tr>
        <td class="col-num">${idx + 1}</td>
        <td class="col-name">${escapeHtml(stu.name)}</td>
        ${dataset.config.enable_student_levels ? `<td class="col-level">${escapeHtml(stu.level || 'M')}</td>` : ''}
        ${dataset.categories
          .map((c) => {
            const cr = sum?.category_results.find((r) => r.category_id === c.id);
            return `<td class="col-cat">${
              cr?.average_percent != null
                ? `${escapeHtml(cr.average_percent)}% (${escapeHtml(cr.display_grade)})`
                : '—'
            }</td>`;
          })
          .join('')}
        <td class="col-calc">${
          sum?.overall_percent != null
            ? `${escapeHtml(sum.overall_percent)}% (${escapeHtml(sum.overall_display_grade)})`
            : '—'
        }</td>
        <td class="col-grade">${escapeHtml(zeugnisNote)}</td>
        <td class="col-notes">${escapeHtml(override?.reason || stu.notes || '')}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Zeugniskonferenz-Liste – ${escapeHtml(dataset.className)} ${escapeHtml(dataset.subjectName)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 12mm 12mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 11px;
            line-height: 1.35;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header-box {
            border-bottom: 2px solid #0d9488;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .header-title {
            margin: 0 0 4px;
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.3px;
          }
          .meta-info {
            font-size: 11px;
            color: #475569;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 6px;
          }
          .meta-pill {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            padding: 2px 7px;
            border-radius: 6px;
            font-weight: 600;
            color: #1e293b;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            font-size: 10.5px;
            table-layout: auto;
          }
          thead {
            display: table-header-group;
          }
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          th, td {
            border-bottom: 1px solid #e2e8f0;
            padding: 5px 4px;
            text-align: left;
            vertical-align: middle;
          }
          th {
            background: #f8fafc;
            color: #334155;
            font-size: 10px;
            font-weight: 700;
            border-top: 1px solid #cbd5e1;
            border-bottom: 1.5px solid #94a3b8;
            white-space: nowrap;
          }
          tbody tr:nth-child(even) td {
            background-color: #f8fafc;
          }
          .col-num {
            width: 22px;
            text-align: center;
            color: #64748b;
            font-size: 9.5px;
          }
          .col-name {
            font-weight: 700;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 140px;
          }
          .col-level {
            width: 32px;
            text-align: center;
            font-weight: 600;
            color: #0284c7;
          }
          .col-cat {
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-size: 10px;
            color: #334155;
            white-space: nowrap;
          }
          .col-calc {
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-size: 10px;
            color: #475569;
            white-space: nowrap;
          }
          .col-grade {
            text-align: center;
            font-weight: 800;
            font-size: 12px;
            color: #0f766e;
            background: #f0fdfa !important;
            border-left: 1px solid #ccfbf1;
            border-right: 1px solid #ccfbf1;
          }
          .col-notes {
            font-size: 9.5px;
            color: #64748b;
            word-break: break-word;
            max-width: 130px;
          }
          .footer-sig {
            margin-top: 28px;
            display: flex;
            justify-content: space-between;
            font-size: 10.5px;
            color: #64748b;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div class="header-title">Zeugniskonferenz-Bogen: ${escapeHtml(dataset.className)} – ${escapeHtml(dataset.subjectName)}</div>
          <div class="meta-info">
            <span>${escapeHtml(dataset.schoolName)} · Schuljahr: ${escapeHtml(dataset.schoolYear)} · <strong>${escapeHtml(termLabel)}</strong></span>
            <span class="meta-pill">Klassenschnitt: ${escapeHtml(report?.class_average_percent ?? '—')}% (Ø ${escapeHtml(report?.class_display_grade ?? '—')})</span>
          </div>
          <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
            Notenspiegel (1–6): [${(report?.distribution_buckets || [0, 0, 0, 0, 0, 0]).map((n) => escapeHtml(n)).join(' / ')}]
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th>Name</th>
              ${dataset.config.enable_student_levels ? '<th class="col-level">Niv.</th>' : ''}
              ${dataset.categories.map((c) => `<th class="col-cat">Ø ${escapeHtml(c.short_code)}</th>`).join('')}
              <th class="col-calc">Berechnet</th>
              <th class="col-grade">Zeugnis</th>
              <th class="col-notes">Bemerkung / Begründung</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="footer-sig">
          <div>________________________________________<br/>Datum, Leitung Zeugniskonferenz</div>
          <div>________________________________________<br/>Klassenleitung / Protokoll</div>
        </div>
      </body>
    </html>`;
}

/**
 * Directly generates a genuine, high-resolution vector DIN A4 Portrait PDF for the Zeugniskonferenz-Liste.
 * Dynamic column sizing, zebra stripes, repeated headers across pages, razor-sharp typography.
 */
export function generateClassConferenceReportPdf(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  activeTerm: TermFilterId
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;

  const termLabel =
    activeTerm === 'hj1'
      ? '1. Halbjahr'
      : activeTerm === 'hj2'
      ? '2. Halbjahr'
      : 'Gesamtjahr';

  // 1. Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.text(`Zeugniskonferenz: ${dataset.className} – ${dataset.subjectName}`, margin, 14);

  // Subtitle / School Meta
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`${dataset.schoolName} · Schuljahr: ${dataset.schoolYear} · ${termLabel}`, margin, 19);

  // Class Stats (Right Aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 118, 110);
  const avgStr = `Klassenschnitt: ${report?.class_average_percent ?? '—'}% (Ø ${report?.class_display_grade ?? '—'})`;
  doc.text(avgStr, pageWidth - margin, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const buckets = (report?.distribution_buckets || [0, 0, 0, 0, 0, 0]).join(' / ');
  doc.text(`Notenspiegel (1–6): [ ${buckets} ]`, pageWidth - margin, 19, { align: 'right' });

  // Teal line
  doc.setDrawColor(13, 148, 136);
  doc.setLineWidth(0.4);
  doc.line(margin, 22, pageWidth - margin, 22);

  // 2. Table Headers & Body
  const enableLevels = !!dataset.config.enable_student_levels;
  const catColumns = dataset.categories.map((c) => `Ø ${c.short_code || c.name}`);
  const headers = [
    '#',
    'Name',
    ...(enableLevels ? ['Niv.'] : []),
    ...catColumns,
    'Berechnet',
    'Zeugnis',
    'Bemerkung / Begründung',
  ];

  const studentsRows = dataset.students.map((stu, idx) => {
    const sum = report?.student_summaries.find((s) => s.student_id === stu.id);
    const override = dataset.reportCardOverrides?.[stu.id];
    const zeugnisNote =
      (activeTerm === 'hj1'
        ? override?.hj1
        : activeTerm === 'hj2'
        ? override?.hj2
        : override?.all) ||
      sum?.overall_display_grade ||
      '—';

    const catValues = dataset.categories.map((c) => {
      const cr = sum?.category_results.find((r) => r.category_id === c.id);
      return cr?.average_percent != null
        ? `${cr.average_percent}% (${cr.display_grade})`
        : '—';
    });

    const calcStr =
      sum?.overall_percent != null
        ? `${sum.overall_percent}% (${sum.overall_display_grade})`
        : '—';

    const noteReason = override?.reason || stu.notes || '';

    return [
      String(idx + 1),
      stu.name,
      ...(enableLevels ? [stu.level || 'M'] : []),
      ...catValues,
      calcStr,
      zeugnisNote,
      noteReason,
    ];
  });

  // Dynamic Column Styles
  const colStyles: Record<number, any> = {
    0: { cellWidth: 7, halign: 'center' },
    1: { cellWidth: 38, fontStyle: 'bold' },
  };

  let colIdx = 2;
  if (enableLevels) {
    colStyles[colIdx] = { cellWidth: 9, halign: 'center', textColor: [2, 132, 199] };
    colIdx++;
  }

  // Categories (width ~16mm each)
  dataset.categories.forEach(() => {
    colStyles[colIdx] = { cellWidth: 16, halign: 'right' };
    colIdx++;
  });

  // Berechnet
  colStyles[colIdx] = { cellWidth: 18, halign: 'right' };
  colIdx++;

  // Zeugnis (highlighted)
  const zeugnisColIdx = colIdx;
  colStyles[zeugnisColIdx] = {
    cellWidth: 15,
    halign: 'center',
    fontStyle: 'bold',
    textColor: [15, 118, 110],
    fillColor: [240, 253, 250],
  };
  colIdx++;

  // Bemerkung (remaining auto)
  colStyles[colIdx] = { cellWidth: 'auto' };

  autoTable(doc, {
    startY: 25,
    margin: { left: margin, right: margin, top: 14, bottom: 14 },
    head: [headers],
    body: studentsRows,
    theme: 'plain',
    showHead: 'everyPage',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
    },
    bodyStyles: {
      textColor: [15, 23, 42],
      fontSize: 7.5,
      cellPadding: { top: 1.8, bottom: 1.8, left: 1.5, right: 1.5 },
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: colStyles,
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 200;
  const sigY = Math.min(Math.max(finalY + 12, 262), 275);

  if (finalY + 22 <= pageHeight - 14) {
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(margin, sigY, margin + 65, sigY);
    doc.line(pageWidth - margin - 65, sigY, pageWidth - margin, sigY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Datum, Leitung Zeugniskonferenz', margin, sigY + 4);
    doc.text('Klassenleitung / Protokoll', pageWidth - margin - 65, sigY + 4);
  }

  // Page Footers (all pages)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Zeugniskonferenz ${dataset.className} – ${dataset.subjectName} · Seite ${i} von ${totalPages} · Gradus21`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  return doc;
}

/**
 * Opens a print-ready Zeugniskonferenz-Liste (Print / Save as PDF).
 * Fully optimized for DIN A4 Portrait.
 */
export async function printClassConferenceReport(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  activeTerm: TermFilterId
): Promise<void> {
  const doc = generateClassConferenceReportPdf(dataset, report, activeTerm);
  const docHtml = generateClassConferenceReportHtml(dataset, report, activeTerm);
  await deliverPdfDocument(
    doc,
    `Zeugniskonferenz – ${dataset.className} ${dataset.subjectName}`,
    `Zeugniskonferenz – ${dataset.className} ${dataset.subjectName}`,
    docHtml
  );
}
