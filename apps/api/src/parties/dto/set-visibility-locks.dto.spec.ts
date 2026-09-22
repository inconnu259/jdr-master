// Requis par `@ValidateNested`/`@Type(() => VisibilityLockPathInput)` (class-transformer) quand ce
// fichier est le seul chargé par Jest — même patron que `create-availability-batch.dto.spec.ts`.
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetVisibilityLocksDto } from './set-visibility-locks.dto';

describe('SetVisibilityLocksDto', () => {
  it('accepte un jeu de chemins valides (clé simple + sous-champ)', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, {
      paths: [{ fieldKey: 'classId' }, { fieldKey: 'attributes', subField: 'AGI' }],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepte un tableau vide (tout déverrouiller)', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, { paths: [] });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejette un fieldKey contenant un point (réservé au séparateur clé/sous-champ)', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, {
      paths: [{ fieldKey: 'attributes.AGI' }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejette un fieldKey vide', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, { paths: [{ fieldKey: '' }] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejette plus de 50 chemins', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, {
      paths: Array.from({ length: 51 }, (_, i) => ({ fieldKey: `k${i}` })),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'paths')).toBe(true);
  });

  it('subField optionnel : absent ne lève aucune erreur', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, { paths: [{ fieldKey: 'narrative' }] });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejette levelUps (hors périmètre, décision utilisateur 2026-09-22) — verrouiller cette clé ferait chuter CharacterDto.level sans jamais l'annoncer dans hiddenFields", async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, { paths: [{ fieldKey: 'levelUps' }] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'paths')).toBe(true);
  });

  it('rejette toute autre clé hors des 10 déclarées lockable (ex. classChoices)', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, { paths: [{ fieldKey: 'classChoices' }] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'paths')).toBe(true);
  });

  it('rejette un fieldKey de plus de 64 caractères', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, {
      paths: [{ fieldKey: 'a'.repeat(65) }],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'paths')).toBe(true);
  });

  it('rejette un subField de plus de 64 caractères', async () => {
    const dto = plainToInstance(SetVisibilityLocksDto, {
      paths: [{ fieldKey: 'attributes', subField: 'a'.repeat(65) }],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'paths')).toBe(true);
  });
});
