---
title: 'Reconciliation — PRD Palier 8 vs Architecture Spine Palier 8'
created: '2026-07-24'
---

# Reconciliation: PRD ↔ Architecture Spine (Palier 8 — Refonte classes et textes Ryuutama)

Sources checked:
- PRD: `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-24/prd.md` (full, FR-1 → FR-15, §5 Non-Goals, §8 Open Questions, §9 Assumptions Index)
- PRD memlog: `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-24/.memlog.md`
- Spine: `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md` (full, 10 AD, Deferred, Capability→Architecture Map)
- Spine memlog: `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/.memlog.md`

## Result: no dropped FRs, no contradictions found

All 15 FRs are accounted for by one of the three acceptable outcomes:

| FR | Outcome | Where |
| --- | --- | --- |
| FR-1 (descriptions on classes/types/weapon categories) | Pure content, no dedicated AD (matches Homme Dragon/Épic 10 precedent) | Capability Map row, governed by inherited P5-AD-4 |
| FR-2 (sub-element descriptions) | Pure content, same precedent | Capability Map row, P5-AD-4 |
| FR-3 (per-step intro text) | Explicit AD | AD-9 |
| FR-4 (missing classes) | Pure content | Capability Map (bundled row, see nit below) |
| FR-5 (occupations/actions) | Pure content, explicitly no game mechanic (PRD Non-Goal) | Capability Map (bundled row, see nit below) |
| FR-6 (structured talent effect) | Explicit AD | AD-10 |
| FR-7 (3 attribute profiles) | Pure content — existing `validate()`/`RyuutamaCatalog.attributePatterns` already generic over the catalog, no code change implied | Capability Map, P5-AD-4 |
| FR-8 (precise weapon → category) | Explicit AD | AD-1, AD-2 |
| FR-9 (free/custom weapon) | Explicit AD | AD-3 |
| FR-10 (equipment purchase, budget) | Explicit AD | AD-1, AD-4 |
| FR-11 (spell catalog) | Explicit AD; mechanic correctly left deferred | AD-1; Deferred table ("Mécanique d'apprentissage/lancement de sort — Open Question 2") |
| FR-12 (4 group roles) | Explicit AD | AD-1 |
| FR-13 (MJ assigns role) | Explicit AD | AD-5, AD-6 |
| FR-14 (role badge) | Explicit AD | AD-7, AD-8 |
| FR-15 (end-of-tier completeness reminder) | Correctly treated as process, not an architecture decision — matches the Palier 7 FR-15 precedent cited by both PRD and spine | Capability Map: "Hors code (process)" |

## Non-Goals (§5) — respected, no weakening found

- No player-side role selection/vote → AD-6 makes write access MJ-only via `PartiesService.getOwned` (inherited P1-AD-3). Consistent.
- No automatic migration of existing characters for the weapon refactor → spine frontmatter `scope` line explicitly restates "migration des personnages existants (reset du seed uniquement)"; FR-8/FR-9's Out-of-Scope note is not contradicted anywhere in the AD set.
- No multi-list equipment UI → present verbatim in spine Deferred table ("UI multi-listes d'objets/règles d'équipement ... Palier 9").
- No game mechanic on occupations/actions → FR-5 has no AD forcing a mechanic; consistent.
- No general wizard/`ScenarioTimeline` visual redesign → not restated in the spine's Deferred table, but nothing in the AD set does this work either, so there is no contradiction — just an omission of a restatement (see Minor Nits below).

## Open Questions (§8) — correctly handled

1. **Exact content** (missing classes, profile values, weapon/spell/item lists) — PRD marks this non-blocking, to be dictated during implementation. Spine does not invent any of this content; JSON file names are declared as new/enriched but no values are asserted. Correctly left open.
2. **Spell mechanic (FR-11)** — PRD explicitly leaves this to a future story. Spine's Deferred table lists it under "Mécanique d'apprentissage/lancement de sort | Open Question 2 ... catalogue seul ce palier, mécanique hors scope." Correctly deferred, not silently answered.
3. **Exact Prisma/DTO form for weapon choice** — PRD explicitly says this is "laissé à l'architecture/dev-story," i.e. it delegates the decision to this exact architecture stage. AD-2 makes the call (`weaponCategoryId` → `weaponId: string`, category resolved at read time). This is the intended resolution of a question the PRD deliberately punted to architecture — not an overreach.
4. **Role reassignment/transfer** — PRD leaves this open for the story stage. Spine's Deferred table lists it verbatim ("Réassignation/transfert d'un rôle déjà attribué | Open Question 4 ... non tranché, laissé à la story CharacterRolesService"). Correctly left open.

No Open Question was silently answered where the PRD wanted it left open, and no Open Question was left silently unaddressed.

## Quiet requirements / tone constraints — respected

- **§0 mode opératoire** (content dictated progressively by the user, nothing invented by the agent): spine never asserts concrete content values (class names, numeric profiles, item prices, spell text) — it only names new JSON files and their shape. Consistent throughout.
- **NFR4** (Ryuutama content gitignored, seeded from JSON at `GameSystemService.onApplicationBootstrap()`, never hardcoded, never read directly by the frontend): AD-1's rule explicitly routes all 4 new catalogs through the existing `CONTENT_TYPES`/`GameSystemService.getContent()` mechanism ("jamais un nouveau mécanisme de lecture"), which is the same pattern that satisfies NFR4 today. Not restated as its own inherited invariant line, but not violated either (see Minor Nits).
- **Hobby-scale calibration / no formal metrics**: spine stays within the same footprint (1 new Prisma model, 1 new module, 4 new content types, no new dependencies) — proportionate to a hobby-scale palier, consistent with PRD §7.

## Minor nits (non-blocking, not contradictions or drops)

1. **Capability Map labeling looseness**: the row "FR-4 à FR-6 (classes complètes, occupations/actions, talents enrichis) | `classes.json` | AD-10 (forme du talent)" bundles FR-4 and FR-5 under AD-10, but AD-10 only actually governs the talent form (FR-6). FR-4/FR-5 are pure-content additions with no AD of their own, which is fine in substance, but the table's phrasing could misread as if AD-10 also governs the missing-classes/occupations-actions requirements. Cosmetic only — recommend splitting the row or adding "(P5-AD-4, pur contenu)" for FR-4/FR-5 on the next spine edit.
2. **FR-1's explicit code-level consequence** — the PRD calls out that `ClassStep`/`TypeStep`/`WeaponStep` currently have no `description` field in their internal step-data model and must be extended to carry one. The spine's Capability Map treats FR-1 as pure content (P5-AD-4) with no AD, which is defensible (trivial additive field, same as how Homme Dragon's description was already surfaced), but the spine text never explicitly acknowledges this small step-model extension the way AD-9 explicitly enumerates the same three step components for FR-3. Not a gap in coverage — just a slightly asymmetric level of explicitness between FR-1 and FR-3 for components that are otherwise treated identically.
3. **PRD's last Non-Goal bullet** (no general visual redesign of the character wizard, and no `ScenarioTimeline` fix, both explicitly pushed to Palier 9) is not echoed anywhere in the spine's Deferred table, unlike the equipment-multi-list Non-Goal which is echoed. Since the spine's AD set does none of this work either, there's no actual contradiction — just a missed opportunity for symmetry/completeness in the Deferred table.

## Bottom line

15/15 FRs checked. No FR silently dropped, no Non-Goal weakened, no Open Question mishandled. Findings above are documentation-polish nits only (table labeling and Deferred-table symmetry), not architectural gaps — no changes to the spine's actual decisions are recommended before implementation.
