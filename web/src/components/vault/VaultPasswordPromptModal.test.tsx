import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VaultPasswordPromptModal } from './VaultPasswordPromptModal';

describe('VaultPasswordPromptModal', () => {
  it('renders correctly when open and handles password submission', async () => {
    const handleSubmit = vi.fn().mockResolvedValue({ success: true });
    const handleCancel = vi.fn();

    render(
      <VaultPasswordPromptModal
        isOpen={true}
        email="apple@gradus21.de"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('apple@gradus21.de')).toBeInTheDocument();
    expect(screen.getByText('Master-Passwort zur Cloud-Verknüpfung')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Master-Passwort eingeben');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'SecretMasterPW123!' } });
    expect(input).toHaveValue('SecretMasterPW123!');

    const submitBtn = screen.getByRole('button', { name: /tresor mit cloud verbinden/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith('SecretMasterPW123!');
    });
  });

  it('displays error message when password derivation fails', async () => {
    const handleSubmit = vi.fn().mockResolvedValue({
      success: false,
      error: 'Das eingegebene Master-Passwort ist nicht korrekt.',
    });
    const handleCancel = vi.fn();

    render(
      <VaultPasswordPromptModal
        isOpen={true}
        email="apple@gradus21.de"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );

    const input = screen.getByPlaceholderText('Master-Passwort eingeben');
    fireEvent.change(input, { target: { value: 'WrongPassword' } });

    const submitBtn = screen.getByRole('button', { name: /tresor mit cloud verbinden/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Das eingegebene Master-Passwort ist nicht korrekt.')).toBeInTheDocument();
    });
  });

  it('calls onCancel when close or cancel button is clicked', () => {
    const handleSubmit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <VaultPasswordPromptModal
        isOpen={true}
        email="apple@gradus21.de"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /abbrechen/i });
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
