import {
  Body,
  Controller,
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

  @Patch('scenarios/:id/open')
  open(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.scenarios.open(scenarioId, user.id);
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
