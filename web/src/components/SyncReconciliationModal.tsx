import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Cloud,
  GitMerge,
  HardDrive,
  RefreshCw,
  X,
} from 'lucide-react';

export type SyncReconciliationStrategy = 'merge' | 'upload_local' | 'download_remote';

interface SyncReconciliationModalProps {
  isOpen: boolean;
  localClassCount: number;
  remoteClassCount: number;
  remoteLastUpdated?: string | null;
  onResolve: (strategy: SyncReconciliationStrategy) => Promise<void> | void;
  onCancel: () => void;
}

export const SyncReconciliationModal: React.FC<SyncReconciliationModalProps> = ({
  isOpen,
  localClassCount,
  remoteClassCount,
  remoteLastUpdated,
  onResolve,
  onCancel,
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<SyncReconciliationStrategy>('merge');
  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsApplying(true);
    try {
      await onResolve(selectedStrategy);
    } finally {
      setIsApplying(false);
    }
  };

  const formattedRemoteTime = remoteLastUpdated
    ? new Date(remoteLastUpdated).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Vor Kurzem';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl border p-6 flex flex-col relative"
        style={{
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderColor: 'var(--border-subtle, #334155)',
          color: 'var(--text-primary, #f8fafc)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={isApplying}
          className="absolute top-4 right-4 p-2 rounded-xl text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50 disabled:opacity-50 transition-colors"
          aria-label="Abbrechen"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-neutral-100">
              Synchronisations-Abgleich erforderlich
            </h3>
            <p className="text-xs text-neutral-400">
              Bestehende Daten auf diesem Gerät und in der Cloud gefunden
            </p>
          </div>
        </div>

        <p className="text-sm text-neutral-300 mb-4 leading-relaxed">
          Auf diesem Gerät existieren bereits Klassen aus einem lokalen oder importierten Tresor.
          Gleichzeitig sind in deinem Cloud-Konto bereits Daten hinterlegt. Bitte wähle, in welche
          Richtung abgeglichen werden soll:
        </p>

        {/* State comparison badges */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-3.5 rounded-xl bg-black/20 border border-neutral-700/50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-neutral-400">Lokales Gerät</div>
              <div className="text-sm font-semibold text-neutral-100">
                {localClassCount} {localClassCount === 1 ? 'Klasse' : 'Klassen'}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-black/20 border border-neutral-700/50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-neutral-400">Cloud-Speicher ({formattedRemoteTime})</div>
              <div className="text-sm font-semibold text-neutral-100">
                {remoteClassCount} {remoteClassCount === 1 ? 'Klasse' : 'Klassen'}
              </div>
            </div>
          </div>
        </div>

        {/* Strategies selection */}
        <div className="space-y-2.5 mb-6">
          {/* Strategy 1: Smart Merge */}
          <button
            type="button"
            onClick={() => setSelectedStrategy('merge')}
            className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3.5 ${
              selectedStrategy === 'merge'
                ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/30'
                : 'bg-black/10 border-neutral-700/40 hover:border-neutral-600'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                selectedStrategy === 'merge'
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              <GitMerge className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-neutral-100">
                  Intelligenter Merge
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300">
                  Empfohlen
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Kombiniert alle Klassen beider Seiten. Bei namensgleichen Klassen gewinnt
                automatisch der neuere Bearbeitungsstand. Es gehen keine Noten verloren.
              </p>
            </div>
          </button>

          {/* Strategy 2: Upload Local */}
          <button
            type="button"
            onClick={() => setSelectedStrategy('upload_local')}
            className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3.5 ${
              selectedStrategy === 'upload_local'
                ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                : 'bg-black/10 border-neutral-700/40 hover:border-neutral-600'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                selectedStrategy === 'upload_local'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-neutral-100">
                Lokalen Stand hochladen (Cloud überschreiben)
              </div>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Lädt den aktuellen Stand dieses Geräts hoch und ersetzt den bisherigen Cloud-Stand
                vollständig.
              </p>
            </div>
          </button>

          {/* Strategy 3: Download Remote */}
          <button
            type="button"
            onClick={() => setSelectedStrategy('download_remote')}
            className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3.5 ${
              selectedStrategy === 'download_remote'
                ? 'bg-purple-500/10 border-purple-500/50 ring-1 ring-purple-500/30'
                : 'bg-black/10 border-neutral-700/40 hover:border-neutral-600'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                selectedStrategy === 'download_remote'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/30'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-neutral-100">
                Cloud-Stand herunterladen (Lokalen Stand überschreiben)
              </div>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Lädt alle Klassen aus der Cloud herunter und verwirft eventuelle lokale Änderungen
                auf diesem Gerät.
              </p>
            </div>
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isApplying}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60 disabled:opacity-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isApplying}
            className="px-5 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
          >
            {isApplying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Synchronisiere...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Ausgewählten Abgleich ausführen
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
