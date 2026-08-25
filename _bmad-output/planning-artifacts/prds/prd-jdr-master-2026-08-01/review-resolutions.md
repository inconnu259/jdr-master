---
title: "Revue d'exactitude — mise à jour du PRD Palier 9 (2026-08-05)"
type: review
created: 2026-08-05
scope: "§7 questions closes (Q-2, Q-3, Q-4, Q-5, Q-6, Q-8, Q-9, Q-11, Q-12) · FR-45, FR-46, FR-47 · D-11, D-12, D-13, précision D-6"
sources:
  - "prds/prd-jdr-master-2026-08-01/prd.md"
  - "architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md"
  - "ux-designs/ux-jdr-master-2026-08-04/DESIGN.md"
  - "ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md"
  - "ux-designs/ux-jdr-master-2026-08-04/.memlog.md (113 entrées)"
---

# Revue d'exactitude — mise à jour du PRD du 2026-08-05

**Verdict.** Les neuf résolutions déclarées closes sont, sur le fond, fidèles aux décisions réellement prises ; les trois exigences neuves sont bien formulées et au bon niveau. Deux problèmes sérieux subsistent néanmoins : **cinq exigences du §4 déclarent encore ouverte une question que le §7 déclare close** (le lecteur d'un epic ne lit pas le §7), et **la nouvelle ligne D-6 / D-13 introduit une décision serveur qui n'existe dans aucune spine et qui entre en tension avec AD-9**.

---

## Volet 1 — Les neuf résolutions déclarées closes

### Constat transverse et principal : cinq corps d'exigence n'ont pas été mis à jour

Le §7 déclare Q-3, Q-4, Q-8, Q-9 et Q-12 closes. Or le corps des exigences correspondantes continue de renvoyer à ces questions comme à des points ouverts :

| Question | §7 | Corps de l'exigence, inchangé |
| --- | --- | --- |
| Q-3 | *Close* | FR-5 (l. 100) : « le niveau de vérification du nouvel e-mail est un point ouvert (Q-3) » |
| Q-4 | *Close* | FR-6 (l. 105) : « Le comportement vis-à-vis des autres sessions actives est un point ouvert (Q-4) » |
| Q-8 | *Close* | FR-16 (l. 180) : « La forme de la bascule (onglets, interrupteur, autre) est un point ouvert (Q-8) » |
| Q-9 | *Close* | FR-20 (l. 198) : « La forme reste **à explorer** […] D'autres approches doivent être comparées avant de trancher (Q-9) » |
| Q-12 | *Close* | FR-23 (l. 212) : « L'ensemble des champs verrouillables **doit être arrêté avant l'implémentation** (Q-12) » |

La mise à jour a bien répercuté trois résolutions dans le corps du texte — Q-2 dans FR-43, Q-6 dans FR-36, Q-11 dans la note non fonctionnelle de FR-12 — mais s'est arrêtée là. Le risque est exactement celui annoncé, à l'envers : une story écrite depuis §4.1, §4.3 ou §4.4 rouvrira une question déjà tranchée, ou pire, tranchera différemment. FR-20 est le cas le plus coûteux : il invite explicitement à comparer d'autres approches alors que le run d'UX a produit une maquette comparative, écarté le dépliant comme défaut et retenu la surface adaptative (memlog 79-85).

**Correctif :** dans chacune des cinq exigences, remplacer le renvoi au point ouvert par la résolution retenue, comme cela a été fait pour FR-36 et FR-43.

---

### Q-2 — Complétude des clés de thème (FR-43)

**Formulation du PRD :** « typage dérivé d'un thème de référence, une clé manquante devient une erreur de compilation ».

**Source :** AD-13. **Exact.** Le PRD reprend même la précision essentielle d'AD-13 (« garantie que la structure actuelle n'offrait pas » ≈ « c'est une garantie *ajoutée* par la découpe, pas une garantie préservée »).

Nuances non reprises, toutes de niveau spine et légitimement absentes : l'identité du thème de référence (`grimoire-emeraude`), la règle « toute nouvelle clé s'ajoute par le thème de référence d'abord », et la déclaration unique de la liste des thèmes dans `@master-jdr/shared`.

**Rien à corriger.**

---

### Q-3 — Vérification du nouvel e-mail (FR-5) — ⚠ nuance perdue, à conséquence

**Formulation du PRD :** « mot de passe courant, avis à l'ancienne adresse, confirmation par lien sur la nouvelle, et lien de retour arrière valable un mois ».

**Source :** AD-5. Les quatre éléments cités sont exacts. **Ce qui manque est ce que fait le lien de retour arrière** :

> « L'activation de ce lien **restaure l'ancienne adresse, coupe toutes les sessions actives et force une réinitialisation de mot de passe** avant toute reconnexion — le scénario qui justifie ce lien implique que le mot de passe était connu de l'usurpateur. »

Résumé en « lien de retour arrière valable un mois », le dispositif se lit comme une simple annulation. C'est la moitié la moins évidente de la décision, et la seule qui porte un enjeu de sécurité : une story écrite sur la formulation du PRD produira un revert qui restaure l'adresse et laisse l'usurpateur connecté — précisément ce qu'AD-5 déclare vouloir empêcher.

Second détail : AD-5 prévoit **deux** messages à l'ancienne adresse (un avis au moment de la demande, puis à la prise d'effet le message portant le lien de retour arrière). Le PRD n'en mentionne qu'un.

**Correctif :** ajouter au §7 (ou mieux, dans FR-5) que le retour arrière coupe les sessions et force une réinitialisation de mot de passe.

---

### Q-4 — Sessions lors d'un changement de mot de passe (FR-6)

**Formulation du PRD :** « les autres sessions tombent, la courante survit ».

**Source :** AD-6. **Exact et suffisant** au niveau PRD.

Nuance non reprise, de niveau spine : AD-6 acte un **écart explicite et assumé** avec `AuthService.resetPassword()` (réinitialisation par e-mail), qui coupe *toutes* les sessions et continue de le faire — « cet écart n'est pas un oubli à "corriger" ». Sa perte est sans gravité tant que la spine reste le contrat de l'implémenteur, mais elle mériterait une ligne si le §7 doit se suffire à lui-même.

---

### Q-5 — Regroupement des exports (FR-18)

**Formulation du PRD :** « tranché : menu de la fiche. À rouvrir si le journal devient une destination à part entière ».

**Sources :** memlog 79-83, EXPERIENCE §4.7. **Exact, y compris la condition de réouverture**, qui est bien une condition posée explicitement par l'utilisateur et non une glose. Seule imprécision anodine : la décision porte sur le menu à trois points **de l'en-tête** de la fiche, et couvre **cinq** actions d'export (fiche éditable, fiche 2 pages, équipement, notes, recadrage du portrait PDF). FR-18, qui parle d'une « entrée dédiée », reste compatible.

**Rien à corriger.**

---

### Q-6 — Sort de la vue semaine (FR-36) — ⚠ un mot inexact

**Formulation du PRD :** « conservée et spécialisée en outil de saisie en masse » ; « La vue mois **conserve** un glissement plus grossier, à la journée entière ».

**Sources :** memlog 60-63, EXPERIENCE §4.4 et §6. La résolution principale est **exacte**. Deux réserves :

1. **« conserve » est faux.** Le glissement de sélection n'existe aujourd'hui sur aucune des deux grilles : l'analyse du code (memlog 60) a établi que `CalendarWeekView` et `CalendarMonthView` font le même travail — tap sur une case, ouverture du `ConstraintPanel` pré-rempli. La décision de Q-6 est « sélection par glissement sur les **deux** grilles », avec deux finesses différentes. Écrire que le mois « conserve » son glissement laisse croire que la vue mois n'a rien à faire dans ce chantier ; c'est une capacité neuve des deux côtés.

2. **Condition non reprise :** le glissement n'est jamais le seul chemin (EXPERIENCE §6) — le tap case par case reste pleinement fonctionnel, le glissement mobile s'amorce par un appui maintenu, et un équivalent clavier existe. C'est de la conception d'interaction, donc légitimement dans la spine ; mais « le tap reste fonctionnel » est une garantie de non-régression, pas un détail de forme, et sa place dans FR-32 se défendrait.

**Correctif minimal :** remplacer « conserve » par « reçoit ».

---

### Q-8 — Bascule parties ↔ personnages (FR-16)

**Formulation du PRD :** « ce ne sont plus deux vues à basculer mais deux destinations de la navigation ».

**Sources :** memlog 75-78, EXPERIENCE §2. **Exact dans sa lettre**, mais la résolution réelle est nettement plus large que ce que le PRD en retient, et cette largeur n'apparaît **nulle part** dans les exigences :

- la navigation devient **une barre à quatre destinations** — Parties · Personnages · Calendrier · Compte — basse sur mobile, haute sur desktop ;
- le **Calendrier est promu destination de premier niveau** et cesse d'être une entrée de menu (memlog 78), au motif que le modèle de couches en fait un écran de consultation quotidienne ;
- le **Compte** devient lui aussi une destination, ce qui déborde FR-1 (« accessible depuis le menu principal »).

Ce n'est pas une erreur de résolution, mais un **manque de couverture** : trois exigences neuves ont été inscrites (FR-45, FR-46, FR-47) alors que la refonte de la navigation globale — décidée au même run, de portée au moins égale — n'est portée par aucune exigence. Elle survit uniquement dans une ligne de tableau du §7 et dans la spine d'UX.

Par ailleurs, FR-16 conserve deux phrases devenues fausses : « On bascule de l'une à l'autre » et « la forme de la bascule […] est un point ouvert (Q-8) ».

**Correctif :** soit une exigence neuve sur la navigation à quatre destinations, soit au minimum une reformulation de FR-1 et FR-16 les rattachant à cette navigation.

---

### Q-9 — Consultation des textes descriptifs (FR-20)

**Formulation du PRD :** « une surface de détail unique, panneau latéral sur desktop et feuille sur mobile ».

**Sources :** memlog 79-85, EXPERIENCE §4.6, DESIGN §7.8. **Exact.** Deux acquis de la décision ne sont pas remontés :

- **La mutualisation FR-19 / FR-20 est confirmée**, plus conditionnelle. FR-20 dit encore « si une même forme convient aux deux, elle est mutualisée » ; EXPERIENCE §4.6 tranche : la surface « sert indifféremment » les deux, « mutualisation confirmée ».
- **Le dépliant n'est pas écarté** : il reste un motif autorisé mais d'exception (texte court, élément qui reste en place, décision explicite écran par écran) — demande utilisateur (memlog 85). Le PRD, qui présentait le dépliant comme « une piste appréciée », donne à le croire écarté par la résolution.

Rappel : le corps de FR-20 contredit frontalement le §7 (cf. constat transverse).

---

### Q-11 — Signaux d'état de FR-12

**Formulation du PRD :** « un appel unique renvoyant la carte des signaux de toutes les parties » ; note de FR-12 : « calculée serveur par requêtes groupées ».

**Source :** AD-3. **Exact**, y compris l'interdiction du fan-out, qui était l'enjeu réel de la question.

Une conséquence produit d'AD-3 n'est pas remontée, et elle est visible à l'écran :

> « **Une partie clôturée (AD-8) ne porte aucun signal d'action** : seuls subsistent les signaux de fin (compte-rendu ou rapport manquant). »

FR-12 dit seulement qu'une partie terminée est « visuellement en retrait ». La règle d'AD-3 est plus forte : ses signaux d'action sont **supprimés**, pas atténués. EXPERIENCE §4.1 bis la double d'une règle de teinte (« une partie terminée reste en `status-done` même si un rapport de fin manque »). C'est du comportement observable, qui a sa place dans FR-12.

Non repris, de niveau spine et à juste titre : la forme fermée du DTO (`PartySignalCode` en union fermée, tableau vide plutôt qu'entrée absente), le calcul serveur de `role` et `status`, et la lecture de `Partie.nextSessionDate` déjà persistée.

---

### Q-12 — Champs verrouillables (FR-23) — ⚠ cadrage en tension

**Formulation du PRD :** « l'unité de verrouillage est déclarée par le schéma du système de jeu, en bloc par clé, au sous-champ pour les clés qui le déclarent ».

**Source :** AD-7 (2). **Exact, et bien résumé** — c'est la formulation la plus dense des neuf. La question posée par FR-23 (« champs nommés, sections, ou catégories dérivées du schéma ? ») reçoit bien sa réponse.

Deux réserves, dont une de fond :

1. **Le cadrage a changé et le PRD ne l'a pas suivi.** AD-7 ouvre par : « Le verrouillage est une **préférence de jeu (anti-spoil), pas un modèle de sécurité** : rien n'est verrouillé par défaut ». Le PRD, lui, maintient inchangés sa note (« c'est un **modèle d'autorisation**, pas un champ ») et son D-4 (« **Élevée** — modèle d'autorisation »). Les deux lectures ne sont pas absurdes ensemble — le filtrage reste serveur, dans `toDto()` — mais elles n'appellent pas la même story : un modèle d'autorisation se conçoit fermé par défaut et se fait auditer, une préférence anti-spoil s'ouvre par défaut. **« Rien n'est verrouillé par défaut » est une règle produit absente du PRD**, alors que c'est elle qui détermine l'état initial de chaque partie.

2. **Nuance perdue :** le DTO porte `lockedKeys: string[]`, pour que l'affichage et le PDF distinguent « masqué par le MJ » de « non renseigné ». C'est visible par l'utilisateur, donc pas purement technique.

Enfin, le corps de FR-23 continue d'exiger que la liste « soit arrêtée avant l'implémentation » (cf. constat transverse).

---

## Volet 2 — Les trois exigences neuves

### FR-45 — Modes d'affichage de la liste : **fidèle**

Confronté à memlog 18, 22, 33, 77 et à EXPERIENCE §2 / §4.1 :

- les trois modes et la métaphore de l'explorateur de fichiers sont la formulation même de l'utilisateur (memlog 18) ✔
- mémorisation du mode **et du tri** sur le compte, au titre d'AD-1 ✔ (memlog 21 : le réglage par défaut vit dans les préférences du compte, les contrôles dans la liste restent transitoires)
- réutilisation à l'identique pour « mes personnages » ✔ (memlog 77 : « c'est le même écran avec un autre contenu »)
- séparation avec FR-10 (tri et filtres déjà couverts) ✔, explicitement demandée par memlog 36
- **la réserve d'échelle est consignée correctement**, y compris le fait qu'elle a été prise contre recommandation et qu'elle n'a plus à être rediscutée (memlog 33, EXPERIENCE §2) ✔

Niveau d'altitude respecté : aucun détail de rendu (icônes seules, 44 px, 28 px, monogramme, densités) n'a fui dans le PRD. **Rien à corriger.**

### FR-46 — Couches d'affichage du calendrier : **fidèle, une réserve**

- la liste des six couches est **exactement** la liste définitive de memlog 74, scission disponibilités / indisponibilités comprise ✔
- trois présentations des mêmes couches, l'Agenda étant « les couches actives triées par date » ✔ (memlog 64)
- conséquence sur le panneau « Voir les créneaux calculés » ✔ (memlog 65)
- défaut sur le compte, bascules temporaires, indicateur d'écart avec rétablissement ✔ (memlog 71)
- **le risque assumé est énoncé dans sa version corrigée**, celle de l'override utilisateur (memlog 72) : le risque tient au masquage de n'importe quelle indisponibilité, pas à l'occupation par une autre partie. Le PRD écrit bien « éteindre une couche d'indisponibilité », pas « la couche occupé ailleurs ». ✔ Bien vu.

**Réserve — la couche « disponibilité du groupe » réservée au MJ.** FR-46 (comme EXPERIENCE §2 et §4.3) la borne au MJ en contexte de partie. Or AD-9 décrit deux vues existantes en parallèle : `AvailableSlotDto` (**vue MJ**, statut par membre) et `AggregatedSlotDto` (**vue joueur**, compteurs sans identité). Restreindre la couche au MJ revient donc soit à retirer aux joueurs une lecture agrégée qu'ils ont déjà, soit à laisser un pan de comportement sans exigence. Le PRD est ici fidèle à la spine d'UX ; c'est la spine d'UX qui est en tension avec AD-9. À arbitrer avant les stories du §4.7.

Non repris, et défendable : la constatation que « occupé par une autre partie » n'est pas une couche et n'existe pas dans le calendrier personnel (« ne pas implémenter de couche fantôme côté perso », memlog 69). FR-33 la couvre indirectement. Une phrase dans FR-46 éviterait qu'une story invente une septième couche.

### FR-47 — Identité visuelle d'une partie : **fidèle**

- bannière générée à partir de l'**identifiant** de la partie ✔ (et non du nom — DESIGN §7.3 insiste : « le nom de la partie n'entre pas dans la graine »)
- déclinée selon le **thème actif**, pas selon la partie ✔ (DESIGN §7.3)
- « une fois générée, elle est stable dans le temps » — rendu correct de la règle fondatrice « tiré une fois à la génération, jamais un tirage à chaque affichage » (memlog 43), et cohérent avec le §5 qui précise que rien n'est stocké ✔
- image de couverture du MJ avec repli sur la bannière, renvoi à D-11 ✔ (memlog 109, DESIGN amendement 3)
- l'articulation avec FR-12 (« le second manque relevé sur la page d'arrivée ») est **exactement** le constat de memlog 12 ✔

Altitude respectée : ni les trois rendus par mode, ni le monogramme, ni les répertoires par thème, ni la zone d'exclusion du manomètre n'ont fui dans le PRD. **Rien à corriger.**

---

## Les dérogations serveur

### D-11 — Image de couverture : **exacte**

Ampleur, mécanisme réutilisé (portraits : upload, recadrage, plafond 5 Mo, nettoyage EXIF) et repli sont repris mot pour mot de memlog 19 / 109 et de l'amendement 3 de DESIGN. Le statut « ✅ actée » est justifié : le memlog demandait explicitement de l'acter au titre de P-5. ✔

### D-12 — États dépendants du lecteur : ⚠ **l'ampleur « nulle » contredit la spine d'UX**

Le PRD justifie l'ampleur nulle par : « `PollOptionDto.votes` porte déjà les `userId`, et les brouillons vivent derrière un endpoint séparé : le compteur diffère déjà de lui-même ».

Le constat technique est sans doute juste, mais **la conclusion qu'on en tire contredit une décision explicite**. EXPERIENCE §5 :

> « Ces états sont **calculés côté serveur, par lecteur**, comme les signaux de la liste des parties (AD-3) et comme `viewerIsMj` déjà en place sur `CharacterDto`. **Aucun calcul d'état côté client.** »

Et la convention « Signalétique d'état » de la spine d'architecture : « Les états eux-mêmes viennent du serveur sous forme de codes fermés (AD-3, AD-8), **jamais de chaînes construites à l'affichage** ».

Dire « le front peut dériver *à faire / fait* puisqu'il reçoit les `userId` » revient exactement à faire calculer l'état par le client. La dérogation n'est donc pas d'ampleur nulle : elle demande que la séance porte, **par lecteur**, un code d'état fermé (« Réponds au vote » vs « Vote en cours »), au même titre que `PartySignalsDto`. L'instruction du §5 — « **elles ne demandent aucun travail** […] Ne pas les implémenter par réflexe de complétude » — pousse ici dans la mauvaise direction.

**Correctif :** requalifier D-12 en ampleur faible-à-modérée, ou justifier explicitement pourquoi la règle « aucun calcul d'état côté client » ne s'applique pas ici.

### D-13 et la précision de D-6 : ⚠ **le constat le plus sérieux**

Trois problèmes se superposent.

**(a) La précision apportée à D-6 n'existe dans aucune source.** Aucune entrée du memlog, aucune ligne de DESIGN, d'EXPERIENCE ou de la spine d'architecture ne mentionne que la charge utile cross-partie devrait porter l'état d'inscription des séances. C'est une inférence produite pendant la mise à jour du PRD, présentée comme une « précision du 2026-08-05 » — donc comme un compte rendu de décision.

**(b) Elle entre en tension avec AD-9**, qui est catégorique :

> « Dans le calendrier d'une **partie**, aucune séance appartenant à une autre partie n'est jamais exposée en tant que telle. […] Aucun nouveau `SlotStatus` : un participant occupé ailleurs est `UNAVAILABLE`, **indistinguable d'une indisponibilité déclarée**. La non-fuite est **structurelle** — ce qui transite est un statut de créneau, jamais une identité de partie. »

Faire porter à cette même charge utile l'état d'inscription d'une séance d'une autre partie, c'est y réintroduire de l'information sur cette partie tierce, et rendre le créneau *distinguable* d'une indisponibilité déclarée — c'est-à-dire défaire l'invariant. Si, à l'inverse, la précision ne vise que le calendrier **personnel**, alors elle ne relève pas de D-6, dont l'intitulé est « exposition **cross-partie** des séances », et son rattachement induit en erreur.

**(c) Le raisonnement de D-13 tourne en rond.** D-13 conclut à une ampleur nulle en deux temps : dans une partie, `GET /parties/:id/scenarios` suffit ; hors partie, « le besoin est couvert par la précision apportée à D-6 ». Mais cette précision a été inventée pour couvrir D-13. Et le cas « hors partie » est réel : la couche « inscriptions ouvertes » est de portée **« Partout »** (EXPERIENCE §4.3), donc active dans le calendrier personnel, qui embrasse toutes les parties de l'utilisateur. Or aucun endpoint ne renvoie les séances de toutes ses parties en une fois ; les obtenir par `GET /parties/:id/scenarios` partie par partie est précisément le fan-out qu'AD-3 interdit et que la convention « Lecture en lot » proscrit.

Autrement dit : D-13 est classée « nulle, aucun travail », alors qu'elle appelle un changement de charge utile inscrit sur une autre ligne (D-6). Le §5 dit d'ailleurs des lignes nulles qu'« elles ne demandent aucun travail tant que le constat qui les accompagne tient » — le constat ne tient pas.

**Correctif :** faire trancher la question — quel canal alimente la couche « inscriptions ouvertes » dans le calendrier personnel, et l'état d'inscription d'une séance tierce transite-t-il, oui ou non, dans le calendrier d'une partie ? Puis requalifier D-6 et D-13 en conséquence, et retirer la « précision » tant qu'elle n'est pas adossée à une décision d'architecture.

---

## Constats mineurs

- **§7, phrase d'ouverture : « huit des quatorze questions initiales ».** Il y en a **neuf** (Q-2, Q-3, Q-4, Q-5, Q-6, Q-8, Q-9, Q-11, Q-12) ; Q-7 et Q-10 étaient closes avant les runs. Le décompte des questions neuves (quatre : Q-15 à Q-18) est juste.
- **Q-18 est présentée comme ouverte alors que le run d'UX l'a tranchée.** DESIGN §1 : « À faire **dans la story FR-43**, celle qui réorganise le stockage des thèmes en fichiers séparés : le fichier de ce thème y est recréé de toute façon, et la migration s'y range naturellement » (idem memlog 118-119). FR-43 le dit d'ailleurs lui-même (« Le renommage se fait dans cette exigence »). Q-18 pose donc une question à laquelle le PRD répond deux sections plus haut.
- **Q-15, Q-16 et Q-17 sont, elles, correctement reportées** depuis les points ouverts 2, 1 et 6 d'EXPERIENCE §12, sans déformation. Q-17 mentionne à raison le caractère jamais discuté du plafond de deux badges (`[ASSUMPTION]` d'EXPERIENCE §4.1 bis).
- **§6, thème d'accessibilité :** le report et son motif sont fidèles à memlog 115 et à EXPERIENCE §11, y compris la mention que l'ajout est « un travail de contenu ». La condition technique posée par EXPERIENCE — le quatrième thème devra respecter l'invariant de palette **plus** une séparation de luminance — n'est pas reprise ; sans conséquence tant que le sujet reste hors périmètre.
- **Point ouvert n° 3 d'EXPERIENCE (technique de rouage D rejetée, « à reconfirmer, réversible »)** n'a pas été remonté au §7. C'est correct : c'est une question de rendu, sans portée produit.

---

## Récapitulatif des correctifs proposés

| # | Objet | Gravité |
| --- | --- | --- |
| 1 | D-6 / D-13 : précision non sourcée, en tension avec AD-9, et raisonnement circulaire sur l'ampleur nulle | Élevée |
| 2 | FR-5, FR-6, FR-16, FR-20, FR-23 : corps d'exigence contredisant le §7 sur Q-3, Q-4, Q-8, Q-9, Q-12 | Élevée |
| 3 | D-12 : « ampleur nulle » contre la règle « aucun calcul d'état côté client » (EXPERIENCE §5, convention de la spine) | Élevée |
| 4 | Q-3 : le retour arrière coupe les sessions et force une réinitialisation de mot de passe — non dit | Moyenne |
| 5 | Q-12 / FR-23 / D-4 : cadrage « modèle d'autorisation » contre AD-7 « pas un modèle de sécurité, rien verrouillé par défaut » | Moyenne |
| 6 | Q-8 : la navigation à quatre destinations (dont Calendrier et Compte promus) n'est portée par aucune exigence | Moyenne |
| 7 | FR-46 : couche « disponibilité du groupe » réservée au MJ contre `AggregatedSlotDto` (vue joueur) d'AD-9 | Moyenne |
| 8 | Q-11 / FR-12 : une partie clôturée ne porte **aucun** signal d'action (AD-3) — non dit | Faible |
| 9 | FR-36 : la vue mois « conserve » un glissement qu'elle n'a pas ; c'est une capacité neuve des deux côtés | Faible |
| 10 | Q-9 : mutualisation FR-19/FR-20 confirmée, et dépliant conservé comme exception — non dits | Faible |
| 11 | §7 : « huit » résolutions au lieu de neuf ; Q-18 déjà tranchée par le run d'UX | Faible |
