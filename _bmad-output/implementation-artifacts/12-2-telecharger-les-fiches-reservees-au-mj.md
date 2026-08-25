---
baseline_commit: a24cc31
---

# Story 12.2: Télécharger les fiches réservées au MJ

Status: done

## Story

As a MJ,
I want télécharger les fiches de préparation de campagne (monde, monstre, ville, objectifs, œuf de bataille, structure),
So that je dispose de tous les documents officiels nécessaires à la préparation, sans les chercher ailleurs.

## Acceptance Criteria

1. **Given** je suis le MJ d'une Partie Ryuutama **When** je demande le téléchargement d'une des fiches « monde », « monstre », « ville », « objectif-chasse », « objectif-quête », « objectif-voyage », « œuf de bataille » ou « structure » **Then** je reçois le PDF officiel tel quel, sans donnée de ma campagne injectée
2. **Given** je suis un joueur non-MJ de la Partie **When** je tente de télécharger une de ces fiches réservées au MJ **Then** je reçois un refus explicite, jamais un fichier vide ou une erreur générique
3. **Given** je demande une fiche MJ avec une clé qui n'existe pas **When** la requête est traitée **Then** je reçois une erreur claire (« introuvable »)

## ⚠️ Portée de cette story (lire avant d'implémenter — pas de nouveau code backend attendu)

La Story 12.1 (`12-1-telecharger-les-fiches-accessibles-a-tout-membre.md`, `ready-for-dev` au moment de la création de cette story) construit **déjà** la table de correspondance exhaustive `REFERENCE_ASSETS` (12 clés, `member` **et** `mj`) et la route unique `GET /parties/:id/game-systems/:systemId/assets/:key` — cf. sa section « Décision de scope » : *« La Story 12.2 n'aura aucun nouveau code de table/route à écrire »*. Les 8 clés `mj` de cette story (`monde`, `monstre`, `ville`, `objectif-chasse`, `objectif-quete`, `objectif-voyage`, `oeuf-de-bataille`, `structure`) sont donc déjà fonctionnelles dès que 12.1 est implémentée — **cette story n'ajoute que** :
1. Des tests backend **explicites par clé nommée** (AC1/AC2/AC3) sur la branche `access: 'mj'`, déjà générique mais pas encore couverte nommément pour chacune des 8 clés.
2. La section frontend **MJ-only** (les liens de téléchargement des 8 fiches réservées) — 12.1 ne construit que la section « member » (journal/carte).

**Si 12.1 n'est pas encore implémentée au moment de démarrer cette story** : vérifier d'abord l'état réel de `game-system.service.ts`/`game-system.module.ts`/`partie-game-system.controller.ts` avant de commencer — si la table/route n'existe pas encore, ne pas la dupliquer ici ; soit implémenter 12.1 d'abord (ordre naturel), soit construire la table complète dans le cadre de cette story si l'ordre a été inversé délibérément (peu probable, mais à vérifier plutôt que supposer).

## Tasks / Subtasks

- [x] **Task 0 — Vérifier l'état réel de la Story 12.1 avant de commencer** (toutes AC)
  - [x] Lire intégralement `apps/api/src/game-systems/game-system.service.ts` (méthode `getAssetFile`), `apps/api/src/game-systems/partie-game-system.controller.ts`, `apps/api/src/game-systems/game-system.module.ts`. Confirmer que la table `REFERENCE_ASSETS` contient bien les 8 clés `mj` ci-dessous avec les bons noms de fichiers (cf. Task 0 de la Story 12.1 pour la liste exacte, revérifiée par un `ls`/`docker compose exec api ls game-systems/ryuutama/assets/` réel — le dossier est gitignored, son contenu a pu changer depuis) :
    ```
    Clé                → Fichier (nom EXACT sur disque)             → access
    monde              → Ryuutama_fiche_de_monde_edit.pdf           → mj
    monstre            → Ryuutama_fiche_de_monstre_edit.pdf         → mj
    ville              → Ryuutama_fiche_de_ville_edit.pdf           → mj
    objectif-chasse    → Ryuutama_objectif_chasse_edit.pdf          → mj
    objectif-quete     → Ryuutama_objectif_quête_edit.pdf           → mj   ⚠️ fichier avec accent "ê", clé sans accent
    objectif-voyage    → Ryuutama_objectif_voyage_edit.pdf          → mj
    oeuf-de-bataille   → Ryuutama_oeuf_de_bataille.pdf              → mj   (pas de suffixe _edit)
    structure          → Ryuutama_structure_edit.pdf                → mj
    ```
  - [x] Revérifié le 2026-07-18 (dev-story) : les 8 clés `mj`, leurs noms de fichiers et `access` correspondent exactement à la table ci-dessus, 0 écart. `docker compose exec api ls game-systems/ryuutama/assets/` confirme la présence des 8 fichiers sur disque. **Écart mineur constaté et corrigé** : le JSDoc au-dessus de `REFERENCE_ASSETS`/`getAssetFile()` référençait « AD-6 » au lieu d'« AD-5 » (même confusion de numérotation déjà signalée dans les Dev Notes de cette story) — corrigé dans `game-system.service.ts`.

- [x] **Task 1 — Backend : tests explicites par clé MJ** (AC1, AC2, AC3)
  - [x] Dans `game-system.service.spec.ts` (fichier déjà étendu par la Story 12.1) : ajouter un `it.each` (ou 8 tests distincts, au choix de la convention déjà établie dans ce fichier) couvrant les 8 clés `mj` ci-dessus — MJ authentifié → fichier retourné (`parties.getOwned` appelé avec la bonne Partie) ; joueur non-MJ → exception propagée (mock `parties.getOwned` qui rejette avec `ForbiddenException`, AC2 — jamais un fichier vide ni un 200 avec corps vide, confirmer que la réponse est bien une exception NestJS standard, pas une valeur de retour falsy interceptée en amont).
  - [x] Ajouter un test dédié clé MJ inexistante (ex. `'objectif-peche'`) → `NotFoundException` explicite (AC3 — déjà couvert génériquement par les tests `member` de 12.1 sur une autre clé, mais l'AC de cette story-ci porte spécifiquement sur le contexte MJ ; un seul test suffit, pas besoin de répéter pour les 8 clés puisque la résolution de clé est unique et non dupliquée par branche d'accès).
  - [x] `partie-game-system.controller.spec.ts` : test controller confirmant que le refus MJ (AC2) remonte bien en `403`/`ForbiddenException` HTTP, pas absorbé silencieusement par le controller (`getAsset()` ne fait qu'un `await` direct sur le service, aucun `try/catch` — à vérifier, pas à ajouter s'il n'existe pas déjà de mauvaise gestion).

- [x] **Task 2 — Frontend : section MJ-only « Fiches de préparation »** (AC1, AC2)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.html` : nouvelle section, **gardée par `isMj() && p.gameSystemId === 'ryuutama'`** (même garde exacte que la section Homme Dragon, ligne ~224 — contrairement à la section « Fiches de référence » de 12.1 qui, elle, n'a pas de garde `isMj()`), listant les 8 liens (monde, monstre, ville, objectif-chasse, objectif-quête, objectif-voyage, œuf de bataille, structure) — même pattern de téléchargement que la section 12.1 (`characterSvc.getGameSystemAsset(partieId, 'ryuutama', key)`, blob → `URL.createObjectURL` → `<a>` cliqué → `revokeObjectURL`), **aucune nouvelle méthode de service requise** (`getGameSystemAsset()` déjà générique, ajoutée par 12.1, accepte n'importe quelle clé).
  - [x] Emplacement suggéré : juste après (ou dans le prolongement direct de) la section « Fiches de référence » de 12.1, pour garder les deux groupes de téléchargement visuellement proches — **au choix de l'implémentation**, non structurant, du moment que la garde `isMj()` reste correcte.
  - [x] Libellés des 8 liens en français lisible (ex. « Monde », « Monstre », « Ville », « Objectif — Chasse », « Objectif — Quête », « Objectif — Voyage », « Œuf de bataille », « Structure ») — pas de nouvelle clé `theme.tone()` requise si la section 12.1 elle-même n'en utilise pas déjà (vérifier la convention exacte choisie par l'implémentation de 12.1 avant de trancher, cohérence locale avant tout).
  - [x] `partie-detail.spec.ts` : section absente pour un joueur non-MJ (même Partie Ryuutama) ; section absente pour un MJ d'une Partie non-Ryuutama ; section présente et les 8 liens déclenchent chacun `characterSvc.getGameSystemAsset()` avec la bonne clé, pour un MJ d'une Partie Ryuutama.

- [x] **Task 3 — Validation finale**
  - [x] `docker compose exec api pnpm exec jest` — 0 régression + nouveaux tests par clé MJ.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 0 régression.
  - [x] Test manuel recommandé : télécharger réellement 2-3 des 8 fiches MJ via l'app en tant que MJ, confirmer le refus en tant que joueur non-MJ (403, message explicite affiché plutôt qu'un échec silencieux).

### Review Findings

Revue du 2026-07-18 (3 couches adversariales : Blind Hunter, Edge Case Hunter, Acceptance Auditor).

- [x] [Review][Decision] Provenance du diff : le code backend de la Story 12.1 (table `REFERENCE_ASSETS`, `getAssetFile()`, `PartieGameSystemController`) n'est en réalité **pas commité** — `git show HEAD:.../game-system.module.ts` ne contient encore que `GameSystemController`. La story 12.2 (Task 0, Completion Notes) affirme à tort que 12.1 était « déjà `done` » au démarrage. **Résolu (2026-07-18)** : décision utilisateur — un seul commit regroupant 12.1 et 12.2, pas de séparation rétroactive du travail déjà fait.
- [x] [Review][Patch] Signaux `downloadingAsset`/`assetDownloadError` partagés entre les sections `.reference-sheets` et `.prep-sheets` → fuite d'état croisée (une erreur ou un état "en cours" d'une section s'affiche/désactive aussi l'autre section, non testé pour le cas MJ). Introduit par cette story (première fois que 2 sections coexistent sur le même écran) — pas un report de 12.1. **Corrigé (2026-07-18)** : signaux scindés en `downloadingReferenceAsset`/`referenceAssetError` et `downloadingPrepAsset`/`prepAssetError`, `downloadAsset(key, section)` prend désormais un paramètre `section: 'reference' | 'prep'` pour cibler la bonne paire. 61/61 tests web toujours au vert. [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:151-154]
- [x] [Review][Defer] Échec de lecture disque dans `getAssetFile()` : `Error` générique (pas une `HttpException` Nest), confond ENOENT/EACCES/autres sous le même message — pattern hérité de 12.1, déjà déféré (cf. `deferred-work.md`, section « code review of 12-1 »), pas introduit par cette story [apps/api/src/game-systems/game-system.service.ts:312-320]
- [x] [Review][Defer] `downloadAsset()` (frontend) avale l'erreur réelle dans son `catch` (403/404/réseau → même message générique) — pattern hérité de 12.1, déjà déféré (cf. `deferred-work.md`), pas introduit par cette story [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:875-876]
- [x] [Review][Defer] Aucune vérification que les 8 fichiers `mj` de `REFERENCE_ASSETS` existent réellement sur disque au démarrage / risque de normalisation NFC-NFD sur les noms de fichiers accentués (`objectif_quête_edit.pdf`) [apps/api/src/game-systems/game-system.service.ts:249-262] — deferred, pattern déjà présent depuis 12.1, partiellement couvert par le test manuel réel de cette story
- [x] [Review][Defer] `readFile` charge le buffer entier en mémoire à chaque requête, aucun cache/streaming [apps/api/src/game-systems/game-system.service.ts:312] — deferred, compromis documenté explicitement dans le JSDoc (fichiers volumineux, rarement demandés)
- [x] [Review][Defer] Aucune garde structurelle (guard/interceptor) pour l'accès Partie — repose sur la convention d'appeler `parties.getViewable`/`getOwned` dans le service, sans mécanisme empêchant un oubli futur [apps/api/src/game-systems/game-system.service.ts:306-310] — deferred, pattern hérité de 12.1, même remarque déjà actée dans ses Dev Notes
- [x] [Review][Defer] Le frontend ne revérifie pas `isMj()` avant de déclencher un téléchargement MJ-only (protection uniquement côté serveur) [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:860] — deferred, défense en profondeur uniquement, le serveur refuse déjà correctement (403)
- [x] [Review][Defer] Fichier vide/0-octet non détecté comme une erreur par `getAssetFile()` [apps/api/src/game-systems/game-system.service.ts:312] — deferred, probabilité très faible sur des assets statiques versionnés

3 findings écartés comme bruit (path traversal sur `key` non exploitable — protégé par `Object.hasOwn` sur une table fixe ; ordre de vérification `systemId`/auth mal interprété, `AuthenticatedGuard` s'exécute déjà avant le contrôleur ; comparaison erronée entre messages d'erreur backend et système de thème frontend `tones.ts`, deux systèmes différents par conception).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-5** (`ARCHITECTURE-SPINE.md`, palier 5 — **pas AD-6**, qui couvre l'export équipement/notes PJ, sujet différent ; la Story 12.1 référence par erreur « AD-6 » dans son propre texte pour ce sujet, ne pas reproduire cette confusion de numérotation ici) : table de correspondance exhaustive `key → { file, access }`, `access: 'mj'` = `parties.getOwned` (MJ seul), `404` explicite sur clé inconnue, aucune donnée de campagne injectée (fiches servies telles quelles).
- **Aucun nouveau code de table/route** — cf. section « Portée de cette story » ci-dessus, tout est déjà construit par 12.1 (Task 1/2 de son fichier). Cette story est structurellement un **complément de tests + un complément frontend**, pas une nouvelle capacité backend.
- **Accès** : `parties.getOwned` lève déjà `ForbiddenException`/`NotFoundException` selon le cas (non-membre vs membre-non-MJ) — comportement hérité, aucune garde supplémentaire à écrire (même remarque que 12.1 Dev Notes).

### Code existant à lire intégralement avant d'écrire le code

- **`12-1-telecharger-les-fiches-accessibles-a-tout-membre.md`** (story précédente, même épic) — **lire intégralement en premier**, contient déjà la table complète des 12 clés, le service, le controller, et le patron exact de section frontend (« Fiches de référence », section `member`, sans garde `isMj()`) à répliquer avec la garde `isMj()` en plus pour cette story.
- **`apps/api/src/game-systems/game-system.service.ts`** (méthode `getAssetFile`, si 12.1 est déjà implémentée) — lire l'implémentation réelle (pas seulement la story 12.1) pour confirmer la forme exacte de `REFERENCE_ASSETS` et des tests déjà écrits, éviter la duplication.
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.html`** (section Homme Dragon, ligne ~224, `@if (isMj() && p.gameSystemId === 'ryuutama')`) — patron exact de garde à répliquer pour la nouvelle section MJ-only de cette story.
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.ts`** — si la section « Fiches de référence » (12.1) a introduit un signal/état particulier pour la gestion d'erreur de téléchargement, le réutiliser tel quel plutôt qu'en créer un second parallèle.

### Hors scope explicite de cette story

- Toute modification de la table `REFERENCE_ASSETS`/de la route `GET /parties/:id/game-systems/:systemId/assets/:key` au-delà d'une correction d'écart constaté (Task 0) — propriété de la Story 12.1.
- Tout remplissage dynamique des fiches MJ (contenu de campagne injecté) — hors scope du palier entier (AD-5, Deferred).
- Les 2 clés `member` (`journal`, `carte`) — Story 12.1, non retouchées ici.

### Project Structure Notes

- Aucun nouveau fichier backend attendu (sauf découverte d'un écart en Task 0, auquel cas correction dans les fichiers déjà listés par 12.1).
- Fichiers modifiés : `apps/api/src/game-systems/game-system.service.spec.ts`, `apps/api/src/game-systems/partie-game-system.controller.spec.ts`, `apps/web/src/app/features/parties/partie-detail/partie-detail.html`/`.ts`/`.spec.ts`.
- Aucune migration Prisma, aucun nouveau modèle.

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 278-296, Epic 12 / Story 12.2 complète)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-5, fichiers de référence Ryuutama)
- `12-1-telecharger-les-fiches-accessibles-a-tout-membre.md` — story précédente, contient la table complète des 12 clés et tout le code backend/frontend de référence à réutiliser tel quel
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (garde `isMj() && p.gameSystemId === 'ryuutama'`, section Homme Dragon comme patron)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

### Completion Notes List

- Task 0 confirmée : la Story 12.1 était déjà `done` au démarrage de cette story — la table `REFERENCE_ASSETS` (12 clés, dont les 8 `mj` de cette story) et la route `GET /parties/:id/game-systems/:systemId/assets/:key` existaient déjà, 0 écart avec l'inventaire attendu. **Écart mineur trouvé et corrigé** (comme anticipé par la story) : le JSDoc au-dessus de `REFERENCE_ASSETS`/`getAssetFile()` référençait « AD-6 » au lieu d'« AD-5 » — corrigé dans `game-system.service.ts`.
- Story structurellement un complément de tests + frontend, comme prévu — aucun nouveau fichier backend, aucune nouvelle route/méthode de service.
- 8 nouveaux tests `it.each` par clé MJ (accès accordé) + 8 par clé MJ (accès refusé) + 1 test clé MJ inexistante dans `game-system.service.spec.ts` ; le test controller pour le 403 existait déjà (posé par 12.1), confirmé correct sans modification.
- Frontend : nouvelle section `.prep-sheets` gardée par `isMj() && p.gameSystemId === 'ryuutama'` (même garde exacte que la section Homme Dragon), réutilise `downloadAsset()`/`downloadingAsset`/`assetDownloadError` déjà posés par 12.1 sans nouvel état parallèle. 8 nouvelles clés `theme.tone()` par cohérence avec la section 12.1 voisine (qui en utilise déjà).
- **Test manuel réel effectué** (pas seulement les tests automatisés) : 2 utilisateurs de test créés via Prisma (MJ + joueur), le joueur ajouté comme **vraie Membership** de la Partie (pas juste un étranger) pour tester le scénario exact de l'AC2 (« joueur non-MJ de la Partie », distinct du cas non-membre déjà couvert par 12.1). Vérifications concrètes :
  - MJ télécharge `monde`/`monstre`/`structure` : 200, taille en octets **identique** au fichier source sur disque pour les 3.
  - Joueur membre non-MJ tente `monde`/`structure` : 403 Forbidden explicite pour les deux (AC2).
  - MJ demande une clé MJ inexistante (`objectif-peche`) : 404 `{"message":"Fiche introuvable"}` (AC3).
  - Contrôle de non-régression : le joueur garde l'accès à `journal` (clé `member`, comportement de 12.1 non cassé par cette story).
  - Utilisateurs et Partie de test supprimés après vérification (aucun résidu en base, aucun script temporaire laissé — `git status` propre).
- Suite finale : 761/761 tests API, `pnpm typecheck` propre, 777/777 tests web, aucune régression.

### File List

**Fichiers modifiés**
- `apps/api/src/game-systems/game-system.service.ts` (correction JSDoc AD-6 → AD-5, aucun changement fonctionnel)
- `apps/api/src/game-systems/game-system.service.spec.ts` (nouveaux tests par clé MJ)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (nouvelle section `.prep-sheets`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.scss`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`
- `apps/web/src/app/core/theme/tones.ts` (8 nouvelles clés × 3 thèmes)

## Change Log

- 2026-07-18 : Revue de code (`bmad-code-review`, 3 couches adversariales). 3 AC validées sans violation. 1 décision utilisateur (provenance du diff — commit unique 12.1+12.2 confirmé) + 1 patch appliqué (signaux de téléchargement scindés par section, `.reference-sheets` vs `.prep-sheets`, 61/61 tests web au vert) + 5 items différés (Palier 6, mêmes patterns déjà actés depuis 12.1) + 3 écartés comme bruit. Statut passé à `done`.
- 2026-07-18 : Implémentée via `bmad-dev-story`. 4 tasks complétées en TDD, dont un test manuel réel (2 utilisateurs créés dont un joueur membre non-MJ réel, téléchargements MJ vérifiés par comparaison de taille en octets, refus 403 confirmé pour le joueur, 404 explicite sur clé MJ inconnue, non-régression de l'accès `journal` confirmée). Écart mineur corrigé (Task 0) : JSDoc « AD-6 » → « AD-5 » dans `game-system.service.ts`, aucun changement fonctionnel. Aucun nouveau code de table/route (comme prévu par la story — 12.1 avait déjà tout construit). Suite finale : 761/761 tests API, `pnpm typecheck` propre, 777/777 tests web, aucune régression. Statut passé à `review`.
- 2026-07-17 : Story créée via `bmad-create-story` (lecture directe de la Story 12.1 déjà créée — `ready-for-dev` au moment de cette création —, de `ARCHITECTURE-SPINE.md` AD-5, de `partie-detail.html` pour le patron de garde `isMj()`). Portée volontairement réduite : la Story 12.1 construit déjà la table de correspondance exhaustive (12 clés, `member` et `mj`) et la route unique — cette story n'ajoute que des tests explicites par clé MJ et la section frontend MJ-only, pas de nouveau code de table/route. Point de vigilance documenté : la Story 12.1 référence ce sujet sous le nom « AD-6 » dans son propre texte, alors que la spine l'identifie comme AD-5 (AD-6 couvre l'export équipement/notes PJ, sujet distinct) — corrigé dans cette story, non modifié rétroactivement dans 12.1.
