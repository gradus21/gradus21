export type HapticPreset =
  | 'selection'
  | 'light'
  | 'snap'
  | 'medium'
  | 'heavy'
  | 'boundary';

export type HapticPattern = number | number[] | HapticPreset;

let iosSwitchLabel: HTMLLabelElement | null = null;

/**
 * Creates or returns a hidden offscreen <label><input type="checkbox" switch /></label>
 * which triggers the native iOS 17.4+ / iOS 18+ WebKit Taptic Engine (UISelectionFeedbackGenerator)
 * when clicked inside a user gesture in Safari / PWA / WKWebView.
 */
function ensureIosHapticSwitch(): HTMLLabelElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (iosSwitchLabel && document.body.contains(iosSwitchLabel)) {
    return iosSwitchLabel;
  }

  const existing = document.body.querySelector<HTMLLabelElement>(
    'label[data-haptic-bridge="ios-switch"]'
  );
  if (existing) {
    iosSwitchLabel = existing;
    return existing;
  }

  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.dataset.hapticBridge = 'ios-switch';
  Object.assign(label.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
  });

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitchLabel = label;
  return label;
}

function resolveVibratePattern(pattern: HapticPattern): number | number[] {
  if (Array.isArray(pattern)) return pattern;
  if (typeof pattern === 'number') {
    // Ensure minimum 12ms spin-up duration so Android LRA/ERM motors produce a crisp physical tap
    return Math.max(12, pattern);
  }
  switch (pattern) {
    case 'selection':
    case 'light':
      return 12;
    case 'snap':
    case 'medium':
      return 18;
    case 'heavy':
      return [24];
    case 'boundary':
      return [10, 35, 10];
    default:
      return 15;
  }
}

function resolveNativeStyle(
  pattern: HapticPattern
): 'light' | 'selection' | 'medium' | 'boundary' {
  if (typeof pattern === 'string') {
    if (pattern === 'selection' || pattern === 'light') return 'selection';
    if (pattern === 'boundary') return 'boundary';
    return 'medium';
  }
  if (Array.isArray(pattern)) {
    return pattern.length >= 3 ? 'boundary' : 'medium';
  }
  return pattern < 10 ? 'selection' : 'medium';
}

/**
 * Cross-platform tactile haptic feedback for mobile devices:
 * 1. Native Tauri iOS bridge (`trigger_native_haptic` via AudioToolbox Taptic Engine)
 * 2. Web Vibration API (`navigator.vibrate`) for Android & supporting mobile browsers
 * 3. WebKit iOS 17.4+/18+ `<input type="checkbox" switch>` Taptic Engine fallback for Safari / PWA
 */
export function triggerHapticFeedback(pattern: HapticPattern = 'snap'): void {
  if (typeof window === 'undefined') return;

  const nativeStyle = resolveNativeStyle(pattern);

  // 1. Tauri Native Runtime Haptic Bridge (iOS Taptic Engine)
  try {
    const tauriInternals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    if (tauriInternals && typeof tauriInternals.invoke === 'function') {
      void tauriInternals
        .invoke('trigger_native_haptic', { style: nativeStyle })
        .catch(() => {});
    }
  } catch {
    // Ignore if Tauri internals are unavailable
  }

  // 2. Standard Web Vibration API (Android Chrome / Android WebView)
  let vibrated = false;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      vibrated = Boolean(navigator.vibrate(resolveVibratePattern(pattern)));
    } catch {
      // Gracefully ignore restrictions or missing permissions
    }
  }

  // 3. iOS Safari / WebKit 17.4+ Switch Taptic Engine Fallback
  if (!vibrated) {
    try {
      const switchLabel = ensureIosHapticSwitch();
      switchLabel?.click();
    } catch {
      // Safe no-op in restricted environments
    }
  }
}
