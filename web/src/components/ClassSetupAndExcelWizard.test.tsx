import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassSetupAndExcelWizard } from './ClassSetupAndExcelWizard';
import { CustomWeightingTemplate } from '../data/demoClasses';

describe('ClassSetupAndExcelWizard - Custom User Templates', () => {
  const dummyUserTemplates: CustomWeightingTemplate[] = [
    {
      id: 'tpl_custom_meine_fachvorlage',
      name: 'Mein Mathe 60/40 Profil',
      description: '60% Klassenarbeiten, 40% mündlich',
      weighting_mode: 'category_buckets',
      categories: [
        { id: 'cat_ka', name: 'Klausuren', short_code: 'KA', weight: 0.6, drop_lowest_count: 0 },
        { id: 'cat_muendl', name: 'Mitarbeit', short_code: 'Mi', weight: 0.4, drop_lowest_count: 0 },
      ],
    },
  ];

  it('renders custom user templates with badge and applies them on class creation', () => {
    const handleCreateClass = vi.fn();
    const handleClose = vi.fn();

    render(
      <ClassSetupAndExcelWizard
        onClose={handleClose}
        onCreateClass={handleCreateClass}
        userTemplates={dummyUserTemplates}
      />
    );

    // Switch to manual template wizard tab
    const tabBtn = screen.getByRole('button', { name: /neue klasse mit vorlage erstellen/i });
    fireEvent.click(tabBtn);

    // User's custom template should be visible with badge
    expect(screen.getByText('Mein Mathe 60/40 Profil')).toBeInTheDocument();
    expect(screen.getByText('Eigene Vorlage')).toBeInTheDocument();

    // Select the custom template
    fireEvent.click(screen.getByText('Mein Mathe 60/40 Profil'));

    // Submit form to create the class
    const submitBtn = screen.getByRole('button', { name: /klasse jetzt verschlüsselt erstellen/i });
    fireEvent.click(submitBtn);

    expect(handleCreateClass).toHaveBeenCalledTimes(1);
    const createdClass = handleCreateClass.mock.calls[0][0];
    expect(createdClass.categories).toHaveLength(2);
    expect(createdClass.categories[0].short_code).toBe('KA');
    expect(createdClass.categories[0].weight).toBe(0.6);
    expect(createdClass.categories[1].short_code).toBe('Mi');
    expect(createdClass.categories[1].weight).toBe(0.4);
    expect(handleClose).toHaveBeenCalled();
  });
});
