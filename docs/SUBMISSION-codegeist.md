# Codegeist 2026 submission draft

Deadline: **2026-12-22 12:00 PST** (2026-12-23 05:00 KST). Category: **Apps for Software Teams**.
Bonus tracks targeted: **Best Agents (Rovo)** and **Best app with Atlassian MCP**.
Nothing has been submitted or deployed yet — the installation link is the only missing piece.

## Fields

**Project name** — Confido

**Tagline** — Ship confidence for Jira releases: a verdict you can trace, and AI that only explains it.

**Category** — Apps for Software Teams.

**Bonus prizes** — Best Agents — Rovo/Assignable agents · Best app with Atlassian MCP.

**Built with** — Atlassian Forge, Rovo agents, Rovo skills, Atlassian MCP (`rovo:mcp`), Jira Cloud
REST API v3, Node.js 24, TypeScript, vanilla JS/CSS, TF-IDF + cosine similarity, Anthropic/OpenAI
(optional narration).

### Inspiration

Every release review has the same moment: someone asks "are we ready to ship?" and the answer is a
feeling. The new generation of AI status tools offers to answer it — a model reads the board and
writes a fluent summary. The problem is that the summary cannot be checked. When a release is
genuinely in trouble, a confident paragraph is worse than no paragraph, because it moves the
conversation away from the tickets that would have caught it.

We wanted the opposite: the truth computed from the graph, and the model demoted to a writer.

### What it does

Confido turns a Jira release into a **ship-confidence brief**.

- **Verdict from evidence.** Ten rules read the release's Jira context — unresolved blockers, ageing
  in-progress work, unowned high-priority tickets, overdue dates, scope added late in the cycle, open
  high-severity defects, dependencies outside the scope, delay language in recent comments, thin
  specs, unestimated work. Each deduction is `min(matches, cap) × weight`, so the score is
  `100 − Σ penalties`: reproducible, and explainable line by line.
- **Gates, not just a number.** One unresolved blocker can never be a plain "ship"; two or more are
  never better than "at risk". A high score cannot talk a team past a blocker.
- **Every claim has a key.** Each risk lists the issue keys, the factual detail ("in progress, last
  updated 9d ago"), and where relevant the comment excerpt that supports it.
- **Conditions, not vibes.** The brief states what has to be true before the cut, plus the three
  actions for this week.
- **Drift.** Compare today's assessment with last week's snapshot: which risk classes appeared, which
  cleared, what was completed, what was added late.
- **Release notes that cannot lie.** Only completed work appears under a change heading; open items
  are named separately as not shipped.
- **Honest uncertainty.** A data-confidence figure reports how much of the open scope has an owner, a
  real description and recent activity; when it is low, the brief says the score is a floor.

In Jira it is three Forge modules over one engine:

1. **Confido Release Captain** — a Rovo agent with conversation starters ("Are we ready to ship the
   current release?", "What is blocking this release, and who owns it?").
2. **`release-readiness`** — a reusable `rovo:skill` that other agents can load as a playbook.
3. **`rovo:mcp`** — five read-only tools (`assess-release`, `list-risks`, `explain-score`,
   `draft-release-notes`, `get-brief`) for Rovo custom agents and third-party MCP clients.

The same engine also runs as a standalone web app and a stdio MCP server, which is how the demo and
the tests exercise it without an Atlassian site.

### How we built it

One TypeScript engine, no framework, no runtime dependencies:

- `core/` — normalised `ReleaseScope` model, the ten rules, capped scoring with band gates, brief and
  release-note generators, drift comparison, TF-IDF overlap detection, an optional LLM narrator with
  a deterministic fallback.
- `adapters/` — Jira REST v3 (search/jql, ADF → text, issue links, story points), Jira CSV exports,
  and two bundled sample releases (one in trouble, one healthy, plus a one-week-earlier snapshot).
- `server.ts` / `cli.ts` / `mcp/server.ts` — three ways to ask the same question.
- `forge/` — manifest, Rovo agent prompt, the `release-readiness` skill, five `GET` actions and
  functions that import the compiled engine, so the agent returns byte-identical numbers to the web
  app.

The AI boundary is the design decision everything else follows from: the model receives only
computed facts, its output is prose beside the numbers, and a model failure degrades to the engine's
own template. `narrative.provider` tells the reader which one wrote the brief.

### Challenges

- **Making "risk" reproducible.** Early versions counted every issue created after the cycle start as
  scope creep, which flagged ordinary sprint planning. The rule now looks at the final third of the
  cycle, and every rule has a cap so one noisy rule cannot sink a release.
- **Keeping the number honest under gates.** A pure score let a 92 look like a green light while a
  blocker was open. Bands now have gates that can only move downward.
- **Forge packaging without a second codebase.** The functions import the compiled engine from
  `forge/src/lib`, built by the same TypeScript project as the web app; a manifest test asserts that
  every action, skill and handler referenced actually exists, so a deploy cannot fail on a typo.
- **Testing an agent without a site.** The MCP server speaks the real protocol over stdio, so the
  same tool calls that Rovo would make are covered by tests.

### Accomplishments

- A release verdict a reviewer can recompute from the brief alone.
- The same answer through a web UI, a CLI, an MCP server and a Rovo agent.
- Deterministic and dependency-free: works with no API key, no Jira token and no network.
- 53 tests over the engine, adapters, MCP protocol, HTTP API and Forge manifest.

### What we learned

- In Jira, the comment field announces a slip before the status field does — but only as a quote, not
  as a judgement. Pattern-matching plus an excerpt got the value without pretending to understand
  intent.
- Users trust a number more when it can be argued with. "Why this score" turned out to be the feature
  reviewers reach for first.
- A skill is a better home for workflow than an agent prompt: the prompt stays about role and
  boundaries, the skill carries the procedure and failure modes.

### What's next

- Teamwork Graph integration: consume cross-project dependencies so `external-dependency` can resolve
  instead of asking a human.
- A Marketplace listing (the app is already scoped to `read:jira-work` only).
- Configurable rule sets and weights per team, with the same audit trail.
- A scheduled assessment that posts the drift to a Confluence page before the release review.

### Access instructions for judges

1. Installation link: **<pending — `forge register` + `forge deploy` + share link from the developer
   console; see `docs/FORGE-DEPLOY.md`>**
2. In Rovo, open **Confido Release Captain** and ask: *"Assess release PAY 3.4.0"* — replace with a
   project key and fix version on the judge's site.
3. Ask *"Why did it score that way?"* for the arithmetic, or *"What is blocking this release?"* for
   the risk register with issue keys.
4. Screenshots and a 3-minute demo script: `docs/screenshot-*.png`, `docs/DEMO.md`.

No Atlassian account beyond the judge's normal Jira login is needed; the app requests `read:jira-work`
only and never writes.

### How this meets the main technology requirement

It is a Forge app that integrates with Jira and Rovo: `rovo:agent` (assignable agent),
`rovo:skill` (reusable playbook), `rovo:mcp` (MCP server exposing five tools), five `action` modules
and five `function` modules calling Jira Cloud REST v3 through `requestJira` as the installing user.
Bonus-track evidence, in manifest order: the `rovo:agent` module with `skills` and `actions`
(Best Agents), and the `rovo:mcp` module listing those action keys (Best app with Atlassian MCP).

---

## Submission checklist

- [ ] `npm test` green (53 tests) — run at 2026-11-21, all pass.
- [ ] `npm run build:forge` output committed or rebuilt before deploy.
- [ ] `forge register` → app id in `forge/manifest.yml`.
- [ ] `forge deploy` + `forge install --upgrade` on a Jira site.
- [ ] Installation/sharing link for judges pasted above.
- [ ] Demo video (< 5 min, public on YouTube) recorded from `docs/DEMO.md`.
- [ ] Repo made public (or judges given access) with MIT licence.
- [ ] Devpost profile uses the handle, not a legal name; prize paperwork only after a win.
