---
baseline_commit: 6fb158d6c3f2f31a0045e52bf6c40dd0faa4d3a5
---

# Story 23.5: Occupations et actions par classe

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want voir une liste d'occupations et une liste d'actions pour ma classe,
so that j'aie des pistes de jeu et d'idées de métier pour mon personnage.

## Acceptance Criteria

1. **Given** une classe seedée dans `classes.json` (12 entrées depuis la Story 23.4), **when** elle est chargée, **then** elle porte un champ `occupations: string[]` et un champ `actions: string[]`, tous deux transcrits tels quels de `docs/classes.md` (aucun contenu inventé, même règle absolue que les Stories 23.1-23.4 — cf. Dev Notes pour le cas particulier du Dresseur, seule classe sans section « Occupations » dans le livre).
2. **Given** `ClassStep` (assistant de création), **when** une classe est sélectionnée, **then** ses listes d'occupations et d'actions s'affichent à l'écran, en texte de référence pur — aucun élément interactif, aucune sélection ni saisie possible dessus (cohérent avec l'affichage déjà en place pour `description`/`talents`).
3. **Given** cette story, **when** elle est complétée, **then** elle ne touche ni `character-sheet.ts`/`.html` (la fiche de personnage n'affiche déjà pas le champ `description` de la classe aujourd'hui — précédent établi par la Story 23.1 de ne pas câbler ce contenu narratif sur la fiche, seulement sur l'assistant), ni `TypeStep`, ni aucun autre consommateur de `classes.json` (`validate.ts`, `pdf-field-map.ts`) — ce sont deux champs de texte pur sans impact sur la validation ni l'export PDF.
4. **Given** le talent *Métier d'appoint* (Fermier, Ermite — cf. Story 23.8 à venir), **when** cette story est complétée, **then** elle n'ajoute aucune mécanique de choix ni de filtrage sur les occupations/actions — uniquement de l'affichage passif.

## Tasks / Subtasks

- [x] Task 1 — Ajouter `occupations`/`actions` aux 12 classes dans `classes.json` (AC: #1)
  - [x] Utiliser le contenu de référence ci-dessous (Dev Notes), transcrit de `docs/classes.md`, avec les corrections typographiques signalées explicitement dans les Dev Notes (ne pas en introduire de nouvelles sans les documenter — leçon de la revue de code de la Story 23.4, où des corrections avaient été appliquées sans être toutes documentées)
  - [x] Cas particulier Dresseur (AC: #1) : `occupations` = `["Botarcaniste", "Démoniste", "Dompteur", "Mathémagicien", "Nécromant"]` (décision utilisateur actée en Dev Notes, ne pas rouvrir)
  - [x] Préserver intégralement tout le contenu existant de `classes.json` (descriptions, talents avec leur champ `id` ajouté lors de la revue de code de la Story 23.4, `recommendedForBeginners`, `requiresSpecialty`) — cette story n'ajoute que 2 champs par classe, elle ne retouche aucun champ existant
- [x] Task 2 — Afficher les occupations/actions dans `ClassStep` (AC: #2)
  - [x] Étendre l'interface `ClassData` (`class-step.ts`) avec `occupations: string[]` et `actions: string[]`
  - [x] Étendre `class-step.html` : deux listes en lecture seule (`<ul>` ou équivalent), affichées à côté de/dans le bloc `class-step__talents` déjà existant, texte de référence uniquement — pas de `role="radio"`/`ChoiceCard`, pas d'input
  - [x] Vérifier qu'aucun style interactif (hover/focus/cursor pointer) n'est appliqué à ces nouvelles listes (elles ne sont pas cliquables, contrairement aux `ChoiceCard` de sélection de classe)
- [x] Task 3 — Vérifier les autres consommateurs de `classes.json` (AC: #3 — non-régression)
  - [x] `packages/game-rules/src/ryuutama/validate.ts` : confirmé — aucune référence à `occupations`/`actions`, champs non validés, texte pur
  - [x] `packages/game-rules/src/ryuutama/pdf-field-map.ts` / `apps/api/src/characters/ryuutama-pdf.service.ts` : confirmé — aucun champ AcroForm n'attend ce contenu
  - [x] `character-sheet.ts`/`.html` : confirmé — fichiers non modifiés, la classe n'y affiche toujours que `label`/`talents`
- [x] Task 4 — Suite de tests (AC: #2, #3 — non-régression)
  - [x] Étendu `class-step.spec.ts` : fixture `chasseur` enrichie de `occupations`/`actions`, nouveau test dédié vérifiant l'affichage DOM + l'absence de tout élément interactif (`button`/`input`/`role="radio"`) dans les nouvelles listes
  - [x] Suite complète exécutée : 898/898 API (inchangé), 944/944 web (943 + 1 nouveau test), aucune régression. `pnpm typecheck` (api) propre. `pnpm lint` (web) : 123 erreurs préexistantes dans des fichiers non touchés par cette story (dette déjà trackée, cf. deferred-work.md) — aucune erreur sur les fichiers modifiés par cette story.

### Review Findings

- [x] [Review][Patch] `track occupation`/`track action` sur chaîne brute risque `NG0955` en cas de doublon futur dans une liste [apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.html:37,45] — corrigé en `track $index`, 944/944 tests web reconfirmés
- [x] [Review][Defer] Aucune garde si `occupations`/`actions` est vide/absent sur une entrée de `classes.json` (cast `as ClassData` sans validation runtime) [apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts:43,54] — deferred, pre-existing (même pattern non gardé déjà en place sur `talents`/`description`)

## Dev Notes

- **⚠️ Contenu réel requis, ne jamais inventer/halluciner de texte.** Tout le contenu ci-dessous est transcrit de `docs/classes.md` (déjà fourni par l'utilisateur, extrait du *Guide du Voyageur*) — même règle que les Stories 23.1 à 23.4. Les occupations/actions sont des listes courtes de noms/verbes, pas des phrases — risque d'invention plus faible que pour les descriptions narratives, mais la règle reste absolue.
- **Fichier gitignoré, pas de diff git possible** (NFR4) — lire/écrire directement `apps/api/game-systems/ryuutama/data/classes.json`. Le fichier contient actuellement 12 classes (Story 23.4), chaque talent porte désormais un champ `id` (slug ASCII, ajouté lors de la revue de code de la Story 23.4, à la demande de l'utilisateur) — ne pas le perdre en réécrivant le fichier.
- **Cas particulier Dresseur — décision actée, cf. ci-dessous.** Contrairement aux 11 autres classes, `docs/classes.md` (lignes 330-336) n'a **aucune section `### Occupations`** pour le Dresseur — seulement `### Actions`. Le texte de description du Dresseur explique que son "occupation" dépend du type de créature choisi : *botarcaniste (plantes fantastiques), démoniste (démons), dompteur (bêtes fantastiques), mathémagicien (créations magiques), nécromant (morts-vivants), etc.*
- **Corrections typographiques à appliquer, toutes déjà identifiées et à documenter dans le Change Log/Completion Notes lors de l'implémentation** (cohérent avec la leçon de la revue de code de la Story 23.4, où plusieurs corrections avaient été appliquées sans être toutes signalées) :
  - Guérisseur, Actions : « veilleur sur quelqu'un » → « veiller sur quelqu'un » (les 6 autres actions de la liste sont toutes à l'infinitif : Apaiser, cueillir, diagnostiquer, guérir, opérer, soigner — « veilleur » est un nom, pas un infinitif, coquille OCR manifeste).
  - Dresseur, Actions : « récomponser » → « récompenser » (mot inexistant en français, les 5 autres actions sont à l'infinitif — coquille OCR manifeste).
  - Ermite, Actions : « Arriver là où on ne l'attend pas, Dévoiler la vérité marmonner, méditer... » → virgule manquante et majuscule intruse corrigées : « Arriver là où on ne l'attend pas, dévoiler la vérité, marmonner, méditer, raconter une histoire oubliée, s'isoler » (liste d'infinitifs séparés par virgules, cohérent avec le format de toutes les autres classes).
- **Aucun changement de code au-delà de `classes.json` et `class-step.ts`/`.html`.** `GameSystemService`/`CONTENT_TYPES` lisent déjà `classes.json` sans validation de forme au-delà de `key` (`data: unknown` côté `ContentEntryDto`) — redémarrer le conteneur `api` (ou attendre le hot-reload) suffit pour reseeder.
- **Précédent Story 23.1 sur le non-câblage de `character-sheet.ts`** : la Story 23.1 a ajouté `description` à `classes.json` mais ne l'a câblée que dans `ClassStep` (assistant), jamais dans `character-sheet.html` (qui n'affiche que `label`/`talents` pour la classe, cf. `character-sheet.html:169-192`). Cette story suit le même principe : occupations/actions sont un contenu d'aide au choix (assistant de création), pas un contenu de fiche.

### Contenu de référence — occupations/actions par classe (source : `docs/classes.md`)

| Classe | Occupations | Actions |
| --- | --- | --- |
| Artisan | Cordonnier, cuisinier, forgeron, tailleur. | Assembler, construire, coudre, fabriquer, forger, préparer, réparer. |
| Chasseur | Barbare, chasseur de monstres, pisteur, trappeur. | Capturer, chasser, écorcher, pêcher, piéger, pister, traquer. |
| Fermier | Agriculteur, berger, éleveur, paysan, villageois. | Cultiver, élever, labourer, prendre soin d'un animal, récolter, semer, transporter. |
| Guérisseur | Herboriste, médecin, rebouteux, soigneur. | Apaiser, cueillir, diagnostiquer, guérir, opérer, soigner, veiller sur quelqu'un. *(corrigé : « veilleur » → « veiller »)* |
| Marchand | Caravanier, commerçant, entrepreneur, forain, marchand itinérant, négociant. | Acheter, échanger, économiser, négocier, rationner, transporter, vendre. |
| Ménestrel | Acrobate, artiste itinérant, danseur, musicien, troubadour. | Chanter, conter, créer, danser, faire des représentations, jouer de la musique. |
| Noble | Chevalier, dame de compagnie, ministre, prince, samouraï, seigneur. | Célébrer, commander, corrompre, diriger, juger, protéger, s'amuser, se battre. |
| Dresseur | Botarcaniste, démoniste, dompteur, mathémagicien, nécromant. *(pas de section dédiée dans le livre — repris tel quel des 5 noms déjà présents dans la description existante du Dresseur, cf. décision ci-dessous)* | Apprivoiser, capturer, dompter, dresser, interdire, récompenser. *(corrigé : « récomponser » → « récompenser »)* |
| Ermite | Ermite, idiot du village, illuminé, penseur, sage. | Arriver là où on ne l'attend pas, dévoiler la vérité, marmonner, méditer, raconter une histoire oubliée, s'isoler. *(corrigé : ponctuation)* |
| Météomancien | Chaman, devin, météomancien, météorologue. | Analyser, calculer la vitesse du vent, faire des relevés, mettre en garde, observer des nuages, prévoir, prendre des notes. |
| Navigateur | Amiral, capitaine, marin, mousse, pirate. | Boire, commander, faire le point, hisser les voiles, monter au mât, naviguer. |
| Professeur | Chaperon, conseiller, instituteur, maître, précepteur, professeur. | Conseiller, enseigner, expliquer, montrer, reprocher, révéler, sermonner. |

**Décision utilisateur (create-story, 2026-07-26) — à appliquer telle quelle, ne pas rouvrir :** `occupations` du Dresseur = `["Botarcaniste", "Démoniste", "Dompteur", "Mathémagicien", "Nécromant"]` — les 5 noms de spécialité déjà présents mot pour mot dans le champ `description` existant du Dresseur (Story 23.4), sans les précisions parenthétiques (« plantes fantastiques », etc., qui restent uniquement dans `description`). Aucun contenu inventé : ces 5 mots figurent déjà tels quels dans le texte officiel transcrit.

### Project Structure Notes

- Fichier de données : `apps/api/game-systems/ryuutama/data/classes.json` (existant, gitignoré) — seul fichier de contenu modifié.
- Fichier frontend à modifier : `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts` et `.html` (interface `ClassData` + template).
- Aucun fichier `apps/api` (hors données) à modifier — `class` est déjà un `ContentType` enregistré (`GameSystemService`), aucune nouvelle route/DTO nécessaire.
- Alignement avec la structure du projet : cohérent avec le pattern déjà établi (Story 23.1/23.4) — contenu JSON gitignoré + composant Angular qui lit `content()?.['class']` de façon générique, aucun nouveau mécanisme de lecture.

### References

- [Source: docs/classes.md] — texte réel des occupations/actions des 12 classes (lignes 1-552)
- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 23.5] — user story et Acceptance Criteria d'origine
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-24/prd.md#FR-5] — "Chaque classe porte une liste d'occupations et une liste d'actions — texte de référence pur, affiché au joueur comme pistes de jeu/idées de métier. Aucune validation ni mécanique de jeu dessus."
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md#FR-4, FR-5] — "classes.json — P5-AD-4 (pur contenu, aucune AD dédiée)"
- [Source: _bmad-output/implementation-artifacts/23-4-classes-manquantes-ajoutees.md] — story précédente : forme exacte de `classes.json`, champ `id` sur les talents (ajouté en revue de code), convention de correction typographique documentée
- [Source: apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.html] — bloc d'affichage existant (`class-step__talents`) à étendre
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.html:169-192] — confirme que la fiche n'affiche pas `description`/ce type de contenu narratif pour la classe (précédent Story 23.1, non modifié par cette story)
- [Source: apps/api/src/game-systems/game-system.service.ts#CONTENT_TYPES] — `class` déjà enregistré, aucune validation de forme au-delà de `key`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

Aucun problème bloquant rencontré. `docker compose exec web pnpm test -- <fichier>`/`--project=web <nom>` échoue systématiquement (`Error: Unknown argument: watch`) — la CLI Angular ne supporte pas d'arguments supplémentaires après le script `pnpm test` existant (`ng test --watch=false` déjà câblé) ; contourné en filtrant la sortie de la suite complète (`pnpm test 2>&1 | grep -A N <nom>`), rapide (~13s pour 944 tests).

### Completion Notes List

- Implémentée le 2026-07-26. `classes.json` : ajout de `occupations: string[]` et `actions: string[]` aux 12 classes, transcrits de `docs/classes.md`, 3 corrections typographiques appliquées et documentées en Dev Notes (Guérisseur/veiller, Dresseur/récompenser, Ermite/ponctuation). Cas particulier Dresseur (pas de section Occupations dans le livre) résolu par décision utilisateur actée pendant `create-story` : reprise des 5 noms de spécialité déjà présents dans sa description.
- `ClassStep` (assistant de création) étendu pour afficher ces deux listes en texte de référence pur (aucun élément interactif), à côté du bloc talents déjà existant. `character-sheet.ts`/`.html` volontairement non modifiés (précédent Story 23.1 : la fiche n'affiche pas `description`/contenu narratif de classe), confirmé par Task 3 — aucune référence trouvée dans `validate.ts`/`pdf-field-map.ts`/`ryuutama-pdf.service.ts`.
- Cycle TDD suivi : test dédié écrit et confirmé en échec (RED) avant l'implémentation du template, puis passant (GREEN) après extension de `ClassData`/`class-step.html`/`.scss`.
- Suite finale : 898/898 tests API (inchangé), 944/944 tests web (943 + 1 nouveau), `pnpm typecheck` (api) propre, `pnpm lint` (web) sans nouvelle erreur (123 erreurs préexistantes dans des fichiers non touchés par cette story). Aucune régression.

### File List

- `apps/api/game-systems/ryuutama/data/classes.json` (modifié — gitignoré, `occupations`/`actions` ajoutés aux 12 classes)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts` (modifié — `ClassData` étendue)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.html` (modifié — affichage occupations/actions)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.scss` (modifié — styles du nouveau bloc `__reference`)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts` (modifié — fixture enrichie + nouveau test)

## Change Log

- 2026-07-26 : Story créée (bmad-create-story). Contenu occupations/actions des 12 classes transcrit en Dev Notes depuis `docs/classes.md`, décision utilisateur obtenue pour le cas particulier du Dresseur.
- 2026-07-26 : Implémentée (bmad-dev-story). `occupations`/`actions` ajoutés aux 12 classes (`classes.json`), affichage câblé dans `ClassStep` uniquement (précédent Story 23.1 respecté pour `character-sheet`). 898/898 tests API + 944/944 tests web, aucune régression. Statut passé à "review".
- 2026-07-26 : Revue de code (bmad-code-review, 3 couches adversariales). 0 decision-needed, 1 patch appliqué (`track occupation`/`track action` → `track $index` dans `class-step.html`, évite un crash `NG0955` en cas de doublon futur dans une liste), 1 item différé (absence de garde si `occupations`/`actions` vide/absent — cohérent avec le pattern existant sur `talents`/`description`, voir `deferred-work.md`), 7 écartés (bruit/faux positifs). 944/944 tests web reconfirmés après patch. Statut passé à "done".
