---
baseline_commit: 3c6c96320249856e39b9822d80f5009daf0beeca
---

# Story 27.3: Affichage du rôle assigné (badge)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur ou MJ,
I want voir le rôle assigné à chaque personnage directement sur son avatar,
so that toute la table sache qui tient quel rôle sans avoir à le demander.

## Contexte

Story 27.2 (backend, `done`) a livré `GET /parties/:id/character-roles` (`CharacterGroupRoleDto[]`) et le module `CharacterRolesModule`. Cette story câble le **frontend uniquement** : nouveau service Angular consommant cet endpoint, extension de `RosterRow`/`buildRosterRows()`, badge dans `RosterRail`/`RosterStrip`, câblage temps réel. **Aucun changement backend.**

**Décisions déjà actées (AD-7/AD-8, `ARCHITECTURE-SPINE.md`), aucune question ouverte sur le contrat de données :**
- `RosterRow` (`roster-row.util.ts`) gagne un champ `assignedRoleLabel: string | null`, résolu depuis `CharacterGroupRoleDto` + le catalogue `groupRole` (déjà seedé, Story 27.1 — `group-roles.json`, champ `label` par entrée).
- Le rôle assigné n'est visible que si `!hasPendingLevelUp` — priorité déjà actée avec l'utilisateur, réutilise l'emplacement visuel existant du badge de montée de niveau, **jamais un second badge simultané**.
- Câblage temps réel : nouveau service `CharacterRolesService` (frontend, `core/character-roles/`) expose un contrat `notifyChanged()`/`changed()` (P7-AD-4/AD-8, même forme que `HommeDragonService`/`AnnouncementsService`) et est ajouté à `RealtimeService.handlers` au préfixe `'partie:'` (aucune nouvelle entrée de topic).

**Absence de contrat UX pour ce palier (confirmé, cf. épics)** : aucun mockup ne spécifie l'apparence exacte du badge de rôle. Suivre strictement le pattern visuel déjà établi pour `hasPendingLevelUp` (glyphe unique + `[title]` pour le survol + suffixe d'accessibilité dans `ariaLabel`) plutôt que d'inventer un nouveau langage visuel — voir Task 3 pour le détail exact.

## Acceptance Criteria

1. **Given** `RosterRow` (`roster-row.util.ts`) et son badge `hasPendingLevelUp` existant, **when** cette story est implémentée, **then** `RosterRow` gagne un champ `assignedRoleLabel: string | null`, alimenté par `GET /parties/:id/character-roles` + le catalogue `groupRole`.
2. **Given** un personnage avec un rôle assigné ET une montée de niveau en attente, **when** le roster s'affiche, **then** seul le badge de montée de niveau est visible, jamais les deux simultanément — dès que la montée de niveau est traitée, le badge de rôle redevient visible.
3. **Given** le signal temps réel déjà en place sur `PartieDetail` (topic `partie:{id}`, Palier 7), **when** un rôle est assigné/retiré par le MJ, **then** le roster affiché chez tout membre de la Partie se met à jour sans rechargement de page — aucune nouvelle entrée `RealtimeService.handlers`, réutilise le signal `changed` de `CharacterService`.

   *Précision technique (AD-8) : « aucune nouvelle entrée `RealtimeService.handlers` » signifie aucune nouvelle entrée de **topic** (le préfixe `'partie:'` existe déjà) — une nouvelle ligne dans le tableau `handlers` pour le nouveau `CharacterRolesService` est attendue et correcte, exactement comme chaque service de domaine précédent (`HommeDragonService`, `AnnouncementsService`, etc.) a ajouté sa propre entrée au même préfixe.*

## Tasks / Subtasks

- [x] Task 1 — Nouveau service frontend `CharacterRolesService` (AC: #3)
  - [x] Créer `apps/web/src/app/core/character-roles/character-roles.service.ts`, calqué exactement sur `apps/web/src/app/core/announcements/announcements.service.ts` :
    - `private readonly _changed = signal(0); readonly changed = this._changed.asReadonly(); notifyChanged(): void { this._changed.update(v => v + 1); }` (contrat AD-8, zéro argument, même forme que `HommeDragonService`/`AnnouncementsService`).
    - `listForPartie(partieId: string): Promise<CharacterGroupRoleDto[]>` → `firstValueFrom(this.http.get<CharacterGroupRoleDto[]>(\`${API_BASE}/parties/${partieId}/character-roles\`, { withCredentials: true }))`.
    - Import `CharacterGroupRoleDto` en `import type` depuis `@master-jdr/shared` (déjà exporté, Story 27.2).
  - [x] Test `apps/web/src/app/core/character-roles/character-roles.service.spec.ts`, calqué sur `announcements.service.spec.ts` (`HttpTestingController`, `provideHttpClient()`/`provideHttpClientTesting()`) : `listForPartie()` appelle `GET /parties/:id/character-roles` avec `withCredentials: true`, retourne la liste.
  - [x] `apps/web/src/app/core/realtime/realtime.service.ts` : injecter `CharacterRolesService`, ajouter une entrée `{ prefix: 'partie:', notifyChanged: () => this.characterRoles.notifyChanged() }` au tableau `handlers` (dernière entrée, même style que `AnnouncementsService` — commentaire similaire expliquant le bug qu'elle corrige : un rôle assigné/retiré par le MJ n'apparaissait jamais chez les autres membres déjà sur la page sans recharger).
  - [x] `apps/web/src/app/core/realtime/realtime.service.spec.ts` : ajouter le mock `characterRolesSvc = { notifyChanged: vi.fn() }`, l'enregistrer dans `TestBed.configureTestingModule({ providers: [...] })`, et un test `"'open' déclenche AUSSI notifyChanged() sur CharacterRolesService — préfixe 'partie:' (Story 27.3, AC3)"` vérifiant l'appel après `emit('open')` sur `partieTopic('p1')`.

- [x] Task 2 — `RosterRow`/`buildRosterRows()` gagnent `assignedRoleLabel` (AC: #1)
  - [x] `apps/web/src/app/features/parties/roster-row.util.ts` :
    - Ajouter au type `RosterRow` : `/** Libellé du rôle de groupe assigné à ce personnage, ou null si aucun. Reflète toujours l'état réel — la priorité d'affichage avec hasPendingLevelUp est une règle de template, jamais encodée ici. */ assignedRoleLabel: string | null;`
    - `buildRosterRows()` gagne un nouveau paramètre `roleLabelFor: (c: CharacterDto) => string | null` (dernier paramètre, même position que `classLabelFor` dans la signature, avant `currentUserId`), utilisé pour peupler `assignedRoleLabel` sur chaque ligne portant un `character` non-null (jamais pour la ligne MJ sans personnage propre, ni pour un membre sans personnage — `null` dans ces deux cas, même garde que `classLabel`).
    - **Important** : `assignedRoleLabel` reste peuplé même quand `hasPendingLevelUp` est vrai — la mutuelle exclusivité est gérée exclusivement dans les templates (Task 3), jamais ici (garde la fonction testable indépendamment, cohérent avec le principe déjà appliqué à `hasPendingLevelUp`/`classLabel` qui sont deux faits indépendants combinés seulement à l'affichage).
  - [x] Pas de fichier de test dédié à `roster-row.util.ts` aujourd'hui (couverture existante uniquement via `roster-rail.spec.ts`/`roster-strip.spec.ts`) — ne pas en créer un nouveau, ajouter les cas dans ces deux specs (Task 3).

- [x] Task 3 — Badge dans `RosterRail`/`RosterStrip` (AC: #1, #2)
  - [x] `apps/web/src/app/features/parties/roster-rail/roster-rail.ts` et `roster-strip/roster-strip.ts` : ajouter un `input.required<(c: CharacterDto) => string | null>('roleLabelFor')` (même position/style que `classLabelFor`), le transmettre à `buildRosterRows(...)` en dernier argument (avant `currentUserId` pour `RosterRail`, avant `mjId` pour `RosterStrip` — même ordre de paramètres qu'à la Task 2).
  - [x] Templates (`roster-rail.html`, `roster-strip.html`) : dans `roster-rail__avatar-wrap`/`roster-strip__avatar-wrap`, **juste après** le bloc `@if (row.hasPendingLevelUp) { ... }` existant, ajouté le badge de rôle (glyphe = première lettre du libellé + `[title]`), suivant exactement le pattern `__levelup-badge`.
  - [x] Accessibilité : `roster-row.util.ts`, nouvelle fonction sœur `withRoleSuffix` incluant le rôle assigné dans `ariaLabel` quand présent et `!hasPendingLevelUp`. Adaptée dans les deux branches concernées de `buildRosterRows()`.
  - [x] CSS (`roster-rail.scss`, `roster-strip.scss`) : `.roster-rail__role-badge`/`.roster-strip__role-badge` positionné exactement comme `__levelup-badge` (couleur `--mat-sys-secondary` pour rester visuellement distinct au cas où, bien que mutuellement exclusifs).
  - [x] Tests `roster-rail.spec.ts`/`roster-strip.spec.ts` : les 4 cas prévus (badge visible + title exact, absent si montée de niveau en attente, absent si pas de rôle, aria-label enrichi) tous ajoutés et verts.

- [x] Task 4 — Câblage `PartieDetail` (AC: #1, #2, #3)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` : `CharacterRolesService` injecté, signal `characterRoles`, chargement dans `ngOnInit()` juste après `characters`, `reloadCharacterRoles()` (garde échec transitoire), `effect()` avec garde `firstRun` sur `characterRolesSvc.changed()`, champ stable `roleLabelFor` réutilisant `findContentEntry`/`gameSystemContent` déjà en place.
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.html` : `[roleLabelFor]="roleLabelFor"` ajouté sur `<app-roster-rail>` et `<app-roster-strip>`.
  - [x] Tests `partie-detail.spec.ts` : `CharacterRolesService.listForPartie()` appelé au `ngOnInit()` avec l'id de la Partie (AC1) ; `characterRolesSvc.changed()` déclenche un rechargement de `characterRoles()` (AC3). `CharacterRolesService` mocké dans les 4 blocs `TestBed.configureTestingModule` du fichier.

- [x] Task 5 — Suite complète
  - [x] `docker compose exec web pnpm test` — 1017/1017 tests verts (baseline 1005 + 12 nouveaux), aucune régression.
  - [x] `docker compose exec web pnpm build` — compilation TypeScript/Angular propre (aucune erreur de type) ; échoue uniquement sur le budget de taille de bundle (`angular.json`, 1MB), dépassement **préexistant** avant cette story (vérifié par `git stash` : 197 Ko de dépassement à la baseline vs 200 Ko après cette story — hors scope, non introduit par ce travail).
  - [x] Aucun changement backend, aucune migration Prisma, aucun changement à `packages/game-rules` — confirmé.

### Review Findings

- [x] [Review][Patch] `reloadCharacterRoles()` n'a aucune garde d'ordre de requêtes (pas d'équivalent au compteur `announcementsReqId` de `reloadAnnouncements()`) — deux appels SSE rapprochés (MJ qui assigne puis réassigne vite) peuvent résoudre dans le désordre et écraser un état plus frais par une réponse périmée [apps/web/src/app/features/parties/partie-detail/partie-detail.ts]
- [x] [Review][Patch] `assignedRoleLabel` n'est jamais `.trim()`é — un libellé de catalogue avec un espace de tête (erreur de saisie de contenu plausible, non bloquée par `findContentEntry`) reste "truthy", passe le garde `@if`, et affiche un badge visuellement vide (`charAt(0)` = espace) alors que le `title` affiche le vrai libellé [apps/web/src/app/features/parties/roster-row.util.ts, apps/web/src/app/features/parties/roster-rail/roster-rail.html, apps/web/src/app/features/parties/roster-strip/roster-strip.html]

## Dev Notes

- **Aucun changement backend** — `CharacterRolesModule`/`CharacterRolesService` (API) existent déjà (Story 27.2, `done`). Cette story consomme uniquement `GET /parties/:id/character-roles`.
- **Pattern de service frontend à copier exactement** : `apps/web/src/app/core/announcements/announcements.service.ts` (signal `changed`/`notifyChanged()`, `firstValueFrom(this.http.get(...))`, `API_BASE`). Ne pas réinventer une autre forme (pas de `BehaviorSubject`, pas de `resource()`).
- **`buildRosterRows()` reste une fonction pure** — `roleLabelFor` est une fonction injectée (comme `classLabelFor`), jamais un fetch direct dans `roster-row.util.ts`. Le composant appelant (`PartieDetail`) résout le libellé, le util ne fait qu'assembler.
- **Mutuelle exclusivité `hasPendingLevelUp`/`assignedRoleLabel` : uniquement dans les templates**, jamais dans `buildRosterRows()`. Ceci permet de tester chaque fait indépendamment (déjà le cas pour `hasPendingLevelUp` aujourd'hui).
- **Pas de contrat UX pour ce palier** — le choix du glyphe de badge (première lettre du libellé) est un choix d'implémentation minimal cohérent avec le pattern déjà établi (`▲` pour level-up, texte court pour `MJ`), pas une exigence produit figée. Ne pas construire un système d'icônes par rôle (4 rôles seedés, pas d'icône fournie dans `group-roles.json`).
- **`findContentEntry` déjà importé et utilisé dans `partie-detail.ts` pour `classLabel()`** — réutiliser exactement la même fonction pour résoudre `groupRole.label`, ne pas dupliquer la logique de résolution de catalogue.
- **`character-summary-card` (fiche « Ma fiche »/détail personnage) est explicitement hors scope** — AD-7/l'épic ne mentionnent que `RosterRow`/le roster ; ne pas ajouter le badge de rôle à `character-summary-card.html` (pas de badge `hasPendingLevelUp` équivalent à cet endroit dans le roster non plus, juste dans la fiche détaillée — périmètres différents, ne pas les confondre).
- **Ordre des paramètres de `buildRosterRows()`** — vérifier l'ordre exact actuel (`members, characters, mjId, classLabelFor, currentUserId`) avant d'insérer `roleLabelFor` ; `RosterStrip` appelle `buildRosterRows(..., this.mjId())` (deux fois `mjId()`, pas de `currentUserId` distinct) — préserver cette particularité, ne pas l'unifier avec `RosterRail` par erreur.

### Project Structure Notes

- Nouveau : `apps/web/src/app/core/character-roles/character-roles.service.ts` + `character-roles.service.spec.ts` (AD-8, structure conforme à `ARCHITECTURE-SPINE.md` ligne 208 : `core/character-roles/character-roles.service.ts`).
- Modifiés : `apps/web/src/app/core/realtime/realtime.service.ts` (+spec), `apps/web/src/app/features/parties/roster-row.util.ts`, `roster-rail/roster-rail.ts` (+.html, +.scss, +.spec.ts), `roster-strip/roster-strip.ts` (+.html, +.scss, +.spec.ts), `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (+.html, +.spec.ts).
- Aucun changement à `apps/api`, `packages/shared` (DTO déjà présent), `packages/game-rules`.

### References

- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 27.3] — Acceptance Criteria d'origine
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md#AD-7,AD-8] — contrat `RosterRow.assignedRoleLabel`, câblage temps réel
- [Source: apps/web/src/app/features/parties/roster-row.util.ts] — `RosterRow`/`buildRosterRows()` actuels, badge `hasPendingLevelUp` existant à répliquer pour le rôle
- [Source: apps/web/src/app/features/parties/roster-rail/{roster-rail.ts,roster-rail.html,roster-rail.spec.ts}] et `roster-strip/` équivalents — pattern d'input `classLabelFor`, badge `__levelup-badge`, tests associés
- [Source: apps/web/src/app/core/announcements/announcements.service.ts] — pattern exact de service frontend à copier (signal `changed`/`notifyChanged()`, `firstValueFrom`)
- [Source: apps/web/src/app/core/realtime/realtime.service.ts] — table `handlers`, à étendre d'une entrée `'partie:'` pour `CharacterRolesService`
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts] — chargement `characters`/`announcements` dans `ngOnInit()`, effects `*.changed()` avec garde `firstRun`, `classLabelFor`/`findContentEntry` déjà en place à répliquer pour `roleLabelFor`
- [Source: apps/api/game-systems/ryuutama/data/group-roles.json] — catalogue `groupRole` seedé (4 entrées, champ `label` par entrée : Cartographe/Chef/Chroniqueur/Intendant)
- [Source: _bmad-output/implementation-artifacts/27-2-assignation-role-par-mj.md] — `GET /parties/:id/character-roles` retourne `CharacterGroupRoleDto[]` (`{ id, characterId, partieId, roleKey, assignedAt }`), déjà trié par `assignedAt asc` (revue de code du 2026-07-30)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec web pnpm test` → 74 suites, 1017/1017 passed (baseline 1005 + 12 nouveaux : 2 `character-roles.service.spec.ts`, 1 `realtime.service.spec.ts`, 4 `roster-rail.spec.ts`, 3 `roster-strip.spec.ts`, 2 `partie-detail.spec.ts`)
- 1 échec transitoire rencontré puis corrigé : `classLabel() résout le label de classe...` (partie-detail.spec.ts) — l'ajout d'un `await` supplémentaire dans `ngOnInit()` (chargement de `characterRoles`) a fait déborder la boucle de drainage de microtasks existante (10 itérations) dans le helper partagé `createFixture()` ; portée à 15 itérations, plus de régression.
- `docker compose exec web pnpm build` → compile sans erreur de type ; échoue sur le budget de bundle (`angular.json`, 1MB) — vérifié via `git stash`/`git stash pop` que ce dépassement est préexistant à cette story (197 Ko de dépassement à la baseline, 200 Ko après), non introduit par ce travail, hors scope.
- Revue de code du 2026-07-30 (bmad-code-review) : 2 patches appliqués (garde d'ordre de requêtes sur `reloadCharacterRoles()`, `.trim()` sur le libellé de rôle résolu), 8 items rejetés comme bruit ou déjà couverts par la conception explicite de la story — `docker compose exec web pnpm test` → 74 suites, 1017/1017 passed (aucune régression)

### Completion Notes List

- `CharacterRolesService` (frontend, `core/character-roles/`) créé à l'identique du pattern `AnnouncementsService` (signal `changed`/`notifyChanged()`, `firstValueFrom(http.get(...))`) — câblé dans `RealtimeService.handlers` (nouvelle entrée au préfixe `'partie:'` existant, aucune nouvelle entrée de topic).
- `RosterRow`/`buildRosterRows()` gagnent `assignedRoleLabel: string | null`, peuplé via un nouveau paramètre `roleLabelFor` (fonction injectée, même pattern que `classLabelFor`) — `buildRosterRows()` reste pure, aucun fetch direct.
- Badge de rôle ajouté dans `RosterRail`/`RosterStrip` (glyphe = première lettre du libellé + `[title]`), mutuellement exclusif avec le badge de montée de niveau **uniquement au niveau du template** (`@if (row.assignedRoleLabel && !row.hasPendingLevelUp)`) — `assignedRoleLabel` sur la donnée reste toujours le fait réel, jamais masqué en amont.
- `ariaLabel` enrichi via une nouvelle fonction sœur `withRoleSuffix` (même discipline que `withLevelUpSuffix` : jamais un badge visuel seul sans équivalent textuel).
- `PartieDetail` charge `characterRoles` au `ngOnInit()`, la rafraîchit sur le signal temps réel `characterRolesSvc.changed()` (garde `firstRun`, échec transitoire non bloquant), et résout les libellés via `roleLabelFor` en réutilisant `findContentEntry`/`gameSystemContent` déjà en place pour `classLabelFor` (aucun nouveau fetch de contenu).
- Aucun changement backend ni à `packages/game-rules` — scope strictement frontend, conforme à la story.
- `character-summary-card` (fiche détaillée) volontairement non touché — hors scope (AD-7 ne mentionne que `RosterRow`/le roster).

### File List

- `apps/web/src/app/core/character-roles/character-roles.service.ts` (nouveau)
- `apps/web/src/app/core/character-roles/character-roles.service.spec.ts` (nouveau)
- `apps/web/src/app/core/realtime/realtime.service.ts`
- `apps/web/src/app/core/realtime/realtime.service.spec.ts`
- `apps/web/src/app/features/parties/roster-row.util.ts`
- `apps/web/src/app/features/parties/roster-rail/roster-rail.ts`
- `apps/web/src/app/features/parties/roster-rail/roster-rail.html`
- `apps/web/src/app/features/parties/roster-rail/roster-rail.scss`
- `apps/web/src/app/features/parties/roster-rail/roster-rail.spec.ts`
- `apps/web/src/app/features/parties/roster-strip/roster-strip.ts`
- `apps/web/src/app/features/parties/roster-strip/roster-strip.html`
- `apps/web/src/app/features/parties/roster-strip/roster-strip.scss`
- `apps/web/src/app/features/parties/roster-strip/roster-strip.spec.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`

## Change Log

- 2026-07-30 — Frontend : `CharacterRolesService` + badge de rôle assigné sur l'avatar (`RosterRail`/`RosterStrip`), câblage temps réel — Story passée en `review`.
