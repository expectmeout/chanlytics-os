/**
 * Meta's count beside Chanlytics' (the Ads tracking plan's T2 and its call 1): over the days Meta has settled, the chats
 * Meta says an ad started beside the messages from it that reached Chanlytics (ad_entries), one rule in contracts
 * (adChatsKeptRule, beside adCostRule), read by the page's model and by each read of an account at Meta.
 *
 * What must hold. Nothing is said until Meta has counted ten. The two have parted when Chanlytics kept fewer than half of
 * Meta's. The drawer says both numbers, and when they part, what is happening, that the ad and AI's replies are not
 * affected, and that Chanlytics is looking: the owner is never asked to fix it. Health is told of a parted ad once, with
 * the ad and the two counts, never at every read; an ad that is not parted, or one under ten, tells Health nothing.
 * Which ads are compared at all (one that opens a chat the workspace hears) is the read's (00677 ad_chats_kept).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { at, withEnv } from "../../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { adChatsKeptRule } = await import(at("packages/contracts/src/reports/ad-cost.ts"));
const { sheetModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model.ts"));
const { pageChatsParted } = await import(at("apps/edge/lib/ads/chat/kept.ts"));

const T = "10000000-0000-4000-8000-000000000001";
const SAID = { timezone: "America/New_York", nowMs: Date.parse("2026-11-21T19:10:00Z") };

test("the rule says nothing under ten of Meta's, and the two part when Chanlytics kept fewer than half", () => {
  assert.deepEqual(adChatsKeptRule({ meta: 9, kept: 0 }), { said: false, parted: false }, "nine is too few to say");
  assert.deepEqual(adChatsKeptRule({ meta: 10, kept: 5 }), { said: true, parted: false }, "half is not parted");
  assert.deepEqual(adChatsKeptRule({ meta: 10, kept: 4 }), { said: true, parted: true });
  assert.deepEqual(adChatsKeptRule({ meta: 20, kept: 18 }), { said: true, parted: false });
  assert.deepEqual(adChatsKeptRule({ meta: 20, kept: 25 }), { said: true, parted: false }, "more is never parted");
  assert.deepEqual(adChatsKeptRule({ meta: 0, kept: 3 }), { said: false, parted: false });
});

const ad = (over = {}) => ({
  id: "ad-a",
  name: "Spring colour offer",
  made_in_platform: true,
  shown_on: ["facebook", "instagram"],
  launch: null,
  made_here: null,
  opens: "whatsapp",
  state: "on",
  needs: null,
  issue: null,
  ends_at: "2026-12-08T22:00:00Z",
  budget: { kind: "total", minor: 72000, left_minor: 30800, shared: false },
  pending: null,
  version: 3,
  paused_by: null,
  way_in: null,
  resume: { ok: false, why: "not_paused" },
  people: 12,
  booked: 3,
  spend_minor: 31000,
  settling: true,
  theirs: { impressions: 9000, clicks: 300, results: 31 },
  ...over,
});
const page = (ads) => ({
  account: {
    status: "connected",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    read_at: "2026-11-21T19:00:00Z",
    read_failed: false,
    revoked_at: null,
    disconnected_at: null,
    ready: true,
    min_daily_minor: null,
    most_minor: null,
  },
  window: { from: "2026-10-23", to: "2026-11-21" },
  today: "2026-11-21",
  ads,
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  needs_you: { count: 0, people: [] },
});
const drawer = (over) => sheetModel(page([ad(over)]), "ad-a", SAID);

test("the drawer says Meta's count beside the messages that reached Chanlytics, up to the last day Meta has settled", () => {
  const vm = drawer({ chats: { meta: 20, kept: 18, through: "2026-11-07" } });
  assert.deepEqual(vm.chats, {
    line: "Meta counted 20 chats from this ad up to 7 Nov. 18 reached Chanlytics.",
    parted: null,
  });
  assert.equal(drawer({ chats: { meta: 9, kept: 9, through: "2026-11-07" } }).chats, null, "under ten, nothing");
  assert.equal(drawer({ chats: null }).chats, null, "no day settled yet");
  assert.equal(drawer({}).chats, null, "a server that does not read it says nothing");
  // One chat, one message: said as one.
  assert.match(
    drawer({ chats: { meta: 11, kept: 1, through: "2026-11-07" } }).chats.line,
    /\. 1 reached Chanlytics\.$/,
  );
});

test("when the two part, the drawer says what is happening, that nothing of the ad is affected, and asks nothing", () => {
  const vm = drawer({ chats: { meta: 20, kept: 6, through: "2026-11-07" } });
  assert.equal(vm.chats.line, "Meta counted 20 chats from this ad up to 7 Nov. 6 reached Chanlytics.");
  assert.equal(vm.chats.parted, "The ad and AI's replies aren't affected. Chanlytics is looking into it.");
  assert.doesNotMatch(vm.chats.parted, /fix|check|connect|try/i, "the owner is never asked to fix it");
  // The figures stay as they were: the line stands beside them, never in them.
  assert.deepEqual(
    vm.theirs.map((figure) => figure.label),
    ["Spent", "Times shown", "Taps", "Chats Meta counted"],
  );
});

/** A pager that keeps what it was asked to send. */
function pager() {
  const sent = [];
  return { sent, send: async (from, to, subject, body) => (sent.push({ from, to, subject, body }), true) };
}
const ADDRESSED = { LEAD_TO: "ops@example.com", LEAD_FROM: "alerts@example.com" };

/** A workspace's read of its ads' counts, as ad_chats_kept answers it (00677). */
const world = (rows) => {
  const tables = { operator_pages: [] };
  const db = fakeDb(tables, {}, { ad_chats_kept: () => rows });
  return { tables, db };
};
const PARTED = {
  ad_id: "d0000000-0000-4000-8000-00000000000a",
  name: "Spring colour offer",
  meta: 20,
  kept: 6,
  through: "2026-11-07",
};
const TOGETHER = {
  ad_id: "d0000000-0000-4000-8000-00000000000d",
  name: "First visit",
  meta: 12,
  kept: 11,
  through: "2026-11-08",
};
const FEW = {
  ad_id: "d0000000-0000-4000-8000-000000000010",
  name: "Quiet one",
  meta: 6,
  kept: 0,
  through: "2026-11-08",
};

test("a parted ad reaches Health once, with the ad and the two counts, and the next read tells it nothing", async () => {
  const w = world([PARTED, TOGETHER, FEW]);
  const p = pager();
  const first = await withEnv(ADDRESSED, () => pageChatsParted(w.db, T, { send: p.send }));
  assert.deepEqual(first, { parted: 1, paged: 1 });
  assert.equal(p.sent.length, 1, "one page, for the parted ad alone");
  assert.match(p.sent[0].subject, /Spring colour offer/);
  assert.match(p.sent[0].body, /Meta counted 20 chats/);
  assert.match(p.sent[0].body, /6 reached Chanlytics/);
  assert.match(p.sent[0].body, new RegExp(PARTED.ad_id));
  assert.match(p.sent[0].body, new RegExp(T));
  // The next read, an hour on, and the one after: still parted, and Health is not told again.
  for (const _ of [1, 2]) {
    const again = await withEnv(ADDRESSED, () => pageChatsParted(w.db, T, { send: p.send }));
    assert.deepEqual(again, { parted: 1, paged: 0 });
  }
  assert.equal(p.sent.length, 1, "told once, never at every read");
});

test("a page that did not go is tried again at the next read, and nothing parted pages nothing", async () => {
  const w = world([PARTED]);
  const refused = await withEnv(ADDRESSED, () => pageChatsParted(w.db, T, { send: async () => false }));
  assert.deepEqual(refused, { parted: 1, paged: 0 });
  const p = pager();
  assert.deepEqual(await withEnv(ADDRESSED, () => pageChatsParted(w.db, T, { send: p.send })), { parted: 1, paged: 1 });
  const quiet = world([TOGETHER, FEW]);
  assert.deepEqual(await withEnv(ADDRESSED, () => pageChatsParted(quiet.db, T, { send: p.send })), {
    parted: 0,
    paged: 0,
  });
  assert.equal(p.sent.length, 1);
});

test("a read of the counts that fails costs the account's read nothing: it pages nobody, and says so in the log", async () => {
  const db = fakeDb(
    { operator_pages: [] },
    {},
    {
      ad_chats_kept: () => {
        throw Object.assign(new Error("the counts could not be read"), { code: "57014" });
      },
    },
  );
  const p = pager();
  assert.deepEqual(await withEnv(ADDRESSED, () => pageChatsParted(db, T, { send: p.send })), { parted: 0, paged: 0 });
  assert.equal(p.sent.length, 0);
  // A database a deploy behind has no such read (PostgREST's PGRST202): nothing is parted, nothing is wrong.
  const behind = fakeDb(
    { operator_pages: [] },
    {},
    {
      ad_chats_kept: () => {
        throw Object.assign(new Error("Could not find the function public.ad_chats_kept"), { code: "PGRST202" });
      },
    },
  );
  assert.deepEqual(await withEnv(ADDRESSED, () => pageChatsParted(behind, T, { send: p.send })), {
    parted: 0,
    paged: 0,
  });
});
