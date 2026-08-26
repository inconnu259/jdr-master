import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import {
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import localeFr from '@angular/common/locales/fr';

import { routes } from './app.routes';

registerLocaleData(localeFr, 'fr-FR');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // `withPreloading` : les routes en `loadComponent` (cf. `app.routes.ts`) sont téléchargées en
    // arrière-plan dès que l'application a démarré. Le bundle initial reste léger sans que la
    // première navigation vers une route paresseuse attende son morceau.
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules)),
    provideHttpClient(withFetch()),
    provideAnimationsAsync(), // requis par Angular Material
    { provide: LOCALE_ID, useValue: 'fr-FR' },
  ],
};
