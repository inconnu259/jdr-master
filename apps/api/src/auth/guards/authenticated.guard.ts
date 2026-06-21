import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

// Protège une route : laisse passer seulement si une session est active.
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return request.isAuthenticated();
  }
}
