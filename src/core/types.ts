/**
 * Confido core data model.
 *
 * The engine never talks to Jira directly. Adapters normalise whatever they read
 * (Forge/Jira REST, a Jira CSV export, or the bundled sample release) into a
 * `ReleaseScope`, and every downstream stage — signals, scoring, briefs, MCP
 * tools, the web UI — works from this single shape.
 */

export type StatusCategory = "todo" | "in_progress" | "done" | "unknown";

export type Priority = "Highest" | "High" | "Medium" | "Low" | "Lowest" | "Unknown";

export interface IssueLink {
  /** Jira link type as written on the source issue, e.g. "is blocked by". */
  type: string;
  /** Key of the issue on the other end of the link. */
  key: string;
  /** Optional status of the other end, when the adapter knows it. */
  statusCategory?: StatusCategory;
}

export interface Comment {
  author: string;
  created: string;
  body: string;
}

export interface WorkItem {
  key: string;
  summary: string;
  /** Raw type name: Story, Bug, Task, Sub-task, Epic, Spike… */
  type: string;
  /** Raw status name, e.g. "In Review". */
  status: string;
  statusCategory: StatusCategory;
  priority: Priority;
  assignee: string | null;
  components: string[];
  labels: string[];
  created: string;
  updated: string;
  dueDate: string | null;
  resolved: string | null;
  storyPoints: number | null;
  fixVersions: string[];
  links: IssueLink[];
  description: string;
  comments: Comment[];
}

export interface ReleaseMeta {
  /** Display name, e.g. "Payments 3.4.0". */
  name: string;
  projectKey: string;
  fixVersion: string | null;
  sprintName: string | null;
  /** Cycle start; anything created after it counts as scope added mid-cycle. */
  startedAt: string | null;
  /** Evaluation instant. Every date comparison is made against this. */
  asOf: string;
  /** Optional link back to the Jira release page, used in citations. */
  sourceUrl?: string | null;
}

export interface ReleaseScope {
  release: ReleaseMeta;
  items: WorkItem[];
}

export type Severity = "critical" | "high" | "medium" | "low";

/** A single piece of evidence, always tied to an issue key the reader can open. */
export interface Finding {
  itemKey: string;
  summary: string;
  /** Which fact produced the finding, e.g. "updated 9d ago", "no assignee". */
  detail: string;
  /** Optional verbatim excerpt (usually a comment) that supports the finding. */
  excerpt?: string;
}

export interface Signal {
  /** Stable rule id, e.g. "open-blockers". */
  id: string;
  title: string;
  severity: Severity;
  /** Penalty applied per matched item (capped; see scoring.ts). */
  weight: number;
  findings: Finding[];
  /** Penalty actually applied to the score. */
  penalty: number;
  recommendation: string;
  /** Plain-language explanation of the rule, shown in the "why" panel. */
  rule: string;
}

export interface Driver {
  id: string;
  title: string;
  severity: Severity;
  penalty: number;
  count: number;
}

export type Band = "go" | "conditional" | "at_risk" | "no_go";

export interface Assessment {
  release: ReleaseMeta;
  score: number;
  band: Band;
  bandLabel: string;
  /** How complete the underlying data is (0-1); low values widen uncertainty. */
  dataConfidence: number;
  counts: {
    total: number;
    done: number;
    open: number;
    blocked: number;
    unassigned: number;
    critical: number;
  };
  signals: Signal[];
  drivers: Driver[];
  /** Conditions that must be met before shipping, derived from critical/high signals. */
  conditions: string[];
  /** Ordered next actions for the release owner. */
  nextActions: string[];
  /** Deterministic executive summary; replaced by the LLM narrative when enabled. */
  summary: string;
  generatedAt: string;
  engine: { name: string; version: string; deterministic: true };
  /** Which adapter fed this assessment ("sample", "jira", "csv" …). */
  source: string;
}

export interface Narrative {
  /** "llm" when a model wrote it, "deterministic" when the engine did. */
  provider: "llm" | "deterministic";
  model: string | null;
  text: string;
  /** True when an LLM was attempted but failed and we fell back. */
  fallbackUsed: boolean;
  note?: string;
}

export interface ReleaseNoteSection {
  title: string;
  items: { key: string; summary: string; type: string }[];
}

export interface DriftReport {
  available: boolean;
  previousScore: number | null;
  scoreDelta: number | null;
  direction: "improved" | "worsened" | "flat" | "unknown";
  newRisks: { id: string; title: string; severity: Severity }[];
  clearedRisks: { id: string; title: string; severity: Severity }[];
  addedItems: { key: string; summary: string; type: string }[];
  completedItems: { key: string; summary: string; type: string }[];
  headline: string;
}
