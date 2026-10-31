import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailVerificationModal } from './EmailVerificationModal';

describe('EmailVerificationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/verify-email/start')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ status: 'code_sent', cooldown_seconds: 60 }),
        });
      }
      if (url.includes('/api/auth/verify-email/confirm')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ verified: true, message: 'Verified' }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial email and allows switching to edit mode to update email', async () => {
    const handleUpdateEmail = vi.fn().mockResolvedValue(true);
    const handleSuccess = vi.fn();
    const handleCancel = vi.fn();

    render(
      <EmailVerificationModal
        isOpen={true}
        email="wrong@gradus21.com"
        onSuccess={handleSuccess}
        onCancel={handleCancel}
        onUpdateEmail={handleUpdateEmail}
      />
    );

    // Initial email is visible
    expect(screen.getByText('wrong@gradus21.com')).toBeInTheDocument();

    // Click "E-Mail ändern" button
    const changeBtn = screen.getByRole('button', { name: /e-mail ändern/i });
    expect(changeBtn).toBeInTheDocument();
    fireEvent.click(changeBtn);

    // Edit input is displayed
    const input = screen.getByPlaceholderText('name@schule.de');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('wrong@gradus21.com');

    // Change email value
    fireEvent.change(input, { target: { value: 'correct@schule.de' } });
    expect(input).toHaveValue('correct@schule.de');

    // Submit new email
    const saveBtn = screen.getByRole('button', { name: /speichern & code anfordern/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleUpdateEmail).toHaveBeenCalledWith('correct@schule.de');
    });

    // Returned to view mode showing new email
    await waitFor(() => {
      expect(screen.getByText('correct@schule.de')).toBeInTheDocument();
    });
  });
});
