/**
 * The WhatsApp handler, executed.
 *
 * handleInbound runs for real here: its pure gates as themselves, its world
 * (the database, the thread store, the tenant runtime, the sink, the alerts,
 * the pager, the model) as fakes handed in through ports.ts. What is
 * asserted is what a customer, an owner and the platform would see: what
 * left on the wire and labelled how, what was escalated, who was told, and
 * what the memory holds afterwards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { optInConfirmation } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { handleInbound } = await import(at("apps/edge/lib/whatsapp/inbound.ts"));
const { IngestFailed } = await import(at("apps/edge/lib/whatsapp/persist.ts"));
const { FALLBACK_BRAIN, FALLBACK_NOTIFICATIONS } = await import(at("apps/edge/lib/tenant-fallback.ts"));

const GREETING = "Thanks for writing to Harbor Nails. A person will be with you shortly.";
const FROM = "13055550100";
const routed = { channelId: "c1", tenantId: "t1", kind: "whatsapp", externalId: "p1", numberE164: "+13055550199", credentialsRef: null, config: {} };
const runtime = (over = {}) => ({
  tenantId: "t1",
  brain: { ...FALLBACK_BRAIN, business_name: "Harbor Nails", fallbacks: { ...FALLBACK_BRAIN.fallbacks, greeting: GREETING } },
  notifications: FALLBACK_NOTIFICATIONS,
  calendar: null,
  features: null,
  policy: { reply: { mode: "auto", limits: {} } },
  waCreds: { accessToken: "tok", phoneId: "p1" },
  paused: false,
  loadFailed: false,
  configBroken: false,
  ...over,
});
const text = (body, id = "wamid.1", from = FROM) => ({ from, id, type: "text", timestamp: String(Math.floor(Date.now() / 1000)), text: { body } });
const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Dana" } }] };
const ingested = (n) => ({ message_id: "m-in", conversation_id: "conv1", contact_id: "k1", is_new: true, consent: n.optOut ? "opted_out" : "unknown", dnc: !!n.optOut, paused_until: null });

/** The handler's world, recording everything that crosses it. */
function world(over = {}) {
  const memory = new Map();
  const seen = { sent: [], escalations: [], alerts: [], pages: [], pauses: [], processed: 0, unreachable: 0, saved: 0 };
  const rt = over.rt ?? runtime();
  const ports = {
    db: () => fakeDb({}),
    store: {
      get: async (ns, id) => structuredClone(memory.get(`${ns}/${id}`) ?? { history: [], seen: [], pausedUntil: 0, replies: [] }),
      save: async (ns, id, s) => { memory.set(`${ns}/${id}`, structuredClone(s)); seen.saved += 1; return true; },
      backend: () => "memory",
    },
    runtime: async () => rt,
    leads: { read: async () => ({ name: null }), personReplyMode: async () => null },
    calendar: { openings: async () => null, visits: async () => null },
    budget: { tokensLast24h: async () => 0 },
    persist: {
      thread: async () => ({ history: [], seen: [], pausedUntil: 0, replies: [] }),
      ingest: over.ingest ?? (async (_db, _tenant, n) => ingested(n)),
      sink: (_db, _tenant, ing, _rt, channel) => ({
        on: !!ing,
        deliver: async (to, body, meta) => { seen.sent.push({ to, body, meta: meta ?? null, channel }); return { outcome: "sent", messageId: "m-out", externalId: "wamid.out" }; },
        processed: async () => { seen.processed += 1; },
        allowlistSkip: async () => {},
        unreachableSender: async () => { seen.unreachable += 1; },
        vetoFallback: async () => {},
        pause: async (iso) => { seen.pauses.push(iso); },
        usage: async () => {},
        escalate: async (reason, details) => { seen.escalations.push({ reason, details }); return "opened"; },
        media: async () => null,
      }),
      queueReply: async () => false,
    },
    alertStaff: async (thread, userText, botText, reason, _target, pauseHours, route, who) => { seen.alerts.push({ thread, userText, botText, reason, pauseHours, route, who }); },
    page: async (_ports, key, subject, body) => { seen.pages.push({ key, subject, body }); return "sent"; },
    sender: () => async () => ({ ok: true, wamid: "x", status: 200 }),
    brain: async () => { throw new Error("the model must not be reached in this test"); },
    env: { pgReads: false, pgDedupe: false, allowlist: "", modelKey: undefined, ...(over.env ?? {}) },
  };
  const run = (m, extra = {}) => handleInbound(m, value, "t1", routed, false, false, null, { ...ports, ...extra });
  const thread = () => memory.get(`t1/${FROM}`);
  return { run, seen, thread };
}

test("no model key: the workspace's greeting leaves labelled a fallback, the thread goes to a person, the platform is paged once", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  assert.deepEqual(w.seen.sent, [{ to: FROM, body: GREETING, meta: { ack: true, fallback: "no_model" }, channel: "whatsapp" }]);
  assert.equal(w.seen.escalations.length, 1);
  assert.equal(w.seen.escalations[0].reason, "brain_error");
  assert.match(w.seen.escalations[0].details, /no model key/);
  assert.match(w.seen.escalations[0].details, /do you have time tomorrow/, "the customer's words travel with it");
  assert.equal(w.seen.alerts.length, 1);
  assert.equal(w.seen.alerts[0].reason, "no model");
  assert.equal(w.seen.alerts[0].who, "Dana");
  assert.equal(w.seen.alerts[0].route, "inbox/th-conv1");
  assert.deepEqual(w.seen.pages.map((p) => p.key), ["brain_unavailable"]);
  assert.equal(w.seen.pauses.length, 1, "the thread is handed over for the pause window");
  assert.equal(w.seen.processed, 1);
  const t = w.thread();
  assert.ok(t.pausedUntil > Date.now(), "the memory says a person has it");
  assert.deepEqual(t.history.map((h) => h.role), ["user", "assistant"]);
  assert.equal(t.replies.length, 1);
});

test("the same customer's next text inside the pause is recorded and not answered", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  await w.run(text("hello?", "wamid.2"));
  assert.equal(w.seen.sent.length, 1, "nothing more left");
  assert.equal(w.seen.escalations.length, 1, "no second escalation");
  assert.equal(w.seen.processed, 2, "but the message is handled");
  assert.deepEqual(w.thread().history.map((h) => h.role), ["user", "assistant", "user"], "and remembered");
});

test("a redelivered message id is a duplicate: nothing happens twice", async () => {
  const w = world();
  await w.run(text("hi", "wamid.9"));
  await w.run(text("hi", "wamid.9"));
  assert.equal(w.seen.sent.length, 1);
  assert.equal(w.seen.escalations.length, 1);
});

test("a short code is a sender, never a person: recorded, marked handled, nothing sent", async () => {
  const w = world();
  await w.run(text("Your code is 482913", "wamid.3", "12345"));
  assert.equal(w.seen.sent.length, 0);
  assert.equal(w.seen.unreachable, 1);
  assert.equal(w.seen.processed, 1);
  assert.equal(w.seen.escalations.length, 0);
});

test("an ingest the database refuses is not swallowed: IngestFailed surfaces and a copy reaches the mailbox", async () => {
  const w = world({ ingest: async () => { throw new IngestFailed("connection reset"); } });
  await assert.rejects(() => w.run(text("hi")), (e) => e instanceof IngestFailed);
  assert.equal(w.seen.alerts.length, 1);
  assert.equal(w.seen.alerts[0].reason, "message not recorded");
  assert.equal(w.seen.sent.length, 0, "nothing is said to a customer whose words were not kept");
});

test("STOP records the opt-out, escalates once, answers nothing, and the cache remembers", async () => {
  const w = world();
  await w.run(text("STOP"));
  assert.equal(w.seen.sent.length, 0);
  assert.deepEqual(w.seen.escalations.map((e) => e.reason), ["opt_out"]);
  assert.equal(w.seen.alerts[0].reason, "opt-out");
  assert.equal(w.seen.processed, 1);
  assert.equal(w.thread().optedOut, true, "cached, so the opt-out survives a database outage");
});

test("a workspace on ask holds every message for a person and says why", async () => {
  const w = world({ rt: runtime({ policy: { reply: { mode: "ask", limits: {} } } }) });
  await w.run(text("can I book Friday?"));
  assert.equal(w.seen.sent.length, 0);
  assert.equal(w.seen.escalations.length, 1);
  assert.equal(w.seen.escalations[0].reason, "policy_block");
  assert.equal(w.seen.alerts.length, 1);
  assert.equal(w.seen.pages.length, 0, "a workspace's own setting is not the platform's condition");
});

test("START is confirmed in the campaign's own words without the model, and YES OFFERS confirms offers and nothing else", async () => {
  // Every recurring program owes the person who opted in an immediate
  // confirmation, however the yes was given. The words are the ones the
  // campaign files as its opt-in message; which question was answered decides
  // which confirmation goes, and neither confirms the other -- what the live
  // campaign was refused for three times.
  const w = world();
  await w.run(text("START"));
  const visit = optInConfirmation("Harbor Nails", "conversational");
  assert.deepEqual(w.seen.sent, [{ to: FROM, body: visit, meta: { ack: true, confirmation: "conversational" }, channel: "whatsapp" }]);
  assert.match(visit, /^Harbor Nails: /);
  assert.match(visit, /appointments/);
  assert.doesNotMatch(visit, /offer/i);
  assert.equal(w.seen.escalations.length, 0, "a yes is not a problem for a person");
  assert.equal(w.seen.processed, 1);
  assert.deepEqual(w.thread().history.map((h) => h.role), ["user", "assistant"], "and the memory holds it");

  await w.run(text("YES OFFERS", "wamid.2"));
  const offers = optInConfirmation("Harbor Nails", "marketing");
  assert.equal(w.seen.sent.length, 2);
  assert.equal(w.seen.sent[1].body, offers);
  assert.deepEqual(w.seen.sent[1].meta, { ack: true, confirmation: "marketing" });
  assert.match(offers, /offers and news/);
  assert.doesNotMatch(offers, /appointment/i);
});

test("YES OFFERS is not the way back in from a STOP: an opted-out person gets nothing, and START is", async () => {
  // One word opening both programs is what the carriers refuse (30913); the way
  // back in is START, as their own reply to a STOP says.
  const w = world({ ingest: async (_db, _tenant, n) => ({ ...ingested(n), consent: "opted_out", dnc: true }) });
  await w.run(text("YES OFFERS"));
  assert.equal(w.seen.sent.length, 0);
  await w.run(text("START", "wamid.2"));
  assert.equal(w.seen.sent.length, 1);
  assert.equal(w.seen.sent[0].body, optInConfirmation("Harbor Nails", "conversational"));
});
