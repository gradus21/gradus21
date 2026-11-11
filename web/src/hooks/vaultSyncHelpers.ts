import { wasm_decrypt_envelope, wasm_encrypt_envelope } from '../wasm-pkg/gradus21_core';
import { ActiveVaultSession, normalizeKdfParams } from '../components/vault/vaultTypes';
import { apiUrl, fetchWithTimeout } from '../utils/apiConfig';
import { generateTotpCode } from '../utils/totp';
import {
  AssessmentConfig,
  CategoryConfig,
  ClassroomSubjectDataset,
  GradeEntry,
  StudentProfile,
  ensureValidUuid,
} from '../data/demoClasses';

export const DEMO_OWNER_USER_ID = '7f9c2a10-58e4-4c9b-9b1a-123456789abc';
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
  } else {
    removeStoredAuthKey(userId);
  }
}

export function removeStoredAuthKey(userId: string): void {
  sessionStorage.removeItem(`gradus21_authkey_${userId}`);
  sessionStorage.removeItem(`bte_notenflow_authkey_${userId}`);
}

const SESSION_CREDS_AAD = 'session_credentials_v1';

export function encryptSessionCredentials(
  dekB64: string,
  userId: string,
  creds: { token?: string; authKeyB64?: string; totpSecretBase32?: string }
): string | undefined {
  if (!dekB64 || !userId || (!creds.token && !creds.authKeyB64 && !creds.totpSecretBase32)) {
    return undefined;
  }
  try {
    return wasm_encrypt_envelope(
      dekB64,
      userId,
      SESSION_CREDS_AAD,
      JSON.stringify({
        token: creds.token || '',
        authKeyB64: creds.authKeyB64 || undefined,
        totpSecretBase32: creds.totpSecretBase32 || undefined,
      })
    );
  } catch {
    return undefined;
  }
}

export function restoreSessionCredentials(session: ActiveVaultSession): ActiveVaultSession {
  if (!session.dekB64 || !session.userId) return session;
  let token = session.token || getStoredToken(session.userId) || '';
  let authKeyB64 = session.authKeyB64 || getStoredAuthKey(session.userId) || undefined;
  let totpSecretBase32 = session.totpSecretBase32 || undefined;

  if (!token || !authKeyB64 || !totpSecretBase32) {
    try {
      const userCacheKey = getUserEncryptedCacheKey(session.userId);
      const legacyUserCacheKey = getLegacyUserEncryptedCacheKey(session.userId);
      const cachedRaw =
        localStorage.getItem(userCacheKey) || localStorage.getItem(legacyUserCacheKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed?.encryptedSessionCredentials) {
          const decJson = wasm_decrypt_envelope(
            session.dekB64,
            session.userId,
            SESSION_CREDS_AAD,
            parsed.encryptedSessionCredentials
          );
          const dec = JSON.parse(decJson);
          if (!token && dec?.token) token = dec.token;
          if (!authKeyB64 && dec?.authKeyB64) authKeyB64 = dec.authKeyB64;
          if (!totpSecretBase32 && dec?.totpSecretBase32) {
            totpSecretBase32 = dec.totpSecretBase32;
          }
        }
      }
    } catch {
      // ignore if WASM not initialized or envelope absent
    }
  }

  if (token) setStoredToken(session.userId, token);
  if (authKeyB64) setStoredAuthKey(session.userId, authKeyB64);

  return {
    ...session,
    token,
    authKeyB64,
    totpSecretBase32,
  };
}

export function persistEncryptedSessionCredentialsToCache(session: ActiveVaultSession): void {
  if (!session.userId) return;
  const encCreds = session.dekB64
    ? encryptSessionCredentials(session.dekB64, session.userId, {
        token: session.token || getStoredToken(session.userId),
        authKeyB64: session.authKeyB64 || getStoredAuthKey(session.userId),
        totpSecretBase32: session.totpSecretBase32,
      })
    : undefined;
  try {
    const userCacheKey = getUserEncryptedCacheKey(session.userId);
    const cachedRaw = localStorage.getItem(userCacheKey);
    const parsed = cachedRaw ? JSON.parse(cachedRaw) : { userId: session.userId };
    if (encCreds) {
      parsed.encryptedSessionCredentials = encCreds;
    }
    const prevSession = parsed.session || {};
    parsed.session = {
      ...prevSession,
      ...session,
      kdfSaltB64: session.kdfSaltB64 || prevSession.kdfSaltB64 || '',
      encryptedDek: session.encryptedDek || prevSession.encryptedDek || '',
      recoveryEncryptedDek: session.recoveryEncryptedDek || prevSession.recoveryEncryptedDek || '',
      dekB64: '',
      token: '',
      authKeyB64: undefined,
      totpSecretBase32: undefined,
      recoveryKeyFormatted: undefined,
    };
    if (session.kdfParams) {
      parsed.kdfParams = normalizeKdfParams(session.kdfParams);
    }
    localStorage.setItem(userCacheKey, JSON.stringify(parsed));
  } catch {
    // ignore storage errors
  }
}

export async function renewTokenIfNeeded(
  userId: string,
  email?: string,
  authKey?: string,
  totpSecretBase32?: string
): Promise<string | null> {
  const effectiveAuthKey = authKey || getStoredAuthKey(userId);
  if (!email || !effectiveAuthKey) return null;
  try {
    const totpCode = totpSecretBase32
      ? await generateTotpCode(totpSecretBase32).catch(() => null)
      : null;
    const res = await fetchWithTimeout(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        auth_key_b64: effectiveAuthKey,
        totp_code: totpCode,
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

/**
 * Strips any legacy conflict suffixes such as "(Cloud-Kopie vor Merge)", "(Cloud-Kopie)", "(Kopie)".
 */
export function cleanConflictSuffix(name: string): string {
  if (!name) return '';
  return name
    .replace(/\s*\((?:Cloud-)?Kopie(?:\s*vor\s*Merge)?\)/gi, '')
    .trim();
}

/**
 * Returns a normalized semantic key for a classroom dataset based on its class name and subject.
 */
export function getClassSemanticKey(ds: { className: string; subjectName?: string }): string {
  const cleanName = cleanConflictSuffix(ds.className || '').toLowerCase();
  const cleanSubject = (ds.subjectName || '').trim().toLowerCase();
  return `${cleanName}::${cleanSubject}`;
}

/**
 * Determines whether a dataset is a starter/placeholder class that should be pruned
 * if real user classes exist.
 */
export function isStarterOrPlaceholderClass(
  ds: ClassroomSubjectDataset,
  userId?: string
): boolean {
  if (ds.id === 'demo-class-initial') return true;
  if (ds.id.startsWith('class_starter_')) return true;
  if (userId && ds.id === ensureValidUuid(`class_starter_${userId}`)) return true;
  if (
    (ds.className === 'Meine erste Klasse' || ds.className === 'Neue Klasse') &&
    ds.students.length === 0 &&
    ds.grades.length === 0
  ) {
    return true;
  }
  if (
    ds.description === 'Eigener verschlüsselter Arbeitsbereich' &&
    ds.students.length === 0 &&
    ds.grades.length === 0
  ) {
    return true;
  }
  return false;
}

function getStudentNormalizedName(s: Partial<StudentProfile> & { firstName?: string; lastName?: string }): string {
  if (s.name && typeof s.name === 'string') return s.name.trim().toLowerCase();
  const full = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
  return full;
}

export function mergeClassroomDatasets(
  localDs: ClassroomSubjectDataset,
  serverDs: ClassroomSubjectDataset
): {
  mergedDs: ClassroomSubjectDataset;
  hadGradeCollisions: boolean;
  conflictCopy?: ClassroomSubjectDataset;
} {
  const serverStudents = Array.isArray(serverDs.students) ? serverDs.students : [];
  const localStudents = Array.isArray(localDs.students) ? localDs.students : [];
  const serverCategories = Array.isArray(serverDs.categories) ? serverDs.categories : [];
  const localCategories = Array.isArray(localDs.categories) ? localDs.categories : [];
  const serverAssessments = Array.isArray(serverDs.assessments) ? serverDs.assessments : [];
  const localAssessments = Array.isArray(localDs.assessments) ? localDs.assessments : [];
  const serverGrades = Array.isArray(serverDs.grades) ? serverDs.grades : [];
  const localGrades = Array.isArray(localDs.grades) ? localDs.grades : [];

  // 1. Students: Match by ID first, then by normalized name (prevent duplicates like "Max" and "Max")
  const serverStudentsById = new Map<string, StudentProfile>();
  const serverStudentsByName = new Map<string, StudentProfile>();
  for (const s of serverStudents) {
    serverStudentsById.set(s.id, s);
    const norm = getStudentNormalizedName(s);
    if (norm && !serverStudentsByName.has(norm)) {
      serverStudentsByName.set(norm, s);
    }
  }

  const localToCanonicalStudentId = new Map<string, string>();
  const mergedStudents: StudentProfile[] = [];
  const seenStudentIds = new Set<string>();

  for (const sStudent of serverStudents) {
    const norm = getStudentNormalizedName(sStudent);
    const lStudent = localStudents.find(
      (l) => l.id === sStudent.id || (norm && getStudentNormalizedName(l) === norm)
    );
    if (lStudent) {
      localToCanonicalStudentId.set(lStudent.id, sStudent.id);
      mergedStudents.push({ ...sStudent, ...lStudent, id: sStudent.id });
    } else {
      mergedStudents.push(sStudent);
    }
    seenStudentIds.add(sStudent.id);
  }

  for (const lStudent of localStudents) {
    const canonicalId = localToCanonicalStudentId.get(lStudent.id) || lStudent.id;
    if (!seenStudentIds.has(canonicalId)) {
      mergedStudents.push({ ...lStudent, id: canonicalId });
      seenStudentIds.add(canonicalId);
      localToCanonicalStudentId.set(lStudent.id, canonicalId);
    }
  }

  // 2. Categories: Match by ID first, then by normalized name
  const serverCatByName = new Map<string, CategoryConfig>();
  for (const c of serverCategories) {
    const norm = (c.name || '').trim().toLowerCase();
    if (norm && !serverCatByName.has(norm)) {
      serverCatByName.set(norm, c);
    }
  }

  const localToCanonicalCatId = new Map<string, string>();
  const mergedCategories: CategoryConfig[] = [];
  const seenCatIds = new Set<string>();

  for (const sCat of serverCategories) {
    const norm = (sCat.name || '').trim().toLowerCase();
    const lCat = localCategories.find(
      (l) => l.id === sCat.id || (norm && (l.name || '').trim().toLowerCase() === norm)
    );
    if (lCat) {
      localToCanonicalCatId.set(lCat.id, sCat.id);
      mergedCategories.push({ ...sCat, ...lCat, id: sCat.id });
    } else {
      mergedCategories.push(sCat);
    }
    seenCatIds.add(sCat.id);
  }

  for (const lCat of localCategories) {
    const canonicalId = localToCanonicalCatId.get(lCat.id) || lCat.id;
    if (!seenCatIds.has(canonicalId)) {
      mergedCategories.push({ ...lCat, id: canonicalId });
      seenCatIds.add(canonicalId);
      localToCanonicalCatId.set(lCat.id, canonicalId);
    }
  }

  // 3. Assessments: Match by ID first, then by (title + term_id)
  const serverAssByTitleTerm = new Map<string, AssessmentConfig>();
  for (const a of serverAssessments) {
    const key = `${(a.title || '').trim().toLowerCase()}::${a.term_id || ''}`;
    if (!serverAssByTitleTerm.has(key)) {
      serverAssByTitleTerm.set(key, a);
    }
  }

  const localToCanonicalAssId = new Map<string, string>();
  const mergedAssessments: AssessmentConfig[] = [];
  const seenAssIds = new Set<string>();

  for (const sAss of serverAssessments) {
    const key = `${(sAss.title || '').trim().toLowerCase()}::${sAss.term_id || ''}`;
    const lAss = localAssessments.find(
      (l) => l.id === sAss.id || `${(l.title || '').trim().toLowerCase()}::${l.term_id || ''}` === key
    );
    if (lAss) {
      localToCanonicalAssId.set(lAss.id, sAss.id);
      const catId = localToCanonicalCatId.get(lAss.category_id) || lAss.category_id || sAss.category_id;
      mergedAssessments.push({ ...sAss, ...lAss, id: sAss.id, category_id: catId });
    } else {
      mergedAssessments.push(sAss);
    }
    seenAssIds.add(sAss.id);
  }

  for (const lAss of localAssessments) {
    const canonicalId = localToCanonicalAssId.get(lAss.id) || lAss.id;
    if (!seenAssIds.has(canonicalId)) {
      const catId = localToCanonicalCatId.get(lAss.category_id) || lAss.category_id;
      mergedAssessments.push({ ...lAss, id: canonicalId, category_id: catId });
      seenAssIds.add(canonicalId);
      localToCanonicalAssId.set(lAss.id, canonicalId);
    }
  }

  // 4. Grades: Remap local grade student_id & assessment_id to canonical IDs
  const serverGradesMap = new Map<string, GradeEntry>();
  for (const g of serverGrades) {
    serverGradesMap.set(`${g.student_id}:${g.assessment_id}`, g);
  }

  const localGradesMap = new Map<string, GradeEntry>();
  for (const g of localGrades) {
    const canonicalStudentId = localToCanonicalStudentId.get(g.student_id) || g.student_id;
    const canonicalAssId = localToCanonicalAssId.get(g.assessment_id) || g.assessment_id;
    const remappedGrade: GradeEntry = {
      ...g,
      student_id: canonicalStudentId,
      assessment_id: canonicalAssId,
    };
    localGradesMap.set(`${canonicalStudentId}:${canonicalAssId}`, remappedGrade);
  }

  const mergedGradesMap = new Map<string, GradeEntry>();
  let hadGradeCollisions = false;

  // Initialize with server grades
  for (const [key, sGrade] of serverGradesMap.entries()) {
    mergedGradesMap.set(key, sGrade);
  }

  // Reconcile with local grades
  for (const [key, lGrade] of localGradesMap.entries()) {
    const sGrade = serverGradesMap.get(key);
    if (!sGrade) {
      // Grade only exists locally -> adopt local
      mergedGradesMap.set(key, lGrade);
    } else {
      if (areGradesEqual(lGrade, sGrade)) {
        continue;
      }
      if (isGradeEmpty(sGrade) && !isGradeEmpty(lGrade)) {
        // Server was empty, local has a grade -> local wins
        mergedGradesMap.set(key, lGrade);
      } else if (!isGradeEmpty(sGrade) && isGradeEmpty(lGrade)) {
        // Local was empty, server has a grade -> server wins
        mergedGradesMap.set(key, sGrade);
      } else {
        // True collision: Both sides have different non-empty grades.
        // ECHTES LAST-WRITE-WINS (LWW): Der zeitlich neuere Eintrag gewinnt!
        const lTime = lGrade.updated_at ? new Date(lGrade.updated_at).getTime() : 0;
        const sTime = sGrade.updated_at ? new Date(sGrade.updated_at).getTime() : 0;

        if (lTime > 0 && sTime > 0 && lTime !== sTime) {
          if (lTime >= sTime) {
            mergedGradesMap.set(key, lGrade);
          } else {
            mergedGradesMap.set(key, sGrade);
          }
        } else {
          // Fall back to dataset timestamps if grade timestamps are missing or equal
          const lDsTime = localDs.updated_at ? new Date(localDs.updated_at).getTime() : 0;
          const sDsTime = serverDs.updated_at ? new Date(serverDs.updated_at).getTime() : 0;
          if (lDsTime >= sDsTime) {
            mergedGradesMap.set(key, lGrade);
          } else {
            mergedGradesMap.set(key, sGrade);
          }
        }
        hadGradeCollisions = true;
      }
    }
  }

  const mergedOverrides = {
    ...(serverDs.reportCardOverrides || {}),
    ...(localDs.reportCardOverrides || {}),
  };

  const cleanedClassName = cleanConflictSuffix(localDs.className || serverDs.className);

  const mergedDs: ClassroomSubjectDataset = {
    ...serverDs,
    ...localDs, // Local class metadata & grading config wins for active work
    id: serverDs.id || localDs.id, // Prefer server UUID to avoid creating duplicate envelopes
    className: cleanedClassName,
    students: mergedStudents,
    categories: mergedCategories,
    assessments: mergedAssessments,
    grades: Array.from(mergedGradesMap.values()),
    reportCardOverrides: mergedOverrides,
  };

  // NEVER generate a conflictCopy - eliminate duplicate classes!
  return { mergedDs, hadGradeCollisions, conflictCopy: undefined };
}

export interface NameCollision {
  className: string;
  subjectName: string;
  localId: string;
  remoteId: string;
  localStudentCount: number;
  remoteStudentCount: number;
}

/**
 * Detects classes that share the same class name & subject but have different UUIDs.
 * Used to proactively ask the user whether to merge them or keep them separate.
 */
export function detectClassNameCollisions(
  localClasses: ClassroomSubjectDataset[],
  remoteClasses: ClassroomSubjectDataset[],
  userId?: string
): NameCollision[] {
  const collisions: NameCollision[] = [];
  const remoteById = new Map(remoteClasses.map((c) => [c.id, c]));

  const realLocal = localClasses.filter((c) => !isStarterOrPlaceholderClass(c, userId));
  const realRemote = remoteClasses.filter((c) => !isStarterOrPlaceholderClass(c, userId));

  for (const lCls of realLocal) {
    if (remoteById.has(lCls.id)) {
      continue; // Same ID -> normal merge, not a collision
    }
    const lKey = getClassSemanticKey(lCls);
    const matchedRemote = realRemote.find(
      (r) => r.id !== lCls.id && getClassSemanticKey(r) === lKey
    );
    if (matchedRemote) {
      collisions.push({
        className: cleanConflictSuffix(lCls.className),
        subjectName: lCls.subjectName || '',
        localId: lCls.id,
        remoteId: matchedRemote.id,
        localStudentCount: (lCls.students || []).length,
        remoteStudentCount: (matchedRemote.students || []).length,
      });
    }
  }
  return collisions;
}

/**
 * Reconciles local and remote workspaces strictly by UUID:
 * 1. Prunes empty starter placeholders when real classes exist.
 * 2. Matches classes strictly by their unique ID (`id`).
 * 3. Never merges same-name classes with different IDs automatically; only merges them
 *    if the user explicitly confirmed 'merge' in `collisionDecisions`.
 * 4. Merges grades on cell-level via authentic Last-Write-Wins (LWW).
 */
export function reconcileWorkspaceDatasets(
  localClasses: ClassroomSubjectDataset[],
  remoteClasses: ClassroomSubjectDataset[],
  userId?: string,
  collisionDecisions?: Record<string, 'merge' | 'keep_separate'>
): {
  reconciledClasses: ClassroomSubjectDataset[];
  obsoleteServerIds: string[];
  hadCollisions: boolean;
} {
  const obsoleteServerIds = new Set<string>();
  let hadCollisions = false;

  // Check if either side has real (non-placeholder) classes
  const hasRealLocal = localClasses.some((c) => !isStarterOrPlaceholderClass(c, userId));
  const hasRealRemote = remoteClasses.some((c) => !isStarterOrPlaceholderClass(c, userId));
  const hasRealClasses = hasRealLocal || hasRealRemote;

  // Filter out starter placeholders if real classes exist
  const effectiveLocal = hasRealClasses
    ? localClasses.filter((c) => !isStarterOrPlaceholderClass(c, userId))
    : [...localClasses];

  const effectiveRemote: ClassroomSubjectDataset[] = [];
  for (const r of remoteClasses) {
    if (hasRealClasses && isStarterOrPlaceholderClass(r, userId)) {
      obsoleteServerIds.add(r.id);
    } else {
      effectiveRemote.push(r);
    }
  }

  // Remote classes mapped strictly by ID
  const remoteById = new Map<string, ClassroomSubjectDataset>();
  for (const r of effectiveRemote) {
    remoteById.set(r.id, r);
  }

  const finalMap = new Map<string, ClassroomSubjectDataset>();

  // Process local classes: match STRICTLY by ID unless the user explicitly chose to merge a name collision
  for (const localCls of effectiveLocal) {
    const remoteCls = remoteById.get(localCls.id);

    if (remoteCls) {
      // 1. Same ID -> merge datasets with true Last-Write-Wins
      const { mergedDs, hadGradeCollisions } = mergeClassroomDatasets(localCls, remoteCls);
      if (hadGradeCollisions) hadCollisions = true;

      const canonicalId = ensureValidUuid(remoteCls.id);
      finalMap.set(canonicalId, { ...mergedDs, id: canonicalId });
      remoteById.delete(remoteCls.id);
    } else {
      // 2. Different ID: check if user explicitly confirmed to merge this specific class
      const userWantsMerge = collisionDecisions?.[localCls.id] === 'merge';

      let mergedRemotely = false;
      if (userWantsMerge) {
        const localKey = getClassSemanticKey(localCls);
        for (const [rId, rCls] of remoteById.entries()) {
          if (getClassSemanticKey(rCls) === localKey) {
            const { mergedDs, hadGradeCollisions } = mergeClassroomDatasets(localCls, rCls);
            if (hadGradeCollisions) hadCollisions = true;

            const canonicalId = ensureValidUuid(rCls.id);
            finalMap.set(canonicalId, { ...mergedDs, id: canonicalId });
            remoteById.delete(rId);
            mergedRemotely = true;
            break;
          }
        }
      }

      if (!mergedRemotely) {
        // Keep as separate class!
        const cleaned = {
          ...localCls,
          id: ensureValidUuid(localCls.id),
          className: cleanConflictSuffix(localCls.className),
        };
        finalMap.set(cleaned.id, cleaned);
      }
    }
  }

  // Add remaining remote classes that were not matched by ID
  for (const [, remainingRemote] of remoteById.entries()) {
    const cleaned = {
      ...remainingRemote,
      id: ensureValidUuid(remainingRemote.id),
      className: cleanConflictSuffix(remainingRemote.className),
    };
    finalMap.set(cleaned.id, cleaned);
  }

  let reconciledClasses = Array.from(finalMap.values());
  if (reconciledClasses.length === 0) {
    if (localClasses.length > 0) {
      reconciledClasses = localClasses.map((c) => ({
        ...c,
        id: ensureValidUuid(c.id),
        className: cleanConflictSuffix(c.className),
      }));
    } else if (remoteClasses.length > 0) {
      reconciledClasses = remoteClasses.map((c) => ({
        ...c,
        id: ensureValidUuid(c.id),
        className: cleanConflictSuffix(c.className),
      }));
    }
  }

  return {
    reconciledClasses,
    obsoleteServerIds: Array.from(obsoleteServerIds),
    hadCollisions,
  };
}
