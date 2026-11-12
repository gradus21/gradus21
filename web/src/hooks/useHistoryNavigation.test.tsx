import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useState } from 'react';
import {
  resolveModeFromHash,
  workspaceModeToHash,
  useHistoryMode,
  useBackDismiss,
  __resetBackDismissForTests,
} from './useHistoryNavigation';

const flushMicrotasks = () => act(async () => {
  await Promise.resolve();
});

const goBack = async () => {
  await act(async () => {
    window.history.back();
    await new Promise((r) => setTimeout(r, 20));
  });
};

describe('resolveModeFromHash / workspaceModeToHash (#38)', () => {
  it('liest neue und alte Hash-Formate', () => {
    expect(resolveModeFromHash('#/speed')).toBe('speed_grading');
    expect(resolveModeFromHash('#speed')).toBe('speed_grading');
    expect(resolveModeFromHash('#student360')).toBe('student_360');
    expect(resolveModeFromHash('#/student')).toBe('student_360');
    expect(resolveModeFromHash('#/config')).toBe('configurator');
    expect(resolveModeFromHash('')).toBe('matrix');
  });

  it('ist für alle Modi umkehrbar', () => {
    for (const m of ['matrix', 'speed_grading', 'student_360', 'configurator'] as const) {
      expect(resolveModeFromHash(workspaceModeToHash(m))).toBe(m);
    }
  });
});

describe('useHistoryMode (#38)', () => {
  beforeEach(() => {
    __resetBackDismissForTests();
    window.history.replaceState(null, '', '/');
  });

  it('übernimmt den Modus aus einem Deep-Link', () => {
    window.history.replaceState(null, '', '/#/speed');
    const { result } = renderHook(() => useHistoryMode());
    expect(result.current[0]).toBe('speed_grading');
  });

  it('erzeugt History-Einträge, und Zurück stellt den vorigen Modus wieder her', async () => {
    const { result } = renderHook(() => useHistoryMode());
    const startLength = window.history.length;

    act(() => result.current[1]('speed_grading'));
    expect(window.location.hash).toBe('#/speed');
    act(() => result.current[1]('student_360'));
    expect(window.location.hash).toBe('#/student');
    expect(window.history.length).toBe(startLength + 2);

    await goBack();
    await waitFor(() => expect(result.current[0]).toBe('speed_grading'));
    await goBack();
    await waitFor(() => expect(result.current[0]).toBe('matrix'));
  });

  it('erzeugt keinen Eintrag, wenn sich der Modus nicht ändert', () => {
    const { result } = renderHook(() => useHistoryMode());
    const startLength = window.history.length;
    act(() => result.current[1]('matrix'));
    expect(window.history.length).toBe(startLength);
  });

  it('behält Query-Parameter (z. B. ?demo=1) bei', () => {
    window.history.replaceState(null, '', '/?demo=1');
    const { result } = renderHook(() => useHistoryMode());
    act(() => result.current[1]('speed_grading'));
    expect(window.location.search).toBe('?demo=1');
    expect(window.location.hash).toBe('#/speed');
  });
});

describe('useBackDismiss (#38)', () => {
  beforeEach(() => {
    __resetBackDismissForTests();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    __resetBackDismissForTests();
  });

  const useOverlay = (initial = false) => {
    const [open, setOpen] = useState(initial);
    useBackDismiss(open, () => setOpen(false));
    return { open, setOpen };
  };

  it('Zurück schließt den offenen Dialog statt die Seite zu verlassen', async () => {
    const { result } = renderHook(() => useOverlay());
    const startLength = window.history.length;

    act(() => result.current.setOpen(true));
    await flushMicrotasks();
    expect(window.history.length).toBe(startLength + 1);

    await goBack();
    await waitFor(() => expect(result.current.open).toBe(false));
  });

  it('entfernt den Sentinel-Eintrag, wenn der Dialog per UI geschlossen wird', async () => {
    const { result } = renderHook(() => useOverlay());
    act(() => result.current.setOpen(true));
    await flushMicrotasks();
    expect(window.history.state?.__gradus21Overlay).toBe(true);

    act(() => result.current.setOpen(false));
    await flushMicrotasks();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(window.history.state?.__gradus21Overlay).toBeUndefined();
  });

  it('schließt bei verschachtelten Dialogen zuerst den obersten', async () => {
    const { result } = renderHook(() => {
      const outer = useOverlay();
      const inner = useOverlay();
      return { outer, inner };
    });

    act(() => result.current.outer.setOpen(true));
    await flushMicrotasks();
    act(() => result.current.inner.setOpen(true));
    await flushMicrotasks();

    await goBack();
    await waitFor(() => expect(result.current.inner.open).toBe(false));
    expect(result.current.outer.open).toBe(true);

    await flushMicrotasks();
    await goBack();
    await waitFor(() => expect(result.current.outer.open).toBe(false));
  });

  it('behält bei Moduswechsel im offenen Overlay den neuen Modus nach dem Schließen', async () => {
    const { result } = renderHook(() => {
      const nav = useHistoryMode();
      const overlay = useOverlay();
      return { nav, overlay };
    });

    act(() => result.current.overlay.setOpen(true));
    await flushMicrotasks();
    act(() => result.current.nav[1]('speed_grading'));

    act(() => result.current.overlay.setOpen(false));
    await flushMicrotasks();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(window.location.hash).toBe('#/speed');
    expect(result.current.nav[0]).toBe('speed_grading');
  });
});
