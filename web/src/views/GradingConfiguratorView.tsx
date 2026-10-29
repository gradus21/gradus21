import React, { useState, useMemo } from 'react';
import { AlertTriangle, BookmarkPlus, Globe, Plus, Trash2, X } from 'lucide-react';
import {
  CategoryConfig,
  ClassroomSubjectDataset,
  GRADING_CURVE_PRESETS,
  GradingScaleId,
  GradeThreshold,
  StudentProfile,
  UserSyncSettings,
  WeightingMode,
} from '../data/demoClasses';
import type { GlobalTemplateRecord } from '../types/templates';
import { SettingsModal, WEIGHTING_PRESET_CATALOG } from '../components/SettingsModal';
import {
  LEVEL_BADGE_STYLES,
  StudentCalculatedSummary,
  TIER_BADGE_STYLES,
} from '../types/workspace';

export interface GradingConfiguratorViewProps {
  activeDataset: ClassroomSubjectDataset;
  updateSubjectConfig: (updater: (ds: ClassroomSubjectDataset) => ClassroomSubjectDataset) => void;
  userSettings: UserSyncSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSyncSettings>>;
  globalTemplates: GlobalTemplateRecord[];
  curvePresetKey: string;
  curveCutoffs: { n1: number; n2: number; n3: number; n4: number; n5: number };
  applyCurveCutoffs: (
    nextCutoffs: { n1: number; n2: number; n3: number; n4: number; n5: number },
    presetName?: string
  ) => void;
  applyGlobalCurveTemplate: (tpl: GlobalTemplateRecord) => void;
  applyGlobalWeightingTemplate: (tpl: GlobalTemplateRecord) => void;
  applyDifferentiationPreset: (offsets: { G: number; M: number; E: number }, enable?: boolean) => void;
  currentLevelOffsets: { G: number; M: number; E: number };
  isDifferentiationEnabled: boolean;
  toggleStudentLevelsEnabled: (enabled: boolean) => void;
  updateLevelOffset: (level: 'G' | 'M' | 'E', offset: number) => void;
  activeFineThresholds: GradeThreshold[];
  visibleStudents: StudentProfile[];
  activeStudent?: StudentProfile;
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  cycleStudentLevel: (studentId: string) => void;
  summaryByStudentId: Map<string, StudentCalculatedSummary>;
}

export const GradingConfiguratorView: React.FC<GradingConfiguratorViewProps> = ({
  activeDataset,
  updateSubjectConfig,
  userSettings,
  setUserSettings,
  globalTemplates,
  curvePresetKey,
  curveCutoffs,
  applyCurveCutoffs,
  applyGlobalCurveTemplate,
  applyGlobalWeightingTemplate,
  applyDifferentiationPreset,
  currentLevelOffsets,
  isDifferentiationEnabled,
  toggleStudentLevelsEnabled,
  updateLevelOffset,
  activeFineThresholds,
  visibleStudents,
  activeStudent,
  selectedStudentId,
  setSelectedStudentId,
  cycleStudentLevel,
  summaryByStudentId,
}) => {
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryShort, setNewCategoryShort] = useState('');
  const [showAllWeightingPresets, setShowAllWeightingPresets] = useState(false);

  const totalCatWeight = activeDataset.categories.reduce(
    (acc, c) => acc + Math.max(0.01, c.weight),
    0
  );

  const [categoryPendingDelete, setCategoryPendingDelete] = useState<CategoryConfig | null>(null);

  const getCategoryStats = (catId: string) => {
    const assessments = activeDataset.assessments.filter((a) => a.category_id === catId);
    const assessIds = new Set(assessments.map((a) => a.id));
    const gradeCount = (activeDataset.grades || []).filter(
      (g) =>
        assessIds.has(g.assessment_id) &&
        (g.raw_points !== null ||
          g.percent_value !== null ||
          g.direct_grade_value !== null ||
          (g.comment !== null && g.comment.trim() !== ''))
    ).length;
    return { assessmentCount: assessments.length, gradeCount };
  };

  const displayedWeightingPresets = useMemo(() => {
    if (showAllWeightingPresets) return WEIGHTING_PRESET_CATALOG;
    const favs = WEIGHTING_PRESET_CATALOG.filter((p) =>
      userSettings.favoriteWeightingPresets.includes(p.id)
    );
    return favs.length > 0 ? favs : WEIGHTING_PRESET_CATALOG.slice(0, 3);
  }, [userSettings.favoriteWeightingPresets, showAllWeightingPresets]);

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const short = newCategoryShort.trim() || newCategoryName.trim().slice(0, 6);
    const newCat: CategoryConfig = {
      id: `cat_${Date.now()}`,
      name: newCategoryName.trim(),
      short_code: short,
      weight: 0.2,
      drop_lowest_count: 0,
    };
    updateSubjectConfig((ds) => ({
      ...ds,
      categories: [...ds.categories, newCat],
    }));
    setNewCategoryName('');
    setNewCategoryShort('');
  };

  const handleDeleteCategory = (catId: string) => {
    if (activeDataset.categories.length <= 1) return;
    const cat = activeDataset.categories.find((c) => c.id === catId);
    if (cat) {
      setCategoryPendingDelete(cat);
    }
  };

  const handleConfirmDeleteCategory = () => {
    if (!categoryPendingDelete) return;
    const catId = categoryPendingDelete.id;
    if (activeDataset.categories.length <= 1) {
      setCategoryPendingDelete(null);
      return;
    }
    const fallbackCatId =
      activeDataset.categories.find((c) => c.id !== catId)?.id || activeDataset.categories[0].id;
    updateSubjectConfig((ds) => ({
      ...ds,
      categories: ds.categories.filter((c) => c.id !== catId),
      assessments: ds.assessments.map((a) =>
        a.category_id === catId ? { ...a, category_id: fallbackCatId } : a
      ),
    }));
    setCategoryPendingDelete(null);
  };

  const handleSaveCurrentAsCustomTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;
    const newTpl = {
      id: `tpl_${Date.now()}`,
      name: newTemplateName.trim(),
      description: `${activeDataset.categories.length} Kategorien aus ${activeDataset.subjectName}`,
      weighting_mode: activeDataset.config.weighting_mode,
      categories: activeDataset.categories.map((c) => ({ ...c })),
    };
    setUserSettings((prev) => ({
      ...prev,
      customWeightingTemplates: [...prev.customWeightingTemplates, newTpl],
    }));
    setNewTemplateName('');
    setShowSaveTemplateInput(false);
  };

  const applyCustomTemplate = (tplId: string) => {
    const tpl = userSettings.customWeightingTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    updateSubjectConfig((ds) => {
      const nextCats = tpl.categories.map((c) => ({ ...c }));
      const firstCatId = nextCats[0]?.id || ds.categories[0]?.id;
      const validIds = new Set(nextCats.map((c) => c.id));
      return {
        ...ds,
        config: {
          ...ds.config,
          weighting_mode: tpl.weighting_mode,
        },
        categories: nextCats,
        assessments: ds.assessments.map((a, idx) =>
          validIds.has(a.category_id)
            ? a
            : { ...a, category_id: nextCats[idx % nextCats.length]?.id || firstCatId }
        ),
      };
    });
  };

  return (
    <div data-tour="configurator-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <div
        className="lg:col-span-2 rounded-2xl border p-3.5 sm:p-6 shadow-sm space-y-4 sm:space-y-6"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div data-tour="configurator-templates" className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--primary-soft)',
                color: 'var(--primary-text)',
              }}
            >
              Individuelle Fach-Konfiguration ohne Formeln
            </span>
            <h2 className="text-xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>
              Gewichtungs-Baukasten für {activeDataset.subjectName} ({activeDataset.className})
            </h2>
          </div>

          <button
            onClick={() => setShowSaveTemplateInput((s) => !s)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--primary-soft)',
              color: 'var(--primary-text)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <BookmarkPlus className="w-4 h-4" />
            <span>Als eigene Vorlage speichern</span>
          </button>
        </div>

        {showSaveTemplateInput && (
          <form
            onSubmit={handleSaveCurrentAsCustomTemplate}
            className="p-4 rounded-2xl border flex flex-wrap items-end gap-3"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex-1 min-w-[220px]">
              <label
                className="block text-[11px] font-bold mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Name deiner Vorlage (wird für andere Klassen & Geräte synchronisiert)
              </label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="z. B. Sport Sek I (70% Praxis / 30% Theorie)"
                className="w-full px-3 py-1.5 rounded-xl border text-xs bg-white dark:bg-slate-900"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
            </div>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              Vorlage sichern
            </button>
          </form>
        )}

        {/* Globale Vorlagen der Schule */}
        {globalTemplates.filter((t) => t.template_type === 'weighting').length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <label
                className="block text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Globe className="w-3.5 h-3.5 text-indigo-500" />
                <span>Globale Fach-Vorlagen (Zentral bereitgestellt)</span>
              </label>
              <span className="text-[10px] text-slate-400">
                Vorlage anklicken zum Übernehmen und anschließenden Anpassen
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              {globalTemplates
                .filter((t) => t.template_type === 'weighting')
                .map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyGlobalWeightingTemplate(tpl)}
                    className="p-3 rounded-xl border text-left transition hover:border-teal-500 group"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{tpl.title}</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded font-semibold">
                        Global
                      </span>
                    </div>
                    <div
                      className="text-[11px] mt-0.5 line-clamp-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {tpl.description}
                    </div>
                    {tpl.payload?.categories && (
                      <div className="text-[10px] mt-1 text-teal-600 dark:text-teal-400 font-mono">
                        {tpl.payload.categories
                          .map(
                            (c: any) =>
                              `${c.short_code || c.name} ${Math.round(
                                (c.weight > 1 ? c.weight / 100 : c.weight) * 100
                              )}%`
                          )
                          .join(' · ')}
                      </div>
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Gespeicherte eigene Vorlagen */}
        {userSettings.customWeightingTemplates.length > 0 && (
          <div className="space-y-2">
            <label
              className="block text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              Deine gespeicherten Fach-Vorlagen (1-Klick Übernahme)
            </label>
            <div className="flex flex-wrap gap-2">
              {userSettings.customWeightingTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => applyCustomTemplate(tpl.id)}
                  className="px-3 py-2 rounded-xl border text-left text-xs transition hover:border-teal-500"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div className="font-bold">{tpl.name}</div>
                  <div className="text-[10px] opacity-75">
                    {tpl.categories
                      .map((c) => `${c.short_code} ${Math.round(c.weight * 100)}%`)
                      .join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div data-tour="configurator-scale-mode" className="space-y-5">
          <div className="space-y-2">
            <label
              className="block text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              1. Notenskala / Bewertungssystem wählen
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(
                [
                  {
                    id: 'de_classic_1_to_6',
                    title: 'Schulnoten 1–6 (mit Tendenzen)',
                    desc: 'Standard Sek I (1+, 1, 1-, 2+ ... 6) & Prozent-Umrechnung',
                  },
                  {
                    id: 'de_oberstufe_0_to_15',
                    title: 'Oberstufe 0–15 Punkte (MSS)',
                    desc: 'Gymnasiale Kursstufe / Abitur (15 Pkt = 1+ bis 0 Pkt = 6)',
                  },
                  {
                    id: 'us_letter_gpa',
                    title: 'US Letter Grades (A+ bis F)',
                    desc: 'Internationales System inkl. 4.0 GPA-Skala',
                  },
                ] as const
              ).map((sc) => {
                const selected = activeDataset.config.scale_id === sc.id;
                return (
                  <button
                    key={sc.id}
                    onClick={() =>
                      updateSubjectConfig((ds) => ({
                        ...ds,
                        config: {
                          ...ds.config,
                          scale_id: sc.id as GradingScaleId,
                          custom_thresholds: null,
                        },
                      }))
                    }
                    className={`p-3.5 rounded-xl border text-left transition ${
                      selected ? 'ring-2 ring-teal-500' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: selected ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                      {sc.title}
                    </div>
                    <div
                      className="text-[11px] mt-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {sc.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label
              className="block text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              2. Berechnungs-Modell wählen
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(
                [
                  {
                    id: 'category_buckets',
                    title: 'Kategorien-Töpfe (Standard)',
                    desc: 'Zuerst Durchschnitt pro Topf (z.B. LNW, Mündlich, Tests), dann nach Topf-Gewicht verrechnen.',
                  },
                  {
                    id: 'direct_weights',
                    title: 'Freie Faktoren (1x, 2x)',
                    desc: 'Alle Noten fließen in einen gemeinsamen Topf – jede Prüfung zählt nach ihrem Faktor.',
                  },
                  {
                    id: 'total_points',
                    title: 'Punktesammler (Total Points)',
                    desc: 'Addiert alle erreichten Rohpunkte über das Halbjahr durch die Gesamtpunktzahl.',
                  },
                ] as const
              ).map((wm) => {
                const selected = activeDataset.config.weighting_mode === wm.id;
                return (
                  <button
                    key={wm.id}
                    onClick={() =>
                      updateSubjectConfig((ds) => ({
                        ...ds,
                        config: { ...ds.config, weighting_mode: wm.id as WeightingMode },
                      }))
                    }
                    className={`p-3.5 rounded-xl border text-left transition ${
                      selected ? 'ring-2 ring-teal-500' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: selected ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                      {wm.title}
                    </div>
                    <div
                      className="text-[11px] mt-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {wm.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Interactive 100% Split Bar + Custom Category Builder */}
        <div data-tour="configurator-categories" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: 'var(--text-secondary)' }}
            >
              3. Kategorien & Gewichtung individuell anpassen
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {displayedWeightingPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() =>
                    updateSubjectConfig((ds) => ({
                      ...ds,
                      categories: ds.categories.map((c, i) => ({
                        ...c,
                        weight: preset.weights[i] ?? 0.2,
                      })),
                    }))
                  }
                  className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold border hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                  title={preset.desc}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setShowAllWeightingPresets((s) => !s)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold underline opacity-75 hover:opacity-100"
                style={{ color: 'var(--primary-500)' }}
              >
                {showAllWeightingPresets ? 'Nur Favoriten' : 'Weitere Vorlagen...'}
              </button>
            </div>
          </div>

          <div
            className="h-8 w-full rounded-xl overflow-hidden flex border p-0.5 gap-0.5"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            {activeDataset.categories.map((cat, idx) => {
              const pct = Math.round((cat.weight / totalCatWeight) * 100);
              const palette = ['#0D9488', '#0284C7', '#7C3AED', '#EA580C', '#16A34A'];
              return (
                <div
                  key={cat.id}
                  style={{ width: `${pct}%`, backgroundColor: palette[idx % palette.length] }}
                  className="h-full first:rounded-l-lg last:rounded-r-lg flex items-center justify-center text-[11px] font-bold text-white transition-all duration-200 overflow-hidden px-2 whitespace-nowrap"
                >
                  {cat.short_code}: {pct}%
                </div>
              );
            })}
          </div>

          {/* Individual Category Rows */}
          <div className="space-y-3 pt-2">
            {activeDataset.categories.map((cat) => {
              const pct = Math.round((cat.weight / totalCatWeight) * 100);
              return (
                <div
                  key={cat.id}
                  className="p-3.5 rounded-xl border space-y-2.5"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) =>
                          updateSubjectConfig((ds) => ({
                            ...ds,
                            categories: ds.categories.map((c) =>
                              c.id === cat.id ? { ...c, name: e.target.value } : c
                            ),
                          }))
                        }
                        className="px-2.5 py-1 rounded-lg border text-xs font-bold bg-white dark:bg-slate-900 flex-1"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                        title="Kategoriename bearbeiten"
                      />
                      <input
                        type="text"
                        value={cat.short_code}
                        onChange={(e) =>
                          updateSubjectConfig((ds) => ({
                            ...ds,
                            categories: ds.categories.map((c) =>
                              c.id === cat.id ? { ...c, short_code: e.target.value } : c
                            ),
                          }))
                        }
                        className="w-20 px-2 py-1 rounded-lg border text-xs font-mono text-center bg-white dark:bg-slate-900"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                        title="Kürzel (z. B. LNW, Mündl, Praxis)"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg"
                        style={{
                          backgroundColor: 'var(--primary-soft)',
                          color: 'var(--primary-text)',
                        }}
                      >
                        Effektiv: {pct}%
                      </span>

                      {activeDataset.categories.length > 1 && (
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="w-8 h-8 rounded-lg border text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center shrink-0"
                          style={{ borderColor: 'var(--border-subtle)' }}
                          title="Kategorie entfernen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex-1 min-w-[160px] flex items-center gap-2">
                      <input
                        type="range"
                        min={5}
                        max={100}
                        value={Math.round(cat.weight * 100)}
                        onChange={(e) => {
                          const newW = Number(e.target.value) / 100;
                          updateSubjectConfig((ds) => ({
                            ...ds,
                            categories: ds.categories.map((c) =>
                              c.id === cat.id ? { ...c, weight: newW } : c
                            ),
                          }));
                        }}
                        className="flex-1 accent-teal-600"
                      />
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={Math.round(cat.weight * 100)}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value) || 1);
                          updateSubjectConfig((ds) => ({
                            ...ds,
                            categories: ds.categories.map((c) =>
                              c.id === cat.id ? { ...c, weight: val / 100 } : c
                            ),
                          }));
                        }}
                        className="w-16 px-2 py-1 rounded-lg border font-mono text-xs text-center bg-white dark:bg-slate-900"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                        title="Gewichtungsfaktor direkt eingeben"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label
                        className="text-[11px] font-medium"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Streichnote:
                      </label>
                      <select
                        value={cat.drop_lowest_count}
                        onChange={(e) => {
                          const count = Number(e.target.value);
                          updateSubjectConfig((ds) => ({
                            ...ds,
                            categories: ds.categories.map((c) =>
                              c.id === cat.id ? { ...c, drop_lowest_count: count } : c
                            ),
                          }));
                        }}
                        className="px-2 py-1 rounded-lg border text-xs font-mono"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value={0}>Alle zählen (0)</option>
                        <option value={1}>Schlechteste 1 streichen</option>
                        <option value={2}>Schlechteste 2 streichen</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Custom Category Form */}
          <form
            onSubmit={handleAddCategory}
            className="p-3.5 rounded-xl border border-dashed flex flex-wrap items-center gap-2.5 text-xs"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Neue Kategorie (z. B. Projektarbeit, Heftführung, Fachpraxis)..."
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <input
              type="text"
              value={newCategoryShort}
              onChange={(e) => setNewCategoryShort(e.target.value)}
              placeholder="Kürzel (z.B. Proj)"
              className="w-28 px-3 py-1.5 rounded-lg border font-mono bg-transparent"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg font-bold text-white flex items-center gap-1"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Kategorie hinzufügen</span>
            </button>
          </form>
        </div>

        {/* =====================================================================
            4. NOTENSCHLÜSSEL
           ===================================================================== */}
        <div data-tour="configurator-curve-editor" className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                4. Notenschlüssel — Welche Prozent entsprechen welcher Note?
              </label>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Wähle einen offiziellen Schlüssel oder verschiebe die Mindestprozent-Grenzen stufenlos. Alle Tendenzen (1+, 1-, 2+ …) passen sich automatisch proportional an.
              </p>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {globalTemplates.filter((t) => t.template_type === 'curve').length > 0
              ? globalTemplates
                  .filter((t) => t.template_type === 'curve')
                  .map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyGlobalCurveTemplate(tpl)}
                      className={`p-3 rounded-xl border text-left transition ${
                        curvePresetKey === tpl.title
                          ? 'ring-2 ring-teal-500 font-bold'
                          : 'opacity-85 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor:
                          curvePresetKey === tpl.title ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{tpl.title}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded font-semibold ml-1 shrink-0">
                          Global
                        </span>
                      </div>
                      <div
                        className="text-[10px] mt-1 font-normal line-clamp-2"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {tpl.description}
                      </div>
                    </button>
                  ))
              : Object.entries(GRADING_CURVE_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyCurveCutoffs(preset.cutoffs, key)}
                    className={`p-3 rounded-xl border text-left transition ${
                      curvePresetKey === key ? 'ring-2 ring-teal-500 font-bold' : 'opacity-85 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor:
                        curvePresetKey === key ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div className="text-xs font-bold">{preset.name}</div>
                    <div
                      className="text-[10px] mt-1 font-normal"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {preset.description}
                    </div>
                  </button>
                ))}
          </div>

          {/* Sliders + Exact Number Inputs for Note 1..5 */}
          <div
            className="p-4 rounded-xl border space-y-3"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            {(
              [
                {
                  key: 'n1',
                  grade: 'Note 1 (Sehr gut)',
                  tier: 1,
                  min: 80,
                  max: 98,
                  nextLabel: '100%',
                },
                {
                  key: 'n2',
                  grade: 'Note 2 (Gut)',
                  tier: 2,
                  min: 65,
                  max: 88,
                  nextLabel: `${curveCutoffs.n1 - 1}%`,
                },
                {
                  key: 'n3',
                  grade: 'Note 3 (Befriedigend)',
                  tier: 3,
                  min: 48,
                  max: 75,
                  nextLabel: `${curveCutoffs.n2 - 1}%`,
                },
                {
                  key: 'n4',
                  grade: 'Note 4 (Ausreichend / Bestehensgrenze)',
                  tier: 4,
                  min: 30,
                  max: 60,
                  nextLabel: `${curveCutoffs.n3 - 1}%`,
                },
                {
                  key: 'n5',
                  grade: 'Note 5 (Mangelhaft)',
                  tier: 5,
                  min: 10,
                  max: 40,
                  nextLabel: `${curveCutoffs.n4 - 1}%`,
                },
              ] as const
            ).map((row) => {
              const badgeStyle = TIER_BADGE_STYLES[row.tier];
              return (
                <div
                  key={row.key}
                  className="grid grid-cols-1 md:grid-cols-12 items-center gap-2 text-xs"
                >
                  <div className="md:col-span-4 flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded font-bold text-[11px]"
                      style={{
                        backgroundColor: badgeStyle.bg,
                        color: badgeStyle.text,
                        border: `1px solid ${badgeStyle.border}`,
                      }}
                    >
                      {row.grade}
                    </span>
                  </div>
                  <div className="md:col-span-5 flex items-center gap-2">
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
                  <div className="md:col-span-3 flex items-center justify-end gap-1.5 font-mono">
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      ab
                    </span>
                    <input
                      type="number"
                      min={row.min}
                      max={row.max}
                      value={curveCutoffs[row.key]}
                      onChange={(e) =>
                        applyCurveCutoffs(
                          { ...curveCutoffs, [row.key]: Number(e.target.value) || row.min },
                          'custom'
                        )
                      }
                      className="w-16 px-2 py-1 rounded-lg border font-bold text-center bg-white dark:bg-slate-900"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--primary-500)',
                      }}
                    />
                    <span className="font-bold">%</span>
                    <span className="text-[10px] opacity-70">bis {row.nextLabel}</span>
                  </div>
                </div>
              );
            })}

            <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
              <span
                className="px-2 py-0.5 rounded font-bold text-[11px]"
                style={{
                  backgroundColor: TIER_BADGE_STYLES[6].bg,
                  color: TIER_BADGE_STYLES[6].text,
                  border: `1px solid ${TIER_BADGE_STYLES[6].border}`,
                }}
              >
                Note 6 (Ungenügend)
              </span>
              <span className="font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
                0% bis {Math.max(0, curveCutoffs.n5 - 1)}%
              </span>
            </div>
          </div>

          {/* All 16 Fine Thresholds Overview (1+ down to 6) */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>
              Resultierende Feinstufen-Schwellen (Standard / M-Niveau inkl. +/- Tendenzen):
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {activeFineThresholds.map((t) => {
                const style = TIER_BADGE_STYLES[t.semantic_tier] || TIER_BADGE_STYLES[3];
                return (
                  <div
                    key={t.display_label}
                    className="p-1.5 rounded-lg border text-center"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div
                      className="text-xs font-extrabold rounded px-1 py-0.5 inline-block"
                      style={{ backgroundColor: style.bg, color: style.text }}
                    >
                      {t.display_label}
                    </div>
                    <div
                      className="text-[11px] font-mono font-bold mt-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      ≥ {Math.round(t.min_percent)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* =====================================================================
            5. BINNENDIFFERENZIERUNG
           ===================================================================== */}
        <div data-tour="configurator-differentiation" className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                5. Binnendifferenzierung (G / M / E Niveaustufen)
              </label>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Steuere, ob die Niveaustufen <strong>G</strong> (Grundlegend), <strong>M</strong> (Mittel) und <strong>E</strong> (Erweitert) die benötigten Prozentgrenzen automatisch verschieben oder nur als pädagogisches Info-Badge dienen.
              </p>
            </div>

            <button
              onClick={() => toggleStudentLevelsEnabled(!isDifferentiationEnabled)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border transition"
              style={{
                backgroundColor: isDifferentiationEnabled
                  ? 'var(--primary-soft)'
                  : 'var(--bg-subtle)',
                color: isDifferentiationEnabled
                  ? 'var(--primary-text)'
                  : 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {isDifferentiationEnabled
                ? '✓ Binnendifferenzierung in Berechnung AKTIV'
                : 'Nur als optisches Badge (0% Verrechnung)'}
            </button>
          </div>

          {/* Differentiation Presets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {(globalTemplates.filter((t) => t.template_type === 'levels').length > 0
              ? globalTemplates
                  .filter((t) => t.template_type === 'levels')
                  .map((tpl) => ({
                    title: tpl.title,
                    desc: tpl.description || tpl.payload?.desc,
                    offsets: tpl.payload?.offsets || { G: -5, M: 0, E: 3 },
                    enable: tpl.payload?.enable ?? true,
                    isGlobal: true,
                  }))
              : [
                  {
                    title: 'Gemeinschaftsschule Standard',
                    desc: 'G-Niveau: -5% Hürde · M: 0% · E-Niveau: +3% Anspruch',
                    offsets: { G: -5, M: 0, E: 3 },
                    enable: true,
                    isGlobal: false,
                  },
                  {
                    title: 'Starke Differenzierung',
                    desc: 'G-Niveau: -10% Hürde · M: 0% · E-Niveau: +5% Anspruch',
                    offsets: { G: -10, M: 0, E: 5 },
                    enable: true,
                    isGlobal: false,
                  },
                  {
                    title: 'Fokus G-Förderung',
                    desc: 'G-Niveau: -8% Hürde · M & E regulärer Maßstab (0%)',
                    offsets: { G: -8, M: 0, E: 0 },
                    enable: true,
                    isGlobal: false,
                  },
                  {
                    title: 'Gleicher Maßstab für alle',
                    desc: 'G / M / E nur zur Dokumentation (0% Verschiebung)',
                    offsets: { G: 0, M: 0, E: 0 },
                    enable: false,
                    isGlobal: false,
                  },
                ]
            ).map((preset) => {
              const isCurrent =
                isDifferentiationEnabled === preset.enable &&
                currentLevelOffsets.G === preset.offsets.G &&
                currentLevelOffsets.M === preset.offsets.M &&
                currentLevelOffsets.E === preset.offsets.E;
              return (
                <button
                  key={preset.title}
                  onClick={() => applyDifferentiationPreset(preset.offsets, preset.enable)}
                  className={`p-3 rounded-xl border text-left transition ${
                    isCurrent ? 'ring-2 ring-teal-500 font-bold' : 'opacity-85 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: isCurrent ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{preset.title}</span>
                    {preset.isGlobal && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded font-semibold ml-1 shrink-0">
                        Global
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[10px] mt-1 font-normal line-clamp-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {preset.desc}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Individual Level Sliders (G, M, E) */}
          <div
            className="p-4 rounded-xl border space-y-3"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            {(
              [
                {
                  lvl: 'G' as const,
                  title: 'G-Niveau (Grundlegendes Niveau)',
                  hint: 'Negativer Wert senkt die Prozenthürde (z. B. -5% = Note 2 schon ab 70% statt 75%)',
                },
                {
                  lvl: 'M' as const,
                  title: 'M-Niveau (Mittleres Niveau / Referenz)',
                  hint: 'In der Regel 0% (entspricht exakt dem oben eingestellten Basis-Notenschlüssel)',
                },
                {
                  lvl: 'E' as const,
                  title: 'E-Niveau (Erweitertes Niveau)',
                  hint: 'Positiver Wert erhöht den Anspruch (z. B. +3% = Note 2 ab 78% statt 75%)',
                },
              ]
            ).map((item) => {
              const style = LEVEL_BADGE_STYLES[item.lvl];
              const val = isDifferentiationEnabled ? currentLevelOffsets[item.lvl] : 0;
              return (
                <div
                  key={item.lvl}
                  className="grid grid-cols-1 md:grid-cols-12 items-center gap-2 text-xs"
                >
                  <div className="md:col-span-5">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded font-extrabold text-xs"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {item.lvl}
                      </span>
                      <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                    </div>
                    <div
                      className="text-[10px] mt-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {item.hint}
                    </div>
                  </div>

                  <div className="md:col-span-4 flex items-center gap-2">
                    <input
                      type="range"
                      min={-15}
                      max={15}
                      step={1}
                      value={val}
                      onChange={(e) => updateLevelOffset(item.lvl, Number(e.target.value))}
                      className="w-full accent-teal-600"
                    />
                  </div>

                  <div className="md:col-span-3 flex items-center justify-end gap-1.5 font-mono">
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      Schwelle:
                    </span>
                    <input
                      type="number"
                      min={-20}
                      max={20}
                      value={val}
                      onChange={(e) =>
                        updateLevelOffset(item.lvl, Number(e.target.value) || 0)
                      }
                      className="w-16 px-2 py-1 rounded-lg border font-bold text-center bg-white dark:bg-slate-900"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--primary-500)',
                      }}
                    />
                    <span className="font-bold">%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Comparison Table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
            <div
              className="px-4 py-2.5 text-xs font-bold border-b flex items-center justify-between"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <span>
                Live-Maßstab im Überblick: Welche Prozent ergeben welche Note je Niveau?
              </span>
              <span className="text-[11px] font-mono opacity-80">
                {isDifferentiationEnabled
                  ? `Aktiv (G: ${currentLevelOffsets.G}%, M: ${currentLevelOffsets.M}%, E: +${currentLevelOffsets.E}%)`
                  : 'Inaktiv (alle Niveaus gleich)'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr
                    className="border-b text-[11px]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <th className="py-2 px-3 font-bold">Note</th>
                    <th className="py-2 px-3 font-bold">
                      <span
                        className="px-1.5 py-0.5 rounded mr-1"
                        style={{
                          backgroundColor: LEVEL_BADGE_STYLES.G.bg,
                          color: LEVEL_BADGE_STYLES.G.text,
                        }}
                      >
                        G
                      </span>
                      Grundlegendes Niveau
                    </th>
                    <th className="py-2 px-3 font-bold">
                      <span
                        className="px-1.5 py-0.5 rounded mr-1"
                        style={{
                          backgroundColor: LEVEL_BADGE_STYLES.M.bg,
                          color: LEVEL_BADGE_STYLES.M.text,
                        }}
                      >
                        M
                      </span>
                      Mittleres Niveau
                    </th>
                    <th className="py-2 px-3 font-bold">
                      <span
                        className="px-1.5 py-0.5 rounded mr-1"
                        style={{
                          backgroundColor: LEVEL_BADGE_STYLES.E.bg,
                          color: LEVEL_BADGE_STYLES.E.text,
                        }}
                      >
                        E
                      </span>
                      Erweitertes Niveau
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Note 1 (Sehr gut)', base: curveCutoffs.n1, tier: 1 },
                    { label: 'Note 2 (Gut)', base: curveCutoffs.n2, tier: 2 },
                    { label: 'Note 3 (Befriedigend)', base: curveCutoffs.n3, tier: 3 },
                    { label: 'Note 4 (Ausreichend)', base: curveCutoffs.n4, tier: 4 },
                    { label: 'Note 5 (Mangelhaft)', base: curveCutoffs.n5, tier: 5 },
                  ].map((row) => {
                    const gOffset = isDifferentiationEnabled ? currentLevelOffsets.G : 0;
                    const mOffset = isDifferentiationEnabled ? currentLevelOffsets.M : 0;
                    const eOffset = isDifferentiationEnabled ? currentLevelOffsets.E : 0;
                    const gMin = Math.max(1, Math.min(99, row.base + gOffset));
                    const mMin = Math.max(1, Math.min(99, row.base + mOffset));
                    const eMin = Math.max(1, Math.min(99, row.base + eOffset));
                    const style = TIER_BADGE_STYLES[row.tier];
                    return (
                      <tr
                        key={row.label}
                        className="border-b last:border-b-0"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <td className="py-2 px-3 font-bold">
                          <span
                            className="px-2 py-0.5 rounded text-[11px]"
                            style={{ backgroundColor: style.bg, color: style.text }}
                          >
                            {row.label}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold">ab {gMin}%</td>
                        <td className="py-2 px-3 font-mono font-bold">ab {mMin}%</td>
                        <td className="py-2 px-3 font-mono font-bold">ab {eMin}%</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-2 px-3 font-bold">
                      <span
                        className="px-2 py-0.5 rounded text-[11px]"
                        style={{
                          backgroundColor: TIER_BADGE_STYLES[6].bg,
                          color: TIER_BADGE_STYLES[6].text,
                        }}
                      >
                        Note 6 (Ungenügend)
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      unter {Math.max(1, curveCutoffs.n5 + (isDifferentiationEnabled ? currentLevelOffsets.G : 0))}%
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      unter {Math.max(1, curveCutoffs.n5 + (isDifferentiationEnabled ? currentLevelOffsets.M : 0))}%
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      unter {Math.max(1, curveCutoffs.n5 + (isDifferentiationEnabled ? currentLevelOffsets.E : 0))}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live-Vertrauens-Check */}
      <div
        className="rounded-2xl border p-3.5 sm:p-6 shadow-sm space-y-4 sm:space-y-5 h-fit sticky top-24"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div>
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--primary-500)' }}
          >
            Live-Vertrauens-Check (WASM)
          </span>
          <h3 className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            So rechnet deine Einstellung
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Wähle ein Kind aus der Klasse, um Gewichtung, Notenschlüssel und G/M/E-Niveau live zu prüfen:
          </p>
        </div>

        {visibleStudents.length > 0 && (
          <div className="space-y-2" data-privacy-sensitive="true">
            <select
              value={activeStudent?.id || ''}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {visibleStudents.map((stu) => (
                <option key={stu.id} value={stu.id}>
                  {stu.name} (Niveau {stu.level || 'M'})
                </option>
              ))}
            </select>

            {activeStudent && (
              <div
                className="p-2.5 rounded-xl border flex items-center justify-between text-xs"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Niveaustufe von {activeStudent.name}:
                </span>
                <button
                  onClick={() => cycleStudentLevel(activeStudent.id)}
                  className="px-2.5 py-1 rounded-lg font-extrabold text-xs transition hover:opacity-90"
                  style={{
                    backgroundColor:
                      LEVEL_BADGE_STYLES[activeStudent.level || 'M']?.bg || '#E0F2FE',
                    color:
                      LEVEL_BADGE_STYLES[activeStudent.level || 'M']?.text || '#0369A1',
                  }}
                  title="Klicken, um zwischen G, M und E umzuschalten"
                >
                  Niveau {activeStudent.level || 'M'} (Klick zum Testen)
                </button>
              </div>
            )}
          </div>
        )}

        {activeStudent && summaryByStudentId.get(activeStudent.id) && (
          <div className="space-y-3" data-privacy-sensitive="true">
            {summaryByStudentId
              .get(activeStudent.id)!
              .category_results.map((cr) => (
                <div
                  key={cr.category_id}
                  className="p-3 rounded-xl border flex items-center justify-between text-xs"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div>
                    <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
                      {cr.category_name}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      Effektives Gewicht: {cr.effective_weight_percent}%
                    </div>
                  </div>
                  <div
                    className="font-mono font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {cr.average_percent != null
                      ? `${cr.average_percent}% (${cr.display_grade})`
                      : 'Noch leer'}
                  </div>
                </div>
              ))}

            <div
              className="p-4 rounded-xl border text-center space-y-1"
              style={{
                backgroundColor: 'var(--primary-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
                Resultierender Gesamtschnitt für {activeStudent.name} (Niveau{' '}
                {activeStudent.level || 'M'}):
              </div>
              <div
                className="text-2xl font-extrabold font-mono"
                style={{ color: 'var(--primary-text)' }}
              >
                {summaryByStudentId.get(activeStudent.id)?.overall_percent ?? '—'}% · Note{' '}
                {summaryByStudentId.get(activeStudent.id)?.overall_display_grade}
              </div>
              <div className="text-[11px] opacity-80" style={{ color: 'var(--primary-text)' }}>
                {isDifferentiationEnabled
                  ? `Inkl. Niveau-${activeStudent.level || 'M'} Anpassung (${
                      currentLevelOffsets[
                        (activeStudent.level as 'G' | 'M' | 'E') || 'M'
                      ] > 0
                        ? '+'
                        : ''
                    }${
                      currentLevelOffsets[
                        (activeStudent.level as 'G' | 'M' | 'E') || 'M'
                      ] ?? 0
                    }% Schwellen-Verschiebung)`
                  : 'Binnendifferenzierung deaktiviert (Standard-Maßstab)'}
              </div>
            </div>
          </div>
        )}

        {/* Category Deletion Safety Confirmation Modal */}
        {categoryPendingDelete && (() => {
          const { assessmentCount, gradeCount } = getCategoryStats(categoryPendingDelete.id);
          const fallbackCat = activeDataset.categories.find((c) => c.id !== categoryPendingDelete.id);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
              <div
                className="max-w-md w-full rounded-2xl border p-5 shadow-2xl space-y-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        Kategorie löschen?
                      </h4>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        „{categoryPendingDelete.name}“ ({Math.round(categoryPendingDelete.weight * 100)}%)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCategoryPendingDelete(null)}
                    className="w-8 h-8 rounded-lg opacity-50 hover:opacity-100 transition inline-flex items-center justify-center shrink-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Context info on affected assessments & grades */}
                <div
                  className="p-3 rounded-xl border text-xs space-y-1.5"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Betroffene Prüfungen & Noten:
                  </div>
                  <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {assessmentCount > 0 ? (
                      <>
                        In dieser Kategorie befinden sich aktuell <strong>{assessmentCount} Prüfung(en)</strong> mit insgesamt <strong>{gradeCount} Noteneinträgen</strong>.
                        {fallbackCat && (
                          <div className="mt-1 text-teal-700 dark:text-teal-300 font-medium">
                            ℹ️ Diese Prüfungen werden automatisch in die verbleibende Kategorie <strong>„{fallbackCat.name}“</strong> übertragen.
                          </div>
                        )}
                      </>
                    ) : (
                      <span>In dieser Kategorie sind zurzeit keine Prüfungen angelegt. Die Kategorie kann ohne Auswirkung auf bestehende Noten entfernt werden.</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCategoryPendingDelete(null)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteCategory}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kategorie löschen</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
