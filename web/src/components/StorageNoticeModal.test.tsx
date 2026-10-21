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
});
