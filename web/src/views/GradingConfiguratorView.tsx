import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkPlus,
  Check,
  Divide,
  FlaskConical,
  Globe,
  GraduationCap,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Minus,
  Percent,
  Plus,
  RotateCcw,
  Scale,
  Settings2,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  Unlock,
  Users,
  X,
} from 'lucide-react';
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
import { WEIGHTING_PRESET_CATALOG } from '../components/SettingsModal';
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

const CATEGORY_COLORS = [
  '#0D9488', // Teal
  '#0284C7', // Sky
  '#7C3AED', // Violet
  '#EA580C', // Orange
  '#16A34A', // Green
  '#DB2777', // Pink
  '#4F46E5', // Indigo
  '#D97706', // Amber
];

type ConfiguratorTab = 'categories' | 'curve' | 'differentiation' | 'base_setup';

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
  // Navigation & Mode State
  const [activeTab, setActiveTab] = useState<ConfiguratorTab>('categories');
  const [weightInputMode, setWeightInputMode] = useState<'percent' | 'ratio'>('percent');
  const [lockedCatIds, setLockedCatIds] = useState<Set<string>>(new Set());
  const [sidebarMode, setSidebarMode] = useState<'student' | 'sandbox'>('student');
  const [inputBuffers, setInputBuffers] = useState<Record<string, string>>({});

  // Templates & Creation State
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryShort, setNewCategoryShort] = useState('');
  const [showAllWeightingPresets, setShowAllWeightingPresets] = useState(false);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<CategoryConfig | null>(null);

  // Sandbox Test Simulator State
  const [sandboxScores, setSandboxScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    activeDataset.categories.forEach((cat, idx) => {
      // Sensible sample grades: 80% for 1st, 70% for 2nd, 85% for 3rd
      initial[cat.id] = [80, 70, 85, 75, 90][idx % 5];
    });
    return initial;
  });
  const [sandboxLevel, setSandboxLevel] = useState<'G' | 'M' | 'E'>('M');

  // Total weight normalization
  const totalCatWeight = activeDataset.categories.reduce(
    (acc, c) => acc + Math.max(0.001, c.weight),
    0
  );

  // Auto-switch tabs when guided tour steps focus on specific areas
  useEffect(() => {
    const handleGuideTarget = (e: Event) => {
      const targetId = (e as CustomEvent)?.detail?.targetId;
      if (!targetId) return;
      if (targetId === 'configurator-categories' || targetId === 'configurator-tab-categories') {
        setActiveTab('categories');
      } else if (targetId === 'configurator-curve-editor' || targetId === 'configurator-tab-curve') {
        setActiveTab('curve');
      } else if (targetId === 'configurator-differentiation' || targetId === 'configurator-tab-differentiation') {
        setActiveTab('differentiation');
      } else if (targetId === 'configurator-scale-mode' || targetId === 'configurator-tab-base-setup') {
        setActiveTab('base_setup');
      } else if (targetId === 'configurator-live-check') {
        // Leave activeTab as is, sidebar is always visible
      }
    };
    window.addEventListener('gradus21:guide-target', handleGuideTarget);
    return () => window.removeEventListener('gradus21:guide-target', handleGuideTarget);
  }, []);

  // Sum of percentages for warning/helper
  const sumOfCurrentPercents = Math.round(
    activeDataset.categories.reduce((acc, c) => acc + (c.weight / totalCatWeight) * 100, 0)
  );

  // Stats for a category (assessments & existing grades)
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

  // Lock / Unlock category during auto-balancing
  const toggleCategoryLock = (catId: string) => {
    setLockedCatIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        // Prevent locking all categories (leave at least one unlocked to balance)
        if (next.size < activeDataset.categories.length - 1) {
          next.add(catId);
        }
      }
      return next;
    });
  };

  // Format effective percent with up to 1 decimal place (e.g. "50", "33.3", "12.5")
  const getCategoryDisplayPercent = (weight: number) => {
    const rawPct = (weight / totalCatWeight) * 100;
    const rounded = Math.round(rawPct * 10) / 10;
    return rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded);
  };

  // Intelligent Percent Auto-Balancing (resolves "Slider-Wrestling"!)
  const handleAdjustCategoryPercent = (catId: string, targetPercent: number) => {
    const categories = activeDataset.categories;
    if (categories.length <= 1) return;

    // Get current rounded percentages with 1 decimal precision
    const currentPcts: Record<string, number> = {};
    categories.forEach((c) => {
      const rawPct = (c.weight / totalCatWeight) * 100;
      currentPcts[c.id] = Math.max(0.1, Math.round(rawPct * 10) / 10);
    });

    // Sum of locked other categories
    const lockedOthersSum = categories
      .filter((c) => c.id !== catId && lockedCatIds.has(c.id))
      .reduce((sum, c) => sum + (currentPcts[c.id] || 0), 0);

    const unlockedOthers = categories.filter(
      (c) => c.id !== catId && !lockedCatIds.has(c.id)
    );

    if (unlockedOthers.length === 0) return;

    // Constrain target percent between 0.1 and max remaining
    const maxAllowed = Math.max(0.1, Math.round((100 - lockedOthersSum - unlockedOthers.length * 0.1) * 10) / 10);
    const clampedTarget = Math.max(0.1, Math.min(Math.round(targetPercent * 10) / 10, maxAllowed));

    const remainingForUnlocked = Math.round((100 - lockedOthersSum - clampedTarget) * 10) / 10;
    const prevUnlockedSum = unlockedOthers.reduce((sum, c) => sum + (currentPcts[c.id] || 0), 0);

    const nextPcts: Record<string, number> = {
      ...currentPcts,
      [catId]: clampedTarget,
    };

    let distributed = 0;
    unlockedOthers.forEach((c, idx) => {
      if (idx === unlockedOthers.length - 1) {
        nextPcts[c.id] = Math.max(0.1, Math.round((remainingForUnlocked - distributed) * 10) / 10);
      } else {
        const ratio = prevUnlockedSum > 0 ? (currentPcts[c.id] || 1) / prevUnlockedSum : 1 / unlockedOthers.length;
        const allocated = Math.max(0.1, Math.round(remainingForUnlocked * ratio * 10) / 10);
        nextPcts[c.id] = allocated;
        distributed = Math.round((distributed + allocated) * 10) / 10;
      }
    });

    updateSubjectConfig((ds) => ({
      ...ds,
      categories: ds.categories.map((c) => ({
        ...c,
        weight: (nextPcts[c.id] || 10) / 100,
      })),
    }));
  };

  // Step button adjuster (+5% / -5% or +1/-1)
  const handleStepPercent = (catId: string, delta: number) => {
    const cat = activeDataset.categories.find((c) => c.id === catId);
    if (!cat) return;
    const currentPct = (cat.weight / totalCatWeight) * 100;
    handleAdjustCategoryPercent(catId, currentPct + delta);
  };

  // Commits manual text input when blurred or on Enter (prevents normalization clobbering!)
  const commitCategoryInput = (catId: string) => {
    const raw = inputBuffers[catId];
    // Clear local buffer so external state takes over
    setInputBuffers((prev) => {
      const copy = { ...prev };
      delete copy[catId];
      return copy;
    });

    if (raw === undefined) return;
    const trimmed = raw.trim().replace(',', '.');
    if (!trimmed) return;

    const num = parseFloat(trimmed);
    if (isNaN(num) || num <= 0) return;

    if (weightInputMode === 'ratio') {
      updateSubjectConfig((ds) => ({
        ...ds,
        categories: ds.categories.map((c) =>
          c.id === catId ? { ...c, weight: Math.max(0.1, Math.round(num * 10) / 10) } : c
        ),
      }));
    } else {
      handleAdjustCategoryPercent(catId, num);
    }
  };

  // Rebalance to exact 100%
  const handleRebalanceTo100 = () => {
    updateSubjectConfig((ds) => {
      const sum = ds.categories.reduce((acc, c) => acc + Math.max(0.001, c.weight), 0);
      return {
        ...ds,
        categories: ds.categories.map((c) => ({
          ...c,
          weight: Math.round((c.weight / sum) * 100) / 100,
        })),
      };
    });
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const short = newCategoryShort.trim() || newCategoryName.trim().slice(0, 6);
    const newCat: CategoryConfig = {
      id: `cat_${Date.now()}`,
      name: newCategoryName.trim(),
      short_code: short,
      weight: weightInputMode === 'ratio' ? 1 : 0.2,
      drop_lowest_count: 0,
    };
    updateSubjectConfig((ds) => ({
      ...ds,
      categories: [...ds.categories, newCat],
    }));
    setSandboxScores((prev) => ({ ...prev, [newCat.id]: 75 }));
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

  // Sandbox Live Calculation
  const sandboxResult = useMemo(() => {
    const cats = activeDataset.categories;
    if (cats.length === 0) return null;

    let weightedPctSum = 0;
    let activeWeightSum = 0;

    cats.forEach((cat) => {
      const rawScore = sandboxScores[cat.id] ?? 75;
      const catWeight = Math.max(0.001, cat.weight);
      weightedPctSum += rawScore * catWeight;
      activeWeightSum += catWeight;
    });

    const overallPercent = activeWeightSum > 0 ? Math.round((weightedPctSum / activeWeightSum) * 10) / 10 : 0;
    const offset = isDifferentiationEnabled ? currentLevelOffsets[sandboxLevel] || 0 : 0;
    const adjustedPercent = Math.max(0, Math.min(100, overallPercent - offset));

    const sortedThresholds = [...activeFineThresholds].sort((a, b) => b.min_percent - a.min_percent);
    let matchedThreshold = sortedThresholds[sortedThresholds.length - 1];
    for (const t of sortedThresholds) {
      if (adjustedPercent >= t.min_percent) {
        matchedThreshold = t;
        break;
      }
    }

    return {
      overallPercent,
      adjustedPercent,
      matchedThreshold,
      offset,
    };
  }, [
    activeDataset.categories,
    sandboxScores,
    sandboxLevel,
    isDifferentiationEnabled,
    currentLevelOffsets,
    activeFineThresholds,
  ]);

  return (
    <div data-tour="configurator-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      {/* =========================================================================
          LEFT / MAIN 2 COLUMNS: Modular Tabs & Workspaces
         ========================================================================= */}
      <div
        className="lg:col-span-2 rounded-2xl border p-4 sm:p-6 shadow-sm space-y-5"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Top Header & Status Badges */}
        <div data-tour="configurator-templates" className="space-y-3 pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                  }}
                >
                  Didaktischer Konfigurator
                </span>
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {activeDataset.config.scale_id === 'de_classic_1_to_6'
                    ? '1–6 Schulnoten'
                    : activeDataset.config.scale_id === 'de_oberstufe_0_to_15'
                    ? '0–15 MSS Punkte'
                    : 'US Letter'}
                </span>
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {activeDataset.config.weighting_mode === 'category_buckets'
                    ? 'Kategorien-Töpfe'
                    : activeDataset.config.weighting_mode === 'direct_weights'
                    ? 'Freie Faktoren'
                    : 'Total Points'}
                </span>
                {isDifferentiationEnabled && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    G/M/E Aktiv
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Gewichtung & Notenlogik für {activeDataset.subjectName}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Klasse {activeDataset.className} · Schuljahr {activeDataset.schoolYear}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSaveTemplateInput((s) => !s)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90 active:scale-[0.98]"
                style={{
                  backgroundColor: 'var(--primary-soft)',
                  color: 'var(--primary-text)',
                  borderColor: 'var(--border-subtle)',
                }}
                title="Aktuelle Fachlogik als wiederverwendbare Vorlage sichern"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Als Vorlage speichern</span>
              </button>
            </div>
          </div>

          {/* Save Template Inline Drawer */}
          {showSaveTemplateInput && (
            <form
              onSubmit={handleSaveCurrentAsCustomTemplate}
              className="p-3.5 rounded-xl border flex flex-wrap items-end gap-2.5 animate-in fade-in duration-200"
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex-1 min-w-[220px]">
                <label
                  htmlFor="new-template-name-input"
                  className="block text-[11px] font-bold mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Name deiner neuen Vorlage
                </label>
                <input
                  id="new-template-name-input"
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="z. B. Mathe Sek I (60% KA / 40% SoMi) oder Sport Praxis"
                  className="w-full px-3 py-1.5 rounded-lg border text-xs bg-white dark:bg-slate-900"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                Vorlage sichern
              </button>
            </form>
          )}

          {/* Template Quick Chips (Global + Custom) */}
          {(globalTemplates.filter((t) => t.template_type === 'weighting').length > 0 ||
            userSettings.customWeightingTemplates.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-medium flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Globe className="w-3 h-3 text-indigo-500" /> Vorlagen:
              </span>
              {globalTemplates
                .filter((t) => t.template_type === 'weighting')
                .map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyGlobalWeightingTemplate(tpl)}
                    className="px-2.5 py-1 rounded-lg border text-[11px] font-medium transition hover:border-teal-500 flex items-center gap-1.5"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                    title={tpl.description}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span>{tpl.title}</span>
                  </button>
                ))}
              {userSettings.customWeightingTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => applyCustomTemplate(tpl.id)}
                  className="px-2.5 py-1 rounded-lg border text-[11px] font-medium transition hover:border-teal-500 flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                  title={tpl.description}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  <span>{tpl.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* =======================================================================
            TAB NAVIGATION BAR (Progressive Disclosure)
           ======================================================================= */}
        <div
          role="tablist"
          aria-label="Notenlogik-Konfiguration"
          className="flex border-b gap-1 sm:gap-2 overflow-x-auto pb-0.5"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'categories'}
            data-tour="configurator-tab-categories"
            onClick={() => setActiveTab('categories')}
            className={`px-3.5 py-2.5 rounded-t-xl text-xs font-bold border-b-2 transition flex items-center gap-2 shrink-0 ${
              activeTab === 'categories'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent opacity-70 hover:opacity-100 hover:border-slate-300'
            }`}
            style={{ color: activeTab === 'categories' ? 'var(--primary-text)' : 'var(--text-secondary)' }}
          >
            <Scale className="w-4 h-4" />
            <span>1. Kategorien & Gewichtung</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'curve'}
            data-tour="configurator-tab-curve"
            onClick={() => setActiveTab('curve')}
            className={`px-3.5 py-2.5 rounded-t-xl text-xs font-bold border-b-2 transition flex items-center gap-2 shrink-0 ${
              activeTab === 'curve'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent opacity-70 hover:opacity-100 hover:border-slate-300'
            }`}
            style={{ color: activeTab === 'curve' ? 'var(--primary-text)' : 'var(--text-secondary)' }}
          >
            <Target className="w-4 h-4" />
            <span>2. Notenschlüssel & Schwellen</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'differentiation'}
            data-tour="configurator-tab-differentiation"
            onClick={() => setActiveTab('differentiation')}
            className={`px-3.5 py-2.5 rounded-t-xl text-xs font-bold border-b-2 transition flex items-center gap-2 shrink-0 ${
              activeTab === 'differentiation'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent opacity-70 hover:opacity-100 hover:border-slate-300'
            }`}
            style={{ color: activeTab === 'differentiation' ? 'var(--primary-text)' : 'var(--text-secondary)' }}
          >
            <GraduationCap className="w-4 h-4" />
            <span>3. Binnendifferenzierung (G/M/E)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'base_setup'}
            data-tour="configurator-tab-base-setup"
            onClick={() => setActiveTab('base_setup')}
            className={`px-3.5 py-2.5 rounded-t-xl text-xs font-bold border-b-2 transition flex items-center gap-2 shrink-0 ml-auto ${
              activeTab === 'base_setup'
                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                : 'border-transparent opacity-70 hover:opacity-100 hover:border-slate-300'
            }`}
            style={{ color: activeTab === 'base_setup' ? 'var(--primary-text)' : 'var(--text-secondary)' }}
          >
            <Settings2 className="w-4 h-4" />
            <span>Basis-Setup</span>
          </button>
        </div>

        {/* =======================================================================
            TAB 1: KATEGORIEN & GEWICHTUNG (Der visuelle Kern)
           ======================================================================= */}
        {activeTab === 'categories' && (
          <div data-tour="configurator-categories" className="space-y-4 animate-in fade-in duration-150">
            {/* Controls Bar: Mode Switch & Presets */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-black/5 dark:bg-white/5 p-3 rounded-2xl border" style={{ borderColor: 'var(--border-subtle)' }}>
              {/* Input Mode: Prozentual vs. Verhältnis */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setWeightInputMode('percent')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    weightInputMode === 'percent'
                      ? 'bg-teal-500 text-white shadow-sm'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ color: weightInputMode === 'percent' ? '#ffffff' : 'var(--text-secondary)' }}
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>Prozentual (100%)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWeightInputMode('ratio')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    weightInputMode === 'ratio'
                      ? 'bg-teal-500 text-white shadow-sm'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ color: weightInputMode === 'ratio' ? '#ffffff' : 'var(--text-secondary)' }}
                >
                  <Divide className="w-3.5 h-3.5" />
                  <span>Verhältnis (2 : 1 : 1)</span>
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Schnellwahl:
                </span>
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
                    className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition hover:border-teal-500 active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
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
                  className="px-2 py-1 text-xs font-semibold underline opacity-75 hover:opacity-100"
                  style={{ color: 'var(--primary-500)' }}
                >
                  {showAllWeightingPresets ? 'Weniger' : 'Mehr...'}
                </button>
              </div>
            </div>

            {/* Visual 100% Split Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  <span>Visuelle Verteilung</span>
                  {lockedCatIds.size > 0 && (
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      {lockedCatIds.size} fixiert 🔒
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                      sumOfCurrentPercents === 100
                        ? 'text-teal-600 dark:text-teal-400 bg-teal-500/10'
                        : 'text-amber-600 bg-amber-500/10'
                    }`}
                  >
                    Summe: {sumOfCurrentPercents}%
                  </span>
                  {sumOfCurrentPercents !== 100 && (
                    <button
                      onClick={handleRebalanceTo100}
                      className="text-[11px] font-bold text-teal-600 hover:underline flex items-center gap-1"
                      title="Kategorien proportional auf exakt 100% skalieren"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Auf 100% ausgleichen</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Proportional Segment Bar */}
              <div
                className="h-9 w-full rounded-xl overflow-hidden flex border p-0.5 gap-0.5 shadow-inner"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                {activeDataset.categories.map((cat, idx) => {
                  const pct = Math.round((cat.weight / totalCatWeight) * 100);
                  const displayPct = getCategoryDisplayPercent(cat.weight);
                  const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                  const isLocked = lockedCatIds.has(cat.id);
                  return (
                    <div
                      key={cat.id}
                      style={{ width: `${Math.max(4, pct)}%`, backgroundColor: color }}
                      className="h-full first:rounded-l-lg last:rounded-r-lg flex items-center justify-center text-[11px] font-bold text-white transition-all duration-300 relative group overflow-hidden px-1 whitespace-nowrap shadow-sm"
                      title={`${cat.name} (${cat.short_code}): ${displayPct}% ${isLocked ? '• Fixiert 🔒' : ''}`}
                    >
                      <span className="truncate flex items-center gap-1">
                        {isLocked && <Lock className="w-2.5 h-2.5 shrink-0" />}
                        {cat.short_code}: {displayPct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Category Cards List */}
            <div className="space-y-3 pt-1">
              {activeDataset.categories.map((cat, idx) => {
                const pct = Math.round((cat.weight / totalCatWeight) * 100);
                const formattedPct = getCategoryDisplayPercent(cat.weight);
                const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                const isLocked = lockedCatIds.has(cat.id);
                const { assessmentCount, gradeCount } = getCategoryStats(cat.id);

                return (
                  <div
                    key={cat.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-150 space-y-3 ${
                      isLocked ? 'ring-1 ring-amber-500/40 bg-amber-500/[0.02]' : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {/* Top Row: Color Dot, Inline Editing, Lock, Delete */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: color }}
                        />
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
                          className="px-2.5 py-1 rounded-lg border text-xs font-bold bg-white dark:bg-slate-900 flex-1 transition focus:ring-1 focus:ring-teal-500"
                          style={{
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                          placeholder="Kategoriename (z.B. Klassenarbeiten)"
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
                          className="w-20 px-2 py-1 rounded-lg border text-xs font-mono text-center font-bold bg-white dark:bg-slate-900 transition focus:ring-1 focus:ring-teal-500"
                          style={{
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                          placeholder="Kürzel"
                          title="Kürzel für Spalten & Tabellen (z. B. KA, Mündl, HÜ)"
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Context Badge: Existing assessments in this category */}
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-lg border hidden sm:inline-block"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {assessmentCount} Prüfung(en) · {gradeCount} Note(n)
                        </span>

                        {/* Lock Toggle Button */}
                        <button
                          type="button"
                          onClick={() => toggleCategoryLock(cat.id)}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 transition ${
                            isLocked
                              ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                              : 'opacity-60 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: isLocked ? undefined : 'var(--bg-surface)',
                            borderColor: isLocked ? undefined : 'var(--border-subtle)',
                            color: isLocked ? undefined : 'var(--text-secondary)',
                          }}
                          title={
                            isLocked
                              ? 'Gewichtung fixiert. Klicken zum Entsperren.'
                              : 'Kategorie sperren: bleibt unverändert, wenn andere Regler bewegt werden.'
                          }
                        >
                          {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          <span className="text-[11px]">{isLocked ? 'Fixiert' : 'Frei'}</span>
                        </button>

                        {/* Effective Percent Badge */}
                        <span
                          className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg border"
                          style={{
                            backgroundColor: 'var(--primary-soft)',
                            color: 'var(--primary-text)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          Effektiv: {formattedPct}%
                        </span>

                        {/* Safe Delete Button */}
                        {activeDataset.categories.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="w-8 h-8 rounded-lg border text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center transition active:scale-[0.95]"
                            style={{ borderColor: 'var(--border-subtle)' }}
                            title="Kategorie sicher entfernen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Intelligent Controls (Step Buttons + Slider + Direct Input) */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex-1 min-w-[240px] flex items-center gap-2.5">
                        {/* Step Buttons for fast 5% / 1x tapping */}
                        <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }}>
                          <button
                            type="button"
                            onClick={() =>
                              weightInputMode === 'ratio'
                                ? updateSubjectConfig((ds) => ({
                                    ...ds,
                                    categories: ds.categories.map((c) =>
                                      c.id === cat.id ? { ...c, weight: Math.max(0.5, c.weight - 1) } : c
                                    ),
                                  }))
                                : handleStepPercent(cat.id, -5)
                            }
                            className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition active:scale-[0.92]"
                            style={{ color: 'var(--text-primary)' }}
                            title={weightInputMode === 'ratio' ? '-1 Faktor' : '-5% Schritt'}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              weightInputMode === 'ratio'
                                ? updateSubjectConfig((ds) => ({
                                    ...ds,
                                    categories: ds.categories.map((c) =>
                                      c.id === cat.id ? { ...c, weight: c.weight + 1 } : c
                                    ),
                                  }))
                                : handleStepPercent(cat.id, 5)
                            }
                            className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition active:scale-[0.92]"
                            style={{ color: 'var(--text-primary)' }}
                            title={weightInputMode === 'ratio' ? '+1 Faktor' : '+5% Schritt'}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Interactive Range Slider */}
                        <input
                          type="range"
                          min={1}
                          max={weightInputMode === 'ratio' ? 10 : 95}
                          step={weightInputMode === 'ratio' ? 0.5 : 1}
                          value={
                            weightInputMode === 'ratio'
                              ? cat.weight
                              : pct
                          }
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (weightInputMode === 'ratio') {
                              updateSubjectConfig((ds) => ({
                                ...ds,
                                categories: ds.categories.map((c) =>
                                  c.id === cat.id ? { ...c, weight: val } : c
                                ),
                              }));
                            } else {
                              handleAdjustCategoryPercent(cat.id, val);
                            }
                          }}
                          className="flex-1 accent-teal-600 cursor-pointer"
                        />

                        {/* Direct Numeric Input (supports any decimal / custom odd percentage!) */}
                        <div className="flex items-center gap-1 font-mono">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={
                              inputBuffers[cat.id] !== undefined
                                ? inputBuffers[cat.id]
                                : weightInputMode === 'ratio'
                                ? String(cat.weight)
                                : formattedPct
                            }
                            onFocus={() => {
                              setInputBuffers((prev) => ({
                                ...prev,
                                [cat.id]: weightInputMode === 'ratio' ? String(cat.weight) : formattedPct,
                              }));
                            }}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setInputBuffers((prev) => ({ ...prev, [cat.id]: raw }));
                            }}
                            onBlur={() => commitCategoryInput(cat.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="w-16 px-2 py-1 rounded-lg border font-bold text-xs text-center bg-white dark:bg-slate-900 transition focus:ring-1 focus:ring-teal-500"
                            style={{
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                            title="Direkte Eingabe (auch krumme Werte wie 33.3% oder 17% möglich)"
                          />
                          <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                            {weightInputMode === 'ratio' ? 'x' : '%'}
                          </span>
                        </div>
                      </div>

                      {/* Streichnoten (Drop Lowest) Pill Buttons */}
                      <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
                        <span className="text-[10px] font-semibold px-1.5" style={{ color: 'var(--text-secondary)' }}>
                          Streichnote:
                        </span>
                        {[
                          { val: 0, label: 'Keine (0)' },
                          { val: 1, label: '1x Streichen ⭐' },
                          { val: 2, label: '2x Streichen ⭐⭐' },
                        ].map((opt) => {
                          const isSelected = cat.drop_lowest_count === opt.val;
                          return (
                            <button
                              key={opt.val}
                              type="button"
                              onClick={() =>
                                updateSubjectConfig((ds) => ({
                                  ...ds,
                                  categories: ds.categories.map((c) =>
                                    c.id === cat.id ? { ...c, drop_lowest_count: opt.val } : c
                                  ),
                                }))
                              }
                              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                                isSelected
                                  ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300 font-bold border border-teal-500/30'
                                  : 'opacity-70 hover:opacity-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Add Category Card */}
            <form
              onSubmit={handleAddCategory}
              className="p-4 rounded-2xl border border-dashed flex flex-wrap items-center gap-2.5 text-xs transition hover:border-teal-500"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Plus className="w-4 h-4 text-teal-600 shrink-0" />
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Neue Kategorie (z. B. Projektarbeit, Vokabeltests, Fachpraxis)..."
                  className="w-full px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-900"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <input
                type="text"
                value={newCategoryShort}
                onChange={(e) => setNewCategoryShort(e.target.value)}
                placeholder="Kürzel (z.B. Proj)"
                className="w-28 px-3 py-1.5 rounded-lg border font-mono font-bold bg-white dark:bg-slate-900"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg font-bold text-white flex items-center gap-1.5 shadow-sm transition hover:opacity-90 active:scale-[0.98]"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Kategorie anlegen</span>
              </button>
            </form>
          </div>
        )}

        {/* =======================================================================
            TAB 2: NOTENSCHLÜSSEL & SCHWELLEN (Kontinuierliches Farbspektrum)
           ======================================================================= */}
        {activeTab === 'curve' && (
          <div data-tour="configurator-curve-editor" className="space-y-5 animate-in fade-in duration-150">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                Notenschlüssel-Kurve & Prozent-Schwellen
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Wähle eine Standard-Kurve oder passe die Prozent-Hürden stufenlos an. Alle Feinstufen (1+, 1-, 2+ ...) passen sich automatisch proportional an.
              </p>
            </div>

            {/* Presets Grid */}
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
                        <div className="text-[10px] mt-1 font-normal line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
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
                      <div className="text-[10px] mt-1 font-normal line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        {preset.description}
                      </div>
                    </button>
                  ))}
            </div>

            {/* Continuous Visual Spectrum Bar (0% to 100%) */}
            <div className="space-y-1.5 p-3 rounded-2xl border" style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span style={{ color: 'var(--text-primary)' }}>Noten-Spektrum (0% bis 100%)</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  ⚡ Bestehensgrenze (Note 4): ab {curveCutoffs.n4}%
                </span>
              </div>

              <div className="h-8 w-full rounded-xl overflow-hidden flex border p-0.5 gap-0.5 shadow-inner" style={{ borderColor: 'var(--border-subtle)' }}>
                {/* Note 6 */}
                <div
                  style={{ width: `${Math.max(4, curveCutoffs.n5)}%`, backgroundColor: TIER_BADGE_STYLES[6].bg, color: TIER_BADGE_STYLES[6].text }}
                  className="h-full first:rounded-l-lg flex items-center justify-center text-[10px] font-bold border border-rose-300/30 truncate px-1"
                  title={`Note 6: 0% bis ${curveCutoffs.n5 - 1}%`}
                >
                  6 ({curveCutoffs.n5}%)
                </div>
                {/* Note 5 */}
                <div
                  style={{ width: `${Math.max(4, curveCutoffs.n4 - curveCutoffs.n5)}%`, backgroundColor: TIER_BADGE_STYLES[5].bg, color: TIER_BADGE_STYLES[5].text }}
                  className="h-full flex items-center justify-center text-[10px] font-bold border border-rose-400/30 truncate px-1"
                  title={`Note 5: ab ${curveCutoffs.n5}%`}
                >
                  5
                </div>
                {/* Note 4 - Highlighted */}
                <div
                  style={{ width: `${Math.max(4, curveCutoffs.n3 - curveCutoffs.n4)}%`, backgroundColor: TIER_BADGE_STYLES[4].bg, color: TIER_BADGE_STYLES[4].text }}
                  className="h-full flex items-center justify-center text-[10px] font-extrabold border-2 border-amber-500 truncate px-1 relative shadow-sm"
                  title={`Note 4 (Bestehen): ab ${curveCutoffs.n4}%`}
                >
                  4 ⭐
                </div>
                {/* Note 3 */}
                <div
                  style={{ width: `${Math.max(4, curveCutoffs.n2 - curveCutoffs.n3)}%`, backgroundColor: TIER_BADGE_STYLES[3].bg, color: TIER_BADGE_STYLES[3].text }}
                  className="h-full flex items-center justify-center text-[10px] font-bold border border-amber-300/30 truncate px-1"
                  title={`Note 3: ab ${curveCutoffs.n3}%`}
                >
                  3
                </div>
                {/* Note 2 */}
                <div
                  style={{ width: `${Math.max(4, curveCutoffs.n1 - curveCutoffs.n2)}%`, backgroundColor: TIER_BADGE_STYLES[2].bg, color: TIER_BADGE_STYLES[2].text }}
                  className="h-full flex items-center justify-center text-[10px] font-bold border border-teal-300/30 truncate px-1"
                  title={`Note 2: ab ${curveCutoffs.n2}%`}
                >
                  2
                </div>
                {/* Note 1 */}
                <div
                  style={{ width: `${Math.max(4, 100 - curveCutoffs.n1)}%`, backgroundColor: TIER_BADGE_STYLES[1].bg, color: TIER_BADGE_STYLES[1].text }}
                  className="h-full last:rounded-r-lg flex items-center justify-center text-[10px] font-bold border border-emerald-300/30 truncate px-1"
                  title={`Note 1: ab ${curveCutoffs.n1}%`}
                >
                  1
                </div>
              </div>
            </div>

            {/* Detailed Cutoff Sliders */}
            <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
              {[
                { key: 'n1' as const, grade: 'Note 1 (Sehr gut)', tier: 1, min: 80, max: 98, nextLabel: '100%' },
                { key: 'n2' as const, grade: 'Note 2 (Gut)', tier: 2, min: 65, max: 88, nextLabel: `${curveCutoffs.n1 - 1}%` },
                { key: 'n3' as const, grade: 'Note 3 (Befriedigend)', tier: 3, min: 48, max: 75, nextLabel: `${curveCutoffs.n2 - 1}%` },
                { key: 'n4' as const, grade: 'Note 4 (Ausreichend / Bestehensgrenze)', tier: 4, min: 30, max: 60, nextLabel: `${curveCutoffs.n3 - 1}%`, isPass: true },
                { key: 'n5' as const, grade: 'Note 5 (Mangelhaft)', tier: 5, min: 10, max: 40, nextLabel: `${curveCutoffs.n4 - 1}%` },
              ].map((row) => {
                const badgeStyle = TIER_BADGE_STYLES[row.tier];
                return (
                  <div key={row.key} className="grid grid-cols-1 md:grid-cols-12 items-center gap-2.5 text-xs">
                    <div className="md:col-span-5 flex items-center gap-2">
                      <span
                        className="px-2.5 py-0.5 rounded-lg font-bold text-[11px] border"
                        style={{
                          backgroundColor: badgeStyle.bg,
                          color: badgeStyle.text,
                          borderColor: badgeStyle.border,
                        }}
                      >
                        {row.grade}
                      </span>
                      {row.isPass && (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          ⚡ Mindesthürde
                        </span>
                      )}
                    </div>
                    <div className="md:col-span-4 flex items-center gap-2">
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
                        className="w-full accent-teal-600 cursor-pointer"
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

              {/* Note 6 Footer */}
              <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                <span
                  className="px-2 py-0.5 rounded-lg font-bold text-[11px] border"
                  style={{
                    backgroundColor: TIER_BADGE_STYLES[6].bg,
                    color: TIER_BADGE_STYLES[6].text,
                    borderColor: TIER_BADGE_STYLES[6].border,
                  }}
                >
                  Note 6 (Ungenügend)
                </span>
                <span className="font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
                  0% bis {Math.max(0, curveCutoffs.n5 - 1)}%
                </span>
              </div>
            </div>

            {/* Fine Thresholds (16 Tiles) */}
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
                      className="p-1.5 rounded-xl border text-center transition hover:scale-105"
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div
                        className="text-xs font-extrabold rounded px-1.5 py-0.5 inline-block border"
                        style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}
                      >
                        {t.display_label}
                      </div>
                      <div className="text-[11px] font-mono font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                        ≥ {Math.round(t.min_percent)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =======================================================================
            TAB 3: BINNENDIFFERENZIERUNG (G / M / E Niveaustufen)
           ======================================================================= */}
        {activeTab === 'differentiation' && (
          <div data-tour="configurator-differentiation" className="space-y-5 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  Binnendifferenzierung (G / M / E Niveaustufen)
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Steuere, ob die Niveaustufen <strong>G</strong> (Grundlegend), <strong>M</strong> (Mittel) und <strong>E</strong> (Erweitert) die benötigten Prozentgrenzen automatisch verschieben oder nur als pädagogisches Info-Badge dienen.
                </p>
              </div>

              <button
                onClick={() => toggleStudentLevelsEnabled(!isDifferentiationEnabled)}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition shadow-sm active:scale-[0.98]"
                style={{
                  backgroundColor: isDifferentiationEnabled ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                  color: isDifferentiationEnabled ? 'var(--primary-text)' : 'var(--text-secondary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {isDifferentiationEnabled
                  ? '✓ Differenzierung in Berechnung AKTIV'
                  : 'Nur als optisches Info-Badge (0% Verrechnung)'}
              </button>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                {
                  title: 'Gemeinschaftsschule Standard',
                  desc: 'G-Niveau: -5% Hürde · M: 0% · E-Niveau: +3% Anspruch',
                  offsets: { G: -5, M: 0, E: 3 },
                  enable: true,
                },
                {
                  title: 'Starke Differenzierung',
                  desc: 'G-Niveau: -10% Hürde · M: 0% · E-Niveau: +5% Anspruch',
                  offsets: { G: -10, M: 0, E: 5 },
                  enable: true,
                },
                {
                  title: 'Fokus G-Förderung',
                  desc: 'G-Niveau: -8% Hürde · M & E regulärer Maßstab (0%)',
                  offsets: { G: -8, M: 0, E: 0 },
                  enable: true,
                },
                {
                  title: 'Gleicher Maßstab für alle',
                  desc: 'G / M / E nur zur Dokumentation (0% Verschiebung)',
                  offsets: { G: 0, M: 0, E: 0 },
                  enable: false,
                },
              ].map((preset) => {
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
                    <div className="text-xs font-bold">{preset.title}</div>
                    <div className="text-[10px] mt-1 font-normal line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {preset.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Individual Level Sliders (G, M, E) */}
            <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
              {[
                { lvl: 'G' as const, title: 'G-Niveau (Grundlegend)', hint: 'Negativer Wert senkt die Hürde (z. B. -5% = Note 2 schon ab 70% statt 75%)' },
                { lvl: 'M' as const, title: 'M-Niveau (Mittel / Referenz)', hint: '0% = Entspricht exakt dem Basis-Notenschlüssel' },
                { lvl: 'E' as const, title: 'E-Niveau (Erweitert)', hint: 'Positiver Wert erhöht den Anspruch (z. B. +3% = Note 2 ab 78% statt 75%)' },
              ].map((item) => {
                const style = LEVEL_BADGE_STYLES[item.lvl];
                const val = isDifferentiationEnabled ? currentLevelOffsets[item.lvl] : 0;
                return (
                  <div key={item.lvl} className="grid grid-cols-1 md:grid-cols-12 items-center gap-2.5 text-xs">
                    <div className="md:col-span-5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg font-extrabold text-xs" style={{ backgroundColor: style.bg, color: style.text }}>
                          {item.lvl}
                        </span>
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                          {item.title}
                        </span>
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
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
                        disabled={!isDifferentiationEnabled}
                        onChange={(e) => updateLevelOffset(item.lvl, Number(e.target.value))}
                        className="w-full accent-teal-600 cursor-pointer disabled:opacity-40"
                      />
                    </div>
                    <div className="md:col-span-3 flex items-center justify-end gap-1.5 font-mono">
                      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        Verschiebung:
                      </span>
                      <input
                        type="number"
                        min={-20}
                        max={20}
                        value={val}
                        disabled={!isDifferentiationEnabled}
                        onChange={(e) => updateLevelOffset(item.lvl, Number(e.target.value) || 0)}
                        className="w-16 px-2 py-1 rounded-lg border font-bold text-center bg-white dark:bg-slate-900 disabled:opacity-40"
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
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
              <div
                className="px-4 py-2.5 text-xs font-bold border-b flex items-center justify-between"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>Live-Maßstab im Überblick: Notenstufen je Niveau</span>
                <span className="text-[11px] font-mono opacity-80">
                  {isDifferentiationEnabled
                    ? `Aktiv (G: ${currentLevelOffsets.G}%, M: ${currentLevelOffsets.M}%, E: +${currentLevelOffsets.E}%)`
                    : 'Inaktiv (Standard-Maßstab für alle)'}
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
                      <th className="py-2.5 px-3 font-bold">Note</th>
                      <th className="py-2.5 px-3 font-bold">
                        <span className="px-1.5 py-0.5 rounded mr-1" style={{ backgroundColor: LEVEL_BADGE_STYLES.G.bg, color: LEVEL_BADGE_STYLES.G.text }}>
                          G
                        </span>
                        Grundlegendes Niveau
                      </th>
                      <th className="py-2.5 px-3 font-bold">
                        <span className="px-1.5 py-0.5 rounded mr-1" style={{ backgroundColor: LEVEL_BADGE_STYLES.M.bg, color: LEVEL_BADGE_STYLES.M.text }}>
                          M
                        </span>
                        Mittleres Niveau
                      </th>
                      <th className="py-2.5 px-3 font-bold">
                        <span className="px-1.5 py-0.5 rounded mr-1" style={{ backgroundColor: LEVEL_BADGE_STYLES.E.bg, color: LEVEL_BADGE_STYLES.E.text }}>
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
                        <tr key={row.label} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                          <td className="py-2 px-3 font-bold">
                            <span className="px-2 py-0.5 rounded text-[11px] border" style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}>
                              {row.label}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono font-bold">ab {gMin}%</td>
                          <td className="py-2 px-3 font-mono font-bold">ab {mMin}%</td>
                          <td className="py-2 px-3 font-mono font-bold">ab {eMin}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =======================================================================
            TAB 4: BASIS-SETUP (Notenskala & Berechnungsmodell)
           ======================================================================= */}
        {activeTab === 'base_setup' && (
          <div data-tour="configurator-scale-mode" className="space-y-6 animate-in fade-in duration-150">
            {/* Scale Selector */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                1. Notenskala / Bewertungssystem wählen
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: 'de_classic_1_to_6' as const,
                    title: 'Schulnoten 1–6 (mit Tendenzen)',
                    desc: 'Standard Sek I (1+, 1, 1-, 2+ ... 6) & Prozent-Umrechnung',
                  },
                  {
                    id: 'de_oberstufe_0_to_15' as const,
                    title: 'Oberstufe 0–15 Punkte (MSS)',
                    desc: 'Gymnasiale Kursstufe / Abitur (15 Pkt = 1+ bis 0 Pkt = 6)',
                  },
                  {
                    id: 'us_letter_gpa' as const,
                    title: 'US Letter Grades (A+ bis F)',
                    desc: 'Internationales System inkl. 4.0 GPA-Skala',
                  },
                ].map((sc) => {
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
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        selected ? 'ring-2 ring-teal-500 font-bold' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: selected ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        {sc.title}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {sc.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calculation Model Selector */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                2. Berechnungs-Modell wählen
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: 'category_buckets' as const,
                    title: 'Kategorien-Töpfe (Standard)',
                    desc: 'Zuerst Durchschnitt pro Topf (z.B. LNW, Mündlich), dann nach Topf-Gewicht verrechnen.',
                  },
                  {
                    id: 'direct_weights' as const,
                    title: 'Freie Faktoren (1x, 2x)',
                    desc: 'Alle Noten fließen in einen gemeinsamen Topf – jede Prüfung zählt nach ihrem individuellen Faktor.',
                  },
                  {
                    id: 'total_points' as const,
                    title: 'Punktesammler (Total Points)',
                    desc: 'Addiert alle erreichten Rohpunkte über das Halbjahr durch die Gesamtpunktzahl.',
                  },
                ].map((wm) => {
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
                      className={`p-3.5 rounded-2xl border text-left transition ${
                        selected ? 'ring-2 ring-teal-500 font-bold' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: selected ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        {wm.title}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {wm.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scale Empty Categories Toggle */}
            <div className="p-4 rounded-2xl border flex items-center justify-between gap-4" style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
              <div>
                <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  Leere Kategorien automatisch proportional anpassen
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Wenn im Halbjahr z.B. noch keine Klassenarbeit geschrieben wurde, verteilen sich 100% automatisch auf die bereits bewerteten Töpfe.
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSubjectConfig((ds) => ({
                    ...ds,
                    config: {
                      ...ds.config,
                      scale_empty_categories: !ds.config.scale_empty_categories,
                    },
                  }))
                }
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold border transition shadow-sm"
                style={{
                  backgroundColor: activeDataset.config.scale_empty_categories
                    ? 'var(--primary-soft)'
                    : 'var(--bg-surface)',
                  color: activeDataset.config.scale_empty_categories
                    ? 'var(--primary-text)'
                    : 'var(--text-secondary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {activeDataset.config.scale_empty_categories ? '✓ Aktiviert' : 'Deaktiviert'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          RIGHT COLUMN: Live-Vertrauens-Check (WASM) & Test-Simulator (Sandbox)
         ========================================================================= */}
      <div
        data-tour="configurator-live-check"
        className="rounded-2xl border p-4 sm:p-6 shadow-sm space-y-4 h-fit sticky top-24"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Header with Mode Switcher */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--primary-500)' }}>
              Live-Vertrauens-Check (WASM)
            </span>
            <div className="flex items-center gap-0.5 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg border text-[11px]" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setSidebarMode('student')}
                className={`px-2 py-0.5 rounded font-bold transition flex items-center gap-1 ${
                  sidebarMode === 'student'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 shadow-sm'
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Klasse</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarMode('sandbox')}
                className={`px-2 py-0.5 rounded font-bold transition flex items-center gap-1 ${
                  sidebarMode === 'sandbox'
                    ? 'bg-white dark:bg-slate-900 text-teal-600 shadow-sm'
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                <FlaskConical className="w-3 h-3" />
                <span>Sandbox</span>
              </button>
            </div>
          </div>

          <h3 className="text-base font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            {sidebarMode === 'student' ? 'So rechnet deine Einstellung' : '🧪 Interaktiver Test-Simulator'}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {sidebarMode === 'student'
              ? 'Wähle ein Kind aus deiner Klasse, um die Auswirkung live zu sehen:'
              : 'Schiebe Testnoten hin und her, um die Fachlogik live zu erproben:'}
          </p>
        </div>

        {/* =====================================================================
            MODE 1: REAL STUDENTS
           ===================================================================== */}
        {sidebarMode === 'student' && (
          <div className="space-y-3" data-privacy-sensitive="true">
            {visibleStudents.length > 0 && (
              <div className="space-y-2">
                <select
                  value={activeStudent?.id || ''}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-xs font-bold bg-white dark:bg-slate-900 shadow-sm"
                  style={{
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
                      Niveau von {activeStudent.name}:
                    </span>
                    <button
                      onClick={() => cycleStudentLevel(activeStudent.id)}
                      className="px-2.5 py-1 rounded-lg font-extrabold text-xs transition hover:opacity-90 active:scale-[0.96] shadow-sm"
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

            {/* Category breakdown for this student */}
            {activeStudent && summaryByStudentId.get(activeStudent.id) && (
              <div className="space-y-2">
                {summaryByStudentId
                  .get(activeStudent.id)!
                  .category_results.map((cr) => (
                    <div
                      key={cr.category_id}
                      className="p-2.5 rounded-xl border flex items-center justify-between text-xs"
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
                          Gewicht: {cr.effective_weight_percent}%
                        </div>
                      </div>
                      <div className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                        {cr.average_percent != null
                          ? `${cr.average_percent}% (${cr.display_grade})`
                          : 'Noch leer'}
                      </div>
                    </div>
                  ))}

                {/* Final Student Result Card */}
                <div
                  className="p-4 rounded-2xl border text-center space-y-1 shadow-sm"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
                    Resultierender Gesamtschnitt:
                  </div>
                  <div className="text-2xl font-black font-mono" style={{ color: 'var(--primary-text)' }}>
                    {summaryByStudentId.get(activeStudent.id)?.overall_percent ?? '—'}% · Note{' '}
                    {summaryByStudentId.get(activeStudent.id)?.overall_display_grade}
                  </div>
                  <div className="text-[11px] opacity-80" style={{ color: 'var(--primary-text)' }}>
                    {isDifferentiationEnabled
                      ? `Inkl. Niveau-${activeStudent.level || 'M'} Anpassung (${
                          currentLevelOffsets[(activeStudent.level as 'G' | 'M' | 'E') || 'M'] > 0 ? '+' : ''
                        }${currentLevelOffsets[(activeStudent.level as 'G' | 'M' | 'E') || 'M'] ?? 0}%)`
                      : 'Standard-Maßstab'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            MODE 2: SANDBOX TEST SIMULATOR ("Was wäre wenn...?")
           ===================================================================== */}
        {sidebarMode === 'sandbox' && sandboxResult && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            {/* Level Toggle for Sandbox Student */}
            <div className="flex items-center justify-between p-2 rounded-xl border bg-black/5 dark:bg-white/5" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Test-Niveau:
              </span>
              <div className="flex items-center gap-1">
                {(['G', 'M', 'E'] as const).map((lvl) => {
                  const isCur = sandboxLevel === lvl;
                  const style = LEVEL_BADGE_STYLES[lvl];
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSandboxLevel(lvl)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition ${
                        isCur ? 'ring-2 ring-teal-500 shadow-sm' : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: style.bg,
                        color: style.text,
                      }}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Test Scenarios */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Schnell-Szenarien:
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  { label: '🌟 Klassenbester (92%)', pct: 92 },
                  { label: '👍 Solide 2 (78%)', pct: 78 },
                  { label: '⚡ Bestehen (51%)', pct: 51 },
                  { label: '⚠️ Kritisch (38%)', pct: 38 },
                ].map((scen) => (
                  <button
                    key={scen.label}
                    type="button"
                    onClick={() => {
                      const next: Record<string, number> = {};
                      activeDataset.categories.forEach((c) => {
                        next[c.id] = scen.pct;
                      });
                      setSandboxScores(next);
                    }}
                    className="p-1.5 rounded-lg border text-left text-[11px] font-semibold transition hover:border-teal-500"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {scen.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Test Sliders */}
            <div className="space-y-2 pt-1">
              {activeDataset.categories.map((cat, idx) => {
                const score = sandboxScores[cat.id] ?? 75;
                const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                return (
                  <div
                    key={cat.id}
                    className="p-2.5 rounded-xl border space-y-1 text-xs"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5 truncate" style={{ color: 'var(--text-primary)' }}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        {cat.name}
                      </span>
                      <span className="font-mono text-teal-600 dark:text-teal-400">
                        {score}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={score}
                      onChange={(e) =>
                        setSandboxScores((prev) => ({
                          ...prev,
                          [cat.id]: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-teal-600 cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>

            {/* Sandbox Final Output Card */}
            <div
              className="p-4 rounded-2xl border text-center space-y-1 shadow-sm"
              style={{
                backgroundColor: 'var(--primary-soft)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
                Errechnete Test-Endnote:
              </div>
              <div className="text-2xl font-black font-mono" style={{ color: 'var(--primary-text)' }}>
                {sandboxResult.overallPercent}% · Note{' '}
                {sandboxResult.matchedThreshold.display_label}
              </div>
              <div className="text-[11px] opacity-80" style={{ color: 'var(--primary-text)' }}>
                {isDifferentiationEnabled
                  ? `Inkl. Niveau ${sandboxLevel} (${sandboxResult.offset > 0 ? '+' : ''}${sandboxResult.offset}% Hürde)`
                  : 'Ohne Niveaudifferenzierung'}
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
                        „{categoryPendingDelete.name}“ ({Math.round((categoryPendingDelete.weight / totalCatWeight) * 100)}%)
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
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition flex items-center gap-1.5 shadow-sm active:scale-[0.98]"
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
