# SLAY HACKS 2026 submission draft

Deadline: **2026-12-07** per the official rules (the Devpost page shows 2026-12-08 07:00 KST — verify
on the submission page). Theme: AI. Judging: Innovation 25 · Technical 25 · Real-world impact 20 ·
AI integration & responsible use 15 · UX & presentation 15. Panel only — no public voting.
Nothing has been submitted yet.

## Fields

**Project name** — Confido

**Tagline** — An AI release assistant that shows its work: a Jira ship-confidence verdict computed
from evidence, with AI for the explanation only.

**What it does**

Developers shipping a release have to answer "are we ready?" with a feeling. AI tools now answer with
a confident paragraph nobody can check. Confido computes the answer instead: ten rules read the
release's Jira context (blockers, owners, ageing, overdue dates, late scope, defects, external
dependencies, delay language in comments, thin specs, unestimated work) and produce a 0–100
ship-confidence score, a gated verdict, a risk register where every row names its issue keys, the
conditions that must be true before the cut, and release notes built only from completed work.

AI shows up twice, in the places where it can be trusted:

1. **Narration** — an LLM turns the computed facts into a short brief. The prompt forbids new facts
   and makes the verdict read-only; with no API key the engine writes the brief itself, so the
   product works offline.
2. **Local analysis** — TF-IDF + cosine similarity flags pairs of open tickets that describe the same
   work, and comment-language extraction quotes the sentence that announces a slip before the status
   field does.

The same engine is also an MCP server (five read-only tools) and, on Atlassian, a Forge app with a
Rovo agent — one engine, four surfaces, identical numbers.

**The problem it addresses**

Release decisions are made on summaries. Status fields go stale, blockers hide in links, unowned
critical work sits in the backlog, and the sentence that says "this may slip" is buried in a comment
three days before the cut. AI summaries make this worse, not better, when they cannot be audited:
a hallucinated "on track" is indistinguishable from a real one. Confido's answer is to compute the
verdict deterministically and let the model only write prose — so a bad model output can make a
sentence worse, never a release safer.

**AI implementation details**

- Deterministic engine (TypeScript, no runtime dependencies): `100 − Σ min(matches, cap) × weight`
  over ten rules, with band gates that can only lower a verdict.
- Optional LLM narration through Anthropic Messages API or any OpenAI-compatible chat-completions
  endpoint; facts-only prompt; 25s timeout; explicit `fallbackUsed` flag when the call fails.
- Local TF-IDF/cosine similarity (no key, no network) for overlap detection.
- MCP server implementing JSON-RPC 2.0 over stdio (`initialize`, `tools/list`, `tools/call`,
  protocol `2025-06-18`) so the analysis is callable from Claude Desktop, Cursor or Rovo.
- Evaluation honesty: `dataConfidence` reports how much of the open scope has owners, descriptions and
  recent activity; below 60% the brief states the score is a floor.

**How we built it**

Node.js + TypeScript, no framework. A normalised `ReleaseScope` model is fed by three adapters (Jira
REST v3, Jira CSV export, bundled sample releases). The engine, the HTTP server, the CLI and the MCP
server are separate entry points over the same core. The UI is static HTML/CSS/JS served by a
zero-dependency Node server. Two synthetic sample releases (one AT RISK, one SHIP) plus a
one-week-earlier snapshot make the whole thing demonstrable without credentials. 53 tests cover the
rules, scoring, adapters, MCP protocol, HTTP API and the Forge manifest.

**Challenges**

- Making risk reproducible: a first version flagged every ticket created after the cycle start as
  scope creep, which is just normal sprint planning. The rule now targets the final third of the
  cycle, and each rule has a cap.
- Keeping the score honest: a 92 with an open blocker reads as a green light, so the band is gated
  downward by blocker count rather than trusting the number alone.
- Working without credentials: the MCP server and the CSV adapter exist partly so the demo and tests
  never depend on a Jira token or an LLM key.

**Accomplishments**

- A verdict a reviewer can recompute from the brief.
- Four surfaces (web, CLI, MCP, Forge agent) returning identical numbers.
- Complete functionality with zero API keys, zero network calls, zero data leaving the machine.

**What we learned**

- The comment field is the earliest reliable signal of a slip, but only as a quote — never as a model
  judgement.
- "Why this score" is the feature that makes people trust the score.
- A deterministic core makes AI optional in a way that is actually honest, rather than a fallback
  nobody tests.

**What's next**

Teamwork Graph integration, configurable per-team rule sets, scheduled drift reports, Marketplace
listing.

**Built with**

TypeScript, Node.js, Atlassian Forge, Rovo, Atlassian MCP, Jira REST API v3, HTML/CSS/JS, TF-IDF,
Anthropic/OpenAI (optional).

**Links**

- Source: this repository (MIT).
- Working demo: `npm start` → http://localhost:4173 (two sample releases, no credentials).
- Video: <pending — script in docs/DEMO.md>
- Screenshots: `docs/screenshot-home.png`, `screenshot-plan.png`, `screenshot-notes.png`,
  `screenshot-drift.png`.

---

## Checklist

- [ ] Repo public with MIT licence; no secrets in history.
- [ ] `npm install && npm test` green on a clean clone (53 tests).
- [ ] Video under the event's limit, showing the live app (not slides only).
- [ ] Submission links reachable from a logged-out browser.
- [ ] Prize contact details only after a win; the submission itself can use the handle.
