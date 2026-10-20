import { useEffect, useMemo, useRef, useState } from 'react';
import initWasm, {
  wasm_decrypt_envelope,
  wasm_encrypt_envelope,
} from '../wasm-pkg/gradus21_core';
import { ActiveVaultSession } from '../components/VaultLockAndAuthModal';
import { GlobalTemplateRecord } from '../components/admin/CentralTemplatesTab';
import { SyncReconciliationStrategy } from '../components/SyncReconciliationModal';
import {
  ClassroomSubjectDataset,
  DEFAULT_USER_SYNC_SETTINGS,
  GradeEntry,
  INITIAL_CLASS_DATASETS,
  UserSyncSettings,
  ensureValidUuid,
} from '../data/demoClasses';
import {
  exportVaultToFileDownload,
  getDirectoryHandle,
  isFileSystemAccessSupported,
  pickBackupDirectory,
  readVaultFromFile,
  removeDirectoryHandle,
  requestStoragePersistence,
  writeVaultToDirectory,
} from '../utils/localBackupStorage';

const DEMO_OWNER_USER_ID = '7f9c2a10-58e4-4c9b-9b1a-123456789abc';
export const ACTIVE_USER_ID_STORAGE_KEY = 'gradus21_active_user_id_v3';
export const LEGACY_ACTIVE_USER_ID_STORAGE_KEY = 'bte_notenflow_active_user_id_v3';
export const VAULT_LOCKED_STORAGE_KEY = 'gradus21_vault_locked_v1';
export const LEGACY_VAULT_LOCKED_STORAGE_KEY = 'bte_notenflow_vault_locked_v1';

export function getUserEncryptedCacheKey(userId: string): string {
  return `gradus21_e2ee_user_vault_v3_${userId}`;
}

export function getLegacyUserEncryptedCacheKey(userId: string): string {
  return `bte_notenflow_e2ee_user_vault_v3_${userId}`;
}

export function getStoredDek(userId: string): string {
  return (
    sessionStorage.getItem(`gradus21_dek_${userId}`) ||
    sessionStorage.getItem(`bte_notenflow_dek_${userId}`) ||
    ''
  );
}

export function setStoredDek(userId: string, dek: string): void {
  sessionStorage.setItem(`gradus21_dek_${userId}`, dek);
  sessionStorage.setItem(`bte_notenflow_dek_${userId}`, dek);
}

export function removeStoredDek(userId: string): void {
  sessionStorage.removeItem(`gradus21_dek_${userId}`);
  sessionStorage.removeItem(`bte_notenflow_dek_${userId}`);
}

export function createFreshWorkspaceForNewTeacher(userId: string): ClassroomSubjectDataset[] {
  const starterId = ensureValidUuid(`class_starter_${userId}`);
  return [
    {
      id: starterId,
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

function isGradeEmpty(g: GradeEntry): boolean {
  return (
    g.percent_value === null &&
    g.raw_points === null &&
    g.direct_grade_value === null &&
    (!g.comment || g.comment.trim() === '') &&
    (g.status === 'graded' || !g.status)
  );
}

function areGradesEqual(a: GradeEntry, b: GradeEntry): boolean {
  return (
    a.percent_value === b.percent_value &&
    a.raw_points === b.raw_points &&
    a.direct_grade_value === b.direct_grade_value &&
    (a.comment || '').trim() === (b.comment || '').trim() &&
    a.status === b.status
  );
}

export function mergeClassroomDatasets(
  localDs: ClassroomSubjectDataset,
  serverDs: ClassroomSubjectDataset
): {
  mergedDs: ClassroomSubjectDataset;
  hadGradeCollisions: boolean;
  conflictCopy?: ClassroomSubjectDataset;
} {
  // 1. Students: preserve all from server, plus any locally added students
  const serverStudentIds = new Set(serverDs.students.map((s) => s.id));
  const mergedStudents = [...serverDs.students];
  for (const localStudent of localDs.students) {
    if (!serverStudentIds.has(localStudent.id)) {
      mergedStudents.push(localStudent);
    }
  }

  // 2. Categories: preserve all from server, plus any locally added categories
  const serverCategoryIds = new Set(serverDs.categories.map((c) => c.id));
  const mergedCategories = [...serverDs.categories];
  for (const localCat of localDs.categories) {
    if (!serverCategoryIds.has(localCat.id)) {
      mergedCategories.push(localCat);
    }
  }

  // 3. Assessments: preserve all from server, plus any locally added assessments
  const serverAssessmentIds = new Set(serverDs.assessments.map((a) => a.id));
  const mergedAssessments = [...serverDs.assessments];
  for (const localAss of localDs.assessments) {
    if (!serverAssessmentIds.has(localAss.id)) {
      mergedAssessments.push(localAss);
    }
  }

  // 4. Grades
  const serverGradesMap = new Map<string, GradeEntry>();
  for (const g of serverDs.grades) {
    serverGradesMap.set(`${g.student_id}:${g.assessment_id}`, g);
  }

  const localGradesMap = new Map<string, GradeEntry>();
  for (const g of localDs.grades) {
    localGradesMap.set(`${g.student_id}:${g.assessment_id}`, g);
  }

  const mergedGradesMap = new Map<string, GradeEntry>();
  let hadGradeCollisions = false;

  // Add all server grades first
  for (const [key, sGrade] of serverGradesMap.entries()) {
    mergedGradesMap.set(key, sGrade);
  }

  // Merge local grades
  for (const [key, lGrade] of localGradesMap.entries()) {
    const sGrade = serverGradesMap.get(key);
    if (!sGrade) {
      // Grade only exists locally -> keep it
      mergedGradesMap.set(key, lGrade);
    } else {
      // Grade exists in both
      if (areGradesEqual(lGrade, sGrade)) {
        continue;
      }
      if (isGradeEmpty(sGrade) && !isGradeEmpty(lGrade)) {
        // Server was empty, local filled in a grade -> local wins
        mergedGradesMap.set(key, lGrade);
      } else if (!isGradeEmpty(sGrade) && isGradeEmpty(lGrade)) {
        // Local was empty, server filled in a grade -> server wins
        mergedGradesMap.set(key, sGrade);
      } else {
        // True collision: keep local grade in mergedDs and create conflict copy
        mergedGradesMap.set(key, lGrade);
        hadGradeCollisions = true;
      }
    }
  }

  // 5. Report card overrides
  const mergedOverrides = {
    ...(serverDs.reportCardOverrides || {}),
    ...(localDs.reportCardOverrides || {}),
  };

  const mergedDs: ClassroomSubjectDataset = {
    ...serverDs,
    students: mergedStudents,
    categories: mergedCategories,
    assessments: mergedAssessments,
    grades: Array.from(mergedGradesMap.values()),
    reportCardOverrides: mergedOverrides,
  };

  let conflictCopy: ClassroomSubjectDataset | undefined;
  if (hadGradeCollisions) {
    const newId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : ensureValidUuid(`class_conflict_${Date.now()}`);
    conflictCopy = {
      ...localDs,
      id: newId,
      className: `${localDs.className} (Lokale Noten-Kopie)`,
      shortName: `${localDs.shortName || ''} (Lokal)`.trim(),
    };
  }

  return { mergedDs, hadGradeCollisions, conflictCopy };
}

export function useVaultWorkspaceSync() {
  const [wasmReady, setWasmReady] = useState(false);
  const [datasets, setDatasets] = useState<ClassroomSubjectDataset[]>(INITIAL_CLASS_DATASETS);
  const [activeClassId, setActiveClassId] = useState<string>(INITIAL_CLASS_DATASETS[0].id);

  // Synchronized User Settings (persisted across devices via E2EE envelope + /api/preferences)
  const [userSettings, setUserSettings] = useState<UserSyncSettings>(DEFAULT_USER_SYNC_SETTINGS);

  const [isVaultLocked, setIsVaultLocked] = useState<boolean>(() => {
    return (
      (localStorage.getItem(VAULT_LOCKED_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_VAULT_LOCKED_STORAGE_KEY)) === 'true'
    );
  });
  const [syncStatus, setSyncStatus] = useState<
    'synced' | 'syncing' | 'offline_local' | 'local_only'
  >('local_only');
  const [syncConflictNotice, setSyncConflictNotice] = useState<string | null>(null);
  const clearConflictNotice = () => setSyncConflictNotice(null);
  const envelopeVersionsRef = useRef<Map<string, number>>(new Map());
  const lastSerializedPerClassRef = useRef<Map<string, string>>(new Map());
  const lastSerializedSettingsRef = useRef<string>('');

  // Local persistent storage & automated backup directory
  const [isPersistentStorage, setIsPersistentStorage] = useState<boolean>(false);
  const [connectedBackupDirName, setConnectedBackupDirName] = useState<string | null>(null);
  const [lastLocalBackupTime, setLastLocalBackupTime] = useState<string | null>(null);
  const connectedDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    requestStoragePersistence().then((persisted) => setIsPersistentStorage(persisted));
    getDirectoryHandle().then((handle) => {
      if (handle) {
        connectedDirHandleRef.current = handle;
        setConnectedBackupDirName(handle.name);
      }
    });
  }, []);

  const [vaultSession, setVaultSession] = useState<ActiveVaultSession | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const isRestoringRef = useRef<boolean>(false);
  const [sampleEnvelope, setSampleEnvelope] = useState<{
    entityId: string;
    plaintext: string;
    ciphertext: string;
    decryptedVerify: string;
  } | null>(null);

  // Email verification & reconciliation states
  const [isEmailVerificationOpen, setIsEmailVerificationOpen] = useState(false);
  const [emailForVerification, setEmailForVerification] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isReconciliationOpen, setIsReconciliationOpen] = useState(false);
  const [reconciliationMeta, setReconciliationMeta] = useState<{
    localClassCount: number;
    remoteClassCount: number;
    remoteLastUpdated?: string;
  } | null>(null);

  // Global School Templates from Server (Zentral bereitgestellt)
  const [globalTemplates, setGlobalTemplates] = useState<GlobalTemplateRecord[]>(() => {
    try {
      const cached = localStorage.getItem('gradus21_cached_global_templates');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    let isMounted = true;
    const fetchTemplates = async () => {
      try {
        const headers: Record<string, string> = {};
        if (vaultSession?.token) {
          headers['Authorization'] = `Bearer ${vaultSession.token}`;
        }
        const res = await fetch('/api/templates', { headers });
        if (res.ok) {
          const list = await res.json();
          if (isMounted && Array.isArray(list)) {
            setGlobalTemplates(list);
            try {
              localStorage.setItem('gradus21_cached_global_templates', JSON.stringify(list));
            } catch {
              // ignore quota
            }
          }
        }
      } catch {
        // silent fallback to offline presets
      }
    };
    fetchTemplates();
    return () => {
      isMounted = false;
    };
  }, [vaultSession?.token]);

  const activeDataset = useMemo(
    () => datasets.find((d) => d.id === activeClassId) || datasets[0] || INITIAL_CLASS_DATASETS[0],
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

  // Lädt und entschlüsselt den Arbeitsbereich ausschließlich für die übergebene User-ID (strikte Mandantentrennung!)
  const loadIsolatedUserWorkspace = async (
    session: ActiveVaultSession,
    forceServerFetch = false
  ) => {
    const { dekB64, userId, token } = session;
    if (!dekB64 || !userId) return;

    const userCacheKey = getUserEncryptedCacheKey(userId);
    const legacyUserCacheKey = getLegacyUserEncryptedCacheKey(userId);

    if (!forceServerFetch) {
      const cachedRaw =
        localStorage.getItem(userCacheKey) || localStorage.getItem(legacyUserCacheKey);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);

          // 1. Granular class envelopes in local cache
          if (parsed.classEnvelopes && Object.keys(parsed.classEnvelopes).length > 0) {
            const restoredList: ClassroomSubjectDataset[] = [];
            for (const classId of Object.keys(parsed.classEnvelopes)) {
              const envItem = parsed.classEnvelopes[classId];
              try {
                const decClass = wasm_decrypt_envelope(
                  dekB64,
                  userId,
                  classId,
                  envItem.encryptedPayload
                );
                const ds = JSON.parse(decClass) as ClassroomSubjectDataset;
                ds.id = ensureValidUuid(ds.id || classId);
                envelopeVersionsRef.current.set(ds.id, envItem.version || 1);
                lastSerializedPerClassRef.current.set(ds.id, JSON.stringify(ds));
                restoredList.push(ds);
              } catch (e) {
                console.warn(`Cache für Klasse ${classId} konnte nicht entschlüsselt werden:`, e);
              }
            }
            if (restoredList.length > 0) {
              setDatasets(restoredList);
              setActiveClassId(restoredList[0].id);
            }
            if (parsed.encryptedSettingsEnvelope) {
              try {
                const decSettings = wasm_decrypt_envelope(
                  dekB64,
                  userId,
                  'user_sync_settings_v1',
                  parsed.encryptedSettingsEnvelope
                );
                lastSerializedSettingsRef.current = decSettings;
                const parsedSettings = JSON.parse(decSettings);
                setUserSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...parsedSettings,
                });
                setLoadedUserId(userId);
                setSyncStatus(parsedSettings?.cloudSyncEnabled ? 'synced' : 'local_only');
                return;
              } catch {
                // Keep default settings if corrupted
              }
            }
            setLoadedUserId(userId);
            setSyncStatus(userSettings.cloudSyncEnabled ? 'synced' : 'local_only');
            return;
          } else if (parsed.encryptedDatasetsEnvelope) {
            // Legacy monolithic cache
            const decryptedJson = wasm_decrypt_envelope(
              dekB64,
              userId,
              'workspace_datasets_v2',
              parsed.encryptedDatasetsEnvelope
            );
            const restoredDatasets = JSON.parse(decryptedJson) as ClassroomSubjectDataset[];
            if (Array.isArray(restoredDatasets) && restoredDatasets.length > 0) {
              const withUuids = restoredDatasets.map((ds) => ({
                ...ds,
                id: ensureValidUuid(ds.id),
              }));
              setDatasets(withUuids);
              setActiveClassId(withUuids[0].id);
              // Mark dirty to convert on next debounced save
              lastSerializedPerClassRef.current.clear();
              envelopeVersionsRef.current.clear();
            }
            if (parsed.encryptedSettingsEnvelope) {
              try {
                const decSettings = wasm_decrypt_envelope(
                  dekB64,
                  userId,
                  'user_sync_settings_v1',
                  parsed.encryptedSettingsEnvelope
                );
                lastSerializedSettingsRef.current = decSettings;
                const parsedSettings = JSON.parse(decSettings);
                setUserSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...parsedSettings,
                });
                setLoadedUserId(userId);
                setSyncStatus(parsedSettings?.cloudSyncEnabled ? 'synced' : 'local_only');
                return;
              } catch {
                // Keep default settings if corrupted
              }
            }
            setLoadedUserId(userId);
            setSyncStatus(userSettings.cloudSyncEnabled ? 'synced' : 'local_only');
            return;
          }
        } catch (e) {
          console.warn('Lokaler E2EE-Cache konnte nicht entschlüsselt werden:', e);
        }
      }
    }

    // Falls kein lokaler Cache existiert oder forceServerFetch aktiv ist -> Server abfragen (sofern Opt-In aktiv oder erzwungen)
    if (token && (forceServerFetch || userSettings.cloudSyncEnabled)) {
      try {
        setSyncStatus('syncing');
        const res = await fetch('/api/envelopes/sync', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const remoteEnvelopes: Array<{
            id: string;
            entity_type: string;
            parent_id: string | null;
            class_id: string | null;
            encrypted_payload: string;
            version: number;
          }> = await res.json();

          const classEnvelopes = remoteEnvelopes.filter((e) => e.entity_type === 'class_dataset');
          const wsEnvelope = remoteEnvelopes.find((e) => e.entity_type === 'workspace');
          const settingsEnvelope = remoteEnvelopes.find((e) => e.entity_type === 'user_settings');

          let loadedDatasets: ClassroomSubjectDataset[] | null = null;

          if (settingsEnvelope) {
            try {
              envelopeVersionsRef.current.set(settingsEnvelope.id, settingsEnvelope.version);
              const decSettings = wasm_decrypt_envelope(
                dekB64,
                userId,
                'user_sync_settings_v1',
                settingsEnvelope.encrypted_payload
              );
              lastSerializedSettingsRef.current = decSettings;
              setUserSettings({
                ...DEFAULT_USER_SYNC_SETTINGS,
                ...JSON.parse(decSettings),
              });
            } catch {
              // ignore
            }
          }

          if (classEnvelopes.length > 0) {
            // Granular envelopes per class
            const restoredList: ClassroomSubjectDataset[] = [];
            for (const env of classEnvelopes) {
              try {
                const decClass = wasm_decrypt_envelope(
                  dekB64,
                  userId,
                  env.id,
                  env.encrypted_payload
                );
                const ds = JSON.parse(decClass) as ClassroomSubjectDataset;
                ds.id = ensureValidUuid(ds.id || env.id);
                envelopeVersionsRef.current.set(ds.id, env.version);
                lastSerializedPerClassRef.current.set(ds.id, JSON.stringify(ds));
                restoredList.push(ds);
              } catch (e) {
                console.warn(`Envelope für Klasse ${env.id} konnte nicht entschlüsselt werden:`, e);
              }
            }
            if (restoredList.length > 0) {
              loadedDatasets = restoredList;
              setDatasets(restoredList);
              setActiveClassId((prev) => (restoredList.some((d) => d.id === prev) ? prev : restoredList[0].id));
            }
            // Migration cleanup: delete legacy workspace envelope if still on server
            if (wsEnvelope) {
              fetch(`/api/envelopes/${wsEnvelope.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              }).catch(() => {});
            }
          } else if (wsEnvelope) {
            // Migration: unpack legacy monolithic workspace envelope
            try {
              const decWs = wasm_decrypt_envelope(
                dekB64,
                userId,
                'workspace_datasets_v2',
                wsEnvelope.encrypted_payload
              );
              const parsedWs = JSON.parse(decWs) as ClassroomSubjectDataset[];
              if (Array.isArray(parsedWs) && parsedWs.length > 0) {
                const migrated = parsedWs.map((ds) => ({
                  ...ds,
                  id: ensureValidUuid(ds.id),
                }));
                loadedDatasets = migrated;
                setDatasets(migrated);
                setActiveClassId(migrated[0].id);

                // Mark clean after initial migration save
                lastSerializedPerClassRef.current.clear();
                envelopeVersionsRef.current.clear();

                // Clean up legacy workspace envelope on server
                fetch(`/api/envelopes/${wsEnvelope.id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
                }).catch(() => {});
              }
            } catch (e) {
              console.warn('Altes Workspace-Envelope konnte nicht entschlüsselt werden:', e);
            }
          }

          // Wenn der Server noch keine Daten für dieses neue Konto hat -> frischen leeren Arbeitsbereich anlegen
          if (!loadedDatasets) {
            const freshWs = createFreshWorkspaceForNewTeacher(userId);
            setDatasets(freshWs);
            setActiveClassId(freshWs[0].id);
            setUserSettings(DEFAULT_USER_SYNC_SETTINGS);
          }

          setLoadedUserId(userId);
          setSyncStatus('synced');
          return;
        }
      } catch (err) {
        console.warn('Server-Sync fehlgeschlagen, arbeite offline:', err);
      }
    }

    // Offline / Erstbesuch ohne Serverdaten:
    const freshOffline =
      userId === DEMO_OWNER_USER_ID ? INITIAL_CLASS_DATASETS : createFreshWorkspaceForNewTeacher(userId);
    setDatasets(freshOffline);
    setActiveClassId(freshOffline[0].id);
    setUserSettings(DEFAULT_USER_SYNC_SETTINGS);
    setLoadedUserId(userId);
    setSyncStatus(userSettings.cloudSyncEnabled ? 'synced' : 'local_only');
  };

  const handleLockVault = () => {
    localStorage.setItem(VAULT_LOCKED_STORAGE_KEY, 'true');
    localStorage.removeItem(LEGACY_VAULT_LOCKED_STORAGE_KEY);
    if (vaultSession?.userId) {
      removeStoredDek(vaultSession.userId);
      const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
      const legacyUserCacheKey = getLegacyUserEncryptedCacheKey(vaultSession.userId);
      const cachedRaw =
        localStorage.getItem(userCacheKey) || localStorage.getItem(legacyUserCacheKey);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);
          if (parsed.session) {
            parsed.session = {
              ...parsed.session,
              dekB64: '',
              token: '',
              recoveryKeyFormatted: undefined,
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
    setVaultSession((prev) =>
      prev ? { ...prev, dekB64: '', token: '', recoveryKeyFormatted: undefined } : null
    );
    setIsVaultLocked(true);
  };

  const handleUnlockVault = async (unlockedSession: ActiveVaultSession) => {
    localStorage.removeItem(VAULT_LOCKED_STORAGE_KEY);
    localStorage.removeItem(LEGACY_VAULT_LOCKED_STORAGE_KEY);
    localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, unlockedSession.userId);
    if (unlockedSession.dekB64) {
      setStoredDek(unlockedSession.userId, unlockedSession.dekB64);
    }
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

      const lockedFlag =
        (localStorage.getItem(VAULT_LOCKED_STORAGE_KEY) ||
          localStorage.getItem(LEGACY_VAULT_LOCKED_STORAGE_KEY)) === 'true';

      // Einmalige Migration einer laufenden Sitzung aus dem alten globalen Cache-Schlüssel
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
                  session: {
                    ...legacyParsed.session,
                    dekB64: '',
                    recoveryKeyFormatted: undefined,
                  },
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
        localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_ACTIVE_USER_ID_STORAGE_KEY);

      if (lastActiveUserId) {
        // Check if we have a user-scoped cached E2EE vault session in localStorage
        const userCacheKey = getUserEncryptedCacheKey(lastActiveUserId);
        const legacyUserCacheKey = getLegacyUserEncryptedCacheKey(lastActiveUserId);
        const cachedRaw =
          localStorage.getItem(userCacheKey) || localStorage.getItem(legacyUserCacheKey);
        if (cachedRaw) {
          try {
            const parsed = JSON.parse(cachedRaw);
            if (parsed.session) {
              const sessionDek = getStoredDek(lastActiveUserId);
              if (lockedFlag || parsed.isLocked || !sessionDek) {
                const emptyLocked = createFreshWorkspaceForNewTeacher('locked');
                setDatasets(emptyLocked);
                setActiveClassId(emptyLocked[0].id);
                setVaultSession({
                  ...parsed.session,
                  dekB64: '',
                  recoveryKeyFormatted: undefined,
                });
                setIsVaultLocked(true);
                return;
              }

              const restoredSession: ActiveVaultSession = {
                ...parsed.session,
                dekB64: sessionDek,
                recoveryKeyFormatted: undefined,
              };
              setVaultSession(restoredSession);
              await loadIsolatedUserWorkspace(restoredSession);
              return;
            }
          } catch {
            // Proceed to lock screen if cache is invalid
          }
        }
      }

      // Keine gespeicherte Sitzung vorhanden (Erstbesuch oder Incognito):
      const emptyLocked = createFreshWorkspaceForNewTeacher('locked');
      setDatasets(emptyLocked);
      setActiveClassId(emptyLocked[0].id);
      setVaultSession(null);
      setIsVaultLocked(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Automatically encrypt and persist datasets + userSettings (Debounced 350ms: Granular Per-Class E2EE Envelopes + OCC)
  useEffect(() => {
    if (
      isRestoringRef.current ||
      !wasmReady ||
      !vaultSession ||
      !vaultSession.dekB64 ||
      isVaultLocked ||
      loadedUserId !== vaultSession.userId
    ) {
      return;
    }

    setSyncStatus('syncing');

    const timer = window.setTimeout(async () => {
      try {
        setStoredDek(vaultSession.userId, vaultSession.dekB64);

        // Find which class datasets were modified
        const dirtyEnvelopes: Array<{
          id: string;
          entity_type: string;
          parent_id: string | null;
          class_id: string | null;
          encrypted_payload: string;
          expected_version: number | null;
        }> = [];

        const cachedClassEnvelopes: Record<string, { encryptedPayload: string; version: number }> = {};

        for (const ds of datasets) {
          const canonicalId = ensureValidUuid(ds.id);
          if (ds.id !== canonicalId) {
            ds.id = canonicalId;
          }
          const serialized = JSON.stringify(ds);
          const lastSerialized = lastSerializedPerClassRef.current.get(canonicalId);
          const currentVersion = envelopeVersionsRef.current.get(canonicalId) ?? null;

          if (lastSerialized !== serialized) {
            // Encrypt ONLY this changed class dataset with AAD bound to canonicalId
            const encrypted = wasm_encrypt_envelope(
              vaultSession.dekB64,
              vaultSession.userId,
              canonicalId,
              serialized
            );
            dirtyEnvelopes.push({
              id: canonicalId,
              entity_type: 'class_dataset',
              parent_id: null,
              class_id: canonicalId,
              encrypted_payload: encrypted,
              expected_version: currentVersion,
            });
            cachedClassEnvelopes[canonicalId] = {
              encryptedPayload: encrypted,
              version: currentVersion ?? 1,
            };
          }
        }

        // Check if user settings changed
        const serializedSettings = JSON.stringify(userSettings);
        let settingsEnvelopeItem: {
          id: string;
          entity_type: string;
          parent_id: string | null;
          class_id: string | null;
          encrypted_payload: string;
          expected_version: number | null;
        } | null = null;
        let encryptedSettingsStr = '';

        if (lastSerializedSettingsRef.current !== serializedSettings) {
          encryptedSettingsStr = wasm_encrypt_envelope(
            vaultSession.dekB64,
            vaultSession.userId,
            'user_sync_settings_v1',
            serializedSettings
          );
          settingsEnvelopeItem = {
            id: '00000000-0000-4000-8000-000000000002',
            entity_type: 'user_settings',
            parent_id: null,
            class_id: null,
            encrypted_payload: encryptedSettingsStr,
            expected_version:
              envelopeVersionsRef.current.get('00000000-0000-4000-8000-000000000002') ?? null,
          };
        }

        // Update live sample envelope in RAM for Inspector modal
        if (activeDataset) {
          const activeId = ensureValidUuid(activeDataset.id);
          const serializedActive = JSON.stringify(activeDataset);
          const activeEncrypted = wasm_encrypt_envelope(
            vaultSession.dekB64,
            vaultSession.userId,
            activeId,
            serializedActive
          );
          const verifyDecrypted = wasm_decrypt_envelope(
            vaultSession.dekB64,
            vaultSession.userId,
            activeId,
            activeEncrypted
          );
          setSampleEnvelope({
            entityId: activeId,
            plaintext: serializedActive.slice(0, 320) + '...',
            ciphertext: activeEncrypted.slice(0, 160) + '...',
            decryptedVerify: verifyDecrypted.slice(0, 320) + '...',
          });
        }

        // Update local storage cache
        const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
        const existingCacheRaw = localStorage.getItem(userCacheKey);
        let mergedClassEnvelopes = cachedClassEnvelopes;
        if (existingCacheRaw) {
          try {
            const parsedOld = JSON.parse(existingCacheRaw);
            mergedClassEnvelopes = {
              ...(parsedOld.classEnvelopes || {}),
              ...cachedClassEnvelopes,
            };
          } catch {
            // ignore
          }
        }

        const userCacheBundle = {
          userId: vaultSession.userId,
          session: {
            ...vaultSession,
            dekB64: '',
            token: '',
            authKeyB64: undefined,
            recoveryKeyFormatted: undefined,
          },
          kdfParams: vaultSession.kdfParams || { m_cost: 65536, t_cost: 3, p_cost: 1 },
          classEnvelopes: mergedClassEnvelopes,
          encryptedSettingsEnvelope: encryptedSettingsStr || undefined,
          isLocked: isVaultLocked,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(userCacheKey, JSON.stringify(userCacheBundle));

        // Auto-save to connected local backup directory (File System Access API) if configured
        if (connectedDirHandleRef.current) {
          try {
            await writeVaultToDirectory(
              connectedDirHandleRef.current,
              JSON.stringify(userCacheBundle, null, 2),
              { userId: userCacheBundle.userId }
            );
            setLastLocalBackupTime(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
          } catch (fsErr) {
            console.warn('Fehler beim automatischen Schreiben in den Backup-Ordner:', fsErr);
          }
        }

        // If Cloud-Sync is NOT opted in (Standard: Datensparsamkeit gem. DSGVO)
        if (!userSettings.cloudSyncEnabled) {
          for (const ds of datasets) {
            lastSerializedPerClassRef.current.set(ds.id, JSON.stringify(ds));
          }
          if (settingsEnvelopeItem) {
            lastSerializedSettingsRef.current = serializedSettings;
          }
          setSyncStatus('local_only');
          return;
        }

        // If no envelopes are dirty and no token, we are synced
        if (dirtyEnvelopes.length === 0 && !settingsEnvelopeItem) {
          setSyncStatus('synced');
          return;
        }

        // If offline / no token
        if (!vaultSession.token) {
          setSyncStatus('offline_local');
          return;
        }

        const batchPayload = [...dirtyEnvelopes];
        if (settingsEnvelopeItem) {
          batchPayload.push(settingsEnvelopeItem);
        }

        const [batchRes, prefRes] = await Promise.all([
          fetch('/api/envelopes/batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${vaultSession.token}`,
            },
            body: JSON.stringify({
              envelopes: batchPayload,
            }),
          }),
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
          }),
        ]);

        if (batchRes.status === 409) {
          // OCC Conflict detected: Another tab or device updated one of the envelopes!
          const conflictData = await batchRes.json().catch(() => null);
          if (conflictData?.conflict_envelope) {
            const conflictEnv = conflictData.conflict_envelope;
            try {
              if (conflictEnv.entity_type === 'class_dataset') {
                const decConflict = wasm_decrypt_envelope(
                  vaultSession.dekB64,
                  vaultSession.userId,
                  conflictEnv.id,
                  conflictEnv.encrypted_payload
                );
                const serverDs = JSON.parse(decConflict) as ClassroomSubjectDataset;
                serverDs.id = ensureValidUuid(serverDs.id || conflictEnv.id);

                const localDs = datasets.find((d) => d.id === serverDs.id);
                if (localDs) {
                  const { mergedDs, hadGradeCollisions, conflictCopy } =
                    mergeClassroomDatasets(localDs, serverDs);

                  envelopeVersionsRef.current.set(mergedDs.id, conflictEnv.version);
                  lastSerializedPerClassRef.current.set(mergedDs.id, JSON.stringify(mergedDs));

                  setDatasets((prev) => {
                    const updated = prev.map((d) => (d.id === mergedDs.id ? mergedDs : d));
                    if (conflictCopy) {
                      return [...updated, conflictCopy];
                    }
                    return updated;
                  });

                  if (hadGradeCollisions) {
                    setSyncConflictNotice(
                      `Synchronisations-Konflikt erkannt: Die Klasse „${serverDs.className}“ wurde auf einem anderen Gerät geändert. Lokale Noten wurden zusammengeführt und zur Sicherheit als separate Kopie „${conflictCopy?.className}“ hinterlegt, damit keine Eingaben verloren gehen.`
                    );
                  } else {
                    setSyncConflictNotice(
                      `Synchronisations-Konflikt gelöst: Die Klasse „${serverDs.className}“ wurde von einem anderen Gerät aktualisiert (v${conflictEnv.version}). Lokale und serverseitige Noten/Schüler wurden ohne Verlust zusammengeführt.`
                    );
                  }
                } else {
                  envelopeVersionsRef.current.set(serverDs.id, conflictEnv.version);
                  lastSerializedPerClassRef.current.set(serverDs.id, JSON.stringify(serverDs));
                  setDatasets((prev) => [...prev, serverDs]);
                  setSyncConflictNotice(
                    `Klasse „${serverDs.className}“ von anderem Gerät synchronisiert (v${conflictEnv.version}).`
                  );
                }

                setSyncStatus('synced');
                return;
              }
            } catch (e) {
              console.warn('Fehler beim Entschlüsseln des Konflikt-Envelopes:', e);
            }
          }
          await loadIsolatedUserWorkspace(vaultSession, true);
          setSyncConflictNotice(
            'Synchronisations-Konflikt erkannt: Daten wurden von einem anderen Gerät aktualisiert und synchronisiert.'
          );
          setSyncStatus('synced');
          return;
        }

        if (batchRes.ok && prefRes.ok) {
          const updatedEnvelopes: Array<{ id: string; version: number }> =
            await batchRes.json();
          for (const up of updatedEnvelopes) {
            envelopeVersionsRef.current.set(up.id, up.version);
          }
          for (const ds of datasets) {
            lastSerializedPerClassRef.current.set(ds.id, JSON.stringify(ds));
          }
          if (settingsEnvelopeItem) {
            lastSerializedSettingsRef.current = serializedSettings;
          }
          setSyncStatus('synced');
        } else {
          setSyncStatus('offline_local');
        }
      } catch (e) {
        console.error('E2EE auto-save error:', e);
        setSyncStatus('offline_local');
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [wasmReady, datasets, userSettings, vaultSession, isVaultLocked, activeDataset, loadedUserId]);

  const updateSubjectConfig = (
    updater: (ds: ClassroomSubjectDataset) => ClassroomSubjectDataset
  ) => {
    setDatasets((prev) => prev.map((ds) => (ds.id === activeDataset.id ? updater(ds) : ds)));
  };

  const handleDeleteClass = async (classId: string) => {
    const canonicalId = ensureValidUuid(classId);
    setDatasets((prev) => {
      const remaining = prev.filter((d) => d.id !== classId && d.id !== canonicalId);
      if (
        remaining.length > 0 &&
        (activeClassId === classId || activeClassId === canonicalId)
      ) {
        setActiveClassId(remaining[0].id);
      }
      return remaining.length > 0 ? remaining : prev;
    });

    lastSerializedPerClassRef.current.delete(canonicalId);
    lastSerializedPerClassRef.current.delete(classId);
    envelopeVersionsRef.current.delete(canonicalId);
    envelopeVersionsRef.current.delete(classId);

    // Remove from local storage cache
    if (vaultSession?.userId) {
      const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
      const cachedRaw = localStorage.getItem(userCacheKey);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);
          if (parsed.classEnvelopes) {
            delete parsed.classEnvelopes[canonicalId];
            delete parsed.classEnvelopes[classId];
            localStorage.setItem(userCacheKey, JSON.stringify(parsed));
          }
        } catch {
          // ignore
        }
      }
    }

    // Call DELETE /api/envelopes/:id on the server (nur wenn Cloud-Sync aktiv ist)
    if (userSettings.cloudSyncEnabled && vaultSession?.token) {
      try {
        await fetch(`/api/envelopes/${canonicalId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${vaultSession.token}`,
          },
        });
      } catch (err) {
        console.warn(`Fehler beim Löschen des Envelopes ${canonicalId} auf dem Server:`, err);
      }
    }
  };

  const handleToggleCloudSync = async (enabled: boolean) => {
    if (!enabled) {
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
      setSyncStatus('local_only');
      return;
    }

    if (!vaultSession?.email) {
      alert('Bitte entsperre oder erstelle zuerst einen Tresor mit einer E-Mail-Adresse.');
      return;
    }

    // Require E-Mail verification before enabling cloud sync
    if (!isEmailVerified) {
      setEmailForVerification(vaultSession.email);
      setIsEmailVerificationOpen(true);
      return;
    }

    await proceedToCloudSyncActivation();
  };

  const handleEmailVerificationCancel = () => {
    setIsEmailVerificationOpen(false);
    setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
    setSyncStatus('local_only');
  };

  const proceedToCloudSyncActivation = async (authToken?: string) => {
    const token = authToken || vaultSession?.token;
    if (!token) {
      alert('Keine gültige Server-Sitzung. Bitte melde dich an.');
      return;
    }

    try {
      setSyncStatus('syncing');
      const sumRes = await fetch('/api/envelopes/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sumRes.ok) {
        throw new Error('Summary konnte nicht abgerufen werden');
      }
      const summary = await sumRes.json();
      const remoteClassCount = summary.class_envelopes?.length || 0;
      const realLocalClasses = datasets.filter((d) => d.id !== 'demo-class-initial');

      if (remoteClassCount > 0 && realLocalClasses.length > 0) {
        // Both local and remote exist -> open reconciliation modal
        setReconciliationMeta({
          localClassCount: realLocalClasses.length,
          remoteClassCount,
          remoteLastUpdated: summary.last_updated_at || undefined,
        });
        setIsReconciliationOpen(true);
      } else if (remoteClassCount > 0 && realLocalClasses.length === 0) {
        // Cloud has classes, local is empty -> download from cloud directly
        await executeReconciliation('download_remote', token);
      } else {
        // Cloud is empty -> upload local directly
        setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: true }));
        lastSerializedPerClassRef.current.clear();
        lastSerializedSettingsRef.current = '';
        setSyncStatus('synced');
      }
    } catch (err) {
      console.error('Fehler bei der Cloud-Aktivierung:', err);
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
      setSyncStatus('local_only');
    }
  };

  const handleEmailVerificationSuccess = async () => {
    setIsEmailVerified(true);
    setIsEmailVerificationOpen(false);

    let token = vaultSession?.token;

    // If offline vault or purged account, register or log in on server using existing userId
    if (!token && vaultSession && vaultSession.authKeyB64) {
      try {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: vaultSession.email,
            auth_key_b64: vaultSession.authKeyB64,
            kdf_salt_b64: vaultSession.kdfSaltB64,
            kdf_params: JSON.stringify(
              vaultSession.kdfParams || { m_cost: 65536, t_cost: 3, p_cost: 1 }
            ),
            encrypted_dek: vaultSession.encryptedDek,
            recovery_encrypted_dek: vaultSession.recoveryEncryptedDek,
            recovery_auth_key_b64: null,
            user_id: vaultSession.userId,
          }),
        });
        if (regRes.ok) {
          const regData = await regRes.json();
          token = regData.token;
          setVaultSession((prev) =>
            prev ? { ...prev, token: regData.token, isAdmin: regData.is_admin } : null
          );
        } else {
          // If already registered, attempt login
          const logRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: vaultSession.email,
              auth_key_b64: vaultSession.authKeyB64,
            }),
          });
          if (logRes.ok) {
            const logData = await logRes.json();
            token = logData.token;
            setVaultSession((prev) =>
              prev ? { ...prev, token: logData.token, isAdmin: logData.is_admin } : null
            );
          }
        }
      } catch (err) {
        console.error('Konnte Sitzung nicht mit Server verknüpfen:', err);
      }
    }

    await proceedToCloudSyncActivation(token);
  };

  const handleCancelReconciliation = () => {
    setIsReconciliationOpen(false);
    setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
    setSyncStatus('local_only');
  };

  const executeReconciliation = async (
    strategy: SyncReconciliationStrategy,
    authToken?: string
  ) => {
    const token = authToken || vaultSession?.token;
    if (!token || !vaultSession?.dekB64) {
      setIsReconciliationOpen(false);
      return;
    }

    try {
      setSyncStatus('syncing');

      // 1. Fetch remote envelopes
      const res = await fetch('/api/envelopes/sync', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Fehler beim Abruf der Cloud-Daten.');
      const remoteEnvelopes: Array<{
        id: string;
        entity_type: string;
        encrypted_payload: string;
        version: number;
        updated_at: string;
      }> = await res.json();

      // Populate server versions for OCC
      remoteEnvelopes.forEach((env) => {
        envelopeVersionsRef.current.set(env.id, env.version);
      });

      // Decrypt remote class envelopes
      const decryptedRemoteClasses: ClassroomSubjectDataset[] = [];
      for (const env of remoteEnvelopes) {
        if (env.entity_type === 'class_dataset') {
          try {
            const decJson = wasm_decrypt_envelope(
              vaultSession.dekB64,
              vaultSession.userId,
              env.id,
              env.encrypted_payload
            );
            const parsed = JSON.parse(decJson);
            if (parsed && parsed.id) {
              decryptedRemoteClasses.push(parsed);
            }
          } catch (e) {
            console.warn('Envelope konnte nicht entschlüsselt werden:', env.id, e);
          }
        }
      }

      let finalClasses: ClassroomSubjectDataset[] = [];

      if (strategy === 'download_remote') {
        // Overwrite local with remote
        finalClasses = decryptedRemoteClasses;
      } else if (strategy === 'upload_local') {
        // Overwrite remote with local
        finalClasses = datasets;
      } else {
        // Smart Merge: combine both, resolving collisions by newer timestamp
        const mergedMap = new Map<string, ClassroomSubjectDataset>();

        // Add all remote classes first
        decryptedRemoteClasses.forEach((cls) => {
          mergedMap.set(cls.id, cls);
        });

        // Merge local classes
        datasets.forEach((localCls) => {
          const remoteCls = mergedMap.get(localCls.id);
          if (!remoteCls) {
            mergedMap.set(localCls.id, localCls);
          } else {
            const localTime = new Date(
              (localCls as any).lastModified || (localCls as any).updatedAt || 0
            ).getTime();
            const remoteTime = new Date(
              (remoteCls as any).lastModified || (remoteCls as any).updatedAt || 0
            ).getTime();
            if (localTime >= remoteTime) {
              mergedMap.set(localCls.id, localCls);
            } else {
              mergedMap.set(localCls.id, remoteCls);
            }
          }
        });

        finalClasses = Array.from(mergedMap.values());
      }

      if (finalClasses.length > 0) {
        setDatasets(finalClasses);
        setActiveClassId(finalClasses[0].id);
      }

      // If uploading local or smart merging, immediately push all classes to remote
      if (strategy === 'upload_local' || strategy === 'merge') {
        const batchItems = finalClasses.map((cls) => {
          const serialized = JSON.stringify(cls);
          const encryptedPayload = wasm_encrypt_envelope(
            vaultSession.dekB64,
            vaultSession.userId,
            cls.id,
            serialized
          );
          const expectedVersion = envelopeVersionsRef.current.get(cls.id) || null;
          return {
            id: cls.id,
            entity_type: 'class_dataset',
            parent_id: null,
            class_id: cls.id,
            encrypted_payload: encryptedPayload,
            expected_version: expectedVersion,
          };
        });

        const batchRes = await fetch('/api/envelopes/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ envelopes: batchItems }),
        });

        if (batchRes.ok) {
          const updatedEnvs: Array<{ id: string; version: number }> = await batchRes.json();
          updatedEnvs.forEach((env) => {
            envelopeVersionsRef.current.set(env.id, env.version);
          });
        }
      }

      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: true }));
      lastSerializedPerClassRef.current.clear();
      lastSerializedSettingsRef.current = '';
      setSyncStatus('synced');
      setIsReconciliationOpen(false);
      alert('Synchronisations-Abgleich erfolgreich abgeschlossen!');
    } catch (err) {
      console.error('Fehler bei der Reconciliation:', err);
      alert('Fehler beim Ausführen des Datenabgleichs.');
    }
  };

  const handlePurgeCloudData = async () => {
    if (!vaultSession?.token) {
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
      setSyncStatus('local_only');
      alert('Cloud-Sync wurde deaktiviert. Alle Daten bleiben rein lokal gespeichert.');
      return;
    }
    const confirmed = window.confirm(
      'Möchtest du wirklich alle verschlüsselten Datensätze vom Server löschen?\n\nDeine lokalen Daten im Browser bleiben vollständig erhalten. Gradus21 arbeitet danach zu 100% lokal offline.'
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/envelopes', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${vaultSession.token}`,
        },
      });
      if (res.ok || res.status === 204) {
        const body = await res.json().catch(() => null);
        envelopeVersionsRef.current.clear();
        setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
        setSyncStatus('local_only');
        setIsEmailVerified(false);
        if (body?.user_deleted) {
          // Account completely purged from server (GDPR Art. 17)
          setVaultSession((prev) => (prev ? { ...prev, token: '', isAdmin: false } : null));
          alert(
            'Alle Cloud-Daten und dein Benutzerkonto wurden gemäß DSGVO Art. 17 vollständig vom Server gelöscht.\n\nDein Tresor bleibt auf diesem Gerät uneingeschränkt lokal nutzbar.'
          );
        } else {
          alert('Alle Server-Kopien deiner Datensätze wurden unwiderruflich gelöscht. Dein Admin-Konto bleibt erhalten.');
        }
      } else {
        alert('Serverfehler beim Löschen der Cloud-Kopien.');
      }
    } catch (e) {
      console.error('Fehler beim Löschen der Server-Daten:', e);
      alert('Der Server konnte nicht erreicht werden.');
    }
  };

  const handleExportEncryptedBackup = () => {
    if (!vaultSession?.userId) return;
    const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
    const cachedRaw = localStorage.getItem(userCacheKey);
    if (!cachedRaw) {
      alert('Kein lokaler Datensatz zum Sichern gefunden.');
      return;
    }
    try {
      const parsed = JSON.parse(cachedRaw);
      if (vaultSession.kdfParams) {
        parsed.kdfParams = vaultSession.kdfParams;
        if (parsed.session) {
          parsed.session.kdfParams = vaultSession.kdfParams;
        }
      }
      exportVaultToFileDownload(parsed);
    } catch (e) {
      console.error('Fehler beim Exportieren des Backups:', e);
    }
  };

  const handleImportEncryptedBackup = async (file: File) => {
    try {
      const parsed = await readVaultFromFile(file);
      if (!parsed.userId) {
        alert('Die Datei enthält keine gültige Benutzer-ID.');
        return;
      }
      const targetKey = getUserEncryptedCacheKey(parsed.userId);
      localStorage.setItem(targetKey, JSON.stringify(parsed));
      localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, parsed.userId);

      // Pre-populate locked vaultSession from imported bundle
      if (parsed.session) {
        setVaultSession({
          ...parsed.session,
          dekB64: '',
          token: '',
          recoveryKeyFormatted: undefined,
        });
      }
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
      setSyncStatus('local_only');

      alert(
        'Das Tresor-Backup wurde erfolgreich in den Browser importiert! Bitte entsperre den Tresor mit deinem Master-Passwort.'
      );
      handleLockVault();
    } catch (err: any) {
      alert(err.message || 'Fehler beim Einlesen der Backup-Datei.');
    }
  };

  const handleConnectBackupDirectory = async () => {
    try {
      const handle = await pickBackupDirectory();
      if (handle) {
        connectedDirHandleRef.current = handle;
        setConnectedBackupDirName(handle.name);
        // Sofort ein aktuelles Backup schreiben
        if (vaultSession?.userId) {
          const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
          const cachedRaw = localStorage.getItem(userCacheKey);
          if (cachedRaw) {
            await writeVaultToDirectory(handle, cachedRaw, {
              userId: vaultSession.userId,
              forceSnapshot: true,
            });
            setLastLocalBackupTime(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
          }
        }
      }
    } catch (err: any) {
      console.warn('Backup-Ordner konnte nicht verknüpft werden:', err);
    }
  };

  const handleDisconnectBackupDirectory = async () => {
    await removeDirectoryHandle();
    connectedDirHandleRef.current = null;
    setConnectedBackupDirName(null);
    setLastLocalBackupTime(null);
  };

  const handleRestoreSnapshot = async () => {
    if (!vaultSession) return;
    isRestoringRef.current = true;
    try {
      setLoadedUserId(null);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('gradus21_e2ee_user_vault_') ||
            key.startsWith('bte_notenflow_user_e2ee_') ||
            key.startsWith('bte_notenflow_e2ee_user_vault_'))
        ) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const p = JSON.parse(raw);
              delete p.encryptedDatasetsEnvelope;
              delete p.encryptedSettingsEnvelope;
              localStorage.setItem(key, JSON.stringify(p));
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      }
      await loadIsolatedUserWorkspace(vaultSession, true);
      alert(
        'Der Server-Snapshot wurde erfolgreich eingespielt! Dein Arbeitsbereich wurde auf den Stand des Snapshots zurückgesetzt.'
      );
    } catch (e: any) {
      console.error('Fehler beim Neuladen nach Snapshot:', e);
      alert(
        'Der Snapshot wurde eingespielt. Bitte melde dich erneut an, um den wiederhergestellten Tresor zu entschlüsseln.'
      );
      handleLockVault();
    } finally {
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 500);
    }
  };

  return {
    wasmReady,
    datasets,
    setDatasets,
    activeClassId,
    setActiveClassId,
    activeDataset,
    userSettings,
    setUserSettings,
    isVaultLocked,
    setIsVaultLocked,
    syncStatus,
    setSyncStatus,
    syncConflictNotice,
    clearConflictNotice,
    vaultSession,
    setVaultSession,
    loadedUserId,
    setLoadedUserId,
    isRestoringRef,
    sampleEnvelope,
    globalTemplates,
    setGlobalTemplates,
    isPersistentStorage,
    connectedBackupDirName,
    lastLocalBackupTime,
    loadIsolatedUserWorkspace,
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
    handleResolveReconciliation: executeReconciliation,
    handleCancelReconciliation,
  };
}
