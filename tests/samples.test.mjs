import test from "node:test";
import assert from "node:assert/strict";
import { buildBundle } from "../dist/app.js";
import { assess } from "../dist/core/assess.js";
import { renderMarkdown } from "../dist/core/render.js";
import { loadSample } from "../dist/adapters/sample.js";

const payments = await loadSample("payments");
const baseline = await loadSample("payments-baseline");
const checkout = await loadSample("checkout");

test("the trouble release lands in the at-risk band, not at zero", () => {
  const a = assess(payments, "sample:payments");
  assert.ok(a.score >= 40 && a.score <= 64, `score ${a.score} should be in the at-risk range`);
  assert.equal(a.band, "at_risk");
  const fired = a.signals.map((s) => s.id);
  for (const id of ["open-blockers", "overdue", "risk-language", "qa-debt", "critical-unowned"]) {
    assert.ok(fired.includes(id), `expected ${id} to fire, got ${fired.join(", ")}`);
  }
  assert.ok(a.conditions.length >= 3);
  assert.ok(a.nextActions.length >= 3);
  assert.match(a.summary, /scores \d+\/100/);
});

test("the healthy release ships with a near-perfect score", () => {
  const a = assess(checkout, "sample:checkout");
  assert.ok(a.score >= 95, `expected >= 95, got ${a.score}`);
  assert.equal(a.band, "go");
  assert.ok(a.dataConfidence > 0.7);
});

test("drift compares two snapshots and names what changed", async () => {
  const bundle = await buildBundle(payments, { ai: false, source: "sample:payments", baseline: { scope: baseline } });
  assert.equal(bundle.drift.available, true);
  assert.ok(bundle.drift.previousScore > bundle.assessment.score);
  assert.equal(bundle.drift.direction, "worsened");
  assert.ok(bundle.drift.newRisks.length >= 1);
  assert.ok(bundle.drift.completedItems.length >= 3);
  assert.ok(bundle.drift.addedItems.some((i) => i.key === "PAY-1404"));
  assert.match(bundle.drift.headline, /worsened|points/);
});

test("the brief is markdown, cites issue keys, and never claims open work shipped", async () => {
  const bundle = await buildBundle(payments, { ai: false, source: "sample:payments", baseline: { scope: baseline } });
  const md = renderMarkdown(bundle.assessment, payments, bundle.narrative, bundle.drift);

  assert.match(md, /^# Payments 3\.4\.0 — ship confidence brief/);
  assert.match(md, /## Conditions to ship/);
  assert.match(md, /## Risk register/);
  assert.match(md, /PAY-1401/);
  assert.match(md, /## Drift since the previous snapshot/);
  assert.match(md, /How this score was produced/);

  // PAY-1401 is open; it must not appear under a shipped-work heading.
  const notesSection = md.slice(md.indexOf("release notes draft"));
  const newSection = notesSection.slice(notesSection.indexOf("### New"), notesSection.indexOf("### Fixed"));
  assert.equal(newSection.includes("PAY-1401"), false);

  // The open items are named as not shipped instead.
  assert.match(notesSection, /not done and are deliberately not listed/);
});

test("narration is deterministic unless a model is configured", async () => {
  const bundle = await buildBundle(payments, { ai: false, source: "sample:payments" });
  assert.equal(bundle.narrative.provider, "deterministic");
  assert.equal(bundle.narrative.model, null);
  assert.match(bundle.narrative.text, /^## What is true now/);
  assert.ok(bundle.narrative.text.length > 200);
});

test("overlap detection finds the closely related open tickets", async () => {
  const bundle = await buildBundle(payments, { ai: false, source: "sample:payments" });
  for (const pair of bundle.overlaps) {
    assert.notEqual(pair.a, pair.b);
    assert.ok(pair.similarity >= 0.55);
    assert.ok(pair.sharedTerms.length >= 3);
  }
});
