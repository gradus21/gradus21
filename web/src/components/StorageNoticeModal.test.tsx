import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StorageNoticeModal } from './StorageNoticeModal';

describe('StorageNoticeModal component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <StorageNoticeModal
        isOpen={false}
        onClose={vi.fn()}
        syncStatus="local_only"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders required legal text and buttons when open', () => {
    const handleClose = vi.fn();
    const handleExport = vi.fn();
    const handleOpenSettings = vi.fn();

    render(
      <StorageNoticeModal
        isOpen={true}
        onClose={handleClose}
        syncStatus="local_only"
        isPersistentStorage={true}
        lastLocalBackupTime="21.10.2026 14:00"
        onExportBackup={handleExport}
        onOpenStorageSettings={handleOpenSettings}
      />
    );

    // Verify the exact required text is in the document
    expect(
      screen.getByText(/Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre Noten niemals diesen Browser/i)
    ).toBeInTheDocument();

    expect(screen.getByText('Wichtiger Hinweis zu Ihrem Noten-Speicherort')).toBeInTheDocument();

    // Click export button
    const exportBtn = screen.getByText('Backup jetzt sichern (.gradus21)');
    fireEvent.click(exportBtn);
    expect(handleExport).toHaveBeenCalledTimes(1);

    // Click close/confirm button
    const confirmBtn = screen.getByText('Verstanden & Weiter');
    fireEvent.click(confirmBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('displays native Linux desktop storage path and adapted text when running in Tauri on Linux', () => {
    (window as any).__TAURI__ = {};
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: 'Linux x86_64',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    });

    render(
      <StorageNoticeModal
        isOpen={true}
        onClose={vi.fn()}
        syncStatus="local_only"
      />
    );

    expect(
      screen.getByText(/Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre Noten niemals diese Desktop-App bzw. dieses Gerät/i)
    ).toBeInTheDocument();

    expect(screen.getByText('~/.local/share/de.gradus21.app/')).toBeInTheDocument();
    expect(screen.getByText('App-Datenspeicher')).toBeInTheDocument();
    expect(screen.getByText('Dauerhaft gesichert (Nativ)')).toBeInTheDocument();

    delete (window as any).__TAURI__;
  });

  it('displays native iOS sandbox storage info and mobile warnings when running in Tauri on iPhone', () => {
    (window as any).__TAURI__ = {};
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: 'iPhone',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });

    render(
      <StorageNoticeModal
        isOpen={true}
        onClose={vi.fn()}
        syncStatus="local_only"
      />
    );

    expect(
      screen.getByText(/Gradus21 schützt Ihre Daten durch Zero-Knowledge: Standardmäßig verlassen Ihre Noten niemals diese iOS-App/i)
    ).toBeInTheDocument();

    expect(screen.getByText('Speicherampel: Nur lokal (iOS)')).toBeInTheDocument();
    expect(screen.getByText(/⚠️ Wichtige Hinweise für mobile Geräte \(iOS\):/i)).toBeInTheDocument();
    expect(screen.getByText(/Wird die Gradus21-App vom Gerät gelöscht/i)).toBeInTheDocument();
    expect(screen.queryByText(/HDGuard/i)).toBeNull();
    expect(screen.queryByText('Pfad kopieren')).toBeNull();

    delete (window as any).__TAURI__;
  });
});
