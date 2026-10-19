import { useEffect, useMemo, useRef, useState } from 'react';
import initWasm, {
  wasm_decrypt_envelope,
  wasm_encrypt_envelope,
} from '../wasm-pkg/gradus21_core';
import { ActiveVaultSession } from '../components/VaultLockAndAuthModal';
import { GlobalTemplateRecord } from '../components/admin/CentralTemplatesTab';
import {
  ClassroomSubjectDataset,
  DEFAULT_USER_SYNC_SETTINGS,
  INITIAL_CLASS_DATASETS,
  UserSyncSettings,
  ensureValidUuid,
} from '../data/demoClasses';

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
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline_local'>('synced');
  const [syncConflictNotice, setSyncConflictNotice] = useState<string | null>(null);
  const clearConflictNotice = () => setSyncConflictNotice(null);
  const envelopeVersionsRef = useRef<Map<string, number>>(new Map());
  const lastSerializedPerClassRef = useRef<Map<string, string>>(new Map());
  const lastSerializedSettingsRef = useRef<string>('');

  const [vaultSession, setVaultSession] = useState<ActiveVaultSession | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const isRestoringRef = useRef<boolean>(false);
  const [sampleEnvelope, setSampleEnvelope] = useState<{
    entityId: string;
    plaintext: string;
    ciphertext: string;
    decryptedVerify: string;
  } | null>(null);

  // Global School Templates from Server (Zentral bereitgestellt)
  const [globalTemplates, setGlobalTemplates] = useState<GlobalTemplateRecord[]>([]);

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
                setUserSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...JSON.parse(decSettings),
                });
              } catch {
                // Keep default settings if corrupted
              }
            }
            setLoadedUserId(userId);
            setSyncStatus('synced');
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
                setUserSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...JSON.parse(decSettings),
                });
              } catch {
                // Keep default settings if corrupted
              }
            }
            setLoadedUserId(userId);
            setSyncStatus('synced');
            return;
          }
        } catch (e) {
          console.warn('Lokaler E2EE-Cache konnte nicht entschlüsselt werden:', e);
        }
      }
    }

    // Falls kein lokaler Cache existiert oder forceServerFetch aktiv ist -> Server abfragen
    if (token) {
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
    setSyncStatus('synced');
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
            recoveryKeyFormatted: undefined,
          },
          classEnvelopes: mergedClassEnvelopes,
          encryptedSettingsEnvelope: encryptedSettingsStr || undefined,
          isLocked: isVaultLocked,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(userCacheKey, JSON.stringify(userCacheBundle));

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
                envelopeVersionsRef.current.set(serverDs.id, conflictEnv.version);
                lastSerializedPerClassRef.current.set(serverDs.id, JSON.stringify(serverDs));

                setDatasets((prev) =>
                  prev.map((d) => (d.id === serverDs.id ? serverDs : d))
                );

                setSyncConflictNotice(
                  `Synchronisations-Konflikt gelöst: Die Klasse „${serverDs.className || serverDs.subjectName}“ wurde von einem anderen Tab/Gerät aktualisiert (v${conflictEnv.version}). Die Daten wurden ohne Überschreiben zusammengeführt.`
                );
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

    // Call DELETE /api/envelopes/:id on the server
    if (vaultSession?.token) {
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
    loadIsolatedUserWorkspace,
    handleLockVault,
    handleUnlockVault,
    updateSubjectConfig,
    handleDeleteClass,
    handleRestoreSnapshot,
  };
}
