---
title: "jdr-master Experience — Delta Palier 10.4 Sondage et Destinée dans le calendrier"
status: final
created: 2026-10-20
updated: 2026-10-20
design: DESIGN.md
inherits: "_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-08/EXPERIENCE.md"
sources:
  - _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-10-19-p10-4/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/mockups/contrat-ui-calendrier.html
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-08/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-20/.working/extrait-sources.md
  - _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-20/.memlog.md
---

# jdr-master — Experience — Delta Palier 10.4

**Ce document est un delta.** Il décrit comment fonctionnent, dans le calendrier, la création d'un sondage et le suivi d'un vote après le Palier 10.4 (PRD `prd-jdr-master-2026-10-19-p10-4`, FR-1 à FR-16). Tout ce qu'il ne mentionne pas reste tel que le fixent le contrat du calendrier (Palier 9, `ux-jdr-master-2026-08-04/`) et le delta du Palier 10. Les écarts aux écrans validés sont signalés ⚠️ et listés en §10.

Il amende le PRD sur un point, décidé avec l'utilisateur le 2026-10-20 : **le geste de sélection garde l'ordre des dispos** (on sélectionne les jours, puis on choisit le moment), et une sélection s'ajoute à la précédente. Plus de touche Maj ni d'équivalent tactile (PRD FR-6, §8 Q1).

En cas de conflit avec une planche de `mockups/`, **ce document gagne**.

---

## 1. Foundation

- **Form-factor** : web responsive. Le MJ prépare surtout sur ordinateur, joueurs et membres votent surtout sur téléphone (P9, amendement 2). Les deux supports sont des cibles de premier rang pour la Destinée.
- **UI system** : Angular Material 22, composant unique `CalendarView` derrière trois routes : `/parties/:id/calendar` (calendrier de partie, MJ), `/parties/:id/guild-calendar` (joueur de JDR et groupe), `/profile/calendar` (calendrier personnel).
- **Identité visuelle** : `DESIGN.md` de ce dossier, qui hérite du Palier 10 et du Palier 9.

## 2. Information Architecture

### 2.1 Ce qui apparaît où

| Élément | Calendrier de partie (MJ) | Calendrier de partie (joueur) / du groupe | Calendrier personnel |
| --- | --- | --- | --- |
| Fenêtres de l'automate (§2.2) | oui, colonne de droite | joueur : version agrégée inchangée, sans action ; groupe : non | non |
| « Proposer des dates » (§2.3) | oui, si un rendez-vous de la partie est à dater | hôte : oui, si un rendez-vous du groupe est à dater | oui, si l'utilisateur a au moins un rendez-vous à dater |
| Puce ✦ et liste des destinées (§2.4) | votes de cette partie | votes de cette partie | votes de toutes les parties actives |
| Plateau de la destinée (§2.5) | remplace la colonne de droite | remplace la colonne de droite | colonne qui apparaît avec la Destinée (≥ 768 px) |
| Filtre par partie (§2.6) | non (déjà restreint) | non (déjà restreint) | oui, dans « Affichage » |

Sous 768 px, le plateau est un **tiroir du bas** dans les trois calendriers ; le reste de la colonne de droite reste empilé sous la grille, comme aujourd'hui.

### 2.2 ⚠️ Fenêtres de l'automate (colonne MJ)

Planche : [`mockups/proposition-colonne-mj-ephemerides.html`](mockups/proposition-colonne-mj-ephemerides.html). Ordre de la colonne MJ, inchangé sauf la liste : bloc « qui manque » par vote ouvert (ou « Aucun conseil de date en cours. »), puis **la liste de l'automate**, désormais :

1. **En-tête** « Éphémérides · 18 » (libellé du thème, §3.1).
   - **≥ 768 px** : une flèche **›** dans l'en-tête de la colonne **range toute la colonne de droite en dock** collé au bord droit ; le calendrier reprend toute la largeur. Le dock (bande verticale étroite) porte une flèche **‹** pour la rouvrir et, en vertical, le libellé et le compteur (« Éphémérides · 18 »). Demandé par l'utilisateur le 2026-10-20.
   - **< 768 px** : la colonne étant empilée sous la grille, l'en-tête replie la liste verticalement (chevron).
   - État retenu pour le MJ ; colonne ouverte par défaut à la première visite. `[ASSUMPTION]`
2. **Colonne ouverte / liste dépliée** : champs Du / Au et « Scruter », puis les cartes, puis le lien « Afficher les N masquées » s'il y en a.
3. **Carte sélectionnée** : « Ajouter au vote » et « Masquer ».

### 2.3 ⚠️ « Proposer des dates » et le choix du rendez-vous

Le bouton « Proposer des dates » remplace, dans la ligne de contrôles, le bouton d'armement du composer (« Inscrire des dates ») et les boutons « Composer les créneaux : {titre} » de l'hôte. Il porte le PRD FR-5 (« Créer un sondage » y était un nom de travail) :

1. Toucher « Proposer des dates » ouvre le **choix du rendez-vous** : ses rendez-vous à dater, groupés par partie (nom propre en en-tête). En calendrier de partie ou du groupe, seuls ceux de cette partie ; **s'il n'y en a qu'un, l'étape est sautée**.
2. Le rendez-vous choisi arme le composer, avec la barre `app-compose-bar` : « Pour : {nom du rendez-vous} », compte, Valider, Annuler. En calendrier du groupe, l'armement bascule en vue Semaine (règle 40.5b conservée).
3. **⚠️ Le rendez-vous se choisit avant, plus à la validation.** La fenêtre de validation (`ComposeConfirmDialog`) ne garde que sa face « avertissement de perte de réponses ».

Quand la destinée active est un sondage dont l'utilisateur est l'organisateur, le même bouton devient « Modifier les dates » et arme le composer prérempli. Le bouton est **absent** quand il n'y a rien à proposer ni à modifier.

L'aller-retour depuis la fenêtre « Nouvelle conjonction » (« Choisir les créneaux dans le calendrier », 40.5b) est conservé tel quel.

### 2.4 ⚠️ La puce ✦ et la liste des destinées

- La puce reste hors du panneau « Affichage » (c'est un mode, pas un filtre). **Elle ouvre désormais la liste des destinées** (tiroir modal sous 1024 px, menu ancré au-delà). Planche : [`mockups/proposition-tiroir-destinee-mobile.html`](mockups/proposition-tiroir-destinee-mobile.html), écran ①.
- La liste groupe par partie les **sondages ouverts** que l'utilisateur peut voir, échéance passée comprise. Chaque ligne : nom du vote, « Échéance {date} · N créneaux » ou « Échéance passée · N créneaux », pastille d'état (§5.2).
- Une destinée active s'affiche en tête de liste, avec « Quitter la Destinée ». `[ASSUMPTION]`
- Choisir une ligne active la Destinée et place la grille sur le premier créneau candidat (ou sur le meilleur, après l'échéance `[ASSUMPTION]`).
- Sans sondage ouvert, la puce reste **absente** (Story 36.9, AC10), validé par l'utilisateur le 2026-10-20 ; le PRD FR-7 est ajusté en conséquence.
- La Destinée n'existe pas en vue Agenda (36.9). Activer une destinée depuis la vue Agenda bascule en vue Mois (Semaine pour un groupe).

### 2.5 ⚠️ Le plateau de la destinée

Planche : écrans ② et ③.

- **Tiroir replié** (mobile) : nom du vote ; « n / N · {date} {moment} · x oui · échéance … » ; pastille d'état ; « Voir les N dates » et, pour l'organisateur, « Fixer la date… ».
- **Tiroir déplié / colonne de droite** : titre ; sous-titre « Échéance {date} · x réponses sur N » (« Échéance passée le {date} · plus de vote possible » après l'échéance) ; liste des créneaux candidats dans l'ordre chronologique, chacun avec ses oui et une barre, « meilleur » sur le plus plébiscité, le courant entouré ; « N'ont pas … : {noms} » (clé existante) ; actions de l'organisateur.
- **Actions de l'organisateur** : « Modifier les dates » (composer prérempli) et « Fixer la date… », avant comme après l'échéance ; en mode soirée, « Prolonger le vote ».
- **Un votant** n'a pas d'action dans le plateau : il répond **sur la grille**, avec le sélecteur de réponse existant (Oui / Peut-être / Non / Retirer ma réponse).

### 2.6 Filtre par partie (calendrier personnel)

Dans le panneau « Affichage », sous « Ce que je vois », une section « Seulement » `[ASSUMPTION]` liste les parties actives par leur nom, en cases à cocher, toutes cochées par défaut. Décocher une partie masque ses séances, votes et inscriptions ; les dispos restent. La pastille de résumé l'annonce (« Affichage filtré · 2 sur 3 »). Perdu au rechargement de la page.

### 2.7 ⚠️ Formulaire de création — mode et nature expliqués

Ajout demandé par l'utilisateur le 2026-10-20, rattaché au 10.4 (PRD FR-17). Les noms de thème restent ; une **ligne en clair**, identique dans les trois thèmes, dit ce qu'ils désignent.

- **Bascule de mode** (`mode-switch`, P10 §7.2) : chaque option sur deux lignes, le nom du thème puis la ligne en clair, pour voir les deux choix avant de cliquer.
- **Nature** : sous chaque option, une ligne d'explication ; l'option choisie garde la sienne visible.

| Choix | Grimoire / Forêt / Atelier | Ligne en clair |
| --- | --- | --- |
| Mode JDR | Quête / Sentier / Mission | Jeu de rôle |
| Mode soirée | Ralliement / Veillée / Rassemblement | Soirée entre amis |
| Nature JDR `ONE_SHOT` | Quête unique / Sentier court / Mission unique | Une seule séance : l'histoire commence et se termine le même soir. |
| Nature JDR `CAMPAGNE_LINEAIRE` | Chronique / Longue marche / Programme | Une histoire suivie sur plusieurs séances, avec la même troupe. |
| Nature JDR `CAMPAGNE_EPISODIQUE` | Chronique épisodique / Longue marche par étapes / Programme à cycles | Plusieurs séances complètes chacune ; les joueurs peuvent changer d'une séance à l'autre. |
| Nature soirée isolée | La conjonction des Esprits / La halte au gué / La réunion d'établi | Un rendez-vous unique : on invite, on trouve une date, et c'est fini. |
| Nature groupe | La convergence des Sortilèges / La grande transhumance / Le grand chantier | Une bande d'amis durable : chaque membre peut proposer des rencontres, chez lui, quand il veut. |

Ces clés entrent dans `NEUTRAL_KEYS`, raison : « explication en clair, volontairement hors thème ». Les lignes du mode soirée n'emploient aucun mot du JDR. Les mêmes lignes accompagnent la nature partout où on peut la changer ensuite (édition de la partie). `[ASSUMPTION]`

## 3. Voice and Tone

### 3.1 Libellés par thème

Toute clé nouvelle a une voix par thème, ou entre dans `NEUTRAL_KEYS` avec sa raison. Aucun mot du JDR (MJ, campagne, scénario, séance, joueur, quête) ni « partie » dans un libellé que le mode soirée affiche. Libellés **provisoires**, à valider sur l'application. `[ASSUMPTION]`

| Usage | Grimoire Émeraude | Forêt Ancienne | Atelier Cuivré |
| --- | --- | --- | --- |
| Fenêtres de l'automate (`section.slots`) ⚠️ | **Éphémérides** *(provisoire ; repli : Augures du calendrier)* | Clairières disponibles *(inchangé)* | **Créneaux calculés par l'automate** |
| Bouton de proposition | Proposer des dates | Propose des dates | Soumettre des dates |
| Bouton de modification | Modifier les dates | Modifie les dates | Réviser les dates |
| Carte sélectionnée — ajouter | Ajouter au vote | Ajoute au vote | Verser au vote |
| Carte sélectionnée — masquer | Masquer | Masque | Écarter |
| Pied de liste | Afficher les {n} masquées | Montre les {n} masquées | Afficher les {n} écartées |
| Carte masquée | Démasquer | Fais-la revenir | Réintégrer |
| Titre de la liste des destinées | Choisir une destinée | Choisis une destinée | Sélectionner une destinée |
| Sous-titre de la liste | Tous vos votes ouverts, quel que soit le mois. | Tous tes votes ouverts, quel que soit le mois. | Tous vos votes ouverts, tous mois confondus. |
| Quitter le mode | Quitter la Destinée | Quitte la Destinée | Sortir de la Destinée |
| Titre du choix du rendez-vous | Quel rendez-vous dater ? | Quel rendez-vous veux-tu dater ? | Rendez-vous à planifier |
| Tiroir replié — déplier | Voir les {n} dates | Déplie les {n} dates | Détailler les {n} dates |
| Vote clos (lien direct) | Ce vote est clos : sa date est fixée. | Ce vote est clos : sa date est fixée. | Ce scrutin est clos : sa date est fixée. |

« Scruter », « Fixer la date… », « Prolonger le vote », « Voter dans le calendrier », « N'ont pas … » : clés existantes, inchangées.

### 3.2 Pastilles d'état (liste des destinées)

| État | Grimoire | Forêt | Atelier |
| --- | --- | --- | --- |
| à répondre | À faire | À faire | À traiter |
| a répondu | Répondu | Répondu | Consigné |
| organisateur | Organisateur | Organisateur | Organisateur |
| ne vote pas | Vous ne votez pas | Tu ne votes pas | Non votant |

« Organisateur » et « meilleur » : candidats à `NEUTRAL_KEYS` (mot de travail, identique partout).

### 3.3 Nature d'un rendez-vous (choix du rendez-vous)

JDR : « séance sans date ». Mode soirée : « {conjonction | halte | réunion} sans date » selon le thème, ou « soirée sans date » pour une soirée isolée `[ASSUMPTION]`.

## 4. Component Patterns

| Composant | Comportement |
| --- | --- |
| `DestinySheet` (mobile) | Non modal. Deux hauteurs, repliée et dépliée ; on bascule par la poignée (glisser) ou le bouton « Voir les N dates » (`aria-expanded`). Ne masque jamais toute la grille repliée. Se ferme avec la Destinée. |
| `DestinyBoard` (≥ 768 px) | Colonne sticky, défilement interne. Remplace le contenu de la colonne de droite tant que la Destinée est active ; le contenu habituel revient à la sortie. |
| `DestinyList` | Modal (tiroir) sous 1024 px, menu ancré au-delà. Échap ou fond assombri ferment sans rien changer. |
| `RendezvousPicker` | Modal. Une ligne = un rendez-vous ; toucher la ligne arme le composer. Sauté s'il n'y a qu'un rendez-vous. |
| `SideDock` (≥ 768 px) | Toute colonne de droite du calendrier (colonne MJ, joueur, groupe, plateau de la destinée) se range en dock par la flèche › de son en-tête et se rouvre par la flèche ‹ du dock. Le dock montre en vertical ce qu'il contient (« Éphémérides · 18 », « ✦ Chapitre 4 »). Rangée, la colonne libère toute la largeur pour la grille. `[ASSUMPTION]` pour les colonnes autres que celle du MJ. |
| `AutomateList` | Sous 768 px : en-tête bouton (`aria-expanded`) qui replie la liste. Cartes sélectionnables une à la fois. |
| Barre de sélection en composition | La barre des dispos (36.3), en version composition : « N jours sélectionnés », portée (Journée en JDR seulement · Matin · Après-m. · Soir), « Ajouter au vote », « Retirer », « Annuler ». |
| `app-compose-bar` | Inchangée : cible, compte cumulé, raison de blocage (2 minimum), Valider, Annuler. |

## 5. State Patterns

### 5.1 La Destinée

| État | Puce ✦ | Plateau | Grille |
| --- | --- | --- | --- |
| Aucun sondage ouvert | absente | — | normale |
| Sondages ouverts, aucun actif | « ✦ Destinée » | — | normale |
| Actif, avant l'échéance | « ✦ Destinée · {nom} », chevrons si ≥ 2 créneaux | liste + comptes en direct | jours sans créneau estompés ; votants répondent sur la grille |
| Actif, échéance passée | idem | « plus de vote possible » ; organisateur : Fixer la date…, Prolonger (soirée) | idem, sélecteur de réponse en lecture seule |
| Le sondage devient clos (date fixée, annulé, supprimé) | revient à l'état précédent | se ferme | message écrit : « Ce vote est clos… » (§3.1) ; la date fixée apparaît |

### 5.2 Bouton « Proposer des dates »

| Situation | Bouton |
| --- | --- |
| Au moins un rendez-vous à dater (dans le contexte) | « Proposer des dates » |
| Destinée active dont on est organisateur | « Modifier les dates » |
| Les deux | « Modifier les dates » (proposer reste possible depuis la liste des destinées) `[ASSUMPTION]` |
| Rien à dater, rien à modifier | absent |

### 5.3 Fenêtre de l'automate

Au repos · sélectionnée (contour, actions, autres jours estompés) · dans le composer (sortie de la liste, liseré tireté sur la grille) · masquée (cachée ; visible estompée via « Afficher les N masquées »). Annuler le composer rend les fenêtres à la liste.

### 5.4 États vides et erreurs

- Lien direct vers un sondage clos ou inexistant : calendrier normal + message écrit, une fois.
- Lien vers une partie sans accès : refus habituel, sans rien dire du sondage.
- Liste de l'automate vide : en-tête « Éphémérides · 0 », déplié, message existant.
- Refus du serveur à la validation : erreur existante `calendar-error--compose`, composer conservé.

## 6. Interaction Primitives

Les quatre principes du Palier 9 (§6 bis) tiennent : le rail suit, **la Destinée ne réassigne aucun geste**, **seule la composition réassigne le tap**.

- **Composition (⚠️ geste des dispos)** : un tap court ajoute ou retire **une** bande (inchangé, 36.10) ; un appui maintenu (450 ms) ou un glissement sélectionne **plusieurs jours**, puis la barre de sélection fait choisir le moment et « Ajouter au vote ». Chaque sélection **s'ajoute** aux créneaux déjà désignés. Clavier inchangé (`1` `2` `3`, `Espace`, `Maj`+flèches pour étendre la plage, `Entrée`, `Échap`).
- **Fenêtre de l'automate** : toucher une carte la sélectionne ; la retoucher, ou `Échap`, la désélectionne. Pendant une sélection, l'estompe de la fenêtre remplace celle de la Destinée ; la désélection la rétablit. `[ASSUMPTION]`
- **Plateau** : toucher un créneau candidat le rend courant et place la grille dessus ; ‹ › font de même pas à pas. Toucher une bande de vote sur la grille ouvre le sélecteur de réponse (inchangé) et rend ce créneau courant.
- **Lien direct** : l'adresse porte l'identifiant du sondage (nom du paramètre : architecture). À l'ouverture : vue Mois (Semaine pour un groupe), même si l'Agenda est la vue par défaut sur mobile ; Destinée active ; tiroir replié.
- **Liens existants redirigés** (PRD FR-14) : « Voter dans le calendrier » (conjonction et e-mail de relance) et « vote en attente » (page d'une partie, joueur) ouvrent par le lien direct ; plusieurs sondages ouverts → liste des destinées de la partie. « Lancer le vote » (fiche de scénario, MJ) arme le composer pour cette séance, choix du rendez-vous sauté.
- **Fixer la date** depuis le plateau : `SealConfirmDialog` en JDR, `DateFixDialog` en mode soirée ; « Prolonger le vote » : `ExtendVoteDialog`.

## 7. Accessibility Floor

- Les flèches › et ‹ du dock sont des boutons nommés (« Ranger la colonne », « Rouvrir la colonne ») avec `aria-expanded` ; ranger la colonne rend le focus à la flèche ‹.
- Le tiroir replié est une région nommée (« Destinée : {nom} ») ; son bouton de dépliage porte `aria-expanded`. Le déplier ne piège pas le focus.
- La liste des destinées et le choix du rendez-vous piègent le focus, se ferment par `Échap` et rendent le focus à leur bouton.
- Changer de créneau courant annonce, en `aria-live` poli : « Créneau 2 sur 5, samedi 18 octobre, soir, 4 oui ».
- L'estompe ne retire ni pointeur ni accessibilité ; un jour focalisé reste net (36.9).
- Cibles de 44 px par défaut ; aucune action accessible par le seul glissement du tiroir (le bouton existe).
- `prefers-reduced-motion` : le tiroir change de hauteur sans animation.

## 8. Key Flows

Mêmes protagonistes que le PRD (UJ-1 à UJ-4).

1. **UJ-1 — Incon tire un sondage des éphémérides.** Calendrier de partie, colonne MJ : il déplie « Éphémérides · 18 », touche une carte (la bande s'entoure, le reste s'estompe), « Ajouter au vote » ; le composer s'arme « Pour : Chapitre 5 — La foire aux dragons » (seul rendez-vous à dater : choix sauté). Il ajoute deux autres cartes, en masque une, puis glisse sur trois vendredis et choisit « Soir » dans la barre : ils s'ajoutent. **Climax** : Valider ouvre le vote, la Destinée s'active dessus.
2. **UJ-2 — Léa propose des dates depuis son calendrier personnel.** « Proposer des dates » → choix du rendez-vous : sa soirée sans date. Le composer s'arme ; elle glisse sur cinq jours, choisit « Soir », puis un samedi, « Après-m. ». **Climax** : la barre affiche 6 créneaux, Valider est actif ; elle valide.
3. **UJ-3 — Marc vote depuis le lien.** « Voter dans le calendrier » → calendrier du groupe en Semaine, Destinée active, tiroir replié sur le premier créneau. Il répond sur la grille, ‹ › pour la date suivante. **Climax** : « 6 / 6 », il a tout répondu sans chercher.
4. **UJ-4 — Incon conclut un vote échu.** Calendrier personnel, puce ✦ → la liste, toutes parties : « Chapitre 4 — Échéance passée — Organisateur ». La Destinée s'ouvre sur le meilleur créneau. **Climax** : « Fixer la date… » dans le tiroir, confirmation, la date apparaît, le mode se ferme sur « Ce vote est clos ».

## 9. Responsive & Platform

| Largeur | Plateau | Liste des destinées / choix du rendez-vous | Vue par défaut |
| --- | --- | --- | --- |
| < 768 px | tiroir du bas | tiroir modal | Agenda (sauf lien direct ou Destinée active : Mois, Semaine pour un groupe) |
| 768–1023 px | colonne de droite | tiroir modal | Mois |
| ≥ 1024 px | colonne de droite | menu ancré | Mois |

## 10. ⚠️ Écarts aux écrans validés

| # | Écran validé | Ce qui change | Pourquoi |
| --- | --- | --- | --- |
| 1 | Colonne MJ (P9, 36.x) | colonne rangeable en dock à droite (›/‹) sur ordinateur, liste repliable sur mobile ; cartes actionnables, masquage ; Du / Au / Scruter sous l'en-tête | FR-1 à FR-4 ; le calendrier récupère toute la place |
| 2 | Libellés `section.slots` | Grimoire « Éphémérides », Atelier « Créneaux calculés par l'automate » | FR-16 ; « validés » laissait croire à des dates confirmées |
| 3 | Ligne de contrôles | « Proposer des dates » / « Modifier les dates » remplace « Inscrire des dates » et « Composer les créneaux : {titre} » | FR-5, FR-10 ; un seul point d'entrée, trouvable |
| 4 | `ComposeConfirmDialog` (36.10) | le choix de la séance passe **avant** le composer ; la fenêtre ne garde que l'avertissement de perte | FR-2, FR-5 |
| 5 | Composer (36.10) | le geste de sélection des dispos (36.3) s'ajoute au tap ; sélections cumulatives | FR-6, amendé |
| 6 | Mode Destinée (36.9) | la puce ouvre une liste ; les chevrons parcourent les créneaux du vote, plus les votes ; plateau en colonne ou tiroir | FR-7 à FR-9 |
| 7 | Calendrier personnel | colonne de droite pendant la Destinée (≥ 768 px) ; section « Seulement » dans « Affichage » | FR-8, FR-15 |
| 8 | Calendrier du groupe (40.5b) | ouverture en Destinée par lien ; « Composer les créneaux : {titre} » remplacé (#3) | FR-13, FR-14 |
| 9 | Fenêtre d'une conjonction, e-mail de relance, page d'une partie, fiche de scénario | destination des liens vers le calendrier, pas leur forme | FR-14 |
| 10 | Formulaire de création (P10 §2.3, `mode-switch` §7.2) | bascule sur deux lignes avec « Jeu de rôle » / « Soirée entre amis » ; ligne d'explication sous chaque nature | FR-17 ; les noms de thème seuls restaient obscurs |

## 11. Open Items

1. **« Éphémérides »** est provisoire : à confronter aux retours de la bande ; repli « Augures du calendrier ».
2. **Libellés du §3** : tous provisoires, à relire sur l'application dans les trois thèmes.
3. **Surfaces sans planche** (choix de l'utilisateur) : choix du rendez-vous, barre de sélection en composition sur mobile, plateau en colonne sur ordinateur, filtre « Seulement », formulaire de création expliqué. Construites depuis les tableaux de ce document.
4. **Stockage** du masquage et de l'état replié : architecture (PRD §8 Q4).
5. **PRD mis à jour le 2026-10-20** avec ce delta : FR-5, FR-6, FR-7, FR-8, FR-16, nouvelle FR-17, §8.
6. **Forêt : « Sentier »** désigne le mode JDR, la nature « Sentier court » et le bouton « Ouvrir un sentier ». Lisible avec la ligne « Jeu de rôle » ; à renommer plus tard si ça gêne encore à l'usage.
