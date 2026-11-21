import { assess } from "./lib/core/assess.js";
import { buildNarrative } from "./lib/core/narrative.js";
import { buildReleaseNotes, renderReleaseNotes } from "./lib/core/releaseNotes.js";
import { renderMarkdown } from "./lib/core/render.js";
import { emptyDrift } from "./lib/core/drift.js";
import { buildJql, issuesToScope } from "./lib/adapters/jiraMap.js";
import { searchIssues } from "./forgeJira.js";

/**
 * Shared composition for every Forge surface (agent actions and MCP tools).
 * The engine is the same code the web app and CLI run; only the data source and
 * the output formatting change.
 */

function releaseName(payload, issues) {
  if (payload.projectKey) return `${payload.projectKey} ${payload.fixVersion ?? "release"}`;
  const prefix = issues[0]?.key?.split("-")[0];
  return prefix ? `${prefix} release` : "Jira release";
}

async function loadScope(payload) {
  const jql =
    payload.jql ||
    (payload.projectKey ? buildJql(payload.projectKey, payload.fixVersion ?? null, payload.sprint ?? null) : null);

  if (!jql) {
    throw new Error(
      "I need a project key (for example PAY) or a JQL query to know which release to assess. Ask the user for one, then call again.",
    );
  }

  const issues = await searchIssues(jql);
  if (!issues.length) {
    throw new Error(
      `No issues matched ${jql}. Check the project key and fix version, or pass an explicit JQL query. Nothing was scored.`,
    );
  }

  return issuesToScope(issues, {
    name: releaseName(payload, issues),
    projectKey: payload.projectKey ?? issues[0].key.split("-")[0],
    fixVersion: payload.fixVersion ?? null,
    sprintName: payload.sprint ?? null,
    startedAt: payload.cycleStart ?? null,
    asOf: payload.asOf ?? new Date().toISOString(),
  });
}

export async function assessPayload(payload = {}) {
  const scope = await loadScope(payload);
  const assessment = assess(scope, "jira");
  const narrative = await buildNarrative(assessment, scope, { ai: false });
  return { scope, assessment, narrative };
}

export function summaryText(scope, assessment, narrative) {
  const top = assessment.signals.slice(0, 4).map((signal) => {
    const keys = signal.findings.slice(0, 4).map((f) => f.itemKey);
    return `- ${signal.severity.toUpperCase()} ${signal.title} (−${signal.penalty}): ${keys.join(", ")}`;
  });
  return [
    `# ${scope.release.name}`,
    `Score ${assessment.score}/100 — ${assessment.bandLabel} (data confidence ${Math.round(assessment.dataConfidence * 100)}%)`,
    `${assessment.counts.done}/${assessment.counts.total} done · ${assessment.counts.open} open · ${assessment.counts.blocked} blocked · ${assessment.counts.unassigned} unassigned`,
    "",
    narrative.text,
    "",
    top.length ? `Risks:\n${top.join("\n")}` : "No risk signals fired.",
    "",
    top.length ? "This verdict is computed from Jira fields and links only; the prose may be rewritten, the verdict may not." : "",
  ].join("\n");
}

/* ------------------------------------------------------------------ actions */

export async function assessRelease(payload) {
  const { scope, assessment, narrative } = await assessPayload(payload);
  return summaryText(scope, assessment, narrative);
}

export async function listRisks(payload = {}) {
  const { scope, assessment } = await assessPayload(payload);
  const limit = Number(payload.limit ?? 10) || 10;
  const severity = payload.severity ? String(payload.severity).toLowerCase() : null;
  const signals = assessment.signals.filter((s) => !severity || s.severity === severity).slice(0, limit);
  if (!signals.length) return `No ${severity ?? ""} risks fired for ${scope.release.name}.`.replace("  ", " ");

  return signals
    .map((signal) => {
      const lines = [`## ${signal.severity.toUpperCase()} — ${signal.title} (−${signal.penalty})`];
      for (const finding of signal.findings.slice(0, 6)) {
        lines.push(`- ${finding.itemKey} ${finding.summary} — ${finding.detail}`);
        if (finding.excerpt) lines.push(`  > ${finding.excerpt}`);
      }
      lines.push(`Action: ${signal.recommendation}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export async function explainScore(payload = {}) {
  const { assessment } = await assessPayload(payload);
  const penalty = assessment.signals.reduce((sum, s) => sum + s.penalty, 0);
  const rows = assessment.signals.map((signal) => {
    const counted = Math.round(signal.penalty / signal.weight);
    const cap = counted < signal.findings.length ? `, capped from ${signal.findings.length}` : "";
    return `- ${signal.title}: ${signal.penalty} points (${counted} × ${signal.weight}${cap}) — ${signal.findings
      .slice(0, 4)
      .map((f) => f.itemKey)
      .join(", ")}`;
  });
  return [`# Why ${assessment.score}/100`, `100 − ${penalty} = ${assessment.score}`, ...rows, "", "No model contributes to this arithmetic."].join(
    "\n",
  );
}

export async function draftReleaseNotes(payload = {}) {
  const { scope } = await assessPayload(payload);
  return renderReleaseNotes(buildReleaseNotes(scope), scope);
}

export async function getBrief(payload = {}) {
  const { scope, assessment, narrative } = await assessPayload(payload);
  if (String(payload.format ?? "markdown").toLowerCase() === "json") {
    return JSON.stringify({ assessment, narrative }, null, 2);
  }
  return renderMarkdown(assessment, scope, narrative, emptyDrift());
}
