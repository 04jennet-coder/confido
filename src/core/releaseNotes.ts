import type { ReleaseNoteSection, ReleaseScope, WorkItem } from "./types.js";
import { isDone } from "./util.js";

/**
 * Release notes are generated from what actually landed, not from what was
 * planned: only done items appear under a change heading, and anything still
 * open is listed separately so the notes never claim unfinished work.
 */

function typeBucket(item: WorkItem): "breaking" | "new" | "fixed" | "improved" {
  if (item.labels.some((l) => /breaking|migration/i.test(l))) return "breaking";
  if (/bug|defect/i.test(item.type)) return "fixed";
  if (/story|feature|epic/i.test(item.type)) return "new";
  return "improved";
}

export function buildReleaseNotes(scope: ReleaseScope): ReleaseNoteSection[] {
  const done = scope.items.filter(isDone);
  const buckets: Record<string, { title: string; items: WorkItem[] }> = {
    breaking: { title: "Breaking changes", items: [] },
    new: { title: "New", items: [] },
    fixed: { title: "Fixed", items: [] },
    improved: { title: "Improved", items: [] },
  };

  for (const item of done) buckets[typeBucket(item)].items.push(item);

  return ["breaking", "new", "fixed", "improved"]
    .map((key) => ({
      title: buckets[key].title,
      items: buckets[key].items
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((i) => ({ key: i.key, summary: i.summary, type: i.type })),
    }))
    .filter((section) => section.items.length > 0);
}

export function renderReleaseNotes(sections: ReleaseNoteSection[], scope: ReleaseScope): string {
  const header = `## ${scope.release.name} — release notes draft`;
  const lines: string[] = [header, ""];
  for (const section of sections) {
    lines.push(`### ${section.title}`);
    for (const item of section.items) {
      lines.push(`- **${item.key}** ${item.summary}`);
    }
    lines.push("");
  }
  const open = scope.items.filter((i) => !isDone(i));
  if (open.length) {
    lines.push(
      `> ${open.length} item${open.length === 1 ? "" : "s"} in scope are not done and are deliberately not listed above: ${open
        .slice(0, 6)
        .map((i) => i.key)
        .join(", ")}${open.length > 6 ? ` +${open.length - 6} more` : ""}.`,
    );
  }
  return lines.join("\n").trimEnd() + "\n";
}
