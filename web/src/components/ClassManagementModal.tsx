import React, { useState } from 'react';
import {
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
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';

interface ClassManagementModalProps {
  dataset: ClassroomSubjectDataset;
  canDeleteClass: boolean;
  onUpdateDataset: (updater: (ds: ClassroomSubjectDataset) => ClassroomSubjectDataset) => void;
  onDeleteClass: (classId: string) => void;
  onClose: () => void;
}

export const ClassManagementModal: React.FC<ClassManagementModalProps> = ({
  dataset,
  canDeleteClass,
  onUpdateDataset,
  onDeleteClass,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'students' | 'assessments' | 'meta'>('students');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentLevel, setNewStudentLevel] = useState<'G' | 'M' | 'E'>('M');
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(false);

  // Quick generator state for assessments
  const [genCategoryId, setGenCategoryId] = useState(dataset.categories[0]?.id || '');
  const [genPrefix, setGenPrefix] = useState('Test');
  const [genTargetCount, setGenTargetCount] = useState(4);
  const [genTermId, setGenTermId] = useState<'hj1' | 'hj2'>('hj1');
  const [genMaxPoints, setGenMaxPoints] = useState<number>(15);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [studentPendingDelete, setStudentPendingDelete] = useState<StudentProfile | null>(null);
  const [pendingBulkClean, setPendingBulkClean] = useState(false);
  const [retentionDays] = useState(30);

  const activeStudents = dataset.students.filter((s) => !s.is_archived);
  const archivedStudents = dataset.students.filter((s) => s.is_archived);

  const getStudentGradeCount = (studentId: string) => {
    return dataset.grades.filter(
      (g) =>
        g.student_id === studentId &&
        (g.raw_points !== null || g.percent_value !== null || g.direct_grade_value !== null)
    ).length;
  };

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

  // Adjust exact number of assessments for a category + term (e.g., "Set number of Tests in 1. HJ to 4")
  const handleSetCategoryAssessmentCount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!genCategoryId) return;
    onUpdateDataset((ds) => {
      const currentInCatTerm = ds.assessments.filter(
        (a) => a.category_id === genCategoryId && a.term_id === genTermId
      );
      const others = ds.assessments.filter(
        (a) => !(a.category_id === genCategoryId && a.term_id === genTermId)
      );

      if (genTargetCount === currentInCatTerm.length) return ds;

      if (genTargetCount > currentInCatTerm.length) {
        const toAdd: AssessmentConfig[] = [];
        for (let i = currentInCatTerm.length + 1; i <= genTargetCount; i++) {
          toAdd.push({
            id: `assess_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
            category_id: genCategoryId,
            title: `${genPrefix.trim() || 'Prüfung'} ${i}`,
            term_id: genTermId,
            weight: 1.0,
            input_mode: 'percent',
            max_points: genMaxPoints || 15,
          });
        }
        return {
          ...ds,
          assessments: [...ds.assessments, ...toAdd],
        };
      } else {
        // Keep the first genTargetCount assessments in that category/term
        const kept = currentInCatTerm.slice(0, Math.max(0, genTargetCount));
        const removedIds = new Set(
          currentInCatTerm.slice(Math.max(0, genTargetCount)).map((a) => a.id)
        );
        return {
          ...ds,
          assessments: [...others, ...kept],
          grades: ds.grades.filter((g) => !removedIds.has(g.assessment_id)),
        };
      }
    });
    showToast(`Anzahl der Spalten auf ${genTargetCount} angepasst.`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div
        className="max-w-4xl w-full rounded-2xl border p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-5 max-h-[95vh] sm:max-h-[90vh] flex flex-col"
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
              {/* Quick Batch Generator: "Anzahl der Tests / LNW festlegen" */}
              <form
                onSubmit={handleSetCategoryAssessmentCount}
                className="p-4 rounded-2xl border space-y-3"
                style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  Schnell-Generator: Anzahl der Prüfungen / Tests für eine Kategorie festlegen
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Kategorie
                    </label>
                    <select
                      value={genCategoryId}
                      onChange={(e) => {
                        setGenCategoryId(e.target.value);
                        const c = dataset.categories.find((cat) => cat.id === e.target.value);
                        if (c) setGenPrefix(c.short_code);
                      }}
                      className="w-full px-2.5 py-2 rounded-xl border bg-white dark:bg-slate-900"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      {dataset.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Halbjahr
                    </label>
                    <select
                      value={genTermId}
                      onChange={(e) => setGenTermId(e.target.value as 'hj1' | 'hj2')}
                      className="w-full px-2.5 py-2 rounded-xl border bg-white dark:bg-slate-900"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      <option value="hj1">1. Halbjahr</option>
                      <option value="hj2">2. Halbjahr</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Bezeichnung (Präfix)
                    </label>
                    <input
                      type="text"
                      value={genPrefix}
                      onChange={(e) => setGenPrefix(e.target.value)}
                      placeholder="z.B. Test oder LNW"
                      className="w-full px-2.5 py-2 rounded-xl border bg-white dark:bg-slate-900"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Gewünschte Anzahl
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={genTargetCount}
                      onChange={(e) => setGenTargetCount(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-xl border font-mono font-bold bg-white dark:bg-slate-900"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: 'var(--primary-500)' }}
                  >
                    Anzahl übernehmen
                  </button>
                </div>
              </form>

              {/* Grouped by Category */}
              {dataset.categories.map((cat) => {
                const catAssessments = dataset.assessments.filter((a) => a.category_id === cat.id);
                return (
                  <div
                    key={cat.id}
                    className="rounded-2xl border p-4 space-y-3"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {cat.name} ({cat.short_code})
                        </span>
                        <span className="ml-2 text-xs font-mono opacity-75">
                          {catAssessments.length} Spalten
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => addSingleAssessment(cat.id, 'hj1')}
                          className="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1"
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
                          className="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1"
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
                        {catAssessments.map((assess) => (
                          <div
                            key={assess.id}
                            className="p-2.5 px-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
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
                              <select
                                value={assess.term_id}
                                onChange={(e) =>
                                  updateAssessmentField(assess.id, { term_id: e.target.value })
                                }
                                className="px-2 py-1 rounded-lg border text-[11px] font-semibold bg-transparent"
                                style={{
                                  borderColor: 'var(--border-subtle)',
                                  color: 'var(--text-primary)',
                                }}
                              >
                                <option value="hj1">1. Halbjahr</option>
                                <option value="hj2">2. Halbjahr</option>
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
                                  className="px-2 py-1 rounded-lg border text-[11px] font-semibold bg-transparent"
                                  style={{
                                    borderColor: 'var(--border-subtle)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  <option value="percent">% Prozent</option>
                                  <option value="points">Rohpunkte</option>
                                  <option value="grade_scale">
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
                                  value={assess.max_points || 15}
                                  onChange={(e) =>
                                    updateAssessmentField(assess.id, {
                                      max_points: Number(e.target.value) || 15,
                                    })
                                  }
                                  className="w-16 px-2 py-1 rounded-lg border font-mono text-center bg-transparent"
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
                                  <option value={0.5}>0.5x (Halb)</option>
                                  <option value={1}>1x (Normal)</option>
                                  <option value={1.5}>1.5x</option>
                                  <option value={2}>2x (Doppelt)</option>
                                </select>
                              </div>

                              <button
                                onClick={() => deleteAssessment(assess.id, assess.title)}
                                className="p-1.5 rounded-lg border text-rose-600 hover:bg-rose-500/10"
                                style={{ borderColor: 'var(--border-subtle)' }}
                                title="Prüfungsspalte löschen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
                <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-rose-600">
                      Gesamte Klasse löschen
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Entfernt diese Klasse und alle zugehörigen Noten unwiderruflich.
                    </div>
                  </div>
                  {!confirmDeleteClass ? (
                    <button
                      onClick={() => setConfirmDeleteClass(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white"
                    >
                      Klasse löschen...
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          onDeleteClass(dataset.id);
                          onClose();
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-700 text-white"
                      >
                        Ja, endgültig löschen
                      </button>
                      <button
                        onClick={() => setConfirmDeleteClass(false)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold border"
                      >
                        Abbrechen
                      </button>
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
      </div>
    </div>
  );
};
