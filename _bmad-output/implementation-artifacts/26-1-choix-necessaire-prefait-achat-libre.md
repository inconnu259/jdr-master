---
baseline_commit: 7e2601fccaa9bef0ad4ba9d371f3928684a7b362
---

# Story 26.1: Choix entre nécessaire pré-fait et achat libre

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want choisir entre le nécessaire de voyage pré-fait et un achat libre avec un budget de 1000 Po,
so that je puisse personnaliser mon équipement de départ au lieu de recevoir automatiquement une liste figée.

## Contexte

Aujourd'hui, `EquipmentStep` n'offre aucun choix : `FIXED_EQUIPMENT` (constantes codées en dur dans `equipment-step.ts`) est auto-assigné dès l'initialisation du wizard (`character-wizard.ts`, signal `sheetData`), avec un `weight: 0` arbitraire pour chaque objet (ni vrai poids, ni vrai prix, juste des noms en texte libre). Cette story remplace ce mode « pique-nique » par un vrai choix, adossé à du contenu réel transcrit de `docs/equipement.md` (pages 24-33 du *Guide du Voyageur*).

**Décisions de conception actées avec l'utilisateur avant `create-story`** (plusieurs itérations, aucune question ouverte restante) :

1. **Transcription complète de `docs/equipement.md` en JSON** — toutes les tables du livre (armes déjà couvertes par `weapon-categories.json`/`weapon-items.json`, Story 25.1). Un seul fichier `equipment-items.json` regroupe Matériel (Nourriture/Objets du quotidien/Campement), Contenants, Vêtements et le tableau des Animaux — tout est **wiré** en `ContentType` `equipmentItem` et proposé à l'achat (voir Task 1, « plus simple d'en charger plus »). Les tables restantes (Armures, Boucliers, Herbes de soins, Spécificités objets/animaux, Services — repas/gîte/services divers/spécialités des villes) sont **transcrites en JSON mais NON wirées** cette story (pas de `ContentType` enregistré, pas de consommateur) — matière première pour de futures stories, hors scope fonctionnel ici (aucune mécanique de protection/armure n'existe dans `RyuutamaSheetData`, les services sont consommés instantanément et ne sont pas de l'équipement transportable).
2. **Représentation des quantités** : le modèle `InventoryItem` n'a pas de champ quantité — acheter 2 rations = 2 entrées distinctes dans `equipment.individual` (jamais un hack texte du type « Rations x2 »).
3. **Nécessaires pré-faits dérivés du catalogue** : `FIXED_EQUIPMENT` (poids à 0, noms en texte libre) est entièrement retiré. Les 2 nécessaires (Nécessaire de voyage 150 Po, Nécessaire d'intendance 800 Po annoncé — mais 795 Po en sommant ses composants réels, écart du livre lui-même, ne pas « corriger ») deviennent un nouveau `ContentType` `equipmentPackage`, résolu côté client en une liste `{ key, quantity }[]` qui rejoint exactement le même pipeline de résolution que l'achat libre.
4. **Pipeline unique** : qu'il choisisse le nécessaire pré-fait ou compose son propre panier, le joueur envoie toujours `RyuutamaSheetData.startingEquipment: { key: string; quantity: number }[]` (clés du catalogue `equipmentItem`) — jamais de `equipment.individual/contenants/animaux` pré-rempli côté client. `CharacterService.create()` résout cette sélection via une nouvelle fonction pure `packages/game-rules` (`resolveStartingEquipment()`), vérifie le budget (≤ 1000 Po, **toujours** respecté par le nécessaire pré-fait vu son coût réel de 795 Po — aucun cas particulier de code nécessaire), génère les `id`/`addedBy: 'player'` serveur, et écrit le résultat dans `sheetData.equipment.individual/contenants/animaux` avant `validate()`/`computeDerived()`/persistance — `startingEquipment` n'est **jamais persisté** (champ transitoire, retiré avant écriture).

## Acceptance Criteria

1. **Given** le mode pique-nique actuel (`FIXED_EQUIPMENT`, `equipment-step.ts`, auto-assigné sans choix), **when** ce palier est implémenté, **then** l'étape équipement propose un choix explicite entre (a) le nécessaire pré-fait, enrichi avec le contenu réel du livre, et (b) un achat libre.
2. **Given** un nouveau `ContentType` `equipmentItem`, **when** il est seedé (`equipment-items.json`), **then** chaque entrée porte `{ key, label, priceGold: number, nature: 'individual'|'contenant'|'animal', ...description/effet }` — `priceGold` numérique, distinct du champ `price` texte libre existant sur `InventoryItem`.
3. **Given** un joueur qui achète des objets pour un total donné, **when** `CharacterService.create()` reçoit la sélection, **then** le total ne peut pas dépasser 1000 Po — validation serveur, au moment de la création uniquement, rejet via `BadRequestException` (même convention que les autres validations de `CharacterService.create()`).
4. **Given** un objet acheté avec `nature: 'animal'`, **when** il est converti en entrée d'inventaire, **then** il ne porte jamais de poids (cohérent avec `Animal = Omit<InventoryItem, 'weight'>` déjà en place).
5. **Given** un achat validé (pique-nique ou libre), **when** le personnage est créé, **then** le résultat alimente `equipment.individual`/`contenants`/`animaux` existants (Épic 14) — aucun nouveau modèle d'inventaire, `id` généré serveur, `addedBy: 'player'`.
6. **Given** une édition ultérieure de l'équipement par le MJ (mécanisme `sheet-field` existant), **when** elle a lieu après la création, **then** elle n'est jamais re-vérifiée contre le budget de 1000 Po — cohérent avec l'édition MJ sans contrainte déjà établie.

## Tasks / Subtasks

- [x] Task 1 — Transcription de `docs/equipement.md` en JSON (AC: #2)
  - [x] `apps/api/game-systems/ryuutama/data/equipment-items.json` (nouveau, gitignoré comme tout le contenu Ryuutama) : une entrée par ligne des tables suivantes, **transcription fidèle, aucune invention** (règle absolue déjà établie Epic 23 — en cas de doute/texte manquant, s'arrêter et demander) :
    - « Objets divers » → « Matériel » (Nourriture + Objets du quotidien + Campement, une seule table dans le doc) → `nature: 'individual'`, `weight` = colonne Enc, `priceGold` = colonne Prix, `effect` = colonne Notes si pertinente (texte court, `@MaxLength(300)` côté DTO d'inventaire à respecter en aval).
    - « Contenants » (8 entrées) → `nature: 'contenant'`, `weight` = Enc, `priceGold` = Prix, `effect` doit capturer la capacité (« Cap. » — aucun champ dédié sur `Contenant`, donc formulée en texte, ex. « Capacité 5 »).
    - « Vêtements » → `nature: 'individual'`, `weight` = Enc, `priceGold` = Prix, `effect` = colonne Bonus + Notes combinées en un texte court.
    - « Animaux » → **uniquement** le « Tableau des animaux » (5 entrées : Animal de bât, Animal de bât (grand), Animal de compagnie, Monture, Monture (grande)) — **pas** le tableau « Spécificités des animaux » (multiplicateurs de prix, pas des objets achetables indépendants, hors scope) → `nature: 'animal'`, **aucun champ `weight`** (cohérent AC4), `priceGold` = Prix, `effect` = Notes.
    - Clé (`key`) : slug dérivé du nom (ex. `rations`, `grand-sac-a-dos`, `animal-de-bat`) — vérifier l'absence de collision entre les 4 tables.
  - [x] `apps/api/src/game-systems/game-system.service.ts` : ajouter `{ key: 'equipmentItem', label: 'Équipement', file: 'equipment-items.json' }` à `CONTENT_TYPES`.
  - [x] `apps/api/game-systems/ryuutama/data/equipment-packages.json` (nouveau) : 2 entrées `{ key, label, priceGold, items: { itemKey: string, quantity: number }[] }` — `priceGold` = prix annoncé par le livre (150 / 800, valeur de référence/affichage, **ne pas** la recalculer depuis les composants ni la « corriger » si elle diffère de leur somme réelle) :
    - `necessaire-voyage` (150 Po) : Grand sac à dos, sac de couchage, couverts, outre, rations ×2 (`items` = 5 lignes, `rations` avec `quantity: 2`).
    - `necessaire-intendance` (800 Po) : Animal de bât, Tonneau, Caisse, Nécessaire de cuisine, 3 torches (`quantity: 3`), Briquet, Savon, Nécessaire à lessive, Tente.
  - [x] `game-system.service.ts` : ajouter `{ key: 'equipmentPackage', label: 'Nécessaire de départ', file: 'equipment-packages.json' }` à `CONTENT_TYPES`.
  - [x] Fichiers transcrits mais **non wirés** cette story (pas d'entrée `CONTENT_TYPES`, juste des fichiers JSON dans le même répertoire, prêts pour de futures stories) : `armures.json` (table Armures), `boucliers.json` (table Boucliers), `herbes-de-soins.json` (Prix de vente par niveau + Soins du corps + Soins de l'esprit + Améliorations + Répartition — toute la section), `specificites-objets.json` (Tableau des spécificités), `specificites-animaux.json` (Spécificités des animaux), `services.json` (Repas, Gîte, Services divers, Spécialités des villes). Même rigueur de transcription que ci-dessus, même règle anti-invention.
- [x] Task 2 — `packages/game-rules` : type `startingEquipment` + fonction de résolution pure (AC: #3, #4, #5)
  - [x] `packages/game-rules/src/ryuutama/types.ts` : ajouter à `RyuutamaSheetData` :
    ```ts
    /**
     * Sélection d'équipement de départ à la création (Story 26.1) — clés du catalogue
     * `equipmentItem` + quantités, jamais persistée telle quelle : `CharacterService.create()`
     * la résout en équipement réel (`equipment.individual`/`contenants`/`animaux`) et la retire
     * de `sheetData` avant écriture. Absente sur tout personnage déjà créé, et sur tout
     * personnage créé après cette story (champ purement transitoire, jamais dans le payload de
     * lecture `CharacterDto`).
     */
    startingEquipment?: { key: string; quantity: number }[];
    ```
  - [x] Nouveau fichier `packages/game-rules/src/ryuutama/resolve-starting-equipment.ts` (même convention qu'un fichier par fonction pure, cf. `resolve-weapon-category.ts`) :
    ```ts
    export interface EquipmentCatalogEntry {
      key: string;
      label: string;
      priceGold: number;
      nature: 'individual' | 'contenant' | 'animal';
      weight?: number; // absent pour nature: 'animal'
      effect?: string;
    }
    export interface ResolvedStartingEquipment {
      individual: { name: string; weight: number; price: string; effect?: string }[];
      contenants: { name: string; weight: number; price: string; effect?: string }[];
      animaux: { name: string; price: string; effect?: string }[];
      totalPriceGold: number;
      /** Clés de la sélection absentes du catalogue (contenu incohérent/client corrompu) — jamais une exception. */
      unresolvedKeys: string[];
    }
    export function resolveStartingEquipment(
      selection: { key: string; quantity: number }[],
      catalog: EquipmentCatalogEntry[],
    ): ResolvedStartingEquipment
    ```
    Comportement : pour chaque `{ key, quantity }`, résoudre l'entrée catalogue ; si absente → ajouter `key` à `unresolvedKeys`, ne rien produire pour cette ligne (jamais de `throw`, même convention que `resolveWeaponCategory`/`resolveWeapon`). Sinon, générer **`quantity` entrées distinctes** (jamais un hack de quantité dans le nom, décision actée) réparties selon `nature` dans `individual`/`contenants`/`animaux`, avec `price: \`${priceGold} Po\`` (texte, cohérent avec le champ `InventoryItem.price` existant, jamais un nombre brut stocké là). `totalPriceGold` = somme de `priceGold × quantity` sur toutes les lignes résolues (ignorer les non-résolues dans la somme — elles sont de toute façon rejetées par l'appelant, cf. Task 3).
  - [x] Exporter `resolveStartingEquipment` et ses types depuis `packages/game-rules/src/index.ts`.
- [x] Task 3 — Backend : `CharacterService.create()`, budget et génération serveur (AC: #3, #4, #5, #6)
  - [x] `apps/api/src/characters/character.service.ts`, dans `create()` (ligne ~160-206), **avant** l'appel à `validate()` :
    - Construire le catalogue `EquipmentCatalogEntry[]` depuis `content['equipmentItem']` (même pattern `entry.data as ...` que `buildRyuutamaCatalog()`).
    - Appeler `resolveStartingEquipment(sheetData.startingEquipment ?? [], catalog)`.
    - Si `unresolvedKeys.length > 0` → `BadRequestException` (clé de sélection inconnue du catalogue — client corrompu/direct API, jamais silencieux).
    - Si `totalPriceGold > 1000` → `BadRequestException([{ field: 'equipment', message: '...' }])` (même forme `{field,message}[]` que les erreurs `validate()`, pour que `character-wizard.ts::handleSubmitError` route correctement vers l'étape équipement, AC3).
    - Écrire le résultat dans `sheetData.equipment = { individual: [...résolu avec id/addedBy serveur], contenants: [...idem], animaux: [...idem] }` (`randomUUID()`, `addedBy: 'player'` — même pattern que `normalizeInventoryIndividual`/`addInventoryItem` existants) — **avant** l'appel à `validate()`/`computeDerived()` (AC5).
    - Retirer `startingEquipment` de `sheetData` avant `this.prisma.character.create()` (`delete sheetData.startingEquipment` ou reconstruction de l'objet sans ce champ) — ne doit **jamais** être persisté (Contexte, point 4).
  - [x] `buildRyuutamaCatalog()` n'a **pas** besoin d'exposer `equipmentItem`/`priceGold` — c'est un besoin propre à `create()`, pas à `validate()` (le budget n'est **jamais** revérifié en mode `'mj'`/`setSheetField`, AC6 — le garder hors de `RyuutamaCatalog` empêche toute tentation future de le brancher là).
  - [x] `apps/api/src/game-systems/game-system.service.ts::getSchema()` : ajouter `startingEquipment: { type: 'array', optional: true }` à `sheetSchema` (documentation seule, cohérent avec les autres champs) — `creationSteps` reste inchangé (`{ key: 'equipment', label: 'Équipement' }` existe déjà).
- [x] Task 4 — Frontend : `EquipmentStep` réécrit (AC: #1, #2)
  - [x] `equipment-step.ts` : retirer entièrement `FIXED_EQUIPMENT` et son export. Nouveaux inputs `equipmentItems = input.required<ContentEntryDto[]>()`, `equipmentPackages = input.required<ContentEntryDto[]>()`, `selection = input<{ key: string; quantity: number }[]>([])` ; nouvel output `selectionChange = output<{ key: string; quantity: number }[]>()`.
    - Mode toggle local (`protected readonly mode = signal<'kit' | 'shopping'>('kit')`, défaut pré-fait) — deux boutons/cartes « Nécessaire pré-fait » / « Achat libre ».
    - Mode `'kit'` : au clic sur un nécessaire (ou par défaut les 2 réunis — même sémantique que l'actuel qui assignait toujours les 2 ensemble, aucune AC ne demande de choisir entre les 2 nécessaires), résoudre les 2 entrées `equipmentPackage` en une liste `{ key, quantity }[]` fusionnée (agréger les quantités si une même clé apparaît dans les 2 nécessaires — improbable ici mais garder le code correct) et émettre `selectionChange`. Affichage en lecture seule (noms + prix résolus depuis le catalogue, comme l'actuel `equipment-step.html` mais avec de vraies données).
    - Mode `'shopping'` : liste des `equipmentItem` (groupée par `nature` ou plate, au choix de l'implémentation — pas d'AC UX précise), un contrôle d'ajout par entrée (bouton « Ajouter » incrémentant la quantité dans `selection`, pas de champ quantité libre — cohérent avec « une entrée par unité »), panier récapitulatif (liste des objets choisis + total), compteur budget `computed(() => 1000 - totalSpent())`. `totalSpent` = somme `priceGold × quantity` sur `selection()`, résolue depuis `equipmentItems()`.
    - Basculer de mode réinitialise `selection` (`selectionChange.emit([])`) — jamais de mélange kit+achat libre.
  - [x] `equipment-step.html` : réécriture complète (panneau nécessaire pré-fait en lecture seule / panneau achat libre avec liste + panier + compteur budget, désactivé/message d'erreur si le total dépasse 1000 Po — pas de blocage strict requis par une AC ici, mais cohérent avec `canGoNext()` ci-dessous qui bloque de toute façon la progression).
  - [x] `equipment-step.scss` : styles pour le panier/compteur (réutiliser les tokens `--mat-sys-*` déjà en place ailleurs dans le wizard, cf. `weapon-step.scss`).
- [x] Task 5 — Câbler `character-wizard.ts`/`.html` (AC: #1, #3)
  - [x] Retirer l'import `FIXED_EQUIPMENT` (`character-wizard.ts` ligne ~21) et l'initialisation `equipment.individual` codée en dur du signal `sheetData` (lignes ~171-182) — remplacée par `startingEquipment: []` (vide par défaut, l'étape équipement le peuple).
  - [x] Nouveaux computed `equipmentItems = computed(() => this.content()?.['equipmentItem'] ?? [])` et `equipmentPackages = computed(() => this.content()?.['equipmentPackage'] ?? [])` (même pattern que `weaponItems`/`weaponCategories`).
  - [x] Nouvelle méthode `protected onStartingEquipmentChange(selection: { key: string; quantity: number }[]): void` → `this.sheetData.update((d) => ({ ...d, startingEquipment: selection }))`.
  - [x] `canGoNext()` : ajouter `case 'equipment': return (data.startingEquipment?.length ?? 0) > 0 && <total ≤ 1000>;` — le total doit être recalculé ici depuis `equipmentItems()` (même logique que `EquipmentStep.totalSpent`, dupliquée volontairement côté wizard comme les autres cas de `canGoNext()` qui ne réutilisent pas de fonction partagée avec les steps — cohérent avec le style existant du fichier) ou exposé via un output supplémentaire du step (`totalChange`/`overBudget`) si plus simple — au choix de l'implémentation, pas d'AC précise dessus.
  - [x] `character-wizard.html` : binder `[equipmentItems]="equipmentItems()"`, `[equipmentPackages]="equipmentPackages()"`, `[selection]="sheetData().startingEquipment ?? []"`, `(selectionChange)="onStartingEquipmentChange($event)"` sur `<app-equipment-step>`.
  - [x] `FIELD_TO_STEP_KEY` : ajouter `equipment: 'equipment'` (routage explicite de l'erreur budget serveur, cf. Task 3 — techniquement déjà couvert par le fallback `?? e.field` puisque la clé de champ ET la clé d'étape sont toutes deux `'equipment'`, mais l'ajouter explicitement pour la lisibilité, cohérent avec les autres entrées du mapping).
- [x] Task 6 — Tests et suite complète (AC: #1-#6)
  - [x] `packages/game-rules/src/__tests__/resolve-starting-equipment.spec.ts` (nouveau) : résolution multi-nature (individual/contenant/animal) avec quantités > 1 (vérifier N entrées distinctes, jamais fusionnées) ; clé inconnue → dans `unresolvedKeys`, absente des listes résolues, pas d'exception ; `totalPriceGold` correct (somme `priceGold × quantity`) ; item `nature: 'animal'` → jamais de champ `weight` sur l'entrée produite ; sélection vide → tout à `[]`/`0`.
  - [x] `apps/api/src/characters/character.service.spec.ts` : `create()` avec `startingEquipment` valide et total ≤ 1000 → personnage créé, `equipment.individual/contenants/animaux` peuplés avec `id`/`addedBy: 'player'` générés, `startingEquipment` absent du `sheetData` persisté ; total > 1000 → `BadRequestException`, `prisma.character.create` non appelé ; clé de sélection inconnue → `BadRequestException` ; `setSheetField()` modifiant `equipment.*` après création → aucun appel à `resolveStartingEquipment`/vérification de budget (AC6, test de non-régression explicite).
  - [x] `apps/web/.../equipment-step.spec.ts` : réécriture complète — mode pré-fait affiche les 2 nécessaires résolus (noms/prix réels, pas les anciens noms `FIXED_EQUIPMENT`) et émet la sélection agrégée ; mode achat libre : ajouter un objet incrémente la quantité et le total, retirer la décrémente, budget affiché correctement, basculer de mode réinitialise la sélection.
  - [x] `apps/web/.../character-wizard.spec.ts` : `canGoNext()` sur l'étape `equipment` — vide → `false`, sélection valide sous budget → `true`, sélection dépassant 1000 Po → `false` ; `onStartingEquipmentChange` met à jour `sheetData().startingEquipment`.
  - [x] Suite complète (`docker compose exec api pnpm test`, `docker compose exec web pnpm test`, suite dédiée `packages/game-rules`) — baseline actuelle (post-Story 25.2) : 171 game-rules / 903 API / 998 web, aucune régression attendue au-delà des ajouts listés et de la réécriture de `equipment-step.spec.ts` (suppression des anciens tests `FIXED_EQUIPMENT`).
  - [x] `docker compose exec api pnpm typecheck` propre.

## Dev Notes

- **`startingEquipment` est un champ 100% transitoire** — présent uniquement dans le payload de création (`sheetData` envoyé par le wizard), jamais dans `CharacterDto` (lecture), jamais persisté en base. `CharacterService.create()` doit le retirer de `sheetData` avant `prisma.character.create()` — un oubli laisserait le champ traîner indéfiniment sur le personnage créé (bug silencieux, à vérifier explicitement en test).
- **Le budget de 1000 Po n'est vérifié qu'à la création** (AC3/AC6) — ne jamais brancher cette vérification dans `validate()` (`packages/game-rules`, appelé aussi en mode `'mj'` permissif pour `setSheetField`) ni dans `RyuutamaCatalog`. Le catalogue `equipmentItem`/`priceGold` reste local à `CharacterService.create()`, jamais exposé à `validate()`.
- **Écart de prix nécessaire d'intendance (800 Po annoncé vs 795 Po réel en sommant ses composants)** — fidèle au livre, ne pas « corriger » l'un ou l'autre. Le champ `priceGold` du `ContentType` `equipmentPackage` est purement informationnel/affichage ; c'est la somme réelle des composants résolus (795 Po) qui compte pour le budget — de toute façon toujours ≤ 1000 Po, aucun risque de rejet côté serveur pour le nécessaire pré-fait.
- **Pas de nouveau modèle Prisma** (AC5) — `equipment.individual`/`contenants`/`animaux` (Épic 14) sont réutilisés tels quels ; `equipmentItem`/`equipmentPackage` sont deux `ContentType` de plus dans le mécanisme existant (`CONTENT_TYPES`/`GameSystemService.seedRyuutama()`), même pattern que `weaponItem`/`weaponCategory`/`spell`.
- **Transcription du livre — même règle absolue que l'Epic 23** : ne jamais inventer de texte/valeur. Si une colonne semble ambiguë (ex. formulation d'un effet), transcrire fidèlement le texte du tableau plutôt que de le reformuler ou de l'omettre sans raison. En cas de doute réel (donnée manquante à la granularité attendue), s'arrêter et demander plutôt que d'inventer.
- **Fichiers transcrits mais non wirés (Task 1, dernier point)** — ne créer **aucune** entrée `CONTENT_TYPES` pour eux cette story, même si la tentation est grande de « finir le travail » : ce sont des données prêtes pour de futures stories (armures/boucliers n'ont aucun champ mécanique correspondant sur `RyuutamaSheetData` aujourd'hui — les ajouter serait un scope creep hors AC).
- **`FIXED_EQUIPMENT` disparaît intégralement** — plus aucune référence codée en dur à « Grand sac à dos »/« Nécessaire de cuisine »/etc. dans le code TypeScript une fois cette story terminée ; tout vient du catalogue seedé (cohérent NFR4).

### Project Structure Notes

- Données : `apps/api/game-systems/ryuutama/data/equipment-items.json` (nouveau, wiré), `equipment-packages.json` (nouveau, wiré), `armures.json`/`boucliers.json`/`herbes-de-soins.json`/`specificites-objets.json`/`specificites-animaux.json`/`services.json` (nouveaux, non wirés).
- `packages/game-rules/src/ryuutama/types.ts` (`RyuutamaSheetData.startingEquipment`), nouveau `resolve-starting-equipment.ts`, `index.ts` (nouveaux exports).
- Backend : `apps/api/src/game-systems/game-system.service.ts` (`CONTENT_TYPES` ×2, `getSchema()`), `apps/api/src/characters/character.service.ts` (`create()`).
- Frontend : `apps/web/src/app/features/characters/character-wizard/steps/equipment-step/{equipment-step.ts,.html,.scss,.spec.ts}` (réécriture complète), `character-wizard.ts`/`.html`.
- Aucune migration Prisma (`sheetData: Json`).

### References

- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 26.1] — Acceptance Criteria d'origine
- [Source: docs/equipement.md] — texte réel du livre (pages 24-33), toutes les tables à transcrire
- [Source: apps/web/src/app/features/characters/character-wizard/steps/equipment-step/equipment-step.ts,.html] — `FIXED_EQUIPMENT` actuel à retirer entièrement
- [Source: apps/web/src/app/features/characters/character-wizard/character-wizard.ts:171-182,247-273,400-403] — init `sheetData.equipment` codée en dur à retirer, `canGoNext()` à étendre, payload de `create()` déjà générique (`sheetData()` envoyé tel quel — pas de changement DTO nécessaire)
- [Source: apps/api/src/characters/character.service.ts:160-260] — `create()`/`buildRyuutamaCatalog()`, pattern `keysOf()`/gestion `BadRequestException` déjà établi
- [Source: apps/api/src/characters/dto/create-inventory-item.dto.ts,create-contenant.dto.ts,create-animal.dto.ts] — bornes `@MaxLength` déjà en place sur `name`/`price`/`effect` (200/50/300), à respecter lors de la génération des entrées résolues
- [Source: packages/game-rules/src/ryuutama/types.ts:10-23] — `InventoryItem`/`Contenant`/`Animal` (`Animal = Omit<InventoryItem, 'weight'>`, AC4)
- [Source: packages/game-rules/src/ryuutama/resolve-weapon-category.ts] — pattern de fonction pure/catalogue dédié à suivre pour `resolveStartingEquipment` (jamais de `throw`, dégradation gracieuse)
- [Source: _bmad-output/implementation-artifacts/25-2-creation-arme-libre.md] — story précédente (même palier), pattern de revue de code à anticiper (Blind Hunter + Edge Case Hunter + Acceptance Auditor), leçon retenue : garder les gardes de type strictes sur toute donnée venant du client (`sheetData: Record<string, unknown>`, aucune contrainte de forme au niveau DTO)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm test"` → 11 suites, 176/176 passed (baseline 171 + 5 nouveaux `resolveStartingEquipment`)
- `docker compose exec api pnpm test` → 45 suites, 907/907 passed (baseline 903 + 4 nouveaux `startingEquipment` dans `character.service.spec.ts`)
- `docker compose exec api pnpm typecheck` → clean (`tsc --noEmit -p tsconfig.build.json`)
- `docker compose exec web pnpm test` → 73 suites, 1005/1005 passed (baseline 998, `equipment-step.spec.ts` réécrit +5 net, `character-wizard.spec.ts` +2)
- `docker compose exec web pnpm build` (production) non exécuté — dépassement de budget de bundle préexistant (constaté lors de la Story 25.2), sans rapport avec cette story ; la compilation AOT via `ng test` (mode development) est propre.

### Completion Notes List

- **Transcription complète de `docs/equipement.md`** (Task 1) : `equipment-items.json` (68 entrées, Matériel + Contenants + Vêtements + Animaux, wiré en `ContentType equipmentItem`) et `equipment-packages.json` (2 nécessaires, `ContentType equipmentPackage`) — plus 6 fichiers transcrits mais non wirés (`armures.json`, `boucliers.json`, `herbes-de-soins.json`, `specificites-objets.json`, `specificites-animaux.json`, `services.json`), prêts pour de futures stories. Deux valeurs d'encombrement du livre données sous forme de plage/minimum (« Instrument » 3 et +, « Peluche » 1 à 5) — la valeur minimale a été retenue, documentée dans le champ `effect` plutôt qu'inventée.
- **Écart assumé, documenté dans la story avant codage** : le Nécessaire d'intendance annonce 800 Po dans le livre mais coûte réellement 795 Po en sommant ses composants transcrits — écart du livre lui-même, non « corrigé », sans conséquence (toujours ≤ 1000 Po).
- `resolveStartingEquipment()` (nouveau, `packages/game-rules`) résout une sélection `{key,quantity}[]` en équipement réel (individual/contenants/animaux), une entrée distincte par unité, jamais de `throw` sur clé inconnue (`unresolvedKeys`).
- `CharacterService.create()` : nouveau pipeline unique (pré-fait ou achat libre indistinctement) — résolution AVANT `validate()`/`computeDerived()`, rejet si clé inconnue ou budget > 1000 Po, génération serveur des `id`/`addedBy: 'player'`, `startingEquipment` retiré avant persistance (jamais stocké). Budget non revérifié par `setSheetField()` (AC6, testé explicitement).
- `EquipmentStep` entièrement réécrit (`FIXED_EQUIPMENT` supprimé) : bascule nécessaire pré-fait / achat libre, panier avec compteur de budget, resynchronisation au retour en arrière sur l'étape (même pattern que `WeaponStep`).
- `character-wizard.ts` : `startingEquipment: []` remplace l'init `equipment.individual` codée en dur ; `canGoNext()` étape `equipment` bloque tant que la sélection est vide ou dépasse 1000 Po.
- 3 tests pré-existants (`character.service.spec.ts`) mis à jour : `sheetData.equipment` vide `{individual:[],contenants:[],animaux:[]}` désormais toujours présent après résolution (même sans achat), changement de comportement légitime documenté dans les assertions.
- Suite complète verte sans régression au-delà des ajouts/réécritures prévus : 176/176 game-rules, 907/907 API, 1005/1005 web, typecheck API propre.

### File List

- `apps/api/game-systems/ryuutama/data/equipment-items.json` (nouveau)
- `apps/api/game-systems/ryuutama/data/equipment-packages.json` (nouveau)
- `apps/api/game-systems/ryuutama/data/armures.json` (nouveau, non wiré)
- `apps/api/game-systems/ryuutama/data/boucliers.json` (nouveau, non wiré)
- `apps/api/game-systems/ryuutama/data/herbes-de-soins.json` (nouveau, non wiré)
- `apps/api/game-systems/ryuutama/data/specificites-objets.json` (nouveau, non wiré)
- `apps/api/game-systems/ryuutama/data/specificites-animaux.json` (nouveau, non wiré)
- `apps/api/game-systems/ryuutama/data/services.json` (nouveau, non wiré)
- `packages/game-rules/src/ryuutama/types.ts`
- `packages/game-rules/src/ryuutama/resolve-starting-equipment.ts` (nouveau)
- `packages/game-rules/src/index.ts`
- `packages/game-rules/src/__tests__/resolve-starting-equipment.spec.ts` (nouveau)
- `apps/api/src/characters/character.service.ts`
- `apps/api/src/characters/character.service.spec.ts`
- `apps/api/src/game-systems/game-system.service.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/equipment-step/equipment-step.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/equipment-step/equipment-step.html`
- `apps/web/src/app/features/characters/character-wizard/steps/equipment-step/equipment-step.scss`
- `apps/web/src/app/features/characters/character-wizard/steps/equipment-step/equipment-step.spec.ts`
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts`
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html`
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts`

## Change Log

- 2026-07-29 — Implémentation complète du choix nécessaire pré-fait / achat libre (`startingEquipment`, `resolveStartingEquipment()`, catalogues `equipmentItem`/`equipmentPackage`) — Story passée en `review`.
- 2026-07-29 — Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor, exécutée en tâche de fond) : 2 patches appliqués (garde `quantity` entier positif dans `resolveStartingEquipment()` — contournement de budget via quantité négative/fractionnaire ; garde `Array.isArray()` sur `sheetData.startingEquipment` — évite un crash 500), 1 item différé (budget 1000 Po codé en dur, voir `deferred-work.md`), ~5 écartés. Suite finale : 179/179 tests game-rules, 908/908 API, typecheck propre, aucune régression. Statut passé à `done`.

### Review Findings

- [x] [Review][Patch] `resolveStartingEquipment()` ne valide jamais que `quantity` est un entier positif [packages/game-rules/src/ryuutama/resolve-starting-equipment.ts:50-67] — **corrigé** : `!Number.isInteger(quantity) || quantity <= 0` traité comme une clé non résolue (même chemin de rejet que le reste de la fonction). 3 nouveaux tests (négatif, fractionnaire, zéro).
- [x] [Review][Patch] `sheetData.startingEquipment` non-array (objet/string/nombre) fait planter `resolveStartingEquipment()` au lieu d'un 400 propre [apps/api/src/characters/character.service.ts:191] — **corrigé** : garde explicite `Array.isArray()` avant l'appel, `BadRequestException` si non-tableau et non-`undefined`. 1 nouveau test.
- [x] [Review][Defer] Budget de 1000 Po codé en dur (`character.service.ts` + dupliqué `character-wizard.ts`), pas piloté par la donnée — deferred, pre-existing pattern (le projet n'a qu'un seul système de jeu implémenté aujourd'hui — Ryuutama —, aucune abstraction multi-système/multi-devise n'existe encore ailleurs dans le code ; à généraliser si/quand un 2e système de jeu avec une économie différente est ajouté).

Dismissed as noise (~5) : absence de migration pour les personnages `weaponCategoryId` legacy (décision produit déjà actée et acceptée en revue de la Story 25.1, hors scope du diff de cette story) ; `resolveWeapon()` accusé de dupliquer la construction de `ResolvedWeapon` entre ses deux branches — le docblock ne prétend duplication nulle que sur la logique de résolution item→catégorie (vraie, la branche `weaponId` réutilise bien `resolveWeaponCategory`), pas sur la forme de l'objet retourné (5 lignes, trivial) ; le total en Po calculé indépendamment à 3 endroits (`resolveStartingEquipment`/`EquipmentStep.totalSpent`/`character-wizard.ts`) — décision déjà documentée explicitement en commentaire dans le code (« dupliqué volontairement », cohérent avec le style déjà établi de `canGoNext()` qui ne partage jamais de logique avec les steps) ; la clé `mains-nues` codée en dur à la fois dans `validate.ts` et `weapon-step.ts` — pré-existant depuis les Stories 25.1/25.2 (Epic 25), hors scope du diff de cette story (26.1 ne touche ni l'un ni l'autre fichier) ; scans linéaires `O(N×M)` (`.find()`) dans `labelFor()`/`selectedLines`/`totalSpent`/`startingEquipmentTotalGold` plutôt qu'une `Map` précalculée — optimisation prématurée pour des catalogues de 68 entrées, cohérent avec le pattern déjà accepté dans `WeaponStep`.
