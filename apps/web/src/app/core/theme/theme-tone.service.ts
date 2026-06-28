import { Injectable, computed, signal } from '@angular/core';
import { THEME_NAMES, THEMES, TONE_MAP, type Theme } from './tones';

const LS_KEY = 'jdr-theme';

@Injectable({ providedIn: 'root' })
export class ThemeToneService {
  readonly activeTheme = signal<Theme>(this.readStoredTheme());
  readonly tone = computed(() => TONE_MAP[this.activeTheme()]);
  readonly themeNames = THEME_NAMES;
  readonly themes = THEMES;

  constructor() {
    this.applyClass(this.activeTheme());
  }

  setTheme(theme: Theme): void {
    this.applyClass(theme);
    this.activeTheme.set(theme);
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, theme);
  }

  private applyClass(theme: Theme): void {
    if (typeof document === 'undefined') return;
    const body = document.body;
    for (const t of THEMES) body.classList.remove(`theme-${t}`);
    body.classList.add(`theme-${theme}`);
  }

  private readStoredTheme(): Theme {
    if (typeof localStorage === 'undefined') return 'grimoire-emeraude';
    const stored = localStorage.getItem(LS_KEY);
    return THEMES.includes(stored as Theme) ? (stored as Theme) : 'grimoire-emeraude';
  }
}
