import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { memoryStorage } from 'multer';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MulterExceptionFilter } from '../common/filters/multer-exception.filter';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';
import { CharacterService } from './character.service';
import { RyuutamaPdfService } from './ryuutama-pdf.service';
import { CreateLevelUpDto } from './dto/create-level-up.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { ExportCharacterPdfDto } from './dto/export-character-pdf.dto';
import { PortraitCropDataDto } from './dto/portrait-crop-data.dto';

const MAX_PORTRAIT_SIZE = 5 * 1024 * 1024;

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

  @Get(':id/portrait')
  async getPortrait(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const { buffer, mime } = await this.characters.getPortraitFile(id, user.id);
    return new StreamableFile(buffer, { type: mime });
  }

  @Put(':id/portrait')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // Rejette la requête pendant le streaming, avant de bufferiser un fichier surdimensionné
      // en mémoire (le `ParseFilePipe` ci-dessous ne s'exécute qu'APRÈS que Multer a fini de lire
      // le body) — cf. `MulterExceptionFilter` pour le remappage de l'erreur Multer en 413.
      limits: { fileSize: MAX_PORTRAIT_SIZE },
    }),
  )
  async updatePortrait(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_PORTRAIT_SIZE })],
        errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      }),
    )
    file: Express.Multer.File,
    @Body('cropData') cropDataRaw: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    let cropData: PortraitCropDataDto | null = null;
    if (cropDataRaw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(cropDataRaw);
      } catch {
        throw new BadRequestException('cropData doit être un JSON valide');
      }
      const dto = plainToInstance(PortraitCropDataDto, parsed);
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        throw new BadRequestException(
          'cropData invalide : scale/offsetX/offsetY doivent être des nombres dans les bornes attendues',
        );
      }
      cropData = dto;
    }
    return this.characters.updatePortrait(id, user.id, file, cropData);
  }

  @Delete(':id/portrait')
  removePortrait(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.removePortrait(id, user.id);
  }

  @Patch(':id/pdf-portrait-crop')
  updatePdfPortraitCrop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cropData: PortraitCropDataDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.updatePdfPortraitCrop(id, user.id, cropData);
  }

  @Post(':id/level-up')
  levelUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLevelUpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.applyLevelUp(id, user.id, dto);
  }

  @Get(':id/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.getHistory(id, user.id);
  }

  @Post(':id/inventory-items')
  addInventoryItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.addInventoryItem(id, user.id, dto);
  }

  @Patch(':id/inventory-items/:itemId')
  updateInventoryItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (dto.name === undefined && dto.weight === undefined) {
      throw new BadRequestException(
        'Au moins un champ (name ou weight) doit être fourni',
      );
    }
    return this.characters.updateInventoryItem(id, user.id, itemId, dto);
  }

  @Delete(':id/inventory-items/:itemId')
  removeInventoryItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.removeInventoryItem(id, user.id, itemId);
  }
}
