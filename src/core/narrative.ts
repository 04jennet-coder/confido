import type { Assessment, Narrative, ReleaseScope } from "./types.js";
import { generateNarrative, llmConfig, type LlmStatus } from "./llm.js";
import { plural, truncate } from "./util.js";

/**
 * Turns the deterministic assessment into the brief a person reads.
 * Deterministic by default; the model only rewrites the prose when configured.
 */

const SYSTEM_PROMPT = `You are a release analyst writing a short ship-confidence brief for an engineering manager.

Hard rules:
- You are given verified facts computed from Jira. Do not add facts, dates, people, or ticket numbers that are not in the input.
- Do not change the verdict or the score. They are read-only.
- Cite issue keys exactly as given, in backticks.
- If "dataConfidence" is below 0.6, say plainly that the data is thin.
- No praise, no filler, no em dashes at the start of a sentence.

Format (markdown, 200 words maximum):
## What is true now
Two or three sentences with the numbers that matter.
## What would break the release date
Up to three bullets, each ending with the issue key(s) in backticks.
## Do this week
Up to three imperative bullets.
## What to tell stakeholders
One short paragraph in plain language, no jargon.`;

function factsForModel(assessment: Assessment, scope: ReleaseScope): string {
  const facts = {
    release: {
      name: scope.release.name,
      project: scope.release.projectKey,
      fixVersion: scope.release.fixVersion,
      asOf: scope.release.asOf,
      cycleStart: scope.release.startedAt,
    },
    verdict: { score: assessment.score, band: assessment.bandLabel },
    counts: assessment.counts,
    dataConfidence: assessment.dataConfidence,
    conditions: assessment.conditions,
    nextActions: assessment.nextActions,
    signals: assessment.signals.map((s) => ({
      title: s.title,
      severity: s.severity,
      penalty: s.penalty,
      findings: s.findings.slice(0, 4).map((f) => ({
        key: f.itemKey,
        summary: truncate(f.summary, 90),
        detail: f.detail,
        excerpt: f.excerpt ? truncate(f.excerpt, 140) : undefined,
      })),
    })),
  };
  return JSON.stringify(facts, null, 2);
}

/** The no-model brief. This is what ships in the demo and in the tests. */
export function deterministicNarrative(assessment: Assessment, scope: ReleaseScope): string {
  const { counts, score, bandLabel } = assessment;
  const open = assessment.signals.reduce((sum, s) => sum + s.findings.length, 0);

  const lines: string[] = [];
  lines.push("## What is true now");
  lines.push(
    `${score}/100 — **${bandLabel}**. ${counts.done} of ${counts.total} items are done; ${counts.open} are open, ${counts.blocked} of them blocked and ${counts.unassigned} without an owner.`,
  );
  if (assessment.dataConfidence < 0.6) {
    lines.push(
      `Data coverage is ${Math.round(assessment.dataConfidence * 100)}%, so the score is a floor rather than a comfort.`,
    );
  }

  lines.push("");
  lines.push("## What would break the release date");
  const breakers = assessment.signals.filter((s) => s.severity === "critical" || s.severity === "high").slice(0, 3);
  if (breakers.length === 0) {
    lines.push("- Nothing in the current data is release-stopping.");
  } else {
    for (const signal of breakers) {
      const lead = signal.findings[0];
      const keys = signal.findings.slice(0, 3).map((f) => `\`${f.itemKey}\``).join(", ");
      const capped =
        Math.round(signal.penalty / signal.weight) < signal.findings.length
          ? ` (${Math.round(signal.penalty / signal.weight)} of ${signal.findings.length} counted)`
          : "";
      lines.push(
        `- ${signal.title} — ${signal.findings.length} ${plural(signal.findings.length, "ticket")}${capped}: ${keys}.${lead?.excerpt ? ` Latest evidence: “${truncate(lead.excerpt, 110)}”` : ""}`,
      );
    }
  }

  lines.push("");
  lines.push("## Do this week");
  for (const action of assessment.nextActions.slice(0, 3)) lines.push(`- ${action}`);

  lines.push("");
  lines.push("## What to tell stakeholders");
  lines.push(
    counts.open === 0
      ? `${scope.release.name} is complete in Jira. Nothing in the data blocks the cut, so the message is a ship date, not a risk update.`
      : `${scope.release.name} is not ready to announce as finished: ${open} risk ${open === 1 ? "finding" : "findings"} across ${counts.open} open items, concentrated in ${assessment.signals
          .filter((s) => s.severity === "critical" || s.severity === "high")
          .slice(0, 2)
          .map((s) => s.title.toLowerCase())
          .join(" and ") || "open scope"}. The conditions in this brief are what changes the verdict — not more status updates.`,
  );

  return lines.join("\n");
}

export async function buildNarrative(
  assessment: Assessment,
  scope: ReleaseScope,
  options: { ai: boolean },
): Promise<Narrative> {
  if (!options.ai || !llmConfig()) {
    return {
      provider: "deterministic",
      model: null,
      text: deterministicNarrative(assessment, scope),
      fallbackUsed: false,
      note: options.ai
        ? "No LLM key configured; using the engine's own brief."
        : "Deterministic brief (LLM narration off).",
    };
  }

  try {
    const result = await generateNarrative(SYSTEM_PROMPT, factsForModel(assessment, scope));
    return { provider: "llm", model: result.model, text: result.text, fallbackUsed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider: "deterministic",
      model: null,
      text: deterministicNarrative(assessment, scope),
      fallbackUsed: true,
      note: `LLM call failed (${truncate(message, 160)}); deterministic brief used instead.`,
    };
  }
}

export function status(): LlmStatus {
  return {
    enabled: Boolean(llmConfig()),
    provider: llmConfig()?.provider ?? null,
    model: llmConfig()?.model ?? null,
    reason: llmConfig()
      ? "LLM narration enabled — verdict still computed deterministically."
      : "No API key configured — the engine writes its own brief. Everything works; nothing is invented.",
  };
}
