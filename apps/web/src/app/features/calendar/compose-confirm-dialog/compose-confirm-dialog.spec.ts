import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComposeConfirmDialog, type ComposeConfirmData } from './compose-confirm-dialog';
import { TONE_MAP } from '../../../core/theme/tones';
import { fillTone } from '../../../core/theme/tone-format';

const GRIMOIRE_TONE = TONE_MAP['grimoire-emeraude'];

function makeData(overrides: Partial<ComposeConfirmData> = {}): ComposeConfirmData {
  return {
    mode: 'poll',
    slotCount: 3,
    removedCount: 2,
    voterCount: 4,
    seances: [],
    ...overrides,
  };
}

async function createComponent(data: ComposeConfirmData) {
  await TestBed.configureTestingModule({
    imports: [ComposeConfirmDialog],
    providers: [
      provideNoopAnimations(),
      { provide: MatDialogRef, useValue: { close: vi.fn() } },
      { provide: MAT_DIALOG_DATA, useValue: data },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ComposeConfirmDialog);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const text = (el: HTMLElement, selector: string) =>
  el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

// Story 35.2 — les accords en nombre vivent désormais dans le registre de ton : le nombre de votants
// est NOMMÉ dans l'avertissement (AC6 de la 36.10), au singulier comme au pluriel.
describe('ComposeConfirmDialog — textes du registre (Story 35.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mode « modifier », pluriel : avertissement nommant créneaux et réponses perdus', async () => {
    const el = await createComponent(makeData({ removedCount: 2, voterCount: 4 }));

    expect(text(el, '.compose-confirm__warning')).toBe(
      fillTone(GRIMOIRE_TONE['calendar.compose_confirm_warning_many'], {
        slots: fillTone(GRIMOIRE_TONE['calendar.compose_confirm_slots_many'], { n: 2 }),
        votes: fillTone(GRIMOIRE_TONE['calendar.compose_confirm_responses_many'], { n: 4 }),
      }),
    );
    expect(text(el, 'h2')).toBe(GRIMOIRE_TONE['calendar.compose_confirm_title_modify']);
  });

  it('mode « modifier », singulier : « 1 créneau » et « 1 réponse déjà posée »', async () => {
    const el = await createComponent(makeData({ removedCount: 1, voterCount: 1 }));

    expect(text(el, '.compose-confirm__warning')).toBe(
      fillTone(GRIMOIRE_TONE['calendar.compose_confirm_warning_one'], {
        slots: fillTone(GRIMOIRE_TONE['calendar.compose_confirm_slots_one'], { n: 1 }),
        votes: fillTone(GRIMOIRE_TONE['calendar.compose_confirm_responses_one'], { n: 1 }),
      }),
    );
  });

  it('mode « modifier » sans votant : aucun avertissement', async () => {
    const el = await createComponent(makeData({ voterCount: 0 }));

    expect(el.querySelector('.compose-confirm__warning')).toBeNull();
  });

  it('résumé accordé en nombre', async () => {
    const one = await createComponent(makeData({ slotCount: 1 }));
    expect(text(one, '.compose-confirm__summary')).toBe(
      fillTone(GRIMOIRE_TONE['calendar.compose_confirm_summary_one'], { n: 1 }),
    );
    TestBed.resetTestingModule();

    const many = await createComponent(makeData({ slotCount: 5 }));
    expect(text(many, '.compose-confirm__summary')).toBe(
      fillTone(GRIMOIRE_TONE['calendar.compose_confirm_summary_many'], { n: 5 }),
    );
  });

  it('mode « créer » : titre et question de la séance, sans avertissement', async () => {
    const el = await createComponent(
      makeData({
        mode: 'new',
        seances: [
          { seanceId: 's1', label: 'Scénario — Séance 1' },
          { seanceId: 's2', label: 'Scénario — Séance 2' },
        ],
      }),
    );

    expect(text(el, 'h2')).toBe(GRIMOIRE_TONE['common.lancer_le_vote']);
    expect(text(el, '.compose-confirm__field')).toContain(
      GRIMOIRE_TONE['calendar.compose_confirm_seance_label'],
    );
    expect(text(el, '.compose-confirm__select option')).toBe(
      GRIMOIRE_TONE['calendar.compose_confirm_seance_placeholder'],
    );
    expect(el.querySelector('.compose-confirm__warning')).toBeNull();
  });
});
