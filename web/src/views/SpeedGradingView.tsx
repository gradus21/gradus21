import React from 'react';
import {
  AssessmentConfig,
  ClassroomSubjectDataset,
  gradeToPercent,
  GRADING_CURVE_PRESETS,
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
import type { GlobalTemplateRecord } from '../types/templates';
import { Sliders } from 'lucide-react';
import { triggerHapticFeedback } from '../utils/haptics';

export interface SpeedGradingViewProps {
  activeDataset: ClassroomSubjectDataset;
  activeTerm: TermFilterId;
  termAssessments: AssessmentConfig[];
  activeAssessment: AssessmentConfig;
  setSelectedAssessmentId: (id: string) => void;
  speedInputMode: 'percent' | 'points' | 'grade_scale';
  setSpeedInputMode: (mode: 'percent' | 'points' | 'grade_scale') => void;
  visibleStudents: StudentProfile[];
  summaryByStudentId: Map<string, StudentCalculatedSummary>;
  calculationReport: ClassCalculationReport | null;
  updateGradeEntry: (
    studentId: string,
    assessmentId: string,
    inputValue: string,
    inputType: 'percent' | 'points' | 'grade_scale' | 'excused'
  ) => void;
  isCurveEditorVisible: boolean;
  userSettings: UserSyncSettings;
  setShowOnDemandCurveEditor: React.Dispatch<React.SetStateAction<boolean>>;
  globalTemplates: GlobalTemplateRecord[];
  curvePresetKey: string;
  curveCutoffs: { n1: number; n2: number; n3: number; n4: number; n5: number };
  applyCurveCutoffs: (
    nextCutoffs: { n1: number; n2: number; n3: number; n4: number; n5: number },
    presetName?: string
  ) => void;
  applyGlobalCurveTemplate: (tpl: GlobalTemplateRecord) => void;
  isDifferentiationEnabled: boolean;
  toggleStudentLevelsEnabled: (enabled: boolean) => void;
  currentLevelOffsets: { G: number; M: number; E: number };
  setMode: (mode: WorkspaceMode) => void;
}

export const SpeedGradingView: React.FC<SpeedGradingViewProps> = ({
  activeDataset,
  activeTerm,
  termAssessments,
  activeAssessment,
  setSelectedAssessmentId,
  speedInputMode,
  setSpeedInputMode,
  visibleStudents,
  summaryByStudentId,
  calculationReport,
  updateGradeEntry,
  isCurveEditorVisible,
  userSettings,
  setShowOnDemandCurveEditor,
  globalTemplates,
  curvePresetKey,
  curveCutoffs,
  applyCurveCutoffs,
  applyGlobalCurveTemplate,
  isDifferentiationEnabled,
  toggleStudentLevelsEnabled,
  currentLevelOffsets,
  setMode,
}) => {
  const gradedCount = visibleStudents.filter((stu) => {
    const entry = activeDataset.grades.find(
      (g) => g.student_id === stu.id && g.assessment_id === activeAssessment.id
    );
    return (
      entry &&
      (entry.percent_value != null ||
        entry.direct_grade_value != null ||
        entry.status === 'excused')
    );
  }).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <div
        data-tour="speed-grading-table"
        className="lg:col-span-2 rounded-2xl border p-3.5 sm:p-6 shadow-sm space-y-4 sm:space-y-5"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 border-b pb-3.5 sm:pb-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
            >
              Speed-Grading Modus ({activeTerm.toUpperCase()})
            </span>
            <h2 className="text-base sm:text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
              Prüfung bewerten: {activeAssessment.title}
            </h2>
            <span className="hidden sm:inline-block text-[11px] opacity-75 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Pfeiltasten ↑ / ↓ oder Enter zum nächsten Schüler
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={activeAssessment.id}
              onChange={(e) => setSelectedAssessmentId(e.target.value)}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-xl border text-xs font-semibold max-w-full"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {termAssessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} (max. {a.max_points || 100} Pkt)
                </option>
              ))}
            </select>

            <div
              className="flex rounded-xl p-1 border text-xs font-semibold w-full sm:w-auto justify-center"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <button
                onClick={() => setSpeedInputMode('percent')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition ${
                  speedInputMode === 'percent' ? 'bg-teal-600 text-white font-bold' : 'opacity-80'
                }`}
              >
                % Prozent
              </button>
              <button
                onClick={() => setSpeedInputMode('points')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition ${
                  speedInputMode === 'points' ? 'bg-teal-600 text-white font-bold' : 'opacity-80'
                }`}
              >
                Punkte (/{activeAssessment.max_points || 15})
              </button>
              <button
                onClick={() => setSpeedInputMode('grade_scale')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg transition ${
                  speedInputMode === 'grade_scale' ? 'bg-teal-600 text-white font-bold' : 'opacity-80'
                }`}
              >
                {activeDataset.config.scale_id === 'de_oberstufe_0_to_15'
                  ? '0–15 Pkt'
                  : 'Note'}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Quick Progress Strip */}
        <div
          className="lg:hidden flex items-center justify-between gap-3 p-2.5 rounded-xl border"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                gradedCount === visibleStudents.length
                  ? 'bg-emerald-500'
                  : 'bg-teal-500 animate-pulse'
              }`}
            />
            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              {gradedCount} von {visibleStudents.length} bewertet
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-teal-600 dark:text-teal-400">
            <span>Live Ø {calculationReport?.class_display_grade || '—'}</span>
            <span className="opacity-75 font-normal">
              ({calculationReport?.class_average_percent ?? '—'}%)
            </span>
          </div>
        </div>

        <div
          data-privacy-sensitive="true"
          className="divide-y max-h-[620px] overflow-y-auto pr-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {visibleStudents.map((stu, idx) => {
            const entry = activeDataset.grades.find(
              (g) => g.student_id === stu.id && g.assessment_id === activeAssessment.id
            );
            const summary = summaryByStudentId.get(stu.id);
            const tierStyle = summary
              ? TIER_BADGE_STYLES[summary.semantic_tier]
              : undefined;

            return (
              <div key={stu.id} className="py-2 sm:py-2.5 flex items-center justify-between gap-1.5 sm:gap-4">
                <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 max-w-[55%] sm:max-w-none">
                  <span className="text-xs font-mono opacity-45 w-4 sm:w-6 shrink-0">{idx + 1}.</span>
                  <span
                    className="font-semibold text-sm truncate"
                    style={{ color: 'var(--text-primary)' }}
                    title={stu.name}
                  >
                    {stu.name}
                  </span>
                  {stu.level && (
                    <span
                      className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold font-mono shrink-0"
                      style={{
                        backgroundColor: LEVEL_BADGE_STYLES[stu.level]?.bg,
                        color: LEVEL_BADGE_STYLES[stu.level]?.text,
                      }}
                    >
                      {stu.level}
                    </span>
                  )}
                  {/* Mobile Instant Grade Result Indicator */}
                  {entry?.percent_value != null && (
                    <span className="sm:hidden px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/25 shrink-0">
                      {entry.direct_grade_value ??
                        percentToGradeThreshold(
                          entry.percent_value,
                          activeDataset.config,
                          stu.level
                        ).display_label}
                    </span>
                  )}
                  {entry?.direct_grade_value != null && entry?.percent_value == null && (
                    <span className="sm:hidden px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25 shrink-0">
                      {entry.direct_grade_value}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto sm:ml-0">
                  {entry?.status === 'excused' ? (
                    <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-semibold">
                      Entschuldigt
                    </span>
                  ) : entry?.percent_value != null ? (
                    <span
                      className="text-xs font-mono hidden sm:inline"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {entry.raw_points ??
                        Math.round(
                          (entry.percent_value / 100) *
                            (activeAssessment.max_points || 15)
                        )}
                      /{activeAssessment.max_points || 15} Pkt ={' '}
                      <strong>{entry.percent_value}%</strong>
                      <span className="ml-1.5 font-bold text-teal-600 dark:text-teal-400">
                        → Note:{' '}
                        {entry.direct_grade_value ??
                          percentToGradeThreshold(
                            entry.percent_value,
                            activeDataset.config,
                            stu.level
                          ).display_label}
                      </span>
                    </span>
                  ) : entry?.direct_grade_value != null ? (
                    <span
                      className="text-xs font-mono hidden sm:inline"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Direkt:{' '}
                      <strong>
                        {entry.direct_grade_value}
                        {activeDataset.config.scale_id === 'de_oberstufe_0_to_15'
                          ? ' Pkt'
                          : ''}
                      </strong>
                    </span>
                  ) : null}

                  <input
                    type="text"
                    inputMode={speedInputMode === 'grade_scale' ? 'text' : 'decimal'}
                    enterKeyHint="next"
                    data-speed-grade-idx={idx}
                    onFocus={(e) => e.target.select()}
                    value={
                      entry?.status === 'excused'
                        ? 'K'
                        : speedInputMode === 'grade_scale'
                        ? entry?.direct_grade_value ??
                          (entry?.percent_value != null
                            ? percentToGradeThreshold(
                                entry.percent_value,
                                activeDataset.config,
                                stu.level
                              ).numeric_value
                            : '')
                        : speedInputMode === 'points'
                        ? entry?.raw_points ??
                          (entry?.percent_value != null
                            ? Math.round(
                                ((entry.percent_value / 100) *
                                  (activeAssessment.max_points || 15)) *
                                  10
                              ) / 10
                            : '')
                        : entry?.percent_value ??
                          (entry?.direct_grade_value != null
                            ? Math.round(
                                gradeToPercent(
                                  entry.direct_grade_value,
                                  activeDataset.config
                                )
                              )
                            : '')
                    }
                    placeholder={
                      speedInputMode === 'grade_scale'
                        ? activeDataset.config.scale_id === 'de_oberstufe_0_to_15'
                          ? '0–15 Pkt'
                          : '1.0–6.0'
                        : speedInputMode === 'points'
                        ? `0–${activeAssessment.max_points || 15}`
                        : '0–100%'
                    }
                    onChange={(e) => {
                      triggerHapticFeedback(6);
                      updateGradeEntry(
                        stu.id,
                        activeAssessment.id,
                        e.target.value,
                        speedInputMode
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const nextInput = document.querySelector<HTMLInputElement>(
                          `[data-speed-grade-idx="${idx + 1}"]`
                        );
                        nextInput?.focus();
                        nextInput?.select();
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prevInput = document.querySelector<HTMLInputElement>(
                          `[data-speed-grade-idx="${idx - 1}"]`
                        );
                        prevInput?.focus();
                        prevInput?.select();
                      }
                    }}
                    className="w-16 sm:w-24 px-1.5 sm:px-3 py-1.5 rounded-xl border text-center font-mono text-base sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[44px] sm:min-h-0"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />

                  <button
                    onClick={() =>
                      updateGradeEntry(
                        stu.id,
                        activeAssessment.id,
                        entry?.status === 'excused' ? '' : 'K',
                        'excused'
                      )
                    }
                    className={`px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition min-h-[44px] sm:min-h-0 shrink-0 ${
                      entry?.status === 'excused'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    title="Als entschuldigt (Krank/Attest) markieren"
                  >
                    <span className="hidden sm:inline">Attest</span>
                    <span className="sm:hidden font-bold">K</span>
                  </button>

                  <span
                    className="w-10 sm:w-16 text-center py-1 rounded-lg font-mono text-xs font-bold shrink-0"
                    style={{
                      backgroundColor: tierStyle?.bg || 'var(--bg-subtle)',
                      color: tierStyle?.text || 'var(--text-muted)',
                    }}
                    title="Aktuelle Gesamtnote im Halbjahr"
                  >
                    {summary?.overall_display_grade || '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Live Notenspiegel + Interaktiver Notenschlüssel-Editor */}
      <div data-tour="speed-grading-curve-box" className="space-y-4 sm:space-y-5">
        <div
          className="rounded-2xl border p-3.5 sm:p-6 shadow-sm space-y-4 sm:space-y-5"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--primary-500)' }}
            >
              Live-Notenspiegel
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Ø {calculationReport?.class_display_grade || '—'} (
                {calculationReport?.class_average_percent ?? '—'}%)
              </h3>
            </div>
          </div>

          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((tier) => {
              const count = calculationReport?.distribution_buckets[tier - 1] || 0;
              const maxCount = Math.max(
                ...(calculationReport?.distribution_buckets || [1]),
                1
              );
              const widthPct = Math.round((count / maxCount) * 100);
              const style = TIER_BADGE_STYLES[tier];

              return (
                <div key={tier} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span style={{ color: 'var(--text-primary)' }}>{style.label}</span>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {count}x
                    </span>
                  </div>
                  <div
                    className="w-full h-2.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-subtle)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(widthPct, count > 0 ? 8 : 0)}%`,
                        backgroundColor: style.text,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!isCurveEditorVisible ? (
          <button
            onClick={() => setShowOnDemandCurveEditor(true)}
            className="w-full py-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--primary-500)',
            }}
          >
            <Sliders className="w-4 h-4" />
            <span>Notenschlüssel-Editor bei Bedarf einblenden</span>
          </button>
        ) : (
          <div
            className="rounded-2xl border p-6 shadow-sm space-y-4"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--primary-500)' }}
                >
                  Notenschlüssel-Feintuning
                </span>
                <h3
                  className="text-base font-bold mt-0.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Interaktiver Notenschlüssel-Editor
                </h3>
              </div>
              {!userSettings.showCurveEditorInSpeedGrading && (
                <button
                  onClick={() => setShowOnDemandCurveEditor(false)}
                  className="text-[11px] font-semibold opacity-70 hover:opacity-100"
                >
                  Einklappen
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {globalTemplates.filter((t) => t.template_type === 'curve').length > 0
                ? globalTemplates
                    .filter((t) => t.template_type === 'curve')
                    .map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => applyGlobalCurveTemplate(tpl)}
                        className={`p-2 rounded-xl border text-left text-xs transition ${
                          curvePresetKey === tpl.title ? 'ring-2 ring-teal-500 font-bold' : ''
                        }`}
                        style={{
                          backgroundColor:
                            curvePresetKey === tpl.title
                              ? 'var(--primary-soft)'
                              : 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="truncate">{tpl.title}</span>
                          <span className="text-[9px] px-1 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded font-semibold ml-1 shrink-0">
                            Global
                          </span>
                        </div>
                      </button>
                    ))
                : Object.entries(GRADING_CURVE_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applyCurveCutoffs(preset.cutoffs, key)}
                      className={`p-2 rounded-xl border text-left text-xs transition ${
                        curvePresetKey === key ? 'ring-2 ring-teal-500 font-bold' : ''
                      }`}
                      style={{
                        backgroundColor:
                          curvePresetKey === key
                            ? 'var(--primary-soft)'
                            : 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {preset.name}
                    </button>
                  ))}
            </div>

            <div className="space-y-2.5 pt-1 text-xs">
              {(
                [
                  { key: 'n1', label: 'Note 1 (Sehr gut) ab:', min: 80, max: 98 },
                  { key: 'n2', label: 'Note 2 (Gut) ab:', min: 65, max: 88 },
                  { key: 'n3', label: 'Note 3 (Befriedigend) ab:', min: 50, max: 75 },
                  { key: 'n4', label: 'Note 4 (Ausreichend) ab:', min: 35, max: 60 },
                  { key: 'n5', label: 'Note 5 (Mangelhaft) ab:', min: 15, max: 40 },
                ] as const
              ).map((row) => (
                <div key={row.key} className="space-y-0.5">
                  <div className="flex justify-between font-semibold">
                    <span>{row.label}</span>
                    <span
                      className="font-mono font-bold"
                      style={{ color: 'var(--primary-500)' }}
                    >
                      ≥ {curveCutoffs[row.key]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={row.min}
                    max={row.max}
                    value={curveCutoffs[row.key]}
                    onChange={(e) =>
                      applyCurveCutoffs(
                        { ...curveCutoffs, [row.key]: Number(e.target.value) },
                        'custom'
                      )
                    }
                    className="w-full accent-teal-600"
                  />
                </div>
              ))}
            </div>

            {/* Quick Binnendifferenzierung Status in Speed-Grading */}
            <div
              className="p-3 rounded-xl border text-[11px] space-y-2"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                  Binnendifferenzierung (G / M / E):
                </span>
                <button
                  onClick={() => toggleStudentLevelsEnabled(!isDifferentiationEnabled)}
                  className="px-2 py-0.5 rounded font-bold text-[10px]"
                  style={{
                    backgroundColor: isDifferentiationEnabled
                      ? 'var(--primary-soft)'
                      : 'var(--bg-surface)',
                    color: isDifferentiationEnabled
                      ? 'var(--primary-text)'
                      : 'var(--text-secondary)',
                  }}
                >
                  {isDifferentiationEnabled ? 'Aktiv verrechnet' : 'Inaktiv (gleicher Maßstab)'}
                </button>
              </div>
              {isDifferentiationEnabled && (
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                  <div className="px-2 py-1 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold">
                    G: {currentLevelOffsets.G > 0 ? `+${currentLevelOffsets.G}` : currentLevelOffsets.G}%
                  </div>
                  <div className="px-2 py-1 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold">
                    M: {currentLevelOffsets.M > 0 ? `+${currentLevelOffsets.M}` : currentLevelOffsets.M}%
                  </div>
                  <div className="px-2 py-1 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold">
                    E: {currentLevelOffsets.E > 0 ? `+${currentLevelOffsets.E}` : currentLevelOffsets.E}%
                  </div>
                </div>
              )}
              <button
                onClick={() => setMode('configurator')}
                className="w-full text-left underline font-semibold pt-0.5"
                style={{ color: 'var(--primary-500)' }}
              >
                → Im Gewichtungs-Baukasten detailliert anpassen (inkl. G/M/E-Tabelle)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
