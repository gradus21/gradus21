import React, { useState } from 'react';
import {
  CategoryConfig,
  AssessmentConfig,
  AssessmentInputMode,
  ClassroomSubjectDataset,
  StudentProfile,
} from '../data/demoClasses';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Layers,
  PieChart,
  Plus,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';

export interface ClassManagementModalProps {
  dataset: ClassroomSubjectDataset;
  canDeleteClass: boolean;
  initialTab?: 'students' | 'assessments' | 'meta';
  highlightAssessmentId?: string;
  onUpdateDataset: (updater: (ds: ClassroomSubjectDataset) => ClassroomSubjectDataset) => void;
  onDeleteClass: (classId: string) => void;
  onClose: () => void;
  onOpenConfigurator?: () => void;
}

export const ClassManagementModal: React.FC<ClassManagementModalProps> = ({
  dataset,
  canDeleteClass,
  initialTab = 'students',
  highlightAssessmentId,
  onUpdateDataset,
  onDeleteClass,
  onClose,
  onOpenConfigurator,
}) => {
  const [activeTab, setActiveTab] = useState<'students' | 'assessments' | 'meta'>(initialTab);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentLevel, setNewStudentLevel] = useState<'G' | 'M' | 'E'>('M');
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(false);

  // Dedicated assessment creator form state (supports 1 or batch N)
  const [newAssessTitle, setNewAssessTitle] = useState('');
  const [newAssessCategoryId, setNewAssessCategoryId] = useState(dataset.categories[0]?.id || '');
  const [newAssessTermId, setNewAssessTermId] = useState<'hj1' | 'hj2'>('hj1');
  const [newAssessCount, setNewAssessCount] = useState<number>(1);
  const [newAssessInputMode, setNewAssessInputMode] = useState<AssessmentInputMode>('percent');
  const [newAssessMaxPoints, setNewAssessMaxPoints] = useState<number>(15);
  const [newAssessWeight, setNewAssessWeight] = useState<number>(1.0);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [studentPendingDelete, setStudentPendingDelete] = useState<StudentProfile | null>(null);
  const [assessmentPendingDelete, setAssessmentPendingDelete] = useState<AssessmentConfig | null>(null);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<CategoryConfig | null>(null);
  const [pendingBulkClean, setPendingBulkClean] = useState(false);
  const [retentionDays] = useState(30);
  const [showCategoryEditor, setShowCategoryEditor] = useState(false);

  const activeStudents = dataset.students.filter((s) => !s.is_archived);
  const archivedStudents = dataset.students.filter((s) => s.is_archived);

  const getStudentGradeCount = (studentId: string) => {
    return dataset.grades.filter(
      (g) =>
        g.student_id === studentId &&
        (g.raw_points !== null ||
          g.percent_value !== null ||
          g.direct_grade_value !== null ||
          (g.comment !== null && g.comment.trim() !== ''))
    ).length;
  };

  const getAssessmentGradeCount = (assessmentId: string) => {
    return (dataset.grades || []).filter(
      (g) =>
        g.assessment_id === assessmentId &&
        (g.raw_points !== null ||
          g.percent_value !== null ||
          g.direct_grade_value !== null ||
          (g.comment !== null && g.comment.trim() !== ''))
    ).length;
  };

  const getCategoryStats = (catId: string) => {
    const assessments = dataset.assessments.filter((a) => a.category_id === catId);
    const assessIds = new Set(assessments.map((a) => a.id));
    const gradeCount = (dataset.grades || []).filter(
      (g) =>
        assessIds.has(g.assessment_id) &&
        (g.raw_points !== null ||
          g.percent_value !== null ||
          g.direct_grade_value !== null ||
          (g.comment !== null && g.comment.trim() !== ''))
    ).length;
    return { assessmentCount: assessments.length, gradeCount };
  };

  const totalClassGradesCount = (dataset.grades || []).filter(
    (g) =>
      g.raw_points !== null ||
      g.percent_value !== null ||
      g.direct_grade_value !== null ||
      (g.comment !== null && g.comment.trim() !== '')
  ).length;

  const getRetentionInfo = (archivedAt?: string) => {
    if (!archivedAt) {
      return {
        formattedDate: 'Datum unbekannt',
        daysArchived: retentionDays + 1,
        isExpired: true,
        daysRemaining: 0,
      };
    }
    const archivedTime = new Date(archivedAt).getTime();
    if (isNaN(archivedTime)) {
      return {
        formattedDate: 'Datum unbekannt',
        daysArchived: retentionDays + 1,
        isExpired: true,
        daysRemaining: 0,
      };
    }
    const now = Date.now();
    const diffMs = Math.max(0, now - archivedTime);
    const daysArchived = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, retentionDays - daysArchived);
    const isExpired = daysArchived >= retentionDays;
    const formattedDate = new Date(archivedAt).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return { formattedDate, daysArchived, isExpired, daysRemaining };
  };

  const expiredArchivedStudents = archivedStudents.filter(
    (s) => getRetentionInfo(s.archived_at).isExpired
  );

  const extendRetentionForExpired = () => {
    const count = expiredArchivedStudents.length;
    onUpdateDataset((ds) => ({
      ...ds,
      students: ds.students.map((s) =>
        s.is_archived && getRetentionInfo(s.archived_at).isExpired
          ? { ...s, archived_at: new Date().toISOString() }
          : s
      ),
    }));
    showToast(`Aufbewahrungsfrist für ${count} Schüler:in(nen) um ${retentionDays} Tage verlängert.`);
  };

  const bulkDeleteExpiredStudents = () => {
    const expiredIds = new Set(expiredArchivedStudents.map((s) => s.id));
    onUpdateDataset((ds) => {
      const nextOverrides = { ...(ds.reportCardOverrides || {}) };
      expiredIds.forEach((id) => delete nextOverrides[id]);
      return {
        ...ds,
        students: ds.students.filter((s) => !expiredIds.has(s.id)),
        grades: ds.grades.filter((g) => !expiredIds.has(g.student_id)),
        reportCardOverrides: nextOverrides,
      };
    });
    setPendingBulkClean(false);
    showToast(`${expiredIds.size} abgelaufene archivierte Schüler:innen wurden endgültig bereinigt.`);
  };

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // --- Student Actions ---
  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    const newStu: StudentProfile = {
      id: `stu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newStudentName.trim(),
      level: newStudentLevel,
      is_not_graded: false,
      is_archived: false,
    };
    onUpdateDataset((ds) => ({
      ...ds,
      students: [...ds.students, newStu],
    }));
    setNewStudentName('');
    showToast(`Schüler:in „${newStu.name}“ wurde hinzugefügt.`);
  };

  const updateStudentField = (studentId: string, patch: Partial<StudentProfile>) => {
    onUpdateDataset((ds) => ({
      ...ds,
      students: ds.students.map((s) => (s.id === studentId ? { ...s, ...patch } : s)),
    }));
  };

  const deleteStudentPermanently = (studentId: string, name: string) => {
    onUpdateDataset((ds) => {
      const nextOverrides = { ...(ds.reportCardOverrides || {}) };
      delete nextOverrides[studentId];
      return {
        ...ds,
        students: ds.students.filter((s) => s.id !== studentId),
        grades: ds.grades.filter((g) => g.student_id !== studentId),
        reportCardOverrides: nextOverrides,
      };
    });
    showToast(`„${name}“ und zugehörige Noten wurden endgültig gelöscht.`);
  };

  // --- Category Actions ---
  const updateCategoryField = (categoryId: string, patch: Partial<CategoryConfig>) => {
    onUpdateDataset((ds) => ({
      ...ds,
      categories: ds.categories.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)),
    }));
  };

  const handleAddCategory = () => {
    const nextNum = dataset.categories.length + 1;
    const newCat: CategoryConfig = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: `Neuer Bereich ${nextNum}`,
      short_code: `B${nextNum}`,
      weight: 0.2,
      drop_lowest_count: 0,
    };
    onUpdateDataset((ds) => ({
      ...ds,
      categories: [...ds.categories, newCat],
    }));
    showToast(`Kategorie „${newCat.name}“ angelegt.`);
  };

  const handleDeleteCategory = (catId: string, name: string) => {
    if (dataset.categories.length <= 1) {
      showToast('Es muss mindestens eine Kategorie vorhanden bleiben.');
      return;
    }
    const cat = dataset.categories.find((c) => c.id === catId);
    if (cat) {
      setCategoryPendingDelete(cat);
    }
  };

  const handleConfirmDeleteCategory = () => {
    if (!categoryPendingDelete) return;
    const catId = categoryPendingDelete.id;
    const name = categoryPendingDelete.name;
    if (dataset.categories.length <= 1) {
      showToast('Es muss mindestens eine Kategorie vorhanden bleiben.');
      setCategoryPendingDelete(null);
      return;
    }
    const fallbackCatId = dataset.categories.find((c) => c.id !== catId)?.id || dataset.categories[0].id;
    onUpdateDataset((ds) => ({
      ...ds,
      categories: ds.categories.filter((c) => c.id !== catId),
      assessments: ds.assessments.map((a) =>
        a.category_id === catId ? { ...a, category_id: fallbackCatId } : a
      ),
    }));
    setCategoryPendingDelete(null);
    showToast(`Kategorie „${name}“ entfernt. Prüfungen wurden übernommen.`);
  };

  // --- Assessment / Exam Actions ---
  const updateAssessmentField = (assessmentId: string, patch: Partial<AssessmentConfig>) => {
    onUpdateDataset((ds) => ({
      ...ds,
      assessments: ds.assessments.map((a) => (a.id === assessmentId ? { ...a, ...patch } : a)),
    }));
  };

  const deleteAssessment = (assessmentId: string, title: string) => {
    onUpdateDataset((ds) => ({
      ...ds,
      assessments: ds.assessments.filter((a) => a.id !== assessmentId),
      grades: ds.grades.filter((g) => g.assessment_id !== assessmentId),
    }));
    showToast(`Prüfungsspalte „${title}“ wurde entfernt.`);
  };

  const handleConfirmDeleteAssessment = () => {
    if (!assessmentPendingDelete) return;
    deleteAssessment(assessmentPendingDelete.id, assessmentPendingDelete.title);
    setAssessmentPendingDelete(null);
  };

  const handleCreateAssessments = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssessTitle.trim()) return;
    const cat = dataset.categories.find((c) => c.id === newAssessCategoryId) || dataset.categories[0];
    const count = Math.max(1, Math.min(20, newAssessCount || 1));
    const baseTitle = newAssessTitle.trim();
    const toAdd: AssessmentConfig[] = [];

    for (let i = 1; i <= count; i++) {
      toAdd.push({
        id: `assess_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        category_id: cat ? cat.id : (dataset.categories[0]?.id || ''),
        title: count === 1 ? baseTitle : `${baseTitle} ${i}`,
        term_id: newAssessTermId,
        weight: newAssessWeight,
        input_mode: newAssessInputMode,
        max_points: newAssessInputMode === 'grade_scale' ? null : (newAssessMaxPoints || 15),
      });
    }

    onUpdateDataset((ds) => ({
      ...ds,
      assessments: [...ds.assessments, ...toAdd],
    }));
    setNewAssessTitle('');
    setNewAssessCount(1);
    showToast(count === 1 ? `Prüfung „${baseTitle}“ angelegt.` : `${count} Prüfungen angelegt.`);
  };

  const addSingleAssessment = (categoryId: string, termId: 'hj1' | 'hj2') => {
    const cat = dataset.categories.find((c) => c.id === categoryId) || dataset.categories[0];
    const existingInCat = dataset.assessments.filter(
      (a) => a.category_id === cat.id && a.term_id === termId
    );
    const nextNum = existingInCat.length + 1;
    const newAssess: AssessmentConfig = {
      id: `assess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category_id: cat.id,
      title: `${cat.short_code} ${nextNum}${termId === 'hj2' ? ' (HJ2)' : ''}`,
      term_id: termId,
      weight: 1.0,
      input_mode: 'percent',
      max_points: cat.short_code.toLowerCase().includes('lnw') ? 45 : 15,
    };
    onUpdateDataset((ds) => ({
      ...ds,
      assessments: [...ds.assessments, newAssess],
    }));
    showToast(`Spalte „${newAssess.title}“ angelegt.`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div
        className="max-w-5xl lg:max-w-6xl w-full rounded-2xl border p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-5 max-h-[95vh] sm:max-h-[90vh] flex flex-col"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b pb-4 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
            >
              Klasse & Prüfungen verwalten
            </span>
            <h3 className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
              {dataset.className} · {dataset.subjectName} ({dataset.schoolYear})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border transition hover:opacity-80 inline-flex items-center justify-center shrink-0"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 shrink-0">
          <div
            className="flex gap-1 p-1 rounded-xl border text-xs font-bold max-w-full overflow-x-auto"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <button
              onClick={() => setActiveTab('students')}
              className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
                activeTab === 'students' ? 'text-white shadow-sm' : ''
              }`}
              style={{
                backgroundColor: activeTab === 'students' ? 'var(--primary-500)' : 'transparent',
              }}
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                Schüler ({activeStudents.length}
                {archivedStudents.length > 0 ? ` · +${archivedStudents.length}` : ''})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('assessments')}
              className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
                activeTab === 'assessments' ? 'text-white shadow-sm' : ''
              }`}
              style={{
                backgroundColor: activeTab === 'assessments' ? 'var(--primary-500)' : 'transparent',
              }}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Prüfungen ({dataset.assessments.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('meta')}
              className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg flex items-center gap-1.5 transition shrink-0 ${
                activeTab === 'meta' ? 'text-white shadow-sm' : ''
              }`}
              style={{
                backgroundColor: activeTab === 'meta' ? 'var(--primary-500)' : 'transparent',
              }}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Stammdaten</span>
            </button>
          </div>

          {feedbackMsg && (
            <div className="px-3 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-700 text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{feedbackMsg}</span>
            </div>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* =================================================================
              TAB 1: SCHÜLER:INNENLISTE BEARBEITEN, ARCHIVIEREN & LÖSCHEN
             ================================================================= */}
          {activeTab === 'students' && (
            <div className="space-y-5">
              <form
                onSubmit={handleAddStudent}
                className="p-4 rounded-2xl border flex flex-wrap items-end gap-3"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Neue:n Schüler:in zur Klasse hinzufügen
                  </label>
                  <input
                    type="text"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="Vorname / Nachname (z. B. Lukas W.)"
                    className="w-full px-3 py-2 rounded-xl border text-xs bg-white dark:bg-slate-900"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                {dataset.config.enable_student_levels && (
                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Niveau
                    </label>
                    <select
                      value={newStudentLevel}
                      onChange={(e) => setNewStudentLevel(e.target.value as 'G' | 'M' | 'E')}
                      className="px-3 py-2 rounded-xl border text-xs bg-white dark:bg-slate-900"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      <option value="G">G-Niveau</option>
                      <option value="M">M-Niveau</option>
                      <option value="E">E-Niveau</option>
                    </select>
                  </div>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Schüler:in aufnehmen</span>
                </button>
              </form>

              {/* Active Students Table */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Aktive Schüler:innen in {dataset.className} ({activeStudents.length})
                </div>
                <div
                  className="rounded-xl border divide-y"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {activeStudents.map((stu, idx) => (
                    <div
                      key={stu.id}
                      className="p-2.5 px-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                        <span className="font-mono opacity-45 w-5">{idx + 1}.</span>
                        <input
                          type="text"
                          value={stu.name}
                          onChange={(e) => updateStudentField(stu.id, { name: e.target.value })}
                          className="px-2.5 py-1 rounded-lg border font-semibold bg-transparent flex-1"
                          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                        {dataset.config.enable_student_levels && (
                          <select
                            value={stu.level || 'M'}
                            onChange={(e) => updateStudentField(stu.id, { level: e.target.value })}
                            className="px-2 py-1 rounded-lg border font-mono text-[11px] bg-transparent"
                            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                          >
                            <option value="G">G</option>
                            <option value="M">M</option>
                            <option value="E">E</option>
                          </select>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateStudentField(stu.id, { is_not_graded: !stu.is_not_graded })
                          }
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${
                            stu.is_not_graded
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                          title="Ohne Bewertung (z. B. DaZ / Inklusion) – zählt nicht in den Klassenschnitt"
                        >
                          {stu.is_not_graded ? 'Ohne Bewertung (o.B.)' : 'Regulär bewertet'}
                        </button>

                        <button
                          onClick={() => {
                            updateStudentField(stu.id, {
                              is_archived: true,
                              archived_at: new Date().toISOString(),
                            });
                            showToast(
                              `„${stu.name}“ wurde archiviert (Noten bleiben im Archiv sicher erhalten).`
                            );
                          }}
                          className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          style={{ borderColor: 'var(--border-subtle)' }}
                          title="Schüler:in archivieren (z. B. bei Schulwechsel unter dem Jahr – Noten bleiben gespeichert)"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>Archivieren</span>
                        </button>

                        <button
                          onClick={() => setStudentPendingDelete(stu)}
                          className="p-1.5 rounded-lg border text-rose-600 hover:bg-rose-500/10 transition"
                          style={{ borderColor: 'var(--border-subtle)' }}
                          title="Schüler:in aus Klasse entfernen oder löschen..."
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Archived Students Section */}
              {archivedStudents.length > 0 && (
                <div className="space-y-3 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                      <Archive className="w-3.5 h-3.5" />
                      <span>Archivierte Schüler:innen ({archivedStudents.length})</span>
                    </div>
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Ausgeblendet & ohne Einfluss auf Klassenschnitt
                    </span>
                  </div>

                  {/* Proaktive Retention-Abfrage bei fälligen Datensätzen */}
                  {expiredArchivedStudents.length > 0 && (
                    <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-amber-900 dark:text-amber-200">
                            Aufbewahrungsfrist abgelaufen ({expiredArchivedStudents.length}{' '}
                            {expiredArchivedStudents.length === 1 ? 'Schüler:in' : 'Schüler:innen'} &gt; {retentionDays} Tage archiviert)
                          </div>
                          <div className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                            Möchtest du diese Daten jetzt datenschutzkonform endgültig bereinigen oder die Aufbewahrung verlängern?
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setPendingBulkClean(true)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition"
                        >
                          Jetzt bereinigen...
                        </button>
                        <button
                          onClick={extendRetentionForExpired}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 hover:bg-amber-100 transition"
                        >
                          Aufbewahrung verlängern
                        </button>
                      </div>
                    </div>
                  )}

                  <div
                    className="rounded-xl border divide-y bg-amber-500/5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {archivedStudents.map((stu) => {
                      const ret = getRetentionInfo(stu.archived_at);
                      const gradeCount = getStudentGradeCount(stu.id);
                      return (
                        <div
                          key={stu.id}
                          className="p-2.5 px-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="font-semibold line-through opacity-70"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {stu.name}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-semibold">
                              Archiviert
                            </span>
                            <span className="text-[11px] opacity-60" style={{ color: 'var(--text-secondary)' }}>
                              {stu.archived_at ? `am ${ret.formattedDate}` : 'Datum unbekannt'}
                            </span>
                            {ret.isExpired ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                Frist fällig ({ret.daysArchived} Tage)
                              </span>
                            ) : (
                              <span className="text-[10px] opacity-50">
                                (noch {ret.daysRemaining} Tage)
                              </span>
                            )}
                            {gradeCount > 0 && (
                              <span className="text-[10px] opacity-50">
                                • {gradeCount} Noten
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                updateStudentField(stu.id, {
                                  is_archived: false,
                                  archived_at: undefined,
                                });
                                showToast(`„${stu.name}“ ist wieder aktiv in der Klasse.`);
                              }}
                              className="px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 text-teal-700 bg-teal-50 dark:bg-teal-950/50 dark:text-teal-300 hover:bg-teal-100 transition"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5" />
                              <span>Wiederherstellen</span>
                            </button>
                            <button
                              onClick={() => setStudentPendingDelete(stu)}
                              className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold text-rose-600 hover:bg-rose-500/10 flex items-center gap-1 transition"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Endgültig löschen...</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =================================================================
              TAB 2: ANZAHL DER TESTS, LEISTUNGSNACHWEISE & SPALTEN VERWALTEN
             ================================================================= */}
          {activeTab === 'assessments' && (
            <div className="space-y-6">
              {/* Category Weights Banner & Transparency */}
              {(() => {
                const totalCatWeight = dataset.categories.reduce(
                  (acc, c) => acc + Math.max(0.01, c.weight),
                  0
                );
                return (
                  <div
                    className="p-4 rounded-2xl border space-y-3"
                    style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PieChart className="w-4 h-4 text-teal-600 shrink-0" />
                        <div>
                          <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                            Gewichtung der Notenbereiche (Kategorien)
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            Diese prozentuale Gewichtung fließt in die automatische Berechnung des Gesamtschnitts ein.
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCategoryEditor((prev) => !prev)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 hover:bg-teal-500/10 text-teal-700 dark:text-teal-300 transition shrink-0"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>{showCategoryEditor ? 'Kategorie-Editor schließen' : 'Kategorien & Anteile bearbeiten'}</span>
                        </button>
                        {onOpenConfigurator && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenConfigurator();
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border text-slate-600 dark:text-slate-400 hover:bg-slate-500/10 transition shrink-0 hidden sm:inline-flex"
                            style={{ borderColor: 'var(--border-subtle)' }}
                            title="Erweiterte Konfiguration (G/M/E-Schwellen etc.) öffnen"
                          >
                            <span>Konfigurator-Ansicht</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Category Editor if toggled */}
                    {showCategoryEditor ? (
                      <div
                        className="p-3.5 rounded-xl border space-y-3 bg-white dark:bg-slate-900 shadow-sm"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                            Kategorienamen, Kürzel und Gewichtungsfaktoren anpassen:
                          </span>
                          <button
                            type="button"
                            onClick={handleAddCategory}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-white flex items-center gap-1 shadow-xs"
                            style={{ backgroundColor: 'var(--primary-500)' }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Kategorie hinzufügen</span>
                          </button>
                        </div>

                        <div className="divide-y text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                          {dataset.categories.map((c) => {
                            const pct = Math.round((c.weight / totalCatWeight) * 100);
                            return (
                              <div
                                key={c.id}
                                className="py-2.5 flex flex-wrap items-center justify-between gap-2.5"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                  <input
                                    type="text"
                                    value={c.name}
                                    onChange={(e) => updateCategoryField(c.id, { name: e.target.value })}
                                    placeholder="Kategoriename"
                                    className="px-2.5 py-1 rounded-lg border font-semibold bg-transparent flex-1"
                                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                                  />
                                  <input
                                    type="text"
                                    value={c.short_code}
                                    onChange={(e) => updateCategoryField(c.id, { short_code: e.target.value })}
                                    placeholder="Kürzel"
                                    className="w-20 px-2 py-1 rounded-lg border font-mono font-bold text-center bg-transparent"
                                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                                  />
                                </div>

                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] opacity-70">Gewicht:</span>
                                    <select
                                      value={c.weight}
                                      onChange={(e) => updateCategoryField(c.id, { weight: Number(e.target.value) || 0.1 })}
                                      className="px-2 py-1 rounded-lg border font-mono text-xs bg-transparent"
                                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                                    >
                                      <option value={0.1} className="dark:bg-slate-900">0.1 (Sehr gering)</option>
                                      <option value={0.2} className="dark:bg-slate-900">0.2 (20 %)</option>
                                      <option value={0.3} className="dark:bg-slate-900">0.3 (30 %)</option>
                                      <option value={0.4} className="dark:bg-slate-900">0.4 (40 %)</option>
                                      <option value={0.5} className="dark:bg-slate-900">0.5 (50 %)</option>
                                      <option value={0.6} className="dark:bg-slate-900">0.6 (60 %)</option>
                                      <option value={0.7} className="dark:bg-slate-900">0.7 (70 %)</option>
                                      <option value={1.0} className="dark:bg-slate-900">1.0 (Normal)</option>
                                      <option value={2.0} className="dark:bg-slate-900">2.0 (Doppelt)</option>
                                    </select>
                                  </div>

                                  <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                                    = {pct}%
                                  </span>

                                  {dataset.categories.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCategory(c.id, c.name)}
                                      className="p-1.5 rounded-lg border text-rose-600 hover:bg-rose-500/10 transition"
                                      style={{ borderColor: 'var(--border-subtle)' }}
                                      title="Kategorie löschen (Prüfungen werden übertragen)"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                        {dataset.categories.map((c) => {
                          const pct = Math.round((c.weight / totalCatWeight) * 100);
                          const countHj1 = dataset.assessments.filter((a) => a.category_id === c.id && a.term_id === 'hj1').length;
                          const countHj2 = dataset.assessments.filter((a) => a.category_id === c.id && a.term_id === 'hj2').length;
                          return (
                            <div
                              key={c.id}
                              className="p-3 rounded-xl border flex flex-col justify-between gap-1 shadow-xs"
                              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                                  {c.name}
                                </span>
                                <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30 shrink-0">
                                  {pct}%
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                <span>Kürzel: <strong className="font-mono">{c.short_code}</strong></span>
                                <span>{countHj1} (HJ1) · {countHj2} (HJ2)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Form: Neue Prüfung(en) anlegen & Bewertungsart festlegen */}
              <form
                onSubmit={handleCreateAssessments}
                className="p-4 rounded-2xl border space-y-3.5"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                    <Plus className="w-4 h-4 text-teal-600" />
                    <span>Neue Prüfung anlegen & Bewertungsart festlegen</span>
                  </div>
                  <span className="text-[11px] opacity-70">
                    Erscheint sofort als Spalte in der Klassen-Matrix
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end text-xs">
                  <div className="col-span-2 sm:col-span-2 lg:col-span-2">
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Bezeichnung der Prüfung
                    </label>
                    <input
                      type="text"
                      value={newAssessTitle}
                      onChange={(e) => setNewAssessTitle(e.target.value)}
                      placeholder="z.B. Vokabeltest oder Klausur"
                      className="w-full px-3 py-2 rounded-xl border bg-transparent"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Kategorie
                    </label>
                    <select
                      value={newAssessCategoryId}
                      onChange={(e) => {
                        const catId = e.target.value;
                        setNewAssessCategoryId(catId);
                        const c = dataset.categories.find((cat) => cat.id === catId);
                        if (c?.short_code.toLowerCase().includes('lnw')) {
                          setNewAssessMaxPoints(45);
                        }
                      }}
                      className="w-full px-2.5 py-2 rounded-xl border bg-transparent font-medium"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      {dataset.categories.map((c) => (
                        <option key={c.id} value={c.id} className="dark:bg-slate-900">
                          {c.name} ({c.short_code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Halbjahr
                    </label>
                    <select
                      value={newAssessTermId}
                      onChange={(e) => setNewAssessTermId(e.target.value as 'hj1' | 'hj2')}
                      className="w-full px-2.5 py-2 rounded-xl border bg-transparent font-medium"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      <option value="hj1" className="dark:bg-slate-900">1. Halbjahr</option>
                      <option value="hj2" className="dark:bg-slate-900">2. Halbjahr</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Anzahl
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={newAssessCount}
                      onChange={(e) => setNewAssessCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className="w-full px-2.5 py-2 rounded-xl border font-mono font-bold bg-transparent text-center"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Bewertungsart
                    </label>
                    <select
                      value={newAssessInputMode}
                      onChange={(e) => setNewAssessInputMode(e.target.value as AssessmentInputMode)}
                      className="w-full px-2.5 py-2 rounded-xl border bg-transparent font-semibold"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      <option value="percent" className="dark:bg-slate-900">% Prozent</option>
                      <option value="points" className="dark:bg-slate-900">Rohpunkte</option>
                      <option value="grade_scale" className="dark:bg-slate-900">
                        {dataset.config.scale_id === 'de_oberstufe_0_to_15'
                          ? 'Notenpunkte'
                          : 'Schulnote (1–6)'}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      {newAssessInputMode === 'grade_scale' ? 'Skala' : 'Max. Pkt'}
                    </label>
                    {newAssessInputMode === 'grade_scale' ? (
                      <div className="w-full px-2.5 py-2 rounded-xl border bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono text-center text-xs">
                        {dataset.config.scale_id === 'de_oberstufe_0_to_15' ? '0–15' : '1–6'}
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={newAssessMaxPoints}
                        onChange={(e) => setNewAssessMaxPoints(Number(e.target.value) || 15)}
                        className="w-full px-2.5 py-2 rounded-xl border font-mono font-bold bg-transparent text-center"
                        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      />
                    )}
                  </div>

                  <div className="col-span-2 sm:col-span-4 lg:col-span-7 flex flex-wrap items-center justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Prüfungs-Gewichtung (in Kategorie):
                      </span>
                      <select
                        value={newAssessWeight}
                        onChange={(e) => setNewAssessWeight(Number(e.target.value))}
                        className="px-2.5 py-1 rounded-lg border text-xs bg-transparent font-mono"
                        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      >
                        <option value={0.5} className="dark:bg-slate-900">0.5x (Halbes Gewicht)</option>
                        <option value={1} className="dark:bg-slate-900">1.0x (Normal)</option>
                        <option value={1.5} className="dark:bg-slate-900">1.5x</option>
                        <option value={2} className="dark:bg-slate-900">2.0x (Doppeltes Gewicht)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={!newAssessTitle.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition disabled:opacity-50"
                      style={{ backgroundColor: 'var(--primary-500)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{newAssessCount > 1 ? `${newAssessCount} Prüfungen hinzufügen` : 'Prüfung hinzufügen'}</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Grouped by Category */}
              {(() => {
                const totalCatWeight = dataset.categories.reduce(
                  (acc, c) => acc + Math.max(0.01, c.weight),
                  0
                );
                return dataset.categories.map((cat) => {
                  const catAssessments = dataset.assessments.filter((a) => a.category_id === cat.id);
                  const catPct = Math.round((cat.weight / totalCatWeight) * 100);
                  return (
                    <div
                      key={cat.id}
                      className="rounded-2xl border p-4 space-y-3"
                      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                            {cat.name} ({cat.short_code})
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300">
                            Gewichtung: {catPct}%
                          </span>
                          <span className="text-xs font-mono opacity-70">
                            · {catAssessments.length} Spalten
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => addSingleAssessment(cat.id, 'hj1')}
                            className="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 hover:bg-teal-500/10 transition"
                            style={{
                              backgroundColor: 'var(--bg-subtle)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ 1. HJ</span>
                          </button>
                          <button
                            onClick={() => addSingleAssessment(cat.id, 'hj2')}
                            className="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 hover:bg-teal-500/10 transition"
                            style={{
                              backgroundColor: 'var(--bg-subtle)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ 2. HJ</span>
                          </button>
                        </div>
                      </div>

                      {catAssessments.length === 0 ? (
                        <div className="text-xs italic opacity-60 py-2">
                          Noch keine Prüfungen in dieser Kategorie angelegt.
                        </div>
                      ) : (
                        <div className="divide-y border rounded-xl" style={{ borderColor: 'var(--border-subtle)' }}>
                          {catAssessments.map((assess) => {
                            const isHighlighted = assess.id === highlightAssessmentId;
                            return (
                              <div
                                key={assess.id}
                                className={`p-2.5 px-3 flex flex-wrap items-center justify-between gap-3 text-xs transition ${
                                  isHighlighted
                                    ? 'bg-teal-500/15 ring-2 ring-teal-500 rounded-lg shadow-sm'
                                    : ''
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                                  {isHighlighted && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-600 text-white shrink-0">
                                      Fokus
                                    </span>
                                  )}
                                  <input
                                    type="text"
                                    value={assess.title}
                                    onChange={(e) =>
                                      updateAssessmentField(assess.id, { title: e.target.value })
                                    }
                                    className="px-2.5 py-1 rounded-lg border font-semibold bg-transparent flex-1"
                                    style={{
                                      borderColor: 'var(--border-subtle)',
                                      color: 'var(--text-primary)',
                                    }}
                                  />
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Category selector to allow reassigning/moving the assessment */}
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] opacity-70">Topf:</span>
                                    <select
                                      value={assess.category_id}
                                      onChange={(e) =>
                                        updateAssessmentField(assess.id, { category_id: e.target.value })
                                      }
                                      className="px-2 py-1 rounded-lg border text-[11px] font-bold bg-transparent"
                                      style={{
                                        borderColor: 'var(--border-subtle)',
                                        color: 'var(--text-primary)',
                                      }}
                                    >
                                      {dataset.categories.map((c) => (
                                        <option key={c.id} value={c.id} className="dark:bg-slate-900">
                                          {c.name} ({c.short_code})
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <select
                                    value={assess.term_id}
                                    onChange={(e) =>
                                      updateAssessmentField(assess.id, { term_id: e.target.value as 'hj1' | 'hj2' })
                                    }
                                    className="px-2 py-1 rounded-lg border text-[11px] font-semibold bg-transparent"
                                    style={{
                                      borderColor: 'var(--border-subtle)',
                                      color: 'var(--text-primary)',
                                    }}
                                  >
                                    <option value="hj1" className="dark:bg-slate-900">1. Halbjahr</option>
                                    <option value="hj2" className="dark:bg-slate-900">2. Halbjahr</option>
                                  </select>

                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] opacity-70">Modus:</span>
                                    <select
                                      value={assess.input_mode || 'percent'}
                                      onChange={(e) =>
                                        updateAssessmentField(assess.id, {
                                          input_mode: e.target.value as AssessmentInputMode,
                                        })
                                      }
                                      className="px-2 py-1 rounded-lg border text-[11px] font-bold bg-transparent"
                                      style={{
                                        borderColor: 'var(--border-subtle)',
                                        color: 'var(--text-primary)',
                                      }}
                                    >
                                      <option value="percent" className="dark:bg-slate-900">% Prozent</option>
                                      <option value="points" className="dark:bg-slate-900">Rohpunkte</option>
                                      <option value="grade_scale" className="dark:bg-slate-900">
                                        {dataset.config.scale_id === 'de_oberstufe_0_to_15'
                                          ? 'Notenpunkte'
                                          : 'Schulnote (1–6)'}
                                      </option>
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] opacity-70">Max. Pkt:</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={500}
                                      disabled={assess.input_mode === 'grade_scale'}
                                      value={assess.max_points || 15}
                                      onChange={(e) =>
                                        updateAssessmentField(assess.id, {
                                          max_points: Number(e.target.value) || 15,
                                        })
                                      }
                                      className={`w-16 px-2 py-1 rounded-lg border font-mono text-center bg-transparent ${
                                        assess.input_mode === 'grade_scale' ? 'opacity-30 cursor-not-allowed' : ''
                                      }`}
                                      style={{
                                        borderColor: 'var(--border-subtle)',
                                        color: 'var(--text-primary)',
                                      }}
                                    />
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] opacity-70">Gewicht:</span>
                                    <select
                                      value={assess.weight}
                                      onChange={(e) =>
                                        updateAssessmentField(assess.id, {
                                          weight: Number(e.target.value),
                                        })
                                      }
                                      className="px-2 py-1 rounded-lg border font-mono text-[11px] bg-transparent"
                                      style={{
                                        borderColor: 'var(--border-subtle)',
                                        color: 'var(--text-primary)',
                                      }}
                                    >
                                      <option value={0.5} className="dark:bg-slate-900">0.5x</option>
                                      <option value={1} className="dark:bg-slate-900">1.0x</option>
                                      <option value={1.5} className="dark:bg-slate-900">1.5x</option>
                                      <option value={2} className="dark:bg-slate-900">2.0x</option>
                                    </select>
                                  </div>

                                  <button
                                    onClick={() => setAssessmentPendingDelete(assess)}
                                    className="p-1.5 rounded-lg border text-rose-600 hover:bg-rose-500/10 transition"
                                    style={{ borderColor: 'var(--border-subtle)' }}
                                    title="Prüfungsspalte löschen..."
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* =================================================================
              TAB 3: KLASSEN-STAMMDATEN & KLASSE LÖSCHEN
             ================================================================= */}
          {activeTab === 'meta' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Klassenbezeichnung
                  </label>
                  <input
                    type="text"
                    value={dataset.className}
                    onChange={(e) =>
                      onUpdateDataset((ds) => ({ ...ds, className: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border font-semibold bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Unterrichtsfach
                  </label>
                  <input
                    type="text"
                    value={dataset.subjectName}
                    onChange={(e) =>
                      onUpdateDataset((ds) => ({ ...ds, subjectName: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border font-semibold bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Schule
                  </label>
                  <input
                    type="text"
                    value={dataset.schoolName}
                    onChange={(e) =>
                      onUpdateDataset((ds) => ({ ...ds, schoolName: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Schuljahr
                  </label>
                  <input
                    type="text"
                    value={dataset.schoolYear}
                    onChange={(e) =>
                      onUpdateDataset((ds) => ({ ...ds, schoolYear: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border font-mono bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Notiz / Beschreibung zur Klasse
                  </label>
                  <input
                    type="text"
                    value={dataset.description}
                    onChange={(e) =>
                      onUpdateDataset((ds) => ({ ...ds, description: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div
                className="p-4 rounded-2xl border flex items-center justify-between"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    Binnendifferenzierung (Niveau-Stufen G / M / E) in dieser Klasse nutzen
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Blendet die Niveau-Spalte in der Klassen-Matrix ein oder aus.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={dataset.config.enable_student_levels}
                  onChange={(e) =>
                    onUpdateDataset((ds) => ({
                      ...ds,
                      config: { ...ds.config, enable_student_levels: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-teal-600"
                />
              </div>

              {canDeleteClass && (
                <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Gesamte Klasse löschen</span>
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Entfernt diese Klasse, alle Schüler:innen, Prüfungen und Noten unwiderruflich.
                      </div>
                    </div>
                    {!confirmDeleteClass && (
                      <button
                        onClick={() => setConfirmDeleteClass(true)}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition"
                      >
                        Klasse löschen...
                      </button>
                    )}
                  </div>

                  {confirmDeleteClass && (
                    <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 space-y-3 animate-in fade-in duration-150">
                      <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                        Sicherheitsprüfung vor dem Löschen:
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="px-2.5 py-1 rounded-lg font-medium bg-rose-500/20 text-rose-800 dark:text-rose-200">
                          👥 {dataset.students.length} Schüler:innen ({activeStudents.length} aktiv, {archivedStudents.length} archiviert)
                        </span>
                        <span className="px-2.5 py-1 rounded-lg font-medium bg-rose-500/20 text-rose-800 dark:text-rose-200">
                          📝 {dataset.assessments.length} Prüfungen
                        </span>
                        <span className="px-2.5 py-1 rounded-lg font-medium bg-rose-500/20 text-rose-800 dark:text-rose-200">
                          🎯 {totalClassGradesCount} Noteneinträge
                        </span>
                      </div>
                      {totalClassGradesCount > 0 ? (
                        <p className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold leading-relaxed">
                          ⚠️ Achtung: Es sind bereits {totalClassGradesCount} Noten in dieser Klasse gepflegt. Beim Bestätigen werden all diese Leistungsdaten unwiderruflich vernichtet!
                        </p>
                      ) : (
                        <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                          Es sind keine Noteneinträge vorhanden. Die Stammdaten und Prüfungsspalten werden entfernt.
                        </p>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => {
                            onDeleteClass(dataset.id);
                            onClose();
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white transition flex items-center gap-1.5 shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Ja, endgültig löschen</span>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteClass(false)}
                          className="px-3.5 py-2 rounded-xl text-xs font-semibold border hover:bg-black/5 dark:hover:bg-white/5 transition"
                          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Safety Confirmation Dialog for Student Deletion / Archiving */}
        {studentPendingDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div
              className="max-w-md w-full rounded-2xl border p-5 shadow-2xl space-y-4"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      {studentPendingDelete.is_archived
                        ? 'Archivierten Datensatz endgültig löschen?'
                        : 'Schüler:in aus der Klasse entfernen'}
                    </h4>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {studentPendingDelete.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setStudentPendingDelete(null)}
                  className="w-8 h-8 rounded-lg opacity-50 hover:opacity-100 transition inline-flex items-center justify-center shrink-0"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Info on stored grades */}
              <div
                className="p-3 rounded-xl border text-xs space-y-1"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Gespeicherte Noten & Leistungen:
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {getStudentGradeCount(studentPendingDelete.id) > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ Es sind aktuell <strong>{getStudentGradeCount(studentPendingDelete.id)} Noten</strong> für diese/n Schüler:in hinterlegt.
                    </span>
                  ) : (
                    <span>Bisher sind noch keine Noten eingetragen.</span>
                  )}
                </div>
              </div>

              {!studentPendingDelete.is_archived ? (
                /* Active Student: Offer safe archiving vs hard delete */
                <div className="space-y-3">
                  {/* Option 1: Archive (Recommended) */}
                  <div className="p-3.5 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                        In das Archiv verschieben (Empfohlen)
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 font-bold">
                        Sicher
                      </span>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Alle Noten bleiben sicher aufbewahrt. Die Person wird aus der aktiven Klassenliste und dem Notenschnitt ausgeblendet. Nach 30 Tagen wirst du gefragt, ob gelöscht werden soll.
                    </p>
                    <button
                      onClick={() => {
                        updateStudentField(studentPendingDelete.id, {
                          is_archived: true,
                          archived_at: new Date().toISOString(),
                        });
                        setStudentPendingDelete(null);
                        showToast(`„${studentPendingDelete.name}“ wurde sicher ins Archiv verschoben.`);
                      }}
                      className="w-full py-2 px-3 rounded-lg text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 flex items-center justify-center gap-1.5 transition"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Jetzt archivieren</span>
                    </button>
                  </div>

                  {/* Option 2: Permanent Deletion (Destructive) */}
                  <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-2">
                    <div className="text-xs font-bold text-rose-600">
                      Unwiderruflich löschen
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Entfernt Schüler:in und <strong>alle Noten sofort und endgültig</strong>. Diese Aktion kann nicht rückgängig gemacht werden.
                    </p>
                    <button
                      onClick={() => {
                        deleteStudentPermanently(studentPendingDelete.id, studentPendingDelete.name);
                        setStudentPendingDelete(null);
                      }}
                      className="w-full py-2 px-3 rounded-lg text-xs font-bold text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-300 dark:border-rose-800/60 transition"
                    >
                      Unwiderruflich löschen
                    </button>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => setStudentPendingDelete(null)}
                      className="text-xs font-semibold opacity-70 hover:opacity-100"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                /* Archived Student: Permanent Deletion Confirmation */
                <div className="space-y-3">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Möchtest du den archivierten Datensatz von <strong>„{studentPendingDelete.name}“</strong> und alle zugehörigen Noten jetzt unwiderruflich aus der Datenbank entfernen?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => setStudentPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold border"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={() => {
                        deleteStudentPermanently(studentPendingDelete.id, studentPendingDelete.name);
                        setStudentPendingDelete(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition"
                    >
                      Ja, endgültig löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bulk Retention Clean Confirmation Modal */}
        {pendingBulkClean && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div
              className="max-w-md w-full rounded-2xl border p-5 shadow-2xl space-y-4"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    Fällige archivierte Schüler:innen bereinigen
                  </h4>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Retention-Frist ({retentionDays} Tage) abgelaufen
                  </p>
                </div>
              </div>

              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Möchtest du die folgenden <strong>{expiredArchivedStudents.length} Schüler:innen</strong> und alle deren Noten endgültig aus der Klasse löschen?
              </p>

              <div
                className="max-h-40 overflow-y-auto p-2.5 rounded-xl border text-xs space-y-1 divide-y"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {expiredArchivedStudents.map((s) => (
                  <div key={s.id} className="flex justify-between items-center py-1">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {s.name}
                    </span>
                    <span className="text-[11px] opacity-60" style={{ color: 'var(--text-secondary)' }}>
                      {getStudentGradeCount(s.id)} Noten
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setPendingBulkClean(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold border"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={bulkDeleteExpiredStudents}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition"
                >
                  Ja, alle {expiredArchivedStudents.length} endgültig löschen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assessment Deletion Safety Confirmation Modal */}
        {assessmentPendingDelete && (() => {
          const gradeCount = getAssessmentGradeCount(assessmentPendingDelete.id);
          const cat = dataset.categories.find((c) => c.id === assessmentPendingDelete.category_id);
          const termName = assessmentPendingDelete.term_id === 'hj1' ? '1. Halbjahr' : '2. Halbjahr';
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
              <div
                className="max-w-md w-full rounded-2xl border p-5 shadow-2xl space-y-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        Prüfungsspalte löschen?
                      </h4>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        „{assessmentPendingDelete.title}“ · {termName} {cat ? `· ${cat.name}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAssessmentPendingDelete(null)}
                    className="w-8 h-8 rounded-lg opacity-50 hover:opacity-100 transition inline-flex items-center justify-center shrink-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Info on maintained grades */}
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    gradeCount > 0
                      ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    {gradeCount > 0 ? (
                      <>
                        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                        <span>Achtung: Noteneinträge vorhanden!</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-primary)' }}>Prüfungsinhalt:</span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {gradeCount > 0 ? (
                      <>
                        Für diese Prüfung sind aktuell <strong>{gradeCount} Noteneinträge</strong> erfasst. Beim Löschen werden diese Noten <strong>unwiderruflich vernichtet</strong>.
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Für diese Prüfung sind noch keine Noten eingetragen. Die Spalte kann ohne Datenverlust entfernt werden.
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAssessmentPendingDelete(null)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteAssessment}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Prüfung unwiderruflich löschen</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Category Deletion Safety Confirmation Modal */}
        {categoryPendingDelete && (() => {
          const { assessmentCount, gradeCount } = getCategoryStats(categoryPendingDelete.id);
          const fallbackCat = dataset.categories.find((c) => c.id !== categoryPendingDelete.id);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
              <div
                className="max-w-md w-full rounded-2xl border p-5 shadow-2xl space-y-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        Kategorie löschen?
                      </h4>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        „{categoryPendingDelete.name}“ ({Math.round(categoryPendingDelete.weight * 100)}%)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCategoryPendingDelete(null)}
                    className="w-8 h-8 rounded-lg opacity-50 hover:opacity-100 transition inline-flex items-center justify-center shrink-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Context info on affected assessments & grades */}
                <div
                  className="p-3 rounded-xl border text-xs space-y-1.5"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Betroffene Prüfungen & Noten:
                  </div>
                  <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {assessmentCount > 0 ? (
                      <>
                        In dieser Kategorie befinden sich aktuell <strong>{assessmentCount} Prüfung(en)</strong> mit insgesamt <strong>{gradeCount} Noteneinträgen</strong>.
                        {fallbackCat && (
                          <div className="mt-1 text-teal-700 dark:text-teal-300 font-medium">
                            ℹ️ Diese Prüfungen werden automatisch in die verbleibende Kategorie <strong>„{fallbackCat.name}“</strong> übertragen.
                          </div>
                        )}
                      </>
                    ) : (
                      <span>In dieser Kategorie sind zurzeit keine Prüfungen angelegt. Die Kategorie kann ohne Auswirkung auf bestehende Noten entfernt werden.</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCategoryPendingDelete(null)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteCategory}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition flex items-center gap-1.5 shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kategorie jetzt entfernen</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
