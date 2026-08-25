# Adversarial Review — ARCHITECTURE-SPINE.md (Palier 5 : Homme Dragon)

**Method:** for each area of interest, construct two downstream units (implementers/files) that each read the spine literally, comply with every AD they touch, and yet produce incompatible artifacts. Each pair is evidence of an underspecified AD, not a coding mistake — the spine's wording, not the hypothetical implementer, is the defendant.

**Verdict up front:** the spine is directionally sound (reuses established patterns faithfully) but leaves five load-bearing joints under-specified enough that two compliant implementations can diverge or actively conflict: the `derived` field's persistence contract contradicts itself internally, the AD-4 catalog payload shape is unspecified, the AD-5 asset `key` has no canonical enum/shared type, `sheetData.artefact.key` referential integrity has no assigned owner, and the game-rules/service validation boundary is undrawn. All five are closable with tightened wording or one new AD each; none require new modules or a paradigm change.

---

## Finding 1 — `derived` field: "cache of last read" contradicts "jamais stocké" (Critical)

**Spine text in tension:**
- AD-3 rule: *"le niveau de l'Homme Dragon est fonction du nombre de `Scenario` PASSE... calculé à la lecture par `HommeDragonService` (jamais stocké)."*
- Structural Seed, same document: `derived Json // { level, PS } — calculés à la lecture (AD-3), champ = cache de la dernière lecture, jamais la source de vérité`
- Consistency Conventions: *"Toute valeur dérivable... est **calculée à la lecture**, jamais stockée."*

These three statements do not agree. "Jamais stocké" (never stored) and "champ = cache de la dernière lecture" (a column that caches the last read) describe opposite storage behaviors. The spine ships a Prisma column (`derived Json`) for a value it simultaneously declares must never be persisted.

**Two compliant, incompatible implementers:**

- **Implementer A** reads "cache of last read" literally: `HommeDragonService.get()` computes `{level, PS}` and does `prisma.hommeDragon.update({ data: { derived } })` on every GET, so the column always reflects the last read. This is a write triggered by a read endpoint — it silently bumps `updatedAt` on every `GET /parties/:id/homme-dragon`, which corrupts the "MJ seul écrivain, pas de verrouillage optimiste" reasoning in AD-2 (an unrelated read from the MJ's own browser tab, a background refresh, or even a *player's* read via `parties.getViewable` would touch `updatedAt`) and defeats any future consumer that treats `updatedAt` as "last edited by MJ."
- **Implementer B** reads "jamais la source de vérité / jamais stocké" literally: the `derived` column is left at its `@default` value (or never populated on create), `HommeDragonService.get()` computes the DTO's `derived` purely in memory, and the Prisma column is dead weight that never changes after row creation.

Both are defensible readings of the same paragraph. A schema migration, a debugging session, or a second engineer inspecting the DB will get contradictory signals about whether that column is meaningful. Worse: if a player-facing read (B's assumption: reads never write) accidentally triggers A's code path in a later merge, a player's GET request would silently mutate a MJ-owned row — a write-on-read that AD-2 never anticipated and that P1-AD-2 ("mutations exclusivement en couche Service") technically permits since it *is* the service, but AD-2's entire rationale ("MJ seul écrivain") assumes writes are user-intentional.

**Fix:** state explicitly in AD-3 (not just the Prisma comment) one of:
(a) the `derived` column is **write-only-on-mutation** (recomputed and persisted inside `HommeDragonService.update()` alongside the MJ's edit, never inside `.get()`), so reads are always pure and the column reflects "derived state as of the last write" — the only reading consistent with AD-2's write model; or
(b) drop the column from the Prisma model entirely and compute `derived` transiently in the DTO mapper, since AD-3's own rule text says "jamais stocké."
Pick one. As written, both are "spec-compliant."

---

## Finding 2 — AD-4 `ContentType.data` payload shape unspecified for `hommeDragonArtefact` / `eveilPower` (High)

AD-4 fixes the *mechanism* (`ContentType`/`ContentEntry`, seeded from JSON, scope `BASE`) but never fixes the *shape* of `ContentEntry.data: Json` for these two new types. Nothing in the spine, the Structural Seed, or the shared types section constrains what fields an artefact or éveil-power entry carries.

**Two compliant, incompatible implementers:**

- **Data engineer** writing `homme-dragon-artefacts.json` ships entries shaped `{ key, label, data: { description: string, rarete: 'commun'|'rare'|'legendaire' } }`, matching the existing PJ weapon-category JSON convention they copied.
- **PDF/frontend engineer** writing `homme-dragon-pdf-field-map.ts` and the `homme-dragon-sheet.ts` component needs to print the artefact's *effect text* on the PDF and show an icon in the picker, so they assume `data: { effet: string, icone: string }`. Neither field exists in the JSON the data engineer produced; the mapping silently prints `undefined` or the field-map throws, and nobody notices until PDF export is exercised because `ContentEntry.data` is `Json` end-to-end with no compile-time check.

Same clash applies symmetrically to `eveilPower` (does a power have `effetTexte`, `prerequisNiveau`, both — is `prerequisNiveau` even meaningful given AD-3 already gates the choice to "franchir un seuil de niveau ouvre un choix MJ"? if power entries carry their own level requirement, that's a second, unsynchronized source of truth for "which level unlocks which power," a direct duplication AD-3 explicitly tries to prevent for level/PS).

**Fix:** add a minimal field contract to AD-4, e.g. `hommeDragonArtefact.data: { description: string }`, `eveilPower.data: { description: string, niveauMin?: 3|4|5 }`, and state whether `niveauMin` is authoritative or purely descriptive (to avoid re-deriving level-gating logic in two places).

---

## Finding 3 — AD-5 asset `key`: no canonical enum, two plausible naming schemes (High)

AD-5 lists the keys in prose only: *"journal, carte, monde, monstre, ville, objectif (×3 : chasse/quête/voyage), œuf de bataille, structure."* The route is `GET /parties/:id/game-systems/:systemId/assets/:key`, and the mapping table lives inside `GameSystemService` (backend-only, per the Source Tree entry `game-system.service.ts # + table clé->fichier->accès`). No shared type in `packages/shared` enumerates these keys, and the spine's own French prose uses accented, spaced, slash-compound phrasing ("œuf de bataille", "objectif (×3 : chasse/quête/voyage)") that is not itself a valid identifier — someone has to invent the string form.

**Two compliant, incompatible implementers:**

- **Backend engineer** keys the table with the PDF filename stems already on disk (per `apps/api/game-systems/ryuutama/assets/` inventoried in `sources`), e.g. `oeuf-de-bataille`, `objectif-chasse`, matching whatever the existing asset filenames use.
- **Frontend engineer**, with no shared enum to import, builds the download links from the French labels camelCased for readability: `oeufBataille`, `objectifChasse`.

Both satisfy AD-5's letter (it never specifies key casing/format). Result: 404s on every asset link until someone diffs the two lists by hand. This is the same class of bug AD-5 explicitly tries to prevent for *access* level ("une divergence d'accès non documentée entre fiches « membre » et « MJ »") but the AD only closes that hole for `access`, not for `key` itself.

**Fix:** add to AD-5 (or `packages/shared`) an explicit exported literal union / const array of the 8 (10 counting the ×3 objectif split) keys, e.g. `export type RyuutamaAssetKey = 'journal' | 'carte' | 'monde' | 'monstre' | 'ville' | 'objectif-chasse' | 'objectif-quete' | 'objectif-voyage' | 'oeuf-bataille' | 'structure'`, imported by both `GameSystemService`'s table and the Angular asset-link component. This is a one-line addition that removes an entire class of silent breakage.

---

## Finding 4 — `sheetData.artefact.key` referential integrity: no assigned owner, validated nowhere by spec (Medium-High)

`HommeDragon.sheetData.artefact.key` is documented (Structural Seed comment, shared DTO) as pointing at a `hommeDragonArtefact` `ContentEntry`, but AD-4 never states *whether* that reference is validated, and if so, where. `sheetData` is `Json` (no DB-level FK, consistent with how `Character.sheetData` already works per Inherited Invariants) — so the only enforcement point can be application code, and the spine assigns it to nobody.

**Two compliant, incompatible implementers:**

- **Implementer A** adds a check inside `HommeDragonService.update()`: before persisting, load `ContentEntry`s of type `hommeDragonArtefact` for the game system and reject (400) if `sheetData.artefact.key` isn't among them. This satisfies P1-AD-2 (mutation logic lives in the service) and AD-2 ("MJ seul écrivain" — service owns the write path).
- **Implementer B**, reading AD-2's rule literally ("`HommeDragonService.update()` fait un `prisma.hommeDragon.update()` simple, sans comparaison `updatedAt`" — emphasis on *simple*), takes "simple" to mean no additional business-rule branching either, and ships an update method that passes `sheetData` straight through. Any string satisfies `artefact.key`, including a stale key after an artefact is renamed/removed from the seed JSON, or a typo from a manually-crafted request.

Neither reading contradicts AD-2's text ("simple" is ambiguous between "no optimistic-lock comparison" and "no validation at all"). The practical incompatibility surfaces at the `homme-dragon-pdf-field-map.ts` boundary (see Finding 5): A's world never hands the mapper an invalid key; B's world does, and the mapper's behavior on an unknown key (blank field? thrown error? previous request's cached value?) is itself unspecified.

**Fix:** AD-4 or AD-2 should say explicitly whether `artefact.key` is validated against live `ContentEntry`s on write (server-side), left to client-side catalog-picker UX only (i.e., intentionally trusting the client, consistent with "aucune donnée en base" elsewhere), or both. Given P1-AD-2's mutation-in-service-layer principle, silence here reads as an oversight rather than a deliberate "trust the client" choice.

---

## Finding 5 — `packages/game-rules` vs `HommeDragonService`: validation/error-handling boundary undrawn (Medium)

AD-1/AD-3 assign `homme-dragon-derived.ts` and `homme-dragon-pdf-field-map.ts` to `packages/game-rules/ryuutama`, and AD-1 assigns "AD-1 à AD-4" broadly to `homme-dragon.service.ts` per the Source Tree comment. But the spine never states the contract between them: are game-rules functions required to be pure (no throwing on malformed input, return a best-effort/blank mapping) with the service responsible for pre-validating, or are game-rules functions the validation layer (throwing/returning a Result type) with the service a thin pass-through?

This matters concretely for Finding 4's fallout (an artefact key that doesn't resolve to a `ContentEntry`) and for malformed `race`/enum fields in `sheetData` generally.

**Two compliant, incompatible implementers:**

- **Implementer A** treats `packages/game-rules` as the existing PJ code already does (per the project's own established convention of pure, side-effect-free rule functions used across two runtimes potentially) — `homme-dragon-pdf-field-map.ts` never throws; on an unresolvable artefact key it silently emits an empty PDF field. All error surfacing (400s, validation) happens in `HommeDragonService` before calling into game-rules.
- **Implementer B**, working from AD-4's silence (Finding 4) and seeing no validation in the service, puts the "does this key exist" check inside `homme-dragon-pdf-field-map.ts` itself (since the mapper is the only place that actually needs the artefact's `data.description` and is best positioned to know it's missing), and has it throw. This function is then invoked directly in a `jest.mock()`-covered spec (recall project memory: game-rules functions get imported directly and must be jest-mocked in API specs) — a throwing pure function surprises spec authors expecting a pure transform, and a PDF export request now 500s instead of 400ing with a clear message, because the service never anticipated an exception from what it assumed was a total function.

Both are locally reasonable extensions of "game-rules holds Ryuutama-specific logic" (Design Paradigm) and "mutations in Service layer" (P1-AD-2, which governs writes, not read-side computation, leaving computed-PDF-export error handling unassigned).

**Fix:** state in AD-1 or AD-6 that `packages/game-rules` functions are pure and total (never throw, degrade gracefully on malformed input) and that all validation/error-response decisions belong to the `*Service`/`*Controller` layer — mirroring the pattern implied by P1-AD-2 but currently only stated for mutations, not for the read/export path.

---

## Finding 6 — `historique[].date` and `.participants`: field semantics unpinned (Medium)

The shared DTO declares:
```
historique: { scenarioTitle: string, date: string, participants: string[] }[]
```
AD-3 says this is "assemblé à la volée" from `Scenario`/`Membership` via the read-only `ScenariosModule` import, but doesn't say which `Scenario` timestamp becomes `date` (`createdAt`? `updatedAt`? a "played on" field if one exists?) nor whether `participants` holds `userId`s or display `pseudo`s — notably, the sibling field `voyageursProteges` in the *same* DTO explicitly uses `{ userId, pseudo }` pairs, while `historique[].participants` is bare `string[]`, inviting two different engineers to reuse the `voyageursProteges` shape for consistency vs. taking the DTO literally as pseudo strings for display.

**Two compliant, incompatible implementers:** one populates `participants` with `userId`s (consistent internal identifier, requires a join to render), the other populates it with `pseudo`s (matches the field's apparent display purpose, per the DTO's bare `string[]`, but is now unjoinable back to a user for any future feature — e.g. linking a name to a profile). Both match the DTO signature (`string[]`) exactly; TypeScript catches nothing.

**Fix:** pin the `date` source field and change `participants` to `{ userId, pseudo }[]` (matching `voyageursProteges`) or explicitly document it as display-only `pseudo[]`.

---

## Summary Table

| # | Area | Severity | Two compliant units that clash |
| --- | --- | --- | --- |
| 1 | `derived` persistence | Critical | write-on-every-read vs. never-persisted — contradicts AD-2's write model either way |
| 2 | AD-4 `ContentType.data` shape | High | data JSON vs. PDF/frontend field expectations diverge, `undefined` at render time |
| 3 | AD-5 asset `key` naming | High | filename-stem keys vs. camelCased-label keys — 404s |
| 4 | `artefact.key` referential integrity | Medium-High | service validates vs. service passes through untouched |
| 5 | game-rules/service validation boundary | Medium | pure-and-silent mapper vs. throwing mapper — inconsistent error UX, breaks jest.mock() assumptions |
| 6 | `historique[].date`/`.participants` semantics | Medium | userId vs. pseudo, unspecified timestamp source |

All six are closable by tightening existing AD wording (1, 4, 5) or adding one short clause / shared-type export (2, 3, 6) — none require restructuring modules or reopening the Design Paradigm.
