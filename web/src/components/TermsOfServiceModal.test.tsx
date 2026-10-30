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

  it('renders terms content, requires scrolling to bottom before accepting, and triggers onAccept and onDecline', () => {
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

    // Initially, accept button must be disabled until scrolled to bottom
    expect(acceptBtn).toBeDisabled();
    expect(
      screen.getByText(/Bitte scrolle bis ganz nach unten, um die Nutzungsbedingungen zu bestätigen/i)
    ).toBeInTheDocument();

    // Clicking accept while disabled should not trigger onAccept
    fireEvent.click(acceptBtn);
    expect(onAccept).not.toHaveBeenCalled();

    // Simulate scrolling to the bottom of the container
    const scrollContainer = screen.getByTestId('terms-scroll-container');
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1200, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 200, configurable: true, writable: true });

    // Scroll partway -> still disabled
    fireEvent.scroll(scrollContainer);
    expect(acceptBtn).toBeDisabled();

    // Scroll to bottom -> enabled
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 790, configurable: true, writable: true });
    fireEvent.scroll(scrollContainer);
    expect(acceptBtn).not.toBeDisabled();

    // Clicking accept now triggers onAccept
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
