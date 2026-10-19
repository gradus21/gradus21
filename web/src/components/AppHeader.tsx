import React from 'react';
import {
  Calendar,
  ChevronRight,
  Cloud,
  CloudOff,
  Columns,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  HelpCircle,
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

export interface AppHeaderProps {
  datasets: ClassroomSubjectDataset[];
  activeDataset: ClassroomSubjectDataset;
  setActiveClassId: (id: string) => void;
  onOpenClassWizard: () => void;
  onOpenClassManager: () => void;
  onOpenSettings: () => void;
  onOpenVaultInspector: () => void;
  onOpenAdmin: () => void;
  onOpenInteractiveGuide: () => void;
  showGuideButtonInHeader?: boolean;
  isAdmin?: boolean;
  syncStatus: 'syncing' | 'synced' | 'offline_local';
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
  return (
    <>
      {/* HEADER BAR */}
      <header
        className="border-b px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-sm"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="https://gradus21.de"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 group transition hover:opacity-95"
            title="Zur offiziellen Website gradus21.de"
          >
            <FlowRibbonLogo size={32} showWordmark={false} />
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="font-extrabold tracking-tight text-base group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Gradus21
                </span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                  }}
                >
                  BTE v2
                </span>
              </div>
              <p className="text-[11px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                Offline-First & Zero-Knowledge Notenverwaltung
              </p>
            </div>
          </a>

          {/* Class Switcher */}
          <div
            data-tour="header-class-switcher"
            className="flex flex-wrap items-center gap-1 p-1 rounded-xl border"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            {datasets.map((ds) => {
              const active = ds.id === activeDataset.id;
              return (
                <button
                  key={ds.id}
                  onClick={() => setActiveClassId(ds.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                    active ? 'shadow-sm' : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--primary-500)' : 'var(--text-secondary)',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: active ? 'var(--primary-500)' : 'var(--text-muted)',
                    }}
                  />
                  <span>
                    {ds.className} · {ds.subjectName}
                  </span>
                </button>
              );
            })}

            <button
              onClick={onOpenClassManager}
              data-tour="header-class-manager-btn"
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition hover:opacity-90 border"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              title="Aktuelle Klasse bearbeiten"
            >
              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
              <span>Klasse bearbeiten</span>
            </button>

            <button
              onClick={onOpenClassWizard}
              data-tour="header-class-wizard-btn"
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--primary-soft)',
                color: 'var(--primary-text)',
              }}
              title="Neue Klasse erstellen oder .xlsx Excel-Datei importieren"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>+ Neue Klasse</span>
            </button>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* OPTIONAL SUBTLE GUIDE BUTTON (CAN BE TOGGLED IN SETTINGS) */}
          {showGuideButtonInHeader && (
            <button
              onClick={onOpenInteractiveGuide}
              data-tour="header-guide-btn"
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              }}
              title="Interaktive Demo & Funktions-Guide (Taste ?)"
            >
              <HelpCircle className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
              <span className="hidden xl:inline">Guide</span>
            </button>
          )}

          <div
            data-tour="header-sync-status"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
              color:
                syncStatus === 'syncing'
                  ? 'var(--primary-text)'
                  : syncStatus === 'synced'
                  ? '#059669'
                  : 'var(--text-muted)',
            }}
          >
            {syncStatus === 'syncing' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--primary-500)' }} />
            ) : syncStatus === 'synced' ? (
              <Cloud className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <CloudOff className="w-3.5 h-3.5 opacity-60" />
            )}
            <span className="hidden sm:inline">
              {syncStatus === 'syncing'
                ? 'Speichern...'
                : syncStatus === 'synced'
                ? 'Gespeichert'
                : 'Lokal'}
            </span>
          </div>

          <button
            onClick={onOpenSettings}
            data-tour="header-settings-btn"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Einstellungen"
          >
            <Settings className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
            <span>Einstellungen</span>
          </button>

          <button
            onClick={onOpenVaultInspector}
            data-tour="header-vault-btn"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--primary-soft)',
              color: 'var(--primary-text)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Konto & Schutz"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Konto & Schutz</span>
          </button>

          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90 shadow-sm"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                borderColor: 'rgba(239, 68, 68, 0.25)',
              }}
              title="Admin-Bereich"
            >
              <Shield className="w-3.5 h-3.5 text-red-600" />
              <span>Admin-Bereich</span>
            </button>
          )}

          <button
            onClick={() => setPrivacyBlur((b) => !b)}
            data-tour="header-privacy-blur"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${
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
          >
            {privacyBlur ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{privacyBlur ? 'Namen wieder zeigen' : 'Namen ausblenden'}</span>
          </button>

          <button
            onClick={onLockVault}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Gradus21 sperren"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Abmelden</span>
          </button>
        </div>
      </header>

      {/* SUB-HEADER: CONTEXT & TABS */}
      <div
        className="border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="space-y-1">
          <div
            className="flex flex-wrap items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>{activeDataset.schoolName}</span>
            <ChevronRight className="w-3.5 h-3.5" />
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
            className="text-xl font-bold flex flex-wrap items-center gap-3"
            style={{ color: 'var(--text-primary)' }}
          >
            <span>
              {activeDataset.subjectName} – {activeDataset.className}
            </span>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
            >
              {activeDataset.students.filter((s) => !s.is_archived).length} aktive Schüler
              {archivedCount > 0 ? ` (+${archivedCount} archiviert)` : ''}
            </span>
            {calculationReport?.class_average_percent != null && (
              <span
                className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
              >
                Live-Klassenschnitt ({activeTerm.toUpperCase()}):{' '}
                {calculationReport.class_average_percent}% (Ø{' '}
                {calculationReport.class_display_grade})
              </span>
            )}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {activeDataset.description}
          </p>
        </div>

        {/* 4 Specialized Workspace Mode Tabs */}
        <div
          data-tour="header-mode-tabs"
          className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl border"
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
                className={`px-3.5 py-2 rounded-xl text-left transition-all flex items-center gap-2.5 ${
                  active ? 'shadow-sm' : 'opacity-75 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: active ? 'var(--primary-500)' : 'transparent',
                  color: active ? '#FFFFFF' : 'var(--text-primary)',
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="leading-tight">
                  <div className="text-xs font-bold">{tab.label}</div>
                  <div className={`text-[10px] ${active ? 'text-teal-50/90' : 'opacity-70'}`}>
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
