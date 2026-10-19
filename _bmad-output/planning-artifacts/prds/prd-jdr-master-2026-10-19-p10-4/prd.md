---
title: "Palier 10.4 — Sondage et Destinée dans le calendrier"
status: final
created: 2026-10-19
updated: 2026-10-20
---

# PRD : Palier 10.4 — Sondage et Destinée dans le calendrier

## 0. Document Purpose

Ce PRD cadre le Palier 10.4 de jdr-master : rendre la **création d'un sondage** et le **suivi d'un vote** faciles dans le calendrier, pour le JDR comme pour le mode soirée. Il reprend la matière recueillie pendant le travail UX du Palier 10 (`_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-08/palier-10-4-entrees.md`, 2026-10-08), dont il ne rouvre pas les décisions (Destinée enrichie « A + B »). Il prolonge le PRD du Palier 10 (`prds/prd-jdr-master-2026-10-08/`), dont il réutilise le Glossaire.

Il est écrit pour le PM (l'utilisateur) et les workflows suivants (`bmad-ux`, `bmad-architecture`, `bmad-create-epics-and-stories`) : vocabulaire au Glossaire (§3) ; FR propres à ce PRD (une FR d'un autre palier est citée avec son PRD) ; hypothèses en §9 ; technique en `addendum.md`.

**Mise à jour du 2026-10-20, après le travail UX** (`_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-10-20/`) : le geste de sélection garde l'ordre des dispos, sélections cumulatives, plus de touche Maj (FR-6) ; plateau en tiroir du bas sur mobile (FR-8) ; le bouton s'appelle « Proposer des dates » (FR-5) ; libellés des fenêtres de l'automate choisis (FR-16) ; ajout de FR-17 (mode et nature expliqués dans le formulaire de création), demandé par l'utilisateur.

⚠️ **Ce palier modifie des écrans validés** : le calendrier (Épics 30 et 36, Palier 9), la page calendrier du groupe (Story 40.5b) et les accès au vote. Chaque modification est listée en §4.6. Il lève aussi, **pour ce sujet seulement**, la contrainte « le JDR ne change pas » du Palier 10.

## 1. Vision

Créer un sondage dans jdr-master, aujourd'hui, est une épreuve. L'automate calcule bien des créneaux où la troupe est libre (« Fenêtres de la destinée »), mais il en affiche une vingtaine sur 3 000 pixels, et aucune carte ne permet d'en faire quoi que ce soit. Le mode « composer », qui crée réellement un vote, n'est annoncé nulle part. Le mode Destinée, qui met un vote en avant, ne connaît que les votes du mois affiché, ne s'ouvre pas depuis un lien, et ses flèches sautent d'un vote à l'autre au lieu de parcourir ses dates. Le créateur du produit lui-même a « galéré ».

Ce palier fait du calendrier **l'endroit où l'on fabrique et où l'on suit un sondage**. L'organisateur sait qu'un de ses rendez-vous n'a pas encore de date : depuis n'importe quel calendrier, il clique « Créer un sondage », choisit ce rendez-vous dans une courte liste, et sélectionne des jours comme il déclare ses dispos. Le MJ transforme en quelques gestes les fenêtres de l'automate en créneaux candidats. Le joueur ou le membre qui reçoit « Voter dans le calendrier » arrive directement sur le bon vote, voit ses dates en colonne, et répond. L'organisateur fixe la date au même endroit.

Le Palier 10 a livré le vote de conjonction en s'appuyant sur le « composer » existant, avec une gêne acceptée : peu découvrable, et le lien du vote ouvre le calendrier sans focus. Ce palier lève cette gêne, avant que la bande d'amis ne s'en serve pour de bon.

## 2. Target User

### 2.1 Jobs To Be Done

- **Dater un rendez-vous sans réfléchir au mécanisme** : en tant que MJ ou hôte, je sais lequel de mes rendez-vous n'a pas de date, je lui crée un sondage là où je suis, en quelques gestes.
- **Voter là où le lien m'envoie** : en tant que joueur ou membre, je clique sur « Voter », j'arrive sur le vote, je réponds, c'est fini.
- **Ne pas me perdre entre mes parties** : quand j'ai trois parties et deux groupes, je choisis le vote que je veux regarder et je filtre le calendrier sur une partie.
- C'est d'abord pour moi, créateur et MJ, et pour ma bande ; pas pour un public.

### 2.2 Key User Journeys

- **UJ-1. Incon, MJ, tire un sondage des fenêtres de l'automate.**
  Incon prépare la prochaine séance de sa campagne Ryuutama, qui n'a pas encore de date. Il ouvre le calendrier de la partie ; la liste des fenêtres de l'automate est repliée sous un en-tête qui en donne le nombre. Il la déplie, clique sur une fenêtre : le calendrier la met en évidence, le reste s'estompe. Il choisit « Ajouter au vote » : le composer s'ouvre et lui demande pour quel rendez-vous ; il choisit la séance à dater. Il ajoute une deuxième et une troisième fenêtre, qui s'accumulent dans le composer et quittent la liste de l'automate. Il en masque une qui tombe le soir d'un anniversaire. Il valide : le sondage s'ouvre aux joueurs. **Edge case :** il retire une option du sondage ; si l'automate la juge toujours libre, elle revient dans sa liste.

- **UJ-2. Léa crée un sondage depuis son calendrier personnel.**
  Léa, hôte d'une soirée isolée encore sans date, consulte son calendrier personnel. Elle clique « Créer un sondage » : une courte liste montre ses rendez-vous à dater, groupés par partie ; elle choisit sa soirée. Elle choisit le moment « soir », sélectionne cinq jours du même geste que pour ses dispos, ajoute un samedi après-midi avec Maj, et valide. **Edge case :** elle n'a sélectionné qu'un créneau ; la validation reste bloquée et lui dit pourquoi (deux créneaux minimum).

- **UJ-3. Marc vote depuis le lien, sans chercher.**
  Marc, membre de « La Bande », ouvre une conjonction et clique « Voter dans le calendrier ». Le calendrier du groupe s'ouvre directement en Destinée sur ce sondage : la colonne de droite liste les créneaux candidats avec leurs comptes de oui, le calendrier est centré sur le premier. Il parcourt les dates avec ‹ › ou en cliquant dans la colonne, répond à chacune. **Edge case :** l'hôte a fixé la date entre-temps ; le calendrier s'ouvre normalement, avec un message qui dit que le vote est clos.

- **UJ-4. Incon suit et conclut un vote parmi toutes ses parties.**
  Dans son calendrier personnel, Incon touche la puce ✦ : une liste groupée par partie montre chaque sondage ouvert (nom, échéance, « à faire » / « répondu » / « organisateur »), même ceux dont les dates tombent dans trois mois. Il choisit celui de sa campagne, dont l'échéance est passée ; le calendrier saute au bon mois, le plateau montre le meilleur créneau. Il clique « Fixer la date… » sans passer par la fiche de scénario. Plus tard, il filtre le calendrier sur « La Bande » seulement.

## 3. Glossary

*Reprend le Glossaire du PRD du Palier 10 (Partie, Groupe, Soirée isolée, Événement, Hôte, Membre, Sondage, Échéance du vote, Dispos, Annulation). Termes propres à ce palier, ou précisés :*

- **Conjonction** — libellé d'interface d'un **Événement** de groupe (PRD du Palier 10, §0). Ce PRD emploie « événement » ; « conjonction » n'apparaît que dans des libellés cités.
- **Rendez-vous** — une unité de jeu organisée, physiquement : en JDR, une **séance** d'un scénario ; en mode soirée, un **événement** d'un groupe ou une **soirée isolée**. Un sondage appartient toujours à un rendez-vous, et un rendez-vous a au plus un sondage ouvert.
- **Partie active** — partie ni close ni annulée, et, pour une soirée isolée, pas encore passée. `[ASSUMPTION]`
- **Organisateur du sondage** — la personne qui peut créer, modifier et conclure le sondage d'un rendez-vous : le **MJ** en mode JDR, l'**hôte** en mode soirée.
- **Rendez-vous à dater** — rendez-vous d'une partie active, sans date fixée et sans sondage ouvert, dont l'utilisateur est l'organisateur du sondage.
- **Vote** — synonyme d'interface de **Sondage** (« Ajouter au vote », « Voter »).
- **Sondage ouvert** — sondage dont la date n'est pas fixée, ni annulé ni supprimé, **que son échéance soit passée ou non**. Avant l'échéance, les votants peuvent répondre ; après, plus personne ne vote, mais l'organisateur peut encore fixer la date ou prolonger le vote.
- **Sondage clos** — sondage dont la date est fixée, ou qui a été annulé ou supprimé.
- **Créneau candidat** — une date proposée au vote d'un sondage (jour + moment de la journée : matin, après-midi, soir, ou journée entière en JDR).
- **Fenêtre de l'automate** — créneau où la troupe d'une partie de JDR est disponible, calculé par l'application à partir des dispos. N'existe qu'en calendrier de partie (JDR), pour le MJ.
- **Calendrier de partie** — calendrier d'une partie de JDR, vu par le MJ ou un joueur ; ne montre que cette partie.
- **Calendrier du groupe** — calendrier ouvert depuis un groupe ou une soirée isolée (`/parties/:id/guild-calendar`) ; ne montre que cette partie, et jamais les dispos des autres membres.
- **Calendrier personnel** — calendrier de l'utilisateur, toutes parties confondues.
- **Composer** — mode du calendrier où l'organisateur sélectionne les créneaux candidats d'un sondage, avant de valider.
- **Destinée** — mode d'affichage du calendrier qui met **un** sondage ouvert en avant (les jours sans créneau candidat s'estompent). Ce n'est pas un filtre ni une couche ; il ne se persiste pas.
- **Destinée active** — le sondage mis en avant par la Destinée.
- **Liste des destinées** — liste, ouverte par la puce ✦, des sondages ouverts que l'utilisateur peut mettre en avant, groupés par partie.
- **Plateau de la destinée** — la colonne de droite (tiroir sur mobile) quand la Destinée est active : la liste des créneaux candidats de la destinée active, avec leurs comptes de oui.
- **Masquage** — retrait, par le MJ, d'une fenêtre de l'automate de sa liste, sans effet sur les dispos ni sur les autres.

## 4. Features

### 4.1 Fenêtres de l'automate actionnables *(JDR, MJ)*

**Description :** Les fenêtres de l'automate deviennent la matière première d'un sondage. Le MJ en sélectionne une, la voit dans le calendrier, et l'ajoute au vote ou la masque. La liste se replie pour ne plus occuper toute la colonne. Réalise UJ-1. Le mode soirée n'a pas de fenêtres de l'automate : les dispos des membres d'un groupe ne sont pas lisibles par les autres (règle du Palier 10, inchangée).

**Functional Requirements :**

#### FR-1 : Sélectionner une fenêtre de l'automate

Le MJ peut sélectionner une fenêtre de l'automate dans la liste. Réalise UJ-1.

**Consequences (testable) :**
- La fenêtre sélectionnée est mise en évidence dans le calendrier ; tous les autres créneaux sont grisés.
- Le calendrier se déplace sur la période de la fenêtre si elle n'est pas affichée.
- Une seule fenêtre est sélectionnée à la fois ; la désélectionner rend au calendrier son affichage normal.
- La carte sélectionnée propose deux actions écrites : « Ajouter au vote » et « Masquer ».

#### FR-2 : Ajouter une fenêtre au vote

Le MJ peut ajouter la fenêtre sélectionnée au sondage d'un rendez-vous. Réalise UJ-1.

**Consequences (testable) :**
- « Ajouter au vote » passe toujours par le composer : le premier ajout l'ouvre, les suivants s'y accumulent ; rien n'est envoyé aux joueurs avant la validation. *Choisi plutôt qu'un ajout immédiat : on renonce à l'ajout en un clic pour qu'un sondage ouvert ne change qu'une fois, avec un seul avertissement.*
- Le composer vise la destinée active si c'est un sondage de cette partie ; sinon, le MJ choisit le rendez-vous : une séance qui a déjà un sondage ouvert (le composer s'ouvre prérempli de ses créneaux candidats) ou une séance à dater (le composer s'ouvre avec cette fenêtre pour premier créneau candidat).
- La validation crée le sondage du rendez-vous, ou le modifie en une seule fois, avec l'avertissement habituel si des réponses sont perdues.
- Une fenêtre **quitte la liste** de l'automate dès qu'elle est dans le composer, ou créneau candidat de n'importe quel sondage ouvert de la partie. Annuler le composer la rend à la liste ; retirée d'un sondage, elle y revient si l'automate la juge toujours libre.

#### FR-3 : Masquer une fenêtre

Le MJ peut masquer une fenêtre de l'automate. Réalise UJ-1.

**Consequences (testable) :**
- La fenêtre masquée disparaît de la liste du MJ ; rien ne change pour les joueurs ni pour les dispos.
- Le masquage survit au rechargement de la page et à une nouvelle connexion. `[ASSUMPTION]`
- Le MJ peut afficher les fenêtres masquées et en démasquer une.

#### FR-4 : Replier la liste de l'automate

Le MJ peut replier et redéplier la liste des fenêtres de l'automate. Réalise UJ-1.

**Consequences (testable) :**
- Sur ordinateur, la colonne de droite entière se range en dock collé au bord droit (flèche ›), et le calendrier reprend toute la largeur ; le dock affiche le libellé et le nombre de fenêtres, et se rouvre (flèche ‹). *Précisé en UX le 2026-10-20.*
- Sur téléphone, où la colonne est sous la grille, la liste se replie verticalement et n'affiche qu'un en-tête avec le nombre de fenêtres.
- Les champs Du / Au et l'action « Scruter » (période sur laquelle l'automate calcule) ne se montrent que liste dépliée.
- L'état replié / déplié est retenu pour ce MJ. `[ASSUMPTION]`

### 4.2 Créer un sondage depuis le calendrier

**Description :** L'organisateur sait qu'un de ses rendez-vous n'a pas de date. Où qu'il soit, le calendrier lui offre une entrée visible pour lui créer un sondage : il choisit le rendez-vous dans une courte liste, puis sélectionne des jours comme il déclare ses dispos. Un organisateur n'a jamais beaucoup de rendez-vous à dater en même temps : une liste suffit. Vaut pour le MJ et pour l'hôte. Réalise UJ-2.

**Functional Requirements :**

#### FR-5 : « Créer un sondage » et choix du rendez-vous

L'organisateur du sondage peut, depuis le calendrier, créer le sondage d'un de ses rendez-vous à dater. Réalise UJ-2.

**Consequences (testable) :**
- L'action « Créer un sondage » (libellé d'interface : « Proposer des dates », variantes par thème en UX ; « Modifier les dates » quand la destinée active est un sondage de l'organisateur) est un bouton écrit et atteignable au clavier, jamais une icône seule, présent dans le calendrier personnel, le calendrier de partie et le calendrier du groupe.
- Elle ouvre la liste des **rendez-vous à dater** de l'utilisateur, groupés par partie. En calendrier de partie ou du groupe, la liste est restreinte à cette partie ; s'il n'y en a qu'un, il est choisi d'office.
- Le bouton est **caché** quand l'utilisateur n'a aucun rendez-vous à dater : il n'est organisateur d'aucune partie active, ou tous ses rendez-vous ont déjà une date ou un sondage ouvert.
- Choisir un rendez-vous ouvre le composer (FR-6) pour ce rendez-vous ; le serveur reste juge du droit de créer.
- En mode soirée, l'aller-retour existant depuis la fenêtre de création d'un événement (Story 40.5b) est conservé.

**Out of Scope :**
- Créer un nouvel événement de groupe directement depuis le calendrier (voir §6.2).

#### FR-6 : Sélectionner des jours comme pour ses dispos

L'organisateur peut sélectionner les créneaux candidats avec le même geste que la déclaration de ses dispos. Réalise UJ-2.

**Consequences (testable) :**
- Le geste de sélection (taper, glisser sur plusieurs jours) est le même que celui des dispos ; le calendrier indique clairement qu'on compose un sondage, et pour quel rendez-vous.
- Comme pour les dispos, l'organisateur **sélectionne d'abord des jours**, puis choisit le moment (matin, après-midi, soir ; journée entière en JDR) : chaque jour sélectionné devient un créneau candidat à ce moment-là (« tous les vendredis soir de novembre »). *Amendé le 2026-10-20 (UX) : la version « moment d'abord » inversait le geste des dispos.*
- Chaque nouvelle sélection **s'ajoute** aux créneaux déjà choisis, ce qui permet de mêler les moments sans touche de modification, au doigt comme à la souris. Un tap court ajoute ou retire un seul créneau.
- Deux créneaux candidats minimum, sans plafond métier ; la journée entière reste refusée en mode soirée, avec la raison écrite (règle existante).
- Valider crée ou modifie le sondage du rendez-vous ; annuler ne change rien.

### 4.3 Destinée enrichie

**Description :** La Destinée devient le moyen de suivre et de conclure un vote. On choisit la destinée active dans une liste qui couvre toutes ses parties actives (A) ; une fois active, la colonne de droite devient le plateau de la destinée (B). Les flèches ‹ n/N › ne parcourent plus les votes mais les créneaux candidats du vote actif. L'organisateur peut créer, modifier et conclure son sondage sans quitter la Destinée. Décision « A + B » prise pendant l'UX du Palier 10. Réalise UJ-3, UJ-4.

**Functional Requirements :**

#### FR-7 : Choisir la destinée active dans une liste

L'utilisateur peut ouvrir la liste des destinées depuis la puce ✦ et y choisir la destinée active. Réalise UJ-4.

**Consequences (testable) :**
- La liste montre les **sondages ouverts** que l'utilisateur peut voir (règle d'accès existante), groupés par partie ; chaque ligne donne le nom du vote, son échéance (« échéance passée » le cas échéant) et l'état de l'utilisateur : « à faire », « répondu », « organisateur » ou « vous ne votez pas ».
- En calendrier personnel, elle couvre toutes les **parties actives** de l'utilisateur, quel que soit le mois affiché. En calendrier de partie ou du groupe, elle ne montre que cette partie.
- Choisir une ligne active la Destinée sur ce sondage et déplace le calendrier sur son premier créneau candidat.
- Sans sondage ouvert, la puce ✦ n'apparaît pas (comportement existant, Story 36.9 ; décidé en UX le 2026-10-20).

#### FR-8 : Plateau de la destinée

Quand la Destinée est active, la colonne de droite devient le plateau de la destinée. Réalise UJ-3, UJ-4.

**Consequences (testable) :**
- Le plateau liste les créneaux candidats de la destinée active, dans l'ordre chronologique, avec le nombre de oui de chacun.
- Cliquer un créneau candidat recentre le calendrier sur sa date.
- Les comptes se mettent à jour en direct quand un autre participant vote.
- Après l'échéance, le plateau reste consultable, sans vote possible ; il l'indique.
- Le plateau remplace le contenu habituel de la colonne tant que la Destinée est active ; le quitter rend la colonne habituelle.
- Sur mobile, le plateau s'ouvre en tiroir en bas de l'écran, replié (créneau courant) ou déplié (tous les créneaux) ; la grille reste visible tiroir replié.

#### FR-9 : Parcourir les dates du vote actif

Les flèches ‹ n/N › parcourent les créneaux candidats de la destinée active. Réalise UJ-3.

**Consequences (testable) :**
- n/N désigne le rang du créneau courant parmi les créneaux candidats du vote actif.
- Chaque flèche déplace le calendrier sur le créneau précédent ou suivant ; le créneau courant est marqué dans le plateau.
- Les flèches ne changent plus de vote : changer de vote passe par la liste des destinées (FR-7).

#### FR-10 : Créer et modifier le sondage depuis la Destinée

L'organisateur du sondage peut, depuis la Destinée, modifier les créneaux candidats de la destinée active ou créer un nouveau sondage.

**Consequences (testable) :**
- « Modifier » ouvre le composer prérempli avec les créneaux candidats du sondage ; à la validation, la Destinée reste active sur ce sondage.
- « Créer » suit le même chemin que FR-5 (choix d'un rendez-vous à dater, puis composer) ; le nouveau sondage devient la destinée active.
- Ces actions n'apparaissent pas pour qui n'est pas organisateur.

#### FR-11 : Fixer la date depuis la Destinée

L'organisateur du sondage peut fixer la date de la destinée active depuis le plateau de la destinée. Réalise UJ-4.

**Consequences (testable) :**
- Le plateau propose à l'organisateur « Fixer la date… », avant comme après l'échéance ; la confirmation liste les créneaux candidats, le meilleur en tête et présélectionné, avec leurs comptes.
- Confirmer produit exactement l'effet du chemin existant : en JDR, celui de « Sceller ce créneau » (séance confirmée, vote fermé) ; en mode soirée, celui de « Fixer la date… » d'un événement (Story 40.6 : date posée, vote fermé, e-mail « date fixée » aux inscrits).
- Là où le chemin existant le permet (mode soirée, Story 40.7), l'organisateur peut aussi prolonger le vote depuis le plateau.
- Une fois la date fixée, la Destinée se ferme sur un message (FR-12), et la date apparaît dans le calendrier.
- Les chemins existants (fiche de scénario, fenêtre de l'événement) restent en place.

#### FR-12 : Fin d'une destinée

La Destinée se termine proprement quand son sondage devient clos.

**Consequences (testable) :**
- Si la destinée active devient un sondage clos pendant la consultation (date fixée, annulé, supprimé), le mode se ferme avec un message qui dit pourquoi ; aucun autre sondage ne prend sa place sans action de l'utilisateur.
- L'échéance qui passe ne ferme **pas** la Destinée (FR-8).

### 4.4 Accès direct et filtre par partie

**Description :** On arrive sur un vote par un lien, et on peut restreindre le calendrier personnel à une partie. Réalise UJ-3, UJ-4.

**Functional Requirements :**

#### FR-13 : Ouvrir le calendrier en Destinée sur un sondage précis

Un lien peut ouvrir le calendrier directement en Destinée sur un sondage donné. Réalise UJ-3.

**Consequences (testable) :**
- Les adresses du calendrier personnel, du calendrier de partie et du calendrier du groupe acceptent un paramètre qui désigne le sondage ; l'ouvrir active la Destinée sur ce sondage et centre le calendrier sur son premier créneau candidat.
- Le lien est partageable et survit à un rechargement de la page.
- Sondage clos ou inexistant : le calendrier s'ouvre normalement, avec un message écrit.
- Utilisateur qui n'a pas accès à la partie : refus habituel, aucune information sur le sondage.

#### FR-14 : Brancher les liens de vote existants

Les accès au vote existants conduisent au sondage, en Destinée. Réalise UJ-3.

**Consequences (testable) :**
- **Partout**, un lien qui mène au calendrier pour voter y arrive en Destinée sur le bon sondage.
- « Voter dans le calendrier » d'un événement ouvre le calendrier du groupe en Destinée sur son sondage (lève la gêne acceptée au Palier 10, FR-11 du Palier 10).
- Le bouton « Voter dans le calendrier » de l'e-mail de relance avant l'échéance (Story 40.7) fait de même. C'est aujourd'hui le seul e-mail qui porte un lien de vote.
- Page d'une partie, côté joueur : le bouton « vote en attente » ouvre le calendrier en Destinée sur ce sondage ; si la partie a plusieurs sondages ouverts, il ouvre la liste des destinées restreinte à cette partie.
- Fiche de scénario, côté MJ : « Lancer le vote » d'une séance ouvre le composer pour cette séance (chemin de FR-5, rendez-vous déjà choisi).

**Out of Scope :**
- Le vote lui-même dans la fiche de scénario (liste des créneaux, réponse, « Sceller ce créneau ») ne change pas. Le remplacer par un résumé et un bouton vers le calendrier, comme pour un événement, relève du **Palier 10.8** (« vote en résumé plutôt qu'en liste »).
- Pas de nouvel e-mail (par exemple à l'ouverture d'un vote de JDR).

#### FR-15 : Filtrer le calendrier personnel par partie

Dans son calendrier personnel, l'utilisateur peut restreindre l'affichage à une ou plusieurs parties. Réalise UJ-4.

**Consequences (testable) :**
- Le panneau « Affichage » propose, en plus des natures existantes, la liste des parties actives de l'utilisateur (JDR et soirée), cochables, sous un libellé neutre en mode soirée.
- Le filtre s'applique à toutes les natures affichées (séances, votes, …) ; les dispos de l'utilisateur, qui ne dépendent d'aucune partie, restent visibles. `[ASSUMPTION]`
- Le filtre n'est pas enregistré dans le compte : il est perdu au rechargement de la page ou en quittant le calendrier. `[ASSUMPTION]` *On renonce à le retrouver d'une visite à l'autre pour ne pas ajouter de préférence de compte.*
- Un filtre actif se voit dans la pastille de résumé du panneau.

**Out of Scope :**
- Le calendrier de partie et le calendrier du groupe, qui ne montrent déjà que leur partie (§3 ; Story 36.1 AC7).

### 4.5 Vocabulaire

#### FR-16 : Un mot, un sens

Le mot « destinée » ne désigne plus qu'une chose dans l'interface : le mode Destinée.

**Consequences (testable) :**
- Les fenêtres de l'automate reçoivent un autre libellé : « Éphémérides » en Grimoire Émeraude (provisoire), « Clairières disponibles » en Forêt Ancienne (inchangé), « Créneaux calculés par l'automate » en Atelier Cuivré.
- Les nouveaux libellés de ce palier existent dans les trois thèmes, et respectent les règles du mode soirée : aucun mot du JDR, et le mot « partie » n'y apparaît pas (liste des destinées, liste des rendez-vous à dater, filtre).

### 4.6 Écrans validés modifiés ⚠️

Ce palier modifie des contrats UI validés ; chaque écart doit être porté dans la planche UX du palier :

- Calendrier de partie, colonne MJ (Épic 36) : liste de l'automate repliable et actionnable ; libellé renommé.
- Calendriers personnel, de partie et du groupe : bouton « Créer un sondage » et liste des rendez-vous à dater.
- Mode Destinée (Story 36.9) : liste des destinées, plateau, sens des flèches ‹ n/N ›, fixation de la date.
- Panneau « Affichage » du calendrier personnel (Épic 36) : filtre par partie.
- Calendrier du groupe (Story 40.5b) : ouverture en Destinée.
- Fenêtre d'un événement (Palier 10) : le lien « Voter dans le calendrier » change de destination, pas de libellé.
- Page d'une partie de JDR et fiche de scénario : les boutons qui mènent au calendrier changent de destination (FR-14), pas de forme.
- E-mail de relance du vote : destination du lien.
- Formulaire de création (Palier 10) : bascule de mode et choix de la nature expliqués (FR-17).

### 4.7 Exigences transverses

- **JDR non régressé hors périmètre** : seuls les écrans de §4.6 changent, et seulement comme il y est dit ; scellement d'un créneau, inscriptions et contenu de la fiche de scénario sont inchangés.
- **Confidentialité des dispos** : aucune nouvelle donnée de dispo d'un autre membre n'est exposée en mode soirée ; les fenêtres de l'automate restent réservées au MJ d'une partie de JDR.
- **Temps réel** : les comptes du plateau, la liste des destinées, la liste des rendez-vous à dater et la liste de l'automate suivent les changements des autres en direct (canal existant).
- **Mobile** : chaque fonction est utilisable au doigt sur un téléphone ; aucune n'exige un appui long pour être trouvée.
- **Accessibilité** : actions écrites et atteignables au clavier ; l'estompe de la Destinée ne porte jamais seule une information.

### 4.8 Formulaire de création *(ajouté le 2026-10-20)*

**Description :** Les noms de thème (Quête, Sentier, Ralliement, La halte au gué…) donnent leur couleur à l'application mais ne disent pas ce qu'ils désignent. Demandé par l'utilisateur pendant l'UX du 10.4 : les garder, et ajouter une explication en clair.

#### FR-17 : Mode et nature expliqués

À la création d'une partie, l'utilisateur comprend, sans connaître le vocabulaire du thème, ce que désigne chaque mode et chaque nature.

**Consequences (testable) :**
- Chaque option de la bascule de mode affiche, sous son nom de thème, une ligne en clair : « Jeu de rôle » ou « Soirée entre amis ».
- Chaque nature (trois en JDR, deux en mode soirée) affiche une ligne d'explication en clair (textes : UX `EXPERIENCE.md` §2.7).
- Ces lignes sont identiques dans les trois thèmes ; celles du mode soirée n'emploient aucun mot du JDR.

## 5. Non-Goals (Explicit)

- Pas de découvrabilité générale de la déclaration des dispos (Palier 10.6) ; ce palier ne rend découvrable que la création d'un sondage.
- Pas de dispos de groupe visibles en mode soirée, ni de fenêtres de l'automate pour un groupe.
- Pas de sondage détaché d'un rendez-vous.
- Pas de jeu d'icônes (10.7), pas de report des acquis UX côté JDR (10.8) : en particulier, le vote de la fiche de scénario garde sa forme actuelle.
- Pas de nouveau type de vote (vote sur autre chose qu'une date, vote à classement).

## 6. MVP Scope

### 6.1 In Scope

- Fenêtres de l'automate sélectionnables, ajoutables au vote, masquables, liste repliable (FR-1 à FR-4).
- Bouton « Créer un sondage » dans les trois calendriers, choix du rendez-vous à dater, sélection de jours (FR-5, FR-6).
- Destinée enrichie A + B : liste, plateau, flèches, création / modification, fixation de la date, fin propre (FR-7 à FR-12).
- Ouverture directe en Destinée, liens de vote branchés, filtre du calendrier personnel par partie (FR-13 à FR-15).
- Un seul sens pour « destinée » (FR-16).
- Mode et nature expliqués dans le formulaire de création (FR-17).

### 6.2 Out of Scope for MVP

- **Créer un nouvel événement de groupe directement depuis le calendrier** (« Créer un sondage » qui ouvrirait la fenêtre de création d'un événement). `[NOTE FOR PM]` L'utilisateur veut du recul : à réévaluer après la mise en production, sur l'application réelle et les retours de la bande. Noté dans `docs/backlog.md`, « Idées / plus tard ».
- Le reste : voir §5. Rien de ce qui est listé dans le backlog du 10.4 n'est différé.

## 7. Success Metrics

- **SM-1** : un membre de la bande qui n'a jamais vu la fonction crée un sondage pour son rendez-vous, sans aide, en moins d'une minute. Valide FR-5, FR-6.
- **SM-2** : un membre qui clique « Voter » répond sans avoir à chercher le vote dans le calendrier. Valide FR-13, FR-14.
- **SM-3** : Incon suit un vote jusqu'à sa date fixée depuis la Destinée, sans passer par la fiche de scénario ni par la fenêtre de l'événement. Valide FR-7 à FR-11.
- **SM-C1** (à ne pas optimiser) : le nombre de fonctions visibles dans la colonne de droite. Ajouter des actions ne doit pas refaire une colonne de 3 000 pixels ; contrebalance SM-1 et SM-3.

## 8. Open Questions

*Les questions renvoyées à l'UX ont été tranchées le 2026-10-20 : plus de touche Maj (FR-6), libellés choisis (FR-16), aucun mot générique pour « partie » (chaque liste affiche le nom propre de la partie ou du ralliement). Reste :*

1. **Stockage du masquage et de l'état replié** (FR-3, FR-4) : sur le serveur (suit le MJ sur ses appareils) ou dans le navigateur — architecture.

## 9. Assumptions Index

- §3 — « Partie active » = ni close ni annulée ; une soirée isolée passée en sort.
- FR-3 — le masquage d'une fenêtre survit au rechargement et à une nouvelle connexion.
- FR-4 — l'état replié de la liste est retenu pour le MJ.
- FR-15 — les dispos restent visibles sous filtre ; le filtre n'est pas enregistré.
