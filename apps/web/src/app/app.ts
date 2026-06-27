import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { ThemeToneService } from './core/theme/theme-tone.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App implements OnInit {
  private readonly auth = inject(AuthService);
  // Injecté ici pour que le thème soit appliqué dès le démarrage (y.c. pages login/register).
  private readonly _theme = inject(ThemeToneService);

  ngOnInit(): void {
    void this.auth.loadSession();
  }
}
