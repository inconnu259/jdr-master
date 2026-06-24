import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';

/** Récupère l'utilisateur de la session (désérialisé par Passport) dans un handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
