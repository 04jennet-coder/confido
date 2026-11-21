# Confido

**Ship confidence for Jira releases — a verdict you can trace, and AI that only explains it.**

Confido reads the context inside a release's Jira tickets — blockers, owners, ageing, comment
language, dependencies, defects, late scope — and computes a reproducible **0–100 ship-confidence
score** with a gated verdict (`SHIP`, `SHIP WITH CONDITIONS`, `AT RISK`, `HOLD`). Every point it
deducts names the issue keys that produced it. An LLM can rewrite the prose; it cannot move the
number.

It runs three ways from one codebase:

| Surface | What it is | Who it is for |
| --- | --- | --- |
| **Web app** | Zero-dependency Node server + static UI (`npm start`) | Anyone who wants a brief in one click, or a release review on screen |
| **MCP server** | Stdio JSON-RPC tool server: `assess_release`, `list_risks`, `explain_score`, `draft_release_notes`, `get_brief` | Claude Desktop, Cursor, or any MCP client |
| **Forge app** | Rovo agent (`Release Captain`), reusable `rovo:skill`, and a `rovo:mcp` module mapped to the same actions | Jira users, Atlassian Marketplace |

> Why it exists: AI status tools usually ask a model to read a board and guess. The guess is
> fluent, unauditable, and wrong exactly when a release is in trouble. Confido inverts that —
> **the truth is computed from the graph, and the model is demoted to a writer.**

---

## Quick start

```bash
npm install
npm start            # → http://localhost:4173  (builds TypeScript, serves the web app)
npm test             # 53 tests: engine, adapters, MCP protocol, HTTP API, Forge manifest
```

**Demo video — 2 min 15 s, recorded from the running app:** [docs/confido_demo.mp4](docs/confido_demo.mp4)
(verdict → risk register → why the score → the comment the status field missed → drift → release
notes → the same engine as an MCP server).

No API keys, no Jira account, no network: two bundled sample releases are enough to see it work.

```bash
npm run cli -- --preset payments           # the release in trouble → AT RISK, 51/100
npm run cli -- --preset checkout           # a healthy release      → SHIP, 99/100
npm run cli -- --csv export.csv --out report.md   # your own Jira CSV export
```

A real brief looks like this (abridged):

```
# Payments 3.4.0 — ship confidence brief

| **Verdict** | **AT RISK** · 51/100 |
| **Data confidence** | 89% |
| **Scope** | 24 items · 13 done · 11 open · 2 blocked · 2 unassigned |

## Conditions to ship
- [ ] Every blocker resolved or explicitly descoped (PAY-1401, PAY-1390).
- [ ] Due dates on PAY-1393, PAY-1428 re-baselined and agreed.
...
### CRITICAL · Unresolved blockers (−14)
- **PAY-1401** Card-on-file network token migration — blocked by PAY-1390 (In Progress)
- **PAY-1390** Network token vault schema and backfill — blocked by INFRA-2211
```

---

## How the score is made

1. **Normalise** — a Jira REST search, a saved Jira JSON response, or a Jira CSV export becomes one
   `ReleaseScope` of `WorkItem`s. Adapters own only translation; the engine never calls a network.
2. **Detect** — ten rules run over fields, links, timestamps and comments:
   unresolved blockers · high-priority work with no owner · in-progress work that stopped moving ·
   overdue dates · scope added late in the cycle · open high-severity defects · dependencies outside
   the scope · risk language in recent comments · thin specs · unestimated work.
3. **Score** — `score = 100 − Σ (min(matches, cap) × weight)`. Caps stop one noisy rule from sinking
   a release; the weights live in `src/core/signals.ts` and are the only tuning constants.
4. **Gate** — the band can be lowered but never raised: one unresolved blocker is never a plain
   `SHIP`, two or more are never better than `AT RISK`. Numbers alone cannot talk a team past a
   blocker.
5. **Explain** — the deterministic brief is written by the engine. If an API key is configured, a
   model rewrites the prose under a prompt that forbids new facts and makes the verdict read-only.

`explain_score` returns the arithmetic verbatim, and the web UI's *Why this score* tab shows the same
subtraction. If someone disputes the verdict, there is nothing to argue with but the tickets.

### What AI does, and does not, do

- **Does:** rewrite the brief for humans, when `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set.
  With no key, the engine's own template writes the whole brief — the product is complete without a
  model, which is also why the demo never depends on a provider being up.
- **Does not:** choose the score, the band, the conditions, the risks, or the release notes. A
  hallucination can make a sentence worse; it cannot make a release look safer.
- If the model call fails, the response says `fallbackUsed: true` and returns the deterministic brief.

### Local analysis that needs no model

- **TF-IDF + cosine similarity** flags pairs of open issues that describe the same work
  (`possible overlap`) — usually a duplicate or a split nobody wrote down.
- **Risk-language extraction** pulls the comment that announces a slip before the status field does,
  and quotes it as evidence.

---

## Connect your own data

**Jira CSV** (no token needed): *Issues → Export → CSV (all fields)*, then load it in the UI or
`npm run cli -- --csv export.csv`. Recognised columns: issue key, issue type, summary, status,
status category, priority, assignee, created, updated, due date, resolved, labels, components, story
points, fix versions, description, comment, blocked by.

**Jira REST** (read-only):

```bash
export JIRA_BASE_URL=https://your-team.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_API_TOKEN=…        # id.atlassian.com → Security → API tokens
npm run cli -- --project PAY --fix-version 3.4.0
```

**LLM narration** (optional):

```bash
export ANTHROPIC_API_KEY=…        # or OPENAI_API_KEY (+ OPENAI_BASE_URL for any compatible gateway)
export CONFIDO_LLM_MODEL=…        # optional model override
export CONFIDO_LLM=none           # force the deterministic brief
```

---

## MCP server

```bash
npm run mcp        # stdio; logs go to stderr, protocol on stdout
```

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "confido": {
      "command": "node",
      "args": ["/absolute/path/to/confido/dist/mcp/server.js"],
      "env": { "JIRA_BASE_URL": "https://your-team.atlassian.net", "JIRA_EMAIL": "…", "JIRA_API_TOKEN": "…" }
    }
  }
}
```

Tools (all read-only, `readOnlyHint: true`):

| Tool | Answers |
| --- | --- |
| `assess_release` | "Can we ship this release?" — score, band, top risks, conditions |
| `list_risks` | The risk register, filtered by severity |
| `explain_score` | The exact arithmetic behind the number |
| `draft_release_notes` | Notes built only from completed work |
| `get_brief` | The whole markdown brief, or the JSON bundle |

Without Jira credentials the tools still work on the bundled samples, so a client can be wired up and
tested before anyone issues a token. `skills/confido-ship-confidence/SKILL.md` is a drop-in skill file
for third-party agents that use this server.

---

## Forge app (Jira + Rovo)

`forge/` contains the Atlassian packaging: a **Rovo agent** (Confido Release Captain), a reusable
**`rovo:skill`** (`release-readiness`), and a **`rovo:mcp`** module exposing five actions as MCP tools.
The functions import the compiled engine from `forge/src/lib`, so the agent, the MCP tools, the CLI
and the web app return the same numbers for the same data.

See [`docs/FORGE-DEPLOY.md`](docs/FORGE-DEPLOY.md) for the deploy sequence (register → build → deploy
→ install → share link) and what each step needs from the account owner.

---

## Privacy and permissions

- **Read-only everywhere.** The Forge app requests `read:jira-work` only; MCP tools are annotated
  read-only; there is no write path to Jira anywhere in this repository.
- **The server holds no data.** No database, no upload endpoint, no telemetry. CSV content is
  assessed in memory and discarded.
- **Forge runs as the installing user**, so an agent can only ever see what that person can already
  see in Jira.
- **LLM calls are opt-in.** Without a key, nothing leaves the machine. With a key, only the computed
  facts (issue keys, summaries, evidence excerpts for flagged items) are sent — never credentials.

## Limits, stated plainly

- Ten rules are a floor, not a complete model of risk. A release can be unshippable for reasons no
  ticket records; Confido scores the data, and says so when the data is thin (data confidence).
- Comment-language detection is English/Korean pattern matching, not comprehension: it points a
  human at the comment, it does not judge intent.
- Release notes are generated from `statusCategory = done`; a team that closes tickets without
  writing summaries gets thin notes.
- The Forge app is the packaging of this engine, not a second product: if the engine is wrong on your
  data, the agent is wrong in the same way.

## Layout

```
src/core/        engine: types, rules, scoring, brief, drift, clustering, LLM, markdown
src/adapters/    sample JSON, Jira REST/JSON mapping, Jira CSV
src/server.ts    HTTP API + static web host
src/cli.ts       one-shot brief
src/mcp/         MCP stdio server
web/             static UI (no framework, no build)
forge/           Forge manifest, Rovo agent/skill/MCP, functions, compiled engine
data/            two sample releases (+ a one-week-earlier snapshot)
tests/           53 tests over engine, adapters, protocol, API and manifest
docs/            architecture, AI policy, demo script, deploy and submission drafts
```

## License

MIT. Built by [@04jennet](https://github.com/04jennet-coder).
