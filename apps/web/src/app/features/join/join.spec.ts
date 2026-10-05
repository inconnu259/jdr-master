import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Join } from './join';
import { AuthService } from '../../core/auth/auth.service';
import { JoinService } from '../../core/join/join.service';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';

// Story 34.2 : le lien « Créer un compte » de la page de connexion est retiré, celui du parcours
// « rejoindre par lien » (avec son jeton) doit rester.
describe('Join — lien « Créer un compte » conservé (Story 34.2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('visiteur non connecté, lien valide → lien vers /register avec le jeton', async () => {
    await TestBed.configureTestingModule({
      imports: [Join],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token: 'abc123' }) } },
        },
        {
          provide: AuthService,
          useValue: {
            currentUser: signal(null),
            loadSession: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: JoinService,
          useValue: {
            preview: vi.fn().mockResolvedValue({
              valid: true,
              partieName: 'Partie test',
              gameSystemId: 'ryuutama',
            }),
          },
        },
        { provide: MyPartiesService, useValue: {} },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Join);
    fixture.detectChanges();
    // ngOnInit est asynchrone (loadSession puis preview) : on laisse les promesses se résoudre.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();

    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find(
      (a) => a.textContent?.includes('Créer un compte'),
    );
    expect(link).toBeTruthy();
    const href = link!.getAttribute('href')!;
    expect(href).toContain('/register');
    expect(href).toContain('token=abc123');
  });
});

// Story 34.3 — « rejoindre » adopte la mise en page des écrans d'authentification.
describe('Join — structure, états et annonces (Story 34.3)', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(options: {
    preview: unknown | Error;
    user?: { displayName: string } | null;
    join?: ReturnType<typeof vi.fn>;
  }) {
    await TestBed.configureTestingModule({
      imports: [Join],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token: 'abc123' }) } },
        },
        {
          provide: AuthService,
          useValue: {
            currentUser: signal(options.user ?? null),
            loadSession: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: JoinService,
          useValue: {
            preview:
              options.preview instanceof Error
                ? vi.fn().mockRejectedValue(options.preview)
                : vi.fn().mockResolvedValue(options.preview),
            join: options.join ?? vi.fn(),
          },
        },
        { provide: MyPartiesService, useValue: { refreshPlayerParties: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Join);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  async function settle(fixture: { detectChanges(): void }) {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();
  }

  const validPreview = { valid: true, partieName: 'Le Convoi du Nord', gameSystemId: 'ryuutama' };

  it('chargement : « Chargement… » dans un conteneur role="status" persistant, sans h1 ni action', async () => {
    const { fixture, el } = await setup({ preview: validPreview });
    const status = el.querySelector('[role="status"]') as HTMLElement;

    expect(status.textContent).toContain('Chargement…');
    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('.auth-primary')).toBeNull();

    await settle(fixture);

    // Le conteneur est resté le même élément (annonce non perdue) et s'est vidé.
    expect(el.querySelector('[role="status"]')).toBe(status);
    expect(status.textContent?.trim()).toBe('');
  });

  it('visiteur, lien valide : un h1 dans un <main>, « Créer un compte » principal, « J’ai déjà un compte » secondaire', async () => {
    const { fixture, el } = await setup({ preview: validPreview });
    await settle(fixture);

    const h1s = el.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent?.trim()).toBe('Rejoindre « Le Convoi du Nord »');
    expect(el.querySelector('main')?.getAttribute('aria-labelledby')).toBe(h1s[0].id);
    const primary = el.querySelectorAll('.auth-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent?.trim()).toBe('Créer un compte');
    expect(primary[0].getAttribute('href')).toContain('token=abc123');
    const secondary = el.querySelectorAll('.auth-secondary-actions a');
    expect(secondary.length).toBe(1);
    expect(secondary[0].textContent?.trim()).toBe("J'ai déjà un compte");
    expect(secondary[0].getAttribute('href')).toBe('/login');
  });

  it('connecté : « Rejoindre » seul, sans rangée d’actions secondaires', async () => {
    const { fixture, el } = await setup({
      preview: validPreview,
      user: { displayName: 'Inès' },
    });
    await settle(fixture);

    const primary = el.querySelectorAll('.auth-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent?.trim()).toBe('Rejoindre');
    expect(el.querySelector('.auth-secondary-actions')).toBeNull();
  });

  it('connecté, échec de join() : message role="alert" sous le texte', async () => {
    const { fixture, el } = await setup({
      preview: validPreview,
      user: { displayName: 'Inès' },
      join: vi.fn().mockRejectedValue(new Error('409')),
    });
    await settle(fixture);

    (el.querySelector('.auth-primary') as HTMLButtonElement).click();
    await settle(fixture);

    expect(el.querySelector('p.error[role="alert"]')?.textContent).toContain(
      'Impossible de rejoindre',
    );
  });

  it('lien expiré : raison en texte simple sans role="alert", aucune action', async () => {
    const { fixture, el } = await setup({
      preview: { ...validPreview, valid: false, reason: 'Lien expiré.' },
    });
    await settle(fixture);

    expect(el.querySelector('p.error')?.textContent?.trim()).toBe('Lien expiré.');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('.auth-primary')).toBeNull();
    expect(el.querySelector('.auth-secondary-actions')).toBeNull();
    expect(el.querySelectorAll('h1').length).toBe(1);
  });

  it('lien introuvable : h1 « Lien introuvable » et message, aucune action', async () => {
    const { fixture, el } = await setup({ preview: new Error('404') });
    await settle(fixture);

    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Lien introuvable');
    expect(el.textContent).toContain("Ce lien d'invitation n'existe pas.");
    expect(el.querySelector('.auth-primary')).toBeNull();
    expect(el.querySelector('main')?.getAttribute('aria-labelledby')).toBe(
      el.querySelector('h1')?.id,
    );
  });
});
