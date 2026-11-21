import { readFile } from "node:fs/promises";
import type { ReleaseScope } from "../core/types.js";
import { issuesToScope, buildJql, type JiraIssue } from "./jiraMap.js";
import { searchJiraIssues } from "./jiraSearch.js";

/**
 * Jira Cloud REST adapter (Node).
 *
 * Credentials come from the environment only — never from the repo:
 *   JIRA_BASE_URL=https://your-team.atlassian.net
 *   JIRA_EMAIL=you@example.com
 *   JIRA_API_TOKEN=…            (id.atlassian.com → Security → API tokens)
 *
 * The Forge variant of this app uses `requestJira` instead of fetch and shares
 * the same mapping, so both surfaces produce identical assessments.
 */

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
}

export function jiraConfigFromEnv(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) return null;
  return { baseUrl, email, token };
}

interface SearchResponse {
  issues?: JiraIssue[];
  total?: number;
}

export interface FetchOptions {
  projectKey: string;
  fixVersion?: string | null;
  sprint?: string | null;
  jql?: string;
  asOf?: string;
  releaseName?: string;
  cycleStart?: string | null;
  storyPointsField?: string;
  limit?: number;
}

export async function fetchJiraScope(options: FetchOptions, config = jiraConfigFromEnv()): Promise<ReleaseScope> {
  if (!config) {
    throw new Error(
      "Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN, or use the sample release / a CSV export instead.",
    );
  }
  const jql = options.jql ?? buildJql(options.projectKey, options.fixVersion, options.sprint);
  const auth = Buffer.from(`${config.email}:${config.token}`).toString("base64");
  const issues = await searchJiraIssues(
    jql,
    (params) => fetch(`${config.baseUrl}/rest/api/3/search/jql?${params}`, {
      headers: { authorization: `Basic ${auth}`, accept: "application/json" },
    }),
    options.limit,
  );

  return issuesToScope(
    issues,
    {
      name: options.releaseName ?? `${options.projectKey} ${options.fixVersion ?? "(all)"}`,
      projectKey: options.projectKey,
      fixVersion: options.fixVersion ?? null,
      sprintName: options.sprint ?? null,
      startedAt: options.cycleStart ?? null,
      asOf: options.asOf ?? new Date().toISOString(),
      sourceUrl: `${config.baseUrl}/projects/${options.projectKey}`,
    },
    options.storyPointsField,
  );
}

/** Offline path: a saved Jira search response (useful for demos and fixtures). */
export async function loadJiraJson(path: string): Promise<{ issues: JiraIssue[]; total?: number }> {
  const raw = JSON.parse(await readFile(path, "utf8")) as SearchResponse | JiraIssue[];
  if (Array.isArray(raw)) return { issues: raw };
  return { issues: raw.issues ?? [], total: raw.total };
}
