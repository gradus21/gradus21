import { useEffect, useMemo, useRef, useState } from 'react';
import {
  wasm_decrypt_envelope,
  wasm_encrypt_envelope,
  wasm_unlock_vault,
  wasm_rewrap_dek,
} from '../wasm-pkg/gradus21_core';
import { ensureWasmLoaded } from '../utils/wasmLoader';
import {
  ActiveVaultSession,
  findLocalCachedVault,
  normalizeKdfParams,
  saveLastLoginEmail,
} from '../components/vault/vaultTypes';
import type { GlobalTemplateRecord } from '../types/templates';
import { SyncReconciliationStrategy } from '../components/SyncReconciliationModal';
import { apiUrl } from '../utils/apiConfig';
import { generateTotpCode } from '../utils/totp';
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
  clearNativeBackupPath,
  exportVaultToFileDownload,
  getDirectoryHandle,
  getNativeBackupPath,
  isFileSystemAccessSupported,
  pickBackupDirectory,
  pickNativeBackupDirectory,
  readVaultFromFile,
  removeDirectoryHandle,
  requestStoragePersistence,
  validateAndSaveNativeBackupDirectory,
  writeVaultToDirectory,
  writeVaultToNativeDirectory,
} from '../utils/localBackupStorage';
import { isTauri } from '../utils/platform';
import {
  DEMO_OWNER_USER_ID,
  ACTIVE_USER_ID_STORAGE_KEY,
  LEGACY_ACTIVE_USER_ID_STORAGE_KEY,
  VAULT_LOCKED_STORAGE_KEY,
  LEGACY_VAULT_LOCKED_STORAGE_KEY,
  getUserEncryptedCacheKey,
  getLegacyUserEncryptedCacheKey,
  getStoredDek,
  setStoredDek,
  removeStoredDek,
  getStoredToken,
  setStoredToken,
  removeStoredToken,
  getStoredAuthKey,
  setStoredAuthKey,
  removeStoredAuthKey,
  encryptSessionCredentials,
  restoreSessionCredentials,
  persistEncryptedSessionCredentialsToCache,
  renewTokenIfNeeded,
  createFreshWorkspaceForNewTeacher,
  mergeClassroomDatasets,
} from './vaultSyncHelpers';

export * from './vaultSyncHelpers';

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
    if (
      typeof window !== 'undefined' &&
      (window.location.search.includes('demo=1') ||
        window.location.hash.startsWith('#matrix') ||
        window.location.hash.startsWith('#speed') ||
        window.location.hash.startsWith('#student'))
    ) {
      return false;
    }
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
  const datasetsRef = useRef(datasets);
  datasetsRef.current = datasets;
  const lastServerUpdatedAtRef = useRef<string | null>(null);
  const lastServerEnvelopeCountRef = useRef<number | null>(null);

  // Local persistent storage & automated backup directory
  const [isPersistentStorage, setIsPersistentStorage] = useState<boolean>(false);
  const [connectedBackupDirName, setConnectedBackupDirName] = useState<string | null>(() =>
    isTauri() ? getNativeBackupPath() : null
  );
  const [lastLocalBackupTime, setLastLocalBackupTime] = useState<string | null>(null);
  const connectedDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const connectedNativePathRef = useRef<string | null>(isTauri() ? getNativeBackupPath() : null);

  useEffect(() => {
    requestStoragePersistence().then((persisted) => setIsPersistentStorage(persisted));
    if (isTauri()) {
      const savedNativePath = getNativeBackupPath();
      if (savedNativePath) {
        connectedNativePathRef.current = savedNativePath;
        setConnectedBackupDirName(savedNativePath);
        return;
      }
    }
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

  // Email verification & reconciliation states
  const [isEmailVerificationOpen, setIsEmailVerificationOpen] = useState(false);
  const [emailForVerification, setEmailForVerification] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
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

  const sampleEnvelope = useMemo(() => {
    if (!wasmReady || !vaultSession?.dekB64 || !vaultSession.userId || isVaultLocked || !activeDataset) {
      return null;
    }
    try {
      const activeId = ensureValidUuid(activeDataset.id);
      const serializedActive = JSON.stringify(activeDataset);
      const activeEncrypted = wasm_encrypt_envelope(
        vaultSession.dekB64,
        vaultSession.userId,
        activeId,
        serializedActive
      );
      return {
        entityId: activeId,
        plaintext: serializedActive.slice(0, 320) + '...',
        ciphertext: activeEncrypted.slice(0, 160) + '...',
        decryptedVerify: serializedActive.slice(0, 320) + '...',
      };
    } catch {
      return null;
    }
  }, [wasmReady, vaultSession?.dekB64, vaultSession?.userId, isVaultLocked, activeDataset]);

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
    const enrichedSession = restoreSessionCredentials(session);
    const { dekB64, userId, token } = enrichedSession;
    if (!dekB64 || !userId) return;

    const userCacheKey = getUserEncryptedCacheKey(userId);
    const legacyUserCacheKey = getLegacyUserEncryptedCacheKey(userId);

    let isCloudSyncActive = initialCloudSync;
    let explicitLocalSyncValue: boolean | undefined = undefined;
    const cachedLocalClasses: ClassroomSubjectDataset[] = [];
    const localDirtyClassIds = new Set<string>();
    const localUnpushedClassIds = new Set<string>();

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
              const isRawString = typeof envItem === 'string';
              const payloadStr = isRawString ? envItem : envItem?.encryptedPayload;
              if (!payloadStr) continue;
              try {
                let decClass: string;
                try {
                  decClass = wasm_decrypt_envelope(dekB64, userId, classId, payloadStr);
                } catch {
                  decClass = wasm_decrypt_envelope(dekB64, userId, `class_${classId}`, payloadStr);
                }
                const ds = JSON.parse(decClass) as ClassroomSubjectDataset;
                ds.id = ensureValidUuid(ds.id || classId);
                const ver = !isRawString && typeof envItem.version === 'number' ? envItem.version : 1;
                if (ver > 0) {
                  envelopeVersionsRef.current.set(ds.id, ver);
                } else {
                  envelopeVersionsRef.current.delete(ds.id);
                  localUnpushedClassIds.add(ds.id);
                }
                if ((!isRawString && envItem.dirty) || ver === 0) {
                  localDirtyClassIds.add(ds.id);
                  lastSerializedPerClassRef.current.delete(ds.id);
                } else {
                  lastSerializedPerClassRef.current.set(ds.id, JSON.stringify(ds));
                }
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
                const parsedSettings = JSON.parse(decSettings);
                if (typeof parsedSettings?.cloudSyncEnabled === 'boolean') {
                  explicitLocalSyncValue = parsedSettings.cloudSyncEnabled;
                }
                const isSync =
                  initialCloudSync ||
                  Boolean(parsedSettings?.cloudSyncEnabled ?? userSettings.cloudSyncEnabled);
                const resolvedLocalSettings = applyResolvedThemeToSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...parsedSettings,
                  cloudSyncEnabled: isSync,
                });
                lastSerializedSettingsRef.current = JSON.stringify(resolvedLocalSettings);
                setUserSettings(() => resolvedLocalSettings);
                setLoadedUserId(userId);
                if (isSync) {
                  isCloudSyncActive = true;
                } else {
                  setSyncStatus('local_only');
                }
              } catch {
                // Keep default settings if corrupted
              }
            }
            if (!isCloudSyncActive && explicitLocalSyncValue !== false && userSettings.cloudSyncEnabled) {
              isCloudSyncActive = true;
            }
            setLoadedUserId(userId);
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
              for (const ds of withUuids) {
                localDirtyClassIds.add(ds.id);
              }
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
                const parsedSettings = JSON.parse(decSettings);
                if (typeof parsedSettings?.cloudSyncEnabled === 'boolean') {
                  explicitLocalSyncValue = parsedSettings.cloudSyncEnabled;
                }
                const isSync =
                  initialCloudSync ||
                  Boolean(parsedSettings?.cloudSyncEnabled ?? userSettings.cloudSyncEnabled);
                const resolvedLocalSettings = applyResolvedThemeToSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...parsedSettings,
                  cloudSyncEnabled: isSync,
                });
                lastSerializedSettingsRef.current = JSON.stringify(resolvedLocalSettings);
                setUserSettings(() => resolvedLocalSettings);
                setLoadedUserId(userId);
                if (isSync) {
                  isCloudSyncActive = true;
                } else {
                  setSyncStatus('local_only');
                }
              } catch {
                // Keep default settings if corrupted
              }
            }
            if (!isCloudSyncActive && explicitLocalSyncValue !== false && userSettings.cloudSyncEnabled) {
              isCloudSyncActive = true;
            }
            setLoadedUserId(userId);
          }
        } catch (e) {
          console.warn('Lokaler E2EE-Cache konnte nicht entschlüsselt werden:', e);
        }
      }
    }

    // Falls kein lokaler Cache existiert oder forceServerFetch aktiv ist oder Cloud-Sync aktiv ist oder Token vorhanden -> Server abfragen
    let effectiveToken = token || (userId ? getStoredToken(userId) : '');
    const hasLocalClasses = cachedLocalClasses.length > 0;
    const wantsServerSync =
      forceServerFetch || userSettings.cloudSyncEnabled || isCloudSyncActive || !hasLocalClasses;

    if (!effectiveToken && wantsServerSync && enrichedSession.authKeyB64) {
      const renewed = await renewTokenIfNeeded(
        userId,
        enrichedSession.email,
        enrichedSession.authKeyB64,
        enrichedSession.totpSecretBase32
      );
      if (renewed) {
        effectiveToken = renewed;
        setVaultSession((prev) => (prev ? { ...prev, token: renewed } : null));
        persistEncryptedSessionCredentialsToCache({ ...enrichedSession, token: renewed });
      }
    }

    if (effectiveToken && wantsServerSync) {
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
            enrichedSession.email,
            enrichedSession.authKeyB64,
            enrichedSession.totpSecretBase32
          );
          if (refreshedToken) {
            effectiveToken = refreshedToken;
            setVaultSession((prev) => (prev ? { ...prev, token: refreshedToken } : null));
            persistEncryptedSessionCredentialsToCache({ ...enrichedSession, token: refreshedToken });
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
              const parsedRemoteSettings = JSON.parse(decSettings);
              const remoteSyncEnabled = initialCloudSync
                ? true
                : explicitLocalSyncValue === false && !forceServerFetch
                  ? false
                  : Boolean(
                      parsedRemoteSettings.cloudSyncEnabled ??
                        explicitLocalSyncValue ??
                        (classEnvelopes.length > 0)
                    );
              const resolvedRemoteSettings = applyResolvedThemeToSettings({
                ...DEFAULT_USER_SYNC_SETTINGS,
                ...parsedRemoteSettings,
                cloudSyncEnabled: remoteSyncEnabled,
              });
              lastSerializedSettingsRef.current = JSON.stringify(resolvedRemoteSettings);
              setUserSettings(() => resolvedRemoteSettings);
              if (remoteSyncEnabled) {
                isCloudSyncActive = true;
              }
            } catch {
              // ignore
            }
          } else if (classEnvelopes.length > 0 && explicitLocalSyncValue !== false) {
            isCloudSyncActive = true;
            setUserSettings((prev) => {
              const next = applyResolvedThemeToSettings({
                ...DEFAULT_USER_SYNC_SETTINGS,
                ...prev,
                cloudSyncEnabled: true,
              });
              lastSerializedSettingsRef.current = JSON.stringify(next);
              return next;
            });
          }

          if (classEnvelopes.length > 0) {
            // Granular envelopes per class
            const restoredList: ClassroomSubjectDataset[] = [];
            const localById = new Map(cachedLocalClasses.map((c) => [c.id, c]));
            for (const env of classEnvelopes) {
              try {
                const decClass = wasm_decrypt_envelope(
                  dekB64,
                  userId,
                  env.id,
                  env.encrypted_payload
                );
                const serverDs = JSON.parse(decClass) as ClassroomSubjectDataset;
                serverDs.id = ensureValidUuid(serverDs.id || env.id);
                envelopeVersionsRef.current.set(serverDs.id, env.version);
                lastSerializedPerClassRef.current.set(serverDs.id, JSON.stringify(serverDs));

                const localDs = localById.get(serverDs.id);
                if (
                  localDs &&
                  (localDirtyClassIds.has(serverDs.id) || localUnpushedClassIds.has(serverDs.id))
                ) {
                  const { mergedDs } = mergeClassroomDatasets(localDs, serverDs);
                  restoredList.push(mergedDs);
                } else {
                  restoredList.push(serverDs);
                }
              } catch (e) {
                console.warn(`Envelope für Klasse ${env.id} konnte nicht entschlüsselt werden:`, e);
              }
            }
            if (restoredList.length > 0) {
              if (cachedLocalClasses.length > 0) {
                const serverClassIds = new Set(restoredList.map((c) => c.id));
                for (const loc of cachedLocalClasses) {
                  if (!serverClassIds.has(loc.id)) {
                    envelopeVersionsRef.current.delete(loc.id);
                    lastSerializedPerClassRef.current.delete(loc.id);
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
              setUserSettings((prev) => {
                const next = applyResolvedThemeToSettings({
                  ...DEFAULT_USER_SYNC_SETTINGS,
                  ...prev,
                  cloudSyncEnabled: initialSync || prev.cloudSyncEnabled,
                });
                lastSerializedSettingsRef.current = JSON.stringify(next);
                return next;
              });
            }
          }

          setLoadedUserId(userId);
          setSyncStatus(
            isCloudSyncActive || initialCloudSync || userSettings.cloudSyncEnabled
              ? 'synced'
              : 'local_only'
          );
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
    setUserSettings((prev) => {
      const next = applyResolvedThemeToSettings({
        ...DEFAULT_USER_SYNC_SETTINGS,
        themePreset: prev.themePreset,
        themeMode: prev.themeMode,
        darkMode: prev.darkMode,
        cloudSyncEnabled: initialSync,
      });
      lastSerializedSettingsRef.current = JSON.stringify(next);
      return next;
    });
    setLoadedUserId(userId);
    setSyncStatus(initialSync ? (effectiveToken ? 'synced' : 'offline_local') : 'local_only');
  };

  const handleLockVault = (options?: { skipPersistSessionCredentials?: boolean }) => {
    localStorage.setItem(VAULT_LOCKED_STORAGE_KEY, 'true');
    localStorage.removeItem(LEGACY_VAULT_LOCKED_STORAGE_KEY);
    if (vaultSession?.userId) {
      if (!options?.skipPersistSessionCredentials) {
        persistEncryptedSessionCredentialsToCache(vaultSession);
      }
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
              authKeyB64: undefined,
              totpSecretBase32: undefined,
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
            totpSecretBase32: undefined,
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
    const effectiveSession = restoreSessionCredentials(unlockedSession);
    localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, effectiveSession.userId);
    if (effectiveSession.dekB64) {
      setStoredDek(effectiveSession.userId, effectiveSession.dekB64);
    }
    if (effectiveSession.token) {
      setStoredToken(effectiveSession.userId, effectiveSession.token);
    }
    if (effectiveSession.authKeyB64) {
      setStoredAuthKey(effectiveSession.userId, effectiveSession.authKeyB64);
    }
    persistEncryptedSessionCredentialsToCache(effectiveSession);
    setVaultSession(effectiveSession);

    const shouldEnableCloudSync = Boolean(options?.enableCloudSync);
    if (shouldEnableCloudSync) {
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: true }));
      setSyncStatus('synced');
    }

    if (effectiveSession.dekB64) {
      await loadIsolatedUserWorkspace(effectiveSession, false, shouldEnableCloudSync);
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
                  totpSecretBase32: undefined,
                  recoveryKeyFormatted: undefined,
                });
                setIsVaultLocked(true);
                return;
              }

              const rawRestoredSession: ActiveVaultSession = {
                ...parsed.session,
                dekB64: sessionDek,
                token: sessionToken || parsed.session.token || '',
                authKeyB64: sessionAuthKey || parsed.session.authKeyB64 || undefined,
                recoveryKeyFormatted: undefined,
              };
              const restoredSession = restoreSessionCredentials(rawRestoredSession);
              setVaultSession(restoredSession);
              await loadIsolatedUserWorkspace(restoredSession);
              return;
            }
          } catch {
            // Proceed to lock screen if cache is invalid
          }
        }
      }

      // Screenshot / Demo-Modus: Behalte vollständige Demo-Klasse mit Noten und Schülern
      if (
        typeof window !== 'undefined' &&
        (window.location.search.includes('demo=1') ||
          window.location.hash.startsWith('#matrix') ||
          window.location.hash.startsWith('#speed') ||
          window.location.hash.startsWith('#student'))
      ) {
        setDatasets(INITIAL_CLASS_DATASETS);
        setActiveClassId(INITIAL_CLASS_DATASETS[0].id);
        setIsVaultLocked(false);
        return;
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

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const timer = window.setTimeout(async () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
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

        const cachedClassEnvelopes: Record<
          string,
          { encryptedPayload: string; version: number; dirty?: boolean }
        > = {};
        const serializedSentPerClass = new Map<string, string>();

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
            serializedSentPerClass.set(canonicalId, serialized);
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
              version: currentVersion ?? 0,
              dirty: true,
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

        // Update local storage cache
        // Architectural Invariant (I-5): `localStorage.classEnvelopes` is a strict projection of
        // the current `datasets` list — stale/deleted class IDs are pruned on every write.
        const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
        const existingCacheRaw = localStorage.getItem(userCacheKey);
        const activeDatasetUuids = new Set(datasets.map((ds) => ensureValidUuid(ds.id)));
        let mergedClassEnvelopes = cachedClassEnvelopes;
        let preservedEncryptedSessionCredentials: string | undefined;
        if (existingCacheRaw) {
          try {
            const parsedOld = JSON.parse(existingCacheRaw);
            const filteredOldEnvelopes: Record<
              string,
              { encryptedPayload: string; version: number; dirty?: boolean }
            > = {};
            if (parsedOld.classEnvelopes && typeof parsedOld.classEnvelopes === 'object') {
              for (const [k, v] of Object.entries(parsedOld.classEnvelopes)) {
                if (activeDatasetUuids.has(k)) {
                  filteredOldEnvelopes[k] = v as {
                    encryptedPayload: string;
                    version: number;
                    dirty?: boolean;
                  };
                }
              }
            }
            mergedClassEnvelopes = {
              ...filteredOldEnvelopes,
              ...cachedClassEnvelopes,
            };
            preservedEncryptedSessionCredentials = parsedOld.encryptedSessionCredentials;
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

        const encryptedSessionCredentials =
          encryptSessionCredentials(vaultSession.dekB64, vaultSession.userId, vaultSession) ||
          preservedEncryptedSessionCredentials;

        const userCacheBundle = {
          userId: vaultSession.userId,
          session: {
            ...vaultSession,
            dekB64: '',
            token: '',
            authKeyB64: undefined,
            totpSecretBase32: undefined,
            recoveryKeyFormatted: undefined,
          },
          ...(encryptedSessionCredentials ? { encryptedSessionCredentials } : {}),
          kdfParams: vaultSession.kdfParams
            ? normalizeKdfParams(vaultSession.kdfParams)
            : { memory_kib: 19456, iterations: 2, parallelism: 1 },
          classEnvelopes: mergedClassEnvelopes,
          encryptedSettingsEnvelope: effectiveSettingsEnvelope,
          isLocked: isVaultLocked,
          updatedAt: new Date().toISOString(),
        };
        try {
          localStorage.setItem(userCacheKey, JSON.stringify(userCacheBundle));
        } catch (storageErr) {
          console.warn('LocalStorage Quota überschritten oder blockiert, Browser-Cache konnte nicht aktualisiert werden:', storageErr);
        }

        // Auto-save to connected local backup directory (Native Path on Tauri or File System Access API on Web)
        // [HIGH-4] Strip encryptedSessionCredentials from external backup files
        if (isTauri() && connectedNativePathRef.current) {
          try {
            const sanitizedBackupBundle = { ...userCacheBundle };
            delete (sanitizedBackupBundle as Record<string, unknown>).encryptedSessionCredentials;
            await writeVaultToNativeDirectory(
              connectedNativePathRef.current,
              JSON.stringify(sanitizedBackupBundle, null, 2),
              { userId: userCacheBundle.userId }
            );
            setLastLocalBackupTime(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
          } catch (nativeErr) {
            console.warn('Fehler beim automatischen Schreiben in den nativen Backup-Pfad:', nativeErr);
          }
        } else if (connectedDirHandleRef.current) {
          try {
            const sanitizedBackupBundle = { ...userCacheBundle };
            delete (sanitizedBackupBundle as Record<string, unknown>).encryptedSessionCredentials;
            await writeVaultToDirectory(
              connectedDirHandleRef.current,
              JSON.stringify(sanitizedBackupBundle, null, 2),
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

        let effectiveToken =
          vaultSession.token ||
          (vaultSession.userId ? getStoredToken(vaultSession.userId) : '');

        // If offline / no token -> attempt auto-renew
        if (!effectiveToken && vaultSession.userId) {
          effectiveToken =
            (await renewTokenIfNeeded(
              vaultSession.userId,
              vaultSession.email,
              vaultSession.authKeyB64,
              vaultSession.totpSecretBase32
            )) || '';
          if (effectiveToken) {
            const updatedSession = { ...vaultSession, token: effectiveToken };
            setVaultSession((prev) => (prev ? { ...prev, token: effectiveToken } : null));
            persistEncryptedSessionCredentialsToCache(updatedSession);
          }
        }

        // If no envelopes are dirty, reflect true token availability instead of masking offline_local as synced
        if (dirtyEnvelopes.length === 0 && !settingsEnvelopeItem) {
          setSyncStatus(effectiveToken ? 'synced' : 'offline_local');
          return;
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

        const prefPayload = {
          theme: userSettings.themePreset,
          mode: userSettings.darkMode ? 'dark' : 'light',
          defaultScaleId: userSettings.defaultScaleId,
          defaultWeightingMode: userSettings.defaultWeightingMode,
          favoriteWeightingPresets: userSettings.favoriteWeightingPresets,
        };

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
            body: JSON.stringify(prefPayload),
          }),
        ]);

        if (batchRes.status === 401 || prefRes.status === 401) {
          const newToken = await renewTokenIfNeeded(
            vaultSession.userId,
            vaultSession.email,
            vaultSession.authKeyB64,
            vaultSession.totpSecretBase32
          );
          if (newToken) {
            effectiveToken = newToken;
            const updatedSession = { ...vaultSession, token: newToken };
            setVaultSession((prev) => (prev ? { ...prev, token: newToken } : null));
            persistEncryptedSessionCredentialsToCache(updatedSession);
            if (batchRes.status === 401) {
              batchRes = await fetch(apiUrl('/api/envelopes/batch'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${newToken}`,
                },
                body: JSON.stringify({ envelopes: batchPayload }),
              });
            }
            if (prefRes.status === 401) {
              prefRes = await fetch(apiUrl('/api/preferences'), {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${newToken}`,
                },
                body: JSON.stringify(prefPayload),
              });
            }
          }
        }

        if (batchRes.status === 409) {
          // OCC Conflict detected: Another tab or device updated one of the envelopes!
          const conflictData = await batchRes.json().catch(() => null);
          const conflictEnv = conflictData?.conflict_envelope;

          // If the conflict is solely on the singleton user_settings envelope, silently align version
          // and prevent hijacking user with a class-reconciliation dialog
          const isOnlySettingsConflict =
            conflictData?.envelope_id === '00000000-0000-4000-8000-000000000002' ||
            conflictEnv?.entity_type === 'user_settings';
          if (isOnlySettingsConflict) {
            const serverVer = conflictData?.server_version ?? conflictEnv?.version;
            if (serverVer) {
              envelopeVersionsRef.current.set(
                '00000000-0000-4000-8000-000000000002',
                serverVer
              );
            }
            lastSerializedSettingsRef.current = serializedSettings;
            setSyncStatus('synced');
            return;
          }

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

        if (batchRes.ok) {
          const updatedEnvelopes: Array<{ id: string; version: number; entity_type?: string }> =
            await batchRes.json();
          for (const up of updatedEnvelopes) {
            envelopeVersionsRef.current.set(up.id, up.version);
            if (up.entity_type === 'user_settings') {
              envelopeVersionsRef.current.set('00000000-0000-4000-8000-000000000002', up.version);
            }
          }
          for (const [sentClassId, sentSerialized] of serializedSentPerClass.entries()) {
            lastSerializedPerClassRef.current.set(sentClassId, sentSerialized);
          }
          if (settingsEnvelopeItem) {
            lastSerializedSettingsRef.current = serializedSettings;
            const settingsVer = updatedEnvelopes.find((e) => e.entity_type === 'user_settings')?.version || 1;
            envelopeVersionsRef.current.set('00000000-0000-4000-8000-000000000002', settingsVer);
          }

          // Clear dirty flags and persist authoritative server OCC versions in localStorage cache
          try {
            const latestCacheRaw = localStorage.getItem(userCacheKey);
            if (latestCacheRaw) {
              const latestCache = JSON.parse(latestCacheRaw);
              if (latestCache.classEnvelopes) {
                for (const up of updatedEnvelopes) {
                  if (latestCache.classEnvelopes[up.id]) {
                    latestCache.classEnvelopes[up.id].version = up.version;
                    latestCache.classEnvelopes[up.id].dirty = false;
                  }
                }
                localStorage.setItem(userCacheKey, JSON.stringify(latestCache));
              }
            }
          } catch {
            // ignore cache update error
          }

          if (!prefRes.ok) {
            console.warn('Preferences sync non-OK (envelopes succeeded):', prefRes.status);
          }
          setSyncStatus('synced');
        } else {
          for (const sentClassId of serializedSentPerClass.keys()) {
            lastSerializedPerClassRef.current.delete(sentClassId);
          }
          if (settingsEnvelopeItem) {
            lastSerializedSettingsRef.current = '';
          }
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

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.clearTimeout(timer);
    };
  }, [wasmReady, datasets, userSettings, vaultSession, isVaultLocked, loadedUserId]);

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
            vaultSession.authKeyB64,
            vaultSession.totpSecretBase32
          ));

        if (!token) {
          isPolling = false;
          return;
        }

        // Optimization (Finding 4): Check /api/envelopes/summary first.
        // It returns { envelope_count, class_count, class_ids, last_updated_at } in ~80 bytes.
        // If last_updated_at and envelope_count match our last known state, no remote changes exist!
        try {
          const sumRes = await fetch(apiUrl('/api/envelopes/summary'), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (sumRes.ok) {
            const summary = await sumRes.json();
            const remoteLastUpdated = summary.last_updated_at || null;
            const remoteCount = summary.envelope_count ?? null;
            if (
              lastServerUpdatedAtRef.current !== null &&
              lastServerEnvelopeCountRef.current !== null &&
              lastServerUpdatedAtRef.current === remoteLastUpdated &&
              lastServerEnvelopeCountRef.current === remoteCount
            ) {
              // Server state is identical to our last fetch; skip downloading payloads!
              isPolling = false;
              return;
            }
            lastServerUpdatedAtRef.current = remoteLastUpdated;
            lastServerEnvelopeCountRef.current = remoteCount;
          }
        } catch {
          // If summary fails or server does not support it, fall back to /api/envelopes/sync
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
          // Check if local has dirty uncommitted changes or unsynced new classes
          let hasLocalDirty = false;
          for (const ds of datasetsRef.current) {
            const lastSer = lastSerializedPerClassRef.current.get(ds.id);
            const knownServerVer = envelopeVersionsRef.current.get(ds.id);
            const isStarterPlaceholder =
              ds.id === 'demo-class-initial' ||
              (ds.id.startsWith('class_starter_') && ds.students.length === 0 && ds.grades.length === 0);
            if (lastSer !== JSON.stringify(ds) || (!knownServerVer && !isStarterPlaceholder)) {
              hasLocalDirty = true;
              break;
            }
          }

          if (!hasLocalDirty) {
            // Local is clean -> seamlessly pull and decrypt new remote datasets!
            const restoredList: ClassroomSubjectDataset[] = [];
            const remoteIds = new Set<string>();
            const syncedClassEnvelopes: Record<
              string,
              { encryptedPayload: string; version: number; dirty?: boolean }
            > = {};
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
                remoteIds.add(ds.id);
                envelopeVersionsRef.current.set(ds.id, env.version);
                lastSerializedPerClassRef.current.set(ds.id, JSON.stringify(ds));
                syncedClassEnvelopes[ds.id] = {
                  encryptedPayload: env.encrypted_payload,
                  version: env.version,
                  dirty: false,
                };
                restoredList.push(ds);
              } catch (e) {
                console.warn('Hintergrund-Entschlüsselung fehlgeschlagen für Envelope', env.id, e);
              }
            }

            if (restoredList.length > 0) {
              try {
                const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
                const existingRaw = localStorage.getItem(userCacheKey);
                if (existingRaw) {
                  const parsedCache = JSON.parse(existingRaw);
                  parsedCache.classEnvelopes = syncedClassEnvelopes;
                  parsedCache.updatedAt = new Date().toISOString();
                  localStorage.setItem(userCacheKey, JSON.stringify(parsedCache));
                }
              } catch {
                // ignore storage errors
              }
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

  const migrateLocalUserIdIfNeeded = (
    oldUserId: string,
    newUserId: string,
    updatedSession: ActiveVaultSession
  ) => {
    if (!oldUserId || !newUserId || oldUserId === newUserId) {
      return;
    }
    if (updatedSession.dekB64) {
      setStoredDek(newUserId, updatedSession.dekB64);
    }
    if (updatedSession.token) {
      setStoredToken(newUserId, updatedSession.token);
    }
    if (updatedSession.authKeyB64) {
      setStoredAuthKey(newUserId, updatedSession.authKeyB64);
    }
    removeStoredDek(oldUserId);
    removeStoredToken(oldUserId);
    removeStoredAuthKey(oldUserId);

    localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, newUserId);
    const oldCacheKey = getUserEncryptedCacheKey(oldUserId);
    const newCacheKey = getUserEncryptedCacheKey(newUserId);
    const oldCachedRaw = localStorage.getItem(oldCacheKey);
    if (oldCachedRaw && !localStorage.getItem(newCacheKey)) {
      try {
        const parsed = JSON.parse(oldCachedRaw);
        if (parsed.session) {
          parsed.session = {
            ...parsed.session,
            userId: newUserId,
          };
        }
        localStorage.setItem(newCacheKey, JSON.stringify(parsed));
      } catch {
        // ignore
      }
    }
    localStorage.removeItem(oldCacheKey);
    setLoadedUserId(newUserId);
    lastSerializedPerClassRef.current.clear();
    lastSerializedSettingsRef.current = '';
  };

  const linkLocalVaultWithServer = async (
    currentSession: ActiveVaultSession
  ): Promise<{
    token: string;
    session: ActiveVaultSession;
    requiresEmailVerification?: boolean;
  }> => {
    const authKey =
      currentSession.authKeyB64 ||
      (currentSession.userId ? getStoredAuthKey(currentSession.userId) : '');
    if (!authKey || !currentSession.email) {
      return { token: '', session: currentSession };
    }

    const canonicalUserId = ensureValidUuid(currentSession.userId);

    // 1. Erst Login versuchen falls Konto bereits auf dem Server existiert
    try {
      let totpCode: string | undefined;
      if (currentSession.totpSecretBase32) {
        try {
          totpCode = await generateTotpCode(currentSession.totpSecretBase32);
        } catch {
          // ignore
        }
      }

      const logRes = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentSession.email,
          auth_key_b64: authKey,
          ...(totpCode ? { totp_code: totpCode } : {}),
        }),
      });

      if (logRes.ok) {
        const logData = await logRes.json();
        const serverUserId = logData.user_id || canonicalUserId;
        const nextSession: ActiveVaultSession = {
          ...currentSession,
          userId: serverUserId,
          token: logData.token,
          authKeyB64: authKey,
          isAdmin: logData.is_admin ?? currentSession.isAdmin,
          totpEnabled: logData.totp_enabled ?? currentSession.totpEnabled,
          totpSecretBase32: currentSession.totpSecretBase32 || logData.totp_secret_base32,
          totpSetupUri: currentSession.totpSetupUri || logData.totp_setup_uri,
        };
        migrateLocalUserIdIfNeeded(currentSession.userId, serverUserId, nextSession);
        setStoredToken(serverUserId, logData.token);
        setStoredAuthKey(serverUserId, authKey);
        setVaultSession(nextSession);
        persistEncryptedSessionCredentialsToCache(nextSession);
        return { token: logData.token, session: nextSession };
      }
    } catch (err) {
      console.warn('Vorab-Login für Cloud-Verknüpfung fehlgeschlagen, versuche Registrierung:', err);
    }

    // 2. Falls noch nicht registriert, Registrierung durchführen
    try {
      const regRes = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: currentSession.email,
          auth_key_b64: authKey,
          kdf_salt_b64: currentSession.kdfSaltB64,
          kdf_params: currentSession.kdfParams
            ? normalizeKdfParams(currentSession.kdfParams)
            : { memory_kib: 19456, iterations: 2, parallelism: 1 },
          encrypted_dek: currentSession.encryptedDek,
          recovery_encrypted_dek: currentSession.recoveryEncryptedDek,
          recovery_auth_key_b64: null,
          user_id: canonicalUserId,
          totp_secret_base32: currentSession.totpSecretBase32 || null,
          totp_enabled: Boolean(currentSession.totpEnabled && currentSession.totpSecretBase32),
        }),
      });

      if (regRes.status === 403) {
        const errText = await regRes.text().catch(() => '');
        if (errText.includes('E-Mail-Verifikation') || errText.includes('verification')) {
          localStorage.removeItem(`gradus21_email_verified_${currentSession.email}`);
          setIsEmailVerified(false);
          return { token: '', session: currentSession, requiresEmailVerification: true };
        }
      }

      if (regRes.ok) {
        const regData = await regRes.json();
        const serverUserId = regData.user_id || canonicalUserId;
        const nextSession: ActiveVaultSession = {
          ...currentSession,
          userId: serverUserId,
          token: regData.token,
          authKeyB64: authKey,
          isAdmin: regData.is_admin ?? currentSession.isAdmin,
          totpEnabled: regData.totp_enabled ?? currentSession.totpEnabled,
          totpSecretBase32: currentSession.totpSecretBase32 || regData.totp_secret_base32,
          totpSetupUri: currentSession.totpSetupUri || regData.totp_setup_uri,
        };
        migrateLocalUserIdIfNeeded(currentSession.userId, serverUserId, nextSession);
        setStoredToken(serverUserId, regData.token);
        setStoredAuthKey(serverUserId, authKey);
        setVaultSession(nextSession);
        persistEncryptedSessionCredentialsToCache(nextSession);
        return { token: regData.token, session: nextSession };
      }
    } catch (err) {
      console.error('Konnte Sitzung nicht mit Server verknüpfen:', err);
    }

    return { token: '', session: currentSession };
  };

  const handleUpdateVaultEmail = async (newEmail: string): Promise<boolean> => {
    const trimmed = (newEmail || '').trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@') || trimmed.length < 5) {
      alert('Bitte gib eine gültige E-Mail-Adresse ein.');
      return false;
    }

    if (!vaultSession) {
      alert('Kein aktiver Tresor geöffnet.');
      return false;
    }

    const oldEmail = vaultSession.email;
    if (oldEmail === trimmed) {
      return true;
    }

    // 1. If currently authenticated with server token, update server record
    let newToken = vaultSession.token;
    if (vaultSession.token) {
      try {
        const res = await fetch(apiUrl('/api/auth/email/update'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${vaultSession.token}`,
          },
          body: JSON.stringify({
            new_email: trimmed,
            auth_key_b64:
              vaultSession.authKeyB64 || getStoredAuthKey(vaultSession.userId) || undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            newToken = data.token;
            setStoredToken(vaultSession.userId, data.token);
          }
        } else {
          const errText = await res.text().catch(() => '');
          alert(errText || 'Die E-Mail-Adresse konnte auf dem Cloud-Server nicht aktualisiert werden.');
          return false;
        }
      } catch (e) {
        console.warn('Fehler beim Aktualisieren der E-Mail auf dem Server:', e);
        alert('Server nicht erreichbar. Die E-Mail-Adresse konnte in der Cloud nicht aktualisiert werden.');
        return false;
      }
    }

    // 2. Remove verification markers for old email
    if (oldEmail) {
      localStorage.removeItem(`gradus21_email_verified_${oldEmail}`);
    }
    localStorage.removeItem(`gradus21_email_verified_${trimmed}`);
    setIsEmailVerified(false);

    // 3. Update session state
    const updatedSession: ActiveVaultSession = {
      ...vaultSession,
      email: trimmed,
      token: newToken,
    };
    setVaultSession(updatedSession);
    setEmailForVerification(trimmed);

    // 4. Update localStorage last login email
    saveLastLoginEmail(trimmed);

    // 5. Update user-scoped cache in localStorage
    if (updatedSession.userId) {
      const userCacheKey = getUserEncryptedCacheKey(updatedSession.userId);
      const existingCacheRaw = localStorage.getItem(userCacheKey);
      if (existingCacheRaw) {
        try {
          const parsed = JSON.parse(existingCacheRaw);
          if (parsed?.session) {
            parsed.session.email = trimmed;
            parsed.session.token = newToken;
            localStorage.setItem(userCacheKey, JSON.stringify(parsed));
          }
        } catch {
          // ignore
        }
      }
      persistEncryptedSessionCredentialsToCache(updatedSession);
    }

    return true;
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

    const hasAuthKey = Boolean(
      vaultSession.authKeyB64 ||
      (vaultSession.userId && getStoredAuthKey(vaultSession.userId))
    );
    const hasToken = Boolean(
      vaultSession.token ||
      (vaultSession.userId && getStoredToken(vaultSession.userId))
    );

    // Falls weder Token noch AuthKey vorliegen (z.B. nach Face ID / biometrischem Unlock),
    // fordern wir direkt das Master-Passwort an, anstatt den Tresor zu sperren
    if (!hasToken && !hasAuthKey) {
      setIsPasswordPromptOpen(true);
      return;
    }

    const emailVerifiedKey = `gradus21_email_verified_${vaultSession.email}`;
    const isAlreadyVerified =
      isEmailVerified ||
      localStorage.getItem(emailVerifiedKey) === 'true' ||
      hasToken;

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

  const handleVerifyPasswordForCloudSync = async (
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!vaultSession) {
      return { success: false, error: 'Kein aktiver Tresor geöffnet.' };
    }

    try {
      await ensureWasmLoaded();

      let candidateSalt =
        vaultSession.kdfSaltB64 ||
        findLocalCachedVault(vaultSession.email)?.kdfSaltB64 ||
        findLocalCachedVault()?.kdfSaltB64;
      let candidateEncryptedDek =
        vaultSession.encryptedDek ||
        findLocalCachedVault(vaultSession.email)?.encryptedDek ||
        findLocalCachedVault()?.encryptedDek;
      let kdfParams =
        vaultSession.kdfParams ||
        findLocalCachedVault(vaultSession.email)?.kdfParams ||
        { memory_kib: 19456, iterations: 2, parallelism: 1 };

      // Falls Salt fehlt (z. B. nach rein biometrischem Unlock), prüfe Server-Salt für diese E-Mail:
      if (!candidateSalt && vaultSession.email) {
        try {
          const saltRes = await fetch(apiUrl('/api/auth/salt'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: vaultSession.email.trim().toLowerCase() }),
          });
          if (saltRes.ok) {
            const serverSalt = await saltRes.json();
            if (serverSalt?.kdf_salt_b64) {
              candidateSalt = serverSalt.kdf_salt_b64;
              if (serverSalt.kdf_params) {
                kdfParams = normalizeKdfParams(serverSalt.kdf_params);
              }
            }
          }
        } catch {
          // ignore network failure
        }
      }

      // Wenn candidateSalt und candidateEncryptedDek vorliegen -> normal verifizieren
      if (candidateSalt && candidateEncryptedDek) {
        let unlockedJson: string;
        try {
          unlockedJson = wasm_unlock_vault(
            password,
            candidateSalt,
            JSON.stringify(normalizeKdfParams(kdfParams)),
            candidateEncryptedDek
          );
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          if (msg.includes('Decryption failed') || msg.includes('invalid key')) {
            return { success: false, error: 'Das eingegebene Master-Passwort ist nicht korrekt.' };
          }
          return { success: false, error: `Fehler beim Entschlüsseln: ${msg}` };
        }

        const unlocked = JSON.parse(unlockedJson);
        const authKey = unlocked.auth_key_b64;
        if (!authKey) {
          return { success: false, error: 'Kryptografischer Anmeldeschlüssel konnte nicht abgeleitet werden.' };
        }

        const updatedSession: ActiveVaultSession = {
          ...vaultSession,
          authKeyB64: authKey,
          kdfSaltB64: candidateSalt,
          kdfParams: normalizeKdfParams(kdfParams),
          encryptedDek: candidateEncryptedDek,
        };

        if (updatedSession.userId) {
          setStoredAuthKey(updatedSession.userId, authKey);
        }
        setVaultSession(updatedSession);
        persistEncryptedSessionCredentialsToCache(updatedSession);

        setIsPasswordPromptOpen(false);

        setTimeout(() => {
          proceedToCloudSyncActivation('', updatedSession);
        }, 50);

        return { success: true };
      }

      // Fallback für geöffnete lokale Tresore (dekB64 im Speicher vorhanden, aber Salt/DEK-Envelope
      // im lokalen Cache verloren oder vor initialem Auto-Save):
      // Leite frischen KDF-Salt, KEK und Auth-Key aus dem Master-Passwort ab und verschlüssele den DEK neu
      if (vaultSession.dekB64) {
        try {
          const rewrapJson = wasm_rewrap_dek(vaultSession.dekB64, password);
          const rewrapped = JSON.parse(rewrapJson);

          const updatedSession: ActiveVaultSession = {
            ...vaultSession,
            authKeyB64: rewrapped.auth_key_b64,
            kdfSaltB64: rewrapped.kdf_salt_b64,
            kdfParams: normalizeKdfParams(rewrapped.kdf_params),
            encryptedDek: rewrapped.encrypted_dek,
          };

          if (updatedSession.userId) {
            setStoredAuthKey(updatedSession.userId, rewrapped.auth_key_b64);
          }
          setVaultSession(updatedSession);
          persistEncryptedSessionCredentialsToCache(updatedSession);

          setIsPasswordPromptOpen(false);

          setTimeout(() => {
            proceedToCloudSyncActivation('', updatedSession);
          }, 50);

          return { success: true };
        } catch (rewrapErr: any) {
          return {
            success: false,
            error: 'Fehler beim Ableiten des Tresorschlüssels: ' + String(rewrapErr?.message || rewrapErr),
          };
        }
      }

      return {
        success: false,
        error: 'Tresor-Metadaten (Salt/DEK) konnten nicht gefunden werden.',
      };
    } catch (err: any) {
      console.error('Fehler bei Passwort-Prüfung für Cloud-Sync:', err);
      return { success: false, error: String(err?.message || err || 'Unbekannter Fehler.') };
    }
  };

  const handleCancelPasswordPrompt = () => {
    setIsPasswordPromptOpen(false);
  };

  const proceedToCloudSyncActivation = async (
    authToken?: string,
    sessionOverride?: ActiveVaultSession
  ) => {
    let activeSession = sessionOverride || vaultSession;
    let token =
      authToken ||
      activeSession?.token ||
      (activeSession?.userId ? getStoredToken(activeSession.userId) : '');

    // Auto-login or server registration if we have authKey but no active token
    if (
      !token &&
      activeSession?.email &&
      (activeSession?.authKeyB64 ||
        (activeSession?.userId && getStoredAuthKey(activeSession.userId)))
    ) {
      token =
        (await renewTokenIfNeeded(
          activeSession.userId,
          activeSession.email,
          activeSession.authKeyB64,
          activeSession.totpSecretBase32
        )) || '';
      if (token) {
        const updatedSession = { ...activeSession, token };
        activeSession = updatedSession;
        setVaultSession((prev) => (prev ? { ...prev, token } : null));
        persistEncryptedSessionCredentialsToCache(updatedSession);
      } else {
        const linked = await linkLocalVaultWithServer(activeSession);
        if (linked.requiresEmailVerification) {
          setEmailForVerification(activeSession.email);
          setIsEmailVerificationOpen(true);
          return;
        }
        if (linked.token) {
          token = linked.token;
          activeSession = linked.session;
        }
      }
    }

    if (!token) {
      const hasAuthKey = Boolean(
        activeSession?.authKeyB64 ||
        (activeSession?.userId && getStoredAuthKey(activeSession.userId))
      );
      if (!hasAuthKey) {
        setIsPasswordPromptOpen(true);
        return;
      }
      alert(
        'Konnte keine Verbindung zum Cloud-Server herstellen. Bitte prüfe deine Internetverbindung und Server-Adresse.'
      );
      setSyncStatus('offline_local');
      return;
    }

    try {
      setSyncStatus('syncing');
      let sumRes = await fetch(apiUrl('/api/envelopes/summary'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sumRes.status === 401 && activeSession?.userId) {
        const refreshed = await renewTokenIfNeeded(
          activeSession.userId,
          activeSession.email,
          activeSession.authKeyB64,
          activeSession.totpSecretBase32
        );
        if (refreshed) {
          token = refreshed;
          const updatedSession = { ...activeSession, token: refreshed };
          activeSession = updatedSession;
          setVaultSession((prev) => (prev ? { ...prev, token: refreshed } : null));
          persistEncryptedSessionCredentialsToCache(updatedSession);
          sumRes = await fetch(apiUrl('/api/envelopes/summary'), {
            headers: { Authorization: `Bearer ${refreshed}` },
          });
        }
      }
      if (!sumRes.ok) {
        throw new Error('Summary konnte nicht abgerufen werden');
      }
      const summary = await sumRes.json();
      const remoteClassCount = summary.class_count ?? summary.class_ids?.length ?? summary.class_envelopes?.length ?? 0;
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
    let activeSession = vaultSession || undefined;

    const hasAuthKey = Boolean(
      activeSession?.authKeyB64 ||
      (activeSession?.userId && getStoredAuthKey(activeSession.userId))
    );

    if (!token && activeSession && hasAuthKey) {
      const linked = await linkLocalVaultWithServer(activeSession);
      token = linked.token;
      activeSession = linked.session;
    }

    if (token || hasAuthKey) {
      await proceedToCloudSyncActivation(token, activeSession);
    } else {
      setIsPasswordPromptOpen(true);
    }
  };

  const handleCancelReconciliation = () => {
    setIsReconciliationOpen(false);
    setReconciliationMeta(null);
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
          vaultSession.authKeyB64,
          vaultSession.totpSecretBase32
        )) || '';
      if (token) {
        const updatedSession = { ...vaultSession, token };
        setVaultSession((prev) => (prev ? { ...prev, token } : null));
        persistEncryptedSessionCredentialsToCache(updatedSession);
      }
    }
    if (!token || !vaultSession?.dekB64) {
      setIsReconciliationOpen(false);
      setReconciliationMeta(null);
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
          vaultSession.authKeyB64,
          vaultSession.totpSecretBase32
        );
        if (refreshed) {
          token = refreshed;
          const updatedSession = { ...vaultSession, token: refreshed };
          setVaultSession((prev) => (prev ? { ...prev, token: refreshed } : null));
          persistEncryptedSessionCredentialsToCache(updatedSession);
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
        const canonicalId = ensureValidUuid(env.id);
        envelopeVersionsRef.current.set(canonicalId, env.version);
        envelopeVersionsRef.current.set(env.id, env.version);
        if (env.entity_type === 'user_settings') {
          envelopeVersionsRef.current.set('00000000-0000-4000-8000-000000000002', env.version);
        }
      });

      // Decrypt remote user settings if present
      let remoteSyncedSettings: UserSyncSettings | null = null;
      for (const env of remoteEnvelopes) {
        if (env.entity_type === 'user_settings') {
          try {
            const decSettings = wasm_decrypt_envelope(
              vaultSession.dekB64,
              vaultSession.userId,
              'user_sync_settings_v1',
              env.encrypted_payload
            );
            const parsed = JSON.parse(decSettings);
            if (parsed && typeof parsed === 'object') {
              remoteSyncedSettings = parsed;
            }
          } catch (e) {
            console.warn('Remote Settings konnten nicht entschlüsselt werden:', e);
          }
        }
      }

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
        finalClasses = finalClasses.map((cls) => {
          const canonicalId = ensureValidUuid(cls.id);
          return canonicalId !== cls.id ? { ...cls, id: canonicalId } : cls;
        });
        setDatasets(finalClasses);
        setActiveClassId(finalClasses[0].id);
        lastSerializedPerClassRef.current.clear();
        for (const cls of finalClasses) {
          lastSerializedPerClassRef.current.set(cls.id, JSON.stringify(cls));
        }
      }

      // If uploading local or smart merging, immediately push all classes to remote
      if (strategy === 'upload_local' || strategy === 'merge') {
        const batchItems = finalClasses.map((cls) => {
          const classUuid = ensureValidUuid(cls.id);
          const serialized = JSON.stringify(cls);
          const encryptedPayload = wasm_encrypt_envelope(
            vaultSession.dekB64,
            vaultSession.userId,
            classUuid,
            serialized
          );
          const expectedVersion = envelopeVersionsRef.current.get(classUuid) || null;
          return {
            id: classUuid,
            entity_type: 'class_dataset',
            parent_id: null,
            class_id: classUuid,
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
            const canonicalId = ensureValidUuid(env.id);
            envelopeVersionsRef.current.set(canonicalId, env.version);
            envelopeVersionsRef.current.set(env.id, env.version);
          });
        }
      }

      // Update local storage cache immediately with reconciled envelopes so auto-save & fresh sessions match
      if (vaultSession?.userId) {
        const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
        const existingCacheRaw = localStorage.getItem(userCacheKey);
        try {
          const parsedCache = existingCacheRaw ? JSON.parse(existingCacheRaw) : {};
          const syncedEnvelopes: Record<
            string,
            { encryptedPayload: string; version: number; dirty?: boolean }
          > = {};

          for (const cls of finalClasses) {
            const canonicalId = ensureValidUuid(cls.id);
            const ver = envelopeVersionsRef.current.get(canonicalId) ?? 1;
            const remoteEnv = remoteEnvelopes.find(
              (e) => ensureValidUuid(e.id) === canonicalId
            );
            const encPayload =
              remoteEnv?.encrypted_payload ||
              wasm_encrypt_envelope(
                vaultSession.dekB64,
                vaultSession.userId,
                canonicalId,
                JSON.stringify(cls)
              );
            syncedEnvelopes[canonicalId] = {
              encryptedPayload: encPayload,
              version: ver,
              dirty: false,
            };
          }

          parsedCache.classEnvelopes = syncedEnvelopes;
          parsedCache.updatedAt = new Date().toISOString();
          localStorage.setItem(userCacheKey, JSON.stringify(parsedCache));
        } catch (cacheErr) {
          console.warn('Cache-Update nach Reconciliation fehlgeschlagen:', cacheErr);
        }
      }

      const nextSettings: UserSyncSettings = {
        ...(remoteSyncedSettings && strategy === 'download_remote'
          ? remoteSyncedSettings
          : userSettings),
        cloudSyncEnabled: true,
      };
      setUserSettings(nextSettings);
      lastSerializedSettingsRef.current = JSON.stringify(nextSettings);
      setSyncStatus('synced');
      setSyncConflictNotice(null);
      setIsReconciliationOpen(false);
      setReconciliationMeta(null);
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

  const handlePurgeCloudData = async (): Promise<{
    ok: boolean;
    user_deleted?: boolean;
    message: string;
  }> => {
    // 1. Resolve active token (from state, local storage, or silent re-auth)
    let effectiveToken =
      vaultSession?.token ||
      (vaultSession?.userId ? getStoredToken(vaultSession.userId) : '') ||
      '';

    if (!effectiveToken && vaultSession?.userId && vaultSession?.authKeyB64) {
      const renewed = await renewTokenIfNeeded(
        vaultSession.userId,
        vaultSession.email,
        vaultSession.authKeyB64,
        vaultSession.totpSecretBase32
      );
      if (renewed) {
        effectiveToken = renewed;
        setVaultSession((prev) => (prev ? { ...prev, token: renewed } : null));
        persistEncryptedSessionCredentialsToCache({ ...vaultSession, token: renewed });
      }
    }

    // If there is no token/authKey at all (pure local offline vault), simply turn off cloudSync in settings
    if (!effectiveToken) {
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
      setSyncStatus('local_only');
      return {
        ok: true,
        user_deleted: false,
        message: 'Cloud-Sync wurde deaktiviert. Alle Daten bleiben rein lokal gespeichert.',
      };
    }

    try {
      let res = await fetch(apiUrl('/api/envelopes'), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
        },
      });

      // Handle 401 token expiry by renewing token and retrying once
      if (res.status === 401 && vaultSession?.userId && vaultSession?.authKeyB64) {
        const refreshedToken = await renewTokenIfNeeded(
          vaultSession.userId,
          vaultSession.email,
          vaultSession.authKeyB64,
          vaultSession.totpSecretBase32
        );
        if (refreshedToken) {
          effectiveToken = refreshedToken;
          setVaultSession((prev) => (prev ? { ...prev, token: refreshedToken } : null));
          persistEncryptedSessionCredentialsToCache({ ...vaultSession, token: refreshedToken });
          res = await fetch(apiUrl('/api/envelopes'), {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${refreshedToken}`,
            },
          });
        }
      }

      if (res.ok || res.status === 204) {
        const body = await res.json().catch(() => null);
        envelopeVersionsRef.current.clear();
        setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
        setSyncStatus('local_only');
        setIsEmailVerified(false);

        if (body?.user_deleted) {
          // Account completely purged from server (GDPR Art. 17) — scrub server token while keeping local offline vault keys
          if (vaultSession?.email) {
            localStorage.removeItem(`gradus21_email_verified_${vaultSession.email}`);
          }
          if (vaultSession?.userId) {
            removeStoredToken(vaultSession.userId);
            removeStoredAuthKey(vaultSession.userId);
          }
          const updatedSession: ActiveVaultSession = {
            ...vaultSession,
            token: '',
            isAdmin: false,
          } as ActiveVaultSession;
          persistEncryptedSessionCredentialsToCache(updatedSession);
          setVaultSession((prev) =>
            prev
              ? {
                  ...prev,
                  token: '',
                  isAdmin: false,
                }
              : null
          );
          return {
            ok: true,
            user_deleted: true,
            message:
              'Alle Cloud-Daten und dein Benutzerkonto wurden gemäß DSGVO Art. 17 vollständig vom Server gelöscht. Dein Tresor bleibt auf diesem Gerät lokal nutzbar.',
          };
        } else {
          return {
            ok: true,
            user_deleted: false,
            message: 'Alle Server-Kopien deiner Datensätze wurden unwiderruflich gelöscht.',
          };
        }
      } else {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Serverfehler beim Löschen der Cloud-Kopien (${res.status})`);
      }
    } catch (e: any) {
      console.error('Fehler beim Löschen der Server-Daten:', e);
      throw e;
    }
  };

  const handleExportEncryptedBackup = async (): Promise<boolean> => {
    try {
      const effectiveUserId =
        vaultSession?.userId ||
        localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_ACTIVE_USER_ID_STORAGE_KEY) ||
        DEMO_OWNER_USER_ID;

      const userCacheKey = getUserEncryptedCacheKey(effectiveUserId);
      const legacyUserCacheKey = getLegacyUserEncryptedCacheKey(effectiveUserId);
      let cachedRaw =
        localStorage.getItem(userCacheKey) ||
        localStorage.getItem(legacyUserCacheKey);

      if (!cachedRaw) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith('gradus21_e2ee_user_vault_v3_') ||
              key.startsWith('bte_notenflow_e2ee_user_vault_v3_'))
          ) {
            cachedRaw = localStorage.getItem(key);
            if (cachedRaw) break;
          }
        }
      }

      let backupBundle: any = null;
      if (cachedRaw) {
        try {
          backupBundle = JSON.parse(cachedRaw);
        } catch {
          backupBundle = null;
        }
      }

      // If no bundle is found in local storage, synthesize a valid bundle from in-memory workspace
      if (!backupBundle && datasets.length > 0) {
        if (vaultSession?.dekB64 && wasmReady) {
          const classEnvelopes: Record<
            string,
            { encryptedPayload: string; version: number; dirty?: boolean }
          > = {};
          for (const ds of datasets) {
            const canonicalId = ensureValidUuid(ds.id);
            classEnvelopes[canonicalId] = {
              encryptedPayload: wasm_encrypt_envelope(
                vaultSession.dekB64,
                vaultSession.userId,
                canonicalId,
                JSON.stringify(ds)
              ),
              version: envelopeVersionsRef.current.get(canonicalId) ?? 1,
            };
          }
          const serializedSettings = JSON.stringify(userSettings);
          const encryptedSettingsEnvelope = wasm_encrypt_envelope(
            vaultSession.dekB64,
            vaultSession.userId,
            'user_sync_settings_v1',
            serializedSettings
          );
          backupBundle = {
            userId: effectiveUserId,
            session: {
              ...vaultSession,
              dekB64: '',
              token: '',
              authKeyB64: undefined,
              totpSecretBase32: undefined,
              recoveryKeyFormatted: undefined,
            },
            kdfParams: vaultSession.kdfParams
              ? normalizeKdfParams(vaultSession.kdfParams)
              : { memory_kib: 19456, iterations: 2, parallelism: 1 },
            classEnvelopes,
            encryptedSettingsEnvelope,
            isLocked: false,
            updatedAt: new Date().toISOString(),
          };
          try {
            localStorage.setItem(userCacheKey, JSON.stringify(backupBundle));
          } catch {
            // ignore
          }
        } else {
          backupBundle = {
            userId: effectiveUserId,
            session: vaultSession
              ? {
                  ...vaultSession,
                  dekB64: '',
                  token: '',
                  authKeyB64: undefined,
                  totpSecretBase32: undefined,
                  recoveryKeyFormatted: undefined,
                }
              : undefined,
            datasets,
            settings: userSettings,
            isLocked: false,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      if (!backupBundle) {
        console.warn('Kein Datensatz zum Sichern vorhanden.');
        return false;
      }

      // [HIGH-4] Never export encryptedSessionCredentials into downloadable .gradus21 backup files
      delete backupBundle.encryptedSessionCredentials;
      if (vaultSession?.kdfParams) {
        backupBundle.kdfParams = vaultSession.kdfParams;
        if (backupBundle.session) {
          backupBundle.session.kdfParams = vaultSession.kdfParams;
        }
      }

      await exportVaultToFileDownload(backupBundle);
      return true;
    } catch (e) {
      console.error('Fehler beim Exportieren des Backups:', e);
      return false;
    }
  };

  const handleImportEncryptedBackup = async (file: File) => {
    try {
      const parsed = await readVaultFromFile(file);
      if (!parsed.userId) {
        alert('Die Datei enthält keine gültige Benutzer-ID.');
        return;
      }

      // Warn before overwriting if local active student data or an existing cached vault exists
      const hasActiveStudents = datasets.some((d) => d.students?.length > 0);
      const activeUserId =
        vaultSession?.userId ||
        localStorage.getItem(ACTIVE_USER_ID_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_ACTIVE_USER_ID_STORAGE_KEY);
      const hasExistingVault =
        activeUserId &&
        Boolean(
          localStorage.getItem(getUserEncryptedCacheKey(activeUserId)) ||
            localStorage.getItem(getLegacyUserEncryptedCacheKey(activeUserId))
        );

      if (typeof window !== 'undefined' && (hasActiveStudents || hasExistingVault)) {
        const confirmed = window.confirm(
          'Achtung: Durch das Einspielen dieses Backups wird der vorhandene lokale Notenbestand auf diesem Gerät überschrieben. Möchtest du wirklich fortfahren?'
        );
        if (!confirmed) {
          return;
        }
      }

      // [HIGH-4] Strip any session credentials that might exist in an imported backup file
      delete (parsed as unknown as Record<string, unknown>).encryptedSessionCredentials;
      parsed.isLocked = true;
      const lockedSession: ActiveVaultSession = parsed.session
        ? {
            ...parsed.session,
            dekB64: '',
            token: '',
            authKeyB64: undefined,
            totpSecretBase32: undefined,
            recoveryKeyFormatted: undefined,
          }
        : {
            token: '',
            userId: parsed.userId,
            email: parsed.email || '',
            kdfSaltB64: parsed.kdfSaltB64 || '',
            kdfParams: parsed.kdfParams,
            dekB64: '',
            encryptedDek: parsed.encryptedDek || '',
            recoveryEncryptedDek: parsed.recoveryEncryptedDek || '',
            totpEnabled: false,
            serverSyncedCount: 0,
          };
      parsed.session = lockedSession;
      const targetKey = getUserEncryptedCacheKey(parsed.userId);
      localStorage.setItem(targetKey, JSON.stringify(parsed));
      localStorage.removeItem(getLegacyUserEncryptedCacheKey(parsed.userId));
      localStorage.setItem(ACTIVE_USER_ID_STORAGE_KEY, parsed.userId);

      // Pre-populate locked vaultSession from imported bundle
      setVaultSession(lockedSession);
      setUserSettings((prev) => ({ ...prev, cloudSyncEnabled: false }));
      setSyncStatus('local_only');

      // Purge credentials and lock the vault immediately before alerting user
      removeStoredDek(parsed.userId);
      removeStoredToken(parsed.userId);
      removeStoredAuthKey(parsed.userId);
      handleLockVault({ skipPersistSessionCredentials: true });

      alert(
        isTauri()
          ? 'Das Tresor-Backup wurde erfolgreich importiert! Bitte entsperre den Tresor mit deinem Master-Passwort.'
          : 'Das Tresor-Backup wurde erfolgreich in den Browser importiert! Bitte entsperre den Tresor mit deinem Master-Passwort.'
      );
    } catch (err: any) {
      alert(err.message || 'Fehler beim Einlesen der Backup-Datei.');
    }
  };

  const getSanitizedLocalVaultJson = (): string | null => {
    if (!vaultSession?.userId) return null;
    const userCacheKey = getUserEncryptedCacheKey(vaultSession.userId);
    const cachedRaw = localStorage.getItem(userCacheKey);
    if (!cachedRaw) return null;
    try {
      const parsed = JSON.parse(cachedRaw);
      delete parsed.encryptedSessionCredentials;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return cachedRaw;
    }
  };

  const handleSetCustomBackupPath = async (
    customPath: string
  ): Promise<{ ok: boolean; path?: string; error?: string }> => {
    try {
      const validatedPath = await validateAndSaveNativeBackupDirectory(customPath);
      connectedNativePathRef.current = validatedPath;
      setConnectedBackupDirName(validatedPath);

      const sanitizedRaw = getSanitizedLocalVaultJson();
      if (sanitizedRaw && vaultSession?.userId) {
        await writeVaultToNativeDirectory(validatedPath, sanitizedRaw, {
          userId: vaultSession.userId,
          forceSnapshot: true,
        });
        setLastLocalBackupTime(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
      }
      return { ok: true, path: validatedPath };
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || 'Backup-Pfad konnte nicht verknüpft werden.';
      console.warn('Benutzerdefinierter Backup-Pfad konnte nicht gesetzt werden:', err);
      return { ok: false, error: msg };
    }
  };

  const handleConnectBackupDirectory = async () => {
    if (isTauri()) {
      try {
        const chosenPath = await pickNativeBackupDirectory(connectedNativePathRef.current);
        if (chosenPath) {
          connectedNativePathRef.current = chosenPath;
          setConnectedBackupDirName(chosenPath);
          const sanitizedRaw = getSanitizedLocalVaultJson();
          if (sanitizedRaw && vaultSession?.userId) {
            await writeVaultToNativeDirectory(chosenPath, sanitizedRaw, {
              userId: vaultSession.userId,
              forceSnapshot: true,
            });
            setLastLocalBackupTime(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
          }
        }
      } catch (err: any) {
        const msg = typeof err === 'string' ? err : err?.message || String(err);
        console.warn('Nativer Backup-Ordner-Dialog fehlgeschlagen:', msg);
        alert(msg);
      }
      return;
    }

    try {
      const handle = await pickBackupDirectory();
      if (handle) {
        connectedDirHandleRef.current = handle;
        setConnectedBackupDirName(handle.name);
        // Sofort ein aktuelles Backup schreiben (ohne encryptedSessionCredentials)
        const sanitizedRaw = getSanitizedLocalVaultJson();
        if (sanitizedRaw && vaultSession?.userId) {
          await writeVaultToDirectory(handle, sanitizedRaw, {
            userId: vaultSession.userId,
            forceSnapshot: true,
          });
          setLastLocalBackupTime(
            new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          );
        }
      }
    } catch (err: any) {
      console.warn('Backup-Ordner konnte nicht verknüpft werden:', err);
    }
  };

  const handleDisconnectBackupDirectory = async () => {
    clearNativeBackupPath();
    connectedNativePathRef.current = null;
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
      envelopeVersionsRef.current.clear();
      lastSerializedPerClassRef.current.clear();
      lastSerializedSettingsRef.current = '';
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
              delete p.classEnvelopes;
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
    handleSetCustomBackupPath,
    handleDisconnectBackupDirectory,
    isEmailVerificationOpen,
    emailForVerification,
    handleEmailVerificationSuccess,
    handleEmailVerificationCancel,
    handleUpdateVaultEmail,
    isPasswordPromptOpen,
    handleVerifyPasswordForCloudSync,
    handleCancelPasswordPrompt,
    isReconciliationOpen,
    reconciliationMeta,
    openReconciliationModal,
    handleResolveReconciliation: executeReconciliation,
    handleCancelReconciliation,
  };
}
