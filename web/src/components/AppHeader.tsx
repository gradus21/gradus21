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
  const tabsNavRef = useRef<HTMLElement>(null);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });

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

  return (
    <>
      {/* UNIFIED SINGLE HEADER BAR */}
      <header
        className="border-b px-4 sm:px-6 pb-3 sm:pb-3.5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-[max(0.875rem,env(safe-area-inset-top))] flex items-center justify-between gap-3 sm:gap-6 sticky top-0 z-30 shadow-xs min-h-[64px]"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* LEFT: Logo & Class Switcher Dropdown */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <a
            href="https://gradus21.de"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 group transition hover:opacity-95 shrink-0"
            title="Zur offiziellen Website gradus21.de"
          >
            <FlowRibbonLogo size={28} showWordmark={false} />
            <span
              className="font-extrabold tracking-tight text-lg group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors hidden sm:inline"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
            >
              Gradus21
            </span>
          </a>

          {/* Compact Unified Class Switcher */}
          <div
            data-tour="header-class-switcher"
            className="flex items-center gap-1.5 p-1 rounded-xl border min-w-0 shadow-2xs"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <ClassSwitcher
              datasets={datasets}
              activeDataset={activeDataset}
              setActiveClassId={setActiveClassId}
            />
            <span className="w-px h-6 mx-0.5" style={{ backgroundColor: 'var(--border-subtle)' }} />

            <button
              onClick={onOpenClassManager}
              data-tour="header-class-manager-btn"
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
              title="Aktuelle Klasse bearbeiten (Schüler, Kategorien, Prüfungen)"
              aria-label="Klasse bearbeiten"
            >
              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
            </button>

            <button
              onClick={onOpenClassWizard}
              data-tour="header-class-wizard-btn"
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
              style={{ color: 'var(--text-secondary)' }}
              title="Neue Klasse erstellen oder .xlsx Excel-Datei importieren"
              aria-label="Neue Klasse"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* CENTER: 4 Workspace Mode Tabs (Segmented Control on tablet & desktop, hidden on phone) */}
        <nav
          data-tour="header-mode-tabs"
          aria-label="Arbeitsmodi"
          ref={tabsNavRef}
          className="relative hidden md:flex items-center gap-1 p-1 rounded-xl border shrink-0"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          {/* Sliding active indicator */}
          <span
            aria-hidden
            className="absolute top-1 bottom-1 rounded-lg shadow-sm pointer-events-none transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{
              backgroundColor: 'var(--primary-500)',
              width: tabIndicator.width,
              transform: `translateX(${tabIndicator.left}px)`,
              opacity: tabIndicator.width ? 1 : 0,
              left: 0,
            }}
          />
          {(
            [
              { id: 'matrix', label: 'Matrix', full: 'Klassen-Matrix', icon: Columns, num: '1' },
              { id: 'speed_grading', label: 'Speed', full: 'Speed-Grading', icon: Zap, num: '2' },
              { id: 'student_360', label: '360°', full: '360°-Akte', icon: UserCheck, num: '3' },
              { id: 'configurator', label: 'Setup', full: 'Gewichtung', icon: Sliders, num: '4' },
            ] as const
          ).map((tab) => {
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
                className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-200 flex items-center gap-2 shrink-0 ${
                  active ? 'text-white' : 'hover:text-[var(--text-primary)]'
                }`}
                style={{
                  color: active ? '#FFFFFF' : 'var(--text-secondary)',
                }}
                title={`${tab.full} (${getModifierKey()}+${tab.num})`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                <span className="hidden lg:inline">{tab.full}</span>
                <span className="lg:hidden">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* RIGHT: Term Filter + Average + Storage Indicator + Action Icons */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Halbjahr Switcher (Desktop / Tablet) */}
          <div
            className="hidden sm:inline-flex items-center gap-0.5 p-1 rounded-xl border"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            {(
              [
                { id: 'hj1', label: '1. HJ' },
                { id: 'hj2', label: '2. HJ' },
                { id: 'all', label: 'Gesamt' },
              ] as const
            ).map((term) => (
              <button
                key={term.id}
                onClick={() => setActiveTerm(term.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  activeTerm === term.id ? 'shadow-xs font-bold' : 'opacity-65 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: activeTerm === term.id ? 'var(--bg-surface)' : 'transparent',
                  color: activeTerm === term.id ? 'var(--primary-text)' : 'var(--text-secondary)',
                }}
              >
                {term.label}
              </button>
            ))}
          </div>

          {/* Compact Live-Klassenschnitt (Visible on large screens) */}
          {calculationReport?.class_average_percent != null && (
            <span
              className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-subtle)',
              }}
              title={`Live-Klassenschnitt ${activeTerm.toUpperCase()}: ${calculationReport.class_average_percent}% (Note ${calculationReport.class_display_grade})`}
            >
              <span className="text-[11px] font-sans font-medium opacity-60">Ø</span>
              <span className="text-teal-600 dark:text-teal-400 font-extrabold">{calculationReport.class_display_grade}</span>
              <span className="opacity-50 text-[11px]">({calculationReport.class_average_percent}%)</span>
            </span>
          )}

          {/* GUIDE BUTTON (OPTIONAL) */}
          {showGuideButtonInHeader && (
            <button
              onClick={onOpenInteractiveGuide}
              data-tour="header-guide-btn"
              className="w-9 h-9 rounded-xl border flex items-center justify-center transition hover:opacity-90 active:scale-95 shrink-0"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              }}
              title="Interaktive Demo & Funktions-Guide (Taste ?)"
              aria-label="Guide"
            >
              <HelpCircle className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
            </button>
          )}

          {/* SPEICHERAMPEL */}
          <div className="relative" ref={storagePopoverRef}>
            <button
              onClick={() => setIsStoragePopoverOpen((prev) => !prev)}
              data-tour="header-sync-status"
              className={`h-9 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer hover:opacity-95 flex items-center justify-center gap-1.5 shrink-0 ${
                syncStatus === 'synced'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                  : syncStatus === 'local_only'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                  : syncStatus === 'syncing'
                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-800 dark:text-teal-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
              }`}
              title={
                syncStatus === 'synced'
                  ? 'Speicherampel: GRÜN - Verschlüsselt in der Cloud & lokal gesichert (E2EE)'
                  : syncStatus === 'local_only'
                  ? storageInfo.isNative
                    ? `Speicherampel: GELB - Noten liegen ausschließlich lokal in der ${storageInfo.platformName}-App.`
                    : 'Speicherampel: GELB - Achtung: Noten liegen ausschließlich in diesem Browser.'
                  : syncStatus === 'syncing'
                  ? 'Speicherampel: BLAU - Änderungen werden verschlüsselt gesichert...'
                  : 'Speicherampel: ROT - Offline / Lokale Änderungen nicht synchronisiert.'
              }
              aria-label="Speicherampel: Wo liegen Ihre Daten?"
            >
              <span className="relative flex items-center justify-center shrink-0">
                {syncStatus === 'syncing' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
                ) : syncStatus === 'synced' ? (
                  <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : syncStatus === 'local_only' ? (
                  <HardDrive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                )}
                <span
                  className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                    syncStatus === 'synced'
                      ? 'bg-emerald-500'
                      : syncStatus === 'local_only'
                      ? 'bg-amber-500'
                      : syncStatus === 'syncing'
                      ? 'bg-teal-500 animate-pulse'
                      : 'bg-rose-500'
                  }`}
                />
              </span>

              {/* Status Text Desktop */}
              <span className="hidden lg:inline font-bold">
                {syncStatus === 'syncing'
                  ? 'Sichern...'
                  : syncStatus === 'synced'
                  ? 'Cloud'
                  : syncStatus === 'local_only'
                  ? 'Lokal'
                  : 'Offline'}
              </span>
            </button>

            {/* SPEICHERAMPEL POPOVER / FLYOUT */}
            {isStoragePopoverOpen && (
              <div
                className="fixed left-3 right-3 top-[3.75rem] max-w-md mx-auto sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-w-none max-h-[80dvh] overflow-y-auto rounded-2xl border shadow-2xl p-4 z-50 text-xs space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {/* Popover Header */}
                <div
                  className="flex items-start justify-between gap-3 border-b pb-3"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        syncStatus === 'synced'
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : syncStatus === 'local_only'
                          ? 'bg-amber-500/15 text-amber-600'
                          : 'bg-rose-500/15 text-rose-600'
                      }`}
                    >
                      {syncStatus === 'synced' ? (
                        <Cloud className="w-5 h-5" />
                      ) : syncStatus === 'local_only' ? (
                        <HardDrive className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            syncStatus === 'synced'
                              ? 'bg-emerald-500'
                              : syncStatus === 'local_only'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        />
                        <h4 className="font-extrabold text-xs">
                          {syncStatus === 'synced'
                            ? 'Speicherampel: GRÜN (Gesichert)'
                            : syncStatus === 'local_only'
                            ? 'Speicherampel: GELB (Nur lokal)'
                            : 'Speicherampel: ROT (Offline / Flüchtig)'}
                        </h4>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {syncStatus === 'synced'
                          ? 'Zero-Knowledge E2EE Server-Sync aktiv'
                          : storageInfo.isNative
                          ? `Daten liegen ausschließlich lokal (${storageInfo.platformName})`
                          : 'Daten liegen ausschließlich in diesem Browser'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsStoragePopoverOpen(false)}
                    className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition opacity-60 hover:opacity-100"
                    title="Schließen"
                  >
                    ✕
                  </button>
                </div>

                {/* Rechtliche Aufklärung (§ 241 Abs. 2 BGB Belehrung) */}
                <div
                  className={`p-3 rounded-xl border leading-relaxed text-[11px] space-y-1 ${
                    syncStatus === 'synced'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-950 dark:text-emerald-200'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-950 dark:text-amber-200'
                  }`}
                >
                  <p className="font-semibold">
                    {syncStatus === 'synced'
                      ? '✓ Noten sind servergesichert:'
                      : '⚠️ Wichtiger Hinweis zum Datenverlust-Risiko:'}
                  </p>
                  <p className="opacity-90">
                    {syncStatus === 'synced'
                      ? `Ihre Noten werden bei jeder Änderung als AES-256-GCM Chiffretext synchronisiert. Selbst bei Defekt oder Verlust dieses Geräts bleiben Ihre Daten erhalten.`
                      : storageInfo.isNative
                      ? `Noten liegen ausschließlich im lokalen App-Speicher dieses Geräts (${storageInfo.locationLabel}). Ohne Cloud-Sync oder Backup-Export stehen sie nur auf diesem Gerät zur Verfügung.`
                      : storageInfo.isMobile
                      ? 'Noten liegen nur im lokalen Browser-Speicher (IndexedDB). Bei Browser-Bereinigung, privatem Surfen oder Verlauf-Leeren gehen Daten ohne Export verloren!'
                      : 'Noten liegen nur im lokalen Browser-Speicher (IndexedDB). Bei Bereinigungs-Software an Schul-PCs (HDGuard), privatem Fenster oder Cache-Leeren gehen Daten ohne Export verloren!'}
                  </p>
                </div>

                {/* Details-Liste */}
                <div className="space-y-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  <div
                    className="flex justify-between items-center py-1 border-b"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span>Speicherort:</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {syncStatus === 'synced'
                        ? storageInfo.isNative
                          ? (storageInfo.isMobile ? `E2EE Cloud + ${storageInfo.platformName}-App` : 'E2EE Cloud + Desktop-App')
                          : 'E2EE Cloud + Browser'
                        : storageInfo.isNative
                        ? (storageInfo.isMobile ? `Lokale App (${storageInfo.platformName})` : `Lokale Desktop-App (${storageInfo.platformName})`)
                        : 'Ausschließlich lokaler Browser'}
                    </span>
                  </div>
                  <div
                    className="flex justify-between items-center py-1 border-b"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span>{storageInfo.isNative ? 'Speichertyp:' : 'Eviction-Schutz:'}</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {storageInfo.isNative
                        ? 'Dauerhaft lokal gesichert (Nativ)'
                        : isPersistentStorage
                        ? 'Aktiv (Persistenter Speicher)'
                        : 'Standardspeicher'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>Letzter Datei-Export:</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {lastLocalBackupTime ? lastLocalBackupTime : 'Noch kein Datei-Export'}
                    </span>
                  </div>
                </div>

                {/* Quick-Aktionen */}
                <div className="pt-1 flex flex-col gap-2">
                  {onExportEncryptedBackup && (
                    <button
                      onClick={() => {
                        setIsStoragePopoverOpen(false);
                        onExportEncryptedBackup();
                      }}
                      className="w-full py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Download className="w-3.5 h-3.5 text-teal-600" />
                      <span>Tresor jetzt als .gradus21 Datei sichern</span>
                    </button>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setIsStoragePopoverOpen(false);
                        onOpenSettings('storage');
                      }}
                      className="flex-1 py-1.5 px-2 rounded-xl text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90"
                      style={{
                        backgroundColor: 'transparent',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Settings className="w-3 h-3 text-teal-600" />
                      <span>Speicher-Einstellungen</span>
                    </button>

                    {onOpenStorageNotice && (
                      <button
                        onClick={() => {
                          setIsStoragePopoverOpen(false);
                          onOpenStorageNotice();
                        }}
                        className="flex-1 py-1.5 px-2 rounded-xl text-[11px] font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90 text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/30"
                      >
                        <Info className="w-3 h-3" />
                        <span>Hinweis-Details</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PRIVACY BLUR */}
          <button
            onClick={() => setPrivacyBlur((b) => !b)}
            data-tour="header-privacy-blur"
            className={`w-9 h-9 rounded-xl text-xs font-semibold border flex items-center justify-center transition active:scale-95 shrink-0 ${
              privacyBlur ? 'ring-2 ring-amber-500 bg-amber-500/10 text-amber-600' : ''
            }`}
            style={
              !privacyBlur
                ? {
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border-subtle)',
                  }
                : undefined
            }
            title={privacyBlur ? 'Namen & Noten einblenden (Alt+P)' : 'Namen & Noten unscharf schalten (Alt+P)'}
            aria-label="Datenschutz Unschärfe umschalten"
          >
            {privacyBlur ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* SETTINGS */}
          <button
            onClick={() => onOpenSettings()}
            data-tour="header-settings-btn"
            className="w-9 h-9 rounded-xl text-xs font-semibold border flex items-center justify-center transition active:scale-95 shrink-0"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Einstellungen"
            aria-label="Einstellungen"
          >
            <Settings className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
          </button>

          {/* ADMIN */}
          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className="w-9 h-9 rounded-xl text-xs font-semibold border flex items-center justify-center transition active:scale-95 shadow-xs shrink-0"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                borderColor: 'rgba(239, 68, 68, 0.25)',
              }}
              title="Admin-Bereich"
              aria-label="Admin-Bereich"
            >
              <Shield className="w-4 h-4 text-red-600" />
            </button>
          )}

          {/* LOCK */}
          <button
            onClick={onLockVault}
            className="w-9 h-9 rounded-xl text-xs font-semibold border flex items-center justify-center transition active:scale-95 shrink-0"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Gradus21 sperren / Abmelden"
            aria-label="Abmelden und sperren"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MOBILE MINI-STRIP (Exclusively visible on phones < md, height ~34px) */}
      <div
        className="md:hidden border-b px-3 py-1 flex items-center justify-between text-xs"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div
          className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          {(
            [
              { id: 'hj1', label: '1. HJ' },
              { id: 'hj2', label: '2. HJ' },
              { id: 'all', label: 'Gesamt' },
            ] as const
          ).map((term) => (
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
