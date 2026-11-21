import test from "node:test";
import assert from "node:assert/strict";
import { assess, explainScore } from "../dist/core/assess.js";
import { detectSignals } from "../dist/core/signals.js";
import { bandFor } from "../dist/core/scoring.js";
import { item, done, scope, hoursAgo } from "./helpers.mjs";

const ids = (signals) => signals.map((s) => s.id);

test("a clean release has no signals and ships", () => {
  const s = scope([done("TST-1"), done("TST-2"), item("TST-3", { updated: hoursAgo(1), priority: "Low" })]);
  const signals = detectSignals(s);
  assert.deepEqual(ids(signals), []);
  const assessment = assess(s);
  assert.equal(assessment.score, 100);
  assert.equal(assessment.band, "go");
  assert.equal(assessment.counts.open, 1);
});

test("an unresolved blocker deducts points and blocks a plain ship", () => {
  const s = scope([
    done("TST-1"),
    item("TST-2", { labels: ["blocker"] }),
    item("TST-3", { links: [{ type: "is blocked by", key: "TST-2" }] }),
  ]);
  const signals = detectSignals(s);
  const blockers = signals.find((x) => x.id === "open-blockers");
  assert.ok(blockers, "open-blockers should fire");
  assert.deepEqual(blockers.findings.map((f) => f.itemKey).sort(), ["TST-2", "TST-3"]);

  const assessment = assess(s);
  assert.equal(assessment.score, 100 - 2 * blockers.weight);
  assert.notEqual(assessment.band, "go", "one blocker can never be a plain ship");
  assert.equal(assessment.band, "at_risk", "two blockers is worse than conditions");
});

test("a single blocker is a conditional ship, not a hold", () => {
  const s = scope([item("TST-1", { labels: ["blocker"] })]);
  const assessment = assess(s);
  assert.equal(assessment.band, "conditional");
  assert.ok(assessment.score >= 85);
});

test("a blocker that is done does not count", () => {
  const s = scope([done("TST-1"), item("TST-2", { links: [{ type: "is blocked by", key: "TST-1" }] })]);
  assert.equal(detectSignals(s).some((x) => x.id === "open-blockers"), false);
});

test("two blocker-class risks can never be better than at risk", () => {
  const s = scope([
    done("TST-1"),
    item("TST-2", { labels: ["blocker"], assignee: "A" }),
    item("TST-3", { labels: ["blocker"], assignee: "B" }),
    item("TST-4", { priority: "Highest", assignee: null }),
  ]);
  const assessment = assess(s);
  assert.ok(assessment.score >= 65, `expected a high score, got ${assessment.score}`);
  assert.equal(assessment.band, "at_risk");
});

test("bandFor can only lower the band, never raise it", () => {
  const critical = [{ severity: "critical", findings: [{ itemKey: "A" }] }];
  const twoBlockers = [{ severity: "critical", findings: [{ itemKey: "A" }, { itemKey: "B" }] }];
  assert.equal(bandFor(95, []).band, "go");
  assert.equal(bandFor(95, critical).band, "conditional");
  assert.equal(bandFor(95, twoBlockers).band, "at_risk");
  assert.equal(bandFor(30, []).band, "no_go");
});

test("unowned high-priority work is its own risk", () => {
  const s = scope([item("TST-1", { priority: "High", assignee: null })]);
  const signal = detectSignals(s).find((x) => x.id === "critical-unowned");
  assert.ok(signal);
  assert.equal(signal.findings[0].detail, "High priority, no assignee");
});

test("stale work needs five days of silence and an in-progress status", () => {
  const fresh = scope([item("TST-1", { updated: hoursAgo(4) })]);
  assert.equal(detectSignals(fresh).some((x) => x.id === "stale-work"), false);

  const stale = scope([item("TST-1", { updated: hoursAgo(9) })]);
  const signal = detectSignals(stale).find((x) => x.id === "stale-work");
  assert.ok(signal);
  assert.match(signal.findings[0].detail, /last updated 9d ago/);

  const toDo = scope([item("TST-1", { statusCategory: "todo", status: "To Do", updated: hoursAgo(30) })]);
  assert.equal(detectSignals(toDo).some((x) => x.id === "stale-work"), false);
});

test("overdue only counts open items", () => {
  const overdue = scope([item("TST-1", { dueDate: "2026-11-15T00:00:00Z" })]);
  assert.ok(detectSignals(overdue).some((x) => x.id === "overdue"));

  const finished = scope([done("TST-1", { dueDate: "2026-11-15T00:00:00Z" })]);
  assert.equal(detectSignals(finished).some((x) => x.id === "overdue"), false);
});

test("scope creep looks at late additions, not at anything planned at kickoff", () => {
  const early = scope([item("TST-1", { created: "2026-11-03T09:00:00Z" })], {
    startedAt: "2026-11-02T09:00:00Z",
  });
  assert.equal(detectSignals(early).some((x) => x.id === "scope-added"), false);

  const late = scope([item("TST-1", { created: hoursAgo(2) })], { startedAt: hoursAgo(18) });
  const signal = detectSignals(late).find((x) => x.id === "scope-added");
  assert.ok(signal);
  assert.match(signal.findings[0].detail, /into the 18d cycle/);
});

test("risk language is windowed to recent comments", () => {
  const recent = scope([
    item("TST-1", { comments: [{ author: "J", created: hoursAgo(2), body: "We are blocked on the vendor sandbox." }] }),
  ]);
  const signal = detectSignals(recent).find((x) => x.id === "risk-language");
  assert.ok(signal);
  assert.match(signal.findings[0].excerpt, /blocked on the vendor sandbox/);

  const old = scope([
    item("TST-1", { comments: [{ author: "J", created: hoursAgo(30), body: "We are blocked on the vendor sandbox." }] }),
  ]);
  assert.equal(detectSignals(old).some((x) => x.id === "risk-language"), false);

  const closed = scope([done("TST-1", { comments: [{ author: "J", created: hoursAgo(2), body: "was blocked, fixed now" }] })]);
  assert.equal(detectSignals(closed).some((x) => x.id === "risk-language"), false);
});

test("penalties are capped per rule so one noisy rule cannot sink the release", () => {
  const items = Array.from({ length: 6 }, (_, i) =>
    item(`TST-${i + 1}`, { comments: [{ author: "J", created: hoursAgo(1), body: "still failing, delayed" }] }),
  );
  const signal = detectSignals(scope(items)).find((x) => x.id === "risk-language");
  assert.equal(signal.findings.length, 6);
  assert.equal(signal.penalty, 3 * signal.weight);
});

test("the same scope always produces the same verdict", () => {
  const s = scope([
    done("TST-1"),
    item("TST-2", { priority: "Highest", assignee: null, labels: ["blocker"] }),
    item("TST-3", { dueDate: "2026-11-01T00:00:00Z", updated: hoursAgo(12) }),
  ]);
  const a = assess(s);
  const b = assess(s);
  assert.equal(a.score, b.score);
  assert.equal(a.band, b.band);
  assert.deepEqual(ids(a.signals), ids(b.signals));
  assert.equal(a.summary, b.summary);
});

test("the score explanation adds up", () => {
  const s = scope([item("TST-1", { priority: "Highest", assignee: null }), item("TST-2", { dueDate: "2026-11-01T00:00:00Z" })]);
  const assessment = assess(s);
  const explained = explainScore(assessment);
  const penalty = assessment.signals.reduce((sum, x) => sum + x.penalty, 0);
  assert.equal(explained.lines[0], `100 − ${penalty} = ${assessment.score}`);
  assert.equal(explained.total, assessment.score);
});

test("an empty release refuses to score instead of returning 0", () => {
  assert.throws(() => assess(scope([])), /no items/i);
});
