---
baseline_commit: 59a9d2c884601358c4e181ca77e9357e999f0fdc
---

# Story 28.5: Changement de mot de passe en session

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur connecté,
I want changer mon mot de passe sans passer par la procédure d'oubli,
so that je puisse le renouveler quand je le décide.

## Contexte

**Cinquième story de l'épic 28.** Elle ajoute une deuxième voie de changement de mot de passe à côté de celle qui existe déjà (`AuthService.resetPassword()`, via lien e-mail, stories 15.1/15.2). Les deux procédures divergent délibérément sur un point : le reset par e-mail coupe **toutes** les sessions sans exception (un tiers a pu obtenir l'accès), tandis que le changement en session — l'utilisateur est déjà authentifié et vient de prouver qu'il connaît le mot de passe actuel — ne coupe que les **autres** sessions, la session courante restant ouverte.

### Découverte faite en préparant cette story — à connaître avant de coder

**La logique de révocation de sessions existe déjà, mais uniquement inline dans `resetPassword()`.** `apps/api/src/auth/auth.service.ts:209-235` — à l'intérieur de la transaction Prisma qui change `passwordHash`, elle lit toutes les lignes `UserSession` de l'utilisateur, supprime les `Session` (table gérée par `connect-pg-simple`) correspondantes, puis supprime les lignes `UserSession`. **Aucune méthode partagée n'existe** — c'est exactement ce que cette story doit extraire (AC5 de l'epic : `revokeSessions(userId, exceptSid?)`).

**Deux tables gèrent les sessions, et les deux doivent toujours rester synchronisées :**
- `Session` (`apps/api/prisma/schema.prisma:404-413`) : gérée par `connect-pg-simple`, clé primaire `sid`, contenu `sess` en JSON opaque (non indexable par `userId`).
- `UserSession` (`apps/api/prisma/schema.prisma:141-154`) : index inverse applicatif `userId → sid`, créé à `POST /auth/login` (`AuthController.login()` → `auth.recordSession(userId, req.sessionID)`), supprimé à `POST /auth/logout` (`auth.forgetSession(sid)`).
- Une révocation qui ne toucherait qu'une des deux tables laisserait soit un fantôme (`UserSession` orpheline) soit une session non révoquée (`Session` encore valide mais invisible de l'index).

**Aucune migration Prisma n'est nécessaire.** Pas de champ `passwordVersion`/`passwordChangedAt` sur `User` — la révocation se fait uniquement par suppression physique des lignes `Session`/`UserSession`, jamais par comparaison de version. Cette story ne touche donc à `schema.prisma` que si tu introduis une colonne — **ne le fais pas**, ce n'est pas nécessaire.

**Le `sid` de la requête courante se lit via `req.sessionID`** (pas `req.session.id`, bien qu'équivalents avec `express-session`) — patron déjà utilisé dans `AuthController.login()`/`logout()`. `AccountController` n'a jamais eu besoin de `req.sessionID` jusqu'ici (seulement `req.user`) — ce sera la première fois.

**`AuthService` n'est aujourd'hui exporté par aucun module.** `apps/api/src/auth/auth.module.ts` : `providers: [AuthService, LocalStrategy, SessionSerializer]`, pas d'`exports`. `AccountModule` (`apps/api/src/account/account.module.ts`) n'importe rien. Cette story doit ajouter `exports: [AuthService]` à `AuthModule` et `imports: [AuthModule]` à `AccountModule` — pas de risque de dépendance circulaire (`AuthModule` n'importe jamais `AccountModule`).

**Le hash argon2 vit exclusivement dans `AuthService`** (`import * as argon2 from 'argon2'`, `apps/api/src/auth/auth.service.ts:8`) — `argon2.verify(hash, plain)` pour vérifier, `argon2.hash(plain)` pour hacher. `AccountService`, elle, n'a jamais manipulé de mot de passe (ses deux méthodes actuelles, `updateDisplayName`/`updateTheme`, excluent systématiquement `passwordHash` de leur réponse via `const { passwordHash, ...safe } = user`).

**Décision d'implémentation (tranchée pour cette story, pas à débattre) : la route vit dans `AccountController` (`PATCH /me/password`, cohérent avec les deux endpoints `/me/...` existants), mais délègue toute la logique métier à `AuthService.changePassword()`** (nouvelle méthode, à côté de `resetPassword()`), pas à `AccountService`. Raison : le changement de mot de passe n'est pas une « préférence » lue/écrite (contrairement au thème, AC5 de la story 28.4) — c'est une opération de sécurité qui partage sa logique de révocation avec `resetPassword()`, déjà dans `AuthService`. Dupliquer le hash/vérification argon2 dans `AccountService` juste pour rester dans ce fichier serait un détour inutile ; router `AccountController` → `AuthService` directement est le choix le plus simple qui évite toute duplication.

**Précédent exact pour une méthode acceptant une transaction externe :** `apps/api/src/invitations/invite-links.service.ts:111-115`, `consumeLink(tx: Prisma.TransactionClient, token: string, userId: string)` — `tx` en premier paramètre, obligatoire, jamais de valeur par défaut. `revokeSessions` doit suivre exactement ce patron : `revokeSessions(tx: Prisma.TransactionClient, userId: string, exceptSid?: string): Promise<void>`, toujours appelée depuis l'intérieur d'un `$transaction(...)` (jamais indépendamment).

**Propriété à préserver en extrayant `revokeSessions` — importante pour ne pas casser les tests existants de `resetPassword` :** construis le `where` de façon conditionnelle plutôt que d'ajouter systématiquement `sid: { not: exceptSid }` :
```ts
async revokeSessions(tx: Prisma.TransactionClient, userId: string, exceptSid?: string): Promise<void> {
  const where = exceptSid ? { userId, sid: { not: exceptSid } } : { userId };
  const activeSessions = await tx.userSession.findMany({ where, select: { sid: true } });
  const sids = activeSessions.map((s) => s.sid);
  await tx.session.deleteMany({ where: { sid: { in: sids } } });
  await tx.userSession.deleteMany({ where });
}
```
Avec cette forme, `resetPassword()` (qui appelle `revokeSessions(tx, record.userId)`, sans `exceptSid`) produit des appels `tx.userSession.findMany({ where: { userId: 'u1' }, ... })` et `tx.userSession.deleteMany({ where: { userId: 'u1' } })` **strictement identiques** à ceux d'aujourd'hui (`apps/api/src/auth/auth.service.spec.ts:334-343`) — ces tests existants ne devraient nécessiter **aucune modification de leurs assertions**, seulement continuer à passer après le refactor.

**Template e-mail déjà existant et générique, réutilisable tel quel :** `apps/api/src/email/templates/password-changed.hbs` (« Le mot de passe de votre compte vient d'être modifié. Si vous n'êtes pas à l'origine de ce changement, contactez-nous immédiatement. ») — déjà envoyé par `resetPassword()` via `this.email.sendMail('password-changed', updatedUser.email, {})`, hors transaction, best-effort (`EmailService.sendMail()` ne relance jamais). Réutiliser exactement le même appel pour `changePassword()`, aucun nouveau template à créer.

**Throttling : aucun endpoint de `AccountController` n'en a aujourd'hui.** `changePassword` sera le premier — appliquer `@Throttle({ default: { ttl: 60_000, limit: 5 } })`, la même limite que `register`/`login`/`forgot-password`/`reset-password` (`apps/api/src/auth/auth.controller.ts:28,35,71,77`), cohérent avec la sensibilité de l'opération (garde-fou global existant : 300/min, dimensionné pour du GET normal, `app.module.ts:36`).

**`ThemeToneService`/`tones.ts` — toute chaîne visible à l'écran doit exister dans les 3 thèmes.** `apps/web/src/app/core/theme/tones.ts` porte déjà les clés `account.*` (ex. `account.title`, `account.save_btn`) déclinées 3 fois (grimoire-émeraude ~ligne 180, forêt-ancienne ~ligne 358, médiéval-steampunk ~ligne 536). Les nouvelles clés pour le formulaire de mot de passe doivent suivre le même patron — jamais de texte français en dur dans le template (contrairement à `reset-password.ts`/`.html`, qui n'a jamais été migré vers `ThemeToneService` et ne doit **pas** servir de modèle ici).

## Acceptance Criteria

1. **Given** je suis connecté, **When** je fournis mon mot de passe courant et un nouveau mot de passe, **Then** le mot de passe est changé.
2. **Given** le mot de passe courant que je fournis est incorrect, **When** je valide, **Then** le changement échoue et rien n'est modifié.
3. **Given** le changement a réussi, **When** je regarde mes sessions actives, **Then** toutes les autres ont été coupées, **and** la session depuis laquelle j'ai agi reste ouverte.
4. **Given** la réinitialisation par e-mail oublié, **When** elle s'exécute, **Then** elle continue de couper **toutes** les sessions sans exception — l'écart avec le changement en session est délibéré.
5. **Given** l'une ou l'autre de ces deux procédures, **When** elle coupe des sessions, **Then** elle appelle une méthode partagée `revokeSessions(userId, exceptSid?)`, **and** aucun code de coupure de session n'est dupliqué.

## Tasks / Subtasks

### Backend — extraction et endpoint

- [x] Task 1 — Extraire `AuthService.revokeSessions(tx, userId, exceptSid?)` (AC: #4, #5)
  - [x] Nouvelle méthode dans `apps/api/src/auth/auth.service.ts`, signature `revokeSessions(tx: Prisma.TransactionClient, userId: string, exceptSid?: string): Promise<void>` — where conditionnel (`exceptSid ? { userId, sid: { not: exceptSid } } : { userId }`).
  - [x] `resetPassword()` appelle désormais `await this.revokeSessions(tx, record.userId);` à la place de son bloc inline — comportement strictement inchangé (toutes les sessions coupées, aucun `exceptSid`).
  - [x] `import { Prisma } from '@prisma/client';` ajouté.
  - [x] Suite `resetPassword` existante continue de passer sans modification de ses assertions (30/30 tests verts, y compris les 8 tests `resetPassword` non touchés).

- [x] Task 2 — `AuthService.changePassword(userId, currentPassword, newPassword, exceptSid)` (AC: #1, #2, #3, #5)
  - [x] Nouvelle méthode dans `auth.service.ts`, à côté de `resetPassword()` : `findUnique` (404 si absent) → `argon2.verify` en `try/catch` → 401 si invalide (rien modifié) → `argon2.hash` → `$transaction` (`user.update` + `revokeSessions(tx, userId, exceptSid)`) → e-mail best-effort hors transaction → `{ ok: true }`.
  - [x] `UnauthorizedException` ajouté à l'import `@nestjs/common`.
  - [x] Tests unitaires `auth.service.spec.ts`, nouveau `describe('changePassword')` (4 tests) : succès (assertions exactes sur `tx.user.update`, `tx.userSession.findMany`/`deleteMany` avec `sid: { not: 's1' } }`, `tx.session.deleteMany`, `email.sendMail`), mot de passe courant incorrect (`UnauthorizedException`, `$transaction`/`sendMail` jamais appelés), hash corrompu (traité comme incorrect), compte introuvable (`NotFoundException`).

- [x] Task 3 — Exposer `AuthService` à `AccountModule`, endpoint `PATCH /me/password` (AC: #1, #2, #3)
  - [x] `apps/api/src/auth/auth.module.ts` : `exports: [AuthService]` ajouté.
  - [x] `apps/api/src/account/account.module.ts` : `imports: [AuthModule]` ajouté.
  - [x] Nouveau `apps/api/src/account/dto/change-password.dto.ts` :
    ```ts
    import { IsString, MaxLength, MinLength } from 'class-validator';

    export class ChangePasswordDto {
      @IsString()
      @MinLength(1)
      @MaxLength(128)
      currentPassword!: string;

      @IsString()
      @MinLength(8)
      @MaxLength(128)
      newPassword!: string;
    }
    ```
    (mêmes bornes `8`/`128` que `ResetPasswordDto.newPassword` — `apps/api/src/auth/dto/reset-password.dto.ts`.)
  - [x] `apps/api/src/account/account.controller.ts` : `AuthService` injecté dans le constructeur (à côté d'`AccountService`), route ajoutée :
    ```ts
    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @Patch('password')
    changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
      return this.auth.changePassword(
        (req.user as { id: string }).id,
        dto.currentPassword,
        dto.newPassword,
        req.sessionID,
      );
    }
    ```
    Import `Throttle` depuis `@nestjs/throttler`. `req.sessionID` **jamais** lu depuis le corps de la requête (même principe que l'id utilisateur — un `sid` glissé dans le corps doit être rejeté par `forbidNonWhitelisted`, pas silencieusement ignoré).
  - [x] Tests `account.controller.spec.ts` : mock `AuthService` (`{ changePassword: jest.fn() }`) fourni au module de test à côté du mock `AccountService` existant (+1 test unitaire `changePassword()`). Tests HTTP réels ajoutés (section « validation HTTP réelle ») : `newPassword` < 8 caractères → 400, `currentPassword` absent → 400, `sid` glissé dans le corps → 400 `forbidNonWhitelisted`, requête valide → 200 avec `auth.changePassword` appelé `(userId, currentPassword, newPassword, 'sess-1')`. Guard de test surchargé pose désormais aussi `req.sessionID = 'sess-1'`.

### Frontend — formulaire de changement de mot de passe

- [x] Task 4 — `AccountService.changePassword()` (AC: #1)
  - [x] `apps/web/src/app/core/account/account.service.ts` : nouvelle méthode, retourne `Promise<{ ok: true }>` (aligné sur la réponse réelle de l'API plutôt que `Promise<void>` — plus honnête, cf. revue).
  - [x] Test `account.service.spec.ts` : vérifie la méthode HTTP (`PATCH`), l'URL, le corps, `withCredentials`.

- [x] Task 5 — Formulaire dans l'écran de compte (AC: #1, #2, #3)
  - [x] `apps/web/src/app/features/account/account.ts` : nouveau `FormGroup` séparé (ne pas le fusionner avec le formulaire `displayName` existant — deux soumissions indépendantes) :
    ```ts
    protected readonly passwordForm = this.fb.nonNullable.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
    });
    protected readonly passwordSaving = signal(false);
    protected readonly passwordError = signal<string | null>(null);
    protected readonly passwordSaved = signal(false);

    async submitPassword(): Promise<void> {
      if (this.passwordForm.invalid) return;
      this.passwordSaving.set(true);
      this.passwordError.set(null);
      this.passwordSaved.set(false);
      try {
        const { currentPassword, newPassword } = this.passwordForm.getRawValue();
        await this.account.changePassword(currentPassword, newPassword);
        this.passwordForm.reset();
        this.passwordSaved.set(true);
      } catch (err) {
        this.passwordError.set(
          err instanceof HttpErrorResponse && err.status === 401
            ? this.theme.tone()['account.password_wrong_current']
            : this.theme.tone()['account.password_error'],
        );
      } finally {
        this.passwordSaving.set(false);
      }
    }
    ```
    Import `HttpErrorResponse` depuis `@angular/common/http` (patron déjà utilisé dans `character-sheet.ts:490` pour distinguer un statut HTTP précis).
    **Ne jamais** appeler `this.auth.currentUser.set(...)` après ce changement — l'endpoint ne renvoie pas d'`AuthUser`, et rien dans `AuthUser` ne change (le mot de passe n'y figure jamais). Confirmé par un test dédié.
  - [x] `apps/web/src/app/features/account/account.html` : nouvelle section dans la carte existante, **distincte du `<form>` displayName** (deux `<form>` indépendants), avec deux `<mat-form-field type="password">` pour `currentPassword`/`newPassword`, bouton de soumission, messages d'erreur/succès conditionnels — même structure que le bloc `displayName` existant.
  - [x] `apps/web/src/app/core/theme/tones.ts` : 7 nouvelles clés ajoutées dans les **3 thèmes** : `account.password_title`, `account.current_password_label`, `account.new_password_label`, `account.password_save_btn`, `account.password_saved`, `account.password_wrong_current`, `account.password_error` — ton cohérent avec chaque thème (grimoire : « sortilège de passage » ; forêt : direct/sobre ; steampunk : « code d'accès »/« recalibrer »).
  - [x] Tests `account.spec.ts` (5 nouveaux, describe séparé) : soumission valide (service appelé, formulaire réinitialisé, succès affiché), 401 → message spécifique + formulaire conservé, erreur non-401 → message générique, `newPassword` < 8 caractères → formulaire invalide/service jamais appelé, `currentUser` jamais réécrit après un changement de mot de passe.

### Suites et vérification

- [x] Task 6 — Suites complètes et vérification manuelle (AC: #1-5)
  - [x] `docker compose exec api pnpm test` — 49/49 suites, 963/963 tests, aucune régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm test` — 80/80 suites, 1076/1076 tests, aucune régression.
  - [x] `docker compose exec web pnpm build` — dépassement de budget préexistant, ~216.61 Ko (vs ~214.41 Ko en story 28.4) — légère hausse cohérente avec le nouveau formulaire + 21 nouvelles clés de thème (7 × 3), pas une régression.
  - [x] Conteneur `api` redémarré réellement — `Nest application successfully started` confirmé, route `PATCH /me/password` mappée (logs `RouterExplorer`).
  - [x] Vérification manuelle bout-en-bout réelle (curl + psql, compte `mj-demo@example.com`) — **AC3 vérifiée avec deux sessions réelles simultanées**, pas seulement par les tests unitaires : session 1 authentifiée, session 2 ouverte en parallèle sur le même compte ; `PATCH /me/password` avec mot de passe courant incorrect → 401, hash inchangé ; `newPassword` trop court → 400 ; changement valide depuis la session 1 → 200, hash changé en base ; **session 1 (celle ayant agi) reste valide** (`GET /auth/me` → 200) ; **session 2 révoquée** (`GET /auth/me` → 403). Mot de passe de démo restauré et session 1 déconnectée après vérification (aucune donnée de démo laissée modifiée).

## Dev Notes

### Previous Story Intelligence (28.4, statut `done`)

- **`ts-jest` ne type-check pas en cross-file** — lancer `pnpm typecheck` côté API séparément après tout changement de signature partagée (ici, `AccountModule`/`AuthModule` changent de forme).
- **`ng test` type-check réellement les `.spec.ts`** — toute fixture affectée par un changement de type gagne le nouveau champ, sous peine d'échec de compilation.
- **Piège ESM/CJS `jest.mock('@master-jdr/shared', ...)`** : cette story n'introduit aucun nouvel import runtime depuis `@master-jdr/shared` — le piège ne devrait pas se déclencher. Si un nouveau spec touche transitivement `auth.service.ts` (qui importe déjà `THEMES` depuis la story 28.4) et casse avec `Unexpected token 'export'`, c'est le même piège déjà documenté (mémoire projet `jdr-game-rules-esm-jest-mock`) — même correctif (`jest.mock('@master-jdr/shared', () => ({ THEMES: [...] }))` en tête de fichier).
- Story 28.4 a établi le patron `PATCH /me/...` dans `AccountController` (id de session jamais du corps, garde P2025 côté `AccountService`) — cette story l'étend à un troisième endpoint, mais route sa logique vers `AuthService` plutôt que `AccountService` (voir rationale en Contexte ci-dessus).

### Ce qui doit continuer de fonctionner

- `AuthService.resetPassword()` garde exactement son comportement actuel après le refactor (toutes les sessions coupées sans exception — AC4) — seule sa mécanique interne change (délègue à `revokeSessions`).
- `AuthController.login()`/`logout()` restent strictement inchangés — `recordSession`/`forgetSession` ne sont pas touchées par cette story.
- `AccountController.updateDisplayName()`/`updateTheme()` restent inchangées — seul un troisième endpoint et une nouvelle dépendance (`AuthService`) s'ajoutent au contrôleur.
- Le template e-mail `password-changed.hbs` reste inchangé, partagé tel quel entre les deux flux.

### Anti-réinvention — ce qui existe déjà et doit être réutilisé

| Besoin | Réutiliser | Ne pas faire |
|---|---|---|
| Vérification/hash de mot de passe | `argon2.verify`/`argon2.hash`, déjà dans `AuthService` (`validateUser`, `resetPassword`) | Réimplémenter la logique dans `AccountService`, ou dupliquer les imports argon2 ailleurs |
| Coupure de sessions | Extraction de la logique déjà écrite dans `resetPassword()` (lignes 223-232) vers `revokeSessions(tx, userId, exceptSid?)` | Réécrire la logique de suppression `Session`/`UserSession` à partir de zéro, ou l'écrire deux fois (une pour chaque flux) |
| Méthode acceptant une transaction externe | Patron `consumeLink(tx: Prisma.TransactionClient, ...)` de `invite-links.service.ts:111` | Une méthode qui ouvre sa propre transaction en interne alors qu'elle doit composer avec celle de l'appelant |
| Endpoint `PATCH /me/...` orienté action de compte | Patron exact `AccountController`/id de session jamais du corps/`ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) | Un nouveau contrôleur, ou une route sous `/auth/...` alors que l'action se fait depuis l'écran de compte |
| Distinction d'un statut HTTP précis côté front | Patron `err instanceof HttpErrorResponse && err.status === xxx` (`character-sheet.ts:490`) | Parser `err.error.message` par correspondance de chaîne, fragile si le message serveur change |
| Chaînes visibles à l'écran | `ThemeToneService.tone()['account.xxx']`, déclinées dans les 3 thèmes de `tones.ts` | Texte français en dur dans le template (anti-patron déjà présent dans `reset-password.html`, à ne pas reproduire) |

### Sécurité

- `PATCH /me/password` protégé par `AuthenticatedGuard` (déjà au niveau du contrôleur, `@Controller('me')`) — un utilisateur non connecté ne peut jamais l'atteindre.
- Mot de passe courant vérifié **avant** toute écriture — aucune modification possible sans preuve de connaissance du mot de passe actuel (AC2).
- Throttle `5/min` — même limite que les autres opérations sensibles liées à l'authentification, empêche le brute-force du mot de passe courant depuis une session déjà ouverte.
- La réponse ne doit jamais exposer `passwordHash` — cohérent avec `AccountService.updateDisplayName`/`updateTheme`, bien que cette fois la réponse ne contienne de toute façon pas d'objet `User` (`{ ok: true }` suffit, pas besoin d'exclure quoi que ce soit puisque rien de sensible n'y transite).
- `revokeSessions` doit rester dans la transaction Prisma du changement de mot de passe (atomicité — un crash entre l'update du hash et la révocation laisserait d'anciennes sessions valides avec un mot de passe désormais changé, incohérence de sécurité).

### Project Structure Notes

- **Modifiés (API)** : `apps/api/src/auth/auth.service.ts` (+`revokeSessions()`, +`changePassword()`, refactor `resetPassword()`), `apps/api/src/auth/auth.module.ts` (+`exports`), `apps/api/src/auth/auth.service.spec.ts`, `apps/api/src/account/account.module.ts` (+`imports`), `apps/api/src/account/account.controller.ts` (+`@Patch('password')`), `apps/api/src/account/account.controller.spec.ts`.
- **Nouveau (API)** : `apps/api/src/account/dto/change-password.dto.ts`.
- **Modifiés (web)** : `apps/web/src/app/core/account/account.service.ts` (+`changePassword()`), `apps/web/src/app/core/account/account.service.spec.ts`, `apps/web/src/app/features/account/account.ts` (+formulaire), `apps/web/src/app/features/account/account.html` (+section), `apps/web/src/app/features/account/account.spec.ts`, `apps/web/src/app/core/theme/tones.ts` (+7 clés × 3 thèmes).
- **Non touchés** : `apps/api/prisma/schema.prisma` (aucune migration), `AuthController` (`login`/`logout`/`forgot-password`/`reset-password` inchangés), `apps/web/src/app/features/auth/reset-password/*` (flux distinct, ne pas fusionner), `SessionSerializer`.

### Temps réel (checklist `docs/checklist.md`)

Aucun besoin de câblage SSE — un changement de mot de passe est un événement strictement personnel et sensible, jamais diffusé (cohérent avec AD-14, déjà appliqué au thème en story 28.4). La coupure d'autres sessions se matérialise pour l'utilisateur affecté par une déconnexion forcée à sa prochaine requête authentifiée sur cet appareil (guard existant, comportement déjà en place pour `resetPassword` — rien de nouveau à construire ici).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.5] — Acceptance Criteria d'origine (AC1-5, reprises telles quelles)
- [Source: apps/api/src/auth/auth.service.ts:182-241] — `resetPassword()` actuel, logique de révocation à extraire
- [Source: apps/api/src/auth/auth.service.spec.ts:303-441] — tests existants de `resetPassword`, gabarit pour `changePassword`
- [Source: apps/api/prisma/schema.prisma:141-154,404-413] — modèles `UserSession`/`Session`
- [Source: apps/api/src/auth/auth.controller.ts] — patron `req.sessionID`, `@Throttle`, `recordSession`/`forgetSession`
- [Source: apps/api/src/invitations/invite-links.service.ts:111-115] — patron `tx: Prisma.TransactionClient` en premier paramètre obligatoire
- [Source: apps/api/src/account/account.controller.ts, account.service.ts, dto/update-theme.dto.ts] — patron `PATCH /me/...` à reproduire pour la route (id de session jamais du corps, DTO validé)
- [Source: apps/api/src/email/templates/password-changed.hbs] — template déjà existant, réutilisé tel quel
- [Source: apps/api/src/auth/dto/reset-password.dto.ts] — bornes de validation `MinLength(8)`/`MaxLength(128)` à répliquer pour `newPassword`
- [Source: apps/web/src/app/core/account/account.service.ts, features/account/account.ts, account.html] — patron exact du formulaire `displayName` à répliquer pour le mot de passe
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts:490] — patron `HttpErrorResponse`/statut HTTP précis côté front
- [Source: apps/web/src/app/core/theme/tones.ts] — clés `account.*` existantes dans les 3 thèmes, patron à étendre

### Review Findings

Revue de code adversariale du 2026-08-07 (3 couches parallèles : Blind Hunter, Edge Case Hunter, Acceptance Auditor). L'Acceptance Auditor n'a remonté aucune violation d'AC — implémentation vérifiée conforme, tests re-exécutés indépendamment avec les mêmes résultats que revendiqués. 20 constats bruts (14 Blind Hunter + 3 Edge Case Hunter, dédoublonnés) → 0 décision, 1 patch, 9 différés, 4 écartés comme faux positifs après vérification.

- [x] [Review][Patch] `revokeSessions()` construisait son `where` via un test de vérité (`exceptSid ? ... : ...`) plutôt qu'un test de présence — une chaîne vide (jamais produite par `express-session` en pratique, mais non garantie par le typage `exceptSid?: string`) basculerait silencieusement en « révoque tout », y compris la session courante. **Corrigé** : `exceptSid !== undefined ? ... : ...`. Test dédié ajouté (`exceptSid` vide → traité comme une session à exclure, jamais comme « tout révoquer »). [apps/api/src/auth/auth.service.ts (`revokeSessions`)]
- [x] [Review][Defer] Aucune réauthentification récente / step-up pour cette action sensible, seule une vérification du mot de passe courant — accepté à l'échelle hobby du projet, cohérent avec l'absence de step-up ailleurs (la connexion initiale suffit pour toute action de compte). — deferred, pre-existing (choix d'architecture global, pas spécifique à cette story)
- [x] [Review][Defer] Cast `(req.user as { id: string }).id` sans garde d'exécution sur `PATCH /me/password` — reproduit le patron déjà utilisé partout dans `AccountController`, déjà différé en story 28.4. — deferred, pre-existing (patron déjà accepté ailleurs)
- [x] [Review][Defer] Canal temporel entre « compte introuvable » (retour immédiat) et « mot de passe incorrect » (attend `argon2.verify`) — `userId` provient de la session authentifiée, jamais d'une entrée utilisateur attaquable ; risque théorique très faible. — deferred, pre-existing (surface d'attaque non exploitable via cette route)
- [x] [Review][Defer] Aucun test n'exerce l'effet réel du `@Throttle` (429 au 6ᵉ essai) — absent aussi sur `login`/`reset-password`/etc., convention déjà établie dans le projet de ne tester que la présence du décorateur. — deferred, pre-existing (convention de test déjà en place)
- [x] [Review][Defer] `ChangePasswordDto` n'interdit pas `newPassword === currentPassword` — même lacune préexistante sur `ResetPasswordDto`, pas une régression de cette story. — deferred, pre-existing (lacune déjà présente sur le DTO homologue)
- [x] [Review][Defer] TOCTOU entre le `findUnique` initial et le `tx.user.update` de `changePassword()` — un `P2025` (compte supprimé entre-temps) remonterait en 500 brut plutôt qu'en 404 propre ; même lacune que `resetPassword()` existant (`tx.user.update` sans garde P2025 non plus), fenêtre de course astronomiquement improbable. — deferred, pre-existing (même patron que `resetPassword()`, non traité là non plus)
- [x] [Review][Defer] Pas de verrou optimiste sur `passwordHash` — deux soumissions concurrentes (double-clic, deux onglets) peuvent se chevaucher, la dernière écriture l'emporte ; `revokeSessions` reste idempotent (auto-cicatrisant), aucune corruption de données, juste une possible incohérence transitoire du `exceptSid` appliqué. — deferred, pre-existing (edge case à très faible probabilité, non couvert par les AC)
- [x] [Review][Defer] `submitPassword()` (web) n'a pas de garde de ré-entrance contre une touche Entrée pendant `passwordSaving()` — même lacune préexistante sur `submit()` (formulaire `displayName`), pas spécifique à cette story ; à corriger pour les deux formulaires ensemble si jamais traité. — deferred, pre-existing (lacune déjà présente sur le formulaire homologue)
- [x] [Review][Defer] `NotFoundException` (404, compte introuvable) tombe sur le message d'erreur générique côté front, non testé spécifiquement — état très improbable (utilisateur authentifié dont le compte vient de disparaître), repli sûr déjà en place (message générique, pas de plantage). — deferred, pre-existing (edge case à très faible probabilité, repli déjà sûr)

**Écarté (faux positifs après vérification)** :
- « L'envoi e-mail `password-changed` sans `try/catch` pourrait transformer un changement réussi en 500 » — vérifié faux : `EmailService.sendMail()` ne relève jamais (`catch` interne → `{ ok: false }`), confirmé par lecture directe de `apps/api/src/email/email.service.ts:21-42`.
- « Aucune protection CSRF visible sur cette route mutante » — vérifié faux : cookie de session configuré `sameSite: 'lax'` (`apps/api/src/main.ts:34`), protection globale déjà en place pour toutes les routes mutantes équivalentes (`updateDisplayName`, `updateTheme`, `resetPassword`), rien de spécifique à cette route qui y échapperait.
- « `passwordSaved()` pourrait rester bloqué à `true` en coexistant avec un message d'erreur affiché par ailleurs » — vérifié faux : `passwordError`/`passwordSaved` sont tous deux réinitialisés en tête de chaque `submitPassword()`, aucune autre voie du code ne positionne `passwordError` sans repasser par cette réinitialisation.
- « `revokeSessions()` non testé spécifiquement pour la branche `exceptSid === undefined` après le refactor » — vérifié faux : les 8 tests `resetPassword` existants (non modifiés) exercent exactement cette branche et sont tous passés, confirmé par ré-exécution indépendante de la suite complète (Acceptance Auditor).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- Refactor de `resetPassword()` (extraction de `revokeSessions`) : le `where` conditionnel (`exceptSid ? {...} : { userId }`) a préservé exactement les mêmes appels `tx.userSession.findMany`/`deleteMany` qu'avant refactor — les 8 tests `resetPassword` existants sont passés sans aucune modification de leurs assertions, comme anticipé par la story.
- Test `compte introuvable` de `changePassword` : première version assertait `expect(argon2.verify).not.toHaveBeenCalled()` en absolu, mais `argon2.verify` est un mock partagé par tout le fichier de test (jamais réinitialisé entre `it`) — les appels des tests précédents (`validateUser`, etc.) faussaient le compte. Corrigé avec le patron delta déjà utilisé ailleurs dans le même fichier (`verifyCallsBefore`).
- Vérification manuelle : au lieu de me limiter à un seul curl (AC3 implique une comparaison entre deux sessions), j'ai ouvert deux sessions réelles sur le compte de démo (deux logins successifs, deux cookies), changé le mot de passe depuis l'une, puis confirmé via `GET /auth/me` que l'autre session était bien révoquée (403) pendant que la session ayant agi restait valide (200) — vérification bout-en-bout de l'AC3 complète, pas seulement unitaire.

### Completion Notes List

- 6 tasks complétées en TDD. Suites finales : 49/49 suites API (963/963 tests), 80/80 suites web (1076/1076 tests), typecheck API propre, aucune régression.
- `AuthService.revokeSessions(tx, userId, exceptSid?)` extraite de la logique jusque-là inline dans `resetPassword()` — partagée par `resetPassword()` (toutes sessions) et le nouveau `changePassword()` (`exceptSid` = session courante), sans duplication (AC5).
- `AuthService.changePassword()` : vérifie le mot de passe courant (argon2) avant toute écriture (AC2), change le hash et révoque les autres sessions dans la même transaction Prisma (atomicité), envoie l'e-mail `password-changed` existant hors transaction (best-effort).
- `PATCH /me/password` routé dans `AccountController` (cohérent avec `display-name`/`theme`) mais délégué à `AuthService` (exportée par `AuthModule`, importée par `AccountModule`) plutôt qu'à `AccountService` — décision actée dès la création de la story pour éviter de dupliquer la logique de session/argon2.
- Aucune migration Prisma nécessaire (pas de nouveau champ sur `User`).
- Formulaire de changement de mot de passe ajouté à l'écran `/account`, formulaire distinct de celui du nom affiché ; 7 nouvelles clés de thème déclinées dans les 3 thèmes.
- Vérification manuelle bout-en-bout réelle avec deux sessions simultanées (voir Debug Log) — AC3 confirmée avec de vraies requêtes HTTP, pas seulement des tests unitaires. Mot de passe de démo restauré après vérification.
- Dépassement de budget bundle web confirmé préexistant, légère hausse cohérente avec le nouveau formulaire (~216.61 Ko vs ~214.41 Ko en story 28.4) — pas une régression de cette story.

### File List

**Modifiés (API)**
- `apps/api/src/auth/auth.service.ts` (+`revokeSessions()`, +`changePassword()`, refactor `resetPassword()`)
- `apps/api/src/auth/auth.module.ts` (+`exports: [AuthService]`)
- `apps/api/src/auth/auth.service.spec.ts` (+describe `changePassword`, mock `prisma.user.findUnique`, +test `exceptSid` vide en revue de code)
- `apps/api/src/account/account.module.ts` (+`imports: [AuthModule]`)
- `apps/api/src/account/account.controller.ts` (+`@Patch('password')`, injection `AuthService`)
- `apps/api/src/account/account.controller.spec.ts` (+tests `changePassword`, mock `AuthService`, `req.sessionID` posé par le guard de test)

**Nouveaux (API)**
- `apps/api/src/account/dto/change-password.dto.ts`

**Modifiés (web)**
- `apps/web/src/app/core/account/account.service.ts` (+`changePassword()`)
- `apps/web/src/app/core/account/account.service.spec.ts` (+test `changePassword`)
- `apps/web/src/app/features/account/account.ts` (+`passwordForm`, +`submitPassword()`)
- `apps/web/src/app/features/account/account.html` (+section changement de mot de passe)
- `apps/web/src/app/features/account/account.spec.ts` (+describe dédié, 5 tests)
- `apps/web/src/app/core/theme/tones.ts` (+7 clés `account.password_*` × 3 thèmes)

## Change Log

- 2026-08-07 : Implémentation complète (bmad-dev-story). Task 1 (extraction de `revokeSessions()`), Task 2 (`AuthService.changePassword()`), Task 3 (`PATCH /me/password`, `AuthModule`/`AccountModule`), Task 4 (`AccountService.changePassword()` web), Task 5 (formulaire écran de compte + thèmes), Task 6 (suites complètes + vérification manuelle bi-session). Statut passé à review.
- 2026-08-07 : Revue de code adversariale (3 couches parallèles). 0 décision, 1 patch appliqué (`revokeSessions()` : test de présence explicite au lieu d'un test de vérité sur `exceptSid`, garde contre une chaîne vide silencieusement traitée comme « tout révoquer »), 9 constats différés (documentés dans `deferred-work.md`), 4 faux positifs écartés après vérification. Suites finales : 49/49 suites API (964/964 tests), typecheck propre. Statut passé à done.
