---
story: 4.3
title: "Consulter la fiche de personnage"
epic: 4
key: 4-3-consulter-fiche-personnage
status: done
baseline_commit: "f12adf2"
---

# Story 4.3 : Consulter la fiche de personnage

Status: done

## Story

As a player or GM,
I want to view a Ryuutama character sheet within the party,
so that I can reference it during and between sessions.

## Acceptance Criteria

**AC1 — Liste des personnages de l'onglet**

Given une partie utilisant Ryuutama
When un membre ouvre l'onglet "Personnages" de la page détail de partie
Then la liste des personnages visibles s'affiche (une `CharacterSummaryCard` par personnage : avatar, nom, classe, badges PV/PE/Initiative/Encombrement) — le MJ voit tous les personnages de tous les joueurs, un joueur ne voit que les siens (déjà filtré côté backend par `GET /parties/:id/characters`, Story 4.1)
And si l'utilisateur courant n'a pas encore créé son personnage sur cette partie, une carte CTA "Créer un personnage" s'affiche en complément de la liste (pas à sa place si d'autres personnages existent déjà)

**AC2 — Fiche en lecture seule**

Given un personnage créé
When son propriétaire ou le MJ de la partie clique sur sa `CharacterSummaryCard`
Then la fiche en lecture seule s'affiche
And sur desktop/tablette (≥768px), la disposition est 2 colonnes fidèle à la feuille papier officielle : colonne gauche = Identité/Vocation/Voie/Attributs, colonne droite = Statistiques dérivées/Arme de prédilection/Équipement/Notes narratives (cf. Dev Notes §Layout)
And sur mobile (<768px), les mêmes informations sont réorganisées en sections empilables/accordéon — pas un décalque littéral du papier

**AC3 — Accès MJ**

Given le MJ d'une partie
When il consulte la fiche d'un personnage appartenant à un de ses joueurs
Then il y accède en lecture seule, sans aucune action d'édition disponible (FR39/FR-4.3 — pas d'édition ce palier)

**AC4 — Accès refusé**

Given un utilisateur qui n'est ni membre de la partie ni propriétaire du personnage
When il tente d'accéder à une fiche (URL directe ou autrement)
Then l'accès est refusé — `GET /characters/:id` répond 403 (Story 4.1, déjà implémenté), le frontend affiche un message explicite plutôt qu'un écran blanc ou une erreur JS

**Hors scope confirmé (ne pas implémenter)** : édition de la fiche après création, export PDF (Story 4.4), upload/affichage de portrait réel (Story 4.5 — l'avatar affiche toujours les initiales ce palier), rôle de groupe (différé, aucun champ à prévoir maintenant).

## Tasks

- [x] Task 1 — `CharacterService.get(id)` frontend (`GET /characters/:id`)
- [x] Task 2 — Composant `CharacterAvatar` (initiales, tailles 44px/64px)
- [x] Task 3 — Composant `CharacterSummaryCard`
- [x] Task 4 — Intégration liste dans l'onglet Personnages de `partie-detail`
- [x] Task 5 — Composant `CharacterSheet` — layout desktop/tablette (2 colonnes)
- [x] Task 6 — Layout mobile accordéon/empilable pour `CharacterSheet`
- [x] Task 7 — Résolution du contenu (classe/type/arme) via `GameSystemContent` pour l'affichage des labels/talents/avantages/formules
- [x] Task 8 — Route + gestion du 403 (accès refusé)
- [x] Task 9 — Tests (composants, service, intégration)

### Review Findings

- [x] [Review][Patch] `specialtyTypeId` (Artisan) capturé au wizard mais jamais affiché sur la fiche lecture seule — donnée joueur réelle qui devient invisible une fois la fiche consultée [character-sheet.html/.ts] — corrigé : affiché dans la carte Vocation via un `computed specialtyTypeId`, testé
- [x] [Review][Patch] `characterId` absent du paramMap route → reste bloqué sur "Chargement…" sans retour d'erreur [character-sheet.ts:ngOnInit] — corrigé : `loadError.set('Fiche introuvable.')`, testé
- [x] [Review][Patch] `Promise.all` échoue en bloc : si `getGameSystemContent` échoue, le personnage (pourtant chargé avec succès) ne s'affiche pas non plus [character-sheet.ts:ngOnInit] — corrigé : chargement du personnage et du contenu séquencés séparément, l'échec du contenu n'empêche plus l'affichage de la fiche, testé
- [x] [Review][Patch] Listes `equipment.individual`/`.group` non protégées avant `@for` — un cast de type contourne la validation runtime, risque de plantage si la donnée est malformée [character-sheet.html:96-102] — corrigé : `?? []` sur les deux listes
- [x] [Review][Patch] Pattern de résolution "trouver l'entrée de contenu par clé" dupliqué 3 fois (`classLabel()` dans partie-detail.ts, `classData`/`typeData`/`weaponData` dans character-sheet.ts) au lieu d'être extrait dans `character.util.ts`, pourtant introduit dans ce même diff pour `characterName()` — corrigé : `findContentEntry()` extrait dans `character.util.ts`, réutilisé dans les deux fichiers, testé
- [x] [Review][Defer] `RYUUTAMA_ID` codé en dur plutôt que `character.gameSystemId` — pattern déjà présent dans `character-wizard.ts`/`partie-detail.ts`, conforme à l'intention des Dev Notes pour ce palier mono-système — deferred, pre-existing
- [x] [Review][Defer] Pas de nettoyage `OnDestroy`/`takeUntilDestroyed` sur les requêtes HTTP en vol — convention constante dans tout le repo, déjà trackée comme dette technique ailleurs (Story 1-8) — deferred, pre-existing
- [x] [Review][Defer] Seul le 403 est géré spécifiquement ; 401/404/erreur réseau tombent dans un message générique — la gestion de session/auth est hors du périmètre de cette story — deferred, pre-existing
- [x] [Review][Defer] Réutilisation de route Angular : naviguer directement d'une fiche de personnage à une autre (même config de route) pourrait réutiliser l'instance du composant et laisser une donnée périmée — aucun parcours UI actuel ne déclenche ce cas — deferred, pre-existing

---

## Dev Notes

### Contexte hérité des Stories 4.1 (backend, `done`) et 4.2 (wizard, `done`)

**Aucun nouvel endpoint backend n'est nécessaire.** Tout existe déjà :
- `GET /characters/:id` → `CharacterDto` complet avec `derived` peuplé. Vérifie que l'appelant est le propriétaire OU le MJ de la partie associée, sinon 403 (`apps/api/src/characters/character.service.ts#findOne`).
- `GET /parties/:id/characters` → si MJ, tous les personnages de la partie ; sinon, uniquement ceux de l'appelant (`apps/api/src/characters/character.service.ts#findByPartie`). C'est exactement le filtrage requis par AC1 — **le frontend n'a rien à refiltrer côté serveur**, juste à afficher `characters()` tel quel (déjà chargé dans `partie-detail.ts` depuis la Story 4.2).
- `GET /game-systems/:id/content` → contenu seedé groupé par `ContentType.key` (`class`, `type`, `attributePattern`, `weaponCategory`), chacun `{key, data}[]`. Déjà consommé par le wizard (`CharacterWizard`) pour résoudre les labels/talents/avantages/formules — **réutiliser exactement le même pattern** pour la fiche (Task 7).

`CharacterService` (`apps/web/src/app/core/characters/character.service.ts`) a déjà `getGameSystemContent()`, `listByPartie()`, `create()` — il manque uniquement `get(id)` (Task 1).

`RyuutamaSheetData` (importé en `import type` de `@master-jdr/game-rules`) :
```typescript
interface RyuutamaSheetData {
  classId: string;
  specialtyTypeId?: string;
  typeId: string;
  attributes: { AGI: number; ESP: number; INT: number; VIG: number };
  weaponCategoryId: string;
  fetiqueObject?: string;
  equipment?: { individual: string[]; group: string[] };
  narrative?: {
    sex?: string; age?: string; physicalTraits?: string;
    homeTown?: string; motivation?: string; name?: string; personality?: string;
  };
}
```
`CharacterDto.derived` (de `@master-jdr/shared`) : `{ PV, PE, Condition, Initiative, Encombrement }`.

**`partie-detail.ts` actuel** (Story 4.2) a déjà : `characters` (signal, tous les personnages visibles), `myCharacters` (computed, filtré sur l'utilisateur courant), `characterName(character)` (extrait `sheetData.narrative.name`), et un bouton **désactivé** dans le template avec un commentaire explicite disant que la Story 4.3 doit le remplacer — **c'est exactement ce que fait cette story** (Task 4).

### Correction d'une inexactitude de la doc UX

`DESIGN.md` affirme qu'un avatar générique à initiales existe déjà "dans le menu utilisateur" — **vérifié faux** : `shell.html` n'a qu'une icône Material `account_circle` + le pseudo en texte brut, aucun avatar circulaire à initiales n'existe dans le repo. Le composant `CharacterAvatar` (Task 2) doit donc être construit **from scratch**, pas réutilisé.

### Task 1 — `CharacterService.get(id)`

Ajouter dans `apps/web/src/app/core/characters/character.service.ts` (suivre le pattern exact des méthodes existantes) :
```typescript
get(id: string): Promise<CharacterDto> {
  return firstValueFrom(
    this.http.get<CharacterDto>(`${API_BASE}/characters/${id}`, { withCredentials: true }),
  );
}
```
Sur 403, `HttpClient` rejette avec un `HttpErrorResponse` (`status: 403`) — géré au niveau du composant consommateur (Task 8), pas ici.

### Task 2 — `CharacterAvatar`

Nouveau composant sous `apps/web/src/app/features/characters/character-avatar/character-avatar.ts` (ou un emplacement partagé si tu préfères le rendre accessible à d'autres features — mais aucun autre consommateur n'existe ce palier, garder sous `features/characters/`).

```typescript
export interface CharacterAvatarSize { readonly px: 44 | 64; }

@Component({ selector: 'app-character-avatar', standalone: true, ... })
export class CharacterAvatar {
  readonly name = input.required<string>(); // pour dériver les initiales
  readonly size = input<44 | 64>(44);
  // Pas de portrait réel ce palier (Story 4.5) — toujours l'état initiales.

  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  });
}
```
`aria-label="Portrait de [nom] (aucune image)"` sur l'élément racine (jamais un état "cassé"/erreur, cf. DESIGN.md + UX-DR21). CSS : cercle (`border-radius: 50%`), taille en `width`/`height` liée à `size()`, fond `var(--mat-sys-surface-container, ...)`, texte centré `var(--mat-sys-on-surface, ...)`.

### Task 3 — `CharacterSummaryCard`

`apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts`. Reçoit un `CharacterDto` + le contenu résolu (pour le label de classe) en `input()`, émet un `output()` au clic (le conteneur gère la navigation). Affiche : `CharacterAvatar` (44px) + nom (`sheetData.narrative?.name`, repli "Personnage sans nom" — réutiliser la même logique que `characterName()` de `partie-detail.ts`, ne pas la dupliquer : envisager de la déplacer dans un fichier utilitaire partagé, ex. `character.util.ts`, importé des deux côtés) + label de classe résolu + badges `PV`/`PE`/`Initiative`/`Encombrement max` (réutiliser le style `.stat-pill` déjà présent dans `character-wizard.scss` — en extraire la classe dans un fichier partagé si dupliqué, ou dupliquer si trivial, à ton jugement).

### Task 4 — Intégration dans l'onglet Personnages

Dans `partie-detail.html`, remplacer le bouton désactivé actuel (section `characters-tab`) :
```html
<section class="characters-tab">
  <div class="characters-tab__grid">
    @for (character of characters(); track character.id) {
      <app-character-summary-card
        [character]="character"
        [className]="classLabel(character)"
        (selected)="router.navigate(['/parties', p.id, 'characters', character.id])"
      />
    }
    @if (myCharacters().length === 0) {
      <a mat-flat-button color="primary" class="characters-tab__cta"
         [routerLink]="['/parties', p.id, 'characters', 'new']">
        {{ theme.tone()['character.create_cta'] }}
      </a>
    }
  </div>
</section>
```
`partie-detail.ts` doit charger le contenu (`getGameSystemContent('ryuutama')`) au `ngOnInit` pour résoudre le label de classe de chaque `CharacterSummaryCard` (même pattern que `CharacterWizard`). Ajouter une méthode `classLabel(character)` qui cherche dans le contenu chargé l'entrée `class` dont la clé égale `character.sheetData.classId`.

**Ne PAS retirer `myCharacters()`** — toujours utile pour décider d'afficher la carte CTA.

### Task 5 — `CharacterSheet` (layout desktop/tablette)

Nouveau composant routé (comme `CharacterWizard`) sous `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`, chargé en lazy (`loadComponent`, cf. Task 8) — le bundle initial est déjà proche de son budget strict (cf. Story 4.2 Dev Agent Record : le wizard a dû être lazy-loadé pour ne pas dépasser 1 Mo).

**Ordre exact des sections** (issu du mock `key-fiche-desktop.html`, colonne gauche puis droite) :
1. Colonne gauche : Portrait (toujours l'état initiales, Task 2, taille 64px) → Vocation (nom de classe + ses 3 talents résolus via le contenu) → Voie (nom de type + ses 3 avantages résolus) → Attributs (VIG/AGI/INT/ESP en grille 4 colonnes)
2. Colonne droite : Statistiques dérivées (5 pills PV/PE/Condition/Initiative/Encombrement) → Arme de prédilection (label résolu + `Toucher {touchFormula}` + `Dégâts {damageFormula}`) → Équipement (les 2 listes fixes + l'objet fétiche si renseigné) → Notes narratives (tous les champs narratifs restants : sexe, âge, particularités physiques, village natal, motivation, personnalité — le nom est déjà affiché en en-tête, ne pas le répéter)

**Décision de conception (à appliquer, ne pas répliquer le mock littéralement)** : le mock `key-fiche-desktop.html` affiche `village natal`/`motivation` **deux fois** (une fois dans une carte "Identité" séparée, une fois dans "Notes narratives") — c'est un artefact de la maquette, il n'existe qu'un seul jeu de données narratives dans `RyuutamaSheetData.narrative`. **Ne crée pas de carte "Identité" séparée** — regroupe tous les champs narratifs restants (hors nom) dans la seule carte "Notes narratives", chacun affiché seulement s'il est renseigné (tous optionnels).

**En-tête de fiche** : `CharacterAvatar` (64px) + nom + `"{classLabel} · {typeLabel} · Niveau 1 · Ryuutama"` (niveau toujours 1 ce palier, aucune évolution de personnage implémentée). Pas de bouton "Modifier le portrait" ni "Exporter en PDF" ce palier (Stories 4.5 et 4.4 respectivement) — **ne pas les ajouter, même désactivés**, pour ne pas laisser un affordance qui suggère une fonctionnalité non livrée sans raison (contrairement au bouton désactivé de l'onglet Personnages en Story 4.2, qui avait un besoin utilisateur explicite de prévisualiser l'intégration).

**Pattern d'attributs affiché** : chercher dans le contenu `attributePattern` l'entrée dont les `values` (triées) correspondent aux valeurs assignées (triées) du personnage, pour afficher son `label` (ex. "Attributs — patron Polyvalent"). Si aucune correspondance (ne devrait pas arriver ce palier, un seul pattern existe), replier sur "Attributs" sans suffixe.

### Task 6 — Layout mobile (<768px)

**Aucun mock visuel n'existe pour cette vue** (confirmé : `EXPERIENCE.md` la documente "spine-only", aucun fichier `key-fiche-mobile.html` dans `mockups/`). Directive textuelle uniquement : "mêmes informations réorganisées en sections empilables/accordéon (pas un décalque littéral du papier)". Implémentation recommandée : réutiliser les mêmes cartes de section (Task 5) mais en **une seule colonne empilée** plutôt qu'une grille 2 colonnes — un composant Angular Material `MatExpansionModule` (accordéon) est une option raisonnable pour réduire le défilement sur petit écran, mais une simple pile de cartes (sans accordéon, tout visible) satisfait aussi la lettre de l'AC2 ("sections empilables/**ou** accordéon"). **Choix laissé à l'implémentation** — privilégier la simplicité (pile de cartes, pas d'accordéon) sauf si le rendu est trop long à l'usage, cf. NFR-3 (mobile-first pour la consultation).

Breakpoint : **768px** ici (pas 1024px comme le wizard — vérifié dans `EXPERIENCE.md` §9, le seuil du wizard à 1024px est spécifique au panneau résumé plus large, la fiche suit le seuil tablette générique de l'app).

### Task 7 — Résolution du contenu

Dans `CharacterSheet` (et `partie-detail.ts` pour les `CharacterSummaryCard`), charger `characterSvc.getGameSystemContent('ryuutama')` et résoudre :
- `classId` → `content['class'].find(c => c.key === classId)` → `data.label`, `data.talents` (tableau `{name, effect}[]`)
- `typeId` → `content['type'].find(...)` → `data.label`, `data.advantages` (`{name, effect}[]`)
- `weaponCategoryId` → `content['weaponCategory'].find(...)` → `data.label`, `data.touchFormula`, `data.damageFormula`

**Ne pas coder ces labels en dur** — même principe que le wizard (AC1 de la Story 4.2, corrigé en revue de code : le contenu doit toujours venir de `GameSystemContent`, jamais d'une liste locale).

### Task 8 — Route et gestion du 403

Route lazy (`app.routes.ts`, suivre le pattern exact de la route du wizard ajoutée en Story 4.2) :
```typescript
{
  path: 'parties/:id/characters/:characterId',
  loadComponent: () =>
    import('./features/characters/character-sheet/character-sheet').then((m) => m.CharacterSheet),
},
```
Dans `CharacterSheet.ngOnInit()`, résoudre `characterId` depuis `ActivatedRoute.snapshot.paramMap` (même pattern que `CharacterWizard`/`PartieDetail` — **ne pas utiliser `input()` signal-based route binding**, incohérent avec le reste du repo). Appeler `characterSvc.get(characterId)` ; sur erreur `HttpErrorResponse` avec `status === 403`, afficher un message explicite ("Vous n'avez pas accès à cette fiche.") au lieu de laisser planter le composant ou afficher un écran vide — **le même genre de garde que celle ajoutée à `CharacterWizard.ngOnInit()` en revue de code Story 4.2** (signal `loadError`, `@if`/`@else` dans le template).

### Task 9 — Tests

Pattern : `TestBed` direct + `vitest`, fakes via factories (cf. `character-wizard.spec.ts`, `partie-detail.spec.ts`).

- `character.service.spec.ts` : ajouter un test pour `get(id)` → `GET /characters/:id`.
- `character-avatar.spec.ts` : dérivation des initiales (1 mot, 2 mots, nom vide → `'?'`), `aria-label` correct.
- `character-summary-card.spec.ts` : affichage nom/classe/badges, émission au clic.
- `character-sheet.spec.ts` : chargement réussi → sections affichées avec labels résolus (pas les clés brutes) ; 403 → message d'erreur affiché, pas de plantage ; layout desktop vs mobile (vérifier la classe/media query appliquée, pas la disposition visuelle réelle — impossible à tester en DOM jsdom).
- `partie-detail.spec.ts` : ajouter un test vérifiant que la liste affiche une `CharacterSummaryCard` par personnage visible ET la carte CTA quand `myCharacters()` est vide, même si d'autres personnages existent déjà sur la partie (cas MJ ou partie à plusieurs joueurs).

## Patterns existants à suivre absolument

| Pattern | Où | À ne pas réinventer |
|---|---|---|
| Route routée avec résolution manuelle de `:id`/`:characterId` via `ActivatedRoute.snapshot` | `character-wizard.ts`, `partie-detail.ts` | Pas de signal-based route input binding |
| Lazy route (`loadComponent`) | `app.routes.ts` (route du wizard, Story 4.2) | Nécessaire pour rester sous le budget de bundle |
| `signal(...)` pour l'état de chargement + `loadError` + gabarit `@if/@else if/@else` | `character-wizard.ts`/`.html` | Gestion d'erreur réseau cohérente |
| Résolution de contenu via `GameSystemContent` (pas de labels codés en dur) | `character-wizard.ts` (`classes()`, `types()`, `weapons()` computed) | AC1 Story 4.2, corrigé en revue |
| `protected readonly theme = inject(ThemeToneService)` | tous les composants existants | — |
| `import type` pour `@master-jdr/shared` et `@master-jdr/game-rules` | tous les fichiers existants | — |
| Tests : `TestBed` direct + `vitest`, pas de Testing Library | tous les `.spec.ts` du repo | — |

## Notes de contexte épique

Cette story construit la vue de consultation sur l'API et le wizard déjà livrés (Stories 4.1/4.2, `done`). Les Stories 4.4 (export PDF) et 4.5 (portrait) ajouteront des actions sur cette même fiche de façon additive — ne pas prévoir d'emplacement pour leurs boutons maintenant (cf. Task 5, décision explicite de ne pas ajouter d'affordances désactivées pour ces fonctionnalités).

**Mobile-first (NFR-3)** : contrairement à la création (peut tolérer une UX plus dense), la consultation en séance se fait principalement sur mobile — soigner particulièrement la lisibilité de `CharacterSheet` sur petit écran (Task 6).

---

## Dev Agent Record

### Implementation Plan

Tasks 1 à 4 (service `get()`, `CharacterAvatar`, `CharacterSummaryCard`, intégration onglet Personnages) étaient déjà implémentées et testées au moment de la reprise de cette session — vérifiées puis conservées telles quelles (aucune régression, patterns conformes aux Dev Notes).

Tasks 5 à 9 complétées cette session :
- `CharacterSheet` avait déjà sa logique (`character-sheet.ts`) écrite lors d'une session précédente (résolution de contenu, signaux, gestion 403) mais sans template/styles ni route ni tests. Ajout du template (`character-sheet.html`) suivant l'ordre exact des sections du mock `key-fiche-desktop.html`, en fusionnant la carte "Identité" du mock dans "Notes narratives" (décision explicite des Dev Notes, pas un artefact à répliquer).
- Layout mobile : une seule feuille de styles avec `flex-direction: column` par défaut (mobile-first) et bascule en 2 colonnes via `@media (min-width: 768px)` — pas d'accordéon (choix "pile de cartes" recommandé par les Dev Notes pour la simplicité).
- Route lazy ajoutée dans `app.routes.ts` après la route `.../characters/new` (préserve la priorité du segment littéral `new` sur le paramètre `:characterId`).
- `CharacterWizard.onSubmit()` mis à jour pour rediriger vers la fiche du personnage créé (`/parties/:id/characters/:characterId`) au lieu de l'onglet Personnages — le commentaire TODO explicite laissé par la Story 4.2 signalait ce remplacement une fois cette story livrée ; test de succès mis à jour en conséquence.
- Tests ajoutés : `character-sheet.spec.ts` (chargement + labels résolus, notes narratives conditionnelles, 403, erreur réseau générique) et un test DOM dans `partie-detail.spec.ts` vérifiant la coexistence carte CTA + `CharacterSummaryCard` quand un autre joueur a déjà un personnage.

### Debug Log

Le test DOM `partie-detail.spec.ts` (onglet Personnages, clic + assertion sur le contenu rendu) échouait car `MatTabGroup` anime le changement d'onglet via l'API Web Animations, non fiable/complète en jsdom : le corps du nouvel onglet ne s'attachait jamais au DOM même après plusieurs ticks de microtasks. Résolu en ajoutant une option `noopAnimations` à l'aide `createFixture()` du spec, utilisée uniquement par ce test (`provideNoopAnimations()` au lieu de `provideAnimationsAsync()`), qui rend le changement d'onglet synchrone.

### Completion Notes

- AC1–AC4 satisfaits : liste filtrée déjà backend (Story 4.1), fiche 2 colonnes desktop/tablette ≥768px et pile mobile <768px, MJ en lecture seule (aucune action d'édition dans le composant), 403 affiché explicitement sans plantage.
- Aucun nouvel endpoint backend requis, conformément aux Dev Notes.
- `pnpm lint --fix` et `pnpm test` (35 fichiers de test, 192 tests) passent intégralement dans le conteneur `web`.

### Code Review (2026-07-04)

Revue adversariale à 3 couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) exécutée sur le diff complet vs `f12adf2`. 5 patches appliqués, 4 items déférés (pre-existing, hors scope), 10 findings écartés comme bruit (dont un faux positif sur `attributePatternLabel` — le matching par valeurs triées est l'algorithme explicitement spécifié par les Dev Notes, pas un bug).

Patches appliqués :
- `specialtyTypeId` (classe Artisan) désormais affiché dans la carte Vocation de `CharacterSheet`
- `characterId` absent du paramMap → message d'erreur explicite au lieu d'un chargement infini
- Chargement du personnage et du contenu de jeu découplés : un échec de `getGameSystemContent` n'empêche plus l'affichage de la fiche (seuls les labels résolus restent vides)
- Listes `equipment.individual`/`.group` protégées par `?? []` avant `@for`
- Pattern de résolution "contenu par clé" extrait dans `findContentEntry()` (`character.util.ts`), réutilisé par `character-sheet.ts` et `partie-detail.ts`

Après application : `pnpm lint --fix` et `pnpm test` (35 fichiers, 199 tests) passent intégralement.

## File List

- `apps/web/src/app/core/characters/character.service.ts` (modifié — `get(id)`)
- `apps/web/src/app/core/characters/character.service.spec.ts` (modifié)
- `apps/web/src/app/core/characters/character.util.ts` (modifié — `characterName()` + `findContentEntry()` ajouté en revue de code)
- `apps/web/src/app/core/characters/character.util.spec.ts` (modifié — tests `findContentEntry()` ajoutés en revue de code)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.ts` (nouveau)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.html` (nouveau)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.scss` (nouveau)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.spec.ts` (nouveau)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts` (nouveau)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.html` (nouveau)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.scss` (nouveau)
- `apps/web/src/app/features/characters/character-summary-card/character-summary-card.spec.ts` (nouveau)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (complété cette session)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (nouveau)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.scss` (nouveau)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (nouveau)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — intégration onglet Personnages)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.scss` (modifié)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (modifié — redirection post-création vers la fiche)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts` (modifié)
- `apps/web/src/app/app.routes.ts` (modifié — route `parties/:id/characters/:characterId`)
- `apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.ts` (reformaté par `lint --fix`, aucun changement fonctionnel)
- `apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.spec.ts` (reformaté par `lint --fix`)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts` (reformaté par `lint --fix`)
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.spec.ts` (reformaté par `lint --fix`)

## Change Log

- 2026-07-04 : Implémentation complète de la Story 4.3 (Tasks 5 à 9) — layout `CharacterSheet` desktop/mobile, résolution du contenu, route + gestion 403, tests. Tasks 1 à 4 vérifiées comme déjà faites lors d'une session précédente.
