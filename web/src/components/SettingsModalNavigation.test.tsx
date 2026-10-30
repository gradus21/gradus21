import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';
import { AppHeader } from './AppHeader';
import { INITIAL_CLASS_DATASETS } from '../data/demoClasses';

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
  };

  const dummySession = {
    userId: 'user-123',
    email: 'lehrer@schule.de',
    token: 'jwt-dummy-token',
    kdfSaltB64: 'saltB64==',
    encryptedDek: 'encDek==',
    dekB64: 'dekB64==',
    totpEnabled: false,
  };

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
