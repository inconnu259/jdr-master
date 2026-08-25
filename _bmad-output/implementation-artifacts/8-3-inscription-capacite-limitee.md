---
baseline_commit: 7952a94
---

# Story 8.3: Inscription à capacité limitée

Status: done

## Story

As a MJ d'une campagne épisodique,
I want proposer une date pour une fourchette de joueurs et voir en un coup d'œil si assez de monde s'est inscrit,
So that je décide sereinement de valider une date sans compter les inscrits à la main.

## Acceptance Criteria

1. **Given** une Partie `CAMPAGNE_EPISODIQUE` et une `Seance` déjà créée (`addSeance`, Story 8.2, sans plafond) **When** le MJ définit une fourchette min-max (ex. 4-6) sur cette séance via `PATCH /scenarios/seances/:id/capacite` **Then** `inscriptionMin`/`inscriptionMax` sont enregistrés sur la `Seance` — **jamais** en même temps qu'une relation `SessionPoll` (AD-4, cette route rejette en 400 pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE`).
2. **Given** une `Seance` épisodique avec min-max définis **When** un joueur appelle `POST /scenarios/seances/:id/inscription` **Then** une `Inscription` (`seanceId`, `userId`, unique) est créée ; un appel répété par le même joueur est **idempotent** (pas de doublon, pas d'erreur) — même sémantique que `participate()` (Story 8.1).
3. **Given** un joueur déjà inscrit à une séance **When** il appelle `DELETE /scenarios/seances/:id/inscription` **Then** son `Inscription` est retirée — action symétrique explicitement demandée par `EXPERIENCE.md` §6 (« bouton simple S'inscrire/Se désinscrire »), absente du texte `epics.md` d'origine (cf. Source ci-dessous).
4. **Given** une `Seance` dont le nombre d'inscrits a atteint `inscriptionMax` **When** un joueur supplémentaire (non déjà inscrit) tente de s'inscrire **Then** la requête échoue en `409 Conflict` — le bouton se désactive côté UI sans rechargement manuel une fois `count === max` connu du frontend.
5. **Given** deux joueurs qui tentent de s'inscrire simultanément au dernier créneau disponible **When** les deux requêtes concurrentes arrivent **Then** un verrou de ligne explicite (`SELECT ... FOR UPDATE` sur la `Seance`, même mécanisme qu'AD-10/`markCourant`) garantit qu'un seul obtient la place — jamais de dépassement de `max` (test d'intégration explicite sur la course concurrente).
6. **Given** une `Seance` à n'importe quel niveau de remplissage (sous le min, entre min et max, au max, y compris 0 inscrit) **When** le MJ appelle `PATCH /scenarios/seances/:id/valider-date` **Then** `Seance.dateValidee` est renseignée — action manuelle et explicite uniquement, **jamais automatique** même une fois `max` atteint.
7. **Given** un `FillIndicator` (nouveau composant Angular) **When** le remplissage est sous le min / entre min et max / au max **Then** il affiche respectivement `var(--color-unavailable)` / `var(--color-mixed)` / `var(--color-available)`, avec la valeur numérique `[nb]/[max] inscrits (min. [min])` **toujours affichée en texte** (jamais la couleur seule, socle d'accessibilité hérité).
8. **Given** une `Seance` nouvellement configurée avec 0 inscrit **When** `FillIndicator` s'affiche **Then** il montre déjà l'état « sous le minimum » (`--color-unavailable`), jamais un état « vide » visuellement distinct.
9. **Given** `ScenarioDto`/`SeanceDto` retournés par n'importe quelle route **Then** `SeanceDto.inscription` (nouveau champ optionnel) n'est peuplé **que** si `inscriptionMax` est défini sur la `Seance` — `undefined` sinon (même convention que `participants` sur `ScenarioDto`, jamais un objet vide par défaut).
10. **Given** un utilisateur non-MJ **When** il appelle `PATCH .../capacite` ou `PATCH .../valider-date` **Then** la requête échoue en `403 Forbidden` (`PartiesService.getOwned`) ; **given** un non-membre de la Partie **when** il appelle `POST`/`DELETE .../inscription` **then** `403` (`PartiesService.getViewable`).

*(Source : epics.md Story 8.3, 6 ACs reformulées en Given/When/Then et complétées de 4 ACs (AC3 désinscription explicitement requise par `EXPERIENCE.md` §6 mais absente du texte `epics.md` ; AC9 forme exacte de `SeanceDto.inscription` ; AC10 rejets 403 non couverts par le texte d'origine) — même méthode que Stories 8.1/8.2.)*

## Tasks / Subtasks

- [x] **Task 1 — `packages/shared/src/index.ts` : `SeanceDto.inscription` + nouveau DTO** (AC1, AC9)
  - [x] Ajouter `export interface SeanceInscriptionDto { min: number; max: number; inscrits: { userId: string; pseudo: string }[]; dateValidee: string | null; }` juste après `SeanceDto`.
  - [x] Modifier `SeanceDto` : ajouter `inscription?: SeanceInscriptionDto;` (juste après `poll?: SessionPollDto;`) — **optionnel**, peuplé uniquement si `inscriptionMax` est défini côté DB (AC9), contrairement à `seances` sur `ScenarioDto` qui reste non-optionnel (Story 8.2, inchangé).
  - [x] Ajouter `export interface SetSeanceCapacityDto { inscriptionMin: number; inscriptionMax: number; }` pour `PATCH /scenarios/seances/:id/capacite` — pas de DTO de body pour `inscrire`/`desinscrire`/`validerDate` (mêmes routes sans corps que `open`/`markCourant`/`close`/`addSeance`, Story 8.2).

- [x] **Task 2 — `apps/api/src/scenarios/scenarios.service.ts` : `setSeanceCapacity()`/`inscrire()`/`desinscrire()`/`validerDate()`** (AC1, AC2, AC3, AC4, AC5, AC6, AC9, AC10)
  - [x] `async setSeanceCapacity(seanceId: string, mjId: string, inscriptionMin: number, inscriptionMax: number): Promise<ScenarioDto>` :
    - `findUnique` la `Seance` par `id` → `NotFoundException('Séance introuvable')` si absente.
    - `const scenario = await this.prisma.scenario.findUniqueOrThrow({ where: { id: seance.scenarioId } });`
    - `const partie = await this.parties.getOwned(scenario.partieId, mjId);` (403 non-MJ, AC10 — **`getOwned`**, action MJ comme `linkSeancePoll`).
    - `if (partie.kind !== 'CAMPAGNE_EPISODIQUE') throw new BadRequestException("La capacité d'inscription ne peut être définie que pour les campagnes épisodiques");` (AC1, symétrique au rejet `CAMPAGNE_EPISODIQUE` de `linkSeancePoll` — ici c'est l'inverse qui est rejeté).
    - `if (inscriptionMax < inscriptionMin) throw new BadRequestException('Le maximum doit être supérieur ou égal au minimum');` (validation croisée, faite en service — `class-validator` ne fait pas nativement de validation cross-champ simple ici, cohérent avec le reste du fichier qui valide en service, ex. `dureeSeances`).
    - `await this.prisma.seance.update({ where: { id: seanceId }, data: { inscriptionMin, inscriptionMax } });` — **peut être appelé plusieurs fois** (le MJ peut réajuster min/max même après que des `Inscription` existent déjà ; aucune AC ne l'interdit, cf. `[ASSUMPTION]` dans Dev Notes).
    - `const updated = await this.prisma.scenario.findUniqueOrThrow({ where: { id: scenario.id } }); return toEnrichedDto(this.prisma, updated, partie.kind);`
  - [x] `async inscrire(seanceId: string, userId: string): Promise<ScenarioDto>` (AC2, AC4, AC5, AC10) :
    - `findUnique` la `Seance` → `NotFoundException('Séance introuvable')` si absente.
    - `const scenario = await this.prisma.scenario.findUniqueOrThrow(...)`, `const partie = await this.parties.getViewable(scenario.partieId, userId);` (403 non-membre, AC10 — **`getViewable`**, action joueur comme `participate`).
    - `if (partie.kind !== 'CAMPAGNE_EPISODIQUE') throw new BadRequestException(...)` (défense en profondeur — ne devrait jamais être atteignable si `setSeanceCapacity` a bien rejeté les autres `kind`, mais garde explicite cohérente avec le reste du fichier).
    - `if (seance.inscriptionMax == null) throw new BadRequestException("Cette séance n'a pas encore de capacité définie par le MJ");`
    - **Verrou explicite (AD-5, obligatoire, pas optionnel)** :
      ```ts
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Seance" WHERE id = ${seanceId} FOR UPDATE`;
        const existing = await tx.inscription.findUnique({
          where: { seanceId_userId: { seanceId, userId } },
        });
        if (existing) return; // AC2 : déjà inscrit, idempotent — ne recompte jamais le quota dans ce cas
        const count = await tx.inscription.count({ where: { seanceId } });
        if (count >= seance.inscriptionMax!) {
          throw new ConflictException('Cette séance a atteint son nombre maximal d’inscrits');
        }
        await tx.inscription.create({ data: { seanceId, userId } });
      });
      ```
      **Ordre critique (AC2 vs AC4)** : le check `existing` doit précéder le check `count >= max` — sinon un joueur déjà inscrit qui ré-appelle l'endpoint une fois `max` atteint par d'autres serait à tort rejeté en 409 au lieu de rester silencieusement inscrit.
    - `return toEnrichedDto(this.prisma, updated, partie.kind);` après relecture du scénario.
  - [x] `async desinscrire(seanceId: string, userId: string): Promise<ScenarioDto>` (AC3) :
    - `findUnique` la `Seance` → `NotFoundException` si absente ; `getViewable` (403 non-membre).
    - `await this.prisma.inscription.deleteMany({ where: { seanceId, userId } });` — **`deleteMany`, pas `delete`** : idempotent si l'utilisateur n'était pas inscrit (pas de `P2025` non géré), cohérent avec AC3 qui ne distingue pas les deux cas.
    - Pas de garde `partie.kind`/`inscriptionMax` ici — un `deleteMany` sur une séance non-épisodique ne trouve simplement aucune ligne, sans effet de bord (`[ASSUMPTION]`, cf. Dev Notes).
  - [x] `async validerDate(seanceId: string, mjId: string): Promise<ScenarioDto>` (AC6, AC10) :
    - `findUnique` la `Seance` → `NotFoundException` ; `getOwned` (403 non-MJ).
    - `if (partie.kind !== 'CAMPAGNE_EPISODIQUE') throw new BadRequestException(...)`.
    - `await this.prisma.seance.update({ where: { id: seanceId }, data: { dateValidee: new Date() } });` — **aucune vérification de remplissage** (AC6 — validable à tout niveau, y compris 0 inscrit).
    - **Ne touche jamais `Partie.nextSessionDate`/`nextSessionSlot`** — ces champs restent exclusivement pilotés par `PollService.choose()` (linéaire/one-shot, Epics 1-3, inchangé) ; aucune notion de « prochaine séance » unique n'existe pour l'épisodique (plusieurs `Courant` en parallèle possibles, cf. AD-4/EXPERIENCE.md §5).
  - [x] Étendre `toSeanceDto()`/`SEANCE_POLL_INCLUDE` (renommer en `SEANCE_INCLUDE`, plus large que juste le poll désormais) : ajouter `inscriptions: { include: { user: { select: { pseudo: true } } } }` à l'`include` Prisma (`loadSeancesBatch`) et peupler `inscription` sur le DTO retourné :
    ```ts
    inscription: seance.inscriptionMax != null ? {
      min: seance.inscriptionMin ?? 0,
      max: seance.inscriptionMax,
      inscrits: (seance.inscriptions ?? []).map((i: any) => ({ userId: i.userId, pseudo: i.user.pseudo })),
      dateValidee: seance.dateValidee ? seance.dateValidee.toISOString() : null,
    } : undefined,
    ```
  - [x] `scenarios.service.spec.ts` : nouveaux `describe('setSeanceCapacity()')`, `describe('inscrire()')` (création réussie, idempotence si déjà inscrit **même si `max` atteint par d'autres** — test explicite de l'ordre critique ci-dessus, `409` si `max` atteint pour un nouvel inscrit, `400` si capacité non définie, `400` non-épisodique, `403` non-membre), `describe('desinscrire()')` (retrait réussi, no-op si non inscrit), `describe('validerDate()')` (validation réussie à 0/sous-min/au-max, `403` non-MJ, `400` non-épisodique). **Test de course concurrente explicite (AC5)** : deux appels `inscrire()` quasi simultanés sur une séance à `max - 1` places restantes — mocker `tx.inscription.count` pour simuler la lecture avant écriture et vérifier qu'un seul `tx.inscription.create` a lieu (le mock Jest ne simule pas un vrai verrou Postgres, mais valide que le code respecte l'ordre lock→count→create dans la même transaction).

- [x] **Task 3 — `apps/api/src/scenarios/scenarios.controller.ts` : routes `capacite`/`inscription`/`valider-date`** (AC1, AC2, AC3, AC6, AC10)
  - [x] `@Patch('scenarios/seances/:id/capacite') setSeanceCapacity(@Param('id', ParseUUIDPipe) seanceId: string, @CurrentUser() user: AuthUser, @Body() dto: SetSeanceCapacityDto) { return this.scenarios.setSeanceCapacity(seanceId, user.id, dto.inscriptionMin, dto.inscriptionMax); }`
  - [x] `@Post('scenarios/seances/:id/inscription') inscrire(...) { return this.scenarios.inscrire(seanceId, user.id); }`
  - [x] `@Delete('scenarios/seances/:id/inscription') desinscrire(...) { return this.scenarios.desinscrire(seanceId, user.id); }` — importer `Delete` depuis `@nestjs/common` (pas encore utilisé dans ce fichier).
  - [x] `@Patch('scenarios/seances/:id/valider-date') validerDate(...) { return this.scenarios.validerDate(seanceId, user.id); }`
  - [x] Nouveau fichier `apps/api/src/scenarios/dto/set-seance-capacity.dto.ts` : `class SetSeanceCapacityDto { @IsInt() @Min(1) inscriptionMin!: number; @IsInt() @Min(1) inscriptionMax!: number; }` (`class-validator`, même style que `link-seance-poll.dto.ts`).
  - [x] `scenarios.controller.spec.ts` : ajouter les 4 méthodes à `makeScenariosService()`, 4 tests de routage standard.

- [x] **Task 4 — `apps/web/src/app/core/scenarios/scenarios.service.ts` : `setSeanceCapacity()`/`inscrire()`/`desinscrire()`/`validerDate()`** (AC1, AC2, AC3, AC6)
  - [x] Copier exactement le pattern `linkSeancePoll()`/`addSeance()` : chaque méthode fait l'appel HTTP puis `this._changed.update((v) => v + 1)`.
  - [x] `desinscrire` utilise `this.http.delete<ScenarioDto>(...)` (`HttpClient.delete` avec corps de réponse — déjà utilisé nulle part côté `scenarios.service.ts` actuel, vérifier que NestJS renvoie bien un corps JSON sur un `@Delete` qui retourne une valeur, ce qui est déjà le cas ici puisque `desinscrire()` du service retourne `Promise<ScenarioDto>`, pas `void`).
  - [x] `scenarios.service.spec.ts` : 4 nouveaux tests, même pattern `HttpTestingController` que les mutations existantes.

- [x] **Task 5 — Nouveau composant `FillIndicator`** (AC7, AC8)
  - [x] `apps/web/src/app/features/scenarios/fill-indicator/fill-indicator.ts` : `readonly count = input.required<number>(); readonly min = input.required<number>(); readonly max = input.required<number>();` — computed `fillClass()` retournant une classe CSS selon `count() < min()` (sous-min) / `count() >= max()` (au-max) / sinon (mixed).
  - [x] `.html` : `<div class="fill-indicator__track"><div class="fill-indicator__fill" [class]="fillClass()" [style.width.%]="max() > 0 ? (count() / max()) * 100 : 0"></div></div><span class="fill-indicator__label">{{ count() }} / {{ max() }} inscrits (min. {{ min() }})</span>` — la valeur numérique est **toujours** dans le DOM en texte (AC7), jamais seulement la classe de couleur.
  - [x] `.scss` : réutiliser tel quel `var(--color-unavailable)`/`var(--color-mixed)`/`var(--color-available)`/`var(--color-unknown)` (déjà définis globalement dans `apps/web/src/styles.scss:42-46`, réutilisés par `EncumbranceBar`/`calendar-month-view`/`creneau-card` — **aucune nouvelle valeur de couleur**, cf. DESIGN.md §7 « aucune nouvelle valeur, validé avec l'utilisateur en Discovery »). Modèle structurel à répliquer : `apps/web/src/app/features/characters/character-sheet/inventory-tab/encumbrance-bar.html`/`.scss` (barre + label texte, même densité).
  - [x] `fill-indicator.spec.ts` : rendu sous-min (0 inscrit, AC8), entre min-max, au max, valeur numérique toujours présente dans `textContent` quel que soit l'état (AC7).

- [x] **Task 6 — `SeanceList` : branche épisodique complète** (AC1 à AC8, remplace le masquage total actuel)
  - [x] **Changement de structure** : `seance-list.html` masque aujourd'hui TOUTE la section si `isEpisodique()` (Story 8.2, conforme à AD-4 mais aucune UI n'existe encore pour l'épisodique — cette story comble ce vide). Remplacer `@if (!isEpisodique()) { ... }` par une branche `@if (isEpisodique()) { <!-- nouveau bloc inscription --> } @else { <!-- bloc existant poll, inchangé --> }`.
  - [x] `seance-list.ts` : injecter `AuthService` (déjà fait ailleurs, ex. `ScenarioReadDialog`) pour dériver `currentUserId = computed(() => this.auth.currentUser()?.id)` — nécessaire pour savoir si le viewer courant est déjà inscrit (pas de nouvel input, cohérent avec le fait que `ScenarioReadDialog` fait déjà ce calcul en interne plutôt que de le recevoir en input).
  - [x] Pour chaque `seance` de `scenario().seances`, dans la branche épisodique :
    - Si `isMj()` et `!seance.inscription` (capacité pas encore définie) : afficher un petit formulaire (2 `<input type="number">` min/max + bouton) appelant `onSetCapacity(seance.id, min, max)` → `scenariosService.setSeanceCapacity(...)`, émet `seanceLinked` avec le DTO retourné.
    - Si `isMj()` et `seance.inscription` et `!seance.inscription.dateValidee` : `<app-fill-indicator [count]="seance.inscription.inscrits.length" [min]="seance.inscription.min" [max]="seance.inscription.max" />` + 2 boutons : « Valider cette date » (`onValiderDate(seance.id)` → `validerDate()`) et « Proposer une autre date » (`onProposerAutreDate(seance.id)`). **`[ASSUMPTION]`** (cf. Dev Notes) : ce second bouton appelle `scenariosService.addSeance(scenario().id)` — crée une nouvelle `Seance` vierge pour une nouvelle proposition, l'ancienne restant intacte (non supprimée, non invalidée — `epics.md` dit seulement « aucune validation n'a lieu », pas de suppression demandée).
    - Si `isMj()` et `seance.inscription?.dateValidee` : afficher « Date retenue » (même pattern texte que le bloc poll clôturé ajouté au patch du 2026-07-14, réutiliser `formatChosenDate`-like helper adapté à une simple date ISO sans slot).
    - Si `!isMj()` et `!seance.inscription` : rien (capacité pas encore définie par le MJ).
    - Si `!isMj()` et `seance.inscription` et pas encore `dateValidee` : `<app-fill-indicator .../>` + bouton toggle « S'inscrire »/« Se désinscrire » selon `seance.inscription.inscrits.some(i => i.userId === currentUserId())`, désactivé (`[disabled]`) si non-inscrit ET `inscrits.length >= max` (AC4 — pas besoin d'attendre le 409 serveur pour désactiver visuellement, mais le 409 reste la garantie réelle, AC5).
    - Si `!isMj()` et `seance.inscription?.dateValidee` : « Date retenue » (même texte que ci-dessus).
  - [x] Pattern anti-double-clic (`pollActionPending`-like signal, déjà établi pour `onChoose`/`onClosePoll`/`onPollCreated`) répliqué pour `onInscrire`/`onDesinscrire`/`onValiderDate`/`onSetCapacity`/`onProposerAutreDate` — **erreur déjà constatée en revue Story 8.2** (double-clic sur `onPollCreated` non gardé initialement), ne pas la répéter ici.
  - [x] `seance-list.spec.ts` : rendu MJ sans capacité définie (formulaire visible), MJ avec capacité (FillIndicator + 2 CTA), MJ avec date validée (texte, pas de CTA), joueur sans capacité (rien), joueur avec capacité non-inscrit (bouton « S'inscrire » actif), joueur inscrit (bouton « Se désinscrire »), joueur avec capacité au max et non-inscrit (bouton désactivé), joueur avec date validée (texte).

- [x] **Task 7 — `ScenarioEditor`/`ScenarioReadDialog` : aucun câblage supplémentaire requis**
  - [x] Les deux composants passent déjà `[scenario]`/`[partieId]`/`[isMj]`/`[isEpisodique]`/`(seanceLinked)` à `<app-seance-list>` (Story 8.2) — **aucune modification de `scenario-editor.ts`/`.html`/`scenario-read-dialog.ts`/`.html` n'est nécessaire pour cette story**, toute la nouvelle logique vit dans `SeanceList`/`FillIndicator`. Vérifié (test de non-régression) : `scenario-editor.spec.ts` (31 tests) et `scenario-read-dialog.spec.ts` (16 tests) passent inchangés — `AuthService` (nouvelle dépendance de `SeanceList`) est `providedIn: 'root'`, aucun provider de test supplémentaire n'était nécessaire.

### Review Findings

Revue adversariale à 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) sur le diff scopé aux 16 fichiers de la Story 8.3 (le working tree contenait aussi des modifications non liées, exclues du périmètre de revue).

**Acceptance Auditor** : 0 déviation — les 10 AC et toutes les décisions architecturales (AD-4, AD-5, P1-AD-3, les 4 `[ASSUMPTION]`) sont respectées exactement.

- [x] [Review][Decision] `inscrire()`/`desinscrire()` devraient-ils être bloqués une fois `dateValidee` posée ? — `EXPERIENCE.md` §4 dit « une fois validée, la séance passe en date confirmée » sans jamais préciser si les inscriptions doivent se figer. **Décision utilisateur : bloquer après validation** — cohérent avec « date confirmée », évite un roster qui bouge sans que le MJ le sache. Converti en patch ci-dessous.

- [x] [Review][Patch] `inscrire()`/`desinscrire()` doivent rejeter en 400 si `seance.dateValidee` est déjà posée [apps/api/src/scenarios/scenarios.service.ts:inscrire,desinscrire] — décision utilisateur du 2026-07-14 (item ci-dessus). **Corrigé** : garde ajoutée dans les deux méthodes, 2 tests dédiés.
- [x] [Review][Patch] `inscrire()` compare `count` à une valeur `inscriptionMax` lue **avant** la transaction verrouillée, pas sous le verrou [apps/api/src/scenarios/scenarios.service.ts:inscrire] — si `setSeanceCapacity()` change `inscriptionMax` entre cette lecture et la transaction, la comparaison utilise la valeur périmée. **Corrigé** : `tx.seance.findUniqueOrThrow()` relit `inscriptionMax` sous le verrou avant la comparaison, 1 test dédié simulant une capacité modifiée entretemps.
- [x] [Review][Patch] `validerDate()` n'exige pas que `inscriptionMax` soit déjà défini [apps/api/src/scenarios/scenarios.service.ts:validerDate] — `dateValidee` serait écrite mais resterait invisible côté DTO. **Corrigé** : garde `inscriptionMax == null` ajoutée, 1 test dédié.
- [x] [Review][Patch] Formulaire de capacité MJ sans validation avant soumission [apps/web/src/app/features/scenarios/seance-list/seance-list.html:capacity-form] — champs vides → `valueAsNumber` = `NaN`, bouton jamais désactivé. **Corrigé** : bouton désactivé tant que min/max ne sont pas tous deux renseignés et `max >= min` ; `(input)` ajouté sur les deux champs pour déclencher la détection de changement zoneless (un `<input>` natif sans binding Angular ne la déclenche pas seul), 1 test dédié couvrant les 3 transitions (vide → min seul → max < min → valide).

- [x] [Review][Defer] Aucune des 4 nouvelles méthodes (`setSeanceCapacity`/`inscrire`/`desinscrire`/`validerDate`) ne vérifie `scenario.status` [apps/api/src/scenarios/scenarios.service.ts] — deferred, pre-existing : même lacune déjà présente sur `addSeance()`/`linkSeancePoll()` depuis la Story 8.2, pas une régression introduite ici.
- [x] [Review][Defer] Aucune UI pour réajuster la capacité une fois définie, alors que le backend l'autorise (`setSeanceCapacity` rappelable sans garde) [apps/web/src/app/features/scenarios/seance-list/seance-list.html] — deferred, pre-existing : décision `[ASSUMPTION]` déjà documentée dans la story (backend permissif), amélioration UI non demandée par les AC.
- [x] [Review][Defer] `SEANCE_INCLUDE.inscriptions` n'a pas d'`orderBy`, ordre d'affichage des inscrits non déterministe [apps/api/src/scenarios/scenarios.service.ts] — deferred, cosmétique, faible priorité.
- [x] [Review][Defer] `findUniqueOrThrow` sur `scenario` sans gestion défensive dans les 4 nouvelles méthodes, pourrait fuiter un 500 non contrôlé si la FK est orpheline [apps/api/src/scenarios/scenarios.service.ts] — deferred, pre-existing : même pattern déjà utilisé par `linkSeancePoll()` (Story 8.2), pas une régression introduite ici.

**Dismissed (8)** : abaissement de `max` sous le nombre d'inscrits déjà décidé en `[ASSUMPTION]` (autorisé sans restriction) ; `desinscrire()` sans garde de `kind` déjà décidé en `[ASSUMPTION]` ; `validerDate()` sans garde d'idempotence (réinitialiser `dateValidee` est inoffensif) ; « Proposer une autre date » laissant l'ancienne séance active déjà décidé en `[ASSUMPTION]` avec justification documentée ; `toSeanceDto` sans conscience du `kind` au niveau DTO (cohérent avec le pattern déjà établi pour `participants`) ; `inscriptionMin` purement cosmétique (conforme à AC6/EXPERIENCE.md, aucune validation de remplissage n'est demandée) ; couverture des guards d'autorisation « invérifiable depuis le diff » (faux problème — `@UseGuards(AuthenticatedGuard)` est posé au niveau classe, confirmé en lisant le contrôleur complet) ; bouton « S'inscrire » lisant potentiellement `seance.inscription` undefined (faux positif — la branche est imbriquée sous un `@else if (seance.inscription && ...)` qui garantit déjà sa présence, vérifié directement dans le template).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-5 (verbatim, `ARCHITECTURE-SPINE.md`)** :
  > `ScenariosService.inscrire(seanceId, userId)` s'exécute dans une transaction Prisma qui **verrouille explicitement la ligne `Seance`** (`tx.$queryRaw` `SELECT ... FOR UPDATE` sur `Seance` par `id`) avant de faire `count(Inscription where seanceId)` puis `create` si `count < max`, sinon rejet (409). **L'isolation `READ COMMITTED` par défaut ne suffit pas**. Le `SELECT ... FOR UPDATE` est la mesure requise, pas une option.
  Le verrou/`updateMany`+count conditionnel déjà utilisé par `markCourant()`/AD-10 (`scenarios.service.ts:276-300`) est le modèle exact de transaction Prisma à répliquer (`$queryRaw ... FOR UPDATE` puis logique conditionnelle dans le même callback `$transaction`).

- **AD-4 (rappel, hérité de Story 8.2)** : `Seance` porte une relation vers `SessionPoll` **ou** vers `Inscription[]`, jamais les deux — déterminé par `Partie.kind`, jamais un champ de choix sur `Seance`. Conséquence directe pour cette story : `setSeanceCapacity()`/`inscrire()`/`validerDate()` rejettent tout `kind !== CAMPAGNE_EPISODIQUE` (symétrique au rejet `CAMPAGNE_EPISODIQUE` de `linkSeancePoll`, Story 8.2).

- **P1-AD-3 (rappel, hérité)** : `PartiesService.getOwned`/`getViewable` seul point de vérité. `setSeanceCapacity`/`validerDate` = **`getOwned`** (action MJ) ; `inscrire`/`desinscrire` = **`getViewable`** (action joueur, comme `participate`, Story 8.1).

- **`[ASSUMPTION]` — split création/capacité plutôt que tout dans `addSeance()` (Task 2)** : `epics.md` dit littéralement « le MJ crée une `Seance` avec une fourchette min-max ». Cette story **ne modifie pas** la signature de `addSeance()` (Story 8.2, déjà en production, body vide, aucun plafond) — introduire un `inscriptionMin`/`inscriptionMax` obligatoire à la création casserait la story 8.2 et le bug-fix du 2026-07-14 qui fait créer automatiquement une `Seance` vide (sans min/max) à la création d'un scénario/`Partie ONE_SHOT` (`parties.service.ts`/`scenarios.service.ts`, tous deux non-épisodiques en pratique mais génériques dans leur code). Choix retenu : **`addSeance()` reste inchangé, la capacité se définit dans un second temps** via `PATCH .../capacite` — exactement le même schéma en deux temps que Story 8.2 a établi pour le linéaire (`addSeance()` crée une coquille vide, `linkSeancePoll()` pose la relation ensuite). Cohérence architecturale entre les deux mécanismes plutôt que deux façons différentes de faire la même chose.

- **`[ASSUMPTION]` — réajustement de min/max après inscriptions déjà existantes (Task 2)** : ni `epics.md` ni `ARCHITECTURE-SPINE.md`/`EXPERIENCE.md` ne précisent si le MJ peut modifier `inscriptionMin`/`inscriptionMax` après que des joueurs se sont déjà inscrits. Décision : **autorisé sans restriction** (`setSeanceCapacity` reste un simple `update`, rappelable à volonté) — un abaissement de `max` en dessous du nombre d'inscrits actuels ne retire jamais les inscriptions déjà posées (pas de suppression en cascade), bloque seulement les inscriptions futures. Cohérent avec le principe général du palier : aucune validation/action n'est jamais automatique côté joueur (AD-5), seul le MJ décide.

- **`[ASSUMPTION]` — « Proposer une autre date » (Task 6)** : `epics.md` dit seulement « aucune validation n'a lieu » quand le MJ clique ce bouton, sans préciser d'action backend. Décision : ce bouton appelle `addSeance()` (Story 8.2, déjà existant, aucun plafond) pour créer une **nouvelle** `Seance` vierge à configurer ensuite via `setSeanceCapacity` — l'ancienne `Seance` (et ses `Inscription`) reste intacte, non supprimée. Alternative rejetée : un bouton sans aucun effet backend serait une UX confuse (un clic qui ne fait visiblement rien). Pas de suppression de `Seance`/`Inscription` dans cette story (cf. Hors scope).

- **`[ASSUMPTION]` — `desinscrire()` sans garde de `kind`/`inscriptionMax` (Task 2)** : `deleteMany({ where: { seanceId, userId } })` sur une séance non-épisodique ou sans capacité définie ne trouve simplement aucune ligne à supprimer — comportement no-op silencieux, pas d'erreur nécessaire. Garder la méthode simple plutôt que dupliquer les mêmes gardes que `inscrire()` pour une opération de retrait qui ne peut de toute façon jamais avoir d'effet de bord dangereux.

- **`FillIndicator` — aucune nouvelle couleur (Task 5)** : réutilise à l'identique `var(--color-unavailable)` (#e74c3c), `var(--color-mixed)` (#f0a030), `var(--color-available)` (#2ecc71), `var(--color-unknown)` (#7f8c8d) — déjà globalement définis dans `apps/web/src/styles.scss:42-46` et déjà consommés par `EncumbranceBar`/`calendar-month-view`/`calendar-week-view`/`creneau-card`/`aggregated-creneau-card`/`notes-journal`/`inventory-tab`. **Ne pas introduire de nouvelle variable CSS.**

- **Convention de texte : pas de `ThemeToneService` pour cette story (déviation notée, pas à corriger ici)** : `ARCHITECTURE-SPINE.md`/`EXPERIENCE.md` mentionnent des clés de thème illustratives (`sessions.inscription_full`, `cta.choose_date`, etc.), mais **tout l'Epic 7/8 existant (`scenario-editor.html`, `seance-list.html`, `scenario-read-dialog.html`) utilise déjà des chaînes françaises codées en dur**, jamais `theme.tone()['...']` — contrairement aux Epics 1-6 qui thématisent systématiquement leurs CTA. Cette story **suit la convention déjà établie par 7.x/8.1/8.2** (chaînes en dur), ne réintroduit pas `ThemeToneService` dans ces fichiers — cohérence locale avec le module plutôt qu'uniformisation globale hors scope.

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/api/src/scenarios/scenarios.service.ts`** (lu intégralement — état actuel post-Story 8.2 + bug-fixes du 2026-07-14) :
- `markCourant()` (lignes ~263-315) : modèle exact du verrou `$queryRaw ... FOR UPDATE` + `updateMany`/count conditionnel dans une transaction Prisma, à répliquer pour `inscrire()`.
- `participate()` (lignes ~349-372) : modèle d'idempotence via re-vérification avant écriture (`upsert` ici, `findUnique` + return anticipé dans `inscrire()` — schéma équivalent adapté à une contrainte de capacité).
- `linkSeancePoll()` (lignes ~394-427) : modèle exact de rejet `CAMPAGNE_EPISODIQUE` (à inverser pour `setSeanceCapacity`/`inscrire`/`validerDate`, qui rejettent tout **sauf** `CAMPAGNE_EPISODIQUE`) — inclut déjà la garde anti-écrasement (`seance.pollId` déjà posé) et la garde de statut (`poll.status !== 'OPEN'`) ajoutées lors de la revue du 2026-07-13, mêmes réflexes de garde à appliquer ici (`inscriptionMax == null` avant `inscrire()`).
- `toDto()`/`toEnrichedDto()`/`toSeanceDto()`/`loadSeancesBatch()`/`SEANCE_POLL_INCLUDE` (lignes ~471-560) : squelette exact à étendre pour `inscription` — `SEANCE_POLL_INCLUDE` doit être renommé `SEANCE_INCLUDE` (portée élargie) plutôt que dupliqué, un seul point d'`include` Prisma pour `Seance`.

**`apps/web/src/app/features/scenarios/seance-list/seance-list.ts`+`.html`** (lu intégralement, état post-bug-fixes 2026-07-14) : structure `@for (seance of scenario().seances)` + branches `isMj()`/poll status déjà établies pour le linéaire — même charpente à répliquer pour la branche épisodique (Task 6), avec le même pattern de garde anti-double-clic (`pollActionPending`-like) et de rafraîchissement post-action (`refreshScenario()` via `ScenariosService.listAll` + `seanceLinked.emit`) déjà en place depuis le bug-fix du 2026-07-14 — **`onInscrire`/`onDesinscrire`/`onValiderDate`/`onSetCapacity`/`onProposerAutreDate` doivent tous suivre ce même pattern** (le backend renvoie déjà `ScenarioDto` à jour sur toutes les nouvelles routes, donc pas besoin de `refreshScenario()` séparé ici — contrairement à `onChoose`/`onClosePoll` qui appellent `PollService` dont les endpoints renvoient `void`).

**`apps/web/src/app/features/characters/character-sheet/inventory-tab/encumbrance-bar.ts`+`.html`+`.scss`** (lu intégralement) : modèle structurel exact pour `FillIndicator` — barre + label texte, `[style.width.%]` calculé, classe conditionnelle plutôt que couleur inline.

**`apps/web/src/styles.scss:42-46`** (lu intégralement) : les 4 tokens de couleur `--color-available`/`--color-unavailable`/`--color-unknown`/`--color-mixed` déjà définis globalement — à réutiliser tels quels, ne jamais en recréer une variante locale.

### Hors scope explicite de cette story (ne pas implémenter)

- Suppression d'une `Seance`/`Inscription` — aucune AC ne le demande ; « Proposer une autre date » crée une nouvelle `Seance` sans toucher à l'ancienne (cf. `[ASSUMPTION]` ci-dessus).
- Liste des inscrits affichée nommément (pseudos) au-delà de ce que `FillIndicator` montre — ni `DESIGN.md` ni `EXPERIENCE.md` ne le demandent explicitement pour cette story (contrairement aux participants de scénario, Story 8.1, qui utilisent `CharacterSummaryCard`) ; `SeanceDto.inscription.inscrits` reste disponible dans le DTO pour un usage futur mais n'a pas besoin d'être rendu nommément dans cette story.
- Toute modification de `PollService`/`PollController`/`apps/web/.../poll/*` — non concerné par cette story (mécanisme entièrement distinct, AD-4).
- Toute modification de `ScenarioEditor`/`ScenarioReadDialog` au-delà de la vérification de non-régression (Task 7) — le câblage `<app-seance-list>` existant suffit déjà.
- Notification/rappel automatique quand `max` est atteint ou quand une date est validée — Non-Goal PRD (pas d'e-mail sur scénario en v1, `P4e-AD-1`).
- Le point d'entrée unique de vote de date (calendrier ↔ scénario) identifié comme sujet de refonte le 2026-07-14 — tracké séparément en Story 8.7 (fin d'Epic 8), sans rapport avec le mécanisme épisodique de cette story.

### Project Structure Notes

- Aucune migration Prisma — `Seance.inscriptionMin`/`inscriptionMax`/`dateValidee` et le modèle `Inscription` existent déjà (migration `scenarios_seances_p4`, confirmé par lecture directe de `schema.prisma:403-428`) ; `User.inscriptions`/`Seance.inscriptions` relations inverses déjà présentes.
- Nouveaux fichiers backend : `apps/api/src/scenarios/dto/set-seance-capacity.dto.ts` uniquement — pas de DTO pour `inscrire`/`desinscrire`/`validerDate` (corps vide, même pattern que `open`/`markCourant`/`close`/`addSeance`).
- Nouveau fichier frontend : `apps/web/src/app/features/scenarios/fill-indicator/fill-indicator.ts` (+ `.html`, `.scss`, `.spec.ts`) — seul nouveau composant Angular de cette story, consommé uniquement par `SeanceList` (Task 6).
- `ScenariosModule` (`scenarios.module.ts`) reste inchangé — aucun nouveau module importé, tout reste dans `ScenariosService`/`ScenariosController` existants (AD-1).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.3] — texte d'origine de la story et 6 ACs.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-4, #AD-5, #P1-AD-3] — deux mécanismes de date jamais fusionnés, verrou `SELECT ... FOR UPDATE` obligatoire, `PartiesService` seul point de vérité.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md lignes 176-200, 306-331] — forme exacte de `Seance`/`Inscription`/`SeanceDto.inscription` attendue par le spine (adaptée : `characterId?` mentionné dans le spine pour `participants` n'existe pas dans l'implémentation réelle de Story 8.1/8.2, pas repris ici par cohérence avec le code déjà livré).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/DESIGN.md#FillIndicator, #ScenarioCard] — spec visuelle exacte de `FillIndicator` (track/fill/label, 3 couleurs sémantiques réutilisées).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/EXPERIENCE.md#4 Component Patterns "Inscription à capacité limitée", #5 State Patterns, #6 Interaction Primitives, #7 Accessibility Floor, UJ-3] — flux complet (proposer → s'inscrire → fermeture auto au max → validation MJ manuelle à tout niveau), bouton simple s'inscrire/se désinscrire sans formulaire ni confirmation modale, règle d'accessibilité (valeur numérique toujours en texte).
- [Source: apps/api/prisma/schema.prisma:403-428] — `Seance.inscriptionMin/Max/dateValidee`, `Inscription` (unique `[seanceId, userId]`), déjà en place, aucune migration requise.
- [Source: apps/api/src/scenarios/scenarios.service.ts] — `markCourant()`/`participate()`/`linkSeancePoll()`/`toDto()`/`toEnrichedDto()`/`toSeanceDto()`/`loadSeancesBatch()` lus intégralement ; patrons à étendre pour `setSeanceCapacity()`/`inscrire()`/`desinscrire()`/`validerDate()`.
- [Source: apps/api/src/scenarios/scenarios.controller.ts, dto/link-seance-poll.dto.ts] — pattern de routes avec/sans corps, style `class-validator`, à répliquer.
- [Source: apps/web/src/app/features/scenarios/seance-list/seance-list.ts, .html] — lus intégralement (état post-bug-fixes 2026-07-14) ; structure `@for`/gardes anti-double-clic/`refreshScenario()` à répliquer pour la branche épisodique.
- [Source: apps/web/src/app/features/characters/character-sheet/inventory-tab/encumbrance-bar.ts, .html, .scss] — lus intégralement ; modèle structurel exact pour `FillIndicator`.
- [Source: apps/web/src/styles.scss:42-46] — tokens de couleur `--color-available/unavailable/unknown/mixed`, à réutiliser tels quels.
- [Source: apps/web/src/app/core/scenarios/scenarios.service.ts] — convention `addSeance()`/`linkSeancePoll()`/`_changed.update` à répliquer pour les 4 nouvelles méthodes.
- [Source: 8-2-seances-selection-date-vote.md] — intelligence de la story précédente : convention `[ASSUMPTION]`, `pnpm typecheck` (`apps/api`, `tsc --noEmit -p tsconfig.build.json`) à lancer après implémentation (`ts-jest` ne type-check pas complètement, `isolatedModules`), pattern de revue adversariale à 3 couches appliqué post-implémentation, gardes anti-double-clic à poser dès l'écriture (pas après coup en revue).
- [Source: session de bug-fix du 2026-07-13/14, deferred-work.md] — `linkSeancePoll` a appris la leçon de garder `seance.pollId`/`poll.status` avant d'écrire (à répliquer pour `inscrire()` : vérifier `inscriptionMax` avant d'écrire) ; `SeanceList.onChoose/onClosePoll` ont appris la leçon de toujours rafraîchir l'état local après une action serveur réussie (déjà fait pour ces deux méthodes, à répliquer pour les 5 nouvelles actions de cette story bien que ce ne soit pas strictement nécessaire ici puisque les nouvelles routes renvoient déjà `ScenarioDto` à jour directement).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `toSeanceDto()` étendu avec `inscription?: SeanceInscriptionDto`, peuplé uniquement si `inscriptionMax != null` (AC9) — `SEANCE_POLL_INCLUDE` renommé `SEANCE_INCLUDE` (portée élargie à `inscriptions`, un seul point d'`include` Prisma plutôt qu'un doublon).
- `inscrire()` : ordre critique dans la transaction — `existing` (déjà inscrit) vérifié **avant** le comptage du quota, pour garantir l'idempotence même si `max` est atteint par d'autres entretemps (AC2 vs AC4) ; verrou `SELECT ... FOR UPDATE` sur `Seance` par `id` (AD-5), même mécanisme que `markCourant()`/AD-10.
- `setSeanceCapacity()`/`inscrire()`/`validerDate()` rejettent tout `kind !== CAMPAGNE_EPISODIQUE` (symétrique au rejet `CAMPAGNE_EPISODIQUE` de `linkSeancePoll`, Story 8.2) ; `desinscrire()` reste sans garde de `kind` (`deleteMany` idempotent, no-op silencieux sinon).
- `addSeance()` (Story 8.2) volontairement **non modifié** — la capacité se définit dans un second temps via `PATCH .../capacite`, même schéma en deux temps que `linkSeancePoll()` pour le linéaire (cf. `[ASSUMPTION]` Dev Notes).
- `SeanceList` : nouvelle branche `@if (isEpisodique())` dans le template, entièrement séparée du bloc poll existant (inchangé) — remplace le masquage total posé par Story 8.2. « Proposer une autre date » appelle `addSeance(scenario().id)` (nouvelle `Seance` vierge, ancienne conservée intacte) — décision documentée en `[ASSUMPTION]`, `epics.md` ne précisant aucune action backend pour ce bouton.
- `AuthService` (déjà `providedIn: 'root'`) injecté dans `SeanceList` pour dériver `currentUserId` (savoir si le viewer est déjà inscrit) — aucun nouveau provider de test requis dans `scenario-editor.spec.ts`/`scenario-read-dialog.spec.ts`, confirmé sans régression.
- Suite complète (après implémentation) : 29 suites/560 tests API (+38 : `setSeanceCapacity()`/`inscrire()`/`desinscrire()`/`validerDate()`, routage contrôleur, tests de non-régression `seances` sur les méthodes existantes), 64 suites/605 tests web (+18 : service frontend (4), `FillIndicator` (5), `SeanceList` branche épisodique (13)). Aucune régression, `pnpm typecheck` propre.

### Completion Notes List

- Backend : `ScenariosService.setSeanceCapacity()`/`inscrire()`/`desinscrire()`/`validerDate()` (nouvelles routes `PATCH /scenarios/seances/:id/capacite`, `POST`/`DELETE /scenarios/seances/:id/inscription`, `PATCH /scenarios/seances/:id/valider-date`). Verrou `SELECT ... FOR UPDATE` explicite sur `Seance` dans `inscrire()` (AD-5) — testé via l'ordre lock→count→create dans la transaction Prisma (les mocks Jest ne simulent pas un vrai verrou Postgres, mais valident le respect de l'ordre critique).
- `SeanceDto.inscription` (nouveau champ optionnel) toujours peuplé de façon cohérente sur tout endpoint retournant un `ScenarioDto`, via le même `toEnrichedDto()`/`loadSeancesBatch()` que Story 8.2.
- Frontend : nouveau composant `FillIndicator` (réutilise à l'identique les 4 tokens de couleur globaux `--color-available/unavailable/unknown/mixed`, aucune nouvelle valeur). `SeanceList` gagne une branche épisodique complète (formulaire de capacité MJ, `FillIndicator` + CTA Valider/Proposer une autre date pour le MJ, bouton S'inscrire/Se désinscrire pour le joueur, affichage "Date retenue" une fois validée) — même pattern anti-double-clic et `seanceLinked.emit()` que le bloc poll existant.
- 10 acceptance criteria couvertes : AC1 (capacité définie, jamais avec un poll), AC2 (inscription idempotente), AC3 (désinscription), AC4 (rejet 409 au quota), AC5 (verrou concurrent), AC6 (validation à tout niveau de remplissage), AC7/AC8 (FillIndicator, couleurs + texte toujours présent, état 0 inscrit = sous-min dès le départ), AC9 (forme exacte de `SeanceDto.inscription`), AC10 (403 non-MJ/non-membre).
- 560/560 tests API + 605/605 tests web passent, `pnpm typecheck` propre, aucune régression.
- `pnpm lint` (web) : auto-fix Prettier appliqué (formatage uniquement, aucun changement de logique) ; 8 erreurs pré-existantes restantes, toutes hors périmètre de cette story (a11y `scenario-drafts.html`/`scenario-editor.html`, alias d'input `scenario-editor.ts`, import inutilisé `partie-form.spec.ts`). `pnpm lint` (api) : uniquement des erreurs `@typescript-eslint/no-unsafe-*` pré-existantes sur le pattern `toDto(x: any)` déjà documenté comme dette technique acceptée depuis Story 7.1 (`deferred-work.md`) — `toSeanceDto()` étendu suit ce même pattern par cohérence, aucune nouvelle catégorie d'erreur introduite.

**Revue de code (2026-07-14, 3 couches adversariales)** : Acceptance Auditor 0 déviation. 1 decision-needed résolue par l'utilisateur (inscriptions figées après validation de date) et 4 patches appliqués : garde `dateValidee` sur `inscrire()`/`desinscrire()`, relecture d'`inscriptionMax` sous le verrou dans `inscrire()` (course avec `setSeanceCapacity()` concurrent), garde `inscriptionMax` défini sur `validerDate()`, validation du formulaire de capacité frontend (bouton désactivé tant que min/max invalides, avec gestion explicite du cycle de détection de changements zoneless sur les `<input>` natifs). 4 items différés (voir `deferred-work.md`), 8 dismissed comme bruit/faux positifs/déjà décidés en `[ASSUMPTION]`. Suite finale : 564/564 tests API (+4), 606/606 tests web (+1), `pnpm typecheck` propre.

### File List

- `packages/shared/src/index.ts` (modifié — `SeanceInscriptionDto`, `SetSeanceCapacityDto`, `SeanceDto.inscription`)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `setSeanceCapacity()`, `inscrire()`, `desinscrire()`, `validerDate()`, `toSeanceDto()`/`SEANCE_INCLUDE` étendus)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — mocks `inscription`/`tx.inscription`, `describe('setSeanceCapacity()')`, `describe('inscrire()')`, `describe('desinscrire()')`, `describe('validerDate()')`)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — routes `capacite`, `inscription` (POST/DELETE), `valider-date`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — mocks + 4 tests de routage)
- `apps/api/src/scenarios/dto/set-seance-capacity.dto.ts` (nouveau)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `setSeanceCapacity()`, `inscrire()`, `desinscrire()`, `validerDate()`)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié — 4 nouveaux tests)
- `apps/web/src/app/features/scenarios/fill-indicator/fill-indicator.ts` (nouveau)
- `apps/web/src/app/features/scenarios/fill-indicator/fill-indicator.html` (nouveau)
- `apps/web/src/app/features/scenarios/fill-indicator/fill-indicator.scss` (nouveau)
- `apps/web/src/app/features/scenarios/fill-indicator/fill-indicator.spec.ts` (nouveau)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.ts` (modifié — branche épisodique complète, `AuthService`/`FillIndicator` injectés)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.html` (modifié — branche `@if (isEpisodique())`)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.scss` (modifié — `.capacity-form`/`.seance-row__mj-actions`)
- `apps/web/src/app/features/scenarios/seance-list/seance-list.spec.ts` (modifié — mocks `AuthService`/nouvelles méthodes, 13 nouveaux tests)

## Change Log

- 2026-07-14 : Story créée via `bmad-create-story` (lecture directe de `scenarios.service.ts`/`.controller.ts`, `parties.service.ts`, `encumbrance-bar.ts`/`.html`/`.scss`, `seance-list.ts`/`.html` (état post-bug-fixes 2026-07-14), `styles.scss`, `schema.prisma`, `packages/shared/src/index.ts`, `ARCHITECTURE-SPINE.md` AD-4/AD-5/P1-AD-3 et section Types partagés, `DESIGN.md`/`EXPERIENCE.md` (ux-jdr-master-20260711) sections FillIndicator/Inscription à capacité limitée, intelligence Story 8.2 — `Seance.inscriptionMin/Max/dateValidee`/`Inscription` existent déjà en base (migration `scenarios_seances_p4`) mais aucun code service/controller/frontend ne les lit ni ne les écrit avant cette story ; décision de séparer création de `Seance` (inchangée, Story 8.2) et définition de capacité (nouvelle route `PATCH .../capacite`) plutôt que d'étendre `addSeance()`, pour rester cohérent avec le schéma en deux temps déjà établi par `linkSeancePoll()`).
- 2026-07-14 : Implémentation complète de la Story 8.3 (`ScenariosService.setSeanceCapacity()`/`inscrire()`/`desinscrire()`/`validerDate()` avec verrou `SELECT ... FOR UPDATE` explicite, nouveau composant `FillIndicator`, branche épisodique complète de `SeanceList` — 10 ACs couvertes, 560/560 tests API + 605/605 tests web passants, `pnpm typecheck` propre, aucune régression).
- 2026-07-14 : Revue de code adversariale à 3 couches (0 déviation d'AC/architecture, 1 décision utilisateur — inscriptions figées après validation de date —, 4 patches appliqués : course capacité/verrou dans `inscrire()`, garde `dateValidee` sur `inscrire()`/`desinscrire()`, garde capacité définie sur `validerDate()`, validation du formulaire de capacité frontend). 4 items différés (voir `deferred-work.md`). Statut passé à `done`. Suite finale : 564/564 tests API, 606/606 tests web, `pnpm typecheck` propre.
