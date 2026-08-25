---
baseline_commit: 373acf8c4c7b4eb59099a9ff35491a901cb49a01
---

# Story 29.6: Clôture explicite d'une partie

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want déclarer qu'une partie est terminée et pouvoir revenir sur cette décision,
so that mes listes cessent de mélanger ce qui vit et ce qui est fini.

## Contexte

**Sixième story de l'épic 29**, renumérotée depuis `29-4-cloture-explicite-dune-partie` par `correct-course` (2026-08-08) — même contenu, seule la clé a changé (voir `sprint-change-proposal-2026-08-08.md`). Elle ne dépend d'aucune des stories 29.0-29.5 (toutes `done`) au sens technique : son seul prérequis est l'architecture cible `AD-8`, déjà écrite dans `ARCHITECTURE-SPINE.md` et **anticipée dans le code actuel** — `PartiesService.toPartieDto()` porte aujourd'hui ce commentaire explicite :

> `// status/coverImageUrl volontairement absents : Partie.closedAt n'existe pas encore dans le schéma (story 29.4), coverImageUrl non plus (story 29.10).`

Cette story lève exactement cette dette : elle ajoute `Partie.closedAt` au schéma et le champ `status: PartieStatus` à `PartieDto`.

**Hors périmètre explicite** : la signalétique complète (badges multi-signaux, intertitres de liste « ce qui t'attend / en cours / à venir / terminées », `GET /me/party-signals`) appartient à la **story 29.7**, qui consommera le même champ `status`. Cette story-ci ne livre que : la persistance de la décision MJ, le champ `status` dérivé et projeté, l'action MJ de clôture/réouverture, et un traitement visuel minimal « en retrait » dans les listes existantes (Dashboard) — pas les quatre intertitres ni les badges de signal.

## Acceptance Criteria

1. **Given** je suis MJ d'une partie active, **When** je la déclare terminée, **Then** sa date de clôture est enregistrée.
2. **Given** une partie que j'ai clôturée, **When** je reviens sur ma décision, **Then** la date de clôture est effacée et la partie redevient active.
3. **Given** une partie non clôturée, sans aucun scénario ni séance, **When** son statut est calculé, **Then** il vaut « pas encore commencée ».
4. **Given** le statut d'une partie, **When** il est calculé, **Then** il l'est côté serveur, dans la projection, **and** aucun écran ne le dérive lui-même.
5. **Given** une partie terminée, **When** elle apparaît dans une liste, **Then** elle est visuellement en retrait, **and** elle reste entièrement consultable.

## Tasks / Subtasks

### Backend — schéma, projection, actions MJ

- [x] Task 1 — Schéma : `Partie.closedAt` (AD-8) (AC: #1, #2)
  - [x] `apps/api/prisma/schema.prisma`, `model Partie` : ajouter `closedAt DateTime?` — même forme que `Scenario.closedAt` (ligne 473, déjà en place, colonne nullable sans `@default`).
  - [x] `docker compose exec api pnpm prisma migrate dev --name partie_closed_at` puis `docker compose exec api pnpm prisma generate`. Nom de migration libre mais descriptif (convention : timestamp + slug, cf. `apps/api/prisma/migrations/`).

- [x] Task 2 — Paquet partagé : `PartieStatus` et `PartieDto.status` (AC: #3, #4)
  - [x] `packages/shared/src/index.ts` : ajouter, à côté de `PartieKind` (ligne ~52) :
    ```ts
    /** Statut d'une partie — dérivé côté serveur, jamais recalculé côté client (AD-8). */
    export type PartieStatus = 'A_VENIR' | 'EN_COURS' | 'TERMINEE';
    ```
  - [x] Dans `PartieDto` (ligne ~55), ajouter `status: PartieStatus;` — toujours présent (comme `role`, pas optionnel comme `mjPseudo`).
  - [x] Ne **rien** ajouter d'autre au DTO : ni `closedAt` brut, ni compteurs de scénarios/séances. Aucun AC de cette story n'exige la date elle-même côté client — seul le statut dérivé est consommé (AC4 : « aucun écran ne le dérive lui-même », donc aucune donnée brute à partir de laquelle un écran pourrait re-dériver).

- [x] Task 3 — `PartiesService` : dérivation du statut, projection, lecture en lot (AC: #3, #4)
  - [x] `apps/api/src/parties/parties.service.ts`, fonction `toPartieDto(partie, role)` : ajouter un 3e paramètre `hasScenario: boolean` et calculer :
    ```ts
    function toPartieDto(partie: any, role: 'mj' | 'player', hasScenario: boolean): PartieDto {
      return {
        // ...champs existants inchangés...
        status: partie.closedAt ? 'TERMINEE' : hasScenario ? 'EN_COURS' : 'A_VENIR',
      };
    }
    ```
    Retirer le commentaire de tête devenu obsolète (« status/coverImageUrl volontairement absents... ») — ne garder que la partie encore vraie (`coverImageUrl`, story 29.10).
  - [x] **Pourquoi une seule requête `Scenario` suffit à détecter « sans aucun scénario ni séance » (AC3)** : `Seance.scenarioId` est une FK obligatoire (`schema.prisma:488`, pas de séance orpheline possible) et tout scénario créé reçoit systématiquement au moins une séance (commentaire `parties.service.ts:73-75`, invariant `ScenariosService.addSeance`). Compter les `Scenario` de la partie suffit donc — inutile d'interroger `Seance` séparément.
  - [x] `listForUser(userId, role)` : **lecture en lot obligatoire** (AD-3, règle spine ligne 254 : « Toute lecture portant sur une collection de parties... se fait par requêtes groupées, jamais par itération d'appels »). Après avoir récupéré le tableau de parties, une seule requête groupée :
    ```ts
    const partieIds = parties.map((p) => p.id) /* ou memberships.map((m) => m.partie.id) côté player */;
    const counts = await this.prisma.scenario.groupBy({
      by: ['partieId'],
      where: { partieId: { in: partieIds } },
      _count: { _all: true },
    });
    const hasScenarioIds = new Set(counts.filter((c) => c._count._all > 0).map((c) => c.partieId));
    ```
    puis `toPartieDto(p, role, hasScenarioIds.has(p.id))` pour chaque ligne. **Jamais** un `count()` par partie dans une boucle `.map()`.
  - [x] `findOneDto(id, userId)` : une requête `this.prisma.scenario.count({ where: { partieId: id } })` (une seule partie ici, la lecture en lot ne s'applique pas) avant de construire le DTO.
  - [x] `create(mjId, dto)` : **aucune requête supplémentaire** — `hasScenario` est connu synchronement : `dto.kind === 'ONE_SHOT'` (le scénario vient d'être créé dans la même transaction, ligne 65-76 ; pour `CAMPAGNE_LINEAIRE`/`CAMPAGNE_EPISODIQUE`, `create()` n'en crée aucun, ligne 62-64).
  - [x] `update(id, userId, dto)` : ce endpoint ne touche jamais `closedAt` (Task 5 introduit des méthodes dédiées) mais doit tout de même projeter `status` — requiert une requête `scenario.count()` comme `findOneDto`.

- [x] Task 4 — Réutiliser la projection dans le reste du service (AC: #4)
  - [x] Repasser sur chaque appel existant à `toPartieDto(...)` (`create`, `listForUser` ×2 branches, `findOneDto`, `update`) pour leur passer le 3e argument désormais requis — le compilateur TypeScript signalera tout appel oublié (paramètre non optionnel), mais vérifier manuellement qu'aucun ne reçoit une valeur bricolée (`true`/`false` en dur) hors des cas justifiés ci-dessus.

- [x] Task 5 — Actions MJ dédiées : `close()`/`reopen()` (AC: #1, #2)
  - [x] `apps/api/src/parties/parties.service.ts`, deux nouvelles méthodes, patron `getOwned` + `update` + double émission temps réel (AD-14, voir Task 6) :
    ```ts
    async close(id: string, userId: string): Promise<PartieDto> {
      const partie = await this.getOwned(id, userId);
      const updated = await this.prisma.partie.update({
        where: { id },
        data: { closedAt: new Date() },
      });
      await this.emitPartieAndMembers(id, partie.mjId);
      return toPartieDto(updated, 'mj', true /* hors périmètre : une partie qu'on peut clôturer a nécessairement au moins un scénario, sinon rien à jouer — mais si un jour ce n'est plus garanti, recalculer via count() plutôt que supposer */);
    }

    async reopen(id: string, userId: string): Promise<PartieDto> {
      const partie = await this.getOwned(id, userId);
      const updated = await this.prisma.partie.update({
        where: { id },
        data: { closedAt: null },
      });
      await this.emitPartieAndMembers(id, partie.mjId);
      const hasScenario = (await this.prisma.scenario.count({ where: { partieId: id } })) > 0;
      return toPartieDto(updated, 'mj', hasScenario);
    }
    ```
    **Point à trancher en implémentation, pas supposé ici** : `close()` peut légitimement être appelé sur une partie CAMPAGNE sans aucun scénario (le MJ abandonne avant même de commencer) — dans ce cas `hasScenario: true` en dur serait **faux**. Ne pas raccourcir : appeler `scenario.count()` dans `close()` aussi, comme dans `reopen()`, plutôt que de supposer. Le extrait ci-dessus est un point de départ, pas une implémentation à copier telle quelle — corriger cette incohérence avant de committer.
  - [x] Les deux méthodes sont **MJ-only** par construction (`getOwned` lève `NotFoundException`/`ForbiddenException` sinon) — même garde que `update()`/`remove()`.
  - [x] Aucune DTO de payload : les deux routes n'acceptent aucun corps de requête.

- [x] Task 6 — Émission temps réel : partie + chaque membre (AD-14) (AC: #1, #2)
  - [x] `apps/api/src/parties/parties.service.ts` : nouvelle méthode privée réutilisant `resolveParticipants` (déjà présente, ligne 201) :
    ```ts
    private async emitPartieAndMembers(partieId: string, mjId: string): Promise<void> {
      this.realtimeEvents.emit(partieTopic(partieId));
      const { participants } = await this.resolveParticipants(partieId, mjId);
      for (const p of participants) this.realtimeEvents.emit(userTopic(p.userId));
    }
    ```
  - [x] **Pourquoi les deux émissions sont nécessaires (AD-14, `ARCHITECTURE-SPINE.md:160`)** : `partieTopic(id)` atteint `PartieDetail` (déjà connecté à ce topic, `partie-detail.ts:348`) pour rafraîchir l'écran actuellement ouvert. `userTopic(userId)` par membre atteint le canal personnel déjà ouvert de chacun (`MyPartiesService.notifyChanged()` y est déjà câblé, `realtime.service.ts:90` — **aucun câblage frontend à ajouter**, la route `user:` → `myParties.notifyChanged()` existe depuis la Story 29.1) : c'est ce qui fait apparaître/disparaître la partie clôturée « en retrait » dans le Dashboard de chaque joueur sans qu'il ait besoin de recharger.
  - [x] Ne **pas** réutiliser ce helper dans `removeMember()`/`update()` existants — hors périmètre de cette story, ils ont leur propre comportement déjà revu et accepté.

- [x] Task 7 — Contrôleur : deux routes MJ-only (AC: #1, #2)
  - [x] `apps/api/src/parties/parties.controller.ts` :
    ```ts
    @Post(':id/close')
    close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      return this.parties.close(id, user.id);
    }

    @Post(':id/reopen')
    reopen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
      return this.parties.reopen(id, user.id);
    }
    ```
    Placer après `update()`, avant `remove()` — ordre de lecture logique, aucune contrainte de routage NestJS (pas de collision de path avec `:id`).

### Frontend — action MJ et traitement visuel « en retrait »

- [x] Task 8 — `PartiesService` (front) : deux nouveaux appels (AC: #1, #2)
  - [x] `apps/web/src/app/core/parties/parties.service.ts`, à côté de `remove()` :
    ```ts
    close(id: string): Promise<PartieDto> {
      return firstValueFrom(
        this.http.post<PartieDto>(`${API}/parties/${id}/close`, {}, { withCredentials: true }),
      );
    }

    reopen(id: string): Promise<PartieDto> {
      return firstValueFrom(
        this.http.post<PartieDto>(`${API}/parties/${id}/reopen`, {}, { withCredentials: true }),
      );
    }
    ```

- [x] Task 9 — `PartieDetail` : actions MJ de clôture/réouverture (AC: #1, #2)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`, à côté de `confirmDelete()` :
    ```ts
    async closeGame(p: PartieDto): Promise<void> {
      this.partie.set(await this.parties.close(p.id));
    }

    async reopenGame(p: PartieDto): Promise<void> {
      this.partie.set(await this.parties.reopen(p.id));
    }
    ```
    Mise à jour directe du signal local (même immédiateté que `invite()`/`createLink()` dans ce même fichier) — ne pas attendre le round-trip SSE, qui reste le mécanisme de propagation vers **les autres** onglets/utilisateurs, pas vers celui qui vient d'agir.
  - [x] Pas de `ConfirmDialog` pour `closeGame()` : contrairement à `confirmDelete()` (irréversible), la clôture est réversible par construction (AC2) — cohérent avec l'esprit « je reviens sur ma décision » de la story. Si l'implémentation juge un garde-fou nécessaire (double-clic accidentel), documenter le choix dans Completion Notes plutôt que de l'ajouter silencieusement.
  - [x] `partie-detail.html`, dans le bloc `@if (isMj())` de `mat-card-actions` (ligne ~374, à côté d'Éditer/Supprimer) :
    ```html
    @if (p.status !== 'TERMINEE') {
      <button mat-button (click)="closeGame(p)">
        <mat-icon>flag</mat-icon> {{ theme.tone()['partie.close_btn'] }}
      </button>
    } @else {
      <button mat-button (click)="reopenGame(p)">
        <mat-icon>replay</mat-icon> {{ theme.tone()['partie.reopen_btn'] }}
      </button>
    }
    ```
  - [x] Indicateur visible par **tous** les membres (pas seulement le MJ) quand `p.status === 'TERMINEE'` — placer près du titre/sous-titre de la carte (hors du bloc `@if (isMj())`), texte + icône (jamais la couleur seule, règle spine ligne 252) :
    ```html
    @if (p.status === 'TERMINEE') {
      <p class="closed-banner">
        <mat-icon aria-hidden="true">flag</mat-icon> {{ theme.tone()['partie.status_closed_label'] }}
      </p>
    }
    ```
    Emplacement exact dans le template à ajuster à l'implémentation (zone d'en-tête déjà dense — bandeau contextuel 29.4 gère le titre, cette story ajoute juste un signal secondaire discret).

- [x] Task 10 — Dashboard : traitement « en retrait » (AC: #5)
  - [x] `apps/web/src/app/features/dashboard/dashboard.html`, sur la `mat-card` de la boucle `allParties()` (ligne 32) : ajouter une classe conditionnelle `[class.tile--closed]="p.status === 'TERMINEE'"` et un signal non chromatique (icône + libellé court, pas seulement une opacité réduite — règle spine ligne 252, doublage du signal chromatique) dans `mat-card-subtitle`, par exemple à côté du `role-indicator` existant :
    ```html
    @if (p.status === 'TERMINEE') {
      <span class="status-indicator" aria-hidden="false">
        <mat-icon aria-hidden="true" class="role-icon">flag</mat-icon>
        {{ theme.tone()['dashboard.status_closed_badge'] }}
      </span>
    }
    ```
  - [x] `apps/web/src/app/features/dashboard/dashboard.scss` : nouvelle règle `.tile--closed { opacity: 0.65; }` (ou variante utilisant `--jdr-status-done`, déjà défini dans les 3 thèmes depuis la Story 29.0, `styles.scss:86,151,213` — préférer un `border-left`/`box-shadow` teinté `var(--jdr-status-done)` plutôt qu'une simple opacité, pour rester cohérent avec la palette de statut déjà livrée).
  - [x] Ne **pas** ajouter les quatre intertitres (« ce qui t'attend / en cours / à venir / terminées ») ni les badges de signal FR-12 — hors périmètre (story 29.7).

- [x] Task 11 — Nouvelles clés de thème (3 thèmes) (AC: #1, #2, #5)
  - [x] `apps/web/src/app/core/theme/tones.ts` : ajouter aux 3 blocs de thème actuels (`grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk` — le renommage de ce dernier en `atelier-cuivre` est la story 35.1, non livrée ; ne pas anticiper), à côté de `partie.edit_btn`/`partie.delete_btn` (lignes 71-72, 273-274, 472-473) :
    - `partie.close_btn` (ex. « Clore la campagne » / « Sceller le sentier » / « Mettre à l'arrêt » — un verbe d'action MJ, cohérent avec le registre déjà établi par `partie.delete_btn` dans chaque thème)
    - `partie.reopen_btn` (ex. « Rouvrir » / « Reprendre la route » / « Remettre en service »)
    - `partie.status_closed_label` (texte du bandeau visible par tous les membres, ex. « Cette partie est terminée »)
    - `dashboard.status_closed_badge` (libellé court du badge de liste, ex. « Terminée »)

### Tests

- [x] Task 12 — Backend : `parties.service.spec.ts` (AC: #1, #2, #3, #4)
  - [x] Mettre à jour les mocks `prisma` : ajouter `scenario.count: jest.Mock` et `scenario.groupBy: jest.Mock` (actuellement seul `scenario.create` est mocké, ligne 80-82).
  - [x] Mettre à jour les **deux tests existants qui assertent la forme exacte du DTO** (`"toPartieDto() n'énumère que les champs du DTO..."`, lignes 221 et 244) : ajouter `'status'` à la liste attendue de `Object.keys(dto)`, et mocker `scenario.groupBy` pour qu'il retourne un tableau cohérent avec le test (ex. `[{ partieId: 'p1', _count: { _all: 0 } }]` → `status: 'A_VENIR'`).
  - [x] Mettre à jour les tests `create renvoie une partie projetée...`, `listForUser(player)...`, `listForUser(mj)...` (lignes 118, 179, 203) pour inclure `status` dans l'objet attendu.
  - [x] Nouveaux tests de dérivation du statut (AC3, AC4) :
    - une partie CAMPAGNE sans scénario (`scenario.groupBy`/`count` → 0) → `status: 'A_VENIR'`.
    - une partie avec au moins un scénario, `closedAt: null` → `status: 'EN_COURS'`.
    - une partie avec `closedAt` renseigné → `status: 'TERMINEE'`, **quel que soit** le nombre de scénarios (le `closedAt` prime).
    - `create()` ONE_SHOT → `status: 'EN_COURS'` immédiat (scénario auto-créé), **sans appel à `scenario.count`/`groupBy`** (vérifier `expect(prisma.scenario.count).not.toHaveBeenCalled()` ou équivalent groupBy) — non-régression de performance explicite.
    - `listForUser` : `scenario.groupBy` appelé **une seule fois** pour N parties (pas de N+1), même style que le test existant `getAvailableSlots` « appelle getActiveDeclarations une seule fois pour N membres » (ligne 529).
  - [x] Nouveaux tests `close()`/`reopen()`, même style que `update()`/`removeMember()` (lignes 378-461) :
    - `close()` : MJ uniquement (403 sinon, aucun `prisma.partie.update` appelé) ; `prisma.partie.update` appelé avec `data: { closedAt: expect.any(Date) }` ; émet `partieTopic(id)` **et** `userTopic(userId)` pour le MJ et chaque membre résolu via `resolveParticipants` (mocker `membership.findMany`/`user.findUnique` en conséquence, même montage que les tests `getAvailableSlots` qui exercent déjà `resolveParticipants` indirectement).
    - `reopen()` : mêmes gardes, `data: { closedAt: null }`.
    - `close()` sur une partie déjà clôturée : pas d'AC dédié à l'idempotence — comportement non spécifié, documenter le choix retenu (ré-écrire `closedAt` avec une nouvelle date, ou no-op) dans Completion Notes plutôt que de le deviner silencieusement.

- [x] Task 13 — Backend : `parties.controller.spec.ts` (AC: #1, #2)
  - [x] Deux tests de routage, même patron que `scenarios.controller.spec.ts:111-113` (`close()` route `scenarioId`/`user` vers `ScenariosService.close`) : `close()`/`reopen()` du contrôleur routent `id`/`user.id` vers `PartiesService.close`/`reopen`.

- [x] Task 14 — Frontend : `parties.service.spec.ts` (front) (AC: #1, #2)
  - [x] Deux tests, même patron que le test `remove` existant (ligne 56) : `close(id)` → `POST /parties/:id/close` avec `withCredentials`, `reopen(id)` → `POST /parties/:id/reopen`.

- [x] Task 15 — Frontend : `partie-detail.spec.ts` (AC: #1, #2, #5)
  - [x] Bouton « Clôturer » visible pour le MJ quand `status !== 'TERMINEE'`, absent pour un joueur.
  - [x] Bouton « Rouvrir » visible pour le MJ quand `status === 'TERMINEE'`, les deux boutons ne coexistent jamais.
  - [x] Clic sur « Clôturer »/« Rouvrir » appelle `PartiesService.close`/`reopen` avec le bon id et met à jour `partie()` avec la réponse.
  - [x] Le bandeau « partie terminée » est visible pour un joueur (pas seulement le MJ) quand `status === 'TERMINEE'`.

- [x] Task 16 — Frontend : `dashboard.spec.ts` (AC: #5)
  - [x] Une partie `status: 'TERMINEE'` dans `allParties()` porte la classe `tile--closed` et un libellé/icône non chromatique visible — une partie `EN_COURS`/`A_VENIR` ne les porte pas.

### Review Findings

- [x] [Review][Decision] Diane (compte mixte MJ/joueur ajouté au seed spécifiquement pour exercer ce chemin) n'a aucun `Character` nulle part — sa vue joueur (fiche, inventaire, XP, « Mes personnages ») est donc intestable en l'état, alors que le commentaire du seed revendique justement couvrir ce cas. **Résolu** : personnage « Mira » (chasseur) ajouté pour Diane dans la Partie CAMPAGNE_EPISODIQUE, même patron qu'Alice/Bob/Chloe. `pnpm seed:demo` réexécuté avec succès (base vide), vérifié en base : `Diane → Mira` bien créé. [apps/api/prisma/seed-demo.ts]

- [x] [Review][Patch] `hasScenarioByPartieId()` filtre `_count._all > 0` après un `groupBy` — `groupBy` ne renvoie jamais de groupe à compte zéro pour un `partieId` sans scénario, ce filtre est donc mort (mais inoffensif) [apps/api/src/parties/parties.service.ts:637-639] — **Appliqué** : filtre retiré, commentaire explicatif ajouté.
- [x] [Review][Patch] `emitPartieAndMembers()` peut lever une exception après que l'écriture DB de `close()`/`reopen()` a déjà été committée — le client verrait alors l'appel échouer alors que la clôture/réouverture a bien eu lieu ; à envelopper dans un `try/catch` (log + swallow) [apps/api/src/parties/parties.service.ts:733-740] — **Appliqué** : nouvelle méthode `emitPartieAndMembersSafe()` (try/catch + `Logger.warn`), utilisée par `close()`/`reopen()` ; `emitPartieAndMembers()` inchangée (toujours utilisée ailleurs sans ce filet).
- [x] [Review][Patch] `.status-indicator` (Dashboard, badge « Terminée ») n'a pas d'`aria-hidden` cohérent avec `.role-indicator` voisin, dont l'icône ET le texte sont `aria-hidden="true"` — incohérence d'accessibilité entre deux indicateurs côte à côte [apps/web/src/app/features/dashboard/dashboard.html:892-897] — **Appliqué** : `aria-label` ajouté sur le wrapper `.status-indicator`, icône + texte passés en `aria-hidden="true"` (même patron que `.role-indicator`).
- [x] [Review][Patch] `dashboard.spec.ts` fige en dur le libellé du thème `grimoire-emeraude` (`toContain('Terminée')`) au lieu d'asserter contre `TONE_MAP` — test fragile si ce libellé change pour une raison sans rapport [apps/web/src/app/features/dashboard/dashboard.spec.ts:965] — **Appliqué** : assertion réécrite contre `TONE_MAP['grimoire-emeraude']['dashboard.status_closed_badge']`.
- [x] [Review][Patch] `@Post(':id/close')`/`@Post(':id/reopen')` renvoient par défaut `201 Created` (défaut NestJS pour `@Post`), alors que le patron de référence explicitement cité par la story (`ScenariosController.close()`) utilise `@Patch` (défaut `200`) pour la même sémantique d'action sur une ressource existante — incohérence cosmétique de sémantique REST [apps/api/src/parties/parties.controller.ts:242-250] — **Appliqué** : routes passées en `@Patch`, `PartiesService` (front) et ses tests mis à jour en conséquence (`http.patch`).

- [x] [Review][Defer] `close()`/`reopen()` ne sont pas idempotents (réécriture inconditionnelle de `closedAt`) [apps/api/src/parties/parties.service.ts:700-723] — déjà documenté comme décision d'implémentation assumée (Dev Agent Record), cohérent avec `update()`/`ScenariosService.close()` existants ; pas de garde à ajouter sans nouvelle décision utilisateur.
- [x] [Review][Defer] Aucune inférence/rétro-remplissage automatique du statut pour les Parties déjà effectivement terminées au déploiement (migration n'ajoute que la colonne) [apps/api/prisma/migrations/20260809065452_partie_closed_at] — comportement voulu : la story est nommée « clôture EXPLICITE », AC1 exige une déclaration active du MJ.
- [x] [Review][Defer] Race TOCTOU : une Partie supprimée entre `getOwned()` et `prisma.partie.update()` dans `close()`/`reopen()` ferait remonter une exception Prisma P2025 non gérée (500 au lieu de 404) [apps/api/src/parties/parties.service.ts:700-723] — motif pré-existant partagé par `update()`/`removeMember()`, non introduit spécifiquement par cette story.
- [x] [Review][Defer] `closeGame()`/`reopenGame()` n'ont aucune gestion d'erreur si l'appel HTTP échoue [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:1167-1173] — convention déjà en place dans ce même fichier (`invite()`/`createLink()`/`revokeLink()` n'ont pas non plus de `try/catch`), pas une régression introduite par cette story.
- [x] [Review][Defer] Le docstring du seed revendique toujours une couverture « Epics 6 à 10 » alors que le schéma a continué d'évoluer depuis (ex. `CharacterGroupRole`, Epic 27) sans données de seed correspondantes [apps/api/prisma/seed-demo.ts] — dette pré-existante, cette story touche le fichier mais ne referme pas cet écart plus large.
- [x] [Review][Defer] Longueur des libellés de thème non vérifiée visuellement (« Mettre à l'arrêt » nettement plus long que « Clore le grimoire ») pour les layouts `mat-card-actions`/mobile [apps/web/src/app/core/theme/tones.ts] — pas de garde automatisable sans revue visuelle manuelle.

## Dev Notes

### Ce qui doit continuer de fonctionner

- Toute Partie déjà créée (`closedAt` migré à `null` par défaut, colonne nullable sans backfill nécessaire) doit immédiatement recevoir un `status` cohérent (`EN_COURS` si elle a des scénarios, `A_VENIR` sinon) — pas de migration de données requise au-delà de l'ajout de colonne.
- `PartiesService.update()` (nom/description/kind/système de jeu) — inchangé dans son comportement, seule sa valeur de retour gagne le champ `status`.
- `removeMember()` — émission `partieTopic` + `userTopic(targetUserId)` existante, **non touchée** par cette story (Task 6 introduit un helper séparé, pas une refactorisation de l'existant).
- Le câblage temps réel frontend (`RealtimeService`, `realtime.service.ts:84-93`) : `partie:` → `PartiesService.notifyChanged()`, `user:` → `MyPartiesService.notifyChanged()` — **déjà en place depuis les Stories 18.x/29.1**, aucune modification requise côté routage des topics, seulement de nouvelles émissions serveur sur des topics déjà écoutés.

### Hors périmètre (réservé à 29.7 ou ultérieur)

- `GET /me/party-signals`, les dix codes de signal (personnage à créer, vote en cours, etc.), les badges multi-signaux sur les cartes, les quatre intertitres de liste (« ce qui t'attend / en cours / à venir / terminées ») — **story 29.7**, qui consommera le champ `status` livré ici sans le modifier.
- `Partie.coverImageUrl`/bannière générative — story 29.10.
- Filtres/tri/favoris sur les listes — story 29.8.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Idempotence de `close()`/`reopen()`** sur une partie déjà dans l'état cible — aucun AC ne le spécifie. Documenter le choix retenu dans Completion Notes.
- **`close()` sur une partie CAMPAGNE sans aucun scénario** (statut `A_VENIR` avant clôture) — l'AC5 ne distingue pas cette situation ; `close()` doit rester fonctionnelle dans ce cas (le MJ peut abandonner une partie jamais commencée), voir le point d'attention explicite dans Task 5 sur le calcul de `hasScenario` dans `close()`.
- **Emplacement exact du bandeau « partie terminée » dans `partie-detail.html`** — laissé à l'implémentation (Task 9), la zone d'en-tête est déjà dense (bandeau contextuel 29.4, avertissement d'homonymie).

### Project Structure Notes

- **Backend modifiés** : `apps/api/prisma/schema.prisma` (+ nouvelle migration), `apps/api/src/parties/parties.service.ts`, `apps/api/src/parties/parties.controller.ts`, `apps/api/src/parties/parties.service.spec.ts`, `apps/api/src/parties/parties.controller.spec.ts`.
- **Shared modifié** : `packages/shared/src/index.ts` (`PartieStatus`, `PartieDto.status`).
- **Frontend modifiés** : `apps/web/src/app/core/parties/parties.service.ts` (+ spec), `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`/`.html` (+ spec), `apps/web/src/app/features/dashboard/dashboard.html`/`.scss` (+ spec), `apps/web/src/app/core/theme/tones.ts`.
- **Non touchés** : `MyPartiesService`, `RealtimeService` (routage déjà en place), `partie-form.ts` (formulaire de création/édition — ne gère pas `closedAt`), `ScenariosService`/`Scenario.closedAt` (pattern de référence, non modifié).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.6] — Story, Acceptance Criteria (reprises telles quelles).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md#AD-8] — Règle canonique : `Partie.closedAt DateTime?` seul état persisté, dérivation serveur unique dans la projection `PartieDto`, `status: PartieStatus` union fermée dans `@master-jdr/shared`, forme identique à `Scenario.closedAt`.
- [Source: ARCHITECTURE-SPINE.md#AD-14, ligne 160] — Double émission temps réel obligatoire pour toute mutation partagée à l'échelle d'une Partie : `partie:{id}` **et** `user:{id}` par membre concerné.
- [Source: ARCHITECTURE-SPINE.md, ligne 254 « Lecture en lot »] — Toute lecture d'une collection de parties se fait par requêtes groupées, jamais par itération d'appels.
- [Source: ARCHITECTURE-SPINE.md, ligne 252 « Signalétique d'état »] — Tout état encodé par la couleur est doublé d'un second signal non chromatique.
- [Source: apps/api/src/parties/parties.service.ts:22-40] — `toPartieDto()` actuel et son commentaire explicite anticipant cette story (« status... volontairement absents... story 29.4 [renumérotée 29.6] »).
- [Source: apps/api/src/scenarios/scenarios.service.ts:392-407, apps/api/src/scenarios/scenarios.controller.ts:98-102] — Patron `close()` déjà en place pour `Scenario` (`status: 'PASSE', closedAt: new Date()`), route dédiée `Post(':id/close')` — modèle direct pour `close()`/`reopen()` de `Partie`, à la différence que `Partie` a besoin d'un `reopen()` symétrique (`Scenario.closedAt` est terminal, jamais réouvert).
- [Source: apps/api/prisma/schema.prisma:51-76 (model Partie), 462-482 (model Scenario), 486-499 (model Seance)] — Schéma actuel, absence de `closedAt` sur `Partie`, FK `Seance.scenarioId` obligatoire (fondement du raisonnement Task 3 : compter les scénarios suffit).
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts] — Patron `confirmDelete()`/`invite()`/`createLink()` (mise à jour directe du signal local après un appel API, `ConfirmDialog` réservé aux actions irréversibles).
- [Source: apps/web/src/app/features/dashboard/dashboard.ts/.html/.scss] — Liste actuelle des parties (`allParties()`, `MyPartiesService`), emplacement du traitement « en retrait » (Task 10).
- [Source: apps/web/src/app/core/realtime/realtime.service.ts:84-93] — Table de routage topic → service déjà câblée (`partie:` → `PartiesService`, `user:` → `MyPartiesService`), confirmant qu'aucun changement frontend de routage temps réel n'est nécessaire.
- [Source: apps/web/src/styles.scss:83-86,148-151,206-213] — Tokens `--jdr-status-todo/live/done` déjà définis dans les 3 thèmes depuis la Story 29.0, réutilisables pour le traitement visuel « en retrait » (Task 10).
- [Source: apps/api/src/parties/parties.service.spec.ts:19-270] — Structure des mocks `prisma`/`realtimeEvents` existante, tests dont la forme exacte du DTO doit être mise à jour (Task 12).
- [Source: _bmad-output/implementation-artifacts/29-5-fiche-personnage-en-sections-routees.md] — Story précédente : conventions de Dev Notes/Completion Notes à reproduire (documenter les décisions d'implémentation non tranchées par les ACs plutôt que de les deviner silencieusement).
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-08.md] — Origine de la renumérotation `29-4` → `29-6` (contenu inchangé).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- Suite API complète (`docker compose exec api pnpm test`) : 52/52 suites, 1030/1030 tests verts.
- `docker compose exec api pnpm typecheck` : propre.
- Suite web complète (`docker compose exec web pnpm test`) : 84/84 fichiers, 1158/1158 tests verts.
- `docker compose exec web pnpm eslint` sur les fichiers touchés par cette story : propre (voir Completion Notes pour le lint pré-existant hors scope).
- `docker compose exec web pnpm build` : échoue uniquement sur le budget de bundle initial pré-existant (1.21 MB vs budget 1.00 MB), déjà signalé dans les stories 29.4/29.5 — sans lien avec cette story.

### Completion Notes List

- Implémentation trouvée déjà quasi complète dans l'arbre de travail au démarrage de cette session (seule Task 1 était cochée) : schéma + migration, `PartieStatus`/`PartieDto.status`, dérivation du statut et lecture en lot dans `PartiesService`, `close()`/`reopen()`, double émission temps réel, routes contrôleur, câblage frontend (`PartiesService`, `PartieDetail`, Dashboard), clés de thème (3 thèmes), et l'ensemble des tests (Tasks 12-16) étaient déjà écrits et passants. Cette session a vérifié chaque tâche contre le code réel (pas seulement les cases à cocher), corrigé les cases non cochées à tort, exécuté les suites complètes, et corrigé les écarts trouvés.
- **Décision d'implémentation retenue — idempotence de `close()`/`reopen()`** (non tranchée par les ACs, cf. Dev Notes) : les deux méthodes réécrivent inconditionnellement `closedAt` (`new Date()` pour `close()`, `null` pour `reopen()`) sans vérifier l'état courant au préalable. `close()` appelé deux fois de suite avance simplement `closedAt` à l'instant du second appel (pas d'erreur, pas de no-op explicite) ; `reopen()` appelé sur une partie déjà active est un no-op de fait (`null` → `null`). Choix retenu par cohérence avec `update()`/`ScenariosService.close()` existants, qui ne gardent pas non plus contre les appels redondants.
- **Point d'attention Task 5 déjà résolu dans le code** : `close()` ne suppose pas `hasScenario: true` en dur — il recalcule via `this.hasScenario(id)` après la mutation, exactement comme `reopen()`, couvrant le cas d'une partie CAMPAGNE clôturée avant d'avoir eu le moindre scénario.
- **Lint web** : un écart réel trouvé et corrigé dans cette session — `tones.ts` utilisait des apostrophes échappées (`'Mettre à l\'arrêt'`) là où Prettier impose des guillemets doubles (`"Mettre à l'arrêt"`) pour les chaînes contenant une apostrophe ; corrigé sur les 2 occurrences (thème Médiéval Steampunk). Le reste du lint web (nombreuses erreurs `prettier/prettier` et `@typescript-eslint/no-unsafe-*`) est un état pré-existant du dépôt sur des fichiers hors du périmètre de cette story (confirmé par `git stash` : les erreurs subsistent hors des fichiers touchés par 29.6) — non traité ici.
- **Lint API** : les erreurs `@typescript-eslint/no-unsafe-*` sur `toPartieDto(partie: any, ...)` sont pré-existantes (le paramètre `partie: any` date d'avant cette story ; confirmé sur `HEAD`) — non introduites par 29.6, non traitées ici.
- `docker compose exec web pnpm build` échoue uniquement sur le budget de bundle pré-existant, point d'échec déjà documenté et accepté dans les stories 29.4/29.5.
- **Revue de code (2026-08-09, bmad-code-review)** : 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 1 decision-needed résolue (personnage manquant pour Diane dans le seed — ajouté), 5 patches appliqués (filtre mort dans `hasScenarioByPartieId()`, `emitPartieAndMembersSafe()` pour ne pas faire échouer `close()`/`reopen()` côté client après un commit DB réussi, cohérence `aria-hidden`/`aria-label` sur `.status-indicator`, test Dashboard déshardcodé contre `TONE_MAP`, routes `close()`/`reopen()` passées de `@Post` à `@Patch` — front + specs mis à jour en conséquence), 5 items différés (voir `deferred-work.md`), 3 écartés comme bruit. Suite finale après application des patches : 1030/1030 tests API, 1158/1158 tests web, typecheck API propre.
- **Retour utilisateur post-revue (2026-08-10)** : `pnpm seed:demo` a échoué en usage réel avec `Foreign key constraint violated on Character_gameSystemId_fkey`. Cause racine diagnostiquée : `GameSystem`/`ContentType`/`ContentEntry` ne sont **pas** peuplés par une migration ni par `seed.ts` (qui ne seede que le compte admin) mais par `GameSystemService.onApplicationBootstrap()`, exécuté de façon asynchrone ~1,5 s après le démarrage de Nest — une exécution de `seed:demo` trop rapide après un `docker compose up`/redémarrage du conteneur `api` (avant la fin de ce bootstrap) provoque la violation de FK sur le tout premier `Character` créé. Pas un bug introduit par cette story ; documenté ici pour la prochaine fois (attendre `Nest application successfully started` avant `seed:demo`, ou vérifier `SELECT * FROM "GameSystem"` non vide). Base entièrement revidée (`prisma migrate reset --force` + `pnpm run seed` + redémarrage du conteneur `api` pour laisser `onApplicationBootstrap` reseeder `GameSystem`) puis reseedée avec succès. Audit complet des données demandé par l'utilisateur (« base saine, réaliste, comme si plusieurs personnes l'utilisaient ») : lacune réelle trouvée et comblée — `CharacterGroupRole` (Epic 27) n'était exercé nulle part dans le seed malgré le modèle et les 4 rôles de contenu déjà en place ; 4 rôles assignés sur la Partie épisodique (chef/intendant/chroniqueur/cartographe). Collision de nom découverte et corrigée en cours de route : le personnage ajouté pour Diane s'appelait initialement « Mira », déjà pris par le personnage de Chloe dans une autre Partie — renommé « Orla ». Docstring du seed mis à jour en conséquence (mentionne désormais Epics 6-10/27/29, écart résiduel Epics 23-26/28 documenté explicitement). État final vérifié par requêtes SQL directes : 6 users, 4 Parties (les 3 valeurs de `PartieStatus` bien représentées : TERMINEE/EN_COURS/EN_COURS/A_VENIR), 9 Characters sans collision de nom, 4 CharacterGroupRole, GameSystem/ContentType/ContentEntry peuplés (247 entrées), compte mixte MJ/joueur de Diane confirmé sur les deux Parties concernées. Suite API complète re-vérifiée après les modifications du seed : 1030/1030 tests verts.

### File List

- `apps/api/prisma/schema.prisma` (modifié — `Partie.closedAt`)
- `apps/api/prisma/migrations/20260809065452_partie_closed_at/migration.sql` (nouveau)
- `apps/api/prisma/seed-demo.ts` (modifié — Partie clôturée + compte MJ/joueur mixte pour exercer les 3 valeurs de `PartieStatus` ; personnage « Orla » ajouté pour Diane ; 4 `CharacterGroupRole` ajoutés sur la Partie épisodique ; docstring rafraîchi)
- `apps/api/src/parties/parties.service.ts` (modifié — `PartieStatus`, `hasScenario`/`hasScenarioByPartieId`, `close()`/`reopen()`, `emitPartieAndMembers()`/`emitPartieAndMembersSafe()`, `Logger`)
- `apps/api/src/parties/parties.controller.ts` (modifié — routes `PATCH :id/close`/`PATCH :id/reopen`)
- `apps/api/src/parties/parties.service.spec.ts` (modifié — tests de dérivation du statut, `close()`/`reopen()`)
- `apps/api/src/parties/parties.controller.spec.ts` (nouveau — premier fichier de tests du contrôleur)
- `packages/shared/src/index.ts` (modifié — `PartieStatus`, `PartieDto.status`)
- `apps/web/src/app/core/parties/parties.service.ts` (modifié — `close()`/`reopen()` en `http.patch`)
- `apps/web/src/app/core/parties/parties.service.spec.ts` (modifié)
- `apps/web/src/app/core/theme/tones.ts` (modifié — `partie.close_btn`/`partie.reopen_btn`/`partie.status_closed_label`/`dashboard.status_closed_badge` ×3 thèmes ; correctif Prettier apporté cette session)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — `closeGame()`/`reopenGame()`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié — boutons Clôturer/Rouvrir, bandeau « partie terminée »)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.scss` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié)
- `apps/web/src/app/features/dashboard/dashboard.html` (modifié — classe `tile--closed`, badge non chromatique)
- `apps/web/src/app/features/dashboard/dashboard.scss` (modifié — `.tile--closed`)
- `apps/web/src/app/features/dashboard/dashboard.spec.ts` (modifié)
- `apps/web/src/app/features/parties/partie-form/partie-form.spec.ts` (modifié — fixture `status` ajoutée)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — fixture `status` ajoutée)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié — fixture `status` ajoutée)
- `apps/web/src/app/core/poll/open-polls.service.spec.ts` (modifié — fixture `status` ajoutée)
