---
baseline_commit: 798a01fcacbe2c94a03d92ab26ec059076cf408b
---

# Story 5.2: Inviter un ami par e-mail

Status: done

## Story

As a MJ,
I want saisir l'adresse e-mail d'un ami dans le formulaire d'invitation d'une partie,
so that il reçoit un lien et peut rejoindre la partie sans que je doive le lui envoyer par un autre canal.

## Acceptance Criteria

1. **Given** je suis MJ d'une partie et je saisis une adresse e-mail dans le formulaire d'invitation, **When** cette adresse correspond à un utilisateur déjà inscrit, **Then** le système utilise le mécanisme `Invitation` existant (upsert idempotent) et envoie un e-mail contenant un lien vers l'invitation en attente dans l'app. [Source: epics.md#Story 5.2, AC1 ; PRD FR-3]
2. **Given** l'adresse ne correspond à aucun utilisateur inscrit, **When** je soumets le formulaire, **Then** le système génère un `InviteLink` à usage unique (`maxUses: 1`, `targetEmail` renseigné à cette adresse) et l'envoie par e-mail. [Source: epics.md#Story 5.2, AC2 ; PRD FR-3]
3. **Given** une invitation ou un `InviteLink` valide (non révoqué, non expiré) existe déjà pour cette adresse sur cette partie, **When** j'invite une seconde fois la même adresse, **Then** le système renvoie l'invitation/le lien existant plutôt que d'en créer un nouveau en doublon. [Source: epics.md#Story 5.2, AC3 ; PRD FR-3]
4. **Given** l'envoi de l'e-mail échoue, **When** je soumets le formulaire d'invitation, **Then** je vois un message d'erreur explicite (jamais un échec silencieux). [Source: epics.md#Story 5.2, AC4]
5. **Given** l'envoi réussit, **When** je soumets le formulaire, **Then** je vois une confirmation que l'e-mail a été envoyé. [Source: epics.md#Story 5.2, AC5]

## Tasks / Subtasks

- [x] **Task 1 — Migration Prisma : `InviteLink.targetEmail`** (AC: 2, 3)
  - [x] Ajouter `targetEmail String?` à `model InviteLink` dans `apps/api/prisma/schema.prisma` (nullable — `null` pour un lien ouvert partageable existant, renseigné uniquement pour un lien généré par ce flow).
  - [x] `docker compose exec api pnpm prisma migrate dev --name invite_link_target_email`.

- [x] **Task 2 — DTO `InviteByEmailDto`** (AC: 1, 2)
  - [x] Créer `apps/api/src/invitations/dto/invite-by-email.dto.ts` : `class InviteByEmailDto { @IsEmail() email!: string; }` (suit exactement le pattern de `create-invitation.dto.ts`, un seul champ décoré).

- [x] **Task 3 — `InviteLinksService.findOrCreateForEmail`** (AC: 2, 3)
  - [x] Nouvelle méthode dans `apps/api/src/invitations/invite-links.service.ts` : `findOrCreateForEmail(partieId: string, mjId: string, email: string): Promise<InviteLink>`.
    - Cherche un `InviteLink` existant `{ partieId, targetEmail: email, revoked: false, expiresAt: { gt: new Date() } }` (`findFirst`, `orderBy: { createdAt: 'desc' }`). Si trouvé, le retourne tel quel (dédoublonnage AC3).
    - Sinon, crée un nouveau lien : `token = randomBytes(32).toString('base64url')` (même génération que `create()`), `maxUses: 1`, `targetEmail: email`, `expiresAt: new Date(Date.now() + DEFAULT_TTL_MS)` (réutilise la constante `DEFAULT_TTL_MS` déjà définie en haut du fichier — +7 jours, cohérent avec le TTL par défaut des liens ouverts).
    - Pas de vérification MJ ici (délégué à l'appelant, `InvitationsService.inviteByEmail`, qui appelle déjà `parties.getOwned`).

- [x] **Task 4 — `InvitationsService.inviteByEmail`** (AC: 1, 2, 3, 4, 5)
  - [x] Injecter `InviteLinksService` et `EmailService` dans le constructeur d'`InvitationsService` (`apps/api/src/invitations/invitations.service.ts`) — les deux sont déjà providers du même `InvitationsModule` ou importables sans cycle (voir Task 6).
  - [ ] Nouvelle méthode `inviteByEmail(partieId: string, inviterId: string, email: string): Promise<{ ok: boolean }>` :
    1. `const partie = await this.parties.getOwned(partieId, inviterId);` (vérif MJ + récupère `partie.name` pour l'e-mail, une seule requête).
    2. `const user = await this.prisma.user.findUnique({ where: { email } });`
    3. Si `user` existe : `await this.invite(partieId, inviterId, user.id);` (réutilise la méthode `invite()` existante, déjà idempotente via `upsert` — AC1, AC3). Lien de l'e-mail : `` `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/` `` (tableau de bord — les invitations `PENDING` y sont listées, cf. `dashboard.ts`/`GET /invitations`).
    4. Sinon : `const link = await this.inviteLinks.findOrCreateForEmail(partieId, inviterId, email);` (AC2, AC3). Lien de l'e-mail : `` `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/join/${link.token}` `` (même construction que `joinUrl()` côté web, `partie-detail.ts:206`).
    5. Dans les deux branches, appeler `await this.emailService.sendMail('invitation', email, { partieName: partie.name, link })`.
    6. Retourner `{ ok: result.ok }` (AC4/AC5 : le contrôleur transmet cette valeur, le frontend affiche succès/erreur en conséquence — **ne pas** transformer un `{ ok: false }` en exception HTTP, `EmailService.sendMail` ne relance jamais, cf. Story 5.1).

- [x] **Task 5 — Route API** (AC: 1, 2, 3, 4, 5)
  - [x] `apps/api/src/invitations/invitations.controller.ts` : nouvelle route `POST parties/:id/invitations/by-email` (même contrôleur, même garde `AuthenticatedGuard` déjà sur la classe) : `inviteByEmail(@CurrentUser() user, @Param('id') id, @Body() dto: InviteByEmailDto) { return this.invitations.inviteByEmail(id, user.id, dto.email); }`.

- [x] **Task 6 — `InvitationsModule` importe `EmailModule`** (AC: 1, 2)
  - [x] `apps/api/src/invitations/invitations.module.ts` : ajouter `EmailModule` aux `imports` (déjà exporté par lui-même, cf. Story 5.1). `InviteLinksService` est déjà provider du même module — pas besoin d'export supplémentaire pour qu'`InvitationsService` puisse l'injecter (même module).

- [x] **Task 7 — Frontend : champ e-mail dans le formulaire d'invitation existant** (AC: 1, 2, 4, 5)
  - [x] `apps/web/src/app/core/parties/parties.service.ts` : nouvelle méthode `inviteByEmail(id: string, email: string): Promise<{ ok: boolean }>` — `POST ${API}/parties/${id}/invitations/by-email` avec `{ email }`, suit exactement le pattern de `inviteUser()`.
  - [ ] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` : nouveaux signaux `inviteEmail = signal('')`, `invitingByEmail = signal(false)` ; nouvelle méthode `async inviteByEmail(): Promise<void>` — valide un format minimal (non vide), appelle `this.parties.inviteByEmail(p.id, email)`, affiche `notice` (succès, réutilise la clé de thème `partie.notice_invited_email`) ou un message d'erreur explicite (nouvelle clé `partie.notice_invite_email_error`) si `{ ok: false }`, vide le champ après succès.
  - [ ] `apps/web/src/app/features/parties/partie-detail/partie-detail.html` : ajouter un champ e-mail + bouton juste après le bloc `search-row`/résultats existant (section `@if (isMj())`), sur le modèle visuel du champ de recherche déjà présent (`mat-form-field appearance="outline"` + `mat-flat-button`).
  - [ ] `apps/web/src/app/core/theme/tones.ts` : ajouter 3 nouvelles clés à chacun des 3 thèmes (`grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk`) : `partie.invite_by_email_label` (libellé du champ), `partie.invite_by_email_btn` (libellé du bouton), `partie.notice_invited_email` (confirmation, avec `{email}` interpolé comme `partie.notice_invited` interpole `{name}`), `partie.notice_invite_email_error` (message d'erreur explicite). Rester dans le vocabulaire thématique déjà établi (ex. Grimoire Émeraude : "missive", "convoquer" ; Forêt Ancienne : "sifflet", "appeler" ; Steampunk : "télégramme", "recruter").

- [x] **Task 8 — Tests** (AC: 1, 2, 3, 4, 5)
  - [x] `apps/api/src/invitations/invite-links.service.spec.ts` : tests pour `findOrCreateForEmail` — crée un nouveau lien si aucun n'existe (vérifier `maxUses: 1`, `targetEmail`) ; retourne le lien existant si un `InviteLink` valide `{ partieId, targetEmail }` existe déjà (pas de second `create` appelé) ; ignore un lien révoqué ou expiré pour la même adresse (en crée un nouveau).
  - [x] `apps/api/src/invitations/invitations.service.spec.ts` : tests pour `inviteByEmail` — utilisateur existant (appelle `invite()` en interne, envoie `sendMail('invitation', email, { partieName, link: '.../' })`) ; utilisateur inconnu (appelle `inviteLinks.findOrCreateForEmail`, envoie `sendMail(..., { link: '.../join/<token>' })`) ; propage `{ ok: false }` si `emailService.sendMail` renvoie `{ ok: false }` (pas d'exception levée) ; vérifie `parties.getOwned` appelé (garde MJ).
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` : teste `inviteByEmail()` — succès affiche la notice de confirmation et vide le champ ; échec (`{ ok: false }`) affiche le message d'erreur, ne vide pas le champ.

## Dev Notes

- **Réutiliser, pas dupliquer** : `invite()` (déjà idempotent via `prisma.invitation.upsert`) et le générateur de token (`randomBytes(32).toString('base64url')`, déjà utilisé dans `invite-links.service.ts:35`) sont réutilisés tels quels — cette story n'invente aucune nouvelle logique de dédoublonnage pour le cas "utilisateur existant", seulement pour le cas `InviteLink` (Task 3).
- **EmailService ne relance jamais** (Story 5.1) : `sendMail()` renvoie toujours `{ ok: boolean }`, jamais d'exception pour un échec d'envoi. `inviteByEmail` doit propager cette valeur telle quelle jusqu'au frontend (AC4 : "message d'erreur explicite", pas un crash HTTP 500).
- **Fichiers existants à modifier (UPDATE, pas NEW)** :
  - `apps/api/prisma/schema.prisma` (ajout d'un champ sur `InviteLink`, modèle existant)
  - `apps/api/src/invitations/invite-links.service.ts` (nouvelle méthode, ne pas toucher aux méthodes existantes `create`/`join`/`preview`/`consumeLink`)
  - `apps/api/src/invitations/invitations.service.ts` (nouvelle méthode + nouvelles dépendances au constructeur)
  - `apps/api/src/invitations/invitations.controller.ts` (nouvelle route, le contrôleur a déjà `@UseGuards(AuthenticatedGuard)` au niveau classe)
  - `apps/api/src/invitations/invitations.module.ts` (ajout d'un import)
  - `apps/web/src/app/core/parties/parties.service.ts` (nouvelle méthode, pattern identique à `inviteUser`)
  - `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` / `.html` (nouveau champ dans la section `@if (isMj())` déjà existante, ne pas toucher à la section liens/membres)
  - `apps/web/src/app/core/theme/tones.ts` (3 nouvelles clés × 3 thèmes, dans le bloc `partie.*` déjà présent de chaque thème)
- **`@master-jdr/shared` non modifié** : `InviteByEmailDto` (API, avec décorateurs `class-validator`) et le payload web (`{ email: string }`) restent locaux à chacun des deux côtés — suit le pattern déjà établi (`InviteLinkPayload` est une interface locale de `parties.service.ts`, jamais dans `packages/shared`). Aucune valeur runtime à partager ici, donc aucun risque de casser Jest (leçon Story 4.7/5.1).
- **Lien "invitation en attente"** : il n'existe pas de route Angular dédiée à une invitation individuelle — les invitations `PENDING` sont listées sur le tableau de bord (`/`, composant `Dashboard`, déjà connecté à `GET /invitations`). Le lien e-mail pour un utilisateur existant pointe donc vers la racine de l'app, pas vers une URL par ID.
- **`WEB_ORIGIN`** : déjà lu ailleurs côté API (`main.ts:53`, pour CORS) via `process.env.WEB_ORIGIN ?? 'http://localhost:4200'` — même pattern de fallback à réutiliser ici pour construire les liens d'e-mail.
- **Architecture (AD-5 de la spine Palier 4)** : `InvitationsService.inviteByEmail` est le point d'orchestration unique ; `InviteLinksService` ne connaît que la logique de dédoublonnage/création de lien, pas l'envoi d'e-mail. [Source: ARCHITECTURE-SPINE.md#AD-5]

### Project Structure Notes

- Aucun nouveau module ni fichier de service — cette story étend des fichiers existants (`InvitationsService`, `InviteLinksService`, `InvitationsController`, `InvitationsModule`) plutôt que d'en créer, cohérent avec le principe "un module par domaine, pas de duplication".
- Un seul nouveau fichier côté API : `apps/api/src/invitations/dto/invite-by-email.dto.ts`.
- Aucun nouveau composant Angular : extension de `partie-detail` existant (cf. AD-7 de la spine : "pas de nouvelle page ni de nouveau layout").

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2: Inviter un ami par e-mail]
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260706/prd.md#4.2 Invitation par e-mail (FR-3)]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260706/ARCHITECTURE-SPINE.md#AD-5 Invitation par e-mail]
- [Source: _bmad-output/implementation-artifacts/5-1-infrastructure-envoi-emails.md — EmailService.sendMail(template, to, data), ne relance jamais]
- [Source: apps/api/src/invitations/invitations.service.ts — `invite()` existant, idempotent]
- [Source: apps/api/src/invitations/invite-links.service.ts — génération de token, `linkStatus()`]
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts — section invite existante (`search`, `results`, `invite()`, `createLink()`)]
- [Source: apps/web/src/app/core/theme/tones.ts — clés `partie.*` par thème]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- Aucun blocage majeur — l'implémentation a suivi la story sans déviation par rapport aux tâches prévues.

### Completion Notes List

- Vérification manuelle : redémarrage de l'API confirmé sans erreur de compilation, route `POST /parties/:id/invitations/by-email` bien mappée dans les logs NestJS.
- Suite complète : 241 tests API (18 suites) + 273 tests web (38 suites) passent, aucune régression. Lint propre sur tous les fichiers de cette story après correctif prettier (`partie-detail.ts`).
- Les erreurs `@typescript-eslint/no-unsafe-assignment` restantes sur `invitations.service.spec.ts`/`invite-links.service.spec.ts` (usages de `expect.objectContaining`/`expect.any`) sont une dette de lint préexistante déjà présente sur les mêmes patterns ailleurs dans ces fichiers avant cette story — non introduites ici.

### File List

- `apps/api/prisma/schema.prisma` (modifié — ajout `InviteLink.targetEmail`)
- `apps/api/prisma/migrations/20260707013212_invite_link_target_email/` (nouveau, migration)
- `apps/api/src/invitations/dto/invite-by-email.dto.ts` (nouveau)
- `apps/api/src/invitations/invite-links.service.ts` (modifié — `findOrCreateForEmail`)
- `apps/api/src/invitations/invite-links.service.spec.ts` (modifié — tests `findOrCreateForEmail`)
- `apps/api/src/invitations/invitations.service.ts` (modifié — `inviteByEmail`, nouvelles dépendances constructeur)
- `apps/api/src/invitations/invitations.service.spec.ts` (modifié — tests `inviteByEmail`)
- `apps/api/src/invitations/invitations.controller.ts` (modifié — route `POST .../by-email`)
- `apps/api/src/invitations/invitations.module.ts` (modifié — import `EmailModule`)
- `apps/web/src/app/core/parties/parties.service.ts` (modifié — méthode `inviteByEmail`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — signaux + méthode `inviteByEmail`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié — champ e-mail + bouton)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.scss` (modifié — `.notice.error`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — tests `inviteByEmail`, mock `PartiesService` étendu)
- `apps/web/src/app/core/theme/tones.ts` (modifié — 4 clés × 3 thèmes)

### Review Findings

- [x] [Review][Patch] E-mail non normalisé (casse) — `prisma.user.findUnique({ where: { email } })` et `findOrCreateForEmail` comparent la chaîne brute : `Foo@Bar.com` ne matche ni un utilisateur inscrit en `foo@bar.com`, ni un `InviteLink` déjà émis pour la même adresse en casse différente (viole AC1/AC3 dans ce cas). [apps/api/src/invitations/invitations.service.ts:132 ; apps/api/src/invitations/invite-links.service.ts:143-166]
- [x] [Review][Patch] Pas de `@MaxLength` sur `InviteByEmailDto.email` — défense en profondeur triviale, aucune limite de taille avant la requête de dédoublonnage/l'e-mail. [apps/api/src/invitations/dto/invite-by-email.dto.ts]
- [x] [Review][Patch] Pas de garde de ré-entrance côté frontend — `Entrée` répétée ou double-clic pendant une requête en cours peut déclencher plusieurs appels concurrents à `inviteByEmail()`, aggravant la fenêtre de course de `findOrCreateForEmail`. [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:185-204]
- [x] [Review][Defer] Race TOCTOU dans `findOrCreateForEmail` (`findFirst` puis `create`, sans transaction ni contrainte unique en base) — deux requêtes véritablement concurrentes (pas juste un double-clic, déjà couvert par le patch ci-dessus) pourraient créer deux `InviteLink` pour la même adresse. Un vrai correctif nécessiterait soit une transaction sérialisable, soit un index unique partiel (`WHERE revoked = false`, non exprimable directement en Prisma `@@unique`) — complexité disproportionnée par rapport au risque réel pour une appli hobby MJ-only. [apps/api/src/invitations/invite-links.service.ts:143-166] — deferred, risque résiduel faible et complexité de correctif disproportionnée pour ce palier.
- [x] [Review][Defer] Pas d'index DB sur `(partieId, targetEmail)` pour la requête de dédoublonnage — négligeable au volume de données attendu pour ce projet. [apps/api/prisma/schema.prisma] — deferred, non prioritaire au volume actuel.
- [x] [Review][Defer] Message d'erreur générique si l'échec vient d'autre chose que l'envoi d'e-mail (ex. autorisation MJ) — le bouton n'est affiché qu'au MJ (`@if (isMj())`), donc seul un appel direct à l'API en contournant l'UI déclencherait ce cas ; un vrai correctif nécessiterait un contrat d'erreur typé non spécifié par cette story. [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:198-201] — deferred, impact réel limité à un contournement direct de l'API.

**Findings dismissed as noise/false positives (6) :**
- « Pas de garde anti-auto-invitation dans la branche e-mail inconnu » (Edge Case Hunter) — faux positif : si l'e-mail du MJ correspond à son propre compte, `prisma.user.findUnique` le retrouve et `invite()` est appelé avec `inviteeUserId === inviterId`, ce qui déclenche déjà le `BadRequestException` existant de `invite()` — la garde n'est pas contournée.
- « Vecteur de spam/abus par e-mail, aucun rate-limiting » (Blind Hunter) — le `ThrottlerModule` global (20 req/min) s'applique déjà à toutes les routes ; l'endpoint exige un MJ authentifié propriétaire de la partie, pas un acteur anonyme ; aucune AC ne demande de limite supplémentaire.
- « Lien faible (`origin + '/'`) pour un utilisateur existant, pas un lien profond » (Blind Hunter) — correspond exactement à la décision documentée dans les Dev Notes de la story (aucune route par invitation n'existe dans l'app), pas un bug.
- « Fallback silencieux de `WEB_ORIGIN` vers localhost » (Blind Hunter) — convention préexistante du projet (`main.ts`, CORS), non liée au scope de cette story ; la décision fail-fast de la Story 5.1 était scopée spécifiquement aux variables `MAIL_*`.
- « Aucun test du tout » (Blind Hunter) — faux positif dû à un diff tronqué fourni au sous-agent (les fichiers de test n'y figuraient pas) ; les tests existent et passent (241 API + 273 web, vérifié).
- « Aucune clé i18n ajoutée dans `tones.ts` » (Blind Hunter) — même cause : diff tronqué fourni au sous-agent, `tones.ts` a bien été mis à jour (12 lignes × 3 thèmes), vérifié dans le fichier réel.

## Change Log

- 2026-07-07 : Implémentation complète (Tasks 1-8). Aucune déviation par rapport au plan de la story.
- 2026-07-07 : Revue de code (3 couches). 3 patches appliqués (normalisation e-mail casse/espaces, `@MaxLength(254)`, garde anti double-soumission frontend). 3 items différés dans `deferred-work.md`. 242 tests API + 274 tests web, lint propre.
