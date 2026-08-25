# Rubric Walker Review — ARCHITECTURE-SPINE.md (Palier 4 suite)

**Verdict: pass-with-notes.** The spine is well-structured, correctly scopes and cites its inherited invariants, covers all 20 FRs in the Capability Map, and introduces no unjustified new tech. It has one substantive correctness gap (AD-5's race-condition claim) that should be fixed before implementation, plus several medium/low gaps in divergence coverage and cross-document consistency.

---

## Critical

None found.

---

## High

### H1 — AD-5's capacity-check "Rule" does not actually prevent the race it claims to prevent

- **Checklist item violated:** #2 (every AD's Rule is enforceable and actually prevents its stated divergence).
- **Location:** AD-5, lines 68–72 (`ScenariosService.inscrire`), and the `Inscription` Prisma model (lines 191–200).
- **Why it's a real problem:** AD-5's stated `Prevents` is explicitly "dépassement du quota maximum par une course entre deux inscriptions concurrentes," and the Rule is: within a `prisma.$transaction`, `count(Inscription where seanceId)` then `create` if `count < max`. Under PostgreSQL's default `READ COMMITTED` isolation (which is what Prisma's `$transaction` uses unless an isolation level is explicitly requested, and the codebase's existing `$transaction` usages — e.g. `poll.service.ts:43`, `availability.service.ts:165` — never set one), two concurrent `inscrire()` calls can each execute their `count()` before either commits its `create()`. Both will observe `count < max` and both will insert, allowing the seat count to exceed `max`. This is not a theoretical nitpick: EXPERIENCE.md's own State Patterns table (§5) makes an explicit promise for this exact scenario — *"Deux joueurs s'inscrivent au dernier créneau simultanément (course, FR-19) → Un seul obtient la place (premier arrivé, verrouillage serveur)... jamais une double inscription silencieuse au-delà du maximum."* The spine's chosen mechanism does not deliver that guarantee. The `@@unique([seanceId, userId])` constraint only prevents the *same* user double-registering; it does nothing for two *different* users racing for the last seat.
- **Note:** this is not the same thing as the already-accepted "Option A, service-level not DB-level" decision — that decision is about *where* capacity is checked (service vs. a DB CHECK constraint), which is fine to keep. The gap is that the described service-level mechanism, as written, is not actually safe against the concurrent case it names as its reason for existing.
- **Suggested fix:** Either (a) require `SERIALIZABLE` isolation (or `SELECT ... FOR UPDATE` on a row representing the `Seance`, e.g. lock the `Seance` row itself before the count) explicitly in the Rule text, with a documented retry-on-serialization-failure convention, or (b) add a lightweight DB-level backstop that doesn't contradict the "Option A" decision — e.g. a deferred unique constraint isn't applicable here, but a `CHECK` via a materialized counter column updated transactionally, or simply documenting that `inscrire()` must take an explicit row lock (`tx.$queryRaw` `SELECT ... FOR UPDATE` on the `Seance` row) before counting. Whichever is chosen, the Rule text should say it explicitly — right now it under-specifies isolation level, which is the actual mechanism that determines whether the guarantee holds.

---

## Medium

### M1 — Same race-pattern reused in AD-10, with the same unaddressed isolation-level gap

- **Checklist item violated:** #2.
- **Location:** AD-10, lines 98–102.
- **Why it's a problem:** AD-10 explicitly models itself on the same "check-then-write in a transaction" pattern as AD-5 ("Même stratégie de vérification-en-transaction que AD-5... et P2-AD-4"). It inherits the same theoretical isolation-level gap: two concurrent `ouvrir()` calls on two different `Scenario`s of the same `Partie` could both observe "no other COURANT" and both succeed, producing two simultaneously `COURANT` scenarios in a `CAMPAGNE_LINEAIRE` — the exact outcome AD-10 exists to prevent. Severity is lower than H1 because (a) this is a MJ-only, low-frequency, single-actor action (a MJ is unlikely to double-click "ouvrir" on two different scenarios within the same request window the way two different players racing for a seat is a realistic UX pattern), and (b) the blast radius is a data-consistency anomaly, not a promised-and-violated product guarantee.
- **Suggested fix:** Same as H1 — if H1 is fixed by specifying an explicit lock/isolation strategy in the spine's "transaction-check" convention, apply the same fix uniformly to AD-10 (and note that P2-AD-4, if it has the same gap, is out of scope for this palier but worth a follow-up ticket).

### M2 — FR-20 announcement anti-spoil has no governing AD, despite being a stated FR consequence

- **Checklist item violated:** #1 (real divergence point not fixed), #6 (Capability Map completeness — the map row cites the wrong/incomplete set of governing ADs).
- **Location:** AD-2 (lines 50–54), Capability Map row for FR-20 (line 345), PRD FR-20 (lines 237–243), EXPERIENCE.md §4 "Annonces" (lines 134–139).
- **Why it's a real problem:** FR-20's testable consequence states "une annonce scopée à un scénario n'est visible que par les participants de ce scénario (respecte l'anti-spoil...)" and EXPERIENCE.md is more specific: the scope selector must list *only* `Courant`/`Passé` scenarios as valid targets, because scoping an announcement to a `Brouillon`/`À venir` scenario "n'a pas de sens et fuiterait indirectement son existence." AD-2's Rule only validates that a `scenarioId` exists and belongs to the target `Partie` — it says nothing about status. Given AD-6 makes the backend anti-spoil-blind by design (full data always returned, frontend filters), a future implementer has no spine guidance on: (a) whether `AnnouncementsService.create()` should reject a `scenarioId` referencing a non-`Courant`/`Passé` scenario, or (b) whether (consistent with the AD-6 philosophy) the backend should accept anything and the Angular announcement list must cross-reference each announcement's `scenarioId` against that scenario's current status before rendering. Two independently-built pieces (create-time validation vs. list-time filtering) could easily diverge — one dev blocks it server-side, another assumes AD-6's "never filter server-side" convention applies here too and only filters client-side, leaving a residual leak in whichever layer nobody implemented.
- **Suggested fix:** Add a short rule to AD-2 (or a new AD-2b) stating explicitly which layer enforces "no announcement creation/visibility scoped to a Brouillon/À venir scenario," consistent with the AD-6 pattern (most likely: backend accepts any valid `scenarioId` per AD-6's philosophy, frontend `AnnouncementList`/`AnnonceCard` filters using the already-fetched `ScenarioDto.status`). Add AD-6 to the Capability Map's governing-ADs cell for FR-20.

### M3 — Deferred section flags the EXPERIENCE.md §7 contradiction but misses the parallel DESIGN.md §8 contradiction

- **Checklist item violated:** #3/#7 in spirit (a known-accepted divergence's blast radius is under-scoped, risking two docs staying inconsistent with the ratified decision).
- **Location:** Deferred table, row 2 (line 352); DESIGN.md §8 Do's and Don'ts (line 248).
- **Why it's a problem:** AD-6 explicitly and deliberately extends the frontend-only anti-spoil decision to cover `Brouillon` as well as `À venir` ("quel que soit le statut du scénario (y compris `Brouillon`)... **Aucune donnée n'est retirée côté serveur**"). The Deferred section correctly flags that this contradicts EXPERIENCE.md §7's "backend-strict" note and schedules a correction. However, DESIGN.md §8 contains its own, stronger and now-also-false claim: *"Don't afficher un scénario Brouillon où que ce soit dans une vue joueur, même par erreur de filtre — **c'est la seule barrière anti-spoil totale du produit**"* — i.e. DESIGN.md asserts `Brouillon` is uniquely a *total* (implicitly server-enforced) barrier, unlike `À venir`. AD-6 removes that distinction: under AD-6, `Brouillon` gets exactly the same (frontend-only) protection as `À venir`, no stronger. This is a second source document asserting something AD-6 directly contradicts, and it is not listed in Deferred alongside the EXPERIENCE.md §7 fix — so the correction pass at Finalize will likely fix one and miss the other, leaving DESIGN.md internally contradicting the ratified spine.
- **Suggested fix:** Add a second Deferred row (or extend the existing one) covering DESIGN.md §8's "seule barrière anti-spoil totale" claim, scheduled for the same correction pass as EXPERIENCE.md §7.

---

## Low

### L1 — No AD governs whether `ScenarioParticipant` is ever populated for linear/one-shot Parties

- **Checklist item violated:** #1.
- **Location:** Capability Map row "FR-17/18" (line 343, cites only AD-9); `Scenario.participants` field comment (line 170, "épisodique, choix individuel FR-18"); `ScenarioParticipant` model (lines 202–210).
- **Why it's a problem:** FR-17 (linear/one-shot: implicit participation = all `Membership`s) and FR-18 (episodic: explicit opt-in via `ScenarioParticipant`) are two different participant-derivation mechanisms, similar in spirit to the AD-4 "two never-merged date mechanisms" distinction — but unlike AD-4, there is no dedicated AD stating that `ScenarioParticipant` rows must *never* be created/read for a `CAMPAGNE_LINEAIRE`/`ONE_SHOT` `Partie`, or specifying that the linear participant list is always derived live from `PartiesService`/`Membership` rather than from the `ScenarioParticipant` table. The only signal is an inline schema comment, which is not an enforceable Rule. Two independently-built endpoints (e.g. a future "participants" read endpoint built by someone who assumes `ScenarioParticipant` is the single source of truth for all `Partie.kind`s) could diverge on this.
- **Suggested fix:** Add a one-line Rule (either folded into AD-4 or a new short AD) stating that `ScenarioParticipant` rows exist only for `CAMPAGNE_EPISODIQUE`; for other kinds, the participant list is always computed from `PartiesService`'s membership, never persisted per-scenario.

### L2 — Capability Map cites the wrong governing AD for FR-14 (compte-rendu)

- **Checklist item violated:** #6 (map accuracy).
- **Location:** Capability Map row "FR-11 à FR-14" (line 340, cites AD-4 only).
- **Why it's a problem:** AD-4 governs only the *date-selection* mechanism split (poll vs. inscription); it says nothing about compte-rendu authorship/entity modeling. The rule that actually governs FR-14 (compte-rendu is a field on `Seance`, not an independent entity, MJ-only write) is AD-1 (line 48) plus AD-9 (write = MJ-only), neither of which is cited for this row. This is a minor documentation-accuracy issue, not a substantive gap (AD-1's rule text does cover it), but it makes the map slightly misleading for someone using it to trace "which AD do I need to read before touching compte-rendu."
- **Suggested fix:** Add AD-1 and AD-9 to the "Governed by" cell for the FR-11–FR-14 row (or split FR-14 into its own row).

### L3 — `ScenarioDto.description` typed optional despite AD-6 guaranteeing unconditional presence

- **Checklist item violated:** #2 (minor — Rule/type consistency, not enforceability of the AD itself).
- **Location:** `packages/shared` type block, line 313 (`description?: string`), with its own comment acknowledging "la donnée existe toujours dans la réponse."
- **Why it's a problem:** AD-6's whole point is that the backend never omits data based on viewer role/status. The shared DTO type nonetheless marks `description` as optional (`?`), which is the TypeScript idiom for "may be absent." A frontend engineer skimming the type (without reading the inline comment) could reasonably write defensive `description ?? ''`-style code assuming server-side omission is possible, which is the exact two-tier inconsistency AD-6 is trying to rule out at the API-contract level, now leaking into the type contract instead.
- **Suggested fix:** Type it as `description: string | null` (present, possibly empty/null) matching the actual Prisma field (`description String?` = nullable, not absent), and drop the misleading `?`.

---

## Summary of checklist coverage

- #1 (divergence points fixed) — mostly good; gaps at M2, L1.
- #2 (AD Rules enforceable) — H1/M1 are real gaps; everything else checks out.
- #3 (Deferred section doesn't hide an incompatible divergence) — mostly fine; M3 is a scoping gap on an already-accepted divergence's documentation follow-up, not a new divergence.
- #4 (tech/versions plausible) — clean, no new dependencies introduced; multer/5MB/portrait-upload reuse verified against the actual codebase (`character.service.ts`, `image-mime.util.ts`).
- #5 (ratifies brownfield) — verified against source: `@@map("session")` claim, `$transaction` conventions, and `ForbiddenException`/`NotFoundException` usage all match the existing codebase.
- #6 (Capability Map covers all 20 FRs) — confirmed all FR-1..FR-20 appear exactly once; L2/M2 are governance-citation accuracy issues within an otherwise complete map.
- #7 (no new AD weakens a cited parent AD) — checked P1-AD-1..5, P2-AD-1/2, P3-AD-9, P4e-AD-1 citations; all are correctly scoped as either reused-as-is or explicitly-diverged-with-rationale (AD-3 vs P3-AD-9). No unacknowledged weakening found.
- #8 (every structural dimension decided/deferred/flagged) — operational/deployment envelope is explicitly addressed in Deferred ("Environnement/déploiement... aucun changement... reste porté par le Palier 7"), satisfying this item. No other structural dimension found completely silent.
