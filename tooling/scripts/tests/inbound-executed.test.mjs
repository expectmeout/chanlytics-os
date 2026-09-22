/**
 * The WhatsApp handler, executed.
 *
 * handleInbound runs for real here: its pure gates as themselves, its world
 * (the database, the memory, the tenant runtime, the sink, the alerts, the
 * pager, the model) as fakes handed in through ports.ts. What is asserted is
 * what a customer, an owner and the platform would see: what left on the wire
 * and labelled how, what was escalated, who was told, and what the memory
 * holds afterwards.
 *
 * The memory below is modelled the way Postgres holds it, because that is the
 * only memory there is: `ingest` records the customer's words and answers
 * `is_new` (which IS the redelivery gate), the sink's `deliver` is what makes
 * a reply part of the history, `pause` is what takes the receptionist out of
 * the thread, and `thread` reads all three back. Nothing the handler mutates
 * in hand is remembered — it reports, and the rows are the record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { optInConfirmation, formatPhoneDisplay } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { handleInbound } = await import(at("apps/edge/lib/whatsapp/inbound.ts"));
const { IngestFailed } = await import(at("apps/edge/lib/whatsapp/persist.ts"));

const GREETING = "Thanks for writing to Harbor Nails. A person will be with you shortly.";
const NOTIFICATIONS = () => ({ escalation_emails: ["owner@riverside.example"], from: "Riverside Studio <hello@platform.test>" });
const BRAIN = () => ({
  business_name: "Harbor Nails",
  booking_link: "https://booking.example/riverside",
  system_prompt: "You are the assistant for Harbor Nails, answering inbound customer messages. Be warm, brief and honest, and offer to have a person follow up.",
  fallbacks: {
    greeting: GREETING,
    error: "Thanks for writing to Harbor Nails! A member of the team will reply here soon.",
    non_text: "Thanks for your message! A member of the team will take a look and reply here soon.",
  },
});
const FROM = "13055550100";
const routed = { channelId: "c1", tenantId: "t1", kind: "whatsapp", externalId: "p1", numberE164: "+13055550199", credentialsRef: null, config: {} };
const runtime = (over = {}) => ({
  tenantId: "t1",
  brain: BRAIN(),
  notifications: NOTIFICATIONS(),
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
  // The rows, as Postgres would hold them for this one conversation.
  const memory = { history: [], replies: [], pausedUntil: 0, repliedBefore: false };
  const delivered = new Set();
  const seen = { sent: [], escalations: [], alerts: [], pages: [], pauses: [], processed: 0, unreachable: 0, media: 0, purposes: [] };
  const rt = over.rt ?? runtime();
  const recordIngest = over.ingest ?? (async (_db, _tenant, n) => ingested(n));
  const ports = {
    db: () => fakeDb({}),
    runtime: async () => rt,
    leads: { read: async () => ({ name: null }), personReplyMode: async () => null },
    calendar: { openings: async () => null, visits: async () => null },
    budget: { tokensLast24h: async () => 0 },
    persist: {
      // What readThreadState returns for the conversation the ingest named,
      // or an UNKNOWN thread when there is nothing to read it against.
      thread: async (_db, _tenant, ing) => (ing && !over.unreadable
        ? structuredClone({ history: memory.history, pausedUntil: memory.pausedUntil, replies: memory.replies, repliedBefore: memory.repliedBefore })
        : { history: [], pausedUntil: -1, replies: [], unknown: true }),
      // Persist first, with the atomic is_new claim that IS the redelivery
      // gate. Bound per run, where the message id is known.
      ingest: recordIngest,
      sink: (_db, _tenant, ing, _rt, channel) => ({
        on: !!ing,
        deliver: async (to, body, meta, purpose) => {
          seen.sent.push({ to, body, meta: meta ?? null, channel });
          // The port's own default, mirrored: what reaches the door is what counts.
          seen.purposes.push(purpose ?? "conversational");
          const out = over.delivered ?? { outcome: "sent", messageId: "m-out", externalId: "wamid.out" };
          // The door writes the row, and the row IS the memory: only a reply
          // that actually left is something "we said".
          if (out.outcome === "sent") {
            memory.history.push({ role: "assistant", content: body });
            memory.repliedBefore = true;
            if (!meta?.ack) memory.replies.push(Date.now());
          }
          return out;
        },
        processed: async () => { seen.processed += 1; },
        allowlistSkip: async () => {},
        unreachableSender: async () => { seen.unreachable += 1; },
        vetoFallback: async () => {},
        pause: async (iso) => { seen.pauses.push(iso); memory.pausedUntil = Date.parse(iso); },
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
    env: { allowlist: "", modelKey: undefined, ...(over.env ?? {}) },
  };
  const run = async (m, extra = {}) => {
    // The customer's words go on record before anything else can fail, and
    // the message id is what a redelivery is recognised by.
    const key = `in:${m.id}`;
    const isNew = !delivered.has(key);
    delivered.add(key);
    const body = m.text?.body ?? null;
    if (isNew && body) memory.history.push({ role: "user", content: body });
    ports.persist.ingest = async (db, tenant, n, channel) => {
      const rec = await recordIngest(db, tenant, n, channel);
      return rec && { ...rec, is_new: rec.is_new === false ? false : isNew, paused_until: memory.pausedUntil ? new Date(memory.pausedUntil).toISOString() : null };
    };
    return handleInbound(m, value, "t1", routed, !!over.isEnvDefault, over.carrier ?? null, { ...ports, ...extra });
  };
  const thread = () => structuredClone(memory);
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
  // Labelled an acknowledgement, so it does not spend the cap that exists to
  // stop loops -- the same rule that keeps three photos in a morning from
  // silencing the receptionist for the day (reply-cap.test.mjs).
  assert.equal(t.replies.length, 0);
});

test("a hold that cannot be written: the veto window sends now and says so; the confidence floor sends nothing and hands the thread to a person", async () => {
  const sure = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
  const unsure = { ...sure, confidence: 0.3 };
  const model = (meta) => ({ brain: async () => ({ generateReply: async () => ({ text: "We open at 9.", escalate: false, meta }) }) });
  // queueReply answers false in this world: no hold can be written.
  const veto = world({ env: { modelKey: "sk-test" }, rt: runtime({ policy: { reply: { mode: "veto", limits: { reply_delay_ms: 60_000 } } } }) });
  await veto.run(text("when do you open?"), model(sure));
  assert.equal(veto.seen.sent.length, 1, "the veto window is a comfort: the reply goes now rather than late");
  assert.equal(veto.seen.escalations.length, 0);
  assert.equal(veto.seen.processed, 1);

  const floor = world({ env: { modelKey: "sk-test" }, rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } }) });
  await floor.run(text("when do you open?"), model(unsure));
  assert.equal(floor.seen.sent.length, 0, "the floor is a policy: a reply the model is not sure of never sends itself, whatever the database did");
  assert.equal(floor.seen.escalations.length, 1);
  assert.equal(floor.seen.escalations[0].reason, "policy_block");
  assert.match(floor.seen.escalations[0].details, /not sure enough/);
  assert.match(floor.seen.escalations[0].details, /could not be written/);
  assert.match(floor.seen.escalations[0].details, /when do you open/, "the customer's words travel with it");
  assert.equal(floor.seen.pauses.length, 1, "the thread is a person's for the pause window");
  assert.equal(floor.seen.alerts.length, 1, "the owner is told");
  assert.match(floor.seen.alerts[0].reason, /nothing was sent/);
  assert.equal(floor.seen.processed, 1, "marked handled: the redelivery gate holds");
  const t = floor.thread();
  assert.ok(t.pausedUntil > Date.now());
  assert.deepEqual(t.history.map((h) => h.role), ["user"], "the unsent words are not remembered as said");

  // Sure enough under the same floor: the reply goes (the hold was never asked for).
  const fine = world({ env: { modelKey: "sk-test" }, rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } }) });
  await fine.run(text("when do you open?"), model(sure));
  assert.equal(fine.seen.sent.length, 1);
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

test("STOP records the opt-out, escalates once, answers nothing, and keeps no second copy of the answer", async () => {
  const w = world();
  await w.run(text("STOP"));
  assert.equal(w.seen.sent.length, 0);
  assert.deepEqual(w.seen.escalations.map((e) => e.reason), ["opt_out"]);
  assert.equal(w.seen.alerts[0].reason, "opt-out");
  assert.equal(w.seen.processed, 1);
  // The answer lives in `contacts.consent` and nowhere else. It used to be
  // cached on the Blob thread as well, for the case where Postgres did not
  // answer -- which cost a read and a write in front of every brain call and
  // is a case that can no longer arise: a thread that cannot be read never
  // reaches the consent gate, it goes to a person.
  assert.equal("optedOut" in w.thread(), false, "no second copy to go stale");
  assert.deepEqual(w.thread().history.map((h) => h.content), ["STOP"], "the words are on record; nothing was said back");
});

test("a memory that cannot be read hands the conversation to a person, and answers nothing", async () => {
  // THE BEHAVIOUR WITH NOWHERE TO FALL BACK TO. Postgres is the only memory,
  // so a read that did not answer leaves the receptionist not knowing whether
  // a human has taken this thread over, what was already said, or how many
  // replies have gone out today. Every gate below would be answering from an
  // invented empty history -- it would greet a customer mid-conversation and
  // talk over the person handling it. So it does not answer at all.
  //
  // The customer's message is already on record: the ingest runs first, and
  // that is what makes this safe rather than a loss.
  const w = world({ unreadable: true });
  await w.run(text("hi, is my 3pm still on?"));
  assert.equal(w.seen.sent.length, 0, "nothing is said from a history nobody could read");
  assert.deepEqual(w.seen.escalations.map((e) => e.reason), ["state_unavailable"]);
  assert.match(w.seen.escalations[0].details, /could not read this thread's history/);
  assert.equal(w.seen.alerts.length, 1, "and a person is told, by name of the thread");
  assert.equal(w.seen.alerts[0].reason, "state unavailable");
  assert.equal(w.seen.processed, 1, "marked handled, so a redelivery does not open it twice");
  assert.equal(w.seen.pauses.length, 0, "the receptionist did not speak, so it claims no pause");
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
  // loadTenantRuntime's failed read carries loadFailed and no brain, so an outage
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

/* ------------------------- in the business's name, as it is now (S5) ------------------------- */

// The three messages sent when the receptionist cannot answer were written once, with the number and the booking link
// baked in. They may now name {business}, {booking link} and {phone}, each filled as the message goes out.

test("REGRESSION (S5): a voice note's acknowledgement gives the line the receptionist answers, as it is now -- the number was baked in the day the message was written", async () => {
  const LINE = "+13055550123";
  const rt = runtime({
    brain: { ...runtime().brain, fallbacks: { ...runtime().brain.fallbacks, non_text: "Thanks for your message! For anything urgent, call us at {phone}." } },
    known: { workspace: { name: "Harbor Nails", timezone: null }, channels: [{ kind: "voice", number_e164: LINE, status: "active" }], listing: null },
  });
  const w = world({ rt });
  await w.run({ from: FROM, id: "wamid.vn9", type: "audio", timestamp: String(Math.floor(Date.now() / 1000)), audio: { id: "a9", mime_type: "audio/ogg" } });
  assert.deepEqual(w.seen.sent.map((s) => s.body), [`Thanks for your message! For anything urgent, call us at ${formatPhoneDisplay(LINE)}.`]);
});

test("REGRESSION (S5): with no model key the greeting names the business and its booking link as they are now", async () => {
  const rt = runtime({ brain: { ...runtime().brain, booking_link: "https://book.example/harbor", fallbacks: { ...runtime().brain.fallbacks, greeting: "Thanks for writing to {business}. Book at {booking link}." } } });
  const w = world({ rt });
  await w.run(text("hi, do you have time tomorrow?"));
  assert.deepEqual(w.seen.sent.map((s) => s.body), ["Thanks for writing to Harbor Nails. Book at https://book.example/harbor."]);
});

test("REGRESSION (S5): the holding message is filled as it goes out, whether the model hands it back or fails outright", async () => {
  const rt = runtime({ brain: { ...runtime().brain, fallbacks: { ...runtime().brain.fallbacks, error: "Sorry — {business} will reply here soon." } } });
  const handedBack = world({ rt, env: { modelKey: "k" } });
  await handedBack.run(text("are you open?"), { brain: async () => ({ generateReply: async (_h, _t, _s, fallback) => ({ text: fallback, escalate: true, reason: "refusal" }) }) });
  assert.deepEqual(handedBack.seen.sent.map((s) => s.body), ["Sorry — Harbor Nails will reply here soon."], "handed to the model filled, so what it hands back is filled");
  const failed = world({ rt, env: { modelKey: "k" } });
  await failed.run(text("are you open?", "wamid.2"), { brain: async () => ({ generateReply: async () => { throw new Error("model down"); } }) });
  assert.deepEqual(failed.seen.sent.map((s) => s.body), ["Sorry — Harbor Nails will reply here soon."]);
});
