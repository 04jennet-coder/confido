# Architecture

Confido is one engine with four surfaces. The rule that keeps them honest: **no surface computes
anything.** They read a `ReleaseScope`, call `assess()`, and format the result.

```
                 ┌───────────────────────────────────────────────┐
 Jira REST  ───▶ │ adapters/jira.ts → jiraMap.ts                 │
 Jira CSV   ───▶ │ adapters/csv.ts                               │──▶ ReleaseScope
 sample JSON ──▶ │ adapters/sample.ts                            │        │
                 └───────────────────────────────────────────────┘        ▼
                                                          ┌───────────────────────────┐
                                                          │ core/signals.ts   (10 rules)
                                                          │ core/scoring.ts   (100 − Σ) │
                                                          │ core/brief.ts     (conditions, actions, summary)
                                                          │ core/drift.ts     (two snapshots)
                                                          │ core/cluster.ts   (TF-IDF overlap)
                                                          │ core/releaseNotes.ts         │
                                                          └─────────────┬─────────────┘
                                                                        ▼
                                                          Assessment (score, band, risks, evidence)
                                                                        │
              ┌──────────────────────┬─────────────────────────┬──────┴───────────┐
              ▼                      ▼                         ▼                  ▼
        web/app.js            cli.ts                     mcp/server.ts       forge/src/index.js
        (fetch /api/assess)   (markdown/JSON)            (JSON-RPC stdio)     (Rovo agent + MCP actions)
```

## Data model

`ReleaseScope = { release: ReleaseMeta, items: WorkItem[] }`

A `WorkItem` is deliberately close to Jira but normalised: `statusCategory` (`todo|in_progress|done`)
instead of raw status names, `priority` on a five-step scale, ISO timestamps, links with direction
semantics, comments with author/time/body. Everything time-based is compared against
`release.asOf` — never `Date.now()` inside the engine — which is what makes the past snapshot
reproducible and the tests stable.

`Assessment` carries the score, band, data confidence, counts, signals (with findings and evidence),
drivers, conditions, next actions, a deterministic summary, and the engine version. It is plain JSON,
so it can be cached, diffed, or shipped to a client without a schema library.

## Rules and weights

Each rule has `severity`, `weight` (points per matched item), `cap` (how many matches count) and a
`detect(ctx)` function returning findings with a factual `detail` and, where relevant, a verbatim
`excerpt`. Penalty = `min(matches, cap) × weight`.

| Rule | Severity | Weight | Cap | Fires when |
| --- | --- | --- | --- | --- |
| `open-blockers` | critical | 7 | 4 | not done, and `blocker` label or blocked-by an unfinished issue |
| `critical-unowned` | high | 5 | 3 | High/Highest, not done, no assignee |
| `stale-work` | high | 3 | 3 | in progress, untouched ≥ 5 days |
| `overdue` | high | 4 | 3 | due date before `asOf`, not done |
| `scope-added` | medium | 2 | 3 | created in the final third of the cycle, still open |
| `qa-debt` | medium | 3 | 3 | unresolved Bug at High/Highest |
| `external-dependency` | medium | 2 | 3 | blocked by an issue outside the scope |
| `risk-language` | high | 2 | 3 | delay/blocker/failure language in a comment from the last 14 days |
| `thin-spec` | low | 2 | 3 | High/Highest with a description under 40 characters |
| `estimation-gap` | low | 1 | 3 | open Story/Task/Spike without story points |

Band: `≥85 SHIP`, `≥65 SHIP WITH CONDITIONS`, `≥45 AT RISK`, else `HOLD`; then gates can only lower
it — ≥2 critical findings → at most `AT RISK`, 1 critical or ≥3 high findings → at most
`SHIP WITH CONDITIONS`.

## Why a model is not in the scoring path

The same reason a compiler does not ask a model whether the code type-checks. A score that changes
between runs, or that cannot be recomputed by a reviewer, is not usable in a release decision. So the
model is confined to `core/narrative.ts`: it receives the computed facts as JSON, returns markdown,
and a failure falls back to the template. `narrative.provider` reports which one wrote it, so a reader
always knows whether they are looking at arithmetic or prose.

## Surfaces

- **HTTP** (`src/server.ts`, no dependencies): `GET /api/health`, `GET /api/samples`,
  `GET /api/sample/:preset`, `POST /api/assess`, `POST /api/report`, `POST /api/csv`. Static files are
  served from `web/` with traversal refused. Everything is stateless; the server is a demo host, not a
  multi-tenant service.
- **CLI** (`src/cli.ts`): sample, CSV, saved Jira JSON, or live Jira; markdown, file, or JSON output.
- **MCP** (`src/mcp/server.ts`): newline-delimited JSON-RPC 2.0 over stdio, protocol `2025-06-18`,
  `initialize` / `tools/list` / `tools/call` / `ping`, notifications ignored, errors as protocol
  errors. Tool calls return markdown text so any client can display them.
- **Forge** (`forge/`): the compiled engine bundled under `forge/src/lib`; `requestJira` reads as the
  installing user; five `GET` actions exposed to both the agent and the MCP module.

## Test strategy

The interesting failures are in mapping and arithmetic, so the tests target those: field/link/status
mapping from Jira payloads, CSV quoting, each rule's boundary (4 days is not stale, 5 is), cap
behaviour, band gates, determinism (same scope twice → byte-identical summary), drift, the MCP
handshake, HTTP endpoints including path traversal, and the Forge manifest (every referenced action,
skill and handler must exist; the skill frontmatter must match its directory; scopes must stay
read-only).
