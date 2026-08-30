# Deferred Work

Registre des items de dette technique/UX identifiés en cours de développement (revue de code, dev-story, vérification visuelle) mais non traités immédiatement.

**Ce fichier ne contient QUE des items encore actifs** — jamais résolus, jamais explicitement refusés. Dès qu'un item reçoit une décision définitive (corrigé, constaté obsolète, ou accepté comme dette assumée), il est retiré d'ici et archivé dans `deferred-work-archive.md` avec le raisonnement de la décision. Ce fichier reste donc une vraie liste de travail — s'il contient des items, ce sont des items à traiter ; s'il est vide, il n'y a rien en attente.

**Format d'un item** : une puce, avec un tag de priorité en tête — `[P:HAUTE]` (bug/trou fonctionnel réel), `[P:MOYENNE]` (écart UX/architecture réel mais non bloquant), `[P:BASSE]` (nit, cosmétique, gap de test isolé) — suivi du texte et, entre crochets en fin de ligne, le(s) fichier(s) concerné(s).

**Historique** : `deferred-work-archive.md` — 518 items triés le 2026-08-25 (96 résolus, 420 acceptés/non actifs). Deux décisions produit tranchées ce jour-là : sections manquantes de l'Agenda (comportement confirmé définitif) et unification du libellé « Soirée »/« Soir » (uniformisé vers « Soir »).

---

## Deferred from: code review of 31-2-surface-de-detail-adaptative (2026-08-25)

- [P:BASSE] Cible tactile de `.sheet__detail-trigger` limitée au texte du nom (pas de `min-height`/padding dédiés) — risque de régression de taille de cible tactile mobile (WCAG 2.5.5), non couvert par un AC de la story (AC7 exige un élément interactif réel visuellement identique à l'ancien `<strong>`, pas une taille de cible minimale). [apps/web/src/app/features/characters/character-sheet/character-sheet.scss:99-114]
- [P:BASSE] Seuil `1024px` dupliqué en dur dans une constante TS et deux `@media` SCSS, aucune source unique nommée — pattern déjà établi ailleurs dans le projet (`CalendarView.DESKTOP_QUERY`), pas introduit par cette story mais jamais centralisé. [apps/web/src/app/shared/detail-surface/detail-surface.ts:36, detail-surface.scss:8,20]

## Deferred from: code review of 31-3-aide-contextuelle-sur-les-termes-de-jeu (2026-08-29)

- [P:BASSE] Garde AC3 (« pas de texte au catalogue ⇒ pas de déclencheur ») non appliquée aux déclencheurs FR-20 préexistants (talents/avantages/sorts de la fiche) — comportement hérité tel quel de la 31.2, non touché par le diff de la 31.3, hors périmètre de son AC3 (qui ne vise que les nouveaux termes FR-19). En pratique inoffensif : ces catalogues (`class`, `type`, `spell`) exigent un texte non vide au seed. [apps/web/src/app/features/characters/character-sheet/character-sheet.html:227,240,299]
- [P:BASSE] Aucune sémantique ARIA de divulgation (`aria-haspopup`/`aria-expanded`) sur les déclencheurs de terme — pattern hérité tel quel de `.sheet__detail-trigger` (31.2), reproduit à l'identique par la 31.3 sur les nouveaux emplacements (`class-step`, `type-step`) ; pas une régression introduite par cette story, mais jamais corrigé depuis. [apps/web/src/app/shared/detail-surface/detail-surface.html]
