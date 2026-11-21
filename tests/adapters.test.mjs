import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, csvToScope } from "../dist/adapters/csv.js";
import { adfToText, mapIssue, mapPriority, buildJql } from "../dist/adapters/jiraMap.js";

test("the CSV parser handles quotes, embedded commas and newlines", () => {
  const rows = parseCsv('key,summary,note\nA-1,"Hello, world","line one\nline two"\nA-2,Plain,"He said ""hi"""');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ["A-1", "Hello, world", "line one\nline two"]);
  assert.equal(rows[2][2], 'He said "hi"');
});

test("a Jira CSV export becomes a scoped release", () => {
  const csv = [
    "Issue key,Issue Type,Summary,Status,Status Category,Priority,Assignee,Created,Updated,Due date,Resolved,Labels,Components,Story Points,Fix versions,Description,Comment,Blocked by",
    'PAY-1,Bug,"Double capture, on abandon",In Progress,In Progress,Highest,Hyerin Cho,2026-11-02T09:00:00Z,2026-11-12T09:00:00Z,2026-11-14,,"blocker","checkout; refunds",5,3.4.0,"If the shopper closes the window the auth is captured twice.","still failing in staging","PAY-2"',
    "PAY-2,Task,Schema change,Done,Done,High,Mina Seo,2026-11-01T09:00:00Z,2026-11-10T09:00:00Z,,2026-11-10T09:00:00Z,,platform,3,3.4.0,Create the table.,,",
  ].join("\n");

  const scope = csvToScope(csv, { asOf: "2026-11-20T00:00:00Z" });
  assert.equal(scope.items.length, 2);
  assert.equal(scope.release.projectKey, "PAY");
  assert.equal(scope.release.fixVersion, "3.4.0");

  const bug = scope.items[0];
  assert.equal(bug.key, "PAY-1");
  assert.equal(bug.type, "Bug");
  assert.equal(bug.statusCategory, "in_progress");
  assert.equal(bug.priority, "Highest");
  assert.deepEqual(bug.components, ["checkout", "refunds"]);
  assert.deepEqual(bug.labels, ["blocker"]);
  assert.equal(bug.storyPoints, 5);
  assert.equal(bug.dueDate, "2026-11-14");
  assert.deepEqual(bug.links, [{ type: "is blocked by", key: "PAY-2" }]);
  assert.equal(bug.comments.length, 1);
  assert.equal(scope.items[1].statusCategory, "done");
});

test("a CSV without an issue key column fails loudly", () => {
  assert.throws(() => csvToScope("summary,status\nnope,done"), /no issue key column/i);
  assert.throws(() => csvToScope("Issue key\n"), /at least one issue/i);
});

test("ADF descriptions and comments are flattened to text", () => {
  const adf = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Migrate stored cards." }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "network tokens" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "issuer declines" }] }] },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "Owner: " }, { type: "mention", attrs: { text: "Mina" } }] },
    ],
  };
  const text = adfToText(adf);
  assert.match(text, /Migrate stored cards\./);
  assert.match(text, /- network tokens/);
  assert.match(text, /Owner: @Mina/);
});

test("Jira issues map onto the engine model", () => {
  const issue = {
    key: "PAY-1401",
    fields: {
      summary: "Card-on-file network token migration",
      description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Migrate stored cards." }] }] },
      issuetype: { name: "Story" },
      status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
      priority: { name: "Highest", id: "1" },
      assignee: null,
      components: [{ name: "checkout" }],
      labels: ["blocker"],
      created: "2026-11-10T10:00:00+09:00",
      updated: "2026-11-19T16:10:00+09:00",
      duedate: null,
      resolutiondate: null,
      fixVersions: [{ name: "3.4.0" }],
      issuelinks: [
        {
          type: { inward: "is blocked by", outward: "blocks" },
          inwardIssue: { key: "PAY-1390", fields: { status: { statusCategory: { key: "indeterminate" } } } },
        },
        { type: { inward: "is blocked by", outward: "blocks" }, outwardIssue: { key: "PAY-1502", fields: { status: { statusCategory: { key: "new" } } } } },
      ],
      comment: {
        comments: [{ author: { displayName: "Jiwon Park" }, created: "2026-11-19T16:10:00+09:00", body: { type: "doc", content: [{ type: "text", text: "Waiting on the sandbox." }] } }],
      },
      customfield_10016: 13,
    },
  };

  const item = mapIssue(issue);
  assert.equal(item.key, "PAY-1401");
  assert.equal(item.statusCategory, "in_progress");
  assert.equal(item.priority, "Highest");
  assert.equal(item.assignee, null);
  assert.equal(item.storyPoints, 13);
  assert.equal(item.description, "Migrate stored cards.");
  assert.equal(item.comments[0].author, "Jiwon Park");
  assert.deepEqual(item.links[0], { type: "is blocked by", key: "PAY-1390", statusCategory: "in_progress" });
  assert.deepEqual(item.links[1], { type: "blocks", key: "PAY-1502", statusCategory: "todo" });
});

test("priority mapping accepts names and ids", () => {
  assert.equal(mapPriority({ name: "Highest" }), "Highest");
  assert.equal(mapPriority({ name: "Blocker" }), "Highest");
  assert.equal(mapPriority({ name: "Unknown thing", id: "4" }), "Low");
  assert.equal(mapPriority(undefined), "Unknown");
});

test("JQL quotes the scope and orders by risk", () => {
  assert.equal(
    buildJql("PAY", "3.4.0", "PAY Sprint 42"),
    'project = "PAY" AND fixVersion = "3.4.0" AND sprint = "PAY Sprint 42" ORDER BY priority DESC, updated ASC',
  );
});
