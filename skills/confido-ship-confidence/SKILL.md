---
name: confido-ship-confidence
description: Assess whether a Jira release can ship, using the Confido MCP server. Use when a user asks about release readiness, release risk, what is blocking a release, why a release scored a certain way, or wants release notes drafted from Jira.
allowed-tools: assess_release list_risks explain_score draft_release_notes get_brief
metadata:
  version: "0.1.0"
  server: confido
---

# Confido ship confidence

This skill expects the **Confido MCP server** (`node dist/mcp/server.js`, tools use snake_case names).
It is read-only: no tool can create, update or transition a Jira issue.

## When to use

Activate when someone asks:

- "Can we ship release X?" / "Are we ready for the 3.4.0 cut?"
- "What is blocking this release, and who owns it?"
- "Why is this release scored so low / how is that number calculated?"
- "Draft the release notes for this version."

## Workflow

1. Establish the scope: Jira **project key + fix version** (e.g. `PAY` and `3.4.0`), or an explicit
   JQL. If the user has not given one, ask — never guess a project.
2. Call `assess_release` with `projectKey` and `fixVersion` (add `asOf` only for a past/future view).
3. Report in this order: **score + band**, the two or three heaviest risks with their issue keys,
   the **conditions to ship**, then the **next actions**. Keep it under 150 words unless asked for the
   full brief.
4. Follow-ups: `list_risks` (severity filter), `explain_score` (the arithmetic), `draft_release_notes`
   (completed work only), `get_brief` (the full markdown document).

## Interpreting the result

| Field | Meaning |
| --- | --- |
| `score` | 100 minus capped penalties; measures unresolved risk, not effort |
| `band` | `SHIP` ≥85, `SHIP WITH CONDITIONS` ≥65, `AT RISK` ≥45, `HOLD` below — lowered by blocker gates |
| `dataConfidence` | coverage of owners/descriptions/activity; below 0.6 the score is a floor, say so |
| `findings[].detail` | the fact that fired the rule ("in progress, last updated 9d ago") |
| `findings[].excerpt` | the comment that supports it — quote it, do not paraphrase as fact |

## Hard rules

- Never invent issue keys, people, dates or risks the tools did not return.
- Never re-score or round the number. Disagreement → `explain_score`, show the subtraction.
- Never describe an open issue as shipped; release notes exclude them by design.
- If scoping fails, report what was searched and ask for the correct key.

## Example

> "Are we ready to ship PAY 3.4.0?"
>
> `assess_release {"projectKey": "PAY", "fixVersion": "3.4.0"}` → 51/100, AT RISK.
> "Two blockers — `PAY-1401` (blocked by `PAY-1390`) and `PAY-1390` (waiting on `INFRA-2211`) — cost
> 14 of the 49 lost points. Conditions: clear or descope both, name an owner for `PAY-1401`,
> re-baseline the dates on `PAY-1393` and `PAY-1428`."

## Without a server

The same numbers are available from the CLI (`npm run cli -- --preset payments`,
`--csv export.csv`, or live Jira with `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`). Do not fabricate
an assessment if no Confido surface is reachable.
