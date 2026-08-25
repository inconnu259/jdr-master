---
review: version-and-reality-check
target: ARCHITECTURE-SPINE.md (Palier 8 — Refonte complète des classes et textes Ryuutama)
date: 2026-07-24
---

# Review — Versions & Reality-Check

## Verdict

**PASS with process caveat.** The "Stack" claim ("Aucun ajout de dépendance — NestJS 11, Prisma 7, Angular 22, Postgres 17") is **accurate** against the actual repo state, and none of the new structural elements (four `ContentType` catalogs, `CharacterGroupRole` model, `weaponId`/`customWeapon` restructure) require anything beyond what's already installed. However, the spine's `.memlog.md` and `sources` list show this was confirmed by **reading local repo files only** — no Context7 lookup or web search was performed at any point, despite CLAUDE.md's explicit instruction to use Context7 "avant d'écrire du code framework-spécifique." The version numbers happen to check out because they were verified against the actual package.json (reality-checked), not because they were cross-referenced against upstream docs (not web-researched). Flagging this as a process gap rather than a factual error.

## Findings

### High — none

No committed decision is factually wrong or would break the build.

### Medium

1. **Version claims were reality-checked against the repo, not web-researched, contrary to CLAUDE.md's Context7 instruction.**
   - `sources:` in the spine frontmatter lists only local files (PRD, backlog, prior spines, brownfield code reads). `.memlog.md` confirms the same: every entry is a "(constraint) Inherited ..." or "(event) Sweep brownfield ..." — zero entries reference an external doc lookup.
   - CLAUDE.md is explicit: "**Context7** (MCP) : doc à jour des libs — l'utiliser **avant d'écrire du code framework-spécifique** (Angular/Nest/Prisma évoluent vite)." This step appears to have been skipped for Palier 8.
   - Net effect here is benign — I independently verified `apps/api/package.json` (`@nestjs/*` `^11.1.28`, `@prisma/client`/`prisma` `^7.8.0`), `apps/web/package.json` (`@angular/*` `^22.0.0`), and `docker-compose.yml` (`postgres:17-alpine`) all match the spine's claim. But this was luck-of-timing, not process: nothing in the spine's own trail shows the versions were checked against anything other than "what's already in the lockfile," and no Prisma-7-specific or Angular-22-specific behavior (e.g. relation/`@@unique` syntax, signal-based forms) was validated against current docs — it was pattern-matched against existing sibling models/components in the same repo instead. That's a legitimate brownfield-consistency check, but it is not the "web-researched or reality-checked against a current starter" bar this review was asked to apply.
   - **Recommendation:** no spine changes needed, but note for future paliers: run a Context7 lookup (or equivalent) for any framework surface actually touched (here: Prisma 7 relation/`@@unique` model syntax, since `CharacterGroupRole` is new schema) before marking `[ADOPTED]`, even when brownfield precedent exists.

2. **Repo already has a partial, undocumented migration toward the Prisma driver-adapter pattern that the spine's "no new dependency" claim glosses over.**
   - CLAUDE.md states: "Prisma 7 (générateur `prisma-client-js` legacy pour l'instant ; migration vers le nouveau générateur `prisma-client` + driver adapter prévue au palier 1)."
   - Reality: `apps/api/prisma/schema.prisma` generator block still declares `provider = "prisma-client-js"` (legacy, confirmed), **but** `@prisma/adapter-pg` (`^7.8.0`) is already a runtime dependency and is already wired up in `apps/api/src/prisma/prisma.service.ts` (`new PrismaPg({ connectionString })` passed to the `PrismaClient` constructor as `adapter`).
   - This is pre-existing repo state, not something Palier 8 introduces or misrepresents — the spine correctly says "no new dependency" for its own scope. Flagging only because it means the CLAUDE.md description of "migration planned for palier 1" is itself stale (the adapter is partially in place already), which could mislead a future spine author who reads CLAUDE.md as the source of truth for current Prisma wiring instead of checking `prisma.service.ts` directly.
   - **Recommendation:** outside this spine's scope to fix; worth a note to the user to refresh CLAUDE.md's Prisma migration status line, or confirm to the user whether `prisma-client-js` + `adapter-pg` is the intended end state or a half-finished migration.

### Low

3. **`CharacterGroupRole`'s Prisma model syntax was validated by pattern-matching sibling models, not by checking Prisma 7 changelog for schema-syntax deprecations.** Cross-checked against `Invitation`, `InviteLink`, `SessionParticipation` (all use identical `@id @default(uuid())`, `@relation(fields:..., references:..., onDelete: Cascade)`, `@@unique([...])` idioms) — the proposed model is syntactically consistent with the existing schema and would generate correctly under the pinned `prisma@^7.8.0`. This is a reasonable substitute for a changelog check given a large body of working precedent in the same file, but it's still an assumption of continuity rather than a confirmed fact about Prisma 7's current schema grammar.

## Confirmed accurate (no issue)

- `apps/api/package.json`: `@nestjs/common`/`@nestjs/core`/`@nestjs/platform-express` `^11.1.28`, `@nestjs/schedule` `^6.1.3`, `@nestjs/throttler` `^6.5.0`, `@prisma/client`/`prisma` `^7.8.0`, `@prisma/adapter-pg` `^7.8.0` — matches spine's "NestJS 11, Prisma 7" claim.
- `apps/web/package.json`: `@angular/core` and siblings `^22.0.0`, `@angular/cli`/`@angular/build` `^22.0.3` — matches spine's "Angular 22" claim.
- `docker-compose.yml`: `image: postgres:17-alpine` — matches spine's "Postgres 17" claim.
- Four new `ContentType` catalogs (`weaponItem`, `spell`, `groupRole`, `equipmentItem`): confirmed against `apps/api/src/game-systems/game-system.service.ts` — they follow the exact existing `CONTENT_TYPES` array shape (`{ key, label, file }`) and existing `RYUUTAMA_DATA_DIR` (`apps/api/game-systems/ryuutama/data/`, verified to exist with sibling JSON files). No new seeding mechanism, no new package needed.
- `CharacterGroupRole` new Prisma model: pure schema addition, no new package needed (uses existing `prisma-client-js` + `@prisma/client`).
- `weaponId`/`customWeapon` restructure (replacing `weaponCategoryId`): confirmed current field is `weaponCategoryId` in `packages/game-rules/src/ryuutama/types.ts:30` and `validate.ts:55`, exactly as the spine describes as "before" state. Restructure is a type/validation-logic change only, no new dependency.
- No web-framework-version-specific API (Angular signals forms, Nest 11 decorators, Prisma 7 driver adapters) is introduced by this spine that isn't already in active use elsewhere in the codebase.

## File

`E:\dev\jdr-master\_bmad-output\planning-artifacts\architecture\architecture-jdr-master-2026-07-24\reviews\review-versions.md`
