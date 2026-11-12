import React, { useCallback, useEffect, useRef } from 'react';
import { useBackDismiss } from '../hooks/useHistoryNavigation';

/**
 * Zentrale Overlay-/Dialog-Komponente (Issue #39).
 *
 * Bringt mit:
 * - Nativer `<dialog>` mit `showModal()` → Top-Layer (kein z-Index-Chaos),
 *   eingebauter Fokus-Trap, `::backdrop` und `inert` für den Rest der Seite.
 * - Escape schließt das Overlay.
 * - Klick auf den Backdrop schließt das Overlay (abschaltbar via `preventBackdropClose`).
 * - Fokus-Rückgabe an das auslösende Element beim Schließen.
 * - Scroll-Sperre des Hintergrunds (über `body.overflow-hidden`).
 * - `useBackDismiss` aus #38: Browser/Android-Zurück schließt das Overlay.
 * - `aria-labelledby` und `aria-modal="true"` für Barrierefreiheit (WCAG 2.1 AA).
 * - Gibt `null` zurück, wenn `isOpen === false` (sauberes Unmounting, keine Phantom-Elemente).
 *
 * ## Größenvarianten (`size`)
 * - `sm`   → max-w-md    (z. B. Bestätigungsdialoge)
 * - `md`   → max-w-xl    (Standard)
 * - `lg`   → max-w-3xl   (Settings, ClassManager)
 * - `xl`   → max-w-4xl   (Legal, Wizard)
 * - `full` → max-w-6xl   (Admin)
 */

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface DialogOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Accessible title ID for `aria-labelledby`. */
  titleId?: string;
  /** Overlay size variant. Default: `md`. */
  size?: DialogSize;
  /** Disable backdrop click to close (e.g. for mandatory wizards). */
  preventBackdropClose?: boolean;
  /** Optional data-tour attribute for tour targeting. */
  dataTour?: string;
  /** Extra CSS classes on the content panel. */
  className?: string;
}

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export const DialogOverlay: React.FC<DialogOverlayProps> = ({
  isOpen,
  onClose,
  children,
  titleId,
  size = 'md',
  preventBackdropClose = false,
  dataTour,
  className = '',
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Browser/Android-Zurück schließt das Overlay (#38)
  useBackDismiss(isOpen, onClose);

  // showModal / close synchronisieren & Focus Management
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
      } catch {
        // Falls showModal bereits aufgerufen wurde
      }
    } else {
      dialog.setAttribute('open', '');
      (dialog as any).open = true;
    }
    document.body.classList.add('overflow-hidden');

    return () => {
      document.body.classList.remove('overflow-hidden');
      if (typeof dialog.close === 'function') {
        try {
          dialog.close();
        } catch {
          // ignore
        }
      } else {
        dialog.removeAttribute('open');
        (dialog as any).open = false;
      }
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [isOpen]);

  // Natives cancel-Event (Escape) → onClose
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault(); // Wir steuern das Schließen selbst über state
      onClose();
    };

    // Keyboard-Fallback für Umgebungen, in denen cancel-Event nicht emittiert wird
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Backdrop-Klick (Klick auf das <dialog>-Element selbst, nicht auf Kinder)
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (preventBackdropClose) return;
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose, preventBackdropClose]
  );

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={`
        dialog-overlay
        p-0 bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm
        open:flex items-end sm:items-center justify-center
        w-full h-full max-w-full max-h-full
        open:animate-in open:fade-in open:duration-150
      `}
      onClick={handleBackdropClick}
    >
      <div
        data-tour={dataTour}
        className={`
          relative w-full ${SIZE_CLASSES[size]}
          max-h-[92dvh] sm:max-h-[90vh]
          flex flex-col
          rounded-t-[28px] sm:rounded-2xl
          border-t sm:border
          shadow-2xl overflow-hidden
          pb-safe sm:pb-0
          sheet-mobile-enter
          ${className}
        `}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Sheet Drag Indicator */}
        <div className="sm:hidden sheet-drag-handle" />
        {children}
      </div>
    </dialog>
  );
};
