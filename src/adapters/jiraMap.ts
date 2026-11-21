import type { Priority, ReleaseScope, StatusCategory, WorkItem } from "../core/types.js";

/**
 * Jira payload → Confido model.
 *
 * Kept free of I/O so the same mapping is used by the Node adapter (REST over
 * fetch), the Forge app (requestJira) and the tests (fixtures). If the mapping is
 * wrong, every surface is wrong in the same way — which is why it has its own test.
 */

export interface JiraIssueFields {
  summary?: string;
  description?: unknown;
  issuetype?: { name?: string };
  status?: { name?: string; statusCategory?: { key?: string } };
  priority?: { name?: string; id?: string };
  assignee?: { displayName?: string } | null;
  components?: { name?: string }[];
  labels?: string[];
  created?: string;
  updated?: string;
  duedate?: string | null;
  resolutiondate?: string | null;
  fixVersions?: { name?: string }[];
  issuelinks?: {
    type?: { name?: string; inward?: string; outward?: string };
    inwardIssue?: { key?: string; fields?: { status?: { statusCategory?: { key?: string } } } };
    outwardIssue?: { key?: string; fields?: { status?: { statusCategory?: { key?: string } } } };
  }[];
  comment?: { comments?: { author?: { displayName?: string }; created?: string; body?: unknown }[] };
  story_points?: number | null;
  customfield_10016?: number | null;
  customfield_10026?: number | null;
}

export interface JiraIssue {
  key: string;
  fields: JiraIssueFields;
  /** Present on Jira REST search responses. */
  self?: string;
}

/** Atlassian Document Format → plain text. Bullets become lines, code inline kept. */
export function adfToText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join("");
  if (typeof node !== "object") return "";

  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: Record<string, unknown> };
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  if (n.type === "mention") return `@${String(n.attrs?.text ?? "someone")}`;
  if (n.type === "emoji") return String(n.attrs?.text ?? "");
  if (n.type === "codeBlock") return `\n${(n.content ?? []).map(adfToText).join("")}\n`;
  if (n.type === "bulletList" || n.type === "orderedList") {
    return (n.content ?? []).map((child) => `- ${adfToText(child).trim()}`).join("\n");
  }
  if (n.type === "listItem" || n.type === "paragraph" || n.type === "heading") {
    const text = (n.content ?? []).map(adfToText).join("");
    return n.type === "paragraph" || n.type === "heading" ? `${text}\n` : text;
  }
  return (n.content ?? []).map(adfToText).join("");
}

function statusCategory(key: string | undefined, name: string | undefined): StatusCategory {
  if (key === "done") return "done";
  if (key === "indeterminate") return "in_progress";
  if (key === "new") return "todo";
  const text = (name ?? "").toLowerCase();
  if (/done|closed|resolved|complete|완료|종료/.test(text)) return "done";
  if (/progress|review|testing|blocked|진행|검토/.test(text)) return "in_progress";
  if (text) return "todo";
  return "unknown";
}

const PRIORITIES: Record<string, Priority> = {
  highest: "Highest",
  blocker: "Highest",
  critical: "Highest",
  high: "High",
  major: "High",
  medium: "Medium",
  normal: "Medium",
  low: "Low",
  minor: "Low",
  lowest: "Lowest",
  trivial: "Lowest",
};

const PRIORITY_BY_ID: Record<string, Priority> = {
  "1": "Highest",
  "2": "High",
  "3": "Medium",
  "4": "Low",
  "5": "Lowest",
};

export function mapPriority(priority: { name?: string; id?: string } | undefined): Priority {
  if (!priority) return "Unknown";
  const byName = PRIORITIES[(priority.name ?? "").toLowerCase()];
  if (byName) return byName;
  if (priority.id && PRIORITY_BY_ID[priority.id]) return PRIORITY_BY_ID[priority.id];
  return "Unknown";
}

export function mapIssue(issue: JiraIssue, storyPointsField = "story_points"): WorkItem {
  const f = issue.fields ?? {};
  const description = adfToText(f.description).trim();
  const comments = (f.comment?.comments ?? []).map((comment) => ({
    author: comment.author?.displayName ?? "Unknown",
    created: comment.created ?? f.updated ?? "",
    body: adfToText(comment.body).trim(),
  }));

  const links = (f.issuelinks ?? []).flatMap((link) => {
    const out: WorkItem["links"] = [];
    if (link.inwardIssue?.key) {
      out.push({
        type: link.type?.inward ?? "is linked to",
        key: link.inwardIssue.key,
        statusCategory: statusCategory(link.inwardIssue.fields?.status?.statusCategory?.key, undefined),
      });
    }
    if (link.outwardIssue?.key) {
      out.push({
        type: link.type?.outward ?? "links to",
        key: link.outwardIssue.key,
        statusCategory: statusCategory(link.outwardIssue.fields?.status?.statusCategory?.key, undefined),
      });
    }
    return out;
  });

  const points =
    (f as Record<string, unknown>)[storyPointsField] ??
    f.story_points ??
    f.customfield_10016 ??
    f.customfield_10026 ??
    null;

  return {
    key: issue.key,
    summary: f.summary ?? "(no summary)",
    type: f.issuetype?.name ?? "Task",
    status: f.status?.name ?? "Unknown",
    statusCategory: statusCategory(f.status?.statusCategory?.key, f.status?.name),
    priority: mapPriority(f.priority),
    assignee: f.assignee?.displayName ?? null,
    components: (f.components ?? []).map((c) => c.name ?? "").filter(Boolean),
    labels: f.labels ?? [],
    created: f.created ?? "",
    updated: f.updated ?? "",
    dueDate: f.duedate ?? null,
    resolved: f.resolutiondate ?? null,
    storyPoints: typeof points === "number" ? points : points === null ? null : Number(points) || null,
    fixVersions: (f.fixVersions ?? []).map((v) => v.name ?? "").filter(Boolean),
    links,
    description,
    comments,
  };
}

export function buildJql(projectKey: string, fixVersion?: string | null, sprint?: string | null): string {
  const parts = [`project = "${projectKey}"`];
  if (fixVersion) parts.push(`fixVersion = "${fixVersion}"`);
  if (sprint) parts.push(`sprint = "${sprint}"`);
  return `${parts.join(" AND ")} ORDER BY priority DESC, updated ASC`;
}

export function issuesToScope(
  issues: JiraIssue[],
  release: ReleaseScope["release"],
  storyPointsField?: string,
): ReleaseScope {
  return { release, items: issues.map((issue) => mapIssue(issue, storyPointsField)) };
}
