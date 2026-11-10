import { describe, it, expect } from 'vitest';
import {
  cleanConflictSuffix,
  getClassSemanticKey,
  isStarterOrPlaceholderClass,
  mergeClassroomDatasets,
  reconcileWorkspaceDatasets,
} from './vaultSyncHelpers';
import { ClassroomSubjectDataset, GradeEntry } from '../data/demoClasses';

describe('mergeClassroomDatasets - Smart Merge Reconciliation', () => {
  const baseLocalDs: ClassroomSubjectDataset = {
    id: 'c1a55000-0000-4000-8000-000000000001',
    schoolName: 'Schule Berlin',
    schoolYear: '2026/2027',
    className: '9a',
    subjectName: 'Mathematik',
    shortName: 'M9A',
    description: 'Lokale Beschreibung',
    config: {
      scale_id: 'de_classic_1_to_6',
      weighting_mode: 'category_buckets',
      scale_empty_categories: true,
      enable_student_levels: true,
      level_threshold_offsets: { G: 0, M: 0, E: 0 },
      custom_thresholds: null,
    },
    categories: [
      { id: 'cat-1', name: 'Klausuren', short_code: 'KL', weight: 0.5, drop_lowest_count: 0 },
    ],
    assessments: [
      {
        id: 'ass-1',
        category_id: 'cat-1',
        title: 'Klausur 1',
        term_id: 'hj1',
        weight: 1,
        input_mode: 'points',
        max_points: 30,
      },
    ],
    students: [
      { id: 'stud-1', name: 'Max Mustermann', level: 'M', is_not_graded: false },
    ],
    grades: [
      {
        student_id: 'stud-1',
        assessment_id: 'ass-1',
        status: 'graded',
        percent_value: 90,
        raw_points: 27,
        direct_grade_value: null,
        comment: 'Sehr gut lokal',
      },
    ],
    reportCardOverrides: {},
  };

  const baseServerDs: ClassroomSubjectDataset = {
    ...baseLocalDs,
    description: 'Server Beschreibung',
    config: {
      ...baseLocalDs.config,
      enable_student_levels: false,
    },
    grades: [
      {
        student_id: 'stud-1',
        assessment_id: 'ass-1',
        status: 'graded',
        percent_value: 70,
        raw_points: 21,
        direct_grade_value: null,
        comment: 'Alt vom Server',
      },
    ],
  };

  it('preserves local grade changes over outdated cloud grades when collision occurs', () => {
    const { mergedDs, hadGradeCollisions, conflictCopy } = mergeClassroomDatasets(
      baseLocalDs,
      baseServerDs
    );

    expect(hadGradeCollisions).toBe(true);

    // Active merged dataset MUST contain local updated grade
    const activeGrade = mergedDs.grades.find(
      (g) => g.student_id === 'stud-1' && g.assessment_id === 'ass-1'
    );
    expect(activeGrade).toBeDefined();
    expect(activeGrade?.percent_value).toBe(90);
    expect(activeGrade?.raw_points).toBe(27);
    expect(activeGrade?.comment).toBe('Sehr gut lokal');

    // No duplicate conflict copy created! Clean single dataset merge
    expect(conflictCopy).toBeUndefined();
  });

  it('keeps local class metadata and config in active merged dataset', () => {
    const { mergedDs } = mergeClassroomDatasets(baseLocalDs, baseServerDs);
    expect(mergedDs.description).toBe('Lokale Beschreibung');
    expect(mergedDs.config.enable_student_levels).toBe(true);
  });

  it('merges new local student and new server student without loss', () => {
    const localWithNewStudent: ClassroomSubjectDataset = {
      ...baseLocalDs,
      students: [
        ...baseLocalDs.students,
        { id: 'stud-local-2', name: 'Anna Lokal', level: 'E', is_not_graded: false },
      ],
    };

    const serverWithNewStudent: ClassroomSubjectDataset = {
      ...baseServerDs,
      students: [
        ...baseServerDs.students,
        { id: 'stud-server-3', name: 'Ben Server', level: 'G', is_not_graded: false },
      ],
    };

    const { mergedDs } = mergeClassroomDatasets(localWithNewStudent, serverWithNewStudent);
    const ids = mergedDs.students.map((s) => s.id);
    expect(ids).toContain('stud-1');
    expect(ids).toContain('stud-local-2');
    expect(ids).toContain('stud-server-3');
  });

  it('merges new local assessment and new server assessment', () => {
    const localWithAss: ClassroomSubjectDataset = {
      ...baseLocalDs,
      assessments: [
        ...baseLocalDs.assessments,
        {
          id: 'ass-local-2',
          category_id: 'cat-1',
          title: 'HÜ 1 Lokal',
          term_id: 'hj1',
          weight: 0.5,
          input_mode: 'points',
          max_points: 10,
        },
      ],
    };

    const serverWithAss: ClassroomSubjectDataset = {
      ...baseServerDs,
      assessments: [
        ...baseServerDs.assessments,
        {
          id: 'ass-server-3',
          category_id: 'cat-1',
          title: 'Mündlich Server',
          term_id: 'hj1',
          weight: 0.5,
          input_mode: 'points',
          max_points: 15,
        },
      ],
    };

    const { mergedDs } = mergeClassroomDatasets(localWithAss, serverWithAss);
    const assIds = mergedDs.assessments.map((a) => a.id);
    expect(assIds).toContain('ass-1');
    expect(assIds).toContain('ass-local-2');
    expect(assIds).toContain('ass-server-3');
  });

  it('fills empty server grade with non-empty local grade and vice-versa without collision flag', () => {
    const localWithGrades: ClassroomSubjectDataset = {
      ...baseLocalDs,
      grades: [
        {
          student_id: 'stud-1',
          assessment_id: 'ass-1',
          status: 'graded',
          percent_value: 85,
          raw_points: 25.5,
          direct_grade_value: null,
          comment: '',
        },
        {
          student_id: 'stud-1',
          assessment_id: 'ass-2',
          status: 'graded',
          percent_value: null,
          raw_points: null,
          direct_grade_value: null,
          comment: null,
        },
      ],
    };

    const serverWithGrades: ClassroomSubjectDataset = {
      ...baseServerDs,
      grades: [
        {
          student_id: 'stud-1',
          assessment_id: 'ass-1',
          status: 'graded',
          percent_value: null,
          raw_points: null,
          direct_grade_value: null,
          comment: null,
        },
        {
          student_id: 'stud-1',
          assessment_id: 'ass-2',
          status: 'graded',
          percent_value: 95,
          raw_points: 28.5,
          direct_grade_value: null,
          comment: 'Vom Server',
        },
      ],
    };

    const { mergedDs, hadGradeCollisions, conflictCopy } = mergeClassroomDatasets(
      localWithGrades,
      serverWithGrades
    );

    expect(hadGradeCollisions).toBe(false);
    expect(conflictCopy).toBeUndefined();

    const g1 = mergedDs.grades.find((g) => g.assessment_id === 'ass-1');
    expect(g1?.percent_value).toBe(85);

    const g2 = mergedDs.grades.find((g) => g.assessment_id === 'ass-2');
    expect(g2?.percent_value).toBe(95);
    expect(g2?.comment).toBe('Vom Server');
  });

  it('merges students and rebinds grades when student names match but IDs differ', () => {
    const localWithSameStudentName: ClassroomSubjectDataset = {
      ...baseLocalDs,
      students: [
        { id: 'local-stu-id-999', name: 'Max Mustermann', level: 'E', is_not_graded: false },
      ],
      grades: [
        {
          student_id: 'local-stu-id-999',
          assessment_id: 'ass-1',
          status: 'graded',
          percent_value: 88,
          raw_points: 26.4,
          direct_grade_value: null,
          comment: 'Neu lokal eingetragen',
        },
      ],
    };

    const serverWithSameStudentName: ClassroomSubjectDataset = {
      ...baseServerDs,
      students: [
        { id: 'stud-1', name: 'Max Mustermann', level: 'M', is_not_graded: false },
      ],
      grades: [],
    };

    const { mergedDs } = mergeClassroomDatasets(localWithSameStudentName, serverWithSameStudentName);
    expect(mergedDs.students).toHaveLength(1);
    expect(mergedDs.students[0].id).toBe('stud-1');
    expect(mergedDs.students[0].level).toBe('E');

    // Grade must be bound to canonical student ID 'stud-1'
    expect(mergedDs.grades).toHaveLength(1);
    expect(mergedDs.grades[0].student_id).toBe('stud-1');
    expect(mergedDs.grades[0].percent_value).toBe(88);
  });
});

describe('reconcileWorkspaceDatasets - Smart Workspace Merging & Deduplication', () => {
  const realClassA: ClassroomSubjectDataset = {
    id: 'c1a55000-0000-4000-8000-000000000001',
    schoolName: 'Schule 1',
    schoolYear: '2026/2027',
    className: '10a',
    subjectName: 'Mathematik',
    shortName: 'M10a',
    description: '',
    config: {
      scale_id: 'de_classic_1_to_6',
      weighting_mode: 'category_buckets',
      scale_empty_categories: true,
      enable_student_levels: false,
      level_threshold_offsets: {},
      custom_thresholds: null,
    },
    categories: [],
    assessments: [],
    students: [{ id: 's1', name: 'Student 1', level: null, is_not_graded: false }],
    grades: [],
    reportCardOverrides: {},
  };

  const starterPlaceholder: ClassroomSubjectDataset = {
    id: '6f1f2e7b-f342-4aff-ab2f-421d332edde1',
    schoolName: 'Meine Schule',
    schoolYear: '2026/2027',
    className: 'Meine erste Klasse',
    subjectName: 'Neues Fach',
    shortName: 'NEU 1',
    description: 'Eigener verschlüsselter Arbeitsbereich',
    config: {
      scale_id: 'de_classic_1_to_6',
      weighting_mode: 'category_buckets',
      scale_empty_categories: true,
      enable_student_levels: false,
      level_threshold_offsets: {},
      custom_thresholds: null,
    },
    categories: [],
    assessments: [],
    students: [],
    grades: [],
    reportCardOverrides: {},
  };

  it('prunes empty starter placeholder and queues its envelope for server deletion when real classes exist', () => {
    const { reconciledClasses, obsoleteServerIds } = reconcileWorkspaceDatasets(
      [realClassA],
      [realClassA, starterPlaceholder],
      'user-123'
    );

    expect(reconciledClasses).toHaveLength(1);
    expect(reconciledClasses[0].id).toBe(realClassA.id);
    expect(obsoleteServerIds).toContain(starterPlaceholder.id);
  });

  it('deduplicates classes by matching (className + subjectName) even when UUIDs differ', () => {
    const offlineClassWithDifferentId: ClassroomSubjectDataset = {
      ...realClassA,
      id: '99999999-9999-4000-8000-999999999999',
      className: '10a ', // trailing space
      students: [{ id: 's2', name: 'Student 2 Offline', level: null, is_not_graded: false }],
    };

    const { reconciledClasses, obsoleteServerIds } = reconcileWorkspaceDatasets(
      [offlineClassWithDifferentId],
      [realClassA],
      'user-123'
    );

    expect(reconciledClasses).toHaveLength(1);
    expect(reconciledClasses[0].id).toBe(realClassA.id);
    expect(reconciledClasses[0].className).toBe('10a');
    // Both students must be merged without creating duplicate class
    const studentNames = reconciledClasses[0].students.map((s) => s.name);
    expect(studentNames).toContain('Student 1');
    expect(studentNames).toContain('Student 2 Offline');
  });

  it('absorbs legacy "(Cloud-Kopie vor Merge)" classes back into the base class and deletes copy envelope', () => {
    const conflictCopyOnServer: ClassroomSubjectDataset = {
      ...realClassA,
      id: 'conflict-copy-uuid-456',
      className: '10a (Cloud-Kopie vor Merge)',
      students: [{ id: 's_conflict', name: 'Conflict Student', level: null, is_not_graded: false }],
    };

    const { reconciledClasses, obsoleteServerIds } = reconcileWorkspaceDatasets(
      [realClassA],
      [realClassA, conflictCopyOnServer],
      'user-123'
    );

    expect(reconciledClasses).toHaveLength(1);
    expect(reconciledClasses[0].id).toBe(realClassA.id);
    expect(reconciledClasses[0].className).toBe('10a');
    expect(obsoleteServerIds).toContain('conflict-copy-uuid-456');

    const studentNames = reconciledClasses[0].students.map((s) => s.name);
    expect(studentNames).toContain('Student 1');
    expect(studentNames).toContain('Conflict Student');
  });

  it('cleans conflict suffix helper properly', () => {
    expect(cleanConflictSuffix('Klasse 10b (Cloud-Kopie vor Merge)')).toBe('Klasse 10b');
    expect(cleanConflictSuffix('Klasse 9a (Cloud-Kopie)')).toBe('Klasse 9a');
    expect(cleanConflictSuffix('Mathematik (Kopie vor Merge)')).toBe('Mathematik');
    expect(cleanConflictSuffix('Normal Class')).toBe('Normal Class');
  });
});
