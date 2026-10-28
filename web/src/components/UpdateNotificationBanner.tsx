import React, { useState } from 'react';
import { Download, CheckCircle2, AlertTriangle, RefreshCw, X, ExternalLink } from 'lucide-react';
import { installAppUpdate, UpdateInfo } from '../utils/updater';
import { isLinux } from '../utils/platform';

interface UpdateNotificationBannerProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

export const UpdateNotificationBanner: React.FC<UpdateNotificationBannerProps> = ({
  updateInfo,
  onDismiss,
}) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [isInstalled, setIsInstalled] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleInstall = async () => {
    setIsInstalling(true);
    setErrorMessage(null);
    try {
      const success = await installAppUpdate((pct) => {
        setProgressPercent(pct);
      });
      if (success) {
        setIsInstalled(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div
      className="border-b px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs relative transition-colors duration-200"
      style={{
        backgroundColor: isInstalled ? 'rgba(16, 185, 129, 0.1)' : 'var(--primary-soft)',
        borderColor: isInstalled ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-xs"
          style={{
            backgroundColor: isInstalled ? '#10B981' : 'var(--primary-500)',
            color: '#FFFFFF',
          }}
        >
          {isInstalled ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : isInstalling ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </div>

        <div>
          {isInstalled ? (
            <div>
              <span className="font-bold text-emerald-800 dark:text-emerald-300">
                Update auf Version {updateInfo.version} erfolgreich installiert!
              </span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                Bitte starte Gradus21 neu, um die neue Version zu nutzen.
              </span>
            </div>
          ) : errorMessage ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>In-App-Update konnte nicht direkt angewendet werden</span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {isLinux() ? (
                  <span>
                    Unter Linux (.deb-Installation) sind System-Rechte erforderlich. Bitte lade das .deb aus dem Release herunter oder nutze das AppImage.
                  </span>
                ) : (
                  <span>Fehler: {errorMessage}</span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <span className="font-bold">Neues Gradus21 Update verfügbar: </span>
              <span className="font-mono font-semibold px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">
                v{updateInfo.version}
              </span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                (Aktuell: v{updateInfo.currentVersion || '1.2.4'})
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isInstalling ? (
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span style={{ color: 'var(--text-secondary)' }}>Herunterladen... {progressPercent}%</span>
            <div className="w-24 h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full transition-all duration-200"
                style={{ width: `${progressPercent}%`, backgroundColor: 'var(--primary-500)' }}
              />
            </div>
          </div>
        ) : isInstalled ? (
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition hover:opacity-95"
            style={{ backgroundColor: '#10B981' }}
          >
            Verstanden
          </button>
        ) : errorMessage ? (
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/gradus21/gradus21/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition hover:opacity-90 inline-flex items-center gap-1"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <span>GitHub Releases</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
            <button
              onClick={onDismiss}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
              title="Ausblenden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition hover:opacity-95 inline-flex items-center gap-1.5"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Jetzt aktualisieren</span>
            </button>
            <button
              onClick={onDismiss}
              className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              Später
            </button>
            <button
              onClick={onDismiss}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              title="Schließen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
