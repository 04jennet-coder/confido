import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { assess } from "../forge/src/lib/core/assess.js";
import { issuesToScope } from "../forge/src/lib/adapters/jiraMap.js";
import { searchJiraIssues } from "../forge/src/lib/adapters/jiraSearch.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const forge = join(root, "forge");
const manifest = parseYaml(readFileSync(join(forge, "manifest.yml"), "utf8"));
const indexSource = readFileSync(join(forge, "src", "index.js"), "utf8");

const actions = manifest.modules.action ?? [];
const actionKeys = actions.map((a) => a.key);
const functions = manifest.modules.function ?? [];

test("the Forge app targets a supported runtime and asks only for read scope", () => {
  assert.ok(["nodejs22.x", "nodejs24.x"].includes(manifest.app.runtime.name));
  assert.deepEqual(manifest.permissions.scopes, ["read:jira-work"]);
});

test("every competition bonus module is declared", () => {
  assert.equal(manifest.modules["rovo:agent"].length, 1);
  assert.equal(manifest.modules["rovo:skill"].length, 1);
  assert.equal(manifest.modules["rovo:mcp"].length, 1);
});

test("the agent only references actions and skills that exist", () => {
  const agent = manifest.modules["rovo:agent"][0];
  assert.ok(agent.name.length <= 30, "agent name limit is 30 characters");
  assert.ok(agent.description.length > 40);
  for (const key of agent.actions) assert.ok(actionKeys.includes(key), `agent references missing action ${key}`);
  const skillKeys = manifest.modules["rovo:skill"].map((s) => s.key);
  for (const key of agent.skills) assert.ok(skillKeys.includes(key), `agent references missing skill ${key}`);
});

test("the MCP server exposes only declared actions, under the name limit", () => {
  const mcp = manifest.modules["rovo:mcp"][0];
  assert.ok(mcp.name.length <= 30, "MCP name limit is 30 characters");
  assert.ok(mcp.tools.length >= 3);
  for (const key of mcp.tools) assert.ok(actionKeys.includes(key), `MCP exposes undeclared action ${key}`);
});

test("actions are typed, read-only, and point at real handlers", () => {
  const functionKeys = functions.map((f) => f.key);
  for (const action of actions) {
    assert.ok(action.name, `${action.key} needs a name`);
    assert.equal(action.actionVerb, "GET", `${action.key} must stay read-only`);
    assert.ok(action.description.length > 20, `${action.key} needs a description`);
    assert.ok(functionKeys.includes(action.function), `${action.key} points at missing function ${action.function}`);
  }
  for (const fn of functions) {
    const [file, exported] = fn.handler.split(".");
    assert.equal(file, "index", "handlers live in src/index.js");
    const pattern = new RegExp(`export\\s+(async\\s+)?function\\s+${exported}\\b`);
    assert.match(indexSource, pattern, `handler ${fn.handler} is not exported`);
  }
});

test("the skill directory and frontmatter match the manifest", () => {
  const skill = manifest.modules["rovo:skill"][0];
  const dir = join(forge, skill.source.dir);
  assert.ok(existsSync(join(dir, "SKILL.md")), "SKILL.md must exist");
  assert.equal(dir.split("/").pop(), skill.key, "directory name must match the skill key");

  const body = readFileSync(join(dir, "SKILL.md"), "utf8");
  const match = body.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "SKILL.md needs YAML frontmatter");
  const meta = parseYaml(match[1]);
  assert.equal(meta.name, skill.key);
  assert.ok(meta.description.length >= 50 && meta.description.length <= 1024);
  const allowed = String(meta["allowed-tools"]).split(/\s+/);
  for (const tool of skill.dependencies.tools) {
    assert.ok(allowed.includes(tool), `allowed-tools must include ${tool}`);
  }
  assert.ok(body.split("\n").length <= 500, "skill body should stay under 500 lines");
});

test("the compiled engine is present for the Forge deploy", () => {
  for (const file of ["lib/core/assess.js", "lib/core/signals.js", "lib/adapters/jiraMap.js"]) {
    assert.ok(existsSync(join(forge, "src", file)), `${file} missing — run npm run build:forge`);
  }
});

test("the Forge app does not depend on Node-only APIs the runtime lacks", () => {
  // The core is copied into the bundle; it must not reach for fs or child_process.
  const text = readFileSync(join(forge, "src", "lib", "core", "assess.js"), "utf8");
  assert.equal(/from "node:fs"/.test(text), false);
  assert.equal(/child_process/.test(text), false);
});

test("Jira search includes a blocker beyond the first 400 issues in the verdict", async () => {
  const jql = 'project = "PAY" AND fixVersion = "3.4.0"';
  const done = Array.from({ length: 400 }, (_, index) => ({
    key: `PAY-${index + 1}`,
    fields: { status: { statusCategory: { key: "done" } } },
  }));
  const blocker = {
    key: "PAY-401",
    fields: { labels: ["blocker"], status: { statusCategory: { key: "new" } } },
  };
  let page = 0;
  const issues = await searchJiraIssues(jql, async (params) => {
    assert.equal(params.get("jql"), jql);
    assert.equal(params.get("nextPageToken"), page === 0 ? null : `page+${page}=`);
    if (page === 4) return Response.json({ issues: [blocker], isLast: true });
    const offset = page * 100;
    page += 1;
    return Response.json({ issues: done.slice(offset, offset + 100), isLast: false, nextPageToken: `page+${page}=` });
  });
  assert.equal(issues.length, 401);
  const result = assess(issuesToScope(issues, {
    name: "Payments 3.4.0",
    projectKey: "PAY",
    asOf: "2026-11-20T00:00:00Z",
  }), "jira");
  assert.equal(result.counts.blocked, 1);
  assert.notEqual(result.bandLabel, "SHIP");
});

test("Jira search refuses a partial scope at the issue or page limit", async () => {
  const issue = { key: "PAY-1", fields: {} };
  const request = async () => Response.json({ issues: [issue], isLast: false, nextPageToken: "continue" });
  await assert.rejects(searchJiraIssues("project = PAY", request, 1), /no verdict was computed/i);
  let pages = 0;
  await assert.rejects(searchJiraIssues("project = PAY", async () => {
    pages += 1;
    return Response.json({ issues: [], isLast: false, nextPageToken: String(pages) });
  }), /no verdict was computed/i);
  assert.equal(pages, 20);
});

test("Jira search refuses missing or repeated continuation tokens", async () => {
  for (const nextPageToken of [undefined, "repeated"]) {
    await assert.rejects(searchJiraIssues("project = PAY", async () =>
      Response.json({ issues: [], isLast: false, nextPageToken })), /no verdict was computed/i);
  }
});
