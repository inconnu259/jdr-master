import {
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
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MulterExceptionFilter } from '../common/filters/multer-exception.filter';
import { ScenariosService } from './scenarios.service';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { UpdateScenarioDto } from './dto/update-scenario.dto';
import { LinkSeancePollDto } from './dto/link-seance-poll.dto';
import { SetSeanceCapacityDto } from './dto/set-seance-capacity.dto';
import { SetCompteRenduDto } from './dto/set-compte-rendu.dto';

const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;

function sanitizeHeaderFilename(name: string): string {
  return name.replace(/[\r\n"]/g, '');
}

@UseGuards(AuthenticatedGuard)
@Controller()
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Post('parties/:id/scenarios')
  create(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateScenarioDto,
  ) {
    return this.scenarios.create(partieId, user.id, dto);
  }

  @Patch('scenarios/:id')
  update(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateScenarioDto,
  ) {
    return this.scenarios.update(scenarioId, user.id, dto);
  }

  @Get('parties/:id/scenarios/drafts')
  listDrafts(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.listDrafts(partieId, user.id);
  }

  @Get('parties/:id/scenarios')
  findAll(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.findAllForPartie(partieId, user.id);
  }

  @Patch('scenarios/:id/open')
  open(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.open(scenarioId, user.id);
  }

  @Patch('scenarios/:id/courant')
  markCourant(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.markCourant(scenarioId, user.id);
  }

  @Patch('scenarios/:id/passe')
  close(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.close(scenarioId, user.id);
  }

  @Post('scenarios/:id/participate')
  participate(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.participate(scenarioId, user.id);
  }

  @Post('scenarios/:id/seances')
  addSeance(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.addSeance(scenarioId, user.id);
  }

  @Patch('scenarios/seances/:id/poll')
  linkSeancePoll(
    @Param('id', ParseUUIDPipe) seanceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: LinkSeancePollDto,
  ) {
    return this.scenarios.linkSeancePoll(seanceId, user.id, dto.pollId);
  }

  @Patch('scenarios/seances/:id/capacite')
  setSeanceCapacity(
    @Param('id', ParseUUIDPipe) seanceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetSeanceCapacityDto,
  ) {
    return this.scenarios.setSeanceCapacity(
      seanceId,
      user.id,
      dto.inscriptionMin,
      dto.inscriptionMax,
    );
  }

  @Post('scenarios/seances/:id/inscription')
  inscrire(
    @Param('id', ParseUUIDPipe) seanceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.inscrire(seanceId, user.id);
  }

  @Delete('scenarios/seances/:id/inscription')
  desinscrire(
    @Param('id', ParseUUIDPipe) seanceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.desinscrire(seanceId, user.id);
  }

  @Patch('scenarios/seances/:id/valider-date')
  validerDate(
    @Param('id', ParseUUIDPipe) seanceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.validerDate(seanceId, user.id);
  }

  @Patch('scenarios/seances/:id/compte-rendu')
  setCompteRendu(
    @Param('id', ParseUUIDPipe) seanceId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SetCompteRenduDto,
  ) {
    return this.scenarios.setCompteRendu(seanceId, user.id, dto.compteRendu);
  }

  @Post('parties/:id/documents')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_SIZE },
    }),
  )
  uploadDocument(
    @Param('id', ParseUUIDPipe) partieId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_DOCUMENT_SIZE })],
        errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      }),
    )
    file: Express.Multer.File,
    @Body('scenarioId') scenarioId: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.uploadDocument(partieId, user.id, file, scenarioId);
  }

  @Get('scenarios/:id/documents')
  listDocuments(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.listDocuments(scenarioId, user.id);
  }

  @Get('parties/:id/documents')
  listLibraryDocuments(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.listLibraryDocuments(partieId, user.id);
  }

  @Get('documents/:id')
  async downloadDocument(
    @Param('id', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const { buffer, mime, originalName } = await this.scenarios.getDocumentFile(
      documentId,
      user.id,
    );
    return new StreamableFile(buffer, {
      type: mime,
      // originalName vient du client (file.originalname) : jamais interpolé tel quel dans un
      // en-tête HTTP — CR/LF et guillemets retirés pour empêcher une injection d'en-tête.
      disposition: `attachment; filename="${sanitizeHeaderFilename(originalName)}"`,
    });
  }
}
