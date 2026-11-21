import { readFile } from "node:fs/promises";
import type { ReleaseScope } from "../core/types.js";
import { issuesToScope, buildJql, type JiraIssue } from "./jiraMap.js";

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

const FIELDS = [
  "summary",
  "description",
  "issuetype",
  "status",
  "priority",
  "assignee",
  "components",
  "labels",
  "created",
  "updated",
  "duedate",
  "resolutiondate",
  "fixVersions",
  "issuelinks",
  "comment",
  "customfield_10016",
  "customfield_10026",
  "story_points",
].join(",");

interface SearchResponse {
  issues?: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
  total?: number;
}

async function searchJql(
  config: JiraConfig,
  jql: string,
  limit: number,
): Promise<JiraIssue[]> {
  const auth = Buffer.from(`${config.email}:${config.token}`).toString("base64");
  const issues: JiraIssue[] = [];
  let token: string | undefined;
  let guard = 0;

  do {
    guard += 1;
    if (guard > 20) break;
    const params = new URLSearchParams({ jql, fields: FIELDS, maxResults: "100" });
    if (token) params.set("nextPageToken", token);

    const res = await fetch(`${config.baseUrl}/rest/api/3/search/jql?${params.toString()}`, {
      headers: { authorization: `Basic ${auth}`, accept: "application/json" },
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`Jira search failed (${res.status}). ${body}`);
    }

    const data = (await res.json()) as SearchResponse;
    issues.push(...(data.issues ?? []));
    token = data.isLast ? undefined : data.nextPageToken;
  } while (token && issues.length < limit);

  return issues.slice(0, limit);
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
  const issues = await searchJql(config, jql, options.limit ?? 400);

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
