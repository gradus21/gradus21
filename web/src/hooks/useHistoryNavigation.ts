import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceMode } from '../types/workspace';

/**
 * History-/Zurück-Navigation (Issue #38).
 *
 * 1. Der Arbeitsmodus wird als Hash (`#/matrix`, `#/speed`, …) in der URL geführt.
 *    Jeder Moduswechsel erzeugt einen History-Eintrag, sodass Browser-Zurück/Vor
 *    und Deep-Links funktionieren.
 * 2. Geöffnete Overlays registrieren sich per `useBackDismiss`. Solange mindestens
 *    ein Overlay offen ist, liegt genau EIN Sentinel-Eintrag auf dem History-Stack.
 *    „Zurück" schließt dann das oberste Overlay statt die Seite/App zu verlassen.
 *
 * Android: Tauri/Wry (`WryActivity.handleBackNavigation`) ruft bei der Zurück-Taste
 * `webView.goBack()` auf, solange Webview-History existiert, und beendet die App erst
 * danach. Diese Web-History deckt Browser, PWA und Android damit gemeinsam ab.
 */

const MODE_TO_SLUG: Record<WorkspaceMode, string> = {
  matrix: 'matrix',
  speed_grading: 'speed',
  student_360: 'student',
  configurator: 'config',
};

export const workspaceModeToHash = (mode: WorkspaceMode): string => `#/${MODE_TO_SLUG[mode]}`;

/** Akzeptiert neue (`#/speed`) und alte (`#speed`, `#student360`) Hash-Formate. */
export const resolveModeFromHash = (hash: string): WorkspaceMode => {
  const h = hash.replace(/^#\/?/, '').toLowerCase();
  if (h.includes('speed')) return 'speed_grading';
  if (h.includes('student') || h.includes('360')) return 'student_360';
  if (h.includes('config')) return 'configurator';
  return 'matrix';
};

const currentHash = () => (typeof window === 'undefined' ? '' : window.location.hash);

const buildUrl = (hash: string) =>
  `${window.location.pathname}${window.location.search}${hash}`;

/** Modus-State, synchronisiert mit URL-Hash und Browser-History. */
export const useHistoryMode = (): [WorkspaceMode, (mode: WorkspaceMode) => void] => {
  const [mode, setModeState] = useState<WorkspaceMode>(() => resolveModeFromHash(currentHash()));
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    ensureListener();
    const sync = () => setModeState(resolveModeFromHash(currentHash()));
    locationListeners.add(sync);
    // Manuell eingetippte Hashes (ohne popstate in manchen Webviews)
    window.addEventListener('hashchange', sync);
    return () => {
      locationListeners.delete(sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const setMode = useCallback((next: WorkspaceMode) => {
    if (next === modeRef.current) return;
    const hash = workspaceModeToHash(next);
    if (currentHash() !== hash) {
      if (sentinelActive) {
        // Overlay offen (z. B. interaktive Tour): Sentinel-Eintrag ersetzen statt stapeln,
        // damit „Zurück" bzw. Schließen genau einen Eintrag entfernt.
        window.history.replaceState(window.history.state, '', buildUrl(hash));
      } else {
        window.history.pushState(null, '', buildUrl(hash));
      }
    }
    modeRef.current = next;
    setModeState(next);
  }, []);

  return [mode, setMode];
};

// ---------------------------------------------------------------------------
// Overlay-Stack für „Zurück schließt Dialog"
// ---------------------------------------------------------------------------

type OverlayEntry = { id: number; close: () => void };

const overlayStack: OverlayEntry[] = [];
let sentinelActive = false;
let ignoredPops = 0;
let reconcileScheduled = false;
let listenerInstalled = false;
let nextOverlayId = 1;
let restoreUrlAfterPop: string | null = null;
const locationListeners = new Set<() => void>();

const notifyLocationListeners = () => locationListeners.forEach((fn) => fn());

const SENTINEL_STATE_KEY = '__gradus21Overlay';

const reconcile = () => {
  reconcileScheduled = false;
  const wantSentinel = overlayStack.length > 0;
  if (wantSentinel && !sentinelActive) {
    window.history.pushState({ [SENTINEL_STATE_KEY]: true }, '', window.location.href);
    sentinelActive = true;
  } else if (!wantSentinel && sentinelActive) {
    // Overlay wurde per UI geschlossen → Sentinel-Eintrag wieder entfernen
    // Die aktuelle URL (ggf. inzwischen anderer Modus-Hash) nach dem Zurückspringen wiederherstellen
    sentinelActive = false;
    ignoredPops += 1;
    restoreUrlAfterPop = window.location.href;
    window.history.back();
  }
};

// Per Microtask gebündelt: React StrictMode mountet Effekte doppelt (mount → unmount → mount).
// So entsteht dabei kein Push/Back-Flackern auf dem History-Stack.
const scheduleReconcile = () => {
  if (reconcileScheduled) return;
  reconcileScheduled = true;
  queueMicrotask(reconcile);
};

const handlePopState = () => {
  if (ignoredPops > 0) {
    ignoredPops -= 1;
    if (restoreUrlAfterPop && restoreUrlAfterPop !== window.location.href) {
      window.history.replaceState(window.history.state, '', restoreUrlAfterPop);
    }
    restoreUrlAfterPop = null;
    notifyLocationListeners();
    return;
  }
  if (!sentinelActive) {
    notifyLocationListeners();
    return;
  }
  // Der Nutzer hat „Zurück" gedrückt, während ein Overlay offen war
  sentinelActive = false;
  const top = overlayStack[overlayStack.length - 1];
  top?.close();
  notifyLocationListeners();
  // Bleiben weitere Overlays offen, legt reconcile() einen neuen Sentinel an
  scheduleReconcile();
};

const ensureListener = () => {
  if (listenerInstalled || typeof window === 'undefined') return;
  window.addEventListener('popstate', handlePopState);
  listenerInstalled = true;
};

/**
 * Registriert ein offenes Overlay, damit Browser-/Android-„Zurück" es schließt.
 * `onClose` muss das Overlay schließen (isOpen → false).
 */
export const useBackDismiss = (isOpen: boolean, onClose: () => void): void => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    ensureListener();
    const entry: OverlayEntry = { id: nextOverlayId++, close: () => onCloseRef.current() };
    overlayStack.push(entry);
    scheduleReconcile();
    return () => {
      const idx = overlayStack.findIndex((e) => e.id === entry.id);
      if (idx >= 0) overlayStack.splice(idx, 1);
      scheduleReconcile();
    };
  }, [isOpen]);
};

/** Nur für Tests: internen Zustand zurücksetzen. */
export const __resetBackDismissForTests = () => {
  overlayStack.length = 0;
  sentinelActive = false;
  ignoredPops = 0;
  reconcileScheduled = false;
  restoreUrlAfterPop = null;
};
