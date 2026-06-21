import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Protège les routes : s'assure que la session est chargée, sinon redirige vers /login.
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.initialized()) {
    await auth.loadSession();
  }
  return auth.currentUser() ? true : router.createUrlTree(['/login']);
};
