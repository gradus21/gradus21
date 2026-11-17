import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GUIDE_CHAPTERS, YOUTUBE_CHANNEL_URL, YOUTUBE_PLAYLIST_URL } from './guideChaptersData';
import { InteractiveDemoGuide, computeGuidePopoverStyle } from './InteractiveDemoGuide';

describe('guideChaptersData - Guide Structure & Class Setup Start', () => {
  it('has valid chapter count and chapters in expected order', () => {
    expect(GUIDE_CHAPTERS.length).toBeGreaterThanOrEqual(6);
    expect(GUIDE_CHAPTERS[0].id).toBe('overview_all');
    expect(GUIDE_CHAPTERS[1].id).toBe('class_setup_excel');
  });

  it('provides valid YouTube channel, playlist, and per-chapter video tutorials', () => {
    expect(YOUTUBE_CHANNEL_URL).toContain('youtube.com');
    expect(YOUTUBE_PLAYLIST_URL).toContain('playlist?list=PLL9Oq2VrwC74');

    for (const chapter of GUIDE_CHAPTERS) {
      expect(chapter.youtubeVideoId).toBeTruthy();
      expect(chapter.youtubeUrl).toContain(`youtu.be/${chapter.youtubeVideoId}`);
      expect(chapter.videoDurationLabel).toMatch(/\d+:\d+\sMin\./);
    }
  });

  it('starts Chapter 1 (overview_all) with class import and demo class loading options', () => {
    const chapter = GUIDE_CHAPTERS.find((c) => c.id === 'overview_all');
    expect(chapter).toBeDefined();

    const welcomeStep = chapter!.steps[0];
    expect(welcomeStep.id).toBe('ov_welcome');
    // Welcome step offers direct class import / demo dataset actions
    const welcomeActions = welcomeStep.actions || (welcomeStep.action ? [welcomeStep.action] : []);
    const welcomeActionTypes = welcomeActions.map((a) => a.actionType);
    expect(welcomeActionTypes).toContain('open_class_wizard');
    expect(welcomeActionTypes).toContain('load_demo_dataset');

    // Step 2 specifically targets class setup / wizard button
    const classStartStep = chapter!.steps[1];
    expect(classStartStep.id).toBe('ov_class_start');
    expect(classStartStep.targetId).toBe('header-class-wizard-btn');

    const actions = classStartStep.actions || (classStartStep.action ? [classStartStep.action] : []);
    const actionTypes = actions.map((a) => a.actionType);
    expect(actionTypes).toContain('open_class_wizard');
    expect(actionTypes).toContain('load_demo_dataset');
  });

  it('starts Chapter 2 (class_setup_excel) with class import and demo class loading options', () => {
    const chapter = GUIDE_CHAPTERS.find((c) => c.id === 'class_setup_excel');
    expect(chapter).toBeDefined();

    const introStep = chapter!.steps[0];
    expect(introStep.id).toBe('setup_intro');

    const actions = introStep.actions || (introStep.action ? [introStep.action] : []);
    const actionTypes = actions.map((a) => a.actionType);
    expect(actionTypes).toContain('open_class_wizard');
    expect(actionTypes).toContain('load_demo_dataset');
  });

  it('configures Chapter 3 (custom_grading_model) to match the modular tabbed Baukasten with Sandbox simulator', () => {
    const chapter = GUIDE_CHAPTERS.find((c) => c.id === 'custom_grading_model');
    expect(chapter).toBeDefined();

    const stepIds = chapter!.steps.map((s) => s.id);
    expect(stepIds).toContain('cgm_welcome');
    expect(stepIds).toContain('cgm_categories');
    expect(stepIds).toContain('cgm_curve_editor');
    expect(stepIds).toContain('cgm_differentiation');
    expect(stepIds).toContain('cgm_scale_mode');
    expect(stepIds).toContain('cgm_live_simulator');
    expect(stepIds).toContain('cgm_templates');

    // Live simulator step specifically highlights the sandbox / live-check
    const simStep = chapter!.steps.find((s) => s.id === 'cgm_live_simulator');
    expect(simStep?.targetId).toBe('configurator-live-check');
    expect(simStep?.content).toContain('Sandbox');
  });

  it('ensures all chapters and steps have non-empty titles and content', () => {
    for (const chapter of GUIDE_CHAPTERS) {
      expect(chapter.id).toBeTruthy();
      expect(chapter.title).toBeTruthy();
      expect(chapter.steps.length).toBeGreaterThan(0);

      for (const step of chapter.steps) {
        expect(step.id).toBeTruthy();
        expect(step.title).toBeTruthy();
        expect(step.content).toBeTruthy();

        if (step.actions) {
          for (const act of step.actions) {
            expect(act.label).toBeTruthy();
            expect(act.actionType).toBeTruthy();
          }
        }
      }
    }
  });
});

describe('InteractiveDemoGuide - Action Execution & Feedback', () => {
  it('renders actions and triggers callbacks on click', () => {
    const handleExecuteAction = vi.fn();
    const handleClose = vi.fn();
    const handleStepChange = vi.fn();
    const handleChapterChange = vi.fn();
    const handleChapterCompleted = vi.fn();
    const handleSetMode = vi.fn();

    render(
      <InteractiveDemoGuide
        isOpen={true}
        chapterId="overview_all"
        stepIndex={0}
        onClose={handleClose}
        onStepChange={handleStepChange}
        onChapterChange={handleChapterChange}
        onOpenChapterSelect={vi.fn()}
        onExecuteAction={handleExecuteAction}
        setMode={handleSetMode}
        onChapterCompleted={handleChapterCompleted}
      />
    );

    // Should display both action buttons
    const importBtn = screen.getByRole('button', { name: /eigene klasse importieren/i });
    const demoBtn = screen.getByRole('button', { name: /beispielklasse laden/i });

    expect(importBtn).toBeDefined();
    expect(demoBtn).toBeDefined();

    // Clicking import triggers open_class_wizard
    fireEvent.click(importBtn);
    expect(handleExecuteAction).toHaveBeenCalledWith('open_class_wizard', undefined);

    // Clicking demo triggers load_demo_dataset and shows feedback
    fireEvent.click(demoBtn);
    expect(handleExecuteAction).toHaveBeenCalledWith('load_demo_dataset', undefined);
    expect(screen.getByText(/erfolgreich geladen/i)).toBeDefined();
  });

  it('guarantees popover card structure with flex-col and scrollable content to prevent viewport cutoff', () => {
    const { container } = render(
      <InteractiveDemoGuide
        isOpen={true}
        chapterId="overview_all"
        stepIndex={0}
        onClose={vi.fn()}
        onStepChange={vi.fn()}
        onChapterChange={vi.fn()}
        onOpenChapterSelect={vi.fn()}
        setMode={vi.fn()}
        onChapterCompleted={vi.fn()}
      />
    );

    // Find the floating card
    const card = container.querySelector('.rounded-2xl, .rounded-3xl');
    expect(card).toBeDefined();
    expect(card?.className).toContain('flex');
    expect(card?.className).toContain('flex-col');

    // Find the scrollable body
    const scrollableBody = card?.querySelector('.overflow-y-auto');
    expect(scrollableBody).toBeDefined();
    expect(scrollableBody?.className).toContain('min-h-0');

    // Next button and step dots are rendered in the pinned footer
    const nextBtn = screen.getByRole('button', { name: /weiter/i });
    expect(nextBtn).toBeDefined();
  });

  it('completes the chapter and closes the guide on the last step instead of chaining chapters', () => {
    const overviewChapter = GUIDE_CHAPTERS.find((c) => c.id === 'overview_all')!;
    const lastIndex = overviewChapter.steps.length - 1;
    const handleClose = vi.fn();
    const handleChapterChange = vi.fn();
    const handleChapterCompleted = vi.fn();
    const handleOpenChapterSelect = vi.fn();

    render(
      <InteractiveDemoGuide
        isOpen={true}
        chapterId="overview_all"
        stepIndex={lastIndex}
        onClose={handleClose}
        onStepChange={vi.fn()}
        onChapterChange={handleChapterChange}
        onOpenChapterSelect={handleOpenChapterSelect}
        setMode={vi.fn()}
        onChapterCompleted={handleChapterCompleted}
      />
    );

    const finishBtn = screen.getByRole('button', { name: /fertig/i });
    fireEvent.click(finishBtn);

    expect(handleChapterCompleted).toHaveBeenCalledWith('overview_all');
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleChapterChange).not.toHaveBeenCalled();

    const themesBtn = screen.getByRole('button', { name: /themen/i });
    fireEvent.click(themesBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
    expect(handleOpenChapterSelect).toHaveBeenCalledTimes(1);
  });
});

describe('InteractiveDemoGuide - Collision-Free Positioning & Chapter Placements', () => {
  it('assigns non-overlapping left/right placements for column-split guide steps', () => {
    const ch1 = GUIDE_CHAPTERS.find((c) => c.id === 'overview_all')!;
    expect(ch1.steps.find((s) => s.id === 'ov_speed')?.placement).toBe('right');

    const ch2 = GUIDE_CHAPTERS.find((c) => c.id === 'class_setup_excel')!;
    expect(ch2.steps.find((s) => s.id === 'setup_wizard_modal')?.placement).toBe('right');

    const ch3 = GUIDE_CHAPTERS.find((c) => c.id === 'custom_grading_model')!;
    expect(ch3.steps.find((s) => s.id === 'cgm_categories')?.placement).toBe('right');
    expect(ch3.steps.find((s) => s.id === 'cgm_curve_editor')?.placement).toBe('right');
    expect(ch3.steps.find((s) => s.id === 'cgm_differentiation')?.placement).toBe('right');
    expect(ch3.steps.find((s) => s.id === 'cgm_scale_mode')?.placement).toBe('right');
    expect(ch3.steps.find((s) => s.id === 'cgm_live_simulator')?.placement).toBe('left');

    const ch4 = GUIDE_CHAPTERS.find((c) => c.id === 'speed_grading')!;
    expect(ch4.steps.find((s) => s.id === 'sg_inputs')?.placement).toBe('right');
    expect(ch4.steps.find((s) => s.id === 'sg_curve_box')?.placement).toBe('left');
  });

  it('places popover cleanly to the right of large left-column panels without overlap', () => {
    const targetRect = { top: 240, left: 24, width: 920, height: 520 };
    const style = computeGuidePopoverStyle({
      targetRect,
      placement: 'right',
      padding: 8,
      windowW: 1440,
      windowH: 810,
      measuredHeight: 260,
    });

    const left = parseInt(String(style.left), 10);
    const width = parseInt(String(style.width), 10);
    expect(left).toBeGreaterThan(targetRect.left + targetRect.width + 8);
    expect(left + width).toBeLessThanOrEqual(1440 - 12);
  });

  it('places popover cleanly to the left of right-column panels without overlap', () => {
    const targetRect = { top: 100, left: 968, width: 448, height: 520 };
    const style = computeGuidePopoverStyle({
      targetRect,
      placement: 'left',
      padding: 8,
      windowW: 1440,
      windowH: 810,
      measuredHeight: 260,
    });

    const left = parseInt(String(style.left), 10);
    const width = parseInt(String(style.width), 10);
    expect(left + width).toBeLessThan(targetRect.left - 8);
    expect(left).toBeGreaterThanOrEqual(12);
  });

  it('falls back to side placement instead of overlapping when vertical room is insufficient', () => {
    const targetRect = { top: 200, left: 24, width: 920, height: 480 };
    const style = computeGuidePopoverStyle({
      targetRect,
      placement: 'top',
      padding: 8,
      windowW: 1440,
      windowH: 810,
      measuredHeight: 260,
    });

    const left = parseInt(String(style.left), 10);
    expect(left).toBeGreaterThan(targetRect.left + targetRect.width + 8);
  });
});
