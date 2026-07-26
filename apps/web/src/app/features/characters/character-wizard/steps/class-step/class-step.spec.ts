import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { ClassStep } from './class-step';

const CLASSES: ContentEntryDto[] = [
  {
    key: 'chasseur',
    data: {
      label: 'Chasseur',
      description:
        'Les chasseurs abattent leurs proies grâce à leurs connaissances et à leur technique.',
      occupations: ['Barbare', 'Chasseur de monstres', 'Pisteur', 'Trappeur'],
      actions: ['Capturer', 'Chasser', 'Écorcher', 'Pêcher', 'Piéger', 'Pister', 'Traquer'],
      talents: [
        {
          name: 'Chasse',
          effect: {
            description: 'Nourrit le groupe selon le résultat du test',
            conditions: 'Avant le test de campement. Une fois par jour.',
          },
          description:
            'Les chasseurs se sont fait une spécialité de ramener des animaux sauvages pour nourrir leurs compagnons.',
        },
        {
          name: 'Transformation',
          effect: {
            description: 'Transforme une dépouille',
            conditions: "Avoir accès à la dépouille d'un monstre.",
          },
          description: 'Les chasseurs savent utiliser les dépouilles des monstres.',
        },
        {
          name: 'Traque',
          effect: {
            description: 'Découvre un monstre',
            conditions: "Avoir découvert les traces d'un monstre.",
          },
          description: "Les chasseurs savent remonter les traces d'un type de monstre particulier.",
        },
      ],
      requiresSpecialty: false,
    },
  },
  {
    key: 'artisan',
    data: {
      label: 'Artisan',
      description:
        'Ces spécialistes savent créer tout ce qui est joli, efficace ou simplement pratique.',
      talents: [
        {
          name: 'Création',
          effect: {
            description: 'Fabrique un objet',
            conditions: "Durée: encombrement de l'objet en jours. Coût: moitié de son prix.",
          },
          description: 'Les artisans gagnent leur vie en créant des objets de tout type.',
        },
      ],
      requiresSpecialty: true,
      specialtyLabel: "Type d'objet de spécialité",
    },
  },
];

const LANDSCAPES: ContentEntryDto[] = [
  { key: 'foret', data: { label: 'Forêt' } },
  { key: 'montagne', data: { label: 'Montagne' } },
];

const CLASSES_WITH_CHOICES: ContentEntryDto[] = [
  ...CLASSES,
  {
    key: 'guerisseur',
    data: {
      label: 'Guérisseur',
      description: 'Respectés de tous, les guérisseurs soignent les maladies.',
      talents: [
        {
          id: 'soins',
          name: 'Soins',
          effect: { description: 'Soigne des PV', conditions: '-' },
          attributes: ['INT', 'ESP'],
          description: 'Les guérisseurs utilisent des plantes et de l’eau.',
        },
        {
          id: 'dressage',
          name: 'Dressage',
          effect: { description: 'Deux animaux supplémentaires', conditions: '-' },
          attributes: [],
          description: 'Sans test.',
        },
      ],
      requiresSpecialty: false,
    },
  },
  {
    key: 'fermier',
    data: {
      label: 'Fermier',
      description: 'Vivant en accord avec la nature.',
      talents: [
        {
          id: 'metier-d-appoint',
          name: "Métier d'appoint",
          effect: { description: 'Talent emprunté', conditions: 'Selon talent' },
          attributes: [],
          description: 'Emprunte un talent.',
        },
      ],
      requiresSpecialty: false,
      requiredChoices: [
        {
          key: 'fermier-metier-appoint',
          talentId: 'metier-d-appoint',
          kind: 'eligible-talent',
          label: "Talent emprunté (Métier d'appoint)",
        },
      ],
    },
  },
  {
    key: 'ermite',
    data: {
      label: 'Ermite',
      description: 'Ces hommes étranges vivent à l’écart des cités.',
      talents: [
        {
          id: 'metamorphose',
          name: 'Métamorphose',
          effect: { description: 'Se transforme', conditions: '-' },
          attributes: [],
          description: 'Choisit un paysage.',
        },
      ],
      requiresSpecialty: false,
      requiredChoices: [
        {
          key: 'ermite-metamorphose',
          talentId: 'metamorphose',
          kind: 'landscape-flavor',
          label: 'Type de paysage (Métamorphose)',
        },
      ],
    },
  },
  {
    key: 'dresseur',
    data: {
      label: 'Dresseur',
      description: 'Les dresseurs apprivoisent les monstres.',
      talents: [
        {
          id: 'autorite',
          name: 'Autorité',
          effect: { description: 'Contrôle un monstre', conditions: '-' },
          attributes: [],
          description: 'Choisit un type de créature.',
        },
      ],
      requiresSpecialty: false,
      requiredChoices: [
        {
          key: 'dresseur-autorite',
          talentId: 'autorite',
          kind: 'closed-list',
          label: 'Type de créature (Autorité)',
          options: [
            { value: 'animaux', label: 'Animaux' },
            { value: 'demons', label: 'Démons' },
          ],
        },
      ],
    },
  },
  {
    key: 'meteomancien',
    data: {
      label: 'Météomancien',
      description: 'Les météomanciens prédisent la météo.',
      talents: [
        {
          id: 'climatophile',
          name: 'Climatophile',
          effect: { description: '+2 aux tests de climat favori', conditions: '-' },
          attributes: [],
          description: 'Un climat favori supplémentaire.',
        },
      ],
      requiresSpecialty: false,
      requiredChoices: [
        {
          key: 'meteomancien-climatophile',
          talentId: 'climatophile',
          kind: 'landscape-capability',
          label: 'Climat favori supplémentaire (Climatophile)',
        },
      ],
    },
  },
];

describe('ClassStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("sélection d'une classe → émet classIdChange et affiche les talents immédiatement", async () => {
    TestBed.configureTestingModule({ imports: [ClassStep] });
    const fixture = TestBed.createComponent(ClassStep);
    fixture.componentRef.setInput('classes', CLASSES);
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted: string[] = [];
    fixture.componentInstance.classIdChange.subscribe((k: string) => emitted.push(k));

    const buttons: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('button');
    buttons[0].click();
    expect(emitted).toEqual(['chasseur']);

    fixture.componentRef.setInput('classId', 'chasseur');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Chasse');
    expect(fixture.nativeElement.textContent).toContain('Transformation');
    expect(fixture.nativeElement.textContent).toContain('Traque');
    expect(fixture.nativeElement.textContent).toContain(
      'Les chasseurs abattent leurs proies grâce à leurs connaissances et à leur technique.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Les chasseurs se sont fait une spécialité de ramener des animaux sauvages pour nourrir leurs compagnons.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Les chasseurs savent utiliser les dépouilles des monstres.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      "Les chasseurs savent remonter les traces d'un type de monstre particulier.",
    );
    expect(fixture.nativeElement.textContent).toContain('Nourrit le groupe selon le résultat du test');
    expect(fixture.nativeElement.textContent).toContain('Transforme une dépouille');
    expect(fixture.nativeElement.textContent).toContain('Découvre un monstre');
  });

  it("sélection d'une classe → affiche les occupations et actions en texte de référence pur", async () => {
    TestBed.configureTestingModule({ imports: [ClassStep] });
    const fixture = TestBed.createComponent(ClassStep);
    fixture.componentRef.setInput('classes', CLASSES);
    fixture.componentRef.setInput('classId', 'chasseur');
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Barbare');
    expect(text).toContain('Chasseur de monstres');
    expect(text).toContain('Pisteur');
    expect(text).toContain('Trappeur');
    expect(text).toContain('Capturer');
    expect(text).toContain('Chasser');
    expect(text).toContain('Écorcher');
    expect(text).toContain('Pêcher');
    expect(text).toContain('Piéger');
    expect(text).toContain('Pister');
    expect(text).toContain('Traquer');

    // Texte de référence pur : aucun élément interactif (bouton/input/role="radio") sur ces listes.
    const occupationsList = fixture.nativeElement.querySelector('.class-step__occupations');
    const actionsList = fixture.nativeElement.querySelector('.class-step__actions');
    expect(occupationsList.querySelector('button, input, [role="radio"]')).toBeNull();
    expect(actionsList.querySelector('button, input, [role="radio"]')).toBeNull();
  });

  it('classe Artisan → affiche le sous-choix obligatoire de spécialité', async () => {
    TestBed.configureTestingModule({ imports: [ClassStep] });
    const fixture = TestBed.createComponent(ClassStep);
    fixture.componentRef.setInput('classes', CLASSES);
    fixture.componentRef.setInput('classId', 'artisan');
    fixture.detectChanges();
    await fixture.whenStable();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('#specialtyTypeId');
    expect(input).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(
      'Ces spécialistes savent créer tout ce qui est joli, efficace ou simplement pratique.',
    );
  });

  it('classe non-Artisan → pas de sous-choix de spécialité', async () => {
    TestBed.configureTestingModule({ imports: [ClassStep] });
    const fixture = TestBed.createComponent(ClassStep);
    fixture.componentRef.setInput('classes', CLASSES);
    fixture.componentRef.setInput('classId', 'chasseur');
    fixture.detectChanges();
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector('#specialtyTypeId');
    expect(input).toBeNull();
  });

  describe('Story 23.8 : choix requis à la création', () => {
    it('Fermier (eligible-talent) → propose uniquement les talents avec attributs non vides, hors classe courante', async () => {
      TestBed.configureTestingModule({ imports: [ClassStep] });
      const fixture = TestBed.createComponent(ClassStep);
      fixture.componentRef.setInput('classes', CLASSES_WITH_CHOICES);
      fixture.componentRef.setInput('classId', 'fermier');
      fixture.detectChanges();
      await fixture.whenStable();

      const select: HTMLSelectElement = fixture.nativeElement.querySelector(
        '#fermier-metier-appoint',
      );
      expect(select).toBeTruthy();
      const optionValues = Array.from(select.querySelectorAll('option')).map(
        (o: HTMLOptionElement) => o.value,
      );
      expect(optionValues).toContain('guerisseur:soins');
      expect(optionValues).not.toContain('guerisseur:dressage');
      expect(optionValues.some((v) => v.startsWith('fermier:'))).toBe(false);
    });

    it('Fermier (eligible-talent) → sélection émet classChoiceChange avec la clé composite classe:talentId', async () => {
      TestBed.configureTestingModule({ imports: [ClassStep] });
      const fixture = TestBed.createComponent(ClassStep);
      fixture.componentRef.setInput('classes', CLASSES_WITH_CHOICES);
      fixture.componentRef.setInput('classId', 'fermier');
      fixture.detectChanges();
      await fixture.whenStable();

      const emitted: { key: string; value: string }[] = [];
      fixture.componentInstance.classChoiceChange.subscribe((p: { key: string; value: string }) =>
        emitted.push(p),
      );
      const select: HTMLSelectElement = fixture.nativeElement.querySelector(
        '#fermier-metier-appoint',
      );
      select.value = 'guerisseur:soins';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(emitted).toEqual([{ key: 'fermier-metier-appoint', value: 'guerisseur:soins' }]);
    });

    it('Ermite (landscape-flavor) → menu peuplé depuis le catalogue landscape', async () => {
      TestBed.configureTestingModule({ imports: [ClassStep] });
      const fixture = TestBed.createComponent(ClassStep);
      fixture.componentRef.setInput('classes', CLASSES_WITH_CHOICES);
      fixture.componentRef.setInput('classId', 'ermite');
      fixture.componentRef.setInput('landscapes', LANDSCAPES);
      fixture.detectChanges();
      await fixture.whenStable();

      const select: HTMLSelectElement = fixture.nativeElement.querySelector(
        '#ermite-metamorphose',
      );
      const labels = Array.from(select.querySelectorAll('option')).map(
        (o: HTMLOptionElement) => o.textContent?.trim(),
      );
      expect(labels).toContain('Forêt');
      expect(labels).toContain('Montagne');
    });

    it('Dresseur (closed-list) → menu peuplé depuis requiredChoices[].options', async () => {
      TestBed.configureTestingModule({ imports: [ClassStep] });
      const fixture = TestBed.createComponent(ClassStep);
      fixture.componentRef.setInput('classes', CLASSES_WITH_CHOICES);
      fixture.componentRef.setInput('classId', 'dresseur');
      fixture.detectChanges();
      await fixture.whenStable();

      const select: HTMLSelectElement = fixture.nativeElement.querySelector('#dresseur-autorite');
      const optionValues = Array.from(select.querySelectorAll('option')).map(
        (o: HTMLOptionElement) => o.value,
      );
      expect(optionValues).toContain('animaux');
      expect(optionValues).toContain('demons');
    });

    it('Météomancien (landscape-capability) → émet classCapabilityChange (pas classChoiceChange)', async () => {
      TestBed.configureTestingModule({ imports: [ClassStep] });
      const fixture = TestBed.createComponent(ClassStep);
      fixture.componentRef.setInput('classes', CLASSES_WITH_CHOICES);
      fixture.componentRef.setInput('classId', 'meteomancien');
      fixture.componentRef.setInput('landscapes', LANDSCAPES);
      fixture.detectChanges();
      await fixture.whenStable();

      const capabilityEmitted: { key: string; landscapeKey: string }[] = [];
      const choiceEmitted: { key: string; value: string }[] = [];
      fixture.componentInstance.classCapabilityChange.subscribe(
        (p: { key: string; landscapeKey: string }) => capabilityEmitted.push(p),
      );
      fixture.componentInstance.classChoiceChange.subscribe((p: { key: string; value: string }) =>
        choiceEmitted.push(p),
      );

      const select: HTMLSelectElement = fixture.nativeElement.querySelector(
        '#meteomancien-climatophile',
      );
      select.value = 'foret';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(capabilityEmitted).toEqual([
        { key: 'meteomancien-climatophile', landscapeKey: 'foret' },
      ]);
      expect(choiceEmitted).toEqual([]);
    });

    it('revue de code (2026-07-26) : kind imprévu (contenu malformé) → aucune option, pas de crash de rendu', async () => {
      TestBed.configureTestingModule({ imports: [ClassStep] });
      const fixture = TestBed.createComponent(ClassStep);
      const malformedClasses: ContentEntryDto[] = [
        ...CLASSES_WITH_CHOICES,
        {
          key: 'classe-malformee',
          data: {
            label: 'Classe malformée',
            talents: [],
            requiredChoices: [
              { key: 'choix-inconnu', talentId: 'x', kind: 'kind-inconnu', label: 'Choix inconnu' },
            ],
          },
        },
      ];
      fixture.componentRef.setInput('classes', malformedClasses);
      fixture.componentRef.setInput('classId', 'classe-malformee');

      expect(() => fixture.detectChanges()).not.toThrow();
      await fixture.whenStable();

      const select: HTMLSelectElement = fixture.nativeElement.querySelector('#choix-inconnu');
      expect(select).toBeTruthy();
      expect(select.querySelectorAll('option')).toHaveLength(1); // seulement "-- Choisir --"
    });
  });
});
