# PRD Quality Review — Palier 7 : Synchronisation client/serveur en temps quasi réel (SSE)

## Overall verdict

Ce PRD est solide et prêt à alimenter la génération d'epics/stories, avec une réserve mineure mais réelle : environ deux tiers des FR de câblage (§4.2) n'ont pas de bloc "Consequences (testable)" propre, s'appuyant sur la seule phrase descriptive du FR comme critère de fin. Le thésis est net (remplacer les patchs ponctuels par un mécanisme systémique unique), le scope est honnêtement borné (Non-Goals, assumptions, notes PM), et la forme (capability spec sans personas/UJ) correspond bien à un palier technique brownfield. À corriger avant génération des stories : uniformiser le niveau de testabilité des FR-5/6/7/9/10/11/12/13, et clarifier le sort de FR-11 (mécanisme non tranché) dans le flux de story-création.

## Decision-readiness — adequate

Les décisions structurantes sont posées comme des décisions, pas des considérations : SSE tranché explicitement dans §0 et §Non-Goals ("Approche tranchée avec l'utilisateur : SSE... pas de polling ni de WebSockets"), la reconnexion silencieuse est marquée "Décidé avec l'utilisateur (2026-07-18)" en FR-3, et la granularité "scopée par Partie" est répétée et assumée comme un choix délibéré (pas une simplification cachée). Les deux Open Questions sont réellement ouvertes — l'une (FR-11, canal hors Partie) est explicitement renvoyée à l'architecture plutôt que résolue en douce dans le texte, l'autre (volume de connexions SSE) est jugée non pertinente à l'échelle actuelle mais pas balayée sous le tapis (mention "à revisiter si l'usage le justifie").

Point plus faible : le §7 Success Metrics introduit un critère temporel ("refléter, en quelques secondes") qui n'est presque pas discuté comme trade-off — c'est la seule mention de latence du document, et elle reste une adjective ("quelques secondes") sans borne. Vu que la contre-mesure explicite exclut la latence sub-seconde, ce n'est pas un vrai trou de décision (le choix "refetch complet, pas de garantie de livraison" est bien assumé), mais un lecteur pressé pourrait le lire comme une case à cocher plutôt qu'un trade-off pesé.

### Findings
- **medium** Bloc temporel non borné en Success Metrics (§7) — "en quelques secondes" est la seule référence de latence du PRD et reste un adjectif, alors que le rubric technique de "done-ness" demande des bornes. *Fix:* soit assumer explicitement que c'est volontairement non chiffré (cohérent avec le contexte hobby, à écrire noir sur blanc), soit donner un ordre de grandeur (ex. "sous 5 secondes en usage normal, hors reconnexion").

## Substance over theater — strong

Pas de personas ajoutés (§2 l'assume frontalement : "Pas de nouveau persona"), pas de section innovation/différenciation forcée, pas de NFR générique ("scalable", "sécurisé" sans seuil) — au contraire, les NFR de charge sont explicitement écartées en Non-Goals ("Aucune préoccupation de montée en charge horizontale... une seule instance NestJS assumée"). Le Vision (§1) est ancré dans l'historique concret du projet (`visibilitychange` sur `PartieDetail`, signaux `changed` locaux sur `ScenarioTimeline`/`SeanceList`) — impossible à swapper dans un autre PRD sans réécriture. Rien à signaler ici.

## Strategic coherence — strong

Thèse explicite et tenue du début à la fin : remplacer les correctifs ponctuels multiples par *un* mécanisme systémique unique, scopé par Partie. La structure des features suit cette thèse en escalier logique : §4.1 (le mécanisme lui-même) → §4.2 (son application exhaustive aux composants connus) → §4.3 (un angle mort structurel distinct, les services partagés) → §4.4 (la pérennité de la convention pour ne pas répéter le problème). Ce n'est pas une liste de capacités disparates avec des titres de section. Les Success Metrics (§7) valident directement la thèse ("aucune des pages/composants... ne nécessite plus F5") plutôt que de mesurer une activité proxy, et la contre-mesure nomme explicitement le risque inverse (sur-ingénierie temps réel).

## Done-ness clarity — thin

C'est le point faible du document. Les FR du mécanisme central (FR-1, FR-2, FR-3) et certains FR de câblage (FR-4, FR-8, FR-14) ont un bloc "Consequences (testable)" complet et concret. Mais la majorité des FR de câblage — **FR-5, FR-6, FR-7, FR-9, FR-10, FR-12, FR-13** — n'ont *aucun* bloc Consequences : le FR consiste en une seule phrase descriptive ("Se rafraîchit sur événement serveur — corrige le cas où...") sans critère de vérification distinct. Pour un ingénieur qui reprend ces FR en story, "se rafraîchit sur événement serveur" est vérifiable en soi (assez pour écrire un test), mais c'est plus faible que les FR voisins qui précisent explicitement la condition limite à tester (FR-4 : "sans que l'onglet ait besoin de perdre puis regagner le focus" ; FR-8 : le cas d'interaction avec le brouillon en cours de frappe). Le rubric demande d'être "unforgiving" ici car c'est la dimension sur laquelle la création de stories va s'appuyer le plus — cette asymétrie entre FR "documentés à fond" et FR "one-liner" va probablement se traduire par des stories de qualité inégale si elle n'est pas corrigée avant génération.

FR-11 est un cas à part : plutôt qu'une Consequence testable, il porte une "Note" qui reconnaît que le mécanisme exact est indéterminé et renvoyé à l'architecture — cohérent avec l'Open Question #1, mais ça laisse ce FR sans aucun critère de fin vérifiable dans le PRD lui-même.

### Findings
- **high** FR-5/6/7/9/10/12/13 sans bloc Consequences (§4.2) — sept FR sur les dix de câblage n'ont qu'une phrase descriptive comme critère de fin, contrairement à FR-4/8 qui précisent la condition limite testée. *Fix:* ajouter au moins une ligne "Consequences (testable)" par FR, même minimale (ex. FR-6 SeanceList : "une modification de capacité/inscription faite par un autre membre est visible sans rechargement de la page courante").
- **medium** FR-11 sans critère de fin vérifiable (§4.2) — la Note reconnaît que le mécanisme est indéterminé, mais aucune Consequence ne borne ce que "terminé" veut dire pour ce FR en attendant la décision d'architecture. *Fix:* soit une Consequence conditionnelle ("quel que soit le canal choisi, une invitation envoyée/révoquée est visible sur le dashboard sans rechargement"), soit déplacer explicitement ce FR en dépendance bloquée sur l'Open Question #1 pour que la story-création le traite en connaissance de cause.

## Scope honesty — strong

Non-Goals (§5) est dense et fait un vrai travail : six exclusions explicites, chacune justifiée (pas de bidirectionnel, pas de WebSocket, pas de rattrapage événement-par-événement, pas de scale horizontal, granularité fixée, Palier 6 non repris). Les `[NOTE FOR PM]` sont placées à des tensions réelles : la liste de composants du §4.2 est explicitement datée ("photo prise au moment de la rédaction") avec consigne de repasser une détection avant story-creation — exactement le genre de dérive qui s'est produite au Palier 6 selon le texte lui-même. La densité d'items ouverts (2 Open Questions, 2 Assumptions, 2 NOTE FOR PM) est proportionnée à un palier hobby de taille moyenne — ni creuse ni excessive pour ce niveau d'enjeu.

## Downstream usability — adequate

Ce PRD va directement nourrir la génération d'epics/stories (contrairement au Palier 6 déjà shardé) — donc cette dimension compte plus que pour un PRD standalone. IDs contigus et uniques (FR-1 à FR-15, aucun trou ni doublon). Glossaire cohérent et réutilisé identiquement dans les FR ("scopé par Partie", "signal changed", "SSE"). La cross-référence vers le Palier 6 (FR-8 → "Palier 6 FR-5") est vérifiée exacte : le FR-5 du Palier 6 porte bien sur la cohérence des brouillons de champ pendant une édition concurrente, correctement cité. Le principal frein à l'extraction propre pour la story-création est le même point que Done-ness clarity : les FR sans Consequences obligeront le rédacteur de stories à improviser des critères d'acceptation non écrits dans le PRD.

## Shape fit — strong

PRD brownfield, technique, mono-opérateur de fait (MJ + joueurs déjà en place, "Pas de nouveau persona" assumé sans détour) — la forme "capability spec" sans UJ est le bon choix, cohérente avec le Palier 6 déjà finalisé sur ce projet. Aucune sur-formalisation (pas de UJ artificiels pour justifier une section), aucune sous-formalisation non plus (le mécanisme central §4.1 a bien trois FR détaillés malgré l'absence de UJ). Les références au code existant (`PartieDetail`, `ScenarioTimeline`, `SeanceList`, `OpenPollsService`, `ModeService`, `HommeDragonSheet`...) sont spécifiques et vérifiables, cohérentes avec un PRD brownfield qui doit ancrer ses FR dans le code réel plutôt que dans l'abstrait.

## Mechanical notes

- **Assumptions Index roundtrip incomplet** : les deux entrées de §9 (§4.1 général, §4.1 FR-2) ne sont adossées à aucun tag `[ASSUMPTION]` inline dans le corps du texte des sections concernées — l'index existe mais rien ne signale visuellement l'hypothèse au fil de la lecture des FR. Même pattern observé dans le PRD Palier 6 déjà finalisé (ex. `[ASSUMPTION §4.3 FR-10]` sans tag inline correspondant dans FR-10) — c'est donc une convention établie du projet plutôt qu'une régression de ce PRD spécifiquement, mais elle reste techniquement en écart avec la lettre du rubric ("every inline [ASSUMPTION] indexed; index entries all appear inline"). Sévérité faible vu la cohérence avec l'existant.
- **Glossaire** : aucune dérive détectée. "Partie" (majuscule), "Signal changed", "SSE", "scopé par Partie" utilisés identiquement partout.
- **ID continuity** : FR-1 à FR-15 contigus, sans trou ni doublon. Numérotation cohérente avec le décompte annoncé en §6.1 ("mécanisme + câblage sur 10 composants + 2 services + convention").
- **Cross-références** : la référence à "Palier 6, FR-3" (§FR-5, réactivité au changement de `partieId`) et "Palier 6 FR-5" (§FR-8, brouillon en édition concurrente) ont toutes deux été vérifiées contre le PRD Palier 6 finalisé — correctes.
- **UJ protagonist naming** : sans objet, aucune UJ dans ce PRD (cohérent avec le shape fit "capability spec").
