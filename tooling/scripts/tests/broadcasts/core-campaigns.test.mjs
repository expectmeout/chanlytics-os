/**
 * The dashboard's campaign verbs, run: a person's broadcast, the approval,
 * the cancel and the playbook's check, every branch through fakes that log
 * their writes. outbound-routes.test.mjs keeps running the routes, now
 * adapters, through route().
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BROADCAST_MAX_RECIPIENTS,
  EVERYONE_LABEL,
  FOLLOW_UP_NEEDS_DEALS,
  REACH_OUT_IS_NOT_A_MOMENT,
  PEOPLE_LISTS,
  FOLLOW_UP_NEEDS_LINK,
  err,
  MESSAGE_MOMENT_WORDS,
  MOMENTS_RETIRED,
  WIN_BACK_WORDS,
  broadcastName,
  channelsReady,
  emptyAudienceRefusal,
  noNumberWords,
  numberHealth,
  paramLabel,
  starterForTrigger,
  templateTitle,
  toPersonRowVM,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { localDate as tzDate } from "@chanlytics/contracts";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const { createBroadcast } = await importSrc("packages/core/src/campaigns/create-broadcast.ts");
const { approveRun } = await importSrc("packages/core/src/campaigns/approve.ts");
const { cancelBroadcast } = await importSrc("packages/core/src/campaigns/cancel.ts");
const { checkPlaybook } = await importSrc("packages/core/src/campaigns/check-playbook.ts");

const NOW = new Date("2026-09-06T14:00:00Z");
const D = 86_400_000;
const T1 = "77777777-7777-4777-8777-777777777771";
const S1 = "66666666-6666-4666-8666-666666666661";
const WRITES = new Set([
  "assemble",
  "holdRecipients",
  "fail",
  "schedule",
  "record",
  "release",
  "hold",
  "withdraw",
  "cancel",
]);

const template = (over = {}) => ({
  id: T1,
  name: "month_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  variables: [],
  title: null,
  ...over,
});
/** A person as the People page reads them: quiet for 40 days, said yes to both. */
const person = (id, over = {}) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555123${String(id).padStart(4, "0")}`,
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "in_person",
    marketing: "opted_in",
    marketingSource: "in_person",
    marketingSub: "",
  },
  lastContact: { ts: NOW.getTime() - 40 * D, label: "" },
  // Last heard from forty of the workspace's days ago: Quiet 30+ days reads this (lists.ts).
  heardDays: 40,
  ...over,
});
const people = [
  person("a"),
  person("b", { state: "active", heardDays: 3 }),
  person("c", { consent: { state: "opted_in", dnc: false, marketing: "unknown" } }),
  person("d", { consent: { state: "unknown", dnc: false, marketing: "unknown" } }),
];
const noOne = [person("d", { consent: { state: "unknown", dnc: false, marketing: "unknown" } })];

const GREEN = numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" });
const ACTIVE_LINE = { sms_state: "active", reg_mock: false };
/**
 * What the workspace can send on, as the channels port answers it (the adapter's, over contracts channelsReady): WhatsApp
 * by its number's health, a text by its line, an email by its mailbox and the deployment's domain. By default WhatsApp
 * alone is ready, as every workspace was before the channels.
 */
const workspace = ({ health = GREEN, textLine = null, mailbox = false, domain = false, offers = null } = {}) => ({
  ready: channelsReady({
    whatsapp: health ? { canSend: health.canSend, refusal: health.refusal } : null,
    textLine,
    email: { mailbox, domain, ...(offers ? { offers } : {}) },
  }),
  health,
});

/** Offers by email can go: the campaigns domain verified, the business's address on file, no pause. */
const OFFERS_OPEN = { campaigns: true, address: true, paused: null };

/** Every port answers a value or a function of its arguments; the writes log their call as [name, ...args]. */
function fakes(over = {}) {
  const log = [];
  const answers = {
    template: template(),
    bookingLink: "https://book.example/m",
    people,
    // One list, resolved and counted the one way (the adapter's poolList): here, a People list over the people these
    // fakes hold, and no list of the workspace's own unless a test gives one.
    list: null,
    // Step 3: the number's health and the workspace's other channels come from one read; the message's email and text
    // versions (a templates row of its name and language on that channel) from another.
    channels: workspace(),
    versions: [],
    // 14:00 UTC is 10:00 in New York: inside the hours a send may go out in.
    timezone: "America/New_York",
    assemble: "b1",
    // The month's allowance, counted before anyone is enrolled: the emails and texts this workspace's campaigns have sent
    // this month. None here; a test gives the count, or a refusal to read it.
    monthSent: 0,
    holdRecipients: undefined,
    fail: undefined,
    schedule: undefined,
    record: "d1",
    release: true,
    hold: undefined,
    withdraw: 1,
    cancel: true,
    dealsOn: false,
    // 2 Oct 2026: whether a calendar is connected, which win-back a new playbook may be (check-playbook).
    calendarOn: false,
    ...over,
  };
  if (answers.list === null) {
    const pool = answers.people;
    answers.list = (ref) => {
      if (ref.kind !== "builtin") return null;
      const l = PEOPLE_LISTS.find((x) => x.id === ref.id);
      return l ? { label: l.label, memberIds: pool.filter(l.test).map((r) => r.id) } : null;
    };
  }
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]), of: (name) => log.filter((l) => l[0] === name) };
}
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
/**
 * What a refusal costs the person and the log: the envelope the route answers it with (withRoute sends an AppError's code,
 * message and details as they stand), and the lines the call logged (the logger writes one JSON object to console.error).
 */
async function refusedLoudly(p) {
  const said = [];
  const error = console.error;
  console.error = (...args) => said.push(JSON.parse(args[0]));
  try {
    const e = await p.then(
      () => assert.fail("it should have been refused"),
      (x) => x,
    );
    return { e, wire: JSON.stringify(err(e.code, e.message, e.details)), said };
  } finally {
    console.error = error;
  }
}
const everyone = { kind: "everyone" };
const make = (f, body) => createBroadcast(f.ports, { userId: "u1", body, now: NOW });

test("a broadcast is refused in the person's words, in order, before anything is written: the template, who, the list, the template as Meta holds it, the values, the link", async () => {
  const f = fakes();
  await refused(make(f, { template_id: "nope", audience: everyone }), "validation", 400, "Pick a template.");
  await refused(
    make(f, { template_id: T1, audience: { kind: "carrier pigeons" } }),
    "validation",
    400,
    "Pick who this goes to.",
  );
  await refused(make(f, { template_id: T1, audience: { kind: "saved", id: "x" } }), "validation", 400, "Pick a list.");
  await refused(
    make(f, { template_id: T1, audience: { kind: "list", id: "nope" } }),
    "validation",
    400,
    "Pick a list.",
  );
  await refused(
    make(fakes({ template: null }), { template_id: T1, audience: everyone }),
    "not_found",
    404,
    "Template not found.",
  );
  await refused(
    make(fakes({ template: template({ meta_status: "pending" }) }), { template_id: T1, audience: everyone }),
    "conflict",
    409,
    "not approved by WhatsApp",
  );
  await refused(
    make(fakes({ template: template({ variables: ["1"] }) }), { template_id: T1, params: [], audience: everyone }),
    "validation",
    400,
    "This template takes 1 value.",
  );
  await refused(
    make(f, { template_id: T1, params: ["extra"], audience: everyone }),
    "validation",
    400,
    "This template takes no values.",
  );
  await refused(
    make(fakes({ template: template({ variables: ["1"] }) }), {
      template_id: T1,
      params: [{ kind: "moon_phase" }],
      audience: everyone,
    }),
    "validation",
    400,
    "Each value is typed text",
  );
  await refused(
    make(fakes({ template: template({ variables: ["1"] }) }), {
      template_id: T1,
      params: ["line\nbreak"],
      audience: everyone,
    }),
    "validation",
    400,
    "without line breaks or tabs",
  );
  await refused(
    make(fakes({ template: template({ variables: ["1"] }), bookingLink: null }), {
      template_id: T1,
      params: ["@booking_link"],
      audience: everyone,
    }),
    "conflict",
    409,
    "This message takes the booking link, and none is on file.",
  );
  // REGRESSION (C6): a one-off broadcast has no visit, so a visit's slot left every person held back as a missing value and the broadcast read as sent.
  await refused(
    make(fakes({ template: template({ variables: ["1"] }) }), {
      template_id: T1,
      params: ["@visit_when"],
      audience: everyone,
    }),
    "validation",
    400,
    "Only a visit reminder or an after-the-visit playbook can fill in a visit's time or service.",
  );
  await refused(
    make(fakes({ template: template({ variables: ["1"] }) }), {
      template_id: T1,
      params: [{ kind: "visit_service" }],
      audience: everyone,
    }),
    "validation",
    400,
    "Only a visit reminder or an after-the-visit playbook can fill in a visit's time or service.",
  );
  assert.deepEqual(f.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
});

test("a list the send can't count here is refused in its own words, never sent to nobody (decision 0009)", async () => {
  const f = fakes({
    list: () => ({
      label: "Lapsed regulars",
      unknown: "This list reads your calendar, which can't be read right now.",
    }),
  });
  await refused(
    make(f, { template_id: T1, audience: { kind: "saved", id: S1 } }),
    "conflict",
    409,
    "Lapsed regulars can't be counted here. This list reads your calendar, which can't be read right now.",
  );
  assert.deepEqual(f.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
  // Every People list is an audience now, not the five the refusal once named: resolved through the one port.
  const booked = fakes({ list: (ref) => (ref.id === "booked" ? { label: "Booked", memberIds: ["a"] } : null) });
  await make(booked, { template_id: T1, audience: { kind: "list", id: "booked" } });
  assert.deepEqual(
    booked.of("assemble")[0][2].map((r) => r.contact_id),
    ["a"],
  );
});

test("the audience: everyone, a People list, or a list kept by hand, crossed with the yes this template's category needs; an empty audience says which yes was missing", async () => {
  const all = fakes();
  await make(all, { template_id: T1, audience: everyone });
  assert.deepEqual(
    all.of("assemble")[0][2].map((r) => r.contact_id),
    ["a", "b"],
    "marketing: the yes to offers",
  );
  assert.equal(all.of("assemble")[0][1].audience.label, EVERYONE_LABEL);
  const utility = fakes({ template: template({ category: "utility" }) });
  await make(utility, { template_id: T1, audience: everyone });
  assert.deepEqual(
    utility.of("assemble")[0][2].map((r) => r.contact_id),
    ["a", "b", "c"],
    "a utility message needs only the yes to messages",
  );
  const quiet = fakes();
  await make(quiet, { template_id: T1, audience: { kind: "list", id: "quiet" } });
  assert.deepEqual(
    quiet.of("assemble")[0][2].map((r) => r.contact_id),
    ["a"],
  );
  // The send keeps the list as it was counted (decision 0009): its token, and its rule then.
  const counted = { counted_at: NOW.toISOString(), rule: null };
  assert.deepEqual(quiet.of("assemble")[0][1].audience, {
    kind: "list",
    id: "quiet",
    label: "Quiet 30+ days",
    list: { token: "seg:quiet", ...counted },
  });
  const saved = fakes({ list: (ref) => (ref.id === S1 ? { label: "VIPs", memberIds: ["b", "d"] } : null) });
  await make(saved, { template_id: T1, audience: { kind: "saved", id: S1 } });
  assert.deepEqual(
    saved.of("assemble")[0][2].map((r) => r.contact_id),
    ["b"],
    "on the list and said yes",
  );
  assert.deepEqual(saved.of("assemble")[0][1].audience, {
    kind: "saved",
    id: S1,
    label: "VIPs",
    list: { token: `list:${S1}`, ...counted },
  });
  await refused(
    make(fakes(), { template_id: T1, audience: { kind: "saved", id: S1 } }),
    "not_found",
    404,
    "List not found.",
  );
  const nobody = fakes({ people: noOne });
  await refused(
    make(nobody, { template_id: T1, audience: everyone }),
    "conflict",
    409,
    emptyAudienceRefusal("marketing", EVERYONE_LABEL, noOne, { channels: ["whatsapp"], about: "ours" }),
  );
  await refused(
    make(fakes({ people: noOne, template: template({ category: "utility" }) }), {
      template_id: T1,
      audience: everyone,
    }),
    "conflict",
    409,
    emptyAudienceRefusal("conversational", EVERYONE_LABEL, noOne, { channels: ["whatsapp"], about: "ours" }),
  );
  const crowd = Array.from({ length: BROADCAST_MAX_RECIPIENTS + 1 }, (_, i) => person(i));
  await refused(
    make(fakes({ people: crowd }), { template_id: T1, audience: everyone }),
    "validation",
    400,
    `At most ${BROADCAST_MAX_RECIPIENTS} people in one broadcast.`,
  );
  assert.deepEqual(nobody.ops(), []);
});

test("REGRESSION: an empty audience says which of its two causes it has -- a yes with no number to send to read 'Nobody there has said yes', and every refusal sent the owner to a QR 'on this page'", async () => {
  // People's rows as the route reads them: the database's rows through contracts' toPersonRowVM.
  const at = (days) => new Date(NOW.getTime() - days * D).toISOString();
  const row = (over) =>
    toPersonRowVM(
      {
        id: "x",
        display_name: null,
        wa_profile_name: null,
        phone_e164: null,
        email: null,
        consent: "opted_in",
        consent_source: "in_person",
        consent_updated_at: at(20),
        dnc: false,
        marketing_consent: null,
        marketing_consent_source: null,
        marketing_consent_updated_at: null,
        channels: ["whatsapp"],
        conversation_count: 1,
        escalation_count: 0,
        needs_human: false,
        open_escalation_reason: null,
        open_escalation_since: null,
        latest_conversation_id: null,
        latest_state: "open",
        latest_paused_until: null,
        latest_assignee_user_id: null,
        latest_snooze_until: null,
        latest_wa_inbound_at: null,
        last_message_at: at(3),
        last_message_direction: "inbound",
        last_message_sender: "customer",
        last_inbound_text: "Thanks!",
        last_inbound_at: at(3),
        last_call_at: null,
        call_count: 0,
        call_seconds: 0,
        first_contact_at: at(30),
        earliest_row_at: at(30),
        has_backfill: false,
        has_chat: true,
        queued_reply_at: null,
        ...over,
      },
      ZONE,
      NOW,
    );
  const rows = [
    // Wrote in by email and said yes to both there: an address, and no number (the email channel, live since 18 Sep).
    row({
      id: "ana",
      display_name: "Ana Reyes",
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: at(20),
    }),
    // Walked in, said yes to messages at the desk, and left no number.
    row({
      id: "bea",
      display_name: "Bea Soto",
      channels: [],
      has_chat: false,
      conversation_count: 0,
      latest_state: null,
      last_message_at: null,
      last_message_direction: null,
      last_message_sender: null,
      last_inbound_text: null,
      last_inbound_at: null,
    }),
    // A number, and a yes to messages only: offers he was never asked about.
    row({ id: "luis", display_name: "Luis Mora", wa_profile_name: "Luis", phone_e164: "+17865550183" }),
    // A number, and no yes to anything yet.
    row({
      id: "cleo",
      display_name: "Cleo Park",
      phone_e164: "+17865550184",
      consent: null,
      consent_source: null,
      consent_updated_at: null,
    }),
  ];
  const REGULARS = "66666666-6666-4666-8666-666666666662";
  const WALK_INS = "66666666-6666-4666-8666-666666666663";
  const DESK = "66666666-6666-4666-8666-666666666664";
  const NEW = "66666666-6666-4666-8666-666666666665";
  const lists = {
    [REGULARS]: { name: "Regulars", memberIds: ["ana", "luis"] },
    [WALK_INS]: { name: "Walk-ins", memberIds: ["luis"] },
    [DESK]: { name: "At the desk", memberIds: ["bea"] },
    [NEW]: { name: "New", memberIds: ["cleo"] },
  };
  // Where a yes is got: in Sent, the ledger's card since #758. Not "on this page" -- these words are read in a
  // toast on the send screen, which has no QR, and in Ask, which is no page at all.
  const noYesToOffers =
    "Nobody there has said yes to offers yet — that is a separate answer from saying yes to messages, and only it puts somebody on a promotional broadcast. Record it under “Offers and news” on a person's profile, or get their yes with the phrase and the QR in Sent.";
  const noYesToMessages =
    "Nobody there has said yes to messages yet. Even a reminder about their own visit needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and the QR in Sent.";
  /** The route's refusal of one list, for a message of this category: its status and its words, whole. */
  const refusalOf = async (list, category = "marketing") => {
    const f = fakes({
      people: rows,
      list: (ref) => (lists[ref.id] ? { label: lists[ref.id].name, memberIds: lists[ref.id].memberIds } : null),
      template: template({ category }),
    });
    try {
      await make(f, { template_id: T1, audience: { kind: "saved", id: list } });
    } catch (e) {
      assert.deepEqual(f.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
      return [e.status, e.message];
    }
    assert.fail(`a broadcast to ${lists[list].name} went out`);
  };

  // Ana said yes to offers, and there is no number to send one to: the list is missing a number, not an answer.
  // People's words for it (#663), naming the list as the send screen names it (#811) -- and no QR, which would ask
  // Ana for the yes she gave.
  assert.deepEqual(
    await refusalOf(REGULARS),
    [409, noNumberWords("“Regulars”", "marketing")],
    "REGRESSION: 'Nobody there has said yes to offers yet'",
  );
  // Nobody on Walk-ins said yes to offers -- Ana did, and she is not on it: that IS a missing answer.
  assert.deepEqual(await refusalOf(WALK_INS), [409, noYesToOffers]);
  // The yes is the message's own. Bea said yes to messages, so a message to her list is missing a number...
  assert.deepEqual(await refusalOf(DESK, "utility"), [409, noNumberWords("“At the desk”", "conversational")]);
  // ...and an offer to it is missing her answer.
  assert.deepEqual(await refusalOf(DESK), [409, noYesToOffers]);
  // Cleo has a number and has said yes to nothing: a message to her is missing its answer too.
  assert.deepEqual(await refusalOf(NEW, "utility"), [409, noYesToMessages]);
});

test("the number: none connected, flagged, or an audience past the day's limit, refused before a row", async () => {
  await refused(
    make(fakes({ channels: workspace({ health: null }) }), { template_id: T1, audience: everyone }),
    "conflict",
    409,
    "Connect a WhatsApp number first",
  );
  const flagged = fakes({
    channels: workspace({ health: numberHealth({ quality: "RED", event: null, limit: "TIER_1K" }) }),
  });
  await refused(
    make(flagged, { template_id: T1, audience: everyone }),
    "conflict",
    409,
    "WhatsApp flagged this number's quality",
  );
  const many = Array.from({ length: 51 }, (_, i) => person(i));
  const over = fakes({
    people: many,
    channels: workspace({ health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_50" }) }),
  });
  await refused(
    make(over, { template_id: T1, audience: everyone }),
    "validation",
    400,
    "Send to a smaller list or split it.",
  );
  assert.deepEqual(over.ops(), []);
});

/**
 * A person with an email address too, who said yes on WhatsApp and by text, and last wrote on a channel or none: what
 * reachFor picks a channel from (an offer by email waits for its release). They have dealt with the business (a
 * relationship on record, as a customer has), which is what lets an email the business chose to send reach them with no
 * yes covering email: a broadcast's message is ours (decision D1), and these tests' subject is the channels, not that rule.
 */
const reachable = (id, over = {}) => {
  const p = person(id);
  return {
    ...p,
    email: `p${id}@example.com`,
    lastChannel: null,
    consent: { ...p.consent, channels: ["whatsapp", "sms"], marketingChannels: null, relationship: true },
    ...over,
  };
};

test("a broadcast goes by the channels it ticks, each person once on the first that reaches them, the channel written on their row", async () => {
  // A visit reminder, so a message about their own visit: no yes to offers needed, and an email carries it.
  const utility = template({ category: "utility" });
  const ready = workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true });
  const people = [
    reachable("a"), // a number and an address, never wrote: WhatsApp, the first of the three
    reachable("b", { lastChannel: "email" }), // wrote by email last: the channel they last wrote on comes first
    reachable("c", { phone: null }), // an address and no number: email
    reachable("d", { email: null, lastChannel: "sms" }), // wrote by text last, and said yes by text: text
    reachable("e", { phone: null, email: null }), // nowhere to send: held
  ];
  const f = fakes({ template: utility, people, channels: ready, versions: ["email", "sms"] });
  await make(f, { template_id: T1, audience: everyone, channels: ["whatsapp", "sms", "email"] });
  const [, row, recipients] = f.of("assemble")[0];
  assert.deepEqual(row.channels, ["whatsapp", "sms", "email"]);
  assert.equal(row.recipient_count, 4, "four reached, once each; the one with nowhere to send is not enrolled");
  assert.deepEqual(
    recipients.map((r) => [r.contact_id, r.channel]),
    [
      ["a", "whatsapp"],
      ["b", "email"],
      ["c", "email"],
      ["d", "sms"],
    ],
    "the channel a person last wrote on comes first; else WhatsApp, text, email; each person once",
  );
});

test("a broadcast is the business's own news, whatever its template's category: by email it enrols whoever has a relationship on record or a yes covering email, and not an address alone (decision D1)", async () => {
  // A utility template (the yes to messages is the one asked) with Email ticked: its WhatsApp twin is a utility, which was
  // all an email asked, so every address went. Now an address alone is held, as it is for an offer.
  const utility = template({ category: "utility" });
  const ready = workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true });
  /** An address and no number; the consent says what the person has done, and by default nothing at all. */
  const byEmail = (id, consent = {}) => {
    const r = reachable(id, { phone: null });
    return { ...r, consent: { ...r.consent, state: "unknown", channels: null, relationship: false, ...consent } };
  };
  const people = [
    byEmail("a"), // an address, nothing else: held
    byEmail("b", { relationship: true }), // wrote, called or has a deal: enrolled
    byEmail("c", { state: "opted_in", channels: ["whatsapp", "sms", "email"] }), // a yes covering email: enrolled
    byEmail("d", { state: "opted_in", channels: ["whatsapp", "sms"] }), // a yes that does not cover email: held
    byEmail("e", { state: "opted_in", channels: null }), // a yes from before the channels, WhatsApp alone: held
    byEmail("f", { relationship: true, emailMarketing: "opted_out" }), // they pressed Unsubscribe: held, whatever else
    byEmail("g", { state: "opted_out", relationship: true }), // STOP: held
  ];
  const f = fakes({ template: utility, people, channels: ready, versions: ["email"] });
  const r = await make(f, { template_id: T1, audience: everyone, channels: ["email"] });
  assert.deepEqual(
    f.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [
      ["b", "email"],
      ["c", "email"],
    ],
    "the two the business may send its news by email; the address alone is not enrolled",
  );
  assert.equal(r.recipient_count, 2);
  // Nobody qualifies: the broadcast is refused before a row, as one to an audience that has nobody to send to is.
  const strangers = fakes({
    template: utility,
    people: [byEmail("a"), byEmail("d", { state: "opted_in", channels: ["whatsapp", "sms"] })],
    channels: ready,
    versions: ["email"],
  });
  // Said as what an email of the business's news asks (consent-asks.ts, from the one predicate), never as "a number".
  await refused(
    make(strangers, { template_id: T1, audience: everyone, channels: ["email"] }),
    "conflict",
    409,
    "people with a yes to hearing from you by email or a relationship with you on record, and an email address that works",
  );
  assert.deepEqual(strangers.ops(), [], "nothing enrolled, nothing scheduled, nothing on the ledger");
  // By WhatsApp, people are asked what they always were: the yes to messages, kept for WhatsApp (an unknown state holds
  // them; a yes recorded before the channels were covers it, with no relationship asked of anyone).
  const withNumber = (id, consent) => ({ ...byEmail(id, consent), phone: "+15551230009" });
  const wa = fakes({
    template: utility,
    people: [withNumber("a", {}), withNumber("e", { state: "opted_in", channels: null })],
    channels: ready,
    versions: ["email"],
  });
  await make(wa, { template_id: T1, audience: everyone, channels: ["whatsapp"] });
  assert.deepEqual(
    wa.of("assemble")[0][2].map((x) => [x.contact_id, x.channel]),
    [["e", "whatsapp"]],
    "email's rule is email's alone: the same two, by WhatsApp, are held for the yes and sent on it",
  );
});

test("a broadcast that ticks nothing goes by WhatsApp alone, as every one went before; the ledger says the channels", async () => {
  const f = fakes({ channels: workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true }) });
  await make(f, { template_id: T1, audience: everyone });
  assert.deepEqual(f.of("assemble")[0][1].channels, ["whatsapp"]);
  assert.deepEqual(f.of("record")[0][4].channels, ["whatsapp"]);
  // An unknown channel, an empty list and a bare word are no ticks (a channel named twice is one tick).
  for (const channels of [["carrier pigeon"], ["whatsapp", "carrier pigeon"], [], "email"])
    await refused(
      make(fakes(), { template_id: T1, audience: everyone, channels }),
      "validation",
      400,
      "Pick WhatsApp, text or email to send by.",
    );
});

test("a tick the send cannot keep is refused at create, in the words the composer's greyed tick says: the purpose never carries it, the workspace is not ready on it, the message has no version there", async () => {
  const ready = workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true });
  const offer = (over = {}) => fakes({ channels: ready, versions: ["email", "sms"], ...over });
  const tick = (f, channels) => make(f, { template_id: T1, audience: everyone, channels });
  // Offers: texts carry none (a request that is wrong), and an email goes only once the workspace can send offers by
  // email (a state of the workspace, with the reason that is true).
  await refused(tick(offer(), ["sms"]), "validation", 400, "Texts carry no offers.");
  await refused(
    tick(offer(), ["whatsapp", "email"]),
    "conflict",
    409,
    "Offers by email start once the campaigns domain is set up.",
  );
  const withOffers = (offers) =>
    offer({ channels: workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true, offers }) });
  await refused(
    tick(withOffers({ ...OFFERS_OPEN, address: false }), ["email"]),
    "conflict",
    409,
    "Add your business's address to send offers by email.",
  );
  await refused(
    tick(withOffers({ ...OFFERS_OPEN, paused: { at: "2026-10-01T10:00:00Z", reason: "complaints" } }), ["email"]),
    "conflict",
    409,
    "Offers by email are paused while complaints and bounces settle.",
  );
  await tick(withOffers(OFFERS_OPEN), ["whatsapp", "email"]);
  // A message about a visit goes by email and text, when the workspace is ready on them and the message has a version.
  const utility = template({ category: "utility" });
  const visit = (over = {}) =>
    fakes({ template: utility, channels: ready, versions: ["email", "sms"], people: [reachable("a")], ...over });
  await tick(visit(), ["email"]);
  await refused(tick(visit({ channels: workspace() }), ["sms"]), "conflict", 409, "No texting line yet.");
  await refused(
    tick(visit({ channels: workspace({ textLine: { sms_state: "pending", reg_mock: false } }) }), ["sms"]),
    "conflict",
    409,
    "Your texting line is not approved by the carriers yet.",
  );
  await refused(
    tick(visit({ channels: workspace({ textLine: { sms_state: "active", reg_mock: true } }) }), ["sms"]),
    "conflict",
    409,
    "Your texting line is a test filing: it sends nothing.",
  );
  await refused(
    tick(visit({ channels: workspace({ mailbox: false, domain: true }) }), ["email"]),
    "conflict",
    409,
    "Set up email in Settings",
  );
  await refused(
    tick(visit({ channels: workspace({ mailbox: true, domain: false }) }), ["email"]),
    "conflict",
    409,
    "not switched on",
  );
  // Ready on the channel but no version of the message there: it cannot be said on it.
  await refused(
    tick(visit({ versions: ["sms"] }), ["email"]),
    "conflict",
    409,
    "This message has no email version yet.",
  );
  await refused(
    tick(visit({ versions: ["email"] }), ["sms"]),
    "conflict",
    409,
    "This message has no text version yet.",
  );
  // Refused before anyone is enrolled, a row or a decision.
  const f = visit({ versions: [] });
  await refused(tick(f, ["whatsapp", "email"]), "conflict", 409, "no email version");
  assert.deepEqual(f.ops(), []);
});

test("the WhatsApp number is asked about only when WhatsApp is ticked; the day's limit counts the people who go by it alone", async () => {
  const utility = template({ category: "utility" });
  const noNumber = workspace({ health: null, mailbox: true, domain: true });
  // No number at all, and an email send goes: it never asks.
  const email = fakes({ template: utility, channels: noNumber, versions: ["email"], people: [reachable("a")] });
  await make(email, { template_id: T1, audience: everyone, channels: ["email"] });
  assert.deepEqual(email.of("assemble")[0][2], [{ contact_id: "a", facts: null, channel: "email" }]);
  // Ticking WhatsApp with none refuses.
  await refused(
    make(fakes({ template: utility, channels: noNumber, versions: ["email"] }), {
      template_id: T1,
      audience: everyone,
      channels: ["whatsapp", "email"],
    }),
    "conflict",
    409,
    "Connect a WhatsApp number first",
  );
  // Past the number's tier, the people who go by WhatsApp are counted; a person by email is not Meta's limit.
  const tier = workspace({
    health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_50" }),
    mailbox: true,
    domain: true,
  });
  const crowd = (n, over) => Array.from({ length: n }, (_, i) => reachable(`${over?.lastChannel ?? "w"}${i}`, over));
  const mixed = fakes({
    template: utility,
    channels: tier,
    versions: ["email"],
    people: [...crowd(40), ...crowd(30, { lastChannel: "email" })],
  });
  const r = await make(mixed, { template_id: T1, audience: everyone, channels: ["whatsapp", "email"] });
  assert.equal(r.recipient_count, 70, "forty on WhatsApp, thirty by email: Meta's fifty a day is not past");
  const past = fakes({ template: utility, channels: tier, versions: ["email"], people: crowd(51) });
  await refused(
    make(past, { template_id: T1, audience: everyone, channels: ["whatsapp", "email"] }),
    "validation",
    400,
    "Send to a smaller list or split it.",
  );
});

test("when, and what it is called: not a time, past the window, a past time is now, a future time is kept; a name given is trimmed, none given is the template and the day", async () => {
  await refused(
    make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "nope" }),
    "validation",
    400,
    "That is not a time.",
  );
  // An instant names its offset: a bare date is midnight UTC (the evening
  // before, in New York) and a wall-clock time without one is the server's.
  await refused(
    make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "2026-09-20" }),
    "validation",
    400,
    "Give the time with its offset",
  );
  await refused(
    make(fakes(), { template_id: T1, audience: everyone, scheduled_for: "2026-09-20T15:00" }),
    "validation",
    400,
    "Give the time with its offset",
  );
  await refused(
    make(fakes(), {
      template_id: T1,
      audience: everyone,
      scheduled_for: new Date(NOW.getTime() + 31 * D).toISOString(),
    }),
    "validation",
    400,
    "Schedule within 30 days.",
  );
  // The ceiling is judged on the moment it really goes: asked for an hour
  // inside the thirty days but after twenty, it would move past them.
  const night = new Date("2026-09-07T03:00:00Z");
  await refused(
    createBroadcast(fakes().ports, {
      userId: "u1",
      body: { template_id: T1, audience: everyone, scheduled_for: "2026-10-07T02:00:00Z" },
      now: night,
    }),
    "validation",
    400,
    "Schedule within 30 days.",
  );
  const past = fakes();
  const r1 = await make(past, {
    template_id: T1,
    audience: everyone,
    scheduled_for: new Date(NOW.getTime() - D).toISOString(),
  });
  assert.equal(r1.scheduled_for, NOW.toISOString(), "a past time is now");
  assert.equal(r1.name, broadcastName("month_offer", ZONE, NOW, null), "the template and the day");
  const later = new Date(NOW.getTime() + 2 * D);
  const future = fakes();
  const r2 = await make(future, {
    template_id: T1,
    audience: everyone,
    scheduled_for: later.toISOString(),
    name: "  Spring offer  ",
  });
  assert.equal(r2.scheduled_for, later.toISOString());
  assert.deepEqual(future.of("assemble")[0][3], later, "the job is due when the run is");
  assert.equal(future.of("assemble")[0][1].scheduled_for, later.toISOString());
  assert.equal(r2.name, "Spring offer");
});

test("the rows, then the job, then the ledger: the row as the person composed it, the people with no words to keep, the send at its time, the decision, the receipt", async () => {
  const f = fakes({ template: template({ variables: ["1", "2"], title: "Monthly offer" }) });
  const r = await make(f, { template_id: T1, params: ["@first_name", "  20% off  "], audience: everyone });
  const specs = [{ kind: "first_name" }, { kind: "text", value: "20% off" }];
  const name = broadcastName("month_offer", ZONE, NOW, "Monthly offer");
  assert.deepEqual(f.ops(), ["assemble", "record"], "the run, its people and its job whole; then the ledger");
  assert.deepEqual(f.of("assemble")[0][1], {
    name,
    template_id: T1,
    template_name: "month_offer",
    template_language: "en_US",
    params: specs,
    audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
    state: "scheduled",
    scheduled_for: NOW.toISOString(),
    recipient_count: 2,
    created_by: "u1",
    // Step 3: the run says the channels it may go by (WhatsApp alone when it names none), each person the one they are on.
    channels: ["whatsapp"],
  });
  assert.deepEqual(f.of("assemble")[0][2], [
    { contact_id: "a", facts: null, channel: "whatsapp" },
    { contact_id: "b", facts: null, channel: "whatsapp" },
  ]);
  assert.deepEqual(f.of("assemble")[0][3], NOW);
  assert.deepEqual(f.of("record")[0], [
    "record",
    "broadcast",
    "b1",
    "send_broadcast",
    {
      name,
      template: "month_offer/en_US",
      category: "marketing",
      audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
      channels: ["whatsapp"],
      values: specs.map(paramLabel),
      recipients: 2,
      scheduled_for: NOW.toISOString(),
    },
  ]);
  assert.deepEqual(r, {
    id: "b1",
    name,
    state: "scheduled",
    recipient_count: 2,
    scheduled_for: NOW.toISOString(),
    moved_from: null,
    held_for_allowance: 0,
    decision_id: "d1",
  });
});

test("what could not be written says so: the run, its people and its job are one write, so a refusal leaves nothing behind to fail and nothing on the ledger", async () => {
  // They were three writes with a compensating fail between them (a run with no people, people with no job); the
  // transaction itself is proved against Postgres (broadcasts/assemble-broadcast.db.test.mjs).
  for (const why of ["insert refused", "3 of the 40 people are not this workspace's to send to"]) {
    const f = fakes({ assemble: new Error(why) });
    const { e, wire, said } = await refusedLoudly(make(f, { template_id: T1, audience: everyone }));
    assert.equal(e.code, "internal");
    assert.equal(e.status, 500);
    assert.equal(e.message, "The broadcast could not be created. Nothing was sent; try again.");
    assert.deepEqual(f.ops(), ["assemble"], "nothing to fail, nothing recorded");
    // The database's words are the log's: the answer the route sends carries none of them.
    assert.equal(e.details, undefined, "no details to send");
    assert.ok(!wire.includes(why), `the response says ${wire}`);
    assert.deepEqual(
      said.map((l) => [l.event, l.step, l.error]),
      [["campaign_step_failed", "assemble", why]],
      "and the cause is said, by name, where support reads it",
    );
  }
});

test("approve: a playbook's run is a day's run: approved on a later day it is refused before anything moves, and the one for today goes", async () => {
  const tz = await fakes().ports.timezone();
  const today = tzDate(tz, NOW);
  const stale = {
    id: "b1",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Visit reminder · yesterday",
    recipient_count: 3,
    playbook_id: "p1",
    run_for: "2026-09-05",
  };
  const f = fakes();
  await refused(
    approveRun(f.ports, { row: stale, now: NOW }),
    "conflict",
    409,
    "This run was made for 2026-09-05 and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.",
  );
  assert.deepEqual(f.ops(), [], "nothing moved");
  const fresh = fakes();
  const r = await approveRun(fresh.ports, { row: { ...stale, run_for: today }, now: NOW });
  assert.equal(r.state, "scheduled");
  const hand = fakes();
  assert.equal(
    (await approveRun(hand.ports, { row: { ...stale, playbook_id: null, run_for: null }, now: NOW })).state,
    "scheduled",
    "a broadcast made by hand has no day",
  );
});

test("approve: a run not waiting is refused; one that changed under the approver says so; a job the ledger refused leaves it waiting; else the send now and the approver's decision", async () => {
  const row = {
    id: "b1",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Win-back · 2026-09-06",
    recipient_count: 3,
    playbook_id: "p1",
  };
  await refused(
    approveRun(fakes().ports, { row: { ...row, state: "sending" }, now: NOW }),
    "conflict",
    409,
    "This run is not waiting for approval.",
  );
  const moved = fakes({ release: false });
  await refused(
    approveRun(moved.ports, { row, now: NOW }),
    "conflict",
    409,
    "This run just changed state; look again.",
  );
  assert.deepEqual(moved.ops(), ["release"]);
  const noJob = fakes({ schedule: new Error("schedule_job: no row") });
  const stuck = await refusedLoudly(approveRun(noJob.ports, { row, now: NOW }));
  assert.equal(stuck.e.code, "upstream_meta");
  assert.equal(stuck.e.status, 502);
  assert.equal(stuck.e.message, "The send could not be scheduled. The run is still waiting; try again.");
  assert.deepEqual(noJob.ops(), ["release", "schedule", "hold"]);
  // What the job ledger said is the log's, never the response's.
  assert.equal(stuck.e.details, undefined);
  assert.ok(!stuck.wire.includes("schedule_job"), `the response says ${stuck.wire}`);
  assert.deepEqual(
    stuck.said.map((l) => [l.event, l.step, l.broadcast_id, l.error]),
    [["campaign_step_failed", "schedule", "b1", "Error: schedule_job: no row"]],
  );
  const f = fakes();
  const r = await approveRun(f.ports, { row, now: NOW });
  assert.deepEqual(f.log, [
    ["release", "b1", NOW],
    ["schedule", "b1", NOW],
    [
      "record",
      "broadcast",
      "b1",
      "send_broadcast",
      { name: row.name, playbook_id: "p1", recipients: 3, approved: true, scheduled_for: NOW.toISOString() },
    ],
  ]);
  assert.deepEqual(r, {
    id: "b1",
    state: "scheduled",
    recipient_count: 3,
    scheduled_for: NOW.toISOString(),
    moved_from: null,
    decision_id: "d1",
  });
});

test("never at 3 AM: a send asked for outside nine to twenty by the business's clock moves to the next nine, and the receipt says so", async () => {
  // 03:00 UTC is 23:00 the evening before in New York: outside the window, so
  // "now" itself moves to 09:00 New York (13:00 UTC) the same calendar day.
  const night = new Date("2026-09-07T03:00:00Z");
  const nine = new Date("2026-09-07T13:00:00Z");
  const f = fakes();
  const r = await createBroadcast(f.ports, { userId: "u1", body: { template_id: T1, audience: everyone }, now: night });
  assert.equal(r.scheduled_for, nine.toISOString(), "nine in the morning, by the business's clock");
  assert.equal(r.moved_from, night.toISOString(), "and it says what was asked for");
  assert.deepEqual(f.of("assemble")[0][3], nine);
  assert.equal(f.of("assemble")[0][1].scheduled_for, nine.toISOString(), "the row says when it really goes");
  assert.equal(f.of("record")[0][4].moved_from, night.toISOString(), "the ledger keeps the move");
  // Asked for 05:30 New York (09:30 UTC): the same morning's nine.
  const early = new Date("2026-09-07T09:30:00Z");
  const r2 = await createBroadcast(fakes().ports, {
    userId: "u1",
    body: { template_id: T1, audience: everyone, scheduled_for: early.toISOString() },
    now: NOW.getTime() < early.getTime() ? NOW : new Date(early.getTime() - 3_600_000),
  });
  assert.equal(r2.scheduled_for, nine.toISOString());
  assert.equal(r2.moved_from, early.toISOString());
  // Asked for 21:30 New York (01:30 UTC next day): nine the next morning.
  const late = new Date("2026-09-08T01:30:00Z");
  const r3 = await createBroadcast(fakes().ports, {
    userId: "u1",
    body: { template_id: T1, audience: everyone, scheduled_for: late.toISOString() },
    now: NOW,
  });
  assert.equal(r3.scheduled_for, new Date("2026-09-08T13:00:00Z").toISOString());
  // Inside the window nothing moves, and the receipt says so too.
  const r4 = await createBroadcast(fakes().ports, {
    userId: "u1",
    body: { template_id: T1, audience: everyone },
    now: NOW,
  });
  assert.equal(r4.scheduled_for, NOW.toISOString());
  assert.equal(r4.moved_from, null);
  assert.ok(!("moved_from" in fakes().of("record")), "nothing recorded about a move that did not happen");
  // An approval at night goes at nine as well.
  const a = fakes();
  const ap = await approveRun(a.ports, {
    row: {
      id: "b1",
      tenant_id: "t1",
      state: "pending_approval",
      name: "Win-back",
      recipient_count: 3,
      playbook_id: "p1",
    },
    now: night,
  });
  assert.deepEqual(a.of("schedule")[0], ["schedule", "b1", nine]);
  assert.equal(ap.scheduled_for, nine.toISOString());
  assert.equal(ap.moved_from, night.toISOString());
  assert.equal(a.of("record")[0][4].moved_from, night.toISOString());
});

test("cancel: scheduled withdraws the job; sending stops at the next batch; waiting is skipped; anything ended says how; a row that changed under them says so; each on the ledger", async () => {
  const row = (state) => ({ id: "b1", tenant_id: "t1", state, name: "Reminder" });
  const scheduled = fakes();
  const r = await cancelBroadcast(scheduled.ports, { row: row("scheduled") });
  assert.deepEqual(
    scheduled.log,
    [
      ["cancel", "b1", "scheduled"],
      ["withdraw", "b1"],
      ["record", "broadcast", "b1", "cancel_broadcast", { name: "Reminder", was: "scheduled" }],
    ],
    "the row first: a job withdrawn before a row that did not change would leave a run that never goes",
  );
  assert.deepEqual(r, { id: "b1", state: "canceled", was: "scheduled", decision_id: "d1" });
  for (const state of ["sending", "pending_approval"]) {
    const f = fakes();
    assert.equal((await cancelBroadcast(f.ports, { row: row(state) })).was, state);
    assert.deepEqual(f.ops(), ["cancel", "record"], `${state}: no job to withdraw`);
  }
  for (const [state, said] of [
    ["sent", "already been sent"],
    ["canceled", "already been canceled"],
    ["failed", "already failed"],
  ]) {
    const f = fakes();
    await refused(cancelBroadcast(f.ports, { row: row(state) }), "conflict", 409, `This broadcast has ${said}.`);
    assert.deepEqual(f.ops(), []);
  }
  await refused(
    cancelBroadcast(fakes({ cancel: false }).ports, { row: row("sending") }),
    "conflict",
    409,
    "This broadcast just changed state; look again.",
  );
});

test("the playbook's check refuses a tick its purpose never carries, accepts one the workspace is not ready on (a run holds those people), and keeps the channels an edit does not name", async () => {
  const visit = { trigger: "visit_tomorrow", template_id: T1, params: [] };
  const reminder = () => fakes({ template: template({ category: "utility" }) }).ports;
  // A reminder goes by email and text, ready or not: the check has no readiness, a run holds whom it cannot reach.
  const both = await checkPlaybook(reminder(), { ...visit, channels: ["email", "whatsapp", "sms"] });
  assert.deepEqual(both.channels, ["whatsapp", "sms", "email"], "in the product's order, whatever order they came in");
  // An offer never goes by text; by email it is kept ticked whether or not the workspace can send it yet (a run holds those
  // people until it can: the composer's greyed tick says why).
  const offer = { trigger: "everyone_monthly", template_id: T1, params: [] };
  await refused(
    checkPlaybook(fakes().ports, { ...offer, channels: ["sms"] }),
    "validation",
    400,
    "Texts carry no offers.",
  );
  const byEmail = await checkPlaybook(fakes().ports, { ...offer, channels: ["whatsapp", "email"] });
  assert.deepEqual(byEmail.channels, ["whatsapp", "email"]);
  await refused(
    checkPlaybook(reminder(), { ...visit, channels: ["fax"] }),
    "validation",
    400,
    "Pick WhatsApp, text or email to send by.",
  );
  // An edit that names none keeps the ones the playbook has; one made before has none and goes by WhatsApp.
  const kept = await checkPlaybook(reminder(), visit, { trigger: "visit_tomorrow", channels: ["email"] });
  assert.deepEqual(kept.channels, ["email"]);
  const before = await checkPlaybook(reminder(), visit, { trigger: "visit_tomorrow", channels: null });
  assert.deepEqual(before.channels, ["whatsapp"]);
  // A playbook kept on a channel is held to what its message may be as it is changed: an offer is refused on text.
  await refused(
    checkPlaybook(fakes().ports, offer, { trigger: "everyone_monthly", channels: ["sms"] }),
    "validation",
    400,
    "Texts carry no offers.",
  );
});

test("the playbook's check: the trigger first, then the template through the one judgement, the name when none was given, the whole numbers", async () => {
  await refused(
    checkPlaybook(fakes().ports, {}),
    "validation",
    400,
    // 2 Oct 2026: the moments a new playbook may start from; welcome and save our number are no longer among them, and
    // lapsed is the win-back by visits.
    "Pick what starts it: win-back, the month's offer, a visit tomorrow, a visit yesterday, one of your lists, or a proposal waiting.",
  );
  // A reach-out's steps are made on its own sheet (Part 4): the moments' check refuses them in words, before the
  // database's shape CHECK would in none.
  for (const trigger of ["lead_first", "after_step"])
    await refused(
      checkPlaybook(fakes().ports, { trigger, template_id: T1 }),
      "validation",
      400,
      REACH_OUT_IS_NOT_A_MOMENT,
    );
  await refused(
    checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: "nope" }),
    "validation",
    400,
    "Pick a template.",
  );
  await refused(
    checkPlaybook(fakes({ template: template({ meta_status: "rejected" }) }).ports, {
      trigger: "quiet_30",
      template_id: T1,
    }),
    "conflict",
    409,
    "not approved by WhatsApp",
  );
  await refused(
    checkPlaybook(fakes({ template: template({ variables: ["1"] }), bookingLink: null }).ports, {
      trigger: "quiet_30",
      template_id: T1,
      params: ["@booking_link"],
    }),
    "conflict",
    409,
    "This message takes the booking link, and none is on file.",
  );
  // REGRESSION (C6): only a visit playbook has a visit to name; a win-back's visit slot reached nobody.
  await refused(
    checkPlaybook(fakes({ template: template({ variables: ["1"] }) }).ports, {
      trigger: "quiet_30",
      template_id: T1,
      params: ["@visit_service"],
    }),
    "validation",
    400,
    "Only a visit reminder or an after-the-visit playbook can fill in a visit's time or service.",
  );
  for (const trigger of ["visit_tomorrow", "visited"]) {
    // 2 Oct 2026: both visit moments run under Bookings, so their message is about the visit (utility), not an offer.
    const visit = await checkPlaybook(
      fakes({ template: template({ variables: ["1", "2"], category: "utility" }) }).ports,
      { trigger, template_id: T1, params: ["@visit_when", "@visit_service"] },
      null,
    );
    assert.deepEqual(
      visit.params,
      [{ kind: "visit_when" }, { kind: "visit_service" }],
      `${trigger} fills a visit's words`,
    );
  }
  // 0006: a proposal follow-up is made only where deals are on, and only it fills in a proposal's link.
  const threeSlots = template({ name: "proposal_follow_up", category: "utility", variables: ["1", "2", "3"] });
  const followUp = {
    trigger: "proposal_waiting",
    template_id: T1,
    params: ["@first_name", "@business_name", "@proposal_link"],
  };
  await refused(
    checkPlaybook(fakes({ template: threeSlots }).ports, followUp),
    "validation",
    400,
    FOLLOW_UP_NEEDS_DEALS,
  );
  const made = await checkPlaybook(fakes({ template: threeSlots, dealsOn: true }).ports, followUp);
  assert.deepEqual(
    [made.name, made.policy_class, made.params],
    ["Proposal follow-up", "follow_up", [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }]],
    "its own starter: the moment's name, its own class, and the link each person's proposal carries",
  );
  // A follow-up with no slot filled by the link would be a bare "just checking in": refused. (A utility message, since
  // 2 Oct 2026 the follow-up's class and its message's category must agree: an offer is refused before the link.)
  await refused(
    checkPlaybook(fakes({ template: template({ variables: ["1"], category: "utility" }), dealsOn: true }).ports, {
      trigger: "proposal_waiting",
      template_id: T1,
      params: ["@first_name"],
    }),
    "validation",
    400,
    FOLLOW_UP_NEEDS_LINK,
  );
  // A win-back never asks whether deals are on (the port throws if it is asked), and cannot carry a proposal's link.
  await refused(
    checkPlaybook(fakes({ template: template({ variables: ["1"] }), dealsOn: new Error("asked") }).ports, {
      trigger: "quiet_30",
      template_id: T1,
      params: ["@proposal_link"],
    }),
    "validation",
    400,
    "Only the proposal follow-up can fill in a proposal's link.",
  );
  const starter = starterForTrigger("quiet_30").name;
  const own = await checkPlaybook(fakes({ template: template({ name: starter }) }).ports, {
    trigger: "quiet_30",
    template_id: T1,
    params: [],
  });
  assert.deepEqual(
    own,
    {
      name: "Win-back",
      trigger: "quiet_30",
      list_id: null,
      list_key: null,
      template_id: T1,
      template_name: starter,
      template_language: "en_US",
      params: [],
      policy_class: "reengage",
      run_hour: 10,
      cap_per_run: 25,
      gap_days: 90,
      cadence_days: 30,
      // Step 3: WhatsApp alone when none is named, as every playbook went before.
      channels: ["whatsapp"],
    },
    "its own starter: the trigger's name alone, and the defaults",
  );
  const given = await checkPlaybook(fakes({ template: template({ title: "Monthly offer" }) }).ports, {
    trigger: "everyone_monthly",
    template_id: T1,
    params: [],
    name: "  The   month's  offer ",
  });
  assert.equal(given.name, "The month's offer", "given, its spaces made one");
  assert.equal(given.policy_class, "campaign");
  const titled = await checkPlaybook(fakes({ template: template({ title: "Monthly offer" }) }).ports, {
    trigger: "everyone_monthly",
    template_id: T1,
    params: [],
  });
  assert.equal(
    titled.name,
    `The month's offer · ${templateTitle("month_offer", "Monthly offer")}`,
    "another template: the trigger and the template's title",
  );
  await refused(
    checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: T1, params: [], run_hour: 7 }),
    "validation",
    400,
    "The hour must be a whole number from 9 to 20.",
  );
  await refused(
    checkPlaybook(fakes().ports, { trigger: "quiet_30", template_id: T1, params: [], cap_per_run: 2.5 }),
    "validation",
    400,
    "The cap must be a whole number from 1 to 500.",
  );
  const nums = await checkPlaybook(fakes().ports, {
    trigger: "quiet_30",
    template_id: T1,
    params: [],
    run_hour: "18",
    cap_per_run: 5,
    gap_days: 30,
    cadence_days: 7,
  });
  assert.deepEqual([nums.run_hour, nums.cap_per_run, nums.gap_days, nums.cadence_days], [18, 5, 30, 7]);
});

test("the moments a new playbook may start from (2 Oct 2026): a retired one is refused in its own words but one already there is kept; the win-back is the one the workspace can read", async () => {
  const body = (trigger) => ({ trigger, template_id: T1, params: [] });
  for (const trigger of ["new_week", "phoned_only"]) {
    await refused(checkPlaybook(fakes().ports, body(trigger), null), "validation", 400, MOMENTS_RETIRED[trigger]);
    // A playbook made there keeps running (the run asks triggerOffered, never this), and is changed and kept.
    const kept = await checkPlaybook(fakes().ports, { ...body(trigger), name: "Renamed" }, { trigger });
    assert.deepEqual([kept.trigger, kept.name], [trigger, "Renamed"], `${trigger}: changed where it already is`);
  }
  await refused(
    checkPlaybook(fakes().ports, body("new_week"), { trigger: "quiet_30" }),
    "validation",
    400,
    MOMENTS_RETIRED.new_week,
  );
  const silence = fakes({ calendarOn: false });
  assert.equal((await checkPlaybook(silence.ports, body("quiet_30"), null)).trigger, "quiet_30");
  await refused(checkPlaybook(silence.ports, body("lapsed"), null), "validation", 400, WIN_BACK_WORDS.lapsed);
  const visits = fakes({ calendarOn: true });
  assert.equal((await checkPlaybook(visits.ports, body("lapsed"), null)).trigger, "lapsed");
  await refused(checkPlaybook(visits.ports, body("quiet_30"), null), "validation", 400, WIN_BACK_WORDS.quiet_30);
  // The other win-back, already running, is changed and kept: a calendar connected later does not strand it.
  assert.equal((await checkPlaybook(visits.ports, body("quiet_30"), { trigger: "quiet_30" })).trigger, "quiet_30");
  // Each fact is asked only of the moment it decides: a calendar that cannot be read costs a month's offer nothing.
  const blind = fakes({ calendarOn: new Error("asked"), dealsOn: new Error("asked") });
  assert.equal((await checkPlaybook(blind.ports, body("everyone_monthly"), null)).trigger, "everyone_monthly");
  // A proposal follow-up where deals are off is refused when changed too, as it always was.
  const threeSlots = template({ name: "proposal_follow_up", category: "utility", variables: ["1", "2", "3"] });
  await refused(
    checkPlaybook(
      fakes({ template: threeSlots }).ports,
      { trigger: "proposal_waiting", template_id: T1, params: ["@first_name", "@business_name", "@proposal_link"] },
      { trigger: "proposal_waiting" },
    ),
    "validation",
    400,
    FOLLOW_UP_NEEDS_DEALS,
  );
});

test("a moment and its message agree on the yes they need (decision 7): a playbook made or changed whose two disagree is refused, in the words for which way", async () => {
  const offer = template({ category: "marketing" });
  const visit = template({ category: "utility" });
  const unfiled = template({ category: null });
  // A message that is an offer on a moment that reaches anyone who said yes to texts.
  for (const trigger of ["visit_tomorrow", "visited"])
    await refused(
      checkPlaybook(fakes({ template: offer }).ports, { trigger, template_id: T1, params: [] }, null),
      "validation",
      400,
      MESSAGE_MOMENT_WORDS.offer_on_texts,
    );
  // One no channel ever filed is an offer, as the send reads it (purposeOfTemplate).
  await refused(
    checkPlaybook(fakes({ template: unfiled }).ports, { trigger: "visited", template_id: T1, params: [] }, null),
    "validation",
    400,
    MESSAGE_MOMENT_WORDS.offer_on_texts,
  );
  // A message about their own visit on a moment that sends offers, which only a yes to offers may reach.
  for (const body of [
    { trigger: "quiet_30" },
    { trigger: "everyone_monthly" },
    { trigger: "saved_list", list_key: "lapsed", policy_class: "reengage" },
  ])
    await refused(
      checkPlaybook(fakes({ template: visit }).ports, { ...body, template_id: T1, params: [] }, null),
      "validation",
      400,
      MESSAGE_MOMENT_WORDS.texts_on_offers,
    );
  // The proposal follow-up is about their own proposal: an offer is refused there too.
  await refused(
    checkPlaybook(
      fakes({ template: template({ category: "marketing", variables: ["1"] }), dealsOn: true }).ports,
      { trigger: "proposal_waiting", template_id: T1, params: ["@proposal_link"] },
      null,
    ),
    "validation",
    400,
    MESSAGE_MOMENT_WORDS.offer_on_texts,
  );
  // Changed, the same: an After-the-visit playbook made when it was a re-engagement, still sending the marketing
  // thank-you, is refused when it is saved, and saved once it sends a message about the visit.
  const after = { trigger: "visited", template_id: T1, params: [] };
  await refused(
    checkPlaybook(fakes({ template: offer }).ports, after, { trigger: "visited" }),
    "validation",
    400,
    MESSAGE_MOMENT_WORDS.offer_on_texts,
  );
  const saved = await checkPlaybook(fakes({ template: visit }).ports, after, { trigger: "visited" });
  assert.deepEqual([saved.trigger, saved.policy_class], ["visited", "booking"], "now under Bookings, as it is classed");
  // And where they agree, nothing is said: an offer on an offer's moment, a visit's message on a visit's.
  assert.equal(
    (await checkPlaybook(fakes({ template: offer }).ports, { trigger: "quiet_30", template_id: T1, params: [] }, null))
      .policy_class,
    "reengage",
  );
  assert.equal(
    (
      await checkPlaybook(
        fakes({ template: visit }).ports,
        { trigger: "visit_tomorrow", template_id: T1, params: [] },
        null,
      )
    ).policy_class,
    "booking",
  );
});

test("approve: a reach-out's run is released now with no broadcast job, on its own day or a later one, its sends keeping their times", async () => {
  const run = {
    id: "b9",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Movers in Austin",
    recipient_count: 12,
    playbook_id: "p1",
    run_for: "2026-09-01",
    audience: { kind: "reach_out", root_id: "p1", step_id: "p1", search_id: "s1" },
  };
  const f = fakes();
  const r = await approveRun(f.ports, { row: run, now: NOW });
  assert.deepEqual(
    [r.state, r.scheduled_for, r.moved_from, r.decision_id],
    ["scheduled", NOW.toISOString(), null, "d1"],
  );
  assert.deepEqual(f.ops(), ["release", "record"], "no broadcast job: it would find nobody and end the run as sent");
  assert.equal(f.of("release")[0][2].toISOString(), NOW.toISOString(), "from the moment it is approved");
  assert.equal(f.of("record")[0][4].reach_out, true);
  await refused(
    approveRun(fakes({ release: false }).ports, { row: run, now: NOW }),
    "conflict",
    409,
    "This run just changed state",
  );
});

test("approve: a reach-out's run keeps when its first email goes, and says now only once that time has passed", async () => {
  const run = (scheduled_for) => ({
    id: "b9",
    tenant_id: "t1",
    state: "pending_approval",
    name: "Movers in Austin · 2026-09-06",
    recipient_count: 4,
    playbook_id: "p1",
    run_for: "2026-09-06",
    scheduled_for,
    audience: { kind: "reach_out", root_id: "p1", step_id: "p1", search_id: "s1" },
  });
  const ahead = new Date(NOW.getTime() + 2 * 86_400_000).toISOString();
  const f = fakes();
  const r = await approveRun(f.ports, { row: run(ahead), now: NOW });
  assert.equal(r.scheduled_for, ahead, "Monday's first email, not now");
  assert.equal(f.of("release")[0][2].toISOString(), ahead);
  const past = fakes();
  const stale = new Date(NOW.getTime() - 3_600_000).toISOString();
  assert.equal((await approveRun(past.ports, { row: run(stale), now: NOW })).scheduled_for, NOW.toISOString());
});

/* ---- The month's allowance, at enrolment ---- */

/** Four people on a visit message who go by email (an address, no number) and three by text (a number, no address). */
const byEmailAndText = () => [
  ...["e1", "e2", "e3", "e4"].map((id) => reachable(id, { phone: null })),
  ...["t1", "t2", "t3"].map((id) => reachable(id, { email: null, lastChannel: "sms" })),
];
const MONTH = {
  template: template({ category: "utility" }),
  channels: workspace({ textLine: ACTIVE_LINE, mailbox: true, domain: true }),
  versions: ["email", "sms"],
};
const ALL_THREE = { template_id: T1, audience: everyone, channels: ["sms", "email"] };

test("the month is counted before anyone is enrolled, and whoever is past its room is enrolled held: the report says so up front", async () => {
  const asked = [];
  const f = fakes({
    ...MONTH,
    people: byEmailAndText(),
    monthSent: (channel) => (asked.push(channel), channel === "email" ? 1998 : 499),
  });
  const r = await make(f, ALL_THREE);
  assert.deepEqual(asked, ["email", "sms"], "each metered channel somebody goes by, once, before the run is written");
  assert.deepEqual(f.ops(), ["assemble", "holdRecipients", "record"], "the run whole, then its held, then the ledger");
  assert.equal(f.of("assemble")[0][1].recipient_count, 7, "everyone is enrolled, the held among them");
  // Room for two emails and one text: the last two on email and the last two on text are past it, in their order.
  assert.deepEqual(f.of("holdRecipients")[0], ["holdRecipients", "b1", ["e3", "e4", "t2", "t3"], "month_allowance"]);
  assert.equal(r.held_for_allowance, 4);
  assert.equal(f.of("record")[0][4].held_for_allowance, 4, "the ledger says how many were held");
});

test("a run with room for everyone holds nobody, and a WhatsApp run never counts the month", async () => {
  const roomy = fakes({ ...MONTH, people: byEmailAndText(), monthSent: 0 });
  const r = await make(roomy, ALL_THREE);
  assert.deepEqual(roomy.ops(), ["assemble", "record"], "nothing to hold: no write");
  assert.equal(r.held_for_allowance, 0);
  assert.equal(
    "held_for_allowance" in roomy.of("record")[0][4],
    false,
    "the ledger names it only when it held somebody",
  );
  // WhatsApp is Meta's tier, not this: nobody on it asks for the count, so a count that cannot be read costs it nothing.
  const wa = fakes({ monthSent: new Error("the database is down") });
  await make(wa, { template_id: T1, audience: everyone });
  assert.deepEqual(wa.ops(), ["assemble", "record"]);
});

test("a month that could not be counted is not room: the broadcast is refused in words, and nothing is written", async () => {
  const f = fakes({ ...MONTH, people: byEmailAndText(), monthSent: new Error("rpc: connection reset") });
  const { e, wire, said } = await refusedLoudly(make(f, ALL_THREE));
  assert.equal(e.code, "internal");
  assert.equal(e.status, 500);
  assert.ok(e.message.includes("could not be counted just now"), e.message);
  assert.deepEqual(f.ops(), [], "no run, no people, no job");
  // The database's own words are never the person's to read: the response carries none, and the log carries the cause.
  assert.equal(e.details, undefined);
  assert.ok(!wire.includes("connection reset"), `the response says ${wire}`);
  assert.deepEqual(
    said.map((l) => [l.event, l.step, l.error]),
    [["campaign_step_failed", "month_count", "Error: rpc: connection reset"]],
  );
});

test("a hold that could not be written leaves the people queued, and the run is made all the same: the send holds them at the wire, and neither the receipt nor the ledger claims a hold that was not written", async () => {
  const said = [];
  const error = console.error;
  console.error = (...args) => said.push(JSON.parse(args[0]));
  const f = fakes({ ...MONTH, people: byEmailAndText(), monthSent: 2000, holdRecipients: new Error("write failed") });
  let r;
  try {
    r = await make(f, { template_id: T1, audience: everyone, channels: ["email"] });
  } finally {
    console.error = error;
  }
  assert.deepEqual(f.ops(), ["assemble", "holdRecipients", "record"], "the run stands, and so does the ledger");
  assert.equal(r.id, "b1");
  assert.equal(r.held_for_allowance, 0, "none was held at enrolment: the receipt says what was actually held");
  // The ledger records it as a playbook's run does: how many the month holds, and how many of those the write left queued.
  const decision = f.of("record")[0][4];
  assert.equal(decision.held_for_allowance, 4, "the month holds four");
  assert.equal(
    decision.hold_unwritten,
    4,
    "and the write that holds them failed, so they are held at the wire instead",
  );
  // And it is said, by name, with the error: never an empty catch.
  assert.deepEqual(
    said.map((l) => [l.event, l.broadcast_id, l.unheld, l.error]),
    [["campaign_hold_unwritten", "b1", 4, "Error: write failed"]],
  );
  // A hold that was written says nothing and claims what it did.
  const ok = fakes({ ...MONTH, people: byEmailAndText(), monthSent: 2000 });
  const kept = await make(ok, { template_id: T1, audience: everyone, channels: ["email"] });
  assert.equal(kept.held_for_allowance, 4);
  assert.ok(!("hold_unwritten" in ok.of("record")[0][4]), "nothing unwritten, nothing said of it");
});
