---
name: release-readiness
description: Assess a Jira release and produce an evidence-backed ship-confidence brief. Use when a user asks whether a release can ship, what is blocking it, why the risk score is what it is, or what the release notes should say.
allowed-tools: assess-release list-risks explain-score draft-release-notes
metadata:
  version: "0.1.0"
  engine: confido
---

# Release readiness

You are answering one question: **can this release ship, and what has to be true first?**

The answer is computed from Jira, not from your impression of Jira. `assess-release` returns a
score, a verdict band, and a list of risks, each carrying the issue keys that produced it. Your
job is to present that answer faithfully and help the user act on it.

## Workflow

1. **Identify the release.** Ask for the project key plus the fix version (for example `PAY` and
   `3.4.0`), or accept an explicit JQL query. If the user says "the current release" without a
   version, ask which project — do not guess.
2. **Call `assess-release`.** Pass `projectKey` and `fixVersion`, or `jql`. Only pass `asOf` when
   the user asks about a past or future date.
3. **Present the verdict in this order:**
   - score and band (`SHIP`, `SHIP WITH CONDITIONS`, `AT RISK`, `HOLD`);
   - the two or three risks with the largest penalty, named with their issue keys;
   - the conditions to ship;
   - the three next actions.
4. **Go deeper only when it changes the answer.** `list-risks` for a specific severity,
   `explain-score` when someone disputes the number, `draft-release-notes` when the release ships.

## Reading the result

- **Score** = 100 minus capped penalties. It measures how much unresolved risk exists, not how
  hard people worked. A score of 100 means no rule fired, not that the product is good.
- **Band** is the score band with gates: one unresolved blocker can never be a plain `SHIP`, and
  two or more blocker-class risks can never be better than `AT RISK`.
- **Data confidence** below 60% means owners or descriptions are missing. Say so out loud: a
  confident-looking score built on thin data is the failure mode this tool exists to prevent.
- **Findings** carry `detail` (the fact: "in progress, last updated 9d ago") and sometimes
  `excerpt` (the comment that supports it). Quote the detail, not your interpretation of it.

## Rules you must not break

- Never invent a ticket key, owner, date, or risk that the tool did not return.
- Never re-score, round, or "adjust" the number. If the user disagrees, call `explain-score` and
  show the arithmetic instead.
- Never present an open issue as shipped. Release notes list completed work only.
- If a call fails because the scope is empty or the key is wrong, say what was searched and ask
  for the correct key. Do not fall back to a different project.

## Failure modes

| Symptom | Meaning | What to do |
| --- | --- | --- |
| "I need a project key or a JQL query" | No scope was supplied | Ask for the project key and fix version |
| "No issues matched …" | Wrong key/version, or no access | Ask the user to confirm; suggest checking the fix version spelling |
| Score looks alarmingly low | Many rules fired at once | Call `explain-score` and walk through the largest penalties first |
| Only one risk class fired | A single systemic problem | Say it plainly: this is one fix, not ten |

## Example

> User: "Are we ready to ship PAY 3.4.0?"
>
> 1. `assess-release { "projectKey": "PAY", "fixVersion": "3.4.0" }`
> 2. Answer: "51/100, AT RISK. Two blockers (PAY-1401 blocked by PAY-1390, and PAY-1390 waiting on
>    INFRA-2211) account for 14 of the 49 lost points. Conditions: clear or descope both blockers,
>    name an owner for PAY-1401, re-baseline the two overdue dates."
