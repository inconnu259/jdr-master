---
baseline_commit: d9d6a01d2383ac1c80ebbe752a83f681cc0594e3
---

# Story 23.2: Correction et enrichissement des talents de classe et avantages de type

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want voir une description propre à chaque talent de classe et à chaque avantage de type, et que ces talents/avantages correspondent réellement aux règles du *Guide du Voyageur*,
so that je comprenne ce que chaque talent/avantage fait concrètement, sans jouer avec des noms ou des effets approximés qui n'existent pas dans le livre.

## ⚠️ Découverte critique ayant élargi le scope de cette story

En préparant cette story (comparaison systématique de `apps/api/game-systems/ryuutama/data/classes.json`/`types.json` avec `docs/classes.md`/`docs/types.md`), il s'avère que **les talents/avantages actuellement seedés ne correspondent pas aux vrais talents/avantages du livre**, sauf pour l'Artisan et le type Attaque :

| Classe | Talents seedés (avant cette story) | Vrais talents du livre | Correspondance |
|---|---|---|---|
| Artisan | Création, Réparation, Transformation | Création, Réparation, Transformation | ✅ 3/3 — inchangé |
| Chasseur | Pistage, Camouflage, Piège | Chasse, Transformation, Traque | ❌ 0/3 — à remplacer |
| Fermier | Culture, Élevage, Météorologie | Dressage, Métier d'appoint, Robuste | ❌ 0/3 — à remplacer |
| Guérisseur | Soin, Diagnostic, Remède | Elixir miracle, Herboristerie, Soins | ❌ 0/3 — à remplacer |
| Marchand | Négociation, Évaluation, Réseau | Commerce, Dressage, Éloquence | ❌ 0/3 — à remplacer |
| Ménestrel | Musique, Conte, Danse | Légendes, Mélodies, Voyages | ❌ 0/3 — à remplacer |
| Noble | Étiquette, Commandement, Diplomatie | Érudition, Escrime, Étiquette | ⚠️ 1/3 — Étiquette gardée (texte/valeurs corrigés), Commandement/Diplomatie remplacés |

| Type | Avantages seedés (avant cette story) | Vrais avantages du livre | Correspondance |
|---|---|---|---|
| Attaque | Endurance, Puissance, Entraînement | Endurance, Puissance, Entraînement | ✅ 3/3 — inchangé |
| Technique | Agilité, Précision, Réflexes | Précision, Vitesse, Bagages | ⚠️ 1/3 — Précision gardée (effet corrigé), Agilité/Réflexes remplacés |
| Magie | Réserve, Canalisation, Affinité | Volonté, Grimoire, "lié aux saisons" | ❌ 0/3 — à remplacer |

**Décision utilisateur (2026-07-26) :** corriger entièrement les classes et types concernés — noms, effets, attributs, difficultés — pas seulement ajouter une description sur les entrées déjà (par coïncidence) correctes. Cette story remplace donc le contenu erroné en plus d'ajouter le champ `description`.

**Vérifié : aucun code ne référence un nom de talent/avantage en dur.** `packages/game-rules/src/ryuutama/validate.ts`, `apps/api/src/game-systems/game-system.service.ts` et `packages/game-rules/src/ryuutama/pdf-field-map.ts` ne valident/lisent que les clés de classe/type (`classId`/`typeId`) et les tableaux `talents`/`advantages` génériquement (`.map(t => t.name)` etc.) — renommer/remplacer des talents ne casse aucune validation ni aucun test existant portant sur des noms de talents (il n'y en a aucun).

## Acceptance Criteria

1. **Given** une classe seedée (`classes.json`), **when** elle est chargée, **then** ses 3 talents correspondent réellement aux talents du *Guide du Voyageur* pour cette classe (nom, effet court, attributs, difficulté conformes au livre — cf. tables de contenu ci-dessous en Dev Notes).
2. **Given** un type seedé (`types.json`), **when** il est chargé, **then** ses 3 avantages correspondent réellement aux avantages du livre pour ce type (nom, effet conformes au livre).
3. **Given** un talent de classe (corrigé par AC1), **when** il est chargé, **then** il porte son propre champ `description` non vide, transcrit du paragraphe d'intro réel du talent dans `docs/classes.md`, distinct de la description de la classe parente déjà ajoutée par la Story 23.1.
4. **Given** `ClassStep`, **when** un talent est affiché dans la liste des talents de la classe sélectionnée, **then** son texte de description propre s'affiche à côté de son nom/effet, jamais confondu avec le texte de la classe parente.
5. **Given** un avantage de type (corrigé par AC2), **when** il est chargé, **then** il **ne** porte **pas** de champ `description` — `docs/types.md` ne fournit qu'un nom et un effet par avantage (tableau à 2 colonnes), aucun texte narratif propre à l'avantage n'existe dans le livre ; inventer ce texte violerait la règle absolue « ne jamais halluciner de contenu ». Le texte d'intro du type (`description` de niveau type, Story 23.1) et l'`effect` de l'avantage suffisent.
6. **Given** cette story, **when** elle est complétée, **then** elle ne touche ni ne restructure le champ `effect` (reste une chaîne de texte simple, `{ description, conditions }` structuré est explicitement le scope de la Story 23.6, AD-10) — `attributes`/`difficulty` restent des champs frères de `effect` au même niveau qu'aujourd'hui.
7. **Given** les 7 classes existantes, **when** cette story est complétée, **then** le nombre de classes reste 7 et le nombre de types reste 3 (aucune classe/type ajouté — c'est le scope de la Story 23.4) ; seul le contenu des talents/avantages *existants* change.

## Tasks / Subtasks

- [x] Task 1 — Corriger et enrichir les 3 talents de l'Artisan (AC: #1, #3) — déjà corrects, seule la description manque
  - [x] `classes.json` → `artisan.talents` : ajouter `description` à Création/Réparation/Transformation (texte fourni en Dev Notes) ; ne rien changer à `name`/`effect`/`attributes`/`difficulty` (déjà conformes au livre)

- [x] Task 2 — Remplacer et enrichir les 3 talents du Chasseur (AC: #1, #3)
  - [x] `classes.json` → `chasseur.talents` : remplacer Pistage/Camouflage/Piège par Chasse/Transformation/Traque (nom, effect, attributes, difficulty, description — cf. Dev Notes)

- [x] Task 3 — Remplacer et enrichir les 3 talents du Fermier (AC: #1, #3)
  - [x] `classes.json` → `fermier.talents` : remplacer Culture/Élevage/Météorologie par Dressage/Métier d'appoint/Robuste (cf. Dev Notes)
  - [x] Le talent *Métier d'appoint* porte `attributes: []`/`difficulty: "-"` (pas de test propre — dépend du talent emprunté) ; ne PAS câbler le choix de talent d'une autre classe ici — c'est le scope de la Story 23.8, déjà planifiée

- [x] Task 4 — Remplacer et enrichir les 3 talents du Guérisseur (AC: #1, #3)
  - [x] `classes.json` → `guerisseur.talents` : remplacer Soin/Diagnostic/Remède par Elixir miracle/Herboristerie/Soins (cf. Dev Notes)

- [x] Task 5 — Remplacer et enrichir les 3 talents du Marchand (AC: #1, #3)
  - [x] `classes.json` → `marchand.talents` : remplacer Négociation/Évaluation/Réseau par Commerce/Dressage/Éloquence (cf. Dev Notes)

- [x] Task 6 — Remplacer et enrichir les 3 talents du Ménestrel (AC: #1, #3)
  - [x] `classes.json` → `menestrel.talents` : remplacer Musique/Conte/Danse par Légendes/Mélodies/Voyages (cf. Dev Notes)

- [x] Task 7 — Corriger et enrichir les 3 talents du Noble (AC: #1, #3)
  - [x] `classes.json` → `noble.talents` : remplacer Commandement/Diplomatie par Érudition/Escrime ; garder Étiquette mais corriger `effect`/`attributes`/`difficulty` selon le livre (cf. Dev Notes)

- [x] Task 8 — Vérifier les 3 avantages du type Attaque (AC: #2) — déjà corrects, rien à faire
  - [x] `types.json` → `attaque.advantages` : `name`/`effect` déjà conformes au livre, aucun changement (pas de champ `description` — cf. AC5)

- [x] Task 9 — Remplacer les 3 avantages du type Technique (AC: #2)
  - [x] `types.json` → `technique.advantages` : remplacer Agilité/Réflexes par Vitesse/Bagages ; garder Précision mais corriger son `effect` selon le livre (cf. Dev Notes)

- [x] Task 10 — Remplacer les 3 avantages du type Magie (AC: #2)
  - [x] `types.json` → `magie.advantages` : remplacer Réserve/Canalisation/Affinité par Volonté/Grimoire/« Lié aux saisons » (cf. Dev Notes)

- [x] Task 11 — Étendre `ClassTalent`/afficher la description de chaque talent dans `ClassStep` (AC: #4)
  - [x] `class-step.ts` : ajouter `description: string` à l'interface `ClassTalent` (ligne 8-11)
  - [x] `class-step.html` : dans le `@for (talent of data.talents; ...)`, afficher `talent.description` en plus de `talent.name`/`talent.effect` (ex. sur une seconde ligne du `<li>`), sans toucher au `<p class="class-step__description">{{ data.description }}</p>` déjà en place pour la classe (Story 23.1)
  - [x] `class-step.spec.ts` : mettre à jour les fixtures `CLASSES` avec les nouveaux talents corrigés (cohérents avec le contenu réel désormais) + `description` par talent, ajouter une assertion sur le texte de description d'au moins un talent

- [x] Task 12 — `TypeStep` : aucun changement de câblage (AC: #5)
  - [x] `TypeAdvantage` (`type-step.ts`) reste `{ name, effect }`, **pas** de champ `description` ajouté — `docs/types.md` ne fournit aucun texte narratif par avantage (cf. AC5). Tentative initiale d'ajouter une description inventée détectée en revue utilisateur (2026-07-26) et retirée (`type-step.ts`/`.html`/`.spec.ts`, `types.json`) — voir Completion Notes.
  - [x] `type-step.spec.ts` : fixtures `TYPES` mises à jour avec les avantages corrigés (Task 9/10), sans champ `description`

- [x] Task 13 — Vérifier les autres consommateurs de `classes.json`/`types.json` après remplacement des talents/avantages (aucune AC dédiée — vérification de non-régression)
  - [x] `apps/api/src/characters/ryuutama-pdf.service.ts` (`ClassContentData`/`classTalents`, interface locale `{ name, effect, attributes? }`) continue de fonctionner tel quel, aucun changement de code requis — **`ryuutama-pdf.service.spec.ts:86`** avait une fixture codée en dur `{ name: 'Pistage', ... }` (ancien talent Chasseur), renommée en `'Chasse'`
  - [x] Recherche (`grep`) des anciens noms de talents/avantages remplacés dans `apps/api`/`apps/web`/`packages` : trouvés dans `character-wizard.spec.ts:29`, `character-sheet.spec.ts:779/791`, `packages/game-rules/src/__tests__/pdf-field-map.spec.ts` (plusieurs occurrences) — tous des mocks/fixtures arbitraires de la mécanique de mapping/rendu générique (pas des assertions sur le contenu réel du catalogue), aucune régression fonctionnelle possible ; laissés tels quels pour ne pas élargir le scope à un renommage cosmétique de fixtures non liées au contenu réel (seul `ryuutama-pdf.service.spec.ts` était explicitement dans le scope de cette story, cf. story file)

### Review Findings

- [x] [Review][Patch] Aucune assertion ne vérifiait l'affichage des descriptions des talents « Transformation »/« Traque » du Chasseur (seule « Chasse » était vérifiée à l'écran) [apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts]
- [x] [Review][Patch] Aucun test ne couvrait le contenu corrigé des avantages du type Technique (Vitesse/Bagages) — AC2 désormais vérifiée par un test dédié [apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.spec.ts]
- [x] [Review][Patch] Aucune assertion ne garantissait l'ABSENCE du champ `description` sur les avantages de type — nouveau test de garde anti-régression pour AC5 [apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.spec.ts]
- [x] [Review][Patch] Formulation ambiguë dans les Dev Notes pour le talent « Dressage » du Marchand clarifiée — le livre substitue le nom de la classe dans le paragraphe, ce n'est pas une paraphrase
- [x] [Review][Defer] ~48 fichiers reformatés involontairement par un `eslint --fix` (API) lancé sans scope pendant les sessions précédentes — bruit de style uniquement (imports multi-lignes, guillemets), aucun changement fonctionnel — deferred, pre-existing, hors scope de cette story

## Dev Notes

- **⚠️ Contenu réel requis, ne jamais inventer/halluciner de texte — y compris quand la source n'a pas la granularité attendue.** Tout le contenu ci-dessous (noms, effets, attributs, difficultés, descriptions) est transcrit directement de `docs/classes.md`/`docs/types.md` (déjà fournis par l'utilisateur, extraits du *Guide du Voyageur*) — même règle que la Story 23.1. **Si la source ne fournit pas de texte à un niveau donné (ex. pas de paragraphe narratif par avantage de type, cf. AC5), ne PAS combler ce vide en écrivant un texte plausible mais inventé — omettre le champ, ou demander confirmation à l'utilisateur.** Erreur commise et corrigée pendant l'implémentation de cette story (description inventée sur les avantages de type, retirée en revue utilisateur du 2026-07-26) — ne pas la reproduire. Si un doute subsiste sur une valeur, relire `docs/classes.md`/`docs/types.md` plutôt que d'improviser.
- **Aucun changement de forme.** Le schéma actuel `{ name, effect, attributes, difficulty }` (talents) / `{ name, effect }` (avantages) ne change pas dans cette story — seul le **contenu** de `name`/`effect`/`attributes`/`difficulty` est corrigé, et un nouveau champ `description` est additif. La restructuration `effect: string` → `effect: { description, conditions }` est le scope explicite et différé de la **Story 23.6** (AD-10) — ne pas l'anticiper ici, mais les colonnes « Conditions » du livre sont transcrites ci-dessous pour que la Story 23.6 n'ait pas à re-consulter le livre.
- **Aucun changement backend.** Comme pour la Story 23.1 : `GameSystemService`/`CONTENT_TYPES` lisent déjà `classes.json`/`types.json` sans validation de forme au-delà de `key` — `data: unknown` côté `ContentEntryDto`. Redémarrer le conteneur `api` (ou attendre le hot-reload) suffit pour reseeder.
- **`attributes: []`/`difficulty: "-"`** représente un talent « - » dans le livre (pas de test associé) — convention à adopter pour cette story, cohérente avec le besoin exprimé par la Story 23.8 (« seuls les talents dont `attributes` est renseigné sont proposés » pour le talent *Métier d'appoint*).
- **Story 23.8 déjà planifiée** pour le talent *Métier d'appoint* (Fermier) — cette story se contente d'ajouter le talent avec ses vraies valeurs et sa description ; le mécanisme de choix d'un talent d'une autre classe à la création reste hors scope ici.

### Contenu de référence — Talents de classe (source : `docs/classes.md`)

**Artisan** (déjà correct, ajouter seulement `description` par talent) :
- Création — effect: `"Fabrique un objet du type choisi lors de l'obtention de ce talent"`, attributes: `["VIG","AGI"]`, difficulty: `"variable"` (inchangés) — description : *"Les artisans gagnent leur vie en créant des objets de tout type : beaux, pratiques, efficaces, etc. Avec assez de matériel et de temps, ils sont même capables de les fabriquer sur la route. Après un échec, utiliser ce talent à nouveau prend du temps, mais n'engendre pas de coût supplémentaire."*
- Réparation — inchangés — description : *"Les artisans savent réparer les objets qui ont été endommagés, même lorsque ceux-ci ne correspondent pas à leur spécialité. La résistance de l'équipement réparé revient alors à son maximum."*
- Transformation — inchangés — description : *"Les artisans savent utiliser les dépouilles des monstres pour en tirer des ressources insoupçonnées. Le résultat de cette opération est indiqué dans la description du monstre."*

**Chasseur** (remplace Pistage/Camouflage/Piège) :
- Chasse — effect: `"Nourrit autant de personnes que le résultat du test, ne peut pas aider à monter le campement"`, attributes: `["AGI","INT"]`, difficulty: `"Paysage"` — conditions (pour Story 23.6) : *"Avant le test de campement. Une fois par jour."* — description : *"Les chasseurs se sont fait une spécialité de ramener des animaux sauvages pour nourrir leurs compagnons. Ce talent s'utilise juste avant le test de campement. Plus le résultat est bon, plus il y a de nourriture disponible."*
- Transformation — effect: `"Transforme la dépouille d'un monstre en matériel selon son profil"`, attributes: `["AGI","INT"]`, difficulty: `"2×niveau du monstre"` — conditions : *"Avoir accès à la dépouille d'un monstre."* — description : *"Les chasseurs savent utiliser les dépouilles des monstres pour en tirer des ressources insoupçonnées. Le résultat de cette opération est indiqué dans la description du monstre."*
- Traque — effect: `"Découvre un monstre et inflige +1 dégâts contre lui"`, attributes: `["VIG","INT"]`, difficulty: `"Paysage"` — conditions : *"Avoir découvert les traces d'un monstre."* — description : *"Les chasseurs savent remonter les traces d'un type de monstre particulier (œufs vivants, bêtes ou plantes fantastiques, etc.). Ils peuvent ainsi retrouver leur antre et bénéficier d'un bonus de +1 aux dégâts contre ceux qui s'y terrent."*

**Fermier** (remplace Culture/Élevage/Météorologie) :
- Dressage — effect: `"Peut avoir deux animaux supplémentaires sans dépense d'eau/vivres"`, attributes: `[]`, difficulty: `"-"` — description : *"Les fermiers ont l'habitude d'utiliser des animaux pour porter leurs marchandises ou effectuer des travaux. Ils savent s'en occuper et peuvent donc être accompagnés de plus d'animaux que la plupart des voyageurs."*
- Métier d'appoint — effect: `"Peut posséder un talent d'une autre classe impliquant un test, avec un malus de -1"`, attributes: `[]`, difficulty: `"-"` (« Selon talent » dans le livre — cf. Story 23.8) — description : *"Les fermiers n'ont pas une vie facile. La plupart ne peuvent se contenter des revenus de l'élevage ou de leurs champs et doivent exercer un métier d'appoint afin de pouvoir manger à leur faim. Un fermier peut donc choisir à la création un talent normalement réservé à une autre classe à condition que celui-ci implique un test. Toutefois, n'étant pas un spécialiste, il subit alors un malus de -1 à ce dernier."*
- Robuste — effect: `"+1 aux tests de condition, +3 à la limite d'équipement transportable"`, attributes: `[]`, difficulty: `"-"` — description : *"Les fermiers ont généralement une très bonne condition physique grâce à leur vie réglée sur le rythme de la nature. De plus ils sont habitués aux travaux pénibles et rigoureux, et peuvent donc porter plus d'équipement que leurs compagnons."*

**Guérisseur** (remplace Soin/Diagnostic/Remède) :
- Elixir miracle — effect: `"Annule un état pendant une heure et baisse sa difficulté du niveau de l'utilisateur"`, attributes: `["INT","ESP"]`, difficulty: `"Difficulté de l'état"` — conditions : *"La cible subit un état et n'a pas reçu d'elixir aujourd'hui."* — description : *"Grâce à des remèdes de leur fabrication, les guérisseurs peuvent soulager temporairement un état dont souffre un personnage, voire même le soigner partiellement ou le faire disparaître. Un personnage ne peut bénéficier d'un Elixir miracle qu'une fois par jour."*
- Herboristerie — effect: `"Obtient une unité d'herbe de soins"`, attributes: `["VIG","INT"]`, difficulty: `"Paysage"` — conditions : *"Après le test de condition. Une fois par jour."* — description : *"Les guérisseurs sont des spécialistes des plantes médicinales et savent toujours comment en dénicher. Les herbes fanent en un jour, mais peuvent être conservées une semaine dans une bouteille d'herboriste."*
- Soins — effect: `"Soigne des PV égaux au résultat du test"`, attributes: `["INT","ESP"]`, difficulty: `"Réussite automatique"` — conditions : *"Dépenser une unité d'herbes de soins et une unité d'eau."* — description : *"Les guérisseurs utilisent des plantes et de l'eau afin de créer de puissants remèdes pour leurs compagnons. Le type de plante médicinale utilisée importe peu. La guérison se fait en quelques minutes."*

**Marchand** (remplace Négociation/Évaluation/Réseau) :
- Commerce — effect: `"Achète/vend des articles à un prix modifié (variation selon le résultat du test)"`, attributes: `["INT","ESP"]`, difficulty: `"variable (cf. tableau de variation du prix)"` — conditions : *"Négocier au moins 4 objets du même type."* — description : *"Les marchands achètent des articles en nombre pour les obtenir à vil prix et ainsi les revendre bien plus cher. Il est impossible d'annuler la transaction et les articles ne peuvent être revendus dans la même ville."*
- Dressage — même nom/effet/mécanique que le talent Dressage du Fermier — attributes: `[]`, difficulty: `"-"`. **Le livre répète ce paragraphe par classe en substituant le nom** (« Les marchands ont l'habitude... » ici, vs. « Les fermiers ont l'habitude... » pour le Fermier) : ce n'est **pas** une paraphrase, c'est le texte réel propre au Marchand — vérifié contre `docs/classes.md`, confirmé lors de la revue de code du 2026-07-26 (finding initial de l'Acceptance Auditor invalidé après vérification).
- Éloquence — effect: `"+1 sur tous les tests de négociation"`, attributes: `[]`, difficulty: `"-"` — description : *"Les marchands n'ont pas leur pareil quand il s'agit de convaincre quelqu'un ou de réaliser une transaction."*

**Ménestrel** (remplace Musique/Conte/Danse) :
- Légendes — effect: `"Obtient des informations précises sur un sujet évoqué"`, attributes: `["INT","INT"]`, difficulty: `"Au choix du meneur"` — conditions : *"Un sujet spécifique est évoqué devant le personnage."* — description : *"Les ménestrels apprennent beaucoup de choses via d'anciennes chansons ou d'heureuses rencontres."*
- Mélodies — effect: `"+1 à tous les tests des compagnons après utilisation de la mélodie (sauf condition/initiative)"`, attributes: `["AGI","ESP"]`, difficulty: `"Paysage"` — conditions : *"Être dans le paysage ou le climat de la mélodie. Dépenser 1 PV."* — description : *"Les ménestrels savent se servir de leur musique pour exalter leurs compagnons ou leur remonter le moral. Une fois par partie, le personnage peut se souvenir d'une mélodie liée au climat/paysage déjà traversé."*
- Voyages — effect: `"+1 sur tous les tests de voyage (déplacement, orientation, campement...)"`, attributes: `[]`, difficulty: `"-"` — description : *"Les ménestrels gagnent leur vie en voyageant. Ils savent comment se fatiguer le moins possible."*

**Noble** (remplace Commandement/Diplomatie, garde et corrige Étiquette) :
- Érudition — effect: `"Obtient des informations précises sur un sujet évoqué"`, attributes: `["INT","INT"]`, difficulty: `"Au choix du meneur"` — conditions : *"Un sujet spécifique est évoqué devant le personnage."* — description : *"Les nobles apprennent beaucoup de choses dans de nombreux domaines via les futilités de la haute société ou grâce au bourrage de crâne de leur précepteur. Mais rien de ce qui relève de la sagesse populaire..."*
- Escrime — effect: `"Ajoute une arme favorite supplémentaire (arc/épée longue/lance), +1 pour toucher si répété"`, attributes: `[]`, difficulty: `"-"` — description : *"Les nobles apprennent le métier des armes essentiellement grâce à des joutes amicales ou à des entraînements prodigués par leur professeur particulier."*
- Étiquette (corrigé) — effect: `"Impressionne un interlocuteur de haute naissance (test en opposition)"`, attributes: `["AGI","INT"]`, difficulty: `"Test en opposition"` — description : *"Les nobles connaissent les arcanes de protocole qui n'ont cours que parmi ceux de leur rang. En remportant un test opposé de ce talent, ils peuvent impressionner un autre personnage issu de la haute société."*

### Contenu de référence — Avantages de type (source : `docs/types.md`)

**⚠️ Aucun champ `description` sur les avantages de type — confirmé après correction (2026-07-26).** `docs/types.md` ne documente les avantages que sous forme d'un tableau à 2 colonnes (`Avantages`/`Effets`), sans paragraphe narratif par avantage (contrairement aux talents de classe, qui ont chacun un paragraphe d'intro dans `docs/classes.md` avant leur tableau). Une première version de cette story avait ajouté une description inventée par avantage (ex. *"Un voyageur endurant, capable d'encaisser les coups les plus rudes."*) — détecté par l'utilisateur en revue et retiré. **Ne pas réintroduire ce champ pour les avantages de type sans texte source réel.**

**Attaque** (déjà correct, aucun changement) :
- Endurance — effect: `"+4 PV"` (inchangé)
- Puissance — effect: `"+1 aux dégâts"` (inchangé)
- Entraînement — effect: `"+1 arme favorite supplémentaire"` (inchangé)

**Technique** (remplace Agilité/Réflexes, corrige Précision) :
- Précision (corrigé) — effect: `"+2 sur les tests de concentration (au lieu de +1, cf. p.73)"`
- Vitesse — effect: `"+1 à l'initiative"`
- Bagages — effect: `"+3 à la limite d'encombrement"`

**Magie** (remplace Réserve/Canalisation/Affinité) :
- Volonté — effect: `"+4 PE"`
- Grimoire — effect: `"Accès aux sorts de magie rituelle"`
- Lié aux saisons — effect: `"Accès à la magie des saisons"`

*(Note : le livre documente deux voies de magie liées au type Magie — magie rituelle (Grimoire) et magie des saisons (Lié aux saisons) — cf. `docs/types.md` lignes 36-47. Le choix effectif de sorts/saison n'est pas dans le scope de cette story (catalogue de sorts = Story 23.7, choix effectif = hors scope actuel).)*

### Project Structure Notes

- Fichiers de données : `apps/api/game-systems/ryuutama/data/{classes,types}.json` (existants, gitignorés — cf. Story 23.1 pour le mode opératoire).
- Composants à modifier : `apps/web/src/app/features/characters/character-wizard/steps/{class-step,type-step}/` (`.ts`, `.html`, `.spec.ts`) — ne pas créer de nouveaux composants, étendre l'existant (même fichiers que la Story 23.1).
- `weapon-categories.json` n'est PAS concerné par cette story (ses catégories n'ont pas de sous-éléments comparables à des talents — `exampleWeapons` a été traité par la Story 23.1).

### References

- [Source: docs/classes.md] — texte réel des talents de classe (paragraphes d'intro + tableaux effet/conditions/attributs/difficulté) pour les 7 classes déjà seedées, transcrit ci-dessus
- [Source: docs/types.md] — texte réel des avantages de type pour les 3 types déjà seedés, transcrit ci-dessus
- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 23.2] — user story et Acceptance Criteria d'origine (FR-2)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md#AD-10] — forme exacte du talent enrichi (Story 23.6, ne pas anticiper ici)
- [Source: _bmad-output/implementation-artifacts/23-1-descriptions-classes-types-categories-armes.md] — story précédente, pattern déjà établi pour `description` au niveau classe/type, câblage `ClassStep`/`TypeStep`
- [Source: apps/api/src/characters/ryuutama-pdf.service.ts#ClassContentData] — interface locale dupliquée (`{ name, effect, attributes? }`), non affectée par le remplacement de contenu mais à revérifier (tests ne doivent pas asserter un ancien nom de talent)
- [Source: apps/web/.../class-step/class-step.ts, type-step.ts] — `ClassTalent`/`TypeAdvantage` interfaces à étendre avec `description`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Analyse de contexte terminée (bmad-create-story) — comparaison exhaustive de `classes.json`/`types.json` avec `docs/classes.md`/`docs/types.md` ayant révélé un décalage de contenu majeur (6/7 classes et 2/3 types avec des talents/avantages ne correspondant pas au livre), scope élargi en conséquence avec décision utilisateur explicite (2026-07-26).
- Implémentée le 2026-07-26 (bmad-dev-story). `classes.json`/`types.json` réécrits intégralement avec le contenu réel du livre (noms/effets/attributs/difficultés corrigés pour 6/7 classes et 2/3 types). `ClassTalent` étendue avec `description: string` (texte réel transcrit de `docs/classes.md`), affichée dans `class-step.html` sous chaque talent (TDD : fixtures + assertions ajoutées avant l'implémentation, rouge confirmé puis vert).
- **Correction post-implémentation (2026-07-26, retour utilisateur) :** une description avait été ajoutée par erreur à chaque avantage de type (`types.json`, `TypeAdvantage`, `type-step.html`/`.spec.ts`) — ce texte était **inventé**, `docs/types.md` ne fournissant qu'un tableau `Avantages`/`Effets` à 2 colonnes, aucun paragraphe narratif par avantage. Retiré intégralement (`types.json` repasse à `{ name, effect }` par avantage, `TypeAdvantage` et le template `type-step.html` reviennent à leur forme d'avant cette story pour la partie avantage). AC2/AC3/AC5 et Tasks 8/12 corrigés en conséquence. Règle renforcée dans les Dev Notes pour les stories futures : ne jamais combler par un texte plausible l'absence de granularité dans la source.
- Vérification de non-régression (Task 13) : `ryuutama-pdf.service.spec.ts:86` avait une fixture codée en dur avec l'ancien nom de talent Chasseur (« Pistage »), renommée en « Chasse ». D'autres fixtures arbitraires non liées au contenu réel (character-wizard.spec.ts, character-sheet.spec.ts, pdf-field-map.spec.ts) référencent encore d'anciens noms mais testent uniquement la mécanique générique de mapping/rendu, sans assertion sur le contenu réel du catalogue — laissées telles quelles, hors scope de cette story.
- 937/937 tests web + 898/898 tests API, aucune régression. Lint propre sur tous les fichiers touchés (erreurs pré-existantes constatées ailleurs, non liées à cette story). `pnpm typecheck` (API) propre.

### File List

- `apps/api/game-systems/ryuutama/data/classes.json` (modifié — gitignoré)
- `apps/api/game-systems/ryuutama/data/types.json` (modifié — gitignoré)
- `apps/api/src/characters/ryuutama-pdf.service.spec.ts` (fixture renommée, non fonctionnel)
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.html`
- `apps/web/src/app/features/characters/character-wizard/steps/class-step/class-step.spec.ts`
- `apps/web/src/app/features/characters/character-wizard/steps/type-step/type-step.spec.ts` (fixture `magie` renommée `Réserve` → `Volonté` ; fixture `technique` + 2 tests ajoutés en revue de code : couverture Vitesse/Bagages, garde anti-régression AC5)

*(`type-step.ts`/`type-step.html` : modifiés puis intégralement revenus à leur état d'avant cette story après retrait de la description inventée sur les avantages — diff net nul, cf. Completion Notes.)*

## Change Log

- 2026-07-26 : Story créée (bmad-create-story), scope élargi suite à la découverte du décalage de contenu.
- 2026-07-26 : Implémentée (bmad-dev-story). Talents/avantages corrigés et enrichis (7 classes, 3 types), affichage câblé dans `ClassStep`/`TypeStep`. 937/937 tests web + 898/898 tests API, aucune régression. Statut passé à "review".
- 2026-07-26 : Correction post-implémentation (retour utilisateur, même jour). Description inventée sur les avantages de type retirée (`docs/types.md` n'a pas ce niveau de texte) ; AC2/AC3/AC5, Tasks 8/12 et Dev Notes corrigés ; règle anti-invention renforcée dans `epics-palier8.md` pour les stories restantes de l'Epic 23. 937/937 tests web + 898/898 tests API après correction.
- 2026-07-26 : Revue de code (bmad-code-review, 3 couches adversariales, diff élargi à 53 fichiers sur décision utilisateur — ~48 étant un reformatage `eslint --fix` involontaire hors scope). 0 decision-needed, 4 patches appliqués (couverture de tests manquante sur Transformation/Traque et sur le type Technique, garde anti-régression AC5, clarification Dev Notes), 1 item différé (reformatage involontaire, voir deferred-work.md), 6 écartés (dont 1 faux positif de l'Acceptance Auditor sur le talent Dressage du Marchand, vérifié contre `docs/classes.md`). 939/939 tests web après corrections, aucune régression. Statut passé à "done".
