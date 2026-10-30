import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerHapticFeedback } from './haptics';

describe('triggerHapticFeedback cross-platform haptics', () => {
  const originalVibrate = navigator.vibrate;

  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'vibrate', {
      value: originalVibrate,
      configurable: true,
      writable: true,
    });
  });

  it('calls navigator.vibrate with tuned duration for snap and numeric patterns', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    triggerHapticFeedback('snap');
    expect(vibrateMock).toHaveBeenCalledWith(18);

    triggerHapticFeedback('selection');
    expect(vibrateMock).toHaveBeenCalledWith(12);

    triggerHapticFeedback('boundary');
    expect(vibrateMock).toHaveBeenCalledWith([10, 35, 10]);

    // Short numeric values (< 12ms) are boosted to 12ms minimum spin-up threshold
    triggerHapticFeedback(6);
    expect(vibrateMock).toHaveBeenCalledWith(12);
  });

  it('falls back to iOS WebKit switch haptic bridge when navigator.vibrate is unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    triggerHapticFeedback('snap');

    const switchLabel = document.body.querySelector<HTMLLabelElement>(
      'label[data-haptic-bridge="ios-switch"]'
    );
    expect(switchLabel).not.toBeNull();
    const input = switchLabel?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(input).not.toBeNull();
    expect(input?.hasAttribute('switch')).toBe(true);
    // Clicking the label toggles the hidden switch input
    expect(input?.checked).toBe(true);
  });

  it('invokes Tauri native haptic command when running in Tauri runtime', () => {
    const invokeMock = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: invokeMock,
    };

    triggerHapticFeedback('snap');
    expect(invokeMock).toHaveBeenCalledWith('trigger_native_haptic', {
      style: 'medium',
    });

    triggerHapticFeedback('boundary');
    expect(invokeMock).toHaveBeenCalledWith('trigger_native_haptic', {
      style: 'boundary',
    });
  });
});
