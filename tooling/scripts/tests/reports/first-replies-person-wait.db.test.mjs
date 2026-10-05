/**
 * "You, after a handover" (the Reports lenses spec, K4) is read from first_replies, which already says when the customer
 * asked (asked_at) and when a person first replied (human_at): the person's wait is their difference, whoever answered
 * first. This pins that reading against a later redefinition of the function. It runs against Reports phase A's version
 * (00285), which also returns ai_hold_s and does not take a broadcast's send for a person's answer: a person's reply after
 * the receptionist's held one, a person who answered alone, a broadcast that is nobody's answer, history brought in that
 * is no answer and no ask, and no person at all, which is absent and never zero. Runs against the database
 * `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers' messages"
      : false;

const MS = 1000;
/** The hold the owner set on the receptionist's reply, in seconds (messages.meta.delay_ms is its milliseconds). */
const HOLD_S = 60;

let db;
let tenantId;
let seq = 0;
const base = Date.now() - 6 * 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-wait-${Date.now()}`, name: "Harbor Wait", timezone: "UTC" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

/**
 * A person with a thread: the customer's ask (carrying channel_ts, as a real inbound message does), then each reply as
 * { sender, after (seconds after the ask), body, meta, left }. A reply that was queued left later than its row says:
 * `left` is the seconds after the ask that it did, written as the message.sent event the queue stamps.
 */
async function thread(replies, askMeta = {}) {
  seq += 1;
  const asked = base + seq * MS;
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: `+1555013${9300 + seq}`, display_name: "Harbor Guest" })
      .select("id")
      .single(),
  ).id;
  const conv = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: contact, state: "open", last_message_at: iso(asked) })
      .select("id")
      .single(),
  ).id;
  const row = (over) => ({
    tenant_id: tenantId,
    conversation_id: conv,
    contact_id: contact,
    channel: "whatsapp",
    type: "text",
    body: "hi",
    meta: {},
    ...over,
  });
  ok(
    await db.from("messages").insert(
      row({
        direction: "inbound",
        sender: "customer",
        status: "received",
        created_at: iso(asked),
        channel_ts: iso(asked),
        meta: askMeta,
      }),
    ),
  );
  for (const { sender, after: secs, body, meta = {}, left } of replies) {
    const sent = ok(
      await db
        .from("messages")
        .insert(row({ direction: "outbound", sender, status: "sent", body, meta, created_at: iso(asked + secs * MS) }))
        .select("id")
        .single(),
    );
    if (left !== undefined) {
      ok(
        await db.from("events").insert({
          tenant_id: tenantId,
          kind: "message.sent",
          category: "message",
          subject_type: "message",
          subject_id: sent.id,
          data: { sender },
          created_at: iso(asked + left * MS),
        }),
      );
    }
  }
  return conv;
}

const rowOf = async (conv) =>
  ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: iso(base - 3_600_000) })).find(
    (r) => r.conversation_id === conv,
  );

/** The person's wait in seconds: human_at minus asked_at, or null (absent, never zero) when no person answered. */
const wait = (r) => (r.human_at === null ? null : (Date.parse(r.human_at) - Date.parse(r.asked_at)) / MS);

test(
  "a person's reply after the receptionist's held draft: the wait runs to the person, the draft keeps its own hold",
  { skip },
  async () => {
    const r = await rowOf(
      await thread([
        {
          sender: "ai",
          after: 5,
          body: "A person will be in touch.",
          meta: { source: "veto_window", delay_ms: HOLD_S * MS },
          left: 5 + HOLD_S,
        },
        { sender: "human", after: 600, body: "Yes, Saturday works." },
        { sender: "human", after: 900, body: "See you then." },
      ]),
    );
    assert.equal(r.who, "ai", "the receptionist's held draft left first");
    assert.equal(Number(r.ai_seconds), 5 + HOLD_S, "from the moment it left, not the moment it was queued");
    assert.equal(Number(r.ai_hold_s), HOLD_S);
    assert.equal(wait(r), 600, "the person's wait is the longer one, to their first reply and not their second");
  },
);

test(
  "a person who answered alone, with no receptionist reply: who is you, and the receptionist's side is absent",
  { skip },
  async () => {
    const r = await rowOf(await thread([{ sender: "human", after: 90, body: "Hello! Yes." }]));
    assert.equal(r.who, "you");
    assert.equal(wait(r), 90);
    assert.equal(r.ai_at, null);
    assert.equal(r.ai_seconds, null);
    assert.equal(r.ai_hold_s, null);
  },
);

test(
  "a broadcast's send is not a person's answer: no wait of its own, and the person's own reply is the one measured",
  { skip },
  async () => {
    const broadcast = { sender: "human", after: 30, body: "This month's offer", meta: { source: "broadcast" } };

    const alone = await rowOf(await thread([broadcast]));
    assert.equal(alone.who, "none");
    assert.equal(wait(alone), null, "a broadcast answered nobody: absent, never 30 s");

    const then = await rowOf(await thread([broadcast, { sender: "human", after: 90, body: "Yes, Saturday." }]));
    assert.equal(then.who, "you");
    assert.equal(wait(then), 90, "the person's reply, not the broadcast that went out before it");
  },
);

test(
  "a backfilled message is excluded: history brought in is no person's answer and no customer's ask",
  { skip },
  async () => {
    const answered = await rowOf(
      await thread([
        { sender: "ai", after: 5, body: "A person will be in touch." },
        { sender: "human", after: 60, body: "Imported reply", meta: { backfill: true } },
      ]),
    );
    assert.equal(answered.who, "ai", "the imported reply is not a person's answer");
    assert.equal(wait(answered), null);

    const asked = await rowOf(await thread([{ sender: "human", after: 90, body: "Hello! Yes." }], { backfill: true }));
    assert.equal(asked, undefined, "an imported message is not an ask, so there is no wait to measure");
  },
);

test("a person who never replied has no wait: absent, never zero", { skip }, async () => {
  const unanswered = await rowOf(await thread([{ sender: "ai", after: 5, body: "A person will be in touch." }]));
  assert.equal(unanswered.who, "ai");
  assert.equal(unanswered.human_at, null);
  assert.equal(wait(unanswered), null);
});
