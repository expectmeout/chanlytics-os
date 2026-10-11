/**
 * A plan, with no model (the marketing manager's spec §5.4, D3): contracts planOf turns an intent ("10% off every
 * service all November", or "cover my journey") and a snapshot of the workspace (PlanWorld) into steps, as data, and no
 * I/O. Each rule of §5.4's table is a row here, EXECUTED, deep-equal on the steps (their kinds, whether each is silent,
 * the steps it waits on, and its whole input) and on the plan's words: a message reused by its category, language and
 * slots, or written from the month's offer starter with a version on each channel the workspace sends offers on (never
 * a text); a list reused by its rule, never its name, or made; the receptionist's note; the sends at ten on the
 * business's clock; the month's offer paused, or its words changed where its message is the one reused; the first send
 * paced as a capped campaign where the calendar has less room than the audience; and a campaign on each moment of the
 * journey not covered yet. The dates are the business's: a start already past is refused by the same judge that refuses
 * a campaign's past end (contracts localDate), and ten o'clock is wallClockAt's.
 *
 * Every step's input is the input of the Ask action it is expanded through (Task 17): each is parsed, strictly, by that
 * action's own schema (the dashboard's act handlers, read as modules), a written message passes the door's own checks of
 * its words (POST templates/message's checkMessage), and a note's change is one AskSettingsChangeSchema reads. The
 * playbook step's `until` is the one key its action does not take yet: Task 17 teaches it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
// Read as a module, so a name contracts does not export yet is a failing assertion, not a file that will not load.
const C = await import("@chanlytics/contracts");
const { PLAN_WORDS: W, planOf, resolveSteps, stepToken, STEP_TOKEN } = C;

const TZ = "America/New_York";
/** Sunday 11 Oct 2026, 10:00 AM in New York. */
const NOW = new Date("2026-10-11T14:00:00Z");
const OFFERS = "seg:offers_ok";
const V = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
const PB = "88888888-8888-4888-8888-888888888888";
const OWN = "99999999-9999-4999-8999-999999999999";
const WORDS = "10% off every service all November";
/** What fills the offer's slot: the owner's words, as a sentence. */
const LINE = "10% off every service all November.";
/** Ten o'clock on 1 and 20 Nov 2026 in New York: standard time from 1 Nov, five hours behind UTC. */
const FIRST_AT = "2026-11-01T15:00:00.000Z";
const SECOND_AT = "2026-11-20T15:00:00.000Z";

const SAID_YES = { field: "said_yes", op: "is", to: "offers", yes: true };
const NOT_BOOKED = { field: "booked", op: "is", yes: false };
const NO_VISIT_SINCE = {
  any: [
    { field: "last_visit", op: "more_than", days: 19 },
    { field: "last_visit", op: "never" },
  ],
};

/** The built-in offers list as People's lists read it: its rule, and who is on it. */
const offersList = (count = 40) => ({
  token: OFFERS,
  name: "Can receive offers",
  rule: { v: 2, all: [{ field: "can_receive", op: "is", to: "offers", yes: true }] },
  count,
});

/** The month's offer starter as campaigns with action messages reads it: both versions approved, the offer its third value. */
const monthsOfferMessage = (over = {}) => ({
  name: "this_months_offer",
  language: "en_US",
  category: "marketing",
  versions: [
    { channel: "whatsapp", id: V(1), state: "approved" },
    { channel: "email", id: V(2), state: "approved" },
  ],
  slots: [
    { position: 1, label: "First name", kind: "first_name" },
    { position: 2, label: "Business name", kind: "business_name" },
    { position: 3, label: "The offer", kind: "text" },
    { position: 4, label: "Booking link", kind: "booking_link" },
  ],
  used_by: [],
  ...over,
});

/** The journey of a workspace with a calendar and no deals: first contact the receptionist's, nothing else covered. */
const JOURNEY = [
  { id: "first_contact", covered: true, moment: null },
  { id: "before", covered: false, moment: "visit_tomorrow" },
  { id: "after", covered: false, moment: "visited" },
  { id: "quiet", covered: false, moment: "lapsed" },
];

/** A workspace that can send offers on WhatsApp and by email, with a calendar, and nothing in its Library yet. */
const world = (over = {}) => ({
  now: NOW,
  tz: TZ,
  language: "en",
  channels: { whatsapp: true, email_offers: true },
  messages: [],
  lists: [offersList()],
  playbooks: [],
  notes: [],
  room: null,
  journey: JOURNEY,
  offersList: OFFERS,
  ...over,
});

const offer = (over = {}, say) => ({
  intent: "offer",
  offer: { words: WORDS, from: "2026-11-01", until: "2026-11-30", ...over },
  ...(say ? { say } : {}),
});

const monthsOffer = (over = {}) => ({
  id: PB,
  name: "This month's offer",
  trigger: "everyone_monthly",
  state: "running",
  template_name: "this_months_offer",
  ...over,
});

/** The steps as the rows compare them: everything but each one's why, which is held apart (every step has one). */
const shape = (steps) => steps.map(({ n, kind, silent, input, after }) => ({ n, kind, silent, input, after }));

const MONTHS_PARAMS = ["@first_name", "@business_name", LINE, "@booking_link"];
const WRITTEN_PARAMS = ["@first_name", "@business_name", "@booking_link"];
const BOTH = ["whatsapp", "email"];

/** The message the plan writes from the month's offer starter, in English, the offer in place of its third value. */
const WRITTEN = (versions) => ({
  n: 1,
  kind: "message",
  silent: true,
  after: [],
  input: {
    name: "offer_10_off_every_service_all_november",
    language: "en",
    category: "marketing",
    versions,
    slots: [
      { position: 1, label: "First name", kind: "first_name" },
      { position: 2, label: "Business name", kind: "business_name" },
      { position: 3, label: "Booking link", kind: "booking_link" },
    ],
  },
});
const WA_BODY = `Hi {{1}}, this month at {{2}}: ${LINE} Book here: {{3}} or reply with a day that suits you.\n\nReply STOP to opt out`;
const EMAIL = {
  subject: "This month at {{2}}",
  body: `Hi {{1}},\n\nThis month at {{2}}: ${LINE}\n\nBook here: {{3}}, or reply with a day that suits you.`,
};

const listStep = (n) => ({
  n,
  kind: "list",
  silent: true,
  after: [],
  input: { name: "Not booked since Nov 1", all: [SAID_YES, NOT_BOOKED, NO_VISIT_SINCE], cannot: "" },
});
const noteStep = (n) => ({
  n,
  kind: "note",
  silent: true,
  after: [],
  input: {
    change: {
      op: "add_note",
      title: `Offer: ${WORDS}`,
      text: `The offer: ${LINE} It runs from Nov 1 to Nov 30.`,
      until: "2026-11-30",
    },
  },
});
const firstSend = (n, after, over = {}) => ({
  n,
  kind: "broadcast",
  silent: false,
  after,
  input: {
    template_id: V(1),
    audience_kind: "list",
    audience_id: "offers_ok",
    params: MONTHS_PARAMS,
    scheduled_for: FIRST_AT,
    name: `Offer: ${WORDS}`,
    channels: BOTH,
    ...over,
  },
});
const secondSend = (n, after, over = {}) => ({
  n,
  kind: "broadcast",
  silent: false,
  after,
  input: {
    template_id: V(1),
    audience_kind: "saved",
    audience_id: stepToken(1),
    params: MONTHS_PARAMS,
    scheduled_for: SECOND_AT,
    name: `Reminder: ${WORDS}`,
    channels: BOTH,
    ...over,
  },
});

const REUSED = "Sends “this_months_offer”, already in the Library, with the offer in its words.";
const WRITES = (on) => `Writes the offer as a new message, “offer_10_off_every_service_all_november”, for ${on}.`;
const NOTE = "Tells the receptionist about the offer, until Nov 30.";
const GOES = "The offer goes to “Can receive offers” on Nov 1 at 10:00 AM.";
const REMINDS =
  "A reminder goes on Nov 20 at 10:00 AM to a new list of whoever has not booked since Nov 1; anyone who heard from you in the week before is left out.";

/** The rows: an intent, a world, and the steps and words it plans, or its refusal. */
const ROWS = [
  {
    name: "the month's offer is reused, and since it runs on that message its words change",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], playbooks: [monthsOffer()] }),
    steps: [
      listStep(1),
      noteStep(2),
      { n: 3, kind: "change", silent: true, after: [], input: { playbook_id: PB, params: MONTHS_PARAMS } },
      firstSend(4, [1, 2, 3]),
      secondSend(5, [1, 2, 3]),
    ],
    words: [
      REUSED,
      NOTE,
      "The month's offer, “This month's offer”, says this offer from now on: change its words back after Nov 30.",
      GOES,
      REMINDS,
    ],
  },
  {
    name: "no message carries an offer: one is written for WhatsApp and email, and a paused month's offer is left alone",
    intent: offer(),
    world: world({ playbooks: [monthsOffer({ state: "paused" })] }),
    steps: [
      WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }),
      listStep(2),
      noteStep(3),
      firstSend(4, [1, 2, 3], { template_id: stepToken(1), params: WRITTEN_PARAMS }),
      secondSend(5, [1, 2, 3], { template_id: stepToken(1), audience_id: stepToken(2), params: WRITTEN_PARAMS }),
    ],
    words: [WRITES("WhatsApp and email"), NOTE, GOES, REMINDS],
  },
  {
    name: "with no WhatsApp number the message is written for email alone, and the words say why",
    intent: offer(),
    world: world({ channels: { whatsapp: false, email_offers: true } }),
    steps: [
      WRITTEN({ email: EMAIL }),
      listStep(2),
      noteStep(3),
      firstSend(4, [1, 2, 3], { template_id: stepToken(1), params: WRITTEN_PARAMS, channels: ["email"] }),
      secondSend(5, [1, 2, 3], {
        template_id: stepToken(1),
        audience_id: stepToken(2),
        params: WRITTEN_PARAMS,
        channels: ["email"],
      }),
    ],
    words: [WRITES("email"), W.withoutWhatsApp, NOTE, GOES, REMINDS],
  },
  {
    name: "where email does not send offers the message has no email version, and the words say so",
    intent: offer(),
    world: world({ channels: { whatsapp: true, email_offers: false } }),
    steps: [
      WRITTEN({ whatsapp: { body: WA_BODY } }),
      listStep(2),
      noteStep(3),
      firstSend(4, [1, 2, 3], { template_id: stepToken(1), params: WRITTEN_PARAMS, channels: ["whatsapp"] }),
      secondSend(5, [1, 2, 3], {
        template_id: stepToken(1),
        audience_id: stepToken(2),
        params: WRITTEN_PARAMS,
        channels: ["whatsapp"],
      }),
    ],
    words: [WRITES("WhatsApp"), W.withoutEmail, NOTE, GOES, REMINDS],
  },
  {
    name: "a message missing a channel the offer goes by is not reused: one is written with both",
    intent: offer(),
    world: world({
      messages: [monthsOfferMessage({ versions: [{ channel: "whatsapp", id: V(1), state: "approved" }] })],
    }),
    steps: [
      WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }),
      listStep(2),
      noteStep(3),
      firstSend(4, [1, 2, 3], { template_id: stepToken(1), params: WRITTEN_PARAMS }),
      secondSend(5, [1, 2, 3], { template_id: stepToken(1), audience_id: stepToken(2), params: WRITTEN_PARAMS }),
    ],
    words: [WRITES("WhatsApp and email"), NOTE, GOES, REMINDS],
  },
  {
    name: "a text asked for is dropped, since texts carry no offers",
    intent: offer({ channels: ["whatsapp", "sms"] }),
    world: world({ messages: [monthsOfferMessage()] }),
    steps: [
      listStep(1),
      noteStep(2),
      firstSend(3, [1, 2], { channels: ["whatsapp"] }),
      secondSend(4, [1, 2], { channels: ["whatsapp"] }),
    ],
    words: [REUSED, W.noText, NOTE, GOES, REMINDS],
  },
  {
    name: "neither WhatsApp nor email can carry an offer here: refused (Review Focus 2)",
    intent: offer(),
    world: world({ channels: { whatsapp: false, email_offers: false } }),
    refused: W.noChannel,
  },
  {
    name: "an offer that ends before it starts is refused",
    intent: offer({ from: "2026-11-10", until: "2026-11-01" }),
    world: world(),
    refused: W.fromAfterUntil,
  },
  {
    name: "an offer starting on a day already past by the business's clock is refused (Review Focus 1)",
    intent: offer({ from: "2026-10-10" }),
    world: world(),
    refused: W.fromPast,
  },
  {
    name: "a day that is not one is refused",
    intent: offer({ until: "November 30" }),
    world: world(),
    refused: W.notADay,
  },
  {
    name: "a list nobody has is refused",
    intent: offer({ who: "list:00000000-0000-4000-8000-000000000000" }),
    world: world(),
    refused: W.noOffersList,
  },
  {
    name: "a list of the same rule is reused whatever its name; one of the plan's name and another rule is not",
    intent: offer(),
    world: world({
      messages: [monthsOfferMessage()],
      lists: [
        offersList(),
        {
          token: "list:11111111-1111-4111-8111-111111111111",
          name: "Not booked since Nov 1",
          rule: { all: [SAID_YES] },
          count: 9,
        },
        {
          token: `list:${OWN}`,
          name: "Still to book",
          rule: { v: 2, all: [NO_VISIT_SINCE, SAID_YES, NOT_BOOKED] },
          count: 12,
        },
      ],
    }),
    steps: [noteStep(1), firstSend(2, [1]), secondSend(3, [1], { audience_id: OWN })],
    words: [
      REUSED,
      NOTE,
      GOES,
      "A reminder goes on Nov 20 at 10:00 AM to “Still to book”; anyone who heard from you in the week before is left out.",
    ],
  },
  {
    name: "the reminder's list holds nobody today: the second send is left out, and the words say why",
    intent: offer(),
    world: world({
      messages: [monthsOfferMessage()],
      lists: [
        offersList(),
        {
          token: `list:${OWN}`,
          name: "Still to book",
          rule: { all: [SAID_YES, NOT_BOOKED, NO_VISIT_SINCE] },
          count: 0,
        },
      ],
    }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [REUSED, NOTE, GOES, W.countZero("Still to book")],
  },
  {
    name: "the month's offer runs on another message: it is paused while this offer runs (ruling 1)",
    intent: offer(),
    world: world({
      messages: [
        monthsOfferMessage({
          name: "spring_offer",
          slots: [
            { position: 1, label: "First name", kind: "first_name" },
            { position: 2, label: "Business name", kind: "business_name" },
          ],
        }),
      ],
      playbooks: [monthsOffer({ template_name: "spring_offer" })],
    }),
    steps: [
      WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }),
      listStep(2),
      noteStep(3),
      { n: 4, kind: "change", silent: true, after: [], input: { playbook_id: PB, state: "paused" } },
      firstSend(5, [1, 2, 3, 4], { template_id: stepToken(1), params: WRITTEN_PARAMS }),
      secondSend(6, [1, 2, 3, 4], { template_id: stepToken(1), audience_id: stepToken(2), params: WRITTEN_PARAMS }),
    ],
    words: [
      WRITES("WhatsApp and email"),
      NOTE,
      "Pauses the month's offer, “This month's offer”, so nobody gets two offers: resume it after Nov 30.",
      GOES,
      REMINDS,
    ],
  },
  {
    name: "less room on the calendar than half the audience: the first send is a capped campaign that ends with the offer (rulings 2, 3)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], room: { open: 15 } }),
    steps: [
      noteStep(1),
      {
        n: 2,
        kind: "playbook",
        silent: false,
        after: [1],
        input: {
          trigger: "saved_list",
          list: OFFERS,
          policy_class: "campaign",
          template_id: V(1),
          params: MONTHS_PARAMS,
          cap_per_run: 15,
          name: `Offer: ${WORDS}`,
          channels: BOTH,
          until: "2026-11-30",
        },
      },
    ],
    words: [
      REUSED,
      NOTE,
      W.paced(15, 40),
      "The campaign starts its runs the day it is approved: approve it on Nov 1.",
      W.reminderPaced,
    ],
  },
  {
    name: "room for the whole audience twice over is no pacing; nor is a room not known (ruling 3)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], room: { open: 20 } }),
    steps: [listStep(1), noteStep(2), firstSend(3, [1, 2]), secondSend(4, [1, 2])],
    words: [REUSED, NOTE, GOES, REMINDS],
  },
  {
    name: "today, with ten o'clock past: the first send goes at Approve, and the words say so (ruling 6)",
    intent: offer({ from: "2026-10-11", until: "2026-11-15" }),
    world: world({ messages: [monthsOfferMessage()], now: new Date("2026-10-11T16:00:00Z") }),
    steps: [
      {
        ...listStep(1),
        input: { name: "Not booked since Oct 11", all: [SAID_YES, NOT_BOOKED, NO_VISIT_SINCE], cannot: "" },
      },
      {
        ...noteStep(2),
        input: {
          change: {
            op: "add_note",
            title: `Offer: ${WORDS}`,
            text: `The offer: ${LINE} It runs from Oct 11 to Nov 15.`,
            until: "2026-11-15",
          },
        },
      },
      (() => {
        const s = firstSend(3, [1, 2]);
        delete s.input.scheduled_for;
        return s;
      })(),
      secondSend(4, [1, 2], { scheduled_for: "2026-10-30T14:00:00.000Z" }),
    ],
    words: [
      REUSED,
      "Tells the receptionist about the offer, until Nov 15.",
      "The offer goes to “Can receive offers” when you approve it, as 10:00 AM today has passed.",
      "A reminder goes on Oct 30 at 10:00 AM to a new list of whoever has not booked since Oct 11; anyone who heard from you in the week before is left out.",
    ],
  },
  {
    name: "a new WhatsApp version and a first send under a day away: the words say WhatsApp's review may still run (ruling 7)",
    intent: offer({ from: "2026-10-11", until: "2026-11-15" }),
    world: world({ now: new Date("2026-10-11T13:00:00Z") }),
    steps: [
      WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }),
      {
        ...listStep(2),
        input: { name: "Not booked since Oct 11", all: [SAID_YES, NOT_BOOKED, NO_VISIT_SINCE], cannot: "" },
      },
      {
        ...noteStep(3),
        input: {
          change: {
            op: "add_note",
            title: `Offer: ${WORDS}`,
            text: `The offer: ${LINE} It runs from Oct 11 to Nov 15.`,
            until: "2026-11-15",
          },
        },
      },
      firstSend(4, [1, 2, 3], {
        template_id: stepToken(1),
        params: WRITTEN_PARAMS,
        scheduled_for: "2026-10-11T14:00:00.000Z",
      }),
      secondSend(5, [1, 2, 3], {
        template_id: stepToken(1),
        audience_id: stepToken(2),
        params: WRITTEN_PARAMS,
        scheduled_for: "2026-10-30T14:00:00.000Z",
      }),
    ],
    words: [
      WRITES("WhatsApp and email"),
      "Tells the receptionist about the offer, until Nov 15.",
      "The offer goes to “Can receive offers” on Oct 11 at 10:00 AM.",
      "A reminder goes on Oct 30 at 10:00 AM to a new list of whoever has not booked since Oct 11; anyone who heard from you in the week before is left out.",
      W.whatsappReview,
    ],
  },
  {
    name: "a reused message whose WhatsApp version is still in review says so too, a first send under a day away; a day off, not",
    intent: offer({ from: "2026-10-11", until: "2026-11-15" }),
    world: world({
      messages: [
        monthsOfferMessage({
          versions: [
            { channel: "whatsapp", id: V(1), state: "pending" },
            { channel: "email", id: V(2), state: "approved" },
          ],
        }),
      ],
      now: new Date("2026-10-11T13:00:00Z"),
    }),
    steps: [
      {
        ...listStep(1),
        input: { name: "Not booked since Oct 11", all: [SAID_YES, NOT_BOOKED, NO_VISIT_SINCE], cannot: "" },
      },
      {
        ...noteStep(2),
        input: {
          change: {
            op: "add_note",
            title: `Offer: ${WORDS}`,
            text: `The offer: ${LINE} It runs from Oct 11 to Nov 15.`,
            until: "2026-11-15",
          },
        },
      },
      firstSend(3, [1, 2], { scheduled_for: "2026-10-11T14:00:00.000Z" }),
      secondSend(4, [1, 2], { scheduled_for: "2026-10-30T14:00:00.000Z" }),
    ],
    words: [
      REUSED,
      "Tells the receptionist about the offer, until Nov 15.",
      "The offer goes to “Can receive offers” on Oct 11 at 10:00 AM.",
      "A reminder goes on Oct 30 at 10:00 AM to a new list of whoever has not booked since Oct 11; anyone who heard from you in the week before is left out.",
      W.whatsappReview,
    ],
  },
  {
    name: "a version in review and a first send more than a day away: nothing to say of the review",
    intent: offer(),
    world: world({
      messages: [
        monthsOfferMessage({
          versions: [
            { channel: "whatsapp", id: V(1), state: "pending" },
            { channel: "email", id: V(2), state: "approved" },
          ],
        }),
      ],
    }),
    steps: [listStep(1), noteStep(2), firstSend(3, [1, 2]), secondSend(4, [1, 2])],
    words: [REUSED, NOTE, GOES, REMINDS],
  },
  {
    name: "the receptionist already has the offer's note with the same end: no note step",
    intent: offer(),
    world: world({
      messages: [monthsOfferMessage()],
      notes: [{ title: `Offer: ${WORDS}`, text: "Anything.", until: "2026-11-30" }],
    }),
    steps: [listStep(1), firstSend(2, [1]), secondSend(3, [1])],
    words: [REUSED, W.noteKnown, GOES, REMINDS],
  },
  {
    name: "an offer shorter than the reminder's day has no reminder",
    intent: offer({ until: "2026-11-07" }),
    world: world({ messages: [monthsOfferMessage()] }),
    steps: [
      {
        ...noteStep(1),
        input: {
          change: {
            op: "add_note",
            title: `Offer: ${WORDS}`,
            text: `The offer: ${LINE} It runs from Nov 1 to Nov 7.`,
            until: "2026-11-07",
          },
        },
      },
      firstSend(2, [1]),
    ],
    words: [REUSED, "Tells the receptionist about the offer, until Nov 7.", GOES, W.reminderAfterEnd("Nov 20")],
  },
  {
    name: "with no calendar, who has booked cannot be told: no reminder",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], journey: [{ id: "quiet", covered: false, moment: "quiet_30" }] }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [REUSED, NOTE, GOES, W.reminderNoCalendar("Nov 1")],
  },
  {
    name: "the owner's phrasing is what the message says, and a list of theirs is the audience",
    intent: offer({ who: `list:${OWN}`, service: "any service" }, "A tenth off anything you book in November"),
    world: world({
      messages: [monthsOfferMessage()],
      lists: [
        offersList(),
        {
          token: `list:${OWN}`,
          name: "Regulars",
          rule: { all: [{ field: "calls", op: "at_least", n: 2 }] },
          count: 30,
        },
      ],
    }),
    steps: [
      {
        ...listStep(1),
        input: {
          name: "Not booked since Nov 1",
          all: [{ field: "calls", op: "at_least", n: 2 }, NOT_BOOKED, NO_VISIT_SINCE],
          cannot: "",
        },
      },
      {
        ...noteStep(2),
        input: {
          change: {
            op: "add_note",
            title: `Offer: ${WORDS}`,
            text: "The offer: A tenth off anything you book in November. It runs from Nov 1 to Nov 30. It is for any service.",
            until: "2026-11-30",
          },
        },
      },
      firstSend(3, [1, 2], {
        audience_kind: "saved",
        audience_id: OWN,
        params: ["@first_name", "@business_name", "A tenth off anything you book in November.", "@booking_link"],
      }),
      secondSend(4, [1, 2], {
        params: ["@first_name", "@business_name", "A tenth off anything you book in November.", "@booking_link"],
      }),
    ],
    words: [REUSED, NOTE, "The offer goes to “Regulars” on Nov 1 at 10:00 AM.", REMINDS],
  },

  /* ---- cover_journey ---- */
  {
    name: "cover the journey with a calendar and no deals: the day before and the day after, nothing for first contact",
    intent: { intent: "cover_journey" },
    world: world({ journey: JOURNEY.map((s) => (s.id === "quiet" ? { ...s, covered: true } : s)) }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visit_tomorrow" } },
      { n: 2, kind: "playbook", silent: false, after: [], input: { trigger: "visited" } },
    ],
    words: ["Starts 2 campaigns, one on each moment not covered yet, each its own card."],
  },
  {
    name: "the day after sends the review ask where the Library holds it (ruling 9)",
    intent: { intent: "cover_journey" },
    world: world({
      messages: [
        {
          name: "after_visit_review",
          language: "en_US",
          category: "utility",
          versions: [
            { channel: "email", id: V(8), state: "approved" },
            { channel: "whatsapp", id: V(7), state: "approved" },
          ],
          slots: [],
          used_by: [],
        },
      ],
    }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visit_tomorrow" } },
      { n: 2, kind: "playbook", silent: false, after: [], input: { trigger: "visited", template_id: V(7) } },
      { n: 3, kind: "playbook", silent: false, after: [], input: { trigger: "lapsed" } },
    ],
    words: ["Starts 3 campaigns, one on each moment not covered yet, each its own card."],
  },
  {
    name: "cover the journey without a calendar: the win-back by silence alone",
    intent: { intent: "cover_journey" },
    world: world({
      journey: [
        { id: "first_contact", covered: true, moment: null },
        { id: "quiet", covered: false, moment: "quiet_30" },
      ],
    }),
    steps: [{ n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "quiet_30" } }],
    words: ["Starts 1 campaign, one on each moment not covered yet, each its own card."],
  },
  {
    name: "cover the journey with deals on: the proposal follow-up, in the journey's order",
    intent: { intent: "cover_journey" },
    world: world({
      journey: [...JOURNEY.slice(0, 3), { id: "proposal", covered: false, moment: "proposal_waiting" }, JOURNEY[3]],
    }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visit_tomorrow" } },
      { n: 2, kind: "playbook", silent: false, after: [], input: { trigger: "visited" } },
      { n: 3, kind: "playbook", silent: false, after: [], input: { trigger: "proposal_waiting" } },
      { n: 4, kind: "playbook", silent: false, after: [], input: { trigger: "lapsed" } },
    ],
    words: ["Starts 4 campaigns, one on each moment not covered yet, each its own card."],
  },
  {
    name: "a campaign paused on a moment is not doubled: the words say to resume it",
    intent: { intent: "cover_journey", stages: ["after", "quiet"] },
    world: world({
      playbooks: [{ id: PB, name: "Win-back", trigger: "lapsed", state: "paused", template_name: null }],
    }),
    steps: [{ n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visited" } }],
    words: [
      "Starts 1 campaign, one on each moment not covered yet, each its own card.",
      "“Win-back” stands paused on its moment: resume it from its drawer.",
    ],
  },
  {
    name: "the day before asked for, with no calendar: nothing to cover, said",
    intent: { intent: "cover_journey", stages: ["before"] },
    world: world({ journey: [{ id: "first_contact", covered: true, moment: null }] }),
    refused: `${W.nothingToCover} Not offered here: the day before an appointment.`,
  },
  {
    name: "the journey not read is refused, never guessed (ruling 9)",
    intent: { intent: "cover_journey" },
    world: world({ journey: null }),
    refused: W.journeyUnread,
  },
];

for (const row of ROWS) {
  test(row.name, () => {
    const out = planOf(row.intent, row.world);
    if (row.refused) {
      assert.deepEqual(out, { refused: row.refused });
      return;
    }
    assert.ok("steps" in out, `planned, not refused: ${JSON.stringify(out)}`);
    assert.deepEqual(shape(out.steps), row.steps);
    assert.equal(out.words, row.words.join(" "));
    for (const s of out.steps) assert.ok(typeof s.why === "string" && s.why.length > 0, `step ${s.n} says why`);
  });
}

test("the refusals and the words the brief names are words", () => {
  for (const k of ["fromAfterUntil", "fromPast", "noChannel", "noOffersList"]) assert.equal(typeof W[k], "string", k);
  assert.match(W.countZero("Still to book"), /“Still to book”/);
  assert.match(W.paced(15, 40), /15 open slots ahead for 40 people.*up to 15 a day/);
  assert.match(W.paced(0, 3), /no open slot ahead for 3 people.*up to 1 a day/);
  assert.doesNotMatch(
    Object.values(W)
      .filter((w) => typeof w === "string")
      .join(" "),
    /\bMeta\b/,
  );
});

test("a step's token is @step:n, and resolveSteps fills every one from what the plan made", () => {
  assert.equal(stepToken(2), "@step:2");
  assert.ok(STEP_TOKEN.test("@step:12"));
  assert.ok(!STEP_TOKEN.test("@step:2x") && !STEP_TOKEN.test("@first_name"));
  const payload = {
    template_id: stepToken(1),
    audience_kind: "saved",
    audience_id: stepToken(2),
    params: ["@first_name", "@step:2x"],
    deep: { lists: [stepToken(2)] },
  };
  const made = { 1: { kind: "message", id: V(1) }, 2: { kind: "list", id: OWN } };
  assert.deepEqual(resolveSteps(payload, made), {
    template_id: V(1),
    audience_kind: "saved",
    audience_id: OWN,
    params: ["@first_name", "@step:2x"],
    deep: { lists: [OWN] },
  });
  assert.deepEqual(resolveSteps(payload, { 1: made[1] }), { unresolved: 2 });
  assert.equal(payload.audience_id, stepToken(2), "the payload it was given is left as it was");
});

/* ---- every step's input is its action's input ---- */

const action = async (rel, name) => {
  const m = await import(at(`apps/dashboard/src/server/ask/tools/act/${rel}`));
  const def = m[name];
  return def.actions ? Object.values(def.actions)[0] : def;
};

test("every step's input is the input of the Ask action it is expanded through", async () => {
  const schemas = {
    message: (await action("message.ts", "messageAction")).input,
    list: (await action("list.ts", "propose_list")).input,
    note: (await action("settings.ts", "propose_settings")).input,
    broadcast: (await action("broadcast.ts", "broadcastAction")).input,
    playbook: (await action("playbook.ts", "playbookAction")).input,
    change: (await action("playbook-change.ts", "playbookChangeAction")).input,
  };
  const { checkMessage } = await import(at("apps/dashboard/src/server/campaigns/write-message.ts"));
  const { slotExample } = await import(at("apps/dashboard/src/server/ask/tools/act/says.ts"));
  const seen = new Set();
  for (const row of ROWS.filter((r) => !r.refused)) {
    const out = planOf(row.intent, row.world);
    for (const s of out.steps) {
      seen.add(s.kind);
      // The playbook action takes `until` from Task 17; every other key is its own today.
      const { until, ...rest } = s.input;
      const input = s.kind === "playbook" ? rest : s.input;
      if (s.kind === "playbook" && until !== undefined) assert.ok(C.isDayKey(until), `${row.name}: until is a day`);
      const parsed = schemas[s.kind].strict().safeParse(input);
      assert.ok(parsed.success, `${row.name}, step ${s.n} (${s.kind}): ${JSON.stringify(parsed.error?.issues)}`);
      if (s.kind === "note") assert.ok(C.AskSettingsChangeSchema.safeParse(s.input.change).success, row.name);
      if (s.kind === "list") assert.ok(C.asListRule({ all: s.input.all }), `${row.name}: the list's rule reads`);
      if (s.kind === "message") {
        // The door's own checks of the words, on the body the message card files (act/message.ts proposeMessage).
        const body = {
          name: C.slugTemplateName(s.input.name),
          language: C.messageLanguageCode(s.input.language),
          category: s.input.category,
          versions: s.input.versions,
          slots: s.input.slots.map((x) => ({ ...x, example: slotExample(x) })),
        };
        assert.doesNotThrow(() => checkMessage(body), row.name);
        if (body.versions.whatsapp) {
          const draft = C.validateTemplateDraft({
            name: body.name,
            language: body.language,
            category: body.category,
            body: body.versions.whatsapp.body,
            examples: body.slots.map((x) => x.example),
          });
          assert.ok(draft.ok && draft.warnings.length === 0, `${row.name}: ${JSON.stringify(draft)}`);
        }
      }
    }
  }
  assert.deepEqual([...seen].sort(), ["broadcast", "change", "list", "message", "note", "playbook"]);
});

test("the Spanish message is written from the Spanish starter", () => {
  const out = planOf(offer({}, "10% de descuento en todo noviembre"), world({ language: "es" }));
  const [message] = out.steps;
  assert.equal(message.input.language, "es");
  assert.equal(
    message.input.versions.whatsapp.body,
    "Hola {{1}}, este mes en {{2}}: 10% de descuento en todo noviembre. Reserva aquí: {{3}} o responde con el día que mejor te venga.\n\nResponde STOP para darte de baja",
  );
  assert.deepEqual(
    message.input.slots.map((s) => s.label),
    ["Nombre", "Nombre del negocio", "Enlace de reservas"],
  );
});

test("a name the Library holds is not written twice", () => {
  const out = planOf(
    offer(),
    world({ messages: [{ ...monthsOfferMessage(), name: "offer_10_off_every_service_all_november", slots: [] }] }),
  );
  const [message] = out.steps;
  assert.equal(message.input.name, "offer_10_off_every_service_all_november_2");
});
