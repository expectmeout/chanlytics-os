/**
 * One person in full, in one round -- run, not pinned.
 *
 * Measured on production (23 Sep 2026, the salon): one person with one message took 0.3-1.3 s where the whole People
 * list took 0.26-0.31 s, because the route read in four rounds, each waiting for the last: the row, then thirteen
 * reads, then the messages, then the calendar (and the calendar's own server, every five minutes). Here the database
 * holds its answers until the test lets them go, so what the route asked for before any answer came back is the
 * round, and the calendar's feed is scripted like calendar-feed.test.mjs's.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { loadFeed, forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
const person = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "11111111-1111-4111-8111-111111111111";
const C1 = "cccccccc-1111-4111-8111-cccccccccccc";
const TZ = "America/New_York";
const URL_ = "https://cal.example/harbor.ics";
const USER = "u1";

/** A scripted network: the feed answers what the test says (now, or when it is let go), and every call is counted. */
const realFetch = globalThis.fetch;
let fetched = [];
let feedBody = "";
let feedHeld = null;
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  if (feedHeld) await feedHeld.promise;
  return new Response(feedBody, { status: 200, headers: { "content-type": "text/calendar" } });
};
after(() => {
  globalThis.fetch = realFetch;
});
const holdFeed = () => {
  let open;
  const promise = new Promise((r) => {
    open = r;
  });
  feedHeld = { promise, open };
  return () => {
    feedHeld = null;
    open();
  };
};
beforeEach(() => {
  forgetFeeds();
  fetched = [];
  feedHeld = null;
  setRateStore(memoryStore());
});

/** An appointment two days from now naming them by their number, so the match is the board's own. */
const stamp = (ms) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const soon = Date.now() + 2 * 86_400_000;
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:v1",
  "SUMMARY:Ada Lovelace · Colour",
  "DESCRIPTION:Ada Lovelace +1 (917) 555-0100",
  `DTSTART:${stamp(soon)}`,
  `DTEND:${stamp(soon + 3_600_000)}`,
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: T, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: TZ, sells_by: null }],
  tenant_config: [
    {
      tenant_id: T,
      config: {
        calendar: { ical_url: URL_ },
        brain: {
          business_name: "Harbor",
          booking_link: "https://book.example/harbor",
          system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
        },
      },
    },
  ],
  contacts: [{ id: P1, tenant_id: T, phone_e164: "+19175550100", display_name: "Ada Lovelace", notes: null }],
  contact_identities: [
    { contact_id: P1, channel: "whatsapp", external_id: "19175550100", created_at: "2026-08-01T00:00:00Z" },
  ],
  conversations: [
    {
      id: C1,
      tenant_id: T,
      contact_id: P1,
      state: "open",
      paused_until: null,
      last_wa_inbound_at: "2026-09-20T15:00:00Z",
      last_message_at: "2026-09-20T15:00:00Z",
    },
  ],
  messages: [
    {
      id: "m1",
      conversation_id: C1,
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Can I come at eleven?",
      status: "received",
      created_at: "2026-09-20T15:00:00Z",
    },
  ],
  escalations: [],
  decisions: [],
  calls: [],
  policies: [],
  events: [],
  deals: [],
});
const row = { id: P1, display_name: "Ada Lovelace", phone_e164: "+19175550100", consent: "opted_in", dnc: false };
const rpcs = { people_list: (a) => (a.p_tenant_id === T && a.p_contact_id === P1 ? [row] : []) };

/**
 * The database with its answers held: a read (or a door) whose name `held(name)` picks waits until `release()`; every
 * read is recorded as it is asked for. Who is asking is never held: the route's own door reads memberships first.
 */
function heldDb(held) {
  const db = fakeDb(tables(), {}, rpcs);
  const asked = [];
  const waits = [];
  let holding = true;
  const settle = (name, run) => (resolve, reject) => {
    asked.push(name);
    if (!holding || !held(name)) return run().then(resolve, reject);
    return new Promise((open) => waits.push(open)).then(run).then(resolve, reject);
  };
  const wrap = (name, b) =>
    new Proxy(b, {
      get(t, k) {
        if (k === "then") return settle(name, () => new Promise((r, j) => t.then(r, j)));
        if (k === "single" || k === "maybeSingle") return () => ({ then: settle(name, () => t[k]()) });
        const v = t[k];
        return typeof v === "function" ? (...a) => wrap(name, v.apply(t, a)) : v;
      },
    });
  const supabase = {
    ...db,
    from: (table) => (table === "memberships" ? db.from(table) : wrap(table, db.from(table))),
    rpc: (n, a) => wrap(`rpc:${n}`, db.rpc(n, a)),
  };
  return {
    asked,
    supabase,
    release() {
      holding = false;
      for (const open of waits.splice(0)) open();
    },
  };
}
const ticks = async (n = 40) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
const open = (supabase) =>
  person.GET.run(new Request(`http://localhost/api/v1/contacts/${P1}?workspace=${T}`), {
    supabase,
    userId: USER,
    email: "ada@example.com",
    params: { id: P1 },
  });

test("every read keyed on the person is asked for before any answers: one round, not four", async () => {
  feedBody = ICS;
  const db = heldDb(() => true);
  const answer = open(db.supabase);
  await ticks();
  const first = new Set(db.asked);
  for (const read of [
    "rpc:people_list",
    "contact_identities",
    "conversations",
    "calls",
    "policies",
    "events",
    "contacts",
    "tenant_config",
    "deals",
    "tenants",
  ])
    assert.ok(first.has(read), `REGRESSION: ${read} waited for an earlier round (asked: ${[...first].join(", ")})`);
  assert.ok(!first.has("messages"), "their messages wait for their conversations' ids, and only for those");

  db.release();
  const { person: p } = await answer;
  assert.equal(p.row.id, P1);
  assert.equal(p.conversations.length, 1);
  assert.equal(p.conversations[0].messages.length, 1, "the messages still land in their thread");
  assert.equal(p.visits?.state, "ok", "and the visits in theirs");
  assert.equal(p.visits.all.length, 1);
});

test("the calendar's feed is fetched while their row is still out, and matched once it lands", async () => {
  feedBody = ICS;
  const db = heldDb((name) => name === "rpc:people_list");
  const answer = open(db.supabase);
  await ticks();
  assert.deepEqual(fetched, [URL_], "REGRESSION: the feed waited for the row, then for the messages");
  assert.ok(db.asked.includes("messages"), "and their messages were read without waiting for the row either");
  db.release();
  const { person: p } = await answer;
  assert.equal(p.visits.state, "ok");
  assert.equal(p.visits.all.length, 1, "their appointment, found by the number in it");
});

test("a person not in the workspace is still a 404, with nothing read put together", async () => {
  const db = heldDb(() => false);
  await assert.rejects(
    person.GET.run(
      new Request(`http://localhost/api/v1/contacts/22222222-2222-4222-8222-222222222222?workspace=${T}`),
      {
        supabase: db.supabase,
        userId: USER,
        email: "ada@example.com",
        params: { id: "22222222-2222-4222-8222-222222222222" },
      },
    ),
    (e) => e.code === "not_found" && e.status === 404,
  );
});

/** Time, movable: the loader's caches are keyed on Date.now(). */
async function later(ms, fn) {
  const real = Date.now;
  Date.now = () => real() + ms;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

test("a person's visits take the last good feed while a new one is fetched behind it; an opening never does", async () => {
  feedBody = "BEGIN:VCALENDAR\r\nX-WR-CALNAME:first\r\nEND:VCALENDAR";
  assert.match((await loadFeed(T, URL_)).text, /first/);
  assert.equal(fetched.length, 1);

  // Six minutes on: past the cache. The calendar's server is slow today.
  feedBody = "BEGIN:VCALENDAR\r\nX-WR-CALNAME:second\r\nEND:VCALENDAR";
  const letGo = holdFeed();
  const stale = await later(6 * 60_000, () => loadFeed(T, URL_, { stale: true }));
  assert.match(stale.text, /first/, "REGRESSION: the profile waited on the calendar's server every five minutes");
  assert.equal(fetched.length, 2, "and the new read went out behind it");
  await later(6 * 60_000, () => loadFeed(T, URL_, { stale: true }));
  assert.equal(fetched.length, 2, "one fetch behind at a time");

  // Availability, past the cache, waits for the new week: an opening offered from an old one is a double booking.
  let waited = false;
  const exact = later(6 * 60_000, () => loadFeed(T, URL_)).then((r) => {
    waited = true;
    return r;
  });
  await ticks(5);
  assert.equal(waited, false, "an exact read waits for the calendar");
  letGo();
  assert.match((await exact).text, /second/);
  await ticks(5);
  assert.match(
    (await later(6 * 60_000, () => loadFeed(T, URL_, { stale: true }))).text,
    /second/,
    "then everyone has it",
  );
});

test("a feed older than half an hour is not handed to anyone: the profile waits for it too", async () => {
  feedBody = "BEGIN:VCALENDAR\r\nX-WR-CALNAME:first\r\nEND:VCALENDAR";
  await loadFeed(T, URL_);
  feedBody = "BEGIN:VCALENDAR\r\nX-WR-CALNAME:second\r\nEND:VCALENDAR";
  const r = await later(31 * 60_000, () => loadFeed(T, URL_, { stale: true }));
  assert.match(r.text, /second/, "a week that old is fetched, not guessed at");
  assert.equal(fetched.length, 2);
});
