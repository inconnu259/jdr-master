---
title: 'Réconciliation PRD Palier 7 vs sources (backlog.md, deferred-work.md)'
created: '2026-07-18'
---

# Réconciliation — PRD Palier 7 (SSE) vs sources

## Sources examinées

1. `docs/backlog.md` — section `## Palier 7 — Synchronisation client/serveur en temps quasi réel (SSE)` (lignes 136-152).
2. `_bmad-output/implementation-artifacts/deferred-work.md` — section `### Palier 7 — Synchronisation client/serveur (SSE, décidé le 2026-07-18)` (lignes 78-91), plus la section immédiatement adjacente `### Ordre d'exécution confirmé (2026-07-18)` (lignes 87-91) et, en amont dans le même fichier, la note d'origine « Reporté comme sujet de refonte » (lignes 119-121, issue du bug-fix `PartieDetail` du 2026-07-17) qui est la genèse directe de ce palier.

## Méthode

Lecture intégrale du PRD (`prd.md`), puis extraction ligne à ligne des deux sections sources, puis vérification que chaque idée, contrainte ou nuance qualitative trouve une contrepartie dans une FR / un Non-Goal / une Assumption / une Open Question du PRD.

## Table de correspondance

| Élément source | Où c'est capturé dans le PRD |
|---|---|
| "Pas de vrai temps réel bidirectionnel... juste éliminer le rechargement manuel" | Vision (§1), Non-Goals (§5) |
| "Approche tranchée avec l'utilisateur : SSE, pas de polling" (WebSockets exclus aussi dans deferred-work) | Glossaire (§3), Non-Goals (§5) |
| "Mécanisme d'émission (scope minimal : par Partie, pas par ressource fine)" | FR-1, Glossaire "Scopé par Partie" |
| "Connexion SSE côté Angular (EventSource ou wrapper), reconnexion sur coupure" | FR-2, FR-3, Assumption §4.1 FR-2 |
| "Câblage sur partie-detail, scenario-timeline, seance-list, calendar-view" | FR-4, FR-5, FR-6, FR-7 (+ 6 composants supplémentaires ajoutés via la recherche dédiée §4.2) |
| "(détail fin à cadrer avec l'utilisateur au démarrage de ce palier)" | Open Questions (§8), notes `[NOTE FOR PM]` en §4.2/§6.2 |
| "pattern `changed` déjà en place, à étendre pour être aussi déclenché par le push serveur" | Glossaire "Signal `changed`" |
| Historique : `PartieDetail`/`visibilitychange`, `ScenarioEditor`/`ScenarioReadDialog`, `SeanceList`, `CharacterSheet`, `CalendarView` (note d'origine 2026-07-17) | Vision (§1), FR-4, FR-8, FR-6, FR-9, FR-7 |
| "Le `Dashboard` (liste des Parties)... pas concerné" (note d'origine) | Implicite seulement — voir Gap 2 ci-dessous |

## Gaps identifiés

1. **Ordre d'exécution absent du PRD.** `deferred-work.md` (« Ordre d'exécution confirmé, 2026-07-18 ») fixe une séquence stricte : Épic 12 → **Palier 6** (dette technique) → **Palier 7** (SSE) → Palier 8 → ... Le PRD mentionne bien en Non-Goals que « FR-8 s'appuie sur [la] décision [Palier 6] FR-5 » (dépendance de contenu), mais ne dit nulle part que Palier 6 doit être **entièrement terminé avant que Palier 7 démarre** (contrainte de séquencement projet, pas seulement de contenu). Un PM lisant seulement le PRD pourrait planifier du travail SSE en parallèle du Palier 6 sans savoir que l'utilisateur a explicitement acté un ordre séquentiel.

2. **Nuance implicite sur le périmètre du `Dashboard` non explicitée.** La note d'origine (2026-07-17, `deferred-work.md` ligne 121) précise explicitement : « Le Dashboard (liste des Parties), lui, se rafraîchit déjà correctement après chaque action locale — pas concerné [par le problème systémique]. » Le PRD (FR-11) ne couvre que les *invitations reçues* du Dashboard, ce qui est cohérent avec cette note — mais le PRD ne dit jamais explicitement que la liste des Parties du Dashboard est sciemment exclue parce que déjà saine. Sans cette précision, un lecteur pourrait se demander si l'omission de la liste des Parties dans le périmètre est un oubli ou une décision. Gap mineur de clarté, pas de contenu manquant en soi.

3. **Dépendance Palier 7 → Palier 8 non mentionnée.** Le même bloc « Ordre d'exécution confirmé » place aussi Palier 8 (refonte Ryuutama) après Palier 7. Le PRD ne fait aucune référence à Palier 8, ce qui est attendu vu le périmètre du document, mais cela confirme que la place de Palier 7 dans la séquence globale (pas seulement sa relation à Palier 6) n'est pas du tout documentée dans le PRD — à reporter au moins dans une Assumption ou une note de contexte si ce PRD doit servir de référence isolée pour la planification.

## Conclusion

Le contenu qualitatif et les décisions actées avec l'utilisateur (SSE tranché, granularité par Partie, reconnexion silencieuse, refetch complet plutôt que rattrapage événement par événement, contexte hobby/pas de sur-ingénierie) sont fidèlement repris dans le PRD, souvent enrichis (10 composants vs 4 cités dans le backlog, FR-14/FR-15 ajoutés en autonomie sur la base de la recherche dédiée). Le seul angle systématiquement absent est la **contrainte de séquencement inter-paliers** (Palier 6 avant Palier 7, Palier 7 avant Palier 8), qui vit dans `deferred-work.md` mais n'a pas de contrepartie dans le PRD — probablement volontaire (hors du cadrage produit d'un palier isolé) mais à confirmer avec l'utilisateur si ce PRD doit aussi servir de repère de planification.
