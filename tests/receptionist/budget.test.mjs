/**
 * The day’s model spend, counted rather than sampled, and asked of the database once.
 *
 * The budget check runs before every reply and asks one question: has this
 * workspace used its day’s tokens? It read the usage events with
 * `.limit(2000)` against a server that answers at most 1000 (`api.max_rows`)
 * and says nothing about it, so the sum stopped growing at whatever a thousand
 * replies came to. Paging fixed the count and cost a round trip per thousand
 * replies, on the path of every automatic reply; and paging an append-only table
 * while replies write to it needed a frozen window to count each row once.
 *
 * Now the database adds them (llm_tokens_since): one statement, one snapshot,
 * one round trip however busy the day was. What the sum counts (the window, the
 * kind, the workspace, a value that is not a number, who may ask) is proved
 * against a real database in llm-tokens-since.db.test.mjs; here, that the
 * budget asks it once and that a failed read still counts zero. The summary on
 * /api/diag describes the day from its rows and still pages them, newest first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { getTokensLast24h, getBrainSummary } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/ai/budget.ts")).href
);

const T = "t-1";
/** n usage events, oldest first, each costing `each` tokens in and the same out. */
const usage = (n, each = 1, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(from + i).padStart(6, "0"),
    tenant_id: T,
    kind: "usage.llm_tokens",
    created_at: new Date(Date.now() - 3_600_000 + (from + i) * 10).toISOString(),
    data: { input_tokens: each, output_tokens: each },
  }));

/** How many reads of `events` the code made. */
const reads = (db) => db.seen.filter((q) => q.table === "events" && q.op === "select").length;

/** The rpc calls the code made, by name. */
const calls = (db, name) => db.seen.filter((q) => q.rpc === name);

/** What the edge logged while `run` ran: its logger writes a JSON object per line. */
async function logged(run) {
  const said = [];
  const err = console.error;
  console.error = (...a) => said.push(a.join(" "));
  try {
    return { result: await run(), said };
  } finally {
    console.error = err;
  }
}

test("the day is one question to the database, however many replies it held", async () => {
  // 25,000 replies: twenty-five pages the old read paged through before every reply, and one past its cap.
  const rows = usage(25_000);
  const db = fakeDb({ events: rows });
  const before = Date.now();
  assert.equal(await getTokensLast24h(db, T), 50_000, "every reply of the day, each counted once");
  assert.equal(reads(db), 0, "no event is carried to the edge to be added up");
  const asked = calls(db, "llm_tokens_since");
  assert.equal(asked.length, 1, "one round trip, the same for a quiet day and a busy one");
  assert.equal(asked[0].args.p_tenant, T, "this workspace’s day alone");
  const since = Date.parse(asked[0].args.p_since);
  assert.ok(Math.abs(since - (before - 86_400_000)) < 5_000, "a rolling day: the last 24 hours");
});

test("a read that fails counts as zero, and says so, rather than silencing a receptionist", async () => {
  const db = fakeDb(
    { events: usage(10) },
    {},
    {
      llm_tokens_since: () => {
        throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
      },
    },
  );
  const { result, said } = await logged(() => getTokensLast24h(db, T));
  assert.equal(result, 0, "a budget must never stop a reply by accident");
  assert.ok(
    said.some((l) => l.includes("budget_read_failed")),
    "and the platform hears that the count is not known",
  );
});

test("without a workspace there is no day to count: zero, and nothing asked", async () => {
  const rows = usage(10);
  const db = fakeDb({ events: rows });
  const { result } = await logged(() => getTokensLast24h(db, null));
  assert.equal(result, 0);
  assert.equal(calls(db, "llm_tokens_since").length, 0, "never every workspace’s day summed as one");
});

test("the summary describes the day without reading it twenty times over", async () => {
  const db = fakeDb({
    events: [
      ...usage(10),
      {
        id: "x",
        tenant_id: T,
        kind: "usage.llm_tokens",
        created_at: new Date().toISOString(),
        data: {
          input_tokens: 5,
          output_tokens: 7,
          confidence: 0.5,
          latency_ms: 100,
          held: "veto_window",
          intent: "book",
        },
      },
    ],
  });
  const s = await getBrainSummary(db, T);
  assert.equal(s.replies, 11);
  assert.equal(s.tokens_in, 15);
  assert.equal(s.tokens_out, 17);
  assert.equal(s.held_veto, 1);
  assert.equal(s.with_record, 1);
  assert.equal(s.avg_confidence, 0.5, "averaged over the rows that carry one, not over all of them");
});

test("a summary that hits its bound describes the NEWEST of the window, not the oldest", async () => {
  // The diagnostics panel is opened to see what is happening now. Paged
  // oldest-first, the rows that fall off its bound are the recent ones — so a
  // latency spike or a burst of vetoes, which is the whole reason somebody is
  // looking, is the first thing to go missing.
  //
  // 5001 events, with the marks on the two ends: the summary's bound is 5000,
  // so exactly one row is dropped and which one it is says which end it read.
  const rows = usage(5001);
  rows[0].data = { ...rows[0].data, held: "veto_window" }; // the oldest
  rows[5000].data = { ...rows[5000].data, held: "low_confidence" }; // the newest
  const s = await getBrainSummary(fakeDb({ events: rows }), T);
  assert.equal(s.replies, 5000, "bounded, as it is meant to be");
  assert.equal(s.held_low_confidence, 1, "the newest event is in the picture");
  assert.equal(s.held_veto, 0, "and the one that fell off the end is the oldest");
});
