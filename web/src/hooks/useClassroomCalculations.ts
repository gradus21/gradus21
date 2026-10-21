import { useMemo, useState } from 'react';
import {
  AssessmentConfig,
  AssessmentInputMode,
  buildCurveThresholdsFromMainCutoffs,
  ClassroomSubjectDataset,
  GradeEntry,
  GradeThreshold,
  StudentProfile,
  TermFilterId,
} from '../data/demoClasses';
import {
  wasm_calculate_class_report,
  wasm_simulate_needed_score_v2,
} from '../wasm-pkg/gradus21_core';
import { GlobalTemplateRecord } from '../components/admin/CentralTemplatesTab';
import { ClassCalculationReport, StudentCalculatedSummary } from '../types/workspace';

export interface UseClassroomCalculationsParams {
  wasmReady: boolean;
  activeDataset: ClassroomSubjectDataset;
  updateSubjectConfig: (updater: (ds: ClassroomSubjectDataset) => ClassroomSubjectDataset) => void;
  activeTerm: TermFilterId;
  selectedAssessmentId: string;
  selectedStudentId: string;
  showArchivedInMatrix: boolean;
  simCategoryId: string;
  simTargetPercent: number;
}

export function useClassroomCalculations({
  wasmReady,
  activeDataset,
  updateSubjectConfig,
  activeTerm,
  selectedAssessmentId,
  selectedStudentId,
  showArchivedInMatrix,
  simCategoryId,
  simTargetPercent,
}: UseClassroomCalculationsParams) {
  // Curve Cutoffs & Templates
  const [curvePresetKey, setCurvePresetKey] = useState<string>('standard');
  const [curveCutoffs, setCurveCutoffs] = useState<{
    n1: number;
    n2: number;
    n3: number;
    n4: number;
    n5: number;
  }>({
    n1: 92,
    n2: 81,
    n3: 67,
    n4: 50,
    n5: 30,
  });

  const applyCurveCutoffs = (
    nextCutoffs: { n1: number; n2: number; n3: number; n4: number; n5: number },
    presetName?: string
  ) => {
    setCurveCutoffs(nextCutoffs);
    if (presetName) setCurvePresetKey(presetName);
    const thresholds = buildCurveThresholdsFromMainCutoffs(nextCutoffs);
    updateSubjectConfig((ds) => ({
      ...ds,
      config: { ...ds.config, custom_thresholds: thresholds },
    }));
  };

  const applyGlobalCurveTemplate = (tpl: GlobalTemplateRecord) => {
    setCurvePresetKey(tpl.title);
    if (tpl.payload?.cutoffs) {
      applyCurveCutoffs(tpl.payload.cutoffs, tpl.title);
    }
  };

  const applyGlobalWeightingTemplate = (tpl: GlobalTemplateRecord) => {
    updateSubjectConfig((ds) => ({
      ...ds,
      config: {
        ...ds.config,
        weighting_mode: tpl.payload?.weighting_mode || ds.config.weighting_mode,
      },
      categories: tpl.payload?.categories || ds.categories,
    }));
  };

  const currentLevelOffsets = useMemo(
    () => ({
      G: activeDataset.config.level_threshold_offsets?.G ?? -5,
      M: activeDataset.config.level_threshold_offsets?.M ?? 0,
      E: activeDataset.config.level_threshold_offsets?.E ?? 3,
    }),
    [activeDataset.config.level_threshold_offsets]
  );
  const isDifferentiationEnabled = activeDataset.config.enable_student_levels ?? true;

  const toggleStudentLevelsEnabled = (enabled: boolean) => {
    updateSubjectConfig((ds) => ({
      ...ds,
      config: { ...ds.config, enable_student_levels: enabled },
    }));
  };

  const updateLevelOffset = (level: 'G' | 'M' | 'E', offset: number) => {
    updateSubjectConfig((ds) => ({
      ...ds,
      config: {
        ...ds.config,
        level_threshold_offsets: {
          ...currentLevelOffsets,
          [level]: offset,
        },
      },
    }));
  };

  const applyDifferentiationPreset = (
    offsets: { G: number; M: number; E: number },
    enable = true
  ) => {
    updateSubjectConfig((ds) => ({
      ...ds,
      config: {
        ...ds.config,
        enable_student_levels: enable,
        level_threshold_offsets: offsets,
      },
    }));
  };

  const activeFineThresholds: GradeThreshold[] = useMemo(() => {
    if (
      activeDataset.config?.custom_thresholds &&
      activeDataset.config.custom_thresholds.length > 0
    ) {
      return activeDataset.config.custom_thresholds;
    }
    return buildCurveThresholdsFromMainCutoffs(curveCutoffs);
  }, [activeDataset.config?.custom_thresholds, curveCutoffs]);

  // WASM Calculations
  const calculationReport = useMemo(() => {
    if (!wasmReady) return null;
    try {
      const normalizedStudents = activeDataset.students.map((s) => ({
        ...s,
        is_archived: Boolean(s.is_archived),
      }));
      const normalizedConfig = {
        scale_id: activeDataset.config?.scale_id || 'de_classic_1_to_6',
        weighting_mode: activeDataset.config?.weighting_mode || 'category_buckets',
        scale_empty_categories: activeDataset.config?.scale_empty_categories ?? true,
        enable_student_levels: activeDataset.config?.enable_student_levels ?? true,
        level_threshold_offsets: activeDataset.config?.level_threshold_offsets || {
          G: -5,
          M: 0,
          E: 3,
        },
        custom_thresholds:
          activeDataset.config?.custom_thresholds &&
          activeDataset.config.custom_thresholds.length > 0
            ? activeDataset.config.custom_thresholds
            : null,
      };
      const normalizedAssessments = activeDataset.assessments.map((a) => ({
        ...a,
        input_mode: a.input_mode || 'percent',
      }));
      const payload = JSON.stringify({
        config: normalizedConfig,
        categories: activeDataset.categories,
        assessments: normalizedAssessments,
        students: normalizedStudents,
        grades: activeDataset.grades,
        term_filter: activeTerm,
      });
      const resultJson = wasm_calculate_class_report(payload);
      return JSON.parse(resultJson) as ClassCalculationReport;
    } catch (e) {
      console.error('WASM calculation error:', e);
      return null;
    }
  }, [wasmReady, activeDataset, activeTerm]);

  const summaryByStudentId = useMemo(() => {
    const map = new Map<string, StudentCalculatedSummary>();
    if (calculationReport?.student_summaries) {
      for (const summary of calculationReport.student_summaries) {
        map.set(summary.student_id, summary);
      }
    }
    return map;
  }, [calculationReport]);

  const visibleStudents = useMemo(
    () =>
      activeDataset.students.filter((s) =>
        showArchivedInMatrix ? true : !s.is_archived
      ),
    [activeDataset.students, showArchivedInMatrix]
  );

  const archivedCount = useMemo(
    () => activeDataset.students.filter((s) => s.is_archived).length,
    [activeDataset.students]
  );

  const activeStudent =
    visibleStudents.find((s) => s.id === selectedStudentId) ||
    visibleStudents[0] ||
    activeDataset.students[0];
  const activeStudentSummary = activeStudent
    ? summaryByStudentId.get(activeStudent.id)
    : undefined;

  const termAssessments = useMemo(
    () =>
      activeDataset.assessments.filter((a) =>
        activeTerm === 'all' ? true : a.term_id === activeTerm
      ),
    [activeDataset.assessments, activeTerm]
  );

  const activeAssessment =
    termAssessments.find((a) => a.id === selectedAssessmentId) ||
    termAssessments[0] ||
    activeDataset.assessments[0];

  const simulatedNeededPercent: number | null = useMemo(() => {
    if (!wasmReady || !activeStudentSummary || !activeStudent) return null;
    try {
      const levelOffset =
        activeDataset.config.enable_student_levels && activeStudent?.level
          ? activeDataset.config.level_threshold_offsets[activeStudent.level] ?? 0
          : 0;
      const effectiveTargetPercent = Math.max(0, Math.min(100, simTargetPercent + levelOffset));

      const simInput = {
        config: activeDataset.config,
        categories: activeDataset.categories,
        assessments: activeDataset.assessments,
        grades: activeDataset.grades,
        student: activeStudent,
        current_summary: activeStudentSummary,
        target_category_id: simCategoryId,
        target_overall_percent: effectiveTargetPercent,
        term_filter: activeTerm === 'all' ? null : activeTerm,
        simulated_weight: 1.0,
        simulated_max_points: 20.0,
      };

      const val = wasm_simulate_needed_score_v2(JSON.stringify(simInput));
      return typeof val === 'number' ? val : null;
    } catch {
      return null;
    }
  }, [
    wasmReady,
    activeStudentSummary,
    activeStudent,
    activeDataset.config,
    activeDataset.categories,
    activeDataset.assessments,
    activeDataset.grades,
    simCategoryId,
    simTargetPercent,
    activeTerm,
  ]);

  // Student & Grade Actions
  const updateGradeEntry = (
    studentId: string,
    assessmentId: string,
    inputValue: string,
    inputType: 'percent' | 'points' | 'grade_scale' | 'excused'
  ) => {
    const assessment = activeDataset.assessments.find((a) => a.id === assessmentId);
    const maxPts = assessment?.max_points || 15;

    updateSubjectConfig((ds) => {
      const filtered = ds.grades.filter(
        (g) => !(g.student_id === studentId && g.assessment_id === assessmentId)
      );

      const trimmed = inputValue.trim().toUpperCase();
      if (trimmed === '' || trimmed === '-') {
        return { ...ds, grades: filtered };
      }

      if (inputType === 'excused' || trimmed === 'K' || trimmed === 'A') {
        const newEntry: GradeEntry = {
          student_id: studentId,
          assessment_id: assessmentId,
          status: 'excused',
          percent_value: null,
          raw_points: null,
          direct_grade_value: null,
          comment: 'Entschuldigt / Attest',
        };
        return { ...ds, grades: [...filtered, newEntry] };
      }

      const num = parseFloat(trimmed.replace(',', '.'));
      if (isNaN(num)) return ds;

      if (inputType === 'grade_scale') {
        const newEntry: GradeEntry = {
          student_id: studentId,
          assessment_id: assessmentId,
          status: 'graded',
          percent_value: null,
          raw_points: null,
          direct_grade_value: num,
          comment: null,
        };
        return { ...ds, grades: [...filtered, newEntry] };
      }

      const pct =
        inputType === 'points'
          ? Math.max(0, Math.min(100, Math.round((num / maxPts) * 1000) / 10))
          : Math.max(0, Math.min(100, num));
      const pts =
        inputType === 'points' ? num : Math.round(((pct / 100) * maxPts) * 10) / 10;

      const newEntry: GradeEntry = {
        student_id: studentId,
        assessment_id: assessmentId,
        status: 'graded',
        percent_value: pct,
        raw_points: pts,
        direct_grade_value: null,
        comment: null,
      };
      return { ...ds, grades: [...filtered, newEntry] };
    });
  };

  const updateReportCardOverride = (studentId: string, gradeVal: string, reason?: string) => {
    updateSubjectConfig((ds) => {
      const prevOverrides = ds.reportCardOverrides || {};
      const stuOverride = prevOverrides[studentId] || {};
      return {
        ...ds,
        reportCardOverrides: {
          ...prevOverrides,
          [studentId]: {
            ...stuOverride,
            [activeTerm]: gradeVal.trim() || undefined,
            reason: reason !== undefined ? reason : stuOverride.reason,
          },
        },
      };
    });
  };

  const cycleStudentLevel = (studentId: string) => {
    const order = ['G', 'M', 'E'];
    updateSubjectConfig((ds) => ({
      ...ds,
      students: ds.students.map((s) => {
        if (s.id !== studentId) return s;
        const idx = order.indexOf(s.level || 'M');
        return { ...s, level: order[(idx + 1) % order.length] };
      }),
    }));
  };

  const toggleStudentNotGraded = (studentId: string) => {
    updateSubjectConfig((ds) => ({
      ...ds,
      students: ds.students.map((s) =>
        s.id === studentId ? { ...s, is_not_graded: !s.is_not_graded } : s
      ),
    }));
  };

  const toggleStudentArchived = (studentId: string) => {
    updateSubjectConfig((ds) => ({
      ...ds,
      students: ds.students.map((s) => {
        if (s.id !== studentId) return s;
        const willBeArchived = !s.is_archived;
        return {
          ...s,
          is_archived: willBeArchived,
          archived_at: willBeArchived ? new Date().toISOString() : undefined,
        };
      }),
    }));
  };

  const handleAddAssessment = (
    title: string,
    categoryId: string,
    inputMode: AssessmentInputMode,
    maxPoints?: number
  ) => {
    const newId = `assess_${Date.now()}`;
    const newAssess: AssessmentConfig = {
      id: newId,
      category_id: categoryId || activeDataset.categories[0].id,
      title: title.trim(),
      term_id: activeTerm === 'all' ? 'hj1' : activeTerm,
      weight: 1.0,
      input_mode: inputMode,
      max_points: maxPoints ?? (inputMode === 'points' ? 20 : 15),
    };
    updateSubjectConfig((ds) => ({
      ...ds,
      assessments: [...ds.assessments, newAssess],
    }));
  };

  const handleAddStudent = (name: string, level: 'G' | 'M' | 'E') => {
    const newStu: StudentProfile = {
      id: `stu_${Date.now()}`,
      name: name.trim(),
      level: level,
      is_not_graded: false,
      is_archived: false,
    };
    updateSubjectConfig((ds) => ({
      ...ds,
      students: [...ds.students, newStu],
    }));
  };

  return {
    curvePresetKey,
    setCurvePresetKey,
    curveCutoffs,
    applyCurveCutoffs,
    applyGlobalCurveTemplate,
    applyGlobalWeightingTemplate,
    currentLevelOffsets,
    isDifferentiationEnabled,
    toggleStudentLevelsEnabled,
    updateLevelOffset,
    applyDifferentiationPreset,
    activeFineThresholds,
    calculationReport,
    summaryByStudentId,
    visibleStudents,
    archivedCount,
    activeStudent,
    activeStudentSummary,
    termAssessments,
    activeAssessment,
    simulatedNeededPercent,
    updateGradeEntry,
    updateReportCardOverride,
    cycleStudentLevel,
    toggleStudentNotGraded,
    toggleStudentArchived,
    handleAddAssessment,
    handleAddStudent,
  };
}
