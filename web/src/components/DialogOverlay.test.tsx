import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogOverlay } from './DialogOverlay';
import { __resetBackDismissForTests } from '../hooks/useHistoryNavigation';
import '@testing-library/jest-dom';

// jsdom's HTMLDialogElement doesn't have showModal/close natively — polyfill.
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
      (this as any).open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      (this as any).open = false;
    };
  }
  __resetBackDismissForTests();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  document.body.classList.remove('overflow-hidden');
  __resetBackDismissForTests();
});

describe('DialogOverlay (#39)', () => {
  it('rendert null, wenn isOpen=false (sauberes Unmount)', () => {
    const { container } = render(
      <DialogOverlay isOpen={false} onClose={() => {}}>
        <p>Hidden</p>
      </DialogOverlay>
    );
    expect(container.firstChild).toBeNull();
  });

  it('öffnet mit showModal() und setzt overflow-hidden auf body', () => {
    render(
      <DialogOverlay isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </DialogOverlay>
    );
    const dialog = document.querySelector('dialog');
    expect(dialog!.hasAttribute('open')).toBe(true);
    expect(document.body.classList.contains('overflow-hidden')).toBe(true);
  });

  it('hat aria-labelledby wenn titleId übergeben wird', () => {
    render(
      <DialogOverlay isOpen={true} onClose={() => {}} titleId="my-title">
        <h2 id="my-title">Title</h2>
      </DialogOverlay>
    );
    expect(document.querySelector('dialog')!.getAttribute('aria-labelledby')).toBe('my-title');
  });

  it('ruft onClose bei Escape (cancel-Event) auf', () => {
    const onClose = vi.fn();
    render(
      <DialogOverlay isOpen={true} onClose={onClose}>
        <p>Content</p>
      </DialogOverlay>
    );
    const dialog = document.querySelector('dialog')!;
    const cancelEvent = new Event('cancel', { bubbles: true });
    dialog.dispatchEvent(cancelEvent);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ruft onClose bei Klick auf den Backdrop auf', () => {
    const onClose = vi.fn();
    render(
      <DialogOverlay isOpen={true} onClose={onClose}>
        <p>Content</p>
      </DialogOverlay>
    );
    fireEvent.click(document.querySelector('dialog')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('verhindert Backdrop-Klick bei preventBackdropClose', () => {
    const onClose = vi.fn();
    render(
      <DialogOverlay isOpen={true} onClose={onClose} preventBackdropClose>
        <p>Content</p>
      </DialogOverlay>
    );
    fireEvent.click(document.querySelector('dialog')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('entfernt overflow-hidden beim Schließen', () => {
    const { rerender } = render(
      <DialogOverlay isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </DialogOverlay>
    );
    expect(document.body.classList.contains('overflow-hidden')).toBe(true);

    rerender(
      <DialogOverlay isOpen={false} onClose={() => {}}>
        <p>Content</p>
      </DialogOverlay>
    );
    expect(document.body.classList.contains('overflow-hidden')).toBe(false);
  });

  it('wendet die richtige Größenklasse an', () => {
    const { container } = render(
      <DialogOverlay isOpen={true} onClose={() => {}} size="xl">
        <p>Content</p>
      </DialogOverlay>
    );
    const panel = container.querySelector('.max-w-4xl');
    expect(panel).toBeTruthy();
  });

  it('enthält den Mobile-Sheet-Drag-Handle', () => {
    const { container } = render(
      <DialogOverlay isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </DialogOverlay>
    );
    expect(container.querySelector('.sheet-drag-handle')).toBeTruthy();
  });
});
