/**
 * The day's model spend, counted rather than sampled.
 *
 * The budget check runs before every reply and asks one question: has this
 * workspace used its day's tokens? It read the usage events with
 * `.limit(2000)` against a server that answers at most 1000 (`api.max_rows`)
 * and says nothing about it, so the sum stopped growing at whatever a thousand
 * replies came to: past that, `max_llm_tokens_day` could not be reached however
 * much a workspace spent, and the cap bounded only the workspaces that did not
 * need bounding.
 *
 * Paging it introduced a second way to be wrong, which is why the direction is
 * pinned here and not only in a comment: `events` is append-only and replies
 * write to it WHILE this reads, so newest-first OFFSET paging re-reads rows
 * that the next insert pushed down a page -- a sum that grows with how busy
 * the workspace is while being read.
 *
 * Executed against a fake database; the early stop is counted in round trips,
 * because "one query for an ordinary workspace" is the property that makes
 * this affordable before every reply.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { tokensLast24h, brainSummary } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/budget.ts")).href);

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

test("a day that fits in one page is one round trip", async () => {
  const db = fakeDb({ events: usage(900) });
  assert.equal(await tokensLast24h(db, T), 1800);
  assert.equal(reads(db), 1, "the check runs before every reply: an ordinary workspace must not pay for paging");
});

test("a day past the server's cap is counted whole, not truncated at a thousand", async () => {
  const db = fakeDb({ events: usage(2500) });
  assert.equal(await tokensLast24h(db, T), 5000, "2500 replies at 2 tokens each — not 2000, which is what a truncated read returns");
  assert.equal(reads(db), 3);
});

test("only this workspace's spend counts toward this workspace's cap", async () => {
  const mine = usage(10);
  const theirs = usage(10, 100, 1000).map((e) => ({ ...e, tenant_id: "t-2" }));
  assert.equal(await tokensLast24h(fakeDb({ events: [...mine, ...theirs] }), T), 20);
});

test("the caller's cap stops the read, because the only question is whether it is reached", async () => {
  const db = fakeDb({ events: usage(2500) });
  const used = await tokensLast24h(db, T, 1000);
  assert.ok(used >= 1000, `${used} is enough to answer the question`);
  assert.equal(reads(db), 1, "it stopped at the first page rather than reading the day out to prove a number nobody compares");
});

test("rows written WHILE the day is being read are never counted twice", async () => {
  // The defect newest-first paging has: rows inserted between two pages shift
  // the window down, so the next OFFSET re-reads rows already summed and
  // skips the ones it was meant to reach. Oldest-first, an append lands past
  // the end and the offsets already read do not move.
  //
  // The arriving replies cost a HUNDRED times the ones already on record, so
  // counting the wrong rows cannot come out to the right total by luck: read
  // correctly this is 1000x2 + 500x200; newest-first it re-reads five hundred
  // of the originals instead and lands on 3000.
  const rows = usage(1000);
  const db = fakeDb({ events: rows });
  const realFrom = db.from.bind(db);
  let pages = 0;
  db.from = (table) => {
    const q = realFrom(table);
    if (table !== "events") return q;
    const select = q.select.bind(q);
    q.select = (...a) => {
      const b = select(...a);
      const then = b.then.bind(b);
      b.then = (res, rej) => then((r) => {
        // A busy afternoon: five hundred replies land while page one is in flight.
        if (++pages === 1) rows.push(...usage(500, 100, 5000));
        return res(r);
      }, rej);
      return b;
    };
    return q;
  };
  assert.equal(await tokensLast24h(db, T), 102_000, "every row once: the thousand on record, and the five hundred that genuinely arrived");
  assert.equal(pages, 2);
});

test("the summary describes the day without reading it twenty times over", async () => {
  const db = fakeDb({ events: [...usage(10), { id: "x", tenant_id: T, kind: "usage.llm_tokens", created_at: new Date().toISOString(), data: { input_tokens: 5, output_tokens: 7, confidence: 0.5, latency_ms: 100, held: "veto_window", intent: "book" } }] });
  const s = await brainSummary(db, T);
  assert.equal(s.replies, 11);
  assert.equal(s.tokens_in, 15);
  assert.equal(s.tokens_out, 17);
  assert.equal(s.held_veto, 1);
  assert.equal(s.with_record, 1);
  assert.equal(s.avg_confidence, 0.5, "averaged over the rows that carry one, not over all of them");
});

test("a read that fails counts as zero rather than silencing a receptionist", async () => {
  const db = fakeDb({ events: usage(10) }, { "events.select": { message: "statement timeout" } });
  assert.equal(await tokensLast24h(db, T), 0, "a budget must never stop a reply by accident");
});
