import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassManagementModal } from './ClassManagementModal';
import { INITIAL_CLASS_DATASETS, ClassroomSubjectDataset } from '../data/demoClasses';

describe('ClassManagementModal - Student Safety & Retention Mechanism', () => {
  const getBaseDataset = (): ClassroomSubjectDataset => {
    return JSON.parse(JSON.stringify(INITIAL_CLASS_DATASETS[0]));
  };

  it('renders active students with safe Archiving button and delete trigger', () => {
    const ds = getBaseDataset();
    const handleUpdate = vi.fn();
    const handleDeleteClass = vi.fn();
    const handleClose = vi.fn();

    render(
      <ClassManagementModal
        dataset={ds}
        canDeleteClass={false}
        onUpdateDataset={handleUpdate}
        onDeleteClass={handleDeleteClass}
        onClose={handleClose}
      />
    );

    // Active students should be listed
    const firstStu = ds.students.find((s) => !s.is_archived);
    expect(firstStu).toBeDefined();

    // Archiving buttons should be present
    const archiveButtons = screen.getAllByRole('button', { name: /archivieren/i });
    expect(archiveButtons.length).toBeGreaterThan(0);
  });

  it('opens confirmation safety dialog when delete icon is clicked for an active student', () => {
    const ds = getBaseDataset();
    const handleUpdate = vi.fn();

    render(
      <ClassManagementModal
        dataset={ds}
        canDeleteClass={false}
        onUpdateDataset={handleUpdate}
        onDeleteClass={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const firstStu = ds.students[0];
    const deleteBtn = screen.getAllByTitle('Schüler:in aus Klasse entfernen oder löschen...')[0];
    fireEvent.click(deleteBtn);

    // Confirmation dialog must appear
    expect(
      screen.getByText('Schüler:in aus der Klasse entfernen')
    ).toBeInTheDocument();
    expect(
      screen.getByText('In das Archiv verschieben (Empfohlen)')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Unwiderruflich löschen').length).toBeGreaterThan(0);
    expect(handleUpdate).not.toHaveBeenCalled(); // No accidental immediate deletion!

    // Clicking "Jetzt archivieren" soft-deletes the student with timestamp
    const archiveActionBtn = screen.getByRole('button', { name: /jetzt archivieren/i });
    fireEvent.click(archiveActionBtn);

    expect(handleUpdate).toHaveBeenCalled();
  });

  it('displays proactive retention prompt when students are archived > 30 days', () => {
    const ds = getBaseDataset();
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    ds.students.push({
      id: 'stu_archived_expired',
      name: 'Max Mustermann (Archiviert)',
      level: 'M',
      is_not_graded: false,
      is_archived: true,
      archived_at: thirtyFiveDaysAgo,
    });

    render(
      <ClassManagementModal
        dataset={ds}
        canDeleteClass={false}
        onUpdateDataset={vi.fn()}
        onDeleteClass={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Aufbewahrungsfrist abgelaufen/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /jetzt bereinigen\.\.\./i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aufbewahrung verlängern/i })).toBeInTheDocument();
  });

  it('renders assessment tab with category weights, custom assessment creator and mode selector', () => {
    const ds = getBaseDataset();
    const handleUpdate = vi.fn();

    render(
      <ClassManagementModal
        dataset={ds}
        canDeleteClass={false}
        initialTab="assessments"
        onUpdateDataset={handleUpdate}
        onDeleteClass={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Category weights banner must be visible
    expect(screen.getByText(/Gewichtung der Notenbereiche/i)).toBeInTheDocument();

    // Dedicated single assessment creator form
    expect(
      screen.getByText(/Neue Prüfung anlegen & Bewertungsart festlegen/i)
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/z\.B\. Vokabeltest/i)).toBeInTheDocument();

    // Mode options should be selectable
    const modeSelects = screen.getAllByRole('combobox');
    expect(modeSelects.length).toBeGreaterThan(0);

    // Create a new assessment
    const titleInput = screen.getByPlaceholderText(/z\.B\. Vokabeltest/i);
    fireEvent.change(titleInput, { target: { value: 'Grammatiktest 1' } });

    const createBtn = screen.getByRole('button', { name: /prüfung hinzufügen/i });
    fireEvent.click(createBtn);

    expect(handleUpdate).toHaveBeenCalled();
  });

  it('creates multiple numbered assessments when Anzahl > 1', () => {
    const ds = getBaseDataset();
    let updatedDs = ds;
    const handleUpdate = vi.fn((updater) => {
      updatedDs = typeof updater === 'function' ? updater(updatedDs) : updater;
    });

    render(
      <ClassManagementModal
        dataset={ds}
        canDeleteClass={false}
        initialTab="assessments"
        onUpdateDataset={handleUpdate}
        onDeleteClass={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const titleInput = screen.getByPlaceholderText(/z\.B\. Vokabeltest/i);
    fireEvent.change(titleInput, { target: { value: 'Kurzarbeit' } });

    const countInput = screen.getByDisplayValue('1');
    fireEvent.change(countInput, { target: { value: '3' } });

    const createBtn = screen.getByRole('button', { name: /3 prüfungen hinzufügen/i });
    fireEvent.click(createBtn);

    expect(handleUpdate).toHaveBeenCalled();
    const createdTitles = updatedDs.assessments.slice(-3).map((a) => a.title);
    expect(createdTitles).toEqual(['Kurzarbeit 1', 'Kurzarbeit 2', 'Kurzarbeit 3']);
  });
});
