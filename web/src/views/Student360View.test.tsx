import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Student360View } from './Student360View';
import { INITIAL_CLASS_DATASETS, DEFAULT_USER_SYNC_SETTINGS } from '../data/demoClasses';

describe('Student360View Empty State & Safety', () => {
  const mockDataset = {
    ...INITIAL_CLASS_DATASETS[0],
    students: [],
    grades: [],
  };

  const defaultProps = {
    activeDataset: mockDataset,
    allDatasets: [mockDataset],
    activeTerm: 'hj1' as const,
    visibleStudents: [],
    activeStudent: undefined,
    selectedStudentId: '',
    setSelectedStudentId: vi.fn(),
    summaryByStudentId: new Map(),
    activeStudentSummary: undefined,
    userSettings: DEFAULT_USER_SYNC_SETTINGS,
    showOnDemandSimulator: false,
    setShowOnDemandSimulator: vi.fn(),
    updateReportCardOverride: vi.fn(),
    onUpdateStudentProfile: vi.fn(),
    wasmReady: true,
    setMode: vi.fn(),
    onOpenClassManager: vi.fn(),
    onAddStudent: vi.fn(),
    onLoadDemoDataset: vi.fn(),
    showArchivedInMatrix: false,
    setShowArchivedInMatrix: vi.fn(),
  };

  it('renders clean empty state instead of crashing when no students exist', () => {
    render(<Student360View {...defaultProps} />);

    expect(screen.getByTestId('student360-empty-state')).toBeInTheDocument();
    expect(screen.getByText('Noch keine Schüler:innen in dieser Klasse')).toBeInTheDocument();
    expect(screen.getAllByText('Zurück zur Klassen-Matrix').length).toBeGreaterThan(0);
    expect(screen.getByText('Klassenverwaltung & Excel-Import')).toBeInTheDocument();
  });

  it('allows user to navigate back to matrix mode via top back button', () => {
    const setModeMock = vi.fn();
    render(<Student360View {...defaultProps} setMode={setModeMock} />);

    const backButton = screen.getByText('Zurück zur Klassen-Matrix');
    fireEvent.click(backButton);

    expect(setModeMock).toHaveBeenCalledWith('matrix');
  });

  it('allows user to navigate back to matrix mode via bottom action button', () => {
    const setModeMock = vi.fn();
    render(<Student360View {...defaultProps} setMode={setModeMock} />);

    const bottomBackButton = screen.getByText('Zurück zur Noten-Matrix');
    fireEvent.click(bottomBackButton);

    expect(setModeMock).toHaveBeenCalledWith('matrix');
  });

  it('allows user to trigger class manager with students tab', () => {
    const onOpenClassManagerMock = vi.fn();
    render(<Student360View {...defaultProps} onOpenClassManager={onOpenClassManagerMock} />);

    const openManagerButton = screen.getByText('Klassenverwaltung & Excel-Import');
    fireEvent.click(openManagerButton);

    expect(onOpenClassManagerMock).toHaveBeenCalledWith('students');
  });

  it('submits quick-add student directly from empty state', () => {
    const onAddStudentMock = vi.fn();
    render(<Student360View {...defaultProps} onAddStudent={onAddStudentMock} />);

    const input = screen.getByPlaceholderText('Vor- und Nachname (z. B. Mia Sommer)');
    fireEvent.change(input, { target: { value: 'Lukas Schmidt' } });

    const submitBtn = screen.getByText('Hinzufügen');
    fireEvent.click(submitBtn);

    expect(onAddStudentMock).toHaveBeenCalledWith('Lukas Schmidt', 'M');
  });

  it('displays archived notification if students exist but all are archived', () => {
    const archivedDataset = {
      ...INITIAL_CLASS_DATASETS[0],
      students: [
        {
          id: 'stu_archived',
          name: 'Archivierte Person',
          level: null,
          is_archived: true,
          is_not_graded: false,
        },
      ],
    };

    const setShowArchivedInMatrixMock = vi.fn();

    render(
      <Student360View
        {...defaultProps}
        activeDataset={archivedDataset}
        visibleStudents={[]}
        activeStudent={undefined}
        setShowArchivedInMatrix={setShowArchivedInMatrixMock}
      />
    );

    expect(screen.getByText('Alle Schüler:innen dieser Klasse sind archiviert')).toBeInTheDocument();
    const showArchivedBtn = screen.getByText('Archivierte Schüler:innen einblenden');
    fireEvent.click(showArchivedBtn);

    expect(setShowArchivedInMatrixMock).toHaveBeenCalledWith(true);
  });

  it('renders student profile when activeStudent is provided', () => {
    const populatedDataset = INITIAL_CLASS_DATASETS[0];
    const firstStudent = populatedDataset.students[0];

    render(
      <Student360View
        {...defaultProps}
        activeDataset={populatedDataset}
        visibleStudents={populatedDataset.students}
        activeStudent={firstStudent}
        selectedStudentId={firstStudent.id}
      />
    );

    expect(screen.queryByTestId('student360-empty-state')).not.toBeInTheDocument();
    expect(screen.getAllByText(firstStudent.name).length).toBeGreaterThan(0);
    expect(screen.getByText('Elterngesprächs-Ansicht (HJ1)')).toBeInTheDocument();
  });
});
