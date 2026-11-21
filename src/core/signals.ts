import type { Finding, ReleaseScope, Severity, Signal, WorkItem } from "./types.js";
import { daysBetween, isDone, truncate, unique } from "./util.js";

/**
 * The rule engine.
 *
 * Every signal is derived from facts already on the issue (fields, links,
 * timestamps, comments) — never from a model's opinion. That is the whole point
 * of Confido: the score is reproducible, and every point of it can be traced
 * back to an issue key a reviewer can open.
 *
 * `weight` is the penalty per matched item; `scoring.ts` caps how many matches
 * of the same rule can count, so one noisy rule cannot sink the whole release.
 */

interface RuleContext {
  scope: ReleaseScope;
  asOf: number;
  inScope: Map<string, WorkItem>;
}

interface Rule {
  id: string;
  title: string;
  severity: Severity;
  weight: number;
  rule: string;
  recommendation: string;
  /** Maximum number of findings that count toward the penalty. */
  cap: number;
  detect(ctx: RuleContext): Finding[];
}

const RISK_LANGUAGE =
  /\b(blocked|blocker|stuck|waiting (?:on|for)|delayed|delay|slipp(?:ing|ed)?|at risk|risk of|can'?t|cannot|unable to|no response|no reply|failed|failing|flaky|escalat\w*|still broken)\b/i;

const PRIORITY_RANK: Record<string, number> = {
  Highest: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Lowest: 1,
  Unknown: 0,
};

function byPriorityThenAge(a: WorkItem, b: WorkItem): number {
  const p = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
  if (p !== 0) return p;
  return Date.parse(a.updated) - Date.parse(b.updated);
}

function openItems(ctx: RuleContext): WorkItem[] {
  return ctx.scope.items.filter((i) => !isDone(i)).sort(byPriorityThenAge);
}

function isHighPriority(item: WorkItem): boolean {
  return item.priority === "Highest" || item.priority === "High";
}

function blockedBy(item: WorkItem): string[] {
  return item.links
    .filter((l) => /blocked by|depends on|is dependent on/i.test(l.type))
    .map((l) => l.key);
}

function isOpenStatusCategory(value: string | undefined): boolean {
  return value === undefined || value === "todo" || value === "in_progress" || value === "unknown";
}

const rules: Rule[] = [
  {
    id: "open-blockers",
    title: "Unresolved blockers",
    severity: "critical",
    weight: 7,
    cap: 4,
    rule: "Issue is not done and either carries the `blocker` label or is blocked by an issue that is not done.",
    recommendation:
      "Clear or explicitly descope each blocker. A blocker that is not resolved by the release cut becomes a release-day surprise.",
    detect(ctx) {
      const out: Finding[] = [];
      for (const item of openItems(ctx)) {
        const blockers = blockedBy(item).filter((key) => {
          const target = ctx.inScope.get(key);
          if (target) return !isDone(target);
          // Unknown external issue: still a blocker until proven otherwise.
          return true;
        });
        const labelled = item.labels.some((l) => /^blocker$/i.test(l));
        if (blockers.length === 0 && !labelled) continue;
        const target = blockers[0] ? ctx.inScope.get(blockers[0]) : undefined;
        const detail = blockers.length
          ? `blocked by ${blockers.join(", ")}${target ? ` (${target.status})` : ""}`
          : "labelled blocker";
        out.push({ itemKey: item.key, summary: item.summary, detail });
      }
      return out;
    },
  },
  {
    id: "critical-unowned",
    title: "High-priority work nobody owns",
    severity: "high",
    weight: 5,
    cap: 3,
    rule: "Issue is High or Highest priority, not done, and has no assignee.",
    recommendation:
      "Assign an owner or move it out of the release. Unowned critical work is the most common cause of a silent slip.",
    detect(ctx) {
      return openItems(ctx)
        .filter((i) => isHighPriority(i) && !i.assignee)
        .map((i) => ({
          itemKey: i.key,
          summary: i.summary,
          detail: `${i.priority} priority, no assignee`,
        }));
    },
  },
  {
    id: "stale-work",
    title: "In-progress work that stopped moving",
    severity: "high",
    weight: 3,
    cap: 3,
    rule: "Issue is in progress and has not been updated for 5 or more days.",
    recommendation:
      "Ask the owner for a status update or narrow the scope. Long-stale in-progress work rarely arrives on time.",
    detect(ctx) {
      return openItems(ctx)
        .filter((i) => i.statusCategory === "in_progress" && daysBetween(i.updated, ctx.asOf) >= 5)
        .map((i) => ({
          itemKey: i.key,
          summary: i.summary,
          detail: `in progress, last updated ${daysBetween(i.updated, ctx.asOf)}d ago`,
        }));
    },
  },
  {
    id: "overdue",
    title: "Past its due date",
    severity: "high",
    weight: 4,
    cap: 3,
    rule: "Issue has a due date before the assessment time and is not done.",
    recommendation:
      "Re-date or re-scope overdue work before the review, otherwise the release date is already fiction.",
    detect(ctx) {
      return openItems(ctx)
        .filter((i) => i.dueDate && (Date.parse(i.dueDate) ?? Infinity) < ctx.asOf)
        .map((i) => ({
          itemKey: i.key,
          summary: i.summary,
          detail: `due ${String(i.dueDate).slice(0, 10)}, ${daysBetween(String(i.dueDate), ctx.asOf)}d overdue`,
        }));
    },
  },
  {
    id: "scope-added",
    title: "Scope added late in the cycle",
    severity: "medium",
    weight: 2,
    cap: 3,
    rule: "Open issue created in the final third of the cycle (at least the last 5 days) — late additions are where schedule risk hides.",
    recommendation:
      "Confirm each late addition is worth the schedule risk, or move it to the next release.",
    detect(ctx) {
      const startedAt = ctx.scope.release.startedAt;
      if (!startedAt) return [];
      const start = Date.parse(startedAt);
      if (Number.isNaN(start)) return [];
      const elapsedDays = (ctx.asOf - start) / 86_400_000;
      if (elapsedDays < 4) return [];
      const windowDays = Math.max(5, Math.round(elapsedDays * 0.35));
      const windowStart = ctx.asOf - windowDays * 86_400_000;
      return openItems(ctx)
        .filter((i) => {
          const created = Date.parse(i.created) ?? 0;
          return created >= windowStart && created <= ctx.asOf;
        })
        .map((i) => ({
          itemKey: i.key,
          summary: i.summary,
          detail: `created ${daysBetween(start, i.created)}d into the ${Math.round(elapsedDays)}d cycle`,
        }));
    },
  },
  {
    id: "qa-debt",
    title: "Open high-severity defects",
    severity: "medium",
    weight: 3,
    cap: 3,
    rule: "Bug with High or Highest priority that is not resolved.",
    recommendation:
      "Triage each defect with QA: fix, accept as known issue with a workaround, or block the release.",
    detect(ctx) {
      return openItems(ctx)
        .filter((i) => /bug|defect/i.test(i.type) && isHighPriority(i))
        .map((i) => ({
          itemKey: i.key,
          summary: i.summary,
          detail: `${i.type}, ${i.priority}, ${i.status}`,
        }));
    },
  },
  {
    id: "external-dependency",
    title: "Dependencies outside the release scope",
    severity: "medium",
    weight: 2,
    cap: 3,
    rule: "Issue is blocked by an issue that is not part of this release scope, so its status cannot be verified here.",
    recommendation:
      "Verify the external dependency directly and record the answer in the ticket before the release review.",
    detect(ctx) {
      const out: Finding[] = [];
      for (const item of openItems(ctx)) {
        const external = blockedBy(item).filter((key) => !ctx.inScope.has(key));
        if (!external.length) continue;
        out.push({
          itemKey: item.key,
          summary: item.summary,
          detail: `blocked by ${external.join(", ")} outside this release scope`,
        });
      }
      return out;
    },
  },
  {
    id: "risk-language",
    title: "Risk language in recent comments",
    severity: "high",
    weight: 2,
    cap: 3,
    rule: "A comment in the last 14 days on an open issue uses delay, blocker, or failure language.",
    recommendation:
      "Respond in-thread today. Comments are where slips are announced before they show up in status.",
    detect(ctx) {
      const windowStart = ctx.asOf - 14 * 86_400_000;
      const out: Finding[] = [];
      for (const item of openItems(ctx)) {
        const hit = item.comments
          .filter((c) => {
            const t = Date.parse(c.created);
            return !Number.isNaN(t) && t >= windowStart && t <= ctx.asOf && RISK_LANGUAGE.test(c.body);
          })
          .sort((a, b) => Date.parse(b.created) - Date.parse(a.created))[0];
        if (!hit) continue;
        out.push({
          itemKey: item.key,
          summary: item.summary,
          detail: `comment by ${hit.author}, ${daysBetween(hit.created, ctx.asOf)}d ago`,
          excerpt: truncate(hit.body, 200),
        });
      }
      return out;
    },
  },
  {
    id: "thin-spec",
    title: "High-priority work with little written context",
    severity: "low",
    weight: 2,
    cap: 3,
    rule: "High or Highest priority issue with a description shorter than 40 characters.",
    recommendation:
      "Add acceptance criteria. Thin specs become rework after code freeze, not before it.",
    detect(ctx) {
      return openItems(ctx)
        .filter((i) => isHighPriority(i) && i.description.trim().length < 40)
        .map((i) => ({
          itemKey: i.key,
          summary: i.summary,
          detail: `description ${i.description.trim().length} characters`,
        }));
    },
  },
  {
    id: "estimation-gap",
    title: "Unestimated open work",
    severity: "low",
    weight: 1,
    cap: 3,
    rule: "Open Story, Task, or Spike without story points.",
    recommendation: "Size the remaining work so the date can be checked against capacity, not hope.",
    detect(ctx) {
      return openItems(ctx)
        .filter((i) => /story|task|spike/i.test(i.type) && (i.storyPoints === null || i.storyPoints === undefined))
        .map((i) => ({
          itemKey: i.key,
          summary: i.summary,
          detail: "no story points",
        }));
    },
  },
];

export const RULE_IDS = rules.map((r) => r.id);

export function severityRank(severity: Severity): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity];
}

/** Runs every rule and returns signals that actually fired, strongest first. */
export function detectSignals(scope: ReleaseScope): Signal[] {
  const asOf = Date.parse(scope.release.asOf);
  const ctx: RuleContext = {
    scope,
    asOf: Number.isNaN(asOf) ? Date.now() : asOf,
    inScope: new Map(scope.items.map((i) => [i.key, i])),
  };

  const signals: Signal[] = [];
  for (const rule of rules) {
    const findings = rule.detect(ctx);
    if (!findings.length) continue;
    const counted = Math.min(findings.length, rule.cap);
    signals.push({
      id: rule.id,
      title: rule.title,
      severity: rule.severity,
      weight: rule.weight,
      findings,
      penalty: counted * rule.weight,
      recommendation: rule.recommendation,
      rule: rule.rule,
    });
  }

  return signals.sort((a, b) => b.penalty - a.penalty || severityRank(b.severity) - severityRank(a.severity));
}

/** Distinct issue keys implicated by a signal set — used for "X issues need attention". */
export function implicatedKeys(signals: Signal[]): string[] {
  return unique(signals.flatMap((s) => s.findings.map((f) => f.itemKey)));
}
