import React from 'react';
import { Compass, Sparkles, X } from 'lucide-react';

interface WelcomeGuideBannerProps {
  onStartTour: () => void;
  onOpenChapters: () => void;
  onDismiss: () => void;
}

export const WelcomeGuideBanner: React.FC<WelcomeGuideBannerProps> = ({
  onStartTour,
  onOpenChapters,
  onDismiss,
}) => {
  return (
    <div
      className="border-b px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs relative transition-colors duration-200"
      style={{
        backgroundColor: 'var(--primary-soft)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-xs"
          style={{
            backgroundColor: 'var(--primary-500)',
            color: '#FFFFFF',
          }}
        >
          <Sparkles className="w-4 h-4 animate-pulse" />
        </div>
        <div>
          <span className="font-bold">Neu bei Gradus21? </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Starte mit dem Import deiner eigenen Klasse (.xlsx) oder lade eine Beispielklasse, um alle Funktionen interaktiv kennenzulernen.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onStartTour}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition hover:opacity-95 inline-flex items-center justify-center gap-1.5"
          style={{ backgroundColor: 'var(--primary-500)' }}
        >
          <Compass className="w-3.5 h-3.5 shrink-0" />
          <span>Interaktive Tour starten (3 Min.)</span>
        </button>

        <button
          onClick={onOpenChapters}
          className="px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition hover:opacity-90 inline-flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          Themen wählen
        </button>

        <button
          onClick={onDismiss}
          className="w-8 h-8 rounded-lg transition hover:opacity-75 text-slate-500 inline-flex items-center justify-center shrink-0"
          title="Hinweis ausblenden"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
