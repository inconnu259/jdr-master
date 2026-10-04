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
