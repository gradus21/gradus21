import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GradingConfiguratorView } from './GradingConfiguratorView';
import {
  INITIAL_CLASS_DATASETS,
  DEFAULT_USER_SYNC_SETTINGS,
  buildCurveThresholdsFromMainCutoffs,
} from '../data/demoClasses';

describe('GradingConfiguratorView UI & Ergonomics', () => {
  const mockDataset = {
    ...INITIAL_CLASS_DATASETS[0],
    categories: [
      { id: 'cat_1', name: 'Klassenarbeiten', short_code: 'KA', weight: 0.5, drop_lowest_count: 0 },
      { id: 'cat_2', name: 'Mündliche Mitarbeit', short_code: 'Mündl', weight: 0.3, drop_lowest_count: 0 },
      { id: 'cat_3', name: 'Kurztests', short_code: 'Tests', weight: 0.2, drop_lowest_count: 0 },
    ],
  };

  const defaultProps = {
    activeDataset: mockDataset,
    updateSubjectConfig: vi.fn(),
    userSettings: DEFAULT_USER_SYNC_SETTINGS,
    setUserSettings: vi.fn(),
    globalTemplates: [],
    curvePresetKey: 'sek1_standard',
    curveCutoffs: { n1: 90, n2: 75, n3: 60, n4: 45, n5: 20 },
    applyCurveCutoffs: vi.fn(),
    applyGlobalCurveTemplate: vi.fn(),
    applyGlobalWeightingTemplate: vi.fn(),
    applyDifferentiationPreset: vi.fn(),
    currentLevelOffsets: { G: -5, M: 0, E: 3 },
    isDifferentiationEnabled: true,
    toggleStudentLevelsEnabled: vi.fn(),
    updateLevelOffset: vi.fn(),
    activeFineThresholds: buildCurveThresholdsFromMainCutoffs({ n1: 90, n2: 75, n3: 60, n4: 45, n5: 20 }),
    visibleStudents: [
      { id: 'stu_1', name: 'Mia Müller', level: 'M' as const, is_not_graded: false, is_archived: false },
      { id: 'stu_2', name: 'Leon Schmidt', level: 'G' as const, is_not_graded: false, is_archived: false },
    ],
    activeStudent: { id: 'stu_1', name: 'Mia Müller', level: 'M' as const, is_not_graded: false, is_archived: false },
    selectedStudentId: 'stu_1',
    setSelectedStudentId: vi.fn(),
    cycleStudentLevel: vi.fn(),
    summaryByStudentId: new Map([
      [
        'stu_1',
        {
          student_id: 'stu_1',
          overall_percent: 82.5,
          overall_grade_numeric: 2.0,
          overall_display_grade: '2',
          semantic_tier: 2,
          is_preliminary: false,
          category_results: [
            {
              category_id: 'cat_1',
              category_name: 'Klassenarbeiten',
              average_percent: 85,
              average_grade_numeric: 1.75,
              display_grade: '2+',
              graded_count: 2,
              effective_weight_percent: 50,
            },
            {
              category_id: 'cat_2',
              category_name: 'Mündliche Mitarbeit',
              average_percent: 80,
              average_grade_numeric: 2.0,
              display_grade: '2',
              graded_count: 3,
              effective_weight_percent: 30,
            },
          ],
        },
      ],
    ]),
  };

  it('renders tab navigation and visual split bar with all categories', () => {
    render(<GradingConfiguratorView {...defaultProps} />);

    // Tabs
    expect(screen.getByText('1. Kategorien & Gewichtung')).toBeInTheDocument();
    expect(screen.getByText('2. Notenschlüssel & Schwellen')).toBeInTheDocument();
    expect(screen.getByText('3. Binnendifferenzierung (G/M/E)')).toBeInTheDocument();
    expect(screen.getByText('Basis-Setup')).toBeInTheDocument();

    // Visual Split Bar
    expect(screen.getByText(/KA: 50%/i)).toBeInTheDocument();
    expect(screen.getByText(/Mündl: 30%/i)).toBeInTheDocument();
    expect(screen.getByText(/Tests: 20%/i)).toBeInTheDocument();

    // Mode Toggle
    expect(screen.getByText(/Prozentual/i)).toBeInTheDocument();
    expect(screen.getByText(/Verhältnis/i)).toBeInTheDocument();
  });

  it('supports toggling category lock button to pin weights', () => {
    render(<GradingConfiguratorView {...defaultProps} />);

    const lockButtons = screen.getAllByRole('button', { name: /Frei/i });
    expect(lockButtons.length).toBeGreaterThan(0);

    // Click lock on first category
    fireEvent.click(lockButtons[0]);

    // Should indicate locked
    expect(screen.getByText(/1 fixiert/i)).toBeInTheDocument();
  });

  it('triggers step buttons to adjust category percentage with auto-balancing', () => {
    const updateSubjectConfigMock = vi.fn();
    render(<GradingConfiguratorView {...defaultProps} updateSubjectConfig={updateSubjectConfigMock} />);

    const stepUpButtons = screen.getAllByTitle('+5% Schritt');
    expect(stepUpButtons.length).toBeGreaterThan(0);

    fireEvent.click(stepUpButtons[0]);
    expect(updateSubjectConfigMock).toHaveBeenCalled();
  });

  it('allows changing Streichnoten (Drop Lowest) via pill buttons', () => {
    const updateSubjectConfigMock = vi.fn();
    render(<GradingConfiguratorView {...defaultProps} updateSubjectConfig={updateSubjectConfigMock} />);

    const dropButtons = screen.getAllByText('1x Streichen ⭐');
    expect(dropButtons.length).toBeGreaterThan(0);

    fireEvent.click(dropButtons[0]);
    expect(updateSubjectConfigMock).toHaveBeenCalled();
  });

  it('switches to Notenschlüssel tab and displays grade spectrum and Bestehensgrenze', () => {
    render(<GradingConfiguratorView {...defaultProps} />);

    const curveTab = screen.getByText('2. Notenschlüssel & Schwellen');
    fireEvent.click(curveTab);

    expect(screen.getByText(/Noten-Spektrum/i)).toBeInTheDocument();
    expect(screen.getByText(/Bestehensgrenze \(Note 4\): ab 45%/i)).toBeInTheDocument();
    expect(screen.getByText('Note 1 (Sehr gut)')).toBeInTheDocument();
    expect(screen.getByText('Note 6 (Ungenügend)')).toBeInTheDocument();
  });

  it('switches to Binnendifferenzierung tab and toggles level calculation', () => {
    const toggleStudentLevelsEnabledMock = vi.fn();
    render(
      <GradingConfiguratorView
        {...defaultProps}
        toggleStudentLevelsEnabled={toggleStudentLevelsEnabledMock}
      />
    );

    const diffTab = screen.getByText('3. Binnendifferenzierung (G/M/E)');
    fireEvent.click(diffTab);

    expect(screen.getByText(/G-Niveau \(Grundlegend\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemeinschaftsschule Standard/i)).toBeInTheDocument();

    const toggleBtn = screen.getByText(/Differenzierung in Berechnung AKTIV/i);
    fireEvent.click(toggleBtn);

    expect(toggleStudentLevelsEnabledMock).toHaveBeenCalledWith(false);
  });

  it('switches to Basis-Setup tab and allows choosing grading scale and weighting mode', () => {
    const updateSubjectConfigMock = vi.fn();
    render(
      <GradingConfiguratorView
        {...defaultProps}
        updateSubjectConfig={updateSubjectConfigMock}
      />
    );

    const setupTab = screen.getByText('Basis-Setup');
    fireEvent.click(setupTab);

    expect(screen.getByText('Schulnoten 1–6 (mit Tendenzen)')).toBeInTheDocument();
    expect(screen.getByText('Oberstufe 0–15 Punkte (MSS)')).toBeInTheDocument();
    expect(screen.getByText('Kategorien-Töpfe (Standard)')).toBeInTheDocument();
  });

  it('switches between Real Student and Test-Simulator (Sandbox) in sidebar', () => {
    render(<GradingConfiguratorView {...defaultProps} />);

    // Default is student mode
    expect(screen.getByText(/Resultierender Gesamtschnitt/i)).toBeInTheDocument();

    // Switch to Sandbox mode
    const sandboxBtn = screen.getByRole('button', { name: /Sandbox/i });
    fireEvent.click(sandboxBtn);

    expect(screen.getByText(/Interaktiver Test-Simulator/i)).toBeInTheDocument();
    expect(screen.getByText(/Schnell-Szenarien/i)).toBeInTheDocument();
    expect(screen.getByText(/Errechnete Test-Endnote/i)).toBeInTheDocument();

    // Click a scenario button
    const scenarioBtn = screen.getByText(/Klassenbester/i);
    fireEvent.click(scenarioBtn);
  });

  it('opens safe deletion modal when delete category button is clicked', () => {
    render(<GradingConfiguratorView {...defaultProps} />);

    const deleteButtons = screen.getAllByTitle('Kategorie sicher entfernen');
    expect(deleteButtons.length).toBeGreaterThan(0);

    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('Kategorie löschen?')).toBeInTheDocument();
    expect(screen.getByText(/Betroffene Prüfungen & Noten/i)).toBeInTheDocument();
    expect(screen.getByText('Abbrechen')).toBeInTheDocument();
  });

  it('supports direct typing of custom percentages and commits on blur or Enter', () => {
    const updateSubjectConfigMock = vi.fn();
    render(<GradingConfiguratorView {...defaultProps} updateSubjectConfig={updateSubjectConfigMock} />);

    const inputs = screen.getAllByTitle(/Direkte Eingabe/i);
    expect(inputs.length).toBeGreaterThan(0);

    const firstInput = inputs[0] as HTMLInputElement;
    expect(firstInput.value).toBe('50');

    // Focus input
    fireEvent.focus(firstInput);

    // Type arbitrary custom percentage (e.g. 33.3)
    fireEvent.change(firstInput, { target: { value: '33.3' } });
    expect(firstInput.value).toBe('33.3');

    // Blur to commit
    fireEvent.blur(firstInput);
    expect(updateSubjectConfigMock).toHaveBeenCalled();
  });
});
