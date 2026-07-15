import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAnnouncementDto } from './create-announcement.dto';

describe('CreateAnnouncementDto', () => {
  it('text seul, sans scenarioId → aucune erreur', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, { text: 'Une annonce' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('text + scenarioId UUID valide → aucune erreur', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      text: 'Une annonce',
      scenarioId: '11111111-1111-4111-a111-111111111111',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('text absent → invalide', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'text')).toBe(true);
  });

  it("text au-delà de la borne (MaxLength, revue de code) → invalide", async () => {
    const dto = plainToInstance(CreateAnnouncementDto, { text: 'x'.repeat(5001) });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'text')).toBe(true);
  });

  it('text à la borne exacte (5000) → aucune erreur', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, { text: 'x'.repeat(5000) });
    expect(await validate(dto)).toHaveLength(0);
  });

  it(
    'scenarioId envoyé explicitement à null (revue de code) → invalide, ' +
      'rejeté proprement plutôt que de passer silencieusement',
    async () => {
      const dto = plainToInstance(CreateAnnouncementDto, {
        text: 'Une annonce',
        scenarioId: null,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'scenarioId')).toBe(true);
    },
  );

  it('scenarioId malformé (pas un UUID) → invalide', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      text: 'Une annonce',
      scenarioId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'scenarioId')).toBe(true);
  });
});
