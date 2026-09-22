/**
 * Their own message is one they sent.
 *
 * "In their own message" was a word the desk could pick with nothing behind
 * it: both doors took `customer_message` from any signed-in member without a
 * message, so the ledger could say a customer wrote their yes when nobody had
 * looked for where. Ruben's decision, 18 Sep 2026: when the conversation is in
 * Chanlytics, the desk names the actual inbound message, and its id and words
 * go into the evidence (00137). An answer given somewhere Chanlytics does not
 * see is a sign-up form, attested with a note.
 *
 * Executed here: the rule and its sentences in contracts, the messages a
 * person's page offers to choose from, and the two single doors and the two
 * batch doors run over a database in memory. The doors themselves are run
 * against Postgres in their-own-message.db.test.mjs; the pages, in
 * person-honest.test.mjs and people-honest.test.mjs.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as contracts from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

// A namespace, not named imports: what this slice adds is missing from the module until it lands, and a
// named import of it would fail the whole file rather than the test that needs it.
const { consentChangeWords, toPersonVM } = contracts;

const ZONE = "America/New_York";
const NOW = new Date("2026-09-18T16:00:00.000Z");
const H = 3_600_000;
const iso = (ms) => new Date(NOW.getTime() - ms).toISOString();

/* ----------------------------------------------------------------- the rule */

test("their own message names the message; no other answer does", () => {
  const { ownMessageRefusal, OWN_MESSAGE_REFUSALS: said } = contracts;
  assert.equal(ownMessageRefusal("customer_message", "m-1"), null, "the answer and the message it was given in");
  assert.equal(ownMessageRefusal("customer_message", null), said.missing, "their own message, with no message");
  assert.equal(ownMessageRefusal("customer_message", undefined), said.missing);
  assert.equal(ownMessageRefusal("customer_message", ""), said.missing, "an empty id is no message");
  for (const other of ["in_person", "phone", "form", "operator"]) {
    assert.equal(ownMessageRefusal(other, null), null, `${other} names no message`);
    assert.equal(ownMessageRefusal(other, "m-1"), said.notOwnMessage, `${other} with a message is two answers at once`);
  }
});

test("each refusal is a sentence the owner can act on", () => {
  const said = contracts.OWN_MESSAGE_REFUSALS;
  // What to do, and the way out when the message is not here: a form, with a note saying where.
  assert.match(said.missing, /^Choose the message/);
  assert.match(said.missing, /somewhere Chanlytics doesn't see/);
  assert.match(said.missing, /sign-up form/);
  assert.match(said.missing, /note/);
  assert.match(said.notTheirs, /Choose one of theirs\.$/);
  assert.match(said.wordless, /Choose the one where they said it\.$/);
  assert.match(said.batch, /one person at a time/);
  assert.match(said.batch, /Sign-up form/);
  for (const [k, s] of Object.entries(said)) {
    assert.ok(s.length <= 200, `${k} fits under a control`);
    assert.ok(!/customer_message|p_message_id|uuid/.test(s), `${k} is said in the owner's words, not the schema's`);
  }
});

/* ---------------------------------------------------- the messages to choose */

const row = (over = {}) => ({
  id: "p1",
  display_name: "Maria Lopez",
  wa_profile_name: null,
  phone_e164: "+13055550134",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  marketing_consent: "unknown",
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "cv1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: iso(H),
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: null,
  last_inbound_at: iso(H),
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: iso(90 * H),
  earliest_row_at: null,
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});
const msg = (id, hoursAgo, over = {}) => ({
  id,
  conversation_id: "cv1",
  direction: "inbound",
  sender: "customer",
  channel: "whatsapp",
  type: "text",
  body: `Message ${id}`,
  media: null,
  meta: null,
  status: "received",
  created_at: iso(hoursAgo * H),
  ...over,
});
const personWith = (messages) =>
  toPersonVM(
    {
      row: row(),
      identities: [],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
      conversations: [
        { id: "cv1", state: "open", paused_until: null, last_wa_inbound_at: null, last_message_at: iso(H), messages },
      ],
    },
    ZONE,
    NOW,
  );

test("a person's page offers what they wrote to you, newest first, and nothing else", () => {
  const vm = personWith([
    msg("m-old", 30, { body: "Hi, is Saturday free?" }),
    msg("m-ours", 29, { direction: "outbound", sender: "ai", status: "sent", body: "Yes, 11 is open." }),
    msg("m-staff", 28, { direction: "outbound", sender: "human", status: "sent", body: "Would you like our offers?" }),
    msg("m-call", 27, {
      channel: "voice",
      sender: "system",
      type: "call_summary",
      body: "Inbound call · 2 min — asked about prices",
    }),
    msg("m-photo", 26, { type: "media", body: null, media: { mime_type: "image/jpeg" } }),
    msg("m-caption", 25, {
      type: "media",
      body: null,
      media: { mime_type: "image/jpeg", caption: "  my signed slip  " },
    }),
    msg("m-text", 3, { channel: "sms", body: "  yes,   send me\nthe offers please " }),
    msg("m-mail", 2, { channel: "email", body: "Yes to offers, thank you" }),
  ]);
  assert.deepEqual(
    vm.ownMessages.map((m) => m.id),
    ["m-mail", "m-text", "m-caption", "m-old"],
    "their own words, newest first: not a reply, not a call, not a photo with nothing written on it",
  );
  const [mail, text, caption] = vm.ownMessages;
  assert.equal(text.words, "yes, send me the offers please", "on one line, as a reader scans it");
  assert.equal(caption.words, "my signed slip", "a photo's caption is words they wrote");
  assert.deepEqual(
    [mail.via, text.via, caption.via],
    ["Email", "Text", "WhatsApp"],
    "the wire, in the words the page uses for it",
  );
  const day = contracts.clockDayLabel(NOW.getTime() - 2 * H, ZONE, NOW.getTime());
  assert.equal(
    mail.when,
    `${day}, ${contracts.clockTime(NOW.getTime() - 2 * H, ZONE)}`,
    "when they sent it, by the business's clock",
  );
});

test("the words shown are the words the evidence keeps: eighty characters of them, and said so when there are more", () => {
  const long = "Yes please add me to the offers list, and my sister too if you can, she comes on Fridays";
  const vm = personWith([msg("m-long", 1, { body: long })]);
  const [m] = vm.ownMessages;
  assert.equal(m.words, `${long.slice(0, 80)}…`, "the first eighty, and an ellipsis for the rest");
  const short = personWith([msg("m-short", 1, { body: "YES OFFERS" })]).ownMessages[0];
  assert.equal(short.words, "YES OFFERS", "a short one is whole");
});

test("the recent ones: ten at most, and none from a person who has not written", () => {
  const many = Array.from({ length: 14 }, (_, i) => msg(`m${i}`, 14 - i));
  const vm = personWith(many);
  assert.deepEqual(
    vm.ownMessages.map((m) => m.id),
    ["m13", "m12", "m11", "m10", "m9", "m8", "m7", "m6", "m5", "m4"],
  );
  assert.deepEqual(personWith([]).ownMessages, []);
  assert.deepEqual(
    personWith([msg("m-ours", 1, { direction: "outbound", sender: "ai", status: "sent" })]).ownMessages,
    [],
  );
});

test("an answer recorded from an email says it came by email", () => {
  const c = {
    id: "ev-1",
    contact_id: "p1",
    at: iso(H),
    purpose: "marketing",
    consent: "opted_in",
    previous: "unknown",
    source: "customer_message",
    by: "u-1",
    note: null,
    channel: "email",
    message_external_id: "msg-1",
    words: "Yes to offers, thank you",
  };
  assert.equal(consentChangeWords(c).sub, "In their own words by email: “Yes to offers, thank you”");
});

/* ---------------------------------------------------------------- the routes */

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const visitOne = await import(at("apps/dashboard/app/api/v1/contacts/[id]/consent/route.ts"));
const offersOne = await import(at("apps/dashboard/app/api/v1/contacts/[id]/marketing-consent/route.ts"));
const visitMany = await import(at("apps/dashboard/app/api/v1/contacts/consent/route.ts"));
const offersMany = await import(at("apps/dashboard/app/api/v1/contacts/marketing-consent/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const M1 = "99999999-9999-4999-8999-999999999999";
const USER = "u1";
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  contacts: [
    { id: P1, tenant_id: A, erased_at: null, consent: "unknown", marketing_consent: "unknown" },
    { id: P2, tenant_id: A, erased_at: null, consent: "unknown", marketing_consent: "unknown" },
  ],
  decisions: [],
});
/** The two doors, recording what they were handed; `refuse` is the database saying no. */
const doors = (refuse = null) => {
  const handed = [];
  const answer = (name) => (a) => {
    handed.push([name, a]);
    if (refuse) {
      const e = new Error(refuse);
      e.code = "22023";
      throw e;
    }
    return name === "set_contact_consent"
      ? { previous: "unknown", updated_at: "2026-09-18T16:00:00Z", dnc: false }
      : { marketing_consent: a.p_consent, marketing_consent_updated_at: "2026-09-18T16:00:00Z" };
  };
  return {
    handed,
    rpcs: {
      set_contact_consent: answer("set_contact_consent"),
      set_marketing_consent: answer("set_marketing_consent"),
    },
  };
};
const ctxFor = (t, rpcs, params = {}) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const put = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "PUT", body: JSON.stringify(body) });
const ONE = [
  ["the visit door", visitOne],
  ["the offers door", offersOne],
];
async function refused(p, words, field = null) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, "validation", e.message);
    assert.equal(e.status, 400, e.message);
    if (words) assert.equal(e.message, words);
    if (field) assert.ok(e.details?.fields?.[field], `the refusal names the field: ${JSON.stringify(e.details)}`);
    return true;
  });
}

test("their own message at the desk names the message: without one, each single door refuses in the owner's words and opens nothing", async () => {
  for (const [name, route] of ONE) {
    const t = tables();
    const { handed, rpcs } = doors();
    await refused(
      route.PUT.run(put({ consent: "opted_in", source: "customer_message" }), ctxFor(t, rpcs, { id: P1 })),
      contracts.OWN_MESSAGE_REFUSALS.missing,
    );
    await refused(
      route.PUT.run(
        put({ consent: "opted_out", source: "customer_message", note: "said so" }),
        ctxFor(t, rpcs, { id: P1 }),
      ),
      contracts.OWN_MESSAGE_REFUSALS.missing,
    );
    assert.deepEqual(handed, [], `${name}: nothing reached the database`);
    assert.deepEqual(t.decisions, [], `${name}: and nothing was recorded as decided`);
  }
});

test("with the message, the door is handed it and judges it, and the ledger row names it", async () => {
  const t = tables();
  const { handed, rpcs } = doors();
  const out = await visitOne.PUT.run(
    put({ consent: "opted_in", source: "customer_message", message_id: M1 }),
    ctxFor(t, rpcs, { id: P1 }),
  );
  assert.equal(out.source, "customer_message");
  const offers = await offersOne.PUT.run(
    put({ consent: "opted_in", source: "customer_message", message_id: M1 }),
    ctxFor(t, rpcs, { id: P1 }),
  );
  assert.equal(offers.consent, "opted_in");
  assert.deepEqual(
    handed,
    [
      [
        "set_contact_consent",
        { p_contact_id: P1, p_consent: "opted_in", p_source: "customer_message", p_message_id: M1 },
      ],
      [
        "set_marketing_consent",
        { p_tenant_id: A, p_contact_id: P1, p_consent: "opted_in", p_source: "customer_message", p_message_id: M1 },
      ],
    ],
    "the message goes to the door, which reads its words itself: the route hands in no evidence",
  );
  assert.deepEqual(
    t.decisions.map((d) => [d.payload.purpose ?? null, d.payload.source, d.payload.message_id]),
    [
      [null, "customer_message", M1],
      ["marketing", "customer_message", M1],
    ],
    "who recorded it, and which message they pointed at",
  );
});

test("the door's refusal of a message that is not theirs reaches the owner as the door said it", async () => {
  for (const [name, route] of ONE) {
    const t = tables();
    const { rpcs } = doors(contracts.OWN_MESSAGE_REFUSALS.notTheirs);
    await refused(
      route.PUT.run(
        put({ consent: "opted_in", source: "customer_message", message_id: M1 }),
        ctxFor(t, rpcs, { id: P2 }),
      ),
      contracts.OWN_MESSAGE_REFUSALS.notTheirs,
    );
    assert.deepEqual(t.decisions, [], `${name}: a refused answer is not a decision`);
  }
});

test("a message beside another way of answering is refused, and an id that is not one is refused as a field", async () => {
  for (const [name, route] of ONE) {
    const { handed, rpcs } = doors();
    await refused(
      route.PUT.run(put({ consent: "opted_in", source: "form", message_id: M1 }), ctxFor(tables(), rpcs, { id: P1 })),
      contracts.OWN_MESSAGE_REFUSALS.notOwnMessage,
    );
    await refused(
      route.PUT.run(put({ consent: "unknown", message_id: M1 }), ctxFor(tables(), rpcs, { id: P1 })),
      contracts.OWN_MESSAGE_REFUSALS.notOwnMessage,
    );
    await refused(
      route.PUT.run(
        put({ consent: "opted_in", source: "customer_message", message_id: "the one from Tuesday" }),
        ctxFor(tables(), rpcs, { id: P1 }),
      ),
      null,
      "message_id",
    );
    assert.deepEqual(handed, [], `${name}: nothing reached the database`);
  }
});

test("every other answer reaches its door as it always has, naming no message", async () => {
  const t = tables();
  const { handed, rpcs } = doors();
  await visitOne.PUT.run(put({ consent: "opted_in", source: "in_person" }), ctxFor(t, rpcs, { id: P1 }));
  await offersOne.PUT.run(
    put({ consent: "opted_in", source: "form", note: "  slip 12, signed at the desk " }),
    ctxFor(t, rpcs, { id: P1 }),
  );
  await offersOne.PUT.run(put({ consent: "unknown" }), ctxFor(t, rpcs, { id: P1 }));
  assert.deepEqual(
    handed,
    [
      ["set_contact_consent", { p_contact_id: P1, p_consent: "opted_in", p_source: "in_person" }],
      [
        "set_marketing_consent",
        {
          p_tenant_id: A,
          p_contact_id: P1,
          p_consent: "opted_in",
          p_source: "form",
          p_note: "slip 12, signed at the desk",
        },
      ],
      [
        "set_marketing_consent",
        { p_tenant_id: A, p_contact_id: P1, p_consent: "unknown", p_source: contracts.CONSENT_RESET_SOURCE },
      ],
    ],
    "the same call as before, so it resolves on a database with or without 00137",
  );
  assert.ok(
    t.decisions.every((d) => !("message_id" in d.payload)),
    "and no ledger row claims a message",
  );
});

test("the single doors declare the policy they had: the front desk, the consent bucket, judged where the person lives", () => {
  for (const [, route] of ONE)
    assert.deepEqual(route.PUT.policy, {
      kind: "write",
      scope: "row",
      role: "operator",
      rate: "consent",
      spend: false,
    });
});

test("a batch cannot be their own message: one message is not every person's, and the batch says where to record it", async () => {
  for (const [name, route] of [
    ["the visit batch", visitMany],
    ["the offers batch", offersMany],
  ]) {
    const t = tables();
    const { handed, rpcs } = doors();
    await refused(
      route.PUT.run(put({ ids: [P1, P2], consent: "opted_in", source: "customer_message" }), ctxFor(t, rpcs)),
      contracts.OWN_MESSAGE_REFUSALS.batch,
    );
    assert.deepEqual(handed, [], `${name}: refused before any row is touched`);
    assert.deepEqual(t.decisions, []);
    // A no is refused the same way: the batch cannot name a message for anyone.
    await refused(
      route.PUT.run(put({ ids: [P1], consent: "opted_out", source: "customer_message" }), ctxFor(t, rpcs)),
      contracts.OWN_MESSAGE_REFUSALS.batch,
    );
  }
  // The slips a batch is for still go through, with the note that says which.
  const t = tables();
  const { handed, rpcs } = doors();
  const out = await offersMany.PUT.run(
    put({ ids: [P1, P2], consent: "opted_in", source: "form", note: "slips from Saturday" }),
    ctxFor(t, rpcs),
  );
  assert.deepEqual(out, { done: 2, failed: [], skipped: [] });
  assert.deepEqual(
    handed.map(([, a]) => [a.p_contact_id, a.p_source, a.p_note, "p_message_id" in a]),
    [
      [P1, "form", "slips from Saturday", false],
      [P2, "form", "slips from Saturday", false],
    ],
  );
});
