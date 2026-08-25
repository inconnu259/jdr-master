# Review — Brownfield Consistency

**Target:** `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md`
**Lens:** does the spine genuinely reuse existing conventions of the NestJS 11 + Prisma 7 monorepo, or does it merely gesture at reuse while introducing subtly divergent patterns?

## Verdict

The spine's reuse claims hold up well overall — the `HommeDragon` model, the PDF export pattern (AD-1/AD-6), and the module-graph acyclicity are all verified accurate against the real code — but AD-5's "same StreamableFile pattern" claim glosses over a real difference in file-sourcing mechanics (bundled static asset vs. uploaded document on disk) that the spine should name explicitly rather than imply is identical.

## 1. `HommeDragon` model vs. sibling models (`Character`, `GameSystem`, `ContentType`, `ContentEntry`)

Read `apps/api/prisma/schema.prisma` in full. The spine's description matches the real schema exactly:

- `GameSystem` (id = slug, `name`, `version`, no `sheetSchema` field — schema is code, per `GameSystemService.getSchema()`), `ContentType` (`@@unique([gameSystemId, key])`), `ContentEntry` (`@@unique([contentTypeId, key])`, `scope: ContentScope`) — all as described.
- `Character` has exactly the `sheetData`/`derived` Json pair, `@@unique([userId, partieId, gameSystemId])`, `@@index([partieId])`, `@@index([userId])` — the spine's claim that `HommeDragon` mirrors "the same uniqueness shape as `Character`" is accurate for the `@@unique` triple.

**Finding (Low) — `HommeDragon` drops the `@@index([userId])` that `Character` has.** `Character` carries both `@@index([partieId])` and `@@index([userId])` (schema.prisma lines 292-293). The proposed `HommeDragon` model (spine lines 130-132) only has `@@index([partieId])`. Given `HommeDragon` is queried by `[userId, partieId, gameSystemId]` (the `@@unique` already covers lookups keyed by all three or by `userId` as a prefix... actually it does NOT — Postgres can use a composite unique index for a `userId`-only lookup only as a leftmost-prefix match, which does work here since `userId` is first in the tuple), so in practice a `userId` lookup is covered by the unique constraint's underlying index. This is a nitpick, not a real gap — flagging only because the spine claims "même forme de contrainte" without noting the index divergence explicitly. **Severity: informational, no action required.**

**Finding (Info) — field ordering and cascade behavior are consistent.** `HommeDragon.user`/`partie` cascade `onDelete: Cascade` matching `Character.user`/`Character.partie`; `gameSystem` has no explicit `onDelete` (defaults to restrict), matching `Character.gameSystem` — consistent.

No structural inconsistency found. The Structural Seed is a faithful sibling of `Character`.

## 2. AD-1/AD-6 "same pattern" claim for PDF export

Read `apps/api/src/characters/ryuutama-pdf.service.ts` and `packages/game-rules/src/ryuutama/pdf-field-map.ts` in full.

The real pattern is: **service loads a fillable PDF template from disk** (`readFile(join(process.cwd(), 'game-systems/ryuutama/assets/...'))`, cached in a `templatePromise`) → **a pure mapping function in `packages/game-rules`** (`mapToPdfFields(data, derived, content) => PdfFieldValue[]`, zero I/O, testable standalone) resolves `sheetData`/`derived`/seeded-content into `{ field, value, kind }` tuples → **the service applies them via `pdf-lib`'s `PDFDocument.getForm()`** (`getTextField`/`getDropdown`), with a `try/catch` per field that rethrows a descriptive error pointing at the README if a field name doesn't match the template.

This is genuinely the same technique the spine describes for AD-6 (`equipment-pdf-field-map.ts`, `notes-pdf-field-map.ts` as new pure mapping functions in `packages/game-rules/ryuutama`, consumed by new capabilities on `CharacterService`/a `homme-dragon.pdf.service.ts`). The separation-of-concerns convention (pure mapping in `game-rules`, I/O + pdf-lib mechanics in the Nest service) is real and would transfer cleanly. **No inconsistency found for AD-1/AD-6.**

One nuance the spine doesn't mention but should for implementers: `RyuutamaPdfService` also handles portrait embedding (`embedPortrait`, `fitCentered`, `computePdfCropDraw` — non-AcroForm image drawing with manual clip paths) which is unrelated to the field-mapping pattern and won't be needed for equipment/notes/Homme Dragon exports (no portrait in those templates). This is out of scope for AD-6 as written and the spine correctly doesn't require it — just noting it so a story-writer doesn't assume the whole `RyuutamaPdfService` file is the template to copy wholesale.

## 3. AD-5 "same StreamableFile pattern" claim for static file serving

Read `apps/api/src/game-systems/game-system.service.ts` and `apps/api/src/scenarios/scenarios.controller.ts` (`GET /documents/:id`), plus `ScenariosService.getDocumentFile` (scenarios.service.ts:828-846).

**Finding (Medium) — the StreamableFile *response* pattern matches, but the file-sourcing mechanism the spine implies is reused does not.** `ScenariosController.downloadDocument` wraps `ScenariosService.getDocumentFile`, which reads a **user-uploaded** file from disk via `readDocumentFile(document.filename)` — the filename comes from a `ScenarioDocument` DB row created at upload time (`uploadDocument`), and access control is `parties.getViewable(document.partieId, userId)` before the read. This is the "upload + serve back" half of the P4-AD-8 pattern.

AD-5's new route (`GET /parties/:id/game-systems/:systemId/assets/:key`) has **no DB row and no upload path** — it's a static, developer-bundled asset lookup (`key → { file, access }` table in code, per the spine), analogous instead to how `RyuutamaPdfService` loads its own bundled template (`PDF_TEMPLATE_PATH`, `readFile(join(process.cwd(), 'game-systems/ryuutama/assets/...'))`, cached in a promise) — not to `ScenarioDocument`'s upload/DB-row mechanism.

The `StreamableFile` response envelope, the `sanitizeHeaderFilename` header-injection guard, and the guard-before-read-via-`PartiesService` access-check convention *do* transfer cleanly and the spine is right that those are reusable. But "réutilisé pour AD-5" (Inherited Invariants, P4-AD-8 row) and "même pattern que P4-AD-8" (AD-5 rule) overstate the reuse: the actual precedent for *loading a static bundled file by key* is the `RyuutamaPdfService.loadTemplate()` technique (template-caching `readFile` from a fixed path under `game-systems/ryuutama/assets/`), not `ScenarioDocument`'s upload-then-serve flow. A story-writer following the spine literally might reach for `ScenarioDocument`-style DB/upload plumbing that AD-5 explicitly says isn't needed ("aucune donnée en base").

**Recommendation:** amend AD-5's rule text to split the citation — StreamableFile response shape + access-guard convention from `ScenariosController`/`ScenariosService.getDocumentFile`, but static-file-loading technique from `RyuutamaPdfService.loadTemplate()` — so the two source patterns aren't conflated under one P4-AD-8 citation.

## 4. Module import graph — circular dependency risk

Read `apps/api/src/scenarios/scenarios.module.ts`, `parties.module.ts`, `game-systems/game-system.module.ts`, `characters/character.module.ts`, `availability.module.ts`, `poll/poll.module.ts`.

Current real graph:
- `PartiesModule` imports `AvailabilityModule` only.
- `CharacterModule` imports `PartiesModule` + `GameSystemModule` + `UsersModule` + `EmailModule`.
- `ScenariosModule` imports `PartiesModule` + `CharacterModule` + `forwardRef(() => PollModule)`.
- `PollModule` imports `PartiesModule` + `AvailabilityModule` + `forwardRef(() => ScenariosModule)` — **this pair is already circular today** and handled with `forwardRef` on both sides (documented inline, Story 8.8).
- `GameSystemModule` currently has **no imports** (AD-5 proposes adding `PartiesModule`).

Spine's proposed additions:
- `HommeDragonModule` imports `PartiesModule` + `ScenariosModule` (read-only).
- `GameSystemModule` imports `PartiesModule` (new, for AD-5).

**Tracing for cycles:** `HommeDragonModule` → `ScenariosModule` → `CharacterModule` → `GameSystemModule` → `PartiesModule` (new) → `AvailabilityModule`. Nothing in that chain imports back `HommeDragonModule` or `GameSystemModule`, so this is a valid DAG, not a cycle. `GameSystemModule` importing `PartiesModule` creates a diamond (`CharacterModule` already depends on both `PartiesModule` and `GameSystemModule` directly) but diamonds are not circular dependencies in Nest and require no `forwardRef`. **The spine's implicit claim (no `forwardRef` shown in its mermaid diagram) is correct** — confirmed no cycle is introduced by the two new import edges.

**Finding (Low, informational) — the spine's mermaid diagram (spine lines 80-94) omits the pre-existing `ScenariosModule → CharacterModule` edge (P4-AD-11)**, which is real, already in `scenarios.module.ts`, and is the actual transitive path by which `HommeDragonModule` reaches `GameSystemModule`/`PartiesModule` twice (once directly, once via `ScenariosModule`). This omission doesn't make the diagram wrong, but a reader checking for cycles against the diagram alone (rather than the real codebase) would not see this path and could underestimate the coupling `HommeDragonModule` inherits transitively (it pulls in `CharacterModule`, `UsersModule`, `EmailModule`, and — via `ScenariosModule`'s `forwardRef`-guarded edge — `PollModule` and `AvailabilityModule`). Purely a documentation completeness note; no structural defect.

## Summary of findings

| # | Severity | Finding |
| --- | --- | --- |
| 1 | Informational | `HommeDragon` omits `@@index([userId])` that `Character` has; harmless since the `@@unique` triple's leading column covers it, but spine's "same constraint shape" claim doesn't call out the difference |
| 2 | None | AD-1/AD-6 PDF pattern reuse claim verified accurate — pure mapping fn in `game-rules` + pdf-lib AcroForm fill in the Nest service is a real, transferable pattern |
| 3 | Medium | AD-5's "même pattern que P4-AD-8" conflates two distinct precedents: the StreamableFile response/access-guard convention (genuinely from `ScenariosController`/`getDocumentFile`) vs. the static-bundled-file-loading technique (actually from `RyuutamaPdfService.loadTemplate()`, not from the uploaded-`ScenarioDocument` flow) — recommend splitting the citation in AD-5's rule text |
| 4 | Informational | No circular dependency is introduced by `HommeDragonModule`/`GameSystemModule`'s proposed new imports — verified against the real module graph, including the pre-existing `PollModule`↔`ScenariosModule` cycle (already `forwardRef`-guarded) which is unaffected. The spine's diagram omits the existing `ScenariosModule → CharacterModule` edge, understating `HommeDragonModule`'s transitive coupling — documentation-only gap |
