import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
});
