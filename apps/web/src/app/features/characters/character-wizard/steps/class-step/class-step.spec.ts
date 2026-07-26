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
});
