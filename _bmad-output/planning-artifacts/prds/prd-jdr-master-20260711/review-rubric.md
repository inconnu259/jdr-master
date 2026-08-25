# PRD Quality Review — prd-jdr-master-20260711 (Palier 4 : Sessions, rapports, événements/missions, annonces MJ)

## Overall verdict

This is a well-earned PRD: every FR carries a testable consequence, the Glossary is load-bearing and consistently reused, and the linear/épisodique branching (FR-9, FR-17/18, FR-19) is worked through with real edge cases rather than hand-waved. The main risk is mechanical, not substantive — the Assumptions Index (§9) references three inline assumptions that are never actually tagged `[ASSUMPTION: …]` in the body, breaking the roundtrip a downstream skill (architecture/epics) would rely on to find them. Non-Goals are honest and specific, but `[NOTE FOR PM]` tagging in §6.2 is applied to only 2 of several comparably real deferrals, which will read as arbitrary to a downstream reader skimming for open tensions.

## Decision-readiness — strong

Decisions are stated as decisions, not softened into "considerations." FR-19 is the clearest example: the hard cap ("l'inscription se ferme automatiquement dès que le nombre maximum est atteint") is explicitly separated from the MJ's manual validation ("le système ne verrouille/valide jamais une date automatiquement, même une fois le minimum atteint") — a real trade-off (some friction for the MJ) stated plainly rather than smoothed over. FR-9 states the linear/épisodique split as a hard constraint with a named failure mode ("ouvrir un deuxième scénario alors qu'un autre est déjà `Courant` échoue"). §8 Open Questions is genuinely thin (1 item) and that item is honestly scoped ("pas structurant pour l'architecture/les epics") rather than a rhetorical question answered in the next line.

No findings — this dimension does not need fixing.

## Substance over theater — strong

No persona theater: §2 uses JTBD + role-based UJs rather than padded demographic personas. No differentiation/competitive section was force-fitted in. The Vision (§1) is specific to this product's mechanics (Brouillon → À venir anti-spoil → Courant → Passé, campagne = enchaînement de scénarios) — it could not swap into an unrelated PRD unchanged. No NFR boilerplate ("must be scalable/secure") appears; security constraints (e.g., "403 pour tout autre rôle" in FR-1) are stated as concrete, testable FR consequences instead.

No findings.

## Strategic coherence — strong

The thesis is explicit and consistent: move narrative content (currently living in Discord/Google Docs, per §1 and the Success Metric) into the app, with anti-spoil chronology as the structural device that makes campaigns (not just one-shots) work. Feature order follows the thesis (Scénario → cycle de vie/anti-spoil → séances → rétrospective → participation → annonces), not an arbitrary backlog order. The Success Metric (§7) is thesis-validating ("plus de Discord/Google Docs pour la description et les documents") rather than an activity count, and a counter-metric is explicitly named (anti-spoil leakage) — exactly what the rubric asks for.

No findings.

## Done-ness clarity — strong

Every one of FR-1 through FR-20 carries a "Conséquences (testables)" block with concrete, checkable conditions (HTTP-style codes, state-machine transitions, visibility rules per role). No instances of "handles X gracefully" or "reasonable performance" found. The one open item that would normally read as a done-ness gap — FR-19's color indicator — is explicitly deferred to UX with a named reason ("palette exacte à trancher en UX"), not silently left vague.

### Findings
- **low** No dedicated NFR/bounds section for cross-cutting constraints (§5, "Pas de limite stricte de taille/format sur les documents joints — à trancher en architecture") — file-size/format limits for the new document-attachment feature (FR-2/FR-3) are deferred wholesale to architecture with no interim bound stated, even provisionally. *Fix:* either state a provisional bound (e.g., "same ceiling as the existing portrait upload, Story 4.5") or explicitly tag it `[ASSUMPTION]` and add to §9 so downstream architecture treats it as a confirmed input, not a blank.

## Scope honesty — adequate

§5 Non-Goals is substantive (9 items, each with a stated reason, e.g. "cohérent avec le choix déjà fait pour l'historique de personnage (Palier 3)") — this is doing real work, not a checkbox list. §9 Assumptions Index has 3 entries. However, the roundtrip between the Assumptions Index and the body is broken, and `[NOTE FOR PM]` tagging in §6.2 is inconsistent.

### Findings
- **medium** Assumptions Index entries have no inline `[ASSUMPTION: …]` tag at their source location (§9 vs. §4.1/FR-1, §4.4/FR-16, §5). E.g., §9 says "§4.1 (FR-1) — Pour `ONE_SHOT`, le scénario unique est créé automatiquement… **assumption, à confirmer en UX**" but the FR-1 text itself (lines 66–73) contains no `[ASSUMPTION]` marker — a reader of FR-1 alone would not know this line is an unconfirmed inference. *Fix:* add inline `[ASSUMPTION: …]` tags at the three source locations so the index is discoverable from either direction.
- **low** `[NOTE FOR PM]` in §6.2 is applied to only 2 of 6 "Out of Scope pour MVP" items (flow agence, notifications e-mail) while comparably real deferrals in the same list (e.g., "Pas de suppression d'un scénario clôturé," "Pas de graphe de dépendances formel entre scénarios") get no tag, despite §5 giving the dependency-graph omission real justification. The asymmetry makes it unclear whether the untagged items are settled or just untagged. *Fix:* either tag every item that represents a genuine deferred tension, or state the tagging rule (e.g., "`[NOTE FOR PM]` marks items PM may want to revisit before Palier 8").
- **low** §5 (Non-Goals) and §6.2 (Out of Scope pour MVP) largely restate the same list with different wording and partial overlap (e.g., "flow agence," "notifications e-mail," "frise chronologique," "graphe de dépendances," "compte-rendu joueur" appear in both; "entité Événement," "limite de taille documents," "suppression scénario clôturé," "conflits d'agenda" appear only in §5). This is a maintenance-drift risk — a future edit to one list is unlikely to be mirrored in the other. *Fix:* keep §5 as the single source of Non-Goals with rationale, and let §6.2 simply reference it rather than duplicate items.

## Downstream usability — strong

Glossary (§3) is genuinely load-bearing: terms like `Scénario`, `Statut de scénario` (Brouillon/À venir/Courant/Passé), `Séance`, `Compte-rendu de séance` vs. `Résumé de fin de scénario`, and `Inscription à capacité limitée` are defined once and reused identically across FRs, Non-Goals, and MVP Scope without drift. FR IDs (FR-1…FR-20) and UJ IDs (UJ-1…UJ-4) are contiguous with no gaps or duplicates. Cross-references resolve: spot-checked `cf. FR-17` (§4.5/FR-9→ FR-17, exists), `cf. FR-9` (FR-18→FR-9, exists), `cf. FR-19` (multiple), `cf. FR-5/FR-7` (Non-Goals), all valid. Each numbered section is reasonably self-contained via Glossary terms rather than "see above."

No findings.

## Shape fit — strong

This is a personal/hobby-scope (`scope: personal / scope-1`), small-fixed-group tool with one MJ and a handful of players — the PRD matches that shape: UJs are deliberately compressed to one sentence each (§2.3, "UJ formulées en une phrase… pas de flow détaillé"), there is no persona deck, no competitive differentiation section, and Success Metrics are explicitly lightweight by design ("Périmètre hobby — un critère de succès simple suffit"). At the same time it doesn't under-formalize where it matters: the state machine (Brouillon/À venir/Courant/Passé) and the linear-vs-épisodique branching get full FR-level rigor because those are the structurally load-bearing decisions. This is the right rigor allocation for the stated scope.

No findings.

## Mechanical notes

- **Assumptions Index roundtrip**: broken (see Scope Honesty finding above) — 3/3 index entries (§9) lack inline `[ASSUMPTION]` tags at their source location.
- **Glossary drift**: none found. Status names (`Brouillon`, `À venir`, `Courant`, `Passé`) and model names (`Partie`, `Scénario`, `Séance`, `CharacterNote`) are used with consistent case throughout.
- **ID continuity**: FR-1…FR-20 and UJ-1…UJ-4 are contiguous, unique, no gaps.
- **Cross-references**: spot-checked references (FR-9↔FR-17, FR-18↔FR-9, FR-8↔FR-9, FR-10↔FR-15, FR-19 referenced from §4.5/§5/§6.1) all resolve to existing FRs.
- **`[NOTE FOR PM]` / Non-Goals overlap**: §5 and §6.2 duplicate list content with inconsistent tagging (see Scope Honesty finding).
- **UJ protagonist naming**: protagonists are role-based ("le MJ," "un joueur") rather than individually named — appropriate for this single-MJ/small-group hobby scope, not a finding.
