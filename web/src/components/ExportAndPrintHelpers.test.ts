import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  escapeHtml,
  splitStudentName,
  formatGermanDate,
  gradeToPoints,
  escapeCsvCell,
  generateCsvContent,
  buildExportTableData,
  DEFAULT_EXPORT_OPTIONS,
  stripInlinePrintScripts,
  printHtmlDocument,
  triggerFileDownload,
  generateStudentParentReportPdf,
  generateClassConferenceReportPdf,
  generateStudentParentReportHtml,
  generateClassConferenceReportHtml,
} from './ExportAndPrintHelpers';
import { ClassroomSubjectDataset, StudentProfile } from '../data/demoClasses';

const dummyDataset: ClassroomSubjectDataset = {
  id: 'test_class',
  schoolName: 'Test School',
  schoolYear: '2026/2027',
  className: '6b',
  subjectName: 'Englisch',
  shortName: 'EN 6b',
  subjectCode: 'E',
  courseType: 'GKM',
  description: '',
  config: {
    scale_id: 'de_classic_1_to_6',
    weighting_mode: 'category_buckets',
    scale_empty_categories: true,
    enable_student_levels: false,
    level_threshold_offsets: {},
    custom_thresholds: null,
  },
  categories: [],
  assessments: [],
  students: [
    {
      id: 's1',
      name: 'Safia Al-Mansoor',
      birthDate: '2014-04-12',
      level: null,
      is_not_graded: false,
      notes: 'Gute Mitarbeit',
    },
  ],
  grades: [],
  reportCardOverrides: {
    s1: { hj1: '2', reason: 'Aufrundung' },
  },
};

describe('ExportAndPrintHelpers - escapeHtml', () => {
  it('escapes dangerous HTML characters to prevent XSS in print views', () => {
    const dirty = '<script>alert("xss")</script> & \'test\'';
    const clean = escapeHtml(dirty);
    expect(clean).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;');
    expect(clean).not.toContain('<');
    expect(clean).not.toContain('>');
    expect(clean).not.toContain('"');
  });

  it('handles clean strings without alterations', () => {
    const text = 'Max Mustermann (Klasse 6a)';
    expect(escapeHtml(text)).toBe(text);
  });

  it('handles empty and whitespace strings gracefully', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml('   ')).toBe('   ');
  });
});

describe('ExportAndPrintHelpers - Name & Date Parsing', () => {
  it('splits names with comma (Nachname, Vorname)', () => {
    const stu: StudentProfile = {
      id: '1',
      name: 'Mustermann, Max',
      level: null,
      is_not_graded: false,
    };
    expect(splitStudentName(stu)).toEqual({
      lastName: 'Mustermann',
      firstName: 'Max',
    });
  });

  it('splits names with space (Vorname Nachname)', () => {
    const stu: StudentProfile = {
      id: '1',
      name: 'Max Mustermann',
      level: null,
      is_not_graded: false,
    };
    expect(splitStudentName(stu)).toEqual({
      lastName: 'Mustermann',
      firstName: 'Max',
    });
  });

  it('handles single names gracefully', () => {
    const stu: StudentProfile = {
      id: '1',
      name: 'Safia',
      level: null,
      is_not_graded: false,
    };
    expect(splitStudentName(stu)).toEqual({
      lastName: '',
      firstName: 'Safia',
    });
  });

  it('prioritizes officialLastName and officialFirstName if present', () => {
    const stu: StudentProfile = {
      id: '1',
      name: 'Lukas B.',
      officialLastName: 'Bergmann',
      officialFirstName: 'Lukas',
      level: null,
      is_not_graded: false,
    };
    expect(splitStudentName(stu)).toEqual({
      lastName: 'Bergmann',
      firstName: 'Lukas',
    });
  });

  it('converts ISO dates to German TT.MM.JJJJ format', () => {
    expect(formatGermanDate('2014-05-12')).toBe('12.05.2014');
    expect(formatGermanDate('12.05.2014')).toBe('12.05.2014');
    expect(formatGermanDate('')).toBe('');
    expect(formatGermanDate(undefined)).toBe('');
  });

  it('converts German grades to Oberstufen points', () => {
    expect(gradeToPoints('1')).toBe(14);
    expect(gradeToPoints('2+')).toBe(12);
    expect(gradeToPoints('4')).toBe(5);
    expect(gradeToPoints('6')).toBe(0);
    expect(gradeToPoints('15')).toBe(15);
  });
});

describe('ExportAndPrintHelpers - CSV Escaping and Generation', () => {
  it('escapes cells containing delimiters, quotes, or newlines', () => {
    expect(escapeCsvCell('Normaler Text', ';')).toBe('Normaler Text');
    expect(escapeCsvCell('Text mit; Semikolon', ';')).toBe('"Text mit; Semikolon"');
    expect(escapeCsvCell('Text mit "Anführungszeichen"', ';')).toBe('"Text mit ""Anführungszeichen"""');
    expect(escapeCsvCell("Text mit\nUmbruch", ';')).toBe("\"Text mit\nUmbruch\"");
  });

  it('generates CSV with BOM for Excel compatibility', () => {
    const headers = ['Name', 'Note'];
    const rows = [['Mustermann; Max', '2']];
    const csv = generateCsvContent(headers, rows, ';', true);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Mustermann; Max";2');
    expect(csv).toContain('\r\n');
  });
});

describe('ExportAndPrintHelpers - SchILD-NRW and Standard Presets', () => {
  it('builds exact 9 columns for SchILD-NRW preset', () => {
    const { headers, rows } = buildExportTableData(dummyDataset, null, {
      ...DEFAULT_EXPORT_OPTIONS,
      presetId: 'schild_nrw',
      term: 'hj1',
    });

    expect(headers).toEqual([
      'Name',
      'Vorname',
      'Geburtsdatum',
      'Klasse',
      'Fach-Kürzel',
      'Kursart',
      'Note',
      'Punkte',
      'Zeugnisbemerkung',
    ]);

    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual([
      'Al-Mansoor',
      'Safia',
      '12.04.2014',
      '6b',
      'E',
      'GKM',
      '2',
      11,
      'Aufrundung',
    ]);
  });

  it('builds standard preset correctly', () => {
    const { headers, rows } = buildExportTableData(dummyDataset, null, {
      ...DEFAULT_EXPORT_OPTIONS,
      presetId: 'standard',
      term: 'hj1',
    });

    expect(headers).toContain('Nachname');
    expect(headers).toContain('Vorname');
    expect(headers).toContain('Zeugnisnote');
    expect(rows[0]).toContain('Al-Mansoor');
    expect(rows[0]).toContain('Safia');
    expect(rows[0]).toContain('2');
  });
});

describe('ExportAndPrintHelpers - Document Printing and Native Share Dialog', () => {
  it('strips inline print scripts from html content', () => {
    const raw = '<html><body><h1>Test</h1><script>window.print();</script></body></html>';
    const clean = stripInlinePrintScripts(raw);
    expect(clean).not.toContain('<script>window.print();</script>');
    expect(clean).toContain('<h1>Test</h1>');
  });

  it('directly opens native share dialog on mobile/Tauri with genuine PDF file', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);

    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        share: shareMock,
        canShare: canShareMock,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
        maxTouchPoints: 5,
      },
      configurable: true,
      writable: true,
    });

    await printHtmlDocument('<h1>Schüler-Akte</h1>', 'Elterngesprächs-Bogen – Max');

    // Asserts navigator.share was directly invoked with PDF file
    expect(canShareMock).toHaveBeenCalled();
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Elterngesprächs-Bogen – Max',
      })
    );
    const callArgs = shareMock.mock.calls[0][0];
    expect(callArgs.files[0].name).toMatch(/\.pdf$/);
    expect(callArgs.files[0].type).toBe('application/pdf');

    // Asserts no stuck DOM overlay was created
    expect(document.getElementById('gradus21-print-sheet-root')).toBeNull();

    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('triggerFileDownload delegates to navigator.share when available and supported', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);

    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        share: shareMock,
        canShare: canShareMock,
      },
      configurable: true,
      writable: true,
    });

    await triggerFileDownload('name,note\nMax,1', 'noten.csv', 'text/csv');
    expect(canShareMock).toHaveBeenCalled();
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'noten.csv',
      })
    );

    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('correctly converts BlobPart to base64 using blobPartToBase64', async () => {
    const { blobPartToBase64 } = await import('./ExportAndPrintHelpers');
    const b64 = await blobPartToBase64('Hello Gradus21');
    expect(btoa('Hello Gradus21')).toBe(b64);
  });

  it('triggers native_save_file and plugin:sharekit|share_file when running in mobile Tauri', async () => {
    const invokeMock = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'native_save_file') {
        return Promise.resolve('/data/user/0/de.gradus21.app/cache/test.xlsx');
      }
      if (cmd === 'plugin:sharekit|share_file') {
        return Promise.resolve();
      }
      return Promise.resolve();
    });

    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
    }));

    (window as any).__TAURI_INTERNALS__ = {};

    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
        maxTouchPoints: 5,
      },
      configurable: true,
      writable: true,
    });

    await triggerFileDownload('dummy excel data', 'liste.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    expect(invokeMock).toHaveBeenCalledWith('native_save_file', expect.objectContaining({
      filename: 'liste.xlsx',
    }));
    expect(invokeMock).toHaveBeenCalledWith('plugin:sharekit|share_file', {
      url: '/data/user/0/de.gradus21.app/cache/test.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      title: 'liste.xlsx',
    });

    delete (window as any).__TAURI_INTERNALS__;
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    vi.doUnmock('@tauri-apps/api/core');
  });

  it('triggers native_save_file and plugin:sharekit|share_file with PDF when printHtmlDocument runs in mobile Tauri', async () => {
    const invokeMock = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'native_save_file') {
        return Promise.resolve('/data/user/0/de.gradus21.app/cache/konferenz.pdf');
      }
      if (cmd === 'plugin:sharekit|share_file') {
        return Promise.resolve();
      }
      return Promise.resolve();
    });

    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
    }));

    (window as any).__TAURI_INTERNALS__ = {};

    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
        maxTouchPoints: 5,
      },
      configurable: true,
      writable: true,
    });

    await printHtmlDocument('<h1>Zeugniskonferenz 6b</h1>', 'Zeugniskonferenz – 6b Deutsch');

    expect(invokeMock).toHaveBeenCalledWith('native_save_file', expect.objectContaining({
      filename: 'Zeugniskonferenz___6b_Deutsch.pdf',
    }));
    expect(invokeMock).toHaveBeenCalledWith('plugin:sharekit|share_file', {
      url: '/data/user/0/de.gradus21.app/cache/konferenz.pdf',
      mimeType: 'application/pdf',
      title: 'Zeugniskonferenz – 6b Deutsch',
    });

    delete (window as any).__TAURI_INTERNALS__;
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    vi.doUnmock('@tauri-apps/api/core');
  });

  it('converts HTML content to a valid PDF blob using htmlToPdfBlob', async () => {
    const { htmlToPdfBlob } = await import('./ExportAndPrintHelpers');
    const blob = await htmlToPdfBlob('<h1>Notenübersicht</h1>', 'Notenübersicht');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('generates a clean 1-page DIN A4 vector PDF for student parent report', () => {
    const doc = generateStudentParentReportPdf(
      dummyDataset,
      dummyDataset.students[0],
      {
        student_id: 's1',
        overall_percent: 85,
        overall_grade_numeric: 2.0,
        overall_display_grade: '2',
        semantic_tier: 2,
        is_preliminary: false,
        category_results: [
          {
            category_id: 'cat1',
            category_name: 'Große LNW',
            average_percent: 85,
            display_grade: '2',
            graded_count: 2,
            effective_weight_percent: 50,
          },
        ],
      },
      'hj1'
    );

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
    const pdfBlob = doc.output('blob');
    expect(pdfBlob.size).toBeGreaterThan(1000);
  });

  it('generates a clean DIN A4 vector PDF for class conference report', () => {
    const doc = generateClassConferenceReportPdf(
      dummyDataset,
      {
        student_summaries: [
          {
            student_id: 's1',
            overall_percent: 85,
            overall_grade_numeric: 2.0,
            overall_display_grade: '2',
            semantic_tier: 2,
            is_preliminary: false,
            category_results: [],
          },
        ],
        class_average_percent: 78,
        class_display_grade: '2.4',
        distribution_buckets: [0, 1, 0, 0, 0, 0],
      },
      'hj1'
    );

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const pdfBlob = doc.output('blob');
    expect(pdfBlob.size).toBeGreaterThan(1000);
  });

  it('generates valid HTML strings for both student parent and conference reports', () => {
    const stuHtml = generateStudentParentReportHtml(dummyDataset, dummyDataset.students[0], undefined, 'hj1');
    expect(stuHtml).toContain('Elterngesprächs-Bogen');
    expect(stuHtml).toContain('Safia Al-Mansoor');
    expect(stuHtml).toContain('size: A4 portrait');

    const confHtml = generateClassConferenceReportHtml(dummyDataset, null, 'hj1');
    expect(confHtml).toContain('Zeugniskonferenz-Liste');
    expect(confHtml).toContain('size: A4 portrait');
  });
});
