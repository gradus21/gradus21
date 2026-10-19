import {
  ClassroomSubjectDataset,
  StudentProfile,
  TermFilterId,
} from '../data/demoClasses';

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

/**
 * Exports the entire active class (including assessments, category averages, overall average, and set Zeugnisnote) to a real .xlsx file!
 */
export async function exportClassToXlsx(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  activeTerm: TermFilterId
) {
  const XLSX = await import('@e965/xlsx');
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
      return entry.percent_value ?? '';
    });

    const catCells = dataset.categories.map((c) => {
      const cr = sum?.category_results.find((r) => r.category_id === c.id);
      return cr?.average_percent != null ? `${cr.average_percent}% (${cr.display_grade})` : '';
    });

    return [
      idx + 1,
      stu.name,
      ...(dataset.config.enable_student_levels ? [stu.level || 'M'] : []),
      ...assessCells,
      ...catCells,
      sum?.overall_percent ?? '',
      sum?.overall_display_grade ?? '—',
      finalGrade,
      override?.reason || stu.notes || '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${dataset.subjectName}_${dataset.className}`.slice(0, 31));
  XLSX.writeFile(
    wb,
    `${dataset.subjectName}_${dataset.className}_${activeTerm.toUpperCase()}.xlsx`
  );
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
 * Opens a clean, privacy-safe single-student report for Elterngespräche (Print / Save as PDF)
 */
export function printStudentParentReport(
  dataset: ClassroomSubjectDataset,
  student: StudentProfile,
  summary: StudentSummaryForExport | undefined,
  activeTerm: TermFilterId
) {
  const win = window.open('', '_blank', 'width=860,height=780');
  if (!win) return;

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

  win.document.write(`
    <html>
      <head>
        <title>Elterngesprächs-Bogen – ${escapeHtml(student.name)}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 36px; color: #0f1d22; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0d9488; padding-bottom: 16px; }
          .badge { background: #ccfbf1; color: #0f766e; padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: bold; }
          .summary-box { display: flex; gap: 20px; margin: 20px 0; }
          .card { flex: 1; border: 1px solid #dce7e7; border-radius: 12px; padding: 16px; background: #f8fafa; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          th, td { border-bottom: 1px solid #dce7e7; padding: 10px 8px; text-align: left; }
          th { background: #eef5f5; color: #4a636b; }
          .sig { margin-top: 56px; display: flex; justify-content: space-between; font-size: 12px; color: #4a636b; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <span class="badge">Datenschutzkonformer Einzelbogen (Schüler:innen-360°-Akte)</span>
            <h1 style="margin: 8px 0 4px;">${escapeHtml(student.name)} ${
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
            <div style="font-size:28px; font-weight:800; color:#0d9488;">
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
              <div style="font-size:20px; font-weight:bold; margin-top:4px;">
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
        <script>window.print();</script>
      </body>
    </html>
  `);
  win.document.close();
}

/**
 * Opens a print-ready Zeugniskonferenz-Liste (Print / Save as PDF)
 */
export function printClassConferenceReport(
  dataset: ClassroomSubjectDataset,
  report: ClassReportForExport | null,
  activeTerm: TermFilterId
) {
  const win = window.open('', '_blank', 'width=980,height=800');
  if (!win) return;

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

  win.document.write(`
    <html>
      <head>
        <title>Zeugniskonferenz-Liste – ${escapeHtml(dataset.className)} ${escapeHtml(dataset.subjectName)}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 30px; color: #0f1d22; }
          h1 { margin: 0 0 4px; font-size: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border-bottom: 1px solid #dce7e7; padding: 7px 6px; text-align: left; }
          th { background: #eef5f5; color: #0f1d22; }
        </style>
      </head>
      <body>
        <h1>Zeugniskonferenz-Bogen: ${escapeHtml(dataset.className)} – ${escapeHtml(dataset.subjectName)} (${escapeHtml(termLabel)} ${escapeHtml(
    dataset.schoolYear
  )})</h1>
        <div style="font-size:13px; color:#4a636b;">
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
        <script>window.print();</script>
      </body>
    </html>
  `);
  win.document.close();
}

