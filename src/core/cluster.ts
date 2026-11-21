import type { WorkItem } from "./types.js";

/**
 * Local, dependency-free text similarity (TF-IDF + cosine).
 *
 * Two jobs: grouping release-note items into readable themes, and flagging pairs
 * of open issues that describe the same work. This runs without any API key, so
 * the demo has real analysis even with no model configured.
 */

const STOPWORDS = new Set(
  `a an the and or but if then than so to of in on at for from by with without into over under after before as is are was were be been being do does did done has have had can could should would may might must will just also not no yes we our you your they their it its this that these those there here when while about across per via up down out off again more most some any each other such only own same very s t`.split(
    /\s+/,
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export interface Vectorised {
  keys: string[];
  vectors: number[][];
  idf: Map<string, number>;
}

/** Term-frequency × inverse-document-frequency, L2-normalised rows. */
export function vectorise(docs: { key: string; text: string }[]): Vectorised {
  const tokenised = docs.map((d) => tokenize(d.text));
  const df = new Map<string, number>();
  for (const tokens of tokenised) {
    for (const token of new Set(tokens)) df.set(token, (df.get(token) ?? 0) + 1);
  }
  const n = docs.length || 1;
  const idf = new Map<string, number>();
  for (const [token, count] of df) idf.set(token, Math.log((1 + n) / (1 + count)) + 1);

  const vectors = tokenised.map((tokens) => {
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    const vocab = new Set<string>();
    for (const [token] of tf) if ((idf.get(token) ?? 0) > 0) vocab.add(token);
    const keys = Array.from(vocab);
    const raw = keys.map((k) => (tf.get(k) ?? 0) * (idf.get(k) ?? 1));
    const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0)) || 1;
    return raw.map((v) => v / norm);
  });

  return { keys: docs.map((d) => d.key), vectors, idf };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) dot += a[i] * b[i];
  return dot;
}

/**
 * Groups documents into `k` clusters with deterministic k-means (farthest-point
 * seeding, fixed iteration count). Used by release notes to name themes.
 */
export function cluster(docs: { key: string; text: string }[], k = 3): { label: string; keys: string[] }[] {
  if (docs.length === 0) return [];
  const { keys, vectors } = vectorise(docs);
  const clusters = Math.max(1, Math.min(k, docs.length));

  const centroids: number[][] = [vectors[0]];
  while (centroids.length < clusters) {
    let best = 0;
    let bestDistance = -1;
    vectors.forEach((v, i) => {
      const nearest = Math.min(...centroids.map((c) => 1 - cosine(v, c)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = i;
      }
    });
    centroids.push(vectors[best]);
  }

  let assignment = new Array(vectors.length).fill(0);
  for (let iter = 0; iter < 12; iter += 1) {
    const next = vectors.map((v) => {
      let bestIndex = 0;
      let bestScore = -Infinity;
      centroids.forEach((c, i) => {
        const score = cosine(v, c);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      });
      return bestIndex;
    });
    const stable = next.every((v, i) => v === assignment[i]);
    assignment = next;
    for (let i = 0; i < centroids.length; i += 1) {
      const members = vectors.filter((_, idx) => assignment[idx] === i);
      if (!members.length) continue;
      centroids[i] = members[0].map((_, dim) => members.reduce((s, v) => s + v[dim], 0) / members.length);
    }
    if (stable) break;
  }

  const groups: { label: string; keys: string[] }[] = [];
  for (let i = 0; i < clusters; i += 1) {
    const memberIdx = assignment.map((a, idx) => (a === i ? idx : -1)).filter((idx) => idx >= 0);
    if (!memberIdx.length) continue;
    groups.push({ label: `Theme ${groups.length + 1}`, keys: memberIdx.map((idx) => keys[idx]) });
  }
  return groups;
}

export interface OverlapPair {
  a: string;
  b: string;
  similarity: number;
  sharedTerms: string[];
}

/**
 * Pairs of open issues whose summaries are close enough that a human should look
 * at both — either duplicate work or a split that was never written down.
 */
export function findOverlaps(items: WorkItem[], threshold = 0.55, limit = 3): OverlapPair[] {
  const docs = items.map((i) => ({ key: i.key, text: `${i.summary} ${i.description}`.slice(0, 400) }));
  const { keys, vectors } = vectorise(docs);
  const tokenSets = docs.map((d) => new Set(tokenize(d.text)));
  const pairs: OverlapPair[] = [];

  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const similarity = cosine(vectors[i], vectors[j]);
      if (similarity < threshold) continue;
      const shared = Array.from(tokenSets[i]).filter((t) => tokenSets[j].has(t));
      if (shared.length < 3) continue;
      pairs.push({ a: keys[i], b: keys[j], similarity: Math.round(similarity * 100) / 100, sharedTerms: shared.slice(0, 5) });
    }
  }

  return pairs.sort((x, y) => y.similarity - x.similarity).slice(0, limit);
}
