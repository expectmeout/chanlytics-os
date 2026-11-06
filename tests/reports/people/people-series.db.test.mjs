/**
 * 00395 on a real Postgres: people_series, the People lens's own read (Reports). Who reached the business in the days
 * picked and the same number before them (people, not messages; new and known; on which channel), how the new ones
 * first came, the yeses and stops recorded, the email addresses that stopped working, and the steps done, each part by
 * the workspace's own day. Counts only, never a name.
 * Each test builds its own small world under its own workspace and removes it.
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

let db;
const tenants = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * 60_000);
/** `hour:min` UTC on the day `n` days before today's UTC date. */
const dayAt = (n, hour, min = 0) => {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - n, hour, min));
};
/** The calendar day `n` days from a "YYYY-MM-DD". */
const dayFrom = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const EAST = "Pacific/Auckland";
/** The wall clock of an instant in `timeZone`, as the milliseconds the same reading would be in UTC. */
const wallClock = (date, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
};
/** The instant at which `timeZone`'s clock reads `hour:min` on `day` ("YYYY-MM-DD"). */
const localAt = (day, hour, min, timeZone = EAST) => {
  const reading = Date.parse(`${day}T00:00:00Z`) + (hour * 60 + min) * 60_000;
  let at = reading;
  for (let i = 0; i < 3; i += 1) at = reading - (wallClock(new Date(at), timeZone) - at);
  return new Date(at);
};

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of tenants) {
    // events keep no foreign key to their workspace: they are removed by hand
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

async function workspace(slug, timezone = "UTC") {
  const tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `${slug}-${Date.now()}`, name: "Harbor People", timezone })
      .select("id")
      .single(),
  ).id;
  tenants.push(tenantId);
  return { tenantId };
}

let seq = 0;
/** One person with their one conversation; `over` says the rest of the contact. */
async function person(w, over = {}) {
  seq += 1;
  const contact = ok(
    await db
      .from("contacts")
      .insert({
        tenant_id: w.tenantId,
        phone_e164: `+1555014${String(seq).padStart(4, "0")}`,
        display_name: "Harbor Guest",
        ...over,
      })
      .select("id")
      .single(),
  ).id;
  const conv = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: w.tenantId, contact_id: contact, state: "open", last_message_at: ago(1).toISOString() })
      .select("id")
      .single(),
  ).id;
  return { contact, conv };
}
const erased = () => ({ erased_at: new Date().toISOString() });

/** A message of a person's thread at `at`; `over` says the rest. */
const msg = (w, p, at, over) => ({
  tenant_id: w.tenantId,
  conversation_id: p.conv,
  contact_id: p.contact,
  channel: "whatsapp",
  type: "text",
  body: "hi",
  meta: {},
  created_at: at.toISOString(),
  ...over,
});
const inbound = (w, p, at, over = {}) =>
  msg(w, p, at, {
    direction: "inbound",
    sender: "customer",
    status: "received",
    channel_ts: at.toISOString(),
    ...over,
  });
const outbound = (w, p, at, sender, over = {}) =>
  msg(w, p, at, { direction: "outbound", sender, status: "sent", ...over });

let callSeq = 0;
const call = (w, p, at, over = {}) => ({
  tenant_id: w.tenantId,
  retell_call_id: `harbor-people-call-${Date.now()}-${(callSeq += 1)}`,
  contact_id: p.contact,
  conversation_id: p.conv,
  direction: "inbound",
  status: "ended",
  duration_ms: 60_000,
  started_at: at.toISOString(),
  ...over,
});

const event = (w, p, kind, at, data) => ({
  tenant_id: w.tenantId,
  kind,
  category: "contact",
  subject_type: "contact",
  subject_id: p.contact,
  data,
  created_at: at.toISOString(),
});
/** What the consent doors write: no `purpose` is the answer about their visit, `marketing` offers, `email_marketing` email offers. */
const answer = (w, p, at, consent, source, purpose) =>
  event(w, p, "contact.consent_changed", at, { consent, source, ...(purpose ? { purpose } : {}) });

const insert = async (table, rows) => ok(await db.from(table).insert(rows).select("id"));
const series = async (w, args = { p_days: 7 }) =>
  ok(await db.rpc("people_series", { p_tenant_id: w.tenantId, ...args }));

/**
 * Test 1's people and what they sent: A, B, E and M reached the business in the last seven days, K, L and M in the
 * seven before; with `others` the ones who never count (H erased, I merged away, J moved in) are there too.
 */
async function reachWorld(w, others = true) {
  const who = {};
  for (const key of "ABCDEFGKLM") who[key] = await person(w);
  const email = { channel: "email" };
  const writes = [
    ["A", dayAt(2, 9)],
    ["A", dayAt(2, 10)],
    ["A", dayAt(1, 9)],
    ["A", dayAt(1, 11), email],
    ["B", dayAt(1, 12), email],
    ["B", dayAt(30, 12)],
    ["C", dayAt(1, 8), { ...email, meta: { email: { claim: "auto_reply" } } }],
    ["K", dayAt(9, 10)],
    ["L", dayAt(10, 10)],
    ["L", dayAt(40, 10)],
    ["M", dayAt(9, 9)],
    ["M", dayAt(2, 9)],
  ];
  const rows = writes.map(([key, at, over]) => inbound(w, who[key], at, over));
  rows.push(outbound(w, who.D, dayAt(1, 8), "ai"));
  if (others) {
    who.H = await person(w, erased());
    who.I = await person(w, { merged_into_contact_id: who.A.contact });
    who.J = await person(w);
    rows.push(inbound(w, who.H, dayAt(1, 9)), inbound(w, who.I, dayAt(1, 9)));
    rows.push(inbound(w, who.J, dayAt(1, 9), { meta: { backfill: "true" } }));
  }
  await insert("messages", rows);
  await insert("calls", [
    call(w, who.E, dayAt(3, 15)), // E phoned and was answered
    call(w, who.F, dayAt(2, 15), { status: "not_connected", duration_ms: null }), // F's dial nobody took
    call(w, who.G, dayAt(2, 16), { direction: "outbound" }), // G was rung by the business
  ]);
  return who;
}

test("who reached you: people, not messages; new and known; now and before", { skip }, async () => {
  const w = await workspace("harbor-people-reached");
  await reachWorld(w);

  const r = await series(w);
  assert.deepEqual(r.reached, {
    now: { people: 4, new: 2 }, // A, B, E, M; new A and E
    before: { people: 3, new: 2 }, // K, L, M; new K and M
  });
  assert.equal(r.timezone, "UTC");
  assert.equal(r.days, 7);
});

test(
  "by channel, as people: a person is in each channel they reached you on; and the new count is the one Reports and Today say",
  { skip },
  async () => {
    const w = await workspace("harbor-people-channels");
    await reachWorld(w, false);

    const r = await series(w);
    assert.deepEqual(r.by_channel, {
      now: { whatsapp: 2, sms: 0, email: 2, voice: 1 }, // A and M; none; A and B; E
      before: { whatsapp: 3, sms: 0, email: 0, voice: 0 }, // K, L and M
    });
    assert.ok(
      r.by_channel.now.whatsapp + r.by_channel.now.sms + r.by_channel.now.email + r.by_channel.now.voice >=
        r.reached.now.people,
      "a person is counted in each channel, so the channels add to at least the people",
    );

    const reports = ok(await db.rpc("report_series", { p_tenant_id: w.tenantId, p_days: 7 }));
    const overview = reports.series.slice(-7).reduce((sum, d) => sum + d.new_contacts, 0);
    const today = ok(await db.rpc("metrics_summary", { p_tenant_id: w.tenantId, p_days: 7 }));
    assert.equal(r.reached.now.new, 2);
    assert.equal(r.reached.now.new, overview, "Overview's New people counts the same people");
    assert.equal(r.reached.now.new, today.period.new_contacts, "Today's New people counts the same people");
  },
);

test(
  "how they first came: the new people of the window by acquired_via, null as unknown, the known and the erased left out",
  { skip },
  async () => {
    const w = await workspace("harbor-people-via");
    const via = { X1: "whatsapp", X2: "whatsapp", X3: "call", X4: "ad", X5: null, Y: "manual", Z: "import" };
    const who = {};
    for (const key of Object.keys(via)) who[key] = await person(w, key === "Z" ? erased() : {});
    const rows = Object.keys(via).map((key, i) => inbound(w, who[key], dayAt(2, 8 + i)));
    rows.push(inbound(w, who.Y, dayAt(30, 10))); // Y wrote a month ago: known, whatever way they came
    await insert("messages", rows);
    // The message's own door stamps the wire; the update says the way each came.
    for (const [key, how] of Object.entries(via)) {
      ok(await db.from("contacts").update({ acquired_via: how }).eq("id", who[key].contact));
    }

    const r = await series(w);
    assert.deepEqual(r.first_came.by_via, { whatsapp: 2, call: 1, ad: 1, unknown: 1 });
    assert.equal(
      Object.values(r.first_came.by_via).reduce((sum, n) => sum + n, 0),
      r.reached.now.new,
      "the ways add up to the new people",
    );
    assert.equal(r.reached.now.new, 5);
    assert.equal(r.reached.now.people, 6, "Y reached us too: known, not counted in the ways");
  },
);

test(
  "yeses and stops: one a person, a kind of message and an answer; a merge and a stop are no person's own; live people only",
  { skip },
  async () => {
    const w = await workspace("harbor-people-consent");
    const who = {};
    for (const key of ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11"]) {
      who[key] = await person(w, key === "P7" ? erased() : {});
    }
    const said = (key, at, consent, source, purpose) => answer(w, who[key], at, consent, source, purpose);
    await insert("events", [
      said("P1", dayAt(2, 9), "opted_in", "customer_message"),
      said("P1", dayAt(1, 9), "opted_in", "customer_message"), // the same answer again: still one
      said("P1", dayAt(2, 10), "opted_in", "form", "marketing"),
      said("P2", dayAt(2, 8), "opted_in", "merge"), // a merge restating an answer is no one's own: the source is not "merge"
      said("P2", dayAt(2, 9), "opted_in", "in_person"),
      said("P3", dayAt(2, 9), "unknown", "operator"), // a member resetting the answer is neither a yes nor a stop
      said("P3", dayAt(2, 10), "opted_in", "customer_message", "reminders"), // a kind of message this lens has no word for
      said("P4", dayAt(2, 9), "opted_out", "customer_message"),
      said("P4", dayAt(1, 9), "opted_out", "carrier"), // a later word for the same stop: the first source stands
      said("P5", dayAt(2, 9), "opted_out", "carrier"),
      said("P6", dayAt(2, 9), "opted_out", "unsubscribe", "email_marketing"),
      said("P6", dayAt(2, 10), "unknown", "stop", "marketing"), // a stop ending a yes to offers: not a stop of theirs
      said("P7", dayAt(2, 9), "opted_in", "customer_message"), // erased
      said("P10", dayAt(2, 9), "opted_in", "customer_message"),
      said("P10", dayAt(2, 10), "opted_out", "customer_message"), // changed their answer: once in each
      said("P11", dayAt(2, 9), "opted_in"), // a yes nobody put a source to: counted, as `unknown`
      said("P8", dayAt(9, 9), "opted_in", "customer_message"), // before the window
      said("P9", dayAt(9, 9), "opted_out", "customer_message"),
      said("P9", dayAt(9, 10), "opted_out", "form", "marketing"),
    ]);

    const r = await series(w);
    assert.deepEqual(r.consent.now.yes, {
      total: 5,
      by_source: { customer_message: 2, form: 1, in_person: 1, unknown: 1 },
      by_purpose: { messages: 4, offers: 1, email_offers: 0 },
    });
    assert.deepEqual(r.consent.now.stop, {
      total: 4,
      by_source: { customer_message: 2, carrier: 1, unsubscribe: 1 },
      by_purpose: { messages: 3, offers: 0, email_offers: 1 },
    });
    assert.deepEqual(r.consent.before, { yes: 1, stop: 2 });
  },
);

test("email that stopped working: a person once, by the first reason, live people only", { skip }, async () => {
  const w = await workspace("harbor-people-email");
  const [p1, p2, p3, p4, p5] = [
    await person(w),
    await person(w),
    await person(w, erased()),
    await person(w),
    await person(w),
  ];
  const stopped = (p, at, reason) => event(w, p, "contact.email_suppressed", at, { reason });
  await insert("events", [
    stopped(p1, dayAt(2, 9), "hard_bounce"),
    stopped(p1, dayAt(1, 9), "complaint"), // the second word about the same person
    stopped(p2, dayAt(2, 9), "complaint"),
    stopped(p3, dayAt(2, 9), "provider"), // erased
    stopped(p4, dayAt(9, 9), "hard_bounce"), // before the window
    stopped(p5, dayAt(2, 9)), // a person nobody gave a reason for: counted, as `unknown`
  ]);

  const r = await series(w);
  assert.deepEqual(r.email_stopped, { total: 3, by_reason: { hard_bounce: 1, complaint: 1, unknown: 1 } });
});

test("steps done in the workspace's own day: on its day or before is on time, after is late", { skip }, async () => {
  const w = await workspace("harbor-people-steps", EAST);
  const { today } = await series(w);
  const day = dayFrom(today, -3); // the day of the steps, in Auckland
  const who = {};
  for (const key of ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]) who[key] = await person(w);
  const step = (key, due, doneAt) => ({
    tenant_id: w.tenantId,
    contact_id: who[key].contact,
    body: `step ${key}`,
    team_only: true,
    due_on: due,
    done_at: doneAt ? doneAt.toISOString() : null,
  });
  await insert("person_notes", [
    step("S1", day, localAt(day, 23, 30)), // done at 23:30 on its day: on time
    step("S2", day, localAt(dayFrom(day, 1), 0, 30)), // done at 00:30 the day after: late, though on the same UTC day
    step("S3", dayFrom(day, 1), localAt(dayFrom(day, -2), 10, 0)), // done early: on time
    step("S4", day, null), // still open
    step("S5", dayFrom(today, -41), new Date(Date.now() - 40 * 86_400_000)), // done 40 days ago
    step("S6", day, localAt(day, 10, 0)), // done, but the person is erased below
    step("S7", day, localAt(day, 9, 0)), // done on time, but the record is marked merged below
  ]);
  ok(await db.from("contacts").update(erased()).eq("id", who.S6.contact)); // an erasure deletes the person's notes
  // A merged-away record is marked, and nothing moves its note (the merge door would): only "live" keeps it out.
  ok(await db.from("contacts").update({ merged_into_contact_id: who.S4.contact }).eq("id", who.S7.contact));

  const r = await series(w);
  assert.deepEqual(r.steps, { done: 3, on_time: 2 });
  assert.equal(r.timezone, EAST);
});

test("a window that ended, a zone east of UTC, a workspace with nothing, an unknown workspace", { skip }, async () => {
  const w = await workspace("harbor-people-ended");
  const [p, q, o] = [await person(w), await person(w), await person(w)];
  const { today } = await series(w);
  await insert("messages", [
    inbound(w, p, dayAt(4, 12)), // inside the window that ended three days ago
    inbound(w, q, dayAt(1, 11)), // after it
    inbound(w, o, dayAt(12, 12)), // its period before
  ]);
  await insert("calls", [call(w, q, dayAt(1, 12))]); // q phoned after it, too
  const ended = await series(w, { p_days: 7, p_end: dayFrom(today, -3) });
  assert.equal(ended.end, dayFrom(today, -3));
  assert.equal(ended.today, today, "today is still the real one");
  assert.equal(ended.days, 7);
  assert.deepEqual(ended.reached, { now: { people: 1, new: 1 }, before: { people: 1, new: 1 } }, "p, then o");

  const now = await series(w);
  assert.equal(now.end, today);
  assert.deepEqual(now.reached, { now: { people: 2, new: 2 }, before: { people: 1, new: 1 } }, "p and q, then o");
  const future = await series(w, { p_days: 7, p_end: dayFrom(today, 5) });
  assert.deepEqual(future, now, "a day that has not come is read as today");

  // A zone east of UTC: the window's first day starts at the workspace's midnight, not UTC's.
  const east = await workspace("harbor-people-east", EAST);
  const [late, early] = [await person(east), await person(east)];
  const local = (await series(east)).today;
  await insert("messages", [
    inbound(east, late, localAt(dayFrom(local, -7), 23, 50)), // ten minutes before the window
    inbound(east, early, localAt(dayFrom(local, -6), 0, 10)), // ten minutes into it
  ]);
  const edge = await series(east);
  assert.deepEqual(edge.reached, { now: { people: 1, new: 1 }, before: { people: 1, new: 1 } });

  // A workspace with nothing answers every count with a zero, and no error.
  const none = await series(await workspace("harbor-people-bare"));
  const noOne = { total: 0, by_source: {}, by_purpose: { messages: 0, offers: 0, email_offers: 0 } };
  assert.equal(none.error, undefined);
  assert.deepEqual(none.reached, { now: { people: 0, new: 0 }, before: { people: 0, new: 0 } });
  assert.deepEqual(none.by_channel, {
    now: { whatsapp: 0, sms: 0, email: 0, voice: 0 },
    before: { whatsapp: 0, sms: 0, email: 0, voice: 0 },
  });
  assert.deepEqual(none.first_came, { by_via: {} });
  assert.deepEqual(none.consent, { now: { yes: noOne, stop: noOne }, before: { yes: 0, stop: 0 } });
  assert.deepEqual(none.email_stopped, { total: 0, by_reason: {} });
  assert.deepEqual(none.steps, { done: 0, on_time: 0 });

  const unknown = ok(await db.rpc("people_series", { p_tenant_id: crypto.randomUUID() }));
  assert.deepEqual(unknown, { error: "unknown_tenant" });

  // Not an anonymous visitor's to call: the grant is a signed-in member's (RLS then decides what they read).
  if (ANON) {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const refused = await anon.rpc("people_series", { p_tenant_id: w.tenantId });
    assert.ok(refused.error, "anon may not call it");
    assert.equal(refused.data, null);
  }
});
