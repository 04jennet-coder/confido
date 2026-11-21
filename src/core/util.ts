/** Small shared helpers. No dependencies, no I/O. */

export const ENGINE = { name: "confido-engine", version: "0.1.0" } as const;

const DAY_MS = 86_400_000;

export function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Whole days between two instants, never negative unless `signed` is set. */
export function daysBetween(from: string | Date | number, to: string | Date | number, signed = false): number {
  const a = typeof from === "string" ? parseDate(from) : typeof from === "number" ? from : from.getTime();
  const b = typeof to === "string" ? parseDate(to) : typeof to === "number" ? to : to.getTime();
  if (a === null || b === null) return 0;
  const d = Math.floor((b - a) / DAY_MS);
  return signed ? d : Math.max(0, d);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

export function listKeys(keys: string[], max = 4): string {
  if (keys.length <= max) return keys.join(", ");
  return `${keys.slice(0, max).join(", ")} +${keys.length - max} more`;
}

/** Shorten free text for a one-line card, without cutting mid-word when avoidable. */
export function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

export function isDone(item: { statusCategory: string }): boolean {
  return item.statusCategory === "done";
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
