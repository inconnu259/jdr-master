---
title: "Review qualité — PRD Palier 2 : Calendrier"
reviewer: Claude Sonnet 4.6
date: 2026-06-26
---

# Review qualité — PRD Palier 2 : Calendrier

## Verdict

PRD solide et bien structuré pour un outil perso, avec une logique métier originale (contraintes → calcul automatique) clairement articulée, mais il manque la définition des API endpoints et l'algorithme de calcul de la "période couverte" est sous-spécifié, ce qui risque de provoquer des surprises à l'implémentation.

---

## Findings

### F1 — Complétude : API/contrats non définis

Aucune esquisse des endpoints REST (NestJS) n'est fournie. Pour une feature aussi algorithmique, les contrats d'API (routes, payloads, réponses) sont des requirements critiques manquants. Sans eux, le frontend et le backend risquent de diverger sur la représentation des statuts (`AVAILABLE | UNAVAILABLE | UNKNOWN`) et sur la structure des réponses du calcul de créneaux. À ajouter avant de coder.

### F2 — Clarté : algorithme "période couverte" ambigu

FR-1.2 définit la "période couverte" comme "la plage temporelle sur laquelle l'utilisateur a au moins une déclaration", mais ne précise pas comment les déclarations récurrentes (sans `startDate`) contribuent à cette période. Une déclaration récurrente "jamais le mercredi soir" avec `expiresAt = +6 mois` couvre-t-elle [aujourd'hui, +6 mois] ou [création, +6 mois] ? Le service `computeSlotStatus` ne peut pas être implémenté sans cette précision. Recommandé : ajouter un exemple explicite pour le cas récurrent.

### F3 — Cohérence : double numérotation FR-2.4

Il y a deux sections nommées `FR-2.4` : "Membres sans déclarations" et "Partie épisodique (pool)". La seconde devrait être `FR-2.5`. Mineur mais cause une confusion dans les références croisées.

### F4 — Scope : F3 (Vote) potentiellement prématuré

Le vote (F3) suppose que le calcul automatique "ne suffit pas à trancher" — mais pour un scope perso/ami avec 4-6 joueurs et un MJ qui peut décider seul, ce cas est rare. F1 + F2 seuls résolvent le problème central (trouver une date sans WhatsApp). F3 ajoute ~40% de complexité de données (3 nouveaux modèles) pour un cas marginal. Envisager de séparer F3 en sous-palier 2b pour livrer de la valeur plus tôt.

### F5 — Modèle de données : contrainte d'unicité manquante sur PollVote et index manquant sur SessionPoll

`PollVote` a `@@unique([optionId, userId])` — correct. En revanche, `SessionPoll` n'a pas d'index sur `(partieId, status)` alors que FR-3.5 (un seul vote actif par partie) implique une requête fréquente `WHERE partieId = ? AND status = OPEN`. Sans index, cette contrainte métier sera lente à vérifier et risque de ne pas être enforced côté base (pas de contrainte unique partielle). Ajouter `@@index([partieId, status])` et documenter la règle d'unicité "un seul OPEN par partie" dans le service.
