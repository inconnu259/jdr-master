---
title: "PRD — Évolution du personnage, historique & édition MJ"
status: final
created: 2026-07-07
updated: 2026-07-08
---

# PRD — Évolution du personnage, historique & édition MJ (Palier 3)

## 0. Document Purpose

Ce PRD couvre le Palier 3 (`docs/backlog.md`) — la partie encore non livrée : évolution du personnage par XP, historique de fiche, inventaire/encombrement, notes personnelles, et édition MJ sans contrainte. L'export PDF (également listé au Palier 3) est déjà livré (Épic 4) et hors scope ici. Le PRD s'appuie sur l'architecture plugin existante (`packages/game-rules/src/ryuutama`, `GameSystemService`, `CharacterService`) sans la redéfinir — voir le Glossaire. Les règles de jeu Ryuutama citées ici (tables XP, capacités) sont du contenu spécifique au système, au même titre que les classes/types/armes du Palier 2 : les choix d'implémentation (schéma de seed, nouvelle table vs `ContentType` existant) sont hors PRD, à trancher en architecture.

## 1. Vision

Depuis le Palier 2, un joueur crée un personnage Ryuutama complet et le consulte — mais la fiche est figée : elle ne bouge plus après la création, alors même que jouer une partie devrait la faire évoluer. Ce palier rend la fiche vivante : le MJ récompense les joueurs en XP après une session jouée, les personnages montent de niveau et débloquent des capacités selon les vraies règles de Ryuutama, l'inventaire se remplit et pèse sur l'encombrement, un espace de notes personnelles accompagne le joueur au fil de la campagne — et le MJ retrouve la main pour corriger une fiche sans contourner l'application, avec une traçabilité de ce qui a changé et pourquoi.

## 2. Target User

### 2.1 Jobs To Be Done

- En tant que MJ, je veux distribuer les XP de fin de session sans recalculer les tables Ryuutama de tête à chaque fois.
- En tant que MJ, je veux pouvoir corriger ou compléter la fiche d'un joueur sans être bloqué par les règles de validation strictes de la création.
- En tant que joueur, je veux que ma fiche reflète ma progression (niveau, capacités, PV/PE, encombrement) sans calcul manuel de ma part.
- En tant que joueur, je veux un espace pour noter des choses qui ne rentrent dans aucun champ de la fiche (indices, objectifs, rappels perso).
- En tant que joueur ou MJ, je veux pouvoir consulter ce qui a changé sur une fiche au fil du temps.

### 2.2 Non-Users (v1)

- Personne en dehors du petit groupe d'amis actuel — pas de scénario multi-tables/multi-MJ à grande échelle (cf. Non-Goals).

### 2.3 Key User Journeys

*Périmètre hobby — UJ formulées en une phrase (JTBD reformulé), pas de flow détaillé.*

- **UJ-1.** Après une séance jouée, le MJ ouvre "Distribuer des XP" depuis la page de la Partie, renseigne la difficulté max rencontrée, le nombre d'utilisations du souffle de l'homme-dragon et le niveau du monstre le plus fort vaincu ; le système calcule le total et le propose à tous les joueurs actifs de la Partie, ajustable individuellement avant confirmation.
- **UJ-2.** Un joueur dont le personnage vient de franchir un seuil de niveau est guidé à travers ses choix (répartition PV/PE, capacité débloquée) ; sa fiche se met à jour et un instantané est ajouté à l'historique.
- **UJ-3.** Le MJ, en relisant la fiche d'un joueur, corrige une information saisie de travers à la création (ex. mauvaise catégorie d'arme) directement depuis la fiche, sans repasser par l'assistant de création — l'édition est tracée comme "modifiée par le MJ".
- **UJ-4.** Un joueur ajoute à son inventaire un objet ramassé en jeu avec son poids, et voit son encombrement total se rapprocher de sa limite.

## 3. Glossaire

- **Personnage** — Modèle existant (`Character`) : `gameSystemId` + `sheetData` (JSON) + `derived` calculé, possédé par un `User`, rattaché à une `Partie`.
- **XP (points d'expérience)** — Compteur cumulatif sur le personnage, jamais dépensé, jamais remis à zéro. Détermine le **Niveau** par seuil (table §4.2).
- **Niveau** — Entier de 1 à 10, dérivé de l'XP cumulé du personnage (pas stocké indépendamment, ou stocké en cache mais toujours recalculable depuis l'XP — cf. FR-6).
- **Capacité** — Effet ou choix débloqué à un niveau donné (Attribut, Classe, Immunité, Paysage/Climat favori, Protection d'un dragon, Type, Voyage légendaire — cf. §4.2 et `addendum.md` pour le détail de chaque type).
- **Distribution d'XP** — Action ponctuelle du MJ qui attribue des XP à tout ou partie des joueurs actifs d'une Partie. Ne dépend d'aucune entité "Séance" formelle (qui n'existe pas encore — prévue Palier 4) : c'est une action autonome déclenchée à la demande.
- **Encombrement** — Limite de poids transportable par le personnage. Aujourd'hui calculée `VIG + 3` (`computeDerived`) ; ce palier y ajoute un bonus permanent (+1 par niveau gagné, cf. §4.2) et un poids total d'inventaire à comparer à cette limite.
- **Instantané (snapshot)** — Copie en lecture seule de l'état de la fiche (`sheetData`, `derived`, niveau) à un instant donné, conservée dans l'**Historique**.
- **Historique** — Liste chronologique et en lecture seule des instantanés d'un personnage.
- **Édition MJ** — Modification par le MJ d'un champ quelconque de `sheetData` d'un personnage de sa Partie, sans passer par `validate('strict', ...)`. Aujourd'hui un no-op documenté dans `validate.ts` (`mode === 'mj'` retourne toujours valide sans rien débloquer côté API) — ce palier active réellement ce chemin.
- **Notes personnelles** — Journal chronologique d'entrées de texte libre sur la fiche, créées par le propriétaire du personnage, visibles par le MJ de la Partie, et partageables individuellement avec le reste du groupe (amendé pendant la Discovery UX, cf. FR-11).
- **`equipment.individual` / `equipment.group`** — Sous-champs existants de `sheetData.equipment` (capturés à la création, cf. Palier 2) : `individual` est la liste d'objets propres au personnage (texte libre aujourd'hui, gagne un poids par objet avec ce palier, cf. FR-9) ; `group` est la liste d'objets partagés par le groupe, non concernée par le suivi de poids en v1.

## 4. Features

### 4.1 Distribution d'XP par le MJ

**Description :** Le MJ déclenche cette action à tout moment depuis la page d'une Partie — pas de dépendance à une entité Séance (qui n'existe pas encore, cf. Glossaire). Réalise UJ-1.

#### FR-1 : Ouvrir un formulaire de distribution d'XP

Le MJ d'une Partie peut ouvrir un formulaire de distribution d'XP depuis la page de la Partie.

**Conséquences (testables) :**
- Le formulaire est accessible uniquement au MJ de la Partie (403 pour tout autre rôle).
- Le formulaire liste tous les joueurs ayant un personnage actif rattaché à cette Partie, chacun avec un montant d'XP proposé (voir FR-2), modifiable individuellement avant confirmation.

#### FR-2 : Calcul assisté du montant d'XP

Le système calcule un montant d'XP suggéré à partir de trois entrées saisies par le MJ, selon les règles Ryuutama :

1. **Difficulté max du voyage** (paysage + climat le plus dur rencontré) :

   | Difficulté max | XP |
   |---|---|
   | 5–7 | 100 |
   | 8–10 | 200 |
   | 11–14 | 300 |
   | 15+ | 500 |

2. **+50 XP** par utilisation du souffle de l'homme-dragon.
3. **+10 × niveau** du monstre le plus élevé parmi ceux vaincus par les personnages.

**Conséquences (testables) :**
- Le montant suggéré = somme des trois composantes, appliqué par défaut à tous les joueurs listés en FR-1.
- Le MJ peut ajuster le montant total ou par joueur avant de confirmer (le calcul n'est qu'une aide, jamais bloquant).

#### FR-3 : Bonus individuel

Le MJ peut ajouter un bonus d'XP à un ou plusieurs joueurs spécifiques, en plus du montant commun, pour récompenser une action individuelle.

**Conséquences (testables) :**
- Le bonus individuel s'ajoute au montant commun de FR-2 pour ce joueur uniquement ; les autres joueurs ne sont pas affectés.

#### FR-4 : Notes de distribution

Le MJ peut associer une note libre (texte) à une distribution d'XP — par exemple pour expliquer le calcul ou résumer la session.

**Conséquences (testables) :**
- La note est conservée avec l'instantané créé pour chaque personnage concerné par cette distribution (cf. §4.5) et consultable depuis l'historique.
- La note est optionnelle — une distribution sans note est valide.

**Hors scope :** verrouiller la distribution à une "séance" formelle ou à un sous-ensemble de participants tracé côté serveur (pas d'entité Séance en Palier 3, cf. Glossaire) ; le MJ décoche simplement les joueurs à exclure dans le formulaire pour cette distribution.

### 4.2 Montée de niveau & capacités

**Description :** L'XP d'un personnage ne se dépense jamais et n'est jamais remis à zéro — le niveau est simplement dérivé du total cumulé via la table de seuils ci-dessous. Réalise UJ-2.

Contrairement à ce que suggère le nom `canSpendXp`/`applyXp` de l'interface `GameSystemPlugin` (`docs/spec.md` §5, pensée de façon générique avant que Ryuutama ne devienne le système v1), les règles Ryuutama ne prévoient aucune dépense d'XP avec un solde qui diminue : `applyXp` est appelé à chaque franchissement de seuil et applique les gains de ce niveau (§4.2 ci-dessous), `canSpendXp` retourne vrai dès que l'XP cumulé dépasse le seuil suivant. Les noms de l'interface restent ceux de `spec.md` ; leur sémantique pour Ryuutama est "franchir un seuil", pas "dépenser un solde".

| Niveau | XP requis (cumulé) | Capacité(s) débloquée(s) |
|---|---|---|
| 2 | 100 | Attribut |
| 3 | 600 | Paysage ou climat favori |
| 4 | 1200 | Attribut, Immunité |
| 5 | 2000 | Classe |
| 6 | 3000 | Attribut, Type |
| 7 | 4200 | Paysage ou climat favori |
| 8 | 5800 | Attribut |
| 9 | 7500 | Protection d'un dragon |
| 10 | 10000 | Attribut, Voyage légendaire |

Le détail mécanique de chaque type de capacité (Attribut, Classe, Immunité, Paysage/Climat, Protection d'un dragon, Type, Voyage légendaire) est décrit dans `addendum.md`.

#### FR-5 : Détection de montée de niveau

Le système détecte qu'un personnage a franchi un ou plusieurs seuils de niveau dès qu'une distribution d'XP porte son total cumulé au-delà du seuil suivant.

**Conséquences (testables) :**
- La détection se fait à la volée à partir de l'XP cumulé — le niveau n'est jamais une donnée saisie manuellement par un joueur.
- Si une distribution fait franchir plusieurs seuils d'un coup (ex. gain de 700 XP faisant passer un personnage de niveau 1 à niveau 3), le système applique les montées de niveau **séquentiellement** (niveau 2 puis niveau 3), chacune avec ses propres gains (points PV/PE, encombrement, capacité) — cf. FR-6, FR-7, FR-8.

#### FR-6 : Assistant de montée de niveau (côté joueur)

Quand son personnage a franchi un seuil, le propriétaire du personnage est guidé pour appliquer les gains associés à ce niveau.

**Conséquences (testables) :**
- Le joueur voit un état "à traiter" tant qu'un niveau franchi n'a pas été appliqué (les choix ne sont jamais automatiques quand ils impliquent une décision du joueur — répartition PV/PE, choix de capacité).
- Une fois les choix validés pour un niveau, la fiche est mise à jour et un instantané est créé (§4.5) avant de proposer, si applicable, le niveau suivant déjà franchi.

#### FR-7 : Répartition des points PV/PE

À chaque niveau gagné, le joueur répartit 3 points entre son maximum de PV et son maximum de PE (librement, y compris tout sur un seul des deux).

**Conséquences (testables) :**
- `derived.PV`/`derived.PE` (aujourd'hui `VIG × 2` / `ESP × 2`, cf. `computeDerived`) intègrent un bonus cumulé issu des répartitions passées, en plus du calcul de base.
- La somme des points répartis à un niveau donné est exactement 3, ni plus ni moins.

#### FR-8 : Encombrement et capacité par niveau

À chaque niveau gagné, la limite d'encombrement du personnage augmente de 1, et la capacité correspondante (table ci-dessus) est appliquée ou proposée au choix du joueur si elle nécessite une décision (Attribut : quel attribut ; Classe : nouvelle classe ou renforcement d'une classe existante ; Immunité : quel état ; Paysage/Climat : lequel parmi les 22 ; Type : quel type).

**Conséquences (testables) :**
- `derived.Encombrement` (aujourd'hui `VIG + 3`) intègre +1 par niveau gagné, en plus du calcul de base.
- Pour la capacité **Attribut**, le joueur choisit parmi AGI/ESP/INT/VIG et l'attribut choisi augmente de 2 ; un attribut déjà à 12 (maximum autorisé) ne peut pas être choisi à nouveau tant qu'il reste un autre attribut disponible. Si les 4 attributs sont à 12 (cas extrême, non atteignable en usage normal avant le niveau max 10), le système plafonne silencieusement — aucun traitement spécial requis ; le MJ garde de toute façon la main via l'édition libre (FR-14) s'il veut aller au-delà.
- Les capacités choisies (avec leurs paramètres : quel attribut, quelle classe, quel état, etc.) sont enregistrées sur la fiche et affichées, avec leur description, dans la fiche du personnage — au même titre que `equipment`/`narrative` aujourd'hui.

**Notes :**
- [DÉCISION] "Paysage ou climat favori" est débloqué deux fois dans la table (niveaux 3 et 7). Confirmé par l'utilisateur : pas de cumul, le joueur choisit un paysage/climat différent de celui déjà obtenu à chaque déblocage. C'est précisément ce champ qui vient combler les cases "climat" du PDF Ryuutama restées inutilisées jusqu'ici.
- [DÉCISION] Les effets de jeu qui s'appliquent "à la table" (bonus de +1/+2 à un test, immunité à un état, protection d'un dragon, cumul de talents de classe secondaire) sont **affichés sur la fiche comme référence pour le joueur et le MJ** (pense-bête), et ne sont pas recalculés/appliqués automatiquement par un moteur de résolution de tests. Confirmé par l'utilisateur : à ce stade, l'application se positionne comme un outil d'aide/mémoire/organisation de partie, pas comme un moteur de jeu (pas de jets de dés, pas de résolution de règles). Seuls les effets purement numériques sur la fiche (attribut, PV/PE, encombrement) sont calculés par le système.
- [OUVERT] "Classe" et "Type" en tant que capacités répétées (niveaux 5 et 6+, cf. §8 Open Question 2) : le format de stockage exact (champ dédié "classe/type secondaire", à l'image de `classId`/`typeId` de création, vs. liste générique de capacités débloquées avec paramètres) n'est pas tranché — l'utilisateur préfère décider en fonction de l'UI, à traiter en phase UX/architecture.
- [NOTE FOR PM] "Voyage légendaire" (niveau 10) débloque un contenu scénaristique spécifique au bouquin de règles, hors scope applicatif — le système se contente d'enregistrer que le personnage a débloqué cette capacité.

### 4.3 Inventaire & encombrement

**Description :** L'inventaire capturé à la création (`equipment.individual`/`equipment.group`, texte libre sans poids) devient éditable après création, avec un poids par objet comparé à la limite d'encombrement du personnage.

#### FR-9 : Éditer l'inventaire

Le propriétaire du personnage peut ajouter, modifier et retirer des objets de son inventaire individuel, chacun avec un nom et un poids.

**Conséquences (testables) :**
- Les objets d'équipement de groupe (`equipment.group`) restent en l'état actuel (texte libre, sans poids individuel) — seul l'inventaire individuel gagne le suivi de poids en v1.
- Un objet sans poids saisi est traité comme poids 0 (ne bloque pas l'ajout).

#### FR-10 : Suivi de l'encombrement

Le système affiche le poids total de l'inventaire individuel en regard de la limite d'encombrement du personnage (`derived.Encombrement`, cf. FR-8), et signale visuellement un dépassement.

**Conséquences (testables) :**
- Le dépassement de la limite n'est jamais bloquant (les règles Ryuutama en font une pénalité de jeu, pas une interdiction) — juste un signal visuel sur la fiche.

### 4.4 Notes personnelles

**Description :** Un journal chronologique d'entrées de texte libre sur la fiche, distinct du champ `narrative` existant (informations de personnage figées à la création). *(Amendé pendant la Discovery UX du 2026-07-08, cf. `ux-designs/ux-jdr-master-20260708/EXPERIENCE.md` §4 "Notes" — forme initialement prévue comme un champ texte unique, remplacée par un journal d'entrées pour résoudre un besoin réel de chronologie sans dépendre de l'entité Séance différée.)*

#### FR-11 : Tenir un journal de notes personnelles

Le propriétaire du personnage peut créer des entrées de notes datées en texte libre sur sa fiche, à tout moment, formant un journal chronologique (la plus récente en premier).

**Conséquences (testables) :**
- Chaque entrée est horodatée à la création ; pas d'édition rétroactive de la date.
- Le MJ de la Partie voit toutes les entrées du journal (lecture seule pour le MJ, cohérent avec le reste de la fiche en mode consultation MJ) — mais ne peut pas les éditer via ce mécanisme (cf. FR-14 pour l'édition MJ générale).
- Le propriétaire du personnage peut marquer individuellement chaque entrée comme "partagée avec le groupe" ; une entrée partagée devient visible par tous les participants de la Partie (pas seulement le MJ). Statut par défaut d'une nouvelle entrée : privée (visible MJ + auteur uniquement).
- Le statut de partage est un réglage **par entrée** — marquer une entrée comme partagée n'affecte pas la visibilité des autres entrées du même journal.

**Hors scope :** rattacher une entrée à une séance/session formelle (l'entité n'existe pas en Palier 3, cf. Glossaire) — la chronologie par date suffit à cet usage ; édition ou suppression d'une entrée existante après création (v1 : append-only, cohérent avec l'esprit journal).

### 4.5 Historique de fiche

**Description :** Chaque changement significatif de la fiche (montée de niveau appliquée, édition MJ) crée un instantané en lecture seule, consultable en journal chronologique. Pas de fonctionnalité de retour en arrière (revert) en v1.

#### FR-12 : Créer un instantané

Le système crée un instantané de la fiche (`sheetData`, `derived`, niveau, et le cas échéant la note de distribution d'XP associée) à chaque montée de niveau appliquée (FR-6) et à chaque édition MJ confirmée (FR-14).

**Conséquences (testables) :**
- Un instantané est immuable une fois créé (aucune API d'édition ou de suppression d'un instantané existant).
- L'édition de l'inventaire (FR-9) ou des notes personnelles (FR-11) ne crée pas d'instantané — seuls les deux déclencheurs ci-dessus le font (v1 : garder l'historique lisible, pas un journal de chaque frappe clavier).

#### FR-13 : Consulter l'historique

Le propriétaire du personnage et le MJ de la Partie peuvent consulter la liste chronologique des instantanés d'un personnage.

**Conséquences (testables) :**
- Chaque entrée affiche au minimum : date, déclencheur (montée de niveau vers quel niveau / édition MJ), et la note associée si présente (cf. FR-4).
- Aucune action de restauration ("revert") n'est proposée en v1 (cf. Non-Goals).

### 4.6 Édition MJ sans contrainte

**Description :** Aujourd'hui, `validate(data, 'mj', catalog)` est un no-op documenté qui ne débloque rien côté API (aucun endpoint d'édition de `sheetData` n'existe même pour le MJ, cf. Glossaire) — le MJ est strictement lecture seule. Cette feature active réellement ce chemin. Réalise UJ-3.

#### FR-14 : Éditer n'importe quel champ de la fiche

Le MJ d'une Partie peut modifier n'importe quel champ de `sheetData` d'un personnage rattaché à sa Partie (classe, type, attributs, XP, inventaire, équipement, notes narratives, etc.), sans passer par les règles de validation strictes de la création (`validate('strict', ...)`).

**Conséquences (testables) :**
- Seul le MJ de la Partie à laquelle le personnage est rattaché peut effectuer cette édition (403 pour tout autre rôle, y compris un autre MJ).
- L'édition passe par `validate(data, 'mj', catalog)`, qui reste permissive (elle ne doit pas rejeter une valeur simplement parce qu'elle ne fait pas partie du catalogue seedé — c'est justement le point : le MJ peut sortir des clous) mais peut signaler des avertissements non bloquants (ex. valeur hors catalogue seedé) affichés au MJ avant confirmation, conformément à `docs/spec.md` §5 ("indicative pour le MJ — avertissements, jamais de blocage").
- Chaque édition MJ confirmée déclenche la création d'un instantané (FR-12) marqué explicitement comme "modifié par le MJ", visible dans l'historique.
- Si le MJ modifie directement le champ XP, le système applique la même détection de montée de niveau qu'une distribution normale (FR-5) et propose au joueur le flux guidé habituel (FR-6, répartition PV/PE, choix de capacité) — l'édition MJ ne permet pas de sauter silencieusement un niveau sans passer par les choix du joueur, cohérent avec la contre-métrique de §7 (pas de perte d'information silencieuse).
- Pour les autres champs (capacités déjà acquises, PV/PE, encombrement, etc.), l'édition MJ est en revanche pleinement libre et n'est pas contrainte par le flux guidé de FR-5/FR-6 — c'est le sens même de "sans contrainte" pour ces champs.

**Hors scope :** interface de diff visuel avant/après l'édition MJ (l'instantané suffit pour la traçabilité en v1) ; validation partielle par champ (le MJ édite le `sheetData` dans son ensemble, pas champ par champ avec des règles différenciées).

## 5. Non-Goals (Explicit)

- Pas d'entité "Séance" formelle avec participants (prévue Palier 4) — la distribution d'XP est une action autonome à la demande du MJ, pas rattachée à un objet Séance.
- Pas de moteur de résolution de tests/jets de dés dans l'application — les bonus de capacité qui s'appliquent "à la table" (immunités, bonus de test, protection d'un dragon) sont affichés comme référence, pas simulés.
- Pas de restauration (revert) depuis l'historique en v1 — consultation en lecture seule uniquement.
- Pas de poids/encombrement sur l'équipement de groupe (`equipment.group`) en v1 — seul l'inventaire individuel est concerné.
- Pas de contenu scénaristique pour "Voyage légendaire" — seul le déblocage de la capacité est enregistré.
- Pas de remodélisation complète du mécanisme de cumul de talents de classe/type secondaire — capturé comme texte descriptif sur la fiche.

## 6. MVP Scope

### 6.1 In Scope
- Formulaire de distribution d'XP par le MJ (calcul assisté + ajustement manuel + bonus individuels + note).
- Montée de niveau automatique par seuils d'XP cumulé, avec application séquentielle en cas de saut de plusieurs niveaux.
- Répartition de 3 points PV/PE et +1 encombrement par niveau.
- Capacités de niveau (table §4.2), enregistrées et affichées sur la fiche.
- Inventaire individuel avec poids, comparé à la limite d'encombrement.
- Journal de notes personnelles (entrées datées), visibles par le MJ, partageables individuellement avec le groupe.
- Historique en lecture seule (instantanés à chaque montée de niveau et édition MJ).
- Édition MJ sans contrainte de tous les champs `sheetData`, avec traçabilité dans l'historique.

### 6.2 Out of Scope pour MVP
- Entité Séance/participants — Palier 4. [NOTE FOR PM]
- Revert depuis l'historique — à revoir si le besoin se fait sentir en usage réel. [NOTE FOR PM]
- Moteur de résolution de tests/dés appliquant automatiquement les bonus de capacité — hors scope produit pour l'instant, pas seulement ce palier.
- Poids sur l'équipement de groupe.
- Mécanique complète de cumul de talents pour classe/type secondaire — texte descriptif seulement.

## 7. Success Metrics

*Périmètre hobby — un critère de succès simple suffit.*

- **Succès** : le MJ distribue les XP d'une séance en moins d'une minute sans ressortir sa feuille de calcul ; un joueur qui franchit un seuil de niveau comprend ce qu'il gagne et fait ses choix sans relire le bouquin de règles à côté de l'app ; le MJ corrige une fiche erronée directement dans l'app plutôt qu'en base de données à la main.
- **Contre-métrique** : une distribution d'XP ou une édition MJ ne doit jamais faire disparaître silencieusement une information — l'historique doit toujours permettre de retrouver "qui a changé quoi et pourquoi" après coup.

## 8. Open Questions

1. ~~Comportement pour un attribut à 12 sans choix disponible~~ — **Résolu** : cas extrême non atteignable avant le niveau max (10) en usage normal ; si jamais atteint, le système plafonne silencieusement, et le MJ garde la main via l'édition libre (FR-14) s'il veut aller au-delà.
2. Le format exact de stockage des capacités "Classe"/"Type" secondaires (champ dédié type `classId`/`typeId` de création vs. liste générique de capacités débloquées avec paramètres) reste ouvert — l'utilisateur veut trancher en fonction de l'UI ; à traiter en phase UX/architecture (`bmad-ux`/`bmad-architecture`).

## 9. Assumptions Index

- §4.2 — Les effets "à la table" des capacités (bonus de test, immunités, protection d'un dragon) sont affichés comme référence/pense-bête, non simulés par un moteur de règles : **confirmé** — l'app est positionnée comme outil d'aide/mémoire/organisation de partie, pas comme moteur de jeu.
- §4.2 — Format de stockage Classe/Type secondaires : **reste ouvert**, cf. §8 Open Question 2.
- §4.2 — "Paysage ou climat favori" (débloqué aux niveaux 3 et 7) : pas de cumul, le joueur choisit un paysage/climat différent à chaque fois : **confirmé**.
- §4.2 — "Voyage légendaire" : seul le déblocage est enregistré, pas de contenu scénaristique livré : **note pour le PM, pas une vraie question ouverte**.
- §6.2 — Entité Séance (Palier 4) et absence de revert sur l'historique : **notes pour le PM, deux points explicitement différés, à revoir si le besoin se fait sentir en usage réel**.
