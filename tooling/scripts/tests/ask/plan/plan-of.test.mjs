/**
 * A plan, with no model (the marketing manager's spec §5.4, D3): contracts planOf turns an intent ("10% off every
 * service all November", or "cover my journey") and a snapshot of the workspace (PlanWorld) into steps, as data, and no
 * I/O. Each rule of §5.4's table, as ruled since, is a row here, EXECUTED, deep-equal on the steps (their kinds, whether
 * each is silent, the steps it waits on, and its whole input) and on the plan's words: a message reused by its category,
 * language and its one typed value being the offer's, or written in that shape with a version on each channel the
 * workspace sends offers on (never a text), so the next offer reuses it; the receptionist's note; the send at ten on the
 * business's clock; a running month's offer paused while the offer runs; the send paced as a capped campaign where the
 * offer starts today and the calendar has less room than half the audience, and said tight where it starts later; the
 * reminder never a step but the day to ask for it; and a campaign on each moment of the journey not covered yet. The
 * words say first what no card carries (the channels left out and why, a note left out or already held, the month's
 * offer to resume after, the room, WhatsApp's review of a paced campaign that also goes by email, the reminder last of
 * them), then what the cards show (WhatsApp's review of a send it holds, the message, the note made, the send's day and
 * hour), so the answer's detail, cut at its 700 characters, loses only what a card says. The dates are the business's:
 * a start already past is refused by the same judge that refuses a campaign's past
 * end (contracts localDate), and ten o'clock is wallClockAt's.
 *
 * Every step's input is the input of the Ask action it is expanded through (Task 17): each is parsed, strictly, by that
 * action's own schema (the dashboard's tools, read as modules, each action found by its name), every written message
 * passes the door's own checks of its words (POST templates/message's checkMessage), and a note's change is one
 * AskSettingsChangeSchema reads. A new campaign's `until` is its action's own since Task 17.
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
/** What fills the offer's value: the owner's words, as a sentence. */
const LINE = "10% off every service all November.";
/** Ten o'clock on 1 Nov 2026 in New York: standard time from that morning, five hours behind UTC. */
const FIRST_AT = "2026-11-01T15:00:00.000Z";

/** The built-in offers list as People's lists read it: its token, its name, and who is on it. */
const offersList = (count = 40) => ({ token: OFFERS, name: "Can receive offers", count });

/** The offer message's values: the month's offer starter's, the offer the one typed. */
const OFFER_SLOTS = [
  { position: 1, label: "First name", kind: "first_name" },
  { position: 2, label: "Business name", kind: "business_name" },
  { position: 3, label: "The offer", kind: "text" },
  { position: 4, label: "Booking link", kind: "booking_link" },
];

/** The month's offer starter as campaigns with action messages reads it: both versions approved, the offer its third value. */
const monthsOfferMessage = (over = {}) => ({
  name: "this_months_offer",
  language: "en_US",
  category: "marketing",
  versions: [
    { channel: "whatsapp", id: V(1), state: "approved" },
    { channel: "email", id: V(2), state: "approved" },
  ],
  slots: OFFER_SLOTS,
  used_by: [],
  ...over,
});
/** A quick note: marketing, one typed value, but not the offer's ("The note"). */
const quickNote = () =>
  monthsOfferMessage({
    name: "quick_note",
    versions: [
      { channel: "whatsapp", id: V(11), state: "approved" },
      { channel: "email", id: V(12), state: "approved" },
    ],
    slots: [
      { position: 1, label: "First name", kind: "first_name" },
      { position: 2, label: "Business name", kind: "business_name" },
      { position: 3, label: "The note", kind: "text" },
    ],
  });
/** The message an earlier plan wrote, filed. */
const writtenOffer = (over = {}) =>
  monthsOfferMessage({
    name: "offer",
    versions: [
      { channel: "whatsapp", id: V(21), state: "approved" },
      { channel: "email", id: V(22), state: "approved" },
    ],
    ...over,
  });

/** The journey of a workspace with a calendar and no deals: first contact the receptionist's, nothing else covered. */
const JOURNEY = [
  { id: "first_contact", covered: true, moment: null },
  { id: "before", covered: false, moment: "visit_tomorrow" },
  { id: "after", covered: false, moment: "visited" },
  { id: "quiet", covered: false, moment: "lapsed" },
];

/** A channel an offer may go by, as channelChoices answers it. */
const OPEN = { ok: true, why: null };
/** WhatsApp's pause on offers to US numbers, in its own words (the channels' reader passes the number). */
const US_PAUSED = C.whatsappOffersOpen("+12125550123").why;
/** No WhatsApp number: channelChoices' reason, the readiness's own. */
const NO_NUMBER = { ok: false, why: C.CHANNEL_WORDS.noWhatsApp };
const NO_MAILBOX = { ok: false, why: C.CHANNEL_WORDS.noMailbox };

/** A setup's one campaign on the day after, its input the moment and `over` (its message or the starter it names). */
const AFTER = (over) => ({ n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visited", ...over } });
const COVERS_ONE = "Starts 1 campaign, one on each moment not covered yet, each its own card.";

/** A workspace that can send offers on WhatsApp and by email, with a calendar, and nothing in its Library yet. */
const world = (over = {}) => ({
  now: NOW,
  tz: TZ,
  language: "en",
  channels: { whatsapp: OPEN, email: OPEN },
  whatsappSends: true,
  reviewLink: false,
  messages: [],
  lists: [offersList()],
  playbooks: [],
  notes: [],
  room: null,
  journey: JOURNEY,
  offersList: OFFERS,
  canNote: true,
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
  until: null,
  ...over,
});

/** The steps as the rows compare them: everything but each one's why, which is held apart (every step has one). */
const shape = (steps) => steps.map(({ n, kind, silent, input, after }) => ({ n, kind, silent, input, after }));

/** The values a send fills an offer message with: per person, and the owner's words typed into the offer's. */
const PARAMS = ["@first_name", "@business_name", LINE, "@booking_link"];
const BOTH = ["whatsapp", "email"];

/** The message a plan writes, in English: the offer is its typed value, never words of its own body. */
const WRITTEN = (versions) => ({
  n: 1,
  kind: "message",
  silent: true,
  after: [],
  input: { name: "offer", language: "en", category: "marketing", versions, slots: OFFER_SLOTS },
});
/** Words that fit any dated offer: no "this month". */
const WA_BODY =
  "Hi {{1}}, an offer from {{2}}: {{3}} Book here: {{4}} or reply with a day that suits you.\n\nReply STOP to opt out";
const EMAIL = {
  subject: "An offer from {{2}}",
  body: "Hi {{1}},\n\nAn offer from {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you.",
};

const noteStep = (n, from = "Nov 1", until = "Nov 30", day = "2026-11-30") => ({
  n,
  kind: "note",
  silent: true,
  after: [],
  input: {
    change: {
      op: "add_note",
      title: `Offer: ${WORDS}`,
      text: `The offer: ${LINE} It runs from ${from} to ${until}.`,
      until: day,
    },
  },
});
const pauseStep = (n) => ({
  n,
  kind: "change",
  silent: true,
  after: [],
  input: { playbook_id: PB, state: "paused" },
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
    params: PARAMS,
    scheduled_for: FIRST_AT,
    name: `Offer: ${WORDS}`,
    channels: BOTH,
    ...over,
  },
});
/** The written message's send: its template is step 1's. */
const writtenSend = (n, after, over = {}) => firstSend(n, after, { template_id: stepToken(1), ...over });
/** A send whose ten o'clock has passed today: no time, it goes at Approve. */
const atApprove = (step) => {
  const { scheduled_for: _past, ...input } = step.input;
  return { ...step, input };
};

const REUSED = "Sends “this_months_offer”, already in the Library, with the offer in its words.";
const WRITES = (on) =>
  `Writes a message for offers, “offer”, for ${on}: this offer goes in its words, and the next offer can send it too.`;
const NOTE = "Tells the receptionist about the offer, until Nov 30.";
/** The pause is a silent step: it applies at the plan's Approve (Task 15, carry-forward b). */
const PAUSES =
  "Pauses the month's offer, “This month's offer”, from when you approve it, so nobody gets two offers; resume it after Nov 30.";
const GOES = "The offer goes to “Can receive offers” on Nov 1 at 10:00 AM.";
/** The reminder, its own question on its day: whole, and short enough to fit the answer before what the cards show. */
const REMINDS = "On Nov 20, ask me to send a reminder to whoever on “Can receive offers” has not booked by then.";
/** A broadcast that ticks WhatsApp, on a WhatsApp version not reviewed yet: approved once it is, whenever it goes. */
const REVIEW_FIRST = "The send can be approved once WhatsApp has reviewed its WhatsApp version.";
/** The month's offer's WhatsApp version still in WhatsApp's review, the reason a send it holds goes without it. */
const REVIEWING = "It goes without WhatsApp: WhatsApp is still reviewing the WhatsApp version of “this_months_offer”.";
/** Each channel left out, with channelChoices' reason, never one the product wrote for it. */
const WITHOUT_WA = `It goes without WhatsApp: ${C.CHANNEL_WORDS.noWhatsApp}`;
const WITHOUT_WA_US = `It goes without WhatsApp: ${US_PAUSED}`;
const WITHOUT_EMAIL = `It goes without email: ${C.CHANNEL_WORDS.noMailbox}`;

/** A today's offer: from Sunday 11 Oct to 15 Nov. */
const TODAY = { from: "2026-10-11", until: "2026-11-15" };
/** The month's offer starter with its WhatsApp version still in WhatsApp's review, its email one approved. */
const PENDING_WA = [
  { channel: "whatsapp", id: V(1), state: "pending" },
  { channel: "email", id: V(2), state: "approved" },
];
/** Today's offer paced to 15 open slots in 14 days for 40 people: a campaign, two a day, ending with it. */
const PACED =
  "The calendar has 15 open slots in the next 14 days for 40 people, so the offer goes as a campaign: up to 2 a day, each person once, until it ends, starting when you approve it.";
const pacedStep = (n, after, over = {}) => ({
  n,
  kind: "playbook",
  silent: false,
  after,
  input: {
    trigger: "saved_list",
    list: OFFERS,
    policy_class: "campaign",
    template_id: V(1),
    params: PARAMS,
    cap_per_run: 2,
    name: `Offer: ${WORDS}`,
    channels: BOTH,
    until: "2026-11-15",
    ...over,
  },
});
/** The same room for the November offer, which starts later: its broadcast reaches the whole list on its day. */
const ROOM_TIGHT =
  "The calendar has 15 open slots in the next 14 days for 40 people, and the send goes to the whole list at once: to pace the offer to the room instead, dismiss the send and ask again on Nov 1.";
const TODAY_NOTE = noteStep(0, "Oct 11", "Nov 15", "2026-11-15");
const TODAY_SAYS = "Tells the receptionist about the offer, until Nov 15.";
const REMINDS_OCT_30 = W.reminderAsk("Oct 30", "Can receive offers");
/**
 * A month's offer named near its 80 characters: in the operator's world below, the reminder would end past the answer's
 * 700 characters were WhatsApp's review of the send said before it.
 */
const LONG_MONTHS_OFFER = "This month's offer, for every regular and every newer client, all autumn long";

/** The rows: an intent, a world, and the steps and words it plans, or its refusal. */
const ROWS = [
  {
    name: "the month's offer starter is reused, and the month's offer that runs on it is paused while the offer runs (ruling 3)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], playbooks: [monthsOffer()] }),
    steps: [noteStep(1), pauseStep(2), firstSend(3, [1, 2])],
    words: [PAUSES, REMINDS, REUSED, NOTE, GOES],
  },
  {
    name: "no message carries an offer: one is written for WhatsApp and email, and a paused month's offer is left alone; the send ticks WhatsApp, so it is approved once WhatsApp has reviewed the new version, whenever it goes",
    intent: offer(),
    world: world({ playbooks: [monthsOffer({ state: "paused" })] }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }), noteStep(2), writtenSend(3, [1, 2])],
    words: [REMINDS, REVIEW_FIRST, WRITES("WhatsApp and email"), NOTE, GOES],
  },
  {
    name: "with no WhatsApp number the message is written for email alone, and the words say why in the channels' own reason",
    intent: offer(),
    world: world({ channels: { whatsapp: NO_NUMBER, email: OPEN } }),
    steps: [WRITTEN({ email: EMAIL }), noteStep(2), writtenSend(3, [1, 2], { channels: ["email"] })],
    words: [WITHOUT_WA, REMINDS, WRITES("email"), NOTE, GOES],
  },
  {
    name: "a US number: WhatsApp's pause on offers is said as itself, never as a missing number, and the starter goes by its email version",
    intent: offer(),
    world: world({
      channels: { whatsapp: { ok: false, why: US_PAUSED }, email: OPEN },
      messages: [monthsOfferMessage()],
    }),
    steps: [noteStep(1), firstSend(2, [1], { template_id: V(2), channels: ["email"] })],
    words: [WITHOUT_WA_US, REMINDS, REUSED, NOTE, GOES],
  },
  {
    name: "where email does not send offers the message has no email version, and the words say so in its reason",
    intent: offer(),
    world: world({ channels: { whatsapp: OPEN, email: NO_MAILBOX } }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY } }), noteStep(2), writtenSend(3, [1, 2], { channels: ["whatsapp"] })],
    words: [WITHOUT_EMAIL, REMINDS, REVIEW_FIRST, WRITES("WhatsApp"), NOTE, GOES],
  },
  {
    name: "email not checked just now, with no reason given: said as not checked, never as not set up",
    intent: offer(),
    world: world({ channels: { whatsapp: OPEN, email: { ok: false, why: null } }, messages: [monthsOfferMessage()] }),
    steps: [noteStep(1), firstSend(2, [1], { channels: ["whatsapp"] })],
    words: [`It goes without email: ${C.CHANNEL_WORDS.unchecked}`, REMINDS, REUSED, NOTE, GOES],
  },
  {
    name: "a message missing a channel the offer goes by is not reused: one is written with both",
    intent: offer(),
    world: world({
      messages: [monthsOfferMessage({ versions: [{ channel: "whatsapp", id: V(1), state: "approved" }] })],
    }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }), noteStep(2), writtenSend(3, [1, 2])],
    words: [REMINDS, REVIEW_FIRST, WRITES("WhatsApp and email"), NOTE, GOES],
  },
  {
    name: "a text asked for is dropped, since texts carry no offers",
    intent: offer({ channels: ["whatsapp", "sms"] }),
    world: world({ messages: [monthsOfferMessage()] }),
    steps: [noteStep(1), firstSend(2, [1], { channels: ["whatsapp"] })],
    words: [W.noText, REMINDS, REUSED, NOTE, GOES],
  },
  {
    name: "texts asked for alone are refused in words that say texts never carry an offer, not that nothing here can (Task 15, carry-forward e)",
    intent: offer({ channels: ["sms"] }),
    world: world({ messages: [monthsOfferMessage()] }),
    refused: W.textOnly,
  },
  {
    name: "a starter the set retired is never reused, though it carries the offer's value: the earlier month's offer (Task 15, carry-forward d)",
    intent: offer(),
    world: world({
      messages: [
        monthsOfferMessage({
          name: "monthly_offer",
          versions: [
            { channel: "whatsapp", id: V(31), state: "approved" },
            { channel: "email", id: V(32), state: "approved" },
          ],
        }),
      ],
    }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }), noteStep(2), writtenSend(3, [1, 2])],
    words: [REMINDS, REVIEW_FIRST, WRITES("WhatsApp and email"), NOTE, GOES],
  },
  {
    name: "a quick note is not an offer message: the plan's own is sent, the quick note never (ruling 2)",
    intent: offer(),
    world: world({ messages: [quickNote(), writtenOffer()] }),
    steps: [noteStep(1), firstSend(2, [1], { template_id: V(21) })],
    words: [REMINDS, "Sends “offer”, already in the Library, with the offer in its words.", NOTE, GOES],
  },
  {
    name: "with only a quick note in the Library, an offer message is written (ruling 2)",
    intent: offer(),
    world: world({ messages: [quickNote()] }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }), noteStep(2), writtenSend(3, [1, 2])],
    words: [REMINDS, REVIEW_FIRST, WRITES("WhatsApp and email"), NOTE, GOES],
  },
  {
    name: "the month's offer starter comes before a message a plan wrote, whatever the Library's order (ruling 2)",
    intent: offer(),
    world: world({ messages: [writtenOffer(), quickNote(), monthsOfferMessage()] }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [REMINDS, REUSED, NOTE, GOES],
  },
  {
    name: "neither WhatsApp nor email can carry an offer here: refused, each in its own reason, then the text rule (Review Focus 2)",
    intent: offer(),
    world: world({ channels: { whatsapp: NO_NUMBER, email: NO_MAILBOX } }),
    refused: `Nothing here can carry this offer. WhatsApp cannot: ${C.CHANNEL_WORDS.noWhatsApp} Email cannot: ${C.CHANNEL_WORDS.noMailbox} ${C.CHANNEL_WORDS.noOffersByText} Say so, and what to set up first.`,
  },
  {
    name: "WhatsApp asked for alone, paused for offers to US numbers, with email open: refused in the pause's own words, naming email to ask for",
    intent: offer({ channels: ["whatsapp"] }),
    world: world({
      channels: { whatsapp: { ok: false, why: US_PAUSED }, email: OPEN },
      messages: [monthsOfferMessage()],
    }),
    refused: `Nothing asked for can carry this offer. WhatsApp cannot: ${US_PAUSED} Email can carry it: name it, or leave channels out.`,
  },
  {
    name: "WhatsApp asked for alone on a US number, with email not set up: no channel is open, so every closed one's reason is said, asked for or not, email's the one they can fix (fix round of batch P)",
    intent: offer({ channels: ["whatsapp"] }),
    world: world({
      channels: { whatsapp: { ok: false, why: US_PAUSED }, email: NO_MAILBOX },
      messages: [monthsOfferMessage()],
    }),
    refused: `Nothing here can carry this offer. WhatsApp cannot: ${US_PAUSED} Email cannot: ${C.CHANNEL_WORDS.noMailbox} ${C.CHANNEL_WORDS.noOffersByText} Say so, and what to set up first.`,
  },
  {
    name: "email asked for alone, not set up, with no WhatsApp number either: both reasons, the one not asked for among them",
    intent: offer({ channels: ["email"] }),
    world: world({ channels: { whatsapp: NO_NUMBER, email: NO_MAILBOX } }),
    refused: `Nothing here can carry this offer. WhatsApp cannot: ${C.CHANNEL_WORDS.noWhatsApp} Email cannot: ${C.CHANNEL_WORDS.noMailbox} ${C.CHANNEL_WORDS.noOffersByText} Say so, and what to set up first.`,
  },
  {
    name: "channels that name none is its own refusal",
    intent: offer({ channels: [] }),
    world: world(),
    refused: W.noChannelNamed,
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
    name: "the month's offer runs on another message: it is paused too, and the written message is sent (ruling 1)",
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
      noteStep(2),
      pauseStep(3),
      writtenSend(4, [1, 2, 3]),
    ],
    words: [PAUSES, REMINDS, REVIEW_FIRST, WRITES("WhatsApp and email"), NOTE, GOES],
  },
  {
    name: "a month's offer past its last day sends nothing however its state reads: it is not paused, nor said to be resumed (campaignEnded)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], playbooks: [monthsOffer({ until: "2026-10-10" })] }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [REMINDS, REUSED, NOTE, GOES],
  },
  {
    name: "a month's offer whose last day is still ahead runs until then: it is paused as any other",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], playbooks: [monthsOffer({ until: "2026-10-11" })] }),
    steps: [noteStep(1), pauseStep(2), firstSend(3, [1, 2])],
    words: [PAUSES, REMINDS, REUSED, NOTE, GOES],
  },
  {
    name: "an offer starting today, with less room than half its audience: a campaign capped at the open slots a day, from its Approve, ending with the offer (rulings 2, 3, 4)",
    intent: offer(TODAY),
    world: world({ messages: [monthsOfferMessage()], room: { open: 15, days: 14 } }),
    steps: [
      { ...TODAY_NOTE, n: 1 },
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
          params: PARAMS,
          cap_per_run: 2,
          name: `Offer: ${WORDS}`,
          channels: BOTH,
          until: "2026-11-15",
        },
      },
    ],
    words: [
      "The calendar has 15 open slots in the next 14 days for 40 people, so the offer goes as a campaign: up to 2 a day, each person once, until it ends, starting when you approve it.",
      REUSED,
      TODAY_SAYS,
    ],
  },
  {
    name: "the same tight room for an offer three weeks out: its broadcast, scheduled, to the whole list, and the words say pacing it instead is dismissing the send and asking again on its day (ruling 3)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], room: { open: 15, days: 14 } }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [
      "The calendar has 15 open slots in the next 14 days for 40 people, and the send goes to the whole list at once: to pace the offer to the room instead, dismiss the send and ask again on Nov 1.",
      REMINDS,
      REUSED,
      NOTE,
      GOES,
    ],
  },
  {
    name: "room for the whole audience twice over is no pacing; nor is a room not known (ruling 3)",
    intent: offer(TODAY),
    world: world({ messages: [monthsOfferMessage()], room: { open: 20, days: 14 } }),
    steps: [{ ...TODAY_NOTE, n: 1 }, atApprove(firstSend(2, [1]))],
    words: [
      REMINDS_OCT_30,
      REUSED,
      TODAY_SAYS,
      "The offer goes to “Can receive offers” when you approve it, as 10:00 AM today has passed.",
    ],
  },
  {
    name: "today, with ten o'clock past: the send goes at Approve, and the words say so (ruling 6)",
    intent: offer(TODAY),
    world: world({ messages: [monthsOfferMessage()], now: new Date("2026-10-11T16:00:00Z") }),
    steps: [{ ...TODAY_NOTE, n: 1 }, atApprove(firstSend(2, [1]))],
    words: [
      REMINDS_OCT_30,
      REUSED,
      TODAY_SAYS,
      "The offer goes to “Can receive offers” when you approve it, as 10:00 AM today has passed.",
    ],
  },
  {
    name: "a new WhatsApp version and a send under a day away: the send is approved once WhatsApp has reviewed it, as on any day (ruling 7)",
    intent: offer(TODAY),
    world: world({ now: new Date("2026-10-11T13:00:00Z") }),
    steps: [
      WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }),
      { ...TODAY_NOTE, n: 2 },
      writtenSend(3, [1, 2], { scheduled_for: "2026-10-11T14:00:00.000Z" }),
    ],
    words: [
      REMINDS_OCT_30,
      REVIEW_FIRST,
      WRITES("WhatsApp and email"),
      TODAY_SAYS,
      "The offer goes to “Can receive offers” on Oct 11 at 10:00 AM.",
    ],
  },
  {
    name: "the one message that fits waits on WhatsApp's review, and the broadcast ticks WhatsApp, which core refuses while it does: no twin is written, the offer goes by its email version, and the words say why (a send under a day away)",
    intent: offer(TODAY),
    world: world({ messages: [monthsOfferMessage({ versions: PENDING_WA })], now: new Date("2026-10-11T13:00:00Z") }),
    steps: [
      { ...TODAY_NOTE, n: 1 },
      firstSend(2, [1], { template_id: V(2), channels: ["email"], scheduled_for: "2026-10-11T14:00:00.000Z" }),
    ],
    words: [
      REVIEWING,
      REMINDS_OCT_30,
      REUSED,
      TODAY_SAYS,
      "The offer goes to “Can receive offers” on Oct 11 at 10:00 AM.",
    ],
  },
  {
    name: "a version in review is nothing to say where the offer goes without WhatsApp for its own reason: its email is what is sent",
    intent: offer(TODAY),
    world: world({
      channels: { whatsapp: NO_NUMBER, email: OPEN },
      messages: [monthsOfferMessage({ versions: PENDING_WA })],
      now: new Date("2026-10-11T13:00:00Z"),
    }),
    steps: [
      { ...TODAY_NOTE, n: 1 },
      firstSend(2, [1], { template_id: V(2), channels: ["email"], scheduled_for: "2026-10-11T14:00:00.000Z" }),
    ],
    words: [
      WITHOUT_WA,
      REMINDS_OCT_30,
      REUSED,
      TODAY_SAYS,
      "The offer goes to “Can receive offers” on Oct 11 at 10:00 AM.",
    ],
  },
  {
    name: "a version in review and a send more than a day away: the same, since the review holds the press, not the send's day",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage({ versions: PENDING_WA })] }),
    steps: [noteStep(1), firstSend(2, [1], { template_id: V(2), channels: ["email"] })],
    words: [REVIEWING, REMINDS, REUSED, NOTE, GOES],
  },
  {
    name: "the one message that fits in review, and WhatsApp the one channel that carries offers: refused, never a twin, to ask again once it is reviewed",
    intent: offer(),
    world: world({
      channels: { whatsapp: OPEN, email: NO_MAILBOX },
      messages: [monthsOfferMessage({ versions: PENDING_WA })],
    }),
    refused:
      "“this_months_offer”, the one message here that carries an offer, waits on WhatsApp's review of its WhatsApp version, and WhatsApp is the one channel this offer may go by: say so, and ask again once WhatsApp has reviewed it.",
  },
  {
    name: "the one message that fits in review, and WhatsApp asked for alone with email open: refused, saying WhatsApp is the one channel asked for and email can carry it, never that it is the one channel the offer may go by (fix round of batch P)",
    intent: offer({ channels: ["whatsapp"] }),
    world: world({ messages: [monthsOfferMessage({ versions: PENDING_WA })] }),
    refused:
      "“this_months_offer”, the one message here that carries an offer, waits on WhatsApp's review of its WhatsApp version, and WhatsApp is the one channel asked for: say so, and that email can carry it now (name it), or ask again once WhatsApp has reviewed it.",
  },
  {
    name: "the one message that fits in review has a WhatsApp version alone (an offer written while email was closed), and WhatsApp asked for alone with email open: refused, naming email to ask for, never leaving channels out, which would write a twin whose send waits on WhatsApp's review again (final cleanup)",
    intent: offer({ channels: ["whatsapp"] }),
    world: world({ messages: [writtenOffer({ versions: [{ channel: "whatsapp", id: V(21), state: "pending" }] })] }),
    refused:
      "“offer”, the one message here that carries an offer, waits on WhatsApp's review of its WhatsApp version, and WhatsApp is the one channel asked for: say so, and that email can carry it now (name it), or ask again once WhatsApp has reviewed it.",
  },
  {
    name: "a paced campaign by email too keeps a WhatsApp version in review: it is approved now, and whoever it reaches on WhatsApp waits for the review",
    intent: offer(TODAY),
    world: world({ messages: [monthsOfferMessage({ versions: PENDING_WA })], room: { open: 15, days: 14 } }),
    steps: [{ ...TODAY_NOTE, n: 1 }, pacedStep(2, [1], { template_id: V(1) })],
    words: [PACED, W.whatsappReview, REUSED, TODAY_SAYS],
  },
  {
    name: "a paced campaign by WhatsApp alone is held for the review as a broadcast is: on a version in review, refused",
    intent: offer(TODAY),
    world: world({
      channels: { whatsapp: OPEN, email: NO_MAILBOX },
      messages: [monthsOfferMessage({ versions: PENDING_WA })],
      room: { open: 15, days: 14 },
    }),
    refused:
      "“this_months_offer”, the one message here that carries an offer, waits on WhatsApp's review of its WhatsApp version, and WhatsApp is the one channel this offer may go by: say so, and ask again once WhatsApp has reviewed it.",
  },
  {
    name: "a paced campaign by WhatsApp alone on the message the plan writes: approved once WhatsApp has reviewed it",
    intent: offer(TODAY),
    world: world({ channels: { whatsapp: OPEN, email: NO_MAILBOX }, room: { open: 15, days: 14 } }),
    steps: [
      WRITTEN({ whatsapp: { body: WA_BODY } }),
      { ...TODAY_NOTE, n: 2 },
      pacedStep(3, [1, 2], { template_id: stepToken(1), channels: ["whatsapp"] }),
    ],
    words: [WITHOUT_EMAIL, PACED, REVIEW_FIRST, WRITES("WhatsApp"), TODAY_SAYS],
  },
  {
    name: "the receptionist already has the offer's note with the same end: no note step",
    intent: offer(),
    world: world({
      messages: [monthsOfferMessage()],
      notes: [{ title: `Offer: ${WORDS}`, text: "Anything.", until: "2026-11-30" }],
    }),
    steps: [firstSend(1, [])],
    words: [W.noteKnown, REMINDS, REUSED, GOES],
  },
  {
    name: "the journey unread: an offer is planned all the same, with no reminder said, since who has booked cannot be told (fix round 1)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], journey: null }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [REUSED, NOTE, GOES],
  },
  {
    name: "asked by a member who may not approve a note for the receptionist: no note step, the steps renumbered, and the words say the receptionist is not told until an owner or a partner adds it (pre-review ruling 1)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], playbooks: [monthsOffer()], canNote: false }),
    steps: [pauseStep(1), firstSend(2, [1])],
    words: [W.noteLeftOut, PAUSES, REMINDS, REUSED, GOES],
  },
  {
    name: "and one written message's token still names step 1 with the note left out",
    intent: offer(),
    world: world({ canNote: false }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }), writtenSend(2, [1])],
    words: [W.noteLeftOut, REMINDS, REVIEW_FIRST, WRITES("WhatsApp and email"), GOES],
  },
  {
    name: "an offer that ends before its twentieth day: the reminder is asked for on its last day (ruling 1)",
    intent: offer({ until: "2026-11-07" }),
    world: world({ messages: [monthsOfferMessage()] }),
    steps: [noteStep(1, "Nov 1", "Nov 7", "2026-11-07"), firstSend(2, [1])],
    words: [
      W.reminderAsk("Nov 7", "Can receive offers"),
      REUSED,
      "Tells the receptionist about the offer, until Nov 7.",
      GOES,
    ],
  },
  {
    name: "a one-day offer has no day left to ask for a reminder (ruling 1)",
    intent: offer({ until: "2026-11-01" }),
    world: world({ messages: [monthsOfferMessage()] }),
    steps: [noteStep(1, "Nov 1", "Nov 1", "2026-11-01"), firstSend(2, [1])],
    words: [REUSED, "Tells the receptionist about the offer, until Nov 1.", GOES],
  },
  {
    name: "with no calendar, who has booked cannot be told: no reminder is said (ruling 1)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], journey: [{ id: "quiet", covered: false, moment: "quiet_30" }] }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [REUSED, NOTE, GOES],
  },
  {
    name: "the owner's phrasing is what the message says, a list of theirs is the audience, and the reminder names it",
    intent: offer({ who: `list:${OWN}`, service: "any service" }, "A tenth off anything you book in November"),
    world: world({
      messages: [monthsOfferMessage()],
      lists: [offersList(), { token: `list:${OWN}`, name: "Regulars", count: 30 }],
    }),
    steps: [
      {
        ...noteStep(1),
        input: {
          change: {
            op: "add_note",
            title: `Offer: ${WORDS}`,
            text: "The offer: A tenth off anything you book in November. It runs from Nov 1 to Nov 30. It is for any service.",
            until: "2026-11-30",
          },
        },
      },
      firstSend(2, [1], {
        audience_kind: "saved",
        audience_id: OWN,
        params: ["@first_name", "@business_name", "A tenth off anything you book in November.", "@booking_link"],
      }),
    ],
    words: [W.reminderAsk("Nov 20", "Regulars"), REUSED, NOTE, "The offer goes to “Regulars” on Nov 1 at 10:00 AM."],
  },
  {
    name: "a US number, the month's offer running and a tight room for a later offer: what no card carries first (the channel left out, the pause to resume, the room, the reminder), then the message, the note and the send's day (fix round of batch P)",
    intent: offer(),
    world: world({
      channels: { whatsapp: { ok: false, why: US_PAUSED }, email: OPEN },
      messages: [monthsOfferMessage()],
      playbooks: [monthsOffer()],
      room: { open: 15, days: 14 },
    }),
    steps: [noteStep(1), pauseStep(2), firstSend(3, [1, 2], { template_id: V(2), channels: ["email"] })],
    words: [WITHOUT_WA_US, PAUSES, ROOM_TIGHT, REMINDS, REUSED, NOTE, GOES],
    pastTheCap: true,
  },
  {
    name: "an operator, email not set up, a new WhatsApp message, the month's offer running and a tight later room: the note left out, the pause, the room and the reminder, then the review the send's card says, the message written and the send's day",
    intent: offer(),
    world: world({
      channels: { whatsapp: OPEN, email: NO_MAILBOX },
      playbooks: [monthsOffer()],
      room: { open: 15, days: 14 },
      canNote: false,
    }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY } }), pauseStep(2), writtenSend(3, [1, 2], { channels: ["whatsapp"] })],
    words: [WITHOUT_EMAIL, W.noteLeftOut, PAUSES, ROOM_TIGHT, REMINDS, REVIEW_FIRST, WRITES("WhatsApp"), GOES],
    pastTheCap: true,
  },
  {
    name: "the same operator's world with the month's offer under a long name: the reminder still whole, since WhatsApp's review of the send, which its card says (plan-steps.ts reviewedStep), comes after it (final cleanup)",
    intent: offer(),
    world: world({
      channels: { whatsapp: OPEN, email: NO_MAILBOX },
      playbooks: [monthsOffer({ name: LONG_MONTHS_OFFER })],
      room: { open: 15, days: 14 },
      canNote: false,
    }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY } }), pauseStep(2), writtenSend(3, [1, 2], { channels: ["whatsapp"] })],
    words: [
      WITHOUT_EMAIL,
      W.noteLeftOut,
      W.monthsOfferPaused(LONG_MONTHS_OFFER, "Nov 30"),
      ROOM_TIGHT,
      REMINDS,
      REVIEW_FIRST,
      WRITES("WhatsApp"),
      GOES,
    ],
    pastTheCap: true,
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
    name: "the day after sends the review ask the Library holds where the Google listing keeps a review link (ruling 9)",
    intent: { intent: "cover_journey" },
    world: world({ messages: [reviewAsk()], reviewLink: true }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visit_tomorrow" } },
      { n: 2, kind: "playbook", silent: false, after: [], input: { trigger: "visited", template_id: V(7) } },
      { n: 3, kind: "playbook", silent: false, after: [], input: { trigger: "lapsed" } },
    ],
    words: ["Starts 3 campaigns, one on each moment not covered yet, each its own card."],
  },
  {
    name: "a review link and nothing held: the day after names the review starter, which its Approve files",
    intent: { intent: "cover_journey", stages: ["after"] },
    world: world({ reviewLink: true }),
    steps: [AFTER({ starter: "after_visit_review" })],
    words: [COVERS_ONE],
  },
  {
    name: "a review link and only the check held: the day after still names the review starter, never the check that asks no review",
    intent: { intent: "cover_journey", stages: ["after"] },
    world: world({ reviewLink: true, messages: [checkAsk()] }),
    steps: [AFTER({ starter: "after_visit_review" })],
    words: [COVERS_ONE],
  },
  {
    name: "no review link: a review ask the Library holds is never sent, whose link would fill from nothing; the day after names the check",
    intent: { intent: "cover_journey", stages: ["after"] },
    world: world({ messages: [reviewAsk()] }),
    steps: [AFTER({ starter: "after_visit_check" })],
    words: [COVERS_ONE],
  },
  {
    name: "no review link and nothing held: the day after goes by the moment's own starter, as the action takes it",
    intent: { intent: "cover_journey", stages: ["after"] },
    world: world(),
    steps: [AFTER({})],
    words: [COVERS_ONE],
  },
  {
    name: "the review ask by a version it can go by: not WhatsApp's where WhatsApp sends nothing, nor one WhatsApp refused",
    intent: { intent: "cover_journey", stages: ["after"] },
    world: world({
      channels: { whatsapp: NO_NUMBER, email: OPEN },
      whatsappSends: false,
      reviewLink: true,
      messages: [reviewAsk()],
    }),
    steps: [AFTER({ template_id: V(8) })],
    words: [COVERS_ONE],
  },
  {
    name: "a US number with offers paused still sends a message about their own appointment: the review ask keeps its WhatsApp version",
    intent: { intent: "cover_journey", stages: ["after"] },
    world: world({
      channels: { whatsapp: { ok: false, why: US_PAUSED }, email: OPEN },
      whatsappSends: true,
      reviewLink: true,
      messages: [reviewAsk()],
    }),
    steps: [AFTER({ template_id: V(7) })],
    words: [COVERS_ONE],
  },
  {
    name: "a review ask's WhatsApp version that WhatsApp refused is not picked: its email version is",
    intent: { intent: "cover_journey", stages: ["after"] },
    world: world({
      reviewLink: true,
      messages: [
        reviewAsk({
          versions: [
            { channel: "whatsapp", id: V(7), state: "rejected" },
            { channel: "email", id: V(8), state: "approved" },
          ],
        }),
      ],
    }),
    steps: [{ n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visited", template_id: V(8) } }],
    words: ["Starts 1 campaign, one on each moment not covered yet, each its own card."],
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

/** The review ask as the Library reads it: WhatsApp's version and email's, approved. */
function reviewAsk(over = {}) {
  return {
    name: "after_visit_review",
    language: "en_US",
    category: "utility",
    versions: [
      { channel: "email", id: V(8), state: "approved" },
      { channel: "whatsapp", id: V(7), state: "approved" },
    ],
    slots: [],
    used_by: [],
    ...over,
  };
}

/** The day after's check, which asks how it went and no review, as the Library reads it. */
function checkAsk() {
  return reviewAsk({
    name: "after_visit_check",
    versions: [
      { channel: "email", id: V(9), state: "approved" },
      { channel: "whatsapp", id: V(10), state: "approved" },
    ],
  });
}

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

test("what no card carries comes first, so the answer's detail, cut at its own 700 characters, keeps the reminder whole, and the review after it: the worlds measured past the cap (batch P's reviews and the final cleanup)", () => {
  const cap = C.ASK_ANSWER_CAPS.detail;
  const both = world({ playbooks: [monthsOffer()], room: { open: 15, days: 14 } });
  const worlds = [
    ...ROWS.filter((r) => r.pastTheCap).map((r) => [r.name, r.intent, r.world]),
    ["both channels open, a new message, the month's offer running and a tight later room", offer(), both],
  ];
  assert.equal(worlds.length, 4);
  for (const [name, intent, w] of worlds) {
    const out = planOf(intent, w);
    assert.ok("words" in out, `${name}: planned`);
    const detail = C.clip(out.words, cap);
    assert.ok(out.words.length > cap, `${name}: past the cap (${out.words.length}), so the cut is what is proved`);
    assert.ok(detail.includes(REMINDS), `${name}: the reminder whole in ${detail}`);
    // WhatsApp's review of a send it holds is said on the send's card too (plan-steps.ts reviewedStep), so it comes after
    // the reminder, and a cut takes it before anything no card says.
    if (out.words.includes(REVIEW_FIRST))
      assert.ok(out.words.indexOf(REVIEW_FIRST) > out.words.indexOf(REMINDS), `${name}: the review after the reminder`);
    if (out.words.includes(PAUSES)) assert.ok(detail.includes(PAUSES), `${name}: the pause to resume whole`);
  }
});

test("the review refusal's advice holds whichever versions the message in review has: email named, the offer goes by email now; channels left out, a message with WhatsApp's version alone is twinned and the send waits on WhatsApp's review again (final cleanup)", () => {
  const waOnly = writtenOffer({ versions: [{ channel: "whatsapp", id: V(21), state: "pending" }] });
  for (const [what, message] of [
    ["both versions", monthsOfferMessage({ versions: PENDING_WA })],
    ["WhatsApp's alone", waOnly],
  ]) {
    const out = planOf(offer({ channels: ["email"] }), world({ messages: [message] }));
    assert.ok("steps" in out, `${what}: ${JSON.stringify(out)}`);
    const send = out.steps.at(-1);
    assert.deepEqual([send.kind, send.input.channels], ["broadcast", ["email"]], what);
    assert.ok(!out.words.includes(REVIEW_FIRST) && !out.words.includes(W.whatsappReview), `${what}: ${out.words}`);
  }
  const left = planOf(offer(), world({ messages: [waOnly] }));
  assert.ok("steps" in left && left.words.includes(REVIEW_FIRST), JSON.stringify(left));
});

test("the refusals and the words the brief names are words, and the pace is the open slots a day", () => {
  for (const k of ["fromAfterUntil", "fromPast", "noChannelNamed", "noOffersList"])
    assert.equal(typeof W[k], "string", k);
  assert.equal(typeof W.noChannel([], []), "string", "noChannel says the channels it is given");
  assert.match(W.paced({ open: 15, days: 14 }, 40), /15 open slots in the next 14 days for 40 people.*up to 2 a day/);
  assert.match(W.paced({ open: 9, days: 1 }, 40), /9 open slots in the next 1 day for 40 people.*up to 9 a day/);
  assert.match(W.paced({ open: 0, days: 14 }, 3), /no open slot in the next 14 days for 3 people.*up to 1 a day/);
  // A tight room for a later offer: the send reaches the whole list on its day, so pacing it is dismissing the send.
  assert.equal(
    W.roomTight({ open: 1, days: 14 }, 40, "Nov 1"),
    "The calendar has 1 open slot in the next 14 days for 40 people, and the send goes to the whole list at once: to pace the offer to the room instead, dismiss the send and ask again on Nov 1.",
  );
  // A send its review holds says so whenever it goes; the paced campaign by email too says its WhatsApp people wait.
  assert.equal(W.reviewFirst, REVIEW_FIRST);
  assert.notEqual(W.reviewFirst, W.whatsappReview);
  // The channels' own reasons are said, never a sentence of the plan's about a missing number.
  for (const r of ROWS.filter((x) => !x.refused))
    assert.ok(!planOf(r.intent, r.world).words.includes("no WhatsApp number is connected"), r.name);
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

/* ---- every step's input is its action's input, and every written message the door's ---- */

const tool = async (rel, name) => (await import(at(`apps/dashboard/src/server/ask/tools/act/${rel}`)))[name];
const campaignTool = await tool("campaign.ts", "propose_campaign");
const settingsTool = await tool("settings.ts", "propose_settings");
/** An action of a tool by its name: propose_campaign's own, or "" for a tool that is one action. */
const action = (t, name) => {
  const def = t.actions[name];
  assert.ok(def, `${t.name} has the action ${name || "(its own)"}`);
  return def;
};
const SCHEMAS = {
  message: action(campaignTool, "message").input,
  note: action(settingsTool, "").input,
  broadcast: action(campaignTool, "broadcast").input,
  playbook: action(campaignTool, "playbook").input,
  change: action(campaignTool, "change").input,
};
const { checkMessage } = await import(at("apps/dashboard/src/server/campaigns/write-message.ts"));
const { slotExample } = await import(at("apps/dashboard/src/server/ask/tools/act/says.ts"));

/** A written message as the message card files it (act/message.ts proposeMessage), held to the door's own checks. */
function doorTakes(step, label) {
  assert.equal(step.kind, "message", label);
  const body = {
    name: C.slugTemplateName(step.input.name),
    language: C.messageLanguageCode(step.input.language),
    category: step.input.category,
    versions: step.input.versions,
    slots: step.input.slots.map((x) => ({ ...x, example: slotExample(x) })),
  };
  assert.doesNotThrow(() => checkMessage(body), label);
  if (body.versions.whatsapp) {
    const draft = C.validateTemplateDraft({
      name: body.name,
      language: body.language,
      category: body.category,
      body: body.versions.whatsapp.body,
      examples: body.slots.map((x) => x.example),
    });
    assert.ok(draft.ok && draft.warnings.length === 0, `${label}: ${JSON.stringify(draft)}`);
  }
}

test("every step's input is the input of the Ask action it is expanded through", () => {
  const seen = new Set();
  for (const row of ROWS.filter((r) => !r.refused)) {
    const out = planOf(row.intent, row.world);
    for (const s of out.steps) {
      seen.add(s.kind);
      // Every key its own, `until` on a new campaign among them (Task 17).
      const parsed = SCHEMAS[s.kind].strict().safeParse(s.input);
      assert.ok(parsed.success, `${row.name}, step ${s.n} (${s.kind}): ${JSON.stringify(parsed.error?.issues)}`);
      if (s.kind === "note") assert.ok(C.AskSettingsChangeSchema.safeParse(s.input.change).success, row.name);
      if (s.kind === "message") doorTakes(s, row.name);
    }
  }
  assert.deepEqual([...seen].sort(), ["broadcast", "change", "message", "note", "playbook"]);
});

test("the Spanish message is written in Spanish, the starter's Spanish values, the offer typed into its own", () => {
  const out = planOf(offer({}, "10% de descuento en todo noviembre"), world({ language: "es" }));
  const [message, , first] = out.steps;
  doorTakes(message, "the Spanish message");
  assert.equal(message.input.language, "es");
  assert.deepEqual(message.input.versions, {
    whatsapp: {
      body: "Hola {{1}}, una oferta de {{2}}: {{3}} Reserva aquí: {{4}} o responde con el día que mejor te venga.\n\nResponde STOP para darte de baja",
    },
    email: {
      subject: "Una oferta de {{2}}",
      body: "Hola {{1}}:\n\nUna oferta de {{2}}: {{3}}\n\nReserva aquí: {{4}}, o responde con el día que mejor te venga.",
    },
  });
  assert.deepEqual(
    message.input.slots.map((s) => [s.label, s.kind]),
    [
      ["Nombre", "first_name"],
      ["Nombre del negocio", "business_name"],
      ["La oferta", "text"],
      ["Enlace de reservas", "booking_link"],
    ],
  );
  assert.deepEqual(first.input.params, [
    "@first_name",
    "@business_name",
    "10% de descuento en todo noviembre.",
    "@booking_link",
  ]);
  // An English message's offer value is not the Spanish one's: an English offer message is not reused in Spanish.
  const english = planOf(offer(), world({ language: "es", messages: [writtenOffer({ language: "es" })] }));
  assert.equal(english.steps[0].kind, "message", "written in Spanish, not the English-labelled one sent");
  // Written under the next free name, and held to the door's checks as every written message is (carry-forward c).
  assert.equal(english.steps[0].input.name, "offer_2");
  doorTakes(english.steps[0], "the Spanish offer_2");
});

test("a name the Library holds is not written twice", () => {
  const out = planOf(offer(), world({ messages: [{ ...monthsOfferMessage(), name: "offer", slots: [] }] }));
  const [message] = out.steps;
  assert.equal(message.input.name, "offer_2");
  doorTakes(message, "offer_2");
});

/** A message a plan wrote, as campaigns with action messages reads it once filed: English under en_US, WhatsApp in review. */
const filed = (step) => ({
  name: step.input.name,
  language: C.messageLanguageCode(step.input.language),
  category: step.input.category,
  versions: [
    { channel: "whatsapp", id: V(5), state: "pending" },
    { channel: "email", id: V(6), state: "approved" },
  ],
  slots: step.input.slots,
  used_by: [],
});

test("the message one plan writes is the message the next plan sends, with that offer's own words, by email while WhatsApp still reviews its WhatsApp version, never a twin (ruling 1 of the pre-review)", () => {
  const first = planOf(offer(), world({ messages: [quickNote()] }));
  const [written] = first.steps;
  doorTakes(written, "the first plan's message");
  const weekend = "20% off every booking this weekend";
  const next = planOf(
    offer({ words: weekend, from: "2026-10-17", until: "2026-10-18" }),
    world({ messages: [quickNote(), filed(written)] }),
  );
  assert.deepEqual(shape(next.steps), [
    {
      n: 1,
      kind: "note",
      silent: true,
      after: [],
      input: {
        change: {
          op: "add_note",
          title: `Offer: ${weekend}`,
          text: `The offer: ${weekend}. It runs from Oct 17 to Oct 18.`,
          until: "2026-10-18",
        },
      },
    },
    {
      n: 2,
      kind: "broadcast",
      silent: false,
      after: [1],
      input: {
        // Its email version: the broadcast ticks WhatsApp only once WhatsApp has reviewed its WhatsApp one.
        template_id: V(6),
        audience_kind: "list",
        audience_id: "offers_ok",
        params: ["@first_name", "@business_name", `${weekend}.`, "@booking_link"],
        scheduled_for: "2026-10-17T14:00:00.000Z",
        name: `Offer: ${weekend}`,
        channels: ["email"],
      },
    },
  ]);
  assert.equal(
    next.words,
    [
      "It goes without WhatsApp: WhatsApp is still reviewing the WhatsApp version of “offer”.",
      W.reminderAsk("Oct 18", "Can receive offers"),
      "Sends “offer”, already in the Library, with the offer in its words.",
      "Tells the receptionist about the offer, until Oct 18.",
      "The offer goes to “Can receive offers” on Oct 17 at 10:00 AM.",
    ].join(" "),
  );
  // In Spanish too: the Spanish message a plan writes is the one the next Spanish plan sends.
  const es = planOf(offer({}, "10% de descuento"), world({ language: "es" }));
  const [esWritten] = es.steps;
  doorTakes(esWritten, "the first Spanish plan's message");
  const again = planOf(offer({ words: "Fin de semana" }), world({ language: "es", messages: [filed(esWritten)] }));
  assert.equal(again.steps.filter((s) => s.kind === "message").length, 0, "reused, not written again");
});
