import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { HommeDragonService } from './homme-dragon.service';
import { HommeDragonPdfService } from './homme-dragon.pdf.service';
import { CreateHommeDragonDto } from './dto/create-homme-dragon.dto';
import { UpdateHommeDragonDto } from './dto/update-homme-dragon.dto';
import { ChooseEveilPowerDto } from './dto/choose-eveil-power.dto';
import { ChooseArtefactCadeauDto } from './dto/choose-artefact-cadeau.dto';
import { SetReserveSlotDto } from './dto/set-reserve-slot.dto';
import { ExportHommeDragonPdfDto } from './dto/export-homme-dragon-pdf.dto';

@UseGuards(AuthenticatedGuard)
@Controller('parties/:id/homme-dragon')
export class HommeDragonController {
  constructor(
    private readonly hommeDragon: HommeDragonService,
    private readonly hommeDragonPdf: HommeDragonPdfService,
  ) {}

  @Post()
  create(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHommeDragonDto,
  ) {
    return this.hommeDragon.create(partieId, user.id, dto);
  }

  @Get()
  findOne(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser) {
    return this.hommeDragon.findOne(partieId, user.id);
  }

  @Patch()
  update(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateHommeDragonDto,
  ) {
    return this.hommeDragon.update(partieId, user.id, dto);
  }

  @Post('eveil-power')
  chooseEveilPower(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChooseEveilPowerDto,
  ) {
    return this.hommeDragon.chooseEveilPower(partieId, user.id, dto);
  }

  @Post('artefact-cadeau')
  chooseArtefactCadeau(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChooseArtefactCadeauDto,
  ) {
    return this.hommeDragon.chooseArtefactCadeau(partieId, user.id, dto);
  }

  /** Écriture d'un emplacement de la réserve de souffles (Story 33.6) : `slot` 1-based,
   * `{ key: null }` retire le souffle. Jamais par le `PATCH` générique. */
  @Put('reserve/:slot')
  setReserveSlot(
    @Param('id', ParseUUIDPipe) partieId: string,
    @Param('slot', ParseIntPipe) slot: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetReserveSlotDto,
  ) {
    return this.hommeDragon.setReserveSlot(partieId, user.id, slot, dto);
  }

  @Get('export.pdf')
  async exportPdf(
    @Param('id', ParseUUIDPipe) partieId: string,
    @Query() query: ExportHommeDragonPdfDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const hommeDragon = await this.hommeDragon.findOne(partieId, user.id);
    if (!hommeDragon) throw new NotFoundException('Homme Dragon introuvable');
    const mjPseudo = await this.hommeDragon.getOwnerPseudo(hommeDragon.userId);
    const pdfBytes = await this.hommeDragonPdf.fillHommeDragonPdf(
      hommeDragon,
      mjPseudo,
      query.format,
    );
    return new StreamableFile(pdfBytes, {
      type: 'application/pdf',
      disposition: `attachment; filename="homme-dragon-${partieId}-${query.format}.pdf"`,
    });
  }
}
