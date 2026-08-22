import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { VoteAnswer } from '@master-jdr/shared';
import { VoteAnswerPicker } from './vote-answer-picker';
import type { VoteParticipation } from '../poll-track.utils';

/**
 * Story 36.7 — le sélecteur de réponse de vote.
 *
 * Le composant est de RENDU PUR : il n'injecte aucun service et n'appelle rien. Ces tests
 * n'ont donc besoin d'aucun mock — ils vérifient ce qui est rendu et ce qui est émis.
 */

function vote(over: Partial<VoteParticipation> = {}): VoteParticipation {
  return {
    partieId: 'partie-1',
    pollId: 'poll-1',
    optionId: 'o1',
    yes: 1,
    maybe: 0,
    no: 0,
    total: 4,
    myAnswer: null,
    ...over,
  };
}

async function create(over: Partial<VoteParticipation> = {}, busy = false) {
  const fixture = TestBed.createComponent(VoteAnswerPicker);
  fixture.componentRef.setInput('vote', vote(over));
  fixture.componentRef.setInput('slotLabel', 'ven. 28 août — soir');
  fixture.componentRef.setInput('busy', busy);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function options(fixture: { nativeElement: HTMLElement }): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll<HTMLButtonElement>('.opt2--answer')];
}

function withdrawBtn(fixture: { nativeElement: HTMLElement }): HTMLButtonElement | null {
  return fixture.nativeElement.querySelector<HTMLButtonElement>('.opt2--withdraw');
}

describe('VoteAnswerPicker', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [VoteAnswerPicker] }));

  it('AC1 — propose oui, peut-être, non, dans CET ordre', async () => {
    // L'ordre est celui du contrat d'UI (`contrat-ui-calendrier.html:628-631`), et NON celui de
    // `PollResponseComponent.VOTE_OPTIONS` (YES, NO, MAYBE) — deux écrans, deux ordres.
    const fixture = await create();
    expect(options(fixture).map((b) => b.textContent?.trim())).toEqual(['oui', 'peut-être', 'non']);
  });

  it('AC1 — l’entête nomme le jour et le créneau concernés', async () => {
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('.picker__head')?.textContent).toContain(
      'ven. 28 août — soir',
    );
  });

  it('AC1 — choisir une réponse l’émet, une seule fois', async () => {
    const fixture = await create();
    const emitted: VoteAnswer[] = [];
    fixture.componentInstance.answerChosen.subscribe((a: VoteAnswer) => emitted.push(a));

    options(fixture)[1].click();

    expect(emitted).toEqual(['MAYBE']);
  });

  it('AC2 — ma réponse courante est marquée, et pas seulement par la couleur', async () => {
    const fixture = await create({ myAnswer: 'YES' });
    const [oui, peutEtre, non] = options(fixture);

    expect(oui.classList.contains('sel')).toBe(true);
    expect(oui.getAttribute('aria-checked')).toBe('true');
    expect(peutEtre.getAttribute('aria-checked')).toBe('false');
    expect(non.getAttribute('aria-checked')).toBe('false');
  });

  it('AC2 — « Retirer ma réponse » n’apparaît QUE si j’ai réellement répondu', async () => {
    // Défaut que `PollResponseComponent` avait dû corriger en revue (story 30.1) : proposer un
    // retrait sur une réponse jamais posée n'a rien à retirer.
    expect(withdrawBtn(await create({ myAnswer: null }))).toBeNull();
    expect(withdrawBtn(await create({ myAnswer: 'NO' }))).toBeTruthy();
  });

  it('AC2 — demander le retrait l’émet', async () => {
    const fixture = await create({ myAnswer: 'NO' });
    let count = 0;
    fixture.componentInstance.withdrawRequested.subscribe(() => count++);

    withdrawBtn(fixture)!.click();

    expect(count).toBe(1);
  });

  it('AC11 — pendant une écriture, toutes les entrées sont désactivées', async () => {
    const fixture = await create({ myAnswer: 'YES' }, true);
    expect(options(fixture).every((b) => b.disabled)).toBe(true);
    expect(withdrawBtn(fixture)!.disabled).toBe(true);
  });

  it('AC11 — une entrée désactivée n’émet rien', async () => {
    const fixture = await create({ myAnswer: 'YES' }, true);
    const emitted: VoteAnswer[] = [];
    fixture.componentInstance.answerChosen.subscribe((a: VoteAnswer) => emitted.push(a));

    options(fixture)[0].click();

    expect(emitted).toEqual([]);
  });

  it('AC13 — le sélecteur porte un nom accessible qui dit le jour et le créneau', async () => {
    const fixture = await create();
    const menu = fixture.nativeElement.querySelector('.picker');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(menu?.getAttribute('aria-label')).toContain('ven. 28 août — soir');
  });

  it('AC13 — chaque choix est un menuitemradio, le retrait un menuitem', async () => {
    const fixture = await create({ myAnswer: 'YES' });
    expect(options(fixture).every((b) => b.getAttribute('role') === 'menuitemradio')).toBe(true);
    expect(withdrawBtn(fixture)!.getAttribute('role')).toBe('menuitem');
  });
});
