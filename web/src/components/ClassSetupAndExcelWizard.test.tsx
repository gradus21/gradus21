import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ClassSetupAndExcelWizard,
  detectExcelColumns,
  buildClassroomFromExcel,
} from './ClassSetupAndExcelWizard';
import { CustomWeightingTemplate } from '../data/demoClasses';

describe('ClassSetupAndExcelWizard - Custom User Templates', () => {
  const dummyUserTemplates: CustomWeightingTemplate[] = [
    {
      id: 'tpl_custom_meine_fachvorlage',
      name: 'Mein Mathe 60/40 Profil',
      description: '60% Klassenarbeiten, 40% mündlich',
      weighting_mode: 'category_buckets',
      categories: [
        { id: 'cat_ka', name: 'Klausuren', short_code: 'KA', weight: 0.6, drop_lowest_count: 0 },
        { id: 'cat_muendl', name: 'Mitarbeit', short_code: 'Mi', weight: 0.4, drop_lowest_count: 0 },
      ],
    },
  ];

  it('renders custom user templates with badge and applies them on class creation', () => {
    const handleCreateClass = vi.fn();
    const handleClose = vi.fn();

    render(
      <ClassSetupAndExcelWizard
        onClose={handleClose}
        onCreateClass={handleCreateClass}
        userTemplates={dummyUserTemplates}
      />
    );

    // Switch to manual template wizard tab
    const tabBtn = screen.getByRole('button', { name: /neue klasse mit vorlage erstellen/i });
    fireEvent.click(tabBtn);

    // User's custom template should be visible with badge
    expect(screen.getByText('Mein Mathe 60/40 Profil')).toBeInTheDocument();
    expect(screen.getByText('Eigene Vorlage')).toBeInTheDocument();

    // Select the custom template
    fireEvent.click(screen.getByText('Mein Mathe 60/40 Profil'));

    // Submit form to create the class
    const submitBtn = screen.getByRole('button', { name: /klasse jetzt verschlüsselt erstellen/i });
    fireEvent.click(submitBtn);

    expect(handleCreateClass).toHaveBeenCalledTimes(1);
    const createdClass = handleCreateClass.mock.calls[0][0];
    expect(createdClass.categories).toHaveLength(2);
    expect(createdClass.categories[0].short_code).toBe('KA');
    expect(createdClass.categories[0].weight).toBe(0.6);
    expect(createdClass.categories[1].short_code).toBe('Mi');
    expect(createdClass.categories[1].weight).toBe(0.4);
    expect(handleClose).toHaveBeenCalled();
  });
});

describe('ClassSetupAndExcelWizard - Excel Import Detection & Building', () => {
  it('correctly auto-detects student names, levels, grade scales, and percentages', () => {
    const headerRow = ['Schülername', 'Niveau', 'Klassenarbeit 1 (Noten)', 'Vokabeltest (%)'];
    const dataRows = [
      ['Safia Al-Mansoor', 'M', '2+', '85%'],
      ['Kira Meier', 'G', '3-', '45%'],
      ['Luis Schmidt', 'E', '1', '95%'],
      ['Vincent Bauer', 'M', 'ATTEST', 'K'],
    ];

    const detected = detectExcelColumns(headerRow, dataRows);

    expect(detected).toHaveLength(4);
    expect(detected[0].role).toBe('student_name');
    expect(detected[1].role).toBe('student_level');

    // KA 1 has German grade tendencies (2+, 3-, 1) and 'Noten' in header -> grade_scale
    expect(detected[2].role).toBe('assessment');
    expect(detected[2].categoryKey).toBe('lnw');
    expect(detected[2].inputMode).toBe('grade_scale');

    // Vokabeltest has '%' in header and values -> percent
    expect(detected[3].role).toBe('assessment');
    expect(detected[3].categoryKey).toBe('tests');
    expect(detected[3].inputMode).toBe('percent');
  });

  it('builds classroom dataset with proper direct grade values for tendencies and excused statuses', () => {
    const headerRow = ['Name', 'Niveau', 'KA 1 (Note)', 'Test 1 (%)'];
    const dataRows = [
      ['Safia Al-Mansoor', 'M', '2+', '80'],
      ['Kira Meier', 'G', '2-', '50'],
      ['Luis Schmidt', 'E', '1', '100'],
      ['Vincent Bauer', 'M', 'ATTEST', 'K'],
    ];

    const detected = detectExcelColumns(headerRow, dataRows);
    const dataset = buildClassroomFromExcel({
      schoolName: 'Gymnasium am Park',
      schoolYear: '2026/2027',
      className: '6b',
      subjectName: 'Englisch',
      scaleId: 'de_classic_1_to_6',
      excelFileName: 'Klassenliste_6b.xlsx',
      detectedColumns: detected,
      excelRows: dataRows,
    });

    expect(dataset.students).toHaveLength(4);
    expect(dataset.students[0].name).toBe('Safia Al-Mansoor');
    expect(dataset.students[0].level).toBe('M');
    expect(dataset.students[1].name).toBe('Kira Meier');
    expect(dataset.students[1].level).toBe('G');
    expect(dataset.students[2].name).toBe('Luis Schmidt');
    expect(dataset.students[2].level).toBe('E');

    // Assessments
    expect(dataset.assessments).toHaveLength(2);
    const kaAssess = dataset.assessments.find((a) => a.title.includes('KA 1'));
    const testAssess = dataset.assessments.find((a) => a.title.includes('Test 1'));
    expect(kaAssess?.input_mode).toBe('grade_scale');
    expect(kaAssess?.max_points).toBeNull();
    expect(testAssess?.input_mode).toBe('percent');

    // Grades for Safia: 2+ is 1.75
    const safiaKaGrade = dataset.grades.find(
      (g) => g.student_id === dataset.students[0].id && g.assessment_id === kaAssess?.id
    );
    expect(safiaKaGrade?.status).toBe('graded');
    expect(safiaKaGrade?.direct_grade_value).toBe(1.75);
    expect(safiaKaGrade?.percent_value).toBeNull();

    // Grades for Kira: 2- is 2.25
    const kiraKaGrade = dataset.grades.find(
      (g) => g.student_id === dataset.students[1].id && g.assessment_id === kaAssess?.id
    );
    expect(kiraKaGrade?.status).toBe('graded');
    expect(kiraKaGrade?.direct_grade_value).toBe(2.25);
    expect(kiraKaGrade?.percent_value).toBeNull();

    // Grades for Luis: 1 is 1.0, test is 100%
    const luisKaGrade = dataset.grades.find(
      (g) => g.student_id === dataset.students[2].id && g.assessment_id === kaAssess?.id
    );
    expect(luisKaGrade?.status).toBe('graded');
    expect(luisKaGrade?.direct_grade_value).toBe(1.0);

    const luisTestGrade = dataset.grades.find(
      (g) => g.student_id === dataset.students[2].id && g.assessment_id === testAssess?.id
    );
    expect(luisTestGrade?.status).toBe('graded');
    expect(luisTestGrade?.percent_value).toBe(100);

    // Grades for Vincent: ATTEST / K are excused
    const vincentKaGrade = dataset.grades.find(
      (g) => g.student_id === dataset.students[3].id && g.assessment_id === kaAssess?.id
    );
    const vincentTestGrade = dataset.grades.find(
      (g) => g.student_id === dataset.students[3].id && g.assessment_id === testAssess?.id
    );
    expect(vincentKaGrade?.status).toBe('excused');
    expect(vincentTestGrade?.status).toBe('excused');
  });
});
