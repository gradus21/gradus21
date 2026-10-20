import React, { useState, useEffect } from 'react';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { ClassSetupAndExcelWizard } from './components/ClassSetupAndExcelWizard';
import { ClassManagementModal } from './components/ClassManagementModal';
import { SettingsModal } from './components/SettingsModal';
import { VaultLockAndAuthModal } from './components/VaultLockAndAuthModal';
import { AdminModal } from './components/admin/AdminModal';
import { LegalModal, LegalTab } from './components/LegalModal';
import { CellDisplayFormat, TermFilterId } from './data/demoClasses';
import { useVaultWorkspaceSync } from './hooks/useVaultWorkspaceSync';
import { useClassroomCalculations } from './hooks/useClassroomCalculations';
import { WorkspaceMode } from './types/workspace';
import { ClassMatrixView } from './views/ClassMatrixView';
import { SpeedGradingView } from './views/SpeedGradingView';
import { Student360View } from './views/Student360View';
import { GradingConfiguratorView } from './views/GradingConfiguratorView';
import { InteractiveDemoGuide } from './components/guide/InteractiveDemoGuide';
import { GuideChapterSelectModal } from './components/guide/GuideChapterSelectModal';
import { WelcomeGuideBanner } from './components/guide/WelcomeGuideBanner';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useInteractiveGuide } from './hooks/useInteractiveGuide';

export const App: React.FC = () => {
  const {
    wasmReady,
    datasets,
    setDatasets,
    activeClassId,
    setActiveClassId,
    activeDataset,
    userSettings,
    setUserSettings,
    isVaultLocked,
    syncStatus,
    syncConflictNotice,
    clearConflictNotice,
    vaultSession,
    setVaultSession,
    sampleEnvelope,
    globalTemplates,
    isPersistentStorage,
    connectedBackupDirName,
    lastLocalBackupTime,
    handleLockVault,
    handleUnlockVault,
    updateSubjectConfig,
    handleDeleteClass,
    handleRestoreSnapshot,
    handleToggleCloudSync,
    handlePurgeCloudData,
    handleExportEncryptedBackup,
    handleImportEncryptedBackup,
    handleConnectBackupDirectory,
    handleDisconnectBackupDirectory,
  } = useVaultWorkspaceSync();

  // Navigation & Workspace State
  const [mode, setMode] = useState<WorkspaceMode>('matrix');
  const [activeTerm, setActiveTerm] = useState<TermFilterId>('hj1');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [speedInputMode, setSpeedInputMode] = useState<'percent' | 'points' | 'grade_scale'>('percent');
  const [privacyBlur, setPrivacyBlur] = useState<boolean>(false);
  const [cellFormat, setCellFormat] = useState<CellDisplayFormat>('combined');
  const [showArchivedInMatrix, setShowArchivedInMatrix] = useState<boolean>(false);

  // On-demand toggles
  const [showOnDemandReportCardCol, setShowOnDemandReportCardCol] = useState(false);
  const [showOnDemandCurveEditor, setShowOnDemandCurveEditor] = useState(false);
  const [showOnDemandSimulator, setShowOnDemandSimulator] = useState(false);

  // What-If Simulation State
  const [simCategoryId] = useState<string>('cat_lnw');
  const [simTargetPercent] = useState<number>(75);

  // Modal Dialogs
  const [showClassWizard, setShowClassWizard] = useState<boolean>(false);
  const [showClassManager, setShowClassManager] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showVaultInspector, setShowVaultInspector] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [showLegalModal, setShowLegalModal] = useState<boolean>(false);
  const [legalTab, setLegalTab] = useState<LegalTab>('impressum');

  const handleLoadDemoDataset = () => {
    const demoClass = INITIAL_CLASS_DATASETS[0];
    setDatasets((prev) => {
      const idx = prev.findIndex((d) => d.id === demoClass.id);
      if (idx >= 0) return prev;
      return [demoClass, ...prev];
    });
    setActiveClassId(demoClass.id);
    setShowClassWizard(false);
  };

  // Interactive Demo & Guide Hook
  const {
    isGuideOpen,
    setIsGuideOpen,
    currentGuideChapterId,
    setCurrentGuideChapterId,
    currentGuideStepIndex,
    setCurrentGuideStepIndex,
    isChapterSelectOpen,
    setIsChapterSelectOpen,
    completedChapters,
    showWelcomeBanner,
    handleStartGuideChapter,
    handleChapterCompleted,
    handleDismissWelcomeBanner,
    handleGuideAction,
  } = useInteractiveGuide({
    setMode,
    setShowClassWizard,
    setPrivacyBlur,
    setShowSettingsModal,
    setShowVaultInspector,
    setShowOnDemandSimulator,
    setShowOnDemandCurveEditor,
    onLoadDemoDataset: handleLoadDemoDataset,
  });

  // Domain Calculations & Handlers
  const {
    curvePresetKey,
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
    updateGradeEntry,
    updateReportCardOverride,
    cycleStudentLevel,
    toggleStudentNotGraded,
    toggleStudentArchived,
    handleAddAssessment,
    handleAddStudent,
  } = useClassroomCalculations({
    wasmReady,
    activeDataset,
    updateSubjectConfig,
    activeTerm,
    selectedAssessmentId,
    selectedStudentId,
    showArchivedInMatrix,
    simCategoryId,
    simTargetPercent,
  });

  // Global Keyboard Shortcuts (Cmd/Ctrl + 1..4, Alt+P, ?, F1)
  useKeyboardShortcuts({
    setMode,
    setPrivacyBlur,
    setIsChapterSelectOpen,
  });

  // Sync Themes & Dark Mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userSettings.themePreset);
    if (userSettings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [userSettings.themePreset, userSettings.darkMode]);

  const isCurveEditorVisible =
    userSettings.showCurveEditorInSpeedGrading || showOnDemandCurveEditor;

  // Vault Lock Screen (Fullscreen)
  if (isVaultLocked) {
    return (
      <VaultLockAndAuthModal
        isLockedScreen={true}
        session={vaultSession}
        sampleEnvelope={sampleEnvelope}
        onUnlockSuccess={handleUnlockVault}
        onLockVault={handleLockVault}
        cloudSyncEnabled={userSettings.cloudSyncEnabled ?? false}
        onToggleCloudSync={handleToggleCloudSync}
        onPurgeCloudData={handlePurgeCloudData}
        onImportEncryptedBackup={handleImportEncryptedBackup}
      />
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-200"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      <AppHeader
        datasets={datasets}
        activeDataset={activeDataset}
        setActiveClassId={setActiveClassId}
        onOpenClassWizard={() => setShowClassWizard(true)}
        onOpenClassManager={() => setShowClassManager(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenVaultInspector={() => setShowVaultInspector(true)}
        onOpenAdmin={() => setShowAdminModal(true)}
        onOpenInteractiveGuide={() => setIsChapterSelectOpen(true)}
        showGuideButtonInHeader={Boolean(userSettings.showGuideButtonInHeader)}
        isAdmin={vaultSession?.isAdmin}
        syncStatus={syncStatus}
        privacyBlur={privacyBlur}
        setPrivacyBlur={setPrivacyBlur}
        onLockVault={handleLockVault}
        activeTerm={activeTerm}
        setActiveTerm={setActiveTerm}
        archivedCount={archivedCount}
        calculationReport={calculationReport}
        mode={mode}
        setMode={setMode}
      />

      {/* WELCOME GUIDE BANNER (IF FIRST VISIT & NOT DISMISSED) */}
      {showWelcomeBanner && !isGuideOpen && !isChapterSelectOpen && (
        <WelcomeGuideBanner
          onStartTour={() => handleStartGuideChapter('overview_all', 0)}
          onOpenChapters={() => setIsChapterSelectOpen(true)}
          onDismiss={handleDismissWelcomeBanner}
        />
      )}

      {/* PRIVACY BLUR STYLES */}
      {privacyBlur && (
        <style>{`
          .privacy-blur-active table tbody,
          .privacy-blur-active [data-privacy-sensitive="true"] {
            filter: blur(8px);
            user-select: none;
            transition: filter 150ms ease;
          }
        `}</style>
      )}

      {/* MAIN WORKSPACE CONTENT */}
      <main
        className={`flex-1 p-6 max-w-[1600px] w-full mx-auto transition ${
          privacyBlur ? 'privacy-blur-active' : ''
        }`}
      >
        {syncConflictNotice && (
          <div className="mb-4 p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-center justify-between text-xs font-medium shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{syncConflictNotice}</span>
            </div>
            <button
              onClick={clearConflictNotice}
              className="p-1 rounded-lg hover:bg-amber-500/20 transition opacity-80 hover:opacity-100"
              title="Schließen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {mode === 'matrix' && (
          <ClassMatrixView
            activeDataset={activeDataset}
            activeTerm={activeTerm}
            calculationReport={calculationReport}
            summaryByStudentId={summaryByStudentId}
            userSettings={userSettings}
            cellFormat={cellFormat}
            setCellFormat={setCellFormat}
            showArchivedInMatrix={showArchivedInMatrix}
            setShowArchivedInMatrix={setShowArchivedInMatrix}
            showOnDemandReportCardCol={showOnDemandReportCardCol}
            setShowOnDemandReportCardCol={setShowOnDemandReportCardCol}
            onOpenClassManager={() => setShowClassManager(true)}
            onOpenClassWizard={() => setShowClassWizard(true)}
            onSelectStudent={(studentId) => {
              setSelectedStudentId(studentId);
              setMode('student_360');
            }}
            onSelectAssessment={(assessmentId) => {
              setSelectedAssessmentId(assessmentId);
              setMode('speed_grading');
            }}
            setMode={setMode}
            updateGradeEntry={updateGradeEntry}
            updateReportCardOverride={updateReportCardOverride}
            cycleStudentLevel={cycleStudentLevel}
            toggleStudentNotGraded={toggleStudentNotGraded}
            toggleStudentArchived={toggleStudentArchived}
            onAddStudent={handleAddStudent}
            onAddAssessment={handleAddAssessment}
          />
        )}

        {mode === 'speed_grading' && (
          <SpeedGradingView
            activeDataset={activeDataset}
            activeTerm={activeTerm}
            termAssessments={termAssessments}
            activeAssessment={activeAssessment}
            setSelectedAssessmentId={setSelectedAssessmentId}
            speedInputMode={speedInputMode}
            setSpeedInputMode={setSpeedInputMode}
            visibleStudents={visibleStudents}
            summaryByStudentId={summaryByStudentId}
            calculationReport={calculationReport}
            updateGradeEntry={updateGradeEntry}
            isCurveEditorVisible={isCurveEditorVisible}
            userSettings={userSettings}
            setShowOnDemandCurveEditor={setShowOnDemandCurveEditor}
            globalTemplates={globalTemplates}
            curvePresetKey={curvePresetKey}
            curveCutoffs={curveCutoffs}
            applyCurveCutoffs={applyCurveCutoffs}
            applyGlobalCurveTemplate={applyGlobalCurveTemplate}
            isDifferentiationEnabled={isDifferentiationEnabled}
            toggleStudentLevelsEnabled={toggleStudentLevelsEnabled}
            currentLevelOffsets={currentLevelOffsets}
            setMode={setMode}
          />
        )}

        {mode === 'student_360' && (
          <Student360View
            activeDataset={activeDataset}
            activeTerm={activeTerm}
            visibleStudents={visibleStudents}
            activeStudent={activeStudent}
            selectedStudentId={selectedStudentId}
            setSelectedStudentId={setSelectedStudentId}
            summaryByStudentId={summaryByStudentId}
            activeStudentSummary={activeStudentSummary}
            userSettings={userSettings}
            showOnDemandSimulator={showOnDemandSimulator}
            setShowOnDemandSimulator={setShowOnDemandSimulator}
            updateReportCardOverride={updateReportCardOverride}
            wasmReady={wasmReady}
          />
        )}

        {mode === 'configurator' && (
          <GradingConfiguratorView
            activeDataset={activeDataset}
            updateSubjectConfig={updateSubjectConfig}
            userSettings={userSettings}
            setUserSettings={setUserSettings}
            globalTemplates={globalTemplates}
            curvePresetKey={curvePresetKey}
            curveCutoffs={curveCutoffs}
            applyCurveCutoffs={applyCurveCutoffs}
            applyGlobalCurveTemplate={applyGlobalCurveTemplate}
            applyGlobalWeightingTemplate={applyGlobalWeightingTemplate}
            applyDifferentiationPreset={applyDifferentiationPreset}
            currentLevelOffsets={currentLevelOffsets}
            isDifferentiationEnabled={isDifferentiationEnabled}
            toggleStudentLevelsEnabled={toggleStudentLevelsEnabled}
            updateLevelOffset={updateLevelOffset}
            activeFineThresholds={activeFineThresholds}
            visibleStudents={visibleStudents}
            activeStudent={activeStudent}
            selectedStudentId={selectedStudentId}
            setSelectedStudentId={setSelectedStudentId}
            cycleStudentLevel={cycleStudentLevel}
            summaryByStudentId={summaryByStudentId}
          />
        )}
      </main>

      {/* APP FOOTER / LEGAL COMPLIANCE LINKS */}
      <footer className="mt-auto py-3 px-6 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2 font-medium">
          <span className="font-bold text-slate-700 dark:text-slate-300">Gradus21 v1.0.1</span>
          <span>·</span>
          <span>Zero-Knowledge E2EE & Client-Side Rust/WASM</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://gradus21.de"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400"
            title="Zur offiziellen Website gradus21.de"
          >
            <span>gradus21.de</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
          <span>·</span>
          <button
            onClick={() => {
              setLegalTab('impressum');
              setShowLegalModal(true);
            }}
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Impressum
          </button>
          <span>·</span>
          <button
            onClick={() => {
              setLegalTab('privacy');
              setShowLegalModal(true);
            }}
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Datenschutz
          </button>
          <span>·</span>
          <button
            onClick={() => {
              setLegalTab('school_guide');
              setShowLegalModal(true);
            }}
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Schul-Datenschutz & AVV
          </button>
        </div>
      </footer>

      {/* MODALS */}
      {showClassWizard && (
        <ClassSetupAndExcelWizard
          globalTemplates={globalTemplates}
          onClose={() => setShowClassWizard(false)}
          onLoadDemoClass={handleLoadDemoDataset}
          onCreateClass={(newDataset) => {
            setDatasets((prev) => [...prev, newDataset]);
            setActiveClassId(newDataset.id);
          }}
        />
      )}

      {showClassManager && (
        <ClassManagementModal
          dataset={activeDataset}
          canDeleteClass={datasets.length > 1}
          onUpdateDataset={updateSubjectConfig}
          onDeleteClass={handleDeleteClass}
          onClose={() => setShowClassManager(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          settings={userSettings}
          onUpdateSettings={setUserSettings}
          onClose={() => setShowSettingsModal(false)}
          onOpenInteractiveGuide={() => {
            setShowSettingsModal(false);
            setIsChapterSelectOpen(true);
          }}
          onOpenSchoolGuide={() => {
            setLegalTab('school_guide');
            setShowLegalModal(true);
          }}
          onToggleCloudSync={handleToggleCloudSync}
          onPurgeCloudData={handlePurgeCloudData}
          onExportEncryptedBackup={handleExportEncryptedBackup}
          onImportEncryptedBackup={handleImportEncryptedBackup}
          connectedBackupDirName={connectedBackupDirName}
          lastLocalBackupTime={lastLocalBackupTime}
          onConnectBackupDirectory={handleConnectBackupDirectory}
          onDisconnectBackupDirectory={handleDisconnectBackupDirectory}
          isPersistentStorage={isPersistentStorage}
        />
      )}

      {showVaultInspector && (
        <VaultLockAndAuthModal
          isLockedScreen={false}
          session={vaultSession}
          sampleEnvelope={sampleEnvelope}
          onUnlockSuccess={(updatedSession) => setVaultSession(updatedSession)}
          onLockVault={handleLockVault}
          onCloseInspector={() => setShowVaultInspector(false)}
          cloudSyncEnabled={userSettings.cloudSyncEnabled ?? false}
          onToggleCloudSync={handleToggleCloudSync}
          onPurgeCloudData={handlePurgeCloudData}
        />
      )}

      {showAdminModal && vaultSession && (
        <AdminModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          session={vaultSession}
          onRestoreSuccess={async () => {
            await handleRestoreSnapshot();
            setShowAdminModal(false);
          }}
        />
      )}

      {/* INTERACTIVE GUIDE & CHAPTER SELECT MODALS */}
      <InteractiveDemoGuide
        isOpen={isGuideOpen}
        chapterId={currentGuideChapterId}
        stepIndex={currentGuideStepIndex}
        onClose={() => setIsGuideOpen(false)}
        onStepChange={(newStep) => setCurrentGuideStepIndex(newStep)}
        onChapterChange={(newChapter, step = 0) => {
          setCurrentGuideChapterId(newChapter);
          setCurrentGuideStepIndex(step);
        }}
        onOpenChapterSelect={() => setIsChapterSelectOpen(true)}
        onExecuteAction={handleGuideAction}
        setMode={setMode}
        onChapterCompleted={handleChapterCompleted}
      />

      <GuideChapterSelectModal
        isOpen={isChapterSelectOpen}
        onClose={() => setIsChapterSelectOpen(false)}
        onStartChapter={handleStartGuideChapter}
        completedChapters={completedChapters}
      />

      {/* RECHTLICHES, DATENSCHUTZ & AVV-MODAL */}
      <LegalModal
        isOpen={showLegalModal}
        initialTab={legalTab}
        onClose={() => setShowLegalModal(false)}
      />
    </div>
  );
};
export default App;
