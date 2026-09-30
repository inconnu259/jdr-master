import { TestBed } from '@angular/core/testing';
import { Component, input, signal } from '@angular/core';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { AuthUser, PartieDto } from '@master-jdr/shared';
import { HommeDragonPage } from './homme-dragon-page';
import { HommeDragonSheet } from '../homme-dragon-sheet/homme-dragon-sheet';
import { PartiesService } from '../../../core/parties/parties.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';

@Component({ selector: 'app-homme-dragon-sheet', template: '<p class="sheet-stub"></p>' })
class SheetStub {
  readonly partieId = input.required<string>();
  readonly partieName = input.required<string>();
}

function makePartie(overrides: Partial<PartieDto> = {}): PartieDto {
  return {
    id: 'p1',
    name: 'Le Convoi du Nord',
    kind: 'CAMPAGNE_EPISODIQUE',
    gameSystemId: 'ryuutama',
    description: null,
    mjId: 'mj1',
    createdAt: '2026-07-01T00:00:00.000Z',
    nextSessionDate: null,
    nextSessionSlot: null,
    role: 'mj',
    status: 'A_VENIR',
    isFavorite: false,
    coverImageVersion: null,
    ...overrides,
  };
}

async function createPage(options: { partie?: PartieDto; userId?: string; getRejects?: boolean }) {
  const partiesSvc = {
    get: options.getRejects
      ? vi.fn().mockRejectedValue(new Error('404'))
      : vi.fn().mockResolvedValue(options.partie ?? makePartie()),
  };
  await TestBed.configureTestingModule({
    imports: [HommeDragonPage],
    providers: [
      provideRouter([]),
      { provide: PartiesService, useValue: partiesSvc },
      {
        provide: AuthService,
        useValue: { currentUser: signal({ id: options.userId ?? 'mj1' } as AuthUser) },
      },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', 'p1']]) } } },
    ],
  })
    .overrideComponent(HommeDragonPage, {
      remove: { imports: [HommeDragonSheet] },
      add: { imports: [SheetStub] },
    })
    .compileComponents();
  const router = TestBed.inject(Router);
  const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(HommeDragonPage);
  fixture.detectChanges();
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  return { fixture, partiesSvc, navigateSpy };
}

describe('HommeDragonPage (Story 33.5)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('MJ d’une partie Ryuutama → héberge la fiche avec partieId/partieName, sans redirection', async () => {
    const { fixture, navigateSpy } = await createPage({});

    expect(fixture.nativeElement.querySelector('.sheet-stub')).not.toBeNull();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('pose le bandeau contextuel (titre + nom de la partie)', async () => {
    await createPage({});

    const nav = TestBed.inject(ContextualNavService);
    expect(nav.title()).toBe('Homme Dragon');
    expect(nav.subtitle()).toBe('Le Convoi du Nord');
  });

  it('utilisateur non MJ → redirection vers /parties/:id, fiche jamais rendue', async () => {
    const { fixture, navigateSpy } = await createPage({ userId: 'joueur1' });

    expect(navigateSpy).toHaveBeenCalledWith(['/parties', 'p1'], { replaceUrl: true });
    expect(fixture.nativeElement.querySelector('.sheet-stub')).toBeNull();
  });

  it('MJ d’une partie hors Ryuutama → redirection vers /parties/:id', async () => {
    const { fixture, navigateSpy } = await createPage({
      partie: makePartie({ gameSystemId: 'draconis' }),
    });

    expect(navigateSpy).toHaveBeenCalledWith(['/parties', 'p1'], { replaceUrl: true });
    expect(fixture.nativeElement.querySelector('.sheet-stub')).toBeNull();
  });

  it('partie illisible → message d’erreur et lien de retour, pas de redirection ni de fiche', async () => {
    const { fixture, navigateSpy } = await createPage({ getRejects: true });

    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.sheet-stub')).toBeNull();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
