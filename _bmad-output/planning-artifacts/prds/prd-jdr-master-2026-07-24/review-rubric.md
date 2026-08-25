# PRD Quality Review — prd-jdr-master-2026-07-24 (Palier 8 — Refonte complète des classes et textes Ryuutama)

## Overall verdict

This is a tight, honest content-and-mechanics PRD: every feature traces to a named gap between seeded data and the *Guide du Voyageur*, decisions logged in the memlog show up faithfully in the document (role assignment, weapon rework, no-migration call), and almost every FR carries a genuinely testable consequence. The main risk is structural, not conceptual — this palier's real content (class counts, attribute values, spell lists) doesn't exist yet and is deliberately deferred to per-story dictation (§0, §8 OQ1), which is the right call for this workflow but means "done" for several FRs (FR-4, FR-7, FR-11) can't be fully verified until that content lands. Mechanically, the Assumptions Index doesn't round-trip cleanly with inline tags. Nothing here blocks moving to epics/stories.

## Decision-readiness — strong

Decisions read as decisions, not hedged considerations, and the memlog confirms they were actually made with the user rather than invented for the PRD: role assignment is MJ-only "(décidé)" (§4.7, memlog line 18), the weapon-category rework states the design error explicitly ("erreur de conception identifiée par l'utilisateur," §4.4), and the no-migration call for existing characters is stated with its reasoning (not in production, §5 / memlog line 15) rather than smoothed over as a neutral trade-off.

Open Questions (§8) are genuinely open, not rhetorical placeholders with the answer already given: OQ2 (spell-learning mechanic), OQ3 (exact Prisma/DTO shape for weapon choice), and OQ4 (role reassignability) are all real unresolved tensions, correctly deferred to story time rather than answered in the next sentence.

### Findings
- **low** No `[NOTE FOR PM]` callouts anywhere in the document — the rubric expects these at real tensions (e.g. OQ2's spell mechanic, OQ4's role-reassignability question are exactly that kind of tension). *Fix:* not blocking here since the user is the sole PM and the Open Questions section already serves this function, but if this PRD template is reused for a multi-stakeholder palier, add `[NOTE FOR PM]` markers at the FRs whose consequences depend on an unresolved OQ (FR-11, FR-13).

## Substance over theater — strong

No persona theater: §2 explicitly declines a new persona and doesn't manufacture one to fill the section. No NFR theater: the one NFR invoked (NFR4, §0) is a specific, concrete constraint (gitignored content, JSON-seeded, `onApplicationBootstrap()`, never read directly by the frontend) rather than a generic "must be secure/scalable" boilerplate line. No innovation-theater differentiation section exists — appropriately, since this is an internal content palier, not a market-facing feature. The Vision (§1) is specific to this codebase's history ("Épic 4... sans texte narratif," "Épic 10... seul contenu déjà enrichi") and could not swap into another PRD unchanged.

No findings — this dimension is clean.

## Strategic coherence — strong

The thesis is explicit and singular: close the gap between minimally-seeded content and the real book (§1), and several features are framed as consequences of that thesis rather than an arbitrary feature list — e.g. FR-8/FR-9's weapon rework and FR-10's equipment choice both exist because the book's actual mechanics require them, not because they were "easy." Success Metrics (§7) are honestly qualitative given the hobby context but still validate the thesis directly (fidelity to the book, not activity metrics), and a counter-metric is named ("ne pas transformer ce palier en refonte UI générale... ni en moteur de règles de magie complet," §7) — exactly the kind of scope-guardrail the rubric is looking for. MVP scope kind reads as content-completion/problem-solving, and the scope logic (§5, §6) matches that framing consistently.

No findings — this dimension is clean.

## Done-ness clarity — adequate

Most FRs are unforgiving in the good sense: FR-1 ("Aucune classe/type/catégorie d'arme seedée n'a de champ description vide ou manquant"), FR-10 ("ne peut pas dépasser 1000 Po"), FR-12 ("exactement 4 entrées"), and FR-14's badge-priority logic are all crisp, checkable conditions with no adjective-hiding ("gracefully," "user-friendly," "reasonable" do not appear anywhere in the document). That said, a few FRs are softer than the rest:

### Findings
- **medium** FR-6's first consequence — "`validate()`/le moteur de règles continuent de fonctionner avec la nouvelle forme de talent" (§4.2) — is a "continues to work" claim rather than a bound. It's partly rescued by the clause that follows ("attributs/difficulté toujours lisibles au même endroit logique qu'aujourd'hui"), but an engineer implementing this story still has to invent the actual regression check. *Fix:* name the concrete check — e.g. "existing talent-validation unit tests pass unmodified against the new shape" or "attribute/difficulty lookup path is unchanged; only description/effect fields are additive."
- **low** FR-4's and FR-11's testable consequences ("le nombre de classes seedées correspond au nombre de classes réelles du livre"; "chaque sort seedé a au minimum un nom et une description/effet non vide") are correctly testable but set a very low bar relative to what the feature promises (a complete class catalogue, a usable spell system). This is intentional and flagged honestly via `[ASSUMPTION]` and Open Question 2 — not a defect, but worth naming so downstream story-writing doesn't mistake "catalogue exists" for "feature is finished."
- **low** FR-1's second consequence ("le frontend... affiche ce texte là où l'item est présenté") names no specific component/location, unlike FR-14 which names exact files (`RosterRow.hasPendingLevelUp`, `roster-row.util.ts`). *Fix:* name the wizard steps/components (ClassStep/TypeStep/WeaponStep, per the memlog) the way FR-14 names its files, for consistency and easier story-sizing.

## Scope honesty — strong

Non-Goals (§5) does real work — it isn't a token section: it names five specific exclusions with reasons (no player-side role voting, no character migration because pre-production, single equipment list wired with the rest deferred to Palier 9, no mechanic on occupations/actions, no wizard visual redesign). `[ASSUMPTION]` tags are used for the five genuinely unconfirmed data points (§9) and the mode of work in §0 explains up front why those are acceptable to leave open (user dictates content per story, from the physical book). Open-items density (4 Open Questions + 5 Assumptions on a 15-FR, hobby-context palier) is proportionate — high enough to be honest about what's unresolved, not so high as to suggest the PRD is avoiding decisions it could have made.

No findings — this dimension is clean.

## Downstream usability — adequate

Glossary (§3) terms are used consistently everywhere they recur: "catégorie d'arme" vs "arme précise" (FR-8/FR-9), "mode pique-nique" and "budget de départ" (FR-10), "rôle de groupe" (§4.7) all match their glossary definitions verbatim in the FRs that use them — no drift detected. FR IDs (FR-1 through FR-15) are contiguous and unique; feature numbering (4.1–4.8) matches the FR groupings. Brownfield references were spot-checked against the actual repo and are accurate: `roster-row.util.ts`, `RosterRow.hasPendingLevelUp`, `equipment-step.ts`, `seed-demo.ts`, and all the `apps/api/game-systems/ryuutama/data/*.json` files (including `attribute-patterns.json`'s stated single `Polyvalent [8,4,6,6]` entry) exist exactly as described.

### Findings
- **low** Assumptions Index roundtrip is inconsistent: only FR-4's inline text explicitly carries a `[ASSUMPTION]` marker ("`[ASSUMPTION]` ci-dessous," line ~78); the other four index entries (FR-7, FR-8, FR-10, FR-11) have no matching inline bracket tag at their point of use in §4.3/§4.4/§4.5/§4.6 — the assumption is only visible if the reader jumps to §9. *Fix:* add inline `[ASSUMPTION]` markers at FR-7 (line ~105), FR-8 (line ~115 area), FR-10 (line ~147), and FR-11 (line ~171) matching the convention FR-4 already uses, so each section is self-contained per the rubric's "pulled out alone" test.

No UJs exist in this PRD; given the shape (internal content palier, no new persona, existing MJ/joueur roles), that is appropriate rather than a gap — see Shape fit below.

## Shape fit — strong

This is a brownfield, single-operator-adjacent (hobby, existing MJ+joueurs roles, no new persona) content/capability-spec palier, and the PRD is shaped accordingly: no UJs (correctly treated as overhead here — the feature descriptions plus testable consequences carry the "done" definition instead), Success Metrics are qualitative and thesis-validating rather than forced into a growth-metric template, and the brownfield references are verified accurate (see Downstream usability above), which the rubric flags as non-negotiable for this PRD type. The rigor level (light on formal UJ/persona machinery, heavy on FR-consequence precision and explicit Non-Goals) matches a hobby-context palier that still needs to be dev-story-ready — nothing here reads as over- or under-formalized for what this document has to do.

No findings — this dimension is clean.

## Mechanical notes

- Assumptions Index roundtrip: see Downstream usability finding above — 4 of 5 index entries (§9) lack a matching inline `[ASSUMPTION]` marker at their point of use in the feature sections.
- Glossary drift: none found. All five glossary terms (§3) are used identically wherever they recur in the FRs.
- ID continuity: FR-1 through FR-15 are contiguous with no gaps or duplicates; feature sections 4.1–4.8 map cleanly onto FR groupings.
- Cross-references: all code/file references (`GameSystemService.onApplicationBootstrap()`, `attribute-patterns.json`, `FIXED_EQUIPMENT`/`equipment-step.ts`, `weaponCategoryId`, `RosterRow.hasPendingLevelUp`/`roster-row.util.ts`, `seed-demo.ts`) were spot-checked against the repository and are accurate.
- No `[NOTE FOR PM]` callouts appear anywhere; not flagged as a defect given the solo-PM context, but noted for completeness (see Decision-readiness finding).
- addendum.md was not present in the run folder and was skipped per instructions.
