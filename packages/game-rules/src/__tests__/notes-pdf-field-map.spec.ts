import { describe, it, expect } from 'vitest';
import { mapNotesToPdfFields } from '../ryuutama/notes-pdf-field-map';
import type { NotesPdfInput } from '../ryuutama/notes-pdf-field-map';

function field(fields: ReturnType<typeof mapNotesToPdfFields>, name: string): string | undefined {
  return fields.find((f) => f.field === name)?.value;
}

describe('mapNotesToPdfFields', () => {
  it('notes mappées dans l\'ordre reçu (date + texte)', () => {
    const input: NotesPdfInput = {
      notes: [
        { text: 'Deuxième entrée du journal', createdAt: '2026-07-02T10:00:00.000Z' },
        { text: 'Première entrée du journal', createdAt: '2026-07-01T10:00:00.000Z' },
      ],
    };
    const fields = mapNotesToPdfFields(input);
    expect(field(fields, 'Note.0.1')).toBe('Deuxième entrée du journal');
    expect(field(fields, 'Note.1.1')).toBe('Première entrée du journal');
  });

  it('date formatée en fr-FR (pas ISO)', () => {
    const fields = mapNotesToPdfFields({
      notes: [{ text: 'Texte', createdAt: '2026-07-01T10:00:00.000Z' }],
    });
    const dateValue = field(fields, 'Note.0.0');
    expect(dateValue).not.toBe('2026-07-01');
    expect(dateValue).toBe(new Date('2026-07-01T10:00:00.000Z').toLocaleDateString('fr-FR'));
  });

  it('date invalide → chaîne vide sur le champ date (défense de profondeur)', () => {
    const fields = mapNotesToPdfFields({
      notes: [{ text: 'Texte', createdAt: 'not-a-date' }],
    });
    expect(field(fields, 'Note.0.0')).toBe('');
    expect(field(fields, 'Note.0.1')).toBe('Texte');
  });

  it('plus de 21 notes → excédentaires omises sans erreur', () => {
    const notes = Array.from({ length: 25 }, (_, i) => ({
      text: `Note ${i}`,
      createdAt: '2026-07-01T10:00:00.000Z',
    }));
    expect(() => mapNotesToPdfFields({ notes })).not.toThrow();
    const fields = mapNotesToPdfFields({ notes });
    expect(field(fields, 'Note.20.1')).toBe('Note 20');
    expect(fields.some((f) => f.value === 'Note 21')).toBe(false);
    expect(fields.some((f) => f.value === 'Note 24')).toBe(false);
  });

  it('0 note : aucun champ Note.* renseigné (toutes les valeurs vides)', () => {
    const fields = mapNotesToPdfFields({ notes: [] });
    expect(field(fields, 'Note.0.0')).toBe('');
    expect(field(fields, 'Note.0.1')).toBe('');
    expect(field(fields, 'Note.20.1')).toBe('');
    expect(fields.length).toBe(42);
  });
});
