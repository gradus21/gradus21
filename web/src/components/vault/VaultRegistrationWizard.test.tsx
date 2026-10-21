import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VaultRegistrationWizard } from './VaultRegistrationWizard';

describe('VaultRegistrationWizard component', () => {
  const defaultProps = {
    step: 'credentials' as const,
    setStep: vi.fn(),
    email: 'test@schule.de',
    setEmail: vi.fn(),
    password: 'Password123!',
    setPassword: vi.fn(),
    confirmPassword: 'Password123!',
    setConfirmPassword: vi.fn(),
    optInCloudSync: false,
    setOptInCloudSync: vi.fn(),
    setShowAvvConfirmation: vi.fn(),
    termsAccepted: true,
    setTermsAccepted: vi.fn(),
    onOpenTermsModal: vi.fn(),
    regSession: null,
    recoverySavedConfirmed: false,
    setRecoverySavedConfirmed: vi.fn(),
    regQrDataUrl: null,
    showRegTotpManualSecret: false,
    setShowRegTotpManualSecret: vi.fn(),
    copiedRegTotpSecret: false,
    regTotpCode: '',
    setRegTotpCode: vi.fn(),
    regTotpVerified: false,
    regPasskeyDone: false,
    onStartRegistration: vi.fn(),
    onProceedToTotp: vi.fn(),
    onVerifyRegistration2FA: vi.fn(),
    onSetupRegistrationPasskey: vi.fn(),
    onSkipPasskey: vi.fn(),
    onFinishRegistration: vi.fn(),
    onCancelRegistration: vi.fn(),
    onCreateLocalOfflineVault: vi.fn(),
    onPrintRecoverySheet: vi.fn(),
    onCopyRecoveryKey: vi.fn(),
    copiedRecoveryKey: false,
    onCopyRegSecret: vi.fn(),
    onOpenLegal: vi.fn(),
  };

  it('renders offline vault button when optInCloudSync is false', () => {
    const onCreateOffline = vi.fn();
    const setShowAvv = vi.fn();

    render(
      <VaultRegistrationWizard
        {...defaultProps}
        optInCloudSync={false}
        onCreateLocalOfflineVault={onCreateOffline}
        setShowAvvConfirmation={setShowAvv}
      />
    );

    // Offline button must be present
    const offlineBtn = screen.getByRole('button', {
      name: /Rein lokalen Offline-Tresor nutzen \(ohne Server\)/i,
    });
    expect(offlineBtn).toBeInTheDocument();

    // Normal "Konto anlegen" button must NOT be present
    expect(
      screen.queryByRole('button', {
        name: /Konto anlegen & Sicherheit einrichten/i,
      })
    ).not.toBeInTheDocument();

    // Clicking offline button triggers handler
    fireEvent.click(offlineBtn);
    expect(onCreateOffline).toHaveBeenCalledTimes(1);

    // Clicking checkbox triggers AVV confirmation modal
    const checkbox = screen.getByRole('checkbox', {
      name: /E2EE Cloud-Synchronisation aktivieren/i,
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(setShowAvv).toHaveBeenCalledWith(true);
  });

  it('renders online account button when optInCloudSync is true', () => {
    const onStartReg = vi.fn((e) => e.preventDefault());
    const setOptIn = vi.fn();

    render(
      <VaultRegistrationWizard
        {...defaultProps}
        optInCloudSync={true}
        onStartRegistration={onStartReg}
        setOptInCloudSync={setOptIn}
      />
    );

    // Online account button must be present
    const onlineBtn = screen.getByRole('button', {
      name: /Konto anlegen & Sicherheit einrichten/i,
    });
    expect(onlineBtn).toBeInTheDocument();

    // Offline button must NOT be present
    expect(
      screen.queryByRole('button', {
        name: /Rein lokalen Offline-Tresor nutzen \(ohne Server\)/i,
      })
    ).not.toBeInTheDocument();

    // Checkbox is checked
    const checkbox = screen.getByRole('checkbox', {
      name: /E2EE Cloud-Synchronisation aktivieren/i,
    });
    expect(checkbox).toBeChecked();

    // Unchecking checkbox sets optIn to false
    fireEvent.click(checkbox);
    expect(setOptIn).toHaveBeenCalledWith(false);
  });

  it('handles terms and conditions checkbox and button disabled state', () => {
    const setTerms = vi.fn();
    const onOpenTerms = vi.fn();

    // 1. When terms are NOT accepted, submit button is disabled
    const { rerender } = render(
      <VaultRegistrationWizard
        {...defaultProps}
        termsAccepted={false}
        setTermsAccepted={setTerms}
        onOpenTermsModal={onOpenTerms}
        optInCloudSync={true}
      />
    );

    const termsCheckbox = screen.getByRole('checkbox', {
      name: /Nutzungsbedingungen akzeptieren/i,
    });
    expect(termsCheckbox).not.toBeChecked();

    const disabledOnlineBtn = screen.getByRole('button', {
      name: /Konto anlegen & Sicherheit einrichten/i,
    });
    expect(disabledOnlineBtn).toBeDisabled();

    // Clicking checkbox opens terms modal
    fireEvent.click(termsCheckbox);
    expect(onOpenTerms).toHaveBeenCalledTimes(1);

    // Clicking "Jetzt lesen & prüfen" also opens terms modal
    const readBtn = screen.getByRole('button', {
      name: /Jetzt lesen & prüfen/i,
    });
    fireEvent.click(readBtn);
    expect(onOpenTerms).toHaveBeenCalledTimes(2);

    // 2. When terms ARE accepted, submit button is enabled
    rerender(
      <VaultRegistrationWizard
        {...defaultProps}
        termsAccepted={true}
        setTermsAccepted={setTerms}
        onOpenTermsModal={onOpenTerms}
        optInCloudSync={true}
      />
    );

    const enabledOnlineBtn = screen.getByRole('button', {
      name: /Konto anlegen & Sicherheit einrichten/i,
    });
    expect(enabledOnlineBtn).not.toBeDisabled();
  });

  it('renders complete step with cloud-sync enabled indicator and finishes registration', () => {
    const onFinish = vi.fn();
    const mockSession = {
      token: 'test_token',
      userId: 'test_user_id',
      email: 'test@schule.de',
      isAdmin: false,
      kdfSaltB64: 'salt',
      dekB64: 'dek',
      encryptedDek: 'enc_dek',
      recoveryEncryptedDek: 'rec_enc_dek',
      totpEnabled: true,
      serverSyncedCount: 0,
    };

    render(
      <VaultRegistrationWizard
        {...defaultProps}
        step="complete"
        regSession={mockSession}
        optInCloudSync={true}
        onFinishRegistration={onFinish}
      />
    );

    expect(screen.getByText(/Registrierung abgeschlossen!/i)).toBeInTheDocument();
    expect(screen.getByText(/E2EE Cloud-Synchronisation aktiviert/i)).toBeInTheDocument();

    const finishBtn = screen.getByRole('button', { name: /Gradus21 starten/i });
    fireEvent.click(finishBtn);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
