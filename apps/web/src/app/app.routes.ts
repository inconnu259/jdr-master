import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { Shell } from './layout/shell/shell';
import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { Dashboard } from './features/dashboard/dashboard';
import { PartieForm } from './features/parties/partie-form/partie-form';
import { PartieDetail } from './features/parties/partie-detail/partie-detail';
import { Join } from './features/join/join';
import { CalendarView } from './features/calendar/calendar-view/calendar-view';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'join/:token', component: Join }, // hors zone authentifiée : un nouveau venu doit y accéder
  {
    path: '',
    component: Shell, // zone authentifiée (toolbar + bascule de mode)
    canActivate: [authGuard],
    children: [
      { path: '', component: Dashboard },
      { path: 'parties/new', component: PartieForm },
      { path: 'parties/:id', component: PartieDetail },
      { path: 'parties/:id/edit', component: PartieForm },
      { path: 'parties/:id/calendar', component: CalendarView, data: { mode: 'mj' } },
      { path: 'parties/:id/guild-calendar', component: CalendarView, data: { mode: 'personal' } },
      {
        path: 'parties/:id/characters/new',
        loadComponent: () =>
          import('./features/characters/character-wizard/character-wizard').then(
            (m) => m.CharacterWizard,
          ),
      },
      { path: 'profile/calendar', component: CalendarView, data: { mode: 'personal' } },
    ],
  },
  { path: '**', redirectTo: '' },
];
