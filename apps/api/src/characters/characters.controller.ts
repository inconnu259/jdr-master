import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';
import { CharacterService } from './character.service';
import { RyuutamaPdfService } from './ryuutama-pdf.service';
import { ExportCharacterPdfDto } from './dto/export-character-pdf.dto';

@UseGuards(AuthenticatedGuard)
@Controller('characters')
export class CharactersController {
  constructor(
    private readonly characters: CharacterService,
    private readonly ryuutamaPdf: RyuutamaPdfService,
  ) {}

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.findOne(id, user.id);
  }

  @Get(':id/export.pdf')
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExportCharacterPdfDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const character = await this.characters.findOne(id, user.id);
    if (character.gameSystemId !== RYUUTAMA_ID) {
      throw new BadRequestException(
        `Export PDF non supporté pour le système de jeu "${character.gameSystemId}"`,
      );
    }
    const pdfBytes = await this.ryuutamaPdf.fillCharacterPdf(
      character,
      query.format,
    );
    return new StreamableFile(pdfBytes, {
      type: 'application/pdf',
      disposition: `attachment; filename="fiche-${id}-${query.format}.pdf"`,
    });
  }
}
