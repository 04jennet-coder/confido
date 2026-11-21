#!/usr/bin/env node
import { createInterface } from "node:readline";
import { buildBundle } from "../app.js";
import { explainScore } from "../core/assess.js";
import { renderMarkdown } from "../core/render.js";
import { renderReleaseNotes } from "../core/releaseNotes.js";
import type { ReleaseScope, Severity } from "../core/types.js";
import { loadSample, isSamplePreset, SAMPLE_LABELS, type SamplePreset } from "../adapters/sample.js";
import { fetchJiraScope } from "../adapters/jira.js";

/**
 * Confido MCP server (stdio, JSON-RPC 2.0).
 *
 * Same engine, exposed as tools any MCP client can call — Claude Desktop, Cursor,
 * or the Atlassian Rovo MCP surface when this logic is packaged as a Forge app.
 * Read-only by design: every tool answers a question, none of them changes Jira.
 *
 *   node dist/mcp/server.js
 *   # claude_desktop_config.json → command: "node", args: ["…/dist/mcp/server.js"]
 */

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "confido", title: "Confido ship confidence", version: "0.1.0" };

const PRESET_SCHEMA = {
  type: "string",
  enum: Object.keys(SAMPLE_LABELS),
  description: "Sample release to assess when no live Jira project is supplied.",
  default: "payments",
};

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "assess_release",
    title: "Assess release readiness",
    description:
      "Score a Jira release (0-100) with an evidence-backed verdict. Every deduction is traceable to an issue key. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        preset: PRESET_SCHEMA,
        projectKey: { type: "string", description: "Jira project key, e.g. PAY. Requires JIRA_* credentials on the server." },
        fixVersion: { type: "string", description: "Fix version that defines the release scope." },
        sprint: { type: "string", description: "Sprint name, if the release is scoped by sprint." },
        jql: { type: "string", description: "Explicit JQL, overrides projectKey/fixVersion/sprint." },
        asOf: { type: "string", description: "ISO timestamp to evaluate at (defaults to now)." },
        ai: { type: "boolean", description: "Ask the configured LLM to write the narrative. Verdict is unaffected." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_risks",
    title: "List release risks",
    description: "The risk register for a release: each risk class with severity, penalty and the issue keys behind it.",
    inputSchema: {
      type: "object",
      properties: {
        preset: PRESET_SCHEMA,
        projectKey: { type: "string" },
        fixVersion: { type: "string" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low"], description: "Only return risks at this severity." },
        limit: { type: "number", description: "Maximum risks to return (default 10)." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "explain_score",
    title: "Explain the score",
    description: "Show the arithmetic behind the score: 100 minus each rule's capped penalty, with the issues cited.",
    inputSchema: {
      type: "object",
      properties: { preset: PRESET_SCHEMA, projectKey: { type: "string" }, fixVersion: { type: "string" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "draft_release_notes",
    title: "Draft release notes",
    description: "Release notes from completed issues only, grouped into breaking / new / fixed / improved.",
    inputSchema: {
      type: "object",
      properties: { preset: PRESET_SCHEMA, projectKey: { type: "string" }, fixVersion: { type: "string" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_brief",
    title: "Get the full ship-confidence brief",
    description: "The complete markdown brief: verdict, narrative, conditions, risk register and release notes.",
    inputSchema: {
      type: "object",
      properties: {
        preset: PRESET_SCHEMA,
        projectKey: { type: "string" },
        fixVersion: { type: "string" },
        format: { type: "string", enum: ["markdown", "json"], default: "markdown" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
];

interface ToolArgs {
  preset?: string;
  projectKey?: string;
  fixVersion?: string;
  sprint?: string;
  jql?: string;
  asOf?: string;
  ai?: boolean;
  severity?: string;
  limit?: number;
  format?: string;
}

async function scopeFor(args: ToolArgs): Promise<{ scope: ReleaseScope; source: string }> {
  if (args.jql || args.projectKey) {
    const scope = await fetchJiraScope({
      projectKey: args.projectKey ?? "PAY",
      fixVersion: args.fixVersion ?? null,
      sprint: args.sprint ?? null,
      jql: args.jql,
      asOf: args.asOf,
      releaseName: args.projectKey ? `${args.projectKey} ${args.fixVersion ?? "release"}` : undefined,
    });
    return { scope, source: "jira" };
  }
  const preset = (args.preset ?? "payments") as SamplePreset;
  if (!isSamplePreset(preset)) throw new Error(`Unknown preset "${preset}". Use one of: ${Object.keys(SAMPLE_LABELS).join(", ")}`);
  return { scope: await loadSample(preset), source: `sample:${preset}` };
}

async function callTool(name: string, args: ToolArgs): Promise<string> {
  switch (name) {
    case "assess_release": {
      const { scope, source } = await scopeFor(args);
      const bundle = await buildBundle(scope, { ai: args.ai === true, source });
      const a = bundle.assessment;
      const top = a.signals.slice(0, 4).map(
        (s) => `- ${s.severity.toUpperCase()} ${s.title} (−${s.penalty}): ${s.findings.slice(0, 4).map((f) => f.itemKey).join(", ")}`,
      );
      return [
        `# ${scope.release.name}`,
        `Score ${a.score}/100 — ${a.bandLabel} (data confidence ${Math.round(a.dataConfidence * 100)}%)`,
        `${a.counts.done}/${a.counts.total} done · ${a.counts.open} open · ${a.counts.blocked} blocked · ${a.counts.unassigned} unassigned`,
        "",
        bundle.narrative.text,
        "",
        top.length ? `Risks:\n${top.join("\n")}` : "No risk signals fired.",
      ].join("\n");
    }
    case "list_risks": {
      const { scope, source } = await scopeFor(args);
      const bundle = await buildBundle(scope, { ai: false, source });
      const limit = args.limit ?? 10;
      const severity = args.severity as Severity | undefined;
      const signals = bundle.assessment.signals.filter((s) => !severity || s.severity === severity).slice(0, limit);
      if (!signals.length) return `No ${severity ?? ""} risks fired for ${scope.release.name}.`;
      return signals
        .map((s) => {
          const lines = [`## ${s.severity.toUpperCase()} — ${s.title} (−${s.penalty})`];
          for (const f of s.findings.slice(0, 6)) {
            lines.push(`- ${f.itemKey} ${f.summary} — ${f.detail}${f.excerpt ? `\n  > ${f.excerpt}` : ""}`);
          }
          lines.push(`Action: ${s.recommendation}`);
          return lines.join("\n");
        })
        .join("\n\n");
    }
    case "explain_score": {
      const { scope, source } = await scopeFor(args);
      const bundle = await buildBundle(scope, { ai: false, source });
      const explanation = explainScore(bundle.assessment);
      return [`# Why ${bundle.assessment.score}/100`, ...explanation.lines, "", explanation.note].join("\n");
    }
    case "draft_release_notes": {
      const { scope, source } = await scopeFor(args);
      const bundle = await buildBundle(scope, { ai: false, source });
      return renderReleaseNotes(bundle.notes, scope);
    }
    case "get_brief": {
      const { scope, source } = await scopeFor(args);
      const bundle = await buildBundle(scope, { ai: args.ai === true, source });
      if (args.format === "json") return JSON.stringify(bundle, null, 2);
      return renderMarkdown(bundle.assessment, scope, bundle.narrative, bundle.drift);
    }
    default:
      throw new Error(`Unknown tool "${name}"`);
  }
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

export async function handleMessage(message: JsonRpcRequest): Promise<Record<string, unknown> | null> {
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: (params?.protocolVersion as string) ?? PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions:
              "Confido turns a Jira release into an evidence-backed ship-confidence brief. Start with assess_release, then list_risks or explain_score for detail. Read-only.",
          },
        };
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return isNotification ? null : { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      case "tools/call": {
        const name = String(params?.name ?? "");
        const args = (params?.arguments ?? {}) as ToolArgs;
        const text = await callTool(name, args);
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text }], isError: false },
        };
      }
      case "resources/list":
        return { jsonrpc: "2.0", id, result: { resources: [] } };
      case "prompts/list":
        return { jsonrpc: "2.0", id, result: { prompts: [] } };
      default:
        if (isNotification) return null;
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, error: { code: -32603, message: message2 } };
  }
}

export function startServer(): void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  process.stderr.write("confido MCP server ready (stdio)\n");

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: JsonRpcRequest;
    try {
      message = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const response = await handleMessage(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
}

const isMain = process.argv[1]?.endsWith("mcp/server.js") || process.env.CONFIDO_MCP === "1";
if (isMain) startServer();
