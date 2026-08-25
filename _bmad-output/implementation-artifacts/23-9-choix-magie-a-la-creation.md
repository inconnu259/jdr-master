---
baseline_commit: d69186a7ba34cab342d57b9132c9cdfaf5f59d24
---

# Story 23.9: Choix de la magie à la création (type Magie)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want, en choisissant le type Magie, sélectionner ma saison d'affinité et les sorts de magie rituelle que je connais,
so that mon personnage magicien soit réellement jouable dès sa création, pas seulement le type qui l'annonce.

## Contexte

Le type `magie` (`types.json`, déjà seedé) donne accès aux deux formes de magie simultanément (décision actée Story 23.7 — avantages « Grimoire » et « Lié aux saisons » tous deux accordés). Sa description l'annonce même explicitement : *« Choisir ce type implique de sélectionner les sortilèges que le personnage peut utiliser »* — promesse non tenue à ce jour. Le catalogue de sorts existe (Story 23.7, `spells.json`, `ContentType` `spell`, 75 entrées). `TypeStep` affiche aujourd'hui, quand `typeId === 'magie'`, un texte d'avertissement `character.magic_deferred_notice` (*« La magie s'apprendra plus tard... »*) — **cette story tient enfin cette promesse et retire ce placeholder**.

**Décisions actées avec l'utilisateur (`create-story`, 2026-07-26) :**
1. **Nombre de sorts rituels à la création : exactement 2**, cohérent avec la règle du livre *« Deux nouveaux sorts à chaque montée de niveau »* (`docs/magie.md:123`) appliquée dès la création.
2. **Emplacement UI : nouvelle étape dédiée** (« Magie »), visible uniquement si `typeId === 'magie'` — pas une sous-section de `TypeStep`.
3. **Noms de champs** sur `RyuutamaSheetData` : `magicSeason` (pas `seasonAffinity` — l'utilisateur craint une confusion avec un futur mécanisme distinct de climat/paysage favori, ex. Climatophile Story 23.8) et `knownRitualSpells`.

**Magie des saisons vs magie rituelle — asymétrie importante (`docs/magie.md:28-34`) :** la magie des saisons *« ne consiste en rien d'autre que de se contenter d'emprunter »* la magie du dragon de la saison choisie — *« il n'a pas besoin de les apprendre »*. Un seul choix (`magicSeason`), **aucune sélection de sorts de saison** — contrairement à la magie rituelle qui se *transmet* et se *note dans un grimoire* (`docs/magie.md:24-26`), d'où la sélection explicite de `knownRitualSpells`.

## Acceptance Criteria

1. **Given** un personnage dont `typeId` vaut `magie`, **when** l'assistant de création arrive à une nouvelle étape dédiée « Magie » (visible uniquement pour ce type — absente de la séquence pour tout autre type), **then** le joueur doit choisir une saison d'affinité parmi les 4 du catalogue `season` (`printemps`/`ete`/`automne`/`hiver`) **et** sélectionner **exactement 2** sorts de magie rituelle parmi les 9 du catalogue `spell` ayant `magicType: "rituelle"` **et** `tier: "debutant"` — la progression (`canGoNext`) bloque tant que ces deux choix ne sont pas complets.
2. **Given** un personnage dont `typeId` n'est pas (ou plus) `magie`, **when** il navigue dans l'assistant, **then** l'étape « Magie » est totalement absente de la séquence visible (jamais un step vide/désactivé), et si le joueur change de type après avoir déjà renseigné `magicSeason`/`knownRitualSpells`, ces deux champs sont nettoyés (même principe que le nettoyage `specialtyTypeId`/`classChoices` déjà en place pour `classId`, Stories 4.5/23.8).
3. **Given** la validation serveur (`validate()`, `packages/game-rules`, mode `'strict'`), **when** `data.typeId === 'magie'`, **then** une nouvelle règle générique vérifie que `magicSeason` est une valeur du catalogue `season` **et** que `knownRitualSpells` contient **exactement 2** clés distinctes, chacune appartenant au catalogue des sorts rituels débutants — **ne jamais faire confiance au seul client** (leçon explicite de la revue de code Story 23.8 : un client buggé ou une requête forgée ne doit jamais pouvoir contourner ce choix côté serveur).
4. **Given** la fiche de personnage (`CharacterSheet`) d'un personnage `typeId: "magie"`, **when** elle est affichée, **then** une nouvelle section dédiée affiche la saison d'affinité choisie (libellé résolu depuis le catalogue `season`, jamais la clé brute) et les 2 sorts rituels connus (nom, description, coût en PE — résolus depuis le catalogue `spell`).
5. **Given** cette story, **when** elle est complétée, **then** elle ne câble **aucune** mécanique de lancement de sort (test INT+ESP, dépense de PE, ciblage) — uniquement le choix à la création. Le texte `character.magic_deferred_notice` et son affichage conditionnel dans `TypeStep` sont retirés (la magie n'est plus « différée »). La progression des sorts connus aux montées de niveau suivantes, le déblocage automatique des paliers Intermédiaire/Avancé, et l'affichage des sorts de saison *automatiquement* connus (au-delà du choix de saison lui-même) restent explicitement hors scope, différés à une story ultérieure — cohérent avec la conclusion déjà actée Story 23.7 : aucun champ PDF officiel dédié à la magie, aucun changement à l'export PDF.

## Tasks / Subtasks

- [x] Task 1 — Backend : nouvelle étape + catalogue de validation (AC: #1, #3)
  - [x] `apps/api/src/game-systems/game-system.service.ts` : `{ key: 'magic', label: 'Magie' }` ajouté à `creationSteps` (après `typeId`, avant `attributes`).
  - [x] `packages/game-rules/src/ryuutama/types.ts` : `RyuutamaSheetData.magicSeason?: string` et `knownRitualSpells?: string[]` ajoutés.
  - [x] `packages/game-rules/src/ryuutama/types.ts` : `RyuutamaCatalog` étendu avec `validSeasons?: string[]` et `validDebutantRitualSpells?: string[]`.
  - [x] `apps/api/src/characters/character.service.ts` (`buildRyuutamaCatalog()`) : `validSeasons`/`validDebutantRitualSpells` construits depuis `content['season']`/`content['spell']`.
- [x] Task 2 — Nouvelle Règle 7 de validation (`packages/game-rules/src/ryuutama/validate.ts`) (AC: #3, #5)
  - [x] Après la Règle 6 (Story 23.8, inchangée) : `magicSeason` vérifié non vide + appartenance à `validSeasons` ; `knownRitualSpells` vérifié longueur exacte 2, sans doublon, chaque clé dans `validDebutantRitualSpells`.
  - [x] `typeId !== 'magie'` → aucune vérification de cette règle.
- [x] Task 3 — Nouveau composant `MagicStep` (assistant de création) (AC: #1)
  - [x] Créé `apps/web/src/app/features/characters/character-wizard/steps/magic-step/{magic-step.ts,magic-step.html,magic-step.scss,magic-step.spec.ts}`.
  - [x] Inputs `seasons`/`spells`/`magicSeason`/`knownRitualSpells`, outputs `magicSeasonChange`/`knownRitualSpellsChange` (tableau complet).
  - [x] UI saison via `ChoiceCard` (cohérent avec `ClassStep`/`TypeStep`).
  - [x] UI sorts rituels : 9 cases à cocher, désactivation dès 2 sélectionnés, nom/coût PE/description affichés.
- [x] Task 4 — Câbler `character-wizard.ts`/`.html` (AC: #1, #2, #5)
  - [x] `'magic'` ajouté à `SUPPORTED_STEP_KEYS`.
  - [x] Nouveaux computed `seasons`/`spells`.
  - [x] **Changement architectural** : liste brute renommée `allStepsRaw`, `steps` devient un `computed` filtrant via `CONDITIONAL_STEP_VISIBILITY` (`magic` visible seulement si `typeId === 'magie'`).
  - [x] **Piège de navigation résolu par l'option (a) recommandée** : navigation pilotée par `currentStepKeyTracked` (clé), `currentStepIndex` dérivé par `findIndex` dans `steps()` à chaque lecture (repli sur 0 si la clé suivie a disparu) — `currentStepKey` toujours dérivée de `steps()[currentStepIndex()]`, jamais directement de la clé suivie (auto-cohérence garantie). Testé explicitement (scénario dépasse Magie → retour en arrière → changement de type → navigation cohérente).
  - [x] `canGoNext()` : `case 'magic'` ajouté.
  - [x] `updateSheetData()` : nettoyage `magicSeason`/`knownRitualSpells` si `typeId` change vers autre chose que `'magie'`.
  - [x] `FIELD_TO_STEP_KEY` : `magicSeason`/`knownRitualSpells` → `'magic'`.
  - [x] `character-wizard.html` : `@case ('magic')` ajouté.
- [x] Task 5 — Retirer le placeholder « magie différée » (AC: #5)
  - [x] Bloc `@if (isMagie())` retiré de `type-step.html`.
  - [x] `isMagie` retiré de `type-step.ts` (vérifié : aucun autre usage).
  - [x] `character.magic_deferred_notice` retiré des 3 tons (`tones.ts`).
  - [x] Tests obsolètes retirés de `type-step.spec.ts`.
- [x] Task 6 — Câbler `CharacterSheet` (AC: #4)
  - [x] Computed `magicData` ajouté (résout saison + 2 sorts, `null` si `typeId !== 'magie'` ou saison non résolue).
  - [x] Nouvelle section « Magie » ajoutée juste après la section « Voie » existante.
- [x] Task 7 — Texte d'introduction de l'étape (AC: #1)
  - [x] Entrée `{ key: 'magic', ... }` ajoutée à `wizard-step-intros.json`. **Correction par rapport au texte initial de cette tâche** : les 7 entrées existantes ne sont PAS de la prose UX originale comme supposé pendant `create-story` — ce sont des transcriptions du livre (`docs/assistant.md`, chapitre « Créer un Voyageur »). Aucune section équivalente n'existe dans ce chapitre pour un choix de magie (le livre n'a pas cette étape dédiée). Le texte ajouté combine donc des extraits **verbatim** de `docs/magie.md` (lignes 7, 24, 30) avec une seule phrase de liaison originale (« Choisissez votre saison d'affinité, puis... ») — transparence documentée ici plutôt que présenté à tort comme une transcription pure.
- [x] Task 8 — Tests et suite complète (AC: #1-#5)
  - [x] `validate.spec.ts` : 9 nouveaux tests Règle 7 (manquant/invalide/0-1-3 sorts/doublon/hors catalogue/valide/hors scope si non-magie).
  - [x] `magic-step.spec.ts` (nouveau, 6 tests) : filtrage rituelle/débutant, émission saison, coche/décoche sort, désactivation au-delà de 2, compteur affiché.
  - [x] `character-wizard.spec.ts` : 5 nouveaux tests (visibilité conditionnelle, canGoNext, nettoyage au changement de type, piège de navigation).
  - [x] `type-step.spec.ts` : 2 tests obsolètes retirés (5→3).
  - [x] `character-sheet.spec.ts` : 3 nouveaux tests (affichage résolu, absence si non-magie, pas de crash si magicSeason absent).
  - [x] `character.service.spec.ts` : 1 nouveau test (validSeasons/validDebutantRitualSpells dérivés du contenu seedé).
  - [x] Suite complète : 899/899 API (+1), 976/976 web (+12), 147/147 game-rules (+9), aucune régression.
  - [x] `docker compose exec api pnpm typecheck` propre.

### Review Findings

- [x] [Review][Patch] Règle 7 (`validate.ts`) : `knownRitualSpells` n'est pas vérifié comme tableau avant `new Set(knownRitualSpells)`/`.every(...)` — `create-character.dto.ts` ne valide que la forme générale de `sheetData` (objet non vide), pas la forme de ses champs internes. Un client envoyant `knownRitualSpells` sous forme de nombre ou d'objet (ex. `{}`) fait planter la validation (`TypeError` non intercepté) plutôt que de retourner une erreur 400 propre — potentiellement un 500 Internal Server Error. [`packages/game-rules/src/ryuutama/validate.ts`] — **corrigé** : garde `Array.isArray()` ajoutée, sinon traité comme invalide (erreur 400 propre). Test de régression ajouté (objet au lieu d'un tableau → ne plante pas, `valid: false`).
- [x] [Review][Patch] Message d'erreur `magicSeason` invalide se termine par « Saisons acceptées : » sans rien après si `catalog.validSeasons` est vide (catalogue `season` non peuplé) — message trompeur ne signalant pas l'absence de catalogue. [`packages/game-rules/src/ryuutama/validate.ts`] — **corrigé** : message dédié « (aucune saison disponible dans le catalogue) » quand la liste est vide. Test de régression ajouté.
- [x] [Review][Patch] Correction documentaire (Task 7/Completion Notes) : la phrase d'ouverture du texte d'intro `magic` (« Le personnage peut à tout moment réaliser l'impossible ») n'est PAS tirée de `docs/magie.md` comme indiqué dans la Completion Note — elle est copiée de la description existante du type `magie` dans `types.json` (déjà seedée, book-sourcée elle aussi, mais via un autre fichier). La Completion Note actuelle attribue à tort l'intégralité du texte à `docs/magie.md` lignes 7/24/30. [`_bmad-output/implementation-artifacts/23-9-choix-magie-a-la-creation.md`, Completion Notes Task 7] — **corrigé** : Completion Notes de la Task 7 mises à jour pour attribuer correctement les 3 sources (types.json / docs/magie.md / phrase originale).
- [x] [Review][Defer] Duplication de `SeasonData`/`SpellData` (interfaces locales) et de la logique de filtre `magicType === 'rituelle' && tier === 'debutant'` entre `character.service.ts`, `magic-step.ts` et `character-sheet.ts` — aucun type/utilitaire partagé. [`apps/api/src/characters/character.service.ts`, `apps/web/.../magic-step.ts`, `apps/web/.../character-sheet.ts`] — deferred, refactor de typage pur, même famille que les duplications déjà différées Story 23.8
- [x] [Review][Defer] La constante « exactement 2 sorts » est dupliquée (littérale `2` dans `validate.ts`, `REQUIRED_RITUAL_SPELL_COUNT` dans `magic-step.ts`) sans lien statique entre les deux. [`packages/game-rules/src/ryuutama/validate.ts`, `apps/web/.../magic-step.ts`] — deferred, minutie de refactor
- [x] [Review][Defer] Un seul message d'erreur générique pour 3 causes distinctes de `knownRitualSpells` invalide (nombre incorrect, doublon, sort hors catalogue) — l'utilisateur ne peut pas savoir laquelle s'applique. [`packages/game-rules/src/ryuutama/validate.ts`] — deferred, amélioration UX non bloquante
- [x] [Review][Defer] « État fantôme » théorique : un sort déjà sélectionné (`knownRitualSpells`) qui ne matcherait plus le filtre rituelle/débutant (si le contenu `spell` change entre deux sessions) resterait compté par `canGoNext()`/le compteur sans apparaître dans la liste rendue. Scénario non atteignable aujourd'hui (contenu seedé par l'équipe dev, jamais modifié en cours de session utilisateur). [`apps/web/.../magic-step.ts`] — deferred, aucun mécanisme d'édition de contenu en production ne le déclenche actuellement

## Dev Notes

- **Les 9 sorts éligibles (magicType: "rituelle", tier: "debutant"), déjà seedés Story 23.7 — ne pas en inventer d'autres, ne pas en oublier** : `benediction-main-rouge` (Bénédiction de la main rouge), `cloche-alarme` (Cloche d'alarme), `eclatante-purete-cristal` (Éclatante pureté du cristal), `fleche-boussole` (Flèche-boussole), `imposition-mains` (Imposition des mains), `meteore-magique` (Météore magique), `dressage-sort` (Dressage — clé suffixée `-sort` pour éviter la collision avec le talent de classe `dressage`, cf. Story 23.7), `extase-gustative` (Extase gustative), `sphere-protection` (Sphère de protection).
- **Les 4 saisons, déjà seedées** (`seasons.json`) : `printemps`, `ete`, `automne`, `hiver`.
- **Pourquoi `magicSeason` et pas `seasonAffinity`** : décision explicite de l'utilisateur (create-story, 2026-07-26) — le nom `seasonAffinity` risquait de se confondre avec un futur mécanisme distinct de climat/paysage favori (cf. Story 23.8, Climatophile du Météomancien, qui utilise `classCapabilities`/catalogue `landscape`, pas `season`). Les deux mécanismes n'ont aucun lien, mais un nom trop générique aurait entretenu la confusion.
- **Asymétrie saison/rituelle, cruciale pour ne pas sur-implémenter** : la magie des saisons n'implique **aucune sélection de sorts** — un seul champ (`magicSeason`). Les sorts de saison que le personnage connaît « automatiquement » (tous ceux du palier de son niveau pour sa saison, `docs/magie.md:34`) ne sont **pas stockés** sur la fiche : ils se dérivent à la volée du couple `(magicSeason, niveau du personnage)` en filtrant le catalogue `spell` — mais cette dérivation d'affichage est **hors scope de cette story** (AC5). Ne pas construire cette liste dérivée sans validation explicite de l'utilisateur — se limiter à afficher `magicSeason` tel quel (AC4).
- **Le piège de navigation (step-skip) est le risque technique principal de cette story.** Aucune étape du wizard n'a jamais été conditionnelle jusqu'ici (les 8 étapes actuelles sont toujours toutes présentes, filtrées uniquement par `SUPPORTED_STEP_KEYS` — un filtre **statique**, jamais par une donnée du personnage). C'est la première fois qu'une étape doit apparaître/disparaître **dynamiquement** selon une réponse donnée à une étape antérieure (`typeId`). Piloter par clé plutôt que par index (cf. Task 4) est fortement recommandé pour éviter un index qui se retrouve à pointer sur la mauvaise étape après un aller-retour.
- **Aucun changement à l'export PDF** — déjà vérifié exhaustivement Story 23.7 (aucun champ AcroForm du template officiel n'est lié à la magie). `pdf-field-map.ts`/`ryuutama-pdf.service.ts` restent inchangés.
- **Ne jamais faire confiance au seul client pour ce choix (Règle 7, Task 2)** — enseignement direct de la revue de code Story 23.8 (Blind Hunter + Edge Case Hunter + Acceptance Auditor ont tous les trois indépendamment détecté un contournement de validation serveur sur la Règle 6 initiale, qui ne distinguait pas assez finement les choix par nature). Concevoir la Règle 7 en gardant cette leçon à l'esprit : vérifier le **contenu** (appartenance aux catalogues, nombre exact, absence de doublon), pas seulement la présence.
- **Retrait du placeholder (Task 5) : vérifier qu'`isMagie` n'est utilisé null part ailleurs** dans `type-step.ts` avant suppression — un grep rapide avant de retirer confirmera qu'il ne sert qu'à ce seul bloc conditionnel.

### Project Structure Notes

- Backend : `apps/api/src/game-systems/game-system.service.ts` (`creationSteps`), `apps/api/src/characters/character.service.ts` (`buildRyuutamaCatalog()`), `apps/api/game-systems/ryuutama/data/wizard-step-intros.json` (gitignoré, nouvelle entrée `magic`).
- `packages/game-rules/src/ryuutama/types.ts` (`RyuutamaSheetData`, `RyuutamaCatalog`), `validate.ts` (nouvelle Règle 7, Règles 1-6 inchangées).
- Frontend : nouveau composant `apps/web/src/app/features/characters/character-wizard/steps/magic-step/`, `character-wizard.ts`/`.html` (visibleSteps, canGoNext, updateSheetData, FIELD_TO_STEP_KEY), `type-step.ts`/`.html` (retrait placeholder), `tones.ts` (retrait `character.magic_deferred_notice`), `character-sheet.ts`/`.html` (nouvelle section Magie).
- Aucune migration Prisma (tout vit dans `sheetData: Json`, cohérent avec le reste de `RyuutamaSheetData`).

### References

- [Source: docs/magie.md] — règles réelles de la magie (rituelle vs saisons, notamment lignes 22-34 sur l'asymétrie apprentissage/sélection) et catalogue des sorts Débutant (lignes 121-353 pour la magie rituelle Débutant, seedés Story 23.7)
- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 23.9] — user story et Acceptance Criteria d'origine, section « Ouvert à trancher avant create-story » (résolue par les 3 décisions actées ci-dessus)
- [Source: apps/api/game-systems/ryuutama/data/spells.json] — 75 sorts seedés (Story 23.7), 9 rituels débutants listés en Dev Notes
- [Source: apps/api/game-systems/ryuutama/data/types.json#magie] — description du type Magie, avantages Grimoire/Lié aux saisons déjà seedés (Story 23.7/antérieur)
- [Source: apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.ts,.html] — `isMagie`/`character.magic_deferred_notice`, placeholder à retirer
- [Source: apps/api/src/game-systems/game-system.service.ts:244-253] — `creationSteps` actuel (8 étapes), à étendre à 9
- [Source: apps/web/src/app/features/characters/character-wizard/character-wizard.ts] — `SUPPORTED_STEP_KEYS`, `canGoNext()`, `updateSheetData()`, `FIELD_TO_STEP_KEY`, patterns Story 23.8 (`classChoices`/`classCapabilities`) à répliquer pour `magicSeason`/`knownRitualSpells`
- [Source: packages/game-rules/src/ryuutama/validate.ts] — Règles 1-6 existantes (Règle 6, Story 23.8, tout juste corrigée en revue de code pour être "kind-aware" — s'en inspirer pour concevoir une Règle 7 robuste dès le départ)
- [Source: _bmad-output/implementation-artifacts/23-8-cas-particuliers-de-creation-par-classe.md] — story précédente, pattern de choix à la création + leçons de la revue de code (validation serveur non contournable)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm vitest run src/__tests__/validate.spec.ts"` — 26/26 verts (Règle 7 incluse)
- `docker compose exec web pnpm exec ng test --watch=false --include='**/magic-step.spec.ts'` — 6/6
- `docker compose exec web pnpm exec ng test --watch=false --include='**/character-wizard.spec.ts'` — 33/33
- `docker compose exec web pnpm exec ng test --watch=false --include='**/type-step.spec.ts'` — 3/3
- `docker compose exec web pnpm exec ng test --watch=false --include='**/character-sheet.spec.ts'` — 85/85
- `docker compose exec api pnpm test -- character.service` — 177/177
- Suite complète finale : `docker compose exec api pnpm test` (899/899), `docker compose exec web pnpm test` (976/976), `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm test"` (147/147)
- `docker compose exec api pnpm typecheck` — propre

### Completion Notes List

- Task 1 : `magic` ajouté à `creationSteps` (backend expose la liste complète, jamais conditionnelle — le filtrage de visibilité est une responsabilité du frontend, cf. Task 4). `RyuutamaCatalog.validDebutantRitualSpells` dérivé de `content['spell']` filtré sur `magicType === 'rituelle' && tier === 'debutant'` (9 clés réelles, vérifiées via script Node dans le conteneur `api`).
- Task 2 : Règle 7 conçue dès le départ « kind-agnostic » côté validation de contenu (vérifie appartenance aux catalogues + absence de doublon + nombre exact), en application directe de la leçon de la revue de code Story 23.8. Règle 6 non touchée.
- Task 3 : `MagicStep` ne réutilise PAS `ChoiceCard` pour les sorts (rôle `radio` non adapté à une sélection multiple bornée à 2 avec état désactivé) — cases à cocher HTML natives à la place, `ChoiceCard` réutilisé uniquement pour la saison (sélection unique, cohérent avec `ClassStep`/`TypeStep`).
- Task 4 : refactor architecturale du wizard — `steps` devient un `computed` (au lieu d'un `signal` statique peuplé une fois), navigation pilotée par clé (`currentStepKeyTracked`) plutôt que par index brut, pour rester cohérente si `magic` disparaît de la séquence après un aller-retour. `currentStepIndex`/`currentStepKey` toujours dérivés à la lecture, jamais l'inverse — auto-guérison si la clé suivie n'existe plus. 4 tests existants (`comp.currentStepIndex.set(...)`) adaptés pour utiliser `comp.currentStepKeyTracked.set(comp.steps()[i].key)` (l'API interne a changé, le comportement observable non).
- Task 5 : `isMagie`/`character.magic_deferred_notice` confirmés sans autre usage avant suppression (grep exhaustif). Les 3 occurrences du tone (une par thème) retirées.
- Task 6 : section « Magie » n'affiche rien (retourne `null`) si `magicSeason` ne se résout pas dans le catalogue `season` — jamais de clé brute affichée, cohérent avec le reste de la fiche.
- Task 7 : écart assumé et documenté par rapport au texte initial de la tâche — les entrées `wizardStepIntro` existantes sont en réalité des transcriptions du livre (`docs/assistant.md`), pas de la prose UX originale comme supposé pendant `create-story`. Le livre n'ayant pas de section dédiée à ce choix (cette étape n'existe pas dans le flux de création papier), le texte ajouté mélange trois sources : (1) sa phrase d'ouverture (« Le personnage peut à tout moment réaliser l'impossible ») reprise mot pour mot de la description déjà seedée du type `magie` dans `types.json` (elle-même book-sourcée, seedée lors d'une story antérieure) — **corrigé en revue de code** : l'attribution initiale de cette phrase à `docs/magie.md` était erronée ; (2) des extraits verbatim de `docs/magie.md` (lignes 7, 24, 30) ; (3) une seule phrase de liaison originale (« Choisissez votre saison d'affinité, puis... »).
- Task 8 : 26 nouveaux tests au total (validate +9, magic-step +6 nouveau fichier, character-wizard +5, character-sheet +3, character.service +1) et 2 tests retirés (type-step, placeholder obsolète). Suite complète et typecheck propres, aucune régression.

### File List

- `apps/api/src/game-systems/game-system.service.ts` (modifié)
- `apps/api/src/characters/character.service.ts` (modifié)
- `apps/api/src/characters/character.service.spec.ts` (modifié)
- `apps/api/game-systems/ryuutama/data/wizard-step-intros.json` (modifié, gitignoré)
- `packages/game-rules/src/ryuutama/types.ts` (modifié)
- `packages/game-rules/src/ryuutama/validate.ts` (modifié)
- `packages/game-rules/src/__tests__/validate.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/magic-step/magic-step.ts` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/steps/magic-step/magic-step.html` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/steps/magic-step/magic-step.scss` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/steps/magic-step/magic-step.spec.ts` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.html` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.scss` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.spec.ts` (modifié)
- `apps/web/src/app/core/theme/tones.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié)

### Change Log

- 2026-07-26 : Implémentation complète (Tasks 1-8), tous les critères d'acceptation satisfaits, suite complète verte (899 API / 976 web / 147 game-rules), typecheck API propre. Statut passé à `review`.
- 2026-07-26 : Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 3 patches appliqués (garde `Array.isArray` sur `knownRitualSpells`, message d'erreur `magicSeason` clarifié si catalogue vide, correction d'attribution des Completion Notes Task 7), 4 items différés (`deferred-work.md`), ~8 dismissed. Suite complète re-vérifiée verte (899 API / 149 game-rules, web inchangé). Statut passé à `done`.
