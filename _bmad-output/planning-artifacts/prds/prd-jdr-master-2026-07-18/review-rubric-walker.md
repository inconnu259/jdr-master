# PRD Quality Review — prd-jdr-master-2026-07-18 (Palier 6 — Dette technique accumulée)

## Overall verdict

Ce PRD est solide et prêt à être finalisé tel quel, modulo deux corrections mineures de cohérence avec les documents en aval. C'est un PRD de durcissement brownfield bien calibré à ses enjeux (hobby, pas de nouveaux personas, capacity spec plutôt que UJ), avec un vrai effort d'honnêteté de périmètre (Out of Scope, Assumptions Index, Open Questions) et des FR généralement testables. Le seul point qui mérite un arbitrage avant clôture : le critère de fin « exhaustif » annoncé au §0/§6.2 est contredit par `docs/backlog.md` sur le thème Robustesse/perf (« au fil de l'eau, pas de sprint dédié »), et FR-22 tel qu'écrit au PRD est plus fort que ce que l'implémentation en aval (epics-palier6.md) a effectivement retenu.

## Decision-readiness — strong

Les arbitrages sont assumés, pas lissés. Le §0 nomme explicitement la rupture de pratique du projet (« critère de fin exhaustif ... pas de re-report accepté, à la différence de la pratique habituelle »), ce qui est le genre de décision qu'un PRD édulcore facilement en glissant vers « on essaiera de tout traiter ». Le `[NOTE FOR PM]` en §6.2 est posé à une vraie tension (que faire si un item s'avère plus complexe que prévu) plutôt qu'à un endroit anodin.

Les Out of Scope sont argumentés avec leur coût, pas juste listés : §4.1 explique pourquoi le signal `_changed` non scopé est reclassé perf plutôt que défaut fonctionnel ; §4.3 nomme précisément les deux risques de sécurité explicitement non repris (canal de timing, normalisation de casse) avec la raison de l'exclusion.

### Findings
- **medium** Contradiction sur le caractère « exhaustif » du thème Robustesse/perf (§0, §6.2 vs `docs/backlog.md` L130-132) — Le PRD affirme un critère de fin exhaustif sans exception pour les 5 thèmes (« chaque item ... doit être traité », « pas de re-report accepté »). Mais `docs/backlog.md` §Palier 6 qualifie explicitement le thème « Robustesse mineure / perf » de « au fil de l'eau, pas de sprint dédié » — formulation directement contraire à « exhaustif ». Le PRD ne mentionne nulle part cette exception. *Fix :* soit le PRD confirme que FR-18 à FR-24 sont bien exhaustifs pour ce palier (et `backlog.md` doit être corrigé/annoté comme obsolète sur ce point), soit le PRD doit lui-même noter l'exception pour ce thème.
- **low** FR-22 plus fort dans le PRD que ce qui a été retenu en aval (§4.5 FR-22 vs `epics-palier6.md` note sous Epic 17) — Le PRD dit sans réserve : « Un même appel rejoué ... ne produit pas deux effets de bord distincts en base. » `epics-palier6.md` note que FR-22 est « déjà satisfaite par la garde anti-double-clic de la Story 1.1 » et ajoute explicitement : « le cas résiduel d'un vrai retry réseau (hors double-clic) reste un risque accepté ». C'est une portée strictement plus faible que l'énoncé du PRD (garde UI seulement, pas d'idempotence serveur réelle type clé d'idempotence/contrainte unique). *Fix :* aligner le texte de FR-22 sur la décision réellement actée (garde UI, retry réseau pur = risque accepté), pour que le PRD reste la source de vérité que les epics respectent plutôt que l'inverse.

## Substance over theater — strong

Pas de personas listés (§2 le justifie explicitement — pas de nouveau persona, sert les MJ/joueurs déjà en place), cohérent avec un palier de durcissement pur. La Vision (§1) est spécifique au projet : elle référence le vrai mécanisme de revue de code adversariale du projet, le vrai empilement de paliers à venir (7, 8) et le vrai risque (fichiers partagés retouchés par plusieurs paliers) — elle ne se substituerait pas telle quelle à n'importe quel autre PRD.

Les FR nomment des fichiers/méthodes réels (`ScenarioEditor`, `_changed`, `findUniqueOrThrow`, `mapEquipmentToPdfFields`) plutôt que des généralités — aucune trace de NFR boilerplate type « le système doit être sécurisé/scalable ».

## Strategic coherence — adequate

Ce PRD n'a pas de thèse produit unifiée au sens habituel — et c'est cohérent avec sa nature : c'est un regroupement de 5 thèmes de dette déjà pré-triés dans `deferred-work.md`/`docs/backlog.md`, pas une nouvelle direction produit. Le §1 Vision fournit la seule thèse pertinente pour ce type de palier (« vider ce panier avant que Paliers 7/8 ne retouchent les mêmes fichiers ») et elle est correctement utilisée pour justifier le timing, pas la sélection des items eux-mêmes (qui vient de la revue de code historique, pas d'un narratif produit).

Les Success Metrics (§7) sont honnêtes sur l'absence de métriques quantitatives (contexte hobby) et proposent une contre-mesure réelle contre le scope creep plutôt qu'une métrique d'activité déguisée.

## Done-ness clarity — adequate

La majorité des FR ont une conséquence testable concrète et vérifiable (FR-1, FR-6 à FR-9, FR-10 à FR-14, FR-17 à FR-21, FR-24). Deux points affaiblissent la note :

- FR-5 est délibérément non tranché (« comportement exact ... actuellement non spécifié, à trancher à l'implémentation ») — acceptable car documenté comme Open Question §8.1, ce n'est donc pas un oubli silencieux, mais un ingénieur lisant seulement §4.1 ne saura pas ce qui constitue « fait » pour FR-5 sans aller chercher §8.
- FR-15 a une consequence vague au sens strict : « Un fichier construit pour passer la détection actuelle ... est **plus difficile à faire accepter** ». C'est une formulation de type « raisonnablement » plutôt qu'un critère binaire vérifiable — contrairement au reste du PRD qui est précis. Le PRD le reconnaît lui-même en renvoyant le niveau de rigueur à l'architecture, ce qui est une esquive légitime pour le *comment*, mais le *quoi* testable manque encore d'un critère observable (ex. : « rejeté si `PDFDocument.load()` échoue »).

### Findings
- **low** FR-15 : conséquence non strictement testable (§4.4) — « plus difficile à faire accepter » n'est pas vérifiable par un test automatisé tel quel. *Fix :* soit ajouter un critère binaire minimal (ex. « un fichier qui échoue à une validation structurelle minimale est rejeté »), soit assumer explicitement que le critère de „fait" pour FR-15 est délégué à l'architecture (déjà fait dans une certaine mesure, à rendre plus explicite).

## Scope honesty — strong

C'est le point fort du document. Les Out of Scope sont omniprésents et argumentés (§4.1, §4.2, §4.3, §4.4, §4.5), le §5 Non-Goals reprend et consolide toutes ces exclusions avec justification, et l'Assumptions Index (§9) est correctement utilisé pour les 3 inférences qui comptent réellement (choix `argon2`, choix `sharp`, migration automatique). La densité d'items ouverts (2 Open Questions, 3 Assumptions, 1 NOTE FOR PM) est proportionnée à un palier hobby de taille moyenne — ni vide ni surchargée.

## Downstream usability — strong

Ce PRD a déjà fait ses preuves en aval : `epics-palier6.md` couvre les 24 FR sans trou (FR Coverage Map complète), et `sprint-status.yaml`/Story 13.1 sont déjà en cours d'implémentation. Le Glossaire (§3, 3 termes) est utilisé de façon cohérente dans les FR concernés. Les ID FR-1 à FR-24 sont contigus et sans doublon.

### Findings
- **low** Drift de format d'ID entre le PRD et `epics-palier6.md` — Le PRD utilise systématiquement `FR-1`, `FR-2`, etc. (avec tiret) ; `epics-palier6.md` utilise `FR1`, `FR2` (sans tiret) dans son Requirements Inventory. Purement cosmétique, aucun risque de résolution incorrecte de référence puisque la correspondance numérique reste univoque, mais à uniformiser si un futur outil de traçabilité fait un matching textuel strict.

## Shape fit — strong

Forme bien choisie pour un PRD brownfield/interne hobby : pas de UJ (justifié explicitement au §2), pas de section UX dédiée (confirmé aussi côté `epics-palier6.md` : « Aucune — pas de document UX pour ce palier »), sections organisées par thème technique plutôt que par persona. Les références au code existant sont vérifiables et cohérentes avec `deferred-work.md` (composants, méthodes, noms de champs cités correspondent). Aucun sur-formalisme (pas de UJ inventés pour la forme) ni sous-formalisme (les FR portent bien la charge de spec que porteraient normalement des AC, ce qui est cohérent avec l'absence volontaire de section Acceptance dédiée — déjà compensée par `epics-palier6.md` qui, lui, porte les Given/When/Then).

## Mechanical notes

- Glossaire (§3) : les 3 termes (Garde anti-double-clic, Staleness, TOCTOU) sont utilisés cohéremment ; « Staleness » n'apparaît nommément qu'au glossaire et implicitement en Vision/§2 (« états visuellement obsolètes ») — pas un problème car le terme sert surtout de référence conceptuelle transverse, mais à noter s'il devient un terme de recherche pour la doc.
- Continuité des ID : FR-1 à FR-24 sans trou ni doublon, cohérent avec le FR Coverage Map de `epics-palier6.md`.
- Assumptions Index (§9) : les 3 entrées ont bien leur ancre inline correspondante (FR-10, FR-16, FR-6/7/8) — roundtrip correct, aucune assumption orpheline.
- Cross-référence backlog.md : le contenu de fond (5 thèmes) correspond bien entre le PRD, `docs/backlog.md` §Palier 6 et `deferred-work.md` §« Regroupés en Palier 6 » — seule la question de l'exhaustivité du thème perf/robustesse diverge (cf. finding critique en Decision-readiness).
