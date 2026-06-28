---
baseline_commit: 2517ac45b61a3633fb4bc7434174ff5c3b19f59a
status: done
---

# Story 1.2 : Sélecteur de thème & ThemeToneService

## Tasks/Subtasks

- [x] Task 1: Créer tones.ts avec TONE_MAP (3 thèmes × 13+ clés)
- [x] Task 2: Créer ThemeToneService (2 signals : activeTheme + tone computed)
- [x] Task 3: Ajouter les 3 classes CSS de thème dans styles.scss
- [x] Task 4: Créer ThemeSelector component (embarqué dans le menu Shell)
- [x] Task 5: Initialiser ThemeToneService dans App au démarrage

### Review Findings (2026-06-27)

- [x] [Review][Patch] Clé `'nav.logout'` dupliquée dans `medieval-steampunk` — déjà résolu dans le code commité (une seule entrée `'Couper la vapeur'`) [`tones.ts`] ✅ pre-resolved
- [x] [Review][Defer] `localStorage` appelé à l'instanciation — incompatible SSR si Angular Universal est activé plus tard [`theme-tone.service.ts:8`] — deferred, pas de SSR aujourd'hui

## Dev Agent Record

### Completion Notes

ThemeToneService : signal activeTheme (lu depuis localStorage, défaut grimoire-emeraude),
tone = computed(() => TONE_MAP[activeTheme()]), setTheme() applique la CSS class sur body
et persiste dans localStorage. ThemeSelector embarqué dans le menu utilisateur du Shell.
3 thèmes CSS définis comme classes body dans styles.scss.

## File List

- apps/web/src/app/core/theme/tones.ts (nouveau)
- apps/web/src/app/core/theme/theme-tone.service.ts (nouveau)
- apps/web/src/styles.scss (modifié)
- apps/web/src/app/layout/shell/theme-selector/theme-selector.ts (nouveau)
- apps/web/src/app/layout/shell/theme-selector/theme-selector.html (nouveau)
- apps/web/src/app/layout/shell/shell.ts (modifié)
- apps/web/src/app/layout/shell/shell.html (modifié)
- apps/web/src/app/app.ts (modifié)

## Change Log

- 2026-06-27: Story 1.2 implémentée — ThemeToneService + TONE_MAP + 3 thèmes CSS + ThemeSelector dans Shell
