import React, { useState, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Cloud,
  CloudOff,
  Columns,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  HardDrive,
  HelpCircle,
  Info,
  KeyRound,
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
import { ClassroomSubjectDataset, TermFilterId } from '../data/demoClasses';
import { ClassCalculationReport, WorkspaceMode } from '../types/workspace';
import { SettingsSection } from './SettingsModal';
import { getStorageLocationInfo } from '../utils/platform';

export interface AppHeaderProps {
  datasets: ClassroomSubjectDataset[];
  activeDataset: ClassroomSubjectDataset;
  setActiveClassId: (id: string) => void;
  onOpenClassWizard: () => void;
  onOpenClassManager: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
  onOpenVaultInspector: () => void;
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
      {/* HEADER BAR */}
      <header
        className="border-b px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 sticky top-0 z-30 shadow-sm"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 min-w-0">
          <a
            href="https://gradus21.de"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 sm:gap-2.5 group transition hover:opacity-95 shrink-0"
            title="Zur offiziellen Website gradus21.de"
          >
            <FlowRibbonLogo size={28} showWordmark={false} />
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className="font-extrabold tracking-tight text-sm sm:text-base group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Gradus21
                </span>
                <span
                  className="text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                  }}
                  title="Zero-Knowledge End-to-End Encryption"
                >
                  E2EE
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] leading-tight hidden sm:block" style={{ color: 'var(--text-secondary)' }}>
                Offline-First & Zero-Knowledge Notenverwaltung
              </p>
            </div>
          </a>

          {/* Class Switcher */}
          <div
            data-tour="header-class-switcher"
            className="flex items-center gap-1 p-1 rounded-xl border max-w-full overflow-x-auto"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            {datasets.map((ds) => {
              const active = ds.id === activeDataset.id;
              return (
                <button
                  key={ds.id}
                  onClick={() => setActiveClassId(ds.id)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 ${
                    active ? 'shadow-sm' : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--primary-500)' : 'var(--text-secondary)',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: active ? 'var(--primary-500)' : 'var(--text-muted)',
                    }}
                  />
                  <span className="whitespace-nowrap">
                    {ds.className} · {ds.subjectName}
                  </span>
                </button>
              );
            })}

            <button
              onClick={onOpenClassManager}
              data-tour="header-class-manager-btn"
              className="w-10 h-10 md:w-auto md:h-auto p-0 md:px-2.5 md:py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition hover:opacity-90 border shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              title="Aktuelle Klasse bearbeiten"
            >
              <Edit3 className="w-4 h-4 md:w-3.5 md:h-3.5" style={{ color: 'var(--primary-500)' }} />
              <span className="hidden md:inline">Klasse bearbeiten</span>
            </button>

            <button
              onClick={onOpenClassWizard}
              data-tour="header-class-wizard-btn"
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition hover:opacity-90 shrink-0"
              style={{
                backgroundColor: 'var(--primary-soft)',
                color: 'var(--primary-text)',
              }}
              title="Neue Klasse erstellen oder .xlsx Excel-Datei importieren"
            >
              <FolderPlus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Neue Klasse</span>
              <span className="sm:hidden">Neu</span>
            </button>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* OPTIONAL SUBTLE GUIDE BUTTON (CAN BE TOGGLED IN SETTINGS) */}
          {showGuideButtonInHeader && (
            <button
              onClick={onOpenInteractiveGuide}
              data-tour="header-guide-btn"
              className="w-10 h-10 xl:w-auto xl:h-auto p-0 xl:px-2.5 xl:py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90 shrink-0"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              }}
              title="Interaktive Demo & Funktions-Guide (Taste ?)"
            >
              <HelpCircle className="w-4 h-4 xl:w-3.5 xl:h-3.5" style={{ color: 'var(--primary-500)' }} />
              <span className="hidden xl:inline">Guide</span>
            </button>
          )}

          {/* HEADER SPEICHERAMPEL (§ 241 Abs. 2 BGB Transparenz: Lehrkraft sieht jede Sekunde, wo die Noten liegen) */}
          <div className="relative" ref={storagePopoverRef}>
            <button
              onClick={() => setIsStoragePopoverOpen((prev) => !prev)}
              data-tour="header-sync-status"
              className={`h-10 lg:h-auto px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer hover:opacity-95 flex items-center justify-center gap-2 shrink-0 ${
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
                  ? 'Speicherampel: GELB - Achtung: Noten liegen ausschließlich in diesem Browser. Klicke für Details & Backup.'
                  : syncStatus === 'syncing'
                  ? 'Speicherampel: BLAU - Änderungen werden verschlüsselt gesichert...'
                  : 'Speicherampel: ROT - Offline / Lokale Änderungen nicht synchronisiert.'
              }
              aria-label="Speicherampel: Wo liegen Ihre Daten?"
            >
              {/* Ampel-Dot mit Glow/Pulse */}
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {syncStatus === 'local_only' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                )}
                {syncStatus === 'offline_local' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    syncStatus === 'synced'
                      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                      : syncStatus === 'local_only'
                      ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                      : syncStatus === 'syncing'
                      ? 'bg-teal-500 animate-pulse'
                      : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                  }`}
                />
              </span>

              {/* Icon */}
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600 dark:text-teal-400" />
              ) : syncStatus === 'synced' ? (
                <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : syncStatus === 'local_only' ? (
                <HardDrive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              )}

              {/* Status Text Desktop */}
              <span className="hidden sm:inline font-bold">
                {syncStatus === 'syncing'
                  ? 'Sichern...'
                  : syncStatus === 'synced'
                  ? 'Cloud-Sync (E2EE)'
                  : syncStatus === 'local_only'
                  ? storageInfo.isNative
                    ? 'Nur lokal (App)'
                    : 'Nur lokal (Browser)'
                  : 'Offline (Lokal)'}
              </span>

              {/* Status Text Mobile */}
              <span className="sm:hidden font-bold text-[11px]">
                {syncStatus === 'synced' ? 'Cloud' : syncStatus === 'syncing' ? '...' : 'Lokal'}
              </span>
            </button>

            {/* SPEICHERAMPEL POPOVER / FLYOUT */}
            {isStoragePopoverOpen && (
              <div
                className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border shadow-2xl p-4 z-50 text-xs space-y-3.5 animate-in fade-in zoom-in-95 duration-150"
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

          <button
            onClick={() => onOpenSettings()}
            data-tour="header-settings-btn"
            className="w-10 h-10 xl:w-auto xl:h-auto p-0 xl:px-3 xl:py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90 shrink-0"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Einstellungen"
            aria-label="Einstellungen"
          >
            <Settings className="w-4 h-4 xl:w-3.5 xl:h-3.5" style={{ color: 'var(--primary-500)' }} />
            <span className="hidden xl:inline">Einstellungen</span>
          </button>

          <button
            onClick={onOpenVaultInspector}
            data-tour="header-vault-btn"
            className="w-10 h-10 lg:w-auto lg:h-auto p-0 lg:px-3 lg:py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90 shrink-0"
            style={{
              backgroundColor: 'var(--primary-soft)',
              color: 'var(--primary-text)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Konto & Schutz"
            aria-label="Konto & Schutz"
          >
            <KeyRound className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
            <span className="hidden lg:inline">Konto & Schutz</span>
          </button>

          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className="w-10 h-10 xl:w-auto xl:h-auto p-0 xl:px-3 xl:py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90 shadow-sm shrink-0"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                borderColor: 'rgba(239, 68, 68, 0.25)',
              }}
              title="Admin-Bereich"
              aria-label="Admin-Bereich"
            >
              <Shield className="w-4 h-4 xl:w-3.5 xl:h-3.5 text-red-600" />
              <span className="hidden xl:inline">Admin</span>
            </button>
          )}

          <button
            onClick={() => setPrivacyBlur((b) => !b)}
            data-tour="header-privacy-blur"
            className={`w-10 h-10 md:w-auto md:h-auto p-0 md:px-3 md:py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition shrink-0 ${
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
            title="Namen & Noten unscharf schalten (Alt+P)"
            aria-label="Datenschutz Unschärfe umschalten"
          >
            {privacyBlur ? <Eye className="w-4 h-4 md:w-3.5 md:h-3.5" /> : <EyeOff className="w-4 h-4 md:w-3.5 md:h-3.5" />}
            <span className="hidden md:inline">{privacyBlur ? 'Namen zeigen' : 'Namen ausblenden'}</span>
          </button>

          <button
            onClick={onLockVault}
            className="w-10 h-10 sm:w-auto sm:h-auto p-0 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition hover:opacity-90 shrink-0"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Gradus21 sperren"
            aria-label="Abmelden und sperren"
          >
            <Lock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Abmelden</span>
          </button>
        </div>
      </header>

      {/* SUB-HEADER: CONTEXT & TABS */}
      <div
        className="border-b px-3 sm:px-6 py-2.5 sm:py-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="space-y-1 min-w-0">
          <div
            className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="hidden sm:inline">{activeDataset.schoolName}</span>
            <ChevronRight className="w-3.5 h-3.5 hidden sm:inline" />
            <span>SJ {activeDataset.schoolYear}</span>
            <ChevronRight className="w-3.5 h-3.5" />

            <div
              className="inline-flex items-center gap-1 p-0.5 rounded-lg border"
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <Calendar className="w-3 h-3 ml-1.5" style={{ color: 'var(--primary-500)' }} />
              {(
                [
                  { id: 'hj1', label: '1. Halbjahr' },
                  { id: 'hj2', label: '2. Halbjahr' },
                  { id: 'all', label: 'Gesamtjahr' },
                ] as const
              ).map((term) => (
                <button
                  key={term.id}
                  onClick={() => setActiveTerm(term.id)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition ${
                    activeTerm === term.id ? 'text-white shadow-sm' : ''
                  }`}
                  style={{
                    backgroundColor: activeTerm === term.id ? 'var(--primary-500)' : 'transparent',
                    color: activeTerm === term.id ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {term.label}
                </button>
              ))}
            </div>
          </div>

          <h1
            className="text-lg sm:text-xl font-bold flex flex-wrap items-center gap-2 sm:gap-3"
            style={{ color: 'var(--text-primary)' }}
          >
            <span>
              {activeDataset.subjectName} – {activeDataset.className}
            </span>
            <span
              className="text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
            >
              {activeDataset.students.filter((s) => !s.is_archived).length} aktive Schüler
              {archivedCount > 0 ? ` (+${archivedCount} archiviert)` : ''}
            </span>
            {calculationReport?.class_average_percent != null && (
              <span
                className="text-xs font-mono font-semibold px-2 sm:px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
              >
                Live-Klassenschnitt ({activeTerm.toUpperCase()}):{' '}
                {calculationReport.class_average_percent}% (Ø{' '}
                {calculationReport.class_display_grade})
              </span>
            )}
          </h1>
          <p className="text-xs line-clamp-1 sm:line-clamp-none" style={{ color: 'var(--text-secondary)' }}>
            {activeDataset.description}
          </p>
        </div>

        {/* 4 Specialized Workspace Mode Tabs */}
        <div
          data-tour="header-mode-tabs"
          className="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-2xl border max-w-full overflow-x-auto"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          {(
            [
              { id: 'matrix', label: 'Klassen-Matrix', sub: 'Übersicht & Zeugnis', icon: Columns },
              { id: 'speed_grading', label: 'Speed-Grading', sub: 'Prüfung & Schlüssel', icon: Zap },
              { id: 'student_360', label: 'Schüler-360°-Akte', sub: 'Elterngespräch & PDF', icon: UserCheck },
              { id: 'configurator', label: 'Gewichtungs-Baukasten', sub: 'Individuell & Vorlagen', icon: Sliders },
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
                className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-left transition-all flex items-center gap-2 shrink-0 ${
                  active ? 'shadow-sm' : 'opacity-75 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: active ? 'var(--primary-500)' : 'transparent',
                  color: active ? '#FFFFFF' : 'var(--text-primary)',
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="leading-tight">
                  <div className="text-xs font-bold whitespace-nowrap">{tab.label}</div>
                  <div className={`text-[10px] hidden md:block ${active ? 'text-teal-50/90' : 'opacity-70'}`}>
                    {tab.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
