---
baseline_commit: 6fb158d6c3f2f31a0045e52bf6c40dd0faa4d3a5
---

# Story 23.8: Cas particuliers de création propres à certaines classes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want que l'assistant de création me propose les choix spécifiques imposés par ma classe (au-delà de la spécialité de l'Artisan, déjà gérée),
so that mon personnage respecte réellement les règles du livre pour ces classes plutôt que d'ignorer silencieusement une mécanique de création qui leur est propre.

## Contexte (4 cas détectés dans `docs/classes.md`, classes déjà seedées depuis les Stories 23.2/23.4)

| Classe | Talent | Nature du choix |
| --- | --- | --- |
| Fermier | Métier d'appoint | Emprunter un talent d'une **autre classe** ayant un test (`attributes` non vide), malus -1 permanent |
| Ermite | Métier d'appoint | *(identique au Fermier)* |
| Ermite | Métamorphose | Choisir un **type de paysage** (liste fermée, catalogue `landscape` déjà existant) — pur flavor, aucun bonus mécanique |
| Dresseur | Autorité | Choisir un **type de créature** parmi 5 (liste fermée, propre à ce talent, pas de catalogue existant) |
| Météomancien | Climatophile | Un **climat favori supplémentaire** — décision actée avec l'utilisateur (`create-story`, 2026-07-26) : **exactement le même mécanisme** que la capacité `landscape` déjà câblée pour la montée de niveau (catalogue `landscape`, affichage "Paysage/climat favori" existant sur la fiche), juste obtenu à la création au lieu d'une montée de niveau |

## Acceptance Criteria

1. **Given** le modèle de données actuel des classes (`talents: ClassTalent[]`, pas de mécanisme générique de choix à l'acquisition en dehors de `requiresSpecialty`/`specialtyLabel` propre à l'Artisan), **when** cette story est implémentée, **then** un mécanisme de données **générique** permet de déclarer, par classe, un ou plusieurs choix requis à la création (`requiredChoices` dans `classes.json`) — pas un champ ad hoc par classe. **Cette story n'ajoute `requiredChoices` qu'aux 4 classes du tableau ci-dessus** (Fermier, Ermite, Dresseur, Météomancien) — aucune autre classe n'y touche.
2. **Given** un joueur qui sélectionne une classe portant un `requiredChoices` (Fermier, Ermite, Dresseur, Météomancien), **when** il arrive à `ClassStep` de l'assistant de création, **then** l'interface propose le(s) choix spécifique(s) correspondant(s) — un menu déroulant par choix requis, avec le libellé fourni par `requiredChoices[].label` — et **bloque la progression** (`canGoNext()`) tant que tous les choix requis de la classe sélectionnée ne sont pas renseignés.
3. **Given** le talent *Métier d'appoint* (Fermier, Ermite), **when** le joueur choisit un talent d'une autre classe, **then** seuls les talents dont `attributes` est renseigné (tableau non vide) sont proposés dans le menu déroulant, et le malus de -1 est appliqué et **visible sur ce talent dans la fiche de personnage résultante** (`CharacterSheet`) — nom du talent emprunté, son effet, son malus, sa classe d'origine.
4. **Given** le talent *Climatophile* (Météomancien), **when** le joueur choisit un climat favori supplémentaire à la création, **then** ce choix est enregistré et affiché en réutilisant **exactement** la section "Paysage/climat favori" déjà existante sur la fiche (celle alimentée par la capacité `landscape` de `levelUps[]`) — **sans jamais l'ajouter à `levelUps[]`** (cela fausserait le calcul du niveau, `1 + levelUps.length`, cf. Dev Notes).
5. **Given** cette story, **when** elle est complétée, **then** elle ne redéfinit ni ne retire le mécanisme existant `requiresSpecialty`/`specialtyLabel`/`specialtyTypeId` de l'Artisan — elle ajoute un mécanisme complémentaire pour les 4 autres classes, sans régression sur l'Artisan (`validate.ts` Règle 5 reste inchangée, une nouvelle Règle 6 généralisée s'ajoute à côté).

## Tasks / Subtasks

- [x] Task 1 — Ajouter `requiredChoices` aux 4 classes concernées (`classes.json`) (AC: #1)
  - [x] Fermier : `requiredChoices: [{ key: "fermier-metier-appoint", talentId: "metier-d-appoint", kind: "eligible-talent", label: "Talent emprunté (Métier d'appoint)" }]`
  - [x] Ermite : `requiredChoices: [{ key: "ermite-metier-appoint", talentId: "metier-d-appoint", kind: "eligible-talent", label: "Talent emprunté (Métier d'appoint)" }, { key: "ermite-metamorphose", talentId: "metamorphose", kind: "landscape-flavor", label: "Type de paysage (Métamorphose)" }]`
  - [x] Dresseur : `requiredChoices: [{ key: "dresseur-autorite", talentId: "autorite", kind: "closed-list", label: "Type de créature (Autorité)", options: [{ value: "animaux", label: "Animaux" }, { value: "plantes-fantastiques", label: "Plantes fantastiques" }, { value: "creations-magiques", label: "Créations magiques" }, { value: "demons", label: "Démons" }, { value: "morts-vivants", label: "Morts-vivants" }] }]` — les 5 options transcrites de `dresseur.autorite.description` (`classes.json`, déjà seedé Story 23.4), jamais inventées
  - [x] Météomancien : `requiredChoices: [{ key: "meteomancien-climatophile", talentId: "climatophile", kind: "landscape-capability", label: "Climat favori supplémentaire (Climatophile)" }]`
  - [x] Préserver intégralement tout le reste de `classes.json` (les 12 classes, leurs talents, `occupations`/`actions`/`recommendedForBeginners`/`requiresSpecialty` déjà en place) — seul l'ajout du champ `requiredChoices` sur ces 4 classes
- [x] Task 2 — Étendre `RyuutamaSheetData` (`packages/game-rules/src/ryuutama/types.ts`) (AC: #1, #3, #4)
  - [x] Ajouter `classChoices?: Record<string, string>` — clé = `requiredChoices[].key`, valeur = la sélection : pour `kind: "eligible-talent"` la valeur est `` `${classeOrigine}:${talentId}` `` (ex. `"guerisseur:soins"`, car un même `talentId` — ex. `"dressage"` — existe dans plusieurs classes, il faut désambiguïser) ; pour `kind: "landscape-flavor"`/`"closed-list"` la valeur est directement la clé du paysage/l'`option.value` choisi
  - [x] Ajouter `classCapabilities?: { type: 'landscape'; params: { key: string } }[]` — **structurellement identique** à un élément de `levelUps[].capabilities` (même forme `{ type, params }`), mais stocké **séparément** de `levelUps[]` — jamais fusionné dedans (cf. Dev Notes, calcul du niveau)
- [x] Task 3 — Généraliser la validation (`packages/game-rules/src/ryuutama/validate.ts`) (AC: #2, #5)
  - [x] Nouvelle Règle 6 (après la Règle 5 Artisan, **ne pas la modifier**) : pour la classe sélectionnée, résoudre ses `requiredChoices` depuis le catalogue (`RyuutamaCatalog` étendu, cf. sous-tâche suivante) et vérifier que `data.classChoices?.[choice.key]` est renseigné (non vide) pour chacun — sinon erreur `field: choice.key`. Ajustement (non prévu explicitement dans le texte de la story mais nécessaire à sa cohérence) : le choix `landscape-capability` (Climatophile) est considéré renseigné si `data.classCapabilities` est non vide, car sa valeur n'atterrit jamais dans `classChoices` (cf. Task 2/Dev Notes) — sinon Règle 6 bloquerait systématiquement à tort la classe Météomancien.
  - [x] Étendre `RyuutamaCatalog` avec `requiredChoicesByClass: Record<string, { key: string }[]>` (projection minimale du catalogue `class` — uniquement les `key` des choix requis par classe, pas tout `requiredChoices`, pour garder `validate()` découplé de la forme exacte du contenu) — construit côté appelant (`character.service.ts`) à partir du contenu seedé, même pattern que `validClasses`/`validTypes`
- [x] Task 4 — Câbler `ClassStep` (assistant de création) (AC: #2, #3)
  - [x] Étendre l'interface `ClassData` avec `requiredChoices?: RequiredChoice[]`
  - [x] Pour `kind: "eligible-talent"` : construire la liste des talents éligibles en filtrant **toutes les classes reçues en input** (`classes()`) sauf la classe sélectionnée, ne garder que les talents dont `attributes.length > 0` — un menu déroulant `<select>` par choix requis, option = `` `${classKey}:${talentId}` ``, libellé = `` `${talent.name} (${classe.label})` ``
  - [x] Pour `kind: "landscape-flavor"` : menu déroulant peuplé depuis le catalogue `landscape` (déjà reçu ailleurs dans l'assistant — vérifier comment `content()['landscape']` est actuellement exposé au composant parent `character-wizard.ts` et le faire suivre à `ClassStep` en `input`)
  - [x] Pour `kind: "closed-list"` : menu déroulant peuplé directement depuis `requiredChoices[].options`
  - [x] Pour `kind: "landscape-capability"` (Climatophile) : même UI que `landscape-flavor` (menu déroulant sur le catalogue `landscape`), mais la valeur choisie est émise séparément pour atterrir dans `classCapabilities` (pas `classChoices`) côté `character-wizard.ts`
  - [x] Émettre les changements via un nouvel `output()` (ex. `classChoicesChange`/`classCapabilitiesChange`), même pattern que `specialtyTypeIdChange` existant
- [x] Task 5 — Câbler `character-wizard.ts` (AC: #2, #5)
  - [x] `canGoNext()`, cas `'classId'` : étendre la condition existante (`!data.classId` / `artisan && !specialtyTypeId`) pour vérifier que tous les `requiredChoices` de la classe sélectionnée ont une entrée correspondante dans `data.classChoices` (ou `classCapabilities` pour `landscape-capability`)
  - [x] `updateSheetData()` : au changement de classe, nettoyer `classChoices`/`classCapabilities` devenus obsolètes (même principe que le nettoyage existant de `specialtyTypeId` quand `classId !== 'artisan'`) — ne garder que les entrées dont la `key` correspond à un `requiredChoices` de la **nouvelle** classe sélectionnée
- [x] Task 6 — Étendre `capability-label.util.ts` pour fusionner `classCapabilities` (AC: #4)
  - [x] `getFlatCapabilities()` : fusionner les entrées de `sheetData.classCapabilities` (si présent) avec celles aplaties depuis `levelUps[]` — leur assigner un `level` factice cohérent (proposition : `level: 1`, puisqu'obtenues à la création, "niveau 1" par convention) dans le `FlatCapability` retourné, **sans jamais les insérer dans `levelUps[]`** lui-même
  - [x] Vérifier que `getLevelUpEntryForSnapshot`/`snapshotCapabilityChoice` (Historique) ne sont pas affectés — ces fonctions lisent exclusivement `sheetData.levelUps[]`, jamais `getFlatCapabilities()`, donc aucun risque de collision d'index avec les entrées de `classCapabilities` (vérifié par test dédié, cf. Task 8)
- [x] Task 7 — Câbler `CharacterSheet` (AC: #3, #4)
  - [x] Section "Paysage/climat favori" existante (`landscapes` computed, `getCapabilitiesByType(c, 'landscape')`) : aucune modification nécessaire au-delà de la Task 6 — le climat de Climatophile y apparaît automatiquement une fois `getFlatCapabilities()` étendu
  - [x] Nouvelle section (extension de la section Vocation existante) pour afficher : le talent emprunté via *Métier d'appoint* (nom, effet, malus -1, classe d'origine — résolu depuis `classChoices` en cherchant le talent dans le catalogue `class` de la classe d'origine) ; le paysage choisi pour *Métamorphose* (résolu depuis le catalogue `landscape`) ; le type de créature choisi pour *Autorité* (résolu depuis `requiredChoices[].options` de la classe Dresseur)
- [x] Task 8 — Tests et suite complète (AC: #1-#5)
  - [x] Tests `validate.spec.ts` (`packages/game-rules`) : nouvelle Règle 6 (choix manquant → erreur ; choix renseigné → valide), Règle 5 Artisan non affectée
  - [x] Tests `class-step.spec.ts` : les 4 natures de choix affichées, sélection émise, filtrage `eligible-talent` correct (attributs non vides uniquement, classe courante exclue)
  - [x] Tests `character-wizard.spec.ts` : `canGoNext()` bloque tant que les choix ne sont pas faits, nettoyage au changement de classe
  - [x] Tests `capability-label.util.spec.ts` : `getFlatCapabilities()` fusionne bien `classCapabilities`, Historique non affecté
  - [x] Tests `character-sheet.spec.ts` : affichage du talent emprunté avec malus, du paysage Métamorphose, du type de créature Autorité, du climat Climatophile (section existante)
  - [x] Suite complète (`docker compose exec api pnpm test`, `docker compose exec web pnpm test`, suite dédiée `packages/game-rules`) — résultat final : 898/898 API (inchangé), 962/962 web (+18), 136/136 game-rules (+5), aucune régression
  - [x] `docker compose exec api pnpm typecheck` propre

### Review Findings

- [x] [Review][Patch] Règle 6 (`validate.ts`) : le repli `classCapabilities.length > 0` valide N'IMPORTE QUEL choix requis manquant d'une classe (pas seulement `landscape-capability`), car `requiredChoicesByClass` ne transporte que `{ key }`, pas `kind`. Pour l'Ermite (qui a `eligible-talent` + `landscape-flavor`, aucun `landscape-capability`), un payload avec `classCapabilities` non vide et `classChoices` vide passe la validation stricte à tort pour les deux choix — contournement serveur d'AC2/AC3 confirmé par les 3 couches de revue (Blind Hunter, Edge Case Hunter, Acceptance Auditor). [`packages/game-rules/src/ryuutama/validate.ts`] — **corrigé** : `requiredChoicesByClass` transporte désormais aussi `kind` (`types.ts`, `character.service.ts`), Règle 6 ne délègue vers `classCapabilities` que pour `kind === 'landscape-capability'`. 2 tests de régression ajoutés (Ermite bypass + Ermite valide).
- [x] [Review][Patch] `optionsForChoice()` (`class-step.ts`) : le `switch` sur `choice.kind` n'a pas de branche `default` — si le contenu seedé contient une valeur de `kind` imprévue, la fonction retourne `undefined` et le `@for` du template itère dessus, crash de rendu potentiel. [`apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts`] — **corrigé** : `default: return [];` ajouté, test dédié (kind imprévu → aucune option, pas de crash).
- [x] [Review][Patch] `classChoiceDisplays()` (`character-sheet.ts`), cas `eligible-talent` : `value.split(':')` n'est pas gardé — si le talent n'est pas résolu (valeur malformée, `id` absent côté source), l'entrée est quand même affichée avec `malus: '-1'` mais `talentName`/`talentEffectDescription`/`originClassLabel` vides, un affichage trompeur plutôt qu'une absence d'affichage. [`apps/web/src/app/features/characters/character-sheet/character-sheet.ts`] — **corrigé** : si le talent n'est pas résolu, l'entrée est omise (`return null`) plutôt qu'affichée partiellement. Test dédié ajouté.
- [x] [Review][Defer] `onClassCapabilityChange`/nettoyage `updateSheetData` ne sont pas keyés par choix — `classCapabilities` est toujours écrasé par un tableau à un seul élément, sans lien avec `patch.key`. Fonctionne aujourd'hui car aucune classe seedée n'a plus d'un choix `landscape-capability` ; deviendrait un bug si une future classe en ajoutait un second. [`apps/web/src/app/features/characters/character-wizard/character-wizard.ts`] — deferred, pré-existant à la conception actée de la story (aucune classe seedée n'expose ce cas)
- [x] [Review][Defer] Trois définitions indépendantes de `RequiredChoice`/`RequiredChoiceKind` (`class-step.ts`, `character-sheet.ts`, et `RequiredChoiceLike` dans `character-wizard.ts`) au lieu d'un type partagé — duplication de maintenance sans bug fonctionnel actuel. [`apps/web/.../class-step.ts`, `character-sheet.ts`, `character-wizard.ts`] — deferred, refactor de typage pur
- [x] [Review][Defer] Règle 6 ne valide que la présence de `classChoices[key]`, jamais son contenu (appartenance aux `options` pour `closed-list`, absence d'auto-emprunt de sa propre classe pour `eligible-talent`) — conforme au texte de la story qui ne demandait qu'une vérification de présence ("vérifier que ... est renseigné"), mais à durcir dans un futur incrément. [`packages/game-rules/src/ryuutama/validate.ts`] — deferred, hors scope explicite de cette story
- [x] [Review][Defer] `FIELD_TO_STEP_KEY` (`character-wizard.ts`) code en dur les 5 clés de choix connues plutôt que de les dériver du catalogue — cohérent avec le pattern déjà utilisé pour les autres champs de cette map, mais piège de maintenance si une future classe/choix est ajouté sans mise à jour manuelle. [`apps/web/src/app/features/characters/character-wizard/character-wizard.ts`] — deferred, cohérent avec le pattern existant

## Dev Notes

- **⚠️ Contenu réel requis pour les 5 options de la classe Dresseur.** Les libellés `Animaux`/`Plantes fantastiques`/`Créations magiques`/`Démons`/`Morts-vivants` sont transcrits mot pour mot de `dresseur.autorite.description` dans `classes.json` (déjà seedé, Story 23.4) — ne pas en inventer d'autres, ne pas reformuler.
- **Pourquoi `classCapabilities` est séparé de `levelUps[]` (AC4, critique) :** `ryuutama-pdf.service.ts` et `character.service.ts` calculent le niveau du personnage via `1 + levelUps.length` (jamais dérivé de l'xp, cf. commentaire existant `pdf-field-map.ts`). Si le climat de Climatophile était ajouté comme une entrée `levelUps[0]` fictive (avec `pvAllocated`/`peAllocated` à 0), le niveau calculé serait faussé de +1 dès la création pour tout Météomancien — bug silencieux et grave. D'où le nouveau champ séparé `classCapabilities`, non compté dans `levelUps.length`, mais réutilisant la même forme `{ type, params }` pour profiter de l'affichage existant (`capability-label.util.ts`) une fois `getFlatCapabilities()` étendu (Task 6).
- **Distinction `landscape-flavor` (Métamorphose) vs `landscape-capability` (Climatophile) — ne pas les confondre.** Les deux utilisent le catalogue `landscape` pour le menu déroulant, mais leur portée est différente : Métamorphose est un choix narratif pur (quel type d'animal le personnage peut prendre), sans aucun bonus mécanique — il **ne doit jamais apparaître dans la section "Paysage/climat favori"** de la fiche (qui affiche des bonus de +2 aux tests). Climatophile, lui, EST un bonus de climat favori supplémentaire, donc doit apparaître dans cette section existante. C'est pourquoi Métamorphose stocke sa valeur dans `classChoices` (chaîne simple, pas de capacité), tandis que Climatophile stocke la sienne dans `classCapabilities` (capacité `landscape`, même mécanisme d'affichage que les capacités de montée de niveau).
- **Désambiguïsation des talents empruntés (`eligible-talent`) :** plusieurs `talentId` sont partagés entre classes avec un contenu identique ou quasi identique (ex. `"dressage"` existe chez Fermier/Marchand/Dresseur, `"metier-d-appoint"` chez Fermier/Ermite). La valeur stockée dans `classChoices` doit donc être `` `${classeOrigine}:${talentId}` `` (ex. `"guerisseur:soins"`) pour identifier sans ambiguïté le talent réellement emprunté et sa classe d'origine, indispensable pour retrouver son `effect`/`attributes`/`difficulty` exact à l'affichage (Task 7).
- **Talents éligibles pour Métier d'appoint : uniquement ceux avec `attributes` non vide.** Cohérent avec le texte du talent (« un talent normalement réservé à une autre classe **à condition que celui-ci implique un test** ») et avec la convention déjà établie (`attributes: []`/`difficulty: "-"` = pas de test, ex. *Dressage*, *Robuste*). Un Fermier/Ermite ne peut donc PAS emprunter *Dressage* ou *Robuste* (pas de test), mais peut emprunter *Soins* (Guérisseur), *Chasse* (Chasseur), etc.
- **Aucun changement à l'export PDF.** Aucun des 4 cas de cette story n'a de champ AcroForm dédié sur le template officiel (déjà vérifié Story 23.7 pour la magie — même conclusion ici : ces choix sont narratifs/mécaniques mineurs, pas prévus sur la fiche papier officielle). `pdf-field-map.ts` reste inchangé.
- **Autorité du Dresseur (rappel Story 23.4) :** l'incohérence table/texte (`attributes: []`/`difficulty: "-"` dans les données, alors que le texte narratif mentionne un test INT+ESP) est déjà tranchée en faveur du tableau (Story 23.4) — cette story n'y touche pas, elle ajoute uniquement le choix du type de créature.

### Project Structure Notes

- Fichier de données : `apps/api/game-systems/ryuutama/data/classes.json` (existant, gitignoré) — `requiredChoices` ajouté sur 4 des 12 classes.
- `packages/game-rules/src/ryuutama/types.ts` : `RyuutamaSheetData` étendu (`classChoices`, `classCapabilities`), `RyuutamaCatalog` étendu (`requiredChoicesByClass`).
- `packages/game-rules/src/ryuutama/validate.ts` : nouvelle Règle 6, Règle 5 (Artisan) inchangée.
- `apps/api/src/characters/character.service.ts` : construction de `requiredChoicesByClass` dans `buildRyuutamaCatalog()` (lignes 214-237), à côté de `validClasses`/`validTypes`/`validWeapons`/`attributePatterns` déjà construits au même endroit depuis `content['class']`/`content['type']`/etc. — projeter `content['class'].map(e => ({ key: e.key, requiredChoiceKeys: (e.data as { requiredChoices?: {key:string}[] }).requiredChoices?.map(c => c.key) ?? [] }))` ou équivalent.
- Frontend : `class-step.ts`/`.html` (nouvelle UI de choix), `character-wizard.ts` (`canGoNext`/`updateSheetData`), `character-sheet.ts`/`.html` (affichage), `capability-label.util.ts` (fusion `classCapabilities`).
- Aucune migration Prisma (tout vit dans `sheetData: Json`, cohérent avec le reste de `RyuutamaSheetData`).

### References

- [Source: docs/classes.md] — texte réel des talents concernés (Fermier/Ermite Métier d'appoint, Ermite Métamorphose, Dresseur Autorité, Météomancien Climatophile)
- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 23.8] — user story et Acceptance Criteria d'origine, contexte des 4 cas détectés
- [Source: apps/api/game-systems/ryuutama/data/classes.json] — contenu actuel des 4 classes concernées (talents avec `id`/`effect: {description,conditions}`/`attributes`/`difficulty`/`description`, post-Story 23.6)
- [Source: packages/game-rules/src/ryuutama/validate.ts:62-69] — Règle 5 existante (Artisan), pattern à répliquer pour la Règle 6 sans la modifier
- [Source: packages/game-rules/src/ryuutama/types.ts:25-54] — `RyuutamaSheetData` actuel, `specialtyTypeId` (pattern Artisan), `levelUps[].capabilities` (forme `{ type, params }` à réutiliser pour `classCapabilities`)
- [Source: apps/web/src/app/features/characters/character-sheet/capability-label.util.ts] — `getFlatCapabilities`/`getCapabilitiesByType`/`getOtherCapabilities`, section "Paysage/climat favori" déjà câblée pour `landscape`
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts:211-220] — `landscapes` computed, section fiche déjà existante que Climatophile doit réutiliser sans modification de son template
- [Source: apps/web/src/app/features/characters/character-wizard/character-wizard.ts:167-183,231-240] — `canGoNext()`/`updateSheetData()`, pattern Artisan (`specialtyTypeId`) à généraliser
- [Source: apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts,.html] — composant à étendre, pattern `requiresSpecialty`/`specialtyLabel` déjà en place
- [Source: apps/api/game-systems/ryuutama/data/landscapes.json] — catalogue `landscape` existant (12 paysages), réutilisé pour `landscape-flavor` et `landscape-capability`
- [Source: _bmad-output/implementation-artifacts/23-7-catalogue-de-sorts.md] — story précédente (contexte magie, sans lien direct avec celle-ci au-delà de la convenance de schéma de catalogue)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm vitest run src/__tests__/validate.spec.ts"` — Règle 6, 15/15 verts
- `docker compose exec api pnpm typecheck` — propre après chaque étape API
- `docker compose exec web pnpm exec ng test --watch=false --include='**/class-step.spec.ts'` — 9/9
- `docker compose exec web pnpm exec ng test --watch=false --include='**/character-wizard.spec.ts'` — 28/28
- `docker compose exec web pnpm exec ng test --watch=false --include='**/capability-label.util.spec.ts'` — 17/17
- `docker compose exec web pnpm exec ng test --watch=false --include='**/character-sheet.spec.ts'` — 81/81
- Suite complète finale : `docker compose exec api pnpm test` (898/898), `docker compose exec web pnpm test` (962/962), `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm test"` (136/136)

### Completion Notes List

- Task 1 : `requiredChoices` ajouté aux 4 classes (Fermier, Ermite, Dresseur, Météomancien) dans `classes.json`, vérifié via un script Node exécuté dans le conteneur `api` (les 12 classes toujours présentes, seules ces 4 ont le nouveau champ).
- Task 2 : `RyuutamaSheetData.classChoices`/`classCapabilities` et `RyuutamaCatalog.requiredChoicesByClass` ajoutés à `types.ts`, tous optionnels (rétrocompatibles avec les personnages existants).
- Task 3 : Règle 6 ajoutée à `validate.ts` après la Règle 5 (inchangée). Écart assumé par rapport au texte de la story : comme `classCapabilities` n'est jamais reflété dans `classChoices` (Task 2), la Règle 6 traite un choix `landscape-capability` comme renseigné dès que `classCapabilities` est non vide, plutôt que de chercher `classChoices[choice.key]` (qui ne serait jamais rempli pour ce cas) — documenté en commentaire dans `validate.ts`. `requiredChoicesByClass` construit dans `character.service.ts::buildRyuutamaCatalog()`, utilisé par `create()` ET `update()` (les deux appellent déjà cette méthode).
- Task 4 : `ClassStep` étendu avec `landscapes`/`classChoices`/`classCapabilities` en input, `classChoiceChange`/`classCapabilityChange` en output. `optionsForChoice()` normalise les 3 sources d'options (talents éligibles, catalogue paysage, options closed-list) vers `{key, label}` pour un template uniforme.
- Task 5 : `character-wizard.ts` étend `canGoNext()` (cas `classId`) et `updateSheetData()` (nettoyage au changement de classe) ; ajoute `onClassChoiceChange`/`onClassCapabilityChange`. `FIELD_TO_STEP_KEY` étendu avec les 5 clés de choix connues pour rouvrir l'étape `classId` en cas d'erreur serveur 400.
- Task 6 : `getFlatCapabilities()` fusionne `classCapabilities` avec `level: 1` conventionnel, sans jamais toucher `levelUps[]`. Vérifié par test dédié que `getLevelUpEntryForSnapshot` (Historique) n'est pas affecté.
- Task 7 : `CharacterSheet` affiche les 3 choix narratifs/malus (Métier d'appoint, Métamorphose, Autorité) dans une extension de la section Vocation ; Climatophile n'apparaît nulle part dans ce nouveau bloc — il vit exclusivement dans la section "Paysage/climat favori" déjà existante, via la fusion de la Task 6.
- Task 8 : 20 nouveaux tests répartis sur `validate.spec.ts` (+5), `class-step.spec.ts` (+5), `character-wizard.spec.ts` (+6), `capability-label.util.spec.ts` (+4), `character-sheet.spec.ts` (+5). Suite complète et typecheck API propres, aucune régression.

### File List

- `apps/api/game-systems/ryuutama/data/classes.json` (modifié, gitignoré)
- `apps/api/src/characters/character.service.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.html` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.scss` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/capability-label.util.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/capability-label.util.spec.ts` (modifié)
- `packages/game-rules/src/ryuutama/types.ts` (modifié)
- `packages/game-rules/src/ryuutama/validate.ts` (modifié)
- `packages/game-rules/src/__tests__/validate.spec.ts` (modifié)

### File List (revue de code)

- `packages/game-rules/src/ryuutama/types.ts` (patch : `requiredChoicesByClass` transporte `kind`)
- `packages/game-rules/src/ryuutama/validate.ts` (patch : Règle 6 kind-aware)
- `packages/game-rules/src/__tests__/validate.spec.ts` (2 tests de régression ajoutés)
- `apps/api/src/characters/character.service.ts` (patch : projection `kind` dans `buildRyuutamaCatalog()`)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts` (patch : `default` dans `optionsForChoice()`)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts` (1 test ajouté)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (patch : garde talent introuvable dans `classChoiceDisplays()`)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (1 test ajouté)

### Change Log

- 2026-07-26 : Implémentation complète (Tasks 1-8), tous les critères d'acceptation satisfaits, suite complète verte (898 API / 962 web / 136 game-rules), typecheck API propre. Statut passé à `review`.
- 2026-07-26 : Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 3 patches appliqués (dont 1 critique : contournement de validation serveur Règle 6 pour l'Ermite/Fermier/Dresseur via `classCapabilities`), 4 items différés (`deferred-work.md`), 6 dismissed. Suite complète re-vérifiée verte (898 API / 964 web / 138 game-rules). Statut passé à `done`.
