import type { Assessment, ReleaseScope, Signal } from "./types.js";
import { listKeys, plural } from "./util.js";

/**
 * Text that the engine writes itself.
 *
 * When no LLM is configured (or the call fails) the whole product still works:
 * these templates turn the computed facts into a readable brief. The LLM's job
 * later is to say the same thing better — never to change the verdict.
 */

const ACTION_BY_RULE: Record<string, (keys: string, count: number) => string> = {
  "open-blockers": (keys, n) =>
    `Unblock ${keys} today — resolve the dependency or descope it out of this release (${n} ${plural(n, "blocker")}).`,
  "critical-unowned": (keys, n) =>
    `Name an owner for ${keys} or move it to the next release (${n} unowned high-priority ${plural(n, "item")}).`,
  "stale-work": (keys) => `Get a same-day status on ${keys}; if nothing moved, cut it.`,
  overdue: (keys) => `Re-baseline the dates on ${keys} before anyone quotes the release date again.`,
  "scope-added": (keys, n) =>
    `Decide on ${keys} — added mid-cycle (${n} ${plural(n, "item")}) and still open. Move it out unless it is worth the slip.`,
  "qa-debt": (keys) => `Triage ${keys} with QA: fix, document a workaround, or block the release.`,
  "external-dependency": (keys) => `Ask the owning team for a written status on ${keys} and paste it into the ticket.`,
  "risk-language": (keys) => `Answer the concerns raised on ${keys} in-thread today.`,
  "thin-spec": (keys) => `Add acceptance criteria to ${keys} before code freeze.`,
  "estimation-gap": (keys) => `Size ${keys} so capacity can be checked against the date.`,
};

const CONDITION_BY_RULE: Record<string, (keys: string) => string> = {
  "open-blockers": (keys) => `Every blocker resolved or explicitly descoped (${keys}).`,
  "critical-unowned": (keys) => `A named owner on ${keys}.`,
  "stale-work": (keys) => `A status from the owner of ${keys} within 24 hours.`,
  overdue: (keys) => `Due dates on ${keys} re-baselined and agreed.`,
  "scope-added": (keys) => `An explicit decision on mid-cycle additions (${keys}).`,
  "qa-debt": (keys) => `QA sign-off on ${keys}.`,
  "risk-language": (keys) => `The concerns in ${keys} answered with a decision, not a comment.`,
};

function keysOf(signal: Signal, max = 3): string {
  return listKeys(signal.findings.map((f) => f.itemKey), max);
}

/** Gate criteria: only what must be true before shipping, strongest first. */
export function buildConditions(signals: Signal[]): string[] {
  const conditions: string[] = [];
  for (const signal of signals) {
    const template = CONDITION_BY_RULE[signal.id];
    if (!template) continue;
    conditions.push(template(keysOf(signal)));
    if (conditions.length === 5) break;
  }
  return conditions;
}

/** The three or four things the release owner should actually do next. */
export function buildNextActions(signals: Signal[]): string[] {
  const actions: string[] = [];
  for (const signal of signals) {
    const template = ACTION_BY_RULE[signal.id];
    if (!template) continue;
    actions.push(template(keysOf(signal), signal.findings.length));
    if (actions.length === 4) break;
  }
  if (actions.length === 0) {
    actions.push("No action needed from the risk engine. Keep the release notes and the rollout plan ready.");
  }
  return actions;
}

export function buildSummary(
  scope: ReleaseScope,
  assessment: Pick<Assessment, "score" | "bandLabel" | "counts" | "drivers" | "dataConfidence">,
): string {
  const { score, bandLabel, counts, drivers, dataConfidence } = assessment;
  const name = scope.release.name;
  const top = drivers[0];

  if (counts.open === 0) {
    return `${name}: every item in scope is done. Nothing in the Jira data blocks this release — verify the rollout plan and ship.`;
  }

  const facts: string[] = [];
  facts.push(`${counts.open} of ${counts.total} items are still open`);
  if (counts.blocked) facts.push(`${counts.blocked} blocked`);
  if (counts.unassigned) facts.push(`${counts.unassigned} without an owner`);
  if (counts.critical) facts.push(`${counts.critical} at Highest priority`);

  const drag = top
    ? ` The largest single drag is "${top.title.toLowerCase()}" — ${top.count} ${plural(top.count, "item")}, ${top.penalty} points.`
    : "";
  const caveat =
    dataConfidence < 0.6
      ? ` Data is thin (${Math.round(dataConfidence * 100)}% coverage), so treat the score as a floor, not a comfort.`
      : "";

  return `${name} scores ${score}/100 — ${bandLabel}. ${facts.join(", ")}.${drag}${caveat}`;
}
