import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { vi } from 'vitest';
import { appConfig } from './app.config';
import { THEMES } from './core/theme/tones';

// Câblage RÉEL de l'application (story 34.3) : aucun autre test ne voit la disparition de
// l'initialiseur de thème, de la stratégie de titre ou d'une propriété `title` de route.
describe('appConfig — câblage du thème de la visite et des titres d’onglet (Story 34.3)', () => {
  const announce = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    announce.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.className = '';
    document.title = '';
    TestBed.resetTestingModule();
  });

  function setup() {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, { provide: LiveAnnouncer, useValue: { announce } }],
    });
  }

  it('les initialiseurs d’application posent un thème sur <body>, sans appel manuel, sans rien écrire', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setup();

    await TestBed.inject(ApplicationInitStatus).donePromise;

    const classes = Array.from(document.body.classList).filter((c) => c.startsWith('theme-'));
    expect(classes).toEqual([`theme-${THEMES[THEMES.length - 1]}`]);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem('jdr-theme')).toBeNull();
  });

  const TITLES: [string, string][] = [
    ['/login', 'Connexion'],
    ['/register', 'Créer un compte'],
    ['/forgot-password', 'Mot de passe oublié'],
    ['/reset-password/x', 'Nouveau mot de passe'],
    ['/confirm-email-change/x', "Confirmer le changement d'e-mail"],
    ['/rollback-email-change/x', "Annuler le changement d'e-mail"],
    ['/join/x', 'Rejoindre'],
  ];

  for (const [url, title] of TITLES) {
    it(`${url} donne « Dés Dispos – ${title} » et l’annonce`, async () => {
      setup();
      await TestBed.inject(ApplicationInitStatus).donePromise;

      await TestBed.inject(Router).navigateByUrl(url);

      expect(document.title).toBe(`Dés Dispos – ${title}`);
      expect(announce).toHaveBeenCalledWith(`Dés Dispos – ${title}`);
    });
  }
});
