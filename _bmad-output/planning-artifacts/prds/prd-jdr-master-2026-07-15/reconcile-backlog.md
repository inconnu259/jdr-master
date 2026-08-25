# Reconciliation: docs/backlog.md (Palier 5) vs prd.md (2026-07-15)

## Backlog Palier 5 bullets (docs/backlog.md, lines 87-108)

1. Personnage du MJ ("Homme Dragon", Ryuutama) : fiche distincte (un seul par Partie), progression
   automatique (fonction du nombre de scénarios `PASSE`, pas d'XP distribuée), export PDF propre.
   → **Covered**: FR-1 to FR-8 (creation, race/artefact, narrative fields, derived companions/history,
   auto level progression, awakening power, PS, PDF export). Matches backlog's "un seul par Partie" and
   "pas d'XP distribuée" (FR-5/FR-7).

2. Fiches de référence Ryuutama (journal, carte, monde, monstre, ville, objectifs x3, œuf de bataille,
   structure) — PDF as-is, journal/carte to all members, rest to MJ only, no dynamic fill.
   → **Covered**: FR-11, FR-12, FR-13 (10 sheets total, same two-tier access split, "servies telles
   quelles" / no dynamic fill matches Non-Goal §5 bullet 3).

3. Export PDF équipement & notes du PJ (from existing `Character.sheetData.equipment` /
   `CharacterNote`), on top of the existing full-sheet export.
   → **Covered**: FR-9, FR-10.

4. Ajout des classes et textes manquants au contenu Ryuutama seedé.
   → **NOT covered by any FR.** PRD explicitly excludes it: §5 Non-Goals states "L'ajout des
   classes/textes manquants au contenu Ryuutama seedé est traité comme du contenu, hors périmètre de ce
   PRD." This is an acknowledged narrowing, not a silent drop — but it means 1 of the 4 backlog bullets
   has zero FR coverage and is fully deferred to a separate future PRD/content pass.

## Gaps / tensions found

1. **Backlog item 4 (classes/textes manquants seedés) has no FR** — explicitly pushed out of scope via
   Non-Goals §5. Acknowledged in the PRD, but the PRD as a spec artifact does not schedule or reference
   where/when this will be picked up. Worth a forward pointer if not already tracked elsewhere in
   `docs/backlog.md`.

2. **Generalization principle vs "Ryuutama-specific" Non-Goal — unresolved tension.** Backlog's Palier 5
   intro explicitly frames the palier around generalization: "ce qui est générique (mécanisme de fiche
   typée, plugin) doit rester réutilisable par d'autres systèmes." The PRD's Non-Goals §5 states "Pas de
   registre générique de plugin multi-système — reste spécifique à Ryuutama, comme le reste du moteur de
   fiche aujourd'hui." The PRD defers the "comment" to the architecture spine (§0) without restating
   within its own text how/whether the spine's typed-sheet mechanism actually satisfies the backlog's
   reusability intent. A reader of the PRD alone cannot confirm the generalization goal is met — this
   should be explicitly cross-checked against the architecture spine (AD-1 to AD-4) rather than left
   implicit.

No other drops, narrowings, or contradictions found — race/artefact counts, access split (MJ vs all
members), "un seul Homme Dragon par Partie", and the export-PDF scope all line up between the two
documents.
