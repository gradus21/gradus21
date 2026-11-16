import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SpeedGradingView } from './SpeedGradingView';
import { INITIAL_CLASS_DATASETS, DEFAULT_USER_SYNC_SETTINGS } from '../data/demoClasses';

describe('SpeedGradingView Empty State & Resilience', () => {
  const mockDataset = {
    ...INITIAL_CLASS_DATASETS[0],
    assessments: [],
    grades: [],
  };

  const defaultProps = {
    activeDataset: mockDataset,
    activeTerm: 'hj1' as const,
    termAssessments: [],
    activeAssessment: undefined,
    setSelectedAssessmentId: vi.fn(),
    speedInputMode: 'percent' as const,
    setSpeedInputMode: vi.fn(),
    visibleStudents: [],
    summaryByStudentId: new Map(),
    calculationReport: null,
    updateGradeEntry: vi.fn(),
    isCurveEditorVisible: false,
    userSettings: DEFAULT_USER_SYNC_SETTINGS,
    setShowOnDemandCurveEditor: vi.fn(),
    globalTemplates: [],
    curvePresetKey: 'linear',
    curveCutoffs: { n1: 90, n2: 75, n3: 60, n4: 45, n5: 20 },
    applyCurveCutoffs: vi.fn(),
    applyGlobalCurveTemplate: vi.fn(),
    isDifferentiationEnabled: false,
    toggleStudentLevelsEnabled: vi.fn(),
    currentLevelOffsets: { G: 0, M: 0, E: 0 },
    setMode: vi.fn(),
    onOpenClassManager: vi.fn(),
    onAddAssessment: vi.fn(),
    onAddStudent: vi.fn(),
  };

  it('renders clean empty state when no assessments exist in current term', () => {
    render(<SpeedGradingView {...defaultProps} />);

    expect(screen.getByTestId('speed-grading-empty-state')).toBeInTheDocument();
    expect(screen.getByText('Noch keine Prüfungen angelegt')).toBeInTheDocument();
    expect(screen.getByText('Zurück zur Klassen-Matrix')).toBeInTheDocument();
  });

  it('allows navigating back to matrix mode', () => {
    const setModeMock = vi.fn();
    render(<SpeedGradingView {...defaultProps} setMode={setModeMock} />);

    const backBtn = screen.getByText('Zurück zur Klassen-Matrix');
    fireEvent.click(backBtn);

    expect(setModeMock).toHaveBeenCalledWith('matrix');
  });

  it('renders empty student notice when assessment exists but no students exist', () => {
    const datasetWithAssessment = INITIAL_CLASS_DATASETS[0];
    const assessment = datasetWithAssessment.assessments[0];

    render(
      <SpeedGradingView
        {...defaultProps}
        activeDataset={{ ...datasetWithAssessment, students: [] }}
        termAssessments={[assessment]}
        activeAssessment={assessment}
        visibleStudents={[]}
      />
    );

    expect(screen.queryByTestId('speed-grading-empty-state')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        `Keine Schüler:innen in dieser Klasse vorhanden. Füge Schüler:innen hinzu, um Noten für „${assessment.title}“ einzutragen.`
      )
    ).toBeInTheDocument();
  });

  it('supports entering multi-digit percentages without focus loss and supports Enter navigation', () => {
    const dataset = INITIAL_CLASS_DATASETS[0];
    const assessment = dataset.assessments[0];
    const students = dataset.students.slice(0, 3);
    const updateGradeEntryMock = vi.fn();

    render(
      <SpeedGradingView
        {...defaultProps}
        activeDataset={dataset}
        termAssessments={[assessment]}
        activeAssessment={assessment}
        visibleStudents={students}
        updateGradeEntry={updateGradeEntryMock}
      />
    );

    const input0 = document.querySelector<HTMLInputElement>('input[data-speed-grade-idx="0"]')!;
    const input1 = document.querySelector<HTMLInputElement>('input[data-speed-grade-idx="1"]')!;

    expect(input0).not.toBeNull();
    expect(input1).not.toBeNull();

    // 1. Focus input
    act(() => {
      input0.focus();
    });
    expect(document.activeElement).toBe(input0);

    // 2. Type first digit "8"
    act(() => {
      fireEvent.change(input0, { target: { value: '8' } });
    });
    expect(updateGradeEntryMock).toHaveBeenCalledWith(students[0].id, assessment.id, '8', 'percent');
    expect(input0.value).toBe('8');
    expect(document.activeElement).toBe(input0);

    // 3. Type second digit "5" -> "85" (multi-digit speed-grading in percent)
    act(() => {
      fireEvent.change(input0, { target: { value: '85' } });
    });
    expect(updateGradeEntryMock).toHaveBeenCalledWith(students[0].id, assessment.id, '85', 'percent');
    expect(input0.value).toBe('85');
    expect(document.activeElement).toBe(input0);

    // 4. Press Enter to navigate to the next student
    act(() => {
      fireEvent.keyDown(input0, { key: 'Enter' });
    });
    expect(document.activeElement).toBe(input1);
  });

  it('marks out-of-range input with aria-invalid="true" (#41)', () => {
    const dataset = INITIAL_CLASS_DATASETS[0];
    const assessment = dataset.assessments[0];
    const students = dataset.students.slice(0, 2);

    render(
      <SpeedGradingView
        {...defaultProps}
        activeDataset={dataset}
        termAssessments={[assessment]}
        activeAssessment={assessment}
        visibleStudents={students}
        speedInputMode="grade_scale"
      />
    );

    const input0 = document.querySelector<HTMLInputElement>('input[data-speed-grade-idx="0"]')!;
    expect(input0.getAttribute('aria-invalid')).toBe('false');

    act(() => {
      fireEvent.focus(input0);
      fireEvent.change(input0, { target: { value: '7' } });
    });

    expect(input0.getAttribute('aria-invalid')).toBe('true');
    expect(input0.getAttribute('title')).toContain('Note 1,0 bis 6,0');
  });
});

describe('SpeedGradingView & Linux Dark-Mode <select> Styling', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('renders assessment <select> with theme variables in dark mode and switches assessments', () => {
    document.documentElement.classList.add('dark');

    const dataset = INITIAL_CLASS_DATASETS[0];
    const termAssessments = dataset.assessments.filter((a) => a.term_id === 'hj1');
    const setSelectedAssessmentId = vi.fn();

    render(
      <SpeedGradingView
        activeDataset={dataset}
        activeTerm="hj1"
        termAssessments={termAssessments}
        activeAssessment={termAssessments[0]}
        setSelectedAssessmentId={setSelectedAssessmentId}
        speedInputMode="percent"
        setSpeedInputMode={vi.fn()}
        visibleStudents={dataset.students.filter((s) => !s.is_archived)}
        summaryByStudentId={new Map()}
        calculationReport={null}
        updateGradeEntry={vi.fn()}
        isCurveEditorVisible={false}
        userSettings={{ ...DEFAULT_USER_SYNC_SETTINGS, darkMode: true, themeMode: 'dark' }}
        setShowOnDemandCurveEditor={vi.fn()}
        globalTemplates={[]}
        curvePresetKey="ihk"
        curveCutoffs={{ n1: 92, n2: 81, n3: 67, n4: 50, n5: 30 }}
        applyCurveCutoffs={vi.fn()}
        applyGlobalCurveTemplate={vi.fn()}
        isDifferentiationEnabled={dataset.config.enable_student_levels}
        toggleStudentLevelsEnabled={vi.fn()}
        currentLevelOffsets={{ G: 0, M: 0, E: 0 }}
        setMode={vi.fn()}
      />
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe(termAssessments[0].id);
    expect(select.style.backgroundColor).toBe('var(--bg-subtle)');
    expect(select.style.color).toBe('var(--text-primary)');
    expect(select.style.borderColor).toBe('var(--border-subtle)');

    if (termAssessments.length > 1) {
      fireEvent.change(select, { target: { value: termAssessments[1].id } });
      expect(setSelectedAssessmentId).toHaveBeenCalledWith(termAssessments[1].id);
    }
  });

  it('defines cross-platform dark-mode select & option CSS overrides in index.css', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

    expect(css).toContain('color-scheme: light;');
    expect(css).toContain('color-scheme: dark;');
    expect(css).toMatch(/select\s*\{[\s\S]*?-webkit-appearance:\s*none;[\s\S]*?appearance:\s*none;[\s\S]*?background-color:\s*var\(--bg-subtle\);[\s\S]*?color:\s*var\(--text-primary\);/);
    expect(css).toMatch(/select option,\s*select optgroup\s*\{[\s\S]*?background-color:\s*var\(--bg-surface\);[\s\S]*?color:\s*var\(--text-primary\);/);
  });
});
