import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateScenarioDto } from './update-scenario.dto';

describe('UpdateScenarioDto', () => {
  it('title absent (undefined) → valide (aucun champ à modifier)', async () => {
    const dto = plainToInstance(UpdateScenarioDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('title: null → invalide (colonne NOT NULL, jamais silencieusement accepté)', async () => {
    const dto = plainToInstance(UpdateScenarioDto, { title: null });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('title uniquement composé d’espaces → invalide', async () => {
    const dto = plainToInstance(UpdateScenarioDto, { title: '   ' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('title valide → aucune erreur', async () => {
    const dto = plainToInstance(UpdateScenarioDto, { title: 'Nouveau titre' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('dureeHeures au-delà de la borne → invalide', async () => {
    const dto = plainToInstance(UpdateScenarioDto, { dureeHeures: 100001 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'dureeHeures')).toBe(true);
  });

  it('dureeSeances au-delà de la borne → invalide', async () => {
    const dto = plainToInstance(UpdateScenarioDto, { dureeSeances: 10001 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'dureeSeances')).toBe(true);
  });

  it('description: null → valide (champ nullable en base, contrairement à title)', async () => {
    const dto = plainToInstance(UpdateScenarioDto, { description: null });
    expect(await validate(dto)).toHaveLength(0);
  });
});
