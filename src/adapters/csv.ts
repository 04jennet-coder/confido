import type { Priority, ReleaseScope, StatusCategory, WorkItem } from "../core/types.js";

/**
 * CSV path: "Issues → Export → CSV (all fields)" from Jira, or any spreadsheet
 * with the columns below. This is how a team can try Confido without handing
 * over API tokens.
 */

/** RFC 4180-ish parser: quotes, escaped quotes, CRLF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function pick(row: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value && value.trim() !== "") return value.trim();
  }
  return "";
}

const STATUS_MAP: Record<string, StatusCategory> = {
  "to do": "todo",
  "in progress": "in_progress",
  "in review": "in_progress",
  done: "done",
  closed: "done",
  resolved: "done",
  reopened: "todo",
  blocked: "in_progress",
};

function statusFrom(text: string, explicit?: string): StatusCategory {
  const given = (explicit ?? "").toLowerCase().trim();
  if (given === "done") return "done";
  if (given === "in progress" || given === "indeterminate") return "in_progress";
  if (given === "to do" || given === "new") return "todo";
  return STATUS_MAP[text.toLowerCase().trim()] ?? "unknown";
}

const PRIORITY_MAP: Record<string, Priority> = {
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

function splitList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export interface CsvScopeOptions {
  name?: string;
  projectKey?: string;
  fixVersion?: string | null;
  asOf?: string;
  cycleStart?: string | null;
}

/**
 * Expected headers (case-insensitive, common aliases accepted):
 * Issue key, Issue Type, Summary, Status, Status Category, Priority, Assignee,
 * Created, Updated, Due date, Resolved, Labels, Components, Story Points,
 * Fix versions, Description, Comment, Blocked by.
 */
export function csvToScope(csvText: string, options: CsvScopeOptions = {}): ReleaseScope {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error("CSV needs a header row and at least one issue.");

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const keyIndex = headers.findIndex((h) => /^(issue key|key|issue)$/.test(h));
  if (keyIndex === -1) {
    throw new Error(`CSV has no issue key column. Found: ${rows[0].join(" | ")}`);
  }

  const items: WorkItem[] = rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    const status = pick(row, ["status", "status name"]);
    const key = cells[keyIndex].trim();
    const updated = pick(row, ["updated"]);
    const created = pick(row, ["created"]);
    const comment = pick(row, ["comment", "comments", "last comment"]);

    return {
      key,
      summary: pick(row, ["summary", "title"]),
      type: pick(row, ["issue type", "type", "issue type name"]) || "Task",
      status,
      statusCategory: statusFrom(status, pick(row, ["status category"])),
      priority: PRIORITY_MAP[pick(row, ["priority", "priority name"]).toLowerCase()] ?? "Unknown",
      assignee: pick(row, ["assignee", "assignee name"]) || null,
      components: splitList(pick(row, ["components", "component/s", "component"])),
      labels: splitList(pick(row, ["labels", "label"])),
      created,
      updated: updated || created,
      dueDate: pick(row, ["due date", "duedate"]) || null,
      resolved: pick(row, ["resolved", "resolution date"]) || null,
      storyPoints: (() => {
        const raw = pick(row, ["story points", "story point estimate", "points"]);
        const value = Number(raw);
        return raw && !Number.isNaN(value) ? value : null;
      })(),
      fixVersions: splitList(pick(row, ["fix versions", "fix version/s", "fix version"])),
      links: splitList(pick(row, ["blocked by", "is blocked by"])).map((k) => ({
        type: "is blocked by",
        key: k,
      })),
      description: pick(row, ["description", "summary description"]),
      comments: comment ? [{ author: "CSV import", created: updated || created || options.asOf || "", body: comment }] : [],
    };
  });

  const projectKey = options.projectKey ?? items[0]?.key.split("-")[0] ?? "PROJ";
  const firstFixVersion = items.flatMap((i) => i.fixVersions)[0] ?? null;

  return {
    release: {
      name: options.name ?? `${projectKey} ${options.fixVersion ?? firstFixVersion ?? "release"}`,
      projectKey,
      fixVersion: options.fixVersion ?? firstFixVersion,
      sprintName: null,
      startedAt: options.cycleStart ?? null,
      asOf: options.asOf ?? new Date().toISOString(),
    },
    items,
  };
}
