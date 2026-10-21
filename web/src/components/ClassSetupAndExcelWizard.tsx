import React, { useState, useMemo } from 'react';
import {
  AssessmentConfig,
  CategoryConfig,
  ClassroomSubjectDataset,
  GradeEntry,
  GradingScaleId,
  StudentProfile,
  ensureValidUuid,
} from '../data/demoClasses';
import { FileSpreadsheet, FolderPlus, Sparkles, Upload, X, Check } from 'lucide-react';
import { GlobalTemplateRecord } from './admin/CentralTemplatesTab';

interface ClassSetupAndExcelWizardProps {
  onClose: () => void;
  onCreateClass: (newClass: ClassroomSubjectDataset) => void;
  globalTemplates?: GlobalTemplateRecord[];
  onLoadDemoClass?: () => void;
}

interface DetectedExcelColumn {
  colIndex: number;
  header: string;
  role: 'student_name' | 'student_level' | 'assessment' | 'ignore';
  categoryKey: 'lnw' | 'muendl' | 'tests';
  sampleValues: string[];
}

export const ClassSetupAndExcelWizard: React.FC<ClassSetupAndExcelWizardProps> = ({
  onClose,
  onCreateClass,
  globalTemplates = [],
  onLoadDemoClass,
}) => {
  const [activeTab, setActiveTab] = useState<'excel' | 'wizard'>('excel');

  // Shared metadata fields
  const [schoolName, setSchoolName] = useState('Gemeinschaftsschule am Park');
  const [schoolYear, setSchoolYear] = useState('2026/2027');
  const [className, setClassName] = useState('Klasse 6');
  const [subjectName, setSubjectName] = useState('Englisch');
  const [scaleId, setScaleId] = useState<GradingScaleId>('de_classic_1_to_6');

  const availableTemplates = useMemo(() => {
    const globals = (globalTemplates || []).filter((t) => t.template_type === 'weighting');
    if (globals.length > 0) {
      return globals.map((t) => ({
        id: t.id,
        title: t.title,
        desc: t.description || t.payload?.desc,
        categories: t.payload?.categories,
        weights: t.payload?.weights,
        scale_id: t.payload?.scale_id as GradingScaleId | undefined,
        isGlobal: true,
      }));
    }
    return [
      {
        id: 'three_pillars',
        title: '3-Säulen (LNW / Mündl / Tests)',
        desc: '50% LNW · 30% Mündlich · 20% Tests + Niveau G/M/E',
        categories: [
          { id: 'cat_lnw', name: 'Große LNW (Klassenarbeiten)', short_code: 'LNW', weight: 0.5, drop_lowest_count: 0 },
          { id: 'cat_muendl', name: 'Mündliche Leistung', short_code: 'Mündl', weight: 0.3, drop_lowest_count: 0 },
          { id: 'cat_tests', name: 'Tests & Vokabeln', short_code: 'Tests', weight: 0.2, drop_lowest_count: 0 },
        ],
        weights: [0.5, 0.3, 0.2],
        scale_id: undefined,
        isGlobal: false,
      },
      {
        id: 'main_50_50',
        title: 'Klassisch 50 / 50',
        desc: '50% Klassenarbeiten · 50% Sonstige Mitarbeit',
        categories: [
          { id: 'cat_ka', name: 'Schriftlich (Klassenarbeiten)', short_code: 'KA', weight: 0.5, drop_lowest_count: 0 },
          { id: 'cat_somi', name: 'Sonstige Mitarbeit', short_code: 'SoMi', weight: 0.5, drop_lowest_count: 0 },
        ],
        weights: [0.5, 0.5],
        scale_id: undefined,
        isGlobal: false,
      },
      {
        id: 'oberstufe',
        title: 'Oberstufe (0–15 MSS-Punkte)',
        desc: '50% Klausuren · 50% Praxis / GFS',
        categories: [
          { id: 'cat_kl', name: 'Klausuren (Oberstufe)', short_code: 'Klausur', weight: 0.5, drop_lowest_count: 0 },
          { id: 'cat_gfs', name: 'Mündlich & GFS', short_code: 'Mündl', weight: 0.5, drop_lowest_count: 0 },
        ],
        weights: [0.5, 0.5],
        scale_id: 'de_oberstufe_0_to_15' as GradingScaleId,
        isGlobal: false,
      },
    ];
  }, [globalTemplates]);

  const [templatePreset, setTemplatePreset] = useState<string>(() => availableTemplates[0]?.id || 'three_pillars');

  // Manual wizard student list text
  const [studentListText, setStudentListText] = useState(
    'Safia, M\nKira, G\nLeni, M\nLorenzo, E\nVincent, M\nLuis, E'
  );

  // Excel importer state
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [excelRows, setExcelRows] = useState<Array<Array<string | number | null>>>([]);
  const [detectedColumns, setDetectedColumns] = useState<DetectedExcelColumn[]>([]);

  // Parse .xlsx / .xls / .csv client-side via SheetJS (Zero-Knowledge!)
  const handleExcelFileUpload = (file: File) => {
    setExcelFileName(file.name);
    // Extract class/subject hint from filename e.g. "Englisch 6 SJ 2627.xlsx"
    const baseName = file.name.replace(/\.(xlsx|xls|csv|ods)$/i, '');
    if (baseName.toLowerCase().includes('englisch')) {
      setSubjectName('Englisch');
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const XLSX = await import('@e965/xlsx');
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const matrix = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
        header: 1,
        defval: null,
      });

      const nonEmptyRows = matrix.filter(
        (r) => Array.isArray(r) && r.some((cell) => cell !== null && String(cell).trim() !== '')
      );
      if (nonEmptyRows.length < 2) return;

      const headerRow = nonEmptyRows[0];
      const dataRows = nonEmptyRows.slice(1);
      setExcelRows(dataRows);

      const cols: DetectedExcelColumn[] = headerRow.map((rawHeader, idx) => {
        const header = String(rawHeader ?? `Spalte ${idx + 1}`).trim();
        const lower = header.toLowerCase();

        let role: DetectedExcelColumn['role'] = 'assessment';
        let categoryKey: DetectedExcelColumn['categoryKey'] = 'tests';

        if (idx === 0 || lower.includes('name') || lower.includes('schüler') || lower.includes('schueler') || lower.includes('lernende')) {
          role = 'student_name';
        } else if (lower.includes('niveau') || lower.includes('level') || lower.includes('kurs')) {
          role = 'student_level';
        } else if (lower.includes('lnw') || lower.includes('ka') || lower.includes('arbeit') || lower.includes('klausur')) {
          role = 'assessment';
          categoryKey = 'lnw';
        } else if (lower.includes('münd') || lower.includes('muend') || lower.includes('somi') || lower.includes('mitarbeit')) {
          role = 'assessment';
          categoryKey = 'muendl';
        } else {
          role = 'assessment';
          categoryKey = 'tests';
        }

        const samples = dataRows
          .slice(0, 4)
          .map((r) => (r[idx] != null && String(r[idx]).trim() !== '' ? String(r[idx]).trim() : '—'));

        return {
          colIndex: idx,
          header,
          role,
          categoryKey,
          sampleValues: samples,
        };
      });

      setDetectedColumns(cols);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmExcelImport = () => {
    if (excelRows.length === 0) return;

    const nameCol = detectedColumns.find((c) => c.role === 'student_name')?.colIndex ?? 0;
    const levelCol = detectedColumns.find((c) => c.role === 'student_level')?.colIndex;

    const categories: CategoryConfig[] = [
      { id: 'cat_lnw', name: 'Große LNW (Klassenarbeiten)', short_code: 'LNW', weight: 0.5, drop_lowest_count: 0 },
      { id: 'cat_muendl', name: 'Mündliche Leistung', short_code: 'Mündl', weight: 0.3, drop_lowest_count: 0 },
      { id: 'cat_tests', name: 'Tests (Vokabeln & Kurztests)', short_code: 'Tests', weight: 0.2, drop_lowest_count: 0 },
    ];

    const assessments: AssessmentConfig[] = [];
    const colToAssessmentId = new Map<number, string>();

    detectedColumns.forEach((col, i) => {
      if (col.role !== 'assessment') return;
      const assessId = `imp_assess_${i}_${Date.now()}`;
      colToAssessmentId.set(col.colIndex, assessId);
      const catId =
        col.categoryKey === 'lnw'
          ? 'cat_lnw'
          : col.categoryKey === 'muendl'
          ? 'cat_muendl'
          : 'cat_tests';

      assessments.push({
        id: assessId,
        category_id: catId,
        title: col.header,
        term_id: 'hj1',
        weight: 1.0,
        input_mode: 'percent',
        max_points: col.categoryKey === 'lnw' ? 45 : 15,
      });
    });

    const students: StudentProfile[] = [];
    const grades: GradeEntry[] = [];

    excelRows.forEach((row, rIdx) => {
      const rawName = row[nameCol];
      if (!rawName || String(rawName).trim() === '') return;
      const stuName = String(rawName).trim();
      const stuId = `imp_stu_${rIdx + 1}_${Date.now()}`;

      const rawLvl = levelCol !== undefined ? String(row[levelCol] ?? '').trim().toUpperCase() : '';
      const level = ['G', 'M', 'E'].includes(rawLvl) ? rawLvl : 'M';

      students.push({
        id: stuId,
        name: stuName,
        level,
        is_not_graded: false,
      });

      colToAssessmentId.forEach((assessId, colIdx) => {
        const cellVal = row[colIdx];
        if (cellVal === null || cellVal === undefined || String(cellVal).trim() === '') {
          return;
        }
        const strVal = String(cellVal).trim().toUpperCase();
        if (strVal === 'K' || strVal === 'ATTEST') {
          grades.push({
            student_id: stuId,
            assessment_id: assessId,
            status: 'excused',
            percent_value: null,
            raw_points: null,
            direct_grade_value: null,
            comment: 'Aus Excel importiert (Attest)',
          });
          return;
        }
        const num = parseFloat(strVal.replace(',', '.'));
        if (!isNaN(num)) {
          const clampedPct = Math.max(0, Math.min(100, num));
          const assess = assessments.find((a) => a.id === assessId);
          const maxPts = assess?.max_points ?? 15;
          grades.push({
            student_id: stuId,
            assessment_id: assessId,
            status: 'graded',
            percent_value: clampedPct,
            raw_points: Math.round((clampedPct / 100) * maxPts * 10) / 10,
            direct_grade_value: null,
            comment: null,
          });
        }
      });
    });

    const newDataset: ClassroomSubjectDataset = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ensureValidUuid(`class_xlsx_${Date.now()}`),
      schoolName,
      schoolYear,
      className,
      subjectName,
      shortName: `${subjectName.slice(0, 2).toUpperCase()} ${className.replace(/[^0-9a-zA-Z]/g, '')}`,
      description: `Importiert aus ${excelFileName} (${students.length} Schüler:innen, ${assessments.length} Prüfungen)`,
      config: {
        scale_id: scaleId,
        weighting_mode: 'category_buckets',
        scale_empty_categories: true,
        enable_student_levels: true,
        level_threshold_offsets: { G: -5, M: 0, E: 3 },
        custom_thresholds: null,
      },
      categories,
      assessments,
      students,
      grades,
      reportCardOverrides: {},
    };

    onCreateClass(newDataset);
    onClose();
  };

  const handleConfirmManualWizard = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenTpl =
      availableTemplates.find((t) => t.id === templatePreset) || availableTemplates[0];

    const categories: CategoryConfig[] = chosenTpl.categories
      ? chosenTpl.categories.map((c: any, idx: number) => ({
          id: c.id || `cat_wiz_${idx}_${Date.now()}`,
          name: c.name || `Kategorie ${idx + 1}`,
          short_code: c.short_code || `K${idx + 1}`,
          weight: typeof c.weight === 'number' ? (c.weight > 1 ? c.weight / 100 : c.weight) : 0.5,
          drop_lowest_count: c.drop_lowest_count || 0,
        }))
      : [
          { id: 'cat_lnw', name: 'Große LNW (Klassenarbeiten)', short_code: 'LNW', weight: 0.5, drop_lowest_count: 0 },
          { id: 'cat_muendl', name: 'Mündliche Leistung', short_code: 'Mündl', weight: 0.3, drop_lowest_count: 0 },
          { id: 'cat_tests', name: 'Tests & Vokabeln', short_code: 'Tests', weight: 0.2, drop_lowest_count: 0 },
        ];

    const assessments: AssessmentConfig[] = categories.map((c, idx) => ({
      id: `init_assess_${idx}_${Date.now()}`,
      category_id: c.id,
      title: `${c.short_code} 1`,
      term_id: 'hj1',
      weight: 1.0,
      input_mode: 'percent',
      max_points: 20,
    }));

    const students: StudentProfile[] = studentListText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const parts = line.split(',').map((p) => p.trim());
        const name = parts[0];
        const lvl = ['G', 'M', 'E'].includes(parts[1]?.toUpperCase()) ? parts[1].toUpperCase() : 'M';
        return {
          id: `wiz_stu_${idx + 1}_${Date.now()}`,
          name,
          level: lvl,
          is_not_graded: false,
        };
      });

    const isOberstufe = chosenTpl.scale_id === 'de_oberstufe_0_to_15';

    const newDataset: ClassroomSubjectDataset = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ensureValidUuid(`class_wiz_${Date.now()}`),
      schoolName,
      schoolYear,
      className,
      subjectName,
      shortName: `${subjectName.slice(0, 2).toUpperCase()}`,
      description: `Neu angelegt über Setup-Wizard (${categories.map((c) => c.short_code).join(' / ')})`,
      config: {
        scale_id: chosenTpl.scale_id || scaleId,
        weighting_mode: 'category_buckets',
        scale_empty_categories: true,
        enable_student_levels: !isOberstufe,
        level_threshold_offsets: { G: -5, M: 0, E: 3 },
        custom_thresholds: null,
      },
      categories,
      assessments,
      students,
      grades: [],
      reportCardOverrides: {},
    };

    onCreateClass(newDataset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div
        data-tour="wizard-dialog-card"
        className="max-w-3xl w-full rounded-2xl border p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-5 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--primary-500)' }} />
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Klassen-Wizard & Nativer .xlsx-Importer (Stufe 1)
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                100% lokal im Browser geparst und sofort Ende-zu-Ende verschlüsselt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {onLoadDemoClass && (
          <div
            className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            style={{ backgroundColor: 'var(--primary-soft)', borderColor: 'var(--primary-500)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white">
                  Schnellstart für Demo &amp; Rundgang:
                </span>{' '}
                <span className="text-slate-600 dark:text-slate-300">
                  Lade direkt eine vollständige Klasse (Englisch 6 mit 12 Schüler:innen &amp; Noten).
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onLoadDemoClass}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm flex items-center justify-center gap-1.5 shrink-0 transition hover:opacity-95"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Demoklasse laden</span>
            </button>
          </div>
        )}

        {/* Mode Tabs */}
        <div className="flex gap-2 p-1 rounded-xl border" style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={() => setActiveTab('excel')}
            data-tour="wizard-excel-tab"
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'excel' ? 'shadow-sm text-white' : ''
            }`}
            style={{
              backgroundColor: activeTab === 'excel' ? 'var(--primary-500)' : 'transparent',
              color: activeTab === 'excel' ? '#fff' : 'var(--text-primary)',
            }}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Excel (.xlsx / .csv) per Drag & Drop importieren</span>
          </button>
          <button
            onClick={() => setActiveTab('wizard')}
            data-tour="wizard-manual-tab"
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'wizard' ? 'shadow-sm text-white' : ''
            }`}
            style={{
              backgroundColor: activeTab === 'wizard' ? 'var(--primary-500)' : 'transparent',
              color: activeTab === 'wizard' ? '#fff' : 'var(--text-primary)',
            }}
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Neue Klasse mit Vorlage erstellen</span>
          </button>
        </div>

        {/* Common Class Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Schule
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Schuljahr
            </label>
            <input
              type="text"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Klasse / Kurs
            </label>
            <input
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Fach
            </label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {activeTab === 'excel' ? (
          <div className="space-y-4">
            {/* Dropzone */}
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleExcelFileUpload(file);
              }}
              className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer flex flex-col items-center justify-center gap-2 transition hover:border-teal-500"
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <Upload className="w-7 h-7" style={{ color: 'var(--primary-500)' }} />
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {excelFileName
                  ? `Geladen: ${excelFileName} (${excelRows.length} Schüler:innen erkannt)`
                  : 'Excel-Datei (.xlsx, .xls, .ods, .csv) hierher ziehen oder klicken'}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Unterstützt Klassenlisten aus Schulportalen oder eigenen Tabellen (z. B. <code className="font-mono">Klassenliste_7b.xlsx</code>)
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.ods,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleExcelFileUpload(file);
                }}
                className="hidden"
              />
            </label>

            {detectedColumns.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-bold flex items-center justify-between" style={{ color: 'var(--text-primary)' }}>
                  <span>Automatische Spalten- & Kategorien-Erkennung (anpassbar):</span>
                  <span style={{ color: 'var(--primary-500)' }}>{excelRows.length} Zeilen bereit</span>
                </div>

                <div className="max-h-60 overflow-y-auto rounded-xl border divide-y text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                  {detectedColumns.map((col, idx) => (
                    <div
                      key={col.colIndex}
                      className="p-2.5 flex flex-wrap items-center justify-between gap-2"
                      style={{ backgroundColor: 'var(--bg-subtle)' }}
                    >
                      <div>
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                          Spalte {idx + 1}: „{col.header}“
                        </span>
                        <span className="ml-2 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                          Vorschau: [{col.sampleValues.join(', ')}]
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={col.role}
                          onChange={(e) => {
                            const newRole = e.target.value as DetectedExcelColumn['role'];
                            setDetectedColumns((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, role: newRole } : c))
                            );
                          }}
                          className="px-2 py-1 rounded border text-xs"
                          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                        >
                          <option value="student_name">Name der Schüler:in (Schüler:innenname)</option>
                          <option value="student_level">Differenzierungs-Niveau (G/M/E)</option>
                          <option value="assessment">Prüfungs-Spalte (Note / %)</option>
                          <option value="ignore">Ignorieren</option>
                        </select>

                        {col.role === 'assessment' && (
                          <select
                            value={col.categoryKey}
                            onChange={(e) => {
                              const newCat = e.target.value as DetectedExcelColumn['categoryKey'];
                              setDetectedColumns((prev) =>
                                prev.map((c, i) => (i === idx ? { ...c, categoryKey: newCat } : c))
                              );
                            }}
                            className="px-2 py-1 rounded border text-xs font-semibold"
                            style={{
                              backgroundColor: 'var(--primary-soft)',
                              color: 'var(--primary-text)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            <option value="lnw">Topf: Große LNW (50%)</option>
                            <option value="muendl">Topf: Mündlich (30%)</option>
                            <option value="tests">Topf: Tests (20%)</option>
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleConfirmExcelImport}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 shadow-sm"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Jetzt {excelRows.length} Schüler:innen & Spalten verschlüsselt als Klasse anlegen
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleConfirmManualWizard} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Fach-Vorlage (Template) wählen:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-52 overflow-y-auto p-0.5">
                {availableTemplates.map((tpl) => (
                  <button
                    type="button"
                    key={tpl.id}
                    onClick={() => setTemplatePreset(tpl.id)}
                    className={`p-3 rounded-xl border text-left transition ${
                      templatePreset === tpl.id ? 'ring-2 ring-teal-500 font-bold' : 'opacity-85 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: templatePreset === tpl.id ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                        {tpl.title}
                      </div>
                      {tpl.isGlobal && (
                        <span className="text-[9px] px-1 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded font-semibold ml-1 shrink-0">
                          Global
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {tpl.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div data-tour="wizard-students-input">
              <label className="block font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Schüler:innenliste einfügen (1 Schüler:in pro Zeile, optional mit <code className="font-mono">, G/M/E</code>):
              </label>
              <textarea
                rows={5}
                value={studentListText}
                onChange={(e) => setStudentListText(e.target.value)}
                className="w-full p-3 rounded-xl border font-mono text-xs bg-transparent"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 shadow-sm"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <Sparkles className="w-4 h-4" />
              <span>Klasse jetzt verschlüsselt erstellen</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
