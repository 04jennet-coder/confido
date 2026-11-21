import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/server.js";

const server = createAppServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

test.after(() => new Promise((resolve) => server.close(resolve)));

test("health check answers", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("the web client is served at the root", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const html = await res.text();
  assert.match(html, /Confido/);
  assert.match(html, /\/app\.js/);
});

test("static traversal outside the web root is refused", async () => {
  const res = await fetch(`${base}/../package.json`);
  assert.ok([403, 404].includes(res.status));
});

test("POST /api/assess returns the full bundle", async () => {
  const res = await fetch(`${base}/api/assess`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preset: "payments", ai: false }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.assessment.band, "at_risk");
  assert.equal(body.narrative.provider, "deterministic");
  assert.ok(body.drift.available);
  assert.ok(Array.isArray(body.notes));
  assert.equal(body.ai.enabled, false);
});

test("the baseline can be switched off", async () => {
  const res = await fetch(`${base}/api/assess`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preset: "payments", baselinePreset: "" }),
  });
  const body = await res.json();
  assert.equal(body.drift.available, false);
});

test("POST /api/report returns markdown with a filename-friendly body", async () => {
  const res = await fetch(`${base}/api/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preset: "checkout" }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/markdown/);
  const text = await res.text();
  assert.match(text, /# Checkout 2\.9\.0/);
  assert.match(text, /SHIP/);
});

test("a CSV body is assessed without any Jira credentials", async () => {
  const csv = [
    "Issue key,Issue Type,Summary,Status,Priority,Assignee,Updated,Story Points,Fix versions",
    "PAY-9,Bug,Capture twice,In Progress,Highest,,2026-11-19T00:00:00Z,3,1.0.0",
  ].join("\n");
  const res = await fetch(`${base}/api/assess`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.assessment.counts.total, 1);
  assert.equal(body.assessment.source, "csv");
});

test("bad input returns a 400 with a readable message", async () => {
  const res = await fetch(`${base}/api/assess`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ preset: "nope" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Unknown preset/);
});
