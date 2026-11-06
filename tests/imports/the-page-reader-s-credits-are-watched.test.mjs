/**
 * The page reader's credits (apps/edge/lib/imports/site-reader-watch.ts): every read of a business's page is a credit, and
 * with none left every read comes back empty and nothing says why. So the health sweep reads what is left and pages while
 * it is low, or when the key is refused, through the pager; and a deployment with no key, or a read that fails, pages
 * nothing. Over the in-memory database (the pager's memory), the provider's answer and the pager's transport stood in for.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const was = {
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
  LEAD_TO: process.env.LEAD_TO,
  LEAD_FROM: process.env.LEAD_FROM,
};
Object.assign(process.env, { LEAD_TO: "ops@example.test", LEAD_FROM: "pager@example.test" });
after(() => {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
const { watchSiteReader } = await importSrc("apps/edge/lib/imports/site-reader-watch.ts");

const KEY = "fc-made-up-for-this-file";
const NOON = Date.parse("2026-11-04T12:00:00.000Z");

/** One sweep's watch, the provider answering `answer`: what it answered, and what it paged. */
async function watched(answer, tables = { operator_pages: [] }, at = NOON) {
  process.env.FIRECRAWL_API_KEY = KEY;
  const sent = [];
  const left = await watchSiteReader(
    fakeDb(tables),
    async (key) => {
      assert.equal(key, KEY);
      return answer;
    },
    {
      now: () => at,
      send: async (_from, _to, subject, body) => {
        sent.push({ subject, body });
        return true;
      },
    },
  );
  return { left, sent, tables };
}

test("low is under a tenth of the plan, or under what one big search would read, whichever is more", async () => {
  const pages = async (remaining, plan) =>
    (await watched({ kind: "read", remaining, plan, periodEnd: null })).sent.length;
  assert.equal(await pages(5_000, 100_000), 1);
  assert.equal(await pages(10_000, 100_000), 0);
  assert.equal(await pages(499, 3_000), 1, "a tenth of a small plan is less than one search");
  assert.equal(await pages(500, 3_000), 0);
  assert.equal(await pages(499, null), 1);
});

test("plenty left pages nothing, and says what is left for the sweep's line", async () => {
  const { left, sent } = await watched({ kind: "read", remaining: 2_500, plan: 3_000, periodEnd: null });
  assert.deepEqual([left, sent], [2_500, []]);
});

test("low pages the platform once a window, saying what is left, when it renews and what an empty plan does", async () => {
  const low = { kind: "read", remaining: 120, plan: 3_000, periodEnd: "2026-12-01T00:00:00Z" };
  const first = await watched(low);
  assert.equal(first.left, 120);
  assert.equal(first.sent.length, 1);
  assert.equal(first.sent[0].subject, "[Chanlytics] The page reader is low on credits: 120 left");
  assert.match(first.sent[0].body, /Firecrawl has 120 credits left of 3000, and renews on 2026-12-01T00:00:00Z\./);
  assert.match(first.sent[0].body, /a search that reads sites sends every place to review/);
  const again = await watched(low, first.tables, NOON + 60_000);
  assert.deepEqual(again.sent, [], "the pager's window holds the next sweep's");
});

test("a key the provider refuses pages at once, however many credits there may be", async () => {
  const { left, sent } = await watched({ kind: "refused", status: 401 });
  assert.equal(left, null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "[Chanlytics] The page reader refused its key: Firecrawl");
  assert.match(sent[0].body, /Firecrawl answered 401 to FIRECRAWL_API_KEY/);
});

test("a read of its books that fails pages nothing, and the sweep's other checks stand", async () => {
  const { left, sent } = await watched({ kind: "unread" });
  assert.deepEqual([left, sent], [null, []]);
});

test("with no key nothing is read and nothing is paged: the website read says so itself", async () => {
  delete process.env.FIRECRAWL_API_KEY;
  let asked = 0;
  const left = await watchSiteReader(fakeDb({ operator_pages: [] }), async () => {
    asked += 1;
    return { kind: "unread" };
  });
  assert.deepEqual([left, asked], [null, 0]);
});
