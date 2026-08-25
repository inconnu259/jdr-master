# Réconciliation Spine ↔ PRD — Palier 7 (SSE)

Comparaison exhaustive entre `ARCHITECTURE-SPINE.md` et `prd.md` (source primaire). Objectif : vérifier qu'aucun FR n'est silencieusement abandonné et qu'aucune nuance actée (détail décidé, Non-Goal, Open Question, Assumption) n'a été perdue ou contredite.

## 1. Couverture FR par FR

| FR | Intitulé PRD | Couvert par la spine ? | Où |
| --- | --- | --- | --- |
| FR-1 | Émission d'événement scopé Partie | Oui | AD-1, AD-2 ; Capability Map |
| FR-2 | Connexion d'écoute côté client | Oui | AD-5, AD-6, AD-9 ; Capability Map |
| FR-3 | Reconnexion silencieuse + rattrapage complet | Oui | AD-8 ; Capability Map |
| FR-4 | `PartieDetail` | Oui | AD-3/AD-4 (Capability Map) **et** présent dans Structural Seed (`partie-detail.ts`) |
| FR-5 | `ScenarioTimeline` | **Partiel** | Couvert seulement au niveau générique « FR-4 à FR-13 » (Capability Map, AD-3/AD-4) — **absent du Structural Seed** (aucun fichier `scenario-timeline.ts` listé) |
| FR-6 | `SeanceList` | **Partiel** | Idem FR-5 — nommé dans le `scope` de l'entête, mais **absent du Structural Seed** |
| FR-7 | `CalendarView` | **Partiel** | Idem FR-5/FR-6 — **absent du Structural Seed** |
| FR-8 | `ScenarioEditor` / `ScenarioReadDialog` | Oui | AD-3/AD-4 ; présents dans Structural Seed (2 fichiers) — voir nuance §2.1 sur l'interaction Palier 6 FR-5 |
| FR-9 | `CharacterSheet` | Oui | Structural Seed (`character-sheet.ts`) |
| FR-10 | `HommeDragonSheet` | Oui | Structural Seed (`homme-dragon-sheet.ts`) |
| FR-11 | `Dashboard` (invitations, topic utilisateur) | Oui | AD-7 (résout l'Open Question 1) ; Structural Seed (`dashboard.ts`) |
| FR-12 | `ScenarioDrafts` / `ScenarioOneShotTab` | Oui | Structural Seed (2 fichiers) |
| FR-13 | `AnnouncementForm` | Oui | Structural Seed (`announcement-form.ts`) |
| FR-14 | Réactivité `OpenPollsService`/`ModeService` | Oui | Capability Map + Structural Seed (`open-polls.service.ts`, `mode.service.ts`) |
| FR-15 | Convention documentée pour l'avenir | Oui | Capability Map (renvoi explicite à `CLAUDE.md`/`docs/checklist.md`, noté comme non architectural) |

**Constat principal : Gap #1.** Le `scope` en entête de spine annonce bien « câblage sur 10 composants » en nommant `ScenarioTimeline`, `SeanceList`, `CalendarView` (FR-5, FR-6, FR-7), et la Capability Map les couvre au niveau générique (« FR-4 à FR-13 » → AD-3/AD-4). Mais la section **Structural Seed** — censée être la liste concrète des fichiers à toucher — ne les mentionne nulle part : elle liste 9 fichiers frontend correspondant à FR-4, FR-8 (×2), FR-9, FR-10, FR-11, FR-12 (×2), FR-13, mais aucun fichier pour FR-5/FR-6/FR-7. Un agent de dev qui suivrait uniquement le Structural Seed comme liste de travail manquerait ces trois composants pourtant explicitement dans le scope du palier.

## 2. Nuances PRD à vérifier

### 2.1 Interaction FR-8 ↔ Palier 6 FR-5 (protection du champ en cours de frappe) — **Gap #2**

Le PRD (FR-8, Consequences) est explicite : *« un champ en cours de frappe n'est jamais écrasé sauf si le serveur a modifié précisément ce champ (règle déjà actée, réutilisée ici telle quelle) »*, en référence directe à une décision du Palier 6 (FR-5).

La spine ne traite ce point nulle part : ni AD dédié, ni mention dans les « Inherited Invariants » (qui ne listent que des invariants du **Palier 1** — P1-AD-1, P1-AD-2, P1-AD-3, P1-AD-5 — aucun invariant du Palier 6 n'est hérité alors que ce palier est l'étape précédente immédiate dans l'ordre d'exécution acté, et que FR-8 s'appuie explicitement dessus). AD-3 se contente de dire que `notifyChanged()` est appelé sur les services de domaine, sans préciser comment `ScenarioEditor` doit fusionner un refetch complet avec un champ en cours d'édition sans l'écraser. Il y a donc un risque réel de contradiction implémentation : un refetch complet déclenché par SSE (comportement générique de la spine) pourrait écraser un champ en cours de frappe si la story ne réintroduit pas explicitement la règle du Palier 6 — la spine ne le garde pas visible comme invariant hérité.

### 2.2 Non-Goals — cohérence vérifiée, pas de gap

- Pas de temps réel bidirectionnel / WebSockets → cohérent avec le paradigme SSE + `EventSource` de la spine (Design Paradigm, Stack).
- Pas de rattrapage événement-par-événement (`Last-Event-ID`) → AD-8 l'exclut explicitement (« Aucun wrapper de reconnexion... »).
- Pas de montée en charge horizontale (pas de broker Redis) → AD-1 (Subject RxJS en mémoire, mono-instance) et AD-6 (Deferred explicite) cohérents.
- Pas de granularité plus fine que « Partie » → AD-7 respecte ce principe (topic `partie:{id}` / `user:{id}`, jamais par ressource). Note : voir §2.1 pour la tension potentielle avec FR-8.
- Le Palier 6 n'est pas repris → cohérent, la spine ne rouvre pas de dette du Palier 6 (mais voir §2.1 sur l'invariant manquant).

### 2.3 Open Questions — résolues correctement

- **Open Question 1** (canal FR-11 pour un utilisateur pas encore membre) → résolue par AD-7 (topic `user:{userId}` distinct, endpoint `GET /users/me/events`). Cohérent, pas de gap.
- **Open Question 2** (volume de connexions SSE simultanées) → correctement laissée en **Deferred** dans la spine, avec renvoi explicite à cette Open Question. Pas de gap.

### 2.4 Assumptions — cohérence vérifiée

- Instance NestJS unique → reflétée dans AD-1 (Subject en mémoire, pas de pub/sub inter-instances) et Non-Goals repris. Cohérent.
- `EventSource` natif suffisant → AD-8 tranche explicitement en ce sens (`[ADOPTED]`, pas de wrapper). Cohérent.

## 3. Résumé des gaps

1. **Gap #1 (structurel, à corriger avant/à l'implémentation)** : `ScenarioTimeline` (FR-5), `SeanceList` (FR-6), `CalendarView` (FR-7) sont couverts au niveau architectural générique mais absents du Structural Seed — risque d'oubli si une story se base sur cette liste de fichiers.
2. **Gap #2 (invariant manquant)** : aucun invariant hérité du Palier 6 n'est listé dans « Inherited Invariants », alors que FR-8 dépend explicitement d'une règle du Palier 6 (non-écrasement d'un champ en cours de frappe) qui entre en tension avec le comportement générique de refetch complet sur `notifyChanged()`.

Aucun autre FR n'est silencieusement abandonné ; aucune autre nuance (Non-Goal, Assumption, Open Question) n'est perdue ou contredite.
