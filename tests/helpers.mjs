/** Fixture helpers for the engine tests. Deliberately small and explicit. */

export const AS_OF = "2026-11-20T12:00:00Z";

export function item(key, overrides = {}) {
  return {
    key,
    summary: overrides.summary ?? `${key} summary`,
    type: overrides.type ?? "Story",
    status: overrides.status ?? "In Progress",
    statusCategory: overrides.statusCategory ?? "in_progress",
    priority: overrides.priority ?? "Medium",
    assignee: overrides.assignee === undefined ? "Mina Seo" : overrides.assignee,
    components: overrides.components ?? ["platform"],
    labels: overrides.labels ?? [],
    created: overrides.created ?? "2026-11-10T09:00:00Z",
    updated: overrides.updated ?? "2026-11-19T09:00:00Z",
    dueDate: overrides.dueDate ?? null,
    resolved: overrides.resolved ?? null,
    storyPoints: overrides.storyPoints === undefined ? 3 : overrides.storyPoints,
    fixVersions: overrides.fixVersions ?? ["1.0.0"],
    links: overrides.links ?? [],
    description: overrides.description ?? "A sufficiently detailed description that explains the change and its acceptance criteria.",
    comments: overrides.comments ?? [],
  };
}

export function done(key, overrides = {}) {
  return item(key, {
    status: "Done",
    statusCategory: "done",
    resolved: "2026-11-18T09:00:00Z",
    ...overrides,
  });
}

export function scope(items, release = {}) {
  return {
    release: {
      name: release.name ?? "Test 1.0.0",
      projectKey: release.projectKey ?? "TST",
      fixVersion: release.fixVersion ?? "1.0.0",
      sprintName: release.sprintName ?? null,
      startedAt: release.startedAt ?? "2026-11-02T09:00:00Z",
      asOf: release.asOf ?? AS_OF,
    },
    items,
  };
}

export function hoursAgo(days) {
  return new Date(Date.parse(AS_OF) - days * 86_400_000).toISOString();
}
