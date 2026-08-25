---
story: 4.2
title: "Créer un personnage — Assistant frontend"
epic: 4
key: 4-2-creer-personnage-assistant
status: done
baseline_commit: "3b11951"
---

# Story 4.2 : Créer un personnage — Assistant frontend

Status: done

## Story

As a player,
I want a guided step-by-step wizard to create my Ryuutama character,
so that I don't have to calculate anything myself and can't submit an invalid sheet.

## Acceptance Criteria

**AC0 — Prérequis backend : exposer le contenu seedé (gap non couvert par la Story 4.1)**

Given `GameSystemService.getSchema()` (Story 4.1) ne retourne que la structure statique (`sheetSchema`/`creationSteps`), **pas** les données réelles seedées (les 7 classes avec leurs talents, les 3 types, les 5 armes, le pattern Polyvalent)
When le développeur ajoute `GET /game-systems/:id/content`
Then la réponse 200 retourne le contenu `ContentEntry` scope `BASE` groupé par `ContentType.key` : `{ class: [...7 entrées...], type: [...3...], attributePattern: [...1...], weaponCategory: [...5...] }`
And chaque entrée a la forme `{ key: string, data: Record<string, unknown> }` (le contenu JSON brut du seed, cf. README `apps/api/game-systems/ryuutama/README.md`)
And l'endpoint est protégé par `AuthenticatedGuard`, cohérent avec `GET /game-systems`
And un id inconnu retourne 404 (même comportement que `getSchema()`)

**AC1 — Point d'entrée**

Given un joueur membre d'une partie Ryuutama sans personnage existant
When il ouvre l'onglet "Personnages" de la partie et clique sur le CTA de création
Then l'assistant de création s'ouvre, rendu à partir de `sheetSchema()`/`creationSteps()` (AC0) — aucun contenu Ryuutama n'est codé en dur dans les composants génériques du wizard (layout, navigation, progress bar)

**AC2 — Layout desktop (≥1024px)**

Given l'assistant sur desktop
When une étape est affichée
Then le layout est 65% zone principale / 35% panneau latéral résumé (réutilise `SlotPanel`), avec une barre de progression en haut (titre = nom de l'étape, boutons prev/next 32×32px)

**AC3 — Layout mobile (<1024px)**

Given l'assistant sur mobile/tablette (breakpoint UX = 1024px, pas 768px — cf. Dev Notes §UX)
When une étape est affichée
Then le layout est une colonne unique, barre de progression avec libellé textuel de l'étape ("Étape 3/8 · Attributs"), navigation via barre inférieure fixe Précédent/Suivant (≥44px de hauteur)

**AC4 — Étape 1 : Classe**

Given l'étape 1 (Classe)
When le joueur sélectionne une classe parmi les 7 (grille de `ChoiceCard`)
Then les 3 talents de la classe s'affichent immédiatement sans navigation supplémentaire
And si la classe est Artisan, un sous-choix obligatoire (type d'objet de spécialité, champ texte libre) apparaît et bloque le bouton "Suivant" tant qu'il n'est pas rempli

**AC5 — Étape 2 : Type**

Given l'étape 2 (Type)
When le joueur sélectionne un type parmi Attaque/Technique/Magie
Then les avantages passifs du type s'affichent
And si Magie est sélectionné, le message `character.magic_deferred_notice` (thématisé via `ThemeToneService`) s'affiche avant de pouvoir continuer — aucune sélection de sorts n'est proposée (hors scope, cf. addendum §4)

**AC6 — Étape 3 : Attributs**

Given l'étape 3 (Attributs)
When le joueur assigne les 4 valeurs du pattern Polyvalent ({8,4,6,6}) aux attributs AGI/ESP/INT/VIG (contrôle "chips assignables" — chaque valeur ne peut être assignée qu'à un seul attribut à la fois)
Then le panneau résumé (desktop) ou la zone dédiée sous les slots (mobile) affiche PV/PE/Condition/Initiative/Encombrement recalculés en direct côté client via `computeDerived()` importée de `@master-jdr/game-rules` (même implémentation que le backend, **sans appel réseau**, cf. NFR7/NFR-4)
And le bouton "Suivant" reste désactivé tant que les 4 attributs ne sont pas tous assignés

**AC7 — Étape 4 : Arme favorite**

Given l'étape 4 (Arme favorite)
When le joueur choisit 1 arme parmi les 5 catégories
Then les valeurs Toucher/Dégâts de la catégorie s'affichent

**AC8 — Étapes 5 à 7 : Objet fétiche, Équipement, Champs narratifs**

Given les étapes 5 (Objet fétiche), 6 (Équipement), 7 (Champs narratifs)
When le joueur les traverse
Then l'objet fétiche est un champ texte libre optionnel
And l'équipement (nécessaire de voyage + nécessaire d'intendance de groupe, cf. addendum §8) est affiché en lecture seule, attribué automatiquement en mode pique-nique, **aucune interaction requise**
And les champs narratifs (sexe, âge, particularités physiques, village natal, motivation, nom, personnalité) sont tous des champs texte libres optionnels

**AC9 — Soumission**

Given toutes les étapes obligatoires complétées (classe + éventuelle spécialité Artisan, type, 4 attributs assignés, arme favorite)
When le joueur soumet l'assistant
Then `POST /parties/:id/characters` (Story 4.1) est appelé avec `{ gameSystemId: "ryuutama", sheetData }`
And en cas de succès (201), redirection vers `/parties/:id` (onglet Personnages) — **pas** vers une fiche dédiée (Story 4.3 n'existe pas encore, cf. Dev Notes §Redirection)
And en cas d'échec (400), retour à l'étape fautive avec la liste des erreurs contextualisées (mapping `field` → étape, cf. Dev Notes §Mapping erreurs) — jamais un écran d'erreur générique
And en cas de 409 (personnage déjà existant), message explicite et redirection vers l'onglet Personnages (le personnage existe déjà, pas la peine de rester sur le formulaire)

**AC10 — Accessibilité et microcopy**

Given l'assistant à n'importe quelle étape
When il est utilisé au clavier ou avec un lecteur d'écran
Then chaque `ChoiceCard` a un `aria-label` complet (`"[Nom] : [talents/avantages résumés]"`)
And le libellé d'étape du wizard est annoncé via `aria-live="polite"` à chaque changement d'étape
And les 7 nouvelles clés microcopy `character.*` (cf. UX-DR19) sont déclinées dans les 3 thèmes existants via `ThemeToneService`/`tones.ts`

**Périmètre de cette story** : l'assistant livré ici couvre les étapes 1 à 7 (Classe → Champs narratifs) puis soumission — complet et fonctionnel de façon autonome. L'étape 8 optionnelle (Portrait) sera ajoutée par la Story 4.5 de façon additive (ne modifie pas ce flux). La consultation de la fiche créée (Story 4.3) n'existe pas encore — voir Dev Notes §Redirection pour la solution transitoire.

## Tasks

- [x] Task 1 — Backend : `GET /game-systems/:id/content` (AC0)
- [x] Task 2 — Fix `apps/web/tsconfig.json` : path mapping `@master-jdr/game-rules`
- [x] Task 3 — Microcopy `character.*` dans `ThemeToneService`/`tones.ts` (AC10)
- [x] Task 4 — `CharacterService` frontend (`apps/web/src/app/core/characters/`)
- [x] Task 5 — Composant `ChoiceCard` générique réutilisable
- [x] Task 6 — Composant conteneur `CharacterWizard` (état, navigation, layout desktop/mobile)
- [x] Task 7 — Composants d'étape (Classe, Type, Attributs, Arme, Fétiche, Équipement, Narratif)
- [x] Task 8 — Intégration : onglet "Personnages" dans `partie-detail` + route + CTA
- [x] Task 9 — Soumission et gestion des erreurs serveur (mapping étape ↔ champ)
- [x] Task 10 — Tests (composants, service, wizard bout-en-bout côté client)

### Review Findings

- [x] [Review][Patch] `partie-detail.html` : le test "personnage déjà créé" vérifie `characters().length` — cette liste contient **tous** les personnages de la partie, pas ceux de l'utilisateur courant. Dès qu'un joueur crée son personnage, tous les autres perdent le CTA de création et voient à tort "vous avez déjà un personnage" [apps/web/src/app/features/parties/partie-detail/partie-detail.html, partie-detail.ts]
- [x] [Review][Patch] AC1 violé : le wizard n'appelle jamais `getGameSystemSchema()` — `STEP_KEYS`/`STEP_LABELS` sont codés en dur au lieu d'être pilotés par `creationSteps()`, contredisant l'exigence de réutilisabilité (NFR5) [apps/web/src/app/features/characters/character-wizard/character-wizard.ts]
- [x] [Review][Patch] Bug : les erreurs 400 sur `specialtyTypeId` naviguent vers la bonne étape (Classe) mais ne s'affichent jamais — `stepErrors` est indexé par le `field` brut du serveur, le template cherche par `currentStepKey()` (`'classId'` ≠ `'specialtyTypeId'`) [apps/web/src/app/features/characters/character-wizard/character-wizard.ts, character-wizard.html]
- [x] [Review][Patch] Erreurs serveur autres que 400/409 (500, session expirée, réseau) provoquent un rejet de promesse non géré dans `handleSubmitError` — aucun message affiché à l'utilisateur [apps/web/src/app/features/characters/character-wizard/character-wizard.ts]
- [x] [Review][Patch] Le bloc 400 suppose que chaque élément de `err.error.message` a la forme `{field, message}` — un 400 de validation DTO générique (tableau de strings via `ValidationPipe`) plante silencieusement le regroupement par champ [apps/web/src/app/features/characters/character-wizard/character-wizard.ts]
- [x] [Review][Patch] `ngOnInit()` n'a aucune gestion d'erreur si `getGameSystemContent()` échoue — l'assistant reste bloqué sur l'étape Classe sans aucune carte à afficher, sans message [apps/web/src/app/features/characters/character-wizard/character-wizard.ts]
- [x] [Review][Patch] Les boutons de navigation (précédent/suivant du bas, flèches d'en-tête) ne sont pas désactivés pendant `submitting()` — un utilisateur peut naviguer pendant qu'une soumission est en cours [apps/web/src/app/features/characters/character-wizard/character-wizard.html]
- [x] [Review][Patch] `WeaponStep` n'alimente pas `detail` sur ses `ChoiceCard` (contrairement à `ClassStep`/`TypeStep`) — `aria-label` incomplet (AC10) [apps/web/src/app/features/characters/character-wizard/steps/weapon-step/weapon-step.ts]
- [x] [Review][Patch] `specialtyTypeId` n'est pas réinitialisé quand l'utilisateur change de classe après avoir choisi Artisan — donnée obsolète potentiellement soumise au serveur [apps/web/src/app/features/characters/character-wizard/character-wizard.ts]
- [x] [Review][Patch] La liste d'erreurs de validation (`wizard__errors`) n'a pas de `aria-live`/`role="alert"` — non annoncée aux lecteurs d'écran [apps/web/src/app/features/characters/character-wizard/character-wizard.html]
- [x] [Review][Patch] `AttributesStep` perd l'état visuel des chips sélectionnés en quittant puis revenant sur l'étape Attributs (le composant est recréé par le `@switch` du conteneur) — les données restent correctes dans `sheetData`, mais l'affichage repart à vide [apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.ts]
- [x] [Review][Patch] Commentaire manquant au point de redirection post-succès expliquant que la Story 4.3 devra le remplacer par une vraie route de fiche [apps/web/src/app/features/characters/character-wizard/character-wizard.ts]
- [x] [Review][Defer] Assertions de type non défendues sur le contenu serveur (`entry.data as ClassData` etc. dans les 4 composants d'étape à choix) — un contenu seed malformé ferait planter le rendu de l'étape entière. Risque faible car ce contenu est rédigé localement par l'équipe (cohérent avec la tolérance déjà actée en Story 4.1 pour les fichiers seed) [class-step.ts, type-step.ts, weapon-step.ts, attributes-step.ts]
- [x] [Review][Defer→Corrigé lors de la rétrospective Epic 4 (2026-07-05)] `ChoiceCard` utilise la sémantique bouton-bascule (`aria-pressed`) plutôt qu'un vrai groupe radio (`role="radiogroup"`/`radio` + navigation flèches) pour une sélection unique — dépasse l'exigence littérale de l'AC10 (aria-label + aria-live), amélioration a11y future. **Corrigé** : `ChoiceCard` expose désormais `role="radio"`/`aria-checked` ; nouvelle directive partagée `RadioGroupNavDirective` (navigation flèches, boucle premier↔dernier) appliquée sur les 3 conteneurs `role="radiogroup"` (class-step, type-step, weapon-step).
- [x] [Review][Defer] Chips désactivés dans `AttributesStep` sans `aria-describedby` expliquant pourquoi (valeur déjà assignée ailleurs) — même catégorie que ci-dessus. **Tentative de correctif lors de la rétrospective Epic 4 (2026-07-05), revertée à la demande utilisateur** : l'ajout d'un `aria-describedby` vers un texte "Déjà assigné à [attribut]" a été perçu comme alourdissant l'interface, et le comportement de désactivation existant (un chip déjà pris ailleurs reste non cliquable tant qu'il n'est pas libéré côté attribut d'origine) a été perçu comme un blocage plutôt qu'une protection voulue. Reverté intégralement (fichier identique à avant la rétro) ; reste différé, à retraiter différemment si besoin (ex. tooltip discret plutôt qu'`aria-describedby`, ou repenser l'UX de désactivation elle-même plutôt que juste l'annoter).
- [x] [Amélioration UX, rétrospective Epic 4 (2026-07-05)] `AttributesStep.selectChip()` : recliquer sur le chip déjà sélectionné pour un attribut le désélectionne désormais (bascule), libérant sa valeur pour les autres attributs et redésactivant le bouton "Suivant" (l'assignation redevient incomplète) — jusqu'ici, une valeur assignée ne pouvait être changée qu'en la remplaçant directement par une autre valeur libre, jamais simplement "annulée" pour revenir à un état vide. Répond directement au point d'irritation qui motivait la tentative `aria-describedby` ci-dessus (blocage perçu, pas juste un manque d'explication). [apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.ts]
- [x] [Bug, même rétrospective] La désélection ci-dessus désélectionnait TOUS les attributs, pas seulement celui cliqué, une fois les 4 assignés. Cause : `selectChip()` émet `null` (incomplet) → le parent (`character-wizard.ts`) repasse `attributes: undefined` en entrée → l'`effect()` de resynchronisation (prévu pour restaurer la sélection au retour sur cette étape) réagissait à CHAQUE changement de l'input `attributes()`, y compris cet écho de notre propre émission, et réinitialisait tout l'état local à `{}`. Corrigé : l'effet ne se synchronise plus qu'une seule fois par instance du composant (flag `hasSyncedFromInput`), le composant étant de toute façon recréé par le `@switch` du conteneur à chaque retour sur l'étape — cf. Dev Notes originales. [apps/web/src/app/features/characters/character-wizard/steps/attributes-step/attributes-step.ts]
- [x] [Review][Defer] Aucune validation de schéma (type zod ou équivalent) à la frontière `GameSystemService.getContent()` → frontend — un contenu seed de forme incorrecte se propage jusqu'au crash du composant plutôt que d'être intercepté proprement ; aucun mécanisme de ce type n'existe ailleurs dans le repo actuellement
- [x] [Review][Dismiss] `FIELD_TO_STEP_INDEX` prétendument incomplet pour `fetiqueObject`/`equipment`/`narrative` — vérifié : `validate()` de `packages/game-rules` ne retourne jamais ces champs, la lacune est inatteignable en pratique
- [x] [Review][Dismiss] `derived()` recalculé sur un cast `RyuutamaSheetData` partiel — vérifié : `computeDerived()` ne lit que `data.attributes`, aucun impact runtime réel
- [x] [Review][Dismiss] Notice Magie n'empêche pas "Suivant" — lecture défendable de l'AC5 : la notice est purement informative (aucune saisie supplémentaire n'est attendue pour ce palier), donc "s'affiche avant de pouvoir continuer" est satisfait par un affichage inconditionnel
- [x] [Review][Dismiss] Panneau résumé cense réutiliser `SlotPanel` (AC2/Dev Notes) — vérifié : ce composant n'existe nulle part dans le repo, rien à réutiliser ; le CSS ad hoc actuel est la seule option disponible
- [x] [Review][Dismiss] Tests castant `fixture.componentInstance as any` — cohérent avec le pattern déjà en place ailleurs dans le repo (`poll-creation.spec.ts`)
- [x] [Review][Dismiss] Garde d'authentification de `GET /game-systems/:id/content` à confirmer — vérifié : héritée du `@UseGuards(AuthenticatedGuard)` de classe, cohérent avec `getSchema()`/`findAll()`

---

## Dev Notes

### Contexte hérité de la Story 4.1 (déjà implémentée et `done`)

L'API suivante existe déjà et ne doit **pas** être re-créée :
- `GET /game-systems` → `GameSystemDto[]`
- `GET /game-systems/:id/schema` → `GameSystemSchemaDto { sheetSchema, creationSteps }` (structure statique, PAS le contenu réel)
- `POST /parties/:id/characters` → crée un `Character`, valide + calcule `derived` côté serveur, 400/409 gérés
- `GET /characters/:id`, `GET /parties/:id/characters`

Package `@master-jdr/game-rules` (workspace) expose déjà :
```typescript
import { computeDerived, validate, type RyuutamaSheetData, type DerivedStats, type ValidationResult } from '@master-jdr/game-rules';
```
`computeDerived(data)` → `{ PV, PE, Condition, Initiative, Encombrement }`. `validate(data, 'strict')` → `{ valid, errors: {field, message}[] }`. **Ne pas dupliquer ces formules côté Angular** — c'est exactement la raison d'être du package (NFR5/NFR-5).

`packages/shared/src/index.ts` expose déjà `GameSystemDto`, `SheetData`, `DerivedStats`, `CharacterDto`, `CreateCharacterDto`, `GameSystemSchemaDto`. Importer en `import type` (érasé à la compilation, cf. `apps/web/tsconfig.json` paths déjà mappé pour `@master-jdr/shared`).

### Task 1 — Backend : `GET /game-systems/:id/content`

**Gap découvert lors de la préparation de cette story** : `GameSystemService.getSchema()` (Story 4.1) retourne uniquement une structure statique hard-codée (noms de champs/étapes), **pas** les données réelles (les 7 classes avec leurs talents, etc.) qui sont pourtant bien seedées en base via `ContentType`/`ContentEntry`. Sans cet endpoint, le wizard n'a aucune donnée à afficher dans les `ChoiceCard`.

**Ajouter dans `apps/api/src/game-systems/game-system.service.ts`** :
```typescript
async getContent(id: string): Promise<Record<string, Array<{ key: string; data: unknown }>>> {
  if (id !== RYUUTAMA_ID) {
    throw new NotFoundException('Système de jeu introuvable');
  }
  const contentTypes = await this.prisma.contentType.findMany({
    where: { gameSystemId: id },
    include: { entries: { where: { scope: 'BASE' } } },
  });
  const result: Record<string, Array<{ key: string; data: unknown }>> = {};
  for (const ct of contentTypes) {
    result[ct.key] = ct.entries.map((e) => ({ key: e.key, data: e.data }));
  }
  return result;
}
```

**Ajouter dans `apps/api/src/game-systems/game-system.controller.ts`** :
```typescript
@Get(':id/content')
getContent(@Param('id') id: string) {
  return this.gameSystems.getContent(id);
}
```

**Ajouter dans `packages/shared/src/index.ts`** (à la fin, ne pas modifier l'existant) :
```typescript
/** Entrée de contenu générique d'un système de jeu (ex: une classe, un type, une arme). */
export interface ContentEntryDto {
  key: string;
  data: unknown;
}

/** Réponse de GET /game-systems/:id/content — groupé par clé de ContentType. */
export type GameSystemContentDto = Record<string, ContentEntryDto[]>;
```

**Tests** : `game-system.service.spec.ts` (nouveau fichier, pattern identique à `character.service.spec.ts` de la Story 4.1 — mock `PrismaService`) : `getContent('ryuutama')` retourne le contenu groupé, `getContent('unknown')` lève `NotFoundException`.

**Vérification manuelle attendue** (même pattern que la Story 4.1) : après implémentation, `GET /game-systems/ryuutama/content` doit retourner exactement `{ class: [...7...], type: [...3...], attributePattern: [...1...], weaponCategory: [...5...] }` — comparer avec le contenu réel de `apps/api/game-systems/ryuutama/data/*.json` en local.

### Task 2 — Fix `apps/web/tsconfig.json`

**Gap connu, documenté dans le `deferred-work.md` de la Story 4.1** : `apps/web/tsconfig.json` ne mappe que `@master-jdr/shared` dans `paths` :
```json
"paths": { "@master-jdr/shared": ["../../packages/shared/src/index.ts"] }
```
`@master-jdr/game-rules` n'y est pas — et ce package utilise des imports relatifs `.ts` en interne (`./ryuutama/compute-derived.ts`), ce qui a nécessité `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` côté `apps/api/tsconfig.json` (Story 4.1). **Reproduire le même correctif côté `apps/web/tsconfig.json`** avant d'importer quoi que ce soit de `@master-jdr/game-rules` dans un composant Angular — sinon build/type-check échoue avec `TS5097`/`ERR_MODULE_NOT_FOUND` (mêmes erreurs rencontrées et documentées dans la Story 4.1).

Ajouter dans `apps/web/tsconfig.json` :
```json
"paths": {
  "@master-jdr/shared": ["../../packages/shared/src/index.ts"],
  "@master-jdr/game-rules": ["../../packages/game-rules/src/index.ts"]
},
"allowImportingTsExtensions": true,
"rewriteRelativeImportExtensions": true
```

**Vérifier après le fix** : `docker compose exec web pnpm build` (ou `ng build`) compile sans erreur, et `docker compose restart web` démarre proprement (mêmes vérifications que la Story 4.1 côté API).

### Task 3 — Microcopy `character.*`

**Fichier** : `apps/web/src/app/core/theme/tones.ts`. Suivre exactement le pattern existant (`TONE_MAP: Record<Theme, Record<string, string>>`, clés à plat, namespace par point). Ajouter dans chacun des 3 objets de thème (`grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk`) les 7 clés suivantes (texte exact tiré de `EXPERIENCE.md` §3 — Palier P3) :

| Clé | Grimoire Émeraude | Forêt Ancienne | Médiéval Steampunk |
|---|---|---|---|
| `character.create_cta` | "Créer un voyageur" | "Éveiller un compagnon de route" | "Assembler un automate-voyageur" |
| `character.tab_label` | "Personnages" | "Personnages" | "Personnages" |
| `character.step_class` | "Choisir sa vocation" | "Choisir son rôle dans le cercle" | "Choisir sa fonction" |
| `character.step_type` | "Choisir sa voie" | "Choisir son chemin" | "Choisir son mécanisme" |
| `character.magic_deferred_notice` | "La magie s'apprendra plus tard, jeune sorcier — pour l'instant, seuls les dons passifs s'activent." | "Les sortilèges des saisons dorment encore — reviens quand le cercle sera prêt." | "Le grimoire à vapeur n'est pas encore calibré pour les formules — les avantages de base restent actifs." |
| `character.portrait_missing` | "Aucun portrait — le conteur imagine un visage" | "Aucun visage gravé — la forêt garde son mystère" | "Aucun portrait gravé sur la plaque" |
| `character.portrait_edit_cta` | "Modifier le portrait" | "Modifier le portrait" | "Recalibrer le portrait" |

Note : `portrait_missing`/`portrait_edit_cta` ne sont **pas utilisées par cette story** (Story 4.5) mais sont ajoutées maintenant pour respecter UX-DR19 (les 7 clés livrées ensemble) — ne pas les câbler dans un composant ici.

Usage dans un composant : `protected readonly theme = inject(ThemeToneService);` puis `{{ theme.tone()['character.step_class'] }}` dans le template.

### Task 4 — `CharacterService` frontend

**Nouveau dossier** `apps/web/src/app/core/characters/`. Suivre exactement le pattern de `apps/web/src/app/core/parties/parties.service.ts` :

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  CharacterDto,
  CreateCharacterDto,
  GameSystemDto,
  GameSystemSchemaDto,
  GameSystemContentDto,
} from '@master-jdr/shared';

const API = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly http = inject(HttpClient);

  getGameSystems(): Promise<GameSystemDto[]> {
    return firstValueFrom(this.http.get<GameSystemDto[]>(`${API}/game-systems`, { withCredentials: true }));
  }

  getGameSystemSchema(id: string): Promise<GameSystemSchemaDto> {
    return firstValueFrom(this.http.get<GameSystemSchemaDto>(`${API}/game-systems/${id}/schema`, { withCredentials: true }));
  }

  getGameSystemContent(id: string): Promise<GameSystemContentDto> {
    return firstValueFrom(this.http.get<GameSystemContentDto>(`${API}/game-systems/${id}/content`, { withCredentials: true }));
  }

  create(partieId: string, dto: CreateCharacterDto): Promise<CharacterDto> {
    return firstValueFrom(this.http.post<CharacterDto>(`${API}/parties/${partieId}/characters`, dto, { withCredentials: true }));
  }

  listByPartie(partieId: string): Promise<CharacterDto[]> {
    return firstValueFrom(this.http.get<CharacterDto[]>(`${API}/parties/${partieId}/characters`, { withCredentials: true }));
  }
}
```

**Gestion des erreurs 400/409** : `HttpClient` rejette la Promise avec un `HttpErrorResponse` dont `.error` contient le corps JSON de la réponse Nest (`{ message: [...], error: 'Bad Request', statusCode: 400 }` pour les erreurs de validation — `message` est un tableau de `{field, message}` cf. `BadRequestException(result.errors)` de `CharacterService.create()` côté API ; `{ message: string, statusCode: 409 }` pour le conflit). Le composant appelant doit `catch` et inspecter `err.status`/`err.error.message`.

### Task 5 — `ChoiceCard`

Réutilise le pattern visuel de `PollOption` (Story 3.2/3.3, cf. `apps/web/src/app/features/poll/`) — **chercher le composant existant qui rend une option de vote cliquable/sélectionnable et en extraire le pattern de style/état** (default/hover/selected), pas le dupliquer depuis zéro.

API du composant (générique, réutilisable pour classe/type/arme) :
```typescript
// choice-card.ts
export interface ChoiceCardOption {
  key: string;
  label: string;
  detail?: string; // texte informatif affiché immédiatement à la sélection (talents, avantages...)
}

@Component({ selector: 'app-choice-card', standalone: true, ... })
export class ChoiceCard {
  option = input.required<ChoiceCardOption>();
  selected = input<boolean>(false);
  selectedOption = output<string>(); // emits option.key
}
```
`aria-label` = `"${option.label} : ${option.detail}"` (AC10).

### Task 6 — `CharacterWizard` (conteneur)

**Dossier** : `apps/web/src/app/features/characters/character-wizard/`.

État recommandé (signals, pas de reactive forms — le pattern `poll-creation.ts` de la Story 3.2 est la référence la plus proche : signals pour l'état, `computed()` pour les dérivés, pas de RxJS) :
```typescript
currentStepIndex = signal(0);
sheetData = signal<Partial<RyuutamaSheetData>>({});
gameSystemContent = signal<GameSystemContentDto | null>(null); // chargé au OnInit via CharacterService.getGameSystemContent('ryuutama')

derived = computed<DerivedStats | null>(() => {
  const attrs = this.sheetData().attributes;
  return attrs ? computeDerived({ ...this.sheetData(), attributes: attrs } as RyuutamaSheetData) : null;
});

readonly STEPS = ['classId', 'typeId', 'attributes', 'weaponCategoryId', 'fetiqueObject', 'equipment', 'narrative'] as const;

canGoNext = computed(() => { /* logique de garde par étape, cf. AC4/AC5/AC6 */ });
```

**Layout responsif** : utiliser une media query CSS (`@media (min-width: 1024px)`) plutôt qu'un service de breakpoint — cohérent avec le seuil `1024px` explicite de l'UX (§9 EXPERIENCE.md), **différent du breakpoint tablette générique 768px** utilisé ailleurs dans l'app (calendrier). Ne pas réutiliser un éventuel breakpoint 768px existant sans vérifier lequel s'applique ici.

**`SlotPanel`** (panneau résumé desktop) : chercher le composant existant réutilisé pour le récapitulatif du calendrier/vote et suivre son pattern d'layout (carte élevée, `elevation-panel`), pas le recréer.

### Task 7 — Composants d'étape

Un composant standalone par étape (`class-step/`, `type-step/`, `attributes-step/`, `weapon-step/`, `fetish-step/`, `equipment-step/`, `narrative-step/`), chacun sous `character-wizard/steps/`. Chaque step reçoit ses données en `input()` et émet en `output()` — pas d'accès direct au state du conteneur (découplage testable).

**AttributesStep — détail du contrôle "chips assignables"** (AC6) : 4 valeurs du pattern choisi (`{8,4,6,6}` pour Polyvalent, valeurs lues depuis `gameSystemContent().attributePattern[0].data.values`, **ne pas hard-coder `[8,4,6,6]` dans le composant** — c'est exactement le contenu que Task 1 expose pour éviter ça) affichées comme des chips ; chaque chip cliqué/glissé vers un des 4 slots AGI/ESP/INT/VIG ; une valeur déjà assignée à un attribut ne peut pas être réassignée ailleurs sans d'abord libérer son emplacement (contrainte de multiset fixe). Émettre `{ AGI, ESP, INT, VIG }` uniquement quand les 4 sont assignées.

**Artisan (ClassStep)** : sous-choix "type d'objet de spécialité" = champ texte libre affiché conditionnellement quand `classId === 'artisan'` (pas de liste fermée dans l'addendum — c'est un champ texte, cf. `specialtyTypeId?: string` dans `RyuutamaSheetData`).

**EquipmentStep** : `RyuutamaSheetData.equipment?: { individual: string[]; group: string[] }` existe bien dans le type (cf. `packages/game-rules/src/ryuutama/types.ts`, Story 4.1) mais n'est **pas vérifié** par `validate()` (les 5 règles strictes de l'addendum §9 ne portent pas sur l'équipement — mode pique-nique = pas de contrainte de budget). Cette étape est donc en lecture seule côté UI (aucune interaction requise, AC8) : afficher la liste fixe (nécessaire de voyage : grand sac à dos, sac de couchage, couverts, outre, 2 rations ; nécessaire d'intendance de groupe : animal de bât, tonneau, caisse, nécessaire de cuisine, 3 torches, briquet, savon, nécessaire à lessive, tente — cf. addendum §8) en texte statique dans le composant (ce n'est pas du contenu piloté par `ContentEntry`, le mode "pique-nique" est un texte d'écran fixe pour ce palier), et pré-remplir automatiquement `sheetData.equipment = { individual: [...], group: [...] }` avec ces mêmes listes au montage de l'étape, sans interaction joueur.

### Task 8 — Intégration dans `partie-detail`

**Important** : `partie-detail.ts`/`.html` n'a **aucune structure d'onglets aujourd'hui** (une seule `mat-card` avec des `<section>` empilées). Cette story introduit `MatTabsModule` (jamais importé ailleurs dans le repo — vérifier via `grep -r MatTabsModule apps/web` avant de commencer, doit être vide) pour la première fois. Refactorer les sections existantes (`scheduling-widget`, `members`, `invite`) en un premier onglet, puis ajouter l'onglet "Personnages" (libellé via `theme.tone()['character.tab_label']`).

**Contenu de l'onglet Personnages** (minimal pour cette story — la vraie liste/carte de personnage est Story 4.3) :
- Si `characters.length === 0` : carte CTA "+ [character.create_cta]" → navigue vers la route du wizard
- Sinon : liste simple (texte, pas de `CharacterSummaryCard` stylée — hors scope, Story 4.3) indiquant qu'un personnage existe déjà, sans lien vers une fiche (n'existe pas encore)

**Route** (`apps/web/src/app/app.routes.ts`, suivre le pattern existant `parties/:id/...` sous `Shell`/`authGuard`) :
```typescript
{ path: 'parties/:id/characters/new', component: CharacterWizard },
```

### Task 9 — Soumission et mapping des erreurs

**Redirection en cas de succès** : `Story 4.3 (fiche personnage) n'existe pas encore.` Rediriger vers `/parties/:id` (onglet Personnages) plutôt que vers une fiche inexistante. **Ne pas inventer de route de fiche factice** — utiliser `router.navigate(['/parties', partieId])`. Documenter ce choix dans un commentaire au point de redirection pour que la Story 4.3 sache remplacer ce comportement.

**Mapping erreur serveur → étape** (AC9) — `ValidationError.field` retourné par `packages/game-rules`' `validate()` (via le 400 de `POST /parties/:id/characters`) correspond directement aux clés de `RyuutamaSheetData` :

| `field` | Étape à rouvrir |
|---|---|
| `classId` | 1 (Classe) |
| `specialtyTypeId` | 1 (Classe, sous-choix Artisan) |
| `typeId` | 2 (Type) |
| `attributes` | 3 (Attributs) |
| `weaponCategoryId` | 4 (Arme favorite) |

Sur 400, parser `err.error.message` (tableau de `{field, message}`), prendre `err.error.message[0].field`, retrouver l'index d'étape via cette table, `currentStepIndex.set(index)`, afficher tous les messages d'erreur sur cette étape (pas seulement le premier).

Sur 409, afficher `err.error.message` (string) et rediriger immédiatement vers `/parties/:id`.

### Task 10 — Tests

Suivre le pattern `poll-creation.spec.ts` (Story 3.2) : `TestBed.configureTestingModule` direct (pas Angular Testing Library), services fake via factories (`makeCharacterServiceFake()`), `vitest` (`vi.fn()`), `fixture.componentRef.setInput(...)` pour les inputs signal, `afterEach(() => TestBed.resetTestingModule())`.

Couverture minimale :
- `character.service.spec.ts` : chaque méthode HTTP appelle la bonne URL/méthode
- `class-step.spec.ts` : sélection classe → émission + affichage talents ; Artisan → sous-choix requis
- `type-step.spec.ts` : sélection Magie → notice affichée
- `attributes-step.spec.ts` : assignation des 4 chips → émission de `{AGI,ESP,INT,VIG}` complet uniquement quand tout est assigné ; réassignation bloquée sans libération préalable
- `character-wizard.spec.ts` : navigation étape par étape, `canGoNext` par étape, `derived` recalculé en direct (mock `computeDerived` non nécessaire — utiliser la vraie fonction pure de `@master-jdr/game-rules`, aucun mock réseau requis pour elle), soumission réussie → navigation, 400 → retour à l'étape fautive, 409 → redirection
- `game-system.service.spec.ts` (backend, Task 1) : `getContent()` groupe correctement, 404 sur id inconnu

## Patterns existants à suivre absolument

| Pattern | Où | À ne pas réinventer |
|---|---|---|
| Signals + `computed()`, pas de RxJS dans le composant | `poll-creation.ts` | Story 3.2 |
| `input.required<T>()` / `output<T>()` (I/O signal-based) | `poll-creation.ts` | Story 3.2 |
| `inject()` au lieu du constructeur pour les services | `poll-creation.ts`, `partie-detail.ts` | Tous les composants récents |
| `protected readonly theme = inject(ThemeToneService)` + `theme.tone()['key']` | tous les composants existants | `theme-tone.service.ts` |
| Service HTTP : `API` constant, `firstValueFrom`, `withCredentials: true` | `parties.service.ts` | Tous les `core/*.service.ts` |
| `import type` pour `@master-jdr/shared` | tous les fichiers existants | — |
| `@if`/`@for`, jamais `*ngIf`/`*ngFor` | tout le repo | P1-AD-5 |
| Tests : `TestBed` direct + `vitest`, pas de Testing Library | `poll-creation.spec.ts` | Tous les `.spec.ts` du repo |
| `MatDialog` + `firstValueFrom(ref.afterClosed())` pour confirmations | `partie-detail.ts` (`ConfirmDialog`) | Si un dialogue de confirmation est nécessaire |

## Ce qui est HORS SCOPE de cette story

**Ne pas implémenter dans cette story :**
- Étape 8 (Portrait), upload/recadrage → **Story 4.5**
- `CharacterSummaryCard` stylée, vue liste complète de l'onglet Personnages → **Story 4.3**
- Fiche de personnage en lecture seule (destination de la redirection post-création) → **Story 4.3**
- Export PDF → **Story 4.4**
- Patterns d'attributs Équilibré et Spécialiste (seul Polyvalent existe ce palier, cf. Open Question PRD) — le contrôle "chips assignables" doit lire le pattern depuis `GameSystemContentDto`, pas le coder en dur, pour rester compatible le jour où d'autres patterns seront ajoutés
- Sélection de sorts pour le type Magie (notice uniquement, cf. AC5)
- Achat d'équipement / catalogue (mode pique-nique fixe uniquement)
- Édition d'un personnage existant après création (aucune mutation ce palier)

## Notes de contexte épique

Cette story construit l'assistant de création frontend sur l'API posée par la Story 4.1 (`done`). Les stories 4.3 (fiche), 4.4 (export PDF) et 4.5 (portrait) complètent l'Epic 4 par la suite — 4.2 doit rester fonctionnelle de façon autonome sans dépendre d'elles (redirection provisoire vers l'onglet Personnages, pas vers une fiche qui n'existe pas encore).

**Réutilisabilité (NFR5/NFR-2)** : le wizard doit rester générique — piloté par `sheetSchema()`/`creationSteps()`/`GET .../content`, pas par du contenu Ryuutama codé en dur dans les composants de layout/navigation. Les composants *spécifiques* au rendu d'un type de contenu (ex. `ChoiceCard` pour classe/type/arme, "chips assignables" pour attributs) sont acceptables car génériques eux-mêmes (paramétrés par les données reçues), contrairement à des listes de classes/talents hard-codées.

**Performance (NFR7/NFR-4)** : `computeDerived()` s'exécute exclusivement côté client pendant la création, aucun appel réseau pour l'affichage live des stats dérivées.

## Dev Agent Record

### Completion Notes

- Gap AC0 comblé : `GET /game-systems/:id/content` ajouté (backend), renvoie le contenu `ContentEntry` groupé par clé de `ContentType`. Vérifié en direct : 7 classes, 3 types, 1 pattern, 5 armes conformes au seed.
- `apps/web/tsconfig.json` corrigé (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions` + path mapping `@master-jdr/game-rules`) — vérifié par un import réel de `computeDerived()` dans `CharacterWizard`, en dev (`ng build` watch) et en build de production (`pnpm build`), les deux compilent sans erreur.
- 7 clés microcopy `character.*` ajoutées dans les 3 thèmes de `tones.ts`.
- `CharacterService` frontend créé (`core/characters/`), suit le pattern `API_BASE` de `poll.service.ts`.
- Composant générique `ChoiceCard` créé (pas de composant `PollOption` réutilisable trouvé dans le code — le nom vient de la conception UX ; le pattern visuel/interaction a été reconstruit en suivant les conventions CSS `--mat-sys-*` et BEM déjà en place).
- `CharacterWizard` (conteneur) + 7 composants d'étape (`ClassStep`, `TypeStep`, `AttributesStep`, `WeaponStep`, `FetishStep`, `EquipmentStep`, `NarrativeStep`) implémentés en signals purs, sans reactive forms (cohérent avec `poll-creation.ts`).
- `AttributesStep` : le contrôle "chips assignables" suit les index du tableau `values` du pattern (pas les valeurs elles-mêmes) pour gérer correctement les valeurs dupliquées du pattern Polyvalent ({8,4,6,6} — deux `6` distincts, testé explicitement).
- Onglet "Personnages" ajouté à `partie-detail` via `MatTabsModule` (première utilisation dans le repo, vérifié qu'aucune autre utilisation n'existait avant). Les sections existantes (planification, membres, invitations) sont regroupées dans un premier onglet "Détails" sans changement de comportement (tests existants inchangés, tous passent).
- Soumission : succès → redirection vers `/parties/:id` (la fiche Story 4.3 n'existe pas encore) ; 400 → mapping `field → étape` et affichage contextualisé des erreurs sur l'étape rouverte ; 409 → notification + redirection.
- **Point technique découvert en testant** : Angular Material `mat-tab-group` n'attache le contenu que de l'onglet actif au DOM (les tests ne peuvent pas vérifier le contenu d'un onglet inactif sans déclencher un vrai changement d'onglet, ce qui s'est révélé fragile en environnement de test zoneless). Les tests de l'onglet Personnages vérifient donc le câblage du service et l'état du signal `characters()` plutôt que le rendu DOM post-changement d'onglet — le comportement visuel réel a été vérifié par la compilation de production et le démarrage du serveur de dev (voir ci-dessous), mais pas par une navigation manuelle en navigateur (aucun outil de ce type disponible dans cette session).
- Suite de tests finale : 119/119 Jest (API, incluant les 2 nouveaux tests `game-system.service.spec.ts`) + 161/161 Vitest (web, incluant tous les nouveaux composants). Build de production `apps/web` et `apps/api` tous deux vérifiés sans erreur.
- **Revue de code (2026-07-04)** : 12 findings `patch` corrigés, dont un bug bloquant critique (le contrôle "personnage déjà créé" de l'onglet Personnages testait tous les personnages de la partie au lieu de ceux de l'utilisateur courant — bloquait la création multi-joueurs) et une violation d'AC (AC1 : le wizard n'appelait jamais `getGameSystemSchema()`, les étapes étaient codées en dur — corrigé en pilotant `steps()` depuis `creationSteps()` du schéma, filtré aux 7 clés couvertes par cette story). Détail des 12 correctifs dans la section Review Findings ci-dessous. 4 findings `defer` documentés dans `deferred-work.md`.
- **Effet de bord découvert en corrigeant** : l'ajout du code de gestion d'erreurs/chargement a fait dépasser le budget de bundle initial strict d'Angular (erreur de build, pas juste un warning). Corrigé en convertissant la route `parties/:id/characters/new` en lazy-loading (`loadComponent`) — première route lazy du repo, mais justifiée ici car le wizard (composants + Angular Material) n'a pas besoin d'être dans le bundle initial. Build de production revérifié : succès (973.65 kB, sous la limite de 1 Mo).
- Suite de tests post-revue : 119/119 Jest (API, inchangé) + 171/171 Vitest (web, +10 tests pour les correctifs).

### File List

- `apps/api/src/game-systems/game-system.service.ts` (modifié — `getContent()`)
- `apps/api/src/game-systems/game-system.controller.ts` (modifié — route `GET :id/content`)
- `apps/api/src/game-systems/game-system.service.spec.ts` (nouveau)
- `packages/shared/src/index.ts` (modifié — `ContentEntryDto`, `GameSystemContentDto`)
- `apps/web/tsconfig.json` (modifié — path mapping + `allowImportingTsExtensions`/`rewriteRelativeImportExtensions`)
- `apps/web/src/app/core/theme/tones.ts` (modifié — 7 clés `character.*` × 3 thèmes)
- `apps/web/src/app/core/characters/character.service.ts` (nouveau)
- `apps/web/src/app/core/characters/character.service.spec.ts` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/choice-card/choice-card.ts` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/choice-card/choice-card.html` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/choice-card/choice-card.scss` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/choice-card/choice-card.spec.ts` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/*` (nouveau, 4 fichiers)
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/*` (nouveau, 4 fichiers)
- `apps/web/src/app/features/characters/character-wizard/steps/attributes-step/*` (nouveau, 4 fichiers)
- `apps/web/src/app/features/characters/character-wizard/steps/weapon-step/*` (nouveau, 4 fichiers)
- `apps/web/src/app/features/characters/character-wizard/steps/fetish-step/*` (nouveau, 4 fichiers)
- `apps/web/src/app/features/characters/character-wizard/steps/equipment-step/*` (nouveau, 4 fichiers)
- `apps/web/src/app/features/characters/character-wizard/steps/narrative-step/*` (nouveau, 4 fichiers)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.ts` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.html` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.scss` (nouveau)
- `apps/web/src/app/features/characters/character-wizard/character-wizard.spec.ts` (nouveau)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (modifié — signal `characters`, chargement via `CharacterService`)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (modifié — `mat-tab-group` : onglet Détails + onglet Personnages)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (modifié — tests onglet Personnages)
- `apps/web/src/app/app.routes.ts` (modifié — route `parties/:id/characters/new` en lazy-loading)

## Change Log

- 2026-07-04 : Implémentation complète de la story 4.2 (Tasks 1-10) : endpoint `GET /game-systems/:id/content` (gap backend comblé), fix `apps/web/tsconfig.json` pour `@master-jdr/game-rules`, microcopy `character.*`, `CharacterService` frontend, `ChoiceCard`, `CharacterWizard` + 7 composants d'étape, onglet "Personnages" dans `partie-detail`, soumission avec mapping d'erreurs contextualisées.
- 2026-07-04 : Revue de code — 12 findings `patch` corrigés (bug bloquant multi-joueurs, violation AC1 sur le pilotage par schéma, bug d'affichage d'erreur specialtyTypeId, gestion d'erreurs réseau/500/400-générique, désactivation navigation pendant soumission, a11y ChoiceCard/erreurs, restauration visuelle AttributesStep, reset specialtyTypeId, commentaire redirection), 4 findings `defer` documentés. Route du wizard passée en lazy-loading suite à un dépassement du budget de bundle découvert pendant la correction.
- 2026-07-04 : Retours utilisateur post-livraison — onglet Personnages : affiche le nom du personnage (bouton désactivé, la navigation vers la fiche est le scope de la Story 4.3, confirmé avec l'utilisateur) au lieu du message générique "vous avez déjà un personnage" ; étape Narratif : champ Âge en `input type="number"` rejetant les valeurs négatives, champ Sexe converti en liste déroulante (Homme/Femme/Autre/Non précisé).
