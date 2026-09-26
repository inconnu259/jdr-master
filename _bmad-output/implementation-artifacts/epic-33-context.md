# Epic 33 Context: Homme Dragon

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le MJ crée et consulte son Homme Dragon avec le même soin qu'une fiche de personnage joueur : fiche refondue au niveau des fiches joueur, formulaire de création guidé, souffles disponibles visibles en séance, export PDF de qualité équivalente, et présence dans « Personnages » au même titre que les personnages joueurs. L'Homme Dragon fait aujourd'hui figure de parent pauvre de l'application (parcours pénible, fiche sans soin ni structure) alors qu'il remplit pour le MJ le même office qu'une fiche joueur. Story 33.1 (fiche refondue) est livrée ; les patrons qu'elle a établis font désormais référence pour le reste de l'épic (voir Technical Decisions).

## Stories

- Story 33.1 : Fiche Homme Dragon refondue
- Story 33.2 : Les souffles de mon dragon
- Story 33.3 : Formulaire de création guidé
- Story 33.4 : Export PDF au niveau des fiches joueur
- Story 33.5 : Mes Hommes Dragons dans « Personnages »

## Requirements & Constraints

- La fiche doit atteindre le même niveau de présentation/lisibilité qu'une fiche joueur, y compris sur téléphone, sans information tronquée ni perdue par rapport à l'ancienne fiche.
- Le catalogue de souffles distingue les **communs** (déjà seedés) des souffles **propres à chaque race** (vert, bleu, rouge, noir — absents à ce jour, bien que le mécanisme fonctionne). Un dragon d'une race donnée ne voit que les communs + ceux de sa race. Chaque souffle porte son coût et une description consultable sans quitter la fiche.
- Aucun suivi de consommation des souffles ni des pouvoirs d'éveil : l'usage en séance n'est tracé nulle part (hors périmètre, reporté après mise en production — changerait la nature de l'app, d'outil *entre* séances à outil *pendant* la séance).
- Le formulaire de création est un vrai parcours guidé (pas une saisie brute), texte explicatif à chaque étape de choix (race, artefact) ; les artefacts proposés dépendent de la race choisie. Le résultat reste strictement équivalent aux données produites par l'ancien parcours — aucun champ ajouté ni retiré, seul le regroupement change.
- L'export PDF est mis au niveau de celui des fiches joueur, souffles inclus avec leur coût ; les champs de souffle du PDF reflètent une valeur maximale liée au niveau, sans jamais prétendre suivre une consommation non trackée.
- Dans « Personnages », chaque Homme Dragon affiche la partie d'origine, sa nature se lisant sans ouvrir la fiche et sans reposer sur la seule couleur (principe transverse : toute info encodée par couleur est doublée d'un icône/libellé/typographie). Recherche, tri, mode d'affichage s'appliquent à lui comme aux personnages (tri « Niveau », qu'il n'a pas : passe en dernier). Il n'apparaît jamais chez les autres membres de la partie.
- Un Homme Dragon est propre à une aventure : un MJ peut en avoir un par aventure Ryuutama, pas un seul au total. La section de création propose une entrée par aventure Ryuutama où le MJ n'en a pas encore.
- Le nom affiché suit la convention unifiée joueur/personnage. Le terme « Homme Dragon » est un nom propre du système : il ne se thématise pas, identique dans les trois thèmes.

## Technical Decisions

- L'Homme Dragon **n'est pas un personnage** dans le modèle de données : table distincte, unique par (utilisateur, partie, système), absente de la liste des personnages.
- Sa fiche n'a **pas de route propre** aujourd'hui : incrustée dans l'écran de la partie côté MJ (story 33.1 n'y a pas touché). La façon de l'ouvrir depuis « Personnages » (route dédiée vs navigation vers l'onglet partie) est un choix laissé à la story 33.5.
- Story 33.1 a établi les patrons de référence, réutilisés tel quel par les stories suivantes qui touchent la fiche ou l'export : structure en cartes façon `CharacterSheet`, surface de détail partagée (`DetailSurface`/`createDetailSurfaceHost()`) pour tout élément adossé à un catalogue avec description (artefact, pouvoir d'éveil — et par extension les souffles de 33.2), et repli de nom aligné sur `characterName()`. Les champs libres saisis par le MJ restent en texte simple, jamais dans la surface de détail.
- Lister les Hommes Dragons dans « Personnages » : choix ouvert entre endpoint dédié et extension de la lecture existante — contrainte ferme, ne pas casser le contrat de la liste des personnages ni ses consommateurs (écran Personnages, tableau de bord, tris). Lecture agrégée par utilisateur, jamais une requête par partie.
- Les souffles par race se seedent sur le même mécanisme que le catalogue d'artefacts, qui porte déjà un identifiant de race — aucun nouvel endpoint, complexité serveur faible.
- Aucune garde runtime ne rejette un catalogue de souffles incomplet (même discipline que les rôles de groupe du palier 8) — la complétude par race se vérifie en revue de contenu. Un souffle retiré/renommé lors d'un re-seed ne doit pas casser la lisibilité des fiches existantes.

## UX & Interaction Patterns

- Un MJ n'a pas d'entrée de création de personnage joueur sur sa propre partie ; son entrée dans le bloc d'invitation et dans la section de création de « Personnages » est celle de son Homme Dragon (le serveur l'autoriserait, c'est un choix produit).
- Dans la section de création de « Personnages », l'entrée Homme Dragon suit le patron des entrées personnage (ligne pleine, cible ≥44px, disparaît une fois créée, jamais de ligne vide affichée) avec son propre libellé, et mène au parcours de création dédié.
- Dans la liste de « Personnages », l'Homme Dragon utilise la même carte que les personnages avec un marqueur de nature dédié (`NatureMarker`) : icône + mot en affichage moyen/grand, icône seule + `aria-label` en mode compact — contour en couleur d'accent, sans fond de statut.
- Formulaire de création (33.3, delta UX du 2026-09-23) : parcours en **5 étapes** avec bandeau de progression et Précédent/Suivant — Race, Artefact (filtré par la race), Identité, Vie de l'Homme Dragon, Avatar — un seul groupe de champs visible à la fois. Étapes Race/Artefact en `ChoiceCard` (variant Homme Dragon : liséré + gemme + lueur de coin teintés par race, 4 races — vert/bleu/rouge/noir — teinte toujours doublée d'un texte, jamais seule) ; chaque option porte 1-2 phrases explicatives. Étapes à champs en Material (`mat-form-field appearance="outline"`), chacun avec une ligne d'aide sous le label — rattrapage limité à cette page, ne pas l'étendre ailleurs sans suivi dédié.

## Cross-Story Dependencies

- Story 33.2 dépend du mécanisme du catalogue d'artefacts (race déjà portée par ce catalogue) pour seeder les souffles par race, et réutilise la surface de détail posée par 33.1 pour l'affichage des souffles.
- Story 33.3 hérite des composants `ChoiceCard`/`DetailSurface`/`createDetailSurfaceHost()` du wizard de création de personnage — aucune fourche, aucun second seuil desktop introduit.
- Story 33.5 dépend de la convention de nommage joueur/personnage (épic 28) et de la section de création de « Personnages » posée par la story 29.16 (épic 29) : elle y ajoute son entrée plutôt que de dupliquer le mécanisme.
- Story 33.4 (export PDF) doit rester alignée sur le niveau atteint par la fiche refondue de 33.1 et sur les paliers de refonte parallèles des fiches joueur.
- Un même Homme Dragon partagé entre plusieurs aventures est hors périmètre ; aucune story ne doit figer un contrat « un Homme Dragon par partie » qui rendrait cette évolution plus difficile plus tard.
