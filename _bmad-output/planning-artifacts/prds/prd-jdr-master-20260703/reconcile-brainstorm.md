# Reconciliation — Brainstorm roadmap (P3) vs PRD P3 + addendum

> Compare `roadmap.md` + `brainstorm-intent.md` (2026-06-26) against `prd.md` + `addendum.md` (2026-07-03),
> and checks Prisma sketch fidelity to `docs/spec.md` §5/§6.

---

## Covered

- **Ryuutama first, risk-minimization rationale** — roadmap §"Ordre des systèmes de jeu" and brainstorm-intent §4 both
  say Ryuutama validates the plugin architecture at minimal risk before Conte de Minuit / Draconis. PRD context section
  states this explicitly and cites the brainstorm as the decision source.
- **`GameSystemPlugin` interface reused from spec** — PRD F1 lists `sheetSchema`, `creationSteps`, `createBlankCharacter`,
  `validate`, `computeDerived` as the subset implemented this palier, consistent with roadmap's MUST line
  ("Interface plugin `GameSystem`: `createCharacter`, `renderSheet`, `validate`, `computeDerived`, `exportPDF`").
- **Seed JSON to populate Ryuutama** — PRD F2 (classes, talents, attributes, weapon categories) matches roadmap P3 MUST
  ("Seed JSON pour peupler Ryuutama (races, compétences, attributs)").
- **Guided character creation with typed steps, simple form rendering** — PRD F3 matches roadmap P3 MUST + brainstorm §3
  ("steps typées, le front choisit le rendu"); PRD explicitly picks formulaire simple (not stepper) since Ryuutama's
  step count is low/linear — consistent with brainstorm's rendering-choice principle.
- **Validation niveau 1 (strict)** — PRD FR-3.9 implements strict/blocking validation only, explicitly deferring niveaux
  2-3 (MJ overrides, `grantedItems[]`, mode MJ-valide) to P4 — matches roadmap P3 MUST ("Validation fiche niveau 1") and
  P4 MUST (niveaux 2-3).
- **PDF export** — PRD F4/FR-4.2 covers Ryuutama sheet PDF export, matching roadmap P3 MUST.
- **MJ ↔ Joueur view toggle** — PRD FR-4.3 gives MJ read-only access to players' sheets; roadmap P3 MUST lists "Bascule
  vue MJ ↔ Joueur" — PRD's version is narrower (read access only, not a full mode-switch UI) but functionally consistent
  with what's needed at this palier.
- **Conditional steps (SHOULD)** — roadmap P3 SHOULD lists "Steps conditionnelles (si choix A → étape B disponible)".
  PRD FR-3.1 implements exactly this for Artisan (sub-choice of specialty object type blocks progression) — covered,
  though not labeled as a SHOULD-tier feature explicitly.
- **NFR-2 reusability for next system** — PRD explicitly requires the interface work unmodified for Conte de Minuit,
  matching brainstorm-intent §4 ordering intent.
- **Contenu sous droits / seed confidentiality** — PRD NFR-1 and F2.2 (gitignored seed folder) is a sensible operational
  addition not present in roadmap/brainstorm, but doesn't contradict anything there — the brainstorm never addresses
  IP/licensing of Ryuutama content at all. This is a legitimate PRD-level elaboration, not a gap.

---

## Gaps found (2-5)

1. **"Un système peut hériter d'un autre" / hiérarchie de plugins — silently dropped, and flagged as still-open in
   both sources.** Roadmap §"Décisions architecturales clés" #1 explicitly states: *"Un système peut hériter d'un
   autre (ex : Draconis hérite d'un plugin D&D 5e SRD générique et surcharge)."* Brainstorm-intent §6 "Points ouverts"
   repeats this as unresolved: *"Hiérarchie de modules plugins (ex : Draconis hérite D&D 5e SRD) — à étudier avant
   P3/P7."* The PRD's `GameSystemPlugin` interface sketch (F1, FR-1.2) has no mention of inheritance/composition
   between systems, and there's no Open Question capturing that this was deliberately deferred. Since the brainstorm
   flagged this as something to study *before* P3, its complete absence from the PRD (not even as a "punted, revisit
   before Draconis" note) is a real gap — a future reader of this PRD alone would not know the question ever existed.

2. **MJ override / "état MJ-override" ownership question — not carried into PRD's Open Questions.** Brainstorm-intent
   §6 lists as an open point: *"Qui est propriétaire de la validité de la fiche quand MJ override ? Proposition 'état
   MJ-override' (suspend la validation stricte) — à formaliser en P3."* This is explicitly scoped to be formalized
   *during P3*, yet the PRD defers all MJ-override/niveaux 2-3 work wholesale to P4 (Out of Scope section) without
   acknowledging that the brainstorm wanted at least the *design/ownership model* settled now, even if implementation
   waits. `validate()` is noted as "reste une fonction séparée pour rester compatible" (FR-3.9) — a nod toward
   compatibility — but the actual open question (who owns the sheet's validity state under override) is neither
   answered nor listed among the PRD's 4 Open Questions. Should be added or explicitly re-deferred with rationale.

3. **Tone/intent nuance: "risque minimal" framing narrows to only architecture-interface risk, dropping the
   qualitative "if the interface is wrong, we find out cheaply" spirit for content-modeling risk too.** Brainstorm
   roadmap §2 frames Ryuutama-first purely as "Si l'interface plugin est fausse, on le découvre sur Ryuutama" — but
   the PRD's own addendum reveals Ryuutama already has non-trivial content-model open questions (2 of 3 attribute
   patterns unconfirmed, ambiguous Healer talent text, magic system fully deferred). The PRD treats these as ordinary
   Open Questions/Assumptions rather than connecting them back to the original "risk discovery" framing — i.e., the
   brainstorm's implicit bet that Ryuutama is "simple enough to be low-risk" is quietly being tested for real (seed
   data gaps), and the PRD doesn't surface this as a signal worth watching. Minor, but the qualitative caution behind
   "risque minimal" (a hypothesis to validate, not a given) reads as flattened into a plain feature list.

4. **`exportPDF` promoted from a plugin interface method to a bespoke F4 mechanism, diverging from both the roadmap's
   MUST wording and spec.md's plugin contract, without the roadmap's original framing being revisited.** Roadmap P3
   MUST lists `exportPDF` as part of the plugin interface itself (mirrored in brainstorm-intent §3's `exportPDF`
   in the "Décisions architecturales non-négociables" table — i.e., treated as *non-negotiable* architecture). PRD F1
   / FR-1.2 instead removes `exportPDF` from the implemented interface subset and defers `printLayout` entirely,
   replacing it with a one-off "export PDF dédié (F4)". This is flagged inside the PRD itself as an Open-Questions-
   adjacent aside ("voir Open Questions") but is not actually listed as one of the 4 numbered Open Questions, and the
   PRD doesn't acknowledge that this contradicts a brainstorm item that was called "non-négociable." Worth an explicit
   flag since it's a divergence from a decision the brainstorm treated as architecturally locked-in.

5. **P7/Draconis ordering nuance ("Draconis si le groupe le réclame") absent** — roadmap P7 SHOULD notes Draconis
   priority is conditional/reactive ("priorité haute si le groupe le réclame"), a qualitative signal about how rigidly
   the Ryuutama → Conte de Minuit → Draconis sequence should be enforced. The PRD's "Hors périmètre" section states
   flatly "Autres systèmes (Conte de Minuit, Draconis, Esteren) — paliers ultérieurs, dans cet ordre (risque minimal
   en premier)" — presenting the order as fixed, dropping the roadmap's built-in flexibility for reprioritizing based
   on group demand. Low-stakes since P3 doesn't need to decide P7 ordering, but worth noting as a lost nuance.

---

## Divergences from docs/spec.md architecture (if any)

- **No structural divergence in the Prisma sketch.** The PRD's `GameSystem` / `ContentType` / `ContentEntry` /
  `Character` models (prd.md "Modèle de données (esquisse Prisma)") are faithful to spec.md §6: `ContentType`/
  `ContentEntry` with `scope: base | mj | partie` matches exactly (PRD's `ContentScope { BASE MJ PARTIE }` enum is the
  same three values, just implemented as a Prisma enum rather than left as a string — a reasonable concretization,
  not a deviation). `Character.sheetData`/`derived` as JSONB matches spec.md §5/§6's "fiche pilotée par un schéma...
  JSON/Postgres JSONB" principle exactly, and the PRD explicitly cites this rationale in its "Note d'implémentation."
  `GameSystem` as a lightweight code-registry table (`id/name/version`, not a data table) matches spec.md §6's closing
  line: *"GameSystem n'est pas une donnée mais du code (un module) ; une petite table liste juste les systèmes
  installés."*

- **Legitimate, disclosed simplification: `GameSystemPlugin` interface subset.** spec.md §5's full interface has 8
  members: `id, name, version, sheetSchema, contentTypes, creationSteps, createBlankCharacter, validate, computeDerived,
  canSpendXp, applyXp, printLayout?`. The PRD's FR-1.2 implements 7 of them but drops `contentTypes()` (deferred —
  homebrew MJ, explicitly out of scope), `canSpendXp`/`applyXp` (deferred to P4, XP not relevant until characters can
  evolve), and `printLayout` (replaced by ad-hoc PDF export, see Gap #4 above). This narrowing is explicitly called
  out in the PRD ("sous-ensemble implémenté ce palier") and is reasonable given P3's scope — the interface is a
  faithful *subset*, not a redesign. The one point that should be flagged (see Gap #4) is that `printLayout`/`exportPDF`
  isn't just deferred but structurally replaced by a different, non-interface mechanism (F4), which is a small but
  real divergence from "same interface, narrower implementation" into "different mechanism for this concern."

- **`validate()` signature differs slightly from spec.md, but PRD explains why and it doesn't break future
  compatibility.** spec.md §5 defines `validate(data, mode: "strict" | "mj"): Result` — a single function with a mode
  parameter. The PRD's FR-1.2 sketch shows `validate(data: SheetData): ValidationResult` with no `mode` parameter,
  and FR-3.9 explains: *"validate() vérifie l'ensemble des règles strictes... (pas de mode 'mj' ce palier)... validate()
  reste une fonction séparée pour rester compatible."* This is a real signature simplification (dropping the `mode`
  parameter entirely rather than defaulting it) — technically inconsistent with spec.md's declared interface, though
  the PRD is transparent about it and intends to restore the `mode` parameter in P4. Since NFR-2 promises the P3
  interface should be reusable "sans modification de signature" for Conte de Minuit, but this method's signature is
  already known to need modification in P4 (to re-add `mode`), the NFR-2 claim is slightly overstated — worth a note
  that `validate()`'s signature is expected to change again in P4, so NFR-2 should perhaps scope its "no signature
  change" promise to exclude `validate()`, or acknowledge the mode param will be added back.

- **No divergence found in Character/Partie/User relationships** — PRD's `Character` model correctly references
  `userId`/`partieId` per spec.md §6's Character definition ("possédé par un User, rattaché à une Partie"). PRD
  doesn't yet model inventaire/équipements/notes/versions mentioned in spec.md §6 for Character, but this is
  reasonable given P3's explicit scope reduction (equipment is fixed/pique-nique mode, no inventory system yet) and
  is disclosed in the PRD's Out-of-Scope section.
