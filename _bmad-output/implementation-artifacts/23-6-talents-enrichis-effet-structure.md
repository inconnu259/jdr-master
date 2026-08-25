---
baseline_commit: 6fb158d6c3f2f31a0045e52bf6c40dd0faa4d3a5
---

# Story 23.6: Talents enrichis (effet structuré)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want comprendre précisément l'effet, les conditions, les attributs et la difficulté de chaque talent,
so that je sache exactement ce que mon talent permet de faire et sous quelles conditions.

## Acceptance Criteria

1. **Given** un talent de classe (toujours exactement 3 par classe, 36 talents au total sur les 12 classes), **when** il est chargé, **then** il porte `{ name, description, effect: { description, conditions }, attributes, difficulty }` — `effect` passe de `string` à un objet `{ description: string, conditions: string }` ; `attributes`/`difficulty` restent des champs frères de `effect`, jamais imbriqués dessous (AD-10). `effect.description` reprend **exactement** la valeur actuelle du champ `effect` (aucun changement de texte) ; `effect.conditions` est un champ nouvellement peuplé, transcrit de la colonne « Conditions » du tableau Effet/Conditions/Attributs/Difficulté de `docs/classes.md` (contenu réel, jamais inventé — cf. Dev Notes pour le contenu complet des 36 talents, y compris la résolution actée d'une coquille OCR source sur le talent Herboristerie).
2. **Given** les tests existants de validation des talents (attributs/difficulté), **when** la nouvelle forme est en place, **then** ils restent valides sans modification — le chemin de lecture `talent.attributes`/`talent.difficulty` ne change pas. `validate.ts` ne référence pas la forme des talents (vérifié, aucune modification requise dans ce fichier).
3. **Given** l'affichage d'un talent dans l'assistant de création (`ClassStep`) et la fiche de personnage (`CharacterSheet`), **when** il est présenté, **then** `talent.description` (déjà existant depuis la Story 23.2) reste visible, distinct du texte de `talent.effect.description` — aucune régression sur l'affichage actuel de l'effet (`talent.effect` interpolé directement devient `talent.effect.description`).
4. **Given** l'export PDF (`ryuutama-pdf.service.ts` / `pdf-field-map.ts`), **when** un talent est mappé vers le champ AcroForm `Effet N`, **then** c'est `talent.effect.description` qui y est écrit (comportement inchangé côté PDF) — `talent.effect.conditions` n'a **aucun** champ AcroForm correspondant sur le template officiel (vérifié exhaustivement, cf. commentaire existant `pdf-field-map.ts:80-101`) et n'est donc mappé nulle part dans le PDF.

## Tasks / Subtasks

- [x] Task 1 — Restructurer `effect` en objet `{ description, conditions }` sur les 36 talents de `classes.json` (AC: #1)
  - [x] Utiliser le contenu de référence ci-dessous (Dev Notes) : `effect.description` = valeur actuelle du champ `effect` (copier tel quel, ne pas reformuler), `effect.conditions` = transcrit de la colonne Conditions de `docs/classes.md`
  - [x] Herboristerie (Guérisseur) : `effect.conditions` = `"Après le test de campement. Une fois par jour."` (décision utilisateur actée en Dev Notes suite à une coquille OCR source, ne pas rouvrir)
  - [x] Préserver intégralement tout le reste de `classes.json` (`id`, `name`, `attributes`, `difficulty`, `description` de chaque talent ; `occupations`/`actions`/`recommendedForBeginners`/`requiresSpecialty` de chaque classe) — seul le champ `effect` de chaque talent change de forme
- [x] Task 2 — Mettre à jour les 4 interfaces locales qui typent `effect: string` sur un talent (AC: #1, #2)
  - [x] `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts` : `ClassTalent.effect` → `{ description: string; conditions: string }`
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` : `ClassData.talents[].effect` → même forme (utilisé pour la classe primaire ET secondaire, une seule interface)
  - [x] `apps/api/src/characters/ryuutama-pdf.service.ts` : `ClassContentData.talents[].effect` → même forme (ligne ~174)
  - [x] `packages/game-rules/src/ryuutama/pdf-field-map.ts` : `TalentField.effect` → même forme (ligne ~30)
  - [x] `TypeStep`/`types.json` non touchés (`advantages[].effect` reste `string`, confirmé hors scope)
- [x] Task 3 — Mettre à jour l'affichage frontend (AC: #3)
  - [x] `class-step.html:26` : `{{ talent.effect }}` → `{{ talent.effect.description }}`
  - [x] `character-sheet.html:177` et `:187` (classe primaire + secondaire) : `{{ talent.effect }}` → `{{ talent.effect.description }}`
  - [x] Rien ajouté pour l'affichage de `effect.conditions` (décision utilisateur actée en Dev Notes)
- [x] Task 4 — Mettre à jour le mapping PDF (AC: #4)
  - [x] `pdf-field-map.ts` ligne ~135 : `value: talent.effect` → `value: talent.effect.description`
  - [x] Rien ajouté pour `effect.conditions` dans le PDF (aucun champ AcroForm correspondant)
- [x] Task 5 — Mettre à jour toutes les fixtures de test touchées par le changement de forme (AC: #2 — non-régression)
  - [x] `apps/web/.../class-step/class-step.spec.ts` : fixtures `CLASSES` (talents `Chasse`/`Transformation`/`Traque`/`Création`) — `effect: 'texte'` → `effect: { description: 'texte', conditions: '...' }` ; assertions ajoutées vérifiant réellement le texte de `effect.description` (gap non couvert avant cette story)
  - [x] `apps/web/.../character-sheet/character-sheet.spec.ts` : fixtures lignes ~19 et ~779 (`talents: [{ name, effect }]`) — même changement de forme + assertion `effect.description` ajoutée. Fixtures `advantages` (lignes ~25, ~815 — type) non touchées, hors scope
  - [x] `apps/api/src/characters/ryuutama-pdf.service.spec.ts` : fixture ligne ~89 (`talents: [{ name: 'Chasse', effect: '...' }]`) — même changement de forme
  - [x] `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` : fixtures lignes 38-40, 223-225, 250 (`content.classTalents`/`secondaryClassTalents`) — même changement de forme ; les assertions existantes (`expect(...find('Effet 1')?.value).toBe('Suit une piste')`) continuent de passer
- [x] Task 6 — Suite de tests complète (AC: #1-#4 — non-régression)
  - [x] 898/898 API, 944/944 web, 131/131 `packages/game-rules` (suite dédiée découverte et exécutée pendant cette story, cf. Debug Log). Aucune régression.
  - [x] `pnpm typecheck` (api) propre

## Dev Notes

- **⚠️ Contenu réel requis, ne jamais inventer/halluciner de texte.** `effect.conditions` est transcrit de la colonne « Conditions » du tableau `| Conditions | Attributs | Difficulté |` de `docs/classes.md`, déjà utilisée pour peupler `attributes`/`difficulty` (Story 23.2) — cette story ajoute simplement la 3ᵉ colonne du même tableau, jusqu'ici ignorée. Convention déjà établie (Story 23.2/23.4) : `-` dans le tableau → transcrire tel quel (`"-"`, pas de traduction en `null`/`""`) ; `Selon talent` → transcrire tel quel (`"Selon talent"`).
- **`effect.description` = copie exacte de la valeur actuelle du champ `effect` du JSON, PAS le texte de la colonne « Effet » du tableau markdown.** Le champ `effect` actuel dans `classes.json` est une **paraphrase courte** établie aux Stories 23.2/23.4 (ex. Chasse : `"Nourrit autant de personnes que le résultat du test, ne peut pas aider à monter le campement"`), distincte du texte long de la cellule « Effet » du tableau source (qui inclut souvent des règles de réussite/échec critique non reprises dans la paraphrase — décision déjà actée aux stories précédentes, non remise en cause ici). **Ne pas réextraire depuis `docs/classes.md` pour ce sous-champ** — copier `classes.json` tel quel dans `effect.description`.
- **Aucun changement de code au-delà des interfaces/mappings listés dans les Tasks.** `GameSystemService`/`CONTENT_TYPES` lisent `classes.json` sans validation de forme (`data: unknown`) — pas de migration/schéma à mettre à jour côté API.
- **`pnpm typecheck` est le filet de sécurité principal de cette story** : le changement `effect: string` → `effect: { description, conditions }` est un changement de type strict sur 4 interfaces locales distinctes (pas de type partagé `ClassTalent` dans `packages/shared` — chaque fichier consommateur définit sa propre interface, cf. Story 23.5 qui avait déjà cette caractéristique pour `occupations`/`actions`). Une interface oubliée provoquera soit une erreur `tsc`, soit — si le fichier ne type pas explicitement le champ (cast `as X`/`unknown`) — un bug silencieux affichant `[object Object]` à l'écran ou dans le PDF. Vérifier chacun des 4 fichiers de la Task 2 individuellement après modification.

### Contenu de référence — `effect.conditions` par talent (source : `docs/classes.md`, colonne « Conditions »)

| Classe | Talent | Conditions (à transcrire dans `effect.conditions`) |
| --- | --- | --- |
| Artisan | Création | `Durée: encombrement de l'objet en jours. Coût: moitié de son prix.` |
| Artisan | Réparation | `Durée: encombrement de l'objet en heures. Coût: 10% de son prix.` |
| Artisan | Transformation | `Avoir accès à la dépouille d'un monstre.` *(source : « Acoir », coquille OCR corrigée en « Avoir »)* |
| Chasseur | Chasse | `Avant le test de campement. Une fois par jour.` |
| Chasseur | Transformation | `Avoir accès à la dépouille d'un monstre.` |
| Chasseur | Traque | `Avoir découvert les traces d'un monstre.` |
| Fermier | Dressage | `-` |
| Fermier | Métier d'appoint | `Selon talent` |
| Fermier | Robuste | `-` |
| Guérisseur | Elixir miracle | `La cible subit un état et n'a pas reçu d'elixir aujourd'hui.` |
| Guérisseur | Herboristerie | `Après le test de campement. Une fois par jour.` *(source : « Après le test de conditionµ. » — coquille OCR illisible, résolue par décision utilisateur par analogie avec Chasse/Chasseur, structure identique)* |
| Guérisseur | Soins | `Dépenser une unité d'herbes de soins et une unité d'eau.` |
| Marchand | Commerce | `Négocier au moins 4 objets du même type.` |
| Marchand | Dressage | `-` |
| Marchand | Éloquence | `-` |
| Ménestrel | Légendes | `Un sujet spécifique est évoqué devant le personnage.` |
| Ménestrel | Mélodies | `Être dans le paysage ou le climat de la mélodie. Dépenser 1 PV.` |
| Ménestrel | Voyages | `-` |
| Noble | Érudition | `Un sujet spécifique est évoqué devant le personnage.` |
| Noble | Escrime | `-` |
| Noble | Étiquette | `-` |
| Dresseur | Autorité | `-` |
| Dresseur | Dressage | `-` |
| Dresseur | Invocation | `Coût: 1 heure et 1PV par niveau de monstre.` |
| Ermite | Métamorphose | `-` |
| Ermite | Mystères | `Un sujet spécifique est évoqué devant le personnage.` |
| Ermite | Métier d'appoint | `Selon talent` |
| Météomancien | Climatophile | `Être confronté à son climat favori.` |
| Météomancien | Imperméable | `-` |
| Météomancien | Prévisions | `Durée: niveau du paysage en heures.` |
| Navigateur | Boit-sans-soif | `Avoir bu de l'alcool le jour précédent.` |
| Navigateur | Navigation | `-` |
| Navigateur | Réparation | `Durée: encombrement de l'objet en heures (cf. p. 44 Livre de Base). Coût: 10% du prix.` |
| Professeur | Consignes | `Pouvoir communiquer avec son compagnon.` |
| Professeur | Érudition | `Un sujet spécifique est évoqué devant le personnage.` |
| Professeur | Sermon | `-` |

**Point d'ambiguïté de source résolu — Guérisseur / Herboristerie.** `docs/classes.md` ligne 176 donne : `| Après le test de conditionµ. Une fois par jour. | VIG+INT | Paysage |` — le `µ` est un artefact OCR manifeste sur le mot qui suit « condition ». **Décision actée avec l'utilisateur pendant `create-story` (2026-07-26) : transcrire `"Après le test de campement. Une fois par jour."`**, par analogie avec le talent Chasse du Chasseur (structure de condition identique : fréquence quotidienne liée au test de campement). Ne pas rouvrir cette décision.

**Décision utilisateur (create-story, 2026-07-26) — affichage de `effect.conditions` : non, pour l'instant.** Cette story se limite au modèle de données : `effect.conditions` est peuplé dans `classes.json` mais **n'est affiché nulle part** (ni `ClassStep`, ni `CharacterSheet`, ni PDF — aucun de ces trois n'a de champ AC dédié à sa présentation dans cette story). L'affichage éventuel de ce champ sera traité par une future story UI dédiée si le besoin se confirme. Task 3 ne doit donc **rien ajouter** à l'affichage au-delà du renommage `talent.effect` → `talent.effect.description`.

### Project Structure Notes

- Fichier de données : `apps/api/game-systems/ryuutama/data/classes.json` (existant, gitignoré) — seul fichier de contenu modifié.
- Fichiers frontend à modifier : `class-step.ts`/`.html`, `character-sheet.ts`/`.html`.
- Fichiers `apps/api` à modifier : `ryuutama-pdf.service.ts` (interface locale uniquement, pas de logique).
- Fichier `packages/game-rules` à modifier : `pdf-field-map.ts` (interface locale + une ligne de mapping).
- Fichiers de test à modifier : `class-step.spec.ts`, `character-sheet.spec.ts`, `ryuutama-pdf.service.spec.ts`, `pdf-field-map.spec.ts` — 4 fichiers, uniquement les fixtures de talents (pas les fixtures `advantages`/type).
- Aucun fichier `validate.ts` à modifier (confirmé : aucune référence à la forme des talents).
- Aucune migration Prisma, aucun nouveau `ContentType` — `class` existe déjà, forme interne du contenu JSON non validée par le backend.

### References

- [Source: docs/classes.md] — texte réel des colonnes Conditions des 36 talents (lignes 1-552)
- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 23.6] — user story et Acceptance Criteria d'origine
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-24/prd.md#FR-6] — "Chaque talent d'une classe... porte un effet structuré composé d'une description de l'effet, de ses conditions d'application, des attributs concernés (existant) et d'une difficulté (existant)."
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md#AD-10] — "`{ name: string, description: string, effect: { description: string, conditions: string }, attributes: string[], difficulty: string }` — `attributes` et `difficulty` restent des champs frères de `effect`"
- [Source: _bmad-output/implementation-artifacts/23-5-occupations-et-actions-par-classe.md] — story précédente : forme exacte de `classes.json`, précédent de non-câblage `character-sheet` pour la description de classe (non applicable ici — `talent.effect` est, lui, déjà câblé des deux côtés)
- [Source: apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts:8-12,26] — `ClassTalent` et son affichage actuels
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.ts:40-43] et [character-sheet.html:169-192] — `ClassData`/affichage classe primaire+secondaire
- [Source: apps/api/src/characters/ryuutama-pdf.service.ts:172-175,425,433] — `ClassContentData`, passage direct `classData?.talents` → `content.classTalents`
- [Source: packages/game-rules/src/ryuutama/pdf-field-map.ts:28-34,132-141] — `TalentField`, mapping vers les champs AcroForm `Effet 1-6`, commentaire exhaustif sur les champs PDF non couverts (lignes 80-101, confirme l'absence de champ « Conditions »)
- [Source: packages/game-rules/src/ryuutama/validate.ts] — confirmé : aucune référence à la forme des talents

### Review Findings

- [x] [Review][Decision] 9 fichiers `.js` compilés obsolètes restants dans `packages/game-rules/src/ryuutama/` (+ `src/index.js`) masquaient activement leurs sources `.ts` sous la résolution par défaut de Vitest (confirmé : chaque `*.spec.ts` correspondant importe sans extension, aucun `vitest.config.*` n'existe dans le monorepo). Décision utilisateur : supprimer les 10 fichiers maintenant (`git rm`) — aucun import explicite `.js` trouvé nulle part, `package.json` de `game-rules` pointe déjà `main`/`exports`/`types` vers `src/index.ts`, dernier commit ayant touché ces fichiers très antérieur (`68372bd`). 131/131 tests `game-rules` + 898/898 API + 944/944 web reconfirmés après suppression.
- [x] [Review][Patch] `character-wizard.spec.ts` (lignes ~29,34) gardait une fixture `effect: string` obsolète pour des talents de classe, jamais mise à jour dans cette story — corrigé en `effect: { description, conditions }` (fixture `advantages`/type ligne ~42 non touchée, hors scope).
- [x] [Review][Patch] Commentaire de `pdf-field-map.ts` (docblock de `mapToPdfFields`) ne mentionnait pas explicitement que `effect.conditions` n'a aucun champ AcroForm correspondant — ligne ajoutée pour éviter qu'un futur lecteur ne pense à un oubli.
- [x] [Review][Defer] Aucun type `TalentEffect` partagé — 4 interfaces locales identiques (`class-step.ts`, `character-sheet.ts`, `ryuutama-pdf.service.ts`, `pdf-field-map.ts`) redéfinissent chacune `{ description, conditions }` séparément. Cohérent avec le pattern déjà établi (aucun type de talent partagé dans `packages/shared` avant cette story non plus) — deferred, pre-existing pattern.
- [x] [Review][Defer] Aucune garde défensive (`?.`) sur `talent.effect.description` aux 4 points d'accès — une entrée malformée dans `classes.json` (gitignoré, édité à la main, aucune validation runtime) provoquerait un crash `TypeError` plutôt qu'une dégradation silencieuse. Cohérent avec la discipline déjà acceptée sur ce même fichier de contenu (`talents`/`description`/`occupations`/`actions` non gardés non plus, cf. Story 23.5) — deferred, pre-existing pattern.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- **Découverte non anticipée par la story (dette pré-existante) :** `packages/game-rules/src/ryuutama/` contenait 10 fichiers `.js` compilés obsolètes, jumeaux stagnants des sources `.ts` (dernière régénération : commit `68372bd`, ancien). `package.json` de ce package ne référence que les `.ts` (`main`/`exports` → `src/index.ts`), aucun script `build` n'existe — ces `.js` sont des artefacts morts, jamais mis à jour depuis. Le résolveur par défaut de Vitest (aucun `vitest.config.*` dans ce package) préfère `.js` à `.ts` à extension égale, donc `pdf-field-map.spec.ts` chargeait silencieusement `pdf-field-map.js` (obsolète) au lieu de `pdf-field-map.ts` (modifié par cette story) — 2 tests ont échoué en pointant vers l'ancien code (`talent.effect` brut au lieu de `.description`), révélant le problème. Corrigé en supprimant `pdf-field-map.js` (`git rm`) : aucun import explicite `.js` trouvé nulle part dans le repo, package.json ne le référence pas, suppression sans risque. **Les 9 autres `.js` obsolètes du dossier (+ `src/index.js`) n'avaient initialement pas été touchés** (hors scope initial de l'implémentation) — confirmés comme le même risque actif lors de la revue de code, et supprimés à ce moment-là (décision utilisateur, cf. Review Findings).
- `docker compose exec api sh -c "cd /work/packages/game-rules && pnpm test"` est la commande pour lancer la suite dédiée de ce package (`vitest run`), non couverte par les commandes `pnpm test` habituelles d'`apps/api`/`apps/web`.

### Completion Notes List

- Implémentée le 2026-07-26. `talent.effect` restructuré de `string` à `{ description, conditions }` sur les 36 talents de `classes.json`, `effect.description` = valeur exacte de l'ancien champ (aucun texte modifié), `effect.conditions` transcrit de la colonne « Conditions » de `docs/classes.md` (décision utilisateur actée pour la coquille OCR d'Herboristerie).
- 4 interfaces locales mises à jour (`class-step.ts`, `character-sheet.ts`, `ryuutama-pdf.service.ts`, `pdf-field-map.ts`) + 2 templates + 1 ligne de mapping PDF. `TypeStep`/`types.json`/`validate.ts` non touchés (confirmé hors scope). Aucun affichage ajouté pour `effect.conditions` (décision utilisateur, donnée prête mais invisible).
- Fixtures des 4 fichiers de test mises à jour ; assertions renforcées sur `effect.description` dans `class-step.spec.ts`/`character-sheet.spec.ts` (gap de couverture pré-existant, non testé avant cette story).
- Dette pré-existante découverte et partiellement corrigée : fichiers `.js` obsolètes dans `packages/game-rules/src/ryuutama/` masquant les sources `.ts` réelles en test (cf. Debug Log) — seul `pdf-field-map.js` supprimé (celui bloquant cette story), les 9 autres restent en l'état, item à signaler en revue de code.
- Suite finale : 898/898 tests API, 944/944 tests web, 131/131 tests `packages/game-rules`, `pnpm typecheck` (api) propre, aucune régression.

### File List

- `apps/api/game-systems/ryuutama/data/classes.json` (modifié — gitignoré, `effect` restructuré sur les 36 talents)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts` (modifié — `ClassTalent.effect` restructuré)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.html` (modifié — `talent.effect` → `talent.effect.description`)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts` (modifié — fixtures + assertions)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` (modifié — `ClassData.talents[].effect` restructuré)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html` (modifié — `talent.effect` → `talent.effect.description`, classe primaire + secondaire)
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (modifié — fixtures + assertion)
- `apps/api/src/characters/ryuutama-pdf.service.ts` (modifié — `ClassContentData.talents[].effect` restructuré)
- `apps/api/src/characters/ryuutama-pdf.service.spec.ts` (modifié — fixture)
- `packages/game-rules/src/ryuutama/pdf-field-map.ts` (modifié — `TalentField.effect` restructuré, mapping `Effet N` lit `.description`)
- `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` (modifié — fixtures)
- `packages/game-rules/src/ryuutama/pdf-field-map.js` (supprimé — artefact compilé obsolète masquant `pdf-field-map.ts` en test, cf. Debug Log)
- `packages/game-rules/src/ryuutama/{compute-derived,equipment-pdf-field-map,homme-dragon-derived,homme-dragon-pdf-field-map,leveling,notes-pdf-field-map,types,validate-homme-dragon,validate}.js` (supprimés en revue de code — même artefact obsolète, décision utilisateur)
- `packages/game-rules/src/index.js` (supprimé en revue de code — réexportait les `.js` obsolètes ci-dessus, jamais chargé par `package.json`)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts` (modifié en revue de code — fixture `effect` obsolète corrigée)

## Change Log

- 2026-07-26 : Story créée (bmad-create-story). Contenu `effect.conditions` des 36 talents transcrit en Dev Notes depuis `docs/classes.md`, décisions utilisateur obtenues (coquille OCR Herboristerie, non-affichage de `conditions`).
- 2026-07-26 : Implémentée (bmad-dev-story). `talent.effect` restructuré en `{ description, conditions }` sur les 36 talents (`classes.json`) et propagé sur 4 interfaces + 2 templates + 1 mapping PDF. Dette pré-existante découverte et corrigée en cours de route : fichier `.js` obsolète masquant `pdf-field-map.ts` en test (supprimé). 898/898 tests API + 944/944 tests web + 131/131 tests game-rules, aucune régression. Statut passé à "review".
- 2026-07-26 : Revue de code (bmad-code-review, 3 couches adversariales). 1 décision utilisateur (suppression des 9 autres fichiers `.js` obsolètes de `packages/game-rules/src/ryuutama/` + `src/index.js`, même risque de masquage confirmé actif par l'Edge Case Hunter) + 2 patches (fixture `effect` obsolète dans `character-wizard.spec.ts` ; commentaire PDF complété pour `effect.conditions`) + 2 items différés (pas de type `TalentEffect` partagé ; pas de garde défensive sur `talent.effect.description` — tous deux cohérents avec des patterns déjà acceptés) + 6 écartés. 898/898 tests API + 944/944 tests web + 131/131 tests game-rules reconfirmés après corrections. Statut passé à "done".
