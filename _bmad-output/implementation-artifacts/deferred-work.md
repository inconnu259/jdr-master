# Deferred Work

Registre des items de dette technique/UX identifiés en cours de développement (revue de code, dev-story, vérification visuelle) mais non traités immédiatement.

**Ce fichier ne contient QUE des items encore actifs** — jamais résolus, jamais explicitement refusés. Dès qu'un item reçoit une décision définitive (corrigé, constaté obsolète, ou accepté comme dette assumée), il est retiré d'ici et archivé dans `deferred-work-archive.md` avec le raisonnement de la décision. Ce fichier reste donc une vraie liste de travail — s'il contient des items, ce sont des items à traiter ; s'il est vide, il n'y a rien en attente.

**Format d'un item** : une puce, avec un tag de priorité en tête — `[P:HAUTE]` (bug/trou fonctionnel réel), `[P:MOYENNE]` (écart UX/architecture réel mais non bloquant), `[P:BASSE]` (nit, cosmétique, gap de test isolé) — suivi du texte et, entre crochets en fin de ligne, le(s) fichier(s) concerné(s).

**Historique** : `deferred-work-archive.md` — 518 items triés le 2026-08-25 (96 résolus, 420 acceptés/non actifs). Deux décisions produit tranchées ce jour-là : sections manquantes de l'Agenda (comportement confirmé définitif) et unification du libellé « Soirée »/« Soir » (uniformisé vers « Soir »).

---

## Deferred from: code review of 31-2-surface-de-detail-adaptative (2026-08-25)

- [P:MOYENNE] AC6 « focus revient au déclencheur » implémenté entièrement dans `CharacterSheet` (champ privé `detailTrigger`), pas dans le composant partagé `DetailSurface` — contredit la justification d'auto-suffisance donnée en Task 1 (éviter qu'un futur consommateur ne recrée sa propre logique). Chaque story qui réutilisera `DetailSurface` (31.3 glossaire, 31.4 assistant de création) devra réimplémenter ce tracking/refocus indépendamment. [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:230-245]
- [P:BASSE] Cible tactile de `.sheet__detail-trigger` limitée au texte du nom (pas de `min-height`/padding dédiés) — risque de régression de taille de cible tactile mobile (WCAG 2.5.5), non couvert par un AC de la story (AC7 exige un élément interactif réel visuellement identique à l'ancien `<strong>`, pas une taille de cible minimale). [apps/web/src/app/features/characters/character-sheet/character-sheet.scss:99-114]
- [P:BASSE] Seuil `1024px` dupliqué en dur dans une constante TS et deux `@media` SCSS, aucune source unique nommée — pattern déjà établi ailleurs dans le projet (`CalendarView.DESKTOP_QUERY`), pas introduit par cette story mais jamais centralisé. [apps/web/src/app/shared/detail-surface/detail-surface.ts:36, detail-surface.scss:8,20]
