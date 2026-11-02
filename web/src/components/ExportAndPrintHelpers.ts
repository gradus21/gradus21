import {
  ClassroomSubjectDataset,
  StudentProfile,
  TermFilterId,
} from '../data/demoClasses';
import { isAppleTouchDevice, isMobileDevice, isTauri } from '../utils/platform';

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
 * Escapes a single value for CSV output according to RFC 4180.
 */
export function escapeCsvCell(val: unknown, delimiter: string): string {
  if (val == null) return '';
  const str = String(val);
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
 * Triggers a client-side file download via Web Share API (mobile/touch) or standard Blob download (desktop).
 */
export async function triggerFileDownload(content: BlobPart, filename: string, mimeType: string): Promise<void> {
  const blob = new Blob([content], { type: mimeType });

  // 1. Mobile touch devices / platforms with Web Share API:
  // Allows user to tap "In Dateien sichern" (Save to Files), AirDrop, Mail, iCloud Drive, etc.
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        return;
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        // User deliberately cancelled the native share sheet
        return;
      }
      console.warn('[Download] Web Share failed, falling back to <a> tag:', shareErr);
    }
  }

  // 2. Fallback: Standard browser download via <a> tag
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

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
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
 * Universal print and document export helper.
 * Supports:
 * - Desktop browsers: Standard window.print()
 * - Mobile devices (iOS/iPadOS/Android) & Tauri: In-app modal viewer with Print and Web Share API ("Save to Files", AirDrop, etc.)
 */
export function printHtmlDocument(htmlContent: string, title: string = 'Dokument'): void {
  const cleanHtml = stripInlinePrintScripts(htmlContent);

  // 1. On standard desktop browsers (not mobile and not Tauri native app),
  // try standard window.open printing first.
  if (!isAppleTouchDevice() && !isMobileDevice() && !isTauri()) {
    try {
      const win = window.open('', '_blank', 'width=900,height=800');
      if (win && win.document) {
        win.document.open();
        win.document.write(cleanHtml);
        win.document.close();
        win.focus();
        setTimeout(() => {
          try {
            win?.print();
          } catch (e) {
            console.warn('[Print] Native window.print failed:', e);
          }
        }, 300);
        return;
      }
    } catch (e) {
      console.warn('[Print] window.open failed, displaying interactive document preview:', e);
    }
  }

  // 2. On Mobile (iOS / iPadOS / Android), Tauri native webview, or if window.open was blocked:
  // Render an interactive in-app Document Print & Share sheet.
  showDocumentPrintSheet(cleanHtml, title);
}

/**
 * Displays an interactive in-app modal sheet rendering the document with options
 * to trigger native AirPrint/Print or share/save via the native Web Share API (Save to Files / AirDrop).
 */
export function showDocumentPrintSheet(cleanHtml: string, title: string): void {
  if (typeof document === 'undefined') return;

  // Remove existing sheet if open
  const oldRoot = document.getElementById('gradus21-print-sheet-root');
  if (oldRoot) oldRoot.remove();

  const root = document.createElement('div');
  root.id = 'gradus21-print-sheet-root';
  root.className = 'fixed inset-0 z-[9999] flex flex-col bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 select-none';

  const modal = document.createElement('div');
  modal.className = 'relative flex-1 flex flex-col w-full max-w-4xl mx-auto my-0 sm:my-6 bg-white dark:bg-slate-900 sm:rounded-3xl shadow-2xl overflow-hidden border-0 sm:border border-slate-200 dark:border-slate-800';

  // Safe header
  const header = document.createElement('div');
  header.className = 'px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/95 dark:bg-slate-900/95 shrink-0';
  header.style.paddingTop = 'max(0.75rem, env(safe-area-inset-top, 0px))';

  header.innerHTML = `
    <div class="flex flex-col min-w-0 pr-2">
      <span class="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider">Druckvorschau & Export</span>
      <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">${escapeHtml(title)}</h3>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <button id="gradus21-sheet-share-top" class="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-[0.98]">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        <span>Teilen / Sichern</span>
      </button>
      <button id="gradus21-sheet-print-top" class="hidden sm:flex px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold items-center gap-1.5 transition active:scale-[0.98]">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        <span>Drucken</span>
      </button>
      <button id="gradus21-sheet-close-top" class="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition" aria-label="Schließen">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `;

  // Body with Iframe
  const body = document.createElement('div');
  body.className = 'flex-1 w-full bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center';

  const iframe = document.createElement('iframe');
  iframe.id = 'gradus21-sheet-iframe';
  iframe.className = 'w-full h-full bg-white rounded-xl shadow border border-slate-200 dark:border-slate-800';
  iframe.srcdoc = cleanHtml;
  body.appendChild(iframe);

  // Footer for mobile & quick action
  const footer = document.createElement('div');
  footer.className = 'p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0';
  footer.style.paddingBottom = 'max(0.75rem, env(safe-area-inset-bottom, 0px))';

  footer.innerHTML = `
    <p class="text-[11px] text-slate-500 text-center sm:text-left leading-normal">
      Tipp: Über <strong>„Teilen / Sichern“</strong> kannst du das Dokument per AirDrop versenden, drucken oder in <strong>Apple Dateien / Google Drive</strong> sichern.
    </p>
    <div class="flex items-center gap-2 w-full sm:w-auto">
      <button id="gradus21-sheet-print-bottom" class="sm:hidden flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.98]">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        <span>Drucken</span>
      </button>
      <button id="gradus21-sheet-share-bottom" class="sm:hidden flex-1 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98]">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        <span>Teilen / Sichern</span>
      </button>
      <button id="gradus21-sheet-close-bottom" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition">
        Schließen
      </button>
    </div>
  `;

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  root.appendChild(modal);
  document.body.appendChild(root);

  // Handlers
  const close = () => {
    document.removeEventListener('keydown', handleKey);
    root.remove();
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', handleKey);

  const triggerPrint = () => {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } else {
        window.print();
      }
    } catch (err) {
      console.warn('[Print] iframe print failed:', err);
      window.print();
    }
  };

  const triggerShare = async () => {
    const filename = (title.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'Dokument') + '.html';
    await triggerFileDownload(cleanHtml, filename, 'text/html;charset=utf-8');
  };

  // Wire buttons
  root.querySelector('#gradus21-sheet-close-top')?.addEventListener('click', close);
  root.querySelector('#gradus21-sheet-close-bottom')?.addEventListener('click', close);
  root.querySelector('#gradus21-sheet-print-top')?.addEventListener('click', triggerPrint);
  root.querySelector('#gradus21-sheet-print-bottom')?.addEventListener('click', triggerPrint);
  root.querySelector('#gradus21-sheet-share-top')?.addEventListener('click', triggerShare);
  root.querySelector('#gradus21-sheet-share-bottom')?.addEventListener('click', triggerShare);
}

/**
 * Opens a clean, privacy-safe single-student report for Elterngespräche (Print / Save as PDF)
 */
export function printStudentParentReport(
  dataset: ClassroomSubjectDataset,
  student: StudentProfile,
  summary: StudentSummaryForExport | undefined,
  activeTerm: TermFilterId
) {
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

  const docHtml = `<!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Elterngesprächs-Bogen – ${escapeHtml(student.name)}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0f1d22; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0d9488; padding-bottom: 16px; }
          .badge { background: #ccfbf1; color: #0f766e; padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: bold; }
          .summary-box { display: flex; gap: 16px; margin: 20px 0; }
          .card { flex: 1; border: 1px solid #dce7e7; border-radius: 12px; padding: 14px; background: #f8fafa; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { border-bottom: 1px solid #dce7e7; padding: 9px 8px; text-align: left; }
          th { background: #eef5f5; color: #4a636b; }
          .sig { margin-top: 48px; display: flex; justify-content: space-between; font-size: 12px; color: #4a636b; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <span class="badge">Datenschutzkonformer Einzelbogen (Schüler:innen-360°-Akte)</span>
            <h1 style="margin: 8px 0 4px; font-size: 22px;">${escapeHtml(student.name)} ${
    student.level ? `(Niveau ${escapeHtml(student.level)})` : ''
  }</h1>
            <div style="color:#4a636b; font-size:13px;">
              ${escapeHtml(dataset.schoolName)} · ${escapeHtml(dataset.className)} · Fach: <strong>${escapeHtml(
    dataset.subjectName
  )}</strong> · ${escapeHtml(termLabel)} (${escapeHtml(dataset.schoolYear)})
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px; color:#4a636b;">Berechneter Stand / Zeugnisnote</div>
            <div style="font-size:26px; font-weight:800; color:#0d9488;">
              ${summary?.overall_percent != null ? `${escapeHtml(summary.overall_percent)}%` : ''} · Note ${escapeHtml(zeugnisNote)}
            </div>
          </div>
        </div>

        <div class="summary-box">
          ${(summary?.category_results || [])
            .map(
              (cr) => `
            <div class="card">
              <div style="font-size:12px; color:#4a636b;">${escapeHtml(cr.category_name)} (Gewicht ${escapeHtml(cr.effective_weight_percent)}%)</div>
              <div style="font-size:18px; font-weight:bold; margin-top:4px;">
                ${cr.average_percent != null ? `${escapeHtml(cr.average_percent)}% · Note ${escapeHtml(cr.display_grade)}` : '—'}
              </div>
            </div>`
            )
            .join('')}
        </div>

        <h3 style="font-size:15px; margin-top:20px;">Einzelleistungen (${escapeHtml(termLabel)})</h3>
        <table>
          <thead>
            <tr><th>Leistungsnachweis</th><th>Kategorie</th><th>Ergebnis</th></tr>
          </thead>
          <tbody>${studentGradesRows}</tbody>
        </table>

        <div class="card" style="margin-top:20px;">
          <strong>Pädagogische Bemerkungen & Förderhinweise:</strong>
          <p style="margin:6px 0 0; font-size:13px;">
            ${escapeHtml(override?.reason || student.notes || 'Keine besonderen Vermerke.')}
          </p>
        </div>

        <div class="sig">
          <div>________________________________________<br/>Datum, Unterschrift Lehrkraft</div>
          <div>________________________________________<br/>Kenntnisnahme Erziehungsberechtigte/r</div>
        </div>
      </body>
    </html>`;

  printHtmlDocument(docHtml, `Elterngesprächs-Bogen – ${student.name}`);
}

/**
 * Opens a print-ready Zeugniskonferenz-Liste (Print / Save as PDF)
 */
export function printClassConferenceReport(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  activeTerm: TermFilterId
) {
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
        <td>${idx + 1}</td>
        <td><strong>${escapeHtml(stu.name)}</strong></td>
        ${dataset.config.enable_student_levels ? `<td>${escapeHtml(stu.level || 'M')}</td>` : ''}
        ${dataset.categories
          .map((c) => {
            const cr = sum?.category_results.find((r) => r.category_id === c.id);
            return `<td>${
              cr?.average_percent != null
                ? `${escapeHtml(cr.average_percent)}% (${escapeHtml(cr.display_grade)})`
                : '—'
            }</td>`;
          })
          .join('')}
        <td>${
          sum?.overall_percent != null
            ? `${escapeHtml(sum.overall_percent)}% (${escapeHtml(sum.overall_display_grade)})`
            : '—'
        }</td>
        <td><strong style="color:#0f766e;">${escapeHtml(zeugnisNote)}</strong></td>
        <td style="font-size:11px; color:#4a636b;">${escapeHtml(override?.reason || stu.notes || '')}</td>
      </tr>`;
    })
    .join('');

  const docHtml = `<!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Zeugniskonferenz-Liste – ${escapeHtml(dataset.className)} ${escapeHtml(dataset.subjectName)}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: system-ui, sans-serif; padding: 24px; color: #0f1d22; }
          h1 { margin: 0 0 4px; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
          th, td { border-bottom: 1px solid #dce7e7; padding: 6px 5px; text-align: left; }
          th { background: #eef5f5; color: #0f1d22; font-weight: 700; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <h1>Zeugniskonferenz-Bogen: ${escapeHtml(dataset.className)} – ${escapeHtml(dataset.subjectName)} (${escapeHtml(termLabel)} ${escapeHtml(
    dataset.schoolYear
  )})</h1>
        <div style="font-size:12px; color:#4a636b; margin-bottom: 12px;">
          ${escapeHtml(dataset.schoolName)} · Klassenschnitt: <strong>${escapeHtml(
    report?.class_average_percent ?? '—'
  )}% (Ø ${escapeHtml(report?.class_display_grade ?? '—')})</strong> · Notenspiegel (1–6): [${(
    report?.distribution_buckets || [0, 0, 0, 0, 0, 0]
  )
    .map((n) => escapeHtml(n))
    .join(' / ')}]
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              ${dataset.config.enable_student_levels ? '<th>Niveau</th>' : ''}
              ${dataset.categories.map((c) => `<th>Ø ${escapeHtml(c.short_code)}</th>`).join('')}
              <th>Berechnet</th>
              <th>Zeugnisnote</th>
              <th>Bemerkung / Begründung</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>`;

  printHtmlDocument(docHtml, `Zeugniskonferenz – ${dataset.className} ${dataset.subjectName}`);
}
