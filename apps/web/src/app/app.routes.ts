import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { Shell } from './layout/shell/shell';
import { Login } from './features/auth/login/login';
import { Dashboard } from './features/dashboard/dashboard';

// Seuls trois composants restent importés en dur, parce qu'ils sont sur le chemin critique du
// premier affichage : `Shell` (enveloppe de la zone authentifiée), `Dashboard` (route d'accueil
// `''`) et `Login` (accueil des visiteurs non connectés). Tout le reste sort du bundle initial.
//
// La latence de premier accès est couverte par `withPreloading(PreloadAllModules)`
// (`app.config.ts`) : les morceaux sont téléchargés en arrière-plan juste après le démarrage, donc
// la navigation reste immédiate — on paie un premier affichage plus léger sans rien perdre ensuite.
//
// `loadComponent` ne déplace pas un composant dans l'arbre de routes : il reste au même endroit,
// avec le même cycle de vie et le même ancêtre monté. Les câblages `RealtimeService`
// (`connect`/`disconnect` par topic) sont donc inchangés — cf. `docs/checklist.md`.
const calendarView = () =>
  import('./features/calendar/calendar-view/calendar-view').then((m) => m.CalendarView);
const partieForm = () =>
  import('./features/parties/partie-form/partie-form').then((m) => m.PartieForm);

export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password/:token',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'confirm-email-change/:token',
    loadComponent: () =>
      import('./features/auth/confirm-email-change/confirm-email-change').then(
        (m) => m.ConfirmEmailChange,
      ),
  },
  {
    path: 'rollback-email-change/:token',
    loadComponent: () =>
      import('./features/auth/rollback-email-change/rollback-email-change').then(
        (m) => m.RollbackEmailChange,
      ),
  },
  {
    // hors zone authentifiée : un nouveau venu doit y accéder
    path: 'join/:token',
    loadComponent: () => import('./features/join/join').then((m) => m.Join),
  },
  {
    path: '',
    component: Shell, // zone authentifiée (toolbar + bascule de mode)
    canActivate: [authGuard],
    children: [
      { path: '', component: Dashboard },
      {
        path: 'account',
        loadComponent: () => import('./features/account/account').then((m) => m.Account),
      },
      {
        // Story 29.2 : atteignable par URL directe uniquement — l'entrée de navigation est
        // câblée par la story 29.3 (« navigation à quatre destinations »), séquencée après.
        path: 'characters',
        loadComponent: () =>
          import('./features/characters/my-characters/my-characters').then((m) => m.MyCharacters),
      },
      { path: 'parties/new', loadComponent: partieForm },
      {
        path: 'parties/:id',
        loadComponent: () =>
          import('./features/parties/partie-detail/partie-detail').then((m) => m.PartieDetail),
      },
      { path: 'parties/:id/edit', loadComponent: partieForm },
      { path: 'parties/:id/calendar', loadComponent: calendarView, data: { mode: 'mj' } },
      {
        path: 'parties/:id/guild-calendar',
        loadComponent: calendarView,
        data: { mode: 'personal' },
      },
      {
        path: 'parties/:id/characters/new',
        loadComponent: () =>
          import('./features/characters/character-wizard/character-wizard').then(
            (m) => m.CharacterWizard,
          ),
      },
      {
        path: 'parties/:id/characters/:characterId',
        loadComponent: () =>
          import('./features/characters/character-sheet/character-sheet').then(
            (m) => m.CharacterSheet,
          ),
      },
      {
        path: 'parties/:id/scenarios/drafts',
        loadComponent: () =>
          import('./features/scenarios/scenario-drafts/scenario-drafts').then(
            (m) => m.ScenarioDrafts,
          ),
      },
      {
        path: 'parties/:id/scenarios/new',
        loadComponent: () =>
          import('./features/scenarios/scenario-form/scenario-form').then((m) => m.ScenarioForm),
      },
      {
        path: 'parties/:id/scenarios/:scenarioId',
        loadComponent: () =>
          import('./features/scenarios/scenario-detail/scenario-detail').then(
            (m) => m.ScenarioDetail,
          ),
      },
      { path: 'profile/calendar', loadComponent: calendarView, data: { mode: 'personal' } },
    ],
  },
  { path: '**', redirectTo: '' },
];
