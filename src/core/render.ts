import type { Assessment, DriftReport, Narrative, ReleaseScope } from "./types.js";
import { explainScore } from "./assess.js";
import { buildReleaseNotes, renderReleaseNotes } from "./releaseNotes.js";

/**
 * The artefact people paste into a release channel or a stakeholder email.
 * Markdown on purpose: it survives Slack, Confluence, Google Docs and GitHub.
 */
export function renderMarkdown(
  assessment: Assessment,
  scope: ReleaseScope,
  narrative: Narrative,
  drift?: DriftReport,
): string {
  const { release, counts } = assessment;
  const lines: string[] = [];

  lines.push(`# ${release.name} — ship confidence brief`);
  lines.push("");
  lines.push(
    `_Generated ${assessment.generatedAt} by Confido ${assessment.engine.version} · source: ${assessment.source} · evaluation time: ${release.asOf}_`,
  );
  lines.push("");
  lines.push(`| | |`);
  lines.push(`| --- | --- |`);
  lines.push(`| **Verdict** | **${assessment.bandLabel}** · ${assessment.score}/100 |`);
  lines.push(`| **Data confidence** | ${Math.round(assessment.dataConfidence * 100)}% |`);
  lines.push(
    `| **Scope** | ${counts.total} items · ${counts.done} done · ${counts.open} open · ${counts.blocked} blocked · ${counts.unassigned} unassigned |`,
  );
  if (release.fixVersion) lines.push(`| **Fix version** | ${release.projectKey} ${release.fixVersion} |`);
  if (release.sprintName) lines.push(`| **Sprint** | ${release.sprintName} |`);
  lines.push("");

  lines.push(narrative.text.trim());
  lines.push("");

  if (assessment.conditions.length) {
    lines.push("## Conditions to ship");
    for (const condition of assessment.conditions) lines.push(`- [ ] ${condition}`);
    lines.push("");
  }

  lines.push("## Risk register");
  lines.push("");
  if (!assessment.signals.length) {
    lines.push("No risk signals fired.");
  } else {
    for (const signal of assessment.signals) {
      lines.push(`### ${signal.severity.toUpperCase()} · ${signal.title} (−${signal.penalty})`);
      lines.push(`_${signal.rule}_`);
      lines.push("");
      for (const finding of signal.findings) {
        lines.push(`- **${finding.itemKey}** ${finding.summary} — ${finding.detail}`);
        if (finding.excerpt) lines.push(`  > ${finding.excerpt.replace(/\n+/g, " ")}`);
      }
      lines.push("");
      lines.push(`**Action:** ${signal.recommendation}`);
      lines.push("");
    }
  }

  lines.push("## Next actions");
  assessment.nextActions.forEach((action, i) => lines.push(`${i + 1}. ${action}`));
  lines.push("");

  if (drift?.available) {
    lines.push("## Drift since the previous snapshot");
    lines.push(`${drift.headline} (${drift.previousScore}/100 → ${assessment.score}/100)`);
    if (drift.newRisks.length) lines.push(`- New: ${drift.newRisks.map((r) => r.title).join(", ")}`);
    if (drift.clearedRisks.length) lines.push(`- Cleared: ${drift.clearedRisks.map((r) => r.title).join(", ")}`);
    if (drift.completedItems.length) lines.push(`- Completed: ${drift.completedItems.map((i) => i.key).join(", ")}`);
    if (drift.addedItems.length) lines.push(`- Added: ${drift.addedItems.map((i) => i.key).join(", ")}`);
    lines.push("");
  }

  lines.push(renderReleaseNotes(buildReleaseNotes(scope), scope).trimEnd());
  lines.push("");

  const explanation = explainScore(assessment);
  lines.push("## How this score was produced");
  lines.push("");
  explanation.lines.forEach((line) => lines.push(line));
  lines.push("");
  lines.push(`_${explanation.note}_`);
  lines.push("");
  lines.push(
    "_Narration: " +
      (narrative.provider === "llm"
        ? `LLM (${narrative.model}) — prose only, verdict untouched.`
        : `deterministic engine${narrative.fallbackUsed ? " (LLM call failed)" : ""}.`) +
      "_",
  );

  return lines.join("\n");
}
