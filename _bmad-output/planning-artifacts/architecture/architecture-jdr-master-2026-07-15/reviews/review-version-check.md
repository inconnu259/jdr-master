# Review — Version/Reality Check

**Spine:** `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md`
**Lens:** every committed decision web-researched or reality-checked, not asserted from training data — versions, technology existence/fit, file-path claims against the real repo.

## Verdict

The stack claims (NestJS 11, Prisma 7, Angular 22, Postgres 17, pdf-lib) all check out against the installed lockfile/package.json, and nearly every referenced module/file/asset path exists as claimed — except one load-bearing filename in AD-6 that does not match any file on disk and would break the build if implemented as written.

## Checks performed

| Claim in spine | Verified against | Result |
| --- | --- | --- |
| NestJS 11 | `apps/api/package.json` (`^11.0.1`/`^11.0.5`), `pnpm-lock.yaml` (`@nestjs/core@11.1.27`) | Match |
| Prisma 7 | `apps/api/package.json` (`^7.8.0`), lockfile (`@prisma/client@7.8.0`) | Match |
| Angular 22 | `apps/web/package.json` (`^22.0.0`), lockfile (`@angular/core@22.0.2`) | Match |
| Postgres 17 | `docker-compose.yml` line 19: `image: postgres:17-alpine` | Match |
| `pdf-lib` "déjà en place" | `apps/api/package.json` (`^1.17.1`), lockfile (`pdf-lib@1.17.1`), actively used in `apps/api/src/characters/ryuutama-pdf.service.ts` | Match — real, in use, correct API surface (`PDFDocument`, `getForm()`, `embedJpg/embedPng`, clip operators) as cited in AD-6/AD-1 reasoning |
| `apps/api/game-systems/ryuutama/assets/` | `ls` of the directory | Exists, 16 files present |
| `apps/api/src/characters/ryuutama-pdf.service.ts` | Read in full | Exists, matches the "pattern already in place" the spine leans on for AD-1/AD-6 |
| `apps/api/src/game-systems/game-system.service.ts` | Read in full | Exists; `seedRyuutama()`, `getContent()`, `getSchema()`, the `id !== RYUUTAMA_ID` hard-coded pattern the spine cites in AD-4/AD-5/Deferred are all real, not invented |
| AD-5 reference-sheet keys → asset files (journal, carte, monde, monstre, ville, objectif ×3, œuf de bataille, structure) | Cross-checked each key against the actual filenames in `assets/` | All 10 map cleanly to an existing file (`Ryuutama_journal.pdf`, `Ryuutama_carte.pdf`, `Ryuutama_fiche_de_monde_edit.pdf`, `Ryuutama_fiche_de_monstre_edit.pdf`, `Ryuutama_fiche_de_ville_edit.pdf`, `Ryuutama_objectif_chasse_edit.pdf`, `Ryuutama_objectif_quête_edit.pdf`, `Ryuutama_objectif_voyage_edit.pdf`, `Ryuutama_oeuf_de_bataille.pdf`, `Ryuutama_structure_edit.pdf`) |
| AD-6 notes template `Ryuutama_fiche_de_notes_edit.pdf` | Filename compared to `ls assets/` | Match, exact filename exists |
| AD-6 equipment template `Ryuutama_fiche_equipement_edit.pdf` | Filename compared to `ls assets/` | **No match.** The real file is `Ryuutama-fiche_equipement_edit.pdf` — hyphen after `Ryuutama`, not underscore, and no `_edit`... wait, it does have `_edit`; the actual mismatch is `Ryuutama-fiche_equipement` vs spine's `Ryuutama_fiche_equipement` (hyphen vs underscore right after `Ryuutama`). See Finding 1. |
| `packages/game-rules/src/ryuutama/` existing file naming convention | `ls` of the directory | Existing convention is `pdf-field-map.ts` (no `homme-dragon-`/`equipment-`/`notes-` prefix yet, since only one form exists today). Spine's proposed `homme-dragon-pdf-field-map.ts`, `equipment-pdf-field-map.ts`, `notes-pdf-field-map.ts` are net-new files, not mis-cited existing ones — consistent, not a version-check problem, just noted for completeness |

## Findings

### Finding 1 — Severity: High (build-breaking if implemented as specified)

**AD-6** names the equipment PDF export template as `Ryuutama_fiche_equipement_edit.pdf`. The actual file present in `apps/api/game-systems/ryuutama/assets/` is `Ryuutama-fiche_equipement_edit.pdf` — a **hyphen** after `Ryuutama`, not an underscore (every other asset filename in that directory uses `Ryuutama_<name>`, e.g. `Ryuutama_fiche_de_notes_edit.pdf`, `Ryuutama_fiche_de_monde_edit.pdf` — this one file is the sole outlier with a hyphen).

This is exactly the class of thing this lens exists to catch: a specific, load-bearing filename asserted in a "no new dependencies, reuse what's there" brownfield spine, without an `ls`/reality check against the actual asset directory. `RyuutamaPdfService.loadTemplate()` shows the existing pattern reads templates by exact `readFile(join(process.cwd(), 'game-systems/ryuutama/assets/<exact-filename>'))` — a hardcoded path with no fallback, so a future `EquipmentPdfService`/`HommeDragonPdfService` built directly from AD-6's stated filename would throw `ENOENT` at first use (or, if a `try/catch` mirrors the existing template-load error handling, would fail gracefully but still be broken).

**Fix:** correct AD-6's Rule text and the Source Tree/mapping table entries to `Ryuutama-fiche_equipement_edit.pdf` (matching the file on disk), or rename the asset file on disk to match the underscore convention if that's preferred — either is a one-line fix, but it must be resolved before a story implements AD-6.

### Finding 2 — Severity: Informational (no error, but worth confirming before implementation)

Two asset files exist in `apps/api/game-systems/ryuutama/assets/` that AD-1's Homme Dragon PDF export would plausibly need but which the spine never names explicitly: `Ryuutama_fiche_homme-dragon_big_edit.pdf` (the obvious candidate for the Homme Dragon sheet template) and `Ryuutama_fiche_de_voyageur_big_edit.pdf` (already in use, unrelated). The spine's Structural Seed lists `homme-dragon.pdf.service.ts` and says it "reuses the `RyuutamaPdfService` pattern" but doesn't cite a template filename the way AD-6 does for equipment/notes. Since the file does exist under the expected name, this isn't a factual error — but the spine should be explicit about it (the way it is for AD-6) so implementation doesn't have to rediscover it. Also worth noting: two other files in the directory (`Ryuutama_evenements_edit.pdf`, `Ryuutama_fiche_de_provisions.pdf`) are not referenced anywhere in the spine's AD-5 key→file mapping and are presumably out of scope — consistent with Deferred, not a gap, just flagging that the AD-5 table is a complete enumeration of 10 keys against 10 files and these 2 extras are correctly excluded.

### Finding 3 — Severity: None (verified correct, noted for completeness)

The spine's core stack table ("Stack: Aucun ajout — réutilise la stack existante NestJS 11, Prisma 7, Angular 22, Postgres 17, `pdf-lib`") is accurate and each version is independently confirmed against `pnpm-lock.yaml`'s resolved versions (not just the caret ranges in `package.json`, which could resolve to something newer): `@nestjs/core@11.1.27`, `@prisma/client@7.8.0`, `@angular/core@22.0.2`, `pdf-lib@1.17.1`, `postgres:17-alpine`. No drift between what the spine claims and what's actually resolved/installed.

### Finding 4 — Severity: None (verified correct)

Every brownfield file path the spine cites in its `sources` front-matter and inline prose was confirmed to exist and to contain the behavior described: `apps/api/prisma/schema.prisma`, `apps/api/src/game-systems/game-system.service.ts` (full read — `seedRyuutama()`, `getContent()`, `getSchema()`, the hardcoded `RYUUTAMA_ID` check, and the "no plugin registry yet" limitation the spine cites in Deferred are all real, present, and match the spine's characterization word-for-word), and `apps/api/game-systems/ryuutama/assets/` (16 files, matches the spine's implicit inventory). No fabricated or stale path references found.

## Summary

Out of the concrete, checkable claims in this spine (4 version numbers, ~14 file/directory paths, ~13 distinct asset filenames), everything checked out except the equipment PDF filename in AD-6, which has a hyphen/underscore typo relative to the actual file on disk. This is a small, mechanical fix, but it is exactly the kind of unverified assertion this review pass is meant to catch — the spine's other filename claims (10/10 in AD-5, notes template in AD-6, `RyuutamaPdfService`'s existing template) were all reality-checked correctly; this one wasn't.
