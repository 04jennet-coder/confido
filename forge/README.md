# Confido Forge app

Rovo agent + reusable skill + MCP tools over the Confido engine.

```
manifest.yml                     modules: rovo:agent, rovo:skill, rovo:mcp, 5 actions, 5 functions
src/index.js                     action handlers (assess, risks, explain, notes, brief)
src/forgeJira.js                 requestJira search as the person invoking the tool
src/lib/                         compiled engine (npm run build:forge from the repo root)
skills/release-readiness/        SKILL.md playbook loaded by the agent and other agents
```

Deploy sequence and troubleshooting: [`../docs/FORGE-DEPLOY.md`](../docs/FORGE-DEPLOY.md).

## Facts that matter for review

- Scopes: `read:jira-work` only.
- All five actions are `actionVerb: GET`; there is no write path.
- `app.id` is intentionally absent until `forge register` creates it for the owning account.
- The engine in `src/lib` is generated from `../src/core`; do not edit it by hand.
