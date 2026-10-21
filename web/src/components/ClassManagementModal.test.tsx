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
});
