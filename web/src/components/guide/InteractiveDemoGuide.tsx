import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
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
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number }>({
    width: 440,
    height: 380,
  });
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

  // Dynamically measure actual popover dimensions to prevent any viewport clipping
  useLayoutEffect(() => {
    if (!isOpen || !popoverRef.current) return;
    const updateSize = () => {
      if (popoverRef.current) {
        const rect = popoverRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setMeasuredSize((prev) => {
            if (
              Math.abs(prev.width - rect.width) > 2 ||
              Math.abs(prev.height - rect.height) > 2
            ) {
              return { width: Math.round(rect.width), height: Math.round(rect.height) };
            }
            return prev;
          });
        }
      }
    };

    updateSize();
    const timer = setTimeout(updateSize, 40);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && popoverRef.current) {
      observer = new ResizeObserver(updateSize);
      observer.observe(popoverRef.current);
    }

    return () => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
    };
  }, [isOpen, stepIndex, chapterId]);

  // Find target element coordinates and scroll into view smoothly
  const updateTargetPosition = useCallback(() => {
    if (!isOpen || !currentStep || !currentStep.targetId) {
      setTargetRect(null);
      return;
    }

    let selector = `[data-tour="${currentStep.targetId}"]`;
    if (currentStep.targetId === 'header-sync-status') {
      selector = '[data-tour="header-sync-status"], [data-tour="header-storage-indicator"]';
    }

    let el = document.querySelector(selector) as HTMLElement | null;

    // Fallback for class setup/manager buttons when collapsed into class switcher on screens < 1024px
    if (
      (!el || el.getBoundingClientRect().width === 0 || el.getBoundingClientRect().height === 0) &&
      (currentStep.targetId === 'header-class-wizard-btn' || currentStep.targetId === 'header-class-manager-btn')
    ) {
      el = document.querySelector('[data-tour="header-class-switcher"]');
    }

    // Fallback for matrix table on mobile
    if (
      el &&
      currentStep.targetId === 'matrix-table' &&
      el.getBoundingClientRect().width === 0
    ) {
      const mobileCarousel = document.querySelector('[data-tour="matrix-mobile-carousel"]') as HTMLElement | null;
      if (mobileCarousel) el = mobileCarousel;
    }

    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });

        // Scroll smoothly ONLY if element is completely out of visible viewport
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        const viewportW = window.innerWidth || document.documentElement.clientWidth;
        const isCompletelyOutOfView =
          rect.bottom < 60 ||
          rect.top > viewportH - 60 ||
          rect.right < 0 ||
          rect.left > viewportW;

        if (isCompletelyOutOfView && rect.height < viewportH * 1.5) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
      }
    }

    setTargetRect(null);
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

  const windowW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;

  const topReserve = 16;
  const bottomReserve = windowW < 768 ? 76 : 16;
  const gap = 14;

  const cardWidth = Math.min(460, Math.max(280, windowW - 24));
  const maxAvailableCardHeight = Math.max(220, windowH - topReserve - bottomReserve);
  const cardHeight = Math.min(measuredSize.height || 380, maxAvailableCardHeight);

  let popoverStyle: React.CSSProperties = {};

  if (isCentered) {
    popoverStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${cardWidth}px`,
      maxHeight: `${maxAvailableCardHeight}px`,
      zIndex: 70,
    };
  } else if (targetRect) {
    // If the target element is very large (spans > 45% of viewport height like full matrix table or views)
    const isTargetHuge = targetRect.height > windowH * 0.45;

    let top = 0;
    let left = 0;

    if (isTargetHuge) {
      // Float docked cleanly in the bottom portion of viewport with ample breathing room
      top = windowH - cardHeight - bottomReserve - 12;
      left = targetRect.left + (targetRect.width - cardWidth) / 2;
    } else {
      let preferredPlacement = currentStep.placement || 'bottom';

      // Check available space
      const roomBelow = windowH - (targetRect.top + targetRect.height + gap) - bottomReserve;
      const roomAbove = targetRect.top - gap - topReserve;

      let placement = preferredPlacement;
      if (placement === 'bottom' && roomBelow < cardHeight && roomAbove >= cardHeight) {
        placement = 'top';
      } else if (placement === 'top' && roomAbove < cardHeight && roomBelow >= cardHeight) {
        placement = 'bottom';
      }

      if (placement === 'bottom') {
        top = targetRect.top + targetRect.height + gap;
        left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      } else if (placement === 'top') {
        top = targetRect.top - cardHeight - gap;
        left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
      } else if (placement === 'left') {
        top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
        left = targetRect.left - cardWidth - gap;
      } else if (placement === 'right') {
        top = targetRect.top + targetRect.height / 2 - cardHeight / 2;
        left = targetRect.left + targetRect.width + gap;
      }
    }

    // Strict boundary clamping so the card is ALWAYS 100% visible
    const minTop = topReserve;
    const maxTop = Math.max(minTop, windowH - cardHeight - bottomReserve);
    top = Math.max(minTop, Math.min(top, maxTop));

    const minLeft = 12;
    const maxLeft = Math.max(minLeft, windowW - cardWidth - 12);
    left = Math.max(minLeft, Math.min(left, maxLeft));

    popoverStyle = {
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${cardWidth}px`,
      maxHeight: `${maxAvailableCardHeight}px`,
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

      {/* REFINED FOCUS RING AROUND TARGET ELEMENT */}
      {targetRect && (
        <div
          className="fixed pointer-events-none rounded-2xl ring-2 ring-teal-500/80 dark:ring-teal-400/80 shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all duration-300 ease-out"
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
        data-guide-card="true"
        className="rounded-2xl md:rounded-3xl border shadow-2xl overflow-hidden flex flex-col pointer-events-auto transition-[top,left,width,max-height] duration-200 ease-out animate-scale-up"
        style={{
          ...popoverStyle,
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
      >
        {/* TOP PROGRESS BAR */}
        <div className="shrink-0 h-1.5 w-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
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
          className="shrink-0 px-5 py-3.5 border-b flex items-center justify-between gap-3 text-xs"
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
        <div className="flex-1 min-h-0 p-5 space-y-3 overflow-y-auto overscroll-contain matrix-scroll">
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
          className="shrink-0 px-5 py-3.5 border-t flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* STEP DOTS */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-[140px] sm:max-w-none shrink-0">
            {currentChapter.steps.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  onStepChange(i);
                  setAutoPlayProgress(0);
                }}
                className={`step-dot compact-touch h-2 rounded-full transition-all shrink-0 ${
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
          <div className="flex items-center gap-2 shrink-0">
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
