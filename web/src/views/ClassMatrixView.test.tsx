import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClassMatrixView } from './ClassMatrixView';
import { INITIAL_CLASS_DATASETS, DEFAULT_USER_SYNC_SETTINGS } from '../data/demoClasses';

describe('ClassMatrixView Mobile Card Carousel', () => {
  const mockDataset = INITIAL_CLASS_DATASETS[0];
  const defaultProps = {
    activeDataset: mockDataset,
    activeTerm: 'hj1' as const,
    calculationReport: {
      student_summaries: [],
      class_average_percent: 78,
      class_average_grade_numeric: 2.4,
      class_display_grade: '2,4',
      distribution_buckets: [2, 5, 8, 3, 1, 0] as [number, number, number, number, number, number],
    },
    summaryByStudentId: new Map(),
    userSettings: DEFAULT_USER_SYNC_SETTINGS,
    cellFormat: 'combined' as const,
    setCellFormat: vi.fn(),
    showArchivedInMatrix: false,
    setShowArchivedInMatrix: vi.fn(),
    showOnDemandReportCardCol: false,
    setShowOnDemandReportCardCol: vi.fn(),
    onOpenClassManager: vi.fn(),
    onOpenClassWizard: vi.fn(),
    onSelectStudent: vi.fn(),
    onSelectAssessment: vi.fn(),
    setMode: vi.fn(),
    updateGradeEntry: vi.fn(),
    updateReportCardOverride: vi.fn(),
    cycleStudentLevel: vi.fn(),
    toggleStudentNotGraded: vi.fn(),
    toggleStudentArchived: vi.fn(),
    onAddStudent: vi.fn(),
  };

  it('renders mobile mode switcher and defaults to student card carousel', () => {
    render(<ClassMatrixView {...defaultProps} />);

    expect(screen.getByText('Schüler-Karte (Karussell)')).toBeInTheDocument();
    expect(screen.getByText('Voll-Tabelle')).toBeInTheDocument();

    const firstStudent = mockDataset.students[0];
    expect(screen.getAllByText(firstStudent.name).length).toBeGreaterThan(0);
    expect(screen.getByText('Vorherige:r')).toBeInTheDocument();
    // Next button shows the name of the next student
    const secondStudent = mockDataset.students[1];
    expect(screen.getAllByText(secondStudent.name).length).toBeGreaterThan(0);
  });

  it('navigates to next student when clicking next student button', () => {
    render(<ClassMatrixView {...defaultProps} />);

    const secondStudent = mockDataset.students[1];
    // Find button containing next student's name
    const nextBtn = screen.getByTitle(`Nächste:r: ${secondStudent.name}`);
    fireEvent.click(nextBtn);

    // After clicking next, second student's name is in the card header and 3rd student is next
    const thirdStudent = mockDataset.students[2];
    expect(screen.getAllByText(secondStudent.name).length).toBeGreaterThan(0);
    expect(screen.getByTitle(`Nächste:r: ${thirdStudent.name}`)).toBeInTheDocument();
  });

  it('switches to table mode when clicking Voll-Tabelle button', () => {
    render(<ClassMatrixView {...defaultProps} />);

    const tableToggleBtn = screen.getByText('Voll-Tabelle');
    fireEvent.click(tableToggleBtn);

    // In table mode, the swipe hint is shown
    expect(screen.getByText(/Seitlich wischen für alle Arbeiten/i)).toBeInTheDocument();
  });
});
