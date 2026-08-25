# Rubric Walk — ARCHITECTURE-SPINE.md (Palier 5, 2026-07-15)

Reviewed against: `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md`
Parent: `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md`
Brownfield checked: `apps/api/prisma/schema.prisma`, `apps/api/src/characters/character.service.ts`, `apps/api/src/game-systems/game-system.{module,service,controller}.ts`, `apps/api/src/scenarios/scenarios.controller.ts`, `apps/api/game-systems/ryuutama/assets/*`, `apps/api/package.json`, `apps/web/package.json`.

## Overall

The spine is well-scoped and mostly ratifies existing brownfield patterns correctly (verified: `PartiesService.getOwned/getViewable`, `updatedAt` optimistic lock on `Character`, `StreamableFile` + `documents/:id` pattern on `ScenariosController`, `ContentScope.BASE`, `GameSystemService.seedRyuutama`/`getContent`/`getSchema`, `RYUUTAMA_ID`, stack versions). Two findings are substantive enough to require correction before build: an internal contradiction in AD-3's storage model, and a factually wrong filename in AD-6's Rule. The rest are minor/documentation-hygiene items.

## Findings

### 1. [Major] AD-3 contradicts itself on whether `derived` is stored — Rule doesn't actually prevent the divergence it names

AD-3's Rule states level/PS are "calculé à la lecture par `HommeDragonService` (**jamais stocké**)". But the Structural Seed defines a persisted Prisma field for exactly that data:

```prisma
derived Json  // { level, PS } — calculés à la lecture (AD-3), champ = cache
              // de la dernière lecture, jamais la source de vérité
```

"Jamais stocké" and "a persisted cache field written on last read" are two different mechanisms, and the spine asserts both. Critically, this is *not* the same pattern as `Character.derived` (verified in `character.service.ts`): `Character.derived` is recomputed and written **only when `sheetData` is written**, from data that lives entirely within the same aggregate — so it's always fresh on read with no extra work. `HommeDragon`'s level depends on `Scenario.status = PASSE` count, which changes via a **different module** (`ScenariosModule`) with no relation to any `HommeDragon` write. So the only way the seed's "cache" field could stay non-stale is if `HommeDragonService.get()` (a read) also performs a DB write — a pattern that doesn't exist anywhere else in this codebase and the Rule never states explicitly.

This is exactly the kind of divergence point stories need pinned down: one implementer could build `get()` as pure in-memory computation (ignoring/never writing the `derived` column, making it dead weight and permanently stale — misleading to anyone who queries it directly), another could make `get()` write back on every read (an unusual read-triggers-write with its own concerns: write amplification on a hot read path, `updatedAt` bumping on GET if `updatedAt` isn't excluded, interaction with AD-2's "MJ seul écrivain, no lock needed" reasoning if non-MJ reads can now mutate the row). The spine needs to pick one and say so, or drop the persisted `derived` field entirely if the intent is truly "never stored" (in which case the Prisma column should not exist, and downstream consumers should call a pure function instead).

### 2. [Moderate] AD-6's Rule names a template filename that doesn't match the brownfield asset

AD-6: *"chacune charge son propre template fillable (`Ryuutama_fiche_equipement_edit.pdf`, ...)"*.

Actual file present in `apps/api/game-systems/ryuutama/assets/`: `Ryuutama-fiche_equipement_edit.pdf` (hyphen after "Ryuutama", not underscore). `Ryuutama_fiche_de_notes_edit.pdf` is correctly named. This is a Rule whose entire job is to be a copy-pasteable divergence-preventer — getting the one concrete artifact name wrong defeats that purpose and will surface as a runtime "file not found" that the story author has to independently debug and silently correct, which is the twin-implementer inconsistency risk the checklist calls out (one dev might "fix" the filename in the rule's favor by renaming the asset, another might fix the code to match the asset — same net effect here since it's a single file, but worth a one-line correction before this ships to story-writing).

### 3. [Minor] Brownfield asset inventory not fully reconciled against AD-5's scope

The assets directory (confirmed via glob) contains two files never mentioned anywhere in the spine: `Ryuutama_fiche_de_provisions.pdf` and `Ryuutama_evenements_edit.pdf`. AD-5's scope lists exactly 9 reference-file categories (journal, carte, monde, monstre, ville, objectif×3, œuf de bataille, structure) and the spine's own `sources` list cites this asset directory as having been read for inventory purposes. It's plausible these two are deliberately out of scope (e.g. superseded/renamed), but the spine doesn't say so — silence here means a story-writer or implementer has no documented answer for "what happens to `provisions.pdf` and `evenements_edit.pdf`," and could reasonably decide to wire them up (fighting the stated scope) or ignore them without knowing whether that's a scope decision or an oversight. A one-line addition to Deferred or scope would close this.

### 4. [Minor] Existing assets README not updated/referenced despite the established pattern

The current `apps/api/game-systems/ryuutama/assets/README.md` documents that the assets directory is gitignored (copyright) and that missing-file failures should "point to this README" — but it only documents one file (`Ryuutama_fiche_de_voyageur_big_edit.pdf`). AD-5/AD-6 add ~10 more required assets that must be manually supplied by whoever stands up an environment, but neither the Rule text nor the Structural Seed/Deferred sections mention updating this README to keep the existing "clear error pointing at documented setup" pattern intact. Not an architectural decision by itself, but it's a real brownfield convention this spine silently doesn't carry forward — worth a line in Structural Seed or Deferred rather than leaving it to be discovered during story-writing.

### 5. [Minor / open question] HommeDragon read-access rationale not stated, unlike parent's explicit anti-spoil reasoning

Consistency Conventions blanket-states "Lecture = `parties.getViewable`" for everything in this palier, which — applied to `HommeDragon` — means any Partie member (including players) can read the GM's Homme Dragon sheet (race, appearance, "mondes protégés," "voyageurs protégés," artefact, and level/PS tied to campaign progress). The parent spine's AD-6 spent real effort justifying that anti-spoil is frontend-only and explicitly reasoned about spoiler risk for `Scenario` fields. This spine gives no equivalent reasoning for why `HommeDragon` (an MJ-authored NPC sheet, thematically likely *meant* to be player-visible in Ryuutama, but that's a game-content judgment, not stated as such) should default to full member visibility with zero access differentiation on any field. If this is intentional (probably is, given Ryuutama's guardian-NPC concept), one sentence saying so would remove the ambiguity; as written it's decided by silent inheritance from a generic table row rather than an explicit call.

## Checklist coverage not otherwise flagged

- Enforceable Rules: AD-1, AD-2, AD-4, AD-5 (aside from finding 2) are concrete and file/path-specific — fine.
- Deferred: reviewed all 8 rows; none open a gap where two units could build incompatibly (all are genuinely inert until a future need is confirmed, or explicitly point to a governing future palier).
- Stack: no new dependencies claimed; versions in the Stack section (Nest 11, Prisma 7, Angular 22, Postgres 17, pdf-lib) match `apps/api/package.json` / `apps/web/package.json` (`@nestjs/core ^11.0.1`, `prisma`/`@prisma/client ^7.8.0`, `@angular/core ^22.0.0`, `pdf-lib ^1.17.1`). Postgres 17 not independently verified (no version pin found in this pass) but unchanged from parent spine, not a new claim.
- Inherited invariants: P1-AD-1/2/3/4/5, P3-AD-9, P4-AD-3/8 are all correctly carried forward and none of AD-1 through AD-6 in this spine weaken or contradict them — AD-2 and AD-3 explicitly reference and distinguish themselves from P3-AD-9 rather than silently diverging.
- Operational/environmental envelope: explicitly addressed in Deferred ("Environnement/déploiement — aucun changement... reste porté par le Palier 7"), consistent with parent's same deferral. Not a silent gap.
