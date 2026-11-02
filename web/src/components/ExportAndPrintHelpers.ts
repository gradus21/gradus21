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
 * Efficiently converts a BlobPart (string, ArrayBuffer, Uint8Array, Blob) to a base64 string.
 */
export async function blobPartToBase64(content: BlobPart): Promise<string> {
  if (typeof content === 'string') {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(content, 'utf-8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(content)));
  }

  if (content instanceof ArrayBuffer) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(content).toString('base64');
    }
    const bytes = new Uint8Array(content);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  }

  if (ArrayBuffer.isView(content)) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('base64');
    }
    const bytes = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  }

  const blob = content instanceof Blob ? content : new Blob([content]);
  if (typeof blob.arrayBuffer === 'function') {
    const buf = await blob.arrayBuffer();
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(buf).toString('base64');
    }
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  }

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
 * - Mobile apps (Android, iOS via Tauri):
 *   Saves HTML document natively and opens the native system Share/Print sheet
 *   (enabling "Drucken" / AirPrint, "In Dateien sichern", "In Google Drive speichern", etc.)
 *   without any trapped in-app overlay window!
 * - Mobile web browsers: Web Share API if supported, or browser window.print()
 * - Desktop browsers & Desktop Tauri: Directly triggers the browser/OS print preview dialog via an offscreen iframe.
 */
export async function printHtmlDocument(htmlContent: string, title: string = 'Dokument'): Promise<void> {
  const cleanHtml = stripInlinePrintScripts(htmlContent);
  const cleanFilename = (title.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') || 'Dokument') + '.html';

  // 1. Mobile native apps (Tauri Android / iOS):
  // Directly open the native system Share/Print sheet so the user can tap "Drucken",
  // "In Dateien sichern" / "In Google Drive speichern", AirDrop, etc.
  if (isTauri() && (isMobileTauri() || isMobileDevice() || isAppleTouchDevice())) {
    try {
      const base64 = await blobPartToBase64(cleanHtml);
      const { invoke } = await import('@tauri-apps/api/core');
      const savedPath = await invoke<string>('native_save_file', {
        filename: cleanFilename,
        contentBase64: base64,
      });

      try {
        await invoke('plugin:sharekit|share_file', {
          url: savedPath,
          mimeType: 'text/html;charset=utf-8',
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
      console.warn('[Print] Native save/share failed, falling back to web print:', tauriErr);
    }
  }

  // 2. Mobile web browsers / devices with Web Share API:
  if (isMobileDevice() || isAppleTouchDevice()) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const blob = new Blob([cleanHtml], { type: 'text/html;charset=utf-8' });
        const file = new File([blob], cleanFilename, { type: 'text/html;charset=utf-8' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: title,
          });
          return;
        }
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError') return;
        console.warn('[Print] Native share dialog failed, falling back to print:', shareErr);
      }
    }
  }

  // 3. Desktop browsers & Desktop Tauri:
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
 * Opens a clean, privacy-safe single-student report for Elterngespräche (Print / Save as PDF).
 * Fully optimized for DIN A4 Portrait.
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

  void printHtmlDocument(docHtml, `Elterngesprächs-Bogen – ${student.name}`);
}

/**
 * Opens a print-ready Zeugniskonferenz-Liste (Print / Save as PDF).
 * Fully optimized for DIN A4 Portrait.
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

  const docHtml = `<!DOCTYPE html>
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

  void printHtmlDocument(docHtml, `Zeugniskonferenz – ${dataset.className} ${dataset.subjectName}`);
}
