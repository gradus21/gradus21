/**
 * Screenshot-/Demo-Modus für Store-Screenshots (scripts/generate-screenshots.sh).
 *
 * Wird AUSSCHLIESSLICH über den expliziten Query-Parameter `?demo=1` aktiviert.
 * Navigations-Hashes wie `#matrix`, `#speed` oder `#student` dürfen den Modus
 * nicht auslösen, sonst würde ein Lesezeichen Demo-Daten in den echten
 * Workspace mischen (siehe Issue #37).
 *
 * Im Screenshot-Modus wird ein isolierter In-Memory-Demo-Workspace ohne
 * Vault-Session geladen, d. h. es wird nichts persistiert oder synchronisiert.
 */
export const isScreenshotModeUrl = (search: string): boolean => {
  try {
    return new URLSearchParams(search).get('demo') === '1';
  } catch {
    return false;
  }
};

export const isScreenshotMode = (): boolean =>
  typeof window !== 'undefined' && isScreenshotModeUrl(window.location.search);
