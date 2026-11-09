declare const __APP_COMMIT_SHA__: string | undefined;
declare const __APP_GIT_BRANCH__: string | undefined;

export const APP_VERSION = '26.11.2';
export const APP_COMMIT_SHA: string =
  typeof __APP_COMMIT_SHA__ !== 'undefined' && __APP_COMMIT_SHA__ ? __APP_COMMIT_SHA__ : 'unknown';
export const APP_GIT_BRANCH: string =
  typeof __APP_GIT_BRANCH__ !== 'undefined' && __APP_GIT_BRANCH__ ? __APP_GIT_BRANCH__ : 'unknown';

export function isDevEnvironment(): boolean {
  if (APP_GIT_BRANCH === 'dev') return true;
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase();
    if (
      host.startsWith('dev.') ||
      host.includes('.dev.') ||
      host.includes('-dev.') ||
      host.endsWith('.dev') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    ) {
      return true;
    }
  }
  return Boolean(import.meta.env?.DEV);
}

