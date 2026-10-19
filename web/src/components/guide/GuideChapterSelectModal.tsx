import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  Compass,
  FolderPlus,
  Play,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { GuideChapter, GuideChapterId } from '../../types/guide';
import { GUIDE_CHAPTERS } from './guideChaptersData';

interface GuideChapterSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartChapter: (chapterId: GuideChapterId, stepIndex?: number) => void;
  completedChapters: string[];
}

export const GuideChapterSelectModal: React.FC<GuideChapterSelectModalProps> = ({
  isOpen,
  onClose,
  onStartChapter,
  completedChapters,
}) => {
  if (!isOpen) return null;

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Compass':
        return <Compass className="w-5 h-5 text-teal-600 dark:text-teal-400" />;
      case 'FolderPlus':
        return <FolderPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      case 'Sliders':
        return <Sliders className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      case 'Zap':
        return <Zap className="w-5 h-5 text-amber-500 dark:text-amber-300" />;
      case 'UserCheck':
        return <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'ShieldCheck':
        return <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      default:
        return <BookOpen className="w-5 h-5 text-teal-600 dark:text-teal-400" />;
    }
  };

  const completedCount = completedChapters.length;
  const totalCount = GUIDE_CHAPTERS.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          className="p-6 border-b flex items-start justify-between gap-4"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm"
              style={{
                backgroundColor: 'var(--primary-soft)',
                color: 'var(--primary-text)',
              }}
            >
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">Interaktiver Funktions-Guide</h2>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                  }}
                >
                  Didaktische Demo
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Wähle ein Kapitel zum Durchspielen oder wiederhole einzelne Themen nach Bedarf.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl transition hover:opacity-80"
            style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
            title="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PROGRESS OVERVIEW */}
        <div
          className="px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Dein Fortschritt:
            </span>
            <span className="font-bold" style={{ color: 'var(--primary-500)' }}>
              {completedCount} von {totalCount} Kapiteln abgeschlossen ({progressPercent} %)
            </span>
          </div>

          <button
            onClick={() => {
              onClose();
              onStartChapter('overview_all');
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-sm transition hover:opacity-95"
            style={{ backgroundColor: 'var(--primary-500)' }}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Gesamte Tour starten (~3 Min.)</span>
          </button>
        </div>

        {/* CHAPTERS LIST */}
        <div className="p-6 overflow-y-auto space-y-3.5 flex-1">
          {GUIDE_CHAPTERS.map((chapter, idx) => {
            const isCompleted = completedChapters.includes(chapter.id);
            return (
              <div
                key={chapter.id}
                className="p-4 rounded-2xl border transition-all hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: isCompleted ? 'var(--primary-300, #5eead4)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start gap-3.5 flex-1">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {getIcon(chapter.iconName)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wide opacity-60">
                        Kapitel {idx + 1}
                      </span>
                      <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        {chapter.shortTitle}
                      </h3>
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Abgeschlossen</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {chapter.subtitle}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        ⏱️ ~{chapter.estimatedMinutes} Min.
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {chapter.steps.length} Schritte
                      </span>
                      {chapter.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                          style={{
                            backgroundColor: 'var(--primary-soft)',
                            color: 'var(--primary-text)',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => {
                      onClose();
                      onStartChapter(chapter.id);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      isCompleted
                        ? 'border hover:bg-slate-100 dark:hover:bg-slate-800'
                        : 'text-white shadow-sm hover:opacity-95'
                    }`}
                    style={
                      isCompleted
                        ? {
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }
                        : {
                            backgroundColor: 'var(--primary-500)',
                          }
                    }
                  >
                    {isCompleted ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Erneut abspielen</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Kapitel starten</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* MODAL FOOTER */}
        <div
          className="p-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <span>💡 Du kannst die interaktive Demo jederzeit oben in der Kopfleiste aufrufen.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border text-xs font-semibold transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
