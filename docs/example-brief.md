# Payments 3.4.0 — ship confidence brief

_Generated 2026-11-21T04:30:21.453Z by Confido 0.1.0 · source: sample:payments · evaluation time: 2026-11-20T18:00:00+09:00_

| | |
| --- | --- |
| **Verdict** | **AT RISK** · 51/100 |
| **Data confidence** | 89% |
| **Scope** | 24 items · 13 done · 11 open · 2 blocked · 2 unassigned |
| **Fix version** | PAY 3.4.0 |
| **Sprint** | PAY Sprint 42 |

## What is true now
51/100 — **AT RISK**. 13 of 24 items are done; 11 are open, 2 of them blocked and 2 without an owner.

## What would break the release date
- Unresolved blockers — 2 tickets: `PAY-1401`, `PAY-1390`.
- Past its due date — 2 tickets: `PAY-1393`, `PAY-1428`.
- Risk language in recent comments — 6 tickets (3 of 6 counted): `PAY-1393`, `PAY-1414`, `PAY-1401`. Latest evidence: “Still failing intermittently in staging, only when the challenge is abandoned after the issuer redirect.…”

## Do this week
- Unblock PAY-1401, PAY-1390 today — resolve the dependency or descope it out of this release (2 blockers).
- Re-baseline the dates on PAY-1393, PAY-1428 before anyone quotes the release date again.
- Answer the concerns raised on PAY-1393, PAY-1414, PAY-1401 +3 more in-thread today.

## What to tell stakeholders
Payments 3.4.0 is at risk at 51/100: 11 open items, 2 blocked, 2 without an owner, driven by unresolved blockers and past its due date. What changes the verdict is the conditions in this brief — not more status updates.

## Conditions to ship
- [ ] Every blocker resolved or explicitly descoped (PAY-1401, PAY-1390).
- [ ] Due dates on PAY-1393, PAY-1428 re-baselined and agreed.
- [ ] The concerns in PAY-1393, PAY-1414, PAY-1401 +3 more answered with a decision, not a comment.
- [ ] QA sign-off on PAY-1393, PAY-1414.
- [ ] A named owner on PAY-1401.

## Risk register

### CRITICAL · Unresolved blockers (−14)
_Issue is not done and either carries the `blocker` label or is blocked by an issue that is not done._

- **PAY-1401** Card-on-file network token migration — blocked by PAY-1390 (In Progress)
- **PAY-1390** Network token vault schema and backfill — blocked by INFRA-2211

**Action:** Clear or explicitly descope each blocker. A blocker that is not resolved by the release cut becomes a release-day surprise.

### HIGH · Past its due date (−8)
_Issue has a due date before the assessment time and is not done._

- **PAY-1393** Double capture when 3DS challenge is abandoned — due 2026-11-14, 6d overdue
- **PAY-1428** Load test checkout at 3x peak — due 2026-11-18, 2d overdue

**Action:** Re-date or re-scope overdue work before the review, otherwise the release date is already fiction.

### HIGH · Risk language in recent comments (−6)
_A comment in the last 14 days on an open issue uses delay, blocker, or failure language._

- **PAY-1393** Double capture when 3DS challenge is abandoned — comment by Hyerin Cho, 8d ago
  > Still failing intermittently in staging, only when the challenge is abandoned after the issuer redirect. Cannot reproduce in unit tests.
- **PAY-1414** JPY settlement rounding mismatch — comment by Hyerin Cho, 2d ago
  > Still broken for zero-decimal currencies (JPY, KRW). This may slip the cut unless we scope the fix to a hotfix right after release.
- **PAY-1401** Card-on-file network token migration — comment by Jiwon Park, 1d ago
  > Network token sandbox has been down since Tuesday. We are waiting on the provider's support ticket 4471 before we can validate the migration path end to end.
- **PAY-1426** Merchant fee override audit log — comment by Donghyun Kim, 1d ago
  > Legal review blocked the audit schema change. We cannot merge until they sign off on the retention policy, and they are out until Monday.
- **PAY-1390** Network token vault schema and backfill — comment by Mina Seo, 1d ago
  > Backfill job is ready and dry-run clean. Still waiting on the infra review of the schema change before we can create the table in production.
- **PAY-1428** Load test checkout at 3x peak — comment by Soojin Lee, 3d ago
  > Test environment was unavailable for two days, so the load test is delayed by the infra ticket INFRA-2209. Rescheduled to Thursday.

**Action:** Respond in-thread today. Comments are where slips are announced before they show up in status.

### MEDIUM · Open high-severity defects (−6)
_Bug with High or Highest priority that is not resolved._

- **PAY-1393** Double capture when 3DS challenge is abandoned — Bug, Highest, In Progress
- **PAY-1414** JPY settlement rounding mismatch — Bug, Highest, In Review

**Action:** Triage each defect with QA: fix, accept as known issue with a workaround, or block the release.

### HIGH · High-priority work nobody owns (−5)
_Issue is High or Highest priority, not done, and has no assignee._

- **PAY-1401** Card-on-file network token migration — Highest priority, no assignee

**Action:** Assign an owner or move it out of the release. Unowned critical work is the most common cause of a silent slip.

### HIGH · In-progress work that stopped moving (−3)
_Issue is in progress and has not been updated for 5 or more days._

- **PAY-1393** Double capture when 3DS challenge is abandoned — in progress, last updated 8d ago

**Action:** Ask the owner for a status update or narrow the scope. Long-stale in-progress work rarely arrives on time.

### MEDIUM · Scope added late in the cycle (−2)
_Open issue created in the final third of the cycle (at least the last 5 days) — late additions are where schedule risk hides._

- **PAY-1404** Partial refund support in merchant dashboard — created 17d into the 18d cycle

**Action:** Confirm each late addition is worth the schedule risk, or move it to the next release.

### MEDIUM · Dependencies outside the release scope (−2)
_Issue is blocked by an issue that is not part of this release scope, so its status cannot be verified here._

- **PAY-1390** Network token vault schema and backfill — blocked by INFRA-2211 outside this release scope

**Action:** Verify the external dependency directly and record the answer in the ticket before the release review.

### LOW · High-priority work with little written context (−2)
_High or Highest priority issue with a description shorter than 40 characters._

- **PAY-1418** Merchant onboarding checklist UI — description 14 characters

**Action:** Add acceptance criteria. Thin specs become rework after code freeze, not before it.

### LOW · Unestimated open work (−1)
_Open Story, Task, or Spike without story points._

- **PAY-1418** Merchant onboarding checklist UI — no story points

**Action:** Size the remaining work so the date can be checked against capacity, not hope.

## Next actions
1. Unblock PAY-1401, PAY-1390 today — resolve the dependency or descope it out of this release (2 blockers).
2. Re-baseline the dates on PAY-1393, PAY-1428 before anyone quotes the release date again.
3. Answer the concerns raised on PAY-1393, PAY-1414, PAY-1401 +3 more in-thread today.
4. Triage PAY-1393, PAY-1414 with QA: fix, document a workaround, or block the release.

## Drift since the previous snapshot
-17 points since the previous snapshot, 3 new risk classes, 7 completed, 1 added to scope. (68/100 → 51/100)
- New: Past its due date, Risk language in recent comments, In-progress work that stopped moving
- Completed: PAY-1395, PAY-1403, PAY-1400, PAY-1406, PAY-1408, PAY-1411, PAY-1424
- Added: PAY-1404

## Payments 3.4.0 — release notes draft

### Breaking changes
- **PAY-1408** Upgrade Stripe SDK to v18

### New
- **PAY-1384** Idempotency key support for refunds
- **PAY-1392** Expose settlement batch status endpoint
- **PAY-1400** Saved-card SCA exemption flag
- **PAY-1406** Merchant-level fee override

### Fixed
- **PAY-1381** 3DS2 challenge fails on Samsung Internet
- **PAY-1395** Rounding drift in multi-currency refunds
- **PAY-1403** Retry storm after gateway 502
- **PAY-1411** Duplicate currency symbol in receipt email
- **PAY-1424** Duplicate refund webhook on retry

### Improved
- **PAY-1387** Rotate PSP webhook signing secret without downtime
- **PAY-1398** Datadog dashboard for auth failure rate
- **PAY-1409** Backfill merchant fee tiers

> 11 items in scope are not done and are deliberately not listed above: PAY-1390, PAY-1401, PAY-1393, PAY-1404, PAY-1410, PAY-1414 +5 more.

## How this score was produced

100 − 49 = 51
- Unresolved blockers: 14 points (2 × 7) — PAY-1401, PAY-1390
- Past its due date: 8 points (2 × 4) — PAY-1393, PAY-1428
- Risk language in recent comments: 6 points (3 × 2, capped from 6) — PAY-1393, PAY-1414, PAY-1401, PAY-1426
- Open high-severity defects: 6 points (2 × 3) — PAY-1393, PAY-1414
- High-priority work nobody owns: 5 points (1 × 5) — PAY-1401
- In-progress work that stopped moving: 3 points (1 × 3) — PAY-1393
- Scope added late in the cycle: 2 points (1 × 2) — PAY-1404
- Dependencies outside the release scope: 2 points (1 × 2) — PAY-1390
- High-priority work with little written context: 2 points (1 × 2) — PAY-1418
- Unestimated open work: 1 points (1 × 1) — PAY-1418

_Every deduction comes from a rule listed here. Nothing is inferred by a model._

_Narration: deterministic engine._