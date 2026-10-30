import React, { useState } from 'react';
import {
  Shield,
  AlertTriangle,
  Download,
  Cloud,
  HardDrive,
  CheckCircle2,
  X,
  FileCheck,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import { getStorageLocationInfo } from '../utils/platform';

export interface StorageNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncStatus: 'syncing' | 'synced' | 'offline_local' | 'local_only';
  isPersistentStorage?: boolean;
  lastLocalBackupTime?: string | null;
  onExportBackup?: () => void;
  onOpenStorageSettings?: () => void;
}

export const StorageNoticeModal: React.FC<StorageNoticeModalProps> = ({
  isOpen,
  onClose,
  syncStatus,
  isPersistentStorage,
  lastLocalBackupTime,
  onExportBackup,
  onOpenStorageSettings,
}) => {
  const [copiedPath, setCopiedPath] = useState(false);

  if (!isOpen) return null;

  const isCloudSynced = syncStatus === 'synced';
  const storageInfo = getStorageLocationInfo();

  const handleCopyPath = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(storageInfo.path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col rounded-t-[28px] sm:rounded-2xl border-t sm:border shadow-2xl overflow-hidden relative pb-safe sm:pb-0 sheet-mobile-enter"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Sheet Drag Indicator */}
        <div className="sm:hidden sheet-drag-handle" />

        {/* Header - Fixed & Always Visible */}
        <div
          className="p-5 sm:p-6 pb-4 border-b flex items-start justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <div
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isCloudSynced
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {isCloudSynced ? (
                <Cloud className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
              ) : (
                <HardDrive className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isCloudSynced
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {isCloudSynced
                    ? 'E2EE Cloud aktiv'
                    : storageInfo.isNative
                    ? `Speicherampel: Nur lokal (${storageInfo.platformName})`
                    : 'Speicherampel: Nur lokal'}
                </span>
                <span className="text-[10px] font-semibold opacity-60">
                  § 241 Abs. 2 BGB Aufklärung
                </span>
              </div>
              <h2 className="text-base sm:text-xl font-extrabold tracking-tight mt-1">
                {isCloudSynced
                  ? 'Ihr Noten-Tresor ist in der Cloud gesichert'
                  : 'Wichtiger Hinweis zu Ihrem Noten-Speicherort'}
              </h2>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition shrink-0"
            title="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs leading-relaxed flex-1">
          {/* Hauptaussage / Kernbelehrung */}
          <div
            className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
              isCloudSynced
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-950 dark:text-emerald-200'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-950 dark:text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <Shield className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Zero-Knowledge &amp; Speicherort-Garantie:</span>
            </div>
            <p className="font-medium text-xs sm:text-[13px] leading-snug">
              {storageInfo.isNative
                ? (storageInfo.isMobile
                    ? `„Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre Noten niemals diese ${storageInfo.platformName}-App. Bitte sichern Sie Ihren Tresor regelmäßig als .gradus21-Datei oder aktivieren Sie den verschlüsselten Cloud-Sync.“`
                    : '„Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre Noten niemals diese Desktop-App bzw. dieses Gerät. Bitte sichern Sie Ihren Tresor regelmäßig als .gradus21-Datei oder aktivieren Sie den verschlüsselten Cloud-Sync.“')
                : '„Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre Noten niemals diesen Browser. Bitte sichern Sie Ihren Tresor regelmäßig als .gradus21-Datei oder aktivieren Sie den verschlüsselten Cloud-Sync.“'}
            </p>
          </div>

          {/* Detailerklärung: Warum das so ist & Risikoprävention */}
          <div className="space-y-3 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <p>
              Um maximale <strong>DSGVO- und Schuldatenschutz-Konformität</strong> zu garantieren,
              werden Schüler:innendaten und Noten standardmäßig auf keinem zentralen Cloud-Server
              gespeichert, sondern ausschließlich verschlüsselt{' '}
              {storageInfo.isNative
                ? (storageInfo.isMobile
                    ? `im geschützten lokalen Datenspeicher dieser App auf Ihrem ${storageInfo.platformName}-Gerät abgelegt.`
                    : 'im lokalen Datenspeicher dieser Desktop-App auf diesem Endgerät abgelegt.')
                : 'in der lokalen Browser-Datenbank (IndexedDB) dieses Endgeräts abgelegt.'}
            </p>

            {/* Lokaler Speicherort-Pfad */}
            <div
              className="p-3 rounded-xl border space-y-1.5"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-primary)' }}>
                  <HardDrive className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>Lokaler Speicherort ({storageInfo.locationLabel}):</span>
                </span>
                {storageInfo.canCopyPath && typeof navigator !== 'undefined' && navigator.clipboard && (
                  <button
                    type="button"
                    onClick={handleCopyPath}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                    title="Pfad in Zwischenablage kopieren"
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
              <div className="font-mono text-[11px] px-2 py-1 rounded bg-black/5 dark:bg-white/5 break-all select-all text-teal-800 dark:text-teal-300 font-semibold">
                {storageInfo.path}
              </div>
              <p className="text-[10px] opacity-75">
                {storageInfo.details}
              </p>
            </div>

            <div
              className="p-3.5 rounded-xl border space-y-2 text-[11px]"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                {storageInfo.isMobile
                  ? `⚠️ Wichtige Hinweise für mobile Geräte (${storageInfo.platformName}):`
                  : '⚠️ Typische Gefahrenquellen an Schul- und Arbeitsrechnern:'}
              </div>
              <ul className="space-y-1.5 list-disc list-inside">
                {storageInfo.isMobile ? (
                  storageInfo.isNative ? (
                    <>
                      <li>
                        <strong>Gerätewechsel, Verlust &amp; Hardwaredefekte:</strong> Ohne aktiven Cloud-Sync oder Backup-Export liegen die Noten nur lokal auf diesem {storageInfo.platformName}-Gerät und können bei Geräteverlust nicht wiederhergestellt werden.
                      </li>
                      <li>
                        <strong>App-Deinstallation:</strong> Wird die Gradus21-App vom Gerät gelöscht, entfernt das mobile Betriebssystem unwiderruflich auch den lokalen Noten-Tresor.
                      </li>
                      <li>
                        <strong>Regelmäßige Sicherung:</strong> Sichern Sie Ihren Tresor regelmäßig über den Button <em>„Backup jetzt sichern“</em> (z.&nbsp;B. in die Dateien-App / auf einen USB-Stick) oder aktivieren Sie den verschlüsselten Cloud-Sync.
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        <strong>Browser-Bereinigung &amp; Speicherbereinigung:</strong> Das Bereinigen von Websitedaten oder längere Nichtbenutzung im mobilen Browser kann ungesicherte lokale Noten löschen.
                      </li>
                      <li>
                        <strong>Gerätewechsel:</strong> Im Browser gespeicherte Noten stehen ohne Export oder Cloud-Sync nur in genau diesem Browser zur Verfügung.
                      </li>
                      <li>
                        <strong>Empfehlung:</strong> Sichern Sie regelmäßig eine <code>.gradus21</code>-Datei oder aktivieren Sie den E2EE Cloud-Sync.
                      </li>
                    </>
                  )
                ) : storageInfo.isNative ? (
                  <>
                    <li>
                      <strong>Gerätewechsel &amp; Hardwaredefekte:</strong> Ohne aktiven Cloud-Sync oder Backup-Import stehen die Noten nur auf genau diesem Rechner zur Verfügung.
                    </li>
                    <li>
                      <strong>Betriebssystem-Neuinstallation &amp; Profil-Löschung:</strong> Vor größeren System-Upgrades oder Benutzerwechseln stets ein verschlüsseltes <code>.gradus21</code>-Backup sichern.
                    </li>
                    <li>
                      <strong>Schul-PCs mit Rollback-Software (z. B. HDGuard, Deep Freeze):</strong> Falls die App auf verwalteten Rechnern ausgeführt wird, wird das Benutzerprofil oft beim Abmelden zurückgesetzt.
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <strong>Schul-PCs mit Rollback-Software (z. B. HDGuard, Deep Freeze):</strong> Beim
                      Neustart oder Abmelden wird das Benutzerprofil oft vollständig zurückgesetzt.
                    </li>
                    <li>
                      <strong>Browser-Bereinigung:</strong> Das Löschen von Cookies &amp; Website-Daten im
                      Browser löscht auch die lokale Notendatenbank.
                    </li>
                    <li>
                      <strong>Gerätewechsel:</strong> Ohne aktiven Cloud-Sync oder Backup-Import stehen die
                      Noten nur auf genau diesem Rechner zur Verfügung.
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Speicherstatus-Übersicht */}
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div
                className="p-2.5 rounded-xl border flex items-center gap-2"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <FileCheck className="w-4 h-4 text-teal-600 shrink-0" />
                <div>
                  <span className="block font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Letztes Datei-Backup
                  </span>
                  <span className="text-[10px] opacity-75">
                    {lastLocalBackupTime ? lastLocalBackupTime : 'Noch keine Datei exportiert'}
                  </span>
                </div>
              </div>

              <div
                className="p-2.5 rounded-xl border flex items-center gap-2"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <CheckCircle2
                  className={`w-4 h-4 shrink-0 ${
                    storageInfo.isNative || isPersistentStorage ? 'text-emerald-600' : 'text-amber-500'
                  }`}
                />
                <div>
                  <span className="block font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {storageInfo.isNative ? 'App-Datenspeicher' : 'Browser-Persistenz'}
                  </span>
                  <span className="text-[10px] opacity-75">
                    {storageInfo.isNative
                      ? 'Dauerhaft gesichert (Nativ)'
                      : isPersistentStorage
                      ? 'Garantiert (Eviction-Schutz)'
                      : 'Standardspeicher'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Fixed & Always Visible */}
        <div
          className="p-4 sm:p-6 pt-3 border-t flex flex-col sm:flex-row gap-2.5 shrink-0 bg-inherit pb-safe sm:pb-6"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {onExportBackup && (
            <button
              onClick={() => {
                onExportBackup();
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Download className="w-4 h-4 text-teal-600" />
              <span>Backup jetzt sichern (.gradus21)</span>
            </button>
          )}

          {!isCloudSynced && onOpenStorageSettings && (
            <button
              onClick={() => {
                onClose();
                onOpenStorageSettings();
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition hover:opacity-90 text-teal-700 dark:text-teal-300 bg-teal-500/10 border-teal-500/30"
            >
              <Cloud className="w-4 h-4" />
              <span>E2EE Cloud-Sync aktivieren</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition hover:opacity-95"
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            <span>Verstanden &amp; Weiter</span>
          </button>
        </div>
      </div>
    </div>
  );
};

