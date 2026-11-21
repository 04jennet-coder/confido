import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle } from "./app.js";
import { assess } from "./core/assess.js";
import { renderMarkdown } from "./core/render.js";
import type { ReleaseScope } from "./core/types.js";
import { loadSample, isSamplePreset, SAMPLE_LABELS, type SamplePreset } from "./adapters/sample.js";
import { csvToScope } from "./adapters/csv.js";

/**
 * Zero-dependency HTTP server. It serves the web client and exposes the same
 * assessment pipeline over JSON, so the UI, the CLI and any script share one code
 * path. Intended for local use and for a demo deploy (no auth, no persistence).
 */

const WEB_ROOT = fileURLToPath(new URL("../web/", import.meta.url));
const MAX_BODY = 2 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

interface AssessRequest {
  preset?: string;
  scope?: ReleaseScope;
  csv?: string;
  baselinePreset?: string;
  baselineScope?: ReleaseScope;
  ai?: boolean;
  source?: string;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Request body too large (2 MB limit).");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = "application/json; charset=utf-8"): void {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  send(res, status, JSON.stringify(payload));
}

async function resolveScope(body: AssessRequest): Promise<{ scope: ReleaseScope; source: string }> {
  if (body.scope) return { scope: body.scope, source: body.source ?? "custom" };
  if (body.csv) return { scope: csvToScope(body.csv, { asOf: new Date().toISOString() }), source: "csv" };
  const preset = (body.preset ?? "payments") as SamplePreset;
  if (!isSamplePreset(preset)) {
    throw new Error(`Unknown preset "${preset}". Available: ${Object.keys(SAMPLE_LABELS).join(", ")}`);
  }
  return { scope: await loadSample(preset), source: `sample:${preset}` };
}

async function resolveBaseline(body: AssessRequest): Promise<ReleaseScope | undefined> {
  if (body.baselineScope) return body.baselineScope;
  const preset = body.baselinePreset ?? (body.preset === undefined || body.preset === "payments" ? "payments-baseline" : undefined);
  if (!preset || !isSamplePreset(preset)) return undefined;
  try {
    return await loadSample(preset);
  } catch {
    return undefined;
  }
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = resolve(join(WEB_ROOT, normalize(relative)));
  if (!target.startsWith(resolve(WEB_ROOT))) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  try {
    const file = await readFile(target);
    send(res, 200, file, MIME[extname(target)] ?? "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

export function createAppServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/api/health") {
        sendJson(res, 200, { ok: true, engine: "confido", time: new Date().toISOString() });
        return;
      }

      if (req.method === "GET" && path === "/api/samples") {
        sendJson(
          res,
          200,
          Object.entries(SAMPLE_LABELS).map(([id, label]) => ({ id, label })),
        );
        return;
      }

      if (req.method === "GET" && path.startsWith("/api/sample/")) {
        const preset = path.slice("/api/sample/".length);
        if (!isSamplePreset(preset)) {
          sendJson(res, 404, { error: "Unknown sample preset" });
          return;
        }
        sendJson(res, 200, await loadSample(preset));
        return;
      }

      if (req.method === "POST" && path === "/api/assess") {
        const body = (await readJson(req)) as AssessRequest;
        const { scope, source } = await resolveScope(body);
        const baseline = await resolveBaseline(body);
        const bundle = await buildBundle(scope, {
          ai: body.ai === true,
          source,
          baseline: baseline ? { scope: baseline } : undefined,
        });
        sendJson(res, 200, bundle);
        return;
      }

      if (req.method === "POST" && path === "/api/report") {
        const body = (await readJson(req)) as AssessRequest;
        const { scope, source } = await resolveScope(body);
        const baseline = await resolveBaseline(body);
        const bundle = await buildBundle(scope, {
          ai: body.ai === true,
          source,
          baseline: baseline ? { scope: baseline } : undefined,
        });
        const markdown = renderMarkdown(bundle.assessment, scope, bundle.narrative, bundle.drift);
        send(res, 200, markdown, "text/markdown; charset=utf-8");
        return;
      }

      if (req.method === "POST" && path === "/api/csv") {
        const body = (await readJson(req)) as { csv?: string; asOf?: string; cycleStart?: string };
        if (!body.csv) {
          sendJson(res, 400, { error: "Send { csv: \"…\" }" });
          return;
        }
        const scope = csvToScope(body.csv, { asOf: body.asOf ?? new Date().toISOString(), cycleStart: body.cycleStart ?? null });
        sendJson(res, 200, { scope, preview: assess(scope, "csv") });
        return;
      }

      if (req.method === "GET" || req.method === "HEAD") {
        await serveStatic(path, res);
        return;
      }

      sendJson(res, 405, { error: "Method not allowed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 400, { error: message });
    }
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const portArg = process.argv.findIndex((a) => a === "--port");
  const port = Number(process.env.PORT ?? (portArg > 0 ? process.argv[portArg + 1] : 4173));
  const server = createAppServer();
  server.listen(port, process.env.HOST ?? "127.0.0.1", () => {
    console.log(`Confido is running at http://localhost:${port}`);
    console.log("Press Ctrl+C to stop.");
  });
}
