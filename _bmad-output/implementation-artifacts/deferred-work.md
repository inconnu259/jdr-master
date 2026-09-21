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

## Deferred from: code review of 31-4-refonte-du-parcours-de-creation-de-personnage (2026-09-20)

- [P:BASSE] La surface de détail modale (desktop) ne verrouille pas le défilement de la page derrière le voile — conséquence du passage en modal (31.4) ; la feuille mobile se comporte pareil depuis la 31.2.
- [P:BASSE] L'option de classe est structurée (tableau + récit) dans l'assistant mais en `body` simple sur la fiche (`ClassChoiceDisplay` ne porte que l'effet résolu du talent parent) — à unifier si la fiche reçoit le talent parent complet.

## Deferred from: bmad-review (Adversarial/Edge-Case Hunter/Verification Gap) of 29-15-un-bouton-clair-pour-creer-son-personnage-depuis-la-partie (2026-09-21)

- [P:MOYENNE] Aucune garde côté route pour `/parties/:id/characters/new` — la 29.15 gate uniquement les points d'entrée UI (bouton, slot roster, atterrissage d'onglet) ; une URL directe/en favori vers l'assistant de création reste ouverte sur un système sans module ou une partie clôturée, même après cette story. Gelé explicitement hors périmètre par la story elle-même (`Boundaries & Constraints → Never : « Ne pas modifier la garde 404 de character-wizard.ts »`) — la garde côté route est prévue par la validation serveur de la story 29.17, pas avant. [apps/web/src/app/features/characters/character-wizard/character-wizard.ts]
- [P:BASSE] `packages/shared/src/index.ts` (`GAME_SYSTEMS[].module`) et `apps/api/src/game-systems/supported-game-systems.ts` (`SUPPORTED_GAME_SYSTEMS`) restent deux listes maintenues indépendamment, protégées seulement par un test de parité (`supported-game-systems.spec.ts`) ajouté lors de la revue interne du 2026-09-21 — pas par une dérivation structurelle qui rendrait la divergence impossible. Amélioration naturelle pour la story 29.17, qui touche déjà ce terrain côté serveur.
- [P:BASSE] `character.no_character_yet` (onglet « Ma fiche ») affiche le même message générique que la raison soit « système sans module », « partie clôturée » ou « pas encore créé » — le bouton disparaît sans que le joueur sache pourquoi dans les deux premiers cas. Corriger exigerait 2 clés thématisées supplémentaires ×3 thèmes et une logique de branchement ; déjà noté comme rejet `low` dans le Review Triage Log de la story lors de sa revue interne, reconduit ici pour rester tracé explicitement plutôt que noyé dans un paragraphe de log. [apps/web/src/app/features/parties/partie-detail/partie-detail.html:234, apps/web/src/app/core/theme/tones.ts]

