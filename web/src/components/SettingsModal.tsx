import React, { useState, useEffect } from 'react';
import { getServerUrl, setServerUrl } from '../utils/apiConfig';
import {
  CellDisplayFormat,
  GradingScaleId,
  ThemePreset,
  ThemeMode,
  UserSyncSettings,
  WeightingMode,
  getEffectiveThemeMode,
  resolveIsDarkMode,
} from '../data/demoClasses';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Compass,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Folder,
  GraduationCap,
  HardDrive,
  HelpCircle,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
  Copy,
  Check,
  Fingerprint,
} from 'lucide-react';
import { isFileSystemAccessSupported } from '../utils/localBackupStorage';
import { useLegalConfig, getDisplayDomain } from '../utils/legalConfig';
import { checkForAppUpdate, installAppUpdate, UpdateInfo } from '../utils/updater';
import { APP_VERSION } from '../version';
import { isTauri, isDesktopTauri, isAppleTouchDevice, isLinux, getStorageLocationInfo } from '../utils/platform';
import { ActiveVaultSession } from './vault/vaultTypes';
import { VaultLockAndAuthModal } from './VaultLockAndAuthModal';
import {
  checkNativeBiometricAvailability,
  hasNativeBiometricEnrollment,
  enableNativeBiometricLock,
  disableNativeBiometricLock,
  NativeBiometricStatus,
} from '../utils/nativeBiometric';
import {
  getLinuxAuthMethod,
  setLinuxAuthMethod,
  isLinuxKeyringSupported,
  hasLinuxKeyringEnrollment,
  enableLinuxKeyringUnlock,
  disableLinuxKeyringUnlock,
  LinuxAuthMethod,
} from '../utils/linuxAuth';

export type SettingsSection =
  | 'favorites'
  | 'visibility'
  | 'appearance'
  | 'account_security'
  | 'storage'
  | 'help';

interface SettingsModalProps {
  settings: UserSyncSettings;
  onUpdateSettings: (updater: (prev: UserSyncSettings) => UserSyncSettings) => void;
  onClose: () => void;
  initialSection?: SettingsSection;
  onOpenInteractiveGuide?: () => void;
  onOpenSchoolGuide?: () => void;
  onToggleCloudSync?: (enabled: boolean) => void;
  onPurgeCloudData?: () => void;
  onExportEncryptedBackup?: () => void;
  onImportEncryptedBackup?: (file: File) => void;
  connectedBackupDirName?: string | null;
  lastLocalBackupTime?: string | null;
  onConnectBackupDirectory?: () => void;
  onDisconnectBackupDirectory?: () => void;
  isPersistentStorage?: boolean;
  session?: ActiveVaultSession | null;
  sampleEnvelope?: {
    entityId: string;
    plaintext: string;
    ciphertext: string;
    decryptedVerify: string;
  } | null;
  onUnlockSuccess?: (newSession: ActiveVaultSession) => void;
  onLockVault?: () => void;
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
  initialSection = 'favorites',
  onOpenInteractiveGuide,
  onOpenSchoolGuide,
  onToggleCloudSync,
  onPurgeCloudData,
  onExportEncryptedBackup,
  onImportEncryptedBackup,
  connectedBackupDirName,
  lastLocalBackupTime,
  onConnectBackupDirectory,
  onDisconnectBackupDirectory,
  isPersistentStorage,
  session,
  sampleEnvelope,
  onUnlockSuccess,
  onLockVault,
}) => {
  const legalConfig = useLegalConfig();
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);

  const [nativeBioStatus, setNativeBioStatus] = useState<NativeBiometricStatus>({
    available: false,
    biometryType: 'none',
  });
  const [linuxMethod, setLinuxMethod] = useState<LinuxAuthMethod>(() =>
    getLinuxAuthMethod(settings.cloudSyncEnabled)
  );
  const [hasLinuxKeyring, setHasLinuxKeyring] = useState<boolean>(() =>
    hasLinuxKeyringEnrollment(session?.userId || session?.email)
  );
  const [isEnrollingLinuxKeyring, setIsEnrollingLinuxKeyring] = useState<boolean>(false);

  const handleEnableLinuxKeyring = async () => {
    if (!session?.dekB64 || !session.userId || !session.email) {
      alert('Hauptschlüssel (DEK) nicht im Speicher. Bitte melde dich erneut mit deinem Master-Passwort an.');
      return;
    }
    try {
      setIsEnrollingLinuxKeyring(true);
      await enableLinuxKeyringUnlock(session.userId, session.email, session.dekB64);
      setHasLinuxKeyring(true);
      setLinuxMethod('keyring');
      triggerSaved();
      alert('Linux-Schlüsselbund erfolgreich verknüpft! Du kannst Gradus21 ab sofort per Fingerabdruck / Keyring entsperren.');
    } catch (err: any) {
      console.warn('Linux Keyring enrollment failed:', err);
      alert('Aktivierung fehlgeschlagen: ' + (err?.message || String(err)));
    } finally {
      setIsEnrollingLinuxKeyring(false);
    }
  };

  const handleDisableLinuxKeyring = async () => {
    if (window.confirm('Möchtest du die Entsperrung über den Linux-Schlüsselbund wirklich deaktivieren?')) {
      if (session?.userId) {
        await disableLinuxKeyringUnlock(session.userId);
      }
      setHasLinuxKeyring(false);
      setLinuxMethod('password');
      triggerSaved();
    }
  };

  const handleSelectLinuxMethod = (m: LinuxAuthMethod) => {
    setLinuxMethod(m);
    setLinuxAuthMethod(m);
    triggerSaved();
  };
  const [hasNativeBio, setHasNativeBio] = useState<boolean>(false);
  const [isEnrollingBio, setIsEnrollingBio] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    checkNativeBiometricAvailability().then((status) => {
      if (!isMounted) return;
      setNativeBioStatus(status);
      const target = session?.userId || session?.email;
      setHasNativeBio(hasNativeBiometricEnrollment(target));
    });
    return () => {
      isMounted = false;
    };
  }, [session?.userId, session?.email]);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);
  const [showAvvConfirmation, setShowAvvConfirmation] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const storageInfo = getStorageLocationInfo();
  const [templatePendingDelete, setTemplatePendingDelete] = useState<{ id: string; name: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [manualUpdateResult, setManualUpdateResult] = useState<UpdateInfo | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [manualProgressPct, setManualProgressPct] = useState(0);
  const [manualInstallDone, setManualInstallDone] = useState(false);

  const handleManualCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setManualInstallDone(false);
    try {
      const result = await checkForAppUpdate();
      setManualUpdateResult(result);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleManualInstallUpdate = async () => {
    setIsInstallingUpdate(true);
    try {
      const ok = await installAppUpdate((pct) => setManualProgressPct(pct));
      if (ok) setManualInstallDone(true);
    } catch (err) {
      setManualUpdateResult({
        available: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsInstallingUpdate(false);
    }
  };
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const currentMode = getEffectiveThemeMode(settings);
  const [serverUrl, setServerUrlState] = useState(() => getServerUrl());

  const triggerSaved = () => {
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2000);
  };

  const handleEnableBiometric = async () => {
    if (!session?.dekB64 || !session.userId || !session.email) {
      alert('Hauptschlüssel (DEK) nicht im Speicher. Bitte melde dich erneut mit deinem Master-Passwort an.');
      return;
    }
    try {
      setIsEnrollingBio(true);
      await enableNativeBiometricLock(session.userId, session.email, session.dekB64);
      setHasNativeBio(true);
      triggerSaved();
      alert('Fingerabdruck / Face ID erfolgreich aktiviert! Du kannst Gradus21 ab sofort per Biometrie entsperren.');
    } catch (err: any) {
      console.warn('Biometric enrollment failed:', err);
      alert('Aktivierung fehlgeschlagen: ' + (err?.message || String(err)));
    } finally {
      setIsEnrollingBio(false);
    }
  };

  const handleDisableBiometric = () => {
    if (window.confirm('Möchtest du die biometrische Entsperrung auf diesem Gerät wirklich deaktivieren?')) {
      if (session?.userId) {
        disableNativeBiometricLock(session.userId);
      }
      setHasNativeBio(false);
      triggerSaved();
    }
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="max-w-3xl w-full max-h-[92dvh] sm:max-h-[90vh] rounded-t-[28px] sm:rounded-2xl border-t sm:border p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 flex flex-col pb-safe sm:pb-6 sheet-mobile-enter"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Mobile Sheet Drag Indicator */}
        <div className="sm:hidden sheet-drag-handle" />

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
                {settings.cloudSyncEnabled ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <Cloud className="w-3 h-3" />
                    <span>Cloud-Sync aktiv</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    <span>Nur lokaler Speicher</span>
                  </span>
                )}
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
              className="w-10 h-10 rounded-xl border transition hover:opacity-80 inline-flex items-center justify-center shrink-0"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div
          className="flex items-center gap-1 sm:gap-1.5 p-1 rounded-2xl border text-xs font-semibold shrink-0 max-w-full overflow-x-auto"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          <button
            onClick={() => setActiveSection('favorites')}
            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-2.5 rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 transition text-center min-h-[36px] shrink-0 sm:shrink ${
              activeSection === 'favorites' ? 'text-white shadow-sm font-bold' : 'hover:opacity-85'
            }`}
            style={{
              backgroundColor: activeSection === 'favorites' ? 'var(--primary-500)' : 'transparent',
              color: activeSection === 'favorites' ? '#fff' : 'var(--text-primary)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Vorschläge</span>
          </button>
          <button
            onClick={() => setActiveSection('visibility')}
            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-2.5 rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 transition text-center min-h-[36px] shrink-0 sm:shrink ${
              activeSection === 'visibility' ? 'text-white shadow-sm font-bold' : 'hover:opacity-85'
            }`}
            style={{
              backgroundColor:
                activeSection === 'visibility' ? 'var(--primary-500)' : 'transparent',
              color: activeSection === 'visibility' ? '#fff' : 'var(--text-primary)',
            }}
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Ansicht</span>
          </button>
          <button
            onClick={() => setActiveSection('appearance')}
            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-2.5 rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 transition text-center min-h-[36px] shrink-0 sm:shrink ${
              activeSection === 'appearance' ? 'text-white shadow-sm font-bold' : 'hover:opacity-85'
            }`}
            style={{
              backgroundColor:
                activeSection === 'appearance' ? 'var(--primary-500)' : 'transparent',
              color: activeSection === 'appearance' ? '#fff' : 'var(--text-primary)',
            }}
          >
            <Palette className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Farbwelt</span>
          </button>
          <button
            onClick={() => setActiveSection('account_security')}
            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-2.5 rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 transition text-center min-h-[36px] shrink-0 sm:shrink ${
              activeSection === 'account_security' ? 'text-white shadow-sm font-bold' : 'hover:opacity-85'
            }`}
            style={{
              backgroundColor:
                activeSection === 'account_security' ? 'var(--primary-500)' : 'transparent',
              color: activeSection === 'account_security' ? '#fff' : 'var(--text-primary)',
            }}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate hidden sm:inline">Konto &amp; Schutz</span>
            <span className="sm:hidden">Konto</span>
          </button>
          <button
            onClick={() => setActiveSection('storage')}
            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-2.5 rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 transition text-center min-h-[36px] shrink-0 sm:shrink ${
              activeSection === 'storage' ? 'text-white shadow-sm font-bold' : 'hover:opacity-85'
            }`}
            style={{
              backgroundColor:
                activeSection === 'storage' ? 'var(--primary-500)' : 'transparent',
              color: activeSection === 'storage' ? '#fff' : 'var(--text-primary)',
            }}
          >
            <HardDrive className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate hidden sm:inline">Speicher &amp; Backups</span>
            <span className="sm:hidden">Speicher</span>
          </button>
          <button
            onClick={() => setActiveSection('help')}
            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-2.5 rounded-xl flex items-center justify-center gap-1 sm:gap-1.5 transition text-center min-h-[36px] shrink-0 sm:shrink ${
              activeSection === 'help' ? 'text-white shadow-sm font-bold' : 'hover:opacity-85'
            }`}
            style={{
              backgroundColor:
                activeSection === 'help' ? 'var(--primary-500)' : 'transparent',
              color: activeSection === 'help' ? '#fff' : 'var(--text-primary)',
            }}
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate hidden sm:inline">Hilfe &amp; Guide</span>
            <span className="sm:hidden">Hilfe</span>
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
                    const isFav = settings.favoriteWeightingPresets?.includes(preset.id) ?? false;
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
                    Deine eigenen gespeicherten Fach-Vorlagen ({settings.customWeightingTemplates?.length ?? 0})
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Du kannst im Gewichtungs-Baukasten jede beliebige Kategorien-Struktur als eigene Vorlage speichern (z. B. für Sport, Kunst oder Oberstufe).
                  </p>
                </div>

                {(settings.customWeightingTemplates?.length ?? 0) === 0 ? (
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
                          onClick={() => setTemplatePendingDelete({ id: tpl.id, name: tpl.name })}
                          className="p-1.5 rounded-lg border text-rose-600 hover:bg-rose-500/10 transition"
                          style={{ borderColor: 'var(--border-subtle)' }}
                          title="Vorlage löschen..."
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
                      title: '„Was-wäre-wenn“-Zielnoten-Rechner in der Schüler:innen-360°-Akte sofort öffnen',
                      desc: 'Wenn deaktiviert, bleibt der Simulator eingeklappt und öffnet sich erst auf Klick im Elterngespräch.',
                    },
                    {
                      key: 'showCurveEditorInSpeedGrading',
                      title: 'Interaktiven Notenschlüssel-Editor beim Speed-Grading sofort einblenden',
                      desc: 'Wenn deaktiviert, wird rechts nur der Live-Notenspiegel gezeigt und die Schieberegler öffnen sich erst bei Bedarf.',
                    },
                    {
                      key: 'showGuideButtonInHeader',
                      title: 'Schnellstart-Icon für den interaktiven Funktions-Guide in der Kopfleiste anzeigen',
                      desc: 'Wenn deaktiviert, bleibt die Kopfleiste maximal aufgeräumt. Du kannst den Guide jederzeit hier in den Einstellungen oder per Taste ? starten.',
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
                className="p-4 rounded-2xl border space-y-3"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                      Darstellungsmodus
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Wähle zwischen hellem Tageslicht-Modus, dunklem Nacht-Modus oder automatischer Anpassung an dein Betriebssystem.
                    </p>
                  </div>
                  {currentMode === 'system' && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                      System aktiv: {systemIsDark ? '🌙 Dunkel' : '☀️ Hell'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      {
                        id: 'system' as const,
                        label: 'System (Automatisch)',
                        icon: Monitor,
                        desc: 'Folgt automatisch den Hell-/Dunkel-Einstellungen deines Geräts',
                      },
                      {
                        id: 'light' as const,
                        label: 'Hell (Tageslicht)',
                        icon: Sun,
                        desc: 'Klarer, kontrastreicher heller Modus für Schule & Tageslicht',
                      },
                      {
                        id: 'dark' as const,
                        label: 'Dunkel (Nachtmodus)',
                        icon: Moon,
                        desc: 'Blendfreier dunkler Modus für die Korrektur am Abend',
                      },
                    ]
                  ).map((modeOpt) => {
                    const isSelected = currentMode === modeOpt.id;
                    const Icon = modeOpt.icon;
                    return (
                      <button
                        key={modeOpt.id}
                        type="button"
                        onClick={() => {
                          const isDark = resolveIsDarkMode(modeOpt.id);
                          onUpdateSettings((s) => ({
                            ...s,
                            themeMode: modeOpt.id,
                            darkMode: isDark,
                          }));
                          triggerSaved();
                        }}
                        className={`p-3.5 rounded-xl border text-left flex flex-col justify-between gap-3 transition ${
                          isSelected ? 'ring-2 ring-teal-500 shadow-sm' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: isSelected ? 'var(--primary-soft)' : 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{
                              backgroundColor: isSelected ? 'var(--primary-500)' : 'var(--bg-subtle)',
                              color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                            }}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          {isSelected && (
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white"
                              style={{ backgroundColor: 'var(--primary-500)' }}
                            >
                              Aktiv
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                            {modeOpt.label}
                          </div>
                          <div className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                            {modeOpt.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 4: KONTO & SCHUTZ (IDENTITÄT, HARDWARE-ENTSICHERUNG & KEYS)
             ================================================================= */}
          {activeSection === 'account_security' && (
            <div className="space-y-5">
              {session ? (
                <VaultLockAndAuthModal
                  isLockedScreen={false}
                  inlineContentOnly={true}
                  session={session}
                  sampleEnvelope={sampleEnvelope ?? null}
                  onUnlockSuccess={onUnlockSuccess}
                  onLockVault={onLockVault ?? onClose}
                  cloudSyncEnabled={settings.cloudSyncEnabled ?? false}
                  onToggleCloudSync={onToggleCloudSync}
                  onPurgeCloudData={onPurgeCloudData}
                  onImportEncryptedBackup={onImportEncryptedBackup}
                />
              ) : (
                <div
                  className="p-6 rounded-2xl border text-center space-y-3"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  <KeyRound className="w-8 h-8 mx-auto text-amber-500" />
                  <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Kein aktiver Tresor geöffnet
                  </h4>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Bitte entsperre oder registriere einen Noten-Tresor, um Passkeys, Notfallblätter und 2FA zu verwalten.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* =================================================================
              SECTION 5: SPEICHER & BACKUPS (CLOUD-SYNC OPT-IN, DATEI-BACKUPS & LOKALER PFAD)
             ================================================================= */}
          {activeSection === 'storage' && (
            <div className="space-y-5">
              {/* Card 1: Cloud-Synchronisation (Opt-In) */}
              <div
                className="p-5 rounded-2xl border space-y-4"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Cloud className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
                      <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                        1. E2EE Cloud-Synchronisation (Opt-In)
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          settings.cloudSyncEnabled
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {settings.cloudSyncEnabled ? 'Aktiviert' : 'Deaktiviert (Standard)'}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      Gemäß DSGVO und Grundsatz der Datensparsamkeit verbleiben alle Noten und Schülerdaten standardmäßig <strong>ausschließlich lokal verschlüsselt auf diesem Gerät</strong> ({storageInfo.isNative ? (storageInfo.isMobile ? 'in der App' : 'in der Desktop-App') : 'im Browser'}). 
                      Wenn du Cloud-Sync aktivierst, werden deine Datensätze mit modernem <strong>AES-256-GCM Zero-Knowledge</strong> verschlüsselt auf dem Server gesichert, um geräteübergreifendes Arbeiten zu ermöglichen.
                    </p>
                    <div className="pt-1 flex flex-wrap items-center gap-3">
                      {onOpenSchoolGuide && (
                        <button
                          type="button"
                          onClick={onOpenSchoolGuide}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline"
                        >
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span>Schul-Datenschutz Leitfaden</span>
                        </button>
                      )}
                      {onOpenSchoolGuide && <span className="text-slate-400">•</span>}
                      <a
                        href={legalConfig.avv_url || 'https://gradus21.de/avv.html'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline"
                        title="AVV-Mustervertrag online öffnen"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>AVV-Mustervertrag ({getDisplayDomain(legalConfig.avv_url)})</span>
                        <ExternalLink className="w-3 h-3 opacity-70" />
                      </a>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.cloudSyncEnabled)}
                      onChange={(e) => {
                        const nextVal = e.target.checked;
                        if (nextVal) {
                          // Activating -> prompt AVV confirmation question first!
                          setShowAvvConfirmation(true);
                        } else {
                          // Deactivating
                          if (onToggleCloudSync) {
                            onToggleCloudSync(false);
                          } else {
                            onUpdateSettings((s) => ({ ...s, cloudSyncEnabled: false }));
                          }
                          triggerSaved();
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {settings.cloudSyncEnabled && onPurgeCloudData && (
                  <div className="pt-3 border-t flex items-center justify-between gap-3 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Möchtest du alle auf dem Server liegenden Envelopes unwiderruflich löschen?
                    </span>
                    <button
                      type="button"
                      onClick={onPurgeCloudData}
                      className="px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 font-bold hover:bg-rose-500/20 transition flex items-center gap-1.5 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Cloud-Kopie jetzt löschen</span>
                    </button>
                  </div>
                )}

                {/* Server-Adresse für Cloud-Synchronisation */}
                <div className="pt-3 border-t text-xs space-y-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <label className="block font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Backend Server-Adresse:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={serverUrl}
                      onChange={(e) => setServerUrlState(e.target.value)}
                      onBlur={() => {
                        const saved = setServerUrl(serverUrl);
                        setServerUrlState(saved);
                        triggerSaved();
                      }}
                      placeholder="https://gradus21.app"
                      className="flex-1 px-3 py-1.5 rounded-xl border text-xs font-mono bg-transparent"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const def = setServerUrl('');
                        setServerUrlState(def);
                        triggerSaved();
                      }}
                      className="px-2.5 py-1.5 rounded-xl border text-xs text-zinc-500 hover:text-zinc-700"
                    >
                      Standard
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Standard: https://gradus21.app. Du kannst hier jederzeit einen eigenen Schulserver hinterlegen.
                  </p>
                </div>

                {/* Lokaler Speicherort auf diesem Gerät */}
                <div className="pt-3 border-t text-xs space-y-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                      <HardDrive className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Lokaler Speicherort ({storageInfo.locationLabel}):</span>
                    </span>
                    {storageInfo.canCopyPath && typeof navigator !== 'undefined' && navigator.clipboard && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(storageInfo.path);
                          setCopiedPath(true);
                          setTimeout(() => setCopiedPath(false), 2000);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                        title="Pfad in die Zwischenablage kopieren"
                      >
                        {copiedPath ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Kopiert!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Pfad kopieren</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="font-mono text-[11px] px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 break-all select-all font-semibold text-teal-800 dark:text-teal-300">
                    {storageInfo.path}
                  </div>
                  <p className="text-[11px] opacity-75">
                    {storageInfo.details}
                  </p>
                </div>
              </div>

              {/* Card 2: Lokale verschlüsselte Datei-Sicherung (Schul-Netzlaufwerk / USB) */}
              <div
                className="p-5 rounded-2xl border space-y-4"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
                    <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                      2. Verschlüsseltes Datei-Backup (für Schul-Netzlaufwerk & USB)
                    </h4>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Sichere deinen Noten-Tresor als eigenständige Datei (<code>.gradus21</code>). Da die Datei vollständig mit deinem Master-Passwort per <strong>AES-256-GCM verschlüsselt</strong> ist, kann sie völlig unbedenklich auf dem <strong>gemeinsamen Netzlaufwerk der Schule (SMB/Share)</strong>, der Schul-Nextcloud oder einem Dienst-USB-Stick abgelegt werden – niemand ohne dein Passwort kann mitlesen.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {onExportEncryptedBackup && (
                    <button
                      type="button"
                      onClick={onExportEncryptedBackup}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition hover:opacity-95 shadow-sm"
                      style={{ backgroundColor: 'var(--primary-500)' }}
                    >
                      <Download className="w-4 h-4" />
                      <span>Tresor-Backup herunterladen (.gradus21)</span>
                    </button>
                  )}

                  {onImportEncryptedBackup && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".gradus21,.json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            onImportEncryptedBackup(file);
                            e.target.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Upload className="w-4 h-4" />
                        <span>Backup-Datei wiederherstellen</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Card 3: Automatischer lokaler Backup-Ordner (File System Access API) */}
              <div
                className="p-5 rounded-2xl border space-y-4"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4" style={{ color: 'var(--primary-500)' }} />
                    <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                      3. Automatischer lokaler Backup-Ordner (File System API)
                    </h4>
                    {connectedBackupDirName && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Aktiv verknüpft
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Verknüpfe einen Zielordner auf deinem PC oder ein gemountetes Schul-Netzlaufwerk. Gradus21 speichert bei Notenänderungen automatisch im Hintergrund eine rotierende Sicherung dorthin – ganz ohne manuelle Download-Klicks.
                  </p>
                </div>

                {isFileSystemAccessSupported() ? (
                  <div className="p-3.5 rounded-xl border space-y-3" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                    {connectedBackupDirName ? (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                            <FileCheck className="w-4 h-4 text-emerald-600" />
                            <span>Verknüpfter Ordner: {connectedBackupDirName}</span>
                          </div>
                          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Letzte Sicherung: {lastLocalBackupTime ? `Heute um ${lastLocalBackupTime} Uhr` : 'Wird beim nächsten Speichern geschrieben'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={onConnectBackupDirectory}
                            className="px-3 py-1.5 rounded-xl border text-xs font-semibold hover:opacity-80 transition"
                            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                          >
                            Ordner ändern
                          </button>
                          <button
                            type="button"
                            onClick={onDisconnectBackupDirectory}
                            className="px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-600 text-xs font-semibold hover:bg-rose-500/10 transition"
                          >
                            Trennen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          Noch kein lokaler Backup-Ordner verknüpft.
                        </span>
                        <button
                          type="button"
                          onClick={onConnectBackupDirectory}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition hover:opacity-90 shadow-sm"
                          style={{ backgroundColor: 'var(--primary-500)' }}
                        >
                          <Folder className="w-3.5 h-3.5" />
                          <span>Backup-Ordner auswählen...</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Die automatische Ordner-Verknüpfung erfordert einen Chromium-basierten Browser (Google Chrome, Microsoft Edge, Brave). In Firefox oder Safari kannst du Backups manuell als Datei (oben) herunterladen.</span>
                  </div>
                )}
              </div>

              {/* Card 4: Persistenter Browser-Speicher */}
              <div
                className="p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-teal-600" />
                  <div>
                    <span className="font-bold block" style={{ color: 'var(--text-primary)' }}>
                      Dauerhafter Browser-Speicher (Storage Persistence)
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {isPersistentStorage
                        ? 'Vom Browser garantiert: Gespeicherte Klassen und Noten werden auch bei knappem Festplattenspeicher niemals automatisch bereinigt.'
                        : 'Standardspeicher aktiv. Browser behält Daten im localStorage.'}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300">
                  {isPersistentStorage ? 'Garantiert persistent' : 'Aktiv'}
                </span>
              </div>
            </div>
          )}

          {/* =================================================================
              SECTION 5: HILFE & INTERAKTIVER GUIDE
             ================================================================= */}
          {activeSection === 'help' && (
            <div className="space-y-4">
              {/* Desktop App & Auto-Updater Status */}
              <div
                className="p-5 rounded-2xl border space-y-3.5"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
                    >
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {isTauri()
                            ? (isAppleTouchDevice()
                                ? 'Gradus21 iOS App'
                                : 'Gradus21 Desktop Client')
                            : 'Gradus21 Web-Client'}
                        </h4>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                          v{APP_VERSION}
                        </span>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {isTauri()
                          ? (isAppleTouchDevice()
                              ? 'Zero-Knowledge E2EE Notenverwaltung (Native iOS/iPadOS App)'
                              : 'Zero-Knowledge E2EE Notenverwaltung (Native Desktop-Applikation)')
                          : 'Web-Client / Browser-Version'}
                      </p>
                    </div>
                  </div>

                  {isDesktopTauri() ? (
                    <button
                      onClick={handleManualCheckUpdate}
                      disabled={isCheckingUpdate || isInstallingUpdate}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-1.5 transition hover:opacity-95 disabled:opacity-50 shrink-0"
                      style={{ backgroundColor: 'var(--primary-500)' }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                      <span>{isCheckingUpdate ? 'Prüfe...' : 'Nach Updates suchen'}</span>
                    </button>
                  ) : (
                    <a
                      href="https://github.com/gradus21/gradus21/releases/latest"
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 hover:opacity-90 shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span>Releases ansehen</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>
                  )}
                </div>

                {/* Update Check Results & Actions */}
                {manualUpdateResult && (
                  <div
                    className="p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                  >
                    {manualUpdateResult.available ? (
                      <>
                        <div className="flex items-center gap-2.5">
                          <Download className="w-4 h-4 text-indigo-500 shrink-0" />
                          <div>
                            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                              Neue Version verfügbar: v{manualUpdateResult.version}
                            </span>
                            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                              Installierte Version: v{manualUpdateResult.currentVersion || APP_VERSION}
                            </div>
                          </div>
                        </div>

                        {manualInstallDone ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Installiert! Bitte App neu starten.</span>
                          </div>
                        ) : (
                          <button
                            onClick={handleManualInstallUpdate}
                            disabled={isInstallingUpdate}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition hover:opacity-95 inline-flex items-center gap-1.5 disabled:opacity-60"
                            style={{ backgroundColor: 'var(--primary-500)' }}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{isInstallingUpdate ? `Lade... ${manualProgressPct}%` : 'Jetzt aktualisieren'}</span>
                          </button>
                        )}
                      </>
                    ) : manualUpdateResult.error ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Update-Prüfung konnte nicht abgeschlossen werden</span>
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {isLinux() ? (
                            <span>
                              Hinweis für Linux: In-App-Updates setzen das AppImage voraus. Bei einer .deb-Installation lade bitte das neue .deb direkt aus dem GitHub-Release herunter.
                            </span>
                          ) : (
                            <span>Details: {manualUpdateResult.error}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Gradus21 ist auf dem neuesten Stand (v{APP_VERSION}).</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className="p-5 rounded-2xl border space-y-4"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
                    >
                      <Sparkles className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                        Interaktive Demo & Didaktischer Guide
                      </h4>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Interaktive Schritt-für-Schritt-Touren direkt in der echten Oberfläche von Gradus21.
                      </p>
                    </div>
                  </div>

                  {onOpenInteractiveGuide && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenInteractiveGuide();
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-1.5 transition hover:opacity-95 shrink-0"
                      style={{ backgroundColor: 'var(--primary-500)' }}
                    >
                      <Compass className="w-4 h-4" />
                      <span>Kapitelauswahl öffnen</span>
                    </button>
                  )}
                </div>

                <div
                  className="p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-bold text-slate-800 dark:text-slate-100">
                      ?
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Schnelltaste: Drücke jederzeit <strong style={{ color: 'var(--text-primary)' }}>?</strong> (oder F1) im Arbeitsbereich, um den Guide direkt aufzurufen.
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="block font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Verfügbare Kapitel zum Durchspielen:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>1. Großer Rundgang</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Start mit Klassen-Import oder Beispieldaten &amp; alle 4 Modi im Überblick (~3 Min.)</div>
                    </div>
                    <div className="p-3 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>2. Erste Klasse einrichten</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Klassen-Assistent, .xlsx Drag & Drop, Vorlagen &amp; Demoklasse (~2 Min.)</div>
                    </div>
                    <div className="p-3 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>3. Eigenes Notenmodell</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Gewichtungs-Baukasten, Notenschlüssel & G/M/E (~2 Min.)</div>
                    </div>
                    <div className="p-3 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>4. Speed-Grading</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Schnelleingabe per Ziffernblock, K-Taste & Notenspiegel (~2 Min.)</div>
                    </div>
                    <div className="p-3 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>5. 360°-Akte & Simulator</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Stärken/Schwächen & Was-wäre-wenn Zielrechner (~2 Min.)</div>
                    </div>
                    <div className="p-3 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>6. Beamer-Schutz & E2EE</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Namen ausblenden (Alt+P), Offline-First & Zero-Knowledge (~1.5 Min.)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AVV Vorhanden Bestätigungs-Modal */}
      {showAvvConfirmation && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="max-w-md w-full rounded-2xl border p-6 shadow-2xl space-y-4 animate-scale-up"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                <FileCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Liegt für deine Schule bereits ein AVV vor?
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Gemäß Art. 28 DSGVO und den Schuldatenschutzgesetzen ist für die verschlüsselte Cloud-Synchronisation
                  von Noten- und Schülerdaten ein <strong>Auftragsverarbeitungsvertrag (AVV)</strong> zwischen deiner Schule
                  und Gradus21 erforderlich.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
              Falls deine Schulleitung oder der Datenschutzbeauftragte (bDSB) noch nicht zugestimmt hat, leiten wir dich
              gerne direkt zum vorgefertigten Mustervertrag weiter.
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAvvConfirmation(false)}
                className="px-3.5 py-2 rounded-xl border text-xs font-semibold hover:opacity-80 transition"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                Abbrechen
              </button>

              <a
                href={legalConfig.avv_url || 'https://gradus21.de/avv.html'}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-500/20 transition flex items-center justify-center gap-1.5"
                title={`AVV-Mustervertrag online auf ${getDisplayDomain(legalConfig.avv_url)} öffnen`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>AVV-Muster ({getDisplayDomain(legalConfig.avv_url)})</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>

              <button
                type="button"
                onClick={() => {
                  setShowAvvConfirmation(false);
                  if (onOpenSchoolGuide) {
                    onOpenSchoolGuide();
                  }
                }}
                className="px-3.5 py-2 rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-500/20 transition flex items-center justify-center gap-1.5"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Schul-Leitfaden</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAvvConfirmation(false);
                  if (onToggleCloudSync) {
                    onToggleCloudSync(true);
                  } else {
                    onUpdateSettings((s) => ({ ...s, cloudSyncEnabled: true }));
                  }
                  triggerSaved();
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition hover:opacity-95 flex items-center justify-center gap-1.5"
                style={{ backgroundColor: 'var(--primary-500)' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ja, AVV liegt vor / genehmigt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Confirmation for Custom Template Deletion */}
      {templatePendingDelete && (
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
                    Vorlage löschen?
                  </h4>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {templatePendingDelete.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTemplatePendingDelete(null)}
                className="w-8 h-8 rounded-lg opacity-50 hover:opacity-100 transition inline-flex items-center justify-center shrink-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Möchtest du die eigene Gewichtungsvorlage <strong>„{templatePendingDelete.name}“</strong> wirklich aus deinen Einstellungen entfernen?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTemplatePendingDelete(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:bg-black/5 dark:hover:bg-white/5"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCustomTemplate(templatePendingDelete.id);
                  setTemplatePendingDelete(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vorlage löschen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
