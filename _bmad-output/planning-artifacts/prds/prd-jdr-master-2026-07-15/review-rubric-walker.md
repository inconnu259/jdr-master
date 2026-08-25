# PRD Quality Review — prd-jdr-master-2026-07-15 (Palier 5 — Homme Dragon & fiches de référence)

## Overall verdict

A disciplined, appropriately-scaled hobby-stakes PRD. Its strongest asset is mechanical: every one of the 13 FRs carries a "Consequences (testable)" block, which is exactly what downstream story-writing needs and most PRDs at this scope skip. The thesis (MJ's character sheet should self-maintain, never be re-entered by hand) is clear and the feature set actually serves it, with the two bolt-on features (FR-9/10 PDF exports, FR-11/13 reference sheets) honestly framed as "en complément" rather than forced into the same arc. Risk is concentrated in a handful of underspecified edges — the multi-level-jump case in FR-6, the unstated rationale for which reference sheets are MJ-only vs open — and a couple of mechanical slips (a skipped section number, an inconsistent cross-reference) that cost nothing to fix.

## Decision-readiness — adequate

Trade-offs are largely named as decisions rather than smoothed over: FR-7's "no PS tracked in-app, stays managed at table" is stated with its own Out of Scope line and echoed in the Success Metrics counter-measure ("ne pas ajouter de complexité... tant qu'aucun besoin concret ne l'exige"), which is a real, load-bearing trade-off, not filler. Open Questions are genuinely open — OQ-1 (single Homme Dragon per Partie foreclosing a future multi-PNJ roster) names a real future tension instead of answering itself in the next sentence.

One gap: FR-11 vs FR-12 splits the 10 reference sheets into "open to all" (journal, carte) vs "MJ-only" (monde, monstre, ville, objectif ×3, œuf de bataille, structure), but the PRD never states *why* that split falls where it does. §4.1's feature-specific NFR explicitly reasons through the analogous access question ("aucune donnée exposée ne révèle un scénario non joué — pas de risque de spoil"), which makes the silence on FR-11/12's rationale more noticeable by contrast — a reader (or future contributor extending the list) has to infer "these contain content that could spoil" rather than being told.

### Findings
- **medium** Unstated rationale for FR-11/FR-12 access split (§4.3) — the PRD asserts which reference sheets are MJ-only without saying why (presumably spoiler risk, by analogy to §4.1's NFR), leaving the boundary rule implicit for anyone adding an 11th sheet later. *Fix:* one sentence, e.g. "Fiches ouvertes = outils vierges sans contenu de scénario ; fiches MJ-only = contiennent des éléments qui pourraient spoiler (stats de monstre, objectifs de quête)."

## Substance over theater — strong

No persona theater (JTBD list, not persona cards); the Vision paragraph is specific to this product (race, artefact, PS numbers) and couldn't be swapped into another PRD unchanged. The one NFR that exists (§4.1, read/write split) is concrete and justified rather than boilerplate ("must be secure"). Nothing here reads as furniture.

## Strategic coherence — strong

The thesis — the MJ's own character should evolve automatically from real campaign state, never hand-recalculated — is explicit in the Vision and directly drives FR-4/5/6/7 (voyageurs, historique, niveau, éveil, PS all "calculé", never saisi). Success Metrics validate that thesis directly ("le MJ utilise la fiche... sans revenir à un suivi papier/externe") rather than measuring generic activity, and a counter-metric is named. FR-9/10/11-13 are structurally secondary and the PRD says so ("En complément...") instead of pretending they serve the same arc — that's honest bundling, not incoherence.

## Done-ness clarity — adequate

This is the dimension with the most going for it mechanically (every FR has testable Consequences) but one real edge case is underspecified.

FR-6 states the power-choice prompt "ne contient que les pouvoirs du niveau nouvellement atteint" and "un choix déjà fait à un niveau donné n'est pas re-proposé" — which implies per-level tracking, but never states what happens when a MJ closes several scenarios between visits and jumps more than one level at once (e.g., closing scenarios 2 and 3 together crosses both the niveau-2 threshold... actually per FR-5's thresholds, closing scenario #3 alone jumps straight from niveau 1 to niveau 3, skipping the niveau-2 threshold entirely since niveau 2's own threshold isn't listed — worth double-checking against FR-5's stated mapping, which only lists 1→niv2, 3→niv3, 7→niv4, 12→niv5). Does the MJ get prompted once (for the final level reached) or once per intermediate level? The Consequences as written are consistent with either reading.

No vague/unfalsifiable language ("gracefully," "reasonable," "user-friendly") appears anywhere in the FR set — a real strength for a hobby-scope PRD.

### Findings
- **medium** FR-6 doesn't specify behavior when multiple level thresholds are crossed between two fiche visits (§4.1 FR-6) — unclear whether the MJ is prompted once per skipped level or only for the final level reached. *Fix:* add a consequence, e.g. "Si plusieurs niveaux sont franchis entre deux consultations, le MJ est invité à choisir un pouvoir d'éveil pour chacun des niveaux intermédiaires, un par un."

## Scope honesty — strong

Non-Goals (§5) does real work — it's not a token section, it lists 7 specific exclusions each tied back to a FR or design choice (e.g. no artifact history ↔ FR-2's Out of Scope). Both `[ASSUMPTION]` tags are indexed at §9 and both index entries have a matching inline tag — clean roundtrip. The one `[NOTE FOR PM]` (§6.2, deferred decision on dynamic sheet-filling) sits at a genuine unresolved tension rather than a safe checkpoint. Open-items density (2 OQ + 2 ASSUMPTION + 1 NOTE) is proportionate to hobby stakes.

## Downstream usability — adequate

Glossary is present and its six terms are used consistently in-body (Homme Dragon, Race, Artefact, PS, Pouvoir d'éveil, Fiche de référence, Scénario `Passé`). FR IDs are contiguous (FR-1…FR-13) with no gaps or duplicates. Two mechanical slips reduce cleanliness slightly (see Mechanical notes below) but neither blocks a downstream reader.

## Shape fit — strong

Correctly shaped for a hobby/solo-operator PRD: light UJ set (3, role-generic protagonists "Le MJ" / "Un joueur" rather than named individuals) matches a single-operator tool where UJs are useful but not load-bearing; capability-spec-style FRs with testable consequences carry the actual weight, which is the right call here. Not over-formalized (no persona deck, no forced NFR boilerplate) and not under-formalized (UJs still walk through the real flows, including one explicit edge case in UJ-2).

## Mechanical notes

- §2 jumps from "2.1 Jobs To Be Done" straight to "2.3 Key User Journeys" — no 2.2 exists. Cosmetic but worth fixing before this PRD is cited by section number downstream.
- §0 references a prior document as `prd-jdr-master-20260711` (no dashes), while this document's own identifier uses dashes (`prd-jdr-master-2026-07-15`) — inconsistent ID format makes the cross-reference easy to mistype when searching for the file.
- UJ protagonists are role-generic ("Le MJ", "Un joueur") rather than named individuals carrying context inline — acceptable given Shape fit (hobby/solo tool), flagged only because the rubric's downstream-usability check calls for named protagonists by default.
- Assumptions Index roundtrip: clean, both entries verified inline and indexed.
