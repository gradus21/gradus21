import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';
import { AppHeader } from './AppHeader';
import {
  DEFAULT_USER_SYNC_SETTINGS,
  INITIAL_CLASS_DATASETS,
  applyResolvedThemeToSettings,
  resolveIsDarkMode,
} from '../data/demoClasses';

describe('SettingsModal Navigation & Account Security Architecture', () => {
  const dummySettings = {
    cloudSyncEnabled: false,
    favorites: [],
    favoriteWeightingPresets: [],
    customWeightingTemplates: [],
    themePreset: 'nordic' as const,
    themeMode: 'system' as const,
    darkMode: false,
    autoCalculate: true,
  } as unknown as any;

  const dummySession = {
    userId: 'user-123',
    email: 'lehrer@schule.de',
    token: 'jwt-dummy-token',
    kdfSaltB64: 'saltB64==',
    encryptedDek: 'encDek==',
    dekB64: 'dekB64==',
    totpEnabled: false,
    recoveryEncryptedDek: 'rec==',
    serverSyncedCount: 0,
  } as unknown as any;

  it('renders both "Konto & Schutz" and "Speicher & Backups" tabs', () => {
    render(
      <SettingsModal
        settings={dummySettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        session={dummySession}
      />
    );

    const accountTab = screen.getByRole('button', { name: /konto/i });
    const storageTab = screen.getByRole('button', { name: /speicher/i });

    expect(accountTab).toBeDefined();
    expect(storageTab).toBeDefined();
  });

  it('opens "Konto & Schutz" and displays account email and security section', () => {
    render(
      <SettingsModal
        settings={dummySettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        session={dummySession}
        initialSection="account_security"
      />
    );

    expect(screen.getByText(/angemeldet als lehrer@schule\.de/i)).toBeDefined();
  });

  it('opens "Speicher & Backups" and displays cloud sync and backup options without misplaced auth cards', () => {
    render(
      <SettingsModal
        settings={dummySettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        session={dummySession}
        initialSection="storage"
      />
    );

    expect(screen.getByText(/e2ee cloud-synchronisation/i)).toBeDefined();
    expect(screen.getByText(/verschlüsseltes datei-backup/i)).toBeDefined();
  });

  it('displays native separate backup path configuration on native clients instead of Chromium File System API warning', async () => {
    (window as any).__TAURI__ = {};
    try {
      const onSetCustomBackupPath = vi.fn().mockResolvedValue({
        ok: true,
        path: '/mnt/schulnetz/gradus21-backups',
      });

      render(
        <SettingsModal
          settings={dummySettings}
          onUpdateSettings={vi.fn()}
          onClose={vi.fn()}
          session={dummySession}
          initialSection="storage"
          onSetCustomBackupPath={onSetCustomBackupPath}
        />
      );

      expect(
        screen.getByText(/3\. Automatischer lokaler Backup-Ordner \(Separater Backup-Pfad\)/i)
      ).toBeDefined();
      expect(screen.queryByText(/erfordert einen Chromium-basierten Browser/i)).toBeNull();

      const input = screen.getByLabelText(/Separaten Backup-Pfad angeben:/i);
      fireEvent.change(input, { target: { value: '/mnt/schulnetz/gradus21-backups' } });

      const saveBtn = screen.getByRole('button', { name: /Pfad speichern/i });
      fireEvent.click(saveBtn);

      expect(onSetCustomBackupPath).toHaveBeenCalledWith('/mnt/schulnetz/gradus21-backups');
    } finally {
      delete (window as any).__TAURI__;
    }
  });

  it('automatically resolves and applies system dark mode when themeMode is "system"', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      expect(resolveIsDarkMode('system', false)).toBe(true);
      const resolved = applyResolvedThemeToSettings({
        ...DEFAULT_USER_SYNC_SETTINGS,
        themeMode: 'system',
        darkMode: false,
      });
      expect(resolved.themeMode).toBe('system');
      expect(resolved.darkMode).toBe(true);

      const onUpdateSettings = vi.fn();
      render(
        <SettingsModal
          settings={{ ...dummySettings, themeMode: 'system', darkMode: false }}
          onUpdateSettings={onUpdateSettings}
          onClose={vi.fn()}
          session={dummySession}
          initialSection="appearance"
        />
      );

      expect(onUpdateSettings).toHaveBeenCalled();
      const updater = onUpdateSettings.mock.calls[0][0];
      const updated = updater({ ...dummySettings, themeMode: 'system', darkMode: false });
      expect(updated.darkMode).toBe(true);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

describe('AppHeader Navigation Unification', () => {
  it('does NOT render separate "Konto & Schutz" header button, but keeps "Einstellungen"', () => {
    render(
      <AppHeader
        datasets={INITIAL_CLASS_DATASETS}
        activeDataset={INITIAL_CLASS_DATASETS[0]}
        setActiveClassId={vi.fn()}
        onOpenClassWizard={vi.fn()}
        onOpenClassManager={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenAdmin={vi.fn()}
        onOpenInteractiveGuide={vi.fn()}
        syncStatus="offline_local"
        privacyBlur={false}
        setPrivacyBlur={vi.fn()}
        onLockVault={vi.fn()}
        activeTerm="all"
        setActiveTerm={vi.fn()}
        archivedCount={0}
        calculationReport={null}
        mode="matrix"
        setMode={vi.fn()}
      />
    );

    // Einstellungen button must exist
    expect(screen.getByRole('button', { name: /einstellungen/i })).toBeDefined();

    // Separate "Konto & Schutz" button in header must NOT exist
    expect(screen.queryByRole('button', { name: /^konto & schutz$/i })).toBeNull();
  });
});
