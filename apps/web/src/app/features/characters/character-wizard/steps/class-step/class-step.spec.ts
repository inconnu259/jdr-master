import { TestBed } from '@angular/core/testing';
import type { ContentEntryDto } from '@master-jdr/shared';
import { ClassStep } from './class-step';

const CLASSES: ContentEntryDto[] = [
  {
    key: 'chasseur',
    data: {
      label: 'Chasseur',
      talents: [
        { name: 'Pistage', effect: 'Suit une piste' },
        { name: 'Camouflage', effect: 'Se dissimule' },
        { name: 'Piège', effect: 'Pose un piège' },
      ],
      requiresSpecialty: false,
    },
  },
  {
    key: 'artisan',
    data: {
      label: 'Artisan',
      talents: [{ name: 'Création', effect: 'Fabrique un objet' }],
      requiresSpecialty: true,
      specialtyLabel: "Type d'objet de spécialité",
    },
  },
];

describe('ClassStep', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sélection d\'une classe → émet classIdChange et affiche les talents immédiatement', async () => {
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

    expect(fixture.nativeElement.textContent).toContain('Pistage');
    expect(fixture.nativeElement.textContent).toContain('Camouflage');
    expect(fixture.nativeElement.textContent).toContain('Piège');
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
