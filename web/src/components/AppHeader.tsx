import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Columns,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  HardDrive,
  HelpCircle,
  Info,
  Lock,
  RefreshCw,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  UserCheck,
  Zap,
  X,
} from 'lucide-react';
import { FlowRibbonLogo } from './FlowRibbonLogo';
import { ClassSwitcher } from './ClassSwitcher';
import { ClassroomSubjectDataset, TermFilterId } from '../data/demoClasses';
import { ClassCalculationReport, WorkspaceMode } from '../types/workspace';
import { SettingsSection } from './SettingsModal';
import { getStorageLocationInfo, getModifierKey } from '../utils/platform';

export interface AppHeaderProps {
  datasets: ClassroomSubjectDataset[];
  activeDataset: ClassroomSubjectDataset;
  setActiveClassId: (id: string) => void;
  onOpenClassWizard: () => void;
  onOpenClassManager: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onOpenVaultInspector?: () => void;
  onOpenAdmin: () => void;
  onOpenInteractiveGuide: () => void;
  showGuideButtonInHeader?: boolean;
  isAdmin?: boolean;
  syncStatus: 'syncing' | 'synced' | 'offline_local' | 'local_only';
  isPersistentStorage?: boolean;
  lastLocalBackupTime?: string | null;
  onExportEncryptedBackup?: () => void;
  onOpenStorageNotice?: () => void;
  privacyBlur: boolean;
  setPrivacyBlur: React.Dispatch<React.SetStateAction<boolean>>;
  onLockVault: () => void;
  activeTerm: TermFilterId;
  setActiveTerm: (term: TermFilterId) => void;
  archivedCount: number;
  calculationReport: ClassCalculationReport | null;
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  datasets,
  activeDataset,
  setActiveClassId,
  onOpenClassWizard,
  onOpenClassManager,
  onOpenSettings,
  onOpenVaultInspector,
  onOpenAdmin,
  onOpenInteractiveGuide,
  showGuideButtonInHeader = false,
  isAdmin,
  syncStatus,
  isPersistentStorage,
  lastLocalBackupTime,
  onExportEncryptedBackup,
  onOpenStorageNotice,
  privacyBlur,
  setPrivacyBlur,
  onLockVault,
  activeTerm,
  setActiveTerm,
  archivedCount,
  calculationReport,
  mode,
  setMode,
}) => {
  const [isStoragePopoverOpen, setIsStoragePopoverOpen] = useState(false);
  const [modifierHeld, setModifierHeld] = useState(false);
  const tabsNavRef = useRef<HTMLElement>(null);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });

  // ── Sliding tab indicator ──────────────────────────────────────────────
  useLayoutEffect(() => {
    const nav = tabsNavRef.current;
    if (!nav) return;
    const measure = () => {
      const btn = nav.querySelector<HTMLElement>(`[data-mode-tab="${mode}"]`);
      setTabIndicator(btn ? { left: btn.offsetLeft, width: btn.offsetWidth } : { left: 0, width: 0 });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [mode]);

  // ── Modifier key (Ctrl / ⌘) held → show shortcut badges on tabs ──────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setModifierHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setModifierHeld(false);
    };
    const blur = () => setModifierHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const storagePopoverRef = useRef<HTMLDivElement>(null);
  const storageInfo = getStorageLocationInfo();

  useEffect(() => {
    if (!isStoragePopoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (storagePopoverRef.current && !storagePopoverRef.current.contains(e.target as Node)) {
        setIsStoragePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStoragePopoverOpen]);

  const modKey = getModifierKey();

  return (
    <>
      {/* ── HEADER BAR ──────────────────────────────────────────────────── */}
      <header
        className="header-bar border-b px-3 md:px-5 py-2.5 flex items-center gap-2 md:gap-4 sticky top-0 z-30"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* LEFT: Logo + Class Switcher */}
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <a
            href="https://gradus21.de"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 group shrink-0"
            title="Zur offiziellen Website gradus21.de"
          >
            <FlowRibbonLogo size={26} showWordmark={false} />
            <span
              className="font-bold text-[15px] group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors hidden lg:inline"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
            >
              Gradus21
            </span>
          </a>

          {/* Class Switcher — no wrapper box, just the button + actions */}
          <div
            data-tour="header-class-switcher"
            className="flex items-center gap-0.5 min-w-0"
          >
            <ClassSwitcher
              datasets={datasets}
              activeDataset={activeDataset}
              setActiveClassId={setActiveClassId}
              onEditClass={onOpenClassManager}
              onCreateClass={onOpenClassWizard}
            />
            <button
              onClick={onOpenClassManager}
              data-tour="header-class-manager-btn"
              className="hidden lg:flex w-7 h-7 rounded-md items-center justify-center shrink-0 transition-colors hover:bg-black/5 dark:hover:bg-white/8 active:scale-95"
              title="Aktuelle Klasse bearbeiten (Schüler, Kategorien, Prüfungen)"
              aria-label="Klasse bearbeiten"
            >
              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
            <button
              onClick={onOpenClassWizard}
              data-tour="header-class-wizard-btn"
              className="hidden lg:flex w-7 h-7 rounded-md items-center justify-center shrink-0 transition-colors hover:bg-black/5 dark:hover:bg-white/8 active:scale-95"
              title="Neue Klasse erstellen oder .xlsx Excel-Datei importieren"
              aria-label="Neue Klasse"
            >
              <FolderPlus className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        {/* CENTER: Mode Tabs — icon-only on md, labels on lg+ */}
        <nav
          data-tour="header-mode-tabs"
          aria-label="Arbeitsmodi"
          ref={tabsNavRef}
          className="relative hidden md:flex items-center gap-0.5 p-0.5 rounded-lg shrink-0"
          style={{ backgroundColor: 'var(--bg-subtle)' }}
        >
          {/* Sliding active pill */}
          <span
            aria-hidden
            className="absolute top-0.5 bottom-0.5 rounded-md pointer-events-none transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 0 0 1px var(--border-subtle)',
              width: tabIndicator.width,
              transform: `translateX(${tabIndicator.left}px)`,
              opacity: tabIndicator.width ? 1 : 0,
              left: 0,
            }}
          />
          {([
            { id: 'matrix', label: 'Matrix', full: 'Klassen-Matrix', icon: Columns, num: '1' },
            { id: 'speed_grading', label: 'Speed', full: 'Speed-Grading', icon: Zap, num: '2' },
            { id: 'student_360', label: '360°', full: '360°-Akte', icon: UserCheck, num: '3' },
            { id: 'configurator', label: 'Setup', full: 'Gewichtung', icon: Sliders, num: '4' },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            const tourId =
              tab.id === 'matrix'
                ? 'header-mode-matrix'
                : tab.id === 'speed_grading'
                ? 'header-mode-speed'
                : tab.id === 'student_360'
                ? 'header-mode-student360'
                : 'header-mode-configurator';
            return (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                data-tour={tourId}
                data-mode-tab={tab.id}
                aria-current={active ? 'page' : undefined}
                className={`relative z-10 px-2.5 lg:px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 flex items-center gap-1.5 shrink-0 ${
                  active ? 'font-semibold' : 'hover:text-[var(--text-primary)]'
                }`}
                style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
                title={`${tab.full} (${modKey}+${tab.num})`}
                aria-label={tab.full}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">{tab.label}</span>
                {/* Keyboard shortcut badge — appears while Ctrl/⌘ held */}
                {modifierHeld && (
                  <kbd
                    className="absolute -top-1.5 -right-1 text-[9px] leading-none font-mono font-bold px-1 py-0.5 rounded bg-black/80 dark:bg-white/90 text-white dark:text-black shadow-sm animate-pop-in pointer-events-none"
                  >
                    {tab.num}
                  </kbd>
                )}
              </button>
            );
          })}
        </nav>

        {/* RIGHT: Term + Status + Actions */}
        <div className="flex items-center gap-1.5 md:gap-2 ml-auto shrink-0">
          {/* Halbjahr Switcher (tablet+) */}
          <div
            className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg"
            style={{ backgroundColor: 'var(--bg-subtle)' }}
          >
            {([
              { id: 'hj1', label: '1. HJ' },
              { id: 'hj2', label: '2. HJ' },
              { id: 'all', label: 'Gesamt' },
            ] as const).map((term) => (
              <button
                key={term.id}
                onClick={() => setActiveTerm(term.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 ${
                  activeTerm === term.id ? 'font-semibold' : ''
                }`}
                style={{
                  backgroundColor: activeTerm === term.id ? 'var(--bg-surface)' : 'transparent',
                  color: activeTerm === term.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: activeTerm === term.id ? '0 1px 2px rgba(0,0,0,.06), 0 0 0 1px var(--border-subtle)' : 'none',
                }}
              >
                {term.label}
              </button>
            ))}
          </div>

          {/* Compact Live-Klassenschnitt (xl+) */}
          {calculationReport?.class_average_percent != null && (
            <span
              className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono tabular-nums"
              style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-primary)' }}
              title={`Live-Klassenschnitt ${activeTerm.toUpperCase()}: ${calculationReport.class_average_percent}% (Note ${calculationReport.class_display_grade})`}
            >
              <span className="font-normal opacity-50">Ø</span>
              <span className="font-bold" style={{ color: 'var(--primary-text)' }}>{calculationReport.class_display_grade}</span>
              <span className="opacity-40">({calculationReport.class_average_percent}%)</span>
            </span>
          )}

          {/* Guide Button (optional) */}
          {showGuideButtonInHeader && (
            <button
              onClick={onOpenInteractiveGuide}
              data-tour="header-guide-btn"
              className="header-icon-btn"
              style={{ color: 'var(--text-muted)' }}
              title="Interaktive Demo & Funktions-Guide (Taste ?)"
              aria-label="Guide"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}

          {/* Storage Status */}
          <div className="relative" ref={storagePopoverRef}>
            <button
              onClick={() => setIsStoragePopoverOpen((o) => !o)}
              data-tour="header-storage-indicator"
              className="header-icon-btn"
              style={{ color: 'var(--text-muted)' }}
              title={
                syncStatus === 'synced'
                  ? 'Cloud-Sync aktiv ✓'
                  : syncStatus === 'syncing'
                  ? 'Synchronisiere…'
                  : syncStatus === 'offline_local'
                  ? 'Lokal gespeichert (offline)'
                  : 'Nur lokaler Speicher'
              }
            >
              <span className="relative flex items-center justify-center shrink-0">
                {syncStatus === 'syncing' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
                ) : syncStatus === 'synced' ? (
                  <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : syncStatus === 'offline_local' ? (
                  <HardDrive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                )}
              </span>
              <span className="hidden lg:inline text-[11px] font-medium">
                {syncStatus === 'synced'
                  ? 'Cloud'
                  : syncStatus === 'syncing'
                  ? 'Sync…'
                  : syncStatus === 'offline_local'
                  ? 'Lokal'
                  : 'Lokal'}
              </span>
            </button>

            {isStoragePopoverOpen && (
              <div
                className="fixed left-3 right-3 top-[3.75rem] max-w-md mx-auto sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-w-none max-h-[80dvh] overflow-y-auto rounded-xl border shadow-2xl p-4 z-50 text-xs space-y-3.5 animate-pop-in"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div
                  className="flex items-start justify-between gap-3 border-b pb-3"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        backgroundColor:
                          syncStatus === 'synced'
                            ? 'rgba(16, 185, 129, 0.1)'
                            : syncStatus === 'syncing'
                            ? 'rgba(14, 165, 233, 0.1)'
                            : 'rgba(245, 158, 11, 0.1)',
                        color:
                          syncStatus === 'synced' ? '#059669' : syncStatus === 'syncing' ? '#0ea5e9' : '#d97706',
                      }}
                    >
                      {syncStatus === 'synced' || syncStatus === 'syncing' ? (
                        <Cloud className="w-5 h-5" />
                      ) : syncStatus === 'offline_local' ? (
                        <HardDrive className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-extrabold text-xs">
                          {syncStatus === 'synced'
                            ? 'Cloud-Sync aktiv'
                            : syncStatus === 'syncing'
                            ? 'Synchronisiere…'
                            : syncStatus === 'offline_local'
                            ? 'Lokaler Speicher'
                            : 'Nur lokaler Speicher'}
                        </h4>
                        {syncStatus === 'synced' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {syncStatus === 'synced'
                          ? 'Ende-zu-Ende-verschlüsselt über gradus21.de'
                          : syncStatus === 'offline_local'
                          ? 'Daten liegen nur auf diesem Gerät'
                          : 'Kein Cloud-Konto verbunden'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsStoragePopoverOpen(false)}
                    className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition opacity-60 hover:opacity-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {syncStatus === 'synced' && (
                  <div
                    className="flex items-center gap-2 p-2.5 rounded-lg"
                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)' }}
                  >
                    <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Zero-Knowledge E2E-Verschlüsselung
                      </p>
                      <p className="opacity-90">
                        Nur du kannst deine Daten entschlüsseln — weder wir noch Dritte haben Zugriff.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  <div
                    className="flex justify-between items-center py-1 border-b"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span>Speicherort</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {storageInfo.locationLabel}
                    </span>
                  </div>
                  <div
                    className="flex justify-between items-center py-1 border-b"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span>Persistent Storage</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {isPersistentStorage ? '✓ Aktiviert' : '✗ Nicht garantiert'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>Letztes lokales Backup</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {lastLocalBackupTime || '—'}
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex flex-col gap-2">
                  {onExportEncryptedBackup && (
                    <button
                      onClick={() => {
                        setIsStoragePopoverOpen(false);
                        onExportEncryptedBackup();
                      }}
                      className="w-full py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition hover:opacity-90"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Download className="w-3.5 h-3.5 text-teal-600" />
                      Verschlüsseltes Backup exportieren
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsStoragePopoverOpen(false);
                        onOpenSettings('storage');
                      }}
                      className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Settings className="w-3 h-3 text-teal-600" />
                      Einstellungen
                    </button>
                    {onOpenStorageNotice && (
                      <button
                        onClick={() => {
                          setIsStoragePopoverOpen(false);
                          onOpenStorageNotice();
                        }}
                        className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90 text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/20"
                      >
                        <Info className="w-3 h-3" />
                        Storage-Hinweis
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Privacy Blur */}
          <button
            onClick={() => setPrivacyBlur((b) => !b)}
            data-tour="header-privacy-blur"
            className={`header-icon-btn ${
              privacyBlur ? 'ring-2 ring-amber-500 bg-amber-500/10 text-amber-600' : ''
            }`}
            style={
              !privacyBlur ? { color: 'var(--text-muted)' } : undefined
            }
            title={privacyBlur ? 'Namen & Noten einblenden (Alt+P)' : 'Namen & Noten unscharf schalten (Alt+P)'}
            aria-label="Datenschutz Unschärfe umschalten"
          >
            {privacyBlur ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Settings */}
          <button
            onClick={() => onOpenSettings()}
            data-tour="header-settings-btn"
            className="header-icon-btn"
            style={{ color: 'var(--text-muted)' }}
            title="Einstellungen"
            aria-label="Einstellungen"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Admin */}
          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className="header-icon-btn text-red-500"
              title="Admin-Bereich"
              aria-label="Admin-Bereich"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}

          {/* Lock */}
          <button
            onClick={onLockVault}
            className="header-icon-btn"
            style={{ color: 'var(--text-muted)' }}
            title="Gradus21 sperren / Abmelden"
            aria-label="Abmelden und sperren"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── MOBILE MINI-STRIP ────────────────────────────────────────────── */}
      <div
        className="md:hidden border-b px-3 py-1 flex items-center justify-between text-xs"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-lg"
          style={{ backgroundColor: 'var(--bg-subtle)' }}
        >
          {([
            { id: 'hj1', label: '1. HJ' },
            { id: 'hj2', label: '2. HJ' },
            { id: 'all', label: 'Gesamt' },
          ] as const).map((term) => (
            <button
              key={term.id}
              onClick={() => setActiveTerm(term.id)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                activeTerm === term.id
                  ? 'shadow-xs bg-white dark:bg-zinc-800 text-teal-600 dark:text-teal-400'
                  : 'opacity-70'
              }`}
            >
              {term.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold text-slate-500">
            {activeDataset.students.filter((s) => !s.is_archived).length} SuS
            {archivedCount > 0 ? ` (+${archivedCount})` : ''}
          </span>
          {calculationReport?.class_average_percent != null && (
            <span
              className="px-2 py-0.5 rounded-full font-mono font-bold"
              style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
            >
              Ø {calculationReport.class_display_grade} ({calculationReport.class_average_percent}%)
            </span>
          )}
        </div>
      </div>
    </>
  );
};
