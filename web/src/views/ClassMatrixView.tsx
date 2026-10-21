import React, { useState } from 'react';
import {
  AssessmentConfig,
  AssessmentInputMode,
  CellDisplayFormat,
  ClassroomSubjectDataset,
  gradeToPercent,
  percentToGradeThreshold,
  StudentProfile,
  TermFilterId,
  UserSyncSettings,
} from '../data/demoClasses';
import {
  ClassCalculationReport,
  LEVEL_BADGE_STYLES,
  StudentCalculatedSummary,
  TIER_BADGE_STYLES,
  WorkspaceMode,
} from '../types/workspace';
import {
  exportClassToXlsx,
  printClassConferenceReport,
} from '../components/ExportAndPrintHelpers';
import { ExportConfigModal } from '../components/ExportConfigModal';
import {
  Archive,
  ChevronDown,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Printer,
  Sliders,
  UserPlus,
} from 'lucide-react';

export interface ClassMatrixViewProps {
  activeDataset: ClassroomSubjectDataset;
  activeTerm: TermFilterId;
  calculationReport: ClassCalculationReport | null;
  summaryByStudentId: Map<string, StudentCalculatedSummary>;
  userSettings: UserSyncSettings;
  cellFormat: CellDisplayFormat;
  setCellFormat: (format: CellDisplayFormat) => void;
  showArchivedInMatrix: boolean;
  setShowArchivedInMatrix: React.Dispatch<React.SetStateAction<boolean>>;
  showOnDemandReportCardCol: boolean;
  setShowOnDemandReportCardCol: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenClassManager: () => void;
  onOpenClassWizard: () => void;
  onSelectStudent: (studentId: string) => void;
  onSelectAssessment: (assessmentId: string) => void;
  setMode: (mode: WorkspaceMode) => void;
  updateGradeEntry: (
    studentId: string,
    assessmentId: string,
    inputValue: string,
    inputType: 'percent' | 'points' | 'grade_scale' | 'excused'
  ) => void;
  updateReportCardOverride: (studentId: string, gradeVal: string, reason?: string) => void;
  cycleStudentLevel: (studentId: string) => void;
  toggleStudentNotGraded: (studentId: string) => void;
  toggleStudentArchived: (studentId: string) => void;
  onAddStudent: (name: string, level: 'G' | 'M' | 'E') => void;
  onAddAssessment: (
    title: string,
    categoryId: string,
    inputMode: AssessmentInputMode
  ) => void;
  onUpdateDatasetMeta?: (patch: { subjectCode?: string; courseType?: string }) => void;
}

export const ClassMatrixView: React.FC<ClassMatrixViewProps> = ({
  activeDataset,
  activeTerm,
  calculationReport,
  summaryByStudentId,
  userSettings,
  cellFormat,
  setCellFormat,
  showArchivedInMatrix,
  setShowArchivedInMatrix,
  showOnDemandReportCardCol,
  setShowOnDemandReportCardCol,
  onOpenClassManager,
  onOpenClassWizard,
  onSelectStudent,
  onSelectAssessment,
  setMode,
  updateGradeEntry,
  updateReportCardOverride,
  cycleStudentLevel,
  toggleStudentNotGraded,
  toggleStudentArchived,
  onAddStudent,
  onAddAssessment,
  onUpdateDatasetMeta,
}) => {
  const [showExportConfigModal, setShowExportConfigModal] = useState(false);
  const [showNewStudentForm, setShowNewStudentForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentLevel, setNewStudentLevel] = useState<'G' | 'M' | 'E'>('M');

  const [showNewAssessmentForm, setShowNewAssessmentForm] = useState(false);
  const [newAssessmentTitle, setNewAssessmentTitle] = useState('');
  const [newAssessmentCategoryId, setNewAssessmentCategoryId] = useState(
    activeDataset.categories[0]?.id || ''
  );
  const [newAssessmentInputMode, setNewAssessmentInputMode] =
    useState<AssessmentInputMode>('percent');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const visibleStudents = React.useMemo(
    () =>
      activeDataset.students.filter((s) =>
        showArchivedInMatrix ? true : !s.is_archived
      ),
    [activeDataset.students, showArchivedInMatrix]
  );

  const archivedCount = React.useMemo(
    () => activeDataset.students.filter((s) => s.is_archived).length,
    [activeDataset.students]
  );

  const totalCatWeight = React.useMemo(
    () =>
      activeDataset.categories.reduce(
        (acc, c) => acc + Math.max(0.01, c.weight),
        0
      ),
    [activeDataset.categories]
  );

  const termAssessments = React.useMemo(
    () =>
      activeDataset.assessments.filter((a) =>
        activeTerm === 'all' ? true : a.term_id === activeTerm
      ),
    [activeDataset.assessments, activeTerm]
  );

  const isReportCardColumnVisible =
    userSettings.showReportCardColumn || showOnDemandReportCardCol;

  const handleCreateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    onAddStudent(newStudentName.trim(), newStudentLevel);
    setNewStudentName('');
    setShowNewStudentForm(false);
  };

  const handleCreateAssessment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssessmentTitle.trim()) return;
    onAddAssessment(
      newAssessmentTitle.trim(),
      newAssessmentCategoryId || activeDataset.categories[0]?.id || '',
      newAssessmentInputMode
    );
    setNewAssessmentTitle('');
    setShowNewAssessmentForm(false);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Darstellung:
          </span>
          {(
            [
              { id: 'combined', label: 'Kombi' },
              { id: 'percent_only', label: 'Prozent' },
              { id: 'grade_only', label: 'Nur Note' },
            ] as const
          ).map((fmt) => (
            <button
              key={fmt.id}
              onClick={() => setCellFormat(fmt.id)}
              className="px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold border transition"
              style={{
                backgroundColor:
                  cellFormat === fmt.id ? 'var(--primary-soft)' : 'var(--bg-surface)',
                color:
                  cellFormat === fmt.id ? 'var(--primary-text)' : 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {fmt.label}
            </button>
          ))}

          {/* On-demand toggle for Zeugnisnote if hidden by default in settings */}
          {!userSettings.showReportCardColumn && (
            <button
              onClick={() => setShowOnDemandReportCardCol((s) => !s)}
              className="px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold border transition"
              style={{
                backgroundColor: showOnDemandReportCardCol
                  ? 'var(--primary-soft)'
                  : 'var(--bg-surface)',
                color: showOnDemandReportCardCol
                  ? 'var(--primary-text)'
                  : 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {showOnDemandReportCardCol
                ? 'Zeugnis ausblenden'
                : '+ Zeugnis-Spalte'}
            </button>
          )}

          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchivedInMatrix((a) => !a)}
              className="px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1 transition"
              style={{
                backgroundColor: showArchivedInMatrix
                  ? 'var(--primary-soft)'
                  : 'var(--bg-surface)',
                color: showArchivedInMatrix
                  ? 'var(--primary-text)'
                  : 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <Archive className="w-3 h-3" />
              <span>
                {showArchivedInMatrix
                  ? 'Archivierte ausblenden'
                  : `${archivedCount} Archivierte`}
              </span>
            </button>
          )}
        </div>

        {/* Action Buttons: Priorisierte Hierarchie (Primär + Sekundär + Import/Export-Dropdown) */}
        <div data-tour="matrix-actions-bar" className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Secondary Action: Klasse verwalten */}
          <button
            onClick={onOpenClassManager}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition active:scale-[0.98] hover:opacity-90"
            style={{
              backgroundColor: 'var(--primary-soft)',
              color: 'var(--primary-text)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Klasse verwalten</span>
            <span className="sm:hidden">Klasse</span>
          </button>

          {/* Quick Action: + Schüler:in */}
          <button
            onClick={() => setShowNewStudentForm((s) => !s)}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition active:scale-[0.98] hover:opacity-90"
            style={{
              backgroundColor: showNewStudentForm ? 'var(--primary-soft)' : 'var(--bg-surface)',
              color: showNewStudentForm ? 'var(--primary-text)' : 'var(--text-primary)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <UserPlus className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
            <span>+ Schüler:in</span>
          </button>

          {/* Tools & Export Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((open) => !open)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition active:scale-[0.98] hover:opacity-90"
              style={{
                backgroundColor: showExportMenu ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-subtle)',
              }}
              aria-expanded={showExportMenu}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
              <span className="hidden sm:inline">Import / Export</span>
              <span className="sm:hidden">Export</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowExportMenu(false)}
                />
                <div
                  className="absolute right-0 mt-1 w-60 rounded-xl border shadow-xl py-1 z-40 backdrop-blur-md"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      setShowExportConfigModal(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-teal-500/10 transition"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Sliders className="w-4 h-4 text-primary-500 shrink-0" />
                    <div>
                      <div className="font-semibold">CSV & Excel konfigurieren...</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>SchILD-NRW, Delimiter, Spalten</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      exportClassToXlsx(activeDataset, calculationReport, activeTerm);
                    }}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-teal-500/10 transition"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Download className="w-4 h-4 text-teal-600 shrink-0" />
                    <div>
                      <div className="font-semibold">Excel (.xlsx) exportieren</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Mehrblättrige Klassenliste</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      printClassConferenceReport(activeDataset, calculationReport, activeTerm);
                    }}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-teal-500/10 transition"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Printer className="w-4 h-4 text-sky-600 shrink-0" />
                    <div>
                      <div className="font-semibold">Konferenz-PDF drucken</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Druckfertige A4-Übersicht</div>
                    </div>
                  </button>

                  <div className="border-t my-1" style={{ borderColor: 'var(--border-subtle)' }} />

                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      onOpenClassWizard();
                    }}
                    className="w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 hover:bg-teal-500/10 transition"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-semibold">.xlsx / .csv importieren</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Aus Schulportal oder Excel</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Primary Action: Prüfung */}
          <button
            onClick={() => setShowNewAssessmentForm((s) => !s)}
            className="px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98] hover:opacity-95"
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Prüfung ({activeTerm.toUpperCase()})</span>
          </button>
        </div>
      </div>

      {/* Inline New Student Creator */}
      {showNewStudentForm && (
        <form
          onSubmit={handleCreateStudent}
          className="p-4 rounded-2xl border flex flex-wrap items-end gap-3 shadow-sm"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Name der/des Schülerin:Schülers
            </label>
            <input
              type="text"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="z.B. Leonie M."
              className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          {activeDataset.config.enable_student_levels && (
            <div>
              <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Niveau
              </label>
              <select
                value={newStudentLevel}
                onChange={(e) => setNewStudentLevel(e.target.value as 'G' | 'M' | 'E')}
                className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                <option value="G">G-Niveau</option>
                <option value="M">M-Niveau</option>
                <option value="E">E-Niveau</option>
              </select>
            </div>
          )}
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            Schüler:in hinzufügen
          </button>
        </form>
      )}

      {/* Inline New Assessment Creator */}
      {showNewAssessmentForm && (
        <form
          onSubmit={handleCreateAssessment}
          className="p-4 rounded-2xl border flex flex-wrap items-end gap-3 shadow-sm"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Bezeichnung der Prüfung
            </label>
            <input
              type="text"
              value={newAssessmentTitle}
              onChange={(e) => setNewAssessmentTitle(e.target.value)}
              placeholder="z.B. Vokabeltest Unit 2"
              className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Kategorie-Topf
            </label>
            <select
              value={newAssessmentCategoryId}
              onChange={(e) => setNewAssessmentCategoryId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              {activeDataset.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({Math.round((c.weight / totalCatWeight) * 100)}%)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Bewertungsmodus
            </label>
            <select
              value={newAssessmentInputMode}
              onChange={(e) => setNewAssessmentInputMode(e.target.value as AssessmentInputMode)}
              className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <option value="percent">Prozent (0–100%)</option>
              <option value="points">Rohpunkte (Punkte / Max)</option>
              <option value="grade_scale">
                {activeDataset.config.scale_id === 'de_oberstufe_0_to_15'
                  ? 'Notenpunkte (0–15)'
                  : 'Direkte Note (1–6)'}
              </option>
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            Spalte anlegen
          </button>
        </form>
      )}

      {/* Mobile Swipe Hint */}
      <div className="sm:hidden text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between px-1">
        <span>{visibleStudents.length} Schüler:innen</span>
        <span>← Seitlich wischen für alle Arbeiten →</span>
      </div>

      {/* Structured Matrix Card */}
      <div
        data-tour="matrix-table"
        className="rounded-2xl border shadow-sm overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr
                className="border-b text-[11px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <th
                  className="py-2.5 px-3 sm:px-4 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  Schüler:innen ({visibleStudents.length})
                </th>
                {activeDataset.config.enable_student_levels && (
                  <th className="py-2.5 px-2 text-center">Niveau</th>
                )}
                <th className="py-2.5 px-3 text-center">Live-Schnitt</th>
                {isReportCardColumnVisible && (
                  <th
                    className="py-2.5 px-3 text-center border-r"
                    style={{ borderColor: 'var(--border-subtle)' }}
                    title="Festgesetzte Zeugnisnote (pädagogisch überschreibbar)"
                  >
                    Zeugnisnote
                  </th>
                )}
                {activeDataset.categories.map((cat) => {
                  const catAssessments = termAssessments.filter(
                    (a) => a.category_id === cat.id
                  );
                  const normPct = Math.round((cat.weight / totalCatWeight) * 100);
                  const colSpan =
                    catAssessments.length +
                    (userSettings.showCategoryAveragesInMatrix ? 1 : 0);
                  if (colSpan === 0) return null;
                  return (
                    <th
                      key={cat.id}
                      colSpan={colSpan}
                      className="py-2.5 px-3 text-center border-r"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                          style={{
                            backgroundColor: 'var(--primary-soft)',
                            color: 'var(--primary-text)',
                          }}
                        >
                          {normPct}%
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>

              <tr
                className="border-b text-xs font-semibold"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <th
                  className="py-2.5 px-3 sm:px-4 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                >
                  Name (Klick → 360°-Akte)
                </th>
                {activeDataset.config.enable_student_levels && (
                  <th className="py-2.5 px-2 text-center text-[11px]">G / M / E</th>
                )}
                <th
                  className="py-2.5 px-3 text-center font-bold"
                  style={{ color: 'var(--primary-500)' }}
                >
                  Schnitt ({activeTerm.toUpperCase()})
                </th>
                {isReportCardColumnVisible && (
                  <th
                    className="py-2.5 px-3 text-center border-r text-[11px]"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    Zeugnis ({activeTerm.toUpperCase()})
                  </th>
                )}
                {activeDataset.categories.map((cat) => {
                  const catAssessments = termAssessments.filter(
                    (a) => a.category_id === cat.id
                  );
                  return (
                    <React.Fragment key={cat.id}>
                      {catAssessments.map((assess) => (
                        <th
                          key={assess.id}
                          className="py-2.5 px-2.5 text-center min-w-[92px] group cursor-pointer hover:bg-teal-500/5 transition"
                          onClick={() => {
                            onSelectAssessment(assess.id);
                            setMode('speed_grading');
                          }}
                        >
                          <div className="flex flex-col items-center">
                            <span
                              className="font-semibold group-hover:underline"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {assess.title}
                            </span>
                            <span className="text-[10px] opacity-70">
                              {assess.input_mode === 'grade_scale'
                                ? activeDataset.config.scale_id === 'de_oberstufe_0_to_15'
                                  ? '0–15 Pkt'
                                  : 'Note (1–6)'
                                : assess.input_mode === 'points'
                                ? `max. ${assess.max_points || 15} Pkt`
                                : '%'} · ⚡
                            </span>
                          </div>
                        </th>
                      ))}
                      {userSettings.showCategoryAveragesInMatrix && (
                        <th
                          className="py-2.5 px-2.5 text-center border-r text-[11px] font-bold"
                          style={{
                            backgroundColor: 'var(--bg-subtle)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          Ø {cat.short_code}
                        </th>
                      )}
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
              {visibleStudents.map((stu, sIdx) => {
                const summary = summaryByStudentId.get(stu.id);
                const tierStyle = summary
                  ? TIER_BADGE_STYLES[summary.semantic_tier]
                  : undefined;
                const levelStyle = stu.level ? LEVEL_BADGE_STYLES[stu.level] : undefined;
                const overrideObj = activeDataset.reportCardOverrides?.[stu.id];
                const currentZeugnisOverride =
                  (activeTerm === 'hj1'
                    ? overrideObj?.hj1
                    : activeTerm === 'hj2'
                    ? overrideObj?.hj2
                    : overrideObj?.all) || '';

                return (
                  <tr
                    key={stu.id}
                    className={`hover:bg-teal-500/[0.03] transition group ${
                      stu.is_archived ? 'opacity-50 bg-amber-500/5' : ''
                    }`}
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <td
                      className="py-2.5 px-3 sm:px-4 font-semibold sticky left-0 z-10 whitespace-nowrap shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r"
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            onSelectStudent(stu.id);
                            setMode('student_360');
                          }}
                          className="hover:underline flex items-center gap-2 text-left"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <span className="text-[11px] font-mono opacity-45 w-4">
                            {sIdx + 1}.
                          </span>
                          <span className={stu.is_archived ? 'line-through' : ''}>
                            {stu.name}
                          </span>
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleStudentNotGraded(stu.id)}
                            className={`compact-touch text-[10px] px-1.5 py-0.5 rounded transition ${
                              stu.is_not_graded
                                ? 'bg-amber-100 text-amber-800 font-bold'
                                : 'opacity-0 group-hover:opacity-70 touch-visible text-slate-500'
                            }`}
                            title="Ohne Bewertung (o.B.) umschalten"
                          >
                            {stu.is_not_graded ? 'o.B. aktiv' : 'o.B.'}
                          </button>
                          <button
                            onClick={() => toggleStudentArchived(stu.id)}
                            className={`compact-touch w-6 h-6 rounded inline-flex items-center justify-center transition ${
                              stu.is_archived
                                ? 'bg-amber-200 text-amber-900 font-bold'
                                : 'opacity-0 group-hover:opacity-70 touch-visible text-slate-500'
                            }`}
                            title={
                              stu.is_archived
                                ? 'Schüler:in wiederherstellen'
                                : 'Schüler:in archivieren (z.B. bei Schulwechsel)'
                            }
                          >
                            <Archive className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {activeDataset.config.enable_student_levels && (
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => cycleStudentLevel(stu.id)}
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold font-mono transition hover:scale-105"
                          style={{
                            backgroundColor: levelStyle?.bg || 'var(--bg-subtle)',
                            color: levelStyle?.text || 'var(--text-secondary)',
                          }}
                        >
                          {stu.level || 'M'}
                        </button>
                      </td>
                    )}

                    {/* Calculated Overall Grade Pill (LIVE) */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {summary && summary.overall_percent !== null ? (
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className="px-2.5 py-1 rounded-full font-mono tabular-nums font-bold text-xs border"
                            style={{
                              backgroundColor: tierStyle?.bg || 'var(--primary-soft)',
                              color: tierStyle?.text || 'var(--primary-text)',
                              borderColor: tierStyle?.border || 'transparent',
                            }}
                          >
                            {cellFormat === 'percent_only'
                              ? `${summary.overall_percent}%`
                              : cellFormat === 'grade_only'
                              ? summary.overall_display_grade
                              : `${summary.overall_percent}% · ${summary.overall_display_grade}`}
                          </span>
                        </div>
                      ) : (
                        <span
                          className="font-mono text-xs"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {stu.is_not_graded ? 'o.B.' : '—'}
                        </span>
                      )}
                    </td>

                    {/* Set / Override Official Zeugnisnote */}
                    {isReportCardColumnVisible && (
                      <td
                        className="py-1.5 px-2 text-center border-r"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <input
                          type="text"
                          value={currentZeugnisOverride}
                          placeholder={summary?.overall_display_grade || '—'}
                          onChange={(e) =>
                            updateReportCardOverride(stu.id, e.target.value)
                          }
                          className={`w-14 text-center font-mono tabular-nums text-xs py-1 px-1 rounded-lg border transition ${
                            currentZeugnisOverride
                              ? 'font-extrabold ring-1 ring-teal-500'
                              : 'opacity-70'
                          }`}
                          style={{
                            backgroundColor: currentZeugnisOverride
                              ? 'var(--primary-soft)'
                              : 'transparent',
                            color: currentZeugnisOverride
                              ? 'var(--primary-text)'
                              : 'var(--text-primary)',
                            borderColor: 'var(--border-subtle)',
                          }}
                          title="Offizielle Zeugnisnote eintragen (leer lassen = berechnete Note übernehmen)"
                        />
                      </td>
                    )}

                    {/* Category Columns */}
                    {activeDataset.categories.map((cat) => {
                      const catAssessments = termAssessments.filter(
                        (a) => a.category_id === cat.id
                      );
                      const catSummary = summary?.category_results.find(
                        (cr) => cr.category_id === cat.id
                      );

                      return (
                        <React.Fragment key={cat.id}>
                          {catAssessments.map((assess) => {
                            const entry = activeDataset.grades.find(
                              (g) =>
                                g.student_id === stu.id && g.assessment_id === assess.id
                            );

                            return (
                              <td key={assess.id} className="py-1.5 px-2 text-center">
                                {entry?.status === 'excused' ? (
                                  <button
                                    onClick={() =>
                                      updateGradeEntry(stu.id, assess.id, '', 'percent')
                                    }
                                    className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                                  >
                                    Attest
                                  </button>
                                ) : (
                                  <input
                                    type="text"
                                    inputMode={assess.input_mode === 'grade_scale' ? 'text' : 'decimal'}
                                    value={
                                      assess.input_mode === 'grade_scale'
                                        ? entry?.direct_grade_value != null
                                          ? String(entry.direct_grade_value)
                                          : entry?.percent_value != null
                                          ? String(percentToGradeThreshold(entry.percent_value, activeDataset.config, stu.level).numeric_value)
                                          : ''
                                        : assess.input_mode === 'points'
                                        ? entry?.raw_points != null
                                          ? String(entry.raw_points)
                                          : entry?.percent_value != null
                                          ? String(Math.round(((entry.percent_value / 100) * (assess.max_points || 15)) * 10) / 10)
                                          : ''
                                        : entry?.percent_value != null
                                        ? String(entry.percent_value)
                                        : entry?.direct_grade_value != null
                                        ? String(Math.round(gradeToPercent(entry.direct_grade_value, activeDataset.config)))
                                        : ''
                                    }
                                    placeholder="—"
                                    title={
                                      entry?.status === 'excused'
                                        ? 'Attest / Entschuldigt'
                                        : entry?.percent_value != null || entry?.direct_grade_value != null
                                        ? `Note: ${entry?.direct_grade_value ?? (entry?.percent_value != null ? percentToGradeThreshold(entry.percent_value, activeDataset.config, stu.level).display_label : '—')} | ${entry?.percent_value != null ? `${entry.percent_value}%` : '—'} | ${entry?.raw_points != null ? `${entry.raw_points} Pkt` : '—'}`
                                        : 'Wert eintragen'
                                    }
                                    onChange={(e) =>
                                      updateGradeEntry(
                                        stu.id,
                                        assess.id,
                                        e.target.value,
                                        assess.input_mode || 'percent'
                                      )
                                    }
                                    className="w-16 text-center font-mono text-xs py-1 px-1.5 rounded-lg border bg-transparent focus:outline-none focus:ring-2 focus:ring-teal-500 transition tabular-nums"
                                    style={{
                                      borderColor:
                                        entry?.percent_value != null ||
                                        entry?.direct_grade_value != null ||
                                        entry?.raw_points != null
                                          ? 'var(--border-subtle)'
                                          : 'transparent',
                                      color: 'var(--text-primary)',
                                    }}
                                  />
                                )}
                              </td>
                            );
                          })}

                          {userSettings.showCategoryAveragesInMatrix && (
                            <td
                              className="py-2 px-2.5 text-center border-r font-mono tabular-nums text-[11px] font-semibold whitespace-nowrap"
                              style={{
                                backgroundColor: 'var(--bg-subtle)',
                                borderColor: 'var(--border-subtle)',
                                color:
                                  catSummary?.average_percent != null
                                    ? 'var(--text-primary)'
                                    : 'var(--text-muted)',
                              }}
                            >
                              {catSummary?.average_percent != null
                                ? cellFormat === 'grade_only'
                                ? catSummary.display_grade
                                : `${catSummary.average_percent}% (${catSummary.display_grade})`
                                : '—'}
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ExportConfigModal
        isOpen={showExportConfigModal}
        onClose={() => setShowExportConfigModal(false)}
        dataset={activeDataset}
        report={calculationReport}
        activeTerm={activeTerm}
        onUpdateDatasetMeta={onUpdateDatasetMeta}
      />
    </div>
  );
};
