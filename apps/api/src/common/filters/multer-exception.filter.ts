import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';

/**
 * Sans ce filtre, une erreur Multer (ex. `LIMIT_FILE_SIZE`) sort du pipeline Nest sous forme
 * d'exception non gérée → 500 générique. On la remappe explicitement sur les codes HTTP
 * attendus par le client (413 pour une taille dépassée), cohérent avec `ParseFilePipe`.
 */
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception.code === 'LIMIT_FILE_SIZE'
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : HttpStatus.BAD_REQUEST;
    response
      .status(status)
      .json({ statusCode: status, message: exception.message });
  }
}
