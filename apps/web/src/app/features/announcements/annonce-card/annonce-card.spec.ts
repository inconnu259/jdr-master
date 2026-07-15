import { TestBed } from '@angular/core/testing';
import type { AnnouncementDto } from '@master-jdr/shared';
import { AnnonceCard } from './annonce-card';

function makeAnnouncement(overrides: Partial<AnnouncementDto> = {}): AnnouncementDto {
  return {
    id: 'ann1',
    partieId: 'p1',
    scenarioId: null,
    text: 'Une annonce importante',
    createdAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

async function createComponent(announcement: AnnouncementDto, scopeLabel: string) {
  await TestBed.configureTestingModule({ imports: [AnnonceCard] }).compileComponents();
  const fixture = TestBed.createComponent(AnnonceCard);
  fixture.componentRef.setInput('announcement', announcement);
  fixture.componentRef.setInput('scopeLabel', scopeLabel);
  fixture.detectChanges();
  return fixture;
}

describe('AnnonceCard', () => {
  it("AC1/AC2 : affiche le texte de l'annonce", async () => {
    const fixture = await createComponent(
      makeAnnouncement({ text: 'Une annonce importante' }),
      'Toute la campagne',
    );

    expect(fixture.nativeElement.textContent).toContain('Une annonce importante');
  });

  it('AC4/AC5 : le libellé de portée est un texte visible dans le DOM, pas seulement un style', async () => {
    const fixture = await createComponent(makeAnnouncement(), 'Ce scénario');

    expect(fixture.nativeElement.textContent).toContain('Ce scénario');
  });

  it('affiche la date formatée', async () => {
    const fixture = await createComponent(
      makeAnnouncement({ createdAt: '2026-07-15T00:00:00.000Z' }),
      'Toute la campagne',
    );

    // Format court localisé (DatePipe) — on vérifie juste la présence d'un fragment de date
    // plausible (jour/mois/année séparés par '/'), pas le format exact (dépend de la locale du runner).
    expect(fixture.nativeElement.textContent).toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
  });
});
