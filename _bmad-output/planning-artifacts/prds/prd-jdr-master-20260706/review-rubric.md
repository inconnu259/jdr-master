# Rubric Review — PRD — Infra e-mail & notifications (Palier 4)

## Overall verdict
This is a tightly-scoped hobby PRD that earns its brevity: decisions are stated as decisions (Brevo, 24h fixed reminder delay, 24h reset-link lifetime), trade-offs are named rather than smoothed (e.g. §4.3's explicit deferral of configurability, §5's honest Non-Goals list), and the Open Questions / Assumptions Index sections show genuine closure rather than a punt. The main soft spots are a Success Metrics section that reads as a one-time smoke test rather than a measurable criterion, and two unaddressed multi-actor edge cases (duplicate invites, mid-cycle party membership changes around the reminder window) — neither is severe enough to block implementation, but an engineer could reasonably ask "what then?" on both.

## Dimension verdicts
- Decision-readiness — strong
- Substance over theater — strong
- Strategic coherence — adequate
- Done-ness clarity — strong
- Scope honesty — strong
- Downstream usability — strong
- Shape fit — strong

## Findings by severity

### Critical (0)
None.

### High (0)
None.

### Medium (2)

- **Success Metrics are a one-time smoke test, not a measurable criterion** (§7) — "au moins un rappel de séance envoyé et reçu avec succès en conditions réelles" is a single pass/fail check on first use, not something that validates the thesis ("push info to the user proactively") over time. For a hobby-scope PRD this is defensible per the rubric's shape-fit guidance ("rigor light"), but it weakens Strategic coherence: there's no way to tell from this PRD whether the email channel is actually working three months in, only whether it worked once. *Fix:* add one line, e.g. "no unexplained gap of >X days between a confirmed session and its reminder being logged as sent," to give the counter-metric some durability.

- **FR-3 does not state what happens on a duplicate invite** (§4.2, FR-3) — the FR covers "adresse déjà inscrite" and "adresse pas encore inscrite" but not the case where the MJ invites the same email a second time while a prior `Invitation` or `InviteLink` is still pending. This is a real branch (the MJ mistyping and retrying is plausible) with no stated consequence, which weakens Done-ness clarity specifically for FR-3 even though the rest of the FR set is unusually well specified. *Fix:* one sentence — e.g. "a second invite to the same address re-sends the existing link/invitation rather than creating a duplicate."

### Low (1)

- **FR-4 doesn't address party-membership changes around the reminder window** (§4.3, FR-4) — the FR is otherwise exceptionally thorough about edge cases (null date, date changed/cancelled after scheduling, no duplicate per member), but doesn't say what happens if a member is added to the party after the reminder has already gone out, or removed before it's sent. Low severity because it's a narrow window and the omission is inconsistent with how carefully the rest of FR-4 handles edge cases, but not because the gap is likely to cause damage.

### 0 findings suppressed for being unsubstantive — none omitted.

## Mechanical notes
- The Assumptions Index (§9) has no matching inline `[ASSUMPTION: …]` tags in the body — the body states confirmed decisions in prose (e.g. FR-4's "non configurable en v1") and §9 summarizes them by section reference instead. Functionally traceable (each index entry cites a section number that does contain the relevant decision), but it doesn't follow the tag-and-index roundtrip the rubric checks for. No information is lost, just the format convention.
- Glossary terms (Invitation, InviteLink, Rappel de séance, Réinitialisation de mot de passe, Relais SMTP) are used consistently and identically across §3, §4, and §5 — no drift found.
- FR IDs (FR-1…FR-6) and UJ IDs (UJ-1…UJ-3) are contiguous, unique, and every UJ has a named protagonist (MJ, joueur, utilisateur) carrying context inline.
- Cross-references resolve correctly: "cf. FR-1" (§3), "cf. Non-Goals" (§2.2, §4.1), "cf. §6.2" (§4.3, §9), "cf. §9" (§8) all point to sections that contain the referenced content.
- The three deferred items (notification preferences, configurable delay, on-demand send) are stated once in §4.3 and restated in §6.2 with `[NOTE FOR PM]` tags — redundant but consistent, not contradictory.
