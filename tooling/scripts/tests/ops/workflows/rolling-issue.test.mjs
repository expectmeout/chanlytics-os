/**
 * One rolling issue per watched condition (ops/rolling-issue.mjs), run over GitHub's API as a fake: the nightly's
 * fourteen per-night issues folded into one, a red night that comments and counts, the second red night in a row that
 * pages through the edge's door, and a green night that closes it (the scorecard's defect 15).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlan, openIssues, planRollingIssue, redRunsOf } from "../../../ops/rolling-issue.mjs";

const TITLE = "Nightly e2e is red";
const today = "2026-09-30";
const runUrl = "https://github.com/example/repo/actions/runs/1";

test("the first red run opens the issue, counting one", () => {
  const { redRuns, actions } = planRollingIssue({
    open: [],
    state: "red",
    title: TITLE,
    body: "3 specs failed",
    today,
  });
  assert.equal(redRuns, 1);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, "create");
  assert.equal(redRunsOf({ body: actions[0].body }), 1);
  assert.match(actions[0].body, /3 specs failed$/);
});

test("a red run with the issue open comments, counts on, keeps the first run's words, and pages from the second", () => {
  const first = planRollingIssue({ open: [], state: "red", title: TITLE, body: "the first night's words", today })
    .actions[0];
  const open = [{ number: 7, title: TITLE, body: first.body }];
  const { redRuns, actions } = planRollingIssue({
    open,
    state: "red",
    title: TITLE,
    body: "2 specs failed",
    pageAfter: 2,
    runUrl,
    today,
  });
  assert.equal(redRuns, 2);
  assert.deepEqual(
    actions.map((a) => [a.kind, a.number ?? null]),
    [
      ["comment", 7],
      ["update", 7],
      ["page", null],
    ],
  );
  assert.match(
    actions[0].body,
    /^Red on 2026-09-30\. Run: https:\/\/github\.com\/example\/repo\/actions\/runs\/1\n\n2 specs failed$/,
  );
  assert.equal(redRunsOf({ body: actions[1].body }), 2);
  assert.match(actions[1].body, /the first night's words$/, "the first run's words stay below the count");
  assert.equal(
    planRollingIssue({ open, state: "red", title: TITLE, body: "", pageAfter: 3, today }).actions.at(-1).kind,
    "update",
  );
});

test("the old per-night issues fold into the newest, each counted as a red night", () => {
  const open = [16, 15, 14].map((n) => ({
    number: n,
    title: `Nightly e2e failed 2026-09-${n}`,
    body: "The nightly suite failed.",
  }));
  const { redRuns, actions } = planRollingIssue({ open, state: "red", title: TITLE, body: "", pageAfter: 2, today });
  assert.equal(redRuns, 4, "three nights on record, and this one");
  assert.deepEqual(
    actions.map((a) => [a.kind, a.number ?? null]),
    [
      ["comment", 16],
      ["update", 16],
      ["close", 15],
      ["close", 14],
      ["page", null],
    ],
  );
  assert.equal(actions[1].title, TITLE, "the kept issue takes the rolling title");
  assert.match(actions[2].comment, /Folded into #16/);
});

test("a green run closes every open one, and a green run with none open does nothing", () => {
  const open = [{ number: 9, title: TITLE, body: "<!-- red-runs: 3 -->" }];
  const { redRuns, actions } = planRollingIssue({ open, state: "green", title: TITLE, body: "", runUrl, today });
  assert.equal(redRuns, 0);
  assert.deepEqual(actions, [{ kind: "close", number: 9, comment: `Green on ${today}. Run: ${runUrl}` }]);
  assert.deepEqual(planRollingIssue({ open: [], state: "green", title: TITLE, body: "", today }).actions, []);
});

/** GitHub's API and the edge's pager door, answered from memory and recorded. */
function fakeWire({ issues = [], page = { status: 200, body: { ok: true, outcome: "sent" } } } = {}) {
  const calls = [];
  let next = 100;
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method ?? "GET", path: u.pathname + u.search, body, headers: init.headers ?? {} });
    const answer = (status, payload) => new Response(JSON.stringify(payload), { status });
    if (u.pathname.endsWith("/api/admin/page")) return answer(page.status, page.body);
    if ((init.method ?? "GET") === "GET") return answer(200, u.searchParams.get("page") === "1" ? issues : []);
    if (init.method === "POST" && u.pathname.endsWith("/issues")) return answer(201, { number: next++ });
    return answer(200, {});
  };
  return { calls, fetch };
}

test("the open issues are read by title prefix, pull requests left out, newest first", async () => {
  const wire = fakeWire({
    issues: [
      { number: 3, title: "Nightly e2e failed 2026-09-20", body: "" },
      { number: 8, title: "Nightly e2e hit its cap 2026-09-21", body: "" },
      { number: 5, title: "Nightly e2e failed 2026-09-22", body: "", pull_request: {} },
      { number: 6, title: "Something else", body: "" },
    ],
  });
  const open = await openIssues({ repo: "example/repo", token: "t", prefixes: ["Nightly e2e"], fetch: wire.fetch });
  assert.deepEqual(
    open.map((i) => i.number),
    [8, 3],
  );
});

test("applied, a plan makes its calls in order and pages through the door with the platform's key", async () => {
  const wire = fakeWire();
  const plan = planRollingIssue({
    open: [
      { number: 8, title: "Nightly e2e failed", body: "" },
      { number: 3, title: "Nightly e2e failed", body: "" },
    ],
    state: "red",
    title: TITLE,
    body: "red",
    pageAfter: 2,
    today,
  });
  const done = await applyPlan(plan, {
    repo: "example/repo",
    token: "t",
    fetch: wire.fetch,
    pager: { url: "https://edge.example.com/", key: "diag-key" },
    condition: "nightly_red",
    detail: "Nightly e2e is red.",
  });
  assert.deepEqual(
    wire.calls.map((c) => `${c.method} ${c.path}`),
    [
      "POST /repos/example/repo/issues/8/comments",
      "PATCH /repos/example/repo/issues/8",
      "POST /repos/example/repo/issues/3/comments",
      "PATCH /repos/example/repo/issues/3",
      "POST /api/admin/page",
    ],
  );
  const page = wire.calls.at(-1);
  assert.equal(page.headers["x-diag-key"], "diag-key");
  assert.deepEqual(page.body, { condition: "nightly_red", detail: "Nightly e2e is red. (red 3 runs in a row)" });
  assert.deepEqual(wire.calls[3].body, { state: "closed", state_reason: "completed" });
  assert.deepEqual(done, ["commented on #8", "closed #3", "paged: sent"]);
});

test("without the pager's address the issue is the only word, and says so; a refused page is said too", async () => {
  const plan = { redRuns: 2, actions: [{ kind: "page", redRuns: 2 }] };
  assert.deepEqual(await applyPlan(plan, { repo: "r/r", token: "t", fetch: fakeWire().fetch }), [
    "not paged: the workflow holds no PAGER_URL and PAGER_KEY, so the issue is the only word",
  ]);
  const refused = fakeWire({ page: { status: 403, body: { ok: false } } });
  const done = await applyPlan(plan, {
    repo: "r/r",
    token: "t",
    fetch: refused.fetch,
    pager: { url: "https://edge.example.com", key: "wrong" },
    condition: "nightly_red",
    detail: "x",
  });
  assert.deepEqual(done, ["the page was refused: 403 "]);
});
