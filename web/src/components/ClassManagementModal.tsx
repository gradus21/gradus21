import React, { useState } from 'react';
import {
  AssessmentConfig,
  ClassroomSubjectDataset,
  StudentProfile,
} from '../data/demoClasses';
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  CheckCircle2,
  ClipboardList,
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

  const activeStudents = dataset.students.filter((s) => !s.is_archived);
  const archivedStudents = dataset.students.filter((s) => s.is_archived);

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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="max-w-4xl w-full rounded-2xl border p-6 shadow-xl space-y-5 max-h-[90vh] flex flex-col"
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
            className="p-2 rounded-xl border transition hover:opacity-80"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div
            className="flex gap-1 p-1 rounded-xl border text-xs font-bold"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <button
              onClick={() => setActiveTab('students')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'students' ? 'text-white shadow-sm' : ''
              }`}
              style={{
                backgroundColor: activeTab === 'students' ? 'var(--primary-500)' : 'transparent',
              }}
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                Schüler:innenliste & Archiv ({activeStudents.length} aktiv
                {archivedStudents.length > 0 ? ` · ${archivedStudents.length} archiviert` : ''})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('assessments')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'assessments' ? 'text-white shadow-sm' : ''
              }`}
              style={{
                backgroundColor: activeTab === 'assessments' ? 'var(--primary-500)' : 'transparent',
              }}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Tests & Leistungsnachweise ({dataset.assessments.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('meta')}
              className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'meta' ? 'text-white shadow-sm' : ''
              }`}
              style={{
                backgroundColor: activeTab === 'meta' ? 'var(--primary-500)' : 'transparent',
              }}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Klassen-Stammdaten</span>
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
                            updateStudentField(stu.id, { is_archived: true });
                            showToast(
                              `„${stu.name}“ wurde archiviert (Noten bleiben im Archiv erhalten).`
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
                          onClick={() => deleteStudentPermanently(stu.id, stu.name)}
                          className="p-1.5 rounded-lg border text-rose-600 hover:bg-rose-500/10"
                          style={{ borderColor: 'var(--border-subtle)' }}
                          title="Schüler:in samt Noten endgültig löschen"
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
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-600">
                    Archivierte Schüler:innen ({archivedStudents.length}) — Ausgeblendet & ohne Einfluss auf den Klassenschnitt
                  </div>
                  <div
                    className="rounded-xl border divide-y bg-amber-500/5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {archivedStudents.map((stu) => (
                      <div
                        key={stu.id}
                        className="p-2.5 px-3.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold line-through opacity-70" style={{ color: 'var(--text-primary)' }}>
                            {stu.name}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                            Archiviert
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              updateStudentField(stu.id, { is_archived: false });
                              showToast(`„${stu.name}“ ist wieder aktiv in der Klasse.`);
                            }}
                            className="px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 text-teal-700 bg-teal-50"
                          >
                            <ArchiveRestore className="w-3.5 h-3.5" />
                            <span>Wiederherstellen</span>
                          </button>
                          <button
                            onClick={() => deleteStudentPermanently(stu.id, stu.name)}
                            className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold text-rose-600 hover:bg-rose-500/10"
                          >
                            Endgültig löschen
                          </button>
                        </div>
                      </div>
                    ))}
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
      </div>
    </div>
  );
};
