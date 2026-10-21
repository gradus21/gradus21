import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle,
  FolderPlus,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { GuideChapter, GuideChapterId, GuideStep } from '../../types/guide';
import { GUIDE_CHAPTERS } from './guideChaptersData';
import { WorkspaceMode } from '../../types/workspace';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Renders inline markdown: **bold** and `code`
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      return (
        <strong key={idx} className="font-bold" style={{ color: 'var(--text-primary)' }}>
          {boldText}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      const codeText = part.slice(1, -1);
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold border mx-0.5"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--primary-text)',
          }}
        >
          {codeText}
        </code>
      );
    }
    return part;
  });
}

/**
 * Renders structured rich guide content:
 * - Paragraphs
 * - Clean bullet lists (with styled dots)
 * - Inline markdown formatting
 */
function renderRichContent(content: string): React.ReactNode {
  // Split into paragraphs / sections by double newlines
  const sections = content.split(/\n\s*\n/);

  return (
    <div className="space-y-2.5 text-xs">
      {sections.map((section, sIdx) => {
        const rawLines = section.split('\n').map((l) => l.trim()).filter(Boolean);
        if (rawLines.length === 0) return null;

        // Group consecutive lines into either 'list' or 'paragraph' chunks
        type Chunk = { type: 'p'; lines: string[] } | { type: 'list'; items: string[] };
        const chunks: Chunk[] = [];

        rawLines.forEach((line) => {
          const isListItem = /^[-*•]\s+/.test(line);
          const lastChunk = chunks[chunks.length - 1];

          if (isListItem) {
            const cleanText = line.replace(/^[-*•]\s+/, '');
            if (lastChunk && lastChunk.type === 'list') {
              lastChunk.items.push(cleanText);
            } else {
              chunks.push({ type: 'list', items: [cleanText] });
            }
          } else {
            if (lastChunk && lastChunk.type === 'p') {
              lastChunk.lines.push(line);
            } else {
              chunks.push({ type: 'p', lines: [line] });
            }
          }
        });

        return (
          <React.Fragment key={sIdx}>
            {chunks.map((chunk, cIdx) => {
              if (chunk.type === 'list') {
                return (
                  <ul key={cIdx} className="space-y-1.5 my-2 pl-0.5">
                    {chunk.items.map((item, itemIdx) => (
                      <li
                        key={itemIdx}
                        className="flex items-start gap-2.5 p-2 rounded-lg border text-xs"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: 'var(--primary-500)' }}
                        />
                        <div className="flex-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                          {renderInlineMarkdown(item)}
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              }

              return (
                <p key={cIdx} className="leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {chunk.lines.map((line, lIdx) => (
                    <React.Fragment key={lIdx}>
                      {lIdx > 0 && <br />}
                      {renderInlineMarkdown(line)}
                    </React.Fragment>
                  ))}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface InteractiveDemoGuideProps {
  isOpen: boolean;
  chapterId: GuideChapterId;
  stepIndex: number;
  onClose: () => void;
  onStepChange: (newStepIndex: number) => void;
  onChapterChange: (newChapterId: GuideChapterId, stepIndex?: number) => void;
  onOpenChapterSelect: () => void;
  onExecuteAction?: (actionType: string, payload?: any) => void;
  setMode: (mode: WorkspaceMode) => void;
  onChapterCompleted: (chapterId: string) => void;
}

export const InteractiveDemoGuide: React.FC<InteractiveDemoGuideProps> = ({
  isOpen,
  chapterId,
  stepIndex,
  onClose,
  onStepChange,
  onChapterChange,
  onOpenChapterSelect,
  onExecuteAction,
  setMode,
  onChapterCompleted,
}) => {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [autoPlayProgress, setAutoPlayProgress] = useState<number>(0);
  const [demoLoadedSuccess, setDemoLoadedSuccess] = useState<boolean>(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentChapter: GuideChapter | undefined = GUIDE_CHAPTERS.find(
    (c) => c.id === chapterId
  ) || GUIDE_CHAPTERS[0];

  const currentStep: GuideStep | undefined = currentChapter?.steps[stepIndex] || currentChapter?.steps[0];
  const totalSteps = currentChapter ? currentChapter.steps.length : 1;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;

  // Auto-switch workspace mode if step defines targetMode
  useEffect(() => {
    if (!isOpen || !currentStep) return;
    if (currentStep.targetMode) {
      setMode(currentStep.targetMode);
    }
  }, [isOpen, currentStep, setMode]);

  // Find target element coordinates and scroll into view smoothly
  const updateTargetPosition = useCallback(() => {
    if (!isOpen || !currentStep || !currentStep.targetId) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      // Scroll smoothly if element is out of viewport
      const isInView =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth);

      if (!isInView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep]);

  // Update target on step change or resize/scroll
  useEffect(() => {
    updateTargetPosition();
    const timer = setTimeout(updateTargetPosition, 80);
    const timer2 = setTimeout(updateTargetPosition, 250);

    const handleResizeOrScroll = () => {
      updateTargetPosition();
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [updateTargetPosition, stepIndex, chapterId]);

  // Reset demo loaded success state on step or chapter change
  useEffect(() => {
    setDemoLoadedSuccess(false);
  }, [stepIndex, chapterId]);

  // Handle Step Forward
  const handleNext = useCallback(() => {
    if (isLastStep) {
      onChapterCompleted(chapterId);
      // If there is a next chapter, offer or go to chapter select
      const currentChapterIdx = GUIDE_CHAPTERS.findIndex((c) => c.id === chapterId);
      if (currentChapterIdx >= 0 && currentChapterIdx < GUIDE_CHAPTERS.length - 1) {
        const nextChapter = GUIDE_CHAPTERS[currentChapterIdx + 1];
        onChapterChange(nextChapter.id, 0);
      } else {
        onClose();
        onOpenChapterSelect();
      }
    } else {
      onStepChange(stepIndex + 1);
    }
    setAutoPlayProgress(0);
  }, [isLastStep, onChapterCompleted, chapterId, onChapterChange, onClose, onOpenChapterSelect, onStepChange, stepIndex]);

  // Handle Step Backward
  const handlePrev = useCallback(() => {
    if (!isFirstStep) {
      onStepChange(stepIndex - 1);
      setAutoPlayProgress(0);
    }
  }, [isFirstStep, onStepChange, stepIndex]);

  // Auto-Play Timer (Advances step after ~6.5s)
  useEffect(() => {
    if (!isOpen || !isAutoPlaying) {
      setAutoPlayProgress(0);
      return;
    }

    const durationMs = 6500;
    const intervalMs = 100;
    const increment = (intervalMs / durationMs) * 100;

    const interval = setInterval(() => {
      setAutoPlayProgress((prev) => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + increment;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isOpen, isAutoPlaying, handleNext]);

  // Global Keyboard Navigation (Esc, Left, Right, Space)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        e.preventDefault();
        setIsAutoPlaying((p) => !p);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!isOpen || !currentChapter || !currentStep) return null;

  // Calculate Popover coordinates based on targetRect & placement
  const padding = currentStep.highlightPadding ?? 8;
  const isCentered = !targetRect || currentStep.placement === 'center';

  let popoverStyle: React.CSSProperties = {};
  if (isCentered) {
    popoverStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 60,
    };
  } else if (targetRect) {
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;
    const cardWidth = Math.min(440, Math.max(280, windowW - 32));
    const cardEstimatedHeight = 280;
    const gap = 16;

    let placement = currentStep.placement || 'bottom';

    // Auto-adjust if not enough room
    if (placement === 'bottom' && targetRect.top + targetRect.height + gap + cardEstimatedHeight > windowH) {
      placement = 'top';
    } else if (placement === 'top' && targetRect.top - gap - cardEstimatedHeight < 0) {
      placement = 'bottom';
    }

    let top = 0;
    let left = 0;

    if (placement === 'bottom') {
      top = targetRect.top + targetRect.height + gap;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    } else if (placement === 'top') {
      top = targetRect.top - cardEstimatedHeight - gap;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    } else if (placement === 'left') {
      top = targetRect.top + targetRect.height / 2 - cardEstimatedHeight / 2;
      left = targetRect.left - cardWidth - gap;
    } else if (placement === 'right') {
      top = targetRect.top + targetRect.height / 2 - cardEstimatedHeight / 2;
      left = targetRect.left + targetRect.width + gap;
    }

    // Keep within viewport bounds
    left = Math.max(16, Math.min(left, windowW - cardWidth - 16));
    top = Math.max(16, Math.min(top, windowH - cardEstimatedHeight - 16));

    popoverStyle = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${cardWidth}px`,
      zIndex: 70,
    };
  }

  const stepProgress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* SVG SPOTLIGHT MASK OVERLAY */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-300 ease-out">
        <defs>
          <mask id="gradus21-tour-spotlight-mask">
            {/* White background: full darkness */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black cutout: transparent spotlight */}
            {targetRect && (
              <rect
                x={Math.max(0, targetRect.left - padding)}
                y={Math.max(0, targetRect.top - padding)}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx="16"
                ry="16"
                fill="black"
                className="transition-all duration-300 ease-out"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.75)"
          mask="url(#gradus21-tour-spotlight-mask)"
        />
      </svg>

      {/* PULSING HIGHLIGHT HALO AROUND TARGET ELEMENT */}
      {targetRect && (
        <div
          className="fixed pointer-events-none rounded-2xl ring-4 ring-teal-400 dark:ring-teal-300 shadow-[0_0_25px_rgba(20,184,166,0.6)] animate-pulse transition-all duration-300 ease-out"
          style={{
            top: `${Math.max(0, targetRect.top - padding)}px`,
            left: `${Math.max(0, targetRect.left - padding)}px`,
            width: `${targetRect.width + padding * 2}px`,
            height: `${targetRect.height + padding * 2}px`,
            zIndex: 55,
          }}
        />
      )}

      {/* FLOATING INTERACTIVE CARD */}
      <div
        ref={popoverRef}
        className="w-full max-w-[calc(100vw-32px)] sm:max-w-[480px] rounded-3xl border shadow-2xl overflow-hidden transition-all duration-300 ease-out animate-scale-up pointer-events-auto"
        style={{
          ...popoverStyle,
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        {/* TOP PROGRESS BAR */}
        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
          <div
            className="h-full bg-teal-500 transition-all duration-300"
            style={{ width: `${stepProgress}%` }}
          />
          {isAutoPlaying && (
            <div
              className="absolute top-0 left-0 h-full bg-amber-400 opacity-75 transition-all duration-100"
              style={{ width: `${autoPlayProgress}%` }}
            />
          )}
        </div>

        {/* CARD HEADER */}
        <div
          className="px-5 py-3.5 border-b flex items-center justify-between gap-3 text-xs"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="font-extrabold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--primary-soft)',
                color: 'var(--primary-text)',
              }}
            >
              {currentChapter.shortTitle}
            </span>
            <span style={{ color: 'var(--text-secondary)' }} className="font-semibold text-[11px]">
              Schritt {stepIndex + 1} von {totalSteps}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Auto-Play Toggle */}
            <button
              onClick={() => setIsAutoPlaying((p) => !p)}
              className={`min-h-[36px] min-w-[36px] sm:min-w-0 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1.5 transition ${
                isAutoPlaying
                  ? 'bg-amber-500/20 text-amber-600 border-amber-500/40'
                  : 'hover:opacity-80'
              }`}
              style={
                !isAutoPlaying
                  ? {
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }
                  : undefined
              }
              title={isAutoPlaying ? 'Auto-Play pausieren (Leertaste)' : 'Auto-Play starten (Leertaste)'}
            >
              {isAutoPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Pausieren</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span className="hidden sm:inline">Auto-Play</span>
                </>
              )}
            </button>

            {/* Chapter Select Hub */}
            <button
              onClick={() => {
                setIsAutoPlaying(false);
                onOpenChapterSelect();
              }}
              className="w-9 h-9 rounded-lg border transition hover:opacity-80 text-xs font-semibold inline-flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              title="Alle Kapitel ansehen"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg border transition hover:opacity-80 text-xs inline-flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              title="Tour beenden (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* CARD CONTENT */}
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {currentStep.title}
            </h3>
            {currentStep.badge && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 border"
                style={{
                  backgroundColor: 'var(--primary-soft)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--primary-text)',
                }}
              >
                {currentStep.badge}
              </span>
            )}
          </div>

          {/* Rich Markdown & Structured Lists */}
          {renderRichContent(currentStep.content)}

          {/* Optional Tip Callout */}
          {currentStep.tip && (
            <div
              className="p-2.5 rounded-xl border flex items-start gap-2 text-[11px]"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <HelpCircle className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <div className="flex-1">{renderInlineMarkdown(currentStep.tip)}</div>
            </div>
          )}

          {/* Interactive Step Action Button(s) */}
          {(currentStep.actions || currentStep.action) && onExecuteAction && (
            <div className="pt-1 flex flex-col sm:flex-row gap-2">
              {(currentStep.actions || (currentStep.action ? [currentStep.action] : [])).map((act, idx) => {
                const isPrimary = act.variant === 'primary' || (!act.variant && idx === 0);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onExecuteAction(act.actionType, act.payload);
                      if (act.actionType === 'load_demo_dataset') {
                        setDemoLoadedSuccess(true);
                      }
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition hover:opacity-95 cursor-pointer ${
                      isPrimary ? 'text-white' : ''
                    }`}
                    style={
                      isPrimary
                        ? { backgroundColor: 'var(--primary-500)' }
                        : {
                            backgroundColor: 'var(--primary-soft)',
                            color: 'var(--primary-text)',
                            border: '1px solid var(--border-subtle)',
                          }
                    }
                  >
                    {act.actionType === 'load_demo_dataset' ? (
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    ) : act.actionType === 'open_class_wizard' ? (
                      <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{act.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Feedback badge when demo dataset was loaded */}
          {demoLoadedSuccess && (
            <div
              className="p-2.5 rounded-xl text-[11px] font-semibold flex items-center gap-2 animate-in fade-in"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: '#059669',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Beispielklasse (Englisch 6a) erfolgreich geladen! Klicke auf „Weiter (→)“, um die Arbeitsmodi zu erkunden.</span>
            </div>
          )}
        </div>

        {/* CARD FOOTER & CONTROLS */}
        <div
          className="px-5 py-3.5 border-t flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* STEP DOTS */}
          <div className="flex items-center gap-1.5">
            {currentChapter.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  onStepChange(i);
                  setAutoPlayProgress(0);
                }}
                className={`step-dot compact-touch h-2 rounded-full transition-all ${
                  i === stepIndex
                    ? 'w-6 bg-teal-500'
                    : i < stepIndex
                    ? 'w-2 bg-teal-400/60'
                    : 'w-2 bg-slate-300 dark:bg-slate-700'
                }`}
                title={`Zu Schritt ${i + 1} springen`}
              />
            ))}
          </div>

          {/* NAVIGATION BUTTONS */}
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1 transition hover:opacity-80"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span>Zurück</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white inline-flex items-center justify-center gap-1.5 shadow-sm transition hover:opacity-95"
              style={{ backgroundColor: 'var(--primary-500)' }}
            >
              <span>{isLastStep ? 'Kapitel abschließen' : 'Weiter'}</span>
              {isLastStep ? (
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
