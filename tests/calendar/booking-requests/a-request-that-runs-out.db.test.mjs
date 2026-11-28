/**
 * A time a customer asked for has a clock (00679, decision 0061 as amended 22 Nov 2026), on a real Postgres: what the
 * clock reads (the requests to nudge and the ones that ran out, and never one left alone), the nudge's stamp, and the
 * one door that closes a request that ran out. Handed a message it queues it with its send job, resolves the hold and
 * gives the conversation back to AI; handed none it turns the hold into a reply a person owes; a second run, a request
 * whose time has not come, and a hold that is no longer the request's each move only what they should; and no session
 * may call any of it. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { closeLapsedRequest, listBookingRequestsDue, markBookingRequestNudged } from "@chanlytics/db/calendar";
import { takeLock } from "../../_file-lock.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and appointments"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the session this suite signs in with needs it"
        : false;

const MIN = 60_000;
const HOUR = 60 * MIN;
const TZ = "America/New_York";
const WORDS = "Sat, Oct 17, 2:00 PM · Balayage wasn't confirmed in time: reply to them";
const w = {};
const users = [];
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/**
 * A person, their conversation as a handoff leaves it, and a request of theirs for a slot `fromNowH` hours on, each an
 * hour after the last one asked here: a time another request holds is taken (00730).
 */
async function asked(fromNowH = 72) {
  n += 1;
  const phone = `+1305555${String(2000 + n)}`;
  const contact = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, display_name: `Ana ${n}`, phone_e164: phone })
      .select("id")
      .single(),
  ).id;
  const thread = ok(
    await w.admin
      .from("conversations")
      .insert({
        tenant_id: w.tenant,
        contact_id: contact,
        state: "needs_human",
        paused_until: new Date(Date.now() + 24 * HOUR).toISOString(),
      })
      .select("id")
      .single(),
  ).id;
  const start = Date.now() + (fromNowH + n) * HOUR;
  const opened = ok(
    await w.admin.rpc("booking_request_open", {
      p_tenant_id: w.tenant,
      p_conversation_id: thread,
      p_contact_id: contact,
      p_starts_at: new Date(start).toISOString(),
      p_ends_at: new Date(start + HOUR).toISOString(),
      p_service: "Balayage",
      p_timezone: TZ,
      p_words: "Asked for Sat, Oct 17, 2:00 PM · Balayage",
    }),
  );
  return { contact, thread, phone, id: opened.appointment.id };
}

/** The request's clock moved: when it was asked and when it runs out, from now. */
const age = (id, { askedAgo, expiresIn }) =>
  w.admin
    .from("appointments")
    .update({
      created_at: new Date(Date.now() - askedAgo).toISOString(),
      expires_at: new Date(Date.now() + expiresIn).toISOString(),
    })
    .eq("id", id)
    .then(ok);

const rowOf = async (id) => ok(await w.admin.from("appointments").select("*").eq("id", id).single());
const holdOf = async (thread) =>
  ok(
    await w.admin
      .from("escalations")
      .select("state, reason, details, resolved_by_user_id, decision_id, resolved_at")
      .eq("conversation_id", thread)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  );
const eventsOf = async (id, kind) =>
  ok(
    await w.admin
      .from("events")
      .select("data")
      .eq("kind", kind)
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  ).map((e) => e.data);
const messagesOf = async (thread) =>
  ok(
    await w.admin
      .from("messages")
      .select("id, status, sender, direction, channel, body, meta")
      .eq("conversation_id", thread),
  );
const due = async () => (await listBookingRequestsDue(w.admin, 200)).filter((r) => r.tenantId === w.tenant);
const dueOf = async (id) => (await due()).filter((r) => r.appointmentId === id).map((r) => r.what);

/** The message a run-out queues, as the job builds it. */
const message = (who, over = {}) => ({
  conversationId: who.thread,
  contactId: who.contact,
  channel: "whatsapp",
  to: who.phone,
  body: "Sorry, we couldn't confirm Saturday at 2. Would Monday at 10 work?",
  dueAt: new Date(),
  staleAfter: new Date(Date.now() + 2 * HOUR),
  ...over,
});
const lapse = (who, told) =>
  closeLapsedRequest(w.admin, { tenantId: w.tenant, appointmentId: who.id, replyWords: WORDS, told });

// A request told on its way out queues its send job due at once, on the jobs queue every database suite shares: the
// broadcast walk, claiming beside this file, took two of them as strays (23 Nov 2026). So this file holds the ledger's
// lock (_file-lock.mjs) from before its first write until its cleanup is done.
let releaseLedger;
before(async () => {
  if (skip) return;
  releaseLedger = await takeLock("jobs-ledger");
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  const stamp = Date.now().toString(36);
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `request-clock-${stamp}`, name: "Request clock" })
      .select("id")
      .single(),
  ).id;
  const email = `request-clock-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: w.tenant, user_id: made.data.user.id, role: "owner" }));
  w.owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await w.owner.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
});

after(async () => {
  if (skip) return;
  try {
    if (!w.admin) return;
    for (const table of [
      "jobs",
      "messages",
      "appointments",
      "escalations",
      "decisions",
      "events",
      "conversations",
      "contacts",
    ])
      await w.admin.from(table).delete().eq("tenant_id", w.tenant);
    await w.admin.from("memberships").delete().eq("tenant_id", w.tenant);
    await w.admin.from("tenants").delete().eq("id", w.tenant);
    for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
  } finally {
    await releaseLedger?.();
  }
});

test(
  "the clock reads a request that ran out, and one two hours from it that lives longer than four",
  { skip },
  async () => {
    const fresh = await asked();
    assert.deepEqual(await dueOf(fresh.id), [], "asked a moment ago, held for 23 hours: nothing is due");

    const ending = await asked();
    await age(ending.id, { askedAgo: 21 * HOUR + 30 * MIN, expiresIn: 90 * MIN });
    assert.deepEqual(await dueOf(ending.id), ["nudge"]);
    const [row] = (await due()).filter((r) => r.appointmentId === ending.id);
    assert.equal(row.conversationId, ending.thread);
    assert.equal(row.service, "Balayage");
    assert.equal(row.timezone, TZ);
    assert.ok(row.who.startsWith("Ana "));

    const brief = await asked();
    await age(brief.id, { askedAgo: 2 * HOUR, expiresIn: 90 * MIN });
    assert.deepEqual(await dueOf(brief.id), [], "one that lives three and a half hours is never nudged");

    const over = await asked();
    await age(over.id, { askedAgo: 23 * HOUR + 5 * MIN, expiresIn: -5 * MIN });
    assert.deepEqual(await dueOf(over.id), ["lapse"]);
  },
);

test("a nudge is stamped once, and a request nudged is not listed again", { skip }, async () => {
  const who = await asked();
  await age(who.id, { askedAgo: 21 * HOUR + 30 * MIN, expiresIn: 90 * MIN });
  assert.equal(await markBookingRequestNudged(w.admin, who.id), true);
  assert.equal(await markBookingRequestNudged(w.admin, who.id), false, "a second stamp moves nothing");
  assert.ok((await rowOf(who.id)).nudged_at);
  assert.deepEqual(await dueOf(who.id), []);
});

test("a request whose conversation no longer waits on its owner for it is not nudged", { skip }, async () => {
  const who = await asked();
  await age(who.id, { askedAgo: 21 * HOUR + 30 * MIN, expiresIn: 90 * MIN });
  ok(await w.admin.from("escalations").update({ state: "resolved" }).eq("conversation_id", who.thread));
  assert.deepEqual(await dueOf(who.id), []);
});

test("a request stamped as run out before the clock existed is left alone", { skip }, async () => {
  const who = await asked();
  await age(who.id, { askedAgo: 30 * 24 * HOUR, expiresIn: -29 * 24 * HOUR });
  ok(
    await w.admin
      .from("appointments")
      .update({ lapsed_at: new Date(Date.now() - 29 * 24 * HOUR).toISOString() })
      .eq("id", who.id),
  );
  assert.deepEqual(await dueOf(who.id), []);
  assert.equal((await rowOf(who.id)).status, "proposed", "and it stays as it was");
});

test(
  "told: the message is queued with its send job, the request closes, the hold resolves and the conversation is AI's again",
  { skip },
  async () => {
    const who = await asked();
    await age(who.id, { askedAgo: 23 * HOUR + 5 * MIN, expiresIn: -5 * MIN });
    const stale = new Date(Date.now() + 115 * MIN);
    const done = await lapse(who, message(who, { staleAfter: stale }));
    assert.equal(done.outcome, "told");
    assert.ok(done.messageId);

    const [msg] = await messagesOf(who.thread);
    assert.deepEqual(
      [msg.id, msg.status, msg.sender, msg.direction, msg.channel],
      [done.messageId, "queued", "ai", "outbound", "whatsapp"],
    );
    assert.deepEqual(msg.meta, { source: "booking_lapse", appointment_id: who.id, to: who.phone });
    const jobs = ok(
      await w.admin.from("jobs").select("kind, state, payload").eq("tenant_id", w.tenant).eq("kind", "outbound_send"),
    );
    const job = jobs.find((j) => j.payload.message_id === done.messageId);
    assert.ok(job, "its send job, written with it");
    assert.equal(job.payload.conversation_id, who.thread);
    assert.equal(job.payload.to_phone, who.phone);
    assert.equal(Date.parse(job.payload.stale_after), stale.getTime());

    const row = await rowOf(who.id);
    assert.deepEqual([row.status, row.lapse_told], ["cancelled", true]);
    assert.ok(row.lapsed_at);
    // The record says it ran out, never that it was cancelled; Activity has its own line.
    assert.deepEqual(
      (await eventsOf(who.id, "appointment.changed")).map((d) => [d.change, d.told ?? null, d.by]),
      [
        ["added", null, "service"],
        ["lapsed", true, "service"],
      ],
    );
    const [line] = await eventsOf(who.id, "appointment.lapsed");
    assert.deepEqual([line.told, line.service, line.contact_id], [true, "Balayage", who.contact]);

    const hold = await holdOf(who.thread);
    assert.equal(hold.state, "resolved");
    assert.deepEqual(
      [hold.resolved_by_user_id, hold.decision_id],
      [null, null],
      "the platform's own close: nobody's decision",
    );
    assert.ok(hold.resolved_at);
    const conv = ok(await w.admin.from("conversations").select("state, paused_until").eq("id", who.thread).single());
    assert.deepEqual([conv.state, conv.paused_until], ["open", null]);
  },
);

test(
  "not told: nothing is queued, and the hold becomes a reply a person owes, in the words it was given",
  { skip },
  async () => {
    const who = await asked();
    await age(who.id, { askedAgo: 23 * HOUR + 5 * MIN, expiresIn: -5 * MIN });
    assert.deepEqual(await lapse(who, null), { outcome: "reply" });
    assert.deepEqual(await messagesOf(who.thread), []);
    const row = await rowOf(who.id);
    assert.deepEqual([row.status, row.lapse_told], ["cancelled", false]);
    assert.deepEqual((await eventsOf(who.id, "appointment.changed")).at(-1).told, false);
    const hold = await holdOf(who.thread);
    assert.deepEqual([hold.state, hold.reason, hold.details], ["open", "booking_reply", WORDS]);
    const conv = ok(await w.admin.from("conversations").select("state").eq("id", who.thread).single());
    assert.equal(conv.state, "needs_human", "it still waits on a person");
  },
);

test(
  "a second run finds it closed: nothing is queued twice, and the owner's Booked it is answered already",
  { skip },
  async () => {
    const who = await asked();
    await age(who.id, { askedAgo: 23 * HOUR + 5 * MIN, expiresIn: -5 * MIN });
    assert.equal((await lapse(who, message(who))).outcome, "told");
    assert.deepEqual(await lapse(who, message(who)), { outcome: "answered" });
    assert.equal((await messagesOf(who.thread)).length, 1);
    assert.equal((await eventsOf(who.id, "appointment.lapsed")).length, 1);
    const booked = await w.owner.rpc("booking_request_answer", { p_appointment_id: who.id, p_booked: true });
    assert.deepEqual([booked.data?.error, booked.data?.status], ["answered", "cancelled"]);
  },
);

test("before its time nothing moves", { skip }, async () => {
  const who = await asked();
  assert.deepEqual(await lapse(who, message(who)), { outcome: "early" });
  assert.equal((await rowOf(who.id)).status, "proposed");
  assert.deepEqual(await messagesOf(who.thread), []);
  assert.equal((await holdOf(who.thread)).reason, "booking_request");
});

test(
  "a hold that is no longer the request's is left as it stands, and nothing is sent under it",
  { skip },
  async () => {
    const who = await asked();
    await age(who.id, { askedAgo: 23 * HOUR + 5 * MIN, expiresIn: -5 * MIN });
    ok(
      await w.admin.rpc("escalation_open", {
        p_tenant_id: w.tenant,
        p_conversation_id: who.thread,
        p_reason: "send_failed",
        p_details: "AI's reply didn't reach them.",
      }),
    );
    assert.deepEqual(await lapse(who, message(who)), { outcome: "closed" });
    assert.deepEqual(await messagesOf(who.thread), []);
    const row = await rowOf(who.id);
    assert.deepEqual([row.status, row.lapse_told], ["cancelled", false]);
    const hold = await holdOf(who.thread);
    assert.deepEqual([hold.state, hold.reason], ["open", "send_failed"]);
  },
);

test("a message for another conversation is refused, and the request stays as it was", { skip }, async () => {
  const who = await asked();
  const other = await asked();
  await age(who.id, { askedAgo: 23 * HOUR + 5 * MIN, expiresIn: -5 * MIN });
  await assert.rejects(lapse(who, message(other)), /booking_request_lapse/);
  assert.equal((await rowOf(who.id)).status, "proposed");
  assert.deepEqual(await messagesOf(other.thread), []);
});

test("no session may read the clock, stamp a nudge or close a request", { skip }, async () => {
  const who = await asked();
  for (const [fn, args] of [
    ["booking_requests_due", { p_limit: 10 }],
    ["booking_request_nudged", { p_appointment_id: who.id }],
    ["booking_request_lapse", { p_appointment_id: who.id, p_reply_words: WORDS }],
  ]) {
    const { error } = await w.owner.rpc(fn, args);
    assert.ok(error, `${fn} must be the service role's alone`);
    assert.match(error.message, /permission denied/);
  }
});
