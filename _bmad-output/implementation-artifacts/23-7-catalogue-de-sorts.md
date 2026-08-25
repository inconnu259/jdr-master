---
baseline_commit: 6fb158d6c3f2f31a0045e52bf6c40dd0faa4d3a5
---

# Story 23.7: Catalogue de sorts

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want un catalogue des règles de magie et de la liste des sorts du livre,
so that je dispose du contenu officiel même si la mécanique de lancement de sort n'est pas encore jouable.

## Acceptance Criteria

1. **Given** le mécanisme `GameSystemService.seedRyuutama()`/`CONTENT_TYPES` (`apps/api/src/game-systems/game-system.service.ts`), **when** ce palier est implémenté, **then** un nouveau `ContentType` `spell` est seedé depuis `spells.json`, même mécanisme que les catalogues existants (`class`, `type`, `season`, etc.) — aucun nouveau système de lecture, aucune migration Prisma.
2. **Given** un sort seedé, **when** il est chargé, **then** il porte `{ key, name, magicType, season, tier, minLevel, castingType, peCost, duration, target, range, description, references? }` — 75 sorts au total (27 de magie rituelle + 48 de magie des saisons, 12 par saison), contenu réel transcrit de `docs/magie.md`, jamais inventé.
3. **Given** `magicType: "saison"`, **when** un sort est chargé, **then** son champ `season` référence une des 4 clés déjà existantes du catalogue `season` (`printemps`/`ete`/`automne`/`hiver`, `apps/api/game-systems/ryuutama/data/seasons.json`) — jamais une nouvelle valeur inventée. Pour `magicType: "rituelle"`, `season` vaut toujours `null`.
4. **Given** `tier`/`minLevel`, **when** un sort est chargé, **then** `tier` (`"debutant"|"intermediaire"|"avance"`) et `minLevel` (`1|4|7`) sont cohérents entre eux selon la règle fixe : `debutant→1`, `intermediaire→4`, `avance→7` — identique pour la magie rituelle et pour chacune des 4 saisons (vérifié dans le livre, cf. Dev Notes).
5. **Given** cette story, **when** elle est complétée, **then** la mécanique d'apprentissage/de lancement de sort (choix des sorts connus, dépense de PE, test INT+ESP, ciblage, durée réelle en jeu) reste **explicitement hors scope** — catalogue de contenu seul, mécanique différée à une story future (Open Question 2 du PRD). Aucun câblage frontend (`ClassStep`/`TypeStep`/`character-wizard`/`character-sheet`), aucun champ ajouté à `RyuutamaSheetData`, aucun mapping PDF.

## Tasks / Subtasks

- [x] Task 1 — Créer `apps/api/game-systems/ryuutama/data/spells.json` avec les 75 sorts (AC: #2, #3, #4)
  - [x] Utiliser le contenu de référence complet ci-dessous (Dev Notes), transcrit de `docs/magie.md` — corrections typographiques déjà identifiées et appliquées silencieusement dans le contenu de référence (coquilles OCR manifestes, même discipline que les Stories 23.1-23.6), **aucune autre correction à improviser**
  - [x] Vérifié `key` unique et ASCII/kebab-case sur les 75 entrées (cohérent avec la préférence déjà actée pour `classes.json`)
  - [x] Cas particulier "Vœu à la Voie lactée" (AC: #2) : `duration`/`range` transcrits `"?"` tel quel
- [x] Task 2 — Enregistrer le `ContentType` `spell` (AC: #1)
  - [x] `apps/api/src/game-systems/game-system.service.ts` : ajouté `{ key: 'spell', label: 'Sort', file: 'spells.json' }` au tableau `CONTENT_TYPES`
- [x] Task 3 — Confirmer l'absence de câblage mécanique/UI (AC: #5 — non-régression et respect du scope)
  - [x] Aucun fichier frontend touché (`ClassStep`, `TypeStep`, `character-wizard.ts`, `character-sheet.ts`/`.html`) — confirmé via `git status`
  - [x] Aucun champ ajouté à `RyuutamaSheetData` (`packages/game-rules/src/ryuutama/types.ts`) — confirmé, fichier non modifié
  - [x] Aucun mapping ajouté à `pdf-field-map.ts` — confirmé : le template PDF officiel (119 champs, `Ryuutama_fiche_de_voyageur_big_edit.pdf`) ne contient **aucun** champ lié aux sorts/magie/grimoire/saison (vérifié exhaustivement pendant `create-story` via `pdf-lib`)
  - [x] `packages/game-rules/src/ryuutama/validate.ts` non modifié — confirmé via `git status`
- [x] Task 4 — Vérification et tests (AC: #1 — non-régression)
  - [x] `apps/api/src/game-systems/game-system.service.spec.ts` : confirmé, aucune modification nécessaire
  - [x] Conteneur `api` redémarré, seed vérifié directement en base (`psql` : `SELECT ct.key, COUNT(ce.id) ... WHERE ct.key='spell'` → 75 lignes) — l'endpoint HTTP `GET /game-systems/ryuutama/content` est protégé par `AuthenticatedGuard`, vérification faite via la base plutôt qu'un curl non authentifié
  - [x] Suite complète exécutée : 898/898 API, 944/944 web, aucune régression
  - [x] `pnpm typecheck` (api) propre

## Dev Notes

- **⚠️ Contenu réel requis, ne jamais inventer/halluciner de texte.** Tout le contenu de référence ci-dessous est transcrit de `docs/magie.md` (déjà fourni par l'utilisateur, extrait du *Guide du Voyageur*, pages 34-41) — même règle absolue que les Stories 23.1-23.6.
- **Schéma du sort, décidé avec l'utilisateur pendant `create-story` (2026-07-26) :**
  ```ts
  interface Spell {
    key: string;
    name: string;
    magicType: 'rituelle' | 'saison';
    season: 'printemps' | 'ete' | 'automne' | 'hiver' | null; // null ssi magicType === 'rituelle'
    tier: 'debutant' | 'intermediaire' | 'avance';
    minLevel: 1 | 4 | 7; // debutant→1, intermediaire→4, avance→7 — TOUJOURS cette règle, quel que soit magicType/season
    castingType: 'brute' | 'ceremonielle';
    peCost: number;
    duration: string;   // texte libre (ex. "12 heures", "instantanée", "convalescence", "?")
    target: string;     // "Cible" dans le livre — texte libre (ex. "1 personne", "zone (10 m)")
    range: string;      // "Portée" dans le livre — texte libre (ex. "contact", "proche", "loin", "à vue", "soi-même")
    description: string; // texte de l'effet, transcrit du livre
    references?: string[]; // keys d'autres sorts explicitement mentionnés dans description (ex. sorts "jumelés" qui ne peuvent être lancés seuls) — champ optionnel, absent sur la grande majorité des sorts
  }
  ```
- **Décision produit actée (hors scope de cette story, à documenter pour la future story mécanique) :** choisir le type **Magie** donne accès **aux deux** formes de magie simultanément (rituelle ET saisons) — confirmé avec l'utilisateur. Ne redécouvrir/rouvrir cette question dans aucune story future de contenu ; seule la story mécanique aura besoin de l'exploiter (ex. quelle "saison" un personnage donné est lié — probablement un nouveau champ sur `RyuutamaSheetData`, hors scope ici).
- **`season` référence le catalogue `season` déjà existant** (`apps/api/game-systems/ryuutama/data/seasons.json`, `ContentType` `season` déjà enregistré) — ne pas créer de nouvelles clés de saison, réutiliser exactement `printemps`/`ete`/`automne`/`hiver`. Ce catalogue est déjà utilisé ailleurs (capacité `dragon-protection` du système de montée de niveau, `capability-label.util.ts`) — `spells.json` en devient un second consommateur, cohérent.
- **Sorts "jumelés" (`references`) :** deux paires identifiées dans le contenu — *Soins améliorés*/*Soins à distance* référencent tous deux `imposition-mains` (ne peuvent être lancés seuls, accompagnent *Imposition des mains*) ; *Lune factice* référence `lance-de-la-lune` (« Le sort *Lance de la lune* a les mêmes effets que si cette lune était la vraie »). Le texte de `description` reste intact (transcription pure) — `references` est une métadonnée additionnelle, pas une modification du texte.
- **Aucun affichage/mécanique ajouté pour `references`, `season`, `tier`, `minLevel`, etc.** — ces champs sont prêts pour une future story UI/mécanique, entièrement invisibles pour l'instant (même pattern que `effect.conditions` de la Story 23.6, `occupations`/`actions` non câblés sur la fiche à la Story 23.5).
- **Vérification exhaustive du template PDF (`create-story`, `pdf-lib`) :** les 119 champs AcroForm de `Ryuutama_fiche_de_voyageur_big_edit.pdf` ne contiennent aucun champ correspondant de près ou de loin aux sorts (`sort`, `magie`, `grimoire`, `saison` — recherche `/sort|magie|grimoire|saison/i` sur les 119 noms de champs, 0 résultat). Aucun mapping PDF à prévoir, cohérent avec le traitement déjà réservé aux capacités `type`/`dragon-protection`/`legendary-journey` (web-only, jamais dans le PDF).
- **Aucun changement de code au-delà de `spells.json` et de l'entrée `CONTENT_TYPES`.** `GameSystemService` lit déjà tout fichier de `CONTENT_TYPES` sans validation de forme au-delà de `key` (`data: unknown` côté `ContentEntryDto`) — redémarrer le conteneur `api` (ou attendre le hot-reload) suffit pour reseeder.
- **Corrections orthographiques supplémentaires appliquées, identifiées lors de la revue de code (2026-07-26)** — normalisations mineures au-delà des 3 corrections déjà listées explicitement (Copie parfaite/spécificités, Frégate des 7 fortunes/chasseur-ménestrel, Vitesse du faucon/rapide-extrême), toutes fidèles au sens, aucun contenu inventé :
  - `apparait`/`disparait` (source, sans accent circonflexe) → `apparaît`/`disparaît` : *Bouclier mathémagique*, *Encyclopedia draconica*, *Cabane de partout et nulle part*, *Festin des dragons*, *Vache d'aubergine*.
  - `coeur` → `cœur` (ligature) : *Cœur de lion*.
  - `voeu` → `vœu` (ligature) : *Vœu à la Voie lactée*.
  - *Copie parfaite* : durée source « 12 heure » → « 12 heures ».

### Contenu de référence — 75 sorts (source : `docs/magie.md`, pages 34-41)

**Magie rituelle — Débutant** (`magicType: "rituelle"`, `season: null`, `tier: "debutant"`, `minLevel: 1`)

*Magie brute (`castingType: "brute"`) :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| benediction-main-rouge | Bénédiction de la main rouge | 4 | 6 tours | 1 personne | proche |
| cloche-alarme | Cloche d'alarme | 4 | 12 heures | zone (10 m) | contact |
| eclatante-purete-cristal | Éclatante pureté du cristal | 2 | 12 heures | 1 objet | contact |
| fleche-boussole | Flèche-boussole | 4 | 12 heures | - | contact |
| imposition-mains | Imposition des mains | 4 | instantanée | 1 personne | contact |
| meteore-magique | Météore magique | 4 | instantanée | 1 personne | loin |

- **benediction-main-rouge** : "La main d'arme de la cible devient rouge. Elle est désormais plus forte, plus sûre et plus agile. Ce sort n'affecte que la main, mais continue à s'appliquer même si on change d'arme. +1 aux tests de toucher."
- **cloche-alarme** : "Une cloche magique apparaît. Elle carillonne dès qu'un monstre s'approche à moins de 10 mètres. Il n'est pas possible de la déplacer, ni de se déplacer avec. +1 aux tests de campement."
- **eclatante-purete-cristal** : "L'extrémité de l'objet ciblé devient transparente comme du cristal et émet une lumière blanche à l'intensité comparable à celle d'une lanterne. Il suffit de tapoter dessus pour l'allumer ou l'éteindre."
- **fleche-boussole** : "Une flèche magique qui pointe vers la destination choisie par le magicien avant de s'y diriger. +1 aux tests d'orientation."
- **imposition-mains** : "Ce sort accélère momentanément la guérison naturelle de sa cible. La cible regagne autant de PV que le résultat d'un dé correspondant à l'ESP du magicien."
- **meteore-magique** : "Une étoile chauffée à blanc et de la taille de la main du magicien est projetée sur la cible. La cible subit autant de dégâts que le résultat d'un dé correspondant à l'ESP du magicien."

*Magie cérémonielle (`castingType: "ceremonielle"`) :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| dressage-sort | Dressage | 10 | 12 heures | 7 animaux ou moins | à vue |
| extase-gustative | Extase gustative | 10 | 1 heure | nourriture | contact |
| sphere-protection | Sphère de protection | 10 | 12 heures | 1 personne | contact |

- **dressage-sort** : "Le magicien gagne la confiance de bêtes sauvages. Elles peuvent alors être utilisées pour la monte ou le trait. Elles doivent être immobilisées ou captives durant l'incantation. Ne fonctionne pas sur les monstres. Ce sort affecte autant d'animaux que le résultat d'un dé correspondant à l'ESP du magicien." *(clé suffixée `-sort` pour éviter toute confusion avec le talent "Dressage" du catalogue `class`, autre `ContentType`)*
- **extase-gustative** : "Ce sort affecte une quantité de nourriture conservée équivalant au résultat d'un dé, lui-même correspondant à l'ESP du magicien. Elle est considérée comme des rations de choix et prend le goût choisi par le magicien. Elle doit être consommée dans l'heure ou commence à se gâter."
- **sphere-protection** : "Une barrière sphérique de lumière bleue apparaît autour de la cible. Celle-ci bénéficie désormais de 3 points de protection contre les capacités spéciales des monstres."

**Magie rituelle — Intermédiaire** (`tier: "intermediaire"`, `minLevel: 4`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| bouclier-mathemagique | Bouclier mathémagique | 4 | 10 minutes | 1 personne | contact |
| coeur-de-lion | Cœur de lion | 4 | 6 tours | 1 personne | contact |
| encyclopedia-draconica | Encyclopedia draconica | 2 | instantanée | 1 personne | loin |
| frappe-telekinetique | Frappe télékinétique | 4 | instantanée | 1 personne | contact |
| serenite | Sérénité | 4 | instantanée | 1 personne | contact |

- **bouclier-mathemagique** : "Un bouclier magique apparaît et se déplace automatiquement pour protéger la cible. Celle-ci bénéficie d'un point de protection supplémentaire."
- **coeur-de-lion** : "Ce sort ne fonctionne que sur une cible ayant au moins 2 PV. Son cœur se met à briller vivement. Pendant la durée du sort, les PV de la cible ne peuvent plus descendre en dessous de 1. Le sort cesse lorsqu'ils atteignent ce chiffre."
- **encyclopedia-draconica** : "Invoque la légendaire encyclopédie des monstres. Elle apparaît devant le personnage et s'ouvre directement à la page du monstre concerné, affichant le détail de ses caractéristiques chiffrées. Le joueur du personnage ciblé peut consulter les caractéristiques du monstre que ce soit dans ce livre, un supplément ou une copie des notes du MJ."
- **frappe-telekinetique** : "Projette un objet du champ de bataille sur un ennemi et lui inflige d6 points de dégâts. Sauf en cas de double 1, l'attaque touche quelle que soit la condition de la cible. L'objet est détruit suite à l'attaque."
- **serenite** : "Ce sort permet de retrouver l'équilibre du corps et de l'esprit. La cible fait un test de condition. Si le résultat obtenu est meilleur que le précédent test de condition, on applique le nouveau."

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| petite-souris | La petite souris | 4 | sommeil | 1 tâche simple | soi-même |
| chevaliers-du-lavoir | Les chevaliers du lavoir | 4 | incantation | linge sale | contact |
| reverence-sylvestre | Révérence sylvestre | 10 | 12 heures | rayon de 5m | soi-même |
| un-des-leurs | Un des leurs | 10 | 12 heures | 7 pers. ou moins | contact |

- **petite-souris** : "Après la cérémonie, alors que le lanceur de sort est en train de dormir, des petits lutins viennent se charger d'une tâche simple. Celle-ci ne doit pas être plus complexe ou fatigante que ce qu'un enfant de six ans pourrait accomplir."
- **chevaliers-du-lavoir** : "Au début de la cérémonie, les chevaliers du lavoir emportent jusqu'à 20 points d'encombrement de linge sale des personnages dans leur dimension. Ils reviennent à la fin du rituel avec ces mêmes vêtements frais et parfaitement propres, qui n'ont ni rétréci ni déteint. Les chevaliers du lavoir restituent ce qui n'a pu être lavé (à la discrétion du meneur)." *(correction : « chevalier » singulier dans le titre source → « chevaliers », cohérent avec le pluriel utilisé partout ailleurs dans le texte)*
- **reverence-sylvestre** : "Si les personnages sont dans une forêt, les arbres s'écartent pour les laisser passer. Les personnages progressent donc en ignorant tout malus à la distance parcourue lié à ce paysage."
- **un-des-leurs** : "Les cibles sont revêtues de costumes magiques qui leur donnent l'apparence d'animaux. Les animaux et les bêtes fantastiques ne les attaquent plus. Il existe toutefois quelques exceptions (au choix du meneur). Tant que les cibles portent leurs costumes, leur AGI est réduite de 2 points."

**Magie rituelle — Avancé** (`tier: "avance"`, `minLevel: 7`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| ailes-de-libellule | Ailes de libellule | 4 | 10 minutes | 1 personne | contact |
| bain-de-lames-et-de-sang | Bain de lames et de sang | 10 | instantanée | Champ de bataille | soi-même |
| bataille-extradimensionnelle | Bataille extradimensionnelle | 10 | 6 tours | Champ de bataille | soi-même |
| vitesse-du-faucon | Vitesse du faucon | 4 | 6 tours | 1 personne | contact |

- **ailes-de-libellule** : "Des ailes de libellule poussent dans le dos de la cible et lui permettent de voler à une vitesse d'environ 30 kilomètres/heure. Elle peut se comporter en vol comme elle le ferait sur terre. Le fait de voler ne procure ni avantage ni désavantage en combat."
- **bain-de-lames-et-de-sang** : "Ce sort fait apparaître une multitude de lames tranchantes comme des rasoirs. Tous ceux qui sont présents sur le champ de bataille, alliés comme ennemis, subissent autant de dégâts que le résultat des dés correspondants à l'INT et l'ESP du magicien. Seul ce dernier est immunisé."
- **bataille-extradimensionnelle** : "Ce sort enferme les combattants dans une dimension isolée de la réalité. Les alliés du magicien ont désormais +1 aux dégâts. Ses ennemis ont au contraire -1. Tant que le sort reste actif, les objets présents disparaissent du champ de bataille et personne ne peut y entrer ou en sortir."
- **vitesse-du-faucon** : "Tel un oiseau de proie, la cible bouge de façon beaucoup plus rapide et précise. Elle peut désormais réaliser deux attaques par tour de combat. Toutefois, ce sort exerce une contrainte extrême sur l'organisme et laisse des séquelles. Quand le sort se dissipe, la cible subit l'état Blessé (10)." *(corrections : « répide »→« rapide », « extrêùe »→« extrême »)*

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| cabane-de-partout-et-nulle-part | Cabane de partout et nulle part | 10 | 12 heures | une cabane | contact |
| copie-parfaite | Copie parfaite | 10 | 12 heures | 1 objet | contact |
| festin-des-dragons | Festin des dragons | 10 | 2 heures | 7 pers. ou moins | soi-même |
| message-des-dragons | Message des dragons | 4 | 1 heure | 1 personne | à vue |
| pont-arc-en-ciel | Pont arc-en-ciel | 4 | 12 heures | le ciel | contact |

- **cabane-de-partout-et-nulle-part** : "Ce sort crée une grande cabane douillette. Jusqu'à 7 personnes peuvent y dormir confortablement. Elle disparaît si plus de monde essaye d'y rentrer. Tous ceux qui y passent la nuit bénéficient de +2 à leur test de campement."
- **copie-parfaite** : "Ce sort crée une copie parfaite de l'objet ciblé. Les deux exemplaires sont indissociables et possèdent exactement les mêmes spécificités. Si l'un des deux est détruit, l'autre disparaît à la fin du sort. Ce dernier ne peut toutefois pas reproduire les propriétés des objets magiques." *(corrections : « examplaires »→« exemplaires », « spécificité »→« spécificités », « l'un deux »→« l'un des deux »)*
- **festin-des-dragons** : "Le légendaire banquet des dragons apparaît et jusqu'à 7 personnes peuvent y participer. Les convives qui honorent le repas regagnent l'intégralité de leurs points de vie et n'ont pas besoin de manger à nouveau avant le lendemain. Toutefois, il leur faut pas moins de 2 heures pour tout finir." *(correction : « 2 jeures »→« 2 heures »)*
- **message-des-dragons** : "Ce sort trace des signes lumineux dans le ciel, formant un message pouvant compter jusqu'à 140 caractères. La personne désignée par le magicien est avertie d'une façon ou d'une autre que le sort a été lancé et est la seule à pouvoir lire le message. Elle doit toutefois être en mesure d'apercevoir le ciel." *(correction : « magicient »→« magicien »)*
- **pont-arc-en-ciel** : "Ce sort crée un pont arc-en-ciel de 50 mètres de long et jusqu'à 20 mètres de hauteur. Tout le monde peut l'emprunter exactement comme s'il s'agissait de n'importe quel pont."

---

**Magie du Printemps — Débutant** (`magicType: "saison"`, `season: "printemps"`, `tier: "debutant"`, `minLevel: 1`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| floraison-spontanee | Floraison spontanée | 2 | 1 jour | 1 lieu | contact |
| leve-toi-et-marche | Lève-toi et marche | 2 | instantanée | zone | proche |
| soins-ameliores | Soins améliorés | 2 | instantanée | 1 personne | contact |

- **floraison-spontanee** : "Une petite fleur tout à fait banale du type choisi par le magicien pousse à l'endroit ciblé par ce dernier. Si elle est ensuite replantée dans un endroit adapté et bénéficie d'assez de soins, elle se développe exactement comme une fleur normale."
- **leve-toi-et-marche** : "Tous ceux qui dorment dans la zone ciblée se réveillent immédiatement et se lèvent. Ceux qui ne sont pas endormis, mais simplement tombés à terre par exemple, se lèvent également. Ce sort ne fonctionne que sur les bipèdes."
- **soins-ameliores** : "Ce sort se lance en même temps qu'Imposition des mains, dont il renforce la puissance en rendant d6 PV supplémentaires. Il ne peut être lancé seul. Un seul test de magie est nécessaire pour les deux sorts." — `references: ["imposition-mains"]`

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| petite-beaute | Petite beauté | 4 | 1 jour | 1 personne | contact |

- **petite-beaute** : "Ce sort permet d'améliorer l'aspect de la cible en la maquillant et en changeant à la fois sa coupe de cheveux et leur couleur. Ces effets tiennent pour toute la durée du sort. Toutefois, ce dernier ne peut être utilisé pour se déguiser ou ne pas être reconnu." *(correction : « denier »→« dernier »)*

**Magie du Printemps — Intermédiaire** (`tier: "intermediaire"`, `minLevel: 4`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| detection-des-amoureux | Détection des amoureux | 2 | instantanée | zone | à vue |
| lance-de-la-lune | Lance de la lune | 2 | instantanée | 1 personne | loin |
| nuage-de-fievre-rose | Nuage de fièvre rose | 4 | convalescence | zone | proche |

- **detection-des-amoureux** : "Ce sort permet de savoir qui est amoureux dans le champ de vision du lanceur de sorts, sans toutefois permettre de savoir de qui les personnes concernées sont amoureuses."
- **lance-de-la-lune** : "Un bambou de lumière sort de terre et embroche la cible. Celle-ci subit autant de dégâts que le résultat du dé correspondant à l'ESP du magicien. Si la lune est visible, la cible subit d6 dégâts supplémentaires."
- **nuage-de-fievre-rose** : "Ce sort fait apparaître un nuage de pollen empoisonné. Celui-ci provoque larmes et éternuements. Toute personne dans la zone ciblée subit l'état Empoisonné (6) quelle que soit sa condition."

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| triple-chance | Triple chance | 10 | 12 heures | 3 personnes | contact |

- **triple-chance** : "Une formule magique pour un quotidien plus heureux. Pendant la durée du sort, jusqu'à 3 personnes ciblées peuvent refaire un test une seule fois chacune." *(correction : « PEndant »→« Pendant », « un seule fois »→« une seule fois »)*

**Magie du Printemps — Avancé** (`tier: "avance"`, `minLevel: 7`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| baiser-de-vie | Baiser de vie | 10 | instantanée | 1 personne | contact |
| eclosion-de-puissance | Éclosion de puissance | 10 | 6 tours | 1 personne | contact |
| soins-a-distance | Soins à distance | 2 | instantanée | 1 personne | loin |

- **baiser-de-vie** : "Ce sort permet de ressusciter une cible morte depuis moins de 6 tours (1 minute). Cette dernière revient à la vie avec la moitié de ses PV. Le magicien doit embrasser la cible pour que le sort fasse effet." *(correction : « ressuciter »→« ressusciter »)*
- **eclosion-de-puissance** : "Réveille une capacité dormante de la cible qui montre alors son vrai potentiel. Augmente le niveau d'un attribut de d12 à d20. Ne peut être utilisé sur un personnage n'ayant pas d'attribut à d12."
- **soins-a-distance** : "Ce sort se lance en même temps qu'Imposition des mains, et en améliore la portée. Il ne peut être lancé seul. Un seul test de magie est nécessaire pour les deux sorts." — `references: ["imposition-mains"]`

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| aube-printaniere | Aube printanière | 4 | instantanée | 1 personne | contact |

- **aube-printaniere** : "Ce sort fait apparaître une lumière douce et revigorante comme un lever de soleil au printemps. Il ne peut être utilisé que juste avant de faire un test de condition et permet à la cible d'en faire un second et de garder le meilleur des deux."

---

**Magie de l'Été — Débutant** (`season: "ete"`, `tier: "debutant"`, `minLevel: 1`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| choeur-dissonnant-des-cigales | Le chœur dissonnant des cigales | 4 | 6 tours | champ de bataille | soi-même |
| multiplication-de-ronces | Multiplication de ronces | 4 | 6 tours | zone | loin |
| vitalite-estivale | Vitalité estivale | 4 | 6 tours | 1 personne | contact |

- **choeur-dissonnant-des-cigales** : "Le chant assourdissant des cigales agace et empêche de se concentrer. Se boucher les oreilles ne sert à rien : ce tintamarre résonne dans toutes les têtes. Quiconque veut lancer un sort doit faire un meilleur résultat sur son test de magie que celui que le magicien a fait en lançant Le chœur dissonnant des cigales. De plus, ce dernier ne peut pas non plus utiliser de magie pendant toute la durée du sort."
- **multiplication-de-ronces** : "Ce sort fait pousser des ronces à une vitesse folle dans la zone ciblée. À partir du tour suivant, tous ceux qui se trouvent dans la zone ont -2 à leur initiative."
- **vitalite-estivale** : "La cible se sent très bien et est aussi enjouée que si elle était en vacances. Elle bénéficie de +2 à sa condition."

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| feuille-des-esprits-de-la-foret | La feuille des esprits de la forêt | 2 | 12 heures | 7 pers. ou moins | contact |

- **feuille-des-esprits-de-la-foret** : "Ce sort crée une feuille de pétasite gigantesque qui peut protéger jusqu'à 7 personnes de la pluie. Elle donne +1 à tous les tests dont la difficulté dépend du climat Pluie. Les effets de la feuille ne se cumulent pas avec ceux d'un parapluie."

**Magie de l'Été — Intermédiaire** (`tier: "intermediaire"`, `minLevel: 4`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| coup-de-mou | Coup de mou | 4 | convalescence | 1 personne | proche |
| moustiquaire-electrique | Moustiquaire électrique | 4 | 12 heures | zone (5m) | soi-même |
| passion-ecarlate | Passion écarlate | 4 | instantanée | 1 personne | contact |

- **coup-de-mou** : "Ce sort provoque une déprime d'origine magique. Quelle que soit sa condition, la cible subit l'état Las (6)."
- **moustiquaire-electrique** : "Ce sort crée une moustiquaire magique. Constituée d'éclairs, elle émet une lumière douce. Tout insecte touchant la moustiquaire tombe raide mort. Elle n'affecte ni les humains ni les monstres et donne +2 aux tests de campement dans les régions infestées d'insectes."
- **passion-ecarlate** : "La cible s'embrase avec passion et bouge désormais avec une énergie renouvelée qui lui permet de changer le cours du combat. Elle effectue immédiatement un nouveau test d'initiative. Le résultat de ce dernier sera appliqué à partir du tour suivant." *(correction : « initative »→« initiative »)*

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| averse-minute | Averse minute | 10 | 10 minutes | zone (5m) | soi-même |

- **averse-minute** : "Ce sort fait tomber une averse aussi localisée qu'intense. L'eau de cette pluie est tout à fait potable et peut remplir les outres et autres tonneaux du groupe."

**Magie de l'Été — Avancé** (`tier: "avance"`, `minLevel: 7`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| foudre | Foudre | 4 | instantanée | 1 personne | contact |
| epreuve-des-braves | L'épreuve des braves | 4 | instantanée | champ de bataille | loin |

- **foudre** : "Un éclair puissant comme deux violents orages d'été s'abat sur le magicien et sa cible. Ils subissent autant de dégâts que le résultat des dés correspondant à l'AGI et à l'ESP du magicien." *(correction : « instantannée »→« instantanée »)*
- **epreuve-des-braves** : "Le magicien fait apparaître l'espace d'un instant une horreur indescriptible et indicible. Quelles que soient leurs conditions, tous ceux qui l'aperçoivent subissent l'état Choc (10). Se voiler la face ou fermer les yeux ne sert à rien : l'horreur hante jusqu'à l'âme ceux qui la croisent."

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| nuit-dete | Nuit d'été | 10 | 1 heure | soi-même | soi-même |
| voeu-a-la-voie-lactee | Vœu à la Voie lactée | 10 | ? | papier | ? |

- **nuit-dete** : "Les nuits d'été sont les plus belles de l'année, mais également les plus mystérieuses. Ce sort permet au magicien de se promener sous une forme fantomatique pendant son sommeil. Son corps spectral émet alors une douce lumière semblable à celle d'une luciole. Il peut traverser les obstacles créés par la main de l'homme, mais doit contourner les barrières naturelles et les êtres vivants. Il ne peut ni parler, ni toucher quoi que ce soit et réintègre son corps à la fin du sort."
- **voeu-a-la-voie-lactee** : "Porte un vœu jusqu'aux étoiles. Tous les joueurs écrivent un vœu sur un papier et le donnent au meneur. Celui-ci peut exaucer un seul vœu de son choix durant le scénario, au moment qu'il juge le plus adapté. S'il pense que les joueurs ont écrit des vœux stupides ou inintéressants, il n'est pas obligé d'en tenir compte." **⚠️ `duration`/`range` valent littéralement `"?"` dans le livre — pas une erreur de transcription, transcrire tel quel (cf. Task 1).**

---

**Magie de l'Automne — Débutant** (`season: "automne"`, `tier: "debutant"`, `minLevel: 1`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| feuilles-mortes | Feuilles mortes | 2 | définitif | sol | contact |
| larmes-de-jouvencelle | Larmes de jouvencelle | 4 | 6 tours | 1 personne | loin |
| lune-factice | Lune factice | 6 | 6 tours | champ de bataille | loin |

- **feuilles-mortes** : "Ce sort fait apparaître un monticule de feuilles mortes sur une surface d'environ 1 mètre carré."
- **larmes-de-jouvencelle** : "Les yeux de la cible s'emplissent de larmes qui perturbent sa vision et coulent sur ses joues comme le feraient celles d'une jeune fille. Elle subit un malus de -2 à ses tests pour toucher."
- **lune-factice** : "Ce sort ne peut être lancé que la nuit et en extérieur. Il fait apparaître une fausse pleine lune, magnifique, ronde et lumineuse, dans le ciel. Le climat est alors considéré comme du beau temps et les alentours sont éclairés. Le sort Lance de la lune a les mêmes effets que si cette lune était la vraie." — `references: ["lance-de-la-lune"]`

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| pot-de-confiture-magique | Pot de confiture magique | 4 | 7 jours | nourriture | contact |

- **pot-de-confiture-magique** : "Ce sort transforme n'importe quel aliment en confiture. Même si son apparence est modifiée et qu'il faut désormais le conserver dans un pot, il conserve son goût d'origine et ses propriétés. Toutefois, ceci ne dure qu'une semaine, après quoi il se met à moisir. Le nombre d'unités de nourriture affectées est égal au résultat d'un dé correspondant à l'ESP du magicien. Ce sort n'affecte pas les herbes de soins."

**Magie de l'Automne — Intermédiaire** (`tier: "intermediaire"`, `minLevel: 4`) — *pas de sort de magie cérémonielle à ce palier, confirmé dans le livre*

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| chagrin-damour | Chagrin d'amour | 4 | convalescence | 1 personne | proche |
| vache-daubergine | Vache d'aubergine | 4 | instantanée | 1 personne | loin |
| cocon-de-nuit | Cocon de nuit | 4 | 12 heures | 1 personne | contact |
| epouvantail-protecteur | Épouvantail protecteur | 4 | 6 tours | 1 personne | proche |

- **chagrin-damour** : "Ce sort fait apparaître des souvenirs amers d'histoires d'amour qui se sont mal finies ou brise le cœur de sa cible en lui faisant croire que celle qu'elle vit vient de se terminer. Quelle que soit sa condition, la cible subit l'état Choc (6). Selon les cas, la difficulté de ce dernier peut même être augmentée. Ce sort ne marche que sur ceux qui ont déjà connu l'amour ou qui sont amoureux."
- **vache-daubergine** : "Lancée sur un mort-vivant, la vache d'aubergine ramène ce dernier dans l'autre monde, ce qui a pour effet de le faire disparaître. En effet, seuls les plus têtus en reviennent, et cela leur demande en général au moins une année complète. Le magicien doit réussir à lancer deux fois ce sort sur la même cible, peu importe le temps passé entre chacune d'elles."
- **cocon-de-nuit** : "Ce sort crée un énorme cocon pouvant servir de sac de couchage. Il est confortable et conserve très bien la chaleur. Toutefois, il doit être suspendu à quelque chose pour pouvoir être utilisé. Passer la nuit dans le cocon permet d'obtenir un +1 au test de condition du lendemain."
- **epouvantail-protecteur** : "Ce sort crée un épouvantail qui attire une partie des coups destinés à la cible. Hors effet de zone, à chaque fois que quelqu'un attaque la cible, lui jette un sort ou utilise une capacité spéciale contre elle, il a une chance sur deux de toucher l'épouvantail à la place. Ce dernier est presque indestructible, mais s'embrase s'il est exposé à une chaleur trop forte."

**Magie de l'Automne — Avancé** (`tier: "avance"`, `minLevel: 7`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| humeur-dautomne | Humeur d'automne | 4 | 1 tour | 1 personne | loin |
| mensonges-mortels | Mensonges mortels | 10 | instantanée | 1 personne | contact |

- **humeur-dautomne** : "La cible change d'avis aussi rapidement que le ciel d'automne. Elle est perdue dans ses pensées, sans pouvoir prendre de décision ou se concentrer sur ce qu'elle fait. En combat, elle perd sa prochaine action et ne peut agir à son tour."
- **mensonges-mortels** : "Les paroles du magicien font faner la vie elle-même. Si la cible a plus d'1 PV, elle descend à 1 PV. Ne fonctionne que contre des plantes ou des bêtes fantastiques, ou des monstres humanoïdes."

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| crepuscule-automnal | Crépuscule automnal | 10 | vol | 7 pers. ou moins | contact |
| chant-apaisant-des-grillons | Chant apaisant des grillons | 10 | cérémonie | ceux qui entendent | soi-même |

- **crepuscule-automnal** : "C'est du ciel que l'on voit le mieux la couleur du crépuscule. Ce sort attire les oiseaux migrateurs situés à moins d'1 kilomètre, et permet de voler et de partir en voyage avec eux. Il dure tant que les cibles restent avec les oiseaux et que ceux-ci ne se posent pas. Le meneur décide s'il y a des oiseaux migrateurs dans les environs, de leur direction ainsi que de la distance qu'ils parcourent."
- **chant-apaisant-des-grillons** : "Ce sort fait démarrer le chant apaisant et si caractéristique des grillons. Ceux qui l'entendent gagnent autant de PE que le résultat du dé correspondant à l'ESP du magicien."

---

**Magie de l'Hiver — Débutant** (`season: "hiver"`, `tier: "debutant"`, `minLevel: 1`) — *pas de sort de magie cérémonielle à ce palier, confirmé dans le livre*

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| bloc-de-glace | Bloc de glace | 2 | 10 minutes | 1 cube | contact |
| tempete-de-boules-de-neige | Tempête de boules de neige | 4 | instantanée | zone | proche |
| torpeur-hivernale | Torpeur hivernale | 4 | instantanée | zone | loin |
| visage-glacial | Visage glacial | 4 | 6 tours | 1 personne | contact |

- **bloc-de-glace** : "Ce sort crée un cube de glace d'environ 50 centimètres de haut qui peut être utilisé comme objet pendant un combat. Toutefois, il se dissipe après avoir été utilisé ou à la fin du combat et ne peut donc être utilisé pour fournir de l'eau."
- **tempete-de-boules-de-neige** : "Ce sort projette une volée de boules de neige bien dures qui frappent tous ceux qui sont dans la zone visée. Ils subissent autant de dégâts que le résultat d'un dé correspondant à l'ESP du magicien. Les alliés n'en subissent que la moitié."
- **torpeur-hivernale** : "Les cibles sont entourées d'une douce chaleur et s'endorment. À chacun de leurs tours suivants, elles peuvent faire un test de VIG + ESP de difficulté 6 pour se réveiller. En cas de succès, elles se réveillent mais ne peuvent rien faire d'autre pour le tour. Si elles subissent le moindre point de dégâts, elles se réveillent immédiatement."
- **visage-glacial** : "La cible n'exprime plus aucune émotion, comme si elle portait un masque. Annule un état psychologique pendant la durée du sort."

**Magie de l'Hiver — Intermédiaire** (`tier: "intermediaire"`, `minLevel: 4`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| arme-de-glace | Arme de glace | 4 | 1 heure | 1 personne | proche |
| champ-electrique | Champ électrique | 2 | 6 tours | zone | soi-même |
| grippe-du-vent-mauvais | Grippe du vent mauvais | 4 | convalescence | 1 personne | contact |

- **arme-de-glace** : "Ce sort fait apparaître une arme de glace dans la main de la cible. Elle est du type souhaité par le magicien et strictement identique à une autre arme de cette catégorie."
- **champ-electrique** : "Ce sort génère une grande quantité d'électricité statique autour du magicien. Toute personne le touchant ou l'attaquant avec une arme de mêlée subit autant de dégâts que le résultat du dé correspondant à son ESP. Le magicien ne subit ces dégâts qu'une seule fois, au lancement du sort." *(correction : « ons ESP »→« son ESP »)*
- **grippe-du-vent-mauvais** : "Ce sort déclenche les symptômes de la grippe chez la cible : maux de tête, toux, fièvre, etc. Quelle que soit sa condition, elle subit l'état Malade (6)."

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| couvertures-et-chocolat-chaud | Couvertures et chocolat chaud | 2 | 12 heures | confort | contact |

- **couvertures-et-chocolat-chaud** : "Ce sort fait apparaître des couettes chauffantes et de grands bols de chocolat chaud. Les personnages peuvent se mettre à l'aise et profiter de tout ce confort. Si le climat est Froid, ils bénéficient de +2 au test de campement du lendemain. Toutefois, sur un double 1, ils subissent l'état Malade (4)." *(corrections : « choloat »→« chocolat », « àç l'aise »→« à l'aise », « Sil »→« Si », « Toufefois »→« Toutefois »)*

**Magie de l'Hiver — Avancé** (`tier: "avance"`, `minLevel: 7`)

*Magie brute :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| cercueil-de-glace | Cercueil de glace | 10 | jusqu'à la fonte | 1 personne | contact |
| matin-dhiver | Matin d'hiver | 4 | 6 tours | zone | soi-même |
| zero-absolu | Zéro absolu | 10 | d4 tours | temps | soi-même |

- **cercueil-de-glace** : "Ce sort enferme la cible dans un cercueil de glace dans lequel même le temps n'a plus cours. La gangue de givre est indestructible par des moyens physiques, mais fond si on la laisse toute une journée entre 15 et 20°C. En revanche, par temps froid, le cercueil peut très bien ne jamais fondre et durer éternellement."
- **matin-dhiver** : "Ce sort crée une zone de calme semblable à un matin d'hiver autour du magicien. Il n'y a plus ni aucun effet magique, ni aucun son, même ceux provenant de l'extérieur. Il y est désormais impossible d'utiliser la magie ou de parler."
- **zero-absolu** : "Ce sort fait tellement baisser la température qu'il gèle le temps. Le magicien bénéficie de d4 tours durant lesquels il est le seul à pouvoir agir. Toutefois, il ne peut rien faire d'autre qu'utiliser la magie." *(correction : « itliser »→« utiliser »)*

*Magie cérémonielle :*

| key | name | peCost | duration | target | range |
| --- | --- | --- | --- | --- | --- |
| fregate-des-7-fortunes | La frégate des 7 fortunes | 10 | 12 heures | 1 classe de PJ | soi-même |

- **fregate-des-7-fortunes** : "Les âmes des sept héros qui ont unifié les mers de l'Est arrivent sur un navire merveilleux et bénissent une classe de personnage pour laquelle tous les doubles (dont les doubles 1) comptent désormais comme des réussites critiques. Pour déterminer quelle classe est bénie, on lance un d8 (1 : artisan, 2 : chasseur, 3 : fermier, 4 : guérisseur, 5 : marchand, 6 : ménestrel, 7 : noble, 8 : toutes les classes). Si le groupe ne comprend aucun membre de la classe indiquée, les âmes des héros s'en vont, déçues." *(corrections : « navir »→« navire », « chassuer »→« chasseur », « menestrel »→« ménestrel »)*

### Project Structure Notes

- Fichier de données : `apps/api/game-systems/ryuutama/data/spells.json` (**nouveau**, gitignoré comme tous les fichiers de `game-systems/ryuutama/data/`) — 75 entrées.
- Fichier `apps/api` à modifier : `apps/api/src/game-systems/game-system.service.ts` (ajout d'une entrée à `CONTENT_TYPES`, ligne ~62-97).
- Aucun autre fichier à toucher — pas de frontend, pas de `packages/game-rules`, pas de migration Prisma.
- Alignement avec la structure du projet : cohérent avec le pattern déjà établi pour les 10 `ContentType` existants (dernier ajouté : `wizardStepIntro`, Story 23.3).

### References

- [Source: docs/magie.md] — texte réel des règles de magie et des 75 sorts (pages 34-41 du *Guide du Voyageur*)
- [Source: _bmad-output/planning-artifacts/epics-palier8.md#Story 23.7] — user story et Acceptance Criteria d'origine
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-24/prd.md#FR-11, Open Question 2] — "Chaque sort seedé a au minimum un nom et une description/effet non vide" ; mécanique de sorts explicitement différée
- [Source: apps/api/game-systems/ryuutama/data/seasons.json] — catalogue `season` existant (`printemps`/`ete`/`automne`/`hiver`), réutilisé tel quel pour le champ `season` des sorts
- [Source: apps/api/game-systems/ryuutama/data/types.json#magie] — description du type Magie confirmant l'accès simultané aux deux formes de magie ("Grimoire" + "Lié aux saisons")
- [Source: apps/api/src/game-systems/game-system.service.ts#CONTENT_TYPES] — pattern d'enregistrement d'un nouveau catalogue, 10 entrées existantes
- [Source: apps/api/src/game-systems/game-system.service.spec.ts] — confirmé : `getContent()` testé avec données mockées génériques, aucune clé `CONTENT_TYPES` en dur
- Vérification directe (`create-story`, `pdf-lib` dans le conteneur `api`) : les 119 champs AcroForm de `Ryuutama_fiche_de_voyageur_big_edit.pdf` ne contiennent aucun champ lié aux sorts/magie/grimoire/saison

### Review Findings

- [x] [Review][Patch] Normalisations orthographiques non annotées individuellement (`apparait`→`apparaît`, `disparait`→`disparaît`, `coeur`→`cœur`, `voeu`→`vœu`, "12 heure"→"12 heures" sur *Copie parfaite*) — introduites pendant `create-story`, fidèlement recopiées par `dev-story`, mais absentes de la liste explicite des corrections documentées. Contenu non inventé, juste traçabilité incomplète — documentées a posteriori dans les Dev Notes.
- [x] [Review][Defer] Le champ `references` conflate deux sémantiques différentes sans discriminant : dépendance de cast obligatoire (*Soins améliorés*/*Soins à distance* → `imposition-mains`, "ne peut être lancé seul") vs référence d'équivalence d'effet (*Lune factice* → `lance-de-la-lune`, "a les mêmes effets que si..."). Aucun consommateur actuel de ce champ (hors scope de cette story) — à trancher (ex. ajouter un `referenceType`) au moment de la story mécanique qui l'exploitera. — deferred, pas de consommateur actuel
- [x] [Review][Dismiss] `references` asymétrique (`imposition-mains` ne référence pas en retour les sorts qui en dépendent) — dérivable trivialement par filtrage inverse (`spells.filter(s => s.references?.includes('imposition-mains'))`), aucun modèle de données supplémentaire requis.
- [x] [Review][Dismiss] `season` absent vs `null` explicite sur les entrées `rituelle` — faux positif du Blind Hunter dû à un exemple abrégé transmis en revue ; le fichier réel a bien `"season": null` explicite sur les 27 sorts, confirmé par l'Acceptance Auditor.
- [x] [Review][Dismiss] `target: "-"` isolé sur `fleche-boussole` — transcription fidèle, `docs/magie.md` utilise littéralement `-` à cet endroit (vérifié).
- [x] [Review][Dismiss] `peCost: 6` isolé sur `lune-factice` (seule occurrence hors 2/4/10) — vérifié contre `docs/magie.md` ligne 584, valeur exacte du livre, pas une coquille de transcription.
- [x] [Review][Dismiss] Autres points mineurs (2 champs `"?"` sur *Vœu à la Voie lactée* déjà décidé, duplication de texte entre descriptions, suffixe `dressage-sort` ad hoc déjà justifié dans la story, absence de validation croisée `castingType`/coût, `tier` en ASCII vs valeurs accentuées) — déjà documentés/décidés dans la story ou cohérents avec la convention déjà établie du projet.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- L'endpoint `GET /game-systems/:id/content` est protégé par `AuthenticatedGuard` — impossible de vérifier le seed via un simple `curl` non authentifié. Vérification faite directement en base via `docker compose exec db psql -U jdr -d jdr -c "SELECT ct.key, COUNT(ce.id) FROM \"ContentType\" ct JOIN \"ContentEntry\" ce ON ce.\"contentTypeId\"=ct.id WHERE ct.key='spell' GROUP BY ct.key;"` → `spell | 75`, confirmant le seed réel après redémarrage du conteneur `api`.

### Completion Notes List

- Implémentée le 2026-07-26. `spells.json` créé avec 75 sorts (27 magie rituelle + 48 magie des saisons, 12 par saison), transcrits de `docs/magie.md`, schéma `{ key, name, magicType, season, tier, minLevel, castingType, peCost, duration, target, range, description, references? }` décidé pendant `create-story`.
- `ContentType` `spell` enregistré dans `CONTENT_TYPES` (`game-system.service.ts`), même pattern que les 10 catalogues existants — aucun autre changement de code.
- Confirmé : aucun fichier frontend/`packages/game-rules`/`RyuutamaSheetData` touché, aucune validation de forme ajoutée, aucun mapping PDF (conforme à l'exclusion explicite de la mécanique de sorts, AC5).
- Seed vérifié réellement en base après redémarrage du conteneur `api` (pas seulement via les tests mockés) : 75 entrées `spell`.
- Suite finale : 898/898 tests API (inchangé, aucune modification de test nécessaire), 944/944 tests web (inchangé), `pnpm typecheck` (api) propre, aucune régression.

### File List

- `apps/api/game-systems/ryuutama/data/spells.json` (nouveau — gitignoré, 75 sorts)
- `apps/api/src/game-systems/game-system.service.ts` (modifié — ajout de l'entrée `spell` à `CONTENT_TYPES`)

## Change Log

- 2026-07-26 : Story créée (bmad-create-story). Schéma du sort discuté et validé avec l'utilisateur (magicType/season/tier/minLevel/castingType + références de sorts jumelés), contenu des 75 sorts transcrit en Dev Notes depuis `docs/magie.md`.
- 2026-07-26 : Implémentée (bmad-dev-story). `spells.json` créé (75 sorts), `ContentType` `spell` enregistré. Aucun câblage mécanique/UI (hors scope explicite). Seed vérifié en base réelle. 898/898 tests API + 944/944 tests web, aucune régression. Statut passé à "review".
- 2026-07-26 : Revue de code (bmad-code-review, 3 couches adversariales). 0 decision-needed, 1 patch appliqué (documentation a posteriori de 4 normalisations orthographiques mineures non listées), 1 item différé (`references` conflate deux sémantiques différentes, à trancher au moment de la story mécanique), 8 écartés (dont vérification manuelle du coût PE isolé de *Lune factice*, confirmé exact contre `docs/magie.md`). Aucune régression. Statut passé à "done".
