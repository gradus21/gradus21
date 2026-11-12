import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast, toastManager } from '../utils/toast';
import { ToastContainer } from './ToastContainer';
import '@testing-library/jest-dom';

describe('toast & ToastContainer (#40)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastManager.clearAll();
  });

  afterEach(() => {
    act(() => {
      toastManager.clearAll();
    });
    vi.useRealTimers();
  });

  it('rendert nichts, wenn keine Toasts vorhanden sind', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('zeigt einen Erfolgs-Toast an', () => {
    render(<ToastContainer />);
    act(() => {
      toast.success('Änderung gespeichert');
    });

    expect(screen.getByText('Änderung gespeichert')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('zeigt einen Fehler-Toast mit role=alert an', () => {
    render(<ToastContainer />);
    act(() => {
      toast.error('Netzwerkfehler aufgetreten');
    });

    expect(screen.getByText('Netzwerkfehler aufgetreten')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('entfernt den Toast nach Ablauf des Timers automatisch', () => {
    render(<ToastContainer />);
    act(() => {
      toast.info('Info-Nachricht', { duration: 2000 });
    });

    expect(screen.getByText('Info-Nachricht')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText('Info-Nachricht')).not.toBeInTheDocument();
  });

  it('führt Aktion aus und schließt den Toast beim Klick auf Aktions-Button', async () => {
    vi.useRealTimers();
    const handleAction = vi.fn();
    render(<ToastContainer />);

    act(() => {
      toast.success('Note gelöscht', {
        action: { label: 'Rückgängig', onClick: handleAction },
      });
    });

    const actionBtn = screen.getByRole('button', { name: 'Rückgängig' });
    expect(actionBtn).toBeInTheDocument();

    await userEvent.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Note gelöscht')).not.toBeInTheDocument();
  });
});
