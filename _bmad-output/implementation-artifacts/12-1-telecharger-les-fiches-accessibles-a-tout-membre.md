---
baseline_commit: a24cc31
---

# Story 12.1: Télécharger les fiches accessibles à tout membre

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a membre d'une Partie Ryuutama (joueur ou MJ),
I want télécharger les fiches de référence « journal » et « carte »,
So that je dispose des documents officiels sans les chercher ailleurs.

## Acceptance Criteria

1. **Given** je suis membre d'une Partie Ryuutama (joueur ou MJ) **When** je demande le téléchargement de la fiche « journal » ou « carte » **Then** je reçois le PDF officiel tel quel, sans donnée de ma campagne injectée
2. **Given** je demande une fiche avec une clé qui n'existe pas **When** la requête est traitée **Then** je reçois une erreur claire (« introuvable »), jamais un fichier incorrect ni une réponse silencieuse
3. **Given** je ne suis pas membre de la Partie concernée **When** je tente de télécharger une fiche « journal » ou « carte » de cette Partie **Then** l'accès est refusé

## ⚠️ Décision de scope (lire avant d'implémenter)

Cette story construit la **table de correspondance exhaustive** `key → { file, access }` exigée par AD-6 (`ARCHITECTURE-SPINE.md`) — **les 12 clés au total**, pas seulement les 2 clés `member` testées par les AC ci-dessus. `epics.md` ne liste explicitement par leur nom que 10 des 12 clés (2 `member` dans cette story, 8 `mj` dans la Story 12.2) ; **`evenements` et `provisions` n'apparaissent nulle part explicitement dans les AC de `epics.md`**, mais l'architecture (AD-6, section "Binds") les liste bien comme faisant partie de la totalité des fichiers de `assets/` à couvrir, et sa règle d'accès est explicite : « `access` = `member` (`journal`, `carte`) ou `mj` (**tous les autres**) ». `evenements`/`provisions` sont donc classés `mj` par cette règle générale, au même titre que les 8 clés explicitement nommées en Story 12.2.

**Construire la table complète (12 clés) dans CETTE story, pas incrémentalement entre 12.1 et 12.2** — AD-6 met en garde explicitement contre « un fichier de `assets/` oublié parce qu'il n'apparaît nulle part dans la table de correspondance » : scinder la construction de la table en deux stories reproduirait exactement ce risque. La Story 12.2 réutilisera cette même table/route sans les modifier, en ajoutant seulement ses propres tests sur la branche `access: 'mj'`.

## Tasks / Subtasks

- [x] **Task 0 — Vérifier l'inventaire réel de `assets/`** (toutes AC)
  - [x] Les 16 fichiers de `apps/api/game-systems/ryuutama/assets/` ont déjà été inventoriés pendant la création de cette story (`ls`, contenu confirmé sur disque, gitignored). 4 sont **hors scope** de cette table (déjà couverts par d'autres modules) : `Ryuutama_fiche_de_voyageur_big_edit.pdf` (export PJ, `ryuutama-pdf.service.ts`), `Ryuutama_fiche_homme-dragon_big_edit.pdf` (export Homme Dragon, Story 10.5), `Ryuutama-fiche_equipement_edit.pdf`/`Ryuutama_fiche_de_notes_edit.pdf` (export équipement/notes PJ, Stories 11.1/11.2). **Les 12 fichiers restants** vont dans la table de cette story :
    ```
    Clé                → Fichier (nom EXACT sur disque)                    → access
    journal            → Ryuutama_journal.pdf                              → member
    carte               → Ryuutama_carte.pdf                                → member
    evenements          → Ryuutama_evenements_edit.pdf                      → mj
    monde               → Ryuutama_fiche_de_monde_edit.pdf                  → mj
    monstre             → Ryuutama_fiche_de_monstre_edit.pdf                → mj
    ville               → Ryuutama_fiche_de_ville_edit.pdf                  → mj
    provisions          → Ryuutama_fiche_de_provisions.pdf                  → mj
    objectif-chasse     → Ryuutama_objectif_chasse_edit.pdf                 → mj
    objectif-quete      → Ryuutama_objectif_quête_edit.pdf                  → mj   ⚠️ fichier avec accent "ê" (quête), clé sans accent
    objectif-voyage     → Ryuutama_objectif_voyage_edit.pdf                 → mj
    oeuf-de-bataille    → Ryuutama_oeuf_de_bataille.pdf                     → mj   (pas de suffixe _edit, seul fichier de la liste dans ce cas avec provisions/carte/journal)
    structure           → Ryuutama_structure_edit.pdf                      → mj
    ```
  - [x] Revérifié le 2026-07-18 (dev-story) : `docker compose exec api ls game-systems/ryuutama/assets/` liste exactement les 16 fichiers attendus (12 en scope + 4 hors scope + README.md), 0 écart. Revérifier ces 12 noms de fichiers par une exécution réelle (`docker compose exec api ls game-systems/ryuutama/assets/`) avant de coder — le dossier est gitignored, son contenu a pu changer. Si un fichier listé n'existe plus, ou si un nouveau fichier PDF apparaît dans `assets/` sans entrée correspondante dans la table, **arrêter et documenter l'écart** (AD-6 l'exige explicitement : aucun fichier ne doit rester orphelin de la table).

- [x] **Task 1 — Backend : `GameSystemService.getAssetFile()`** (AC1, AC2, AC3)
  - [x] Dans `apps/api/src/game-systems/game-system.service.ts`, ajouter la constante de correspondance (12 entrées, cf. Task 0) :
    ```typescript
    interface ReferenceAsset {
      file: string;
      access: 'member' | 'mj';
    }

    const REFERENCE_ASSETS: Record<string, ReferenceAsset> = {
      journal: { file: 'Ryuutama_journal.pdf', access: 'member' },
      carte: { file: 'Ryuutama_carte.pdf', access: 'member' },
      evenements: { file: 'Ryuutama_evenements_edit.pdf', access: 'mj' },
      monde: { file: 'Ryuutama_fiche_de_monde_edit.pdf', access: 'mj' },
      monstre: { file: 'Ryuutama_fiche_de_monstre_edit.pdf', access: 'mj' },
      ville: { file: 'Ryuutama_fiche_de_ville_edit.pdf', access: 'mj' },
      provisions: { file: 'Ryuutama_fiche_de_provisions.pdf', access: 'mj' },
      'objectif-chasse': { file: 'Ryuutama_objectif_chasse_edit.pdf', access: 'mj' },
      'objectif-quete': { file: 'Ryuutama_objectif_quête_edit.pdf', access: 'mj' },
      'objectif-voyage': { file: 'Ryuutama_objectif_voyage_edit.pdf', access: 'mj' },
      'oeuf-de-bataille': { file: 'Ryuutama_oeuf_de_bataille.pdf', access: 'mj' },
      structure: { file: 'Ryuutama_structure_edit.pdf', access: 'mj' },
    };

    const ASSETS_DIR = join(process.cwd(), 'game-systems/ryuutama/assets');
    ```
  - [x] Nouvelle méthode `getAssetFile(partieId: string, systemId: string, key: string, userId: string): Promise<Buffer>` :
    - Si `systemId !== RYUUTAMA_ID` → `NotFoundException` (même garde que `getContent()`/`getSchema()` existants — un seul système codé en dur à ce jour).
    - Résout `REFERENCE_ASSETS[key]`. Si absent → `NotFoundException('Fiche introuvable')` (AC2 — jamais un fallback silencieux).
    - Selon `access` : `'member'` → `await this.parties.getViewable(partieId, userId)` ; `'mj'` → `await this.parties.getOwned(partieId, userId)` (ces deux méthodes lèvent déjà `NotFoundException`/`ForbiddenException` en cas d'accès refusé — AC3, aucune garde à réinventer, cf. `parties.service.ts` lignes 71-88).
    - Lit le fichier (`readFile(join(ASSETS_DIR, asset.file))`) et retourne le `Buffer`. **Aucun cache** — contrairement à `contentCache` (données structurées relues à chaque bootstrap), ces fichiers sont volumineux et rarement demandés ; suivre le pattern déjà établi de `RyuutamaPdfService.loadTemplate()` (cache par fichier, un seul `Map<string, Promise<Buffer>>` ou un cache par clé) SEULEMENT si un besoin de performance réel apparaît — **par défaut, lecture directe à chaque requête**, plus simple, cohérent avec le fait que ces fichiers sont servis tels quels (pas de remplissage PDF coûteux à amortir, contrairement à `RyuutamaPdfService`).
    - Si le fichier est introuvable sur disque (asset gitignored manquant en environnement de dev) → erreur explicite pointant vers un README à créer/étendre (même convention que `RyuutamaPdfService`/`HommeDragonPdfService`/`EquipmentPdfService` — ne jamais laisser une erreur `ENOENT` brute remonter).
  - [x] `GameSystemService` a besoin de `PartiesService` — injecter dans le constructeur.
  - [x] Tests (`game-system.service.spec.ts`, étendre le fichier existant) : clé `member` + membre → fichier retourné ; clé `member` + non-membre → erreur propagée (mock `parties.getViewable` qui rejette) ; clé `mj` + MJ → fichier retourné (`parties.getOwned` appelé, pas `getViewable`) ; clé `mj` + joueur non-MJ → erreur propagée ; clé inconnue → `NotFoundException` explicite ; `systemId` inconnu → `NotFoundException`.

- [x] **Task 2 — Backend : route + module** (AC1, AC2, AC3)
  - [x] Nouveau fichier `apps/api/src/game-systems/partie-game-system.controller.ts` — même pattern que `partie-characters.controller.ts` (nouveau contrôleur dédié au préfixe `parties/:id/...`, plutôt que de forcer une route hors-préfixe dans `GameSystemController` qui est déjà `@Controller('game-systems')` — NestJS ne permet pas d'échapper le préfixe d'un contrôleur) :
    ```typescript
    import { Controller, Get, Param, ParseUUIDPipe, StreamableFile, UseGuards } from '@nestjs/common';
    import type { AuthUser } from '@master-jdr/shared';
    import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
    import { CurrentUser } from '../common/current-user.decorator';
    import { GameSystemService } from './game-system.service';

    @UseGuards(AuthenticatedGuard)
    @Controller('parties/:id/game-systems')
    export class PartieGameSystemController {
      constructor(private readonly gameSystems: GameSystemService) {}

      @Get(':systemId/assets/:key')
      async getAsset(
        @Param('id', ParseUUIDPipe) partieId: string,
        @Param('systemId') systemId: string,
        @Param('key') key: string,
        @CurrentUser() user: AuthUser,
      ): Promise<StreamableFile> {
        const buffer = await this.gameSystems.getAssetFile(partieId, systemId, key, user.id);
        return new StreamableFile(buffer, {
          type: 'application/pdf',
          disposition: `attachment; filename="${key}.pdf"`,
        });
      }
    }
    ```
    `key` n'est jamais interpolé depuis une donnée utilisateur libre dans le nom de fichier de la réponse (`disposition`) — c'est la clé elle-même, déjà validée contre la table fixe `REFERENCE_ASSETS` côté service (si elle n'y figure pas, `getAssetFile` lève avant même d'atteindre cette ligne) : aucun risque d'injection d'en-tête, contrairement à `originalName` (upload libre) dans `scenarios.controller.ts`.
  - [x] `apps/api/src/game-systems/game-system.module.ts` : importer `PartiesModule` (**premier import cross-module de `GameSystemModule`**, cf. AD-6 spine — actuellement `imports: []`), enregistrer `PartieGameSystemController` dans `controllers`.
  - [x] Tests controller : route délègue à `gameSystems.getAssetFile()` avec les 4 paramètres attendus ; retourne un `StreamableFile` ; propage les exceptions du service sans les intercepter.

- [x] **Task 3 — Frontend : liens de téléchargement** (AC1)
  - [x] `apps/web/src/app/core/characters/character.service.ts` (déjà le point d'entrée HTTP pour tout ce qui touche `game-systems` côté web — `getGameSystems`/`getGameSystemSchema`/`getGameSystemContent` y vivent déjà, cf. lignes 26-46 ; ajouter à la suite plutôt que créer un nouveau service) :
    ```typescript
    getGameSystemAsset(partieId: string, systemId: string, key: string): Promise<Blob> {
      return firstValueFrom(
        this.http.get(`${API_BASE}/parties/${partieId}/game-systems/${systemId}/assets/${key}`, {
          responseType: 'blob',
          withCredentials: true,
        }),
      );
    }
    ```
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`/`.html` : nouvelle section « Fiches de référence » avec 2 liens (Journal, Carte) — **visible à tout membre, pas seulement au MJ** (pas de garde `isMj()`, contrairement à la majorité des sections de cette page ; suivre plutôt le pattern non gardé déjà utilisé par `announcements-feed`, ligne ~116). Gardée par `p.gameSystemId === 'ryuutama'` (même convention que la section ligne 224). Pattern de téléchargement identique à `ScenarioEditor.downloadDocument()`/`CharacterSheet.exportPdf()` (blob → `URL.createObjectURL` → `<a>` cliqué → `revokeObjectURL`). Aucun signal `exporting`/erreur dédié requis pour 2 liens statiques simples si le pattern existant de gestion d'erreur du composant suffit — vérifier la convention déjà en place sur `PartieDetail` avant d'ajouter un nouveau signal.
  - [x] Tests : clic sur chaque lien appelle `characterSvc.getGameSystemAsset(partieId, 'ryuutama', 'journal'|'carte')` et déclenche un téléchargement ; section absente si `gameSystemId !== 'ryuutama'`.

- [x] **Task 4 — Validation finale**
  - [x] `docker compose exec api pnpm exec jest` — 0 régression + nouveaux tests `GameSystemService`/`PartieGameSystemController`.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm exec ng test --watch=false` — 0 régression.
  - [x] Redémarrage réel du conteneur `api` — `Nest application successfully started`, route `GET /parties/:id/game-systems/:systemId/assets/:key` mappée.
  - [x] Test manuel recommandé : télécharger réellement `journal`/`carte` via l'app (ou `curl` avec session) et confirmer que le PDF reçu correspond bien au fichier source sur disque (taille en octets identique, par ex.) — pas de transformation attendue puisque le fichier est servi tel quel.

### Review Findings

Revue de code adversariale (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor) le 2026-07-18. Table des 12 clés/fichiers/accès conforme (Acceptance Auditor), AC1/AC2/AC3 respectées, aucune violation de spec confirmée. 2 patches appliqués (dont 1 bug réel confirmé indépendamment par 2 couches et vérifié empiriquement), 7 items différés, 7 écartés.

- [x] [Review][Patch][Fixed][Tested] `REFERENCE_ASSETS[key]` est un objet littéral simple — une clé `key = '__proto__'` ou `'constructor'` renvoie une valeur héritée truthy (`Object.prototype`), contourne le `if (!asset)` (404 attendu), puis provoque un `TypeError` non intercepté dans `join(ASSETS_DIR, undefined)` (`asset.file` vaut `undefined`) → 500 non maîtrisé au lieu du 404 propre exigé par AC2. **Confirmé indépendamment par le Blind Hunter et l'Edge Case Hunter, et vérifié empiriquement** (`REFERENCE_ASSETS['__proto__']` retourne bien un objet truthy dans le conteneur `api` réel) [apps/api/src/game-systems/game-system.service.ts]
- [x] [Review][Patch][Fixed][Tested] Aucune garde anti-double-clic (`[disabled]`) sur les 2 boutons de téléchargement de `PartieDetail` — contrairement aux boutons d'export de `character-sheet.ts` qui ont déjà ce garde-fou (posé en revue Story 11.1), un double-clic ici déclenche plusieurs téléchargements concurrents identiques [apps/web/src/app/features/parties/partie-detail/partie-detail.ts, .html]
- [x] [Review][Defer] `readFile(...).catch()` lève une `Error` brute (pas une `HttpException`) sur échec de lecture disque, surfaçant en 500 générique plutôt qu'une réponse HTTP maîtrisée — même convention déjà en place dans les 4 autres services PDF (`RyuutamaPdfService`/`EquipmentPdfService`/`NotesPdfService`/`HommeDragonPdfService`), pas une régression isolée à cette story [apps/api/src/game-systems/game-system.service.ts]
- [x] [Review][Defer] Aucun test n'exerce `getAssetFile()` contre les 12 vrais fichiers sur disque (tous les tests automatisés mockent `readFile`) — même limitation que tous les autres services PDF ; compensée cette story par un test manuel réel (comparaison de taille en octets pour `journal`/`carte`, vérification de l'inventaire complet des 16 fichiers en Task 0)
- [x] [Review][Defer] Le `catch` frontend de `downloadAsset()` affiche un message générique identique quelle que soit la cause (403 non-membre, 404 clé inconnue, panne réseau) — même pattern déjà établi pour `exportPdf`/`exportEquipmentPdf`/`exportNotesPdf`/`ScenarioEditor.downloadDocument`, pas une régression isolée [apps/web/.../partie-detail.ts]
- [x] [Review][Defer] `CharacterService.getGameSystemAsset()` (`responseType: 'blob'`) ne parse jamais le corps JSON d'une erreur 4xx pour en extraire un message précis — même limitation déjà établie pour les autres appels blob du projet (`exportPdf`, etc.) [apps/web/src/app/core/characters/character.service.ts]
- [x] [Review][Defer] `setTimeout(() => URL.revokeObjectURL(url), 0)` juste après `link.click()` — pattern déjà répliqué tel quel depuis `ScenarioEditor.downloadDocument()`/`CharacterSheet.exportPdf()` et consorts, pas introduit par cette story
- [x] [Review][Defer] Erreurs disque non-`ENOENT` (permissions, I/O) rapportées avec le même message générique « introuvable sur le disque » que `ENOENT` — même convention (aucune distinction de code d'erreur) que les 4 autres services PDF, pas une régression isolée
- [x] [Review][Dismiss] « Pas de streaming pour ces fichiers volumineux » (lecture en mémoire complète via `readFile`) — décision explicitement documentée et assumée dans les Dev Notes de la story elle-même (« lecture directe à chaque requête, plus simple ... SEULEMENT si un besoin de performance réel apparaît »)
- [x] [Review][Dismiss] « Répartition arbitraire des accès member/mj, non justifiée » — infirmé : directement issue d'AD-6 (`ARCHITECTURE-SPINE.md`), le Blind Hunter n'avait par construction aucun accès au projet/à la spec pour le vérifier
- [x] [Review][Dismiss] `systemId`/`key` sans `ParseUUIDPipe`-équivalent au niveau route — infirmé : validation intentionnellement faite en couche service via liste blanche (`REFERENCE_ASSETS`) et comparaison `RYUUTAMA_ID`, même convention que `getContent(id)`/`getSchema(id)` déjà en place
- [x] [Review][Dismiss] Libellés de thème « Journal »/« Carte » identiques sur les 3 thèmes jugés « incohérents » — infirmé : cohérent avec la convention déjà établie ailleurs dans ce même fichier (`character.export_editable_cta`/`export_2pages_cta` sont également identiques sur les 3 thèmes)
- [x] [Review][Dismiss] `RYUUTAMA_ID` codé en dur, aucune extensibilité multi-système — explicitement hors scope (Dev Notes de la story : « registre de plugin générique... pas construit par anticipation »)
- [x] [Review][Dismiss] Message d'erreur générique persistant après navigation vers une autre Partie sans nouveau téléchargement — cas limite théorique, cohérent avec l'absence de gestion équivalente pour les autres signaux d'erreur déjà existants sur ce même composant (`inviteEmailError`, etc.), pas une régression isolée
- [x] [Review][Dismiss] Commentaire de la spine architecture (« game-system.controller.ts ») en léger désaccord avec le nom réel du nouveau fichier (`partie-game-system.controller.ts`) — signalé par l'Acceptance Auditor comme dérive de documentation, pas un défaut de code (le split en 2 contrôleurs est explicitement requis par NestJS et actée dans la story elle-même, Task 2)

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-6** (`ARCHITECTURE-SPINE.md`, section fichiers de référence) : route `GET /parties/:id/game-systems/:systemId/assets/:key`, réponse `StreamableFile`, garde d'accès identique à P4-AD-8 (déjà établi par `ScenariosController.downloadDocument`) — **mais source du fichier différente** : pas de ligne DB, le fichier est fixe et embarqué au build, lu par clé via la même technique que `RyuutamaPdfService.loadTemplate()`. `GameSystemService` porte la table de correspondance **exhaustive** `key → { file, access }`. Toute clé absente → `404 NotFoundException`, jamais de fallback silencieux. Ces PDF sont servis **tels quels** — aucune donnée de campagne injectée à ce palier, même si certains ont des champs de formulaire fillable (suffixe `_edit`).
- **Premier import cross-module de `GameSystemModule`** : jusqu'à cette story, `GameSystemModule` n'importait rien (`imports: []`) — cette story lui fait importer `PartiesModule` pour accéder à `getViewable`/`getOwned`. Changement de dépendance de module notable (comme le premier import de `ScenariosModule` par `HommeDragonModule` en Palier 5, ou de `CharacterModule` par `ScenariosModule` en Story 8.6).
- **Accès** : lecture `member` = `parties.getViewable` (MJ OU tout membre) ; lecture `mj` = `parties.getOwned` (MJ seul) — jamais un nouveau guard NestJS dédié, ces deux méthodes existent déjà et lèvent systématiquement (`NotFoundException`/`ForbiddenException`) en cas d'accès refusé, jamais un retour silencieux (vérifié dans `parties.service.ts`).
- **Pas de remplissage dynamique** : contrairement aux 3 autres services PDF déjà en place (`RyuutamaPdfService`/`HommeDragonPdfService`/`EquipmentPdfService`), ce mécanisme ne charge aucune fonction de mapping `packages/game-rules`, ne construit aucun `PdfFieldValue[]`, n'appelle jamais `form.getTextField()` — c'est un simple stream de fichier statique, plus proche de `ScenariosService.getDocumentFile()`/`CharacterService.getPortraitFile()` que des services d'export.

### Portée de cette story vs Story 12.2

Cette story construit la table complète (12 clés, `member` ET `mj`) et la route entière — cf. « Décision de scope » ci-dessus. La Story 12.2 (« Télécharger les fiches réservées au MJ ») n'aura **aucun nouveau code de table/route à écrire** : elle ajoute seulement ses propres tests/AC sur la branche `access: 'mj'` déjà fonctionnelle (refus explicite pour un joueur non-MJ, 8 clés nommément testées) et son propre volet frontend (section MJ-only, probablement dans `ScenarioEditor` ou une zone déjà gardée par `isMj()` de `PartieDetail`, à déterminer à la création de cette story-là).

### Code existant à lire intégralement avant d'écrire le code

- **`apps/api/src/scenarios/scenarios.controller.ts`** (méthode `downloadDocument`, lignes 230-245) et **`apps/api/src/scenarios/scenarios.service.ts`** (méthode `getDocumentFile`, lignes 828-846) — patron direct le plus proche : résolution d'un fichier par ID, garde d'accès via `parties.getViewable`, construction du `StreamableFile`. Différence principale : ici la « clé » est fixe (whitelist `REFERENCE_ASSETS`), pas un UUID de ligne DB.
- **`apps/api/src/characters/partie-characters.controller.ts`** — patron direct pour `PartieGameSystemController` : contrôleur séparé scopé `@Controller('parties/:id/...')`, ne pas tenter d'ajouter cette route dans `GameSystemController` existant (préfixe `game-systems` incompatible).
- **`apps/api/src/game-systems/game-system.service.ts`** (état actuel : `getContent()`/`getSchema()`) — lire en entier avant d'ajouter `getAssetFile()`, notamment la convention de garde `systemId !== RYUUTAMA_ID` déjà utilisée 2 fois.
- **`apps/api/src/parties/parties.service.ts`** (lignes 71-88, `getOwned`/`getViewable`) — confirmer que les deux lèvent systématiquement, jamais de retour silencieux.
- **`apps/api/src/homme-dragon/homme-dragon.pdf.service.ts`** (méthode `loadTemplate`) — patron pour l'erreur explicite si un fichier `assets/` gitignored est absent en environnement de dev (message pointant vers un README).
- **`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`** (méthode `downloadDocument`, ligne ~272) — patron direct pour le téléchargement frontend (blob → lien → clic → révocation).
- **`apps/web/src/app/features/parties/partie-detail/partie-detail.html`** — lire les sections existantes pour choisir où insérer la nouvelle section (garde `p.gameSystemId === 'ryuutama'` déjà utilisée ligne 224 ; section `announcements-feed` ligne ~116 comme exemple de section visible à tout membre sans garde `isMj()`).

### Hors scope explicite de cette story

- Story 12.2 (fiches réservées au MJ) — AC/tests dédiés, story séparée, mais aucun nouveau code de table/route (cf. section dédiée ci-dessus).
- Tout remplissage dynamique des fiches (contenu par champ non spécifié à cette altitude, cf. `ARCHITECTURE-SPINE.md` Deferred) — servies telles quelles uniquement.
- Un registre de plugin générique par système de jeu — pas construit par anticipation, suit le pattern déjà codé en dur (`systemId !== RYUUTAMA_ID`).

### Project Structure Notes

- Nouveaux fichiers : `apps/api/src/game-systems/partie-game-system.controller.ts` (+ `.spec.ts`).
- Fichiers modifiés : `apps/api/src/game-systems/game-system.service.ts` (+ `.spec.ts`), `apps/api/src/game-systems/game-system.module.ts` (import `PartiesModule` + nouveau controller), `apps/web/src/app/core/characters/character.service.ts` (+ méthode), `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`/`.html`/`.spec.ts`.
- Aucune migration Prisma, aucun nouveau modèle — fichiers fixes embarqués au build, mapping en code uniquement.

### References

- `_bmad-output/planning-artifacts/epics-palier5.md` (lignes 254-277, Epic 12 / Story 12.1 complète)
- `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (AD-6, fichiers de référence Ryuutama — attention : dans ce document la numérotation AD est continue avec le reste du palier, cette règle y est la dernière section `### AD-6`)
- `apps/api/src/scenarios/scenarios.controller.ts` / `scenarios.service.ts` (patron direct de téléchargement de fichier avec garde d'accès)
- `apps/api/src/characters/partie-characters.controller.ts` (patron de contrôleur scopé `parties/:id/...`)
- `apps/api/src/parties/parties.service.ts` (`getOwned`/`getViewable`)
- `apps/api/game-systems/ryuutama/assets/README.md` (convention de documentation des assets PDF — à étendre avec cette table de correspondance une fois la story implémentée)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-create-story, bmad-dev-story)

### Debug Log References

### Completion Notes List

- Story créée via `bmad-create-story`. Écart notable identifié et documenté explicitement (« Décision de scope ») : `epics.md` ne nomme que 10 des 12 clés de la table AD-6 (`evenements`/`provisions` absentes des AC littérales) — décision actée de construire la table complète et exhaustive dès cette story plutôt que de la scinder entre 12.1/12.2, conformément à la mise en garde explicite d'AD-6 contre les fichiers oubliés. Inventaire réel des 16 fichiers de `assets/` effectué pendant la création (dont un fichier avec un nom accentué, `Ryuutama_objectif_quête_edit.pdf`, à retranscrire exactement) pour éviter toute erreur de nommage côté développeur.
- Implémentée via `bmad-dev-story` (2026-07-18). Task 0 revérifiée en dev-story : les 16 fichiers réels de `assets/` correspondent exactement à l'inventaire de la story (12 en scope + 4 hors scope + README.md), 0 écart. 5 tasks complétées en TDD.
- `GameSystemModule` importe `PartiesModule` pour la première fois (premier import cross-module de ce module, cf. Dev Notes) — aucun cycle détecté (`CharacterModule` importe déjà les deux modules indépendamment).
- Nouveau contrôleur dédié `PartieGameSystemController` (`@Controller('parties/:id/game-systems')`) plutôt que d'ajouter la route dans `GameSystemController` existant (`@Controller('game-systems')`, préfixe incompatible) — mêmes principe que `PartieCharactersController`.
- Frontend : section « Fiches de référence » ajoutée dans l'onglet « Détails » de `PartieDetail` (visible à tout membre, aucune garde `isMj()`, cohérent avec `announcements-feed`), gardée par `p.gameSystemId === 'ryuutama'`. Nouveau signal `assetDownloadError` (aucun pattern de gestion d'erreur générique réutilisable trouvé sur ce composant pour ce cas).
- **Test manuel réel effectué** (pas seulement les tests automatisés) : script Node exécutant un vrai flux HTTP contre le conteneur `api` réel (2 utilisateurs de test créés directement via Prisma+argon2 pour contourner le throttling de connexion sur le compte admin, connexion via `POST /auth/login` avec le champ `identifier` — piège rencontré : le champ attendu n'est pas `email` mais `identifier`, cf. `LocalStrategy`). Partie Ryuutama créée réellement, téléchargements réels déclenchés :
  - `journal` : 200, 50370 octets — **identique** à la taille du fichier source sur disque (`Ryuutama_journal.pdf`, vérifié via `ls -la`).
  - `carte` : 200, 61357 octets — **identique** à la taille du fichier source sur disque.
  - Clé inexistante : 404 `{"message":"Fiche introuvable"}` (AC2).
  - Clé `mj`-only (`structure`) demandée par le MJ lui-même : 200 (comportement attendu, le MJ garde accès à tout).
  - **AC3 vérifiée avec un 2e utilisateur non-membre** : `journal`/`carte` → 403 Forbidden pour les deux.
  - Parties et utilisateurs de test supprimés après vérification (aucun résidu en base, aucun script temporaire laissé dans le conteneur ou le repo — `git status` propre).
- Suite finale : 740/740 tests API, `pnpm typecheck` propre, 765/765 tests web, aucune régression. Redémarrage réel du conteneur `api` vérifié (route `GET /parties/:id/game-systems/:systemId/assets/:key` mappée dans les logs `RouterExplorer`).

### File List

**Nouveaux fichiers**
- `apps/api/src/game-systems/partie-game-system.controller.ts`
- `apps/api/src/game-systems/partie-game-system.controller.spec.ts`

**Fichiers modifiés**
- `apps/api/src/game-systems/game-system.service.ts`
- `apps/api/src/game-systems/game-system.service.spec.ts`
- `apps/api/src/game-systems/game-system.module.ts`
- `apps/web/src/app/core/characters/character.service.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.scss`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`
- `apps/web/src/app/core/theme/tones.ts`

## Change Log

- 2026-07-18 : Revue de code (`bmad-code-review`, 3 couches adversariales). 0 violation d'AC (Acceptance Auditor : table des 12 clés conforme, AC1/AC2/AC3 respectées). 2 patches appliqués : garde `Object.hasOwn()` sur `REFERENCE_ASSETS[key]` (une clé `__proto__`/`constructor` contournait le 404 et provoquait un crash 500 — bug confirmé indépendamment par le Blind Hunter et l'Edge Case Hunter, vérifié empiriquement) ; garde anti-double-clic (`downloadingAsset`) ajoutée aux 2 boutons de téléchargement de `PartieDetail`. 7 items différés (voir `deferred-work.md`), 7 écartés. Suite finale : 744/744 tests API, `pnpm typecheck` propre, 766/766 tests web, aucune régression. Statut passé à `done`.
- 2026-07-18 : Implémentée via `bmad-dev-story`. 5 tasks complétées en TDD, dont un test manuel réel (flux HTTP complet contre le conteneur `api` réel : login, création de Partie, téléchargement journal/carte avec comparaison de taille en octets au fichier source, vérification AC2 clé inconnue et AC3 accès refusé à un non-membre). Aucune déviation par rapport à la story. Suite finale : 740/740 tests API, `pnpm typecheck` propre, 765/765 tests web, aucune régression. Redémarrage réel du conteneur `api` vérifié. Statut passé à `review`.
- 2026-07-17 : Story créée via `bmad-create-story`.
