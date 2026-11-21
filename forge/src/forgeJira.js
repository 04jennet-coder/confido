import { requestJira } from "@forge/api";

/**
 * Forge-side Jira access.
 *
 * `requestJira` runs as the installing user, so the app can only ever read what
 * that person can already see — no service account, no elevated access.
 */

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

export async function searchIssues(jql, limit = 400) {
  const issues = [];
  let token;
  let guard = 0;

  do {
    guard += 1;
    if (guard > 20) break;
    const params = new URLSearchParams({ jql, fields: FIELDS, maxResults: "100" });
    if (token) params.set("nextPageToken", token);

    const response = await requestJira(`/rest/api/3/search/jql?${params.toString()}`);
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      throw new Error(`Jira search failed (${response.status}). ${body}`);
    }
    const data = await response.json();
    issues.push(...(data.issues ?? []));
    token = data.isLast ? undefined : data.nextPageToken;
  } while (token && issues.length < limit);

  return issues.slice(0, limit);
}
