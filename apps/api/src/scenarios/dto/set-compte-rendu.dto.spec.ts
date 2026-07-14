import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetCompteRenduDto } from './set-compte-rendu.dto';

describe('SetCompteRenduDto', () => {
  it('compteRendu valide → aucune erreur', async () => {
    const dto = plainToInstance(SetCompteRenduDto, {
      compteRendu: 'Les PJ ont vaincu le dragon.',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('compteRendu au-delà de la borne (5000) → invalide', async () => {
    const dto = plainToInstance(SetCompteRenduDto, {
      compteRendu: 'a'.repeat(5001),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'compteRendu')).toBe(true);
  });

  it('compteRendu à exactement la borne (5000) → aucune erreur', async () => {
    const dto = plainToInstance(SetCompteRenduDto, {
      compteRendu: 'a'.repeat(5000),
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
