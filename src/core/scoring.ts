import type { Band, Driver, ReleaseScope, Signal, WorkItem } from "./types.js";
import { clamp, daysBetween, isDone, round } from "./util.js";

/**
 * Scoring is intentionally boring arithmetic. 100 minus capped penalties.
 * Two people running the same scope get the same number, and the "why" panel
 * shows the exact subtraction.
 */

export interface BandInfo {
  band: Band;
  label: string;
  blurb: string;
}

const BAND_ORDER: Band[] = ["go", "conditional", "at_risk", "no_go"];

const BAND_TEXT: Record<Band, { label: string; blurb: string }> = {
  go: { label: "SHIP", blurb: "No release-stopping risks detected. Ship, and keep the watch list." },
  conditional: {
    label: "SHIP WITH CONDITIONS",
    blurb: "The date is plausible, but the conditions below have to be true first.",
  },
  at_risk: {
    label: "AT RISK",
    blurb: "The release is exposed. Either cut scope or move the date — hoping is not a plan.",
  },
  no_go: {
    label: "HOLD",
    blurb: "Too many unresolved dependencies for the current cut. Stop and re-plan the release.",
  },
};

function worse(a: Band, b: Band): Band {
  return BAND_ORDER.indexOf(a) >= BAND_ORDER.indexOf(b) ? a : b;
}

/**
 * The score sets the starting band, and two facts can override it downwards:
 * a release with an unresolved blocker is never a plain "ship", and two or more
 * blocker-class risks is never better than "at risk". Numbers alone should not
 * be able to talk someone past a blocker.
 */
export function bandFor(score: number, signals: Signal[] = []): BandInfo {
  let band: Band = score >= 85 ? "go" : score >= 65 ? "conditional" : score >= 45 ? "at_risk" : "no_go";

  const critical = signals
    .filter((s) => s.severity === "critical")
    .reduce((sum, s) => sum + s.findings.length, 0);
  const high = signals.filter((s) => s.severity === "high").reduce((sum, s) => sum + s.findings.length, 0);
  if (critical >= 2) band = worse(band, "at_risk");
  else if (critical === 1 || high >= 3) band = worse(band, "conditional");
  if (band === "go" && (critical > 0 || high > 0)) band = "conditional";

  const text = BAND_TEXT[band];
  return { band, label: text.label, blurb: text.blurb };
}

export function scoreSignals(signals: Signal[]): number {
  const penalty = signals.reduce((sum, s) => sum + s.penalty, 0);
  return clamp(100 - penalty, 0, 100);
}

export function toDrivers(signals: Signal[]): Driver[] {
  return signals
    .map((s) => ({ id: s.id, title: s.title, severity: s.severity, penalty: s.penalty, count: s.findings.length }))
    .sort((a, b) => b.penalty - a.penalty);
}

export interface Counts {
  total: number;
  done: number;
  open: number;
  blocked: number;
  unassigned: number;
  critical: number;
}

export function countItems(scope: ReleaseScope): Counts {
  const inScope = new Map(scope.items.map((i) => [i.key, i]));
  let done = 0;
  let blocked = 0;
  let unassigned = 0;
  let critical = 0;

  for (const item of scope.items) {
    if (isDone(item)) {
      done += 1;
      continue;
    }
    if (hasUnresolvedBlocker(item, inScope)) blocked += 1;
    if (!item.assignee) unassigned += 1;
    if (item.priority === "Highest") critical += 1;
  }

  return { total: scope.items.length, done, open: scope.items.length - done, blocked, unassigned, critical };
}

function hasUnresolvedBlocker(item: WorkItem, inScope: Map<string, WorkItem>): boolean {
  if (item.labels.some((l) => /^blocker$/i.test(l))) return true;
  return item.links
    .filter((l) => /blocked by|depends on|is dependent on/i.test(l.type))
    .some((l) => {
      const target = inScope.get(l.key);
      return target ? !isDone(target) : true;
    });
}

/**
 * How much the numbers should be trusted. Missing owners or empty specs do not
 * change the score, they widen the uncertainty around it — shown separately so
 * a confident-looking 80 from thin data is not mistaken for safety.
 */
export function dataConfidence(scope: ReleaseScope): number {
  const open = scope.items.filter((i) => !isDone(i));
  if (open.length === 0) return 1;
  const assignee = open.filter((i) => Boolean(i.assignee)).length / open.length;
  const spec = open.filter((i) => i.description.trim().length >= 20).length / open.length;
  const activity = open.filter((i) => daysBetween(i.updated, scope.release.asOf) <= 21).length / open.length;
  return round(clamp(0.45 * assignee + 0.35 * spec + 0.2 * activity, 0.2, 1), 2);
}
