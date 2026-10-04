---
title: 'Champ de mot de passe révélable, lien mort retiré'
type: 'feature'
created: '2026-10-04'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-34-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les six champs de mot de passe de l'application masquent toujours leur contenu : on se trompe sans le voir, surtout sur mobile. Et la page de connexion propose « Créer un compte », un lien qui mène à une impasse puisque l'inscription ne se fait que sur invitation.

**Approach:** Un mécanisme partagé de révélation (bouton œil / œil barré en `matSuffix`) appliqué aux six champs ; le lien « Créer un compte » retiré de la page de connexion seulement. Front pur : l'inscription par lien d'invitation, sa règle métier et l'API restent intacts.

## Boundaries & Constraints

**Always:**
- **Six champs, un seul mécanisme** sous `apps/web/src/app/shared/password-reveal/` (directive + bouton, ou un composant unique), utilisé par : connexion, inscription, réinitialisation, et sur l'écran de compte la demande de changement d'e-mail (mot de passe actuel) et le changement de mot de passe (actuel et nouveau). Aucune copie du balisage ou de la logique par écran.
- Le champ garde `matInput`, son `formControlName` et son `autocomplete` ; seul son `type` bascule entre `password` et `text`. La valeur, la validité et le focus du champ ne changent pas à la bascule.
- Le bouton est un `<button type="button">` (il ne soumet jamais le formulaire), placé en `matSuffix`, avec une icône **SVG inline** œil (masqué) / œil barré (visible) marquée `aria-hidden`, `aria-pressed` reflétant l'état et un libellé accessible qui suit l'état (« Afficher le mot de passe » / « Masquer le mot de passe »). L'état n'est jamais porté par la couleur seule. Cible tactile d'au moins 44 px, activable au clavier (Entrée, Espace), ordre de focus naturel : champ puis bouton.
- Chaque champ part **masqué** à chaque affichage ; l'état est propre à chaque champ (les deux champs du changement de mot de passe sont indépendants) ; rien n'est persisté.
- Les deux libellés sont des clés de ton `auth.password_show` et `auth.password_hide` présentes dans les **trois thèmes**, au même texte neutre (non thématisé), avec un test de parité comme les stories précédentes.
- **Lien mort** : seul le lien « Créer un compte » de `login.html` est retiré. Le lien « Mot de passe oublié ? » reste. Le lien « Créer un compte » de `join.html` (parcours « rejoindre par lien », avec son jeton) reste, ainsi que la route et la page d'inscription.
- Commentaires en français (dérogation du dépôt).

**Never:**
- Aucun changement côté API, aucune nouvelle dépendance, aucun changement de la règle « inscription sur invitation » (sans jeton, la page affiche son message et le bouton reste désactivé).
- Ne pas toucher à la mise en forme d'ensemble des écrans d'authentification (story 34.3) ni aux autres textes de ces écrans.
- Ne pas utiliser la couleur seule, ne pas animer l'icône, ne pas révéler automatiquement le mot de passe (ni après erreur, ni à la soumission).

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Comportement attendu | Erreur |
|----------|--------------|---------------------|--------|
| Révéler | champ masqué, activation du bouton | `type="text"`, contenu lisible, `aria-pressed="true"`, libellé « Masquer… », icône œil barré | N/A |
| Re-masquer | champ révélé, nouvelle activation | `type="password"`, `aria-pressed="false"`, libellé « Afficher… », icône œil | N/A |
| Valeur conservée | bascule après saisie | la valeur, la validité du contrôle et l'`autocomplete` sont inchangés | N/A |
| Pas de soumission | clic sur le bouton dans un formulaire | le formulaire n'est pas soumis ; Entrée dans le champ soumet comme avant | N/A |
| Deux champs | changement de mot de passe (actuel + nouveau) | chaque bouton ne bascule que son propre champ | N/A |
| Clavier | focus sur le bouton, Entrée ou Espace | bascule ; ordre de focus : champ puis bouton | N/A |
| Affichage suivant | écran quitté puis rouvert, ou formulaire de compte refermé puis rouvert | champ à nouveau masqué | N/A |
| Page de connexion | consultation | aucun lien `/register` ; le lien « Mot de passe oublié ? » est présent | N/A |
| Inscription par invitation | `/register?token=…` valide | le parcours reste fonctionnel : bouton actif, champ de mot de passe révélable ; sans jeton, message d'invitation inchangé et bouton désactivé | N/A |
| Rejoindre par lien | page `join` avec jeton | le lien « Créer un compte » vers `/register` avec le jeton est conservé | N/A |
| Thèmes | chacun des trois thèmes | les deux clés existent, non vides | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/features/auth/login/login.html` L12 (champ) et L21 (`<a routerLink="/register">Créer un compte</a>` à retirer) ; `login.ts` (imports ; `RouterLink` reste utilisé par « Mot de passe oublié ? »). La 34.1 y a déjà posé `role="alert"` et `ThemeToneService`.
- `apps/web/src/app/features/auth/register/register.html` L21 et `register.ts` ; `reset-password/reset-password.html` L13 et `.ts` ; `apps/web/src/app/features/account/account.html` L46 (e-mail, mot de passe actuel), L111 et L116 (changement de mot de passe) et `account.ts` (imports : `MatFormFieldModule`, `MatInputModule`…). Tous utilisent `mat-form-field appearance="outline"`.
- `apps/web/src/app/features/join/join.html` L27 -- lien « Créer un compte » avec `queryParams: { token }` : **à conserver**.
- `apps/web/src/app/core/theme/tones.ts` -- `TONE_MAP` : trois blocs (`grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk`) ; ajouter les deux clés à côté des clés `auth.login_*` posées par la 34.1 ; `core/theme/theme-tone.service.spec.ts` -- patron de parité des clés dans les trois thèmes (dernier bloc : story 34.1).
- SVG inline : patron existant dans `features/calendar/calendar-detail-rail/calendar-detail-rail.html` L19-30 (`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">`). Pas de dépendance à la police d'icônes.
- Specs : `features/account/account.spec.ts` (patron de spec de composant, `ThemeToneService` mocké via `tone()`) ; `features/auth/login/login.spec.ts` (créé par la 34.1) ; aucune spec n'existe pour `register` ni `reset-password` : en créer une pour `register` (non-régression de l'inscription par jeton).

## Tasks & Acceptance

**Execution:**
- [ ] `apps/web/src/app/shared/password-reveal/` -- mécanisme partagé (directive + bouton ou composant) et sa spec : bascule, `aria-pressed`, libellés, `type="button"`, valeur conservée, indépendance de deux instances -- révélation réutilisable
- [ ] `apps/web/src/app/core/theme/tones.ts` + `theme-tone.service.spec.ts` -- clés `auth.password_show` / `auth.password_hide` dans les trois thèmes et parité -- libellés accessibles
- [ ] `login.html`, `register.html`, `reset-password.html`, `account.html` (et les `imports` de leurs composants) -- appliquer le mécanisme aux six champs -- révélation partout
- [ ] `apps/web/src/app/features/auth/login/login.html` -- retirer le lien « Créer un compte » -- plus d'impasse
- [ ] Specs : `login.spec.ts` (aucun lien `/register`, « Mot de passe oublié ? » présent, champ révélable), `account.spec.ts` (deux champs indépendants, formulaire refermé puis rouvert masqué), nouvelle `register.spec.ts` (inscription par jeton fonctionnelle, sans jeton désactivée, champ révélable), contrôle du lien de `join` -- couvre la matrice

**Acceptance Criteria:**
- Given un champ de mot de passe, sur n'importe quel écran de l'application, when j'active la révélation, then je vois le contenu que j'ai saisi, et je peux le masquer à nouveau.
- Given la page de connexion, when je la consulte, then aucun lien « Créer un compte » n'y figure.
- Given l'inscription sur invitation, when je reçois un lien valide, then le parcours d'inscription reste entièrement fonctionnel.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Esquisse (non contraignante) : une directive `appPasswordReveal` sur l'`<input>` (signal `revealed`, `toggle()`, liaison de `type`), exposée par une référence de gabarit, et un bouton `app-password-toggle` en `matSuffix` qui la reçoit ; la liaison `type` de la directive pilote l'entrée `type` de `matInput` sans toucher au `formControlName`.

## Verification

**Commands:**
- `docker compose exec web pnpm exec ng test web --watch=false --include "src/app/shared/password-reveal/**/*.spec.ts" --include "src/app/features/auth/**/*.spec.ts" --include "src/app/features/account/**/*.spec.ts" --include "src/app/core/theme/*.spec.ts"` -- expected: tous les tests passent
- `docker compose exec web pnpm test` -- expected: aucune régression hors échecs préexistants connus (`calendar-view.spec`, dates figées)
- `docker compose exec web pnpm build` -- expected: compilation sans erreur (la CI ne construit pas le front)
- `docker compose exec web pnpm lint` -- expected: aucune erreur nouvelle sur les lignes modifiées

**Manual checks (if no CLI):**
- Sur téléphone ou en émulation mobile : bascule de chaque champ dans les trois thèmes, au clavier et au toucher ; page de connexion sans lien « Créer un compte » ; un lien d'invitation ouvre bien l'inscription.
