/**
 * 00380 on a real Postgres: receptionist_series, the Receptionist lens's own read (Reports). The receptionist's held
 * replies by what became of them, what customers asked about and in which language, the replies the door refused, how
 * the calls ended, how long a handover took, the calls nobody took and whether anyone answered within an hour, when
 * people write by the workspace's own day and quarter hour, the booking links sent, and what is stuck now.
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
const plus = (d, s) => new Date(d.getTime() + s * 1000);
/** `hour:min` UTC on the day `n` days before today's UTC date. */
const dayAt = (n, hour, min = 0) => {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - n, hour, min));
};
/** The calendar day `n` days from a "YYYY-MM-DD". */
const dayFrom = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

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
      .insert({ slug: `${slug}-${Date.now()}`, name: "Harbor Receptionist", timezone })
      .select("id")
      .single(),
  ).id;
  tenants.push(tenantId);
  return { tenantId };
}

let seq = 0;
/** One person with their one conversation. */
async function person(w, state = "open", conversation = {}) {
  seq += 1;
  const contact = ok(
    await db
      .from("contacts")
      .insert({
        tenant_id: w.tenantId,
        phone_e164: `+1555013${String(seq).padStart(4, "0")}`,
        display_name: "Harbor Guest",
      })
      .select("id")
      .single(),
  ).id;
  const conv = ok(
    await db
      .from("conversations")
      .insert({
        tenant_id: w.tenantId,
        contact_id: contact,
        state,
        last_message_at: ago(1).toISOString(),
        ...conversation,
      })
      .select("id")
      .single(),
  ).id;
  return { contact, conv };
}

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
/** One of the receptionist's held drafts, as queueDraft writes it (draft-queue.ts). */
const draft = (w, p, at, source, over = {}) =>
  outbound(w, p, at, "ai", { meta: { source, delay_ms: 60_000, language: "en" }, ...over });

let callSeq = 0;
const call = (w, p, at, over = {}) => ({
  tenant_id: w.tenantId,
  retell_call_id: `harbor-call-${Date.now()}-${(callSeq += 1)}`,
  contact_id: p ? p.contact : null,
  conversation_id: p ? p.conv : null,
  direction: "inbound",
  status: "ended",
  duration_ms: 60_000,
  started_at: at.toISOString(),
  ...over,
});
const miss = (w, p, at, over = {}) => call(w, p, at, { status: "not_connected", duration_ms: null, ...over });

const event = (w, kind, at, data, messageId = null) => ({
  tenant_id: w.tenantId,
  kind,
  category: "message",
  subject_type: messageId ? "message" : null,
  subject_id: messageId,
  data,
  created_at: at.toISOString(),
});

const escalation = (w, p, at, over = {}) => ({
  tenant_id: w.tenantId,
  conversation_id: p.conv,
  reason: "human_token",
  state: "open",
  created_at: at.toISOString(),
  ...over,
});

const insert = async (table, rows) => ok(await db.from(table).insert(rows).select("id"));
const series = async (w, args = { p_days: 7 }) =>
  ok(await db.rpc("receptionist_series", { p_tenant_id: w.tenantId, ...args }));

test("the hold: each held draft is counted once by what became of it", { skip }, async () => {
  const w = await workspace("harbor-recep-hold");
  const p = await person(w);
  const cancelled = (error) => ({ status: "canceled", error });
  await insert("messages", [
    draft(w, p, ago(10), "veto_window"), // A: it went out
    draft(w, p, ago(11), "veto_window", { status: "delivered" }), // B: it went out and arrived
    draft(w, p, ago(12), "veto_window", cancelled(null)), // C: the owner cancelled it
    draft(w, p, ago(13), "veto_window", cancelled({ reason: "steered", replaced_by: "x" })), // D: rewritten
    draft(w, p, ago(14), "veto_window", cancelled({ reason: "superseded_by_newer_message" })), // E
    draft(w, p, ago(15), "veto_window", cancelled({ reason: "superseded_by_human" })), // F
    draft(w, p, ago(16), "veto_window", { status: "queued" }), // G: still held
    draft(w, p, ago(17), "veto_window", { status: "failed", error: { reason: "send_failed" } }), // H
    draft(w, p, ago(18), "low_confidence"), // I: held for the owner's look, and went out
    draft(w, p, ago(19), "steered"), // J: the rewrite's replacement: the continuation of D, not counted again
    draft(w, p, dayAt(10, 12), "veto_window"), // before the window, inside the period before it (7 to 14 days)
  ]);

  const r = await series(w);
  assert.deepEqual(r.hold.now, {
    total: 9,
    sent: 3,
    canceled: 1,
    steered: 1,
    overtaken: 1,
    person_first: 1,
    waiting: 1,
    other: 1,
    low_confidence: 1,
  });
  assert.deepEqual(r.hold.before, { total: 1, sent: 1 });

  // A refusal at the door (the person said stop) is neither a cancel nor a rewrite: it is "other", and it counts.
  await insert("messages", [draft(w, p, ago(20), "veto_window", cancelled({ reason: "opted_out" }))]);
  const again = await series(w);
  assert.equal(again.hold.now.total, 10);
  assert.equal(again.hold.now.other, 2, "a refusal and a failure");
  assert.equal(again.hold.now.canceled, 1, "only the owner's own cancel");
});

test("topics, languages, blocked and call endings", { skip }, async () => {
  const w = await workspace("harbor-recep-mix");
  const p = await person(w);
  const q = await person(w);
  await insert("messages", [
    inbound(w, p, ago(100), { meta: { intent: "booking" } }),
    inbound(w, p, ago(99), { meta: { intent: "booking" } }),
    inbound(w, p, ago(98), { meta: { intent: "pricing" } }),
    inbound(w, q, ago(97), { channel: "sms", meta: { intent: "booking" } }),
    inbound(w, q, ago(96), { meta: {} }),
    inbound(w, q, ago(95), { channel: "email", meta: {} }),
    inbound(w, q, ago(94), { channel: "email", meta: { email: { claim: "automated" } } }),
    // The words the receptionist wrote, and what it did not send: not a reply that left, so no language.
    outbound(w, p, ago(90), "ai", { meta: { language: "en" } }),
    outbound(w, p, ago(89), "ai", { status: "delivered", meta: { language: "en" } }),
    outbound(w, p, ago(88), "ai", { status: "read", meta: { language: "es" } }),
    outbound(w, p, ago(87), "ai", { meta: {} }),
    outbound(w, p, ago(86), "ai", { status: "queued", meta: { language: "fr" } }),
    outbound(w, p, ago(85), "human", { meta: { language: "de" } }),
  ]);
  const blocked = (reason, purpose, at = ago(60)) => event(w, "message.send_blocked", at, { reason, purpose });
  await insert("events", [
    blocked("human_has_it", "conversational"),
    blocked("human_has_it", "conversational"),
    blocked("opted_out", "conversational"),
    blocked("superseded_by_human", "conversational"), // the hold counts it
    blocked("opted_out", "marketing"), // a broadcast's, not a reply's
    blocked("human_has_it", "conversational", dayAt(40, 12)), // 40 days ago
  ]);
  await insert("calls", [
    call(w, p, ago(80), { disconnection_reason: "user_hangup" }),
    call(w, p, ago(79), { disconnection_reason: "user_hangup" }),
    call(w, p, ago(78), { disconnection_reason: "agent_hangup" }),
    call(w, p, ago(77), { disconnection_reason: null }),
    miss(w, p, ago(76), { disconnection_reason: "dial_no_answer" }), // never connected: it has no ending
  ]);

  const r = await series(w);
  assert.deepEqual(r.topics, { of: 5, stamped: 4, by_intent: { booking: 3, pricing: 1 } });
  assert.deepEqual(r.languages, { of: 4, stamped: 3, by_language: { en: 2, es: 1 } });
  assert.deepEqual(r.blocked, { total: 3, by_reason: { human_has_it: 2, opted_out: 1 } });
  assert.deepEqual(r.call_endings, { total: 4, by_reason: { user_hangup: 2, agent_hangup: 1, unknown: 1 } });

  // The email-only case: email is in neither topics nor languages, so a workspace that only has email asks nothing of them.
  const mail = await workspace("harbor-recep-mail");
  const m = await person(mail);
  await insert("messages", [
    inbound(mail, m, ago(50), { channel: "email", meta: { intent: "booking" } }),
    inbound(mail, m, ago(49), { channel: "email", meta: {} }),
  ]);
  const only = await series(mail);
  assert.deepEqual(only.topics, { of: 0, stamped: 0, by_intent: {} });
});

test("a handover: your first reply, and how long it took to settle", { skip }, async () => {
  const w = await workspace("harbor-recep-handover");
  const [p1, p2, p3, p4, p5, p6] = [
    await person(w, "open"),
    await person(w, "open"),
    await person(w, "needs_human", { paused_until: plus(new Date(), 7200).toISOString() }),
    await person(w, "open"),
    await person(w, "open"),
    await person(w, "open"),
  ];
  const c1 = dayAt(2, 10);
  const c2 = dayAt(3, 10);
  const c3 = dayAt(4, 10);
  const c4 = dayAt(2, 11);
  const c5 = dayAt(1, 9);
  const c6 = dayAt(12, 10);
  await insert("escalations", [
    escalation(w, p1, c1, { state: "resolved", resolved_at: plus(c1, 3600).toISOString() }), // E1
    escalation(w, p2, c2, { state: "resolved", resolved_at: plus(c2, 7200).toISOString() }), // E2
    escalation(w, p3, c3), // E3: open, and the only thing sent was a broadcast
    escalation(w, p4, c4, { reason: "opt_out", state: "resolved", resolved_at: plus(c4, 600).toISOString() }), // E4
    escalation(w, p5, c5, { reason: "callback" }), // E5: the answer is a phone call
    escalation(w, p6, c6, { state: "resolved", resolved_at: null }), // E6: resolved before records were kept
  ]);
  await insert("messages", [
    outbound(w, p1, plus(c1, 300), "human"),
    outbound(w, p2, plus(c2, 900), "human"),
    outbound(w, p3, plus(c3, 60), "human", { meta: { source: "broadcast" } }),
    outbound(w, p4, plus(c4, 60), "human"),
  ]);

  const r = await series(w);
  assert.deepEqual(r.handover.now, {
    n: 3,
    replied: { n: 2, median_s: 600 },
    settled: { n: 2, median_s: 5400 },
  });
  assert.deepEqual(r.handover.before, {
    n: 1,
    replied: { n: 0, median_s: null },
    settled: { n: 0, median_s: null },
  });

  // What is stuck now is every open escalation, oldest first, whatever its reason: the reader decides who is waiting.
  assert.deepEqual(
    r.stuck.open.map((o) => [o.reason, o.state, o.assignee_user_id]),
    [
      ["human_token", "needs_human", null],
      ["callback", "open", null],
    ],
  );
  assert.equal(Date.parse(r.stuck.open[0].created_at), c3.getTime());
  assert.equal(Date.parse(r.stuck.open[1].created_at), c5.getTime());
  assert.ok(Date.parse(r.stuck.open[0].paused_until) > Date.now(), "the thread's pause is carried");
  assert.equal(r.stuck.open[1].paused_until, null);
});

test("calls nobody took, and whether anyone answered within an hour", { skip }, async () => {
  const w = await workspace("harbor-recep-missed");
  const [a, b, c, d, e, f, g, heard] = [
    await person(w),
    await person(w),
    await person(w),
    await person(w),
    await person(w),
    await person(w),
    await person(w),
    await person(w),
  ];
  const callA = dayAt(2, 10);
  const callC = dayAt(1, 9);
  const callG = dayAt(2, 12);
  const callD = ago(40);
  await insert("calls", [
    miss(w, a, callA), // A: texted back 20 minutes later
    call(w, b, dayAt(3, 10), { in_voicemail: true, duration_ms: 30_000 }), // B: reached voicemail, nobody followed
    miss(w, c, callC), // C: rang back and got through
    call(w, c, plus(callC, 1800)),
    miss(w, d, callD), // D: the hour has not passed
    miss(w, null, dayAt(2, 14)), // nobody known
    miss(w, f, dayAt(2, 15), { direction: "outbound" }), // the receptionist dialled and nobody answered: nobody's miss
    miss(w, e, dayAt(12, 10)), // the period before
    miss(w, g, callG), // G: texted back, but 90 minutes later
    // A call that was simply answered (no voicemail by any of the three signals) is no miss: it is in no count here.
    call(w, heard, dayAt(2, 11), {
      status: "ended",
      duration_ms: 60_000,
      in_voicemail: false,
      disconnection_reason: "user_hangup",
      outcome: "answered",
    }),
  ]);
  await insert("messages", [outbound(w, a, plus(callA, 1200), "human"), outbound(w, g, plus(callG, 5400), "human")]);

  const r = await series(w);
  assert.deepEqual(r.missed.now, { n: 4, touched: 2, pending: 1, unknown: 1 });
  assert.deepEqual(r.missed.before, { n: 1, touched: 0, pending: 0, unknown: 0 });

  // The hour is an hour: contracts say it as "an hour" (MISSED_CALL_TOUCH_WORDS). 3,599 seconds is within it, 3,601 not.
  const edge = await workspace("harbor-recep-hour");
  const [h, i, v1, v2, wv, pre] = [
    await person(edge),
    await person(edge),
    await person(edge),
    await person(edge),
    await person(edge),
    await person(edge),
  ];
  const at = dayAt(2, 10);
  await insert("calls", [
    miss(edge, h, at),
    miss(edge, i, at),
    miss(edge, pre, at),
    call(edge, v1, at, { disconnection_reason: "voicemail_reached" }), // reached voicemail by Retell's word
    call(edge, v2, at, { outcome: "voicemail" }), // reached voicemail by the note's word
    miss(edge, wv, at),
    call(edge, wv, plus(at, 600), { in_voicemail: true }), // a voicemail is nobody answering
  ]);
  await insert("messages", [
    outbound(edge, h, plus(at, 3599), "ai"),
    outbound(edge, i, plus(at, 3601), "ai"),
    outbound(edge, pre, plus(at, -60), "ai"), // words sent before they rang are not an answer to the call
  ]);
  const hour = await series(edge);
  assert.deepEqual(hour.missed.now, { n: 6, touched: 1, pending: 0, unknown: 0 }, "only the 3,599-second text-back");
});

test("messages by the workspace's own day and quarter hour", { skip }, async () => {
  const timeZone = "Pacific/Auckland";
  const w = await workspace("harbor-recep-hours", timeZone);
  const late = await person(w);
  const early = await person(w);
  const mail = await person(w);
  // The same times of day as 2026-10-05T12:10Z and 2026-10-05T10:50Z, three days before now.
  const shifted = (hour, min) => dayAt(3, hour, min);
  const first = shifted(12, 10);
  const second = shifted(10, 50);
  await insert("messages", [
    inbound(w, early, first),
    outbound(w, early, plus(first, 60), "ai"),
    inbound(w, late, second),
    // An automatic reply is no one writing: it is in no quarter hour.
    inbound(w, mail, shifted(11, 20), { channel: "email", meta: { email: { claim: "auto_reply" } } }),
  ]);
  const localOf = (date) => {
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
    return {
      d: `${parts.year}-${parts.month}-${parts.day}`,
      q: Number(parts.hour) * 4 + Math.floor(Number(parts.minute) / 15),
    };
  };
  const before = localOf(second);
  const after = localOf(first);
  assert.notEqual(before.d, after.d, "the two messages are either side of the workspace's midnight");

  const r = await series(w);
  assert.deepEqual(r.after_hours, [
    { d: before.d, q: before.q, n: 1, a: 0 },
    { d: after.d, q: after.q, n: 1, a: 1 },
  ]);
  assert.equal(r.timezone, timeZone);
});

test("links: a person once", { skip }, async () => {
  const w = await workspace("harbor-recep-links");
  const a = await person(w);
  const b = await person(w);
  const c = await person(w);
  const callA = dayAt(2, 12);
  await insert("calls", [
    call(w, a, callA, { outcome: "booking_link_sent" }),
    call(w, c, dayAt(2, 13), { outcome: "booking_link_sent", direction: "outbound" }), // the receptionist rang them: not a link it was asked for
  ]);
  const sent = await insert("messages", [
    outbound(w, a, dayAt(1, 10), "ai", { body: "book here" }),
    outbound(w, b, ago(300), "ai", { body: "book here" }),
  ]);
  const eventA = dayAt(1, 10, 1);
  const eventB = ago(299);
  await insert("events", [
    event(w, "booking_link.sent", eventA, { channel: "whatsapp", sender: "ai" }, sent[0].id),
    event(w, "booking_link.sent", eventB, { channel: "whatsapp", sender: "ai" }, sent[1].id),
  ]);

  const r = await series(w);
  assert.equal(r.links.total, 2, "a person who had it twice, and two people who had it once");
  assert.deepEqual(
    r.links.people.map((x) => x.c),
    [a.contact, b.contact],
  );
  assert.equal(Date.parse(r.links.people[0].at), callA.getTime(), "the person's first link: the call");
  assert.equal(Date.parse(r.links.people[1].at), eventB.getTime());
});

test("a window that ended, a workspace with nothing, an unknown workspace", { skip }, async () => {
  const w = await workspace("harbor-recep-ended");
  const p = await person(w);
  const q = await person(w);
  const { today } = await series(w);
  await insert("messages", [
    draft(w, p, dayAt(4, 12), "veto_window"), // inside the window that ended three days ago
    draft(w, p, dayAt(12, 12), "veto_window"), // its period before
    draft(w, p, dayAt(1, 12), "veto_window"), // after it
    inbound(w, q, dayAt(5, 12), { meta: { intent: "booking" } }),
    inbound(w, q, dayAt(1, 11), { meta: { intent: "pricing" } }), // after it
  ]);
  await insert("calls", [
    call(w, p, dayAt(5, 10), { outcome: "booking_link_sent" }),
    call(w, q, dayAt(1, 10), { outcome: "booking_link_sent" }), // someone else's, after it
  ]);
  await insert("escalations", [
    escalation(w, p, dayAt(5, 9)), // inside the window, and still open
    escalation(w, q, dayAt(1, 9), { reason: "manual" }), // after it, and open
  ]);

  const ended = await series(w, { p_days: 7, p_end: dayFrom(today, -3) });
  assert.equal(ended.end, dayFrom(today, -3));
  assert.equal(ended.today, today, "today is still the real one");
  assert.equal(ended.days, 7);
  assert.deepEqual(
    [ended.hold.now.total, ended.hold.before.total, ended.topics.of, ended.links.total, ended.handover.now.n],
    [1, 1, 1, 1, 1],
    "the window counts nothing that came after its last day",
  );
  assert.equal(ended.stuck.open.length, 2, "what is stuck is stuck now, not then");

  const now = await series(w);
  assert.deepEqual(
    [now.hold.now.total, now.topics.of, now.links.total, now.handover.now.n],
    [2, 2, 2, 2],
    "the same days read to today count what came after",
  );

  const future = await series(w, { p_days: 7, p_end: dayFrom(today, 5) });
  assert.equal(future.end, today, "a day that has not come is read as today");
  assert.deepEqual(future.hold, now.hold);
  assert.deepEqual(future.stuck, now.stuck);

  // A workspace with nothing answers every count with a zero, and a median it has no rows for with null.
  const bare = await workspace("harbor-recep-bare");
  const none = await series(bare);
  assert.equal(none.error, undefined);
  assert.deepEqual(none.hold.now, {
    total: 0,
    sent: 0,
    canceled: 0,
    steered: 0,
    overtaken: 0,
    person_first: 0,
    waiting: 0,
    other: 0,
    low_confidence: 0,
  });
  assert.deepEqual(none.hold.before, { total: 0, sent: 0 });
  assert.deepEqual(none.topics, { of: 0, stamped: 0, by_intent: {} });
  assert.deepEqual(none.languages, { of: 0, stamped: 0, by_language: {} });
  assert.deepEqual(none.blocked, { total: 0, by_reason: {} });
  assert.deepEqual(none.call_endings, { total: 0, by_reason: {} });
  assert.equal(none.handover.now.n, 0);
  assert.equal(none.handover.now.replied.median_s, null);
  assert.equal(none.handover.now.settled.median_s, null);
  assert.deepEqual(none.missed.now, { n: 0, touched: 0, pending: 0, unknown: 0 });
  assert.deepEqual(none.after_hours, []);
  assert.deepEqual(none.links, { total: 0, people: [] });
  assert.deepEqual(none.stuck, { open: [] });

  const unknown = ok(await db.rpc("receptionist_series", { p_tenant_id: crypto.randomUUID() }));
  assert.deepEqual(unknown, { error: "unknown_tenant" });

  // Not an anonymous visitor's to call: the grant is a signed-in member's (RLS then decides what they read).
  if (ANON) {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const refused = await anon.rpc("receptionist_series", { p_tenant_id: w.tenantId });
    assert.ok(refused.error, "anon may not call it");
    assert.equal(refused.data, null);
  }
});
