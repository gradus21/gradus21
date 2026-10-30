import React, { useState, useEffect } from 'react';
import { AlertTriangle, ExternalLink, GitMerge, X } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { MobileTabBar } from './components/MobileTabBar';
import { ClassSetupAndExcelWizard } from './components/ClassSetupAndExcelWizard';
import { ClassManagementModal } from './components/ClassManagementModal';
import { SettingsModal, SettingsSection } from './components/SettingsModal';
import { VaultLockAndAuthModal } from './components/VaultLockAndAuthModal';
import { isStandaloneClient, isDesktopTauri, getOperatingSystem, isTabletDevice, isSmartphoneDevice } from './utils/platform';

const LazyAdminModal = !isStandaloneClient()
  ? React.lazy(() => import('./components/admin/AdminModal').then((m) => ({ default: m.AdminModal })))
  : null;
import { LegalModal, LegalTab } from './components/LegalModal';
import { useLegalConfig } from './utils/legalConfig';
import { StorageNoticeModal } from './components/StorageNoticeModal';
import { EmailVerificationModal } from './components/EmailVerificationModal';
import { SyncReconciliationModal } from './components/SyncReconciliationModal';
import { CellDisplayFormat, TermFilterId, INITIAL_CLASS_DATASETS } from './data/demoClasses';
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
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner';
import { checkForAppUpdate, UpdateInfo } from './utils/updater';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useInteractiveGuide } from './hooks/useInteractiveGuide';
import { APP_VERSION } from './version';

export type ActiveModal =
  | { type: 'classWizard' }
  | { type: 'classManager'; initialTab?: 'students' | 'assessments' | 'meta'; highlightAssessmentId?: string }
  | { type: 'settings'; section?: SettingsSection }
  | { type: 'vaultInspector' }
  | { type: 'admin' }
  | { type: 'legal'; tab: LegalTab }
  | { type: 'storageNotice' }
  | null;

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
    isEmailVerificationOpen,
    emailForVerification,
    handleEmailVerificationSuccess,
    handleEmailVerificationCancel,
    isReconciliationOpen,
    reconciliationMeta,
    openReconciliationModal,
    handleResolveReconciliation,
    handleCancelReconciliation,
  } = useVaultWorkspaceSync();

  // Navigation & Workspace State
  const legalConfig = useLegalConfig();
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

  // Desktop In-App Auto-Update State
  const [appUpdate, setAppUpdate] = useState<UpdateInfo | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);

  useEffect(() => {
    if (isDesktopTauri()) {
      checkForAppUpdate()
        .then((info) => {
          if (info?.available) {
            setAppUpdate(info);
          }
        })
        .catch((err) => {
          console.warn('[App] Background update check failed:', err);
        });
    }
  }, []);

  // Modal Dialogs (Discriminated Union to enforce single-modal exclusivity)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  const handleOpenSettings = (section: SettingsSection = 'favorites') => {
    setActiveModal({ type: 'settings', section });
  };

  const handleOpenLegal = (tab: LegalTab = 'impressum') => {
    setActiveModal({ type: 'legal', tab });
  };

  const handleCloseModal = () => {
    if (activeModal?.type === 'storageNotice') {
      localStorage.setItem('gradus21_storage_notice_ack_v1', 'true');
    }
    setActiveModal(null);
  };

  // Erstaufruf: Klares Onboarding / Setup-Modal zum Noten-Speicherort (§ 241 Abs. 2 BGB)
  useEffect(() => {
    if (!isVaultLocked && wasmReady && syncStatus === 'local_only') {
      const ack = localStorage.getItem('gradus21_storage_notice_ack_v1');
      if (!ack) {
        const timer = setTimeout(() => {
          setActiveModal({ type: 'storageNotice' });
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [isVaultLocked, wasmReady, syncStatus]);

  const handleLoadDemoDataset = () => {
    const demoClass = INITIAL_CLASS_DATASETS[0];
    setDatasets((prev) => {
      const idx = prev.findIndex((d) => d.id === demoClass.id);
      if (idx >= 0) return prev;
      return [demoClass, ...prev];
    });
    setActiveClassId(demoClass.id);
    setActiveModal(null);
  };

  // Update Student Profile with optional smart cross-class propagation
  const handleUpdateStudentProfile = (
    studentId: string,
    patch: Partial<import('./data/demoClasses').StudentProfile>,
    propagateToAllClasses: boolean
  ) => {
    const currentTarget = activeDataset.students.find((s) => s.id === studentId);
    const targetNormName = currentTarget?.name.trim().toLowerCase();
    const targetStudentId = currentTarget?.studentId;

    if (!propagateToAllClasses) {
      updateSubjectConfig((prev) => ({
        ...prev,
        students: prev.students.map((stu) =>
          stu.id === studentId ? { ...stu, ...patch } : stu
        ),
      }));
    } else {
      setDatasets((prevList) =>
        prevList.map((ds) => {
          const hasMatch = ds.students.some(
            (s) =>
              s.id === studentId ||
              (targetStudentId && s.studentId === targetStudentId) ||
              (targetNormName && s.name.trim().toLowerCase() === targetNormName)
          );
          if (!hasMatch) return ds;

          return {
            ...ds,
            students: ds.students.map((stu) => {
              const isMatch =
                stu.id === studentId ||
                (targetStudentId && stu.studentId === targetStudentId) ||
                (targetNormName && stu.name.trim().toLowerCase() === targetNormName);
              return isMatch ? { ...stu, ...patch } : stu;
            }),
          };
        })
      );
    }
  };

  // Update Active Dataset Metadata (e.g. subjectCode, courseType)
  const handleUpdateDatasetMeta = (patch: { subjectCode?: string; courseType?: string }) => {
    updateSubjectConfig((prev) => ({
      ...prev,
      ...patch,
    }));
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
    setShowClassWizard: (open) => setActiveModal(open ? { type: 'classWizard' } : null),
    setPrivacyBlur,
    setShowSettingsModal: (open) => setActiveModal(open ? { type: 'settings' } : null),
    setShowVaultInspector: (open) => setActiveModal(open ? { type: 'vaultInspector' } : null),
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

  // Sync Themes, Native OS Attributes & Dark Mode + Dynamic Mobile Status Bar theme-color
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userSettings.themePreset);
    document.documentElement.setAttribute('data-os', getOperatingSystem());
    const formFactor = isTabletDevice() ? 'tablet' : isSmartphoneDevice() ? 'phone' : 'desktop';
    document.documentElement.setAttribute('data-device', formFactor);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (userSettings.darkMode) {
      document.documentElement.classList.add('dark');
      if (metaTheme) metaTheme.setAttribute('content', '#121b20');
    } else {
      document.documentElement.classList.remove('dark');
      if (metaTheme) metaTheme.setAttribute('content', '#0d9488');
    }
  }, [userSettings.themePreset, userSettings.darkMode]);

  const isCurveEditorVisible =
    userSettings.showCurveEditorInSpeedGrading || showOnDemandCurveEditor;

  // Vault Lock Screen (Fullscreen)
  if (isVaultLocked) {
    return (
      <>
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

        {/* E-MAIL VERIFICATION MODAL */}
        <EmailVerificationModal
          isOpen={isEmailVerificationOpen}
          email={emailForVerification}
          onSuccess={handleEmailVerificationSuccess}
          onCancel={handleEmailVerificationCancel}
        />

        {/* SYNC-RECONCILIATION MODAL (RICHTUNGSBASIERTER ABGLEICH) */}
        <SyncReconciliationModal
          isOpen={isReconciliationOpen}
          localClassCount={reconciliationMeta?.localClassCount ?? 0}
          remoteClassCount={reconciliationMeta?.remoteClassCount ?? 0}
          remoteLastUpdated={reconciliationMeta?.remoteLastUpdated}
          onResolve={handleResolveReconciliation}
          onCancel={handleCancelReconciliation}
        />
      </>
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
        onOpenClassWizard={() => setActiveModal({ type: 'classWizard' })}
        onOpenClassManager={() => setActiveModal({ type: 'classManager' })}
        onOpenSettings={handleOpenSettings}
        onOpenVaultInspector={() => setActiveModal({ type: 'vaultInspector' })}
        onOpenAdmin={() => setActiveModal({ type: 'admin' })}
        onOpenInteractiveGuide={() => setIsChapterSelectOpen(true)}
        showGuideButtonInHeader={Boolean(userSettings.showGuideButtonInHeader)}
        isAdmin={!isStandaloneClient() && Boolean(vaultSession?.isAdmin)}
        syncStatus={syncStatus}
        isPersistentStorage={isPersistentStorage}
        lastLocalBackupTime={lastLocalBackupTime}
        onExportEncryptedBackup={handleExportEncryptedBackup}
        onOpenStorageNotice={() => setActiveModal({ type: 'storageNotice' })}
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

      {/* DESKTOP AUTO-UPDATE BANNER */}
      {appUpdate?.available && !dismissedUpdate && (
        <UpdateNotificationBanner
          updateInfo={appUpdate}
          onDismiss={() => setDismissedUpdate(true)}
        />
      )}

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
        className={`flex-1 p-2 sm:p-4 md:p-6 w-full mx-auto transition pb-24 md:pb-safe ${
          mode === 'matrix' ? 'max-w-none px-2 sm:px-4 lg:px-6' : 'max-w-[1600px]'
        } ${privacyBlur ? 'privacy-blur-active' : ''}`}
      >
        {syncConflictNotice && (
          <div className="mb-4 p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-center justify-between text-xs font-medium shadow-sm gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="leading-relaxed">{syncConflictNotice}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openReconciliationModal}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <GitMerge className="w-3.5 h-3.5" />
                Abgleichs-Dialog öffnen
              </button>
              <button
                type="button"
                onClick={clearConflictNotice}
                className="w-8 h-8 rounded-lg hover:bg-amber-500/20 transition opacity-80 hover:opacity-100 cursor-pointer inline-flex items-center justify-center shrink-0"
                title="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
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
            onOpenClassManager={(initialTab, highlightAssessmentId) =>
              setActiveModal({ type: 'classManager', initialTab, highlightAssessmentId })
            }
            onOpenClassWizard={() => setActiveModal({ type: 'classWizard' })}
            onSelectStudent={(studentId) => {
              setSelectedStudentId(studentId);
              setMode('student_360');
            }}
            onSelectAssessment={(assessmentId) => {
              setSelectedAssessmentId(assessmentId);
              const assess = activeDataset.assessments.find((a) => a.id === assessmentId);
              if (assess?.input_mode) {
                setSpeedInputMode(assess.input_mode);
              }
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
            onUpdateDatasetMeta={handleUpdateDatasetMeta}
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
            allDatasets={datasets}
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
            onUpdateStudentProfile={handleUpdateStudentProfile}
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

      {/* APP FOOTER / LEGAL COMPLIANCE LINKS (Visible on Desktop & Tablets; on Mobile phones, cleanly accessed via Settings & Protection) */}
      <footer className="mt-auto py-3 px-3 sm:px-6 border-t border-slate-200/60 dark:border-slate-800/60 hidden md:flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2 font-medium">
          <span className="font-bold text-slate-700 dark:text-slate-300">Gradus21 v{APP_VERSION}</span>
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
            onClick={() => handleOpenLegal('impressum')}
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Impressum
          </button>
          <span>·</span>
          <button
            onClick={() => handleOpenLegal('privacy')}
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Datenschutz
          </button>
          <span>·</span>
          <button
            onClick={() => handleOpenLegal('school_guide')}
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Schul-Datenschutz
          </button>
          <span>·</span>
          <a
            href={legalConfig.terms_url || 'https://gradus21.de/nutzungsbedingungen.html'}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400"
            title="Nutzungsbedingungen auf Website öffnen"
          >
            <span>Nutzungsbedingungen</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
          <span>·</span>
          <a
            href={legalConfig.avv_url || 'https://gradus21.de/avv.html'}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400"
            title="Offiziellen AVV-Mustervertrag öffnen"
          >
            <span>AVV-Mustervertrag</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        </div>
      </footer>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <MobileTabBar mode={mode} setMode={setMode} />

      {/* MODALS */}
      {activeModal?.type === 'classWizard' && (
        <ClassSetupAndExcelWizard
          globalTemplates={globalTemplates}
          userTemplates={userSettings.customWeightingTemplates}
          onClose={handleCloseModal}
          onLoadDemoClass={handleLoadDemoDataset}
          onCreateClass={(newDataset) => {
            setDatasets((prev) => [...prev, newDataset]);
            setActiveClassId(newDataset.id);
            handleCloseModal();
          }}
        />
      )}

      {activeModal?.type === 'classManager' && (
        <ClassManagementModal
          dataset={activeDataset}
          canDeleteClass={datasets.length > 1}
          initialTab={activeModal.initialTab}
          highlightAssessmentId={activeModal.highlightAssessmentId}
          onUpdateDataset={updateSubjectConfig}
          onDeleteClass={handleDeleteClass}
          onClose={handleCloseModal}
          onOpenConfigurator={() => setMode('configurator')}
        />
      )}

      {activeModal?.type === 'settings' && (
        <SettingsModal
          initialSection={activeModal.section || 'favorites'}
          settings={userSettings}
          onUpdateSettings={setUserSettings}
          onClose={handleCloseModal}
          onOpenInteractiveGuide={() => {
            handleCloseModal();
            setIsChapterSelectOpen(true);
          }}
          onOpenSchoolGuide={() => {
            handleOpenLegal('school_guide');
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
          session={vaultSession}
        />
      )}

      {activeModal?.type === 'vaultInspector' && (
        <VaultLockAndAuthModal
          isLockedScreen={false}
          session={vaultSession}
          sampleEnvelope={sampleEnvelope}
          onUnlockSuccess={(updatedSession) => setVaultSession(updatedSession)}
          onLockVault={handleLockVault}
          onCloseInspector={handleCloseModal}
          cloudSyncEnabled={userSettings.cloudSyncEnabled ?? false}
          onToggleCloudSync={handleToggleCloudSync}
          onPurgeCloudData={handlePurgeCloudData}
        />
      )}

      {!isStandaloneClient() && activeModal?.type === 'admin' && vaultSession && LazyAdminModal && (
        <React.Suspense fallback={null}>
          <LazyAdminModal
            isOpen={true}
            onClose={handleCloseModal}
            session={vaultSession}
            onRestoreSuccess={async () => {
              await handleRestoreSnapshot();
              handleCloseModal();
            }}
          />
        </React.Suspense>
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
        isOpen={activeModal?.type === 'legal'}
        initialTab={activeModal?.type === 'legal' ? activeModal.tab : 'impressum'}
        onClose={handleCloseModal}
      />

      {/* E-MAIL VERIFIKATION (VOR CLOUD-SYNC AKTIVIERUNG) */}
      <EmailVerificationModal
        isOpen={isEmailVerificationOpen}
        email={emailForVerification}
        onSuccess={handleEmailVerificationSuccess}
        onCancel={handleEmailVerificationCancel}
      />

      {/* SYNC-RECONCILIATION MODAL (RICHTUNGSBASIERTER ABGLEICH) */}
      <SyncReconciliationModal
        isOpen={isReconciliationOpen}
        localClassCount={reconciliationMeta?.localClassCount ?? 0}
        remoteClassCount={reconciliationMeta?.remoteClassCount ?? 0}
        remoteLastUpdated={reconciliationMeta?.remoteLastUpdated}
        onResolve={handleResolveReconciliation}
        onCancel={handleCancelReconciliation}
      />

      {/* SPEICHER-AUFKLÄRUNG & SETUP-MODAL (§ 241 Abs. 2 BGB) */}
      <StorageNoticeModal
        isOpen={activeModal?.type === 'storageNotice'}
        onClose={handleCloseModal}
        syncStatus={syncStatus}
        isPersistentStorage={isPersistentStorage}
        lastLocalBackupTime={lastLocalBackupTime}
        onExportBackup={handleExportEncryptedBackup}
        onOpenStorageSettings={() => handleOpenSettings('storage')}
      />
    </div>
  );
};
export default App;
