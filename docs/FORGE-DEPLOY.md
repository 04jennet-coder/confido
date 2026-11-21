# Deploying the Forge app

Everything here needs the Atlassian account that will own the app. Nothing in this repository has
been deployed or registered — that step is deliberately left to the account owner.

## 0. Prerequisites

- Node.js 20+ and npm.
- A free Atlassian Cloud developer site: <https://developer.atlassian.com/cloud/>
- The Forge CLI: `npm install -g @forge/cli@latest`

## 1. Build the engine into the app

From the repository root:

```bash
npm ci
npm run build          # compiles src/ → dist/ (web app, CLI, MCP)
npm run build:forge    # compiles src/core + src/adapters/jiraMap.ts → forge/src/lib/
```

`forge/src/lib` must exist before deploying: the Forge functions import the same engine the tests
cover. `npm test` also runs `build:forge`, so a green test run guarantees it.

## 2. Install Forge dependencies

```bash
cd forge
npm ci                 # @forge/api
```

## 3. Register the app (creates the app id)

```bash
forge login            # opens a browser; sign in with the Atlassian account that owns the app
forge register         # prompts for a name; writes app.id into manifest.yml
```

`forge register` prints the app id (`ari:cloud:ecosystem::app/<uuid>`). Commit it — it is not a
secret, and `forge deploy` reads it from the manifest.

## 4. Deploy and install

```bash
forge lint
forge deploy                     # bundles forge/ and deploys to the development environment
forge install                    # first install; select the test site and Jira
```

For an existing installation use `forge install --upgrade` if Atlassian requires an upgrade for the deployed version.

## 5. Verify in Jira

1. Open Rovo (or any Jira page with the Rovo panel) and start a chat with **Confido Release Captain**
   (it appears under agents → *Made by your apps*).
2. Ask: *"Assess release PAY 3.4.0"* (use a real project and fix version on your site).
3. Expect: score, band, the top risks with issue keys, conditions, next actions.
4. Try *"Why did it score that way?"* → the same arithmetic as the web app.
5. MCP: in Atlassian Administration → Apps → your app → **Connected apps** → enable the tools you
   want to expose. The endpoint is `https://mcp.atlassian.com/forge/<appId>` (uuid only). Add it to
   Claude Code with:
   `claude mcp add --transport http confido https://mcp.atlassian.com/forge/<appId>`
6. Run the same release query as two users with different Jira project permissions. Verify that
   Rovo and MCP only return issues the invoking user can browse. Check that an incomplete search
   asks for a narrower scope without displaying a score or verdict.

## 6. Share with judges (installation link)

Codegeist requires an **installation link** the judges can use:

```bash
forge deploy -e production
```

Then open the developer console (<https://developer.atlassian.com/console/myapps/>) → your app →
**Distribution** → **Edit**. Select Jira, enable **Sharing**, and copy the installation link.
Verify it from a second Jira site using an account with permission to install apps there. Include the
link, the Rovo and MCP verification steps, and the release fixture details in the submission.

## What the app asks for

- Scopes: `read:jira-work` only. No write scope, no storage scope.
- Runtime: `nodejs24.x`, 512 MB, arm64.
- Modules: `rovo:agent` ×1, `rovo:skill` ×1, `rovo:mcp` ×1, `action` ×5, `function` ×5.

The manifest deliberately omits `app.id`: `forge register` fills it for the owning account. If you
see a validation error about the id, you have not registered yet (step 3).

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot find module './lib/core/assess.js'` at deploy | engine not built | `npm run build:forge` from the root |
| Agent does not appear in Rovo | app installed but agent unpublished | `forge install --upgrade`, then reload Jira |
| "I need a project key…" | no scope supplied | give a project key or JQL in the prompt |
| "No issues matched …" | wrong key/version or no permission | check the fix version spelling; the app runs as you |
| "Jira search did not return a complete release scope" | search limit or invalid pagination | narrow the release scope and run the query again |
| MCP endpoint 404 | external exposure disabled | Administration → Apps → Connected apps → enable tools |
| Manifest lint error on `rovo:skill` | directory/frontmatter name mismatch | the directory name must equal the skill key (`release-readiness`) |

## Re-deploy loop

```bash
npm run build:forge && cd forge && forge deploy && forge install --upgrade
```

Rovo agent changes require the reinstall (`--upgrade`) to show up in the chat UI.
