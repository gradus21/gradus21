import React, { useEffect, useMemo, useState } from 'react';
import initWasm, {
  wasm_calculate_class_report,
  wasm_decrypt_envelope,
  wasm_encrypt_envelope,
  wasm_generate_vault,
  wasm_simulate_needed_score,
} from './wasm-pkg/notenflow_core';
import { FlowRibbonLogo } from './components/FlowRibbonLogo';
import { ClassSetupAndExcelWizard } from './components/ClassSetupAndExcelWizard';
import { ClassManagementModal } from './components/ClassManagementModal';
import { SettingsModal, WEIGHTING_PRESET_CATALOG } from './components/SettingsModal';
import { ActiveVaultSession, VaultLockAndAuthModal } from './components/VaultLockAndAuthModal';
import {
  exportClassToXlsx,
  printClassConferenceReport,
  printStudentParentReport,
} from './components/ExportAndPrintHelpers';
import {
  AssessmentConfig,
  buildCurveThresholdsFromMainCutoffs,
  CategoryConfig,
  CellDisplayFormat,
  ClassroomSubjectDataset,
  DEFAULT_USER_SYNC_SETTINGS,
  GradeEntry,
  GRADING_CURVE_PRESETS,
  GradingScaleId,
  INITIAL_CLASS_DATASETS,
  StudentProfile,
  TermFilterId,
  UserSyncSettings,
  WeightingMode,
} from './data/demoClasses';
import {
  Archive,
  BookmarkPlus,
  Calendar,
  ChevronRight,
  Columns,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderPlus,
  KeyRound,
  Lock,
  Plus,
  Printer,
  Settings,
  Sliders,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Zap,
} from 'lucide-react';

interface CategoryResult {
  category_id: string;
  category_name: string;
  average_percent: number | null;
  average_grade_numeric: number | null;
  display_grade: string;
  graded_count: number;
  effective_weight_percent: number;
}

interface StudentCalculatedSummary {
  student_id: string;
  overall_percent: number | null;
  overall_grade_numeric: number | null;
  overall_display_grade: string;
  semantic_tier: number;
  is_preliminary: boolean;
  category_results: CategoryResult[];
}

interface ClassCalculationReport {
  student_summaries: StudentCalculatedSummary[];
  class_average_percent: number | null;
  class_average_grade_numeric: number | null;
  class_display_grade: string;
  distribution_buckets: [number, number, number, number, number, number];
}

type WorkspaceMode = 'matrix' | 'speed_grading' | 'student_360' | 'configurator';

const TIER_BADGE_STYLES: Record<
  number,
  { bg: string; text: string; border: string; label: string }
> = {
  1: { bg: '#DCFCE7', text: '#15803D', border: '#BBF7D0', label: 'Sehr gut (1)' },
  2: { bg: '#CCFBF1', text: '#0F766E', border: '#99F6E4', label: 'Gut (2)' },
  3: { bg: '#FEF9C3', text: '#A16207', border: '#FEF08A', label: 'Befriedigend (3)' },
  4: { bg: '#FFEDD5', text: '#C2410C', border: '#FED7AA', label: 'Ausreichend (4)' },
  5: { bg: '#FFE4E6', text: '#BE123C', border: '#FECDD3', label: 'Mangelhaft (5)' },
  6: { bg: '#FFE4E6', text: '#9F1239', border: '#FDA4AF', label: 'Ungenügend (6)' },
};

const LEVEL_BADGE_STYLES: Record<string, { bg: string; text: string; desc: string }> = {
  G: { bg: '#F3E8FF', text: '#6B21A8', desc: 'Grundlegendes Niveau' },
  M: { bg: '#E0F2FE', text: '#0369A1', desc: 'Mittleres Niveau' },
  E: { bg: '#CCFBF1', text: '#0F766E', desc: 'Erweitertes Niveau' },
};

const DEMO_OWNER_USER_ID = '7f9c2a10-58e4-4c9b-9b1a-123456789abc';
const ACTIVE_USER_ID_STORAGE_KEY = 'bte_notenflow_active_user_id_v3';
const VAULT_LOCKED_STORAGE_KEY = 'bte_notenflow_vault_locked_v1';

function getUserEncryptedCacheKey(userId: string): string {
  return `bte_notenflow_e2ee_user_vault_v3_${userId}`;
}

function createFreshWorkspaceForNewTeacher(userId: string): ClassroomSubjectDataset[] {
  return [
    {
      id: `class_starter_${userId.slice(0, 8)}`,
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
        enable_student_levels: true,
        level_threshold_offsets: { G: -5, M: 0, E: 3 },
        custom_thresholds: null,
      },
      categories: [
        {
          id: 'cat_lnw',
          name: 'Schriftliche Leistungsnachweise',
          short_code: 'LNW',
          weight: 0.5,
          drop_lowest_count: 0,
        },
        {
          id: 'cat_muendl',
          name: 'Mündliche & sonstige Mitarbeit',
          short_code: 'Mündl',
          weight: 0.3,
          drop_lowest_count: 0,
        },
        {
          id: 'cat_tests',
          name: 'Kurze Tests & Praxis',
          short_code: 'Tests',
          weight: 0.2,
          drop_lowest_count: 0,
        },
      ],
      assessments: [
        {
          id: 'assess_starter_1',
          category_id: 'cat_lnw',
          title: '1. Leistungsnachweis',
          term_id: 'hj1',
          weight: 1.0,
          input_mode: 'percent',
          max_points: 20,
        },
        {
          id: 'assess_starter_2',
          category_id: 'cat_muendl',
          title: '1. Mitarbeitsnote',
          term_id: 'hj1',
          weight: 1.0,
          input_mode: 'percent',
          max_points: 15,
        },
      ],
      students: [],
      grades: [],
      reportCardOverrides: {},
    },
  ];
}

export const App: React.FC = () => {
  const [wasmReady, setWasmReady] = useState(false);
  const [datasets, setDatasets] = useState<ClassroomSubjectDataset[]>(INITIAL_CLASS_DATASETS);
  const [activeClassId, setActiveClassId] = useState<string>(INITIAL_CLASS_DATASETS[0].id);
  const [activeTerm, setActiveTerm] = useState<TermFilterId>('hj1');
  const [mode, setMode] = useState<WorkspaceMode>('matrix');

  // Synchronized User Settings (persisted across devices via E2EE envelope + /api/preferences)
  const [userSettings, setUserSettings] = useState<UserSyncSettings>(DEFAULT_USER_SYNC_SETTINGS);
  const [cellFormat, setCellFormat] = useState<CellDisplayFormat>(
    DEFAULT_USER_SYNC_SETTINGS.defaultCellFormat
  );

  // Classroom Privacy Blur ("Namen ausblenden")
  const [privacyBlur, setPrivacyBlur] = useState<boolean>(false);

  // On-demand toggles when a section is hidden by default in Settings
  const [showArchivedInMatrix, setShowArchivedInMatrix] = useState<boolean>(false);
  const [showOnDemandReportCardCol, setShowOnDemandReportCardCol] = useState<boolean>(false);
  const [showOnDemandCurveEditor, setShowOnDemandCurveEditor] = useState<boolean>(false);
  const [showOnDemandSimulator, setShowOnDemandSimulator] = useState<boolean>(false);
  const [showAllWeightingPresets, setShowAllWeightingPresets] = useState<boolean>(false);

  // Selected items for Speed-Grading and Student 360°
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('test_1');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('stu_eng6_1');
  const [speedInputMode, setSpeedInputMode] = useState<'percent' | 'points'>('percent');

  // Interactive Notenschlüssel-Editor cutoffs (Note 1..5 minimum percentages)
  const [curvePresetKey, setCurvePresetKey] = useState<string>('standard');
  const [curveCutoffs, setCurveCutoffs] = useState<{
    n1: number;
    n2: number;
    n3: number;
    n4: number;
    n5: number;
  }>({ n1: 90, n2: 75, n3: 58, n4: 42, n5: 20 });

  // What-if simulator state in Student 360°
  const [simCategoryId, setSimCategoryId] = useState<string>('cat_lnw');
  const [simTargetPercent, setSimTargetPercent] = useState<number>(80);

  // Modals: Class Setup Wizard, Class Management (Edit existing), Settings, Vault/Auth
  const [showClassWizard, setShowClassWizard] = useState<boolean>(false);
  const [showClassManager, setShowClassManager] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [isVaultLocked, setIsVaultLocked] = useState<boolean>(() => {
    return localStorage.getItem(VAULT_LOCKED_STORAGE_KEY) === 'true';
  });
  const [showVaultInspector, setShowVaultInspector] = useState<boolean>(false);
  const [vaultSession, setVaultSession] = useState<ActiveVaultSession | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [sampleEnvelope, setSampleEnvelope] = useState<{
    entityId: string;
    plaintext: string;
    ciphertext: string;
    decryptedVerify: string;
  } | null>(null);

  // Inline forms for adding Assessment, Student, or Custom Category
  const [newAssessmentTitle, setNewAssessmentTitle] = useState('');
  const [newAssessmentCategoryId, setNewAssessmentCategoryId] = useState('');
  const [showNewAssessmentForm, setShowNewAssessmentForm] = useState(false);

  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentLevel, setNewStudentLevel] = useState<'G' | 'M' | 'E'>('M');
  const [showNewStudentForm, setShowNewStudentForm] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryShort, setNewCategoryShort] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);

  const activeDataset = useMemo(
    () => datasets.find((d) => d.id === activeClassId) || datasets[0],
    [datasets, activeClassId]
  );

  // Sync theme attributes from synchronized userSettings
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userSettings.themePreset);
    if (userSettings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [userSettings.themePreset, userSettings.darkMode]);

  useEffect(() => {
    setCellFormat(userSettings.defaultCellFormat);
  }, [userSettings.defaultCellFormat]);

  // Lädt und entschlüsselt den Arbeitsbereich ausschließlich für die übergebene User-ID (strikte Mandantentrennung!)
  const loadIsolatedUserWorkspace = async (session: ActiveVaultSession) => {
    const { dekB64, userId, token, email } = session;
    if (!dekB64 || !userId) return;

    const userCacheKey = getUserEncryptedCacheKey(userId);
    const cachedRaw = localStorage.getItem(userCacheKey);
    if (cachedRaw) {
      try {
        const parsed = JSON.parse(cachedRaw);
        if (parsed.encryptedDatasetsEnvelope) {
          const decryptedJson = wasm_decrypt_envelope(
            dekB64,
            userId,
            'workspace_datasets_v2',
            parsed.encryptedDatasetsEnvelope
          );
          const restoredDatasets = JSON.parse(decryptedJson) as ClassroomSubjectDataset[];
          if (Array.isArray(restoredDatasets) && restoredDatasets.length > 0) {
            setDatasets(restoredDatasets);
            setActiveClassId(restoredDatasets[0].id);
          }
          if (parsed.encryptedSettingsEnvelope) {
            try {
              const decSettings = wasm_decrypt_envelope(
                dekB64,
                userId,
                'user_sync_settings_v1',
                parsed.encryptedSettingsEnvelope
              );
              setUserSettings({
                ...DEFAULT_USER_SYNC_SETTINGS,
                ...JSON.parse(decSettings),
              });
            } catch {
              setUserSettings(DEFAULT_USER_SYNC_SETTINGS);
            }
          }
          setLoadedUserId(userId);
          return;
        }
      } catch {
        // Falls lokaler Cache nicht entschlüsselt werden konnte, versuche Server-Abruf
      }
    }

    // Versuche verschlüsselte Envelopes dieses Nutzers vom Server zu laden
    if (token && token !== 'offline_demo_jwt') {
      try {
        const envRes = await fetch('/api/envelopes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (envRes.ok) {
          const envelopes = (await envRes.json()) as Array<{
            id: string;
            owner_user_id: string;
            entity_type: string;
            encrypted_payload: string;
          }>;
          const wsEnv = envelopes.find(
            (e) => e.owner_user_id === userId && e.entity_type === 'workspace'
          );
          const settingsEnv = envelopes.find(
            (e) => e.owner_user_id === userId && e.entity_type === 'user_settings'
          );

          if (wsEnv) {
            const decWs = wasm_decrypt_envelope(
              dekB64,
              userId,
              'workspace_datasets_v2',
              wsEnv.encrypted_payload
            );
            const restoredDatasets = JSON.parse(decWs) as ClassroomSubjectDataset[];
            if (Array.isArray(restoredDatasets) && restoredDatasets.length > 0) {
              setDatasets(restoredDatasets);
              setActiveClassId(restoredDatasets[0].id);
              if (settingsEnv) {
                try {
                  const decSet = wasm_decrypt_envelope(
                    dekB64,
                    userId,
                    'user_sync_settings_v1',
                    settingsEnv.encrypted_payload
                  );
                  setUserSettings({
                    ...DEFAULT_USER_SYNC_SETTINGS,
                    ...JSON.parse(decSet),
                  });
                } catch {
                  setUserSettings(DEFAULT_USER_SYNC_SETTINGS);
                }
              } else {
                setUserSettings(DEFAULT_USER_SYNC_SETTINGS);
              }
              setLoadedUserId(userId);
              return;
            }
          }
        }
      } catch {
        // Server nicht erreichbar -> weiter zum Initial-Setup für diesen Nutzer
      }
    }

    // Falls weder im nutzerspezifischen Cache noch auf dem Server Daten für diese User-ID existieren:
    // Nur das Demo-Konto (julian@gemeinschaftsschule.de) erhält die 3 Demo-Klassen,
    // jedes neu angelegte Lehrkraft-Konto startet mit einem eigenen, komplett leeren Arbeitsbereich!
    const isDemoUser =
      userId === DEMO_OWNER_USER_ID ||
      email.trim().toLowerCase() === 'julian@gemeinschaftsschule.de';

    const freshDatasets = isDemoUser
      ? INITIAL_CLASS_DATASETS
      : createFreshWorkspaceForNewTeacher(userId);

    setDatasets(freshDatasets);
    setActiveClassId(freshDatasets[0].id);
    setUserSettings(DEFAULT_USER_SYNC_SETTINGS);
    setLoadedUserId(userId);
  };

  const handleLockVault = () => {
    localStorage.setItem(VAULT_LOCKED_STORAGE_KEY, 'true');
    if (vaultSession?.userId) {
      const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
      const cachedRaw = localStorage.getItem(userCacheKey);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);
          if (parsed.session) {
            parsed.session = {
              ...parsed.session,
              dekB64: '',
              token: '',
            };
            parsed.isLocked = true;
            localStorage.setItem(userCacheKey, JSON.stringify(parsed));
          }
        } catch {
          // ignore
        }
      }
    }
    // Bereinige im gesperrten Zustand auch die entschlüsselten Daten aus dem Arbeitsspeicher (RAM)
    const emptyLocked = createFreshWorkspaceForNewTeacher('locked');
    setDatasets(emptyLocked);
    setActiveClassId(emptyLocked[0].id);
    setLoadedUserId(null);
    setVaultSession((prev) => (prev ? { ...prev, dekB64: '', token: '' } : null));
    setShowVaultInspector(false);
    setIsVaultLocked(true);
  };

  const handleUnlockVault = async (unlockedSession: ActiveVaultSession) => {
    localStorage.removeItem(VAULT_LOCKED_STORAGE_KEY);
    localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, unlockedSession.userId);
    setVaultSession(unlockedSession);
    if (unlockedSession.dekB64) {
      await loadIsolatedUserWorkspace(unlockedSession);
    }
    setIsVaultLocked(false);
  };

  // Initialize Rust WebAssembly Core + Zero-Knowledge E2EE Vault + Restore Encrypted Cache
  useEffect(() => {
    let mounted = true;
    (async () => {
      await initWasm();
      if (!mounted) return;
      setWasmReady(true);

      const lockedFlag = localStorage.getItem(VAULT_LOCKED_STORAGE_KEY) === 'true';

      // Einmalige Migration einer laufenden Sitzung aus dem alten globalen Cache-Schlüssel (ohne fremde Klassendaten zu übernehmen!)
      const legacyRaw = localStorage.getItem('bte_notenflow_e2ee_cache_v2');
      if (legacyRaw) {
        try {
          const legacyParsed = JSON.parse(legacyRaw);
          localStorage.removeItem('bte_notenflow_e2ee_cache_v2');
          if (legacyParsed?.session?.userId) {
            localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, legacyParsed.session.userId);
            const targetKey = getUserEncryptedCacheKey(legacyParsed.session.userId);
            if (!localStorage.getItem(targetKey)) {
              const isDemo = legacyParsed.session.userId === DEMO_OWNER_USER_ID;
              localStorage.setItem(
                targetKey,
                JSON.stringify({
                  session: legacyParsed.session,
                  encryptedDatasetsEnvelope: isDemo
                    ? legacyParsed.encryptedDatasetsEnvelope
                    : undefined,
                  encryptedSettingsEnvelope: isDemo
                    ? legacyParsed.encryptedSettingsEnvelope
                    : undefined,
                  isLocked: Boolean(legacyParsed.isLocked || lockedFlag),
                })
              );
            }
          }
        } catch {
          localStorage.removeItem('bte_notenflow_e2ee_cache_v2');
        }
      }

      const lastActiveUserId =
        localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY) || DEMO_OWNER_USER_ID;

      // Check if we have a user-scoped cached E2EE vault session in localStorage
      const userCacheKey = getUserEncryptedCacheKey(lastActiveUserId);
      const cachedRaw = localStorage.getItem(userCacheKey);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);
          if (parsed.session) {
            if (lockedFlag || parsed.isLocked || !parsed.session.dekB64) {
              const emptyLocked = createFreshWorkspaceForNewTeacher('locked');
              setDatasets(emptyLocked);
              setActiveClassId(emptyLocked[0].id);
              setVaultSession({
                ...parsed.session,
                dekB64: '',
              });
              setIsVaultLocked(true);
              return;
            }

            setVaultSession(parsed.session);
            await loadIsolatedUserWorkspace(parsed.session);
            return;
          }
        } catch {
          // Proceed with fresh vault creation
        }
      }

      // Generate initial E2EE Vault in Rust WASM and register with Axum server
      const vaultJson = wasm_generate_vault('LehrerPasswort#2026!');
      const bundle = JSON.parse(vaultJson);
      let serverUserId = DEMO_OWNER_USER_ID;
      let token = 'offline_demo_jwt';
      let totpSecret = 'JBSWY3DPEHPK3PXP';
      let totpUri: string | undefined;
      let totpHint: string | undefined;

      try {
        const email = 'julian@gemeinschaftsschule.de';
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            auth_key_b64: bundle.auth_key_b64,
            kdf_salt_b64: bundle.kdf_salt_b64,
            kdf_params: bundle.kdf_params,
            encrypted_dek: bundle.encrypted_dek,
            recovery_encrypted_dek: bundle.recovery_encrypted_dek,
          }),
        });
        if (regRes.ok) {
          const authData = await regRes.json();
          serverUserId = authData.user_id;
          token = authData.token;
          totpSecret = authData.totp_secret_base32 || totpSecret;
          totpUri = authData.totp_setup_uri;
          totpHint = authData.totp_current_code_hint;
        }
      } catch {
        // Offline-first fallback
      }

      const initialSession: ActiveVaultSession = {
        token,
        userId: serverUserId,
        email: 'julian@gemeinschaftsschule.de',
        kdfSaltB64: bundle.kdf_salt_b64,
        dekB64: lockedFlag ? '' : bundle.dek_b64,
        encryptedDek: bundle.encrypted_dek,
        recoveryEncryptedDek: bundle.recovery_encrypted_dek,
        recoveryKeyFormatted: bundle.recovery_key_formatted,
        totpEnabled: false,
        totpSetupUri: totpUri,
        totpSecretBase32: totpSecret,
        totpCurrentCodeHint: totpHint,
        serverSyncedCount: INITIAL_CLASS_DATASETS.length,
      };
      localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, serverUserId);
      setVaultSession(initialSession);
      if (!lockedFlag) {
        await loadIsolatedUserWorkspace(initialSession);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Automatically encrypt and persist datasets + userSettings (Strict Per-User Cache + Rust Axum Server)
  useEffect(() => {
    if (
      !wasmReady ||
      !vaultSession ||
      !vaultSession.dekB64 ||
      isVaultLocked ||
      loadedUserId !== vaultSession.userId
    ) {
      return;
    }
    try {
      const plainWorkspace = JSON.stringify(datasets);
      const encryptedWorkspace = wasm_encrypt_envelope(
        vaultSession.dekB64,
        vaultSession.userId,
        'workspace_datasets_v2',
        plainWorkspace
      );

      const plainSettings = JSON.stringify(userSettings);
      const encryptedSettings = wasm_encrypt_envelope(
        vaultSession.dekB64,
        vaultSession.userId,
        'user_sync_settings_v1',
        plainSettings
      );

      const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
      localStorage.setItem(
        userCacheKey,
        JSON.stringify({
          session: vaultSession,
          encryptedDatasetsEnvelope: encryptedWorkspace,
          encryptedSettingsEnvelope: encryptedSettings,
          isLocked: false,
        })
      );
      localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, vaultSession.userId);

      // Update live ciphertext sample for the E2EE Inspector
      const samplePlain = JSON.stringify({
        class: activeDataset.className,
        subject: activeDataset.subjectName,
        firstStudent: activeDataset.students[0] || null,
        firstGrade: activeDataset.grades[0] || null,
      });
      const sampleCipher = wasm_encrypt_envelope(
        vaultSession.dekB64,
        vaultSession.userId,
        activeDataset.id,
        samplePlain
      );
      setSampleEnvelope({
        entityId: activeDataset.id,
        plaintext: samplePlain,
        ciphertext: sampleCipher,
        decryptedVerify: samplePlain,
      });

      // Sync encrypted class envelopes + encrypted settings to Rust Axum Backend
      if (vaultSession.token) {
        fetch('/api/envelopes/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${vaultSession.token}`,
          },
          body: JSON.stringify({
            envelopes: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                entity_type: 'workspace',
                parent_id: null,
                class_id: null,
                encrypted_payload: encryptedWorkspace,
              },
              {
                id: '00000000-0000-4000-8000-000000000002',
                entity_type: 'user_settings',
                parent_id: null,
                class_id: null,
                encrypted_payload: encryptedSettings,
              },
            ],
          }),
        }).catch(() => {});

        fetch('/api/preferences', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${vaultSession.token}`,
          },
          body: JSON.stringify({
            theme: userSettings.themePreset,
            mode: userSettings.darkMode ? 'dark' : 'light',
            defaultScaleId: userSettings.defaultScaleId,
            defaultWeightingMode: userSettings.defaultWeightingMode,
            favoriteWeightingPresets: userSettings.favoriteWeightingPresets,
          }),
        }).catch(() => {});
      }
    } catch (e) {
      console.error('E2EE auto-save error:', e);
    }
  }, [wasmReady, datasets, userSettings, vaultSession, isVaultLocked, activeDataset]);

  // Keep selected assessment/student and curveCutoffs valid when switching classes or terms
  useEffect(() => {
    const termAssessments = activeDataset.assessments.filter((a) =>
      activeTerm === 'all' ? true : a.term_id === activeTerm
    );
    if (termAssessments.length > 0) {
      setSelectedAssessmentId(termAssessments[0].id);
    } else if (activeDataset.assessments.length > 0) {
      setSelectedAssessmentId(activeDataset.assessments[0].id);
    }
    const activeStudents = activeDataset.students.filter((s) => !s.is_archived);
    if (activeStudents.length > 0) {
      setSelectedStudentId(activeStudents[0].id);
    }
    if (activeDataset.categories.length > 0) {
      setSimCategoryId(activeDataset.categories[0].id);
      setNewAssessmentCategoryId(activeDataset.categories[0].id);
    }

    // Sync Notenschlüssel cutoffs with the active class
    const custom = activeDataset.config?.custom_thresholds;
    if (custom && custom.length > 0) {
      const findMin = (label: string, fallback: number) =>
        custom.find((t) => t.display_label === label)?.min_percent ?? fallback;
      setCurveCutoffs({
        n1: findMin('1', 90),
        n2: findMin('2', 75),
        n3: findMin('3', 58),
        n4: findMin('4', 42),
        n5: findMin('5', 20),
      });
    } else {
      setCurveCutoffs({ n1: 90, n2: 75, n3: 58, n4: 42, n5: 20 });
      setCurvePresetKey('standard');
    }
  }, [activeClassId, activeTerm]);

  // ===========================================================================
  // 100% CLIENT-SIDE GRADING CALCULATION IN RUST WEBASSEMBLY (LIVE!)
  // ===========================================================================
  const calculationReport: ClassCalculationReport | null = useMemo(() => {
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
    calculationReport?.student_summaries.forEach((s) => map.set(s.student_id, s));
    return map;
  }, [calculationReport]);

  const updateSubjectConfig = (
    updater: (ds: ClassroomSubjectDataset) => ClassroomSubjectDataset
  ) => {
    setDatasets((prev) => prev.map((ds) => (ds.id === activeDataset.id ? updater(ds) : ds)));
  };

  const handleDeleteClass = (classId: string) => {
    setDatasets((prev) => {
      const remaining = prev.filter((d) => d.id !== classId);
      if (remaining.length > 0 && activeClassId === classId) {
        setActiveClassId(remaining[0].id);
      }
      return remaining.length > 0 ? remaining : prev;
    });
  };

  // Apply custom Notenschlüssel cutoffs to active subject
  const applyCurveCutoffs = (
    nextCutoffs: { n1: number; n2: number; n3: number; n4: number; n5: number },
    presetName = 'custom'
  ) => {
    const sanitized = {
      n1: Math.max(nextCutoffs.n2 + 2, Math.min(99, nextCutoffs.n1)),
      n2: Math.max(nextCutoffs.n3 + 2, Math.min(nextCutoffs.n1 - 2, nextCutoffs.n2)),
      n3: Math.max(nextCutoffs.n4 + 2, Math.min(nextCutoffs.n2 - 2, nextCutoffs.n3)),
      n4: Math.max(nextCutoffs.n5 + 2, Math.min(nextCutoffs.n3 - 2, nextCutoffs.n4)),
      n5: Math.max(5, Math.min(nextCutoffs.n4 - 2, nextCutoffs.n5)),
    };
    setCurvePresetKey(presetName);
    setCurveCutoffs(sanitized);
    const thresholds = buildCurveThresholdsFromMainCutoffs(sanitized);
    updateSubjectConfig((ds) => ({
      ...ds,
      config: {
        ...ds.config,
        custom_thresholds: thresholds,
      },
    }));
  };

  // Binnendifferenzierung (G / M / E) helpers
  const currentLevelOffsets = useMemo(() => {
    const raw = activeDataset.config?.level_threshold_offsets || {};
    return {
      G: typeof raw.G === 'number' ? raw.G : -5,
      M: typeof raw.M === 'number' ? raw.M : 0,
      E: typeof raw.E === 'number' ? raw.E : 3,
    };
  }, [activeDataset.config?.level_threshold_offsets]);

  const isDifferentiationEnabled = activeDataset.config?.enable_student_levels ?? true;

  const toggleStudentLevelsEnabled = (enabled: boolean) => {
    updateSubjectConfig((ds) => ({
      ...ds,
      config: {
        ...ds.config,
        enable_student_levels: enabled,
        level_threshold_offsets: ds.config.level_threshold_offsets || { G: -5, M: 0, E: 3 },
      },
    }));
  };

  const updateLevelOffset = (level: 'G' | 'M' | 'E', offsetPercent: number) => {
    const clamped = Math.max(-20, Math.min(20, Math.round(offsetPercent)));
    updateSubjectConfig((ds) => ({
      ...ds,
      config: {
        ...ds.config,
        enable_student_levels: true,
        level_threshold_offsets: {
          ...currentLevelOffsets,
          ...(ds.config.level_threshold_offsets || {}),
          [level]: clamped,
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

  const activeFineThresholds = useMemo(() => {
    if (
      activeDataset.config?.custom_thresholds &&
      activeDataset.config.custom_thresholds.length > 0
    ) {
      return activeDataset.config.custom_thresholds;
    }
    return buildCurveThresholdsFromMainCutoffs(curveCutoffs);
  }, [activeDataset.config?.custom_thresholds, curveCutoffs]);

  // Update a student's grade entry
  const updateGradeEntry = (
    studentId: string,
    assessmentId: string,
    inputValue: string,
    inputType: 'percent' | 'points' | 'excused'
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

  // Update Zeugnisnote override for a student
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
      students: ds.students.map((s) =>
        s.id === studentId ? { ...s, is_archived: !s.is_archived } : s
      ),
    }));
  };

  const handleAddAssessment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssessmentTitle.trim()) return;
    const newId = `assess_${Date.now()}`;
    const newAssess: AssessmentConfig = {
      id: newId,
      category_id: newAssessmentCategoryId || activeDataset.categories[0].id,
      title: newAssessmentTitle.trim(),
      term_id: activeTerm === 'all' ? 'hj1' : activeTerm,
      weight: 1.0,
      input_mode: 'percent',
      max_points: 15,
    };
    updateSubjectConfig((ds) => ({
      ...ds,
      assessments: [...ds.assessments, newAssess],
    }));
    setNewAssessmentTitle('');
    setShowNewAssessmentForm(false);
    setSelectedAssessmentId(newId);
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim()) return;
    const newStu: StudentProfile = {
      id: `stu_${Date.now()}`,
      name: newStudentName.trim(),
      level: newStudentLevel,
      is_not_graded: false,
      is_archived: false,
    };
    updateSubjectConfig((ds) => ({
      ...ds,
      students: [...ds.students, newStu],
    }));
    setNewStudentName('');
    setShowNewStudentForm(false);
  };

  // --- Individual Weighting Configurator Actions (Add/Remove/Rename Category & Save Template) ---
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const short =
      newCategoryShort.trim() || newCategoryName.trim().slice(0, 6);
    const newCat: CategoryConfig = {
      id: `cat_${Date.now()}`,
      name: newCategoryName.trim(),
      short_code: short,
      weight: 0.2,
      drop_lowest_count: 0,
    };
    updateSubjectConfig((ds) => ({
      ...ds,
      categories: [...ds.categories, newCat],
    }));
    setNewCategoryName('');
    setNewCategoryShort('');
  };

  const handleDeleteCategory = (catId: string) => {
    if (activeDataset.categories.length <= 1) return;
    const fallbackCatId =
      activeDataset.categories.find((c) => c.id !== catId)?.id ||
      activeDataset.categories[0].id;
    updateSubjectConfig((ds) => ({
      ...ds,
      categories: ds.categories.filter((c) => c.id !== catId),
      // Reassign assessments from deleted category to fallback category so no grades are lost
      assessments: ds.assessments.map((a) =>
        a.category_id === catId ? { ...a, category_id: fallbackCatId } : a
      ),
    }));
  };

  const handleSaveCurrentAsCustomTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;
    const newTpl = {
      id: `tpl_${Date.now()}`,
      name: newTemplateName.trim(),
      description: `${activeDataset.categories.length} Kategorien aus ${activeDataset.subjectName}`,
      weighting_mode: activeDataset.config.weighting_mode,
      categories: activeDataset.categories.map((c) => ({ ...c })),
    };
    setUserSettings((prev) => ({
      ...prev,
      customWeightingTemplates: [...prev.customWeightingTemplates, newTpl],
    }));
    setNewTemplateName('');
    setShowSaveTemplateInput(false);
  };

  const applyCustomTemplate = (tplId: string) => {
    const tpl = userSettings.customWeightingTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    updateSubjectConfig((ds) => {
      const nextCats = tpl.categories.map((c) => ({ ...c }));
      const firstCatId = nextCats[0]?.id || ds.categories[0]?.id;
      const validIds = new Set(nextCats.map((c) => c.id));
      return {
        ...ds,
        config: {
          ...ds.config,
          weighting_mode: tpl.weighting_mode,
        },
        categories: nextCats,
        assessments: ds.assessments.map((a, idx) =>
          validIds.has(a.category_id)
            ? a
            : { ...a, category_id: nextCats[idx % nextCats.length]?.id || firstCatId }
        ),
      };
    });
  };

  const totalCatWeight = activeDataset.categories.reduce(
    (acc, c) => acc + Math.max(0.01, c.weight),
    0
  );

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

  const simulatedNeededPercent: number | null = useMemo(() => {
    if (!wasmReady || !activeStudentSummary) return null;
    try {
      const val = wasm_simulate_needed_score(
        JSON.stringify(activeStudentSummary),
        JSON.stringify(activeDataset.categories),
        simCategoryId,
        simTargetPercent
      );
      return typeof val === 'number' ? val : null;
    } catch {
      return null;
    }
  }, [
    wasmReady,
    activeStudentSummary,
    activeDataset.categories,
    simCategoryId,
    simTargetPercent,
  ]);

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

  const isReportCardColumnVisible =
    userSettings.showReportCardColumn || showOnDemandReportCardCol;
  const isCurveEditorVisible =
    userSettings.showCurveEditorInSpeedGrading || showOnDemandCurveEditor;
  const isSimulatorVisible =
    userSettings.showWhatIfSimulator || showOnDemandSimulator;

  const displayedWeightingPresets = useMemo(() => {
    if (showAllWeightingPresets) return WEIGHTING_PRESET_CATALOG;
    const favs = WEIGHTING_PRESET_CATALOG.filter((p) =>
      userSettings.favoriteWeightingPresets.includes(p.id)
    );
    return favs.length > 0 ? favs : WEIGHTING_PRESET_CATALOG.slice(0, 3);
  }, [userSettings.favoriteWeightingPresets, showAllWeightingPresets]);

  // Show Fullscreen E2EE Vault Lock Screen when locked
  if (isVaultLocked) {
    return (
      <VaultLockAndAuthModal
        isLockedScreen={true}
        session={vaultSession}
        sampleEnvelope={sampleEnvelope}
        onUnlockSuccess={handleUnlockVault}
        onLockVault={handleLockVault}
      />
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-200"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      {/* TOP NAVIGATION BAR */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md px-6 py-3 flex flex-wrap items-center justify-between gap-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <FlowRibbonLogo size={38} />

          {/* Class / Subject Switcher + Edit Current Class + Wizard Button */}
          <div
            className="flex flex-wrap items-center gap-1 p-1 rounded-xl border"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            {datasets.map((ds) => {
              const active = ds.id === activeDataset.id;
              return (
                <button
                  key={ds.id}
                  onClick={() => setActiveClassId(ds.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                    active ? 'shadow-sm' : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--primary-500)' : 'var(--text-secondary)',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: active ? 'var(--primary-500)' : 'var(--text-muted)',
                    }}
                  />
                  <span>
                    {ds.className} · {ds.subjectName}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => setShowClassManager(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition hover:opacity-90 border"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              title="Aktuelle Klasse bearbeiten (Schüler archivieren/löschen, Anzahl der Tests & LNW ändern)"
            >
              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
              <span>Klasse bearbeiten</span>
            </button>

            <button
              onClick={() => setShowClassWizard(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition hover:opacity-90"
              style={{
                backgroundColor: 'var(--primary-soft)',
                color: 'var(--primary-text)',
              }}
              title="Neue Klasse erstellen oder .xlsx Excel-Datei importieren"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>+ Neue Klasse</span>
            </button>
          </div>
        </div>

        {/* Right Controls: Einstellungen (inkl. Theme & Favoriten), Konto & Schutz, Namen ausblenden, Abmelden */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Einstellungen: Favoriten, Einblendungen bei Bedarf & Farbwelt (wird zwischen deinen Geräten synchronisiert)"
          >
            <Settings className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
            <span>Einstellungen</span>
          </button>

          <button
            onClick={() => setShowVaultInspector(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--primary-soft)',
              color: 'var(--primary-text)',
              borderColor: 'var(--border-subtle)',
            }}
            title="Passkey (Fingerabdruck / Face ID), Notfallblatt & Handy-Schutz"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Konto & Schutz</span>
          </button>

          <button
            onClick={() => setPrivacyBlur((b) => !b)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${
              privacyBlur ? 'ring-2 ring-amber-500 bg-amber-500/10 text-amber-600' : ''
            }`}
            style={
              !privacyBlur
                ? {
                    backgroundColor: 'var(--bg-subtle)',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border-subtle)',
                  }
                : undefined
            }
            title="Schülernamen & Noten sofort unscharf schalten, wenn Schüler ans Lehrerpult treten"
          >
            {privacyBlur ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{privacyBlur ? 'Namen wieder zeigen' : 'Namen ausblenden'}</span>
          </button>

          <button
            onClick={handleLockVault}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border-subtle)',
            }}
            title="NotenFlow sperren, bis du dich per Fingerabdruck oder Passwort wieder anmeldest"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Abmelden</span>
          </button>
        </div>
      </header>

      {/* SUB-HEADER: CLASS CONTEXT, HALBJAHRES-SWITCHER & WORKSPACE MODE TABS */}
      <div
        className="border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="space-y-1">
          <div
            className="flex flex-wrap items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>{activeDataset.schoolName}</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>SJ {activeDataset.schoolYear}</span>
            <ChevronRight className="w-3.5 h-3.5" />

            {/* Halbjahres-Umschalter (1. HJ / 2. HJ / Gesamtjahr) */}
            <div
              className="inline-flex items-center gap-1 p-0.5 rounded-lg border"
              style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
            >
              <Calendar className="w-3 h-3 ml-1.5" style={{ color: 'var(--primary-500)' }} />
              {(
                [
                  { id: 'hj1', label: '1. Halbjahr' },
                  { id: 'hj2', label: '2. Halbjahr' },
                  { id: 'all', label: 'Gesamtjahr' },
                ] as const
              ).map((term) => (
                <button
                  key={term.id}
                  onClick={() => setActiveTerm(term.id)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition ${
                    activeTerm === term.id ? 'text-white shadow-sm' : ''
                  }`}
                  style={{
                    backgroundColor: activeTerm === term.id ? 'var(--primary-500)' : 'transparent',
                    color: activeTerm === term.id ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {term.label}
                </button>
              ))}
            </div>
          </div>

          <h1
            className="text-xl font-bold flex flex-wrap items-center gap-3"
            style={{ color: 'var(--text-primary)' }}
          >
            <span>
              {activeDataset.subjectName} – {activeDataset.className}
            </span>
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
            >
              {activeDataset.students.filter((s) => !s.is_archived).length} aktive Schüler
              {archivedCount > 0 ? ` (+${archivedCount} archiviert)` : ''}
            </span>
            {calculationReport?.class_average_percent != null && (
              <span
                className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
              >
                Live-Klassenschnitt ({activeTerm.toUpperCase()}):{' '}
                {calculationReport.class_average_percent}% (Ø{' '}
                {calculationReport.class_display_grade})
              </span>
            )}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {activeDataset.description}
          </p>
        </div>

        {/* 4 Specialized Classroom Modes */}
        <div
          className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl border"
          style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
        >
          {(
            [
              { id: 'matrix', label: 'Klassen-Matrix', sub: 'Übersicht & Zeugnis', icon: Columns },
              { id: 'speed_grading', label: 'Speed-Grading', sub: 'Prüfung & Schlüssel', icon: Zap },
              { id: 'student_360', label: 'Schüler-360°-Akte', sub: 'Elterngespräch & PDF', icon: UserCheck },
              { id: 'configurator', label: 'Gewichtungs-Baukasten', sub: 'Individuell & Vorlagen', icon: Sliders },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-left transition-all flex items-center gap-2.5 ${
                  active ? 'shadow-sm' : 'opacity-75 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: active ? 'var(--primary-500)' : 'transparent',
                  color: active ? '#FFFFFF' : 'var(--text-primary)',
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div className="leading-tight">
                  <div className="text-xs font-bold">{tab.label}</div>
                  <div className={`text-[10px] ${active ? 'text-teal-50/90' : 'opacity-70'}`}>
                    {tab.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN WORKSPACE CONTENT */}
      <main
        className={`flex-1 p-6 max-w-[1600px] w-full mx-auto transition ${
          privacyBlur ? 'blur-md select-none pointer-events-none' : ''
        }`}
      >
        {/* =====================================================================
            MODE 1: STRUKTURIERTE KLASSEN-MATRIX (INKL. ZEUGNISNOTE & KLASSEN-PFLEGE)
           ===================================================================== */}
        {mode === 'matrix' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Darstellung:
                </span>
                {(
                  [
                    { id: 'combined', label: 'Kombi (73% · 2-)' },
                    { id: 'percent_only', label: 'Prozent (73%)' },
                    { id: 'grade_only', label: 'Nur Note (2-)' },
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => setCellFormat(fmt.id)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold border transition"
                    style={{
                      backgroundColor:
                        cellFormat === fmt.id ? 'var(--primary-soft)' : 'var(--bg-surface)',
                      color:
                        cellFormat === fmt.id ? 'var(--primary-text)' : 'var(--text-secondary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {fmt.label}
                  </button>
                ))}

                {/* On-demand toggle for Zeugnisnote if hidden by default in settings */}
                {!userSettings.showReportCardColumn && (
                  <button
                    onClick={() => setShowOnDemandReportCardCol((s) => !s)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition"
                    style={{
                      backgroundColor: showOnDemandReportCardCol
                        ? 'var(--primary-soft)'
                        : 'var(--bg-surface)',
                      color: showOnDemandReportCardCol
                        ? 'var(--primary-text)'
                        : 'var(--text-secondary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {showOnDemandReportCardCol
                      ? 'Zeugnis-Spalte ausblenden'
                      : '+ Zeugnis-Spalte bei Bedarf'}
                  </button>
                )}

                {archivedCount > 0 && (
                  <button
                    onClick={() => setShowArchivedInMatrix((a) => !a)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1 transition"
                    style={{
                      backgroundColor: showArchivedInMatrix
                        ? 'var(--primary-soft)'
                        : 'var(--bg-surface)',
                      color: showArchivedInMatrix
                        ? 'var(--primary-text)'
                        : 'var(--text-secondary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <Archive className="w-3 h-3" />
                    <span>
                      {showArchivedInMatrix
                        ? 'Archivierte ausblenden'
                        : `${archivedCount} Archivierte zeigen`}
                    </span>
                  </button>
                )}
              </div>

              {/* Action Buttons: Klasse verwalten, Excel Import/Export, Konferenz-PDF, + Schüler, + Prüfung */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowClassManager(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Schüler & Prüfungsanzahl verwalten</span>
                </button>

                <button
                  onClick={() => setShowClassWizard(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
                  <span>.xlsx Import</span>
                </button>

                <button
                  onClick={() => exportClassToXlsx(activeDataset, calculationReport, activeTerm)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Download className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
                  <span>.xlsx Export</span>
                </button>

                <button
                  onClick={() =>
                    printClassConferenceReport(activeDataset, calculationReport, activeTerm)
                  }
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Printer className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
                  <span>Konferenz-PDF</span>
                </button>

                <button
                  onClick={() => setShowNewStudentForm((s) => !s)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <UserPlus className="w-3.5 h-3.5" style={{ color: 'var(--primary-500)' }} />
                  <span>+ Schüler</span>
                </button>

                <button
                  onClick={() => setShowNewAssessmentForm((s) => !s)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-sm transition hover:opacity-95"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Prüfung ({activeTerm.toUpperCase()})</span>
                </button>
              </div>
            </div>

            {/* Inline New Student Creator */}
            {showNewStudentForm && (
              <form
                onSubmit={handleAddStudent}
                className="p-4 rounded-2xl border flex flex-wrap items-end gap-3 shadow-sm"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Name des Schülers
                  </label>
                  <input
                    type="text"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="z.B. Leonie M."
                    className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                {activeDataset.config.enable_student_levels && (
                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Niveau
                    </label>
                    <select
                      value={newStudentLevel}
                      onChange={(e) => setNewStudentLevel(e.target.value as 'G' | 'M' | 'E')}
                      className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
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
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                >
                  Schüler hinzufügen
                </button>
              </form>
            )}

            {/* Inline New Assessment Creator */}
            {showNewAssessmentForm && (
              <form
                onSubmit={handleAddAssessment}
                className="p-4 rounded-2xl border flex flex-wrap items-end gap-3 shadow-sm"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Bezeichnung der Prüfung
                  </label>
                  <input
                    type="text"
                    value={newAssessmentTitle}
                    onChange={(e) => setNewAssessmentTitle(e.target.value)}
                    placeholder="z.B. Vokabeltest Unit 2"
                    className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Kategorie-Topf
                  </label>
                  <select
                    value={newAssessmentCategoryId}
                    onChange={(e) => setNewAssessmentCategoryId(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border text-xs bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    {activeDataset.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({Math.round((c.weight / totalCatWeight) * 100)}%)
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: 'var(--primary-500)' }}
                >
                  Spalte anlegen
                </button>
              </form>
            )}

            {/* Structured Matrix Card */}
            <div
              className="rounded-2xl border shadow-sm overflow-hidden"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr
                      className="border-b text-[11px] font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <th
                        className="py-2.5 px-4 sticky left-0 z-10"
                        style={{ backgroundColor: 'var(--bg-subtle)' }}
                      >
                        Schüler ({visibleStudents.length})
                      </th>
                      {activeDataset.config.enable_student_levels && (
                        <th className="py-2.5 px-2 text-center">Niveau</th>
                      )}
                      <th className="py-2.5 px-3 text-center">Live-Schnitt</th>
                      {isReportCardColumnVisible && (
                        <th
                          className="py-2.5 px-3 text-center border-r"
                          style={{ borderColor: 'var(--border-subtle)' }}
                          title="Festgesetzte Zeugnisnote (pädagogisch überschreibbar)"
                        >
                          Zeugnisnote
                        </th>
                      )}
                      {activeDataset.categories.map((cat) => {
                        const catAssessments = termAssessments.filter(
                          (a) => a.category_id === cat.id
                        );
                        const normPct = Math.round((cat.weight / totalCatWeight) * 100);
                        const colSpan =
                          catAssessments.length +
                          (userSettings.showCategoryAveragesInMatrix ? 1 : 0);
                        if (colSpan === 0) return null;
                        return (
                          <th
                            key={cat.id}
                            colSpan={colSpan}
                            className="py-2.5 px-3 text-center border-r"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <span style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                                style={{
                                  backgroundColor: 'var(--primary-soft)',
                                  color: 'var(--primary-text)',
                                }}
                              >
                                {normPct}%
                              </span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>

                    <tr
                      className="border-b text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <th
                        className="py-2.5 px-4 sticky left-0 z-10"
                        style={{ backgroundColor: 'var(--bg-surface)' }}
                      >
                        Name (Klick → 360°-Akte)
                      </th>
                      {activeDataset.config.enable_student_levels && (
                        <th className="py-2.5 px-2 text-center text-[11px]">G / M / E</th>
                      )}
                      <th
                        className="py-2.5 px-3 text-center font-bold"
                        style={{ color: 'var(--primary-500)' }}
                      >
                        Schnitt ({activeTerm.toUpperCase()})
                      </th>
                      {isReportCardColumnVisible && (
                        <th
                          className="py-2.5 px-3 text-center border-r text-[11px]"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          Zeugnis ({activeTerm.toUpperCase()})
                        </th>
                      )}
                      {activeDataset.categories.map((cat) => {
                        const catAssessments = termAssessments.filter(
                          (a) => a.category_id === cat.id
                        );
                        return (
                          <React.Fragment key={cat.id}>
                            {catAssessments.map((assess) => (
                              <th
                                key={assess.id}
                                className="py-2.5 px-2.5 text-center min-w-[92px] group cursor-pointer hover:bg-teal-500/5 transition"
                                onClick={() => {
                                  setSelectedAssessmentId(assess.id);
                                  setMode('speed_grading');
                                }}
                              >
                                <div className="flex flex-col items-center">
                                  <span
                                    className="font-semibold group-hover:underline"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {assess.title}
                                  </span>
                                  <span className="text-[10px] opacity-70">
                                    {assess.max_points ? `max. ${assess.max_points} Pkt` : '%'} · ⚡
                                  </span>
                                </div>
                              </th>
                            ))}
                            {userSettings.showCategoryAveragesInMatrix && (
                              <th
                                className="py-2.5 px-2.5 text-center border-r text-[11px] font-bold"
                                style={{
                                  backgroundColor: 'var(--bg-subtle)',
                                  borderColor: 'var(--border-subtle)',
                                }}
                              >
                                Ø {cat.short_code}
                              </th>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody className="divide-y text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                    {visibleStudents.map((stu, sIdx) => {
                      const summary = summaryByStudentId.get(stu.id);
                      const tierStyle = summary
                        ? TIER_BADGE_STYLES[summary.semantic_tier]
                        : undefined;
                      const levelStyle = stu.level ? LEVEL_BADGE_STYLES[stu.level] : undefined;
                      const overrideObj = activeDataset.reportCardOverrides?.[stu.id];
                      const currentZeugnisOverride =
                        (activeTerm === 'hj1'
                          ? overrideObj?.hj1
                          : activeTerm === 'hj2'
                          ? overrideObj?.hj2
                          : overrideObj?.all) || '';

                      return (
                        <tr
                          key={stu.id}
                          className={`hover:bg-teal-500/[0.03] transition group ${
                            stu.is_archived ? 'opacity-50 bg-amber-500/5' : ''
                          }`}
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <td
                            className="py-2.5 px-4 font-semibold sticky left-0 z-10 whitespace-nowrap"
                            style={{ backgroundColor: 'var(--bg-surface)' }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <button
                                onClick={() => {
                                  setSelectedStudentId(stu.id);
                                  setMode('student_360');
                                }}
                                className="hover:underline flex items-center gap-2 text-left"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                <span className="text-[11px] font-mono opacity-45 w-4">
                                  {sIdx + 1}.
                                </span>
                                <span className={stu.is_archived ? 'line-through' : ''}>
                                  {stu.name}
                                </span>
                              </button>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => toggleStudentNotGraded(stu.id)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                                    stu.is_not_graded
                                      ? 'bg-amber-100 text-amber-800 font-bold'
                                      : 'opacity-0 group-hover:opacity-70 text-slate-500'
                                  }`}
                                  title="Ohne Bewertung (o.B.) umschalten"
                                >
                                  {stu.is_not_graded ? 'o.B. aktiv' : 'o.B.'}
                                </button>
                                <button
                                  onClick={() => toggleStudentArchived(stu.id)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                                    stu.is_archived
                                      ? 'bg-amber-200 text-amber-900 font-bold'
                                      : 'opacity-0 group-hover:opacity-70 text-slate-500'
                                  }`}
                                  title={
                                    stu.is_archived
                                      ? 'Schüler wiederherstellen'
                                      : 'Schüler archivieren (z.B. bei Schulwechsel)'
                                  }
                                >
                                  <Archive className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </td>

                          {activeDataset.config.enable_student_levels && (
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => cycleStudentLevel(stu.id)}
                                className="px-2 py-0.5 rounded-md text-[11px] font-bold font-mono transition hover:scale-105"
                                style={{
                                  backgroundColor: levelStyle?.bg || 'var(--bg-subtle)',
                                  color: levelStyle?.text || 'var(--text-secondary)',
                                }}
                              >
                                {stu.level || 'M'}
                              </button>
                            </td>
                          )}

                          {/* Calculated Overall Grade Pill (LIVE) */}
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {summary && summary.overall_percent !== null ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span
                                  className="px-2.5 py-1 rounded-full font-mono font-bold text-xs border"
                                  style={{
                                    backgroundColor: tierStyle?.bg || 'var(--primary-soft)',
                                    color: tierStyle?.text || 'var(--primary-text)',
                                    borderColor: tierStyle?.border || 'transparent',
                                  }}
                                >
                                  {cellFormat === 'percent_only'
                                    ? `${summary.overall_percent}%`
                                    : cellFormat === 'grade_only'
                                    ? summary.overall_display_grade
                                    : `${summary.overall_percent}% · ${summary.overall_display_grade}`}
                                </span>
                              </div>
                            ) : (
                              <span
                                className="font-mono text-xs"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {stu.is_not_graded ? 'o.B.' : '—'}
                              </span>
                            )}
                          </td>

                          {/* Set / Override Official Zeugnisnote */}
                          {isReportCardColumnVisible && (
                            <td
                              className="py-1.5 px-2 text-center border-r"
                              style={{ borderColor: 'var(--border-subtle)' }}
                            >
                              <input
                                type="text"
                                value={currentZeugnisOverride}
                                placeholder={summary?.overall_display_grade || '—'}
                                onChange={(e) =>
                                  updateReportCardOverride(stu.id, e.target.value)
                                }
                                className={`w-14 text-center font-mono text-xs py-1 px-1 rounded-lg border transition ${
                                  currentZeugnisOverride
                                    ? 'font-extrabold ring-1 ring-teal-500'
                                    : 'opacity-70'
                                }`}
                                style={{
                                  backgroundColor: currentZeugnisOverride
                                    ? 'var(--primary-soft)'
                                    : 'transparent',
                                  color: currentZeugnisOverride
                                    ? 'var(--primary-text)'
                                    : 'var(--text-primary)',
                                  borderColor: 'var(--border-subtle)',
                                }}
                                title="Offizielle Zeugnisnote eintragen (leer lassen = berechnete Note übernehmen)"
                              />
                            </td>
                          )}

                          {/* Category Columns */}
                          {activeDataset.categories.map((cat) => {
                            const catAssessments = termAssessments.filter(
                              (a) => a.category_id === cat.id
                            );
                            const catSummary = summary?.category_results.find(
                              (cr) => cr.category_id === cat.id
                            );

                            return (
                              <React.Fragment key={cat.id}>
                                {catAssessments.map((assess) => {
                                  const entry = activeDataset.grades.find(
                                    (g) =>
                                      g.student_id === stu.id && g.assessment_id === assess.id
                                  );

                                  return (
                                    <td key={assess.id} className="py-1.5 px-2 text-center">
                                      {entry?.status === 'excused' ? (
                                        <button
                                          onClick={() =>
                                            updateGradeEntry(stu.id, assess.id, '', 'percent')
                                          }
                                          className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300"
                                        >
                                          Attest
                                        </button>
                                      ) : (
                                        <input
                                          type="text"
                                          value={
                                            entry?.percent_value != null
                                              ? String(entry.percent_value)
                                              : ''
                                          }
                                          placeholder="—"
                                          onChange={(e) =>
                                            updateGradeEntry(
                                              stu.id,
                                              assess.id,
                                              e.target.value,
                                              'percent'
                                            )
                                          }
                                          className="w-16 text-center font-mono text-xs py-1 px-1.5 rounded-lg border bg-transparent focus:outline-none focus:ring-2 focus:ring-teal-500 transition tabular-nums"
                                          style={{
                                            borderColor:
                                              entry?.percent_value != null
                                                ? 'var(--border-subtle)'
                                                : 'transparent',
                                            color: 'var(--text-primary)',
                                          }}
                                        />
                                      )}
                                    </td>
                                  );
                                })}

                                {userSettings.showCategoryAveragesInMatrix && (
                                  <td
                                    className="py-2 px-2.5 text-center border-r font-mono text-[11px] font-semibold whitespace-nowrap"
                                    style={{
                                      backgroundColor: 'var(--bg-subtle)',
                                      borderColor: 'var(--border-subtle)',
                                      color:
                                        catSummary?.average_percent != null
                                          ? 'var(--text-primary)'
                                          : 'var(--text-muted)',
                                    }}
                                  >
                                    {catSummary?.average_percent != null
                                      ? cellFormat === 'grade_only'
                                        ? catSummary.display_grade
                                        : `${catSummary.average_percent}% (${catSummary.display_grade})`
                                      : '—'}
                                  </td>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            MODE 2: SPEED-GRADING FLOW + INTERAKTIVER NOTENSCHLÜSSEL-EDITOR
           ===================================================================== */}
        {mode === 'speed_grading' && activeAssessment && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div
              className="lg:col-span-2 rounded-2xl border p-6 shadow-sm space-y-5"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-4 border-b pb-4"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary-text)' }}
                  >
                    Speed-Grading Modus ({activeTerm.toUpperCase()})
                  </span>
                  <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                    Prüfung bewerten: {activeAssessment.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={activeAssessment.id}
                    onChange={(e) => setSelectedAssessmentId(e.target.value)}
                    className="px-3 py-2 rounded-xl border text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {termAssessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} (max. {a.max_points || 100} Pkt)
                      </option>
                    ))}
                  </select>

                  <div
                    className="flex rounded-xl p-1 border text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <button
                      onClick={() => setSpeedInputMode('percent')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        speedInputMode === 'percent' ? 'bg-teal-600 text-white' : ''
                      }`}
                    >
                      % Prozent
                    </button>
                    <button
                      onClick={() => setSpeedInputMode('points')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        speedInputMode === 'points' ? 'bg-teal-600 text-white' : ''
                      }`}
                    >
                      Rohpunkte (/{activeAssessment.max_points || 15})
                    </button>
                  </div>
                </div>
              </div>

              <div
                className="divide-y max-h-[620px] overflow-y-auto pr-2"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                {visibleStudents.map((stu, idx) => {
                  const entry = activeDataset.grades.find(
                    (g) => g.student_id === stu.id && g.assessment_id === activeAssessment.id
                  );
                  const summary = summaryByStudentId.get(stu.id);
                  const tierStyle = summary
                    ? TIER_BADGE_STYLES[summary.semantic_tier]
                    : undefined;

                  return (
                    <div key={stu.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono opacity-45 w-6">{idx + 1}.</span>
                        <span
                          className="font-semibold text-sm"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {stu.name}
                        </span>
                        {stu.level && (
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-bold font-mono"
                            style={{
                              backgroundColor: LEVEL_BADGE_STYLES[stu.level]?.bg,
                              color: LEVEL_BADGE_STYLES[stu.level]?.text,
                            }}
                          >
                            Niveau {stu.level}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {entry?.status === 'excused' ? (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-semibold">
                            Entschuldigt
                          </span>
                        ) : (
                          entry?.percent_value != null && (
                            <span
                              className="text-xs font-mono"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {entry.raw_points ??
                                Math.round(
                                  (entry.percent_value / 100) *
                                    (activeAssessment.max_points || 15)
                                )}
                              /{activeAssessment.max_points || 15} Pkt ={' '}
                              <strong>{entry.percent_value}%</strong>
                            </span>
                          )
                        )}

                        <input
                          type="text"
                          value={
                            entry?.status === 'excused'
                              ? 'K'
                              : speedInputMode === 'points'
                              ? entry?.raw_points ?? ''
                              : entry?.percent_value ?? ''
                          }
                          placeholder={
                            speedInputMode === 'points'
                              ? `0–${activeAssessment.max_points || 15}`
                              : '0–100%'
                          }
                          onChange={(e) =>
                            updateGradeEntry(
                              stu.id,
                              activeAssessment.id,
                              e.target.value,
                              speedInputMode
                            )
                          }
                          className="w-24 px-3 py-1.5 rounded-xl border text-center font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                          style={{
                            backgroundColor: 'var(--bg-subtle)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        />

                        <button
                          onClick={() =>
                            updateGradeEntry(
                              stu.id,
                              activeAssessment.id,
                              entry?.status === 'excused' ? '' : 'K',
                              'excused'
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                            entry?.status === 'excused'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          Attest
                        </button>

                        <span
                          className="w-16 text-center py-1 rounded-lg font-mono text-xs font-bold"
                          style={{
                            backgroundColor: tierStyle?.bg || 'var(--bg-subtle)',
                            color: tierStyle?.text || 'var(--text-muted)',
                          }}
                        >
                          {summary?.overall_display_grade || '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Live Notenspiegel + Interaktiver Notenschlüssel-Editor */}
            <div className="space-y-5">
              <div
                className="rounded-2xl border p-6 shadow-sm space-y-5"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'var(--primary-500)' }}
                  >
                    Live-Notenspiegel
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      Ø {calculationReport?.class_display_grade || '—'} (
                      {calculationReport?.class_average_percent ?? '—'}%)
                    </h3>
                  </div>
                </div>

                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map((tier) => {
                    const count = calculationReport?.distribution_buckets[tier - 1] || 0;
                    const maxCount = Math.max(
                      ...(calculationReport?.distribution_buckets || [1]),
                      1
                    );
                    const widthPct = Math.round((count / maxCount) * 100);
                    const style = TIER_BADGE_STYLES[tier];

                    return (
                      <div key={tier} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span style={{ color: 'var(--text-primary)' }}>{style.label}</span>
                          <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                            {count}x
                          </span>
                        </div>
                        <div
                          className="w-full h-2.5 rounded-full overflow-hidden"
                          style={{ backgroundColor: 'var(--bg-subtle)' }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.max(widthPct, count > 0 ? 8 : 0)}%`,
                              backgroundColor: style.text,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!isCurveEditorVisible ? (
                <button
                  onClick={() => setShowOnDemandCurveEditor(true)}
                  className="w-full py-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--primary-500)',
                  }}
                >
                  <Sliders className="w-4 h-4" />
                  <span>Notenschlüssel-Editor bei Bedarf einblenden</span>
                </button>
              ) : (
                <div
                  className="rounded-2xl border p-6 shadow-sm space-y-4"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: 'var(--primary-500)' }}
                      >
                        Notenschlüssel-Feintuning
                      </span>
                      <h3
                        className="text-base font-bold mt-0.5"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Interaktiver Notenschlüssel-Editor
                      </h3>
                    </div>
                    {!userSettings.showCurveEditorInSpeedGrading && (
                      <button
                        onClick={() => setShowOnDemandCurveEditor(false)}
                        className="text-[11px] font-semibold opacity-70 hover:opacity-100"
                      >
                        Einklappen
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(GRADING_CURVE_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => applyCurveCutoffs(preset.cutoffs, key)}
                        className={`p-2 rounded-xl border text-left text-xs transition ${
                          curvePresetKey === key ? 'ring-2 ring-teal-500 font-bold' : ''
                        }`}
                        style={{
                          backgroundColor:
                            curvePresetKey === key
                              ? 'var(--primary-soft)'
                              : 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2.5 pt-1 text-xs">
                    {(
                      [
                        { key: 'n1', label: 'Note 1 (Sehr gut) ab:', min: 80, max: 98 },
                        { key: 'n2', label: 'Note 2 (Gut) ab:', min: 65, max: 88 },
                        { key: 'n3', label: 'Note 3 (Befriedigend) ab:', min: 50, max: 75 },
                        { key: 'n4', label: 'Note 4 (Ausreichend) ab:', min: 35, max: 60 },
                        { key: 'n5', label: 'Note 5 (Mangelhaft) ab:', min: 15, max: 40 },
                      ] as const
                    ).map((row) => (
                      <div key={row.key} className="space-y-0.5">
                        <div className="flex justify-between font-semibold">
                          <span>{row.label}</span>
                          <span
                            className="font-mono font-bold"
                            style={{ color: 'var(--primary-500)' }}
                          >
                            ≥ {curveCutoffs[row.key]}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={row.min}
                          max={row.max}
                          value={curveCutoffs[row.key]}
                          onChange={(e) =>
                            applyCurveCutoffs(
                              { ...curveCutoffs, [row.key]: Number(e.target.value) },
                              'custom'
                            )
                          }
                          className="w-full accent-teal-600"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Quick Binnendifferenzierung Status in Speed-Grading */}
                  <div
                    className="p-3 rounded-xl border text-[11px] space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                        Binnendifferenzierung (G / M / E):
                      </span>
                      <button
                        onClick={() => toggleStudentLevelsEnabled(!isDifferentiationEnabled)}
                        className="px-2 py-0.5 rounded font-bold text-[10px]"
                        style={{
                          backgroundColor: isDifferentiationEnabled
                            ? 'var(--primary-soft)'
                            : 'var(--bg-surface)',
                          color: isDifferentiationEnabled
                            ? 'var(--primary-text)'
                            : 'var(--text-secondary)',
                        }}
                      >
                        {isDifferentiationEnabled ? 'Aktiv verrechnet' : 'Inaktiv (gleicher Maßstab)'}
                      </button>
                    </div>
                    {isDifferentiationEnabled && (
                      <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                        <div className="px-2 py-1 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold">
                          G: {currentLevelOffsets.G > 0 ? `+${currentLevelOffsets.G}` : currentLevelOffsets.G}%
                        </div>
                        <div className="px-2 py-1 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold">
                          M: {currentLevelOffsets.M > 0 ? `+${currentLevelOffsets.M}` : currentLevelOffsets.M}%
                        </div>
                        <div className="px-2 py-1 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold">
                          E: {currentLevelOffsets.E > 0 ? `+${currentLevelOffsets.E}` : currentLevelOffsets.E}%
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setMode('configurator')}
                      className="w-full text-left underline font-semibold pt-0.5"
                      style={{ color: 'var(--primary-500)' }}
                    >
                      → Im Gewichtungs-Baukasten detailliert anpassen (inkl. G/M/E-Tabelle)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            MODE 3: SCHÜLER-360°-AKTE (ELTERNGESPRÄCH, ZEUGNISNOTE & DRUCK)
           ===================================================================== */}
        {mode === 'student_360' && activeStudent && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div
              className="rounded-2xl border p-4 shadow-sm max-h-[680px] overflow-y-auto space-y-1"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <div
                className="text-xs font-bold uppercase tracking-wider px-2 py-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Einzel-Ansicht (Datenschutz-Modus)
              </div>
              {visibleStudents.map((stu) => {
                const sum = summaryByStudentId.get(stu.id);
                const selected = stu.id === activeStudent.id;
                return (
                  <button
                    key={stu.id}
                    onClick={() => setSelectedStudentId(stu.id)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                      selected ? 'shadow-sm' : 'hover:opacity-90'
                    }`}
                    style={{
                      backgroundColor: selected ? 'var(--primary-soft)' : 'transparent',
                      color: selected ? 'var(--primary-text)' : 'var(--text-primary)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span>{stu.name}</span>
                      {stu.level && (
                        <span className="text-[10px] font-mono opacity-75">({stu.level})</span>
                      )}
                    </div>
                    <span className="font-mono font-bold">
                      {sum?.overall_display_grade || '—'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-3 space-y-6">
              <div
                className="rounded-2xl border p-6 shadow-sm flex flex-wrap items-center justify-between gap-4"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--primary-soft)',
                        color: 'var(--primary-text)',
                      }}
                    >
                      Elterngesprächs-Ansicht ({activeTerm.toUpperCase()})
                    </span>
                    {activeStudent.level && (
                      <span
                        className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: LEVEL_BADGE_STYLES[activeStudent.level]?.bg,
                          color: LEVEL_BADGE_STYLES[activeStudent.level]?.text,
                        }}
                      >
                        Niveau {activeStudent.level} ({LEVEL_BADGE_STYLES[activeStudent.level]?.desc})
                      </span>
                    )}
                  </div>
                  <h2
                    className="text-2xl font-extrabold mt-2"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {activeStudent.name}
                  </h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {activeStudent.notes || 'Keine besonderen pädagogischen Vermerke hinterlegt.'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() =>
                      printStudentParentReport(
                        activeDataset,
                        activeStudent,
                        activeStudentSummary,
                        activeTerm
                      )
                    }
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-sm"
                    style={{ backgroundColor: 'var(--primary-500)' }}
                  >
                    <Printer className="w-4 h-4" />
                    <span>Elterngesprächs-Bogen drucken / PDF</span>
                  </button>

                  <div className="text-right">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Berechneter Schnitt
                    </div>
                    <div
                      className="text-3xl font-extrabold font-mono mt-0.5"
                      style={{ color: 'var(--primary-500)' }}
                    >
                      {activeStudentSummary?.overall_display_grade || '—'}
                    </div>
                    <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                      {activeStudentSummary?.overall_percent != null
                        ? `${activeStudentSummary.overall_percent}% Gesamtleistung`
                        : 'Noch keine Bewertung'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Zeugnisnoten-Festlegung & Pädagogische Begründung */}
              <div
                className="rounded-2xl border p-5 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <label
                    className="block text-xs font-bold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Festgesetzte Zeugnisnote ({activeTerm.toUpperCase()}):
                  </label>
                  <input
                    type="text"
                    value={
                      (activeTerm === 'hj1'
                        ? activeDataset.reportCardOverrides?.[activeStudent.id]?.hj1
                        : activeTerm === 'hj2'
                        ? activeDataset.reportCardOverrides?.[activeStudent.id]?.hj2
                        : activeDataset.reportCardOverrides?.[activeStudent.id]?.all) || ''
                    }
                    placeholder={`Vorschlag: ${activeStudentSummary?.overall_display_grade || '—'}`}
                    onChange={(e) => updateReportCardOverride(activeStudent.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border font-mono text-sm font-bold bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--primary-500)' }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label
                    className="block text-xs font-bold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Pädagogische Begründung / Bemerkung für Konferenz & Elternbogen:
                  </label>
                  <input
                    type="text"
                    value={activeDataset.reportCardOverrides?.[activeStudent.id]?.reason || ''}
                    placeholder="z.B. Aufrundung wegen kontinuierlicher Steigerung im Unterrichtsgespräch"
                    onChange={(e) =>
                      updateReportCardOverride(
                        activeStudent.id,
                        (activeTerm === 'hj1'
                          ? activeDataset.reportCardOverrides?.[activeStudent.id]?.hj1
                          : activeTerm === 'hj2'
                          ? activeDataset.reportCardOverrides?.[activeStudent.id]?.hj2
                          : activeDataset.reportCardOverrides?.[activeStudent.id]?.all) || '',
                        e.target.value
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl border text-xs bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Category Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeStudentSummary?.category_results.map((cr) => (
                  <div
                    key={cr.category_id}
                    className="rounded-2xl border p-5 shadow-sm space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs font-bold"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {cr.category_name}
                      </span>
                      <span
                        className="text-[11px] font-mono px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Effektiv {cr.effective_weight_percent}%
                      </span>
                    </div>
                    <div
                      className="text-2xl font-extrabold font-mono"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {cr.average_percent != null
                        ? `${cr.average_percent}% · ${cr.display_grade}`
                        : '— (Noch leer)'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {cr.graded_count} Leistungsnachweise erfasst
                    </div>
                  </div>
                ))}
              </div>

              {/* Interactive "Was-wäre-wenn" Simulator (or on-demand button if hidden in Settings) */}
              {!isSimulatorVisible ? (
                <button
                  onClick={() => setShowOnDemandSimulator(true)}
                  className="w-full py-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--primary-500)',
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>„Was-wäre-wenn“-Zielnoten-Rechner bei Bedarf einblenden</span>
                </button>
              ) : (
                <div
                  className="rounded-2xl border p-6 shadow-sm space-y-4"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" style={{ color: 'var(--primary-500)' }} />
                      <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                        „Was-wäre-wenn“-Simulator (Zielnoten-Rechner für Beratung & Elterngespräch)
                      </h3>
                    </div>
                    {!userSettings.showWhatIfSimulator && (
                      <button
                        onClick={() => setShowOnDemandSimulator(false)}
                        className="text-xs font-semibold opacity-70 hover:opacity-100"
                      >
                        Einklappen
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    <div>
                      <label
                        className="block text-xs font-semibold mb-1.5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Nächste Prüfung in Kategorie:
                      </label>
                      <select
                        value={simCategoryId}
                        onChange={(e) => setSimCategoryId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border text-xs font-semibold"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {activeDataset.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        className="block text-xs font-semibold mb-1.5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Gewünschter Gesamtschnitt:{' '}
                        <strong className="font-mono">{simTargetPercent}%</strong>
                      </label>
                      <input
                        type="range"
                        min={45}
                        max={95}
                        step={1}
                        value={simTargetPercent}
                        onChange={(e) => setSimTargetPercent(Number(e.target.value))}
                        className="w-full accent-teal-600"
                      />
                    </div>

                    <div
                      className="p-4 rounded-xl border text-center"
                      style={{
                        backgroundColor: 'var(--primary-soft)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
                        Benötigtes Ergebnis in nächster Prüfung:
                      </div>
                      <div
                        className="text-2xl font-extrabold font-mono mt-1"
                        style={{ color: 'var(--primary-text)' }}
                      >
                        {simulatedNeededPercent !== null ? `${simulatedNeededPercent}%` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            MODE 4: VISUELLER GEWICHTUNGS-BAUKASTEN (INKL. INDIVIDUELLE KATEGORIEN & VORLAGEN)
           ===================================================================== */}
        {mode === 'configurator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div
              className="lg:col-span-2 rounded-2xl border p-6 shadow-sm space-y-6"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--primary-soft)',
                      color: 'var(--primary-text)',
                    }}
                  >
                    Individuelle Fach-Konfiguration ohne Formeln
                  </span>
                  <h2 className="text-xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>
                    Gewichtungs-Baukasten für {activeDataset.subjectName} ({activeDataset.className})
                  </h2>
                </div>

                <button
                  onClick={() => setShowSaveTemplateInput((s) => !s)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-text)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <BookmarkPlus className="w-4 h-4" />
                  <span>Als eigene Vorlage speichern</span>
                </button>
              </div>

              {showSaveTemplateInput && (
                <form
                  onSubmit={handleSaveCurrentAsCustomTemplate}
                  className="p-4 rounded-2xl border flex flex-wrap items-end gap-3"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex-1 min-w-[220px]">
                    <label
                      className="block text-[11px] font-bold mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Name deiner Vorlage (wird für andere Klassen & Geräte synchronisiert)
                    </label>
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="z. B. Sport Sek I (70% Praxis / 30% Theorie)"
                      className="w-full px-3 py-1.5 rounded-xl border text-xs bg-white dark:bg-slate-900"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl text-xs font-bold text-white"
                    style={{ backgroundColor: 'var(--primary-500)' }}
                  >
                    Vorlage sichern
                  </button>
                </form>
              )}

              {/* Gespeicherte eigene Vorlagen */}
              {userSettings.customWeightingTemplates.length > 0 && (
                <div className="space-y-2">
                  <label
                    className="block text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Deine gespeicherten Fach-Vorlagen (1-Klick Übernahme)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {userSettings.customWeightingTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => applyCustomTemplate(tpl.id)}
                        className="px-3 py-2 rounded-xl border text-left text-xs transition hover:border-teal-500"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <div className="font-bold">{tpl.name}</div>
                        <div className="text-[10px] opacity-75">
                          {tpl.categories
                            .map((c) => `${c.short_code} ${Math.round(c.weight * 100)}%`)
                            .join(' · ')}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label
                  className="block text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  1. Notenskala / Bewertungssystem wählen
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(
                    [
                      {
                        id: 'de_classic_1_to_6',
                        title: 'Schulnoten 1–6 (mit Tendenzen)',
                        desc: 'Standard Sek I (1+, 1, 1-, 2+ ... 6) & Prozent-Umrechnung',
                      },
                      {
                        id: 'de_oberstufe_0_to_15',
                        title: 'Oberstufe 0–15 Punkte (MSS)',
                        desc: 'Gymnasiale Kursstufe / Abitur (15 Pkt = 1+ bis 0 Pkt = 6)',
                      },
                      {
                        id: 'us_letter_gpa',
                        title: 'US Letter Grades (A+ bis F)',
                        desc: 'Internationales System inkl. 4.0 GPA-Skala',
                      },
                    ] as const
                  ).map((sc) => {
                    const selected = activeDataset.config.scale_id === sc.id;
                    return (
                      <button
                        key={sc.id}
                        onClick={() =>
                          updateSubjectConfig((ds) => ({
                            ...ds,
                            config: {
                              ...ds.config,
                              scale_id: sc.id as GradingScaleId,
                              custom_thresholds: null,
                            },
                          }))
                        }
                        className={`p-3.5 rounded-xl border text-left transition ${
                          selected ? 'ring-2 ring-teal-500' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: selected ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                          {sc.title}
                        </div>
                        <div
                          className="text-[11px] mt-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {sc.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label
                  className="block text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  2. Berechnungs-Modell wählen
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(
                    [
                      {
                        id: 'category_buckets',
                        title: 'Kategorien-Töpfe (Standard)',
                        desc: 'Zuerst Durchschnitt pro Topf (z.B. LNW, Mündlich, Tests), dann nach Topf-Gewicht verrechnen.',
                      },
                      {
                        id: 'direct_weights',
                        title: 'Freie Faktoren (1x, 2x)',
                        desc: 'Alle Noten fließen in einen gemeinsamen Topf – jede Prüfung zählt nach ihrem Faktor.',
                      },
                      {
                        id: 'total_points',
                        title: 'Punktesammler (Total Points)',
                        desc: 'Addiert alle erreichten Rohpunkte über das Halbjahr durch die Gesamtpunktzahl.',
                      },
                    ] as const
                  ).map((wm) => {
                    const selected = activeDataset.config.weighting_mode === wm.id;
                    return (
                      <button
                        key={wm.id}
                        onClick={() =>
                          updateSubjectConfig((ds) => ({
                            ...ds,
                            config: { ...ds.config, weighting_mode: wm.id as WeightingMode },
                          }))
                        }
                        className={`p-3.5 rounded-xl border text-left transition ${
                          selected ? 'ring-2 ring-teal-500' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: selected ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                          {wm.title}
                        </div>
                        <div
                          className="text-[11px] mt-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {wm.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Interactive 100% Split Bar + Custom Category Builder */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    3. Kategorien & Gewichtung individuell anpassen
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {displayedWeightingPresets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() =>
                          updateSubjectConfig((ds) => ({
                            ...ds,
                            categories: ds.categories.map((c, i) => ({
                              ...c,
                              weight: preset.weights[i] ?? 0.2,
                            })),
                          }))
                        }
                        className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold border hover:opacity-90"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                        title={preset.desc}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowAllWeightingPresets((s) => !s)}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold underline opacity-75 hover:opacity-100"
                      style={{ color: 'var(--primary-500)' }}
                    >
                      {showAllWeightingPresets ? 'Nur Favoriten' : 'Weitere Vorlagen...'}
                    </button>
                  </div>
                </div>

                <div
                  className="h-8 w-full rounded-xl overflow-hidden flex border p-0.5 gap-0.5"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  {activeDataset.categories.map((cat, idx) => {
                    const pct = Math.round((cat.weight / totalCatWeight) * 100);
                    const palette = ['#0D9488', '#0284C7', '#7C3AED', '#EA580C', '#16A34A'];
                    return (
                      <div
                        key={cat.id}
                        style={{ width: `${pct}%`, backgroundColor: palette[idx % palette.length] }}
                        className="h-full first:rounded-l-lg last:rounded-r-lg flex items-center justify-center text-[11px] font-bold text-white transition-all duration-200 overflow-hidden px-2 whitespace-nowrap"
                      >
                        {cat.short_code}: {pct}%
                      </div>
                    );
                  })}
                </div>

                {/* Individual Category Rows (Editable Name, ShortCode, Slider, Exact %, Streichnote, Delete) */}
                <div className="space-y-3 pt-2">
                  {activeDataset.categories.map((cat) => {
                    const pct = Math.round((cat.weight / totalCatWeight) * 100);
                    return (
                      <div
                        key={cat.id}
                        className="p-3.5 rounded-xl border space-y-2.5"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                            <input
                              type="text"
                              value={cat.name}
                              onChange={(e) =>
                                updateSubjectConfig((ds) => ({
                                  ...ds,
                                  categories: ds.categories.map((c) =>
                                    c.id === cat.id ? { ...c, name: e.target.value } : c
                                  ),
                                }))
                              }
                              className="px-2.5 py-1 rounded-lg border text-xs font-bold bg-white dark:bg-slate-900 flex-1"
                              style={{
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-primary)',
                              }}
                              title="Kategoriename bearbeiten"
                            />
                            <input
                              type="text"
                              value={cat.short_code}
                              onChange={(e) =>
                                updateSubjectConfig((ds) => ({
                                  ...ds,
                                  categories: ds.categories.map((c) =>
                                    c.id === cat.id ? { ...c, short_code: e.target.value } : c
                                  ),
                                }))
                              }
                              className="w-20 px-2 py-1 rounded-lg border text-xs font-mono text-center bg-white dark:bg-slate-900"
                              style={{
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-primary)',
                              }}
                              title="Kürzel (z. B. LNW, Mündl, Praxis)"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg"
                              style={{
                                backgroundColor: 'var(--primary-soft)',
                                color: 'var(--primary-text)',
                              }}
                            >
                              Effektiv: {pct}%
                            </span>

                            {activeDataset.categories.length > 1 && (
                              <button
                                onClick={() => handleDeleteCategory(cat.id)}
                                className="p-1.5 rounded-lg border text-rose-600 hover:bg-rose-500/10"
                                style={{ borderColor: 'var(--border-subtle)' }}
                                title="Kategorie entfernen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex-1 min-w-[160px] flex items-center gap-2">
                            <input
                              type="range"
                              min={5}
                              max={100}
                              value={Math.round(cat.weight * 100)}
                              onChange={(e) => {
                                const newW = Number(e.target.value) / 100;
                                updateSubjectConfig((ds) => ({
                                  ...ds,
                                  categories: ds.categories.map((c) =>
                                    c.id === cat.id ? { ...c, weight: newW } : c
                                  ),
                                }));
                              }}
                              className="flex-1 accent-teal-600"
                            />
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={Math.round(cat.weight * 100)}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                updateSubjectConfig((ds) => ({
                                  ...ds,
                                  categories: ds.categories.map((c) =>
                                    c.id === cat.id ? { ...c, weight: val / 100 } : c
                                  ),
                                }));
                              }}
                              className="w-16 px-2 py-1 rounded-lg border font-mono text-xs text-center bg-white dark:bg-slate-900"
                              style={{
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-primary)',
                              }}
                              title="Gewichtungsfaktor direkt eingeben"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <label
                              className="text-[11px] font-medium"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              Streichnote:
                            </label>
                            <select
                              value={cat.drop_lowest_count}
                              onChange={(e) => {
                                const count = Number(e.target.value);
                                updateSubjectConfig((ds) => ({
                                  ...ds,
                                  categories: ds.categories.map((c) =>
                                    c.id === cat.id ? { ...c, drop_lowest_count: count } : c
                                  ),
                                }));
                              }}
                              className="px-2 py-1 rounded-lg border text-xs font-mono"
                              style={{
                                backgroundColor: 'var(--bg-surface)',
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-primary)',
                              }}
                            >
                              <option value={0}>Alle zählen (0)</option>
                              <option value={1}>Schlechteste 1 streichen</option>
                              <option value={2}>Schlechteste 2 streichen</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Custom Category Form */}
                <form
                  onSubmit={handleAddCategory}
                  className="p-3.5 rounded-xl border border-dashed flex flex-wrap items-center gap-2.5 text-xs"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Neue Kategorie (z. B. Projektarbeit, Heftführung, Fachpraxis)..."
                    className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <input
                    type="text"
                    value={newCategoryShort}
                    onChange={(e) => setNewCategoryShort(e.target.value)}
                    placeholder="Kürzel (z.B. Proj)"
                    className="w-28 px-3 py-1.5 rounded-lg border font-mono bg-transparent"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg font-bold text-white flex items-center gap-1"
                    style={{ backgroundColor: 'var(--primary-500)' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Kategorie hinzufügen</span>
                  </button>
                </form>
              </div>

              {/* =====================================================================
                  4. NOTENSCHLÜSSEL: WELCHE PROZENT ENTSPRECHEN WELCHER NOTE?
                 ===================================================================== */}
              <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label
                      className="block text-xs font-bold uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      4. Notenschlüssel — Welche Prozent entsprechen welcher Note?
                    </label>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Wähle einen offiziellen Schlüssel oder verschiebe die Mindestprozent-Grenzen stufenlos. Alle Tendenzen (1+, 1-, 2+ …) passen sich automatisch proportional an.
                    </p>
                  </div>
                </div>

                {/* Preset Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {Object.entries(GRADING_CURVE_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applyCurveCutoffs(preset.cutoffs, key)}
                      className={`p-3 rounded-xl border text-left transition ${
                        curvePresetKey === key ? 'ring-2 ring-teal-500 font-bold' : 'opacity-85 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor:
                          curvePresetKey === key ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div className="text-xs font-bold">{preset.name}</div>
                      <div
                        className="text-[10px] mt-1 font-normal"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Sliders + Exact Number Inputs for Note 1..5 */}
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  {(
                    [
                      {
                        key: 'n1',
                        grade: 'Note 1 (Sehr gut)',
                        tier: 1,
                        min: 80,
                        max: 98,
                        nextLabel: '100%',
                      },
                      {
                        key: 'n2',
                        grade: 'Note 2 (Gut)',
                        tier: 2,
                        min: 65,
                        max: 88,
                        nextLabel: `${curveCutoffs.n1 - 1}%`,
                      },
                      {
                        key: 'n3',
                        grade: 'Note 3 (Befriedigend)',
                        tier: 3,
                        min: 48,
                        max: 75,
                        nextLabel: `${curveCutoffs.n2 - 1}%`,
                      },
                      {
                        key: 'n4',
                        grade: 'Note 4 (Ausreichend / Bestehensgrenze)',
                        tier: 4,
                        min: 30,
                        max: 60,
                        nextLabel: `${curveCutoffs.n3 - 1}%`,
                      },
                      {
                        key: 'n5',
                        grade: 'Note 5 (Mangelhaft)',
                        tier: 5,
                        min: 10,
                        max: 40,
                        nextLabel: `${curveCutoffs.n4 - 1}%`,
                      },
                    ] as const
                  ).map((row) => {
                    const badgeStyle = TIER_BADGE_STYLES[row.tier];
                    return (
                      <div
                        key={row.key}
                        className="grid grid-cols-1 md:grid-cols-12 items-center gap-2 text-xs"
                      >
                        <div className="md:col-span-4 flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded font-bold text-[11px]"
                            style={{
                              backgroundColor: badgeStyle.bg,
                              color: badgeStyle.text,
                              border: `1px solid ${badgeStyle.border}`,
                            }}
                          >
                            {row.grade}
                          </span>
                        </div>
                        <div className="md:col-span-5 flex items-center gap-2">
                          <input
                            type="range"
                            min={row.min}
                            max={row.max}
                            value={curveCutoffs[row.key]}
                            onChange={(e) =>
                              applyCurveCutoffs(
                                { ...curveCutoffs, [row.key]: Number(e.target.value) },
                                'custom'
                              )
                            }
                            className="w-full accent-teal-600"
                          />
                        </div>
                        <div className="md:col-span-3 flex items-center justify-end gap-1.5 font-mono">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            ab
                          </span>
                          <input
                            type="number"
                            min={row.min}
                            max={row.max}
                            value={curveCutoffs[row.key]}
                            onChange={(e) =>
                              applyCurveCutoffs(
                                { ...curveCutoffs, [row.key]: Number(e.target.value) || row.min },
                                'custom'
                              )
                            }
                            className="w-16 px-2 py-1 rounded-lg border font-bold text-center bg-white dark:bg-slate-900"
                            style={{
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--primary-500)',
                            }}
                          />
                          <span className="font-bold">%</span>
                          <span className="text-[10px] opacity-70">bis {row.nextLabel}</span>
                        </div>
                      </div>
                    );
                  })}

                  <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                    <span
                      className="px-2 py-0.5 rounded font-bold text-[11px]"
                      style={{
                        backgroundColor: TIER_BADGE_STYLES[6].bg,
                        color: TIER_BADGE_STYLES[6].text,
                        border: `1px solid ${TIER_BADGE_STYLES[6].border}`,
                      }}
                    >
                      Note 6 (Ungenügend)
                    </span>
                    <span className="font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>
                      0% bis {Math.max(0, curveCutoffs.n5 - 1)}%
                    </span>
                  </div>
                </div>

                {/* All 16 Fine Thresholds Overview (1+ down to 6) */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>
                    Resultierende Feinstufen-Schwellen (Standard / M-Niveau inkl. +/- Tendenzen):
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {activeFineThresholds.map((t) => {
                      const style = TIER_BADGE_STYLES[t.semantic_tier] || TIER_BADGE_STYLES[3];
                      return (
                        <div
                          key={t.display_label}
                          className="p-1.5 rounded-lg border text-center"
                          style={{
                            backgroundColor: 'var(--bg-subtle)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <div
                            className="text-xs font-extrabold rounded px-1 py-0.5 inline-block"
                            style={{ backgroundColor: style.bg, color: style.text }}
                          >
                            {t.display_label}
                          </div>
                          <div
                            className="text-[11px] font-mono font-bold mt-1"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            ≥ {Math.round(t.min_percent)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* =====================================================================
                  5. BINNENDIFFERENZIERUNG (G / M / E NIVEAUSTUFEN & PROZENT-MASSSTAB)
                 ===================================================================== */}
              <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <label
                      className="block text-xs font-bold uppercase tracking-wider"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      5. Binnendifferenzierung (G / M / E Niveaustufen)
                    </label>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Steuere, ob die Niveaustufen <strong>G</strong> (Grundlegend), <strong>M</strong> (Mittel) und <strong>E</strong> (Erweitert) die benötigten Prozentgrenzen automatisch verschieben oder nur als pädagogisches Info-Badge dienen.
                    </p>
                  </div>

                  <button
                    onClick={() => toggleStudentLevelsEnabled(!isDifferentiationEnabled)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold border transition"
                    style={{
                      backgroundColor: isDifferentiationEnabled
                        ? 'var(--primary-soft)'
                        : 'var(--bg-subtle)',
                      color: isDifferentiationEnabled
                        ? 'var(--primary-text)'
                        : 'var(--text-secondary)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {isDifferentiationEnabled
                      ? '✓ Binnendifferenzierung in Berechnung AKTIV'
                      : 'Nur als optisches Badge (0% Verrechnung)'}
                  </button>
                </div>

                {/* Differentiation Presets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {[
                    {
                      title: 'Gemeinschaftsschule Standard',
                      desc: 'G-Niveau: -5% Hürde · M: 0% · E-Niveau: +3% Anspruch',
                      offsets: { G: -5, M: 0, E: 3 },
                      enable: true,
                    },
                    {
                      title: 'Starke Differenzierung',
                      desc: 'G-Niveau: -10% Hürde · M: 0% · E-Niveau: +5% Anspruch',
                      offsets: { G: -10, M: 0, E: 5 },
                      enable: true,
                    },
                    {
                      title: 'Fokus G-Förderung',
                      desc: 'G-Niveau: -8% Hürde · M & E regulärer Maßstab (0%)',
                      offsets: { G: -8, M: 0, E: 0 },
                      enable: true,
                    },
                    {
                      title: 'Gleicher Maßstab für alle',
                      desc: 'G / M / E nur zur Dokumentation (0% Verschiebung)',
                      offsets: { G: 0, M: 0, E: 0 },
                      enable: false,
                    },
                  ].map((preset) => {
                    const isCurrent =
                      isDifferentiationEnabled === preset.enable &&
                      currentLevelOffsets.G === preset.offsets.G &&
                      currentLevelOffsets.M === preset.offsets.M &&
                      currentLevelOffsets.E === preset.offsets.E;
                    return (
                      <button
                        key={preset.title}
                        onClick={() => applyDifferentiationPreset(preset.offsets, preset.enable)}
                        className={`p-3 rounded-xl border text-left transition ${
                          isCurrent ? 'ring-2 ring-teal-500 font-bold' : 'opacity-85 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: isCurrent ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <div className="text-xs font-bold">{preset.title}</div>
                        <div
                          className="text-[10px] mt-1 font-normal"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {preset.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Individual Level Sliders (G, M, E) */}
                <div
                  className="p-4 rounded-xl border space-y-3"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
                >
                  {(
                    [
                      {
                        lvl: 'G' as const,
                        title: 'G-Niveau (Grundlegendes Niveau)',
                        hint: 'Negativer Wert senkt die Prozenthürde (z. B. -5% = Note 2 schon ab 70% statt 75%)',
                      },
                      {
                        lvl: 'M' as const,
                        title: 'M-Niveau (Mittleres Niveau / Referenz)',
                        hint: 'In der Regel 0% (entspricht exakt dem oben eingestellten Basis-Notenschlüssel)',
                      },
                      {
                        lvl: 'E' as const,
                        title: 'E-Niveau (Erweitertes Niveau)',
                        hint: 'Positiver Wert erhöht den Anspruch (z. B. +3% = Note 2 ab 78% statt 75%)',
                      },
                    ]
                  ).map((item) => {
                    const style = LEVEL_BADGE_STYLES[item.lvl];
                    const val = isDifferentiationEnabled ? currentLevelOffsets[item.lvl] : 0;
                    return (
                      <div
                        key={item.lvl}
                        className="grid grid-cols-1 md:grid-cols-12 items-center gap-2 text-xs"
                      >
                        <div className="md:col-span-5">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded font-extrabold text-xs"
                              style={{ backgroundColor: style.bg, color: style.text }}
                            >
                              {item.lvl}
                            </span>
                            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                              {item.title}
                            </span>
                          </div>
                          <div
                            className="text-[10px] mt-0.5"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {item.hint}
                          </div>
                        </div>

                        <div className="md:col-span-4 flex items-center gap-2">
                          <input
                            type="range"
                            min={-15}
                            max={15}
                            step={1}
                            value={val}
                            onChange={(e) => updateLevelOffset(item.lvl, Number(e.target.value))}
                            className="w-full accent-teal-600"
                          />
                        </div>

                        <div className="md:col-span-3 flex items-center justify-end gap-1.5 font-mono">
                          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            Schwelle:
                          </span>
                          <input
                            type="number"
                            min={-20}
                            max={20}
                            value={val}
                            onChange={(e) =>
                              updateLevelOffset(item.lvl, Number(e.target.value) || 0)
                            }
                            className="w-16 px-2 py-1 rounded-lg border font-bold text-center bg-white dark:bg-slate-900"
                            style={{
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--primary-500)',
                            }}
                          />
                          <span className="font-bold">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Live Comparison Table: Welche Prozent entsprechen welcher Note auf G / M / E? */}
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div
                    className="px-4 py-2.5 text-xs font-bold border-b flex items-center justify-between"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span>
                      Live-Maßstab im Überblick: Welche Prozent ergeben welche Note je Niveau?
                    </span>
                    <span className="text-[11px] font-mono opacity-80">
                      {isDifferentiationEnabled
                        ? `Aktiv (G: ${currentLevelOffsets.G}%, M: ${currentLevelOffsets.M}%, E: +${currentLevelOffsets.E}%)`
                        : 'Inaktiv (alle Niveaus gleich)'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr
                          className="border-b text-[11px]"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <th className="py-2 px-3 font-bold">Note</th>
                          <th className="py-2 px-3 font-bold">
                            <span
                              className="px-1.5 py-0.5 rounded mr-1"
                              style={{
                                backgroundColor: LEVEL_BADGE_STYLES.G.bg,
                                color: LEVEL_BADGE_STYLES.G.text,
                              }}
                            >
                              G
                            </span>
                            Grundlegendes Niveau
                          </th>
                          <th className="py-2 px-3 font-bold">
                            <span
                              className="px-1.5 py-0.5 rounded mr-1"
                              style={{
                                backgroundColor: LEVEL_BADGE_STYLES.M.bg,
                                color: LEVEL_BADGE_STYLES.M.text,
                              }}
                            >
                              M
                            </span>
                            Mittleres Niveau
                          </th>
                          <th className="py-2 px-3 font-bold">
                            <span
                              className="px-1.5 py-0.5 rounded mr-1"
                              style={{
                                backgroundColor: LEVEL_BADGE_STYLES.E.bg,
                                color: LEVEL_BADGE_STYLES.E.text,
                              }}
                            >
                              E
                            </span>
                            Erweitertes Niveau
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Note 1 (Sehr gut)', base: curveCutoffs.n1, tier: 1 },
                          { label: 'Note 2 (Gut)', base: curveCutoffs.n2, tier: 2 },
                          { label: 'Note 3 (Befriedigend)', base: curveCutoffs.n3, tier: 3 },
                          { label: 'Note 4 (Ausreichend)', base: curveCutoffs.n4, tier: 4 },
                          { label: 'Note 5 (Mangelhaft)', base: curveCutoffs.n5, tier: 5 },
                        ].map((row) => {
                          const gOffset = isDifferentiationEnabled ? currentLevelOffsets.G : 0;
                          const mOffset = isDifferentiationEnabled ? currentLevelOffsets.M : 0;
                          const eOffset = isDifferentiationEnabled ? currentLevelOffsets.E : 0;
                          const gMin = Math.max(1, Math.min(99, row.base + gOffset));
                          const mMin = Math.max(1, Math.min(99, row.base + mOffset));
                          const eMin = Math.max(1, Math.min(99, row.base + eOffset));
                          const style = TIER_BADGE_STYLES[row.tier];
                          return (
                            <tr
                              key={row.label}
                              className="border-b last:border-b-0"
                              style={{ borderColor: 'var(--border-subtle)' }}
                            >
                              <td className="py-2 px-3 font-bold">
                                <span
                                  className="px-2 py-0.5 rounded text-[11px]"
                                  style={{ backgroundColor: style.bg, color: style.text }}
                                >
                                  {row.label}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono font-bold">ab {gMin}%</td>
                              <td className="py-2 px-3 font-mono font-bold">ab {mMin}%</td>
                              <td className="py-2 px-3 font-mono font-bold">ab {eMin}%</td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td className="py-2 px-3 font-bold">
                            <span
                              className="px-2 py-0.5 rounded text-[11px]"
                              style={{
                                backgroundColor: TIER_BADGE_STYLES[6].bg,
                                color: TIER_BADGE_STYLES[6].text,
                              }}
                            >
                              Note 6 (Ungenügend)
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            unter {Math.max(1, curveCutoffs.n5 + (isDifferentiationEnabled ? currentLevelOffsets.G : 0))}%
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            unter {Math.max(1, curveCutoffs.n5 + (isDifferentiationEnabled ? currentLevelOffsets.M : 0))}%
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            unter {Math.max(1, curveCutoffs.n5 + (isDifferentiationEnabled ? currentLevelOffsets.E : 0))}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Live-Vertrauens-Check */}
            <div
              className="rounded-2xl border p-6 shadow-sm space-y-5 h-fit sticky top-24"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: 'var(--primary-500)' }}
                >
                  Live-Vertrauens-Check (WASM)
                </span>
                <h3 className="text-lg font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                  So rechnet deine Einstellung
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Wähle ein Kind aus der Klasse, um Gewichtung, Notenschlüssel und G/M/E-Niveau live zu prüfen:
                </p>
              </div>

              {visibleStudents.length > 0 && (
                <div className="space-y-2">
                  <select
                    value={activeStudent?.id || ''}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {visibleStudents.map((stu) => (
                      <option key={stu.id} value={stu.id}>
                        {stu.name} (Niveau {stu.level || 'M'})
                      </option>
                    ))}
                  </select>

                  {activeStudent && (
                    <div
                      className="p-2.5 rounded-xl border flex items-center justify-between text-xs"
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Niveaustufe von {activeStudent.name}:
                      </span>
                      <button
                        onClick={() => cycleStudentLevel(activeStudent.id)}
                        className="px-2.5 py-1 rounded-lg font-extrabold text-xs transition hover:opacity-90"
                        style={{
                          backgroundColor:
                            LEVEL_BADGE_STYLES[activeStudent.level || 'M']?.bg || '#E0F2FE',
                          color:
                            LEVEL_BADGE_STYLES[activeStudent.level || 'M']?.text || '#0369A1',
                        }}
                        title="Klicken, um zwischen G, M und E umzuschalten"
                      >
                        Niveau {activeStudent.level || 'M'} (Klick zum Testen)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeStudent && summaryByStudentId.get(activeStudent.id) && (
                <div className="space-y-3">
                  {summaryByStudentId
                    .get(activeStudent.id)!
                    .category_results.map((cr) => (
                      <div
                        key={cr.category_id}
                        className="p-3 rounded-xl border flex items-center justify-between text-xs"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div>
                          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
                            {cr.category_name}
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            Effektives Gewicht: {cr.effective_weight_percent}%
                          </div>
                        </div>
                        <div
                          className="font-mono font-bold"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {cr.average_percent != null
                            ? `${cr.average_percent}% (${cr.display_grade})`
                            : 'Noch leer'}
                        </div>
                      </div>
                    ))}

                  <div
                    className="p-4 rounded-xl border text-center space-y-1"
                    style={{
                      backgroundColor: 'var(--primary-soft)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
                      Resultierender Gesamtschnitt für {activeStudent.name} (Niveau{' '}
                      {activeStudent.level || 'M'}):
                    </div>
                    <div
                      className="text-2xl font-extrabold font-mono"
                      style={{ color: 'var(--primary-text)' }}
                    >
                      {summaryByStudentId.get(activeStudent.id)?.overall_percent ?? '—'}% · Note{' '}
                      {summaryByStudentId.get(activeStudent.id)?.overall_display_grade}
                    </div>
                    <div className="text-[11px] opacity-80" style={{ color: 'var(--primary-text)' }}>
                      {isDifferentiationEnabled
                        ? `Inkl. Niveau-${activeStudent.level || 'M'} Anpassung (${
                            currentLevelOffsets[
                              (activeStudent.level as 'G' | 'M' | 'E') || 'M'
                            ] > 0
                              ? '+'
                              : ''
                          }${
                            currentLevelOffsets[
                              (activeStudent.level as 'G' | 'M' | 'E') || 'M'
                            ] ?? 0
                          }% Schwellen-Verschiebung)`
                        : 'Binnendifferenzierung deaktiviert (Standard-Maßstab)'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: CLASS SETUP & NATIVE .XLSX DRAG-AND-DROP IMPORTER */}
      {showClassWizard && (
        <ClassSetupAndExcelWizard
          onClose={() => setShowClassWizard(false)}
          onCreateClass={(newDataset) => {
            setDatasets((prev) => [...prev, newDataset]);
            setActiveClassId(newDataset.id);
          }}
        />
      )}

      {/* MODAL 2: CLASS MANAGEMENT (EDIT EXISTING CLASS, ARCHIVE/DELETE STUDENTS, TEST COUNTS) */}
      {showClassManager && (
        <ClassManagementModal
          dataset={activeDataset}
          canDeleteClass={datasets.length > 1}
          onUpdateDataset={updateSubjectConfig}
          onDeleteClass={handleDeleteClass}
          onClose={() => setShowClassManager(false)}
        />
      )}

      {/* MODAL 3: SETTINGS & CROSS-APP SYNC PREFERENCES (FAVORITES, ON-DEMAND UI, THEMING) */}
      {showSettingsModal && (
        <SettingsModal
          settings={userSettings}
          onUpdateSettings={setUserSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* MODAL 4: KONTO & SCHUTZ (PASSKEY, 2FA QR & NOTFALLBLATT) */}
      {showVaultInspector && (
        <VaultLockAndAuthModal
          isLockedScreen={false}
          session={vaultSession}
          sampleEnvelope={sampleEnvelope}
          onUnlockSuccess={(updatedSession) => setVaultSession(updatedSession)}
          onLockVault={handleLockVault}
          onCloseInspector={() => setShowVaultInspector(false)}
        />
      )}
    </div>
  );
};
