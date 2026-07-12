import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateScenarioDto } from './create-scenario.dto';

describe('CreateScenarioDto', () => {
  it('title valide seul → aucune erreur', async () => {
    const dto = plainToInstance(CreateScenarioDto, {
      title: 'Le Marché aux Ombres',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('title uniquement composé d’espaces → invalide', async () => {
    const dto = plainToInstance(CreateScenarioDto, { title: '   ' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('title absent → invalide', async () => {
    const dto = plainToInstance(CreateScenarioDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('dureeHeures au-delà de la borne → invalide', async () => {
    const dto = plainToInstance(CreateScenarioDto, {
      title: 'Test',
      dureeHeures: 100001,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'dureeHeures')).toBe(true);
  });

  it('dureeSeances au-delà de la borne → invalide', async () => {
    const dto = plainToInstance(CreateScenarioDto, {
      title: 'Test',
      dureeSeances: 10001,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'dureeSeances')).toBe(true);
  });
});
