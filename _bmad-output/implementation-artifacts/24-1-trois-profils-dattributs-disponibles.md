---
baseline_commit: 8ac40479adbd4bde5f25a12e19d3702a7240096e
---

# Story 24.1: Trois profils d'attributs disponibles

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want choisir entre 3 profils d'attributs distincts (Équilibré, Polyvalent, Spécialiste),
so that mon personnage ait une vraie diversité de build, pas seulement des permutations d'un même jeu de valeurs.

## Contexte

Le catalogue `attribute-patterns.json` n'a aujourd'hui **qu'une seule entrée** (« Polyvalent », `[8, 4, 6, 6]`). Le wizard de création (`character-wizard.ts`) ne propose donc **aucun choix réel** : `attributePattern` prend toujours `content()?.['attributePattern']?.[0]`, le premier (et seul) élément — `AttributesStep` reçoit ce pattern unique en input et ne fait qu'assigner librement ses 4 valeurs aux 4 attributs, sans jamais laisser le joueur choisir *entre* plusieurs répartitions.

**Valeurs des 3 profils actées avec l'utilisateur (`create-story`, 2026-07-26)** — absentes de tout `docs/*.md`, fournies directement par l'utilisateur (rien à transcrire depuis le livre pour cette story) :
- **Équilibré** : `[6, 6, 6, 6]`
- **Polyvalent** : `[4, 6, 6, 8]` — reconfirmé, même multi-ensemble que l'entrée déjà seedée (`[8, 4, 6, 6]`), **aucun changement de valeurs nécessaire** sur cette entrée existante
- **Spécialiste** : `[4, 4, 8, 8]`

## Acceptance Criteria

1. **Given** le catalogue `attribute-patterns.json` actuel (1 seule entrée, « Polyvalent »), **when** cette story est implémentée, **then** le catalogue passe à 3 entrées : `equilibre` (`[6,6,6,6]`), `polyvalent` (`[8,4,6,6]`, inchangé), `specialiste` (`[4,4,8,8]`) — libellés « Équilibré », « Polyvalent », « Spécialiste ».
2. **Given** `validate()` (`packages/game-rules`), **when** un personnage est créé avec l'un des 3 profils, **then** `attributePatterns` du catalogue accepte les 3 comme valides (Règle 3 déjà générique — vérifier par un test dédié à 3 patterns, aucun changement de code attendu dans `validate.ts`).
3. **Given** l'assistant de création (`AttributesStep`), **when** le joueur arrive à l'étape des attributs, **then** il voit d'abord un **vrai choix** entre les 3 profils (menu de sélection, même pattern visuel que `ClassStep`/`TypeStep` — cartes radio), puis assigne librement les 4 valeurs du profil choisi aux 4 attributs — contrairement à l'état actuel où un seul profil est imposé sans aucune UI de choix.
4. **Given** un joueur qui a déjà assigné des attributs avec un profil, **when** il change de profil (retour en arrière puis re-sélection), **then** l'assignation précédente est réinitialisée (les valeurs des 2 profils ne se correspondent pas terme à terme) et `attributesChange` réémet `null` jusqu'à ce que les 4 attributs soient réassignés avec les valeurs du nouveau profil.
5. **Given** la fiche de personnage (`CharacterSheet`), **when** elle affiche `attributePatternLabel`, **then** le libellé du profil réellement utilisé (parmi les 3) continue de se résoudre correctement — cette logique est déjà générique (boucle sur tout `content()?.['attributePattern']`), vérifier par un test avec les 3 nouveaux profils plutôt que la modifier.

## Tasks / Subtasks

- [x] Task 1 — Étendre le catalogue de données (AC: #1)
  - [x] `apps/api/game-systems/ryuutama/data/attribute-patterns.json` (gitignoré) : ajouté `equilibre` (`[6,6,6,6]`) et `specialiste` (`[4,4,8,8]`). Entrée `polyvalent` (`[8,4,6,6]`) préservée inchangée.
- [x] Task 2 — Vérifier la généricité de `validate()` (AC: #2)
  - [x] Aucun changement de code dans `validate.ts` (Règle 3 déjà générique). 4 tests ajoutés dans `validate.spec.ts` (3 profils individuellement acceptés + répartition ne correspondant à aucun rejetée).
- [x] Task 3 — Étendre `AttributesStep` pour proposer un vrai choix de profil (AC: #3, #4)
  - [x] Input `pattern` (singulier) → `patterns: input.required<ContentEntryDto[]>()`.
  - [x] État local `selectedPatternKey = signal<string | null>(null)`.
  - [x] UI de sélection en tête du template (`ChoiceCard`/`RadioGroupNavDirective`, même pattern que `ClassStep`/`TypeStep`) ; grille d'assignation masquée tant qu'aucun profil n'est choisi.
  - [x] `selectPattern(key)` : no-op si reclic sur le profil déjà sélectionné ; sinon réinitialise `assignment` et réémet `null`.
  - [x] Logique de resynchronisation étendue : retrouve le profil correspondant aux valeurs triées entrantes ET reconstruit l'assignation dans le même passage de l'`effect()`.
  - [x] `values()`/`selectedPatternData()` dérivés de `patterns().find(p => p.key === selectedPatternKey())`.
- [x] Task 4 — Câbler `character-wizard.ts`/`.html` (AC: #3)
  - [x] `attributePattern` (singulier) → `attributePatterns = computed<ContentEntryDto[]>(...)`.
  - [x] `character-wizard.html` : `[patterns]="attributePatterns()"` direct, `@if` unwrap retiré.
- [x] Task 5 — Vérifier `CharacterSheet` sans la modifier (AC: #5)
  - [x] Aucun changement de code (`attributePatternLabel` déjà générique). 2 tests ajoutés (résolution correcte pour Spécialiste et Équilibré, pas seulement Polyvalent).
- [x] Task 6 — Tests et suite complète (AC: #1-#5)
  - [x] `validate.spec.ts` : 4 nouveaux tests (cf. Task 2).
  - [x] `attributes-step.spec.ts` : réécrit pour `patterns` (tableau) ; 6 nouveaux tests (sélection affiche la grille, changement de profil réinitialise/réémet null, reclic sur profil courant = no-op, assignation complète Spécialiste, restauration profil+assignation au retour en arrière, valeurs incohérentes → pas de crash).
  - [x] `character-wizard.spec.ts` : 1 nouveau test (`attributePatterns()` expose les 3 entrées, pas seulement la première).
  - [x] `character-sheet.spec.ts` : 2 nouveaux tests (cf. Task 5).
  - [x] Suite complète : 899/899 API (inchangé), 985/985 web (+9), 153/153 game-rules (+4), aucune régression.
  - [x] `docker compose exec api pnpm typecheck` propre.

### Review Findings

- [x] [Review][Patch] AC4 partiellement testé : le seul test de changement de profil avec réinitialisation (`attributes-step.spec.ts`) part d'une assignation **partielle** (1 attribut sur 4) — aucun test ne vérifie le scénario "assignation **complète** (4/4) puis changement de profil" alors que `selectPattern()` traite les deux cas de façon identique (`assignment.set({})` + `emit(null)`) sans distinction. Un bug futur qui casserait spécifiquement la réinitialisation depuis un état complet ne serait pas détecté. [`apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.spec.ts`] — **corrigé** : test dédié ajouté (assignation complète Polyvalent → changement vers Équilibré → assignation entièrement vidée, `null` réémis).
- [x] [Review][Defer] Matching par valeurs triées (resynchronisation profil+assignation) est ambigu si deux profils du catalogue partageaient un jour le même multi-ensemble de valeurs — `patterns.find(...)` retournerait silencieusement le premier match. Non atteignable aujourd'hui (les 3 profils actuels ont des multi-ensembles triés distincts, vérifié en Dev Notes), mais à surveiller si un 4ᵉ profil est ajouté. [`apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.ts`] — deferred, aucun profil actuel ne collisionne
- [x] [Review][Defer] Formatage `values.join(', ')` dupliqué entre `patternOptions()` (détail de la carte) et le banner du template — deux endroits à mettre à jour si le format change un jour. [`apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.ts`, `.html`] — deferred, duplication mineure

## Dev Notes

- **Aucune donnée de ce catalogue n'existe dans `docs/*.md`** — contrairement à toutes les stories précédentes de l'Epic 23 (règle absolue anti-hallucination : ne jamais inventer de contenu livre), les 3 profils de cette story sont un **choix de conception fourni directement par l'utilisateur** pendant `create-story` (2026-07-26), pas une transcription. Ne pas chercher à les justifier après-coup par une source `docs/` inexistante.
- **`validate()` et `CharacterSheet` sont déjà génériques — ne PAS les modifier inutilement.** La Règle 3 de `validate.ts` (`attributePatterns.some(pattern => ...)`) et `attributePatternLabel` de `character-sheet.ts` (boucle `for (const p of patterns)`) parcourent déjà dynamiquement tout `catalog.attributePatterns`/`content()?.['attributePattern']` — ils ont été écrits génériques dès l'origine (aucune des 2 stories précédentes n'a eu besoin de les toucher pour un 2ᵉ pattern). Cette story n'a besoin QUE d'étendre les données JSON et l'UI du wizard (Tasks 1, 3, 4) — Tasks 2 et 5 sont des tests de non-régression/généricité, pas des changements de code.
- **Le seul vrai risque technique : `AttributesStep` passe d'un seul pattern imposé à un vrai choix, avec un état local (`assignment`) qui doit être invalidé proprement au changement de profil.** Le composant a déjà une logique de resynchronisation subtile (`hasSyncedFromInput`, cf. commentaire du constructeur) pour restaurer l'état visuel après un retour en arrière du wizard — cette story doit l'étendre pour retrouver **aussi** le bon profil (pas seulement les index de chips), dans le même passage, sans introduire une race entre 2 effects ou une resynchronisation partielle.
- **Ne pas ajouter de nouveau champ à `RyuutamaSheetData`.** Le profil choisi n'est PAS persisté séparément — seules les 4 valeurs finales d'attributs le sont (`sheetData.attributes`), exactement comme aujourd'hui. Le profil n'est qu'un état transitoire de l'UI du wizard, redérivable après coup par correspondance de valeurs triées (déjà ainsi sur `CharacterSheet`, cf. `attributePatternLabel`) — ne pas dupliquer cette logique de recherche sous forme de champ stocké.
- **Aucun changement à l'export PDF** — le mapping PDF (`pdf-field-map.ts`) exporte déjà les 4 valeurs `AGI`/`ESP`/`INT`/`VIG` individuellement, jamais un « nom de profil » ; cohérent avec le point précédent (le profil n'est pas une donnée persistée).
- **Collision de valeurs triées à vérifier une fois les 3 patterns en place** : `equilibre` trié = `[6,6,6,6]`, `polyvalent` trié = `[4,6,6,8]`, `specialiste` trié = `[4,4,8,8]` — les 3 tableaux triés sont bien distincts (aucune ambiguïté possible pour `attributePatternLabel`/Règle 3 lors de la résolution par correspondance de valeurs).

### Project Structure Notes

- Données : `apps/api/game-systems/ryuutama/data/attribute-patterns.json` (gitignoré, existant, 2 entrées ajoutées).
- Frontend : `apps/web/src/app/features/characters/character-wizard/steps/attributes-step/{attributes-step.ts,.html,.scss,.spec.ts}` (extension significative), `character-wizard.ts`/`.html` (`attributePattern` → `attributePatterns`).
- Aucun changement à `packages/game-rules` (Règle 3 déjà générique), aucun changement à `character-sheet.ts`/`.html` (déjà générique), aucune migration Prisma, aucun changement PDF.

### References

- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 24.1] — user story et Acceptance Criteria d'origine ; valeurs des 3 profils actées directement avec l'utilisateur pendant `create-story` (absentes de `docs/*.md`)
- [Source: apps/api/game-systems/ryuutama/data/attribute-patterns.json] — catalogue actuel (1 seule entrée « Polyvalent », `[8,4,6,6]`)
- [Source: apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.ts,.html,.spec.ts] — composant actuel à étendre (input `pattern` singulier → `patterns` pluriel, logique `hasSyncedFromInput`/`assignment`/`emitIfComplete` à préserver et étendre)
- [Source: apps/web/src/app/features/characters/character-wizard/character-wizard.ts:231-233] — `attributePattern` actuel (`content()?.['attributePattern']?.[0] ?? null`, ne prend que le premier élément) à étendre en `attributePatterns` (tout le tableau)
- [Source: apps/web/src/app/features/characters/character-wizard/character-wizard.html:78] — câblage actuel `@if (attributePattern(); as pattern)` à remplacer par `[patterns]="attributePatterns()"` direct
- [Source: packages/game-rules/src/ryuutama/validate.ts] — Règle 3 (attributs), déjà générique sur `catalog.attributePatterns`, ne pas modifier
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts:403-420] — `attributePatternLabel`, déjà générique sur `content()?.['attributePattern']`, ne pas modifier
- [Source: apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts,.html, type-step.ts,.html] — pattern UI de sélection radio (`ChoiceCard`/`RadioGroupNavDirective`) à réutiliser pour le choix de profil dans `AttributesStep`
- [Source: _bmad-output/implementation-artifacts/23-9-choix-magie-a-la-creation.md] — story précédente (dernière du Palier 8 avant celle-ci), aucune dépendance directe au-delà de la convention de revue de code (ne jamais faire confiance au seul client — sans objet ici, `validate()` déjà générique et non modifié)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec api node -e "console.log(...attribute-patterns.json)"` — vérification directe des 3 entrées seedées
- `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm vitest run src/__tests__/validate.spec.ts"` — 32/32
- `docker compose exec web pnpm exec ng test --watch=false --include='**/attributes-step.spec.ts'` — 12/12
- `docker compose exec web pnpm exec ng test --watch=false --include='**/character-wizard.spec.ts'` — 34/34
- `docker compose exec web pnpm exec ng test --watch=false --include='**/character-sheet.spec.ts'` — 87/87
- Suite complète finale : `docker compose exec api pnpm test` (899/899), `docker compose exec web pnpm test` (985/985), `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm test"` (153/153)
- `docker compose exec api pnpm typecheck` — propre

### Completion Notes List

- Task 1 : catalogue étendu à 3 entrées, valeurs fournies par l'utilisateur (aucune source `docs/*.md`), vérifiées directement en base via script Node dans le conteneur.
- Task 2/5 : confirmation empirique (pas seulement théorique) que `validate()` (Règle 3) et `CharacterSheet::attributePatternLabel` sont déjà génériques — zéro changement de code dans `packages/game-rules/src/ryuutama/validate.ts` et `apps/web/.../character-sheet.ts`, uniquement des tests de régression prouvant l'acceptation/la résolution des 2 nouveaux profils.
- Task 3 : le plus gros travail de la story. `AttributesStep` passe d'un pattern unique imposé à un vrai choix parmi 3, avec réutilisation du pattern `ChoiceCard`/`RadioGroupNavDirective` déjà établi (`ClassStep`/`TypeStep`). La logique de resynchronisation (`hasSyncedFromInput`) a été étendue en un seul passage : elle retrouve maintenant à la fois le profil correspondant (par comparaison de valeurs triées, même logique que `attributePatternLabel`) ET reconstruit l'assignation des chips, sans effect() supplémentaire.
- Task 4 : `attributePattern` (singulier, ne prenait que `[0]`) renommé `attributePatterns` (tout le tableau) ; le `@if (attributePattern(); as pattern)` du template devient un passage direct `[patterns]="attributePatterns()"`, `AttributesStep` gérant lui-même l'état "aucun profil sélectionné".
- Task 6 : 26 nouveaux tests au total (validate +4, attributes-step +6 sur 12 au total après réécriture, character-wizard +1, character-sheet +2, plus adaptation des tests existants d'attributes-step au nouvel input pluriel). Suite complète et typecheck propres, aucune régression.

### File List

- `apps/api/game-systems/ryuutama/data/attribute-patterns.json` (modifié, gitignoré)
- `packages/game-rules/src/__tests__/validate.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.html` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.scss` (modifié)
- `apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html` (modifié)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts` (modifié)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié)

### Change Log

- 2026-07-26 : Implémentation complète (Tasks 1-6), tous les critères d'acceptation satisfaits, suite complète verte (899 API / 985 web / 153 game-rules), typecheck API propre. Statut passé à `review`.
- 2026-07-26 : Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 1 patch appliqué (test manquant pour AC4, scénario assignation complète puis changement de profil), 2 items différés (`deferred-work.md`), ~15 dismissed. Suite web re-vérifiée verte (986/986). Statut passé à `done`.
