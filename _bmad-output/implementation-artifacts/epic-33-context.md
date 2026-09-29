# Epic 33 Context: Homme Dragon

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Le MJ crée et consulte son Homme Dragon avec le même soin qu'une fiche de personnage joueur, et retrouve en séance ce dont son dragon dispose sans rouvrir le livre : fiche refondue, formulaire de création guidé, souffles visibles, capacités de niveau, réserve de souffles préparée avant la séance, export PDF équivalent à celui des joueurs, présence dans « Personnages ». L'Homme Dragon était le parent pauvre de l'application alors qu'il remplit pour le MJ le même office qu'une fiche joueur. Stories 33.1 et 33.2 livrées ; les patrons qu'elles ont établis font référence pour la suite. 33.8 est planifiée, conditionnée à une décision d'architecture.

## Stories

- Story 33.1 : Fiche Homme Dragon refondue (livrée)
- Story 33.2 : Les souffles de mon dragon (livrée)
- Story 33.3 : Formulaire de création guidé
- Story 33.4 : Export PDF au niveau des fiches joueur
- Story 33.5 : Mes Hommes Dragons dans « Personnages »
- Story 33.6 : Réserve de souffles
- Story 33.7 : Capacités de niveau
- Story 33.8 : Un Homme Dragon pour plusieurs aventures (planifiée)

Ordre : 33.3 → 33.4 → 33.5 → 33.7 → passe UX → 33.6 → 33.8 (après décision d'architecture).

## Requirements & Constraints

- **Souffles vs éveils (corrigé le 2026-09-25).** Les six entrées de `eveil-powers.json` sont des **éveils**, pas des souffles. Les 21 souffles (9 communs en trois familles : temps, destin, aide aux PNJ ; 12 de race, 3 par race vert/bleu/rouge/noir) vivent dans un content-type `souffle` distinct, seedé par 33.2. Les éveils restent listés à part. Référence des règles : `docs/dragons.md`.
- Un dragon voit les souffles communs + ceux de sa race ; dès le niveau 3, ceux des autres races sont consultables dans un bloc replié (multicolores). Chaque souffle porte son coût (PS) et une description consultable sans quitter la fiche.
- **Niveau = nombre de scénarios `PASSE`** (et non les séances jouées du livre) — décision du 2026-09-25.
- **Aucun décompte en séance** : ni souffles, ni PS, ni pouvoirs d'éveil ne sont suivis (suivi en jeu hors périmètre, reporté après la mise en production).
- **Réserve (FR-61, réservée au MJ)** : inexistante au niveau 1 ; dès le niveau N ≥ 2, au plus N − 1 emplacements, un même souffle pouvant occuper plusieurs emplacements ; souffles du temps exclus ; dès le niveau 3, au plus un souffle d'une autre race ; au niveau 5, les souffles rituels sont admis et ne comptent pas comme « autre race ». Réserve par défaut sur la fiche, pré-remplissant toute séance non composée ; la modifier sur une séance ne touche pas le défaut. Les joueurs ne la voient jamais : aucune réponse d'API ne la leur transmet.
- **Capacités de niveau (FR-62)** : la fiche liste les capacités acquises jusqu'au niveau N (catalogue `homme-dragon-level-capacities.json`). Niveau 4 : choix unique et définitif d'un **artefact cadeau** parmi ceux des trois autres races, affiché à côté de l'artefact principal ; rien avant le niveau 4. Niveau 5 : souffles rituels (`souffles-rituels.json`, clé `souffleRituel`) consultables, même coût que les autres souffles (1 PS), traités comme eux pour l'instant.
- **Création (33.3)** : parcours guidé avec texte explicatif à chaque choix ; artefacts filtrés par la race ; résultat strictement équivalent à l'ancien parcours (aucun champ ajouté/retiré). Textes issus des catalogues `homme-dragon-creation-intros.json` et `homme-dragon-races.json` (à enregistrer dans `CONTENT_TYPES`), préférences de race incluses.
- **PDF (33.4)** : niveau équivalent aux fiches joueur ; souffles lus depuis le catalogue `souffle` avec leur coût ; réserve par défaut imprimée si elle existe (33.6) ; champs de souffle du modèle remplis avec un maximum lié au niveau, sans jamais prétendre suivre une consommation.
- **« Personnages » (33.5)** : chaque Homme Dragon apparaît avec sa partie d'origine, nature lisible sans ouvrir la fiche et sans reposer sur la seule couleur ; recherche, tri (« Niveau » : il n'en a pas, il passe en dernier) et mode d'affichage s'appliquent ; jamais visible des autres membres de la partie. Un Homme Dragon par aventure Ryuutama et non un seul au total ; entrée de création « Créer un Homme Dragon pour <aventure> » pour chaque aventure Ryuutama du MJ qui n'en a pas.
- Nom affiché selon la convention unifiée joueur/personnage. « Homme Dragon » est un nom propre du système, jamais thématisé.
- Contenu Ryuutama versionné, textes reformulés (mécaniques conservées). Champs libres du MJ en texte simple.

## Technical Decisions

- L'Homme Dragon **n'est pas un personnage** : table distincte, unique aujourd'hui par (utilisateur, partie, système), absente de la liste des personnages. Sa fiche n'a pas de route propre (incrustée dans l'écran de la partie côté MJ) ; la façon de l'ouvrir depuis « Personnages » est laissée à 33.5.
- Patrons posés par 33.1, à réutiliser : cartes façon `CharacterSheet`, surface de détail partagée (`DetailSurface` / `createDetailSurfaceHost()`) pour tout élément de catalogue avec description (artefact, éveil, souffle), repli de nom aligné sur `characterName()`.
- Les catalogues de contenu passent par le mécanisme existant (`CONTENT_TYPES`, seed) ; les souffles par race suivent celui des artefacts (race déjà portée), sans nouvel endpoint. Aucune garde runtime contre un catalogue incomplet (même discipline que les rôles de groupe du palier 8) : complétude vérifiée en revue de contenu. Un souffle retiré/renommé au re-seed ne casse pas les fiches ni les réserves existantes (repli lisible sur la clé).
- **Lecture agrégée (33.5)** : une lecture par utilisateur, jamais une requête par partie (pas de fan-out) ; forme (endpoint dédié ou extension) libre, sans casser le contrat de la liste des personnages ni ses consommateurs (écran Personnages, tableau de bord, tris).
- **AD-22 — Réserve de souffles (33.6, à valider au démarrage de la story)** : réserve de séance = champ JSON nullable `reserveSouffles` sur `Seance` (liste `{ key, count }`) ; réserve par défaut = `HommeDragon.sheetData.reserveParDefaut`, même forme ; réserve par défaut **résolue à la lecture**, jamais recopiée dans les séances. Lecture MJ seul : jamais dans les DTO de séance servis aux joueurs (même principe que `sheetVisibility`) ; le signal temps réel ne porte aucune donnée. Écriture MJ seul (`getOwned`) avec validation serveur des règles de composition à partir des catalogues `souffle` et `souffleRituel` (capacité, souffles `reservable: false` exclus, autre race, rituels) ; émission `partie:{id}` après écriture, vues câblées sur le signal `changed`/`notifyChanged()`.
- **33.8** : change l'unicité, le rattachement et le calcul du niveau (cumul des scénarios `PASSE` de plusieurs parties) ; nécessite une AD dédiée (`bmad-architecture`) et une migration avant la story. Les fiches existantes restent intactes. Aucune story antérieure ne doit figer un contrat « un Homme Dragon par partie ».
- Revues : `/security-review` prévue sur 33.6 (nouveau chemin d'écriture MJ) ; passer en mode plan avant 33.6 et 33.8.

## UX & Interaction Patterns

- Le MJ n'a pas d'entrée de création de personnage joueur sur sa partie ; son entrée (bloc d'invitation, section de création de « Personnages ») est celle de son Homme Dragon. Cette entrée suit le patron des entrées personnage (ligne pleine, cible ≥44px, disparaît une fois créée) et mène au parcours dédié.
- Liste « Personnages » : même carte que les personnages avec un marqueur de nature dédié (`NatureMarker`) : icône + mot en affichage moyen/grand, icône seule + `aria-label` en compact ; contour d'accent, sans fond de statut. Toute info encodée par couleur est doublée d'un icône/libellé.
- Création (delta UX du 2026-09-23) : 5 étapes avec bandeau de progression et Précédent/Suivant — Race, Artefact (filtré), Identité, Vie de l'Homme Dragon, Avatar. Race/Artefact en `ChoiceCard` variante Homme Dragon (liséré + gemme + lueur de coin teintés par race, teinte toujours doublée d'un texte), 1-2 phrases par option. Étapes à champs en Material `appearance="outline"` avec ligne d'aide sous chaque label (rattrapage limité à cette page). Aucune fourche des composants du wizard de personnage, aucun second seuil desktop.
- Écran de réserve (page de séance + réserve par défaut sur la fiche) : conçu par une passe `bmad-ux` **avant** 33.6. L'artefact cadeau (33.7) réutilise `ChoiceCard`, cartes et `DetailSurface` existants.

## Cross-Story Dependencies

- 33.2 dépend du catalogue d'artefacts (race) et de `DetailSurface` de 33.1 ; elle a posé le content-type `souffle`.
- 33.3 hérite de `ChoiceCard`/`DetailSurface` du wizard de personnage et consomme les deux catalogues de textes à enregistrer.
- 33.4 lit le catalogue `souffle` (pas `eveilPower`), reste alignée sur la fiche de 33.1 et les refontes parallèles des fiches joueur ; imprime la réserve par défaut si 33.6 est livrée.
- 33.5 dépend de la convention de nommage (épic 28) et de la section de création de la story 29.16 (épic 29) : elle y ajoute son entrée.
- 33.6 dépend de 33.7 (enregistre le catalogue des souffles rituels) et de la passe UX ; s'appuie sur le niveau (scénarios `PASSE`), le temps réel de la partie et les séances (une séance appartient à une seule partie, donc un seul dragon — pas de conflit avec 33.8).
- 33.7 : un champ `artefactCadeau` définitif, deux catalogues à enregistrer ; faible impact serveur.
- 33.8 est en dernier, après l'AD multi-aventures ; elle ne doit pas être rendue plus difficile par 33.5 (contrat de lecture agrégée).
