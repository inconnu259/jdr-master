import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App implements OnInit {
  private readonly auth = inject(AuthService);

  // Au démarrage, on tente de restaurer la session (cookie) → /auth/me.
  ngOnInit(): void {
    void this.auth.loadSession();
  }
}
