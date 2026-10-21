import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TermsOfServiceModal } from './TermsOfServiceModal';

describe('TermsOfServiceModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <TermsOfServiceModal
        isOpen={false}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders terms content and triggers onAccept and onDecline', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const onClose = vi.fn();

    render(
      <TermsOfServiceModal
        isOpen={true}
        onAccept={onAccept}
        onDecline={onDecline}
        onClose={onClose}
      />
    );

    // Title and golden security rules must be visible
    expect(screen.getByRole('heading', { name: /Nutzungsbedingungen/i })).toBeInTheDocument();
    expect(screen.getByText(/Die 3 goldenen Sicherheitsregeln für Lehrkräfte/i)).toBeInTheDocument();

    // Check buttons at the end
    const acceptBtn = screen.getByRole('button', { name: /Nutzungsbedingungen annehmen/i });
    const declineBtn = screen.getByRole('button', { name: /Ablehnen/i });
    expect(acceptBtn).toBeInTheDocument();
    expect(declineBtn).toBeInTheDocument();

    // Clicking accept
    fireEvent.click(acceptBtn);
    expect(onAccept).toHaveBeenCalledTimes(1);

    // Clicking decline
    fireEvent.click(declineBtn);
    expect(onDecline).toHaveBeenCalledTimes(1);

    // Clicking close
    const closeBtn = screen.getByTitle('Schließen');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
