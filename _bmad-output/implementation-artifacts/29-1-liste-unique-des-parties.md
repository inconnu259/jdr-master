---
baseline_commit: c5b69e8177134ca24a89c6a346db6ced388643d4
---

# Story 29.1: Liste unique des parties

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur qui est MJ d'une partie et joueur dans une autre,
I want voir toutes mes parties dans une seule liste,
so that je cesse de basculer entre deux modes pour retrouver ce que je cherche.

## Contexte

**Deuxième story de l'épic 29**, juste après 29.0 (palettes de statut, `done`) qui n'a aucun lien technique avec celle-ci (tokens CSS purs). FR-7 supprime la bascule MJ/joueur globale qui organise aujourd'hui toute la navigation — c'est le changement le plus visible de l'épic.

**Portée volontairement bornée** : cette story unifie la liste et refactore la plomberie (`ModeService` → `MyPartiesService`, projection explicite). Elle **ne construit pas** : les modes d'affichage (grande vignette/moyen/liste — story 29.7), les signaux d'action et badges d'état (`StatusBadge`/`StateRail` — story 29.5, qui a besoin de `GET /me/party-signals`, AD-3, non construit ici), les filtres/tris/favoris (story 29.6), ni le regroupement par urgence en quatre intertitres (dépend des signaux de 29.5). Les cartes de cette story restent proches de ce qu'elles sont aujourd'hui (nom, système, type), avec un ajout minimal : l'indicateur de rôle non chromatique exigé par l'AC2.

## Acceptance Criteria

1. **Given** je cumule les rôles de MJ et de joueur, **When** j'ouvre mes parties, **Then** elles apparaissent toutes dans une liste unique, **and** aucun sélecteur de mode MJ/joueur n'existe plus dans la navigation.
2. **Given** une partie de la liste, **When** elle s'affiche, **Then** mon rôle sur cette partie est indiqué, **and** l'information ne repose pas sur la couleur seule.
3. **Given** je ne suis MJ d'aucune partie, **When** j'ouvre la liste, **Then** aucun bouton proéminent de création n'apparaît, **and** la création reste accessible depuis le menu, sans restriction ajoutée.
4. **Given** je suis MJ d'au moins une partie, **When** j'ouvre la liste, **Then** l'appel à l'action de création est mis en avant.
5. **Given** `ModeService` est refactoré en `MyPartiesService`, **When** le refactor est terminé, **Then** le compteur anti-course et `notifyChanged()` câblé sur le canal `user:{id}` sont conservés à l'identique, **and** la clé de mode en stockage local est supprimée.
6. **Given** `PartiesService` renvoie une partie, **When** elle est sérialisée, **Then** elle passe par une projection explicite qui énumère ses champs, **and** aucun objet Prisma n'est propagé tel quel.

## Tasks / Subtasks

### Backend — projection explicite + rôle

- [x] Task 1 — `PartiesService` (API) : fonction de projection explicite `toPartieDto()` (AC: #6)
  - [x] Dans `apps/api/src/parties/parties.service.ts`, créer une fonction `toPartieDto(partie: Partie, role: 'mj' | 'player'): PartieDto` qui énumère explicitement les champs existants — **ne pas** utiliser de spread `{ ...partie }` : `id, name, kind, gameSystemId, description, mjId, createdAt, nextSessionDate, nextSessionSlot, role`.
  - [x] **Ne pas ajouter `status` ni `coverImageUrl` au DTO** : `Partie.closedAt` n'existe pas encore dans le schéma (vérifié — seul `Scenario.closedAt` existe aujourd'hui), il est ajouté par la story 29.4 ; `coverImageUrl` est ajouté par une story ultérieure (29.10). Ajouter ces champs maintenant créerait une dérivation de statut sans donnée source.
  - [x] `listForUser(userId, role)` : remplacer le retour direct de `memberships.map(m => m.partie)` / `prisma.partie.findMany(...)` par un passage à travers `toPartieDto()` — le `role` de chaque ligne est déjà connu de façon déterministe par la branche interrogée (branche `player` → toutes les lignes portent `role: 'player'` ; branche `mj` → toutes portent `role: 'mj'`), aucune dérivation supplémentaire n'est nécessaire.
  - [x] `findOneDto(id, userId)` (`GET /parties/:id`, inchangé dans son usage) : la construire à partir du **même** `toPartieDto()` plutôt que du spread actuel `{ ...partie, mjPseudo, mjDisplayName }` — calculer `role` par comparaison `partie.mjId === userId ? 'mj' : 'player'`, puis ajouter `mjPseudo`/`mjDisplayName` par-dessus comme aujourd'hui (ce sont les deux seuls champs qui restent optionnels et propres à `findOneDto`, cf. commentaire déjà présent dans `PartieDto`).
  - [x] `apps/api/src/parties/parties.service.spec.ts` : tests sur `toPartieDto()` (champs énumérés, pas de fuite d'un champ Prisma non listé), sur `listForUser` (rôle correct par branche), sur `findOneDto` (rôle calculé, `mjPseudo`/`mjDisplayName` toujours présents comme avant).

- [x] Task 2 — `PartieDto` (`@master-jdr/shared`) : ajouter `role` (AC: #2, #6)
  - [x] `packages/shared/src/index.ts` : ajouter `role: 'mj' | 'player';` à `PartieDto` (champ toujours présent, jamais optionnel — contrairement à `mjPseudo`/`mjDisplayName`, le serveur le connaît systématiquement).

### Frontend — `ModeService` → `MyPartiesService`

- [x] Task 3 — Renommage et extension de `ModeService` (AC: #1, #5)
  - [x] Renommer `apps/web/src/app/core/mode/mode.service.ts` → `apps/web/src/app/core/mode/my-parties.service.ts` (ou déplacer le dossier `core/mode/` → `core/parties/` si plus cohérent — au choix, mais un seul déplacement, pas de doublon), classe `ModeService` → `MyPartiesService`.
  - [x] **Supprimer** : le signal `mode`, la méthode `setMode()`, la clé `localStorage` `'master-jdr.mode'` (constante `KEY`), la lecture `readStoredMode()`, et l'effet de bord qui forçait `setMode('joueur')` quand `hasMjParties()` devenait faux (n'a plus de sens sans notion de mode actif).
  - [x] **Conserver à l'identique** (AC5, ne rien réécrire) : les signaux `mjParties`/`playerParties` (`PartieDto[]`), le computed `hasMjParties`, les compteurs anti-course privés `mjSeq`/`playerSeq` et leur garde `if (seq !== this.mjSeq) return;` dans `refreshMjParties()`/`refreshPlayerParties()`, le comportement du `catch` qui ne vide jamais la liste sur erreur réseau transitoire, et `notifyChanged()` (appelle les deux refresh).
  - [x] **Ajouter** : `readonly allParties = computed(() => [...this.mjParties(), ...this.playerParties()]);` — simple concaténation, `role` est déjà porté par chaque `PartieDto` depuis Task 2, aucun tri ni regroupement (hors périmètre, cf. Contexte).
  - [x] `apps/web/src/app/core/realtime/realtime.service.ts` : renommer la propriété injectée `mode` → `myParties`, mettre à jour l'entrée `handlers` : `{ prefix: 'user:', notifyChanged: () => this.myParties.notifyChanged() }` — même préfixe, même déclenchement, seul le nom change.
  - [x] Mettre à jour tous les points d'injection recensés (aucun changement de comportement, seulement le type/nom injecté) : `apps/web/src/app/features/dashboard/dashboard.ts`, `apps/web/src/app/features/join/join.ts` (appel `refreshPlayerParties()` après adhésion, inchangé), `apps/web/src/app/features/parties/partie-form/partie-form.ts` (appel `refreshMjParties()` après création — **retirer** le `setMode('mj')` qui suit, qui n'a plus de sens), `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (appel `refreshMjParties()` après mise à jour, inchangé — **ne pas toucher** à son `isMj = computed(() => this.partie()?.mjId === this.auth.currentUser()?.id)`, indépendant et correct).
  - [x] Renommer `apps/web/src/app/core/mode/mode.service.spec.ts` → `.../my-parties.service.spec.ts` : retirer les tests sur `mode`/`setMode`, conserver tous les autres tels quels (compteur anti-course, `notifyChanged`, `hasMjParties`), ajouter un test pour `allParties` (concaténation, ordre stable).

### Frontend — suppression du sélecteur, liste unifiée, CTA conditionnel

- [x] Task 4 — Retirer le sélecteur de mode de la navigation (AC: #1)
  - [x] `apps/web/src/app/layout/shell/shell.html` : retirer les deux blocs `<mat-button-toggle-group>` (desktop `mode-toggle-desktop` et mobile `mode-row-mobile`), chacun actuellement gardé par `@if (hasMjParties())`.
  - [x] `apps/web/src/app/layout/shell/shell.ts` : retirer `mode`, `setMode()` ; **conserver** l'appel à `refreshMjParties()`/`refreshPlayerParties()` dans `ngOnInit()` (toujours nécessaire pour peupler les listes au montage) ; conserver `hasMjParties` s'il sert encore à autre chose dans ce composant (vérifier avant de retirer).
  - [x] Le lien statique « créer une partie » du menu utilisateur (`routerLink="/parties/new"`, déjà affiché sans condition) **reste inchangé** — c'est déjà l'accès non restreint exigé par l'AC3, rien à faire ici.

- [x] Task 5 — Liste unifiée dans `Dashboard`, CTA conditionnel, rôle affiché (AC: #1, #2, #3, #4)
  - [x] `apps/web/src/app/features/dashboard/dashboard.ts` : remplacer la lecture de `mode`/`mjParties`/`playerParties` par `myParties.allParties()` (après renommage de l'injection, Task 3). Supprimer le branchement `@if (mode() === 'mj') { … } @else { … }` du template — une seule boucle sur `allParties()`.
  - [x] **CTA de création** : visible et mis en avant (style bouton plein/proéminent, comme aujourd'hui dans la branche MJ) uniquement quand `hasMjParties()` est vrai (AC4) ; **absent du dashboard** (pas seulement moins visible) quand `hasMjParties()` est faux (AC3 — « aucun bouton proéminent », l'accès restant le lien de menu déjà en place).
  - [x] **Indicateur de rôle par carte** (AC2) : un signal non chromatique (icône + texte, jamais la couleur seule) à côté du nom de chaque partie — « MJ » ou « Joueur » selon `p.role`. Pas de composant partagé existant pour ce cas précis (`IdentityLabel` couvre l'identité joueur/personnage, un domaine différent) — reproduire son **patron** (icône `aria-hidden="true"` + texte visible + `aria-label` explicite sur l'élément englobant), pas nécessairement en créant un nouveau composant partagé si l'usage reste local à cette carte.
  - [x] **Ne pas perdre de fonctionnalité existante en supprimant le branchement** (le système doit continuer de fonctionner de bout en bout, pas seulement satisfaire les ACs au pied de la lettre) :
    - La section des invitations en attente (`received()`, boutons Accepter/Refuser) était visible uniquement dans l'ancienne branche joueur — elle doit rester visible **sans condition de rôle** dans la liste unifiée (un utilisateur peut avoir une invitation en attente qu'il soit déjà MJ ailleurs ou non).
    - Le bouton « vote en attente » conditionnel (`openPolls().has(p.id)`) restait, dans le code actuel, uniquement sur les cartes `playerParties` — le préserver **seulement** sur les cartes où `p.role === 'player'`, ne pas l'étendre aux cartes `mj` (comportement non demandé par les ACs).
  - [x] `apps/web/src/app/features/dashboard/dashboard.spec.ts` : réécrire les tests de branchement mode-based en tests sur la liste unifiée (rôle affiché par carte, CTA conditionnel selon `hasMjParties()`, invitations toujours visibles, vote-pending limité aux cartes joueur).
  - [x] `apps/web/src/app/layout/shell/shell.spec.ts` : retirer les tests sur le toggle de mode (clic, `setMode`, affichage conditionnel du sélecteur).

### Review Findings

- [x] [Review][Patch] `POST /parties` (`create()`) et `PATCH /parties/:id` (`update()`) renvoient encore l'objet Prisma brut, jamais passé par `toPartieDto()` — corrigé : les deux méthodes passent désormais par `toPartieDto(partie, 'mj')` (créateur/propriétaire toujours MJ), `role` présent dans les 2 réponses. [apps/api/src/parties/parties.service.ts]
- [x] [Review][Patch] `dashboard.role_prefix` vaut littéralement `'Rôle :'` à l'identique dans les 3 thèmes — corrigé : reformulé par thème (« Rang : » / « Voie : » / « Poste : »), cohérent avec la convention établie. [apps/web/src/app/core/theme/tones.ts]
- [x] [Review][Patch] L'indicateur de rôle réutilisait `nav.mode_mj`/`nav.mode_joueur` (clés scopées au sélecteur de mode retiré) — corrigé : renommées `dashboard.role_mj`/`dashboard.role_player`, déplacées dans la section dashboard des 3 thèmes. [apps/web/src/app/features/dashboard/dashboard.html, apps/web/src/app/core/theme/tones.ts]
- [x] [Review][Patch] La clé `localStorage` `'master-jdr.mode'` n'était jamais nettoyée — corrigé : `MyPartiesService` la supprime désormais à la construction (`localStorage.removeItem`), garde `typeof localStorage !== 'undefined'` cohérente avec `ThemeToneService`. [apps/web/src/app/core/my-parties/my-parties.service.ts]
- [x] [Review][Patch] Le test anti-fuite de champ Prisma ne couvrait que la branche `mj` — corrigé : test équivalent ajouté pour la branche `player` (`memberships.map(...)`). [apps/api/src/parties/parties.service.spec.ts]
- [x] [Review][Defer] L'indicateur de rôle marque à la fois l'icône ET le texte en `aria-hidden="true"`, avec l'`aria-label` porté par l'élément englobant — fonctionnellement équivalent (l'`aria-label` du parent prime de toute façon sur le contenu descendant pour le calcul du nom accessible), mais `role="text"` sur le span englobant renforcerait la fiabilité pour VoiceOver/Safari spécifiquement. [apps/web/src/app/features/dashboard/dashboard.html] — déferré, amélioration mineure non bloquante, aucun AC ne l'exige.

### État actuel du code — relevé exhaustif (ne pas re-découvrir)

**`ModeService`** (`apps/web/src/app/core/mode/mode.service.ts`), avant refactor :
```ts
type Mode = 'joueur' | 'mj';
const KEY = 'master-jdr.mode';

@Injectable({ providedIn: 'root' })
export class ModeService {
  private readonly parties = inject(PartiesService);
  readonly mode = signal<Mode>(this.readStoredMode());
  readonly mjParties = signal<PartieDto[]>([]);
  readonly playerParties = signal<PartieDto[]>([]);
  readonly hasMjParties = computed(() => this.mjParties().length > 0);
  private mjSeq = 0;
  private playerSeq = 0;
  // refreshMjParties()/refreshPlayerParties() : incrémentent leur compteur, appellent
  // this.parties.list('mj'|'player'), et après l'await vérifient `if (seq !== this.mjSeq) return;`
  // (garde anti-réponse-périmée). Le catch ne vide jamais la liste (dernière liste connue
  // conservée) — seul un succès confirmé appelle .set(list).
  // notifyChanged() : void this.refreshMjParties(); void this.refreshPlayerParties();
}
```
Effet de bord aujourd'hui présent (à supprimer avec le refactor) : après un `refreshMjParties()` réussi, si `!hasMjParties() && mode() === 'mj'`, force `setMode('joueur')`.

**Tous les points d'injection actuels** (à mettre à jour au renommage, comportement inchangé sauf mention contraire) : `shell.ts` (toggle + `refreshMjParties()`/`refreshPlayerParties()` dans `ngOnInit`), `dashboard.ts` (lecture `mode`/`mjParties`/`playerParties`, `refreshPlayerParties()` après acceptation d'invitation), `join.ts` (`refreshPlayerParties()` après adhésion), `partie-form.ts` (`refreshMjParties()` puis `setMode('mj')` après création — le `setMode` disparaît), `partie-detail.ts` (`refreshMjParties()` après mise à jour ; calcule son **propre** `isMj` indépendamment, ne dépend pas de `ModeService`), `realtime.service.ts` (câblage `notifyChanged()` sur préfixe `user:`).

**`PartiesService` backend** (`apps/api/src/parties/parties.service.ts`), avant refactor — retour Prisma brut, sans projection :
```ts
async listForUser(userId: string, role: 'mj' | 'player') {
  if (role === 'player') {
    const memberships = await this.prisma.membership.findMany({ where: { userId }, orderBy: { joinedAt: 'desc' }, include: { partie: true } });
    return memberships.map((m) => m.partie);   // ← objet Prisma brut
  }
  return this.prisma.partie.findMany({ where: { mjId: userId }, orderBy: { createdAt: 'desc' } });  // ← idem
}
```
`findOneDto` construit aujourd'hui `{ ...partie, mjPseudo, mjDisplayName }` — un spread, pas une projection énumérée : à faire passer par `toPartieDto()` également (Task 1).

**`PartieDto`** (`packages/shared/src/index.ts`), avant ajout : `id, name, kind, gameSystemId, description, mjId, mjPseudo?, mjDisplayName?, createdAt, nextSessionDate, nextSessionSlot`. Pas de `role`, pas de `status` (le type `PartieStatus` n'existe pas encore dans `@master-jdr/shared` — confirmé par recherche, il sera introduit par la story 29.4).

**`RealtimeService`** (`apps/web/src/app/core/realtime/realtime.service.ts`) : `connect(topic)`/`disconnect(topic)`, helpers `partieTopic(id)`/`userTopic(id)`, tableau interne `handlers: TopicHandler[]` mappant préfixe (`'partie:'`/`'user:'`) → `notifyChanged()` d'un service de domaine injecté. L'entrée de `ModeService` est `{ prefix: 'user:', notifyChanged: () => this.mode.notifyChanged() }` — à renommer en `myParties`, structure inchangée.

**Pattern d'indicateur non chromatique déjà établi** : `IdentityLabel` (`apps/web/src/app/shared/identity/identity-label.ts`) affiche l'identité joueur/personnage via une icône SVG inline `aria-hidden="true"` + texte visible + `aria-label` explicite sur l'élément englobant — domaine différent (identité, pas rôle MJ/joueur), mais le **patron** (icône + texte + aria-label, jamais la couleur seule) est le même que celui à reproduire pour l'indicateur de rôle de cette story.

### Anti-réinvention — ce qui existe déjà

| Besoin | Existe déjà | À faire |
|---|---|---|
| Compteur anti-course, `notifyChanged()` sur `user:{id}` | `ModeService` (bug de production corrigé, documenté en commentaire dans le fichier et dans AD-3/AD-11 de la spine) | **Renommer et étendre, ne jamais réécrire** — cf. Task 3 |
| Rôle MJ/joueur calculé | `PartieDetail.isMj = computed(() => partie.mjId === currentUser.id)` | Même logique de calcul (comparaison `mjId`), mais désormais côté **serveur** dans `toPartieDto()` (le rôle est déjà connu par la requête qui l'a trouvée) — ne pas dupliquer ce calcul côté client pour la liste |
| Icône + texte + aria-label non chromatique | `IdentityLabel` | Reproduire le patron, domaine différent — pas de fusion avec `IdentityLabel` |
| Lien de création non restreint | Lien statique du menu utilisateur (`shell.html`), déjà inconditionnel | Rien à faire — déjà conforme à l'AC3 |

### Ce qui doit continuer de fonctionner

- Le compteur anti-course et la garde anti-réponse-périmée de `refreshMjParties()`/`refreshPlayerParties()` — un bug de production corrigé, ne pas réintroduire la régression.
- `PartieDetail.isMj` — indépendant de `ModeService`/`MyPartiesService`, reste tel quel.
- Les invitations en attente (`InvitationsService.listReceived()`) et leurs boutons Accepter/Refuser — visibles aujourd'hui uniquement en branche joueur, doivent rester visibles dans la liste unifiée, sans condition de rôle.
- Le bouton « vote en attente » conditionnel (`openPolls().has(p.id)`) — limité aux cartes où `role === 'player'`.
- `join.ts` (adhésion par lien d'invitation) et `partie-form.ts` (création) continuent d'appeler `refreshPlayerParties()`/`refreshMjParties()` respectivement, sans changement de comportement (seul le `setMode('mj')` de `partie-form.ts` disparaît).

### Hors périmètre (stories ultérieures de l'épic 29)

- Modes d'affichage (grande vignette/moyen/liste) — 29.7.
- Signaux d'action, badges d'état, `StatusBadge`/`StateRail` — 29.5 (dépend de `GET /me/party-signals`, AD-3, non construit ici).
- Filtres, tris, favoris — 29.6.
- Regroupement par urgence en quatre intertitres — dépend des signaux de 29.5.
- `Partie.status`/`closedAt` — 29.4. `Partie.coverImageUrl` — 29.10.

### Temps réel (checklist `docs/checklist.md`)

Déjà câblé : `MyPartiesService.notifyChanged()` reste abonné au canal `user:{id}` existant (aucune nouvelle connexion SSE ouverte). Cette story ne fait qu'y ajouter `allParties` (dérivé des mêmes signaux déjà rafraîchis) — aucun câblage temps réel supplémentaire requis.

### Project Structure Notes

- **Modifiés (API)** : `apps/api/src/parties/parties.service.ts`, `apps/api/src/parties/parties.service.spec.ts`.
- **Modifiés (partagé)** : `packages/shared/src/index.ts` (`PartieDto.role`).
- **Renommés (web)** : `apps/web/src/app/core/mode/mode.service.ts` → `.../my-parties.service.ts` (ou déplacé vers `core/parties/`, au choix de l'implémenteur — un seul emplacement final), `mode.service.spec.ts` → `my-parties.service.spec.ts`.
- **Modifiés (web)** : `apps/web/src/app/core/realtime/realtime.service.ts`, `apps/web/src/app/layout/shell/shell.ts`/`.html`/`.spec.ts`, `apps/web/src/app/features/dashboard/dashboard.ts`/`.html`/`.spec.ts`, `apps/web/src/app/features/join/join.ts`, `apps/web/src/app/features/parties/partie-form/partie-form.ts`, `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (import/injection renommés uniquement, pas de changement de logique).
- **Non touchés** : `PartieDetail.isMj`, la logique de `PartiesService` frontend (`list`/`get`/`create`/`update`/`remove`), `InvitationsService`, `openPolls` (`OpenPollsService`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.1] — Story, Acceptance Criteria (reprises telles quelles)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 29 : Navigation et listes] — Séquencement : « la vue mes personnages précède la barre de navigation… la signalétique d'état suit la clôture »
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md#AD-11] — Renommage `ModeService` → `MyPartiesService`, ce qui doit être conservé à l'identique, création non restreinte
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md#AD-15] — Projection explicite de `PartiesService`, jamais d'objet Prisma brut
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md#AD-3] — Signaux d'état (hors périmètre de cette story, endpoint `GET /me/party-signals` porté par 29.5)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md#AD-8] — `Partie.closedAt`/`status` : pas encore dans le schéma, porté par 29.4
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md#AD-12] — Composant d'identité partagé, traitement visuel du rôle non fixé à ce stade
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md#2. Information Architecture] — « une seule liste, jamais deux » ; création ouverte à tout utilisateur, mise en avant conditionnelle ; §4.1 Carte de partie (modes d'affichage/signaux — hors périmètre, cf. Dev Notes)
- [Source: apps/web/src/app/core/mode/mode.service.ts, mode.service.spec.ts] — Implémentation actuelle à renommer/étendre
- [Source: apps/web/src/app/layout/shell/shell.ts, shell.html] — Sélecteur de mode à retirer
- [Source: apps/web/src/app/features/dashboard/dashboard.ts, dashboard.html] — Branchement mode-based à unifier
- [Source: apps/api/src/parties/parties.service.ts, parties.controller.ts] — `listForUser`/`findOneDto` à faire passer par la projection explicite
- [Source: packages/shared/src/index.ts] — `PartieDto` à étendre
- [Source: apps/web/src/app/shared/identity/identity-label.ts] — Patron icône + texte + aria-label à reproduire pour l'indicateur de rôle
- [Source: apps/web/src/app/core/realtime/realtime.service.ts] — Câblage `notifyChanged()` sur `user:{id}` à préserver

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- `docker compose exec api pnpm test` → 50 suites, 995 tests, tout vert.
- `docker compose exec api pnpm typecheck` → propre.
- `docker compose exec web pnpm test` → 82 fichiers, 1111 tests, tout vert.
- `docker compose exec web pnpm build` → build Angular propre (seul l'échec pré-existant de budget bundle persiste, delta non significatif).
- Redémarrage réel du conteneur `api` : `Nest application successfully started`, `GET /parties` mappée.
- Vérification manuelle bout-en-bout (curl, comptes de démo `bob@example.com` et `mj-demo@example.com`) : `GET /parties?role=player` → chaque entrée porte `"role":"player"` ; `GET /parties?role=mj` → `"role":"mj"` ; `GET /parties/:id` (`findOneDto`) → `role` + `mjPseudo`/`mjDisplayName` tous présents ; aucun champ Prisma non énuméré (`sheetVisibility`, etc.) ne fuite.
- Recherche exhaustive de tous les points d'injection de `ModeService` avant renommage (7 fichiers trouvés, dont `open-polls.service.ts` non recensé dans le Dev Notes initial de la story — ajouté au vol, même traitement).
- Revue de code (`bmad-code-review`, 3 couches parallèles) → 0 decision-needed, 5 patchs appliqués (`create()`/`update()` passés par `toPartieDto()`, reformulation par thème de `dashboard.role_prefix`, renommage `nav.mode_*` → `dashboard.role_mj`/`dashboard.role_player`, nettoyage de la clé `localStorage` orpheline, test anti-fuite ajouté pour la branche `player`), 1 item déferré (accessibilité mineure `role="text"`), 9 findings dismissés après vérification. Suites re-exécutées après application des patchs : API 998 tests (50 suites), Web 1112 tests (82 fichiers), build/typecheck propres.

### Completion Notes List

- Backend : `toPartieDto()` (projection explicite, AD-15) ajoutée dans `parties.service.ts`, utilisée par `listForUser()` et `findOneDto()` — `role: 'mj'|'player'` calculé serveur, jamais côté client. `status`/`coverImageUrl` volontairement absents (schéma pas encore prêt, stories 29.4/29.10).
- `PartieDto.role` ajouté dans `@master-jdr/shared` (champ requis, jamais optionnel).
- `ModeService` renommé `MyPartiesService`, déplacé de `core/mode/` vers `core/my-parties/` (dossier renommé en cohérence avec la classe — dossier `core/mode/` supprimé). `mode`/`setMode()`/clé localStorage/effet de bord auto-`setMode` retirés. `mjParties`/`playerParties`/`hasMjParties`/compteurs anti-course/`notifyChanged()` conservés à l'identique. `allParties` ajouté (concaténation).
- **Point d'injection non recensé dans la story, trouvé et traité** : `apps/web/src/app/core/poll/open-polls.service.ts` dépendait aussi de `ModeService.playerParties` — renommé en cohérence, comportement inchangé.
- Tous les points d'injection recensés mis à jour (`realtime.service.ts`, `shell.ts`, `dashboard.ts`, `join.ts`, `partie-form.ts` — `setMode('mj')` retiré, `partie-detail.ts` — `isMj` local non touché).
- Sélecteur de mode retiré de `shell.html`/`shell.ts` (2 blocs `mat-button-toggle-group`, `MatButtonToggleModule` devenu inutile, retiré). Lien de création du menu utilisateur laissé inchangé (déjà conforme à l'AC3).
- `Dashboard` unifié : une seule grille sur `allParties()`, CTA de création présent uniquement si `hasMjParties()`, indicateur de rôle non chromatique (icône Material + texte + `aria-label`) par carte, réutilisant `nav.mode_mj`/`nav.mode_joueur` (labels déjà thématisés dans les 3 thèmes, plus besoin de nouvelles clés dédiées). Titre unifié : réutilisation de `nav.my_games` (clé existante, jamais consommée jusqu'ici). 2 nouvelles clés de thème ajoutées dans les 3 thèmes : `dashboard.empty`, `dashboard.role_prefix` ; 4 clés obsolètes retirées (`dashboard.title_mj`, `dashboard.empty_mj`, `dashboard.title_player`, `dashboard.empty_player`).
- Invitations en attente désormais visibles sans condition de rôle. Bouton « vote en attente » limité aux cartes `role === 'player'`.
- Aucune régression détectée : suites complètes API + web vertes, build propre, vérification manuelle réelle des 3 endpoints touchés.

### File List

- `apps/api/src/parties/parties.service.ts`
- `apps/api/src/parties/parties.service.spec.ts`
- `packages/shared/src/index.ts`
- `apps/web/src/app/core/my-parties/my-parties.service.ts` (nouveau, remplace `core/mode/mode.service.ts`)
- `apps/web/src/app/core/my-parties/my-parties.service.spec.ts` (nouveau, remplace `core/mode/mode.service.spec.ts`)
- `apps/web/src/app/core/realtime/realtime.service.ts`
- `apps/web/src/app/core/realtime/realtime.service.spec.ts`
- `apps/web/src/app/core/poll/open-polls.service.ts`
- `apps/web/src/app/core/poll/open-polls.service.spec.ts`
- `apps/web/src/app/core/parties/parties.service.spec.ts`
- `apps/web/src/app/layout/shell/shell.ts`
- `apps/web/src/app/layout/shell/shell.html`
- `apps/web/src/app/layout/shell/shell.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard.ts`
- `apps/web/src/app/features/dashboard/dashboard.html`
- `apps/web/src/app/features/dashboard/dashboard.scss`
- `apps/web/src/app/features/dashboard/dashboard.spec.ts`
- `apps/web/src/app/features/join/join.ts`
- `apps/web/src/app/features/parties/partie-form/partie-form.ts`
- `apps/web/src/app/features/parties/partie-form/partie-form.spec.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (fixture `PartieDto` uniquement)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (fixture `PartieDto` uniquement)
- `apps/web/src/app/core/theme/tones.ts`
- **Supprimés** : `apps/web/src/app/core/mode/mode.service.ts`, `apps/web/src/app/core/mode/mode.service.spec.ts`
