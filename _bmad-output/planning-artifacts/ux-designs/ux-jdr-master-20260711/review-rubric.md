# Spine Pair Review — jdr-master (Palier 4 delta)

## Overall verdict
This delta is a clean, disciplined extension of the inherited spine: every FR in the Palier 4 PRD maps to a Key Flow or State Pattern, every new token is a reuse with an explicit justification (no undeclared hex), and the two mockups are linked at the right sections and match the frontmatter token values. The one real gap is structural rather than a content omission: the MJ-only "vue des Brouillons" (§2) is explicitly flagged `[ASSUMPTION]` with no mock and no component spec, which is a legitimate open item for implementation but should be named as a known gap rather than left implicit in a single paragraph. A few component/behavior pairs (`AnnonceCard` publish form, `ScenarioCard.actions-mj` in linear mode) are thinner on the DESIGN.md visual side than the EXPERIENCE.md behavioral side. Overall: strong.

## 1. Flow coverage — strong
Checked every FR (FR-1…FR-20) and UJ (UJ-1…UJ-4 PRD, UJ-1…UJ-4 EXPERIENCE.md §8) for a home in the delta.
- All 4 EXPERIENCE.md UJs have a named protagonist (Sylas/Alice), numbered/prose steps, an explicit **Climax**, and either a **Résolution** or a failure/edge path (UJ-1: no-notification-on-edit path; UJ-3: MJ validates below threshold; UJ-4: Brouillon never shown to players).
- FR-to-flow traceability is complete: FR-1..FR-4 → UJ-1 (creation/edit) + §2 IA; FR-5..FR-10 → UJ-4 (Brouillon) + §5 State Patterns; FR-11..FR-14 → UJ-1 (séances/comptes-rendus) + §4; FR-15/16 → UJ-2 (rétrospective/journal); FR-17/18 → §4 "Fiche scénario — Courant, épisodique"; FR-19 → UJ-3; FR-20 → §4 "Annonces".
### Findings
- **low** The MJ-facing "vue des Brouillon" flow (create Brouillon → view dedicated list → open) is described only as a state/IA note (§2, `[ASSUMPTION]`), never as its own Key Flow step-by-step, even though UJ-4 references it in passing ("Il crée ce scénario en `Brouillon`"). (EXPERIENCE.md §2, §8 UJ-4). *Fix:* either fold a 2–3 step micro-flow for the dedicated Brouillon view into UJ-4, or explicitly note in §2 that this is deferred to implementation discretion (it already is marked `[ASSUMPTION]`, but a downstream story-dev reader has no interaction detail to build from).
- **low** PRD FR-9's failure case ("ouvrir un deuxième scénario alors qu'un autre est déjà Courant échoue — message explicite au MJ" in linear mode) has no corresponding State Pattern row or error microcopy key in EXPERIENCE.md §3/§5. (EXPERIENCE.md §5; PRD FR-9). *Fix:* add a state row ("Tentative d'ouverture d'un 2ᵉ scénario Courant en linéaire" → message d'erreur explicite) and a `sessions.*` microcopy key.

## 2. Token completeness — strong
Extracted the frontmatter YAML (none declared new in this delta — delta declares no `colors`/`typography`/`spacing` block of its own, relying entirely on prose `{token}` references) and all `{colors.*}`, `{typography.*}`, `{spacing.*}`, `{rounded.*}`, `{elevation.*}` references in DESIGN.md prose and YAML component blocks.
- All referenced tokens resolve up the inheritance chain: `{colors.accent-1}`, `{colors.accent-2}`, `{colors.accent-1-rgb}`, `{colors.text-muted}`, `{colors.status-unknown}`, `{colors.status-unavailable}`, `{colors.status-mixed}`, `{colors.status-available}`, `{colors.border-subtle}`, `{colors.surface-bg-2}` all trace to `20260626/DESIGN.md` §2 (base) except `surface-bg-2` and `accent-1-rgb`/`accent-2-rgb`, which resolve to `20260708/DESIGN.md` §2 (declared there as the "gap comblé" fix) — chain confirmed, no missing hex.
- `{typography.text-lg}`, `{typography.text-sm}`, `{typography.text-base}` → `20260626/DESIGN.md` §3. `{rounded.radius-card}`, `{rounded.radius-badge}` → §6. `{elevation.card}` → §5. `{spacing.bp-tablet}` → §4 Breakpoints (768px). All resolve cleanly.
- Mockup CSS custom properties (`fiche-scenario-20260711.html`, `timeline-A-responsive-20260711.html`) mirror the resolved hex values exactly (e.g. `--accent-1: #7ec8a4`, `--status-mixed: #f0a030`), confirming the chain was actually walked, not just cited.
### Findings
None — no missing or unresolved tokens found.

## 3. Component coverage — adequate
Extracted every component name used across both files: `ScenarioStatusBadge`, `ScenarioTimeline`, `FillIndicator`, `ScenarioCard`, `DocumentRow`, `RetrospectivePanel`, `AnnonceCard` (all new, DESIGN.md §7) plus reused: `CharacterSummaryCard`, `PollOption`, `NotesJournal`, `FieldEditPencil`, `AvailabilityBadge`, `WeekCell`/`DayCell`.
- All 7 new components have a DESIGN.md visual YAML block (§7) and an EXPERIENCE.md behavioral description (§4 Component Patterns) — no orphans in either direction.
### Findings
- **medium** `AnnonceCard` has a DESIGN.md visual spec (background/border/scope-label/date-label) but its EXPERIENCE.md behavioral coverage is a single sentence bundling publish-form + display-order, with no interaction rule for the "publish" form itself (validation, character limit, who can select which scope options in which context) comparable to the depth given to `FillIndicator`/`Inscription`. (DESIGN.md §7 AnnonceCard; EXPERIENCE.md §4 "Annonces"). *Fix:* add 2–3 behavioral rules (e.g. can the MJ pick "Ce scénario" for a scenario that's still `Brouillon`? what happens on empty text submit?) or explicitly state these are deferred to implementation.
- **low** `ScenarioCard.actions-mj` in DESIGN.md §7 distinguishes linear ("CTA gradient") vs episodic ("bordure rouge discrète 'btn-danger-outline'") styling for the same "Clôturer le scénario" action, but EXPERIENCE.md's flow description (§4 "Fiche scénario — Courant, linéaire") only names the CTA once without noting the visual-weight distinction is deliberate per-mode — a downstream reader might miss that the styling difference is intentional rather than an inconsistency. (DESIGN.md §7 ScenarioCard.actions-mj; EXPERIENCE.md §4). *Fix:* one sentence cross-reference in EXPERIENCE.md §4 episodic subsection.

## 4. State coverage — strong
Walked every IA surface (ScenarioTimeline, Fiche scénario ×3 states, Inscription capacité limitée, RetrospectivePanel, Annonces) against the applicable state set (empty/cold/focus/error/anti-spoil/permission).
- `Brouillon`/`À venir`/`Courant`/`Passé` visibility states: covered (§5, first 5 rows).
- Fill states (under-min/between/at-max): covered, including the "closed but not auto-validated" nuance explicitly called out as a common trap (§5 row 8, DESIGN.md §8 Don't).
- Empty/incentive state for unwritten résumé de fin: covered (§5 row 9).
- Journal association toggle default/changed-later semantics: covered (§5 rows 10–11).
- Post-edit-after-invite (no notification) state: covered (§5 row 12).
- Library document always-visible state: covered (§5 row 13).
### Findings
- **low** No explicit "0 inscrits" cold-start state for `FillIndicator` is called out (only under-min/between/at-max) — presumably `0 < min` falls under "sous le minimum" already, but it's not stated that the indicator renders meaningfully at 0 (vs. an empty/blank bar). (EXPERIENCE.md §5; DESIGN.md §7 FillIndicator). *Fix:* one-line clarification that 0 inscrits is the `status-unavailable` floor state, not a separate empty state, if that's the intent.
- **low** No error/failure state documented for a joueur attempting to s'inscrire after the max is reached mid-click (race condition — two players clicking near-simultaneously when 1 slot remains) beyond PRD FR-19's "message explicite" — EXPERIENCE.md doesn't specify the message or UI treatment. (EXPERIENCE.md §5/§6; PRD FR-19). *Fix:* add a state row or interaction note for the race/rejection case.

## 5. Visual reference coverage — strong
Two files in `mockups/`: `fiche-scenario-20260711.html`, `timeline-A-responsive-20260711.html`.
- Both are linked inline in EXPERIENCE.md §8 with a one-line description of what each illustrates (states covered), and `fiche-scenario` is also referenced from §2 ("Cf. `mockups/fiche-scenario-20260711.html`"). `timeline-A-responsive` is referenced implicitly via DESIGN.md §4/§7 prose ("cf. mock" language) though DESIGN.md doesn't hyperlink it directly — the EXPERIENCE.md §8 link is the canonical pointer, consistent with the doc's own "spine wins on conflict, mockups are illustrative" framing.
### Findings
- **low** DESIGN.md never hyperlinks either mockup file directly (only EXPERIENCE.md §8 does) — DESIGN.md §4 ScenarioTimeline section describes the "bug corrigé en Discovery" in prose without pointing the reader to the mock that demonstrates the fix. (DESIGN.md §4). *Fix:* add a one-line "cf. mockups/timeline-A-responsive-20260711.html" pointer in DESIGN.md §4, consistent with how `20260708/EXPERIENCE.md` §8 cites its mocks (DESIGN.md itself doesn't set this precedent either, so this is a minor consistency nit, not a broken convention).

## 6. Bloat & overspecification — strong
No padding detected. Every YAML component block in DESIGN.md ties to a concrete FR or Discovery decision cited inline (e.g. FillIndicator explicitly says "validé avec l'utilisateur"). The `[ASSUMPTION]` markers (Brouillon view, upload limit) are appropriately terse rather than over-elaborated speculation. Prose in DESIGN.md §1–§6 stays proportionate to what's actually new (mostly "aucun nouveau X" one-liners), avoiding restating inherited material verbatim.

## 7. Inheritance discipline — strong
- `sources` frontmatter in both DESIGN.md and EXPERIENCE.md resolves: PRD path, and the 3 upstream design/experience pairs (20260708, 20260703, 20260626) all exist and were read successfully.
- UJ names: PRD UJ-1..UJ-4 map conceptually to EXPERIENCE.md UJ-1..UJ-4 (not verbatim text, but PRD UJs are one-sentence JTBD reformulations by design per PRD §2.3 — EXPERIENCE.md correctly expands them into full flows rather than quoting, which is the expected relationship, not drift).
- Glossary terms (`Scénario`, `Séance`, `Brouillon`/`À venir`/`Courant`/`Passé`, `Compte-rendu`, `Résumé de fin`, `Inscription à capacité limitée`, `Annonce`) are used identically between PRD §3 and both DESIGN.md/EXPERIENCE.md — no renaming or drift detected.
- Component names identical across all sections in both files: `ScenarioStatusBadge`, `ScenarioTimeline`, `FillIndicator`, `ScenarioCard`, `DocumentRow`, `RetrospectivePanel`, `AnnonceCard` all spelled consistently between DESIGN.md §7 and EXPERIENCE.md §4/§8. Reused components (`CharacterSummaryCard`, `PollOption`, `NotesJournal`, `FieldEditPencil`) match their origin-document names exactly.
- EXPERIENCE.md token references resolve to DESIGN.md tokens by name across the full chain — verified in §2 above.
- One deliberate, well-flagged terminology divergence: `sessions.scenario_status_courant` microcopy is "En cours" while the technical/glossary name stays "Courant" — explicitly called out as intentional (EXPERIENCE.md §3, "le mot 'Courant' reste le nom technique... pas la chaîne affichée"), which is good discipline, not drift.
### Findings
None beyond the itemized findings already listed under other categories.

## 8. Shape fit — strong
- DESIGN.md sections in canonical order (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts), matching both the example file and the inherited deltas.
- EXPERIENCE.md required defaults present in canonical order (Foundation → IA → Voice and Tone → Component Patterns → State Patterns → Interaction Primitives → Accessibility Floor → Key Flows → Responsive & Platform) — matches `20260708/EXPERIENCE.md` structure exactly, including keeping "Responsive & Platform" as its own trailing section (present here, appropriately non-trivial given the ScenarioTimeline orientation-flip is a genuine structural divergence, not just density).
- No invented top-level sections; the "Inspiration & Anti-patterns" section from the example file is correctly omitted (not applicable to an internal hobby-scope delta — consistent with its absence in all three inherited deltas too).

## Mechanical notes
- No broken cross-refs found: all `mockups/*.html` links in EXPERIENCE.md §8 resolve to files that exist; all `inherits`/`sources` frontmatter paths resolve to existing files.
- Frontmatter complete in both files (title/status/updated/themes-or-design_ref/ui_system-or-inherits/sources) — no missing required keys relative to the example shape.
- Naming is consistent throughout: no instance found of a component, token, or glossary term spelled two different ways across the pair.
