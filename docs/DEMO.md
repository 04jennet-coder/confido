# Demo run sheet (under 5 minutes)

The Codegeist limit is 5 minutes; SLAY accepts a working demo or video. This sheet keeps both under
three minutes of screen time, with a 45-second cold open that a judge can follow without context.

## Before recording

```bash
npm install && npm start        # http://localhost:4173
```

- Browser at 1440×900, zoom 100%, dark room, no personal tabs.
- Close the console; the UI must be the only thing on screen.
- If you plan to show AI narration, export the key first and toggle `ai` in the request; otherwise
  show the deterministic brief and say so. Never fake an AI call.
- Have `docs/screenshot-home.png` open as a backup slide if the server misbehaves.

## Script

**0:00 – 0:40 | The problem (screen: Jira board, then the Confido verdict card)**

> "Every release review has the same moment: someone asks 'are we ready?' and the answer is a feeling.
> AI tools now offer to answer it — a model reads the board and writes a confident summary. The
> problem is that the summary cannot be checked. Here is Payments 3.4.0. Confido says 51 out of 100,
> AT RISK — and it can show me why."

**0:40 – 1:20 | The arithmetic (screen: Risks tab, then Why this score)**

Open the risk register. Read one card aloud: *Unresolved blockers, critical, −14 points: PAY-1401 is
blocked by PAY-1390, and PAY-1390 is blocked by INFRA-2211.* Then click **Why this score**: "100
minus 49 equals 51. Ten rules, each with a cap, each pointing at tickets. Nothing here was written by
a model — I can recompute it, and so can you."

**1:20 – 1:55 | The comment that status missed (screen: the risk-language card with its excerpt)**

> "The status field says 'In Progress'. The comment from yesterday says the sandbox has been down
> since Tuesday and they are waiting on the vendor. Confido quotes it as evidence, on the ticket, so
> the conversation starts from the actual sentence."

**1:55 – 2:20 | Drift (screen: Drift tab)**

> "Last week this release scored 68. Seven tickets closed — and it still dropped 17 points, because
> three new risk classes appeared: a blocker chain, two overdue dates, and language in comments.
> This is the slide that changes a release meeting."

**2:20 – 2:35 | Release notes and conditions (screen: Release notes, then Conditions)**

> "Only completed work appears in the notes; eleven open items are named as not shipped. The
> conditions are what has to be true before the cut: clear or descope both blockers, re-baseline two
> dates, name an owner for PAY-1401."

**2:35 – 3:00 | Agents and MCP (screen: terminal)**

```bash
node dist/mcp/server.js     # then, in Claude or Rovo:
#   "assess release PAY 3.4.0"  → the same 51/100, same tickets
```

> "The same engine is an MCP server and a Jira Forge app: a Rovo agent, a reusable skill, and five
> read-only tools. The agent answers in chat; the web app answers in a room. Same numbers, because
> there is one engine."

**3:00 – 3:15 | Close (screen: verdict card)**

> "Confido does not ask a model to guess whether you can ship. It computes the answer from your
> tickets, shows its work, and lets AI do the part AI is good at: explaining it."

## Shot list to capture ahead of time

1. Verdict card, 51/100 AT RISK (Payments 3.4.0).
2. Risks tab — first card expanded with evidence and the comment excerpt.
3. Why this score — the subtraction line.
4. Drift tab — 68 → 51, three new risk classes.
5. Release notes — four sections, footnote about open items.
6. Terminal — MCP `tools/list`, then one `assess_release` call.
7. Verdict card again for the close.

## Codegeist live Jira segment

Use a Jira test project and fix version with a resolved issue and an open blocker. Capture the
Rovo Release Captain assessing that version and citing the blocker. Resolve the blocker in Jira,
then rerun the same query and show the updated result. On the same site and issue state, invoke
Confido through the Atlassian MCP connection and show the same score and issue keys. Use the
live results in this segment; the fixed scores above refer to the bundled standalone fixture.

## Claims to avoid

- Do not say "predicts" or "guarantees" — it scores evidence, it does not forecast.
- Do not say the agent "writes to Jira" — everything is read-only.
- Do not show the LLM path unless a real key is configured and the badge says `LLM · …`.
