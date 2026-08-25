---
title: Adversarial review — ARCHITECTURE-SPINE.md (Palier 8)
type: review
target: '_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-24/ARCHITECTURE-SPINE.md'
method: 'construct pairs of implementations that each obey every cited AD to the letter, yet clash'
created: '2026-07-24'
---

# Adversarial review — Palier 8 ARCHITECTURE-SPINE.md

Method: for each AD, two hypothetical builders (two developers, or two stories landing in
sequence) read only the AD text — never each other's code — and each makes a locally reasonable,
fully-compliant choice. Reported below only where those two choices are genuinely incompatible in
the same codebase. Excluded: anything the spine's own Deferred section already flags as open
(reassignment-as-a-policy-question, "un personnage ne porte qu'un rôle" unconfirmed unique
constraint, sort-casting mechanics).

**7 incompatibility scenarios found.**

---

## 1. AD-8 — the realtime contract is specified only on the frontend half; the backend obligation is never stated (Severity: High)

AD-8's rule text: *"`CharacterService` (frontend) expose `notifyChanged()`... aucune nouvelle
entrée dans `RealtimeService.handlers`"*. That is a complete, correct description of the
**frontend** wiring. But the frontend `notifyChanged()` only fires in reaction to an SSE
`changed` ping on `partie:{id}` — and that ping is only emitted if some backend service calls
`this.realtimeEvents.emit(partieTopic(partieId))` (`apps/api/src/realtime/realtime-events.service.ts`,
confirmed pattern in `homme-dragon.service.ts`, `announcements.service.ts`, `poll.service.ts`,
`availability.service.ts`, `parties.service.ts:116-124`). `RealtimeEventsService` is `@Global()`
so no module-graph edge forces anyone to notice this dependency, and the AD-6 Mermaid diagram
draws no line from `CharacterRolesModule` to any realtime module at all — the diagram was drawn
without this obligation in mind.

- **Builder A** (backend, implements `CharacterRolesService` strictly from AD-6's text: guard
  reuse + unique-constraint mutation) ships `assign()`/`unassign()` with no `emit()` call, because
  neither AD-6 nor AD-8 tells them to add one — AD-8 talks exclusively about the frontend side.
- **Builder B** (frontend, implements AD-8's frontend text exactly) wires
  `characters.notifyChanged()` to the existing `partie:` prefix, correctly, and stops there because
  AD-8 says explicitly that no new handler entry is needed.

Both are individually spine-compliant. Result: a role assignment persists correctly, but no SSE
event ever fires for it, so the badge (AD-7/FR-14) never updates without a manual page reload for
any other party member watching the roster — precisely the regression AD-8 claims to prevent
("*un badge de rôle qui reste périmé tant que la page n'est pas rechargée*"), reintroduced by two
literal readings of the same AD.

---

## 2. AD-5/AD-6 — assigning an already-held role: unhandled unique-constraint crash vs. silent auto-evict (Severity: High)

`CharacterGroupRole` has `@@unique([partieId, roleKey])` (AD-5) and AD-6 exposes one route,
`/parties/:id/characters/:characterId/role`, scoped **per character** — "assigner/retirer un
rôle". Nothing in AD-5 or AD-6 specifies what `assign()` does when the target `roleKey` already
has a holder in that `partieId` (a case reachable even without deciding the "transfer" policy
question the Deferred section defers — the MJ can simply pick an already-assigned role for a
second character by mistake or intentionally).

- **Builder A** implements `assign()` as `create()` against `CharacterGroupRole`. When the roleKey
  is already taken, Prisma throws `P2002` on `@@unique([partieId, roleKey])`; if this isn't
  explicitly caught (nothing in AD-5/AD-6 says to), it surfaces as an unhandled 500.
- **Builder B** implements `assign()` as "delete any existing row with that `roleKey` in this
  `partieId`, then create the new one" — a silent, transparent transfer, also fully consistent
  with the same AD text.

One crashes the request, the other silently reassigns a role the Deferred section says is an
**unresolved product question** — i.e., Builder B's technically-necessary implementation detail
(to avoid the crash) accidentally pre-decides the very question the spine says is still open.

**Related, same AD pair:** `CharacterGroupRole.partieId` is stored denormalized alongside
`characterId` (not derived transitively via `Character.partieId`), and AD-6 never states that
`assign()` must verify `character.partieId === partieId` from the route. `PartiesService.getOwned`
(P1-AD-3, reused per AD-6) only proves the caller MJs `partieId` — it says nothing about whether
`characterId` actually belongs to that partie. Builder A (trusts route nesting, skips the check)
vs Builder B (defensively re-checks `character.partieId`) diverge on whether a MJ of Partie X can
plant a `CharacterGroupRole` row pointing at a character that belongs to Partie Y.

---

## 3. AD-7 — `RosterRow.assignedRoleLabel` has no specified data path into `buildRosterRows()` (Severity: High)

`roster-row.util.ts` (`apps/web/src/app/features/parties/roster-row.util.ts`) is a **pure
function**: `buildRosterRows(members, characters, mjId, classLabelFor, currentUserId)`. AD-7 says
only "`RosterRow` gagne un champ `assignedRoleLabel`... résolu depuis `CharacterGroupRole` + le
catalogue `groupRole`" — it never states the new parameter shape, nor where the per-partie list of
`CharacterGroupRole` rows is fetched from. AD-6's only specified route is scoped **per character**
(`/parties/:id/characters/:characterId/role`); there is no bulk "list all role assignments for
this partie" endpoint anywhere in AD-6, the Source Tree, or the Capability→Architecture Map.

- **Builder A** (frontend, wiring the roster) needs all role assignments for a partie at once to
  resolve badges for every roster row in a single pass (mirroring how `characters`/`members` are
  already loaded in bulk) — they assume a `GET /parties/:id/roles` aggregate endpoint exists and
  add a matching parameter `groupRoles: CharacterGroupRoleDto[]` to `buildRosterRows`.
- **Builder B** (backend, implementing AD-6 literally) ships only the per-character route the AD
  text names, with no bulk-list variant, since AD-6 never asked for one.

Builder A's frontend call to the aggregate endpoint 404s; the alternative (N+1 per-character
fetches from the one route AD-6 actually specifies) is a materially different integration shape
that no story owns responsibility for building. Either way, two spine-compliant halves don't meet.

---

## 4. AD-2/AD-3 — the resolved weapon catalog shape, and behavior when both `weaponId` and `customWeapon` are persisted, are both unspecified (Severity: Medium-High)

AD-2 states `weaponId` resolves via a new pure function `resolveWeaponCategory(weaponId, catalog)`
in `packages/game-rules`; the Source Tree separately says `validate.ts`/`types.ts` gain
`validWeaponItems` (existence-check only, flat list). But `resolveWeaponCategory` needs the
`categoryId` **per weapon**, not just a flat validity list — i.e. it needs a materially richer
catalog shape than what AD-2's own Source Tree line commits `validate.ts` to. `RyuutamaCatalog`
(`packages/game-rules/src/ryuutama/types.ts`) today is a flat `{validClasses, validTypes,
validWeapons, attributePatterns}` — nothing in the spine says who owns extending this interface
with the `weaponId → categoryId` map, so:

- **Builder A** (writing `validate.ts`'s new exclusivity/existence check) adds
  `validWeaponItems: string[]` exactly as the Source Tree names it — flat keys, no `categoryId`.
- **Builder B** (writing `weapon-resolve.ts`) needs `{key, categoryId}[]` to actually resolve a
  category, and builds their own parallel catalog-shaping code (e.g. in
  `character.service.ts`'s `buildRyuutamaCatalog()`) independently of Builder A's.

Two catalog-builders now exist, built from the same `GameSystemService.getContent('weaponItem')`
source, with no guarantee they stay in sync if the JSON shape changes later.

Separately: AD-3 says `customWeapon`/`weaponId` are "exactement un des deux... jamais les deux,
jamais aucun (`validate()` l'impose)". But `validate()`'s existing return contract
(`validate.ts:71`) is `mode === 'strict' ? errors.length === 0 : true` — in `'mj'` mode, errors are
collected but **never block a save** (the same pattern already used for every other field). A MJ
editing `sheetData` directly can therefore persist a character with both `weaponId` **and**
`customWeapon` set (or neither) despite AD-3's "jamais les deux" claim, and neither AD-2 nor AD-3
says which field `resolveWeaponCategory` should prefer once that state exists.

- **Builder A** implements `resolveWeaponCategory` to prefer `customWeapon` when both are present
  (treats it as "the more specific override").
- **Builder B** implements it to prefer `weaponId` (treats it as "the canonical catalog choice").

Same malformed sheet, two different silently-computed damage/touch formulas depending on which
story wrote `resolveWeaponCategory` — no error surfaces to either the player or the MJ.

---

## 5. AD-4 — budget enforcement locus, and pique-nique/achat co-existence, are both unstated (Severity: Medium)

AD-4's rule places the 1000 Po check "**une seule fois, à la création du personnage**
(`CharacterService.create()`)" — explicitly not inside the reusable, pure `validate()` in
`packages/game-rules` (which is the natural home for every other "single source of truth" rule in
this codebase, per P6-AD-1 and every other AD in this spine). That's an explicit, unusual
carve-out with no stated reason, and it creates a real fork:

- **Builder A** takes AD-4 literally: the check lives only in `CharacterService.create()`, is a
  one-time gate, and any subsequent PATCH to `sheetData` (e.g. narrative edits, MJ corrections)
  that happens to touch `equipment.individual` bypasses the cap entirely, since `validate()` itself
  never enforces it (consistent with AD-4's own text).
- **Builder B**, following the codebase's established convention that "single source of truth"
  rules belong in `validate()` (P6-AD-1, and every derived-value rule in this same spine), bakes
  the budget sum into `validate()` so it re-runs on every strict save — a stricter behavior AD-4's
  literal text never asked for, and one that will reject saves AD-4 never intended to gate (e.g. a
  MJ granting bonus equipment post-creation, which the existing `addedBy: 'mj'` inventory pattern
  already supports and expects to be ungated).

Separately, AD-4's rule computes the cap as "somme des `priceGold` des `equipmentItem` choisis" —
it does not say whether choosing the free pique-nique list *and* additionally buying items (nothing
in FR-10/AD-4 states these two modes are mutually exclusive at the **API** level, only that the
wizard *step* presents them as an either/or UI choice) still caps at 1000 Po total, or whether
pique-nique items are simply invisible to the budget calculation because they're a different
selection path. Two builders can each implement a technically-correct "sum of `equipmentItem`
purchases ≤ 1000 Po" check while disagreeing on whether combining both modes is even rejected.

---

## 6. AD-4 — `equipmentItem`'s "nature" (individual/contenant/animal) discriminator is never named, and collides with the existing `Animal` type contract (Severity: Medium)

AD-4: a purchased item "est ensuite inséré tel quel... sous la forme `InventoryItem` existante...
**selon sa nature**" — into `equipment.individual`, `.contenants`, or `.animaux`. But
`packages/game-rules/src/ryuutama/types.ts` defines `Animal = Omit<InventoryItem, 'weight'>` — an
Animal row must **structurally never carry a `weight` field** (per the type's own doc comment,
this is an intentional structural absence, not merely optional/undefined — a distinction the
codebase already treats as load-bearing, cf. FR8 in that same file's comments). AD-4 never names
the field on an `equipmentItem` JSON entry that discriminates which of the three buckets it belongs
to, nor does it flag that inserting a purchased "monture" (mount) into `.animaux` requires actively
stripping `weight`, not just omitting it from the catalog entry.

- **Builder A** (writing `equipment-items.json` + insertion logic) adds a `kind:
  'individual'|'contenant'|'animal'` field to each catalog entry and, when building the
  `InventoryItem` to insert, explicitly constructs an object literal without `weight` for animal
  entries.
- **Builder B** (same task, same AD text, no shape specified) keeps a single uniform `weight` field
  on every `equipmentItem` entry (since AD-4 only ever mentions `priceGold` as the new field) and
  spreads the catalog entry directly into the inserted row, producing `equipment.animaux` entries
  that silently carry a `weight` — violating the `Animal` type's structural invariant at the JSON
  level (Prisma's `Json` column enforces nothing at runtime), which any code elsewhere trusting
  "animaux rows never have `.weight`" (existing FR8-era code, per the type comment) will now
  silently mishandle.

---

## 7. AD-10 locks the talent's `effect` shape; the symmetric ambiguity for `spell` (AD-1/FR-11) is left completely open (Severity: Low-Medium)

AD-10 exists specifically because "*une forme ambiguë où deux implémentations imbriqueraient
différemment `attributes`/`difficulty`*" was foreseen for talents, and locks
`{name, description, effect: {description, conditions}, attributes, difficulty}` exactly to
prevent it. FR-11/AD-1 introduce a new `spell` `ContentType` with the **same shape risk** — "chaque
sort... a au minimum un nom et une description/effet non vide" (FR-11) is the only constraint
given, with no AD pinning down whether `effect` is a flat string or a structured object.

- **Builder A** (seeding `spells.json`) reuses the exact talent pattern by analogy: `effect:
  {description, conditions}`.
- **Builder B** (seeding `spells.json`, or a different story building the sheet/step component that
  reads it) treats `spell.effect` as a plain string, since AD-1's own text for the four new content
  types says only "*même format minimal que les catalogues existants (`{key, label, ...champs
  propres}`)*" with no further structure implied, and nothing forces the talent precedent onto
  spells.

Lower severity than the others because it's a display-layer mismatch (a component reading
`spell.effect.description` against string data, or vice versa) rather than silent data corruption
or a dead realtime path — but it is the exact class of ambiguity AD-10 was written to eliminate,
left unaddressed for the sibling catalog introduced in the same spine.

---

## Summary

| # | AD(s) | Divergent choices | Break |
| --- | --- | --- | --- |
| 1 | AD-8 (+AD-6) | backend never emits `partieTopic` change vs. frontend correctly wired to receive it | badge silently never updates live — the exact regression AD-8 claims to prevent |
| 2 | AD-5/AD-6 | assign-on-taken-role: unhandled 500 vs. silent auto-evict | crash, or a pre-decision of the still-open reassignment policy; plus unchecked cross-partie `characterId` |
| 3 | AD-7 (+AD-6) | frontend expects a bulk role-list endpoint vs. backend ships only the per-character route | 404 or unplanned N+1, integration break |
| 4 | AD-2/AD-3 | two independently-built weapon catalogs (flat vs. categoryId-bearing); ambiguous precedence when both/neither of `weaponId`/`customWeapon` are set (reachable via MJ non-strict mode) | silently wrong touch/damage formulas |
| 5 | AD-4 | budget check in `CharacterService.create()` only vs. baked into `validate()` (codebase's usual locus for such rules); pique-nique+achat combination unaddressed | budget cap bypassable, or over-strict rejection of legitimate MJ edits |
| 6 | AD-4 | no named "nature" discriminator on `equipmentItem`; `Animal`'s no-`weight` structural invariant not called out | silent structural corruption of `equipment.animaux` rows |
| 7 | AD-1/AD-10 | talent `effect` shape locked, spell `effect` shape left open despite identical risk | display-layer shape mismatch |
