import { useEffect, useMemo, useRef, useState } from 'react';
import {
  wasm_decrypt_envelope,
  wasm_encrypt_envelope,
} from '../wasm-pkg/gradus21_core';
import { ensureWasmLoaded } from '../utils/wasmLoader';
import { ActiveVaultSession, normalizeKdfParams } from '../components/vault/vaultTypes';
import type { GlobalTemplateRecord } from '../types/templates';
import { SyncReconciliationStrategy } from '../components/SyncReconciliationModal';
import { apiUrl } from '../utils/apiConfig';
import {
  ClassroomSubjectDataset,
  DEFAULT_USER_SYNC_SETTINGS,
  GradeEntry,
  INITIAL_CLASS_DATASETS,
  THEME_PREFERENCE_STORAGE_KEY,
  UserSyncSettings,
  applyResolvedThemeToSettings,
  ensureValidUuid,
  getEffectiveThemeMode,
  resolveIsDarkMode,
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

export function getStoredToken(userId: string): string {
  return (
    sessionStorage.getItem(`gradus21_token_${userId}`) ||
    sessionStorage.getItem(`bte_notenflow_token_${userId}`) ||
    ''
  );
}

export function setStoredToken(userId: string, token: string): void {
  if (token) {
    sessionStorage.setItem(`gradus21_token_${userId}`, token);
    sessionStorage.setItem(`bte_notenflow_token_${userId}`, token);
  } else {
    removeStoredToken(userId);
  }
}

export function removeStoredToken(userId: string): void {
  sessionStorage.removeItem(`gradus21_token_${userId}`);
  sessionStorage.removeItem(`bte_notenflow_token_${userId}`);
}

export function getStoredAuthKey(userId: string): string {
  return (
    sessionStorage.getItem(`gradus21_authkey_${userId}`) ||
    sessionStorage.getItem(`bte_notenflow_authkey_${userId}`) ||
    ''
  );
}

export function setStoredAuthKey(userId: string, authKey: string): void {
  if (authKey) {
    sessionStorage.setItem(`gradus21_authkey_${userId}`, authKey);
    sessionStorage.setItem(`bte_notenflow_authkey_${userId}`, authKey);
  } else {
    removeStoredAuthKey(userId);
  }
}

export function removeStoredAuthKey(userId: string): void {
  sessionStorage.removeItem(`gradus21_authkey_${userId}`);
  sessionStorage.removeItem(`bte_notenflow_authkey_${userId}`);
}

export async function renewTokenIfNeeded(
  userId: string,
  email?: string,
  authKey?: string
): Promise<string | null> {
  const effectiveAuthKey = authKey || getStoredAuthKey(userId);
  if (!email || !effectiveAuthKey) return null;
  try {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        auth_key_b64: effectiveAuthKey,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        setStoredToken(userId, data.token);
        return data.token;
      }
    }
  } catch (e) {
    console.warn('Auto-Login Erneuerung fehlgeschlagen:', e);
  }
  return null;
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
        // True collision: updated server grade takes precedence in main merged dataset,
        // while local entries are preserved in the separate conflict copy!
        mergedGradesMap.set(key, sGrade);
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
  const [userSettings, setUserSettings] = useState<UserSyncSettings>(() => {
    let base: UserSyncSettings = {
      ...DEFAULT_USER_SYNC_SETTINGS,
      darkMode: resolveIsDarkMode('system', false),
    };
    try {
      const raw = localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
      if (raw) {
        const pref = JSON.parse(raw);
        if (pref && typeof pref === 'object') {
          base = {
            ...base,
            themePreset: pref.themePreset || base.themePreset,
            themeMode: pref.themeMode || base.themeMode,
            darkMode: typeof pref.darkMode === 'boolean' ? pref.darkMode : base.darkMode,
          };
        }
      }
    } catch {
      // ignore invalid localStorage preference
    }
    return applyResolvedThemeToSettings(base);
  });

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
        const res = await fetch(apiUrl('/api/templates'), { headers });
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

  // Sync theme attributes from synchronized userSettings + Dynamic Mobile Status Bar theme-color + System Theme Listener
  useEffect(() => {
    const effectiveMode = getEffectiveThemeMode(userSettings);
    const isDark = resolveIsDarkMode(effectiveMode, userSettings.darkMode);

    document.documentElement.setAttribute('data-theme', userSettings.themePreset);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (isDark) {
      document.documentElement.classList.add('dark');
      if (metaTheme) metaTheme.setAttribute('content', '#121b20');
    } else {
      document.documentElement.classList.remove('dark');
      if (metaTheme) metaTheme.setAttribute('content', '#0d9488');
    }

    try {
      localStorage.setItem(
        THEME_PREFERENCE_STORAGE_KEY,
        JSON.stringify({
          themePreset: userSettings.themePreset,
          themeMode: effectiveMode,
          darkMode: isDark,
        })
      );
    } catch {
      // ignore storage quota errors
    }

    if (userSettings.darkMode !== isDark || userSettings.themeMode !== effectiveMode) {
      setUserSettings((prev) => {
        const mode = getEffectiveThemeMode(prev);
        const resolvedDark = resolveIsDarkMode(mode, prev.darkMode);
        if (prev.darkMode === resolvedDark && prev.themeMode === mode) return prev;
        return {
          ...prev,
          themeMode: mode,
          darkMode: resolvedDark,
        };
      });
    }

    if (
      effectiveMode !== 'system' ||
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const nextDark = e.matches;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (nextDark) {
        document.documentElement.classList.add('dark');
        if (meta) meta.setAttribute('content', '#121b20');
      } else {
        document.documentElement.classList.remove('dark');
        if (meta) meta.setAttribute('content', '#0d9488');
      }
      setUserSettings((prev) => {
        if (getEffectiveThemeMode(prev) !== 'system') return prev;
        if (prev.darkMode === nextDark && prev.themeMode === 'system') return prev;
        return {
          ...prev,
          themeMode: 'system',
          darkMode: nextDark,
        };
      });
    };

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleSystemThemeChange);
      return () => mq.removeEventListener('change', handleSystemThemeChange);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(handleSystemThemeChange);
      return () => mq.removeListener(handleSystemThemeChange);
    }
  }, [userSettings.themePreset, userSettings.themeMode, userSettings.darkMode]);

  // Lädt und entschlüsselt den Arbeitsbereich ausschließlich für die übergebene User-ID (strikte Mandantentrennung!)
  const loadIsolatedUserWorkspace = async (
    session: ActiveVaultSession,
    forceServerFetch = false,
    initialCloudSync = false
  ) => {
    const { dekB64, userId, token } = session;
    if (!dekB64 || !userId) return;

    const userCacheKey = getUserEncryptedCacheKey(userId);
    const legacyUserCacheKey = getLegacyUserEncryptedCacheKey(userId);

    let isCloudSyncActive = initialCloudSync;
    const cachedLocalClasses: ClassroomSubjectDataset[] = [];

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
                cachedLocalClasses.push(ds);
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
                const isSync = initialCloudSync || Boolean(parsedSettings?.cloudSyncEnabled ?? userSettings.cloudSyncEnabled);
                setUserSettings(() =>
                  applyResolvedThemeToSettings({
                    ...DEFAULT_USER_SYNC_SETTINGS,
                    ...parsedSettings,
                    cloudSyncEnabled: isSync,
                  })
                );
                setLoadedUserId(userId);
                if (isSync) {
                  isCloudSyncActive = true;
                  setSyncStatus('synced');
                } else {
                  setSyncStatus('local_only');
                }
              } catch {
                // Keep default settings if corrupted
              }
            }
            if (!isCloudSyncActive && userSettings.cloudSyncEnabled) {
              isCloudSyncActive = true;
            }
            setLoadedUserId(userId);
            setSyncStatus(isCloudSyncActive || userSettings.cloudSyncEnabled ? 'synced' : 'local_only');
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
              cachedLocalClasses.push(...withUuids);
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
                const isSync = initialCloudSync || Boolean(parsedSettings?.cloudSyncEnabled ?? userSettings.cloudSyncEnabled);
                setUserSettings(() =>
                  applyResolvedThemeToSettings({
                    ...DEFAULT_USER_SYNC_SETTINGS,
                    ...parsedSettings,
                    cloudSyncEnabled: isSync,
                  })
                );
                setLoadedUserId(userId);
                if (isSync) {
                  isCloudSyncActive = true;
                  setSyncStatus('synced');
                } else {
                  setSyncStatus('local_only');
                }
              } catch {
                // Keep default settings if corrupted
              }
            }
            if (!isCloudSyncActive && userSettings.cloudSyncEnabled) {
              isCloudSyncActive = true;
            }
            setLoadedUserId(userId);
            setSyncStatus(isCloudSyncActive || userSettings.cloudSyncEnabled ? 'synced' : 'local_only');
          }
        } catch (e) {
          console.warn('Lokaler E2EE-Cache konnte nicht entschlüsselt werden:', e);
        }
      }
    }

    // Falls kein lokaler Cache existiert oder forceServerFetch aktiv ist oder Cloud-Sync aktiv ist oder Token vorhanden -> Server abfragen
    let effectiveToken = token || (userId ? getStoredToken(userId) : '');
    const hasLocalClasses = cachedLocalClasses.length > 0;

    if (effectiveToken && (forceServerFetch || userSettings.cloudSyncEnabled || isCloudSyncActive || !hasLocalClasses)) {
      try {
        setSyncStatus('syncing');
        let res = await fetch(apiUrl('/api/envelopes/sync'), {
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
          },
        });

        if (res.status === 401) {
          // Token abgelaufen -> automatischer Re-Auth mit authKey
          const refreshedToken = await renewTokenIfNeeded(
            userId,
            session.email,
            session.authKeyB64
          );
          if (refreshedToken) {
            effectiveToken = refreshedToken;
            setVaultSession((prev) => (prev ? { ...prev, token: refreshedToken } : null));
            res = await fetch(apiUrl('/api/envelopes/sync'), {
              headers: { Authorization: `Bearer ${refreshedToken}` },
            });
          }
        }

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
              envelopeVersionsRef.current.set('00000000-0000-4000-8000-000000000002', settingsEnvelope.version);
              const decSettings = wasm_decrypt_envelope(
                dekB64,
                userId,
                'user_sync_settings_v1',
                settingsEnvelope.encrypted_payload
              );
              lastSerializedSettingsRef.current = decSettings;
              const parsedRemoteSettings = JSON.parse(decSettings);
              setUserSettings((prev) =>
                applyResolvedThemeToSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...parsedRemoteSettings,
                  cloudSyncEnabled: parsedRemoteSettings.cloudSyncEnabled ?? prev.cloudSyncEnabled ?? true,
                })
              );
              if (parsedRemoteSettings.cloudSyncEnabled ?? true) {
                isCloudSyncActive = true;
              }
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
              if (cachedLocalClasses.length > 0) {
                const serverClassIds = new Set(restoredList.map((c) => c.id));
                for (const loc of cachedLocalClasses) {
                  if (!serverClassIds.has(loc.id)) {
                    restoredList.push(loc);
                  }
                }
              }
              loadedDatasets = restoredList;
              setDatasets(restoredList);
              setActiveClassId((prev) => (restoredList.some((d) => d.id === prev) ? prev : restoredList[0].id));
            }
            // Migration cleanup: delete legacy workspace envelope if still on server
            if (wsEnvelope) {
              fetch(apiUrl(`/api/envelopes/${wsEnvelope.id}`), {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${effectiveToken}` },
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
                fetch(apiUrl(`/api/envelopes/${wsEnvelope.id}`), {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${effectiveToken}` },
                }).catch(() => {});
              }
            } catch (e) {
              console.warn('Altes Workspace-Envelope konnte nicht entschlüsselt werden:', e);
            }
          }

          // Wenn der Server noch keine Daten für dieses Konto hat -> frischen leeren Arbeitsbereich anlegen, falls lokal auch nichts da war
          if (!loadedDatasets) {
            if (cachedLocalClasses.length > 0) {
              loadedDatasets = cachedLocalClasses;
            } else {
              const freshWs = createFreshWorkspaceForNewTeacher(userId);
              setDatasets(freshWs);
              setActiveClassId(freshWs[0].id);
              const initialSync = Boolean(initialCloudSync || isCloudSyncActive);
              setUserSettings((prev) =>
                applyResolvedThemeToSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...prev,
                  cloudSyncEnabled: initialSync || prev.cloudSyncEnabled,
                })
              );
            }
          }

          setLoadedUserId(userId);
          setSyncStatus('synced');
          return;
        }
      } catch (err) {
        console.warn('Server-Sync fehlgeschlagen, arbeite offline:', err);
      }
    }

    // Wenn lokaler Cache vorhanden war -> behalte ihn und gehe nicht in den leeren Dummy-Modus!
    if (cachedLocalClasses.length > 0) {
      setLoadedUserId(userId);
      setSyncStatus(isCloudSyncActive || userSettings.cloudSyncEnabled ? 'offline_local' : 'local_only');
      return;
    }

    // Erstbesuch ohne Serverdaten und ohne lokalen Cache:
    const freshOffline =
      userId === DEMO_OWNER_USER_ID ? INITIAL_CLASS_DATASETS : createFreshWorkspaceForNewTeacher(userId);
    setDatasets(freshOffline);
    setActiveClassId(freshOffline[0].id);
    const initialSync = Boolean(initialCloudSync || isCloudSyncActive || userSettings.cloudSyncEnabled);
    setUserSettings((prev) =>
      applyResolvedThemeToSettings({
        ...DEFAULT_USER_SYNC_SETTINGS,
        themePreset: prev.themePreset,
        themeMode: prev.themeMode,
        darkMode: prev.darkMode,
        cloudSyncEnabled: initialSync,
      })
    );
    setLoadedUserId(userId);
    setSyncStatus(initialSync ? 'synced' : 'local_only');
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
    removeStoredDek(vaultSession?.userId || '');
    removeStoredToken(vaultSession?.userId || '');
    removeStoredAuthKey(vaultSession?.userId || '');
    const emptyLocked = createFreshWorkspaceForNewTeacher('locked');
    setDatasets(emptyLocked);
    setActiveClassId(emptyLocked[0].id);
    setLoadedUserId(null);
    setVaultSession((prev) =>
      prev
        ? {
            ...prev,
            dekB64: '',
            token: '',
            authKeyB64: undefined,
            recoveryKeyFormatted: undefined,
          }
        : null
    );
    setIsVaultLocked(true);
  };

  const handleUnlockVault = async (
    unlockedSession: ActiveVaultSession,
    options?: { enableCloudSync?: boolean }
  ) => {
    localStorage.removeItem(VAULT_LOCKED_STORAGE_KEY);
    localStorage.removeItem(LEGACY_VAULT_LOCKED_STORAGE_KEY);
    localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, unlockedSession.userId);
    if (unlockedSession.dekB64) {
      setStoredDek(unlockedSession.userId, unlockedSession.dekB64);
    }
    if (unlockedSession.token) {
      setStoredToken(unlockedSession.userId, unlockedSession.token);
    }
    if (unlockedSession.authKeyB64) {
      setStoredAuthKey(unlockedSession.userId, unlockedSession.authKeyB64);
    }
    setVaultSession(unlockedSession);

    const shouldEnableCloudSync = Boolean(options?.enableCloudSync);
    if (shouldEnableCloudSync) {
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: true }));
      setSyncStatus('synced');
    }

    if (unlockedSession.dekB64) {
      await loadIsolatedUserWorkspace(unlockedSession, false, shouldEnableCloudSync);
    }

    if (shouldEnableCloudSync) {
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: true }));
      setSyncStatus('synced');
      lastSerializedPerClassRef.current.clear();
      lastSerializedSettingsRef.current = '';
    }

    setIsVaultLocked(false);
  };

  // Initialize Rust WebAssembly Core + Zero-Knowledge E2EE Vault + Restore Encrypted Cache
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await ensureWasmLoaded();
        if (!mounted) return;
        setWasmReady(true);
      } catch (err) {
        console.error('WASM initialization error in useVaultWorkspaceSync:', err);
      }

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
              const sessionToken = getStoredToken(lastActiveUserId);
              const sessionAuthKey = getStoredAuthKey(lastActiveUserId);
              if (lockedFlag || parsed.isLocked || !sessionDek) {
                const emptyLocked = createFreshWorkspaceForNewTeacher('locked');
                setDatasets(emptyLocked);
                setActiveClassId(emptyLocked[0].id);
                setVaultSession({
                  ...parsed.session,
                  dekB64: '',
                  token: '',
                  authKeyB64: undefined,
                  recoveryKeyFormatted: undefined,
                });
                setIsVaultLocked(true);
                return;
              }

              const restoredSession: ActiveVaultSession = {
                ...parsed.session,
                dekB64: sessionDek,
                token: sessionToken || parsed.session.token || '',
                authKeyB64: sessionAuthKey || parsed.session.authKeyB64 || undefined,
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
        if (vaultSession.token) {
          setStoredToken(vaultSession.userId, vaultSession.token);
        }
        if (vaultSession.authKeyB64) {
          setStoredAuthKey(vaultSession.userId, vaultSession.authKeyB64);
        }

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
        let preservedSettingsEnvelope = '';
        if (existingCacheRaw) {
          try {
            const parsedOld = JSON.parse(existingCacheRaw);
            mergedClassEnvelopes = {
              ...(parsedOld.classEnvelopes || {}),
              ...cachedClassEnvelopes,
            };
            preservedSettingsEnvelope = parsedOld.encryptedSettingsEnvelope || '';
          } catch {
            // ignore
          }
        }

        const effectiveSettingsEnvelope =
          encryptedSettingsStr ||
          wasm_encrypt_envelope(
            vaultSession.dekB64,
            vaultSession.userId,
            'user_sync_settings_v1',
            serializedSettings
          );

        const userCacheBundle = {
          userId: vaultSession.userId,
          session: {
            ...vaultSession,
            dekB64: '',
            token: '',
            authKeyB64: undefined,
            recoveryKeyFormatted: undefined,
          },
          kdfParams: vaultSession.kdfParams
            ? normalizeKdfParams(vaultSession.kdfParams)
            : { memory_kib: 19456, iterations: 2, parallelism: 1 },
          classEnvelopes: mergedClassEnvelopes,
          encryptedSettingsEnvelope: effectiveSettingsEnvelope,
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

        let effectiveToken =
          vaultSession.token ||
          (vaultSession.userId ? getStoredToken(vaultSession.userId) : '');

        // If offline / no token -> attempt auto-renew
        if (!effectiveToken && vaultSession.userId) {
          effectiveToken =
            (await renewTokenIfNeeded(
              vaultSession.userId,
              vaultSession.email,
              vaultSession.authKeyB64
            )) || '';
          if (effectiveToken) {
            setVaultSession((prev) => (prev ? { ...prev, token: effectiveToken } : null));
          }
        }

        if (!effectiveToken) {
          console.warn('[Sync] Kein gültiges Token für Benutzer', vaultSession.userId, 'gefunden — arbeite lokal');
          setSyncStatus('offline_local');
          return;
        }

        const batchPayload = [...dirtyEnvelopes];
        if (settingsEnvelopeItem) {
          batchPayload.push(settingsEnvelopeItem);
        }

        let [batchRes, prefRes] = await Promise.all([
          fetch(apiUrl('/api/envelopes/batch'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${effectiveToken}`,
            },
            body: JSON.stringify({
              envelopes: batchPayload,
            }),
          }),
          fetch(apiUrl('/api/preferences'), {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${effectiveToken}`,
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

        if (batchRes.status === 401) {
          const newToken = await renewTokenIfNeeded(
            vaultSession.userId,
            vaultSession.email,
            vaultSession.authKeyB64
          );
          if (newToken) {
            setVaultSession((prev) => (prev ? { ...prev, token: newToken } : null));
            batchRes = await fetch(apiUrl('/api/envelopes/batch'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${newToken}`,
              },
              body: JSON.stringify({ envelopes: batchPayload }),
            });
          }
        }

        if (batchRes.status === 409) {
          // OCC Conflict detected: Another tab or device updated one of the envelopes!
          const conflictData = await batchRes.json().catch(() => null);
          const conflictEnv = conflictData?.conflict_envelope;

          setReconciliationMeta({
            localClassCount: datasets.length,
            remoteClassCount: datasets.length,
            remoteLastUpdated: conflictEnv?.updated_at || new Date().toISOString(),
          });
          setIsReconciliationOpen(true);

          setSyncConflictNotice(
            'Synchronisations-Konflikt erkannt: Daten wurden auf einem anderen Gerät geändert. Bitte wähle im Abgleichs-Dialog, wie zusammengeführt werden soll.'
          );
          setSyncStatus('synced');
          return;
        }

        if (batchRes.ok && prefRes.ok) {
          const updatedEnvelopes: Array<{ id: string; version: number; entity_type?: string }> =
            await batchRes.json();
          for (const up of updatedEnvelopes) {
            envelopeVersionsRef.current.set(up.id, up.version);
            if (up.entity_type === 'user_settings') {
              envelopeVersionsRef.current.set('00000000-0000-4000-8000-000000000002', up.version);
            }
          }
          for (const ds of datasets) {
            lastSerializedPerClassRef.current.set(ds.id, JSON.stringify(ds));
          }
          if (settingsEnvelopeItem) {
            lastSerializedSettingsRef.current = serializedSettings;
            const settingsVer = updatedEnvelopes.find((e) => e.entity_type === 'user_settings')?.version || 1;
            envelopeVersionsRef.current.set('00000000-0000-4000-8000-000000000002', settingsVer);
          }
          setSyncStatus('synced');
        } else {
          console.warn('E2EE auto-save non-OK response:', {
            batchStatus: batchRes.status,
            prefStatus: prefRes.status,
            batchText: await batchRes.text().catch(() => ''),
            prefText: await prefRes.text().catch(() => ''),
          });
          setSyncStatus('offline_local');
        }
      } catch (e) {
        console.error('E2EE auto-save error:', e);
        setSyncStatus('offline_local');
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [wasmReady, datasets, userSettings, vaultSession, isVaultLocked, activeDataset, loadedUserId]);

  // Real-time Background Sync & Tab Focus Reconciliation
  useEffect(() => {
    if (
      !wasmReady ||
      !vaultSession?.dekB64 ||
      !vaultSession.userId ||
      isVaultLocked ||
      !userSettings.cloudSyncEnabled ||
      loadedUserId !== vaultSession.userId
    ) {
      return;
    }

    let isPolling = false;

    const performBackgroundSyncCheck = async () => {
      if (isPolling || isRestoringRef.current) return;
      isPolling = true;

      try {
        let token =
          vaultSession.token ||
          getStoredToken(vaultSession.userId) ||
          (await renewTokenIfNeeded(
            vaultSession.userId,
            vaultSession.email,
            vaultSession.authKeyB64
          ));

        if (!token) {
          isPolling = false;
          return;
        }

        const res = await fetch(apiUrl('/api/envelopes/sync'), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          isPolling = false;
          return;
        }

        const remoteEnvelopes: Array<{
          id: string;
          entity_type: string;
          parent_id: string | null;
          class_id: string | null;
          encrypted_payload: string;
          version: number;
          updated_at: string;
        }> = await res.json();

        const classEnvelopes = remoteEnvelopes.filter((e) => e.entity_type === 'class_dataset');
        let hasNewerRemote = false;

        for (const env of classEnvelopes) {
          const currentVer = envelopeVersionsRef.current.get(env.id);
          if (currentVer === undefined || env.version > currentVer) {
            hasNewerRemote = true;
            break;
          }
        }

        if (hasNewerRemote) {
          // Check if local has dirty uncommitted changes
          let hasLocalDirty = false;
          for (const ds of datasets) {
            const lastSer = lastSerializedPerClassRef.current.get(ds.id);
            if (lastSer !== JSON.stringify(ds)) {
              hasLocalDirty = true;
              break;
            }
          }

          if (!hasLocalDirty) {
            // Local is clean -> seamlessly pull and decrypt new remote datasets!
            const restoredList: ClassroomSubjectDataset[] = [];
            for (const env of classEnvelopes) {
              try {
                const decClass = wasm_decrypt_envelope(
                  vaultSession.dekB64,
                  vaultSession.userId,
                  env.id,
                  env.encrypted_payload
                );
                const ds = JSON.parse(decClass) as ClassroomSubjectDataset;
                ds.id = ensureValidUuid(ds.id || env.id);
                envelopeVersionsRef.current.set(ds.id, env.version);
                lastSerializedPerClassRef.current.set(ds.id, JSON.stringify(ds));
                restoredList.push(ds);
              } catch (e) {
                console.warn('Hintergrund-Entschlüsselung fehlgeschlagen für Envelope', env.id, e);
              }
            }

            if (restoredList.length > 0) {
              setDatasets(restoredList);
              setSyncStatus('synced');
            }
          } else {
            // Concurrent local changes exist -> flag conflict notice!
            setSyncConflictNotice(
              'Änderungen von einem anderen Gerät empfangen während lokale Änderungen vorliegen. Bitte abgleichen.'
            );
          }
        }
      } catch (err) {
        console.debug('Hintergrund-Sync Check beendet:', err);
      } finally {
        isPolling = false;
      }
    };

    // 1. Check on window focus / tab becoming visible
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performBackgroundSyncCheck();
      }
    };
    const onFocus = () => {
      performBackgroundSyncCheck();
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    // 2. Gentle polling interval every 12 seconds when tab is active
    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        performBackgroundSyncCheck();
      }
    }, 12000);

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(pollInterval);
    };
  }, [
    wasmReady,
    vaultSession?.token,
    vaultSession?.dekB64,
    vaultSession?.userId,
    isVaultLocked,
    userSettings.cloudSyncEnabled,
    loadedUserId,
    datasets,
  ]);

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
        await fetch(apiUrl(`/api/envelopes/${canonicalId}`), {
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

    const emailVerifiedKey = `gradus21_email_verified_${vaultSession.email}`;
    const isAlreadyVerified =
      isEmailVerified ||
      localStorage.getItem(emailVerifiedKey) === 'true' ||
      Boolean(vaultSession.token);

    if (!isAlreadyVerified) {
      setEmailForVerification(vaultSession.email);
      setIsEmailVerificationOpen(true);
      return;
    }

    await proceedToCloudSyncActivation();
  };

  const handleEmailVerificationCancel = () => {
    setIsEmailVerificationOpen(false);
  };

  const proceedToCloudSyncActivation = async (authToken?: string) => {
    let token =
      authToken ||
      vaultSession?.token ||
      (vaultSession?.userId ? getStoredToken(vaultSession.userId) : '');

    // Auto-login if we have authKey but no active token (e.g. after page reload or unlocking offline)
    if (
      !token &&
      vaultSession?.email &&
      (vaultSession?.authKeyB64 || (vaultSession?.userId && getStoredAuthKey(vaultSession.userId)))
    ) {
      token = (await renewTokenIfNeeded(
        vaultSession.userId,
        vaultSession.email,
        vaultSession.authKeyB64
      )) || '';
      if (token) {
        setVaultSession((prev) =>
          prev ? { ...prev, token } : null
        );
      }
    }

    if (!token) {
      alert(
        'Für den Cloud-Sync ist eine aktive Anmeldung am Server erforderlich. Bitte melde dich an.'
      );
      setIsVaultLocked(true);
      return;
    }

    try {
      setSyncStatus('syncing');
      let sumRes = await fetch(apiUrl('/api/envelopes/summary'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sumRes.status === 401 && vaultSession?.userId) {
        const refreshed = await renewTokenIfNeeded(
          vaultSession.userId,
          vaultSession.email,
          vaultSession.authKeyB64
        );
        if (refreshed) {
          token = refreshed;
          setVaultSession((prev) => (prev ? { ...prev, token: refreshed } : null));
          sumRes = await fetch(apiUrl('/api/envelopes/summary'), {
            headers: { Authorization: `Bearer ${refreshed}` },
          });
        }
      }
      if (!sumRes.ok) {
        throw new Error('Summary konnte nicht abgerufen werden');
      }
      const summary = await sumRes.json();
      const remoteClassCount = summary.class_envelopes?.length || 0;
      const realLocalClasses = datasets.filter((d) => {
        if (d.id === 'demo-class-initial') return false;
        if (d.id.startsWith('class_starter_') && d.students.length === 0 && d.grades.length === 0) {
          return false;
        }
        return true;
      });

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
      setSyncStatus('offline_local');
    }
  };

  const handleEmailVerificationSuccess = async () => {
    setIsEmailVerified(true);
    if (vaultSession?.email) {
      localStorage.setItem(`gradus21_email_verified_${vaultSession.email}`, 'true');
    }
    setIsEmailVerificationOpen(false);

    let token =
      vaultSession?.token ||
      (vaultSession?.userId ? getStoredToken(vaultSession.userId) : '');
    const authKey =
      vaultSession?.authKeyB64 ||
      (vaultSession?.userId ? getStoredAuthKey(vaultSession.userId) : '');

    // If offline vault or purged account, register or log in on server using existing userId
    if (!token && vaultSession && authKey) {
      try {
        const regRes = await fetch(apiUrl('/api/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: vaultSession.email,
            auth_key_b64: authKey,
            kdf_salt_b64: vaultSession.kdfSaltB64,
            kdf_params: JSON.stringify(
              vaultSession.kdfParams
                ? normalizeKdfParams(vaultSession.kdfParams)
                : { memory_kib: 19456, iterations: 2, parallelism: 1 }
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
          if (token && vaultSession.userId) {
            setStoredToken(vaultSession.userId, token);
          }
          setVaultSession((prev) =>
            prev ? { ...prev, token: regData.token, isAdmin: regData.is_admin } : null
          );
        } else {
          // If already registered, attempt login
          const logRes = await fetch(apiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: vaultSession.email,
              auth_key_b64: authKey,
            }),
          });
          if (logRes.ok) {
            const logData = await logRes.json();
            token = logData.token;
            if (token && vaultSession.userId) {
              setStoredToken(vaultSession.userId, token);
            }
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
  };

  const executeReconciliation = async (
    strategy: SyncReconciliationStrategy,
    authToken?: string
  ) => {
    let token =
      authToken ||
      vaultSession?.token ||
      (vaultSession?.userId ? getStoredToken(vaultSession.userId) : '');
    if (!token && vaultSession?.userId) {
      token =
        (await renewTokenIfNeeded(
          vaultSession.userId,
          vaultSession.email,
          vaultSession.authKeyB64
        )) || '';
      if (token) {
        setVaultSession((prev) => (prev ? { ...prev, token } : null));
      }
    }
    if (!token || !vaultSession?.dekB64) {
      setIsReconciliationOpen(false);
      return;
    }

    try {
      setSyncStatus('syncing');

      // 1. Fetch remote envelopes
      let res = await fetch(apiUrl('/api/envelopes/sync'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 && vaultSession?.userId) {
        const refreshed = await renewTokenIfNeeded(
          vaultSession.userId,
          vaultSession.email,
          vaultSession.authKeyB64
        );
        if (refreshed) {
          token = refreshed;
          setVaultSession((prev) => (prev ? { ...prev, token: refreshed } : null));
          res = await fetch(apiUrl('/api/envelopes/sync'), {
            headers: { Authorization: `Bearer ${refreshed}` },
          });
        }
      }
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
        if (env.entity_type === 'user_settings') {
          envelopeVersionsRef.current.set('00000000-0000-4000-8000-000000000002', env.version);
        }
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
        // Smart Merge: combine both datasets using fine-grained grade reconciliation
        const finalMap = new Map<string, ClassroomSubjectDataset>();
        const conflictCopies: ClassroomSubjectDataset[] = [];

        // Map remote classes by ID
        const remoteMap = new Map<string, ClassroomSubjectDataset>();
        decryptedRemoteClasses.forEach((cls) => {
          remoteMap.set(cls.id, cls);
        });

        // Merge local classes
        datasets.forEach((localCls) => {
          // Ignore placeholder starter class if remote classes exist
          if (
            localCls.id.startsWith('class_starter_') &&
            localCls.students.length === 0 &&
            localCls.grades.length === 0 &&
            decryptedRemoteClasses.length > 0
          ) {
            return;
          }
          const remoteCls = remoteMap.get(localCls.id);
          if (!remoteCls) {
            finalMap.set(localCls.id, localCls);
          } else {
            const { mergedDs, hadGradeCollisions, conflictCopy } = mergeClassroomDatasets(
              localCls,
              remoteCls
            );
            finalMap.set(mergedDs.id, mergedDs);
            if (hadGradeCollisions && conflictCopy) {
              conflictCopies.push(conflictCopy);
            }
            remoteMap.delete(localCls.id);
          }
        });

        // Add remaining remote classes that only exist on server
        remoteMap.forEach((remoteCls) => {
          finalMap.set(remoteCls.id, remoteCls);
        });

        finalClasses = [...Array.from(finalMap.values()), ...conflictCopies];
      }

      if (finalClasses.length > 0) {
        setDatasets(finalClasses);
        setActiveClassId(finalClasses[0].id);
        for (const cls of finalClasses) {
          lastSerializedPerClassRef.current.set(cls.id, JSON.stringify(cls));
        }
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

        const batchRes = await fetch(apiUrl('/api/envelopes/batch'), {
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
      lastSerializedSettingsRef.current = '';
      setSyncStatus('synced');
      setSyncConflictNotice(null);
      setIsReconciliationOpen(false);
      alert('Synchronisations-Abgleich erfolgreich abgeschlossen!');
    } catch (err) {
      console.error('Fehler bei der Reconciliation:', err);
      alert('Fehler beim Ausführen des Datenabgleichs.');
    }
  };

  const openReconciliationModal = async () => {
    let token =
      vaultSession?.token ||
      (vaultSession?.userId ? getStoredToken(vaultSession.userId) : '');
    try {
      if (token) {
        const sumRes = await fetch(apiUrl('/api/envelopes/summary'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (sumRes.ok) {
          const summary = await sumRes.json();
          setReconciliationMeta({
            localClassCount: datasets.length,
            remoteClassCount: summary.class_count ?? summary.envelope_count ?? datasets.length,
            remoteLastUpdated: summary.last_updated_at || undefined,
          });
          setIsReconciliationOpen(true);
          return;
        }
      }
    } catch (e) {
      console.warn('Fehler beim Abrufen der Summary für Abgleichs-Dialog:', e);
    }
    setReconciliationMeta({
      localClassCount: datasets.length,
      remoteClassCount: datasets.length,
      remoteLastUpdated: new Date().toISOString(),
    });
    setIsReconciliationOpen(true);
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
      const res = await fetch(apiUrl('/api/envelopes'), {
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
    openReconciliationModal,
    handleResolveReconciliation: executeReconciliation,
    handleCancelReconciliation,
  };
}
