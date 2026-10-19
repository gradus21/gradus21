import React, { useMemo, useState } from 'react';
import {
  ClassroomSubjectDataset,
  StudentProfile,
  TermFilterId,
  UserSyncSettings,
} from '../data/demoClasses';
import {
  LEVEL_BADGE_STYLES,
  StudentCalculatedSummary,
} from '../types/workspace';
import { printStudentParentReport } from '../components/ExportAndPrintHelpers';
import { wasm_simulate_needed_score_v2 } from '../wasm-pkg/gradus21_core';
import { Printer, Sparkles } from 'lucide-react';

export interface Student360ViewProps {
  activeDataset: ClassroomSubjectDataset;
  activeTerm: TermFilterId;
  visibleStudents: StudentProfile[];
  activeStudent: StudentProfile;
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  summaryByStudentId: Map<string, StudentCalculatedSummary>;
  activeStudentSummary: StudentCalculatedSummary | undefined;
  userSettings: UserSyncSettings;
  showOnDemandSimulator: boolean;
  setShowOnDemandSimulator: React.Dispatch<React.SetStateAction<boolean>>;
  updateReportCardOverride: (studentId: string, gradeVal: string, reason?: string) => void;
  wasmReady: boolean;
}

export const Student360View: React.FC<Student360ViewProps> = ({
  activeDataset,
  activeTerm,
  visibleStudents,
  activeStudent,
  selectedStudentId,
  setSelectedStudentId,
  summaryByStudentId,
  activeStudentSummary,
  userSettings,
  showOnDemandSimulator,
  setShowOnDemandSimulator,
  updateReportCardOverride,
  wasmReady,
}) => {
  const [simCategoryId, setSimCategoryId] = useState<string>(
    activeDataset.categories[0]?.id || 'cat_lnw'
  );
  const [simTargetPercent, setSimTargetPercent] = useState<number>(80);

  const isSimulatorVisible =
    userSettings.showWhatIfSimulator || showOnDemandSimulator;

  const simulatedNeededPercent: number | null = useMemo(() => {
    if (!wasmReady || !activeStudentSummary || !activeStudent) return null;
    try {
      const levelOffset =
        activeDataset.config.enable_student_levels && activeStudent?.level
          ? activeDataset.config.level_threshold_offsets[activeStudent.level] ?? 0
          : 0;
      const effectiveTargetPercent = Math.max(0, Math.min(100, simTargetPercent + levelOffset));

      const simInput = {
        config: activeDataset.config,
        categories: activeDataset.categories,
        assessments: activeDataset.assessments,
        grades: activeDataset.grades,
        student: activeStudent,
        current_summary: activeStudentSummary,
        target_category_id: simCategoryId,
        target_overall_percent: effectiveTargetPercent,
        term_filter: activeTerm === 'all' ? null : activeTerm,
        simulated_weight: 1.0,
        simulated_max_points: 20.0,
      };

      const val = wasm_simulate_needed_score_v2(JSON.stringify(simInput));
      return typeof val === 'number' ? val : null;
    } catch {
      return null;
    }
  }, [
    wasmReady,
    activeStudentSummary,
    activeStudent,
    activeDataset.config,
    activeDataset.categories,
    activeDataset.assessments,
    activeDataset.grades,
    simCategoryId,
    simTargetPercent,
    activeTerm,
  ]);

  return (
    <div data-tour="student360-container" data-privacy-sensitive="true" className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div
        className="rounded-2xl border p-4 shadow-sm max-h-[680px] overflow-y-auto space-y-1"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div
          className="text-xs font-bold uppercase tracking-wider px-2 py-1.5"
          style={{ color: 'var(--text-secondary)' }}
        >
          Einzel-Ansicht (Datenschutz-Modus)
        </div>
        {visibleStudents.map((stu) => {
          const sum = summaryByStudentId.get(stu.id);
          const selected = stu.id === activeStudent.id;
          return (
            <button
              key={stu.id}
              onClick={() => setSelectedStudentId(stu.id)}
              className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                selected ? 'shadow-sm' : 'hover:opacity-90'
              }`}
              style={{
                backgroundColor: selected ? 'var(--primary-soft)' : 'transparent',
                color: selected ? 'var(--primary-text)' : 'var(--text-primary)',
              }}
            >
              <div className="flex items-center gap-2">
                <span>{stu.name}</span>
                {stu.level && (
                  <span className="text-[10px] font-mono opacity-75">({stu.level})</span>
                )}
              </div>
              <span className="font-mono font-bold">
                {sum?.overall_display_grade || '—'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="lg:col-span-3 space-y-6">
        <div
          className="rounded-2xl border p-6 shadow-sm flex flex-wrap items-center justify-between gap-4"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'var(--primary-soft)',
                  color: 'var(--primary-text)',
                }}
              >
                Elterngesprächs-Ansicht ({activeTerm.toUpperCase()})
              </span>
              {activeStudent.level && (
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: LEVEL_BADGE_STYLES[activeStudent.level]?.bg,
                    color: LEVEL_BADGE_STYLES[activeStudent.level]?.text,
                  }}
                >
                  Niveau {activeStudent.level} ({LEVEL_BADGE_STYLES[activeStudent.level]?.desc})
                </span>
              )}
            </div>
            <h2
              className="text-2xl font-extrabold mt-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {activeStudent.name}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {activeStudent.notes || 'Keine besonderen pädagogischen Vermerke hinterlegt.'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                printStudentParentReport(
                  activeDataset,
                  activeStudent,
                  activeStudentSummary,
                  activeTerm
                )
              }
              data-tour="student360-print-btn"
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <Printer className="w-4 h-4" />
              <span>Elterngesprächs-Bogen drucken / PDF</span>
            </button>

            <div className="text-right">
              <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Berechneter Schnitt
              </div>
              <div
                className="text-3xl font-extrabold font-mono mt-0.5"
                style={{ color: 'var(--primary-500)' }}
              >
                {activeStudentSummary?.overall_display_grade || '—'}
              </div>
              <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                {activeStudentSummary?.overall_percent != null
                  ? `${activeStudentSummary.overall_percent}% Gesamtleistung`
                  : 'Noch keine Bewertung'}
              </div>
            </div>
          </div>
        </div>

        {/* Zeugnisnoten-Festlegung & Pädagogische Begründung */}
        <div
          className="rounded-2xl border p-5 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <label
              className="block text-xs font-bold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              Festgesetzte Zeugnisnote ({activeTerm.toUpperCase()}):
            </label>
            <input
              type="text"
              value={
                (activeTerm === 'hj1'
                  ? activeDataset.reportCardOverrides?.[activeStudent.id]?.hj1
                  : activeTerm === 'hj2'
                  ? activeDataset.reportCardOverrides?.[activeStudent.id]?.hj2
                  : activeDataset.reportCardOverrides?.[activeStudent.id]?.all) || ''
              }
              placeholder={`Vorschlag: ${activeStudentSummary?.overall_display_grade || '—'}`}
              onChange={(e) => updateReportCardOverride(activeStudent.id, e.target.value)}
              className="w-full px-3 py-2 rounded-xl border font-mono text-sm font-bold bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--primary-500)' }}
            />
          </div>
          <div className="md:col-span-2">
            <label
              className="block text-xs font-bold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              Pädagogische Begründung / Bemerkung für Konferenz & Elternbogen:
            </label>
            <input
              type="text"
              value={activeDataset.reportCardOverrides?.[activeStudent.id]?.reason || ''}
              placeholder="z.B. Aufrundung wegen kontinuierlicher Steigerung im Unterrichtsgespräch"
              onChange={(e) =>
                updateReportCardOverride(
                  activeStudent.id,
                  (activeTerm === 'hj1'
                    ? activeDataset.reportCardOverrides?.[activeStudent.id]?.hj1
                    : activeTerm === 'hj2'
                    ? activeDataset.reportCardOverrides?.[activeStudent.id]?.hj2
                    : activeDataset.reportCardOverrides?.[activeStudent.id]?.all) || '',
                  e.target.value
                )
              }
              className="w-full px-3 py-2 rounded-xl border text-xs bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Category Cards */}
        <div data-tour="student360-analysis-card" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activeStudentSummary?.category_results.map((cr) => (
            <div
              key={cr.category_id}
              className="rounded-2xl border p-5 shadow-sm space-y-2"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-bold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {cr.category_name}
                </span>
                <span
                  className="text-[11px] font-mono px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Effektiv {cr.effective_weight_percent}%
                </span>
              </div>
              <div
                className="text-2xl font-extrabold font-mono"
                style={{ color: 'var(--text-primary)' }}
              >
                {cr.average_percent != null
                  ? `${cr.average_percent}% · ${cr.display_grade}`
                  : '— (Noch leer)'}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {cr.graded_count} Leistungsnachweise erfasst
              </div>
            </div>
          ))}
        </div>

        {/* Interactive "Was-wäre-wenn" Simulator */}
        {!isSimulatorVisible ? (
          <button
            onClick={() => setShowOnDemandSimulator(true)}
            data-tour="student360-simulator-card"
            className="w-full py-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--primary-500)',
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span>„Was-wäre-wenn“-Zielnoten-Rechner bei Bedarf einblenden</span>
          </button>
        ) : (
          <div
            data-tour="student360-simulator-card"
            className="rounded-2xl border p-6 shadow-sm space-y-4"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" style={{ color: 'var(--primary-500)' }} />
                <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  „Was-wäre-wenn“-Simulator (Zielnoten-Rechner für Beratung & Elterngespräch)
                </h3>
              </div>
              {!userSettings.showWhatIfSimulator && (
                <button
                  onClick={() => setShowOnDemandSimulator(false)}
                  className="text-xs font-semibold opacity-70 hover:opacity-100"
                >
                  Einklappen
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Nächste Prüfung in Kategorie:
                </label>
                <select
                  value={simCategoryId}
                  onChange={(e) => setSimCategoryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {activeDataset.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-xs font-semibold mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Gewünschter Gesamtschnitt:{' '}
                  <strong className="font-mono">{simTargetPercent}%</strong>
                </label>
                <input
                  type="range"
                  min={45}
                  max={95}
                  step={1}
                  value={simTargetPercent}
                  onChange={(e) => setSimTargetPercent(Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
              </div>

              <div
                className="p-4 rounded-xl border text-center"
                style={{
                  backgroundColor: 'var(--primary-soft)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
                  Benötigtes Ergebnis in nächster Prüfung:
                </div>
                <div
                  className="text-2xl font-extrabold font-mono mt-1"
                  style={{ color: 'var(--primary-text)' }}
                >
                  {simulatedNeededPercent !== null ? `${simulatedNeededPercent}%` : '—'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
