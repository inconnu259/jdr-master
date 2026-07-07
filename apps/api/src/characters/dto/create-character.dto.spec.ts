import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCharacterDto } from './create-character.dto';

describe('CreateCharacterDto', () => {
  it('sheetData objet non vide → valide', async () => {
    const dto = plainToInstance(CreateCharacterDto, {
      gameSystemId: 'ryuutama',
      sheetData: { classId: 'chasseur' },
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('sheetData: {} (objet vide) → invalide', async () => {
    const dto = plainToInstance(CreateCharacterDto, {
      gameSystemId: 'ryuutama',
      sheetData: {},
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sheetData')).toBe(true);
  });

  it('sheetData: [] (tableau non vide) → invalide', async () => {
    const dto = plainToInstance(CreateCharacterDto, {
      gameSystemId: 'ryuutama',
      sheetData: ['classId'],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sheetData')).toBe(true);
  });

  it('sheetData: null → invalide', async () => {
    const dto = plainToInstance(CreateCharacterDto, {
      gameSystemId: 'ryuutama',
      sheetData: null,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'sheetData')).toBe(true);
  });
});
