import type { Assessment, DriftReport, ReleaseScope, Severity } from "./types.js";
import { isDone, round } from "./util.js";

/**
 * Drift: what changed since the last assessment.
 *
 * "We assessed this a week ago and it was 74" is only useful with the delta and
 * the cause. This compares two scopes that were snapshotted at different times.
 */
export function compareAssessments(
  current: Assessment,
  previous: Assessment,
  currentScope: ReleaseScope,
  previousScope: ReleaseScope,
): DriftReport {
  const currentIds = new Map(current.signals.map((s) => [s.id, s]));
  const previousIds = new Map(previous.signals.map((s) => [s.id, s]));

  const newRisks = current.signals
    .filter((s) => !previousIds.has(s.id))
    .map((s) => ({ id: s.id, title: s.title, severity: s.severity }));
  const clearedRisks = previous.signals
    .filter((s) => !currentIds.has(s.id))
    .map((s) => ({ id: s.id, title: s.title, severity: s.severity }));

  const prevItems = new Map(previousScope.items.map((i) => [i.key, i]));
  const currItems = new Map(currentScope.items.map((i) => [i.key, i]));

  const addedItems = currentScope.items
    .filter((i) => !prevItems.has(i.key))
    .map((i) => ({ key: i.key, summary: i.summary, type: i.type }));

  const completedItems = previousScope.items
    .filter((i) => !isDone(i) && currItems.get(i.key)?.statusCategory === "done")
    .map((i) => ({ key: i.key, summary: i.summary, type: i.type }));

  const delta = current.score - previous.score;
  const direction = delta >= 3 ? "improved" : delta <= -3 ? "worsened" : "flat";

  const parts: string[] = [];
  if (delta !== 0) parts.push(`${delta > 0 ? "+" : ""}${delta} points since the previous snapshot`);
  else parts.push("score unchanged since the previous snapshot");
  if (newRisks.length) parts.push(`${newRisks.length} new risk ${newRisks.length === 1 ? "class" : "classes"}`);
  if (clearedRisks.length) parts.push(`${clearedRisks.length} cleared`);
  if (completedItems.length) parts.push(`${completedItems.length} completed`);
  if (addedItems.length) parts.push(`${addedItems.length} added to scope`);

  return {
    available: true,
    previousScore: previous.score,
    scoreDelta: delta,
    direction,
    newRisks,
    clearedRisks,
    addedItems,
    completedItems,
    headline: parts.join(", ") + ".",
  };
}

export function emptyDrift(): DriftReport {
  return {
    available: false,
    previousScore: null,
    scoreDelta: null,
    direction: "unknown",
    newRisks: [],
    clearedRisks: [],
    addedItems: [],
    completedItems: [],
    headline: "No previous snapshot for this release, so there is nothing to compare yet.",
  };
}

export function severityTotals(signals: { severity: Severity }[]): Record<Severity, number> {
  const totals: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const s of signals) totals[s.severity] += 1;
  return totals;
}

export function scoreOutOf(score: number): string {
  return `${round(score)}/100`;
}
