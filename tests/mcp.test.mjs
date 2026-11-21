import test from "node:test";
import assert from "node:assert/strict";
import { handleMessage } from "../dist/mcp/server.js";

const call = (method, params) => handleMessage({ jsonrpc: "2.0", id: 1, method, params });

test("initialize negotiates a protocol and advertises tools", async () => {
  const res = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test" } });
  assert.equal(res.jsonrpc, "2.0");
  assert.equal(res.result.protocolVersion, "2025-06-18");
  assert.deepEqual(res.result.capabilities.tools, { listChanged: false });
  assert.equal(res.result.serverInfo.name, "confido");
});

test("notifications get no response", async () => {
  assert.equal(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});

test("tools/list describes five read-only tools with schemas", async () => {
  const res = await call("tools/list", {});
  const names = res.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["assess_release", "list_risks", "explain_score", "draft_release_notes", "get_brief"]);
  for (const tool of res.result.tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.ok(tool.description.length > 20);
  }
});

test("assess_release returns a verdict for the sample release", async () => {
  const res = await call("tools/call", { name: "assess_release", arguments: { preset: "payments" } });
  assert.equal(res.result.isError, false);
  const text = res.result.content[0].text;
  assert.match(text, /Score \d+\/100 — AT RISK/);
  assert.match(text, /PAY-1401|PAY-1390|PAY-1393/);
  assert.match(text, /## What is true now/);
});

test("explain_score shows the arithmetic", async () => {
  const res = await call("tools/call", { name: "explain_score", arguments: { preset: "payments" } });
  assert.match(res.result.content[0].text, /^# Why \d+\/100/);
  assert.match(res.result.content[0].text, /100 − \d+ = \d+/);
});

test("list_risks filters by severity", async () => {
  const res = await call("tools/call", { name: "list_risks", arguments: { preset: "payments", severity: "critical" } });
  const text = res.result.content[0].text;
  assert.match(text, /CRITICAL/);
  assert.equal(text.includes("MEDIUM —"), false);
});

test("draft_release_notes lists only completed work", async () => {
  const res = await call("tools/call", { name: "draft_release_notes", arguments: { preset: "payments" } });
  const text = res.result.content[0].text;
  assert.match(text, /release notes draft/);
  assert.match(text, /PAY-1384/);
  assert.equal(text.includes("PAY-1401"), true); // named in the "not done" footnote
  const shipped = text.slice(text.indexOf("### New"), text.indexOf("### Fixed"));
  assert.equal(shipped.includes("PAY-1401"), false);
});

test("a live Jira project without credentials fails with guidance, not a crash", async () => {
  const res = await call("tools/call", { name: "assess_release", arguments: { projectKey: "PAY" } });
  assert.ok(res.error);
  assert.match(res.error.message, /Jira is not configured/);
});

test("unknown tools and methods are protocol errors", async () => {
  const tool = await call("tools/call", { name: "drop_database", arguments: {} });
  assert.equal(tool.error.code, -32603);
  assert.match(tool.error.message, /Unknown tool/);

  const method = await call("resources/subscribe", {});
  assert.equal(method.error.code, -32601);
});
