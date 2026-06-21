import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { Shell } from './layout/shell/shell';
import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';
import { Dashboard } from './features/dashboard/dashboard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  {
    path: '',
    component: Shell, // zone authentifiée (toolbar + bascule de mode)
    canActivate: [authGuard],
    children: [{ path: '', component: Dashboard }],
  },
  { path: '**', redirectTo: '' },
];
