---
baseline_commit: bb0c3263c6101bf256449477cbf4b45424cb0c30
---

# Story 29.2: Vue « mes personnages »

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want retrouver tous mes personnages au même endroit,
so that je n'aie pas à me rappeler dans quelle partie j'ai créé lequel.

## Contexte

**Troisième story de l'épic 29**, juste après 29.1 (liste unique des parties, `done`). La séquence de l'épic place explicitement « la vue mes personnages » avant « la barre de navigation à quatre destinations » (29.3) — cette story construit donc un **écran atteignable par URL directe**, sans entrée de navigation encore câblée : 29.3 ajoutera le lien vers `/characters` depuis la nouvelle barre. Ce n'est pas un oubli, c'est l'ordre de dépendance documenté par l'épic.

L'endpoint `GET /me/characters` est **fixé par l'architecture** (AD-4/D-10 : « `GET /me/characters` dans `CharacterModule`, restreint aux personnages de l'appelant ») — c'est un **nouvel** endpoint, il n'existe pas encore (vérifié : `CharactersController`/`CharacterService` n'ont aujourd'hui aucune méthode qui liste au travers de plusieurs parties, seulement `findByPartie(partieId, userId)` scopé à une Partie). Sa **présentation** (Q-8, ouverte dans l'UX) n'est en revanche pas fixée : ce que cette story doit concevoir.

**Portée volontairement bornée**, par analogie avec la réserve consignée en 29.1 : EXPERIENCE.md prescrit que « la liste des personnages réutilise **exactement** la grammaire de la liste des parties » (modes d'affichage, filtres/couches, masquage au défilement, révélation par icône sur mobile) — mais 29.1 n'a **pas construit** cette grammaire pour les parties non plus (modes d'affichage → 29.7 ; filtres/tris/favoris → 29.6), au nom de la réserve consignée dans EXPERIENCE.md (échelle réelle de l'utilisateur : 0 partie aujourd'hui, 2 à 4 en projection). Par cohérence, cette story livre un écran minimal — liste + recherche simple toujours visible — et **ne construit pas** la barre de contrôles complète ni le masquage au défilement. Si cette réserve est revisitée pour les parties (29.6/29.7), la vue personnages devra être alignée dans la foulée.

## Acceptance Criteria

1. **Given** j'ai des personnages dans plusieurs parties, **When** j'ouvre « Mes personnages », **Then** ils apparaissent tous, toutes parties confondues, **and** la liste ne contient que les miens.
2. **Given** cette vue, **When** elle s'affiche, **Then** elle ne mélange jamais parties et personnages dans une même liste.
3. **Given** un personnage listé, **When** il est rendu, **Then** son nom suit la convention d'identité établie à l'épic 28, **and** la partie dont il provient est indiquée.
4. **Given** je saisis une recherche, **When** je tape, **Then** la liste se filtre sur les personnages correspondants.

## Tasks / Subtasks

### Backend — `GET /me/characters`

- [x] Task 1 — `CharacterService.findMine()` (AC: #1)
  - [x] Dans `apps/api/src/characters/character.service.ts`, ajouter une méthode `findMine(userId: string): Promise<MyCharacterDto[]>` :
    - `this.prisma.character.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })` — si vide, retourner `[]` immédiatement (pas de requête `Partie` inutile).
    - Résolution en lot des Parties d'origine (pas de N+1, même patron que `findByPartie`/`PartiesService.resolveParticipants`) : `partieIds = [...new Set(characters.map(c => c.partieId))]`, puis `this.prisma.partie.findMany({ where: { id: { in: partieIds } }, select: { id: true, name: true, mjId: true } })`, indexée dans une `Map`.
    - Résolution de l'identité de l'appelant une seule fois (`this.users.findById(userId)`) — l'appelant est le propriétaire de **tous** les personnages retournés par cette méthode, contrairement à `findByPartie` qui résout plusieurs propriétaires différents.
    - Pour chaque personnage : `isMj = partieById.get(c.partieId)?.mjId === userId` (varie par Partie — l'appelant peut être MJ d'une Partie et joueur d'une autre) ; construire via `toDto(c, owner.pseudo, owner.displayName, isMj, isMj)` (viewer === propriétaire ici, comme les autres mutations propriétaire-seul du fichier) puis ajouter `partieName: partieById.get(c.partieId)?.name ?? ''`.
  - [x] `apps/api/src/characters/character.service.spec.ts` : tests sur `findMine` — plusieurs personnages toutes parties confondues, tableau vide sans requête `Partie` supplémentaire (mock call count), `isMj` correct par Partie (un cas MJ + un cas joueur dans le même appel), pas de fuite d'un autre utilisateur.

- [x] Task 2 — Nouveau contrôleur `MyCharactersController` (AC: #1)
  - [x] Créer `apps/api/src/characters/my-characters.controller.ts`, patron **identique** à `partie-characters.controller.ts` (guard, `CurrentUser`, un seul appel de délégation) :
    ```ts
    @UseGuards(AuthenticatedGuard)
    @Controller('me/characters')
    export class MyCharactersController {
      constructor(private readonly characters: CharacterService) {}

      @Get()
      findMine(@CurrentUser() user: AuthUser) {
        return this.characters.findMine(user.id);
      }
    }
    ```
    Route distincte de `CharactersController` (`@Controller('characters')`, avec un `@Get(':id')` qui capterait `me` comme un UUID invalide si on tentait de la loger dans le même contrôleur) — **ne pas** essayer de fusionner dans `CharactersController`.
  - [x] `apps/api/src/characters/character.module.ts` : ajouter `MyCharactersController` au tableau `controllers`.
  - [x] `apps/api/src/characters/my-characters.controller.spec.ts` : test que la route délègue à `characters.findMine(user.id)` avec l'id de l'utilisateur courant (patron `characters.controller.spec.ts`/`partie-characters.controller.spec.ts` si ce dernier existe, sinon `characters.controller.spec.ts`).

- [x] Task 3 — `MyCharacterDto` (`@master-jdr/shared`) (AC: #1, #3)
  - [x] `packages/shared/src/index.ts` : juste après `CharacterDto` (ligne ~454), ajouter :
    ```ts
    /** Personnage enrichi du nom de sa Partie d'origine — forme de réponse propre à `GET /me/characters`
     *  (D-10), jamais utilisée ailleurs : `CharacterDto` reste inchangé pour tous les autres appelants. */
    export interface MyCharacterDto extends CharacterDto {
      partieName: string;
    }
    ```
    Nouvelle interface, **aucune** modification de `CharacterDto` — contrairement à `PartieDto.role` (29.1), pas de risque de casser les ~15 sites qui consomment déjà `CharacterDto`.

### Frontend — service, écran, route

- [x] Task 4 — `CharacterService.listMine()` (AC: #1)
  - [x] Dans `apps/web/src/app/core/characters/character.service.ts`, ajouter :
    ```ts
    listMine(): Promise<MyCharacterDto[]> {
      return firstValueFrom(
        this.http.get<MyCharacterDto[]>(`${API_BASE}/me/characters`, { withCredentials: true }),
      );
    }
    ```
    Importer `MyCharacterDto` depuis `@master-jdr/shared`. Pas de cache in-flight requis ici (contrairement à `listByPartie`/`get`) — un seul appelant (l'écran de cette story), aucun risque de rafale concurrente comme celui corrigé pour `ScenariosService`/`OpenPollsService`.
  - [x] `apps/web/src/app/core/characters/character.service.spec.ts` : test que `listMine()` appelle `GET {API_BASE}/me/characters`.

- [x] Task 5 — `CharacterSummaryCard` : nom de la Partie d'origine (AC: #3)
  - [x] `apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts` : ajouter `readonly partieName = input<string | null>(null);` — entrée optionnelle, `null` par défaut, **n'affecte aucun des 6 sites d'appel existants** (`partie-detail.html`, `scenario-editor.html`, `scenario-read-dialog.html` — aucun n'a besoin de ce champ, ils restent inchangés).
  - [x] `character-summary-card.html` : sous `character-summary-card__class` (déjà conditionnel), ajouter :
    ```html
    @if (partieName()) {
      <span class="character-summary-card__partie">{{ partieName() }}</span>
    }
    ```
  - [x] `character-summary-card.scss` : classe `&__partie` — même style que `&__owner-badge` (`font-size: 0.75rem`, `color: var(--mat-sys-on-surface-variant, #555)`), sans l'italique (ce n'est pas une identité de personne, cf. AC2 — ne jamais mélanger visuellement Partie et personnage : ce texte reste romain, pas en italique comme `IdentityLabel`).
  - [x] `character-summary-card.spec.ts` : test que `partieName` s'affiche quand fourni, absent quand `null` (comportement par défaut inchangé pour les sites existants).

- [x] Task 6 — Écran `MyCharacters` (AC: #1, #2, #3, #4)
  - [x] Créer `apps/web/src/app/features/characters/my-characters/my-characters.ts` (composant standalone, patron proche de `Dashboard`) :
    - Injecte `CharacterService`, `Router`, `ThemeToneService`.
    - `protected readonly all = signal<MyCharacterDto[]>([]);`
    - `protected readonly query = signal('');`
    - `protected readonly filtered = computed(() => { const q = this.query().trim().toLowerCase(); if (!q) return this.all(); return this.all().filter((c) => characterName(c).toLowerCase().includes(q)); });` — réutilise `characterName()` de `core/characters/character.util.ts` (**la** fonction qui porte la convention d'identité de l'épic 28, AC3 — ne pas réimplémenter un fallback « Personnage sans nom » localement).
    - `ngOnInit()` : `this.all.set(await this.characters.listMine());` — pas de gestion d'erreur réseau spécifique au-delà de ce que fait déjà `Dashboard.loadInvitations()` (laisser la liste vide en cas d'échec, cohérent avec le reste de l'appli à ce stade).
    - `open(c: MyCharacterDto)`: `this.router.navigate(['/parties', c.partieId, 'characters', c.id]);` — route existante (`apps/web/src/app/app.routes.ts` ligne ~45-51), aucune modification requise côté fiche de personnage.
  - [x] `my-characters.html` :
    - `<h1>{{ theme.tone()['my_characters.title'] }}</h1>`
    - Champ de recherche **toujours visible** (`mat-form-field` + `input matInput` lié à `query`, patron `partie-detail.html` ligne ~293-298, sans le bouton « rechercher » — filtrage en direct à chaque frappe, pas sur `Enter`) — délibérément permanent, pas de révélation par icône ni de masquage au défilement (cf. Contexte, réserve d'échelle).
    - Trois états mutuellement exclusifs, jamais superposés (AC2 — aucun mélange Parties/Personnages dans la même liste, cette vue n'affiche **que** des personnages) :
      - `all().length === 0` → `<p class="empty">{{ theme.tone()['my_characters.empty'] }}</p>`
      - `all().length > 0 && filtered().length === 0` → `<p class="empty">{{ theme.tone()['my_characters.no_match'] }}</p>` (recherche sans résultat, distinct du vide global)
      - sinon → `@for (c of filtered(); track c.id) { <app-character-summary-card [character]="c" [partieName]="c.partieName" (selected)="open(c)" /> }`
  - [x] `my-characters.scss` : liste verticale simple (`display:flex; flex-direction:column; gap:0.5rem`), pas de grille de cartes façon `Dashboard` — `CharacterSummaryCard` est déjà un bouton pleine largeur conçu pour l'empilement (cf. son usage dans `roster-rail`/`xp-history`).
  - [x] `apps/web/src/app/features/characters/my-characters/my-characters.spec.ts` : charge la liste au montage, affiche toutes les entrées (AC1), vide → message vide (pas de mélange avec un état « aucune partie »), recherche filtre en direct sans re-frappe de touche spéciale (AC4), le nom du personnage suit `characterName()`/convention épic 28 et le nom de Partie est visible par carte (AC3), clic navigue vers `/parties/:partieId/characters/:id`.

- [x] Task 7 — Route (AC: #1)
  - [x] `apps/web/src/app/app.routes.ts` : ajouter, dans le groupe authentifié (à côté de `account`), un chargement paresseux :
    ```ts
    {
      path: 'characters',
      loadComponent: () =>
        import('./features/characters/my-characters/my-characters').then((m) => m.MyCharacters),
    },
    ```
    Patron `loadComponent` déjà utilisé pour `character-wizard`/`character-sheet` (lignes 38-51) — **pas** de lien de navigation ajouté nulle part dans cette story (aucune entrée `Compte`/menu/barre) : l'écran n'est atteignable que par URL directe jusqu'à 29.3 (cf. Contexte — séquencement documenté par l'épic, pas un oubli).

- [x] Task 8 — Thème : nouvelles clés (AC: #1, #4)
  - [x] `apps/web/src/app/core/theme/tones.ts` : ajouter, dans la section `dashboard.*`-like de chacun des 3 thèmes (à proximité de `dashboard.empty`, mais sous un préfixe propre `my_characters.*` — écran distinct) :
    - `my_characters.title` — thématisé (ex. `grimoire-emeraude`: « Mes personnages », `foret-ancienne`: variante forestière, `atelier-cuivre`: variante steampunk — reprendre le registre déjà établi par `dashboard.title_invitations`/`dashboard.empty` de chaque thème, ne pas laisser un libellé neutre identique dans les 3).
    - `my_characters.empty` — thématisé, sur le modèle de `dashboard.empty`.
    - `my_characters.no_match` — thématisé, distinct de `my_characters.empty` (aucune recherche vs recherche sans résultat).
    - `my_characters.search_label` — thématisé (label du champ de recherche).

### Review Findings

- [x] [Review][Patch] `findMine()` exécute `prisma.partie.findMany` puis `users.findById` séquentiellement au lieu de `Promise.all` — les deux requêtes sont indépendantes, et `resolveOwnerInfo()` (même fichier) utilise déjà `Promise.all` pour un cas analogue. [apps/api/src/characters/character.service.ts] — corrigé : `Promise.all([partie.findMany(...), users.findById(...)])`.
- [x] [Review][Patch] Le `mat-icon` de préfixe du champ de recherche (texte `search`) n'a pas `aria-hidden="true"` — incohérent avec la convention déjà établie dans l'appli (icônes décoratives toujours `aria-hidden`, ex. `dashboard.html` `.role-icon`, `identity-label.html`). [apps/web/src/app/features/characters/my-characters/my-characters.html] — corrigé : `aria-hidden="true"` ajouté.
- [x] [Review][Patch] Test dédié « pas de fuite d'un autre utilisateur » manquant pour `findMine()` — explicitement demandé par la Task 1 de cette story (« … pas de fuite d'un autre utilisateur »). Les tests actuels ne vérifient l'isolation que par proxy (assertion sur le `where` de la requête), pas par un scénario avec des personnages d'un autre `userId` réellement exclus du résultat. [apps/api/src/characters/character.service.spec.ts] — corrigé : nouveau test avec mock filtrant par `userId` (simulation Prisma), personnage d'un autre utilisateur vérifié absent du résultat.
- [x] [Review][Defer] `MyCharacters.ngOnInit()` n'a pas d'indicateur de chargement — le message « aucun personnage » peut s'afficher brièvement avant la résolution de `listMine()`. [apps/web/src/app/features/characters/my-characters/my-characters.ts] — déferré : même limitation préexistante sur `Dashboard` (aucun indicateur de chargement nulle part dans l'appli), pas une régression propre à cette story.
- [x] [Review][Defer] `GET /me/characters` n'a pas de pagination — requête et payload non bornés. [apps/api/src/characters/character.service.ts] — déferré : cohérent avec la réserve d'échelle documentée (0 à 4 parties/personnages actuellement) et avec l'absence de pagination déjà acceptée sur `findByPartie`/`listForUser`.
- [x] [Review][Defer] Aucune région `aria-live` autour de la liste filtrée par la recherche — un changement de résultats de recherche n'est pas annoncé aux lecteurs d'écran. [apps/web/src/app/features/characters/my-characters/my-characters.html] — déferré : gap d'accessibilité réel, mais aucun pattern `aria-live` n'est encore établi ailleurs dans l'appli ; relève d'une initiative a11y plus large, hors périmètre de cette story.
- [x] [Review][Patch] Task 4 (`CharacterService.listMine()`) reste non cochée alors que la méthode est bien livrée dans `apps/web/src/app/core/characters/character.service.ts` et consommée par `MyCharacters` — incohérence documentaire à corriger. [apps/web/src/app/core/characters/character.service.ts] — corrigé : case cochée.

**Revue du 2026-08-08 (bmad-code-review) : reconfirmation.** Les 3 findings `[Review][Patch]` ci-dessus (Promise.all, aria-hidden, test d'isolation cross-utilisateur) ont été revérifiés sur le diff actuel et sont toujours présents, non résolus. 1 nouveau finding ajouté (Task 4). 17 autres signalements (pagination, debounce, gestion d'erreur silencieuse, repli `partieName`/couleur, absence de navigation, SSE) ont été examinés et écartés comme bruit — déjà couverts par les décisions/défers documentés dans cette story.

**Écartés comme bruit (12)** — vérifiés et rejetés, aucune action : `ngOnInit()` avale les erreurs réseau (décision documentée explicitement dans les Dev Notes, même patron que `Dashboard.loadInvitations()`) ; `findMine()` ne réutilise pas `resolveOwnerInfo()` (faux positif — `resolveOwnerInfo()` est conçue pour UN personnage, la réutiliser dans la boucle de `findMine()` introduirait un N+1 que la résolution en lot évite précisément) ; repli `partieName: ''`/`ownerIsMj: false` sur Partie orpheline (patron défensif déjà établi, cf. `findByPartie` « userId sans pseudo résolu ») ; double liaison de `partieName` (`[character]` + `[partieName]`) sur `CharacterSummaryCard` (décision délibérée — le composant type son input `character` en `CharacterDto`, pas `MyCharacterDto`, pour rester utilisable par ses 6 autres sites d'appel) ; couleur de repli `#555` sans variante sombre sur `&__partie` (copie exacte du style déjà en place sur `&__owner-badge`, même fichier) ; absence de debounce sur la recherche (filtrage en mémoire sur 0-4 éléments, aucun appel réseau) ; garde de route absente du diff (héritée du `canActivate: [authGuard]` du parent `Shell`, vérifié) ; absence de vérification null sur `user.id` dans le contrôleur (`CurrentUser()` s'exécute après `AuthenticatedGuard`, même convention que tous les autres contrôleurs `characters/*`) ; absence de câblage SSE (décision documentée explicitement dans la section « Temps réel » des Dev Notes) ; la route de navigation `/parties/:partieId/characters/:id` visée par un test « n'existe pas dans le diff » (faux positif du Blind Hunter, aveugle au reste du projet — cette route préexiste, ajoutée par une story antérieure) ; promesse de `router.navigate()` non gérée en cas de rejet (aucun composant de l'appli ne gère ce cas, `navigate()` ne rejette qu'en cas d'erreur de programmation sur une route statique connue) ; requêtes Prisma non enveloppées dans un `try/catch` explicite (convention universelle du fichier et de l'appli — le filtre d'exception global de NestJS transforme tout rejet en 500, aucune méthode de `character.service.ts` ne fait autrement).

### État actuel du code — relevé exhaustif (ne pas re-découvrir)

**`CharacterService` (API)**, méthodes de lecture existantes (aucune ne couvre le besoin de cette story) :
- `findOne(id, userId)` : un seul personnage, MJ **ou** propriétaire.
- `findByPartie(partieId, userId)` : tous les personnages d'**une** Partie, scopés au viewer (MJ voit tout, joueur seulement le sien).
- `findAllByPartie(partieId)` : usage interne cross-module (`ScenariosService`), sans notion de viewer, toujours scopé à une Partie.
- **Aucune** méthode ne traverse plusieurs Parties pour un même utilisateur — `findMine()` est entièrement nouveau.

**`toDto()`** (fonction privée, non exportée, en bas de `character.service.ts`, ligne ~1587) : signature `toDto(character, ownerPseudo, ownerDisplayName, ownerIsMj, viewerIsMj): CharacterDto`. Appelable directement depuis `findMine()` (même fichier, même classe).

**`CharactersController`** (`@Controller('characters')`) déclare `@Get(':id')` avec `ParseUUIDPipe` — toute route `GET /characters/me` enregistrée dans ce même contrôleur après `:id` échouerait (le pipe UUID rejetterait `'me'` avant d'atteindre la bonne route). C'est pourquoi `GET /me/characters` (chemin **différent**, `/me/characters` et non `/characters/me`) est de toute façon un contrôleur séparé — pas un conflit réel, mais confirme qu'il ne faut pas chercher à le loger dans `CharactersController`.

**`characterName()`** (`apps/web/src/app/core/characters/character.util.ts`) — **LA** fonction qui porte la convention d'identité de l'épic 28 pour l'affichage du nom d'un personnage :
```ts
export function characterName(character: CharacterDto): string {
  const narrative = character.sheetData?.['narrative'] as { name?: string } | undefined;
  return narrative?.name?.trim() || 'Personnage sans nom';
}
```

**`CharacterSummaryCard`** (`apps/web/src/app/features/characters/character-summary-card/`) — bouton pleine largeur déjà conçu pour l'empilement en liste, réutilisé par `roster-rail`, `roster-strip`, `xp-history`, `xp-distribution-panel`, `partie-detail`, `scenario-editor`, `scenario-read-dialog`. Affiche déjà : avatar, `characterName()`, classe (optionnelle), badge propriétaire MJ/`IdentityLabel` joueur (optionnel, gardé par `showOwnerInfo`), badge montée de niveau, 4 `stat-pill` (PV/PE/Initiative/Encombrement). N'affiche **pas** aujourd'hui le nom de la Partie — Task 5 l'étend avec un `input` optionnel.

**`Dashboard`** (`apps/web/src/app/features/dashboard/dashboard.ts`) — patron de référence pour un écran « ma liste à moi » : `signal` peuplé dans `ngOnInit`, `computed` dérivé pour un état vide distinct, injection de `ThemeToneService` pour tous les libellés (jamais de texte en dur dans le template).

**`app.routes.ts`** — groupe authentifié (lignes ~26-70) utilise soit `component:` (chargement eager, ex. `Dashboard`, `Account`), soit `loadComponent:` (paresseux, ex. `character-wizard` ligne 38-43, `character-sheet` ligne 45-51). Aucune route `characters` (top-niveau, hors `/parties/:id/characters/...`) n'existe encore.

### Anti-réinvention — ce qui existe déjà

| Besoin | Existe déjà | À faire |
|---|---|---|
| Convention d'affichage du nom de personnage (AC3) | `characterName()` (`core/characters/character.util.ts`) | Réutiliser tel quel, ne jamais réimplémenter le fallback « Personnage sans nom » |
| Carte de personnage réutilisable en liste | `CharacterSummaryCard` | Étendre d'un `input` optionnel `partieName`, ne pas créer une nouvelle carte |
| Résolution en lot Partie(s)/propriétaire(s) sans N+1 | `findByPartie()` (résolution owners), `PartiesService.resolveParticipants` | Même patron `Map` indexée pour résoudre les noms de Partie dans `findMine()` |
| Patron d'écran « ma liste à moi » (signal + ngOnInit + computed + thème) | `Dashboard` | Reproduire la structure, pas le contenu |
| Chargement paresseux de route | `character-wizard`/`character-sheet` (`loadComponent`) | Même patron pour `my-characters` |

### Ce qui doit continuer de fonctionner

- Les 6 sites d'appel existants de `CharacterSummaryCard` (`partie-detail`, `scenario-editor`, `scenario-read-dialog`, `roster-rail`/`roster-strip` via un autre composant, `xp-history`, `xp-distribution-panel`) — l'ajout de l'input optionnel `partieName` ne doit rien changer à leur rendu (par défaut `null`, condition `@if` déjà utilisée pour `className`/`showOwnerInfo`, même discipline).
- `CharacterDto` et ses ~15 sites d'appel — inchangé, `MyCharacterDto` est une interface séparée.
- `findByPartie`/`findOne`/les autres méthodes de `CharacterService` — non touchées par l'ajout de `findMine()`.

### Hors périmètre (cette story ou stories ultérieures de l'épic 29)

- Entrée de navigation vers `/characters` (menu, barre) — 29.3 (« navigation à quatre destinations »), séquencée après cette story par construction de l'épic.
- Grammaire complète de liste (modes d'affichage, filtres/tris/couches, masquage au défilement, révélation de la recherche par icône sur mobile) — cf. réserve consignée en 29.1/EXPERIENCE.md, non construite non plus pour la liste des parties. Le champ de recherche de cette story est **minimal et toujours visible**, pas la barre de contrôles décrite en §4.2 d'EXPERIENCE.md.
- Signaux d'action / badges d'état sur les personnages (au-delà du badge montée de niveau déjà existant dans `CharacterSummaryCard`) — hors périmètre de FR-16, non mentionné par les ACs de cette story.
- Câblage temps réel (SSE) — cf. section dédiée ci-dessous, décision explicite de ne pas câbler dans cette story.

### Temps réel (checklist `docs/checklist.md`)

**Évalué, décision explicite : pas de câblage SSE dans cette story.** `CharacterService.create()` (et les autres mutations de personnage) émettent sur `partieTopic(partieId)` (canal `partie:{id}`), **jamais** sur `user:{id}` — un abonnement de cet écran au seul canal `user:{id}` (comme `Dashboard`/`MyPartiesService`) ne recevrait donc **aucune** notification de création de personnage. S'abonner à `partie:{id}` pour **chacune** des Parties de l'utilisateur simultanément (potentiellement plusieurs connexions SSE ouvertes en parallèle pour un seul écran) serait disproportionné à l'échelle actuelle (réserve consignée en 29.1 : 0 à 4 parties). Cette vue est donc un **instantané** chargé à chaque navigation (`ngOnInit`), sans rafraîchissement live — cohérent avec l'absence de tout AC exigeant une mise à jour en temps réel ici. À revisiter si un futur endpoint d'agrégation de signaux scopé utilisateur (type `GET /me/party-signals`, AD-3) est étendu aux personnages.

### Project Structure Notes

- **Nouveaux (API)** : `apps/api/src/characters/my-characters.controller.ts`, `apps/api/src/characters/my-characters.controller.spec.ts`.
- **Modifiés (API)** : `apps/api/src/characters/character.service.ts` (+ `findMine()`), `apps/api/src/characters/character.service.spec.ts`, `apps/api/src/characters/character.module.ts` (enregistrement du contrôleur).
- **Modifiés (partagé)** : `packages/shared/src/index.ts` (+ `MyCharacterDto`, nouvelle interface, aucune modification de `CharacterDto`).
- **Nouveaux (web)** : `apps/web/src/app/features/characters/my-characters/my-characters.ts`, `.html`, `.scss`, `.spec.ts`.
- **Modifiés (web)** : `apps/web/src/app/core/characters/character.service.ts` (+ `listMine()`), `.spec.ts` ; `apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts`/`.html`/`.scss`/`.spec.ts` (+ `partieName` optionnel) ; `apps/web/src/app/app.routes.ts` (+ route `characters`) ; `apps/web/src/app/core/theme/tones.ts` (+ 4 clés `my_characters.*` × 3 thèmes).
- **Non touchés** : navigation/menu (aucune entrée ajoutée, cf. Hors périmètre), `CharacterDto`, `findByPartie`/`findOne`, tous les autres sites d'appel de `CharacterSummaryCard`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.2] — Story, Acceptance Criteria (reprises telles quelles)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 29 : Navigation et listes] — Séquencement : « la vue mes personnages précède la barre de navigation »
- [Source: .../architecture/ARCHITECTURE-SPINE.md#AD-4] — `GET /me/characters` dans `CharacterModule` (D-10), restreint aux personnages de l'appelant ; `/me` = convention de routage, pas une frontière de module
- [Source: .../architecture/ARCHITECTURE-SPINE.md#Source tree] — `characters/character.service.ts` (+ `GET /me/characters`), `features/characters/my-characters/` (FR-16)
- [Source: .../architecture/ARCHITECTURE-SPINE.md#Capability → Architecture Map] — FR-16 → `GET /me/characters`, `CharacterModule`, gouverné par AD-4
- [Source: .../architecture/ARCHITECTURE-SPINE.md#Open questions] — Q-8 : endpoint fixé (D-10), présentation de l'écran non fixée — laissée à cette story
- [Source: _bmad-output/planning-artifacts/ux-designs/.../EXPERIENCE.md#2. Information Architecture] — « Personnages : ses propres personnages, toutes parties confondues » ; « la liste des personnages réutilise exactement la grammaire de la liste des parties » ; réserve consignée sur l'échelle (0-4 parties), grammaire complète hors périmètre à ce stade
- [Source: _bmad-output/planning-artifacts/ux-designs/.../EXPERIENCE.md#4.2 Barre de contrôles] — CAP-8 (recherche exigée sur mobile pour la liste des personnages) ; grammaire complète (masquage au défilement, révélation par icône) déclarée `[ASSUMPTION]` non discutée — non construite ici par cohérence avec la réserve 29.1
- [Source: apps/api/src/characters/character.service.ts] — `toDto()`, `findByPartie()`, patron de résolution en lot à réutiliser pour `findMine()`
- [Source: apps/api/src/characters/partie-characters.controller.ts] — Patron exact de contrôleur à reproduire pour `MyCharactersController`
- [Source: apps/api/src/characters/character.module.ts] — Point d'enregistrement du nouveau contrôleur
- [Source: apps/web/src/app/core/characters/character.util.ts] — `characterName()`, convention d'identité épic 28 (AC3)
- [Source: apps/web/src/app/features/characters/character-summary-card/] — Composant à étendre (Task 5), 6 sites d'appel recensés à ne pas régresser
- [Source: apps/web/src/app/features/dashboard/dashboard.ts, dashboard.html] — Patron de référence pour l'écran (Task 6)
- [Source: apps/web/src/app/app.routes.ts] — Patron `loadComponent` (character-wizard/character-sheet) à reproduire pour la route `characters`
- [Source: apps/web/src/app/core/theme/tones.ts] — Convention de nommage des clés par section (`dashboard.*`, `identity.*`, `roster.*`) à reproduire pour `my_characters.*`
- [Source: docs/checklist.md] — Évaluation du câblage temps réel obligatoire à chaque nouvel écran scopé Partie/utilisateur (cf. section dédiée ci-dessus)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Suite Jest API (`docker compose exec api pnpm jest characters`) : 12 suites, 354 tests, tous verts (dont `character.service.spec.ts` `findMine()` × 4 tests, `my-characters.controller.spec.ts` × 1 test).
- `docker compose exec api pnpm typecheck` : `tsc --noEmit` propre.
- Suite Vitest web complète (`docker compose exec web pnpm ng test --watch=false`) : 83 fichiers, 1122 tests, tous verts (dont `my-characters.spec.ts` × 7 tests, `character.service.spec.ts` `listMine()`, `character-summary-card.spec.ts` `partieName` × 2 tests).
- `docker compose exec web pnpm build` : échoue sur `bundle initial exceeded maximum budget` (1.23 MB vs. budget 1 MB, `angular.json`) — confirmé **préexistant** : `angular.json` non modifié par cette story, `MyCharacters` est chargé en lazy (`loadComponent`, chunk séparé de 2.58 kB, hors bundle initial), et les seuls ajouts au chemin eager (`character.service.ts` +8 lignes, `character-summary-card.ts` +1 input, `tones.ts` +16 chaînes, `MyCharacterDto` type-only donc effacé au runtime) ne peuvent expliquer un dépassement de 230 kB. Hors périmètre de cette story (pas un AC, pas un fichier listé dans les Tasks).
- Lint ciblé sur les fichiers touchés (`eslint` direct, pas le script `lint` global qui porte ~1749 problèmes préexistants sans rapport) : `my-characters.controller.ts` et le code ajouté dans `character.service.ts`/`character.service.ts` (web) sans nouvelle erreur ; 1 erreur `prettier/prettier` préexistante dans `character.service.ts` (web), sur `updateContenant()` — méthode non touchée par cette story.

### Completion Notes List

- Toutes les tâches (1-8) complétées, tous les ACs (#1-#4) satisfaits.
- `GET /me/characters` livré via un contrôleur dédié `MyCharactersController` (`/me/characters`), séparé de `CharactersController` (conflit de route avec `@Get(':id')`/`ParseUUIDPipe`) et de `PartieCharactersController` (scopé à une seule Partie).
- `CharacterService.findMine()` : résolution en lot des Parties d'origine (`partie.findMany` avec `id: { in: [...] }`), une seule résolution `users.findById` (l'appelant est propriétaire de tous les personnages retournés), `isMj`/`viewerIsMj` recalculés par Partie (jamais un booléen global) — testé explicitement pour le cas mixte MJ+joueur dans un même appel.
- `MyCharacterDto` ajouté comme interface **séparée** de `CharacterDto` (n'étend pas ses champs in-place) — zéro risque de régression sur les ~15 sites existants qui consomment `CharacterDto`.
- `CharacterSummaryCard` étendu d'un input optionnel `partieName` (défaut `null`) plutôt que de créer un nouveau composant — les 6 sites d'appel existants (`partie-detail`, `scenario-editor`, `scenario-read-dialog`, `roster-rail`/`roster-strip`, `xp-history`, `xp-distribution-panel`) restent inchangés (vérifié : aucun ne passe `partieName`, comportement par défaut identique à avant cette story).
- Écran `MyCharacters` : recherche toujours visible (pas de grammaire complète de liste — modes d'affichage/filtres/masquage au défilement — cohérent avec la réserve d'échelle consignée en story 29.1), trois états mutuellement exclusifs (vide global / vide de recherche / liste), route `characters` ajoutée en `loadComponent` mais **sans aucune entrée de navigation** (menu/barre) — l'écran n'est atteignable que par URL directe jusqu'à la story 29.3, conformément au séquencement documenté par l'épic 29.
- Décision documentée (pas de câblage SSE) : les mutations de personnage émettent sur `partieTopic(partieId)`, jamais sur `user:{id}` — un abonnement `user:{id}` seul ne recevrait aucune notification de création de personnage, et s'abonner à `partie:{id}` pour chaque Partie de l'utilisateur simultanément serait disproportionné à l'échelle actuelle. Écran en instantané (rechargé à chaque navigation), aucun AC n'exige de mise à jour live.
- Aucune migration Prisma requise (aucun changement de schéma).

### File List

**Nouveaux (API)**
- `apps/api/src/characters/my-characters.controller.ts`
- `apps/api/src/characters/my-characters.controller.spec.ts`

**Modifiés (API)**
- `apps/api/src/characters/character.service.ts` (+ `findMine()`)
- `apps/api/src/characters/character.service.spec.ts` (+ tests `findMine()`, + mock `partie.findMany`)
- `apps/api/src/characters/character.module.ts` (enregistrement de `MyCharactersController`)

**Modifiés (partagé)**
- `packages/shared/src/index.ts` (+ `MyCharacterDto`)

**Nouveaux (web)**
- `apps/web/src/app/features/characters/my-characters/my-characters.ts`
- `apps/web/src/app/features/characters/my-characters/my-characters.html`
- `apps/web/src/app/features/characters/my-characters/my-characters.scss`
- `apps/web/src/app/features/characters/my-characters/my-characters.spec.ts`

**Modifiés (web)**
- `apps/web/src/app/core/characters/character.service.ts` (+ `listMine()`)
- `apps/web/src/app/core/characters/character.service.spec.ts` (+ test `listMine()`)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts` (+ input `partieName`)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.html` (+ rendu conditionnel `partieName`)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.scss` (+ classe `&__partie`)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.spec.ts` (+ 2 tests `partieName`)
- `apps/web/src/app/app.routes.ts` (+ route `characters`, lazy)
- `apps/web/src/app/core/theme/tones.ts` (+ 4 clés `my_characters.*` × 3 thèmes)
