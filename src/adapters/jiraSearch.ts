import type { JiraIssue } from "./jiraMap.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
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

type SearchPage = {
  issues?: JiraIssue[];
  nextPageToken?: string;
  isLast?: boolean;
};

export async function searchJiraIssues(
  jql: string,
  requestPage: (params: URLSearchParams) => Promise<Response>,
  limit = MAX_PAGES * PAGE_SIZE,
): Promise<JiraIssue[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("The Jira issue limit must be a positive integer.");
  }

  const issues: JiraIssue[] = [];
  const seenTokens = new Set<string>();
  let token: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ jql, fields: FIELDS, maxResults: String(PAGE_SIZE) });
    if (token) params.set("nextPageToken", token);

    const response = await requestPage(params);
    if (!response.ok) {
      throw new Error(`Jira search failed (${response.status}). No verdict was computed.`);
    }

    const data = (await response.json()) as SearchPage | null;
    if (!Array.isArray(data?.issues)) break;

    issues.push(...data.issues);
    if (issues.length > limit) break;
    if (data.isLast === true && !data.nextPageToken) return issues;

    token = data.nextPageToken;
    if (issues.length === limit || data.isLast === true || typeof token !== "string" || !token || seenTokens.has(token)) break;
    seenTokens.add(token);
  }

  throw new Error("Jira search did not return a complete release scope. No verdict was computed. Narrow the project, fix version, or JQL and try again.");
}
