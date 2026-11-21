import { assess } from "./core/assess.js";
import { compareAssessments, emptyDrift } from "./core/drift.js";
import { findOverlaps, type OverlapPair } from "./core/cluster.js";
import { buildNarrative, status as aiStatus } from "./core/narrative.js";
import { buildReleaseNotes } from "./core/releaseNotes.js";
import type { Assessment, DriftReport, Narrative, ReleaseNoteSection, ReleaseScope } from "./core/types.js";
import { isDone } from "./core/util.js";

/**
 * One report bundle, three consumers: the HTTP API, the CLI and the MCP server.
 * Keeping the orchestration here is what makes "the same numbers everywhere" true
 * rather than aspirational.
 */
export interface ReportBundle {
  assessment: Assessment;
  narrative: Narrative;
  drift: DriftReport;
  notes: ReleaseNoteSection[];
  overlaps: OverlapPair[];
  ai: ReturnType<typeof aiStatus>;
}

export interface BuildOptions {
  ai: boolean;
  source?: string;
  baseline?: { scope: ReleaseScope; score?: number };
}

export async function buildBundle(scope: ReleaseScope, options: BuildOptions): Promise<ReportBundle> {
  const assessment = assess(scope, options.source ?? "sample");

  const narrative = await buildNarrative(assessment, scope, { ai: options.ai });

  let drift: DriftReport = emptyDrift();
  if (options.baseline) {
    const previous = assess(options.baseline.scope, options.source ?? "sample");
    drift = compareAssessments(assessment, previous, scope, options.baseline.scope);
  }

  const open = scope.items.filter((i) => !isDone(i));
  const overlaps = findOverlaps(open);

  return {
    assessment,
    narrative,
    drift,
    notes: buildReleaseNotes(scope),
    overlaps,
    ai: aiStatus(),
  };
}
