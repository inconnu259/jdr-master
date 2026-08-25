---
title: 'Reconciliation — ARCHITECTURE-SPINE (Palier 5) vs PRD (Palier 5, 2026-07-15)'
created: '2026-07-15'
---

# Reconciliation: spine → PRD

Source spine: `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-07-15/ARCHITECTURE-SPINE.md` (status: final)
Target PRD: `_bmad-output/planning-artifacts/prds/prd-jdr-master-2026-07-15/prd.md` (status: draft)

## AD-by-AD coverage

| AD | User-facing implication | PRD coverage |
| --- | --- | --- |
| AD-1 | One Homme Dragon per Partie, tied to MJ account, structurally distinct from PC sheet (no PV/PE/Condition/Initiative/class/species) | FR-1 (single, MJ-owned), FR-2/FR-3 field list (no PC-style stats) — covered |
| AD-2 | MJ sole writer, no optimistic-lock conflict UX needed | FR-1 consequence ("un joueur ne peut pas créer/modifier") — covered |
| AD-3 | Level/PS/history/protected-travelers always computed, never manually settable; history only ever shows `Passé` scenarios | FR-4, FR-5, FR-7 — covered, thresholds match exactly (1→2, 3→3, 7→4, 12→5; PS 3/5/10) |
| AD-4 | Artifact catalog filtered by race (12 total, 3/race); eveil-power catalog gated by level; artifact **key** change stays technically unrestricted at all times — "never mid-scenario" is a **table convention only, not app-enforced** | FR-2 covers race/artifact filtering and editable name/inscription, but **does not state whether/when the artifact selection itself can be changed** — see Gap 1 |
| AD-5 | Reference-sheet access split: `journal`/`carte` = any member; all others (monde, monstre, ville, objectif×3, œuf de bataille, structure) = MJ only; unknown key → 404, never silent fallback | FR-11/FR-12 reproduce the exact same split; FR-13 reproduces the "clear error, never silent/incorrect file" rule — covered |
| AD-6 | New PDF exports (equipment, notes) reuse existing `Character`/`CharacterNote` data, no new model, no re-entry | FR-9, FR-10 — covered |
| Consistency: no anti-spoil guard needed on Homme Dragon (unlike Scenario/Announcement) | FR-1 "Feature-specific NFRs" states this near-verbatim | covered |

## Deferred table vs Non-Goals §5

| Spine Deferred item | PRD Non-Goal | Match? |
| --- | --- | --- |
| Dynamic fill of Monde/Monstre/Ville/Objectifs/Œuf/Structure | "Pas de remplissage dynamique..." + §6.2 PM note | covered |
| Generic multi-system plugin registry | "Pas de registre générique de plugin multi-système" | covered |
| Missing Ryuutama classes/text content | "hors périmètre de ce PRD" | covered |
| Artifact-change history | "Pas d'historique des changements d'artefact" | covered |
| Editable online "Journal de Partie" | "Pas de journal de campagne éditable en ligne" | covered |
| Shared/campaign equipment catalog | "Pas de catalogue d'équipement partagé/campagne au-delà de l'inventaire individuel (FR-9)" | covered |
| **Dynamic multi-instance annex-sheet mechanism** (spine's example: several structured city sheets, not just Homme Dragon) | PRD Non-Goal only says "Pas de support pour plusieurs Homme Dragon / PNJ multiples par Partie" | narrower — see Gap 3 |
| Environment/deployment | n/a (no user-facing surface) | n/a, correctly omitted |

## Gaps found

**Gap 1 — Artifact-change scope boundary silently dropped.**
AD-4 explicitly states the app places **no technical restriction** on when the Homme Dragon's artifact can be changed — "jamais en cours de scénario" is called out as a table convention the app deliberately does *not* enforce. The PRD's FR-2 only says name/inscription are "optionnels et éditables après coup"; it never states whether the artifact *selection itself* (race-gated key) can be freely changed at any time. A reader of the PRD alone could reasonably assume the app restricts artifact changes to character creation, which would contradict the architecture. Recommend adding an explicit FR-2 consequence or Non-Goal: "Le changement d'artefact reste possible à tout moment ; aucune restriction technique n'est imposée (convention de table)."

**Gap 2 — Eveil-power choice persistence has no backing data field in the spine.**
FR-6 requires "Un choix déjà fait à un niveau donné n'est pas re-proposé," which implies storing which eveil power was chosen per level. The spine's Structural Seed (`HommeDragon.sheetData` field list and the `HommeDragonDto` shape in §Types partagés) lists only `race, avatar, artefact{key,nom,inscription}, nom, apparence, caractere, vocation, demeure, mondesProteges` — no field for chosen eveil powers. This isn't a spine→PRD omission so much as a downstream inconsistency: the PRD (correctly, per AD-3's "pouvoir d'éveil" mention) requires state the spine's data model doesn't yet carry. Flag for the architecture owner before story-level design — either `sheetData` needs an `eveilPowersChosen: string[]` (or per-level map) field, or FR-6 needs to be scoped down.

**Gap 3 — Non-Goal on multi-instance annex sheets is narrower than the spine's deferred item.**
Spine's Deferred table defers "Mécanisme de fiche annexe multi-instance dynamique (ex. plusieurs villes avec données structurées propres)" — a general boundary covering *any* annex sheet type gaining structured multi-instance data later. PRD's Non-Goal only rules out multiple Homme Dragon/PNJ instances per Partie. The broader boundary (no dynamic multi-instance annex sheets of any kind, e.g. per-city data) is implicitly covered by FR-13 ("servies telles quelles") but never stated as its own scope boundary. Low severity — current FR-13 makes the practical outcome equivalent — but worth an explicit line in §5 if a future reader might otherwise assume city/monster sheets could get per-instance data without a Homme-Dragon-like feature.

## Contradictions

None found. No PRD requirement demands anything the spine explicitly ruled out (e.g., PRD correctly excludes optimistic locking, PS spend-tracking, dynamic annex fill, shared equipment catalogs, artifact-change history, and a generic plugin registry — all consistent with the spine's AD-2/AD-3/AD-4/AD-5 and Deferred table).
