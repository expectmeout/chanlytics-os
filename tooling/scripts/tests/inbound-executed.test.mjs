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
  const seen = { sent: [], escalations: [], alerts: [], pages: [], pauses: [], processed: 0, unreachable: 0, saved: 0, media: 0, purposes: [] };
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
        deliver: async (to, body, meta, purpose) => {
          seen.sent.push({ to, body, meta: meta ?? null, channel });
          // The port's own default, mirrored: what reaches the door is what counts.
          seen.purposes.push(purpose ?? "conversational");
          return over.delivered ?? { outcome: "sent", messageId: "m-out", externalId: "wamid.out" };
        },
        processed: async () => { seen.processed += 1; },
        allowlistSkip: async () => {},
        unreachableSender: async () => { seen.unreachable += 1; },
        vetoFallback: async () => {},
        pause: async (iso) => { seen.pauses.push(iso); },
        usage: async () => {},
        escalate: async (reason, details) => { seen.escalations.push({ reason, details }); return "opened"; },
        media: async () => { seen.media += 1; return over.media ?? null; },
      }),
      queueReply: async () => false,
    },
    alertStaff: async (thread, userText, botText, reason, ctx) => {
      seen.alerts.push({ thread, userText, botText, reason, pauseHours: ctx.pausedHours ?? null, route: ctx.route, who: ctx.who, channel: ctx.channel });
    },
    page: async (_ports, key, subject, body) => { seen.pages.push({ key, subject, body }); return "sent"; },
    sender: () => async () => ({ ok: true, wamid: "x", status: 200 }),
    brain: async () => { throw new Error("the model must not be reached in this test"); },
    env: { pgReads: false, pgDedupe: false, allowlist: "", modelKey: undefined, ...(over.env ?? {}) },
  };
  const run = (m, extra = {}) => handleInbound(m, value, "t1", routed, !!over.isEnvDefault, false, over.carrier ?? null, { ...ports, ...extra });
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

/* -------------------------------------------------------------------------
 * What the owner is told, and whether it is true.
 * ---------------------------------------------------------------------- */

test("a handoff names the wire the customer wrote on, and promises a pause only where one happened", async () => {
  // The email hardcoded "WhatsApp" and hardcoded the pause, so an owner with
  // both wires connected opened the wrong app, and one told "the receptionist
  // is paused on this thread for 24h" by a branch that paused nothing replied
  // at their leisure and was talked over by the bot's next reply.
  const held = world({ rt: runtime({ policy: { reply: { mode: "ask", limits: {} } } }) });
  await held.run(text("can I book Friday?"));
  assert.equal(held.seen.alerts.length, 1);
  assert.equal(held.seen.alerts[0].pauseHours, null, "'ask' never pauses the thread, so the email must not say it did");
  assert.equal(held.seen.alerts[0].channel, "whatsapp");
  assert.equal(held.seen.pauses.length, 0);

  // The escalating reply DOES pause, and says so.
  const paged = world();
  await paged.run(text("hi"));
  assert.equal(paged.seen.alerts[0].pauseHours, 24);
  assert.equal(paged.seen.pauses.length, 1);

  const sms = world({
    carrier: { channel: "sms", send: async () => ({ ok: true, wamid: "s1", status: 200 }), body: (t) => t, held: null, consent: null },
  });
  await sms.run(text("are you open?"));
  assert.equal(sms.seen.alerts[0].channel, "sms", "a text is not a WhatsApp message, and the owner opens the thread this names");
});

test("a redelivered pin drop escalates and emails once, not once per redelivery", async () => {
  // Meta redelivers undelivered webhooks with backoff for days. The dedupe gate
  // used to sit BELOW this branch, so on the memory path every redelivery
  // re-opened the handoff and sent the owner another email.
  const w = world();
  const pin = { from: FROM, id: "wamid.loc", type: "location", timestamp: String(Math.floor(Date.now() / 1000)), location: { latitude: 25.7, longitude: -80.2 } };
  await w.run(pin);
  await w.run(pin);
  assert.equal(w.seen.escalations.length, 1, "one escalation for one pin drop");
  assert.equal(w.seen.alerts.length, 1, "and one email");
  assert.equal(w.seen.sent.length, 0, "a pin drop is readable: no apology");
});

test("a redelivered STOP does not open the handoff twice", async () => {
  const w = world();
  await w.run(text("STOP"));
  await w.run(text("STOP"));
  assert.deepEqual(w.seen.escalations.map((e) => e.reason), ["opt_out"]);
  assert.equal(w.seen.alerts.length, 1);
});

test("an acknowledgement that did not send neither pauses the thread nor is reported as sent", async () => {
  // The outcome used to be discarded: a refusal or a failure at the wire still
  // paused the receptionist for a day and still told the owner the customer had
  // been acknowledged.
  const w = world({ delivered: { outcome: "failed", reason: "no_credentials", status: 503, errorBody: null, messageId: null } });
  await w.run({ from: FROM, id: "wamid.vn", type: "audio", timestamp: String(Math.floor(Date.now() / 1000)), audio: { id: "a1", mime_type: "audio/ogg" } });
  assert.equal(w.seen.sent.length, 1, "it was attempted");
  assert.equal(w.seen.pauses.length, 0, "but nothing reached the customer, so the receptionist is not muted");
  assert.equal(w.thread().pausedUntil, 0);
  assert.equal(w.seen.alerts[0].pauseHours, null);
  assert.match(w.seen.alerts[0].botText, /could not be sent/);
  assert.match(w.seen.escalations[0].details, /could not be sent/);
});

test("an opt-in confirmation that did not send is not remembered as said, and somebody is told", async () => {
  // The turn was pushed into the memory and persisted BEFORE the send, and the
  // outcome then dropped — so the bot believed it had named the program, the
  // frequency, the rates, HELP and STOP to somebody who heard nothing.
  const w = world({ delivered: { outcome: "failed", reason: "provider", status: 500, errorBody: null, messageId: null } });
  await w.run(text("START"));
  assert.deepEqual(w.thread().history.map((h) => h.role), ["user"], "only what the customer actually said");
  assert.deepEqual(w.seen.escalations.map((e) => e.reason), ["send_failed"]);
  assert.equal(w.seen.alerts[0].reason, "opt-in not confirmed");
  assert.equal(w.seen.processed, 1, "the message is still handled");
});

test("a workspace whose settings could not be READ is not told it has no persona", async () => {
  // loadTenantRuntime's DR stub carries loadFailed and no brain, so an outage
  // read as "No brain profile configured" and sent the owner to Settings to fix
  // a database blip.
  const w = world({ rt: runtime({ brain: null, policy: {}, loadFailed: true }) });
  await w.run(text("hi"));
  assert.equal(w.seen.escalations.length, 1);
  assert.match(w.seen.escalations[0].details, /could not be reached/);
  assert.doesNotMatch(w.seen.escalations[0].details, /No brain profile configured/);
  assert.equal(w.seen.alerts[0].reason, "the workspace's settings could not be reached");
});

test("the rate cap, the budget and a paused workspace all keep the customer's words", async () => {
  // The thread pause above them pushed the turn; these three saved the thread
  // without it, so when the cap reset the receptionist answered the message
  // before the one it never saw.
  const capped = world({ rt: runtime({ policy: { reply: { mode: "auto", limits: { max_replies_day: 0 } } } }) });
  await capped.run(text("actually make it 3pm, not 2pm"));
  assert.deepEqual(capped.seen.escalations.map((e) => e.reason), ["rate_cap"]);
  assert.equal(capped.seen.sent.length, 0);
  assert.ok(
    capped.thread().history.some((h) => h.content === "actually make it 3pm, not 2pm"),
    "the correction has to survive the cap, or tomorrow's reply confirms 2pm",
  );

  const paused = world({ rt: runtime({ paused: true }) });
  await paused.run(text("are you open?"));
  assert.deepEqual(paused.seen.escalations.map((e) => e.reason), ["paused"]);
  assert.ok(paused.thread().history.some((h) => h.content === "are you open?"));
});

test("the pilot allowlist matches however the number is written", async () => {
  // Meta delivers `from` as bare digits and the natural way to write the env
  // var is the E.164 spelling with its "+", so a raw string compare matched
  // nothing — including the tester the list was written for, whose messages
  // were persisted, marked handled and never answered.
  const spelt = world({ isEnvDefault: true, env: { allowlist: `+${FROM}` } });
  await spelt.run(text("hi"));
  assert.equal(spelt.seen.sent.length, 1, "the allowlisted tester is answered whichever spelling the env var uses");

  const other = world({ isEnvDefault: true, env: { allowlist: "+13055550999" } });
  await other.run(text("hi"));
  assert.equal(other.seen.sent.length, 0, "and the list still gates everyone else");
  assert.equal(other.seen.processed, 1, "recorded and marked handled, as before");
});

const photo = (id = "wamid.pic", caption = undefined) => ({
  from: FROM, id, type: "image", timestamp: String(Math.floor(Date.now() / 1000)),
  image: { id: "media-1", mime_type: "image/jpeg", ...(caption ? { caption } : {}) },
});

test("a workspace that will not answer never pays to download the photo", async () => {
  // The fetch ran above the gates: an 8s metadata call, up to 25MB with a 15s
  // timeout, a storage upload and a base64 of the whole buffer — paid in full
  // and then discarded by the branch that discovered billing had stopped.
  const vision = { features: { vision: true } };
  const paused = world({ rt: runtime({ ...vision, paused: true }) });
  await paused.run(photo());
  assert.deepEqual(paused.seen.escalations.map((e) => e.reason), ["paused"]);
  assert.equal(paused.seen.media, 0, "nothing was downloaded for a reply that was never going to happen");

  const capped = world({ rt: runtime({ ...vision, policy: { reply: { mode: "auto", limits: { max_replies_day: 0 } } } }) });
  await capped.run(photo());
  assert.deepEqual(capped.seen.escalations.map((e) => e.reason), ["rate_cap"]);
  assert.equal(capped.seen.media, 0);

  // And a workspace that WILL answer still gets its bytes.
  const live = world({ rt: runtime(vision) });
  await live.run(photo());
  assert.equal(live.seen.media, 1);
});

test("a photo the receptionist meant to read and could not is handed over, never answered from the caption", async () => {
  // The fetch used to sit above the routing, so a failed one fell into the
  // unreadable branch through `!photo`. Below the gates that accident is gone
  // and the handoff has to be said out loud — otherwise the model answers a
  // question about a picture nobody saw.
  const w = world({ rt: runtime({ features: { vision: true } }), media: null });
  await w.run(photo("wamid.pic2", "is this shade too dark?"));
  assert.equal(w.seen.media, 1, "it was attempted");
  assert.deepEqual(w.seen.escalations.map((e) => e.reason), ["non_text"]);
  assert.equal(w.seen.alerts[0].reason, "non-text message");
  assert.equal(w.seen.processed, 1);
  assert.equal(w.seen.sent.length, 1, "only the canned acknowledgement");
  assert.deepEqual(w.seen.sent[0].meta, { ack: true });
});

test("an unreadable attachment still reaches storage, and a redelivery of it does not escalate twice", async () => {
  const w = world();
  const note = { from: FROM, id: "wamid.vn2", type: "audio", timestamp: String(Math.floor(Date.now() / 1000)), audio: { id: "a2", mime_type: "audio/ogg" } };
  await w.run(note);
  assert.equal(w.seen.media, 1, "the attachment is stored even though nobody may look at it");
  await w.run(note);
  assert.equal(w.seen.escalations.length, 1);
  assert.equal(w.seen.alerts.length, 1);
});

test("the confirmation of a YES OFFERS names itself marketing at the door, and everything else is a reply", async () => {
  // The sink stamped every send "conversational", so the one genuinely
  // marketing message this handler writes reached the door claiming to be a
  // reply — and the two rules that exist for it, the marketing yes and offers
  // never going by text, were never asked.
  const w = world();
  await w.run(text("hi"));
  await w.run(text("START", "wamid.2"));
  await w.run(text("YES OFFERS", "wamid.3"));
  assert.deepEqual(w.seen.purposes, ["conversational", "conversational", "marketing"]);
});

test("a confirmation the door refuses reaches a person, not just the log", async () => {
  // `no_marketing_consent` is the one to expect: the OFFERS answer is recorded
  // best-effort a moment earlier and the door fails closed without it, so a
  // consent write that did not land would leave a customer subscribed to
  // nothing and told nothing.
  const w = world({ delivered: { outcome: "refused", reason: "no_marketing_consent", messageId: null } });
  await w.run(text("YES OFFERS"));
  assert.deepEqual(w.thread().history.map((h) => h.role), ["user"], "nothing is remembered as said");
  assert.deepEqual(w.seen.escalations.map((e) => e.reason), ["send_failed"]);
  assert.match(w.seen.escalations[0].details, /no_marketing_consent/);
  assert.equal(w.seen.alerts[0].reason, "opt-in not confirmed");
  assert.equal(w.seen.processed, 1);
});
