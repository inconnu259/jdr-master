# Spine Pair Review — jdr-master (Palier 3 delta)

## Overall verdict

This is a well-disciplined delta: token reuse is disciplined (no duplicated hex/spacing values), all ten new components have matched visual (DESIGN.md §7) and behavioral (EXPERIENCE.md §4) specs, and the roleadifferentiated IA is the standout decision, clearly justified and traced to a Discovery quote. The main weaknesses are in flow coverage (one PRD journey — UJ-4 — has no Key Flow, and the delta's own "UJ-3" doesn't match the scenario PRD's UJ-3 describes) and a couple of state-coverage gaps (encumbrance-over-limit and empty/cold-load states for the two new permanent sections). Mechanically, the spine is sound except for a stale `mockups/` link (files still in `.working/`, already known) and one unresolved token (`{colors.accent-1-rgb}`) inherited from the base spine but never declared as a CSS custom property anywhere in the chain.

## 1. Flow coverage — thin

Checked EXPERIENCE.md §8 Key Flows against PRD `prd-jdr-master-20260707/prd.md` §2.3 (UJ-1..UJ-4) and the FR list (FR-1..FR-14).

### Findings
- **high** PRD UJ-4 ("Un joueur ajoute à son inventaire un objet ramassé en jeu avec son poids, et voit son encombrement total se rapprocher de sa limite") has no Key Flow, named protagonist, or numbered steps anywhere in EXPERIENCE.md 20260708. The only inventory-add flow present is EXPERIENCE.md's "UJ-3" (Sylas/MJ adding a narrative object to Bob's sheet), which is the MJ-side path, not the player self-service path FR-9 exists to serve. The player-add path is only described in one sentence of Component Patterns §4 ("le joueur ajoute un objet (nom + poids) pendant ou en fin de partie") with no climax/resolution beat and no encumbrance-approaching-limit moment, which is the actual point of UJ-4. (EXPERIENCE.md §4 "Inventaire", §8). *Fix:* add a fourth Key Flow (or extend the inventory Component Pattern into a proper flow) dramatizing the player's own add-item action and the encumbrance bar visibly climbing toward the limit.
- **medium** EXPERIENCE.md's Key Flow labeled "UJ-3" does not correspond to PRD's UJ-3. PRD UJ-3 is: "Le MJ... corrige une information saisie de travers à la création (ex. mauvaise catégorie d'arme) directement depuis la fiche... l'édition est tracée comme 'modifiée par le MJ'" — i.e., the FieldEditPencil correction-of-an-existing-field scenario. EXPERIENCE.md's "UJ-3" instead dramatizes the MJ *adding a new inventory item* with a provenance badge — a different feature path (FR-9/inventory + FieldEditPencil trace only incidentally) that happens to touch the same "modifié par le MJ" instantané mechanic. The core FR-14 scenario (correcting an existing field, e.g. wrong weapon category) is never dramatized as a Key Flow — only described in prose in §4 "Édition MJ (FieldEditPencil)". (EXPERIENCE.md §8, line 182-184; contrast PRD §2.3 UJ-3). *Fix:* either rename the existing flow (it isn't UJ-3) and add a real UJ-3 flow for a field correction, or repurpose the existing flow's steps to actually walk through correcting a pre-existing field value.
- **strong** UJ-1 (distribution XP) and UJ-2 (level-up) are each fully dramatized: named protagonist (Sylas / Alice), numbered/prose-sequential steps, explicit **Climax** and **Résolution** beats, and FR-2/FR-3/FR-5 (UJ-1) and FR-6/FR-7/FR-8 (UJ-2) are all touched concretely with real numbers (250 XP, PV/PE split 2/1, VIG 8→10). No failure path is shown for either (e.g., what happens if the MJ tries to confirm with an invalid state) but none of the FRs mandate a hard-block failure case, consistent with the "jamais bloquant" pattern repeated throughout — acceptable.
- **adequate** FR-11 (Notes journal, amended) and FR-13 (Historique consultation) are covered structurally (Component Patterns §4 "Notes", State Patterns row for private/shared) but neither has a Key Flow. Given this is flagged as a PRD amendment in the document header, a short flow showing the amendment in action (player writes a private note, later marks one entry shared) would materially de-risk downstream implementation of the newly-invented share-per-entry mechanic. Not as severe as UJ-4/UJ-3 above since the mechanic itself is unambiguously specified in prose.

## 2. Token completeness — adequate

Extracted every token reference in DESIGN.md 20260708 and traced each through the 20260703 → 20260626 chain.

### Findings
- **medium** `{colors.accent-1-rgb}` (DESIGN.md 20260708, lines 127-128, 156) resolves to `var(--accent-1-rgb)`, which is *consumed* in the base spine (`ux-jdr-master-20260626/DESIGN.md` lines 289, 374, 469, 546, 549) but is **never declared** in the `:root`/`.theme-*` custom-property block (lines 101-118 of that file only declare `--accent-1`, not an RGB-tuple variant). This is a pre-existing gap in the inherited base, not introduced by this delta, but this delta is the first *design system doc* to newly rely on it for a fresh component (RulesReminder, LevelUpBanner) rather than an already-implemented one — so it will surface as a build-breaking undefined CSS variable the moment `RulesReminder`/`LevelUpBanner` are implemented, unless the implementer independently derives an RGB triplet from the hex. *Fix:* add the missing `--accent-1-rgb` (and ideally `--accent-2-rgb`, `--status-*-rgb`) declarations to the base spine's `:root` mapping, or have this delta declare them locally since it's the first document to actually need them at implementation time.
- **strong** All other tokens (`colors.accent-2`, `colors.status-unavailable`, `colors.status-mixed`, `colors.border-subtle`, `colors.surface-bg`, `colors.text-primary`, `colors.text-muted`, `colors.gradient-cta`, `rounded.radius-card`, `rounded.radius-input`, `spacing.sm/md/base/xl`, `motion.duration.short`, `typography.text-sm/lg/xl/2xl`, `elevation.panel`) resolve cleanly to definitions in 20260626 or 20260703. No color token is missing its hex value in the resolved chain.

## 3. Component coverage — strong

All ten new component names (RosterRail, RosterStrip, RulesReminder, XpDistributionPanel, LevelUpBanner, LevelUpWizard, EncumbranceBar, FieldEditPencil, InventoryItemRow, NotesJournal) have a real visual spec in DESIGN.md §7 (concrete sizes, colors, states — not one-liners) and a matching behavioral entry in EXPERIENCE.md §4 with actual rules (not restatements of the visual spec). Inherited components referenced by exact name — `CreneauCard`, `SlotPanel`, `CalendarNav`, `Avatar` — all exist under those exact names in the 20260626/20260703 chain and the way they're reused (e.g. `CalendarNav`'s progress-bar reinterpretation, already established in 20260703, extended here to `LevelUpWizard.step-progress`) is a legitimate second-order inheritance, not a broken reference.

### Findings
- None.

## 4. State coverage — thin

Walked every IA surface introduced/restructured by this delta against the State Patterns table (EXPERIENCE.md §5).

### Findings
- **medium** `EncumbranceBar` has no explicit row in the State Patterns table for "poids total dépasse la limite d'encombrement" — the over-limit visual (`fill-over-limit` gradient) is specified in DESIGN.md §7 but EXPERIENCE.md never states the *behavior* at that threshold (FR-10's testable requirement is "signale visuellement un dépassement, jamais bloquant" — the "jamais bloquant" half is implicit/inherited but isn't stated anywhere in this delta, unlike every other non-blocking rule which gets its own row, e.g. "Distribution d'XP sur le point de faire franchir un seuil"). *Fix:* add a row: "Encombrement dépassé | EncumbranceBar passe en dégradé rouge/ambre, jamais bloquant — juste un signal visuel (FR-10)".
- **low** Neither the new "Historique des distributions d'XP" section (§2) nor `NotesJournal` has a documented empty/cold-load state, even though the spine otherwise has a strong convention of themed empty-state microcopy for every list surface (cf. inherited `empty.no_slots`/`empty.no_constraints` keys, and this delta's own `evolution.invitation_revoked_empty`). A first-time character with no XP history yet and no notes yet will hit an undefined empty state. *Fix:* add `evolution.*` microcopy keys and a State Patterns row for both.
- **strong** Every other new/restructured surface has explicit state coverage: `RosterRail`/`RosterStrip` invite-slot presence/absence, `LevelUpBanner` persistence, `attribute-choice-grid` default/selected/disabled (including the 4-attributes-at-12 edge case), invitation revoked/empty, inventory MJ-provenance badge, note private/shared, and MJ-edit-confirmed — all covered with concrete, non-generic behavior.

## 5. Visual reference coverage — mechanical issue (already known)

.working/ contains exactly 3 files: `layout-options-partie-detail.html`, `layout-alternatives-mobile.html`, `key-flows-xp-levelup-inventory.html`. All three are cited by name with a specific description of what each illustrates in EXPERIENCE.md §8 — no orphans, no generic references. However, as flagged in the task brief, the links point to `mockups/layout-options-partie-detail.html` etc., a directory that does not exist yet at review time (files are still un-promoted in `.working/`). This is the same mechanical dangling-link issue noted for the visual reference — no new finding needed beyond confirming it's accurately a link-path problem, not a flow-illustration gap (the three flows in §8 UJ-1/UJ-2/inventory-add-by-MJ are in fact the ones `key-flows-xp-levelup-inventory.html` was built to illustrate).

## 6. Bloat & overspecification — strong

No pixel-level overspecification where a token would do, no restatement of PRD personas/FRs (the document consistently cites FR-numbers inline rather than re-explaining them), no decorative prose. The one borderline case — DESIGN.md's inline rationale comments (e.g. "< 44px : élément de navigation secondaire, pas un CTA principal" on `RosterRail.avatar-item.size`) — are tied to real accessibility/interaction decisions, not decoration, so they earn their place.

### Findings
- None.

## 7. Inheritance discipline — adequate

`inherits`/`sources` frontmatter in both files resolves to real files. Glossary/component names are identical across DESIGN.md and EXPERIENCE.md within this delta, and identical to their originating names in 20260703/20260626 (RosterRail, XpDistributionPanel, etc. are used consistently). EXPERIENCE.md token references resolve to DESIGN.md tokens by name with no drift.

### Findings
- **medium** (duplicate of §1 finding, cross-referenced for inheritance-discipline framing) UJ names are not verbatim-faithful to the PRD: the delta's "UJ-3" Key Flow dramatizes a different scenario than PRD's UJ-3, and PRD's UJ-4 has no corresponding Key Flow at all under any label. This breaks the traceability contract ("UJ/requirement names verbatim from PRD") that a downstream reader would rely on when cross-referencing PRD journeys to their UX dramatization. See §1 for detail.

## 8. Shape fit — strong

DESIGN.md sections follow the canonical order exactly: Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts. EXPERIENCE.md has all required sections in order: Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows, and Responsive & Platform (present and substantive — it states the concrete 1024px breakpoint rationale tied to `WizardLayout`'s existing threshold, not filler).

### Findings
- None.

## Mechanical notes

- Frontmatter is complete in both files (`title`, `status`, `updated`, `inherits`, `sources`) and every `sources` entry resolves to an existing file, including the architecture spine reference.
- Component and glossary names are consistent across DESIGN.md/EXPERIENCE.md and the full inheritance chain — no renaming drift found.
- The only broken cross-reference is the `mockups/` vs `.working/` path mismatch in EXPERIENCE.md §8 (already known, not re-reported as new).
- `{colors.accent-1-rgb}` is referenced in this delta's DESIGN.md but was never declared as a CSS custom property anywhere in the inheritance chain (see §2 finding) — the only genuinely new mechanical gap found in this review.
