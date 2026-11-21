import api, { route } from "@forge/api";
import { searchJiraIssues } from "./lib/adapters/jiraSearch.js";

export function searchIssues(jql) {
  return searchJiraIssues(jql, (params) =>
    api.asUser().requestJira(route`/rest/api/3/search/jql?${params}`, {
      headers: { Accept: "application/json" },
    }),
  );
}
