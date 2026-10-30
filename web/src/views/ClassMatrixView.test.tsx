import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassMatrixView } from './ClassMatrixView';
import { INITIAL_CLASS_DATASETS, DEFAULT_USER_SYNC_SETTINGS } from '../data/demoClasses';

describe('ClassMatrixView Mobile Pupil Card Slider & Haptics', () => {
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

  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });
  });

  it('exclusively renders the Pupil Card Slider on small screens without Voll-Tabelle switcher', () => {
    const { container } = render(<ClassMatrixView {...defaultProps} />);

    // Voll-Tabelle toggle button is completely removed
    expect(screen.queryByText('Voll-Tabelle')).not.toBeInTheDocument();
    expect(screen.queryByText('Schüler-Karte (Karussell)')).not.toBeInTheDocument();

    // Pupil Card Slider is always rendered for < md screens
    const slider = screen.getByTestId('pupil-card-slider');
    expect(slider).toBeInTheDocument();
    expect(slider.className).toContain('md:hidden');

    // Desktop matrix table is strictly hidden on small screens (hidden md:block)
    const desktopTable = container.querySelector('[data-tour="matrix-table"]');
    expect(desktopTable).not.toBeNull();
    expect(desktopTable?.className).toContain('hidden md:block');

    const firstStudent = mockDataset.students[0];
    expect(screen.getAllByText(firstStudent.name).length).toBeGreaterThan(0);
    expect(screen.getByText('Vorherige:r')).toBeInTheDocument();

    const secondStudent = mockDataset.students[1];
    expect(screen.getAllByText(secondStudent.name).length).toBeGreaterThan(0);
  });

  it('triggers haptic snap feedback and directional animation when skipping to next student', () => {
    render(<ClassMatrixView {...defaultProps} />);

    const secondStudent = mockDataset.students[1];
    const nextBtn = screen.getByTitle(`Nächste:r: ${secondStudent.name}`);
    fireEvent.click(nextBtn);

    // Tactile snap haptic (18ms) fired
    expect(vibrateMock).toHaveBeenCalledWith(18);

    // Second student is active and third student is queued next
    const thirdStudent = mockDataset.students[2];
    expect(screen.getAllByText(secondStudent.name).length).toBeGreaterThan(0);
    expect(screen.getByTitle(`Nächste:r: ${thirdStudent.name}`)).toBeInTheDocument();

    const card = screen.getByTestId('pupil-slider-card');
    expect(card.className).toContain('pupil-card-enter-next');
  });

  it('fires threshold detent haptic during touch drag and snap haptic on swipe release', () => {
    render(<ClassMatrixView {...defaultProps} />);

    const slider = screen.getByTestId('pupil-card-slider');
    const secondStudent = mockDataset.students[1];

    // Start touch at X=200, Y=100
    fireEvent.touchStart(slider, {
      touches: [{ clientX: 200, clientY: 100 }],
    });

    // Drag left past commit threshold (deltaX = -65)
    fireEvent.touchMove(slider, {
      touches: [{ clientX: 135, clientY: 102 }],
    });

    // Threshold detent haptic (12ms selection) fired and release indicator shown
    expect(vibrateMock).toHaveBeenCalledWith(12);
    expect(screen.getByTestId('swipe-release-indicator')).toHaveTextContent(
      `Loslassen für ${secondStudent.name}`
    );

    // Release swipe
    fireEvent.touchEnd(slider, {
      changedTouches: [{ clientX: 120, clientY: 102 }],
    });

    // Snap haptic (18ms) fired and advanced to second student
    expect(vibrateMock).toHaveBeenCalledWith(18);
    const thirdStudent = mockDataset.students[2];
    expect(screen.getByTitle(`Nächste:r: ${thirdStudent.name}`)).toBeInTheDocument();
  });
});
