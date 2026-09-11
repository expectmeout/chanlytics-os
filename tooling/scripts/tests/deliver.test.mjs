/**
 * The door, executed.
 *
 * deliver() is the one place a message leaves through, and the rules it
 * holds are the ones that were decided differently at four call sites: which
 * yes this message needs, whether a person holds the thread, whether the
 * workspace is paused, whose wire and whose credentials. Each is a rule about
 * reaching a real person, so each is proved by running the door against a
 * fake database and a fake wire, never by reading it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { deliver, deliverSafely, templatePurpose, whatsappSender } = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);

const T = "t1";
const NOW = Date.parse("2026-09-10T10:00:00.000Z");
const person = (over = {}) => ({ consent: "opted_in", dnc: false, marketing_consent: "opted_out", erased_at: null, ...over });
const thread = (over = {}) => ({ id: "c1", tenant_id: T, paused_until: null, contacts: person(), tenants: { status: "active" }, ...over });
const tables = (over = {}) => ({ conversations: [thread()], messages: [], events: [], ...over });

/** A wire that says yes and remembers what it was handed. */
function wireOf(result = { ok: true, wamid: "wamid.1", status: 200 }) {
  const calls = [];
  return { calls, wire: { whatsapp: async (to, p) => { calls.push({ to, p }); return result; } } };
}
const ports = (t, w, over = {}) => ({ db: fakeDb(t), wire: w.wire, now: () => NOW, ...over });
const words = (over = {}) => ({
  tenantId: T, conversationId: "c1", contactId: "k1", to: "+13475550101", channel: "whatsapp",
  sender: "human", purpose: "conversational", proactive: false, body: "See you at 3", ...over,
});
const kinds = (t) => t.events.map((e) => e.kind);

test("words that may go, go: the wire is handed them, a row records them, the thread is stamped, the event says who spoke", async () => {
  const t = tables();
  const w = wireOf();
  const out = await deliver(ports(t, w), words({ meta: { source: "test" } }));
  assert.equal(out.outcome, "sent");
  assert.equal(out.externalId, "wamid.1");
  assert.deepEqual(w.calls, [{ to: "+13475550101", p: { body: "See you at 3", template: undefined } }]);
  assert.equal(t.messages.length, 1);
  const row = t.messages[0];
  assert.equal(out.messageId, row.id);
  assert.equal(row.status, "sent");
  assert.equal(row.external_id, "wamid.1");
  assert.equal(row.channel, "whatsapp");
  assert.equal(row.sender, "human");
  assert.equal(row.type, "text");
  assert.deepEqual(row.meta, { source: "test" });
  assert.ok(t.conversations[0].last_message_at, "the thread is stamped (by recordOutbound, on its own clock)");
  assert.deepEqual(kinds(t), ["message.sent"]);
});

test("a template is a template row, and the wire gets its name, language and slots", async () => {
  const t = tables();
  const w = wireOf();
  const template = { name: "visit_reminder", language: "en_US", params: ["Luna"] };
  await deliver(ports(t, w), words({ template, body: "Hi Luna" }));
  assert.equal(w.calls[0].p.template, template);
  assert.equal(t.messages[0].type, "template");
});

test("which yes this message needs: the door asks the one predicate with the purpose it was given", async () => {
  // A promotion needs the yes to offers; words in a conversation need the
  // yes to conversation, and only when they START one.
  const cases = [
    [{ purpose: "marketing" }, person(), "no_marketing_consent"],
    [{ purpose: "marketing" }, person({ marketing_consent: "opted_in" }), null],
    [{ proactive: true }, person({ consent: "unknown" }), "not_opted_in"],
    [{ proactive: false }, person({ consent: "unknown" }), null],
    [{}, person({ consent: "opted_out" }), "opted_out"],
    [{}, person({ dnc: true, marketing_consent: "opted_in" }), "opted_out"],
    [{ purpose: "marketing" }, person({ dnc: true, marketing_consent: "opted_in" }), "opted_out"],
    [{}, person({ erased_at: "2026-09-01T00:00:00.000Z" }), "erased"],
  ];
  for (const [over, who, reason] of cases) {
    const t = tables({ conversations: [thread({ contacts: who })] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words(over));
    const label = JSON.stringify([over, who]);
    if (reason) {
      assert.equal(out.outcome, "refused", label);
      assert.equal(out.reason, reason, label);
      assert.equal(w.calls.length, 0, `${label}: nothing reached the wire`);
      assert.equal(t.messages.length, 0, `${label}: a refusal with no row leaves no row`);
      assert.equal(t.events.length, 0, `${label}: and no event to point at nothing`);
    } else {
      assert.equal(out.outcome, "sent", label);
    }
  }
});

test("a paused workspace holds the machine, never the person; a held thread holds the machine, never the person", async () => {
  for (const [row, sender, expected] of [
    [thread({ tenants: { status: "paused" } }), "ai", "paused"],
    [thread({ tenants: { status: "paused" } }), "system", "paused"],
    [thread({ tenants: { status: "paused" } }), "human", null],
    [thread({ paused_until: new Date(NOW + 60_000).toISOString() }), "ai", "human_has_it"],
    [thread({ paused_until: new Date(NOW + 60_000).toISOString() }), "human", null],
    [thread({ paused_until: new Date(NOW - 1).toISOString() }), "ai", null],
    [thread({ tenants: null }), "ai", null],
  ]) {
    const t = tables({ conversations: [row] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender }));
    const label = `${sender} on ${JSON.stringify({ status: row.tenants?.status, paused_until: row.paused_until })}`;
    if (expected) { assert.equal(out.outcome, "refused", label); assert.equal(out.reason, expected, label); }
    else assert.equal(out.outcome, "sent", label);
  }
});

test("a queued row is finalized in place: sent with its id, or canceled with its reason and an event that says why", async () => {
  const queued = { id: "m1", tenant_id: T, conversation_id: "c1", status: "queued", body: "See you at 3", sender: "human", direction: "outbound", created_at: "2026-09-10T09:59:00.000Z" };
  const sentT = tables({ messages: [{ ...queued }] });
  const w = wireOf();
  const sent = await deliver(ports(sentT, w), words({ messageId: "m1" }));
  assert.equal(sent.outcome, "sent");
  assert.equal(sent.messageId, "m1");
  assert.equal(sentT.messages.length, 1, "no second row");
  assert.equal(sentT.messages[0].status, "sent");
  assert.equal(sentT.messages[0].external_id, "wamid.1");
  assert.deepEqual(kinds(sentT), ["message.sent"]);
  assert.equal(sentT.events[0].subject_id, "m1");

  const heldT = tables({ messages: [{ ...queued }], conversations: [thread({ contacts: person({ consent: "opted_out" }) })] });
  const refused = await deliver(ports(heldT, wireOf()), words({ messageId: "m1" }));
  assert.equal(refused.outcome, "refused");
  assert.equal(heldT.messages[0].status, "canceled");
  assert.deepEqual(heldT.messages[0].error, { reason: "opted_out" });
  assert.deepEqual(heldT.events.map((e) => [e.kind, e.data]), [["message.send_blocked", { reason: "opted_out", purpose: "conversational", consent: "opted_out", dnc: false, marketing_consent: "opted_out" }]]);
});

test("a cancel that wins the row after the words left is the signal, never overwritten", async () => {
  // The row was canceled between the send and the write: the text is gone,
  // the row stays canceled, and an event says the two raced.
  const t = tables({ messages: [{ id: "m1", tenant_id: T, conversation_id: "c1", status: "canceled", body: "x", sender: "human", direction: "outbound", created_at: "2026-09-10T09:59:00.000Z" }] });
  const out = await deliver(ports(t, wireOf()), words({ messageId: "m1" }));
  assert.equal(out.outcome, "sent");
  assert.equal(t.messages[0].status, "canceled");
  assert.deepEqual(kinds(t), ["message.send_raced_cancel", "message.sent"]);
});

test("the receptionist's draft is retired when a person answered after it was written", async () => {
  const t = tables({ messages: [
    { id: "m1", tenant_id: T, conversation_id: "c1", status: "queued", body: "We open at 9!", sender: "ai", direction: "outbound", created_at: "2026-09-10T09:59:00.000Z" },
    { id: "m2", tenant_id: T, conversation_id: "c1", status: "sent", body: "9am, see you", sender: "human", direction: "outbound", created_at: "2026-09-10T09:59:30.000Z" },
  ] });
  const w = wireOf();
  const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1" }));
  assert.equal(out.outcome, "refused");
  assert.equal(out.reason, "superseded_by_human");
  assert.equal(w.calls.length, 0);
  assert.equal(t.messages[0].status, "canceled");
  assert.equal(t.events[0].data.after, "m2");
});

test("no wire, no credentials, a provider that says no: each is OURS, a failed row, and an event with the status", async () => {
  // No such channel in this runtime.
  const none = tables({ messages: [{ id: "m1", tenant_id: T, conversation_id: "c1", status: "queued", body: "x", sender: "human", direction: "outbound", created_at: "2026-09-10T09:59:00.000Z" }] });
  const a = await deliver({ db: fakeDb(none), wire: {}, now: () => NOW }, words({ channel: "sms", messageId: "m1" }));
  assert.equal(a.outcome, "failed"); assert.equal(a.reason, "no_sender_for_channel");
  assert.equal(none.messages[0].status, "failed");
  assert.deepEqual(none.messages[0].error, { http_status: 0, body: "no_sender_for_channel" });
  assert.deepEqual(kinds(none), ["message.send_failed"]);

  // The channel exists; this workspace holds nothing for it.
  const bare = tables();
  const b = await deliver({ db: fakeDb(bare), wire: { whatsapp: null }, now: () => NOW }, words());
  assert.equal(b.outcome, "failed"); assert.equal(b.reason, "no_credentials"); assert.equal(b.status, 503);
  assert.equal(bare.messages.length, 1, "recorded as a failed row rather than dropped");
  assert.equal(bare.messages[0].status, "failed");
  assert.deepEqual(bare.messages[0].meta, { http_status: 503, body: "no_credentials" });

  // The provider refused.
  const said = tables();
  const c = await deliver(ports(said, wireOf({ ok: false, wamid: null, status: 400, errorBody: "(#131030) Recipient phone number not in allowed list" })), words({ meta: { source: "voice" } }));
  assert.equal(c.outcome, "failed"); assert.equal(c.reason, "provider"); assert.equal(c.status, 400);
  assert.equal(said.messages[0].status, "failed");
  assert.deepEqual(said.messages[0].meta, { source: "voice", http_status: 400, body: "(#131030) Recipient phone number not in allowed list" });
  assert.equal(c.messageId, said.messages[0].id);
});

test("a wire that cannot be read is not a yes: the door throws, and nothing is sent", async () => {
  const w = wireOf();
  await assert.rejects(deliver({ db: fakeDb(tables(), { "conversations.select": { message: "connection reset" } }), wire: w.wire }, words()), /cannot read the wire/);
  await assert.rejects(deliver(ports(tables({ conversations: [] }), w), words()), /no conversation c1/);
  assert.equal(w.calls.length, 0);
});

test("which yes a queued template needs: Meta's category, failing closed, and a read that fails throws", async () => {
  const t = { templates: [
    { tenant_id: T, channel: "whatsapp", name: "month_offer", language: "en_US", category: "marketing" },
    { tenant_id: T, channel: "whatsapp", name: "visit_reminder", language: "en_US", category: "utility" },
  ] };
  assert.equal(await templatePurpose(fakeDb(t), T, undefined), "conversational");
  assert.equal(await templatePurpose(fakeDb(t), T, { name: "visit_reminder", language: "en_US" }), "conversational");
  assert.equal(await templatePurpose(fakeDb(t), T, { name: "month_offer", language: "en_US" }), "marketing");
  assert.equal(await templatePurpose(fakeDb(t), T, { name: "seeded_by_hand", language: "en_US" }), "marketing", "unknown to us is marketing until Meta says otherwise");
  await assert.rejects(templatePurpose(fakeDb(t, { "templates.select": { message: "reset" } }), T, { name: "month_offer", language: "en_US" }), /cannot read template month_offer/);
});

test("WhatsApp's wire comes from credentials alone, and hands Graph bare digits", async () => {
  assert.equal(whatsappSender(null), null, "no credentials, no wire");
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(JSON.stringify({ messages: [{ id: "wamid.9" }] }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const send = whatsappSender({ phoneId: "p1", accessToken: "tok" });
    const r = await send("+13475550101", { body: "hi" });
    assert.equal(r.ok, true); assert.equal(r.wamid, "wamid.9");
    assert.equal(seen[0].body.to, "13475550101");
    assert.ok(seen[0].url.includes("/p1/messages"));
  } finally { globalThis.fetch = realFetch; }
});

test("a broadcast is a person's words but an automated send: it respects the thread's pause and the workspace's pause", async () => {
  for (const [row, expected] of [
    [thread({ paused_until: new Date(NOW + 60_000).toISOString() }), "human_has_it"],
    [thread({ tenants: { status: "paused" } }), "paused"],
  ]) {
    const t = tables({ conversations: [row] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "human", proactive: true, purpose: "conversational", template: { name: "visit_reminder", language: "en_US", params: [] } }));
    assert.equal(out.outcome, "refused", JSON.stringify(row));
    assert.equal(out.reason, expected);
    assert.equal(w.calls.length, 0);
  }
});

test("the receptionist's own escalation pauses the thread and queues its holding message: the queued draft still goes, unless a person spoke since", async () => {
  const paused = thread({ paused_until: new Date(NOW + 24 * 3600_000).toISOString() });
  const draft = { id: "m1", tenant_id: T, conversation_id: "c1", status: "queued", body: "I've passed this to the team.", sender: "ai", direction: "outbound", created_at: "2026-09-10T09:59:00.000Z" };
  {
    const t = tables({ conversations: [paused], messages: [draft] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1", body: draft.body }));
    assert.equal(out.outcome, "sent", "the holding message reaches the customer");
    assert.equal(t.messages[0].status, "sent");
  }
  {
    const owner = { id: "m2", tenant_id: T, conversation_id: "c1", status: "sent", body: "Hi, Melany here", sender: "human", direction: "outbound", created_at: "2026-09-10T09:59:30.000Z" };
    const t = tables({ conversations: [paused], messages: [draft, owner] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1", body: draft.body }));
    assert.equal(out.outcome, "refused");
    assert.equal(out.reason, "superseded_by_human");
    assert.equal(w.calls.length, 0);
  }
});

test("a wire that cannot be read is a failure with its own name, never a throw past the door", async () => {
  const t = tables();
  const w = wireOf();
  const db = fakeDb(t, { "conversations.select": { message: "connection reset" } });
  const out = await deliverSafely({ db, wire: w.wire, now: () => NOW }, words({ sender: "ai" }));
  assert.equal(out.outcome, "failed");
  assert.equal(out.reason, "wire_unreadable");
  assert.match(out.errorBody, /connection reset/);
  assert.equal(w.calls.length, 0);
});
