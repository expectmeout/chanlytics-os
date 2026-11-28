/**
 * The website form door's limit (00726; the whole-system plan of 28 Nov 2026, lane 3, M3), run as Vercel runs the door
 * over a database in memory: one key's entries in a minute and one site's in an hour are counted by the house's limiter
 * (take_rate). Past either, an entry is KEPT, held for a look: the site is answered ok as for any other, no person is
 * made, and nothing it owes starts (no note, no notice, no drafted reply, no email to confirm) until a member lets it
 * through. Nothing is dropped and no visitor is refused; a count that cannot be read holds nobody.
 *
 * And the door's other rule of 00726, through the same door: an entry sent with an id its form already has, with other
 * words, is kept once under that id as sent, however much later its site sends it again (the outside review's four
 * rows).
 *
 * The SQL itself (form_entry_take's held entry, form_entry_let_through for a site's) is proved on the database by
 * a-site-s-entry-is-the-same-entry-for-good.db.test.mjs.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { newWebsiteFormKey, websiteFormKeyHash } from "@chanlytics/channels/tokens";
import { fakeDb } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";
import { deliver, formEntryDoors } from "../../people/doors/_form-entries.mjs";

const SERVICE_KEY = "service-role-key-for-this-file";
for (const k of ["RESEND_API_KEY", "LEAD_TO", "LEAD_FROM"]) delete process.env[k];
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
process.env.SUPABASE_URL = "https://db.example.supabase.co";
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { POST } = await import(at("apps/edge/api/website-form.ts"));
const { runFormEffect } = await import(at("apps/edge/lib/website/form-effects.ts"));
const { WEBSITE_FORM_LIMITS } = await import(at("apps/edge/lib/website/form-limit.ts"));
const realFetch = globalThis.fetch;
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
  delete process.env.SUPABASE_URL;
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MIN_MS = 60_000;
const firstKey = createHmac("sha256", SERVICE_KEY).update(`website-form:${A}`).digest("base64url");

/** A key of the workspace's own, for the site named: shown once, kept as its hash. */
function ownKey(siteId) {
  const key = newWebsiteFormKey();
  const row = { id: crypto.randomUUID(), tenant_id: A, name: "Main site", hash: websiteFormKeyHash(key), first: false };
  Object.assign(row, { made_by: null, created_at: new Date().toISOString(), last_used_at: null, ends_at: null });
  return { key, row: { ...row, site_id: siteId } };
}

/** A workspace with one site and two keys of it, the limiter counting on the database's own clock. */
function world() {
  const site = { id: crypto.randomUUID(), tenant_id: A, name: "Main site", host: null, first_entry_at: null };
  Object.assign(site, { last_entry_at: null, test_at: null, created_at: new Date().toISOString() });
  const [one, other] = [ownKey(site.id), ownKey(site.id)];
  const clock = { now: Date.now() };
  const resolved = [];
  const hits = [];
  const tables = {
    tenants: [{ id: A, slug: "harbor", name: "Harbor", timezone: "America/New_York" }],
    tenant_config: [{ tenant_id: A, config: {} }],
    tenant_channels: [],
    notifications: [],
    jobs: [],
    events: [],
    form_entries: [],
    form_sites: [site],
    form_keys: [one.row, other.row],
  };
  const resolve = (a) => {
    resolved.push(a);
    return { contact_id: crypto.randomUUID(), outcome: "new", existed: false };
  };
  const limiter = { fails: false };
  const db = fakeDb(
    tables,
    {},
    {
      resolve_person: resolve,
      ...formEntryDoors(tables, { resolve, clock: () => clock.now }),
      person_note_suggest: () => ({ note: { id: crypto.randomUUID() } }),
      // take_rate (00011), as the migration writes it: hits older than the window go, and one more is counted or refused.
      take_rate: (a) => {
        if (limiter.fails)
          throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
        const live = hits.filter(
          (h) => h.bucket === a.p_bucket && h.actor === a.p_actor && h.at > clock.now - a.p_window_ms,
        );
        if (live.length >= a.p_limit) return { allowed: false, retry_after_s: 1 };
        hits.push({ bucket: a.p_bucket, actor: a.p_actor, at: clock.now });
        return { allowed: true, used: live.length + 1 };
      },
    },
  );
  const handed = new Set();
  const settle = () => deliver(tables, (t, id, effect) => runFormEffect(db, t, id, effect), handed);
  return {
    db,
    tables,
    clock,
    resolved,
    hits,
    limiter,
    settle,
    keys: [one.key, other.key],
    entries: tables.form_entries,
  };
}

let w;
beforeEach(() => {
  w = world();
  setPg(w.db);
  globalThis.fetch = async () => new Response("{}", { status: 500 });
});

/** One visitor's request, the nth: its own words and its own id on the site. */
const requestOf = (n, key = w.keys[0]) => ({
  workspace: A,
  key,
  form: "request",
  name: `Visitor ${n}`,
  email: `visitor${n}@example.com`,
  about: "A seat in the spring class",
  note: `Can I start in March? (${n})`,
  entry_id: `site-${n}`,
});
const post = async (body) => {
  const res = await POST(
    new Request("https://edge.example/api/website-form", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { waitUntil: () => {} },
  );
  return [res.status, await res.json()];
};
const held = () => w.entries.filter((entry) => entry.state === "held");

test("a key's entries past its limit in a minute are held: kept, answered ok, and nobody is told", async () => {
  const { limit } = WEBSITE_FORM_LIMITS.key;
  for (let n = 1; n <= limit; n += 1) assert.deepEqual(await post(requestOf(n)), [200, { ok: true, kept: true }]);
  assert.deepEqual(await w.settle(), []);
  assert.deepEqual(
    [w.entries.length, held().length, w.resolved.length],
    [limit, 0, limit],
    "up to the limit, as before",
  );
  const told = w.tables.notifications.length;
  assert.equal(told, limit, "each told its owner");

  assert.deepEqual(
    await post(requestOf(limit + 1)),
    [200, { ok: true, kept: true }],
    "the site is answered as for any",
  );
  assert.deepEqual(await w.settle(), []);
  assert.equal(w.entries.length, limit + 1, "REGRESSION: nothing is dropped");
  const [pile] = held();
  assert.equal(held().length, 1, "the one past the limit is held");
  assert.deepEqual([pile.held_why, pile.contact_id], ["too_many", null], "for a look, with no person yet");
  assert.deepEqual(
    pile.reach,
    { name: `Visitor ${limit + 1}`, email: `visitor${limit + 1}@example.com` },
    "who, as typed",
  );
  assert.equal(w.resolved.length, limit, "no person was made for it");
  assert.equal(w.tables.notifications.length, told, "and nobody was told: no bell, no note, no drafted reply");
  assert.equal(
    w.tables.events.filter((event) => event.subject_id === pile.id).length,
    0,
    "it wrote no event, so nothing it owes has started",
  );
});

test("a held entry sent again is the same held entry, and one already kept is answered as before", async () => {
  const { limit } = WEBSITE_FORM_LIMITS.key;
  for (let n = 1; n <= limit + 1; n += 1) await post(requestOf(n));
  assert.deepEqual(
    await post(requestOf(limit + 1)),
    [200, { ok: true, kept: true }],
    "the site's retry of the held one",
  );
  assert.deepEqual([w.entries.length, held().length], [limit + 1, 1], "one entry, still held");
  assert.deepEqual(await post(requestOf(3)), [200, { ok: true, kept: true }], "a retry of one kept before the flood");
  assert.deepEqual([w.entries.length, held().length], [limit + 1, 1], "is that entry: nothing new, nothing held");
});

test("the limit is a minute's: once it has passed, the key's entries are kept as before", async () => {
  const { limit, windowMs } = WEBSITE_FORM_LIMITS.key;
  for (let n = 1; n <= limit + 3; n += 1) await post(requestOf(n));
  assert.equal(held().length, 3);
  w.clock.now += windowMs + 1000;
  await post(requestOf(900));
  assert.equal(held().length, 3, "the next one is not held");
  assert.equal(w.entries.at(-1).state, "accepted");
});

test("a site's entries past its limit in an hour are held, whichever of its keys sent them", async () => {
  const { key, site } = WEBSITE_FORM_LIMITS;
  // Two keys of one site, each under its own minute's limit, minute after minute: the site's hour is what fills.
  let n = 0;
  while (n < site.limit) {
    for (let k = 0; k < 2 && n < site.limit; k += 1)
      for (let i = 0; i < key.limit && n < site.limit; i += 1) await post(requestOf((n += 1), w.keys[k]));
    w.clock.now += MIN_MS + 1000;
  }
  assert.deepEqual([w.entries.length, held().length], [site.limit, 0], "the site's hour, full");
  await post(requestOf(site.limit + 1, w.keys[1]));
  assert.equal(held().length, 1, "REGRESSION: one more from its other key is held all the same");
  assert.equal(held()[0].key_id, w.tables.form_keys[1].id);
});

test("a test from the site is never counted or held: a developer's tries spend none of its limit", async () => {
  const { limit } = WEBSITE_FORM_LIMITS.key;
  for (let n = 1; n <= limit + 5; n += 1) assert.equal((await post({ ...requestOf(n), test: true }))[0], 200);
  assert.deepEqual([w.hits.length, held().length], [0, 0]);
  await post(requestOf(1));
  assert.equal(w.entries.at(-1).state, "accepted", "its first real entry is kept as any");
});

test("a count that cannot be read holds nobody: the entry is kept and its owner told", async () => {
  w.limiter.fails = true;
  assert.deepEqual(await post(requestOf(1)), [200, { ok: true, kept: true }]);
  assert.deepEqual(await w.settle(), []);
  assert.deepEqual([w.entries.length, held().length, w.tables.notifications.length], [1, 0, 1]);
});

test("the first key, which names no site until it is used, is limited by itself", async () => {
  const { limit } = WEBSITE_FORM_LIMITS.key;
  for (let n = 1; n <= limit + 1; n += 1) await post(requestOf(n, firstKey));
  assert.equal(held().length, 1);
  await post(requestOf(500));
  assert.equal(w.entries.at(-1).state, "accepted", "and spends none of another key's minute");
});

test("the same id with other words, sent again later, is still the same entry (the review's four rows)", async () => {
  const first = { ...requestOf(1), entry_id: "123", note: "Words A" };
  const second = { ...requestOf(1), entry_id: "123", note: "Words B" };
  assert.deepEqual(await post(first), [200, { ok: true, kept: true }], "9:00 id 123 words A: kept");
  w.clock.now += MIN_MS;
  assert.deepEqual(await post(second), [200, { ok: true, kept: true }], "9:01 id 123 words B: kept, a new entry");
  assert.deepEqual(
    w.entries.map((entry) => [entry.ref, entry.sent_ref]),
    [
      ["123", null],
      [null, "123"],
    ],
    "the id stays with the first; the second keeps it as sent",
  );
  w.clock.now += 4 * MIN_MS;
  await post(second);
  assert.equal(w.entries.length, 2, "9:05 the same: again");
  w.clock.now += 25 * MIN_MS;
  await post(second);
  assert.equal(w.entries.length, 2, "REGRESSION: 9:30 the same was a third entry, once ten minutes had passed");
  await post(first);
  assert.equal(w.entries.length, 2, "and the first, sent again, is still the first");
  assert.deepEqual(await w.settle(), []);
  assert.equal(w.tables.notifications.length, 2, "each told its owner once, however often it was sent");
});
