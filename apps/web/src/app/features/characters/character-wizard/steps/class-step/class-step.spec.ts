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
      talents: [
        {
          name: 'Chasse',
          effect: 'Nourrit le groupe selon le résultat du test',
          description:
            'Les chasseurs se sont fait une spécialité de ramener des animaux sauvages pour nourrir leurs compagnons.',
        },
        {
          name: 'Transformation',
          effect: 'Transforme une dépouille',
          description: 'Les chasseurs savent utiliser les dépouilles des monstres.',
        },
        {
          name: 'Traque',
          effect: 'Découvre un monstre',
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
          effect: 'Fabrique un objet',
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
