import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ExportCharacterPdfDto } from './export-character-pdf.dto';

describe('ExportCharacterPdfDto', () => {
  it.each(['editable', '2pages'])('accepte format=%s', async (format) => {
    const dto = plainToInstance(ExportCharacterPdfDto, { format });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejette un format inconnu', async () => {
    const dto = plainToInstance(ExportCharacterPdfDto, { format: '1page' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
