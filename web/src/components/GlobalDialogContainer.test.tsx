import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { confirmDialog, promptDialog, dialogPromptManager } from '../utils/dialogPrompt';
import { GlobalDialogContainer } from './GlobalDialogContainer';
import { __resetBackDismissForTests } from '../hooks/useHistoryNavigation';
import '@testing-library/jest-dom';

describe('GlobalDialogContainer & dialogPrompt (#40)', () => {
  beforeEach(() => {
    __resetBackDismissForTests();
    dialogPromptManager.closeCurrent();
  });

  afterEach(() => {
    dialogPromptManager.closeCurrent();
    __resetBackDismissForTests();
  });

  it('rendert nichts, wenn kein Dialog aktiv ist', () => {
    const { container } = render(<GlobalDialogContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('bestätigt Confirm-Dialog beim Klick auf Bestätigen', async () => {
    render(<GlobalDialogContainer />);

    let resultPromise: Promise<boolean>;
    act(() => {
      resultPromise = confirmDialog({
        title: 'Konto löschen?',
        message: 'Möchtest du das Konto wirklich löschen?',
        confirmText: 'Endgültig löschen',
        danger: true,
      });
    });

    expect(screen.getByText('Konto löschen?')).toBeInTheDocument();
    expect(screen.getByText('Möchtest du das Konto wirklich löschen?')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Endgültig löschen' });
    await userEvent.click(confirmBtn);

    const result = await resultPromise!;
    expect(result).toBe(true);
    expect(screen.queryByText('Konto löschen?')).not.toBeInTheDocument();
  });

  it('bricht Confirm-Dialog beim Klick auf Abbrechen ab', async () => {
    render(<GlobalDialogContainer />);

    let resultPromise: Promise<boolean>;
    act(() => {
      resultPromise = confirmDialog({
        title: 'Aktion abbrechen?',
        message: 'Bist du sicher?',
      });
    });

    const cancelBtn = screen.getByRole('button', { name: 'Abbrechen' });
    await userEvent.click(cancelBtn);

    const result = await resultPromise!;
    expect(result).toBe(false);
  });

  it('löst Prompt-Dialog mit eingegebenem Text auf', async () => {
    render(<GlobalDialogContainer />);

    let resultPromise: Promise<string | null>;
    act(() => {
      resultPromise = promptDialog({
        title: 'Neue E-Mail',
        message: 'Bitte gib deine neue E-Mail ein:',
        defaultValue: 'alt@schule.de',
        confirmText: 'Speichern',
      });
    });

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('alt@schule.de');

    await userEvent.clear(input);
    await userEvent.type(input, 'neu@schule.de');

    const saveBtn = screen.getByRole('button', { name: 'Speichern' });
    await userEvent.click(saveBtn);

    const result = await resultPromise!;
    expect(result).toBe('neu@schule.de');
  });

  it('bricht Prompt-Dialog mit null ab', async () => {
    render(<GlobalDialogContainer />);

    let resultPromise: Promise<string | null>;
    act(() => {
      resultPromise = promptDialog({
        title: 'E-Mail',
        message: 'Neue E-Mail:',
      });
    });

    const cancelBtn = screen.getByRole('button', { name: 'Abbrechen' });
    await userEvent.click(cancelBtn);

    const result = await resultPromise!;
    expect(result).toBeNull();
  });
});
