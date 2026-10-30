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
import { triggerHapticFeedback } from '../utils/haptics';
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Printer,
  Settings,
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
  onOpenClassManager: (initialTab?: 'students' | 'assessments' | 'meta', highlightAssessmentId?: string) => void;
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
  onAddAssessment?: (
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
  onAddAssessment: _onAddAssessment,
  onUpdateDatasetMeta,
}) => {
  const [showExportConfigModal, setShowExportConfigModal] = useState(false);
  const [showNewStudentForm, setShowNewStudentForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentLevel, setNewStudentLevel] = useState<'G' | 'M' | 'E'>('M');
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
    Boolean(userSettings?.showReportCardColumn || showOnDemandReportCardCol);

  // Mobile Pupil Card Slider State & Tactile Gesture Physics
  const SWIPE_COMMIT_THRESHOLD_PX = 40;
  const [currentStudentIdx, setCurrentStudentIdx] = useState<number>(0);
  const [dragOffsetX, setDragOffsetX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [swipeReadyDirection, setSwipeReadyDirection] = useState<
    'next' | 'prev' | 'boundary-start' | 'boundary-end' | null
  >(null);
  const [slideAnimation, setSlideAnimation] = useState<
    'next' | 'prev' | 'bounce-start' | 'bounce-end' | null
  >(null);

  const touchStartXRef = React.useRef<number | null>(null);
  const touchStartYRef = React.useRef<number | null>(null);
  const touchAxisLockRef = React.useRef<'horizontal' | 'vertical' | null>(null);
  const thresholdHapticFiredRef = React.useRef<boolean>(false);

  const safeStudentIdx = Math.max(
    0,
    Math.min(currentStudentIdx, Math.max(0, visibleStudents.length - 1))
  );
  const currentStudent = visibleStudents[safeStudentIdx];
  const prevStudent = safeStudentIdx > 0 ? visibleStudents[safeStudentIdx - 1] : null;
  const nextStudent =
    safeStudentIdx < visibleStudents.length - 1
      ? visibleStudents[safeStudentIdx + 1]
      : null;

  const goToStudent = (index: number) => {
    if (visibleStudents.length === 0) return;
    const bounded = Math.max(0, Math.min(index, visibleStudents.length - 1));
    if (bounded !== safeStudentIdx) {
      setSlideAnimation(bounded > safeStudentIdx ? 'next' : 'prev');
      triggerHapticFeedback('snap');
      setCurrentStudentIdx(bounded);
    } else {
      setSlideAnimation(index <= 0 ? 'bounce-start' : 'bounce-end');
      triggerHapticFeedback('boundary');
    }
  };

  const currentStudentSummary = currentStudent
    ? summaryByStudentId.get(currentStudent.id)
    : undefined;
  const currentTierStyle = currentStudentSummary
    ? TIER_BADGE_STYLES[currentStudentSummary.semantic_tier]
    : undefined;

  const resetTouchTracking = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchAxisLockRef.current = null;
    thresholdHapticFiredRef.current = false;
    setDragOffsetX(0);
    setIsDragging(false);
    setSwipeReadyDirection(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchAxisLockRef.current = null;
    thresholdHapticFiredRef.current = false;
    setSlideAnimation(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;

    if (touchAxisLockRef.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      touchAxisLockRef.current =
        Math.abs(deltaX) > Math.abs(deltaY) * 1.2 ? 'horizontal' : 'vertical';
    }

    if (touchAxisLockRef.current !== 'horizontal') return;

    setIsDragging(true);

    const isAtStartBoundary = deltaX > 0 && safeStudentIdx === 0;
    const isAtEndBoundary =
      deltaX < 0 && safeStudentIdx >= visibleStudents.length - 1;

    if (isAtStartBoundary || isAtEndBoundary) {
      // Rubber-band resistance at first / last pupil
      const rubberOffset = Math.max(-36, Math.min(36, deltaX * 0.22));
      setDragOffsetX(rubberOffset);
      if (
        Math.abs(deltaX) >= SWIPE_COMMIT_THRESHOLD_PX &&
        !thresholdHapticFiredRef.current
      ) {
        thresholdHapticFiredRef.current = true;
        triggerHapticFeedback('boundary');
        setSwipeReadyDirection(
          isAtStartBoundary ? 'boundary-start' : 'boundary-end'
        );
      }
      return;
    }

    // Smooth 1:1 tactile follow with gentle damping
    const dampedOffset = Math.max(-120, Math.min(120, deltaX * 0.55));
    setDragOffsetX(dampedOffset);

    if (Math.abs(deltaX) >= SWIPE_COMMIT_THRESHOLD_PX) {
      if (!thresholdHapticFiredRef.current) {
        thresholdHapticFiredRef.current = true;
        // Tactile detent tick when crossing the swipe commit threshold
        triggerHapticFeedback('selection');
      }
      setSwipeReadyDirection(deltaX < 0 ? 'next' : 'prev');
    } else if (Math.abs(deltaX) < SWIPE_COMMIT_THRESHOLD_PX - 6) {
      thresholdHapticFiredRef.current = false;
      setSwipeReadyDirection(null);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) {
      resetTouchTracking();
      return;
    }
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
    resetTouchTracking();

    // Trigger swipe when horizontal motion clearly dominates vertical scroll
    if (
      Math.abs(deltaX) >= SWIPE_COMMIT_THRESHOLD_PX &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.25
    ) {
      if (deltaX < 0) {
        goToStudent(safeStudentIdx + 1);
      } else {
        goToStudent(safeStudentIdx - 1);
      }
    }
  };

  const handleCreateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    onAddStudent(newStudentName.trim(), newStudentLevel);
    setNewStudentName('');
    setShowNewStudentForm(false);
  };

  const cardAnimationClass = isDragging
    ? ''
    : slideAnimation === 'next'
    ? 'pupil-card-enter-next'
    : slideAnimation === 'prev'
    ? 'pupil-card-enter-prev'
    : slideAnimation === 'bounce-start'
    ? 'pupil-card-bounce-start'
    : slideAnimation === 'bounce-end'
    ? 'pupil-card-bounce-end'
    : '';

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="hidden md:flex items-center gap-1.5 sm:gap-2">
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
          </div>

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

        {/* Action Buttons: Schlanke Toolbar ohne Redundanz */}
        <div data-tour="matrix-actions-bar" className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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

          {/* Primary Action: Prüfungen verwalten */}
          <button
            onClick={() => onOpenClassManager('assessments')}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98] hover:opacity-95"
            style={{ backgroundColor: 'var(--primary-500)' }}
            title="Prüfungen im Detail verwalten, anlegen oder Bewertungsart ändern"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prüfungen verwalten</span>
            <span className="sm:hidden">Prüfungen</span>
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

      {/* MOBILE PUPIL CARD SLIDER (Always active on small displays < md) */}
      <div
        data-tour="matrix-mobile-carousel"
        data-testid="pupil-card-slider"
        className="md:hidden space-y-3 overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetTouchTracking}
      >
        {!currentStudent ? (
          <div
            className="p-8 text-center text-xs opacity-60 rounded-2xl border"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            Keine Schüler:innen in dieser Ansicht vorhanden.
          </div>
        ) : (
          <>
            {/* Carousel Navigation Header */}
            <div
              className="flex items-center justify-between gap-2 p-2 rounded-2xl border shadow-xs"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => goToStudent(safeStudentIdx - 1)}
                disabled={safeStudentIdx === 0}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 disabled:opacity-30 transition active:scale-95 touch-target ${
                  swipeReadyDirection === 'prev' ? 'ring-2 ring-teal-500 scale-105' : ''
                }`}
                style={{
                  backgroundColor:
                    swipeReadyDirection === 'prev' ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color:
                    swipeReadyDirection === 'prev' ? 'var(--primary-text)' : 'var(--text-primary)',
                }}
                aria-label="Vorherige:r Schüler:in"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex-1 text-center min-w-0">
                <div className="relative">
                  <select
                    value={safeStudentIdx}
                    onChange={(e) => goToStudent(Number(e.target.value))}
                    className="w-full text-xs font-bold py-2 pl-3 pr-7 rounded-xl border text-center appearance-none truncate"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                    aria-label="Schüler:in auswählen"
                  >
                    {visibleStudents.map((s, idx) => {
                      const sum = summaryByStudentId.get(s.id);
                      return (
                        <option key={s.id} value={idx}>
                          {idx + 1}/{visibleStudents.length}: {s.name} (Ø {sum?.overall_display_grade || '—'})
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => goToStudent(safeStudentIdx + 1)}
                disabled={safeStudentIdx === visibleStudents.length - 1}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 disabled:opacity-30 transition active:scale-95 touch-target ${
                  swipeReadyDirection === 'next' ? 'ring-2 ring-teal-500 scale-105' : ''
                }`}
                style={{
                  backgroundColor:
                    swipeReadyDirection === 'next' ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color:
                    swipeReadyDirection === 'next' ? 'var(--primary-text)' : 'var(--text-primary)',
                }}
                aria-label="Nächste:r Schüler:in"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Tactile Swipe Release Indicator Pill */}
            {swipeReadyDirection && (
              <div
                data-testid="swipe-release-indicator"
                className="flex items-center justify-center py-1 px-3 rounded-xl text-[11px] font-bold border transition-all"
                style={{
                  backgroundColor:
                    swipeReadyDirection === 'next' || swipeReadyDirection === 'prev'
                      ? 'var(--primary-soft)'
                      : 'var(--bg-subtle)',
                  color:
                    swipeReadyDirection === 'next' || swipeReadyDirection === 'prev'
                      ? 'var(--primary-text)'
                      : 'var(--text-secondary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {swipeReadyDirection === 'next' && nextStudent
                  ? `Loslassen für ${nextStudent.name} ➔`
                  : swipeReadyDirection === 'prev' && prevStudent
                  ? `⬅ Loslassen für ${prevStudent.name}`
                  : swipeReadyDirection === 'boundary-start'
                  ? 'Erste:r Schüler:in erreicht'
                  : 'Letzte:r Schüler:in erreicht'}
              </div>
            )}

            {/* The Active Student Card */}
            <div
              data-testid="pupil-slider-card"
              onAnimationEnd={() => setSlideAnimation(null)}
              className={`rounded-2xl border p-4 shadow-sm space-y-4 ${cardAnimationClass} ${
                isDragging ? '' : 'transition-transform duration-200 ease-out'
              }`}
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor:
                  swipeReadyDirection === 'next' || swipeReadyDirection === 'prev'
                    ? 'var(--primary-500)'
                    : 'var(--border-subtle)',
                transform: isDragging
                  ? `translate3d(${dragOffsetX}px, 0, 0) rotate(${(dragOffsetX * 0.022).toFixed(2)}deg) scale(${
                      swipeReadyDirection === 'next' || swipeReadyDirection === 'prev' ? 0.985 : 1
                    })`
                  : undefined,
                willChange: isDragging ? 'transform' : undefined,
              }}
            >
              {/* Header: Student Profile & Live Overall Grade */}
              <div
                className="flex items-start justify-between gap-3 border-b pb-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono opacity-50">#{safeStudentIdx + 1}</span>
                    <h3
                      className="font-extrabold text-base truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {currentStudent.name}
                    </h3>
                    {currentStudent.level && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHapticFeedback('selection');
                          cycleStudentLevel(currentStudent.id);
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-bold font-mono transition active:scale-95"
                        style={{
                          backgroundColor: LEVEL_BADGE_STYLES[currentStudent.level]?.bg,
                          color: LEVEL_BADGE_STYLES[currentStudent.level]?.text,
                        }}
                        title="Klick: Niveau wechseln (G ➔ M ➔ E)"
                      >
                        {currentStudent.level}
                      </button>
                    )}
                    {currentStudent.is_not_graded && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                        o.B.
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectStudent(currentStudent.id);
                      setMode('student_360');
                    }}
                    className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 mt-1"
                  >
                    <span>360°-Akte öffnen</span>
                    <span>➔</span>
                  </button>
                </div>

                {/* Overall Grade Badge */}
                <div className="text-right shrink-0">
                  <div
                    className="px-3 py-1.5 rounded-xl font-mono font-extrabold text-sm border shadow-xs"
                    style={{
                      backgroundColor: currentTierStyle?.bg || 'var(--bg-subtle)',
                      color: currentTierStyle?.text || 'var(--text-primary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    Ø {currentStudentSummary?.overall_display_grade || '—'}
                  </div>
                  <div className="text-[10px] font-mono opacity-70 mt-0.5">
                    {currentStudentSummary?.overall_percent != null
                      ? `${currentStudentSummary.overall_percent}%`
                      : 'Keine Noten'}
                  </div>
                </div>
              </div>

              {/* Optional Zeugnisnote Row */}
              {isReportCardColumnVisible && (
                <div
                  className="p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  <div>
                    <span className="font-bold block" style={{ color: 'var(--text-primary)' }}>
                      Zeugnisnote ({activeTerm.toUpperCase()}):
                    </span>
                    <span className="text-[10px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      Pädagogisch festgesetzte Endnote
                    </span>
                  </div>
                  <input
                    type="text"
                    value={
                      (activeTerm === 'hj1'
                        ? activeDataset.reportCardOverrides?.[currentStudent.id]?.hj1
                        : activeTerm === 'hj2'
                        ? activeDataset.reportCardOverrides?.[currentStudent.id]?.hj2
                        : activeDataset.reportCardOverrides?.[currentStudent.id]?.all) || ''
                    }
                    placeholder={currentStudentSummary?.overall_display_grade || '—'}
                    onChange={(e) => updateReportCardOverride(currentStudent.id, e.target.value)}
                    className="w-16 px-2 py-1 rounded-lg border text-center font-mono font-bold text-sm bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--primary-500)' }}
                  />
                </div>
              )}

              {/* Vertical Assessments Grouped by Category */}
              <div className="space-y-3">
                {activeDataset.categories.map((cat) => {
                  const catAssessments = termAssessments.filter((a) => a.category_id === cat.id);
                  if (catAssessments.length === 0) return null;
                  const catResult = currentStudentSummary?.category_results.find((cr) => cr.category_id === cat.id);
                  const normPct = Math.round((cat.weight / totalCatWeight) * 100);

                  return (
                    <div
                      key={cat.id}
                      className="rounded-xl border overflow-hidden"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      {/* Category Header */}
                      <div
                        className="px-3 py-2 flex items-center justify-between text-xs font-bold border-b"
                        style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                            style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
                          >
                            {normPct}%
                          </span>
                        </div>
                        <span className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          Ø {catResult?.display_grade || '—'} ({catResult?.average_percent != null ? `${catResult.average_percent}%` : '—'})
                        </span>
                      </div>

                      {/* Assessment Items */}
                      <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                        {catAssessments.map((assess) => {
                          const entry = activeDataset.grades.find(
                            (g) => g.student_id === currentStudent.id && g.assessment_id === assess.id
                          );

                          return (
                            <div
                              key={assess.id}
                              className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                  {assess.title}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] opacity-70" style={{ color: 'var(--text-secondary)' }}>
                                  <span>
                                    {assess.input_mode === 'points'
                                      ? `max. ${assess.max_points || 15} Pkt`
                                      : assess.input_mode === 'grade_scale'
                                      ? 'Note (1–6)'
                                      : '% Prozent'}
                                  </span>
                                  {entry?.percent_value != null && (
                                    <>
                                      <span>·</span>
                                      <strong className="text-teal-600 dark:text-teal-400">
                                        Note {entry.direct_grade_value ?? percentToGradeThreshold(entry.percent_value, activeDataset.config, currentStudent.level).display_label}
                                      </strong>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {entry?.status === 'excused' ? (
                                  <button
                                    type="button"
                                    onClick={() => updateGradeEntry(currentStudent.id, assess.id, '', 'percent')}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold"
                                  >
                                    Attest
                                  </button>
                                ) : (
                                  <>
                                    <input
                                      type="text"
                                      inputMode={assess.input_mode === 'grade_scale' ? 'text' : 'decimal'}
                                      enterKeyHint="next"
                                      data-card-grade-input="true"
                                      value={
                                        assess.input_mode === 'grade_scale'
                                          ? entry?.direct_grade_value != null
                                            ? String(entry.direct_grade_value)
                                            : entry?.percent_value != null
                                            ? String(percentToGradeThreshold(entry.percent_value, activeDataset.config, currentStudent.level).numeric_value)
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
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        triggerHapticFeedback('selection');
                                        updateGradeEntry(
                                          currentStudent.id,
                                          assess.id,
                                          e.target.value,
                                          assess.input_mode || 'percent'
                                        );
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          const inputs = Array.from(
                                            document.querySelectorAll<HTMLInputElement>('input[data-card-grade-input]')
                                          );
                                          const currIdx = inputs.indexOf(e.currentTarget);
                                          if (currIdx !== -1 && currIdx < inputs.length - 1) {
                                            triggerHapticFeedback('selection');
                                            inputs[currIdx + 1].focus();
                                            inputs[currIdx + 1].select();
                                          } else if (currIdx === inputs.length - 1 && safeStudentIdx < visibleStudents.length - 1) {
                                            goToStudent(safeStudentIdx + 1);
                                          }
                                        }
                                      }}
                                      className="w-16 text-center font-mono text-sm py-1.5 px-1.5 rounded-lg border font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 tabular-nums min-h-[40px]"
                                      style={{
                                        borderColor: 'var(--border-subtle)',
                                        backgroundColor: 'var(--bg-subtle)',
                                        color: 'var(--text-primary)',
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        triggerHapticFeedback('selection');
                                        updateGradeEntry(
                                          currentStudent.id,
                                          assess.id,
                                          entry?.status === 'excused' ? '' : 'K',
                                          'excused'
                                        );
                                      }}
                                      className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center text-xs font-bold opacity-60 hover:opacity-100 active:scale-95 transition shrink-0 touch-target"
                                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                                      title="Als entschuldigt markieren"
                                    >
                                      K
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Card Carousel Navigation Footer with Target Student Names */}
              <div
                className="flex items-center justify-between gap-2 pt-3 border-t text-xs font-semibold"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  type="button"
                  onClick={() => goToStudent(safeStudentIdx - 1)}
                  disabled={safeStudentIdx === 0}
                  className={`flex-1 py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 disabled:opacity-30 transition active:scale-95 min-h-[44px] min-w-0 ${
                    swipeReadyDirection === 'prev' ? 'ring-2 ring-teal-500' : ''
                  }`}
                  style={{
                    backgroundColor:
                      swipeReadyDirection === 'prev' ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color:
                      swipeReadyDirection === 'prev' ? 'var(--primary-text)' : 'var(--text-primary)',
                  }}
                  title={prevStudent ? `Vorherige:r: ${prevStudent.name}` : undefined}
                >
                  <ChevronLeft className="w-4 h-4 shrink-0" />
                  <span className="truncate max-w-[95px]">{prevStudent ? prevStudent.name : 'Vorherige:r'}</span>
                </button>

                {/* Visual Progress Bar */}
                <div className="flex flex-col items-center px-1 shrink-0">
                  <span className="text-[11px] font-mono font-bold opacity-75">
                    {safeStudentIdx + 1} / {visibleStudents.length}
                  </span>
                  <div className="w-12 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mt-1 overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all duration-200"
                      style={{
                        width: `${((safeStudentIdx + 1) / Math.max(1, visibleStudents.length)) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => goToStudent(safeStudentIdx + 1)}
                  disabled={safeStudentIdx === visibleStudents.length - 1}
                  className={`flex-1 py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 disabled:opacity-30 transition active:scale-95 min-h-[44px] min-w-0 ${
                    swipeReadyDirection === 'next' ? 'ring-2 ring-teal-500' : ''
                  }`}
                  style={{
                    backgroundColor:
                      swipeReadyDirection === 'next' ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color:
                      swipeReadyDirection === 'next' ? 'var(--primary-text)' : 'var(--text-primary)',
                  }}
                  title={nextStudent ? `Nächste:r: ${nextStudent.name}` : undefined}
                >
                  <span className="truncate max-w-[95px]">{nextStudent ? nextStudent.name : 'Nächste:r'}</span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop & Large Tablet Matrix Table (Hidden on small displays < md) */}
      <div
        data-tour="matrix-table"
        className="hidden md:block rounded-2xl border shadow-sm overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100dvh-240px)] sm:max-h-[calc(100vh-270px)]">
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
                  className="py-2.5 px-2.5 sm:px-4 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r max-w-[125px] sm:max-w-none"
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
                  className="py-2.5 px-2.5 sm:px-4 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r max-w-[125px] sm:max-w-none"
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
                          className="py-2.5 px-2 text-center min-w-[100px] group cursor-pointer hover:bg-teal-500/5 transition select-none"
                          onClick={() => {
                            onSelectAssessment(assess.id);
                            setMode('speed_grading');
                          }}
                          title={`Klick: Speed-Grading für „${assess.title}“`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center justify-center gap-1 w-full">
                              <span
                                className="font-bold text-xs truncate group-hover:underline max-w-[120px] sm:max-w-[160px]"
                                style={{ color: 'var(--text-primary)' }}
                                title={assess.title}
                              >
                                {assess.title}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenClassManager('assessments', assess.id);
                                }}
                                title={`Prüfung „${assess.title}“ konfigurieren (Bewertungsart, Max-Punkte, Gewichtung)`}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition shrink-0"
                              >
                                <Settings className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              {assess.input_mode === 'grade_scale' ? (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/25 tracking-tight"
                                  title="Bewertungsmodus: Direkte Note"
                                >
                                  {activeDataset.config.scale_id === 'de_oberstufe_0_to_15' ? '0–15 MSS' : 'Note (1–6)'}
                                </span>
                              ) : assess.input_mode === 'points' ? (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/25 tracking-tight"
                                  title={`Bewertungsmodus: Rohpunkte (max. ${assess.max_points || 15} Pkt)`}
                                >
                                  max. {assess.max_points || 15} Pkt
                                </span>
                              ) : (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/25 tracking-tight"
                                  title="Bewertungsmodus: Prozent (0–100%)"
                                >
                                  % Prozent
                                </span>
                              )}
                              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold" title="Speed-Grading verfügbar">
                                ⚡
                              </span>
                            </div>
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
                      className="py-2.5 px-2.5 sm:px-4 font-semibold sticky left-0 z-10 whitespace-nowrap shadow-[2px_0_5px_rgba(0,0,0,0.03)] border-r max-w-[125px] sm:max-w-none transition-colors group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80"
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                        <button
                          onClick={() => {
                            onSelectStudent(stu.id);
                            setMode('student_360');
                          }}
                          className="hover:underline flex items-center gap-1.5 sm:gap-2 text-left truncate min-w-0"
                          style={{ color: 'var(--text-primary)' }}
                          title={stu.name}
                        >
                          <span className="text-[11px] font-mono opacity-45 w-4 shrink-0">
                            {sIdx + 1}.
                          </span>
                          <span className={`truncate max-w-[90px] sm:max-w-none ${stu.is_archived ? 'line-through' : ''}`}>
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
                                      entry?.percent_value != null || entry?.direct_grade_value != null
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
