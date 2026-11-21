#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { buildBundle } from "./app.js";
import { renderMarkdown } from "./core/render.js";
import { loadSample, isSamplePreset, SAMPLE_LABELS, type SamplePreset } from "./adapters/sample.js";
import { csvToScope } from "./adapters/csv.js";
import { fetchJiraScope, loadJiraJson } from "./adapters/jira.js";
import { issuesToScope } from "./adapters/jiraMap.js";
import { readFile } from "node:fs/promises";
import type { ReleaseScope } from "./core/types.js";

/**
 * `confido` — the same assessment, one command.
 *
 *   confido                                   # sample release, deterministic
 *   confido --preset checkout                 # a healthy release
 *   confido --csv export.csv --out report.md  # your own Jira CSV export
 *   confido --project PAY --fix-version 3.4.0 # live Jira (needs JIRA_* env)
 */

function usage(): string {
  return `Confido — ship confidence briefs for Jira releases

Usage
  confido [options]

Source (pick one)
  --preset <name>        ${Object.keys(SAMPLE_LABELS).join(" | ")}
  --csv <file>           Jira "Export → CSV" file
  --jira-json <file>     Saved Jira search response (JSON)
  --project <KEY>        Live Jira project (needs JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN)
    --fix-version <v>    Fix version to scope the release
    --sprint <name>      Sprint name instead of, or with, a fix version
    --jql <query>        Explicit JQL (overrides the scoping flags)

Release metadata
  --as-of <iso>          Evaluation time (default: now)
  --cycle-start <iso>    Cycle start, used to detect scope added mid-cycle
  --name <text>          Release display name

Output
  --ai                   Ask an LLM to write the prose (needs ANTHROPIC_API_KEY or OPENAI_API_KEY)
  --json                 Print the full bundle as JSON
  --out <file>           Write the markdown brief to a file
  --quiet                Only print the score line
  --list                 List sample presets
  -h, --help
`;
}

interface Args {
  [key: string]: string | boolean | undefined;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("-")) continue;
    const name = token.replace(/^-+/, "");
    if (["ai", "json", "quiet", "list", "help"].includes(name)) {
      args[name] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("-")) {
      args[name] = next;
      i += 1;
    } else {
      args[name] = true;
    }
  }
  return args;
}

async function scopeFromArgs(args: Args): Promise<{ scope: ReleaseScope; source: string; baseline?: ReleaseScope }> {
  const asOf = typeof args["as-of"] === "string" ? args["as-of"] : undefined;
  const cycleStart = typeof args["cycle-start"] === "string" ? args["cycle-start"] : null;

  let baseline: ReleaseScope | undefined;
  if (typeof args.baseline === "string" && isSamplePreset(args.baseline)) {
    baseline = await loadSample(args.baseline);
  }

  if (typeof args.csv === "string") {
    const text = await readFile(args.csv, "utf8");
    return { scope: csvToScope(text, { asOf, cycleStart }), source: "csv", baseline };
  }

  if (typeof args["jira-json"] === "string") {
    const { issues } = await loadJiraJson(args["jira-json"]);
    const projectKey = (typeof args.project === "string" ? args.project : issues[0]?.key.split("-")[0]) ?? "PROJ";
    const scope = issuesToScope(issues, {
      name: typeof args.name === "string" ? args.name : `${projectKey} release`,
      projectKey,
      fixVersion: typeof args["fix-version"] === "string" ? args["fix-version"] : null,
      sprintName: typeof args.sprint === "string" ? args.sprint : null,
      startedAt: cycleStart,
      asOf: asOf ?? new Date().toISOString(),
    });
    return { scope, source: "jira-json", baseline };
  }

  if (typeof args.project === "string") {
    const scope = await fetchJiraScope({
      projectKey: args.project,
      fixVersion: typeof args["fix-version"] === "string" ? args["fix-version"] : null,
      sprint: typeof args.sprint === "string" ? args.sprint : null,
      jql: typeof args.jql === "string" ? args.jql : undefined,
      asOf,
      cycleStart,
      releaseName: typeof args.name === "string" ? args.name : undefined,
    });
    return { scope, source: "jira", baseline };
  }

  const preset = (typeof args.preset === "string" ? args.preset : "payments") as SamplePreset;
  if (!isSamplePreset(preset)) throw new Error(`Unknown preset "${preset}". Try --list.`);
  if (!baseline && preset === "payments") baseline = await loadSample("payments-baseline");
  return { scope: await loadSample(preset), source: `sample:${preset}`, baseline };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.list) {
    for (const [id, label] of Object.entries(SAMPLE_LABELS)) console.log(`${id.padEnd(20)} ${label}`);
    return;
  }

  const { scope, source, baseline } = await scopeFromArgs(args);
  const bundle = await buildBundle(scope, {
    ai: args.ai === true,
    source,
    baseline: baseline ? { scope: baseline } : undefined,
  });

  if (args.json) {
    console.log(JSON.stringify({ ...bundle, drift: bundle.drift }, null, 2));
    return;
  }

  const markdown = renderMarkdown(bundle.assessment, scope, bundle.narrative, bundle.drift);
  if (typeof args.out === "string") {
    await writeFile(args.out, markdown, "utf8");
    console.log(`Wrote ${args.out}`);
    if (args.quiet) console.log(`${bundle.assessment.score}/100 ${bundle.assessment.bandLabel}`);
    return;
  }

  if (args.quiet) {
    console.log(`${bundle.assessment.score}/100 ${bundle.assessment.bandLabel} — ${scope.release.name}`);
    return;
  }

  console.log(markdown);
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
