# Deferred Work

Registre des items de dette technique/UX identifiés en cours de développement (revue de code, dev-story, vérification visuelle) mais non traités immédiatement.

**Ce fichier ne contient QUE des items encore actifs** — jamais résolus, jamais explicitement refusés. Dès qu'un item reçoit une décision définitive (corrigé, constaté obsolète, ou accepté comme dette assumée), il est retiré d'ici et archivé dans `deferred-work-archive.md` avec le raisonnement de la décision. Ce fichier reste donc une vraie liste de travail — s'il contient des items, ce sont des items à traiter ; s'il est vide, il n'y a rien en attente.

**Format d'un item** : une puce, avec un tag de priorité en tête — `[P:HAUTE]` (bug/trou fonctionnel réel), `[P:MOYENNE]` (écart UX/architecture réel mais non bloquant), `[P:BASSE]` (nit, cosmétique, gap de test isolé) — suivi du texte et, entre crochets en fin de ligne, le(s) fichier(s) concerné(s).

**Historique** : `deferred-work-archive.md` — 518 items triés le 2026-08-25 (96 résolus, 420 acceptés/non actifs). Deux décisions produit tranchées ce jour-là : sections manquantes de l'Agenda (comportement confirmé définitif) et unification du libellé « Soirée »/« Soir » (uniformisé vers « Soir »).

---

## Deferred from: code review of 31-2-surface-de-detail-adaptative (2026-08-25)

- [P:BASSE] Cible tactile de `.sheet__detail-trigger` limitée au texte du nom (pas de `min-height`/padding dédiés) — risque de régression de taille de cible tactile mobile (WCAG 2.5.5), non couvert par un AC de la story (AC7 exige un élément interactif réel visuellement identique à l'ancien `<strong>`, pas une taille de cible minimale). [apps/web/src/app/features/characters/character-sheet/character-sheet.scss:99-114]
- [P:BASSE] Seuil `1024px` dupliqué en dur dans une constante TS et deux `@media` SCSS, aucune source unique nommée — pattern déjà établi ailleurs dans le projet (`CalendarView.DESKTOP_QUERY`), pas introduit par cette story mais jamais centralisé. [apps/web/src/app/shared/detail-surface/detail-surface.ts:36, detail-surface.scss:8,20]

## Deferred from: code review of 31-3-aide-contextuelle-sur-les-termes-de-jeu (2026-08-29)

- [P:BASSE] Garde AC3 (« pas de texte au catalogue ⇒ pas de déclencheur ») non appliquée aux déclencheurs FR-20 préexistants (talents/avantages/sorts de la fiche) — comportement hérité tel quel de la 31.2, non touché par le diff de la 31.3, hors périmètre de son AC3 (qui ne vise que les nouveaux termes FR-19). En pratique inoffensif : ces catalogues (`class`, `type`, `spell`) exigent un texte non vide au seed. [apps/web/src/app/features/characters/character-sheet/character-sheet.html:227,240,299]
- [P:BASSE] Aucune sémantique ARIA de divulgation (`aria-haspopup`/`aria-expanded`) sur les déclencheurs de terme — pattern hérité tel quel de `.sheet__detail-trigger` (31.2), reproduit à l'identique par la 31.3 sur les nouveaux emplacements (`class-step`, `type-step`) ; pas une régression introduite par cette story, mais jamais corrigé depuis. [apps/web/src/app/shared/detail-surface/detail-surface.html]

## Deferred from: code review of 31-4-refonte-du-parcours-de-creation-de-personnage (2026-09-20)

- [P:BASSE] La surface de détail modale (desktop) ne verrouille pas le défilement de la page derrière le voile — conséquence du passage en modal (31.4) ; la feuille mobile se comporte pareil depuis la 31.2.
- [P:BASSE] L'option de classe est structurée (tableau + récit) dans l'assistant mais en `body` simple sur la fiche (`ClassChoiceDisplay` ne porte que l'effet résolu du talent parent) — à unifier si la fiche reçoit le talent parent complet.

## Deferred from: bmad-review (Adversarial/Edge-Case Hunter/Verification Gap) of 29-15-un-bouton-clair-pour-creer-son-personnage-depuis-la-partie (2026-09-21)

- [P:MOYENNE] Aucune garde côté route pour `/parties/:id/characters/new` — la 29.15 gate uniquement les points d'entrée UI (bouton, slot roster, atterrissage d'onglet) ; une URL directe/en favori vers l'assistant de création reste ouverte sur un système sans module ou une partie clôturée, même après cette story. Gelé explicitement hors périmètre par la story elle-même (`Boundaries & Constraints → Never : « Ne pas modifier la garde 404 de character-wizard.ts »`) — la garde côté route est prévue par la validation serveur de la story 29.17, pas avant. [apps/web/src/app/features/characters/character-wizard/character-wizard.ts]
- [P:BASSE] `packages/shared/src/index.ts` (`GAME_SYSTEMS[].module`) et `apps/api/src/game-systems/supported-game-systems.ts` (`SUPPORTED_GAME_SYSTEMS`) restent deux listes maintenues indépendamment, protégées seulement par un test de parité (`supported-game-systems.spec.ts`) ajouté lors de la revue interne du 2026-09-21 — pas par une dérivation structurelle qui rendrait la divergence impossible. Amélioration naturelle pour la story 29.17, qui touche déjà ce terrain côté serveur.
- [P:BASSE] `character.no_character_yet` (onglet « Ma fiche ») affiche le même message générique que la raison soit « système sans module », « partie clôturée » ou « pas encore créé » — le bouton disparaît sans que le joueur sache pourquoi dans les deux premiers cas. Corriger exigerait 2 clés thématisées supplémentaires ×3 thèmes et une logique de branchement ; déjà noté comme rejet `low` dans le Review Triage Log de la story lors de sa revue interne, reconduit ici pour rester tracé explicitement plutôt que noyé dans un paragraphe de log. [apps/web/src/app/features/parties/partie-detail/partie-detail.html:234, apps/web/src/app/core/theme/tones.ts]

## Deferred from: bmad-code-review (Adversarial/Edge-Case Hunter/Simplification/Reuse/Efficiency/Altitude/Conventions) of 29-17-seuls-les-systemes-jouables-sont-proposes-a-la-creation-dune-partie (2026-09-22)

- [P:MOYENNE] `PartiesService.getOwned()` lit la partie hors transaction ; toute méthode qui l'utilise (`update()`, `convertKind()`, `removeMember()`, etc.) évalue ensuite ses règles métier contre cet instantané figé avant d'écrire séparément — une vraie fenêtre TOCTOU (deux appels concurrents sur la même partie peuvent s'entrelacer). Pas introduit par la story 29.17 : `convertKind()` (Story 29.14), donnée en exemple du « bon » patron transactionnel dans les commentaires de ce même fichier, a exactement la même faille (ses règles évaluent `partie.kind`/`partie.closedAt` lus AVANT la transaction, seuls les comptages dérivés sont relus dedans). 29.17 étend la garde `gameSystemId` au même instantané non-transactionnel plutôt que de la corriger, décision assumée en revue : corriger une seule méthode (`update()`) en dupliquant la logique d'ownership de `getOwned()` créerait une incohérence avec les autres appelants qui garderaient la faille ; la corriger correctement exige de revoir `getOwned()` et tous ses appelants ensemble — hors périmètre de cette story et de sa revue. **Nouvelle occurrence confirmée par la revue de la story 31.6 (2026-09-22)** : `PartiesService.setVisibilityLocks()` lit via `getOwned()` puis écrit dans une transaction séparée — si la Partie est supprimée entre les deux, `createMany` viole la contrainte de clé étrangère (`PartieVisibilityLock_partieId_fkey`) et lève une 500 non gérée au lieu d'une 404 propre. Même faille architecturale, pas un défaut introduit par 31.6. [apps/api/src/parties/parties.service.ts:273-278 (`getOwned`), :355-391 (`update`), :404-490 (`convertKind`), :1108-1140 (`setVisibilityLocks`, Story 31.6)]

## Deferred from: code review of spec-31-6-cadenas-de-visibilite-modele-et-filtrage-serveur (2026-09-22)

- [P:BASSE] `SetVisibilityLocksDto.LOCKABLE_FIELD_KEYS` est une liste Ryuutama codée en dur, dupliquée du littéral `sheetSchema` de `GameSystemService.getSchema()` — contournement assumé d'un cycle de modules (`PartiesModule` ↔ `GameSystemModule`), documenté en commentaire. Contredit l'objectif d'architecture de l'épic 31 (« l'unité de verrouillage est déclarée par le schéma… un futur système de jeu hérite du mécanisme sans retouche de l'écran »). Sans conséquence tant qu'un seul système de jeu (Ryuutama) existe dans ce projet ; corriger exigerait de sortir le schéma verrouillable dans un provider partagé (ou un `forwardRef()`), une restructuration de modules hors périmètre de la story 31.6. [apps/api/src/parties/dto/set-visibility-locks.dto.ts, apps/api/src/game-systems/game-system.service.ts:222-267]
- [P:BASSE] Deux appels `PUT /parties/:id/visibility-locks` concurrents sur la même Partie (double clic, deux onglets) peuvent, sous l'isolation `READ COMMITTED` par défaut de Prisma, atteindre `createMany` avec la même ligne cible avant que l'un des deux ait committé — violation de la contrainte unique (500) plutôt qu'un remplacement déclaratif propre. Le patron dont `setVisibilityLocks()` s'inspire explicitement (`PollService.setOptions()`, Story 36.10) a la même absence de verrou contre l'écriture concurrente — dette systémique du projet sur ce type d'endpoint déclaratif « remplace tout », pas une négligence propre à la story 31.6. [apps/api/src/parties/parties.service.ts (`setVisibilityLocks`), apps/api/src/poll/poll.service.ts (`setOptions`)]

## Deferred from: code review (8 angles, effort high) of the crash-fix/masked-indicator commits (2026-09-22)

- [P:MOYENNE] Seuls 2 des 10 clés verrouillables (`attributes`, `equipment`) portent une indication « Masqué par le MJ » côté écran — `classId`, `specialtyTypeId`, `typeId`, `weaponId`, `customWeapon`, `fetiqueObject`, `startingEquipment`, `narrative` restent silencieusement absents quand verrouillés, indiscernables d'un champ simplement non renseigné. Portée volontairement limitée à Attributs/Équipement pour ce correctif (les deux seuls signalés par l'utilisateur en testant la story 31.7). [apps/web/src/app/features/characters/character-sheet/character-sheet.html, apps/api/src/game-systems/game-system.service.ts:256-292]
- [P:BASSE] `PartieDetail.classLabel()` (roster/cartes de compagnons) renvoie une chaîne vide quand `classId` est verrouillé, sans distinction avec « pas de classe choisie » — même défaut de fond que celui corrigé pour Attributs/Équipement, sur un point d'entrée non audité par ce correctif. [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:340-344]
- [P:BASSE] `equipment-pdf.service.ts` affiche `0` pour `limite_enc` quand `derived` est masqué, alors que `ryuutama-pdf.service.ts` omet purement les champs concernés pour le même état — déjà noté dans les Implementation Notes du spec 31.6 comme « à harmoniser si besoin lors de la 31.7 », jamais repris depuis. [apps/api/src/characters/equipment-pdf.service.ts:37, packages/game-rules/src/ryuutama/ryuutama-pdf.service.ts]

## Deferred from: bmad-build review of 32-2-reorganisation-de-la-vue-de-partie (2026-09-22)

- [P:BASSE] Le bandeau transitoire `notice()` n'est déclenché que par les 3 actions de l'onglet
  Invitations (inviter, inviter par e-mail, copier un lien) mais s'affiche dans l'onglet Détails — un
  onglet différent de celui où l'action a lieu, donc rarement visible au moment où il compte (défaut
  préexistant, non introduit par la 32.2, qui n'a fait que déplacer sa position à l'intérieur de
  l'onglet Détails, de la zone Action vers la zone Consultation). Corriger le fond exigerait de revoir
  où ce bandeau vit (mécanisme partagé/toast plutôt qu'un `<p>` local à un onglet précis) — hors
  périmètre de cette story. [apps/web/src/app/features/parties/partie-detail/partie-detail.html:109-111, apps/web/src/app/features/parties/partie-detail/partie-detail.ts:663,685,698,739]

## Deferred from: bmad-build review of spec-31-7-ecran-de-configuration-des-cadenas (2026-09-22)

- [P:MOYENNE] Nouvelle occurrence confirmée par la revue de la story 31.7 : `SetVisibilityLocksDto.LOCKABLE_FIELD_KEYS`/`LOCKABLE_SUB_FIELDS` (déjà signalé `P:BASSE` ci-dessus lors de la revue de la 31.6) restent une liste Ryuutama figée, dupliquée manuellement du littéral `sheetSchema`. La 31.7 en fait le premier consommateur réel qui dérive ses cases à cocher *uniquement* de `sheetSchema` (AC1) — toute future clé `lockable` ajoutée au schéma sans mise à jour correspondante de cette liste ferait apparaître une case dans l'écran MJ dont l'enregistrement échouerait côté serveur (validation DTO), sans message clair pour expliquer pourquoi. Vérifié sans conséquence aujourd'hui (les 10 clés des deux côtés sont identiques), mais le risque n'est plus seulement architectural depuis cette story : il est maintenant atteignable par un MJ via l'écran. [apps/api/src/parties/dto/set-visibility-locks.dto.ts, apps/api/src/game-systems/game-system.service.ts:249-296, apps/web/src/app/features/parties/visibility-locks/visibility-locks.ts]

## Deferred from: bmad-build planning of spec-32-3-etats-de-scenario-et-de-seance (2026-09-23)

- [P:MOYENNE] La bande d'état verticale (`StateRail`, 4 px sur le bord gauche d'une carte), prescrite
  par la conception comme « équivalent exact » du badge d'état (`DESIGN.md:205-207`), est exclue du
  périmètre de la story 32.3 — décision utilisateur du 2026-09-23. Motif : la story 32.2 vient de
  poser des liserés de zone de 3 px (Action/Consultation/Référence) qui classent la *nature* du
  contenu et non un statut ; superposer une bande d'état sur les mêmes cartes créerait deux liserés
  concurrents à arbitrer visuellement. À reprendre avec la story 32.4, qui refait les cartes de la
  chronologie. [apps/web/src/app/shared/status-badge/ (à créer par 32.3), apps/web/src/app/features/parties/partie-detail/partie-detail.scss]

## Deferred from: bmad-build implementation of spec-32-3-etats-de-scenario-et-de-seance (2026-09-23)

- [P:MOYENNE] `docker compose exec web pnpm exec tsc --noEmit` **ne vérifie rien** : `apps/web/tsconfig.json`
  porte `"files": []` + `references`, donc sans `-b` la commande sort 0 sans compiler une ligne. Elle
  est pourtant citée comme preuve de typage front dans plusieurs specs du dépôt (32.2 et antérieures).
  La vraie vérification de types du front est `pnpm build` (compilateur Angular). À trancher : soit
  corriger la commande (`tsc -b`), soit remplacer toutes ses occurrences dans les specs par `pnpm build`.
  Constaté pendant l'implémentation de la 32.3 — aucune story n'est en cause, le trou est ancien.
  [apps/web/tsconfig.json]
- [P:MOYENNE] Deux tests API échouent sur des **dates figées désormais échues**, même famille que les
  deux échecs web connus de `calendar-view.spec.ts` : `party-signals.service.spec.ts:242`
  (`nextSessionDate: '2026-09-01'`, attendu passé) et `parties.service.spec.ts:1527`
  (`getAvailableSlots` sur `2026-09-20`, attend `UNAVAILABLE`, obtient `UNKNOWN`). Vérifié : aucun des
  deux chemins ne passe par `toSeanceDto()`, ils échouaient donc déjà avant la story 32.3. Le remède
  de fond est le même pour les quatre : figer l'horloge (`jest.useFakeTimers`/`vi.setSystemTime`) au
  lieu de dater les fixtures en dur. **La CI est rouge tant que ce n'est pas fait.**
  [apps/api/src/parties/party-signals.service.spec.ts:242, apps/api/src/parties/parties.service.spec.ts:1527, apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts:1933,2077]

## Deferred from: bmad-build review of spec-32-3-etats-de-scenario-et-de-seance (2026-09-23)

- [P:MOYENNE] `loadRetrospectiveNotes()` calcule la fenêtre rétrospective d'un scénario clôturé avec
  `s.poll?.chosenDate ?? s.inscription?.dateValidee` et ignore donc une séance datée par héritage
  (`Seance.dateValidee` seul, campagne linéaire) : ses notes de personnage sortent de la fenêtre et
  n'apparaissent pas dans la rétrospective. Défaut ANTÉRIEUR à la story 32.3, qui ne l'aggrave pas —
  mais le correctif est devenu trivial depuis qu'elle expose la date effective (`?? s.dateValidee`).
  [apps/api/src/scenarios/scenarios.service.ts:1165-1166]
- [P:MOYENNE] `CalendarView.allCalendarEntries()` résout la date d'une séance par
  `poll?.chosenDate ?? inscription?.dateValidee` et écarte l'entrée quand les deux manquent : une
  séance datée par héritage n'apparaît ni dans le calendrier ni dans l'Agenda. Même racine que
  l'entrée ci-dessus, même antériorité ; la story 32.3 n'a câblé aucun badge sur ces surfaces.
  [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:481,511]
- [P:BASSE] `todayKey` est figé à la construction dans `SeanceList` et `PartieDetail` (patron repris
  de `CalendarView`) : un écran laissé ouvert au-delà de minuit continue d'afficher « demain soir » le
  jour même et ne bascule jamais en « À débriefer ». S'y ajoute la dette UTC/local connue du projet —
  `todayKey` est dérivé en heure locale alors que les clés de date viennent d'ISO UTC. Aucun des deux
  n'est introduit par la story 32.3, qui applique le patron existant ; les corriger suppose de traiter
  le changement de jour pour TOUS les écrans qui gèlent l'horloge.
  [apps/web/src/app/features/scenarios/seance-list/seance-list.ts, apps/web/src/app/features/parties/partie-detail/partie-detail.ts, apps/web/src/app/features/calendar/calendar-view/calendar-view.ts]
- [P:BASSE] La vue Agenda garde sa propre copie des quatre teintes de statut
  (`calendar-agenda-view.scss:180-235`) au lieu de rendre `<app-status-badge>` : la story 32.3 a
  mutualisé les fonctions pures (`core/status/status-badge.model.ts`) mais pas le rendu. Deux feuilles
  à tenir d'accord quand la palette bouge. Migration à faire quand l'Agenda sera retouché.
  [apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.scss, apps/web/src/app/shared/status-badge/status-badge.scss]
- [P:MOYENNE] La bande d'état (`StateRail`, 4 px) reste non livrée. La story 32.3 l'avait explicitement
  renvoyée « à la story 32.4, quand les cartes seront refaites » ; la 32.4 a refondu la chronologie
  avec une **pastille de nœud** (ancrage sur la ligne) et n'a introduit aucune bande — la story 32.2
  interdit par ailleurs d'ajouter un liseré concurrent de ses trois liserés de zone. Aucun composant
  `StateRail` n'existe donc nulle part dans `apps/web`. À trancher explicitement : soit la pastille
  de nœud + le badge suffisent et la bande est abandonnée, soit elle reste à concevoir pour les
  cartes de partie (où la maquette `signaletique-etats.html` §3 la montre).
  [_bmad-output/implementation-artifacts/spec-32-3-etats-de-scenario-et-de-seance.md:31, _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/mockups/signaletique-etats.html]
- [P:MOYENNE] La cascade de résolution de la date effective d'une séance
  (`poll.chosenDate ?? dateValidee ?? inscription.dateValidee`) existe maintenant en quatre copies :
  `SeanceList.resolvedDate()`, `status-derivation.dateKeyOf()`, `ScenarioTimeline.seanceIso()` (story
  32.4) — et deux variantes de `CalendarView` qui oublient encore la racine ajoutée en 32.3. Tant
  qu'elle n'est pas extraite dans un helper partagé, « une seule cascade pour toute l'app » ne tient
  que par copier-coller, et la divergence de `CalendarView` en est la preuve.
  [apps/web/src/app/features/scenarios/seance-list/seance-list.ts:181, apps/web/src/app/core/status/status-derivation.ts:109, apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts:56, apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:481,511]
- [P:BASSE] Les séances sont numérotées et affichées dans leur ordre de **création**
  (`orderBy: { createdAt: 'asc' }` côté serveur, `$index + 1` côté gabarit), jamais dans l'ordre de
  leurs dates : une séance créée après coup mais datée plus tôt s'affiche « Séance 2 · 12 juin » sous
  « Séance 1 · 3 juil. ». La story 32.4 a corrigé l'ordre au niveau du **nœud** et laissé celui des
  lignes de séance intact, volontairement — trier ici seulement ferait diverger la chronologie de
  `SeanceList`, qui numérote de la même façon. À décider une fois pour toutes, sur les deux surfaces
  ensemble : où la numérotation des séances est-elle définie ?
  [apps/api/src/scenarios/scenarios.service.ts:1091, apps/web/src/app/features/scenarios/seance-list/seance-list.html:8, apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.html]
- [P:BASSE] La story 32.4 ajoute du petit texte (plage de dates d'un nœud à 0,75 rem, libellé de
  séance à 0,8125 rem) sur `--jdr-text-muted`, jeton dont le dépôt a déjà consigné qu'il plafonne à
  ~4,4:1 en Medieval Steampunk. Le correctif est une affaire de **palette** et reste attribué à
  l'epic 35 ; noté ici parce que la surface exposée à ce plafond grandit.
  [apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.scss, apps/web/src/styles.scss]

## Deferred from: bmad-review (Blind Hunter) of 33-1-fiche-homme-dragon-refondue (2026-09-23)

- [P:BASSE] La commande de vérification suggérée par le gabarit de spec (`pnpm vitest run <fichier>`) échoue dans ce dépôt — `apps/web` teste via le builder Angular `ng test`, pas un `vitest.config.ts` autonome (confirmé sur la story 33.1 : `pnpm vitest run` plante sur `window is not defined`). Rien dans l'outillage BMAD (gabarit de spec, `docs/checklist.md`) ne documente la bonne commande (`docker compose exec web pnpm exec ng test web --watch=false --include "<fichier>"`), donc chaque nouvelle story redécouvre le même échec. Pas un défaut du code de cette story — un correctif de doc/gabarit BMAD, hors périmètre d'un `bmad-build`.
  [_bmad/scripts/render_skill.py, docs/checklist.md]

## Deferred from: bmad-build de 33-2-les-souffles-de-mon-dragon — écarts aux règles de l'Homme Dragon (2026-09-25)

Source des règles : `docs/dragons.md` (transcription du livre fournie par l'utilisateur le 2026-09-25). À traiter via `bmad-correct-course` sur l'épic 33 — la Q-13 (2026-08-05) reposait sur une confusion souffles/éveils.

- [P:BASSE] Éveils : la famille (Déplacement / Combat) est désormais portée par `eveil-powers.json` (champ `famille`, 2026-09-25) mais n'est affichée nulle part. [apps/api/game-systems/ryuutama/data/eveil-powers.json]
- source_spec: `_bmad-output/implementation-artifacts/spec-33-2-les-souffles-de-mon-dragon.md`
  summary: Le seed Ryuutama fait des upserts sans jamais supprimer : une entrée retirée ou renommée d'un JSON reste en base et continue de s'afficher.
  evidence: `seedRyuutama()` (`apps/api/src/game-systems/game-system.service.ts`) n'a aucun `deleteMany` ; comportement préexistant, rendu visible par la refonte de `souffles.json`.
- source_spec: `_bmad-output/implementation-artifacts/spec-33-2-les-souffles-de-mon-dragon.md`
  summary: Le README du seed (`apps/api/game-systems/ryuutama/README.md`) ne liste que 5 des 20+ fichiers de `data/`, dont pas `souffles.json`, alors que l'erreur de bootstrap renvoie vers lui.
  evidence: liste figée depuis le palier 2 ; chaque nouveau content-type (dont `souffle`) l'a laissée de côté.
- source_spec: `_bmad-output/implementation-artifacts/spec-33-2-les-souffles-de-mon-dragon.md`
  summary: Dans chaque famille de souffles, l'ordre affiché suit l'ordre renvoyé par la base, pas celui du livre (ex. « Aide aux PNJ » commence par Retrouvailles et Fuite).
  evidence: constaté au contrôle visuel du 2026-09-26 ; `ContentEntry` ne porte aucune position et `getContent()` ne trie pas selon le fichier JSON.

## Deferred from: bmad-build de 33-4-export-pdf-au-niveau-des-fiches-joueur (2026-09-29)

- source_spec: `_bmad-output/implementation-artifacts/spec-33-4-export-pdf-au-niveau-des-fiches-joueur.md`
  summary: Clause d'AC « la réserve par défaut est imprimée si elle existe » non traitée — aucune donnée de réserve n'existe encore (`souffle_1`..`souffle_4` restent vides).
  evidence: la réserve de souffles est l'objet de la Story 33.6 ; à reprendre là (remplir les 4 cases, `nombre_souffles` restant `max(niveau − 1, 0)`).
- source_spec: `_bmad-output/implementation-artifacts/spec-33-4-export-pdf-au-niveau-des-fiches-joueur.md`
  summary: La règle de disponibilité des souffles (communs par famille, race, autres races dès le niveau 3) et les consignes de famille sont désormais dupliquées entre `packages/game-rules/src/ryuutama/homme-dragon-souffles.ts` (`availableSouffles()`, export PDF) et `homme-dragon-sheet.ts` (fiche web).
  evidence: la spec 33.4 interdit de toucher la fiche web ; à faire converger en faisant consommer `availableSouffles()` par `homme-dragon-sheet.ts` (dont les libellés de race dupliquent aussi `RACE_LABELS`).
- source_spec: `_bmad-output/implementation-artifacts/spec-33-4-export-pdf-au-niveau-des-fiches-joueur.md`
  summary: Les pages de souffles ajoutées reprennent l'ordre du catalogue renvoyé par la base, pas celui du livre (même écart déjà consigné pour la fiche web).
  evidence: `getContent()` ne trie pas selon le fichier JSON ; voir l'entrée de la story 33.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-33-5-mes-hommes-dragons-dans-personnages.md`
  summary: La liste « Personnages » ne recharge pas les Hommes Dragons sur changement temps réel (seule la ligne de création suit le canal `user:{id}`).
  evidence: `MyCharacters` ne lit `GET /me/homme-dragons` qu'à `ngOnInit`, le bloc figé de la 33.5 excluant tout câblage temps réel neuf. Un dragon créé depuis un autre appareil fait disparaître la ligne « Créer un Homme Dragon » sans faire apparaître la carte avant rechargement ; à évaluer selon `docs/checklist.md` (effet sur `HommeDragonService.changed()` ou rechargement sur le signal `HOMME_DRAGON_A_CREER`).
- source_spec: `_bmad-output/implementation-artifacts/spec-33-7-capacites-de-niveau.md`
  summary: L'export PDF de l'Homme Dragon (33.4) n'imprime ni l'artefact cadeau ni les souffles rituels ; seul `sheetData.artefact` est imprimé.
  evidence: `homme-dragon-pdf-field-map.ts` n'a aucun champ pour le cadeau et le gabarit PDF ne prévoit pas d'emplacement ; la spec 33.7 l'exclut, mais un MJ de niveau 4+ peut s'attendre à le retrouver sur l'export (décision produit + éventuel champ de gabarit à trancher).
