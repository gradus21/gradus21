import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GUIDE_CHAPTERS } from './guideChaptersData';
import { InteractiveDemoGuide } from './InteractiveDemoGuide';

describe('guideChaptersData - Guide Structure & Class Setup Start', () => {
  it('has valid chapter count and chapters in expected order', () => {
    expect(GUIDE_CHAPTERS.length).toBeGreaterThanOrEqual(6);
    expect(GUIDE_CHAPTERS[0].id).toBe('overview_all');
    expect(GUIDE_CHAPTERS[1].id).toBe('class_setup_excel');
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
});
