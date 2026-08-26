import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateAvailabilityBatchDto } from './create-availability-batch.dto';

const validItem = {
  kind: 'AVAILABLE',
  recurKind: 'RECURRING',
  dayOfWeek: 3,
  slot: 'EVENING',
  expiresAt: '2027-01-01T00:00:00.000Z',
};

describe('CreateAvailabilityBatchDto', () => {
  it('lot d’un élément valide → aucune erreur', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {
      items: [validItem],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('lot vide (AC9) → invalide, message distinct du cas plafond dépassé', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, { items: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
    const messages = Object.values(errors.find((e) => e.property === 'items')!.constraints ?? {});
    expect(messages).toContain('Le lot ne peut pas être vide');
  });

  it('lot dépassant le plafond (AC9) → invalide, message distinct du cas lot vide', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {
      items: Array.from({ length: 43 }, () => validItem),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
    const messages = Object.values(errors.find((e) => e.property === 'items')!.constraints ?? {});
    expect(messages).toContain('Le lot dépasse le plafond de 42 créneaux');
  });

  it('lot au plafond exact (42) → aucune erreur', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {
      items: Array.from({ length: 42 }, () => validItem),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('élément invalide dans le lot (kind absent) → invalide, remonté via items', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {
      items: [{ ...validItem, kind: undefined }],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('élément PUNCTUAL sans startDate/endDate → invalide', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {
      items: [
        {
          kind: 'AVAILABLE',
          recurKind: 'PUNCTUAL',
          slot: 'EVENING',
          expiresAt: '2027-01-01T00:00:00.000Z',
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('items absent du body → invalide', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });
});

// ─── conflictResolution (Story 36.4, D-18) ───────────────────────────────────

describe('CreateAvailabilityBatchDto — conflictResolution (Story 36.4)', () => {
  it('item sans conflictResolution → valide (absence = aucune résolution demandée)', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {
      items: [validItem],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['overwrite', 'keep'])('conflictResolution « %s » → valide', async (resolution) => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {
      items: [{ ...validItem, conflictResolution: resolution }],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('AC16 : une valeur hors union fermée est refusée (jamais une chaîne libre)', async () => {
    const dto = plainToInstance(CreateAvailabilityBatchDto, {
      items: [{ ...validItem, conflictResolution: 'delete-everything' }],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
