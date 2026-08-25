# PRD Quality Review — prd-jdr-master-20260707 (Palier 3 — Évolution du personnage, historique & édition MJ)

## Overall verdict

This is a solid hobby-stakes PRD: concrete, testable FRs grounded in real Ryuutama rules, honest non-goals, and almost no theater. The main risk is one unaddressed interaction between the free-form MJ edit (FR-14) and the guided level-up flow (FR-5/FR-6) that could silently desync the "level is always derived, never manual" invariant the Glossaire itself states — worth a one-line clarification before implementation. A secondary, lower-stakes gap is the missing duplicate-selection rule for "Paysage ou climat favori" (chosen twice in the level table, unlike Attribut/Classe/Type which all have explicit repeat rules).

## Decision-readiness — adequate

Trade-offs are mostly named honestly rather than smoothed over. `Hors scope` callouts under FR-4 and FR-14 explicitly state what was given up (no formal Séance entity, no visual diff UI, no per-field validation). Open Questions are genuinely open (§8.1 defers a real edge case — all four attributes maxed — rather than dressing up an already-answered question), and §8.2 correctly defers a storage-format decision to architecture instead of pretending to resolve it here. `[NOTE FOR PM]` callouts land on real deferred tensions (Séance entity, revert, "Voyage légendaire" content) rather than safe checkpoints.

### Findings
- **high** MJ free-edit vs. guided level-up interaction unaddressed (§4.6 FR-14, §4.2 FR-5/FR-6) — FR-14 lets the MJ edit "n'importe quel champ de `sheetData` ... (classe, type, attributs, **XP**, ...)". Since Niveau is defined in the Glossaire as "dérivé de l'XP cumulé ... toujours recalculable depuis l'XP", an MJ changing the XP field directly would change the derived level without going through FR-6's guided PV/PE-split and capacity-choice flow. The PRD never states whether this is intended (MJ can silently grant/skip levels bypassing player choice) or should be blocked/redirected to the XP-distribution flow. This is exactly the kind of state inconsistency the Success Metrics' counter-metric (§7) warns against ("ne doit jamais faire disparaître silencieusement une information"). *Fix:* Add a sentence to FR-14 or FR-5 stating whether editing XP via MJ-edit triggers the same level-up detection/guided flow as a normal distribution, or is explicitly exempted (and why).

## Substance over theater — strong

No persona padding — the PRD sticks to two roles (MJ, joueur) that both drive real decisions throughout. The Vision (§1) is specific to this product's actual current state ("la fiche est figée... elle ne bouge plus après la création") and could not be swapped into an unrelated PRD. Success Metrics (§7) are explicitly scoped down ("un critère de succès simple suffit") rather than padded with boilerplate KPIs. No NFR-boilerplate language ("scalable," "secure," "reliable") appears anywhere. Ryuutama-specific rule tables (§4.2, addendum.md) are cited content, not invented novelty claims.

No findings — this dimension is clean.

## Strategic coherence — strong

The thesis is explicit in §1: the sheet should become "vivante" — evolve, be corrected, and stay traceable. Every feature in §4 (XP distribution → leveling → capacities → inventory/encumbrance → notes → history → MJ edit) serves that arc rather than reading as an unrelated capability list. Success Metrics (§7) validate the thesis directly (time-to-distribute-XP, player self-service understanding of level gains, MJ correcting in-app instead of via raw DB) rather than falling back to generic activity metrics, and a counter-metric is named (no silent data loss). MVP scope kind is a coherent "problem-solving" shape (make the frozen sheet functional again), and the scope boundary (§6) follows from that thesis rather than from ease of implementation.

No findings — this dimension is clean.

## Done-ness clarity — thin

Most FRs carry genuinely testable consequences (e.g., FR-3's "les autres joueurs ne sont pas affectés," FR-9's "un objet sans poids saisi est traité comme poids 0," FR-12's immutability of snapshots). No vague-adjective language ("reasonable performance," "user-friendly") was found. However, one specific rule gap undercuts the leveling feature's completeness, and it's a peer of an edge case the PRD *did* catch for a sibling capacity — which suggests it was simply missed rather than deliberately deferred.

### Findings
- **medium** No duplicate-selection rule for "Paysage ou climat favori" (§4.2 table, addendum.md) — The level table grants "Paysage ou climat favori" at both level 3 and level 7. Every other repeatable capacity in the addendum has an explicit re-selection rule: Attribut caps at 12 per attribute (and FR-8 states the fallback behavior), Classe doubles/cumulates on repeat, Type doubles bonuses on repeat. Paysage/climat has no such rule — nothing in FR-8, the addendum, or the Assumptions Index states what happens if a player picks the same paysage/climat at level 7 that they already picked at level 3 (re-pick allowed with stacking bonus? must pick a different one of the 22?). Given the PRD already flagged the analogous Attribut edge case as an Open Question, this omission looks like an oversight rather than an intentional deferral. *Fix:* Add either an `[ASSUMPTION]` tag with the intended behavior, or add it to §8 Open Questions alongside the Attribut edge case.
- **low** FR-14 also lacks a stated interaction with the sequential level-up application described in FR-5 when the MJ edits fields other than XP (e.g., directly editing a capacity list or PV/PE) — same family of gap as the high finding above but for non-XP fields; lower severity since FR-14's "sheetData in bulk, no per-field validation" framing already signals this is intentionally permissive. *Fix:* Optional — a one-line note in FR-14 that MJ edits are exempt from FR-5/FR-6's guided-flow constraints by design would close this out explicitly.

## Scope honesty — strong

Non-Goals (§5) is substantive and specific (six concrete exclusions, each tied to a reason), not a token section. `[NOTE FOR PM]` markers appear at genuinely deferred decisions (§6.2: Séance entity, revert). The two `[ASSUMPTION]` tags in §4.2 are indexed correctly in §9 (Assumptions Index), and both round-trip: same wording, same location referenced. Open-items density (2 Open Questions, 2 assumptions, 3 NOTE FOR PM markers) is appropriately low for a hobby-stakes, single-developer PRD — this isn't a green-light-to-build-at-scale document, and it doesn't read like a Swiss-cheese of unresolved tensions.

### Findings
- **low** Inconsistent NOTE FOR PM indexing — the §4.2 "Voyage légendaire" `[NOTE FOR PM]` is echoed in the §9 Assumptions Index (last bullet), but the two `[NOTE FOR PM]` markers in §6.2 (Entité Séance, Revert) are not. Not a rubric violation (only `[ASSUMPTION]` tags require index roundtrip) but the partial treatment looks like an inconsistency rather than a deliberate choice. *Fix:* Either index all NOTE FOR PM markers or none, for consistency.

## Downstream usability — adequate (light weight — see Shape fit)

FR IDs (1–14) and UJ IDs (1–4) are contiguous with no gaps or duplicates. Cross-references resolve correctly (e.g., FR-12 correctly points to FR-6 and FR-14 as its two triggers; FR-8 and FR-10 correctly reference `derived.Encombrement`). The Glossaire is used consistently by the FRs (Personnage, Niveau, Instantané, Historique, Édition MJ, Distribution d'XP all reused verbatim). One small gap: `equipment.individual`/`equipment.group`, used as a load-bearing technical anchor in §4.3's description and FR-9, are never added to the Glossaire despite Personnage's own definition citing `sheetData` structure — a minor omission for a document meant to be source-extracted downstream into architecture.

### Findings
- **low** `equipment.individual` / `equipment.group` not defined in Glossaire (§3, referenced §4.3, FR-9) — these are used as concrete data-model anchors but only appear inline; a reader of §4.3 alone (per the "each section makes sense pulled out alone" test) has to infer their shape. *Fix:* Add a one-line Glossaire entry, consistent with how `Personnage` and `Encombrement` are already defined by their underlying fields.

## Shape fit — strong

This is correctly shaped as a hobby-stakes capability spec: two role-based UJs (MJ, joueur) rather than named personas, one-sentence UJ format explicitly flagged as intentional ("Périmètre hobby — UJ formulées en une phrase... pas de flow détaillé"), a single simple Success criterion instead of a KPI dashboard, and Non-Goals sized to match a small friend-group deployment (no multi-table/multi-MJ scenario planning). The PRD correctly resists over-formalizing: no scalability NFRs, no security section beyond the existing 403-role-check pattern already established for MJ-only actions, and rigor is proportionate throughout without dropping the substance bar (FRs are still concretely testable — see Done-ness clarity above).

No findings — this dimension is clean.

## Mechanical notes

- **Glossary drift**: none found of significance. Glossaire terms (Personnage, XP, Niveau, Capacité, Distribution d'XP, Encombrement, Instantané, Historique, Édition MJ, Notes personnelles) are used with consistent capitalization and meaning across §4's FRs.
- **ID continuity**: FR-1 through FR-14 contiguous, no gaps/duplicates. UJ-1 through UJ-4 contiguous. All in-text cross-references (e.g., "cf. FR-8," "cf. §4.5," "cf. Non-Goals") resolve to sections that exist.
- **Assumptions Index roundtrip**: both `[ASSUMPTION]` tags (§4.2, two instances) are indexed in §9 with matching content. Roundtrip is clean.
- **UJ protagonist naming**: UJs use role labels ("le MJ," "un joueur") rather than named individuals (no "Alex," "Sam," etc.). Per the rubric's Shape fit guidance for hobby/solo-context PRDs this is acceptable and matches the PRD's own stated intent to keep UJs light — flagging only as a mechanical note, not a finding, since no UJ is "floating" (all four are clearly anchored to a role and a concrete trigger).
- **Required sections for stakes**: all sections expected for a hobby-stakes capability-spec PRD are present (Vision, Target User, Glossaire, Features/FRs, Non-Goals, MVP Scope, Success Metrics, Open Questions, Assumptions Index). No missing section for this shape.
