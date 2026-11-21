import { buildConditions, buildNextActions, buildSummary } from "./brief.js";
import { bandFor, countItems, dataConfidence, scoreSignals, toDrivers } from "./scoring.js";
import { detectSignals } from "./signals.js";
import type { Assessment, ReleaseScope } from "./types.js";
import { ENGINE } from "./util.js";

/**
 * The single entry point every surface uses: web UI, CLI, MCP tools, Forge
 * actions and the Rovo agent all call `assess()` and get identical numbers.
 */
export function assess(scope: ReleaseScope, source = "sample"): Assessment {
  if (!scope.items.length) throw new Error("This release has no items. Nothing to assess.");
  if (!scope.release?.asOf) throw new Error("Release scope is missing an evaluation time (asOf).");

  const signals = detectSignals(scope);
  const score = scoreSignals(signals);
  const info = bandFor(score, signals);
  const counts = countItems(scope);
  const drivers = toDrivers(signals);
  const confidence = dataConfidence(scope);

  const base = {
    score,
    bandLabel: info.label,
    counts,
    drivers,
    dataConfidence: confidence,
  };

  return {
    release: scope.release,
    score,
    band: info.band,
    bandLabel: info.label,
    dataConfidence: confidence,
    counts,
    signals,
    drivers,
    conditions: buildConditions(signals),
    nextActions: buildNextActions(signals),
    summary: buildSummary(scope, base),
    generatedAt: new Date().toISOString(),
    engine: { ...ENGINE, deterministic: true },
    source,
  };
}

/** The arithmetic, spelled out. Powers the "why this score" panel and MCP tool. */
export function explainScore(assessment: Assessment): { total: number; lines: string[]; note: string } {
  const lines = assessment.signals.map((s) => {
    const counted = Math.round(s.penalty / s.weight);
    const cap = counted < s.findings.length ? `, capped from ${s.findings.length}` : "";
    return `- ${s.title}: ${s.penalty} points (${counted} × ${s.weight}${cap}) — ${s.findings
      .slice(0, 4)
      .map((f) => f.itemKey)
      .join(", ")}`;
  });
  const penalty = assessment.signals.reduce((sum, s) => sum + s.penalty, 0);
  return {
    total: assessment.score,
    lines: [`100 − ${penalty} = ${assessment.score}`, ...lines],
    note: "Every deduction comes from a rule listed here. Nothing is inferred by a model.",
  };
}

export function isAssessment(value: unknown): value is Assessment {
  const candidate = value as Assessment | null;
  return Boolean(candidate && typeof candidate.score === "number" && Array.isArray(candidate.signals));
}
