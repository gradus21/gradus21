import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AvvConfirmationModal } from './AvvConfirmationModal';

describe('AvvConfirmationModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <AvvConfirmationModal
        isOpen={false}
        onCancel={vi.fn()}
        onOpenGuide={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('separates resource links from wrapping action footer so buttons stay inside the modal', () => {
    const onCancel = vi.fn();
    const onOpenGuide = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AvvConfirmationModal
        isOpen={true}
        avvUrl="https://gradus21.de/avv.html"
        guideLabel="Schul-Leitfaden"
        zIndexClass="z-[80]"
        onCancel={onCancel}
        onOpenGuide={onOpenGuide}
        onConfirm={onConfirm}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toContain('z-[80]');

    const card = dialog.firstElementChild as HTMLElement;
    expect(card.className).toContain('max-w-lg');
    expect(card.className).toContain('w-full');

    const resourcesRow = screen.getByTestId('avv-modal-resources');
    expect(resourcesRow.className).toContain('grid-cols-1');
    expect(resourcesRow.className).toContain('sm:grid-cols-2');

    const avvLink = screen.getByRole('link', { name: /AVV-Muster \(gradus21\.de\)/i });
    expect(avvLink).toHaveAttribute('href', 'https://gradus21.de/avv.html');

    const guideBtn = screen.getByRole('button', { name: 'Schul-Leitfaden' });
    expect(resourcesRow).toContainElement(avvLink);
    expect(resourcesRow).toContainElement(guideBtn);

    const actionsRow = screen.getByTestId('avv-modal-actions');
    expect(actionsRow.className).toContain('flex-wrap');
    expect(actionsRow.className).toContain('justify-end');

    const cancelBtn = screen.getByRole('button', { name: 'Abbrechen' });
    const confirmBtn = screen.getByRole('button', { name: 'Ja, AVV liegt vor / genehmigt' });
    expect(actionsRow).toContainElement(cancelBtn);
    expect(actionsRow).toContainElement(confirmBtn);

    // Ensure SVGs cannot shrink/squash vertically inside buttons
    confirmBtn.querySelectorAll('svg').forEach((svg) => {
      expect(svg.getAttribute('class') || '').toContain('shrink-0');
    });

    fireEvent.click(guideBtn);
    expect(onOpenGuide).toHaveBeenCalledTimes(1);

    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
