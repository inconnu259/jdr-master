import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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

  @Get('export.pdf')
  async exportPdf(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const hommeDragon = await this.hommeDragon.findOne(partieId, user.id);
    if (!hommeDragon) throw new NotFoundException('Homme Dragon introuvable');
    const mjPseudo = await this.hommeDragon.getOwnerPseudo(hommeDragon.userId);
    const pdfBytes = await this.hommeDragonPdf.fillHommeDragonPdf(hommeDragon, mjPseudo);
    return new StreamableFile(pdfBytes, {
      type: 'application/pdf',
      disposition: `attachment; filename="homme-dragon-${partieId}.pdf"`,
    });
  }
}
