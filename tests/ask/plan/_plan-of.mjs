/**
 * The world of plan-of.test.mjs: the workspaces (PlanWorld) its plans are made over. Split from plan-of.test.mjs on 25
 * Nov 2026 (layer 14: a test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
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
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// Read as a module, so a name contracts does not export yet is a failing assertion, not a file that will not load.
export const C = await import("@chanlytics/contracts");

export const { PLAN_WORDS: W, planOf, resolveSteps, stepToken, STEP_TOKEN } = C;

/** What an offer's plan says to the person, in English (a Spanish question's words are its own rows). */
export const EN = C.OFFER_PLAN_WORDS.en;

export const TZ = "America/New_York";

/** Sunday 11 Oct 2026, 10:00 AM in New York. */
export const NOW = new Date("2026-10-11T14:00:00Z");

export const OFFERS = "seg:offers_ok";

export const V = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;

export const PB = "88888888-8888-4888-8888-888888888888";

export const OWN = "99999999-9999-4999-8999-999999999999";

export const WORDS = "10% off every service all November";

/** What fills the offer's value: the owner's words, as a sentence. */
export const LINE = "10% off every service all November.";

/** Ten o'clock on 1 Nov 2026 in New York: standard time from that morning, five hours behind UTC. */
export const FIRST_AT = "2026-11-01T15:00:00.000Z";

/** The built-in offers list as People's lists read it: its token, its name, and who is on it. */
export const offersList = (count = 40) => ({ token: OFFERS, name: "Can receive offers", count });

/** The offer message's values: the month's offer starter's, the offer the one typed. */
export const OFFER_SLOTS = [
  { position: 1, label: "First name", kind: "first_name" },
  { position: 2, label: "Business name", kind: "business_name" },
  { position: 3, label: "The offer", kind: "text" },
  { position: 4, label: "Booking link", kind: "booking_link" },
];

/** The month's offer starter as campaigns with action messages reads it: both versions approved, the offer its third value. */
export const monthsOfferMessage = (over = {}) => ({
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
export const quickNote = () =>
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
export const writtenOffer = (over = {}) =>
  monthsOfferMessage({
    name: "offer",
    versions: [
      { channel: "whatsapp", id: V(21), state: "approved" },
      { channel: "email", id: V(22), state: "approved" },
    ],
    ...over,
  });

/** The journey of a workspace with a calendar and no deals: first contact the receptionist's, nothing else covered. */
export const JOURNEY = [
  { id: "first_contact", covered: true, moment: null },
  { id: "before", covered: false, moment: "visit_tomorrow" },
  { id: "after", covered: false, moment: "visited" },
  { id: "quiet", covered: false, moment: "lapsed" },
];

/** A channel an offer may go by, as channelChoices answers it. */
export const OPEN = { ok: true, why: null };

/** WhatsApp's pause on offers to US numbers, in its own words (the channels' reader passes the number). */
export const US_PAUSED = C.whatsappOffersOpen("+12125550123").why;

/** No WhatsApp number: channelChoices' reason, the readiness's own. */
export const NO_NUMBER = { ok: false, why: C.CHANNEL_WORDS.noWhatsApp };

export const NO_MAILBOX = { ok: false, why: C.CHANNEL_WORDS.noMailbox };

/** A setup's one campaign on the day after, its input the moment and `over` (its message or the starter it names). */
export const AFTER = (over) => ({
  n: 1,
  kind: "playbook",
  silent: false,
  after: [],
  input: { trigger: "visited", ...over },
});

export const COVERS_ONE = "Starts 1 campaign now: a follow-up the day after a booked time.";

/** How a workspace with a calendar's feed and no deal on file works, as GET playbooks says it. */
export const SHAPE = { calendar: "feed", hasDeals: false, word: "appointment" };

/** The same with no calendar connected: an appointment's two moments wait for one. */
export const NO_CALENDAR = { ...SHAPE, calendar: "none" };

/** The journey such a workspace runs: first contact the receptionist's, and the win-back by silence. */
export const QUIET_ONLY = [
  { id: "first_contact", covered: true, moment: null },
  { id: "quiet", covered: false, moment: "quiet_30" },
];

/** What a setup with no calendar says first. */
export const CONNECT = (each = "appointment", gets = "a reminder the day before and a follow-up the day after") =>
  `First, connect your calendar under Settings › Hours & booking, so each ${each} gets ${gets}.`;

export const WIN_BACK = "Starts 1 campaign now: a win-back once they go quiet.";

/** The answer a setup with no calendar leads with. */
export const CALENDAR_LEAD = (now, more) => ({
  headline: `Connect your calendar first: ${now} campaign${now === 1 ? "" : "s"} can start now, ${more} more once it is connected.`,
  open: { to: "admin/workspace/calendar", label: "Connect a calendar" },
  next: ["How do I connect my calendar in Settings?"],
});

/** A workspace that can send offers on WhatsApp and by email, with a calendar, and nothing in its Library yet. */
export const world = (over = {}) => ({
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
  says: "en",
  shape: SHAPE,
  reach: {},
  ...over,
});

export const offer = (over = {}, say) => ({
  intent: "offer",
  offer: { words: WORDS, from: "2026-11-01", until: "2026-11-30", ...over },
  ...(say ? { say } : {}),
});

export const monthsOffer = (over = {}) => ({
  id: PB,
  name: "This month's offer",
  trigger: "everyone_monthly",
  state: "running",
  template_name: "this_months_offer",
  until: null,
  ...over,
});

/** The steps as the rows compare them: everything but each one's why, which is held apart (every step has one). */
export const shape = (steps) => steps.map(({ n, kind, silent, input, after }) => ({ n, kind, silent, input, after }));

/** The values a send fills an offer message with: per person, and the owner's words typed into the offer's. */
export const PARAMS = ["@first_name", "@business_name", LINE, "@booking_link"];

export const BOTH = ["whatsapp", "email"];

/** The message a plan writes, in English: the offer is its typed value, never words of its own body. */
export const WRITTEN = (versions) => ({
  n: 1,
  kind: "message",
  silent: true,
  after: [],
  input: { name: "offer", language: "en", category: "marketing", versions, slots: OFFER_SLOTS },
});

/** Words that fit any dated offer: no "this month". */
export const WA_BODY =
  "Hi {{1}}, an offer from {{2}}: {{3}} Book here: {{4}} or reply with a day that suits you.\n\nReply STOP to opt out";

export const EMAIL = {
  subject: "An offer from {{2}}",
  body: "Hi {{1}},\n\nAn offer from {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you.",
};

export const noteStep = (n, from = "Nov 1", until = "Nov 30", day = "2026-11-30") => ({
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

export const pauseStep = (n) => ({
  n,
  kind: "change",
  silent: true,
  after: [],
  input: { playbook_id: PB, state: "paused" },
});

export const firstSend = (n, after, over = {}) => ({
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
export const writtenSend = (n, after, over = {}) => firstSend(n, after, { template_id: stepToken(1), ...over });

/** A send whose ten o'clock has passed today: no time, it goes at Approve. */
export const atApprove = (step) => {
  const { scheduled_for: _past, ...input } = step.input;
  return { ...step, input };
};

export const REUSED = "Sends “this_months_offer”, already in your messages, with the offer in its words.";

export const WRITES = (on) =>
  `Writes a message for offers, “offer”, for ${on}: this offer goes in its words, and the next offer can send it too.`;

export const NOTE = "Tells AI about the offer, until Nov 30.";

/** The pause is a silent step: it applies at the plan's Approve (Task 15, carry-forward b). */
export const PAUSES =
  "Pauses the month's offer, “This month's offer”, from when you approve it, so nobody gets two offers · resume it after Nov 30.";

export const GOES = "The offer goes to “Can receive offers” on Nov 1 at 10:00 AM.";

/** The reminder, its own question on its day: whole, and short enough to fit the answer before what the cards show. */
export const REMINDS =
  "On Nov 20, ask me to send a reminder to whoever on “Can receive offers” has not booked by then.";

/**
 * A send on a WhatsApp version WhatsApp is still checking, a one-off or a campaign: approved now, its WhatsApp people
 * waiting for the check (the clean list, 16 Nov 2026). It said "The send can be approved once WhatsApp has reviewed its
 * WhatsApp version", and the plan's press stopped short of it.
 */
export const WAITS_CHECK = EN.whatsappReview;

/** Each channel left out, with channelChoices' reason, never one the product wrote for it. */
export const WITHOUT_WA = `It goes without WhatsApp: ${C.CHANNEL_WORDS.noWhatsApp}`;

export const WITHOUT_WA_US = `It goes without WhatsApp: ${US_PAUSED}`;

export const WITHOUT_EMAIL = `It goes without email: ${C.CHANNEL_WORDS.noMailbox}`;

/** A today's offer: from Sunday 11 Oct to 15 Nov. */
export const TODAY = { from: "2026-10-11", until: "2026-11-15" };

/** The month's offer starter with its WhatsApp version still in WhatsApp's review, its email one approved. */
export const PENDING_WA = [
  { channel: "whatsapp", id: V(1), state: "pending" },
  { channel: "email", id: V(2), state: "approved" },
];

/** Today's offer paced to 15 open slots in 14 days for 40 people: a campaign, two a day, ending with it. */
export const PACED =
  "The calendar has 15 open slots in the next 14 days for 40 people, so the offer goes as a campaign: up to 2 a day, each person once, until it ends, starting when you approve it.";

export const pacedStep = (n, after, over = {}) => ({
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
export const ROOM_TIGHT =
  "The calendar has 15 open slots in the next 14 days for 40 people, and the send goes to the whole list at once. To pace it to the room, dismiss it and ask again on Nov 1.";

export const TODAY_NOTE = noteStep(0, "Oct 11", "Nov 15", "2026-11-15");

export const TODAY_SAYS = "Tells AI about the offer, until Nov 15.";

export const REMINDS_OCT_30 = EN.reminderAsk("Oct 30", "Can receive offers");

/**
 * A month's offer named near its 80 characters: in the operator's world below, the reminder would end past the answer's
 * 700 characters were WhatsApp's review of the send said before it.
 */
export const LONG_MONTHS_OFFER = "This month's offer, for every regular and every newer client, all autumn long";

/** The rows: an intent, a world, and the steps and words it plans, or its refusal. */
export const ROWS = [
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
    words: [REMINDS, WAITS_CHECK, WRITES("WhatsApp and email"), NOTE, GOES],
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
    words: [WITHOUT_EMAIL, REMINDS, WAITS_CHECK, WRITES("WhatsApp"), NOTE, GOES],
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
    words: [REMINDS, WAITS_CHECK, WRITES("WhatsApp and email"), NOTE, GOES],
  },
  {
    name: "a text asked for is dropped, since texts carry no offers",
    intent: offer({ channels: ["whatsapp", "sms"] }),
    world: world({ messages: [monthsOfferMessage()] }),
    steps: [noteStep(1), firstSend(2, [1], { channels: ["whatsapp"] })],
    words: [EN.noText, REMINDS, REUSED, NOTE, GOES],
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
    words: [REMINDS, WAITS_CHECK, WRITES("WhatsApp and email"), NOTE, GOES],
  },
  {
    name: "a quick note is not an offer message: the plan's own is sent, the quick note never (ruling 2)",
    intent: offer(),
    world: world({ messages: [quickNote(), writtenOffer()] }),
    steps: [noteStep(1), firstSend(2, [1], { template_id: V(21) })],
    words: [REMINDS, "Sends “offer”, already in your messages, with the offer in its words.", NOTE, GOES],
  },
  {
    name: "with only a quick note in the Library, an offer message is written (ruling 2)",
    intent: offer(),
    world: world({ messages: [quickNote()] }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }), noteStep(2), writtenSend(3, [1, 2])],
    words: [REMINDS, WAITS_CHECK, WRITES("WhatsApp and email"), NOTE, GOES],
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
    words: [PAUSES, REMINDS, WAITS_CHECK, WRITES("WhatsApp and email"), NOTE, GOES],
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
      "The calendar has 15 open slots in the next 14 days for 40 people, and the send goes to the whole list at once. To pace it to the room, dismiss it and ask again on Nov 1.",
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
      WAITS_CHECK,
      WRITES("WhatsApp and email"),
      TODAY_SAYS,
      "The offer goes to “Can receive offers” on Oct 11 at 10:00 AM.",
    ],
  },
  {
    name: "the one message that fits is being checked by WhatsApp, and the broadcast ticks WhatsApp: it is reused, never twinned, the send keeps WhatsApp, and its WhatsApp people wait for the check, as New's send does (a send under a day away; it went by email alone, or was refused, until 16 Nov 2026)",
    intent: offer(TODAY),
    world: world({ messages: [monthsOfferMessage({ versions: PENDING_WA })], now: new Date("2026-10-11T13:00:00Z") }),
    steps: [{ ...TODAY_NOTE, n: 1 }, firstSend(2, [1], { scheduled_for: "2026-10-11T14:00:00.000Z" })],
    words: [
      REMINDS_OCT_30,
      WAITS_CHECK,
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
    name: "a version being checked and a send more than a day away: the same",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage({ versions: PENDING_WA })] }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [REMINDS, WAITS_CHECK, REUSED, NOTE, GOES],
  },
  {
    name: "the one message that fits being checked, and WhatsApp the one channel that carries offers: the send goes on it by WhatsApp and waits for the check, never a twin and never a refusal",
    intent: offer(),
    world: world({
      channels: { whatsapp: OPEN, email: NO_MAILBOX },
      messages: [monthsOfferMessage({ versions: PENDING_WA })],
    }),
    steps: [noteStep(1), firstSend(2, [1], { channels: ["whatsapp"] })],
    words: [WITHOUT_EMAIL, REMINDS, WAITS_CHECK, REUSED, NOTE, GOES],
  },
  {
    name: "the one message that fits being checked, and WhatsApp asked for alone with email open: the send goes by WhatsApp alone, as asked, and waits for the check",
    intent: offer({ channels: ["whatsapp"] }),
    world: world({ messages: [monthsOfferMessage({ versions: PENDING_WA })] }),
    steps: [noteStep(1), firstSend(2, [1], { channels: ["whatsapp"] })],
    words: [REMINDS, WAITS_CHECK, REUSED, NOTE, GOES],
  },
  {
    name: "the one message that fits being checked has a WhatsApp version alone (an offer written while email was closed), and WhatsApp asked for alone: the send goes on it and waits for the check, never a twin",
    intent: offer({ channels: ["whatsapp"] }),
    world: world({ messages: [writtenOffer({ versions: [{ channel: "whatsapp", id: V(21), state: "pending" }] })] }),
    steps: [noteStep(1), firstSend(2, [1], { template_id: V(21), channels: ["whatsapp"] })],
    words: [REMINDS, WAITS_CHECK, EN.reuseMessage("offer"), NOTE, GOES],
  },
  {
    name: "a paced campaign by email too keeps a WhatsApp version in review: it is approved now, and whoever it reaches on WhatsApp waits for the review",
    intent: offer(TODAY),
    world: world({ messages: [monthsOfferMessage({ versions: PENDING_WA })], room: { open: 15, days: 14 } }),
    steps: [{ ...TODAY_NOTE, n: 1 }, pacedStep(2, [1], { template_id: V(1) })],
    words: [PACED, EN.whatsappReview, REUSED, TODAY_SAYS],
  },
  {
    name: "a paced campaign by WhatsApp alone on a version being checked: approved now, as a campaign New makes on it is, its people waiting for the check",
    intent: offer(TODAY),
    world: world({
      channels: { whatsapp: OPEN, email: NO_MAILBOX },
      messages: [monthsOfferMessage({ versions: PENDING_WA })],
      room: { open: 15, days: 14 },
    }),
    steps: [{ ...TODAY_NOTE, n: 1 }, pacedStep(2, [1], { channels: ["whatsapp"] })],
    words: [WITHOUT_EMAIL, PACED, WAITS_CHECK, REUSED, TODAY_SAYS],
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
    words: [WITHOUT_EMAIL, PACED, WAITS_CHECK, WRITES("WhatsApp"), TODAY_SAYS],
  },
  {
    name: "AI already has the offer's note with the same end: no note step",
    intent: offer(),
    world: world({
      messages: [monthsOfferMessage()],
      notes: [{ title: `Offer: ${WORDS}`, text: "Anything.", until: "2026-11-30" }],
    }),
    steps: [firstSend(1, [])],
    words: [EN.noteKnown, REMINDS, REUSED, GOES],
  },
  {
    name: "the journey unread: an offer is planned all the same, with no reminder said, since who has booked cannot be told (fix round 1)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], journey: null }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [REUSED, NOTE, GOES],
  },
  {
    name: "asked by a member who may not approve a note for AI: no note step, the steps renumbered, and the words say AI is not told until an owner or a partner adds it (pre-review ruling 1)",
    intent: offer(),
    world: world({ messages: [monthsOfferMessage()], playbooks: [monthsOffer()], canNote: false }),
    steps: [pauseStep(1), firstSend(2, [1])],
    words: [EN.noteLeftOut, PAUSES, REMINDS, REUSED, GOES],
  },
  {
    name: "and one written message's token still names step 1 with the note left out",
    intent: offer(),
    world: world({ canNote: false }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }), writtenSend(2, [1])],
    words: [EN.noteLeftOut, REMINDS, WAITS_CHECK, WRITES("WhatsApp and email"), GOES],
  },
  {
    name: "an offer that ends before its twentieth day: the reminder is asked for on its last day (ruling 1)",
    intent: offer({ until: "2026-11-07" }),
    world: world({ messages: [monthsOfferMessage()] }),
    steps: [noteStep(1, "Nov 1", "Nov 7", "2026-11-07"), firstSend(2, [1])],
    words: [EN.reminderAsk("Nov 7", "Can receive offers"), REUSED, "Tells AI about the offer, until Nov 7.", GOES],
  },
  {
    name: "a one-day offer has no day left to ask for a reminder (ruling 1)",
    intent: offer({ until: "2026-11-01" }),
    world: world({ messages: [monthsOfferMessage()] }),
    steps: [noteStep(1, "Nov 1", "Nov 1", "2026-11-01"), firstSend(2, [1])],
    words: [REUSED, "Tells AI about the offer, until Nov 1.", GOES],
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
    words: [EN.reminderAsk("Nov 20", "Regulars"), REUSED, NOTE, "The offer goes to “Regulars” on Nov 1 at 10:00 AM."],
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
    words: [WITHOUT_EMAIL, EN.noteLeftOut, PAUSES, ROOM_TIGHT, REMINDS, WAITS_CHECK, WRITES("WhatsApp"), GOES],
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
      EN.noteLeftOut,
      EN.monthsOfferPaused(LONG_MONTHS_OFFER, "Nov 30"),
      ROOM_TIGHT,
      REMINDS,
      WAITS_CHECK,
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
    words: [
      "Starts 2 campaigns now, each its own card: a reminder the day before a booked time and a follow-up the day after a booked time.",
    ],
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
    words: [
      "Starts 3 campaigns now, each its own card: a reminder the day before a booked time, a follow-up the day after a booked time and a win-back once they go quiet.",
    ],
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
    words: [COVERS_ONE],
  },
  {
    name: "cover the journey without a calendar: the win-back by silence now, and the calendar to connect first for the day before and the day after, never dropped in silence (the setup review)",
    intent: { intent: "cover_journey" },
    world: world({ journey: QUIET_ONLY, shape: NO_CALENDAR }),
    steps: [{ n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "quiet_30" } }],
    words: [CONNECT(), WIN_BACK, "Ask me again once it is connected, and I'll add them."],
    lead: CALENDAR_LEAD(1, 2),
  },
  {
    name: "the owner's own business: a discovery call, then a proposal, no calendar and no deal yet; the calendar said first in their words, the proposal follow-up and the win-back now, and whichever reaches nobody today (the setup review; deals for everyone, 18 Oct 2026)",
    intent: { intent: "cover_journey", books: "a discovery call", proposals: true },
    world: world({ journey: QUIET_ONLY, shape: NO_CALENDAR, reach: { quiet_30: 0, proposal_waiting: 0 } }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "proposal_waiting" } },
      { n: 2, kind: "playbook", silent: false, after: [], input: { trigger: "quiet_30" } },
    ],
    words: [
      CONNECT("discovery call"),
      "Starts 2 campaigns now, each its own card: a follow-up while a proposal waits and a win-back once they go quiet.",
      "The proposal follow-up and the win-back reach nobody today; each card says why.",
      "Ask me again once it is connected, and I'll add them.",
    ],
    lead: CALENDAR_LEAD(2, 2),
  },
  {
    name: "the same business asked in Spanish: every word of the setup in Spanish, theirs for what they book (the setup review)",
    intent: { intent: "cover_journey", books: "una llamada de diagnóstico", proposals: true },
    world: world({ journey: QUIET_ONLY, shape: NO_CALENDAR, reach: { quiet_30: 0 }, says: "es" }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "proposal_waiting" } },
      { n: 2, kind: "playbook", silent: false, after: [], input: { trigger: "quiet_30" } },
    ],
    words: [
      "Primero, conecta tu calendario en Ajustes › Negocio, para que cada llamada de diagnóstico tenga un recordatorio el día antes y un seguimiento el día después.",
      "Empieza 2 campañas ya, cada una en su tarjeta: un seguimiento mientras espera una propuesta y una recuperación para quien se queda en silencio.",
      "La recuperación no llega a nadie hoy; su tarjeta dice por qué.",
      "Pídemelo otra vez cuando esté conectado y las añado.",
    ],
    lead: {
      headline: "Conecta tu calendario primero: 2 campañas pueden empezar ya, 2 más cuando esté conectado.",
      open: { to: "admin/workspace/calendar", label: "Conectar un calendario" },
      next: ["¿Cómo conecto mi calendario en Ajustes?"],
    },
  },
  {
    name: "a salon that never said proposals is never offered a proposal follow-up: the calendar alone, by its own word for an appointment (the setup review)",
    intent: { intent: "cover_journey" },
    world: world({ journey: QUIET_ONLY, shape: { ...NO_CALENDAR, word: "visit" }, reach: { quiet_30: 4 } }),
    steps: [{ n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "quiet_30" } }],
    words: [CONNECT("visit"), WIN_BACK, "Ask me again once it is connected, and I'll add them."],
    lead: CALENDAR_LEAD(1, 2),
  },
  {
    name: "bookings by a booking tool's emails: the calendar's feed is what to connect, and why (the setup review)",
    intent: { intent: "cover_journey", stages: ["before", "quiet"] },
    world: world({ journey: QUIET_ONLY, shape: { ...NO_CALENDAR, calendar: "email" } }),
    steps: [{ n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "quiet_30" } }],
    words: [
      "First, connect your calendar's feed under Settings › Hours & booking (booking emails alone cannot time a campaign), so each appointment gets a reminder the day before.",
      WIN_BACK,
      "Ask me again once it is connected, and I'll add it.",
    ],
    lead: CALENDAR_LEAD(1, 1),
  },
  {
    name: "proposals said with a calendar and no deal yet: the proposal follow-up starts now, with the appointment moments, in the journey's order (the setup review; deals for everyone, 18 Oct 2026)",
    intent: { intent: "cover_journey", proposals: true },
    world: world({ journey: JOURNEY.map((s) => (s.id === "quiet" ? { ...s, covered: true } : s)) }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visit_tomorrow" } },
      { n: 2, kind: "playbook", silent: false, after: [], input: { trigger: "visited" } },
      { n: 3, kind: "playbook", silent: false, after: [], input: { trigger: "proposal_waiting" } },
    ],
    words: [
      "Starts 3 campaigns now, each its own card: a reminder the day before a booked time, a follow-up the day after a booked time and a follow-up while a proposal waits.",
    ],
  },
  {
    name: "nothing to start but the calendar to connect: refused, with what comes first for the model to say (the setup review)",
    intent: { intent: "cover_journey" },
    world: world({ journey: QUIET_ONLY.map((s) => ({ ...s, covered: true })), shape: NO_CALENDAR }),
    refused: `${W.nothingToCover} ${CONNECT()}`,
  },
  {
    name: "cover the journey with a deal on file: the proposal follow-up, in the journey's order",
    intent: { intent: "cover_journey" },
    world: world({
      shape: { ...SHAPE, hasDeals: true, word: "meeting" },
      journey: [...JOURNEY.slice(0, 3), { id: "proposal", covered: false, moment: "proposal_waiting" }, JOURNEY[3]],
    }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visit_tomorrow" } },
      { n: 2, kind: "playbook", silent: false, after: [], input: { trigger: "visited" } },
      { n: 3, kind: "playbook", silent: false, after: [], input: { trigger: "proposal_waiting" } },
      { n: 4, kind: "playbook", silent: false, after: [], input: { trigger: "lapsed" } },
    ],
    words: [
      "Starts 4 campaigns now, each its own card: a reminder the day before a booked time, a follow-up the day after a booked time, a follow-up while a proposal waits and a win-back once they go quiet.",
    ],
  },
  {
    name: "a campaign paused on a moment is not doubled: a card of its own resumes it, as propose_sequence action change makes it (it was 'resume it from its drawer': the operator stress run, 15 Oct 2026)",
    intent: { intent: "cover_journey", stages: ["after", "quiet"] },
    world: world({
      playbooks: [{ id: PB, name: "Win-back", trigger: "lapsed", state: "paused", template_name: null }],
    }),
    steps: [
      { n: 1, kind: "playbook", silent: false, after: [], input: { trigger: "visited" } },
      { n: 2, kind: "change", silent: false, after: [], input: { playbook_id: PB, state: "running" } },
    ],
    words: [COVERS_ONE, "Resumes “Win-back”, paused on its moment, on a card of its own."],
  },
  {
    name: "everything set up for a goal with no calendar and the win-back paused: the resume is the card, the calendar comes first, never 'nothing to set up' (the operator stress run, 15 Oct 2026)",
    intent: { intent: "cover_journey" },
    world: world({
      journey: QUIET_ONLY,
      shape: NO_CALENDAR,
      playbooks: [{ id: PB, name: "Win-back", trigger: "quiet_30", state: "paused", template_name: null }],
    }),
    steps: [{ n: 1, kind: "change", silent: false, after: [], input: { playbook_id: PB, state: "running" } }],
    words: [
      CONNECT(),
      "Resumes “Win-back”, paused on its moment, on a card of its own.",
      "Ask me again once it is connected, and I'll add them.",
    ],
    lead: CALENDAR_LEAD(1, 2),
  },
  {
    name: "a setup in Spanish resumes in Spanish",
    intent: { intent: "cover_journey", stages: ["quiet"] },
    world: world({
      says: "es",
      playbooks: [{ id: PB, name: "Win-back", trigger: "lapsed", state: "paused", template_name: null }],
    }),
    steps: [{ n: 1, kind: "change", silent: false, after: [], input: { playbook_id: PB, state: "running" } }],
    words: ["Reanuda «Win-back», en pausa en su momento, en su propia tarjeta."],
  },
  {
    name: "the day before asked for, with no calendar: nothing to cover, and the calendar to connect for it",
    intent: { intent: "cover_journey", stages: ["before"] },
    world: world({ journey: [{ id: "first_contact", covered: true, moment: null }], shape: NO_CALENDAR }),
    refused: `${W.nothingToCover} ${CONNECT("appointment", "a reminder the day before")}`,
  },
  {
    name: "a moment named that the workspace's shape cannot say why it lacks: not offered here",
    intent: { intent: "cover_journey", stages: ["before"] },
    world: world({ journey: [{ id: "first_contact", covered: true, moment: null }] }),
    refused: `${W.nothingToCover} Not offered here: the day before a booked time.`,
  },
  {
    name: "the journey not read is refused, never guessed (ruling 9)",
    intent: { intent: "cover_journey" },
    world: world({ journey: null }),
    refused: W.journeyUnread,
  },
];

/* ---- An offer asked in Spanish: the same plans, every word of the answer in Spanish (PlanWorld.says) ---- */

/** The offers list and the month's offer as a Spanish workspace names them. */
export const ES_LIST = { token: OFFERS, name: "Pueden recibir ofertas", count: 40 };

export const esWorld = (over = {}) => world({ says: "es", lists: [ES_LIST], ...over });

export const esMonthsOffer = (over = {}) => monthsOffer({ name: "Oferta del mes", ...over });

export const ES_REUSED = "Envía «this_months_offer», que ya está en la Biblioteca, con la oferta en su texto.";

export const ES_WRITES = (on) =>
  `Escribe un mensaje para ofertas, «offer», para ${on}: esta oferta va en su texto, y la próxima también podrá enviarlo.`;

export const ES_NOTE = "Avisa a la recepcionista de la oferta, hasta el 30 de noviembre.";

export const ES_TODAY_NOTE = "Avisa a la recepcionista de la oferta, hasta el 15 de noviembre.";

export const ES_PAUSES = (name = "Oferta del mes") =>
  `Pausa la oferta del mes, «${name}», desde que apruebes el plan, para que nadie reciba dos ofertas · reanúdala después del 30 de noviembre.`;

export const ES_GOES = "La oferta va a «Pueden recibir ofertas» el 1 de noviembre a las 10:00.";

export const ES_REMINDS = (day = "20 de noviembre") =>
  `El ${day}, pídeme que envíe un recordatorio a quien de «Pueden recibir ofertas» no haya reservado para entonces.`;

export const ES_WAITS_CHECK = C.OFFER_PLAN_WORDS.es.whatsappReview;

export const ES_ROOM = "El calendario tiene 15 huecos libres en los próximos 14 días para 40 personas";

export const ES_PACED = `${ES_ROOM}, así que la oferta va como campaña: hasta 2 al día, cada persona una vez, hasta que termine, desde que la apruebes.`;

export const ES_ROOM_TIGHT = `${ES_ROOM}, y el envío va a toda la lista a la vez. Para ajustarla a los huecos, descártalo y pídemelo otra vez el 1 de noviembre.`;

export const ES_NO_MAILBOX = "Va sin correo: Configura primero el correo en Ajustes › Conexiones.";

export const ES_NOTE_LEFT_OUT = "La recepcionista no sabe de la oferta hasta que un dueño o un socio añada una nota.";

/** The rows of a Spanish question: the steps an English one makes (their cards' words are the cards'), said in Spanish. */
export const ES_ROWS = [
  {
    name: "the month's offer starter reused, the running month's offer paused: the pause, the reminder, the message, the note and the send's day",
    intent: offer(),
    world: esWorld({ messages: [monthsOfferMessage()], playbooks: [esMonthsOffer()] }),
    steps: [noteStep(1), pauseStep(2), firstSend(3, [1, 2])],
    words: [ES_PAUSES(), ES_REMINDS(), ES_REUSED, ES_NOTE, ES_GOES],
  },
  {
    name: "no message carries an offer: one written for WhatsApp and email, its send approved once WhatsApp has reviewed it",
    intent: offer(),
    world: esWorld(),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY }, email: EMAIL }), noteStep(2), writtenSend(3, [1, 2])],
    words: [ES_REMINDS(), ES_WAITS_CHECK, ES_WRITES("WhatsApp y correo"), ES_NOTE, ES_GOES],
  },
  {
    name: "no WhatsApp number: written for email alone, and the channels' reason said in Spanish",
    intent: offer(),
    world: esWorld({ channels: { whatsapp: NO_NUMBER, email: OPEN } }),
    steps: [WRITTEN({ email: EMAIL }), noteStep(2), writtenSend(3, [1, 2], { channels: ["email"] })],
    words: [
      "Va sin WhatsApp: Conecta primero un número de WhatsApp.",
      ES_REMINDS(),
      ES_WRITES("correo"),
      ES_NOTE,
      ES_GOES,
    ],
  },
  {
    name: "a US number: Meta's pause on offers said as itself, in Spanish, and the starter goes by email",
    intent: offer(),
    world: esWorld({
      channels: { whatsapp: { ok: false, why: US_PAUSED }, email: OPEN },
      messages: [monthsOfferMessage()],
    }),
    steps: [noteStep(1), firstSend(2, [1], { template_id: V(2), channels: ["email"] })],
    words: [
      "Va sin WhatsApp: WhatsApp no entrega ofertas a números de Estados Unidos por ahora. Las citas y las respuestas siguen saliendo.",
      ES_REMINDS(),
      ES_REUSED,
      ES_NOTE,
      ES_GOES,
    ],
  },
  {
    name: "email not checked just now, with no reason given: said as not checked",
    intent: offer(),
    world: esWorld({ channels: { whatsapp: OPEN, email: { ok: false, why: null } }, messages: [monthsOfferMessage()] }),
    steps: [noteStep(1), firstSend(2, [1], { channels: ["whatsapp"] })],
    words: ["Va sin correo: No se pudo comprobar ahora mismo.", ES_REMINDS(), ES_REUSED, ES_NOTE, ES_GOES],
  },
  {
    name: "a text asked for beside WhatsApp is dropped, said in Spanish",
    intent: offer({ channels: ["whatsapp", "sms"] }),
    world: esWorld({ messages: [monthsOfferMessage()] }),
    steps: [noteStep(1), firstSend(2, [1], { channels: ["whatsapp"] })],
    words: ["Los mensajes de texto no llevan ofertas.", ES_REMINDS(), ES_REUSED, ES_NOTE, ES_GOES],
  },
  {
    name: "an offer starting today on a tight room: the campaign's pace",
    intent: offer(TODAY),
    world: esWorld({ messages: [monthsOfferMessage()], room: { open: 15, days: 14 } }),
    steps: [{ ...TODAY_NOTE, n: 1 }, pacedStep(2, [1])],
    words: [ES_PACED, ES_REUSED, ES_TODAY_NOTE],
  },
  {
    name: "the same room for an offer three weeks out: the send reaches the whole list, and how to pace it on its day",
    intent: offer(),
    world: esWorld({ messages: [monthsOfferMessage()], room: { open: 15, days: 14 } }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [ES_ROOM_TIGHT, ES_REMINDS(), ES_REUSED, ES_NOTE, ES_GOES],
  },
  {
    name: "today with ten o'clock past, ending next year: the send at Approve, and the year said where it is not this one",
    intent: offer({ from: "2026-10-11", until: "2027-01-05" }),
    world: esWorld({ messages: [monthsOfferMessage()], now: new Date("2026-10-11T16:00:00Z") }),
    steps: [noteStep(1, "Oct 11", "Jan 5, 2027", "2027-01-05"), atApprove(firstSend(2, [1]))],
    words: [
      ES_REMINDS("30 de octubre"),
      ES_REUSED,
      "Avisa a la recepcionista de la oferta, hasta el 5 de enero de 2027.",
      "La oferta va a «Pueden recibir ofertas» cuando la apruebes, porque hoy ya pasaron las 10:00.",
    ],
  },
  {
    name: "the one message that fits is being checked by WhatsApp: it is reused by WhatsApp and email, and its WhatsApp people wait for the check",
    intent: offer(),
    world: esWorld({ messages: [monthsOfferMessage({ versions: PENDING_WA })] }),
    steps: [noteStep(1), firstSend(2, [1])],
    words: [ES_REMINDS(), ES_WAITS_CHECK, ES_REUSED, ES_NOTE, ES_GOES],
  },
  {
    name: "a paced campaign by email too on a WhatsApp version in review: its WhatsApp people wait for the review",
    intent: offer(TODAY),
    world: esWorld({ messages: [monthsOfferMessage({ versions: PENDING_WA })], room: { open: 15, days: 14 } }),
    steps: [{ ...TODAY_NOTE, n: 1 }, pacedStep(2, [1], { template_id: V(1) })],
    words: [
      ES_PACED,
      "WhatsApp aún revisa sus palabras, así que quien la reciba por WhatsApp espera a que termine.",
      ES_REUSED,
      ES_TODAY_NOTE,
    ],
  },
  {
    name: "AI already has the offer's note: no note step, and the words say so",
    intent: offer(),
    world: esWorld({
      messages: [monthsOfferMessage()],
      notes: [{ title: `Offer: ${WORDS}`, text: "Anything.", until: "2026-11-30" }],
    }),
    steps: [firstSend(1, [])],
    words: ["La recepcionista ya tiene una nota sobre la oferta.", ES_REMINDS(), ES_REUSED, ES_GOES],
  },
  {
    name: "an operator, email not set up, a new WhatsApp message, the month's offer running and a tight later room: what no card carries first",
    intent: offer(),
    world: esWorld({
      channels: { whatsapp: OPEN, email: NO_MAILBOX },
      playbooks: [esMonthsOffer()],
      room: { open: 15, days: 14 },
      canNote: false,
    }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY } }), pauseStep(2), writtenSend(3, [1, 2], { channels: ["whatsapp"] })],
    words: [
      ES_NO_MAILBOX,
      ES_NOTE_LEFT_OUT,
      ES_PAUSES(),
      ES_ROOM_TIGHT,
      ES_REMINDS(),
      ES_WAITS_CHECK,
      ES_WRITES("WhatsApp"),
      ES_GOES,
    ],
    pastTheCap: true,
  },
  {
    name: "the same operator's world with the month's offer under a long name: the reminder still whole within the cap",
    intent: offer(),
    world: esWorld({
      channels: { whatsapp: OPEN, email: NO_MAILBOX },
      playbooks: [esMonthsOffer({ name: LONG_MONTHS_OFFER })],
      room: { open: 15, days: 14 },
      canNote: false,
    }),
    steps: [WRITTEN({ whatsapp: { body: WA_BODY } }), pauseStep(2), writtenSend(3, [1, 2], { channels: ["whatsapp"] })],
    words: [
      ES_NO_MAILBOX,
      ES_NOTE_LEFT_OUT,
      ES_PAUSES(LONG_MONTHS_OFFER),
      ES_ROOM_TIGHT,
      ES_REMINDS(),
      ES_WAITS_CHECK,
      ES_WRITES("WhatsApp"),
      ES_GOES,
    ],
    pastTheCap: true,
  },
  {
    name: "a refusal is the plan's English, which the model reads and says in the question's language",
    intent: offer(),
    world: esWorld({ channels: { whatsapp: NO_NUMBER, email: NO_MAILBOX } }),
    refused: `Nothing here can carry this offer. WhatsApp cannot: ${C.CHANNEL_WORDS.noWhatsApp} Email cannot: ${C.CHANNEL_WORDS.noMailbox} ${C.CHANNEL_WORDS.noOffersByText} Say so, and what to set up first.`,
  },
];

/** The review ask as the Library reads it: WhatsApp's version and email's, approved. */
export function reviewAsk(over = {}) {
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
export function checkAsk() {
  return reviewAsk({
    name: "after_visit_check",
    versions: [
      { channel: "email", id: V(9), state: "approved" },
      { channel: "whatsapp", id: V(10), state: "approved" },
    ],
  });
}

/* ---- every step's input is its action's input, and every written message the door's ---- */

export const tool = async (rel, name) => (await import(at(`apps/dashboard/src/server/ask/tools/act/${rel}`)))[name];

export const sequenceTool = await tool("sequence/sequence.ts", "propose_sequence");

export const settingsTool = await tool("settings.ts", "propose_settings");

/** An action of a tool by its name: propose_sequence's own, or "" for a tool that is one action. */
export const action = (t, name) => {
  const def = t.actions[name];
  assert.ok(def, `${t.name} has the action ${name || "(its own)"}`);
  return def;
};

export const SCHEMAS = {
  message: action(sequenceTool, "message").input,
  note: action(settingsTool, "change").input,
  broadcast: action(sequenceTool, "once").input,
  playbook: action(sequenceTool, "moment").input,
  change: action(sequenceTool, "change").input,
};

export const { checkMessage } = await import(at("apps/dashboard/src/server/campaigns/write-message.ts"));

export const { slotExample } = await import(at("apps/dashboard/src/server/ask/tools/act/says.ts"));

/** A written message as the message card files it (act/message.ts proposeMessage), held to the door's own checks. */
export function doorTakes(step, label) {
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

/** A message a plan wrote, as campaigns with action messages reads it once filed: English under en_US, WhatsApp in review. */
export const filed = (step) => ({
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
