import { wasm_decrypt_envelope, wasm_encrypt_envelope } from '../wasm-pkg/gradus21_core';
import { ActiveVaultSession, normalizeKdfParams } from '../components/vault/vaultTypes';
import { apiUrl, fetchWithTimeout } from '../utils/apiConfig';
import { generateTotpCode } from '../utils/totp';
import {
  ClassroomSubjectDataset,
  GradeEntry,
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

export function mergeClassroomDatasets(
  localDs: ClassroomSubjectDataset,
  serverDs: ClassroomSubjectDataset
): {
  mergedDs: ClassroomSubjectDataset;
  hadGradeCollisions: boolean;
  conflictCopy?: ClassroomSubjectDataset;
} {
  // 1. Students: Merge existing by ID (local edits win over server fields) and include additions from both sides
  const localStudentsMap = new Map(localDs.students.map((s) => [s.id, s]));
  const mergedStudents: StudentProfile[] = [];
  const seenStudentIds = new Set<string>();

  for (const sStudent of serverDs.students) {
    const lStudent = localStudentsMap.get(sStudent.id);
    if (lStudent) {
      // Local changes override server fields
      mergedStudents.push({ ...sStudent, ...lStudent });
    } else {
      mergedStudents.push(sStudent);
    }
    seenStudentIds.add(sStudent.id);
  }
  for (const lStudent of localDs.students) {
    if (!seenStudentIds.has(lStudent.id)) {
      mergedStudents.push(lStudent);
      seenStudentIds.add(lStudent.id);
    }
  }

  // 2. Categories: Merge existing by ID (local edits win) and include additions from both sides
  const localCatMap = new Map(localDs.categories.map((c) => [c.id, c]));
  const mergedCategories: CategoryConfig[] = [];
  const seenCatIds = new Set<string>();

  for (const sCat of serverDs.categories) {
    const lCat = localCatMap.get(sCat.id);
    if (lCat) {
      mergedCategories.push({ ...sCat, ...lCat });
    } else {
      mergedCategories.push(sCat);
    }
    seenCatIds.add(sCat.id);
  }
  for (const lCat of localDs.categories) {
    if (!seenCatIds.has(lCat.id)) {
      mergedCategories.push(lCat);
      seenCatIds.add(lCat.id);
    }
  }

  // 3. Assessments: Merge existing by ID (local edits win) and include additions from both sides
  const localAssMap = new Map(localDs.assessments.map((a) => [a.id, a]));
  const mergedAssessments: AssessmentConfig[] = [];
  const seenAssIds = new Set<string>();

  for (const sAss of serverDs.assessments) {
    const lAss = localAssMap.get(sAss.id);
    if (lAss) {
      mergedAssessments.push({ ...sAss, ...lAss });
    } else {
      mergedAssessments.push(sAss);
    }
    seenAssIds.add(sAss.id);
  }
  for (const lAss of localDs.assessments) {
    if (!seenAssIds.has(lAss.id)) {
      mergedAssessments.push(lAss);
      seenAssIds.add(lAss.id);
    }
  }

  // 4. Grades: Local grades take precedence in active dataset; server snapshot preserved on conflict
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
        // Active device represents current user edits -> local wins in active dataset
        mergedGradesMap.set(key, lGrade);
        hadGradeCollisions = true;
      }
    }
  }

  const mergedOverrides = {
    ...(serverDs.reportCardOverrides || {}),
    ...(localDs.reportCardOverrides || {}),
  };

  const mergedDs: ClassroomSubjectDataset = {
    ...serverDs,
    ...localDs, // Local class metadata & grading config wins for active work
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
      ...serverDs,
      id: newId,
      className: `${serverDs.className} (Cloud-Kopie vor Merge)`,
      shortName: `${serverDs.shortName || ''} (Cloud)`.trim(),
    };
  }

  return { mergedDs, hadGradeCollisions, conflictCopy };
}
