import React, { useState } from 'react';
import {
  CellDisplayFormat,
  GradingScaleId,
  ThemePreset,
  UserSyncSettings,
  WeightingMode,
} from '../data/demoClasses';
import {
  CheckCircle2,
  Cloud,
  Eye,
  Moon,
  Palette,
  Settings,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';

interface SettingsModalProps {
  settings: UserSyncSettings;
  onUpdateSettings: (updater: (prev: UserSyncSettings) => UserSyncSettings) => void;
  onClose: () => void;
}

export const WEIGHTING_PRESET_CATALOG: Array<{
  id: string;
  label: string;
  desc: string;
  weights: number[];
}> = [
  { id: '50_30_20', label: '50 / 30 / 20', desc: '50% LNW · 30% Mündl · 20% Tests', weights: [0.5, 0.3, 0.2] },
  { id: '60_40', label: '60 / 40', desc: '60% Schriftlich · 40% Mündlich', weights: [0.6, 0.4, 0.0] },
  { id: '40_60', label: '40 / 60', desc: '40% Schriftlich · 60% Mitarbeit/Praxis', weights: [0.4, 0.6, 0.0] },
  { id: '2_1_1', label: '2 : 1 : 1', desc: 'Hauptfach doppelt gewichtet (50/25/25)', weights: [2, 1, 1] },
  { id: '1_1_1', label: '1 : 1 : 1', desc: 'Alle Kategorien gleichwertig (33/33/33)', weights: [1, 1, 1] },
  { id: '50_50', label: '1 : 1 (50 / 50)', desc: 'Zwei Kategorien exakt gleichwertig', weights: [0.5, 0.5] },
  { id: '70_30', label: '70 / 30', desc: '70% Klausuren · 30% Sonstige Mitarbeit', weights: [0.7, 0.3] },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const [activeSection, setActiveSection] = useState<'favorites' | 'visibility' | 'appearance'>(
    'favorites'
  );
  const [savedIndicator, setSavedIndicator] = useState(false);

  const triggerSaved = () => {
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2000);
  };

  const toggleFavoritePreset = (presetId: string) => {
    onUpdateSettings((prev) => {
      const exists = prev.favoriteWeightingPresets.includes(presetId);
      const next = exists
        ? prev.favoriteWeightingPresets.filter((id) => id !== presetId)
        : [...prev.favoriteWeightingPresets, presetId];
      return { ...prev, favoriteWeightingPresets: next };
    });
    triggerSaved();
  };

  const deleteCustomTemplate = (templateId: string) => {
    onUpdateSettings((prev) => ({
      ...prev,
      customWeightingTemplates: prev.customWeightingTemplates.filter((t) => t.id !== templateId),
    }));
    triggerSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="max-w-3xl w-full rounded-2xl border p-6 shadow-xl space-y-5 max-h-[90vh] flex flex-col"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b pb-4 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
            >
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  Einstellungen & persönliche Vorschläge
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300 flex items-center gap-1">
                  <Cloud className="w-3 h-3" />
                  <span>App-Sync aktiv</span>
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Steuere, was dir standardmäßig vorgeschlagen wird, was nur bei Bedarf erscheint, und wähle dein Farbschema.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {savedIndicator && (
              <span className="text-xs font-semibold text-teal-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Synchronisiert</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl border transition hover:opacity-80"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl border text-xs font-bold shrink-0"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <button
            onClick={() => setActiveSection('favorites')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeSection === 'favorites' ? 'text-white shadow-sm' : ''
            }`}
            style={{
              backgroundColor: activeSection === 'favorites' ? 'var(--primary-500)' : 'transparent',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Favoriten & Standard-Vorschläge</span>
          </button>
          <button
            onClick={() => setActiveSection('visibility')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeSection === 'visibility' ? 'text-white shadow-sm' : ''
            }`}
            style={{
              backgroundColor:
                activeSection === 'visibility' ? 'var(--primary-500)' : 'transparent',
            }}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Ansicht & Einblendungen</span>
          </button>
          <button
            onClick={() => setActiveSection('appearance')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeSection === 'appearance' ? 'text-white shadow-sm' : ''
            }`}
            style={{
              backgroundColor:
                activeSection === 'appearance' ? 'var(--primary-500)' : 'transparent',
            }}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Farbwelt & Erscheinungsbild</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1 text-xs">
          {/* =================================================================
              SECTION 1: FAVORITEN & STANDARD-VORSCHLÄGE
             ================================================================= */}
          {activeSection === 'favorites' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  className="p-4 rounded-2xl border space-y-2"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  <label className="block font-bold" style={{ color: 'var(--text-primary)' }}>
                    Bevorzugtes Notensystem (für neue Klassen)
                  </label>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Wird beim Anlegen neuer Klassen automatisch vorausgewählt.
                  </p>
                  <select
                    value={settings.defaultScaleId}
                    onChange={(e) => {
                      onUpdateSettings((s) => ({
                        ...s,
                        defaultScaleId: e.target.value as GradingScaleId,
                      }));
                      triggerSaved();
                    }}
                    className="w-full px-3 py-2 rounded-xl border font-semibold bg-white dark:bg-slate-900"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    <option value="de_classic_1_to_6">Schulnoten 1–6 (mit Tendenzen 1+, 2-)</option>
                    <option value="de_oberstufe_0_to_15">Oberstufe 0–15 Punkte (MSS / Abitur)</option>
                    <option value="us_letter_gpa">US Letter Grades (A+ bis F / GPA)</option>
                  </select>
                </div>

                <div
                  className="p-4 rounded-2xl border space-y-2"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  <label className="block font-bold" style={{ color: 'var(--text-primary)' }}>
                    Bevorzugtes Berechnungs-Modell
                  </label>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Standard-Rechenweg im Gewichtungs-Baukasten.
                  </p>
                  <select
                    value={settings.defaultWeightingMode}
                    onChange={(e) => {
                      onUpdateSettings((s) => ({
                        ...s,
                        defaultWeightingMode: e.target.value as WeightingMode,
                      }));
                      triggerSaved();
                    }}
                    className="w-full px-3 py-2 rounded-xl border font-semibold bg-white dark:bg-slate-900"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    <option value="category_buckets">Kategorien-Töpfe (z. B. Schriftlich / Mündlich)</option>
                    <option value="direct_weights">Freie Faktoren (1x, 2x pro Prüfung)</option>
                    <option value="total_points">Punktesammler (Gesamtpunkte über das Halbjahr)</option>
                  </select>
                </div>
              </div>

              {/* Favorisierte Gewichtungs-Vorschläge */}
              <div
                className="p-4 rounded-2xl border space-y-3"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Favorisierte Gewichtungs-Schnellwahltasten
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Wähle aus, welche Verteilungen dir im Gewichtungs-Baukasten direkt als Schnellwahl vorgeschlagen werden. Nicht markierte Vorlagen werden erst bei Klick auf „Weitere Vorlagen“ eingeblendet.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {WEIGHTING_PRESET_CATALOG.map((preset) => {
                    const isFav = settings.favoriteWeightingPresets.includes(preset.id);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => toggleFavoritePreset(preset.id)}
                        className={`p-3 rounded-xl border text-left flex items-center justify-between transition ${
                          isFav ? 'ring-2 ring-teal-500' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: isFav ? 'var(--primary-soft)' : 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div>
                          <div className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                            {preset.label}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {preset.desc}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isFav
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {isFav ? 'Favorit ★' : 'Bei Bedarf'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Eigene gespeicherte Gewichtungs-Vorlagen */}
              <div
                className="p-4 rounded-2xl border space-y-3"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Deine eigenen gespeicherten Fach-Vorlagen ({settings.customWeightingTemplates.length})
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Du kannst im Gewichtungs-Baukasten jede beliebige Kategorien-Struktur als eigene Vorlage speichern (z. B. für Sport, Kunst oder Oberstufe).
                  </p>
                </div>

                {settings.customWeightingTemplates.length === 0 ? (
                  <div className="text-xs italic opacity-70">
                    Noch keine eigenen Vorlagen gespeichert.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {settings.customWeightingTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="p-3 rounded-xl border flex items-center justify-between gap-3"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div>
                          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
                            {tpl.name}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {tpl.categories
                              .map((c) => `${c.name} (${Math.round(c.weight * 100)}%)`)
                              .join(' · ')}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteCustomTemplate(tpl.id)}
                          className="p-1.5 rounded-lg border text-rose-600 hover:bg-rose-500/10"
                          style={{ borderColor: 'var(--border-subtle)' }}
                          title="Vorlage löschen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 2: ANSICHT & WAS NUR BEI BEDARF EINGEBLENDET WIRD
             ================================================================= */}
          {activeSection === 'visibility' && (
            <div className="space-y-4">
              <div
                className="p-4 rounded-2xl border space-y-2"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <label className="block font-bold" style={{ color: 'var(--text-primary)' }}>
                  Standard-Darstellung der Notenzellen in der Klassen-Matrix
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {(
                    [
                      { id: 'combined', label: 'Kombi (73% · 2-)' },
                      { id: 'percent_only', label: 'Nur Prozent (73%)' },
                      { id: 'grade_only', label: 'Nur Note (2-)' },
                    ] as const
                  ).map((fmt) => (
                    <button
                      key={fmt.id}
                      onClick={() => {
                        onUpdateSettings((s) => ({
                          ...s,
                          defaultCellFormat: fmt.id as CellDisplayFormat,
                        }));
                        triggerSaved();
                      }}
                      className={`p-2.5 rounded-xl border font-bold text-center transition ${
                        settings.defaultCellFormat === fmt.id ? 'ring-2 ring-teal-500' : ''
                      }`}
                      style={{
                        backgroundColor:
                          settings.defaultCellFormat === fmt.id
                            ? 'var(--primary-soft)'
                            : 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="p-4 rounded-2xl border space-y-3 divide-y"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="pb-2">
                  <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Oberfläche aufräumen: Was soll sofort sichtbar sein, was nur bei Bedarf?
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Blende Spezialfunktionen aus, wenn du im Alltag eine möglichst ruhige, reduzierte Ansicht bevorzugst.
                  </p>
                </div>

                {(
                  [
                    {
                      key: 'showReportCardColumn',
                      title: 'Spalte „Zeugnisnote“ direkt in der Klassen-Matrix anzeigen',
                      desc: 'Wenn deaktiviert, wird die Zeugnisnoten-Spalte nur bei Bedarf (z. B. vor den Zeugniskonferenzen) eingeblendet.',
                    },
                    {
                      key: 'showCategoryAveragesInMatrix',
                      title: 'Zwischenschnitte pro Kategorie (Ø LNW, Ø Mündl) in der Matrix anzeigen',
                      desc: 'Zeigt hinter jeder Kategorien-Gruppe den aktuellen Zwischenstand an.',
                    },
                    {
                      key: 'showStudentLevelsByDefault',
                      title: 'Niveau-Spalte (G / M / E) bei neuen Klassen standardmäßig aktivieren',
                      desc: 'Ideal für Gemeinschaftsschulen; an Gymnasien meist nur bei Bedarf nötig.',
                    },
                    {
                      key: 'showWhatIfSimulator',
                      title: '„Was-wäre-wenn“-Zielnoten-Rechner in der Schüler-360°-Akte sofort öffnen',
                      desc: 'Wenn deaktiviert, bleibt der Simulator eingeklappt und öffnet sich erst auf Klick im Elterngespräch.',
                    },
                    {
                      key: 'showCurveEditorInSpeedGrading',
                      title: 'Interaktiven Notenschlüssel-Editor beim Speed-Grading sofort einblenden',
                      desc: 'Wenn deaktiviert, wird rechts nur der Live-Notenspiegel gezeigt und die Schieberegler öffnen sich erst bei Bedarf.',
                    },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.key}
                    className="pt-3 flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
                        {item.title}
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {item.desc}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings[item.key])}
                      onChange={(e) => {
                        onUpdateSettings((s) => ({
                          ...s,
                          [item.key]: e.target.checked,
                        }));
                        triggerSaved();
                      }}
                      className="w-4 h-4 accent-teal-600 shrink-0"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 3: FARBWELT & ERSCHEINUNGSBILD (SYNCHRONISIERT)
             ================================================================= */}
          {activeSection === 'appearance' && (
            <div className="space-y-5">
              <div
                className="p-4 rounded-2xl border space-y-3"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Farbschema wählen (Standard: Teal Flow)
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Wird verschlüsselt in deinem Profil gespeichert und automatisch auf allen deinen Geräten (Web, Tablet, Smartphone) übernommen.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      {
                        id: 'teal',
                        color: '#0D9488',
                        label: 'Teal Flow (Standard)',
                        desc: 'Beruhigendes Petrol & klares Weiß – entspannt für lange Korrekturabende',
                      },
                      {
                        id: 'indigo',
                        color: '#4F46E5',
                        label: 'Nordic Indigo',
                        desc: 'Kühles, fokussiertes Blau-Violett mit hohem Kontrast',
                      },
                      {
                        id: 'sage',
                        color: '#15803D',
                        label: 'Forest Sage',
                        desc: 'Natürliches Salbeigrün mit warmem Papier-Hintergrund',
                      },
                      {
                        id: 'terracotta',
                        color: '#C2410C',
                        label: 'Warm Terracotta',
                        desc: 'Warme Erdtöne für ein analoges Notizbuch-Gefühl',
                      },
                    ] as const
                  ).map((t) => {
                    const selected = settings.themePreset === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          onUpdateSettings((s) => ({
                            ...s,
                            themePreset: t.id as ThemePreset,
                          }));
                          triggerSaved();
                        }}
                        className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition ${
                          selected ? 'ring-2 ring-teal-500' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: selected ? 'var(--primary-soft)' : 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <span
                          className="w-6 h-6 rounded-full shrink-0 mt-0.5 shadow-sm"
                          style={{ backgroundColor: t.color }}
                        />
                        <div>
                          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
                            {t.label}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {t.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className="p-4 rounded-2xl border flex items-center justify-between"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-3">
                  {settings.darkMode ? (
                    <Moon className="w-5 h-5 text-teal-400" />
                  ) : (
                    <Sun className="w-5 h-5 text-amber-500" />
                  )}
                  <div>
                    <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                      Darstellungsmodus: {settings.darkMode ? 'Dunkler Modus (Dark Mode)' : 'Heller Tageslicht-Modus'}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Heller Modus für das Klassenzimmer, dunkler Modus für die Korrektur am Abend.
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onUpdateSettings((s) => ({ ...s, darkMode: !s.darkMode }));
                    triggerSaved();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                >
                  Auf {settings.darkMode ? 'Hell' : 'Dunkel'} umschalten
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
