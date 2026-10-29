/**
 * Lightweight, non-intrusive haptic feedback for mobile devices via Navigator.vibrate.
 * Safely no-ops in desktop environments or when unsupported.
 */
export function triggerHapticFeedback(pattern: number | number[] = 10): void {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Gracefully ignore restrictions or missing permissions
    }
  }
}
