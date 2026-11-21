# AI policy and disclosure

This file is the honest description of what is AI in Confido, what is not, and what the user should be
told. It exists because "AI-powered" is usually a claim without a boundary.

## The boundary

| Layer | How it is produced | Can AI change it? |
| --- | --- | --- |
| Score (0–100) | arithmetic over Jira fields, links, timestamps | No |
| Band (SHIP / CONDITIONS / AT RISK / HOLD) | score bands + blocker gates | No |
| Risks, evidence, severity | ten deterministic rules | No |
| Conditions to ship, next actions | templates filled from fired rules | No |
| Drift, release notes | comparison of two snapshots; `statusCategory = done` | No |
| Overlap detection | TF-IDF vectors + cosine similarity, local | No |
| **Narrative brief** | engine template, or an LLM prompt over the computed facts | **Yes — prose only** |

The model is never given the ability to add a risk, a ticket, a date, or an owner. The prompt states
that the verdict and score are read-only and that unlisted facts are forbidden, and the response is
returned as prose beside the computed numbers, not as data. A model failure is visible: the response
sets `fallbackUsed: true` and returns the deterministic brief.

## What is sent to a model

Only when a key is configured (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`), and only for `ai: true`
requests:

- release name, fix version, evaluation time, counts, score, band, data confidence;
- for each fired risk: title, severity, penalty, and up to four findings with issue key, truncated
  summary, the factual detail, and a truncated comment excerpt;
- conditions and next actions.

Not sent: API tokens, credentials, the full issue description corpus, attachments, user identities
beyond what appears in a comment excerpt.

## Responsible-use notes for judges and reviewers

- **Read-only by construction.** No MCP tool, Rovo action, CLI flag or HTTP route writes to Jira. The
  Forge manifest requests `read:jira-work` only.
- **No silent automation.** Confido never posts comments, creates issues, or transitions tickets. The
  brief is for a human to act on.
- **Hallucination containment.** Because the verdict is computed, a bad model output cannot make a
  release look safer than its tickets. The worst case is clumsy prose.
- **Uncertainty is surfaced, not hidden.** `dataConfidence` reports how much of the open scope has an
  owner, a real description, and recent activity; below 60% the brief says the score is a floor.
- **Demo data is synthetic.** The two sample releases are invented (names, keys, comments). No real
  customer or colleague data is bundled.
- **People in the data.** Comment excerpts are shown because a human wrote them in a work system for
  colleagues to read; nothing is inferred about individuals, and no people analytics are produced.

## Disclosure text for submissions

> Confido's verdict is deterministic: a fixed rule set over Jira fields, links, timestamps and
> comments, with capped penalties and blocker gates. No language model participates in the score,
> the band, the risks, the conditions or the release notes. An optional LLM rewrites the narrative
> brief from the already-computed facts; without an API key the engine writes that brief itself. Local
> TF-IDF similarity is used to flag overlapping work. The Forge app is read-only and runs with the
> installing user's own permissions.
