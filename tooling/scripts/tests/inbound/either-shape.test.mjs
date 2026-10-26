/**
 * The message path takes either shape for one release (decision 0001, step 2): WhatsApp's normalised message with the
 * raw fields it still reads, as the doors hand it over today, or the one shape (InboundMessage), converted where it
 * enters (core inbound/context.ts). The doors move onto the one shape in step 3; until then nothing in production hands
 * it in, and this is what proves the move changes nothing.
 *
 * The same message runs through the real verb twice, once in each shape, over a world that records everything that
 * crosses its ports: the row the ingest is asked to write, the memory read, the sink and every word it sends, the model's
 * call, the owner told, the platform paged, each log line. The clock is held still, so two runs are two identical
 * recordings or the shapes disagree somewhere a customer would feel it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  inboundFromSms,
  inboundFromWhatsapp,
  normalizeInbound,
  smsInboundFrom,
  smsAsWaMessage,
  withCarrierConsent,
  carrierConsent,
  smsKeywordConsent,
  mergeConsent,
} from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { answerInbound, recordInbound } = await import(
  pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href
);

const NOW = Date.parse("2026-10-26T15:00:00.000Z");
const FROM = "13055550100";
const routed = {
  channelId: "c1",
  tenantId: "t1",
  kind: "whatsapp",
  externalId: "p1",
  numberE164: "+13055550199",
  credentialsRef: null,
  config: {},
};
const runtime = () => ({
  tenantId: "t1",
  slug: "harbor",
  brain: {
    business_name: "Harbor Nails",
    booking_link: "https://booking.example/harbor",
    system_prompt: "You are the assistant for Harbor Nails. Be warm, brief and honest.",
    fallbacks: {
      greeting: "Thanks for writing to Harbor Nails. A person will be with you shortly.",
      error: "Thanks for writing to Harbor Nails! A member of the team will reply here soon.",
      non_text: "Thanks for your message! A member of the team will take a look and reply here soon.",
    },
  },
  notifications: { escalation_emails: ["owner@harbor.example"], from: "Harbor Nails <hello@platform.test>" },
  calendar: null,
  features: null,
  policy: { reply: { mode: "auto", limits: {} } },
  waCreds: { accessToken: "tok", phoneId: "p1" },
  envNumber: false,
  timezone: "America/New_York",
  paused: false,
  known: {},
  loadFailed: false,
  configBroken: false,
});
const SURE = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };

/** What crosses a port, as the recording keeps it: a function is its name, everything else as it was handed over. */
const kept = (v) =>
  typeof v === "function"
    ? "fn"
    : Array.isArray(v)
      ? v.map(kept)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, kept(x)]))
        : v;

/** The verb's world, every call across it recorded in order; `allowlist` is the pilot line's, empty for none. */
function world(allowlist = "") {
  const calls = [];
  const rec = (port, ...args) => calls.push([port, ...args.map(kept)]);
  const history = [];
  const ports = {
    db: () => ({ from: () => assert.fail("the verb never reads the database itself") }),
    runtime: async (_db, r) => (rec("runtime", r), runtime()),
    leads: {
      read: async (_db, ...a) => (rec("leads.read", ...a), { name: null }),
      personReplyMode: async (_db, ...a) => (rec("leads.personReplyMode", ...a), null),
      describe: (lead, _now, ...a) => (rec("leads.describe", lead, ...a), "A new person."),
    },
    calendar: {
      openings: async () => (rec("calendar.openings"), null),
      visits: async (_rt, who) => (rec("calendar.visits", who), null),
    },
    budget: { tokensLast24h: async (_db, ...a) => (rec("budget", ...a), 0) },
    persist: {
      ingest: async (_db, tenant, n, ...a) => {
        rec("persist.ingest", tenant, n, ...a);
        if (n.body) history.push({ role: "user", content: n.body });
        return {
          message_id: "m-in",
          conversation_id: "conv1",
          contact_id: "k1",
          is_new: true,
          processed: false,
          consent: n.optOut ? "opted_out" : "unknown",
          dnc: n.optOut,
          paused_until: null,
        };
      },
      thread: async (_db, tenant, ing) => (
        rec("persist.thread", tenant, ing),
        { history: structuredClone(history), pausedUntil: 0, replies: [], textedBefore: false }
      ),
      sink: (_db, tenant, ing, _rt, channel, wires) => {
        rec("persist.sink", tenant, ing, channel, wires);
        const said =
          (name, answer) =>
          async (...a) => (rec(`sink.${name}`, ...a), answer);
        return {
          on: !!ing,
          deliver: said("deliver", { outcome: "sent", messageId: "m-out", externalId: "out.1" }),
          processed: said("processed"),
          noteHandled: said("noteHandled"),
          allowlistSkip: said("allowlistSkip"),
          unreachableSender: said("unreachableSender"),
          noteEmail: said("noteEmail"),
          replyHeld: said("replyHeld"),
          vetoFallback: said("vetoFallback"),
          pause: said("pause"),
          usage: said("usage"),
          escalate: said("escalate", "opened"),
          media: said("media", null),
        };
      },
      queueReply: async (_db, tenant, ing, to, body, delayMs, _L, ...a) => (
        rec("persist.queueReply", tenant, ing, to, body, delayMs, ...a),
        null
      ),
    },
    alertStaff: async (...a) => rec("alertStaff", ...a),
    page: async (_p, ...a) => (rec("page", ...a), "sent"),
    sender: (cfg) => (rec("sender", cfg), async () => ({ ok: true, wamid: "x", status: 200 })),
    brain: async () => ({
      generateReply: async (...a) => (rec("brain", ...a), { text: "We open at 9.", escalate: false, meta: SURE }),
    }),
    log: (base) => {
      rec("log", base);
      const line = (level) => (event, fields) => rec(`log.${level}`, event, fields ?? null);
      return { info: line("info"), warn: line("warn"), error: line("error") };
    },
    waCfg: (rt, envNumber) => (rec("waCfg", envNumber), rt?.waCreds ?? null),
    env: { allowlist, modelKey: "sk-test" },
  };
  return { ports, calls };
}

/** The same message through the verb in both shapes: one recording each, which must be the same recording. */
async function bothShapes(t, verb, today, oneShape, allowlist = "") {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const before = world(allowlist);
  const after = world(allowlist);
  const was = await verb(today, before.ports);
  const is = await verb(oneShape, after.ports);
  assert.deepEqual(after.calls, before.calls);
  assert.deepEqual(is, was);
  return before.calls;
}

const sent = (calls) => calls.filter(([port]) => port === "sink.deliver").map(([, to, body]) => [to, body]);
const ingested = (calls) => calls.find(([port]) => port === "persist.ingest")[2];

/* ---- WhatsApp: the message and its envelope, as Meta sends them ---- */

const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Dana" } }] };
const wa = (over = {}) => ({
  from: FROM,
  id: "wamid.1",
  type: "text",
  timestamp: String(NOW / 1000 - 5),
  text: { body: "when do you open?" },
  ...over,
});
/** Today's shape, as apps/edge/lib/whatsapp/inbound.ts hands a WhatsApp message to the verb. */
const waToday = (m, over = {}) => ({
  message: normalizeInbound(m, value),
  raw: { id: m.id, from: m.from, type: m.type, timestamp: m.timestamp ?? null },
  tenantId: "t1",
  routed,
  isEnvDefault: false,
  carrier: null,
  ...over,
});
const waOneShape = (m, over = {}) => ({
  inbound: inboundFromWhatsapp(m, value),
  tenantId: "t1",
  routed,
  isEnvDefault: false,
  carrier: null,
  ...over,
});

test("a WhatsApp message is answered the same in either shape: the same row, the same model turn, the same words sent", async (t) => {
  const calls = await bothShapes(t, answerInbound, waToday(wa()), waOneShape(wa()));
  assert.deepEqual(sent(calls), [[FROM, "We open at 9."]], "the run reached the send");
  assert.equal(ingested(calls).profileName, "Dana");
});

test("a WhatsApp picture, a tapped Stop, an ad's message, a late one and one with no time: each the same in either shape", async (t) => {
  const ago = (ms) => String((NOW - ms) / 1000);
  const messages = [
    [
      "a picture",
      wa({ type: "image", text: undefined, image: { id: "m1", mime_type: "image/jpeg", caption: "this?" } }),
    ],
    ["a tapped Stop", wa({ type: "button", text: undefined, button: { text: "Detener", payload: "stop" } })],
    ["an ad's message", wa({ referral: { source_id: "120200000000001", source_type: "ad" } })],
    ["no time", wa({ timestamp: undefined })],
    ["twenty minutes late", wa({ timestamp: ago(20 * 60 * 1000) })],
    ["three hours stale: a person's", wa({ timestamp: ago(3 * 60 * 60 * 1000) })],
    ["a reaction", wa({ type: "reaction", text: undefined, reaction: { message_id: "wamid.0", emoji: "👍" } })],
  ];
  for (const [name, m] of messages) {
    await t.test(name, (st) => bothShapes(st, answerInbound, waToday(m), waOneShape(m)));
  }
  // The pilot line's own number, a sender off its allowlist: set aside alike.
  await t.test("the environment's number, a sender off its allowlist", async (st) => {
    const env = { isEnvDefault: true };
    const calls = await bothShapes(st, answerInbound, waToday(wa(), env), waOneShape(wa(), env), "15550009999");
    assert.ok(
      calls.some(([port]) => port === "sink.allowlistSkip"),
      "set aside",
    );
  });
});

/* ---- A text: Twilio's fields, and the line it came in on ---- */

const FORM = {
  MessageSid: "SM0001",
  AccountSid: "AC1",
  From: `+${FROM}`,
  To: "+13055550199",
  Body: "when do you open?",
  NumMedia: "0",
  MessagingServiceSid: "MG1",
};
/** The line's carrier, as apps/edge/lib/sms/sms-ingress.ts carrierFor makes it: a footer on the first reply. */
const carrierOf = (s, held = null) => ({
  channel: "sms",
  send: async () => ({ ok: true, wamid: "SM-out", status: 200 }),
  body: (text, first) => (first ? `${text}\nReply STOP to opt out` : text),
  held,
  consent: mergeConsent(carrierConsent(s), smsKeywordConsent(s.body)),
});
/** Today's shape, as apps/edge/lib/whatsapp/inbound.ts hands a text to the verb: Twilio's fields as a WhatsApp message. */
const textToday = (form, over = {}) => {
  const s = smsInboundFrom(form);
  const m = smsAsWaMessage(s, over.receivedAt ?? NOW);
  const carrier = carrierOf(s, over.held ?? null);
  return {
    message: withCarrierConsent(normalizeInbound(m, {}), carrier.consent),
    raw: { id: m.id, from: m.from, type: m.type, timestamp: m.timestamp ?? null },
    tenantId: "t1",
    routed: { ...routed, kind: "sms" },
    isEnvDefault: false,
    carrier,
    ...(over.resume ? { resume: true } : {}),
  };
};
const textOneShape = (form, over = {}) => {
  const s = smsInboundFrom(form);
  return {
    inbound: inboundFromSms(s, over.receivedAt ?? NOW),
    tenantId: "t1",
    routed: { ...routed, kind: "sms" },
    isEnvDefault: false,
    carrier: carrierOf(s, over.held ?? null),
    ...(over.resume ? { resume: true } : {}),
  };
};

test("a text is answered the same in either shape: on its line, with the footer on the first reply", async (t) => {
  const calls = await bothShapes(t, answerInbound, textToday(FORM), textOneShape(FORM));
  assert.deepEqual(sent(calls), [[FROM, "We open at 9.\nReply STOP to opt out"]], "the run reached the send");
  assert.equal(ingested(calls).channelTsIso, new Date(NOW).toISOString());
});

test("a text's stop, the carriers' word, a picture alone and a held line: each the same in either shape", async (t) => {
  const cases = [
    ["the carrier's STOP", { ...FORM, Body: "please stop", OptOutType: "STOP" }],
    ["the carriers' word", { ...FORM, Body: "cancel" }],
    ["START", { ...FORM, Body: "START", OptOutType: "START" }],
    ["YES OFFERS", { ...FORM, Body: "YES OFFERS" }],
    ["a picture alone", { ...FORM, Body: "", NumMedia: "1", MediaContentType0: "image/jpeg" }],
    ["words and two pictures", { ...FORM, Body: "these", NumMedia: "2" }],
    ["a code another service sent", { ...FORM, Body: "Your verification code is 482913. Don't share this code." }],
  ];
  for (const [name, form] of cases) {
    await t.test(name, (st) => bothShapes(st, answerInbound, textToday(form), textOneShape(form)));
  }
  const held = { reason: "carriers", details: "The line is not approved for texting yet." };
  await t.test("a line the carriers have not approved", (st) =>
    bothShapes(st, answerInbound, textToday(FORM, { held }), textOneShape(FORM, { held })),
  );
  const stop = await bothShapes(
    t,
    answerInbound,
    textToday({ ...FORM, Body: "cancel" }),
    textOneShape({ ...FORM, Body: "cancel" }),
  );
  assert.equal(ingested(stop).optOut, true, "the carriers' word reached the ingest as a stop");
});

test("a text answered after its acknowledgement: the door's half and the job's half the same in either shape", async (t) => {
  await t.test("the door records it", async (st) => {
    const calls = await bothShapes(st, recordInbound, textToday(FORM), textOneShape(FORM));
    assert.deepEqual(sent(calls), [], "the door answers nothing");
  });
  await t.test("its job answers it", async (st) => {
    const calls = await bothShapes(
      st,
      answerInbound,
      textToday(FORM, { resume: true }),
      textOneShape(FORM, { resume: true }),
    );
    assert.deepEqual(sent(calls), [[FROM, "We open at 9.\nReply STOP to opt out"]]);
  });
  await t.test("its job takes it up three hours after it came: a person's", async (st) => {
    const late = { resume: true, receivedAt: NOW - 3 * 60 * 60 * 1000 };
    const calls = await bothShapes(st, answerInbound, textToday(FORM, late), textOneShape(FORM, late));
    assert.deepEqual(sent(calls), [], "nothing automated is said of a message that old");
  });
});
