import React from 'react';
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
} from 'lucide-react';

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
  if (!isOpen) return null;

  const isCloudSynced = syncStatus === 'synced';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border shadow-2xl p-6 sm:p-7 space-y-5 overflow-hidden relative"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          title="Schließen"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isCloudSynced
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-amber-500/10 text-amber-600'
            }`}
          >
            {isCloudSynced ? (
              <Cloud className="w-6 h-6 stroke-[2.5]" />
            ) : (
              <HardDrive className="w-6 h-6 stroke-[2.5]" />
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
                {isCloudSynced ? 'E2EE Cloud aktiv' : 'Speicherampel: Nur lokal'}
              </span>
              <span className="text-[10px] font-semibold opacity-60">
                § 241 Abs. 2 BGB Aufklärung
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight mt-1">
              {isCloudSynced
                ? 'Ihr Noten-Tresor ist in der Cloud gesichert'
                : 'Wichtiger Hinweis zu Ihrem Noten-Speicherort'}
            </h2>
          </div>
        </div>

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
            <span>Zero-Knowledge & Speicherort-Garantie:</span>
          </div>
          <p className="font-medium text-xs sm:text-[13px] leading-snug">
            „Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre
            Noten niemals diesen Browser. Bitte sichern Sie Ihren Tresor regelmäßig als
            .gradus21-Datei oder aktivieren Sie den verschlüsselten Cloud-Sync.“
          </p>
        </div>

        {/* Detailerklärung: Warum das so ist & Risikoprävention */}
        <div className="space-y-3 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p>
            Um maximale <strong>DSGVO- und Schuldatenschutz-Konformität</strong> zu garantieren,
            werden Schüler:innendaten und Noten standardmäßig auf keinem zentralen Cloud-Server
            gespeichert, sondern ausschließlich verschlüsselt in der lokalen Browser-Datenbank
            (IndexedDB) dieses Endgeräts abgelegt.
          </p>

          <div
            className="p-3.5 rounded-xl border space-y-2 text-[11px]"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
              ⚠️ Typische Gefahrenquellen an Schul- und Arbeitsrechnern:
            </div>
            <ul className="space-y-1.5 list-disc list-inside">
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
                  isPersistentStorage ? 'text-emerald-600' : 'text-amber-500'
                }`}
              />
              <div>
                <span className="block font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Browser-Persistenz
                </span>
                <span className="text-[10px] opacity-75">
                  {isPersistentStorage ? 'Garantiert (Eviction-Schutz)' : 'Standardspeicher'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Aktionen */}
        <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
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
