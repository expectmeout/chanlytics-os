/**
 * A time a customer picks by text is held for the owner as a request (decision 0061), and only where the code finds it
 * open, never on the model's say.
 *
 * The rule, pure: the slot is a time on the business's clock that starts inside a window computed for the turn and runs
 * as long as the service takes; the service is one the business lists, or none. The switch takes requests only where the
 * team confirms its own bookings. A workspace that takes none is sent exactly the record it always was, and keeps exactly
 * the record it kept.
 *
 * The turn, executed: the WhatsApp handler over fakes, with the model's answer handed in. A slot it finds open opens the
 * request and its hold through the sink's own door, the reply that says the team will confirm goes as written and the
 * thread is a person's; a slot it does not is a person's to answer (booking_reply); a workspace that takes none is asked
 * nothing and records nothing. The edge's sink opens both together, and a slot too soon, or a door that failed, is a
 * reply a person owes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BOOKING_REQUEST_INSTRUCTION,
  BOOKING_REQUEST_WORDS,
  BRAIN_OUTPUT_JSON_SCHEMA,
  brainOutputSchemaFor,
  describeOpenings,
  itemOfAppointment,
  parseBrainOutput,
  requestedBookingOf,
  takesBookingRequests,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { handleInbound } = await import(at("apps/edge/lib/whatsapp/inbound.ts"));
const { pgSink } = await import(at("apps/edge/lib/whatsapp/persist.ts"));
const { takesRequests } = await import(at("apps/edge/lib/calendar/availability.ts"));

const TZ = "America/New_York";
const MIN = 60_000;
/** Saturday 17 October 2026, 2 PM to 5 PM in New York: one window open. */
const WINDOW = { start: Date.parse("2026-10-17T18:00:00Z"), end: Date.parse("2026-10-17T21:00:00Z") };
const TERMS = {
  openings: [{ key: "2026-10-17", weekday: "sat", label: "Saturday, October 17", windows: [WINDOW] }],
  tz: TZ,
  services: [{ name: "Balayage", duration_min: 120 }, { name: "Cut" }],
  slotMin: 30,
};
const asked = (slot, service = "") => requestedBookingOf({ slot, service, ...TERMS });

/* ------------------------------------------------------------------ the rule */

test("a slot is a request only where it starts in a window and the window holds the whole service", () => {
  assert.deepEqual(asked("2026-10-17 14:00", " balayage "), {
    ok: true,
    startMs: WINDOW.start,
    endMs: WINDOW.start + 120 * MIN,
    service: "Balayage",
  });
  assert.deepEqual(asked("2026-10-17 16:30"), {
    ok: true,
    startMs: WINDOW.end - 30 * MIN,
    endMs: WINDOW.end,
    service: null,
  });
  assert.equal(asked("2026-10-17 16:30", "cut").ok, true, "a service with no length takes the slot length");
  assert.deepEqual(
    asked("2026-10-17 15:30", "Balayage"),
    { ok: false, why: "not_open" },
    "two hours from 3:30 runs past 5",
  );
  assert.deepEqual(asked("2026-10-17 13:00"), { ok: false, why: "not_open" });
  assert.deepEqual(asked("2026-10-17 14:00", "Massage"), { ok: false, why: "unknown_service" });
  assert.deepEqual(asked(""), { ok: false, why: "no_slot" });
  assert.deepEqual(asked("Saturday at 2"), { ok: false, why: "unreadable" });
  assert.deepEqual(asked("2026-02-30 10:00"), { ok: false, why: "unreadable" }, "a day that does not exist");
  assert.deepEqual(asked("2026-03-08 02:30"), { ok: false, why: "unreadable" }, "a clock time the spring skips");
});

test("requests are taken only where the switch is on and the team confirms its own bookings", () => {
  const cases = [
    [{ switchOn: false, linkInChat: false, bookingHeld: false }, false],
    [{ switchOn: true, linkInChat: false, bookingHeld: false }, true],
    [{ switchOn: true, linkInChat: true, bookingHeld: false }, false],
    [{ switchOn: true, linkInChat: true, bookingHeld: true }, true],
  ];
  for (const [o, want] of cases) assert.equal(takesBookingRequests(o), want, JSON.stringify(o));
  // The edge's own reading of a workspace's runtime: the switch, the link in chat, the booking row.
  const rt = (over = {}) => ({
    brain: { business_name: "Harbor Nails" },
    known: {},
    policy: {},
    features: { booking_requests: true },
    ...over,
  });
  assert.equal(takesRequests(rt()), true, "no link: the team confirms");
  assert.equal(takesRequests(rt({ features: null })), false, "off by default");
  assert.equal(takesRequests(rt({ brain: { booking_link: "https://book.example.com/x" } })), false, "the link books");
  assert.equal(
    takesRequests(rt({ brain: { booking_link: "https://book.example.com/x" }, policy: { booking: { mode: "ask" } } })),
    true,
    "Ask me first: the team confirms",
  );
});

test("a turn that takes none is sent the record and keeps the record, exactly as before", () => {
  assert.equal(brainOutputSchemaFor({ bookingRequests: false }), BRAIN_OUTPUT_JSON_SCHEMA, "the same schema");
  const on = brainOutputSchemaFor({ bookingRequests: true });
  assert.deepEqual(Object.keys(on.properties).slice(-2), ["booking_slot", "booking_service"]);
  assert.deepEqual(on.required.slice(-2), ["booking_slot", "booking_service"]);
  assert.ok(!("booking_slot" in BRAIN_OUTPUT_JSON_SCHEMA.properties), "and the record itself is untouched");
  const record = {
    reply: "We open at 9.",
    escalate: false,
    intent: "hours",
    confidence: 0.9,
    reason: "",
    language: "en",
  };
  const plain = parseBrainOutput(JSON.stringify(record));
  assert.ok(plain.ok && !("booking_slot" in plain.value) && !("booking_service" in plain.value), "absent stays absent");
  const picked = parseBrainOutput(
    JSON.stringify({ ...record, booking_slot: " 2026-10-17 14:00 ", booking_service: "Cut" }),
  );
  assert.deepEqual([picked.value.booking_slot, picked.value.booking_service], ["2026-10-17 14:00", "Cut"]);
});

test("the open times tell the receptionist to write a time picked as a request only where requests are taken", () => {
  const no = describeOpenings(TERMS.openings, TZ, { hasBookingLink: false, requests: true });
  assert.ok(no.includes(BOOKING_REQUEST_INSTRUCTION), no);
  assert.ok(
    !describeOpenings(TERMS.openings, TZ, { hasBookingLink: false }).includes("booking_slot"),
    "off: as before",
  );
  const link = describeOpenings(TERMS.openings, TZ, { hasBookingLink: true, requests: true });
  assert.ok(!link.includes("booking_slot") && link.includes("booking link"), "a link books: no request");
  const held = describeOpenings(TERMS.openings, TZ, { hasBookingLink: true, bookingHeld: true, requests: true });
  assert.ok(
    held.includes(BOOKING_REQUEST_INSTRUCTION) && held.includes("never send or promise the booking link"),
    held,
  );
});

test("the words a request is said in, and a request's row on the board", () => {
  assert.equal(
    BOOKING_REQUEST_WORDS.hold("Sat, Oct 17, 2:00 PM", "Balayage"),
    "Asked for Sat, Oct 17, 2:00 PM · Balayage",
  );
  assert.equal(
    BOOKING_REQUEST_WORDS.booked("Saturday, October 17 at 2:00 PM", "Eyebrow wax"),
    "You're booked for Saturday, October 17 at 2:00 PM for an Eyebrow wax.",
  );
  assert.equal(
    BOOKING_REQUEST_WORDS.booked("Saturday, October 17 at 2:00 PM", null),
    "You're booked for Saturday, October 17 at 2:00 PM.",
  );
  const row = {
    id: "a1",
    tool: null,
    status: "proposed",
    source: "receptionist",
    conversation_id: "cv-1",
    starts_at: "2026-10-17T18:00:00Z",
    ends_at: "2026-10-17T20:00:00Z",
    all_day: false,
    title: "Balayage",
    service: "Balayage",
    staff: null,
    price: null,
    note: null,
    client_name: "Ana Ruiz",
    client_phone: "+13055550142",
    client_email: null,
    contact_id: "k1",
  };
  assert.deepEqual(itemOfAppointment(row, []).request, { thread_id: "cv-1", open: true });
  assert.deepEqual(
    itemOfAppointment({ ...row, status: "booked" }, []).request,
    { thread_id: "cv-1", open: false },
    "answered, it is a booking, and still one asked for by text",
  );
  assert.equal(
    itemOfAppointment({ ...row, source: "booking_email" }, []).request,
    undefined,
    "a tool's request is the tool's",
  );
});

/* ------------------------------------------------------------------ the turn, executed */

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
const value = { metadata: { phone_number_id: "p1" }, contacts: [{ wa_id: FROM, profile: { name: "Ana" } }] };
const message = (body, id = "wamid.1") => ({
  from: FROM,
  id,
  type: "text",
  timestamp: String(Math.floor(Date.now() / 1000)),
  text: { body },
});
const META = { intent: "booking", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
const REPLY = "Saturday at 2 works. The team will confirm it shortly.";

/** The handler's world: the model answers `answer`; what crosses it is recorded. */
function world({ answer, takes = true, terms = TERMS, withRequest = true }) {
  const seen = { sent: [], escalations: [], requests: [], pauses: [], calls: [] };
  const sink = () => ({
    on: true,
    deliver: async (to, body) => {
      seen.sent.push(body);
      return { outcome: "sent", messageId: "m-out", externalId: "wamid.out" };
    },
    processed: async () => {},
    noteHandled: async () => {},
    allowlistSkip: async () => {},
    unreachableSender: async () => {},
    noteEmail: async () => {},
    vetoFallback: async () => {},
    pause: async (iso) => {
      seen.pauses.push(iso);
    },
    usage: async () => {},
    escalate: async (reason, details) => {
      seen.escalations.push({ reason, details });
      return "opened";
    },
    ...(withRequest
      ? {
          request: async (req) => {
            seen.requests.push(req);
            return "opened";
          },
        }
      : {}),
    media: async () => null,
  });
  const ports = {
    db: () => fakeDb({}),
    runtime: async () => ({
      tenantId: "t1",
      slug: "harbor",
      brain: {
        business_name: "Harbor Nails",
        system_prompt:
          "You are the assistant for Harbor Nails, answering inbound customer messages warmly and briefly.",
        fallbacks: { greeting: "Hi!", error: "A member of the team will reply here soon.", non_text: "Thanks!" },
      },
      notifications: null,
      calendar: null,
      features: { booking_requests: takes },
      policy: { reply: { mode: "auto", limits: {} } },
      waCreds: { accessToken: "tok", phoneId: "p1" },
      timezone: TZ,
      known: {},
      paused: false,
      loadFailed: false,
      configBroken: false,
    }),
    leads: { read: async () => ({ name: null }), personReplyMode: async () => null },
    calendar: {
      openings: async () => null,
      visits: async () => null,
      requests: { takes: (rt) => rt.features?.booking_requests === true, terms: async () => terms },
    },
    budget: { tokensLast24h: async () => 0 },
    persist: {
      thread: async () => ({ history: [], pausedUntil: 0, replies: [], textedBefore: false }),
      ingest: async () => ({
        message_id: "m-in",
        conversation_id: "conv1",
        contact_id: "k1",
        is_new: true,
        processed: false,
        consent: "unknown",
        dnc: false,
        paused_until: null,
      }),
      sink,
      queueReply: async () => false,
    },
    alertStaff: async () => {},
    page: async () => "sent",
    sender: () => async () => ({ ok: true, wamid: "x", status: 200 }),
    brain: async () => ({
      generateReply: async (...args) => {
        seen.calls.push(args[8] ?? null);
        return answer;
      },
    }),
    env: { allowlist: "", modelKey: "sk-test" },
  };
  return { seen, run: (body) => handleInbound(message(body), value, "t1", routed, false, null, ports) };
}

test("a time the code finds open: the request and its hold through the sink's door, the reply as written, the thread a person's", async () => {
  const w = world({
    answer: { text: REPLY, escalate: false, meta: META, booking: { slot: "2026-10-17 14:00", service: "Balayage" } },
  });
  await w.run("Can I come Saturday at 2 for a balayage?");
  assert.equal(w.seen.calls[0]?.bookingRequests, true, "the model was handed the two fields");
  assert.deepEqual(w.seen.sent, [REPLY], "the words that say the team will confirm went as written");
  assert.deepEqual(w.seen.requests, [
    {
      startsAt: "2026-10-17T18:00:00.000Z",
      endsAt: "2026-10-17T20:00:00.000Z",
      service: "Balayage",
      timezone: TZ,
      words: "Asked for Sat, Oct 17, 2:00 PM · Balayage",
    },
  ]);
  assert.deepEqual(w.seen.escalations, [], "one hold, the request's");
  assert.equal(w.seen.pauses.length, 1, "the thread is a person's to confirm");
});

test("a time the code does not find open is a person's to answer, and nothing is recorded", async () => {
  for (const booking of [
    { slot: "2026-10-17 15:30", service: "Balayage" },
    { slot: "2026-10-17 14:00", service: "Massage" },
    { slot: "next Saturday", service: "" },
  ]) {
    const w = world({ answer: { text: REPLY, escalate: false, meta: META, booking } });
    await w.run("Saturday?");
    assert.deepEqual(w.seen.requests, [], JSON.stringify(booking));
    assert.deepEqual(
      w.seen.escalations.map((e) => e.reason),
      ["booking_reply"],
      "so 'the team will confirm' stays true",
    );
  }
  // Openings that could not be read check nothing, so they hold nothing.
  const blind = world({
    terms: null,
    answer: { text: REPLY, escalate: false, meta: META, booking: { slot: "2026-10-17 14:00", service: "" } },
  });
  await blind.run("Saturday?");
  assert.deepEqual([blind.seen.requests, blind.seen.escalations.map((e) => e.reason)], [[], ["booking_reply"]]);
});

test("the model's own handoff on a picked time is the request's; a sink with no door holds the booking as a person's; nothing picked changes nothing", async () => {
  const handoff = world({
    answer: {
      text: REPLY,
      escalate: true,
      reason: "human_token",
      meta: META,
      booking: { slot: "2026-10-17 14:00", service: "" },
    },
  });
  await handoff.run("Saturday at 2, please");
  // The model flags every picked time for a person (the evals of 15 Oct 2026): the request is that person's hold.
  assert.equal(handoff.seen.requests.length, 1, "the request is taken");
  assert.deepEqual(handoff.seen.escalations, [], "one hold, the request's");
  // A refusal is no request: its words were the holding line, not the model's.
  const refused = world({
    answer: {
      text: "Thanks!",
      escalate: true,
      reason: "refusal",
      meta: META,
      booking: { slot: "2026-10-17 14:00", service: "" },
    },
  });
  await refused.run("Saturday at 2");
  assert.deepEqual([refused.seen.requests, refused.seen.escalations.map((e) => e.reason)], [[], ["refusal"]]);
  const doorless = world({
    withRequest: false,
    answer: { text: REPLY, escalate: false, meta: META, booking: { slot: "2026-10-17 14:00", service: "" } },
  });
  await doorless.run("Saturday at 2?");
  assert.deepEqual(
    doorless.seen.escalations.map((e) => e.reason),
    ["booking_reply"],
  );
  const chat = world({ answer: { text: "We open at 9.", escalate: false, meta: META } });
  await chat.run("When do you open?");
  assert.deepEqual([chat.seen.requests, chat.seen.escalations, chat.seen.pauses], [[], [], []]);
});

test("a workspace that takes none is asked for nothing, and a time the model wrote anyway records nothing", async () => {
  const off = world({
    takes: false,
    answer: { text: "We open at 9.", escalate: false, meta: META, booking: { slot: "2026-10-17 14:00", service: "" } },
  });
  await off.run("Saturday at 2?");
  assert.equal(off.seen.calls[0]?.bookingRequests, undefined, "the call is the call it always was");
  assert.deepEqual([off.seen.requests, off.seen.escalations], [[], []]);
});

/* ------------------------------------------------------------------ the edge's sink */

const ING = { message_id: "m-in", conversation_id: "conv1", contact_id: "k1" };
const REQ = {
  startsAt: "2026-10-17T18:00:00.000Z",
  endsAt: "2026-10-17T20:00:00.000Z",
  service: "Balayage",
  timezone: TZ,
  words: "Asked for Sat, Oct 17, 2:00 PM · Balayage",
};

test("the edge's sink opens the request and its hold together; too soon, or a door that failed, is a reply a person owes", async () => {
  const asks = [];
  const opened = fakeDb(
    {},
    {},
    {
      booking_request_open: (args) => {
        asks.push(args);
        return { appointment: { id: "a1", expires_at: "2026-10-16T18:00:00Z" }, replaced: [], hold: "opened" };
      },
    },
  );
  assert.equal(await pgSink(opened, "t1", ING).request(REQ, "Saturday?"), "opened");
  assert.deepEqual(asks, [
    {
      p_tenant_id: "t1",
      p_conversation_id: "conv1",
      p_contact_id: "k1",
      p_starts_at: REQ.startsAt,
      p_ends_at: REQ.endsAt,
      p_service: "Balayage",
      p_timezone: TZ,
      p_words: REQ.words,
    },
  ]);
  const holds = [];
  const fallback = (answer) =>
    fakeDb(
      {},
      {},
      {
        booking_request_open: answer,
        escalation_open: (args) => {
          holds.push([args.p_reason, args.p_details]);
          return "opened";
        },
      },
    );
  assert.equal(
    await pgSink(
      fallback(() => ({ error: "too_soon" })),
      "t1",
      ING,
    ).request(REQ, "In an hour?"),
    "opened",
  );
  await pgSink(
    fallback(() => {
      throw new Error("the database is having a bad minute");
    }),
    "t1",
    ING,
  ).request(REQ, "Saturday?");
  assert.deepEqual(holds, [
    ["booking_reply", "In an hour?"],
    ["booking_reply", "Saturday?"],
  ]);
  assert.equal(await pgSink(null, "t1", ING).request(REQ, "x"), undefined, "no database, nothing to write");
});
