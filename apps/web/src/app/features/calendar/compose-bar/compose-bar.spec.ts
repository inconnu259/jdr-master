import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ComposeBar } from './compose-bar';

/** Story 36.10 — la barre persistante du mode de composition. Composant de rendu pur. */
describe('ComposeBar (Story 36.10)', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function render(
    inputs: Partial<{
      count: number;
      targetLabel: string;
      busy: boolean;
      canConfirm: boolean;
      blockedReason: string;
    }> = {},
  ) {
    await TestBed.configureTestingModule({
      imports: [ComposeBar],
      providers: [provideAnimationsAsync()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ComposeBar);
    fixture.componentRef.setInput('count', inputs.count ?? 0);
    fixture.componentRef.setInput(
      'targetLabel',
      inputs.targetLabel ?? 'Créneaux d’un nouveau vote',
    );
    fixture.componentRef.setInput('canConfirm', inputs.canConfirm ?? true);
    if (inputs.busy !== undefined) fixture.componentRef.setInput('busy', inputs.busy);
    if (inputs.blockedReason !== undefined)
      fixture.componentRef.setInput('blockedReason', inputs.blockedReason);
    fixture.detectChanges();
    return fixture;
  }

  it('AC1 — porte un rôle de barre d’outils nommée', async () => {
    const fixture = await render();
    const bar = fixture.nativeElement.querySelector('.compose-bar');
    expect(bar.getAttribute('role')).toBe('toolbar');
    expect(bar.getAttribute('aria-label')).toBeTruthy();
  });

  it('AC1 — rendue même à zéro créneau : c’est la seule sortie visible du mode', async () => {
    const fixture = await render({ count: 0 });
    expect(fixture.nativeElement.querySelector('.compose-bar')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Aucun créneau désigné');
  });

  it('AC16 — le compte est annoncé, et accordé au singulier comme au pluriel', async () => {
    const one = await render({ count: 1 });
    const live = one.nativeElement.querySelector('[aria-live="polite"]');
    expect(live.textContent.trim()).toBe('1 créneau désigné');

    TestBed.resetTestingModule();
    const many = await render({ count: 3 });
    expect(many.nativeElement.querySelector('[aria-live="polite"]').textContent.trim()).toBe(
      '3 créneaux désignés',
    );
  });

  it('nomme ce que la composition vise', async () => {
    const fixture = await render({ targetLabel: 'Créneaux du vote : Chapitre 1' });
    expect(fixture.nativeElement.textContent).toContain('Créneaux du vote : Chapitre 1');
  });

  it('AC1 — validation impossible : bouton désactivé ET raison affichée, jamais inerte en silence', async () => {
    const fixture = await render({
      canConfirm: false,
      blockedReason: 'Un vote demande au moins deux créneaux.',
    });
    const confirm: HTMLButtonElement = fixture.nativeElement.querySelector('.compose-bar__confirm');
    expect(confirm.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.compose-bar__blocked').textContent).toContain(
      'au moins deux',
    );
  });

  it('busy désactive les DEUX boutons (pas de double validation, pas de sortie en cours d’écriture)', async () => {
    const fixture = await render({ busy: true, count: 2 });
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('émet `confirmed` et `cancelled`, et n’écrit rien lui-même', async () => {
    const fixture = await render({ count: 2 });
    const confirmed = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);

    fixture.nativeElement.querySelector('.compose-bar__confirm').click();
    [...fixture.nativeElement.querySelectorAll('button')]
      .find((b: HTMLButtonElement) => b.textContent?.trim() === 'Annuler')!
      .click();

    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
});
