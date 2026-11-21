import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ReleaseScope } from "../core/types.js";

/**
 * The bundled sample releases. Two reasons they exist: judges and reviewers can
 * click once and see a real assessment without a Jira account, and the tests run
 * against data that looks like a real release rather than three hand-made issues.
 */

export type SamplePreset = "payments" | "payments-baseline" | "checkout";

const PRESET_FILES: Record<SamplePreset, string> = {
  payments: "sample-release.json",
  "payments-baseline": "sample-release-baseline.json",
  checkout: "sample-release-healthy.json",
};

export function dataDir(): string {
  if (process.env.CONFIDO_DATA_DIR) return process.env.CONFIDO_DATA_DIR;
  return fileURLToPath(new URL("../../data/", import.meta.url));
}

export async function loadSample(preset: SamplePreset = "payments"): Promise<ReleaseScope> {
  const file = PRESET_FILES[preset];
  if (!file) throw new Error(`Unknown sample preset "${preset}". Use one of: ${Object.keys(PRESET_FILES).join(", ")}`);
  const raw = await readFile(`${dataDir()}${file}`, "utf8");
  return JSON.parse(raw) as ReleaseScope;
}

export function isSamplePreset(value: string): value is SamplePreset {
  return value in PRESET_FILES;
}

export const SAMPLE_LABELS: Record<SamplePreset, string> = {
  payments: "Payments 3.4.0 — a release in trouble",
  "payments-baseline": "Payments 3.4.0 — snapshot from one week earlier",
  checkout: "Checkout 2.9.0 — a healthy release",
};
