/**
 * Optional LLM narration.
 *
 * Confido is useful with no model at all; when a key is present it asks a model
 * to write the prose. The prompt is built only from facts the engine already
 * computed, and the verdict is marked read-only for the model — a wrong sentence
 * can annoy a reader, it can never move the score.
 *
 * Supported, in order of preference:
 *   - Anthropic  : ANTHROPIC_API_KEY                     (CONFIDO_LLM_MODEL)
 *   - OpenAI-compatible: OPENAI_API_KEY + OPENAI_BASE_URL (works with OpenAI,
 *     Azure OpenAI gateways, OpenRouter, Ollama, vLLM …)
 * Set CONFIDO_LLM=none to disable narration entirely.
 */

export interface LlmConfig {
  provider: "anthropic" | "openai";
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface LlmStatus {
  enabled: boolean;
  provider: LlmConfig["provider"] | null;
  model: string | null;
  reason: string;
}

const DEFAULT_ANTHROPIC_MODEL = process.env.CONFIDO_LLM_MODEL ?? "claude-sonnet-4-5";
const DEFAULT_OPENAI_MODEL = process.env.CONFIDO_LLM_MODEL ?? "gpt-4.1-mini";

export function llmConfig(): LlmConfig | null {
  if ((process.env.CONFIDO_LLM ?? "").toLowerCase() === "none") return null;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const preferred = (process.env.CONFIDO_LLM_PROVIDER ?? "").toLowerCase();

  if (preferred === "openai" && openaiKey) {
    return {
      provider: "openai",
      model: DEFAULT_OPENAI_MODEL,
      apiKey: openaiKey,
      baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    };
  }
  if (preferred === "anthropic" && anthropicKey) {
    return { provider: "anthropic", model: DEFAULT_ANTHROPIC_MODEL, apiKey: anthropicKey, baseUrl: "https://api.anthropic.com" };
  }
  if (anthropicKey) {
    return { provider: "anthropic", model: DEFAULT_ANTHROPIC_MODEL, apiKey: anthropicKey, baseUrl: "https://api.anthropic.com" };
  }
  if (openaiKey) {
    return {
      provider: "openai",
      model: DEFAULT_OPENAI_MODEL,
      apiKey: openaiKey,
      baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    };
  }
  return null;
}

export function llmStatus(): LlmStatus {
  const config = llmConfig();
  if (!config) {
    return {
      enabled: false,
      provider: null,
      model: null,
      reason: "No API key configured — the engine writes its own deterministic brief (full functionality, no cost).",
    };
  }
  return { enabled: true, provider: config.provider, model: config.model, reason: "LLM narration enabled." };
}

export interface LlmResult {
  text: string;
  model: string;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms = 25_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function generateNarrative(system: string, user: string): Promise<LlmResult> {
  const config = llmConfig();
  if (!config) throw new Error("No LLM configured");

  if (config.provider === "anthropic") {
    return withTimeout(async (signal) => {
      const res = await fetch(`${config.baseUrl}/v1/messages`, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 900,
          temperature: 0.2,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = (data.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
      if (!text) throw new Error("Anthropic returned an empty message");
      return { text, model: config.model };
    });
  }

  return withTimeout(async (signal) => {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI-compatible ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Provider returned an empty message");
    return { text, model: config.model };
  });
}
