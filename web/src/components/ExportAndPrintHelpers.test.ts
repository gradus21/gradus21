import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  splitStudentName,
  formatGermanDate,
  gradeToPoints,
  escapeCsvCell,
  generateCsvContent,
  buildExportTableData,
  DEFAULT_EXPORT_OPTIONS,
} from './ExportAndPrintHelpers';
import { ClassroomSubjectDataset, StudentProfile } from '../data/demoClasses';

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
