---
baseline_commit: 6fb158d6c3f2f31a0045e52bf6c40dd0faa4d3a5
---

# Story 23.4: Classes manquantes ajoutées

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ ou joueur,
I want retrouver toutes les classes du *Guide du Voyageur* dans le catalogue,
so that je ne sois pas limité aux 7 classes actuellement seedées.

## Acceptance Criteria

1. **Given** le catalogue `classes.json` actuel (7 entrées : artisan, chasseur, fermier, guerisseur, marchand, menestrel, noble), **when** cette story est complétée, **then** 5 classes supplémentaires sont ajoutées — **Dresseur, Ermite, Météomancien, Navigateur, Professeur** — le nombre total de classes seedées (12) correspond au nombre de classes réelles documentées dans `docs/classes.md` (source complète, aucune classe supplémentaire connue en dehors de ce fichier).
2. **Given** une classe nouvellement ajoutée, **when** elle est seedée, **then** elle respecte exactement la forme de `classes.json` telle qu'établie par les Stories 23.1/23.2 : `{ key, label, description, recommendedForBeginners, requiresSpecialty?, specialtyLabel?, talents: [{ name, effect, attributes, difficulty, description }] }`, avec exactement 3 talents par classe — les champs occupations/actions (Story 23.5) et effet structuré `{ description, conditions }` (Story 23.6) n'existent pas encore à ce stade et ne sont **pas** ajoutés par cette story, sans précondition sur celle-ci.
3. **Given** le texte des 5 nouvelles classes, **when** il est saisi, **then** il est transcrit tel quel de `docs/classes.md` (déjà fourni par l'utilisateur, source complète pour ces classes) — **jamais inventé**, même règle que les Stories 23.1/23.2/23.3. Les légères corrections typographiques évidentes (accords, coquilles OCR manifestes) suivent le même principe déjà appliqué en Story 23.1 (ex. « connaissance » → « connaissances » pour le Chasseur) — documentées en Dev Notes, jamais un ajout de contenu.
4. **Given** une classe nouvellement ajoutée dont la `key` entrerait en collision avec une classe existante, **when** le contenu est seedé, **then** ce cas est évité par la discipline d'auteur du contenu (vérification manuelle avant merge — les 5 nouvelles clés `dresseur`/`ermite`/`meteomancien`/`navigateur`/`professeur` ne collisionnent avec aucune des 7 clés existantes) — aucune garde runtime, cohérent avec l'absence de garde équivalente sur les autres catalogues.
5. **Given** le talent *Autorité* du Dresseur et le talent *Métier d'appoint* de l'Ermite/Dresseur (mécaniques de choix à la création, déjà identifiées et trackées par la **Story 23.8**), **when** cette story est complétée, **then** elle se limite à seeder ces talents avec leurs valeurs réelles (`attributes`/`difficulty` du livre) — **aucun câblage du mécanisme de choix** (spécialité de créature, emprunt de talent d'une autre classe) n'est ajouté ici, pour ne pas dupliquer le travail de la Story 23.8.

## Tasks / Subtasks

- [x] Task 1 — Ajouter la classe Dresseur (AC: #1, #2, #3, #5)
  - [x] `classes.json` → ajouté `{ key: "dresseur", label: "Dresseur", description, recommendedForBeginners: false, talents: [Autorité, Dressage, Invocation] }`
  - [x] `requiresSpecialty`/`specialtyLabel` non ajoutés pour le choix de type de créature du talent *Autorité* — hors scope, cf. AC5/Story 23.8

- [x] Task 2 — Ajouter la classe Ermite (AC: #1, #2, #3, #5)
  - [x] `classes.json` → ajouté `{ key: "ermite", label: "Ermite", description, recommendedForBeginners: false, talents: [Métamorphose, Mystères, Métier d'appoint] }`
  - [x] Talent *Métier d'appoint* : mêmes valeurs/convention que celui du Fermier (Story 23.2) — `attributes: []`, `difficulty: "-"`

- [x] Task 3 — Ajouter la classe Météomancien (AC: #1, #2, #3, #5)
  - [x] `classes.json` → ajouté `{ key: "meteomancien", label: "Météomancien", description, recommendedForBeginners: false, talents: [Climatophile, Imperméable, Prévisions] }`

- [x] Task 4 — Ajouter la classe Navigateur (AC: #1, #2, #3)
  - [x] `classes.json` → ajouté `{ key: "navigateur", label: "Navigateur", description, recommendedForBeginners: false, talents: [Boit-sans-soif, Navigation, Réparation] }`

- [x] Task 5 — Ajouter la classe Professeur (AC: #1, #2, #3)
  - [x] `classes.json` → ajouté `{ key: "professeur", label: "Professeur", description, recommendedForBeginners: false, talents: [Consignes, Érudition, Sermon] }`

- [x] Task 6 — Résoudre `recommendedForBeginners` pour les 5 nouvelles classes avec l'utilisateur (AC: #2)
  - [x] Demandé à l'utilisateur : **`false` pour les 5 nouvelles classes** (aucune source ne les mentionne comme recommandées aux débutants, traitement par défaut cohérent avec Artisan/Fermier/Noble)
  - [x] **Écart supplémentaire découvert et corrigé (hors scope initial, approuvé par l'utilisateur) :** `docs/assistant.md` indique que chasseur/guérisseur/marchand/ménestrel sont recommandés aux débutants, mais `classes.json` n'avait `chasseur`/`marchand` à `true` — `guerisseur`/`menestrel` corrigés à `true` dans cette story

- [x] Task 7 — Vérifier les consommateurs existants de `classes.json` après ajout de 5 classes (AC: #1, #4 — vérification de non-régression)
  - [x] `packages/game-rules/src/ryuutama/validate.ts` : confirmé — `validClasses` provient du paramètre `catalog` (dynamique, pas de liste figée)
  - [x] `class-step.ts`/`.html` : confirmé — rendu déjà générique via `@for (opt of options(); ...)`, aucune modification requise
  - [x] Suite complète exécutée (898 tests API + 943 tests web), aucune régression après passage de 7 à 12 classes

### Review Findings

- [x] [Review][Decision] Intro d'assistant classId incomplète pour 12 classes — `apps/api/game-systems/ryuutama/data/wizard-step-intros.json` (entrée `classId`) affiche verbatim le texte de `docs/assistant.md`, qui n'énumère que les 7 classes préexistantes. Décision utilisateur : **laissé tel quel** — le texte reste la transcription fidèle du livre officiel, les 5 nouvelles classes ne sont simplement pas commentées par cette intro (pas une erreur à corriger).
- [x] [Review][Patch] Corrections typographiques non documentées en Dev Notes (AC3) — 4 corrections réelles vs `docs/classes.md` (Dresseur description/Autorité, Météomancien/Imperméable, Professeur/Consignes) confirmées correctes par relecture du texte source (voir Dev Notes ci-dessous, complétées lors de cette revue) — pas de changement de contenu nécessaire, uniquement la traçabilité documentaire.
- [x] [Review][Patch] Talent "Transformation" — difficulté Artisan corrigée de `2×niveau` à `2×niveau du monstre`, conforme à `docs/classes.md` (« 2\*niveau du monstre », identique à Chasseur) — confirmé par l'utilisateur. [apps/api/game-systems/ryuutama/data/classes.json]
- [x] [Review][Patch] `fermier.recommendedForBeginners` corrigé de `true` à `false` — `docs/assistant.md` classe explicitement l'artisan, le fermier et le noble parmi les classes "pour joueurs qui ont déjà l'habitude" (donc PAS recommandées débutants), incohérence pré-existante non corrigée par cette story alors que `guerisseur`/`menestrel` l'avaient été pour la même raison. [apps/api/game-systems/ryuutama/data/classes.json]
- [x] [Review][Patch] Ajout d'un champ `id` (slug ASCII kebab-case) sur chaque talent des 12 classes, à la demande de l'utilisateur, pour permettre de référencer un talent individuellement (au-delà du couple classe/index) sans dépendre de `name` en texte libre. Vérifié : consommateurs existants (`validate.ts`, `pdf-field-map.ts`, `class-step.ts`) ne lisent que `name`/`effect`/`attributes`/`difficulty`/`description`, champ additionnel sans impact. [apps/api/game-systems/ryuutama/data/classes.json]
- [x] [Review][Dismiss] Duplication de texte de talent entre classes (Dressage/Fermier/Marchand/Dresseur, Transformation/Artisan/Chasseur, etc.) — confirmé par l'utilisateur : texte volontairement adapté par classe (sujet différent), mutualisation non prévue par le schéma actuel, laissé tel quel.
- [x] [Review][Dismiss] Convention `attributes: []`/`difficulty: "-"` pour les talents sans jet de dé, et valeurs `difficulty` non numériques (dépendantes du paysage/monstre/etc.) — confirmé par l'utilisateur comme un choix de représentation volontaire et correct, pas un défaut.
- [x] [Review][Dismiss] Attributs dupliqués (ex. `["INT","INT"]`) — confirmé par l'utilisateur : représente un tirage de 2 dés du même type d'attribut, comportement de jeu normal.
- [x] [Review][Dismiss] Format de `key` en ASCII sans accents — confirmé comme préférence assumée de l'utilisateur (facilite les comparaisons), pas un défaut.

## Dev Notes

- **⚠️ Contenu réel requis, ne jamais inventer/halluciner de texte.** Tout le contenu ci-dessous est transcrit de `docs/classes.md` (déjà fourni par l'utilisateur, extrait du *Guide du Voyageur*) — même règle que les Stories 23.1/23.2/23.3. `docs/classes.md` contient les 12 classes du livre (les 7 déjà seedées + les 5 de cette story) dans un seul fichier continu.
- **Incohérence table/texte notée pour Dresseur → Autorité (talent 1) : ne PAS la résoudre soi-même.** Le texte d'effet mentionne « un test d'INT+ESP contre la condition du monstre », mais le tableau Conditions/Attributs/Difficulté juste en dessous affiche `-`/`-`/`-` pour les trois colonnes. Cette story transcrit le **tableau** (source structurée, cohérent avec le traitement de tous les autres talents dans cette story et les précédentes) : `attributes: []`, `difficulty: "-"`. Si un jour un test réel est nécessaire pour ce talent (probablement au moment de la Story 23.8, qui câblera le mécanisme de choix de créature), consulter `docs/classes.md` directement plutôt que se fier à cette story.
- **Convention « Selon talent » → `attributes: []`/`difficulty: "-"`.** Le talent *Métier d'appoint* (déjà utilisé pour le Fermier, Story 23.2, et repris ici pour l'Ermite) affiche littéralement « Selon talent » dans les 3 colonnes du livre — convention déjà établie : `attributes: []`, `difficulty: "-"`, le texte réel « Selon talent » n'est pas perdu, il est implicite dans la nature du talent (emprunté à une autre classe).
- **Navigation (Navigateur) : le tableau renvoie à l'effet (« cf. effet ») pour la colonne Attributs.** Le texte de l'effet mentionne explicitement `VIG+INT` pour son premier point (tests de navigation) — utilisé comme `attributes: ["VIG", "AGI"]`... **attention, vérifier à l'implémentation** : le texte source dit *« Le personnage peut effectuer des tests de navigation avec VIG+INT »* — bien `VIG+INT`, pas `VIG+AGI` (aucune confusion avec la formule de dégâts de l'arc). Utiliser `["VIG", "INT"]`.
- **Corrections typographiques légères effectuées dans le texte ci-dessous** (cohérent avec la Story 23.1), toutes vérifiées contre `docs/classes.md` lors de la revue de code : accords/coquilles OCR évidents corrigés silencieusement, aucun contenu ajouté ou inventé —
  - Météomancien, description : « Leurs services ont couru par tous » → « Leurs services sont courus par tous » (accord pluriel).
  - Dresseur, description : « botarcaniste (plante fantastiques) » → « botarcaniste (plantes fantastiques) » (accord pluriel).
  - Dresseur, talent Autorité, description : liste de créatures dédoublonnée de 6 à 5 éléments — le texte source (`docs/classes.md` ligne 339) contient un doublon manifeste (« p de fantastiques » et « plantes fantastiques » listés séparément, artefact OCR), fusionné en un seul « plantes fantastiques ».
  - Météomancien, talent Imperméable, description : « se confronter au climat les plus rudes » → « climats » (accord).
  - Professeur, talent Consignes, description : « sublimer leur potentie » → « potentiel » (coquille OCR).
- **`requiresSpecialty` non ajouté pour Dresseur.** Le talent *Autorité* impose un choix de type de créature à l'acquisition, structurellement proche de la spécialité de l'Artisan (`requiresSpecialty`/`specialtyLabel`) — **mais la Story 23.8 (déjà créée, en backlog) est explicitement chargée de câbler ce mécanisme** pour Dresseur/Ermite/Métier d'appoint/Météomancien. Ajouter `requiresSpecialty` ici serait une implémentation partielle et prématurée du mécanisme, sans le câblage frontend qui va avec — cf. AC5.
- **Occupations/Actions non ajoutées (Story 23.5).** `docs/classes.md` documente aussi les occupations et actions de chaque classe (y compris les 5 nouvelles) — capturées en référence ci-dessous pour éviter à la Story 23.5 de re-consulter `docs/classes.md`, mais **pas ajoutées au schéma dans cette story** (le champ n'existe pas encore). **Particularité à noter pour la Story 23.5 :** contrairement aux 11 autres classes, le **Dresseur n'a pas de section « Occupations »** dans le livre — son « occupation » dépend du type de créature choisi (botarcaniste, démoniste, dompteur, mathémagicien, nécromant, etc., déjà mentionnés dans sa description) plutôt que d'une liste fixe.
- **Aucun changement backend au-delà du contenu JSON.** Comme pour les Stories 23.1/23.2 : `GameSystemService`/`CONTENT_TYPES` lisent déjà `classes.json` sans validation de forme au-delà de `key` — `data: unknown` côté `ContentEntryDto`. Redémarrer le conteneur `api` (ou attendre le hot-reload) suffit pour reseeder.

### Contenu de référence — 5 nouvelles classes (source : `docs/classes.md`)

**Dresseur** — description : *"Les dresseurs regroupent différentes catégories de personnes qui ont appris à vivre auprès des monstres et à les apprivoiser au moins partiellement. Leur nom, leur occupation, ainsi que leur attitude et celle des populations rencontrées dépendent du type de créature dont ils se font une spécialité : botarcaniste (plantes fantastiques), démoniste (démons), dompteur (bêtes fantastiques), mathémagicien (créations magiques), nécromant (morts-vivants), etc."*
- Actions (référence Story 23.5) : Apprivoiser, capturer, dompter, dresser, interdire, récompenser.
- Talents :
  1. Autorité — effect: `"Amadoue, intimide ou contrôle un monstre du type de créature choisi (ou obtient le sort de magie rituelle Dressage)"`, attributes: `[]`, difficulty: `"-"` (cf. note ci-dessus sur l'incohérence table/texte) — description : *"Les dresseurs choisissent un type de créature parmi les suivantes : animaux, plantes fantastiques, créations magiques, démons, morts-vivants. Ils sont capables de les amadouer, de les intimider et de les contrôler au moins partiellement."*
  2. Dressage — effect: `"Peut avoir deux animaux supplémentaires sans dépense d'eau/vivres"`, attributes: `[]`, difficulty: `"-"` — description : *"Les dresseurs ont l'habitude d'utiliser des animaux pour porter leurs marchandises ou effectuer des travaux. Ils savent s'en occuper et peuvent donc être accompagnés de plus d'animaux que la plupart des voyageurs."*
  3. Invocation — effect: `"Fait apparaître une combinaison de monstres du type choisi, dans la limite du niveau du personnage"`, attributes: `[]`, difficulty: `"-"` — description : *"Qu'ils utilisent la magie ou leurs simples expériences, les dresseurs peuvent attirer, invoquer ou créer un nombre de monstres dépendant de leur niveau et correspondant à leur type de prédilection."*

**Ermite** — description : *"Ces hommes étranges vivent à l'écart des cités et au plus près de la nature. Fous ou sages, ils connaissent des secrets que l'on croyait perdus pour toujours."*
- Occupations (référence Story 23.5) : Ermite, idiot du village, illuminé, penseur, sage.
- Actions (référence Story 23.5) : Arriver là où on ne l'attend pas, dévoiler la vérité, marmonner, méditer, raconter une histoire oubliée, s'isoler.
- Talents :
  1. Métamorphose — effect: `"Se transforme en n'importe quel animal vivant sur le paysage choisi ; perd la moitié de sa condition à chaque changement de forme"`, attributes: `[]`, difficulty: `"-"` — description : *"Lors de l'acquisition de ce talent, les ermites doivent choisir un type de paysage (sans doute celui où ils ont établi leur retraite). Ils ont une telle connexion avec les dragons de ce paysage qu'ils peuvent comprendre une partie de leur pouvoir et se métamorphoser en animal."*
  2. Mystères — effect: `"Obtient des informations qu'aucun compagnon n'a pu obtenir, avec un bonus par test/talent ayant échoué"`, attributes: `["INT","INT"]`, difficulty: `"Au choix du meneur"` — description : *"Même s'ils vivent reclus, les ermites connaissent des choses qui échappent à la plupart de leurs contemporains. Personne ne sait s'ils doivent cela à une infime sagesse ou à de la folie douce, mais ils semblent être les meilleurs pour répondre aux questions que personne ne se pose."*
  3. Métier d'appoint — effect: `"Peut posséder un talent d'une autre classe impliquant un test, avec un malus de -1"`, attributes: `[]`, difficulty: `"-"` (« Selon talent » dans le livre, cf. Story 23.8) — description : *"Les ermites ont eu une vie avant de choisir de se retirer. Même s'ils n'ont plus guère l'occasion de s'exercer, ils n'ont toutefois pas tout oublié de ce qui faisait leur quotidien. Un ermite peut donc choisir à la création un talent normalement réservé à une autre classe à condition que celui-ci implique un test. Toutefois, étant un peu rouillé, il subit un malus de -1 à ce dernier."*

**Météomancien** — description : *"Les météomanciens sont des magiciens spécialisés dans les prédictions météorologiques. Leurs services sont courus par tous : fermiers, marins, voyageurs."* (correction typo légère : « ont couru » → « sont courus »)
- Occupations (référence Story 23.5) : Chaman, devin, météomancien, météorologue.
- Actions (référence Story 23.5) : Analyser, calculer la vitesse du vent, faire des relevés, mettre en garde, observer des nuages, prévoir, prendre des notes.
- Talents :
  1. Climatophile — effect: `"+2 aux tests dont la difficulté dépend d'un climat favori supplémentaire"`, attributes: `[]`, difficulty: `"-"` — description : *"Les météomanciens ont tous des climats qu'ils préfèrent étudier lorsqu'ils y sont confrontés, ils se sentent galvanisés et ont même parfois du mal à tempérer leur enthousiasme."*
  2. Imperméable — effect: `"Ignore le modificateur du climat sur un test en dépensant un point de maladresse ou la moitié de ses PE actuels"`, attributes: `[]`, difficulty: `"-"` — description : *"Les météomanciens sont habitués au mauvais temps. Ils passent l'essentiel de leur apprentissage à voyager pour se confronter aux climats les plus rudes. Ils savent en minimiser les effets."*
  3. Prévisions — effect: `"Prédit le temps qu'il fera à un moment et un lieu donnés"`, attributes: `["INT","ESP"]`, difficulty: `"Paysage ciblé"` — description : *"Qu'ils utilisent la magie, des grenouilles, des instruments complexes ou leur simple connaissance des dragons du climat, tous les météomanciens sont formés à prédire le temps qu'il va faire. Rien de tel pour pouvoir préparer ses voyages."*

**Navigateur** — description : *"Ces marins passent plus de la moitié de leur vie en mer. À bord de leur navire, ils mènent les voyageurs vers de nouvelles terres pleines d'aventures."*
- Occupations (référence Story 23.5) : Amiral, capitaine, marin, mousse, pirate.
- Actions (référence Story 23.5) : Boire, commander, faire le point, hisser les voiles, monter au mât, naviguer.
- Talents :
  1. Boit-sans-soif — effect: `"Considéré en pleine forme dès 9 (8 si pris deux fois) au test de condition s'il a bu de l'alcool la veille ; peut se passer d'eau"`, attributes: `[]`, difficulty: `"-"` — description : *"Les navigateurs sont capables de boire de l'alcool comme du petit lait. Lors des longues traversées, l'eau douce croupit bien trop vite et il devient alors plus sûr d'étancher sa soif avec de l'alcool."*
  2. Navigation — effect: `"Teste la navigation en VIG+INT ; +2 aux tests d'orientation sur terre ou en mer (+3 si pris deux fois)"`, attributes: `["VIG","INT"]`, difficulty: `"Paysage"` — description : *"Même loin des terres, les navigateurs savent se repérer, calculer leur route. Ils connaissent leurs navires sur le bout des doigts et peuvent anticiper son comportement."*
  3. Réparation — effect: `"Répare un objet, sa résistance revient à son maximum"`, attributes: `["VIG","AGI"]`, difficulty: `"variable (cf. tableau de prix)"` — description : *"Les navigateurs savent réparer les objets qui ont été endommagés, quelle que soit leur catégorie. La résistance de l'équipement réparé revient alors à son maximum."*

**Professeur** — description : *"Les professeurs ont accumulé de nombreuses connaissances. Ils ne vivent désormais plus que pour transmettre, à moins qu'ils ne voyagent pour en acquérir de nouvelles."*
- Occupations (référence Story 23.5) : Chaperon, conseiller, instituteur, maître, précepteur, professeur.
- Actions (référence Story 23.5) : Conseiller, enseigner, expliquer, montrer, reprocher, révéler, sermonner.
- Talents :
  1. Consignes — effect: `"Donne des consignes à un compagnon (bonus au test ou dé forcé au maximum, réussite critique ignorée) en dépensant la moitié de ses PE"`, attributes: `[]`, difficulty: `"-"` — description : *"Lorsqu'ils ont le temps de bien encadrer leurs disciples et que ceux-ci décident de les écouter, les professeurs savent comment sublimer leur potentiel. Ou au moins les aider à limiter la casse."*
  2. Érudition — effect: `"Obtient des informations précises sur un sujet évoqué"`, attributes: `["INT","INT"]`, difficulty: `"Au choix du meneur"` — description : *"Les professeurs connaissent beaucoup de choses dans de nombreux domaines. Ils n'hésitent pas à bourrer le crâne de leurs élèves avec, même si tout ne se révèle pas toujours utile."*
  3. Sermon — effect: `"Sur un double 1, tous les voyageurs gagnent un point de maladresse supplémentaire (deux si pris deux fois)"`, attributes: `[]`, difficulty: `"-"` — description : *"Les professeurs ne sont pas toujours des compagnons très agréables. Ils passent plus de temps à vous reprocher vos erreurs qu'à faire quoi que ce soit et ils se croient obligés de vous expliquer ce que vous auriez dû faire. C'est à peine si on s'aperçoit que l'on apprend beaucoup à leurs contacts."*

### Project Structure Notes

- Fichier de données : `apps/api/game-systems/ryuutama/data/classes.json` (existant, gitignoré) — seul fichier modifié pour le contenu.
- Aucun fichier frontend à modifier (`ClassStep` rend déjà dynamiquement la liste des classes reçues via `content()?.['class']`, aucune liste codée en dur — à confirmer par Task 7).
- Aucun changement à `apps/api` au-delà du contenu JSON (pas de nouveau `ContentType`, `class` existe déjà).

### References

- [Source: docs/classes.md] — texte réel des 5 classes manquantes (paragraphes d'intro + tableaux effet/conditions/attributs/difficulté), lignes 330-552
- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 23.4] — user story et Acceptance Criteria d'origine (FR-4)
- [Source: _bmad-output/implementation-artifacts/23-8-cas-particuliers-de-creation-par-classe.md] — story déjà créée pour le câblage des mécanismes de choix (Métier d'appoint, Autorité, Métamorphose, Climatophile) — cette story (23.4) ne fait qu'ajouter les données, jamais le câblage (AC5)
- [Source: _bmad-output/implementation-artifacts/23-2-descriptions-sous-elements-talents-avantages.md] — story précédente, forme exacte de `classes.json` et convention `attributes: []`/`difficulty: "-"` pour les talents « Selon talent »/« - »
- [Source: apps/api/src/game-systems/game-system.service.ts#CONTENT_TYPES] — `class` déjà enregistré, aucune validation de forme au-delà de `key`
- [Source: packages/game-rules/src/ryuutama/validate.ts] — `validClasses` généré dynamiquement depuis le catalogue seedé, pas de liste figée à mettre à jour

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Clarification utilisateur obtenue avant implémentation (Task 6) : `recommendedForBeginners: false` pour les 5 nouvelles classes (aucune source ne les mentionne comme recommandées aux débutants).
- Implémentée le 2026-07-26 (bmad-dev-story). `classes.json` passe de 7 à 12 entrées — 5 nouvelles classes (Dresseur, Ermite, Météomancien, Navigateur, Professeur) transcrites de `docs/classes.md`, forme identique aux 7 existantes (`{ key, label, description, recommendedForBeginners, talents: [{ name, effect, attributes, difficulty, description }] }`), exactement 3 talents chacune.
- Incohérence table/texte notée pour le talent Autorité du Dresseur (effet mentionne un test INT+ESP, tableau dit `-`) — tranchée en faveur du tableau, documentée dans le Dev Notes de la story pour ne pas être perdue (pertinent pour la future Story 23.8).
- **Correction supplémentaire (hors scope initial, approuvée par l'utilisateur pendant l'implémentation) :** `guerisseur`/`menestrel` avaient `recommendedForBeginners: false` alors que `docs/assistant.md` les liste explicitement comme recommandés aux débutants (avec chasseur/marchand, déjà corrects) — corrigés à `true`.
- Aucun code touché (Task 7) : `validClasses` (validation) et le rendu frontend (`ClassStep`) sont déjà génériques, confirmés par lecture directe sans modification nécessaire.
- 898/898 tests API + 943/943 tests web, aucune régression après passage de 7 à 12 classes seedées.

### File List

- `apps/api/game-systems/ryuutama/data/classes.json` (modifié — gitignoré, 5 classes ajoutées + 2 champs `recommendedForBeginners` corrigés)

## Change Log

- 2026-07-26 : Story créée (bmad-create-story). Contenu des 5 classes manquantes transcrit en Dev Notes depuis `docs/classes.md`, 2 questions ouvertes identifiées (recommendedForBeginners inconnu, incohérence table/texte Autorité).
- 2026-07-26 : Implémentée (bmad-dev-story). Clarification utilisateur obtenue (recommendedForBeginners = false pour les 5 nouvelles classes). 5 classes ajoutées à `classes.json` (7 → 12). Correction supplémentaire approuvée par l'utilisateur : `guerisseur`/`menestrel` recommandés aux débutants (incohérence avec `docs/assistant.md` détectée et corrigée). 898/898 tests API + 943/943 tests web, aucune régression. Statut passé à "review".
- 2026-07-26 : Revue de code (bmad-code-review, 3 couches adversariales). 1 décision utilisateur (intro assistant `classId` laissée telle quelle, transcription fidèle du livre, hors scope) + 3 patches appliqués : (1) `Transformation`/Artisan, difficulté corrigée `2×niveau` → `2×niveau du monstre` (conforme à `docs/classes.md`, identique à Chasseur) ; (2) `fermier.recommendedForBeginners` corrigé `true` → `false` (incohérence pré-existante avec `docs/assistant.md`, même correction que `guerisseur`/`menestrel` faite dans cette story mais oubliée pour `fermier`) ; (3) ajout d'un champ `id` (slug ASCII) sur chaque talent des 12 classes, à la demande de l'utilisateur, pour permettre un référencement individuel futur (vérifié sans impact sur les consommateurs existants). Documentation Dev Notes complétée avec le détail exhaustif des corrections typographiques (AC3). 898/898 tests API + 943/943 tests web reconfirmés après corrections, aucune régression. Statut passé à "done".
