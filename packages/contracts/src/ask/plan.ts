/**
 * A plan of Ask's, with no model (the marketing manager's spec §5.4, D3): the owner's intent, an offer ("10% off every
 * service all November") or the journey to cover, and a snapshot of the workspace (PlanWorld) give the steps, as data,
 * and nothing is read or written here. Each step is the input of one of Ask's own actions, which the server expands it
 * through as its own card (a message, a note for the receptionist, a change to a campaign, a broadcast, a campaign); a
 * step that names what an earlier step makes carries its token (`@step:n`), which the commit fills from what the plan
 * made (plan-steps.ts resolveSteps). The steps that send nothing are silent and are approved together; a send is its own
 * press and waits for them (`after`).
 *
 * The rules, each a row of the table test (tooling/scripts/tests/ask/plan/plan-of.test.mjs):
 *
 *   the message   a marketing message in the workspace's language whose one typed value is the offer (the month's
 *                 offer starter's own, "The offer"), every other filled per person, with a version on every channel the
 *                 offer goes by, is reused: the starter first, then one a plan wrote ("offer"), then any other; a send
 *                 WhatsApp's review holds (plan-steps.ts sendWaitsForReview) takes a WhatsApp version only once it is
 *                 approved, and where the only one that fits is still in review none is written beside it: the offer
 *                 goes without WhatsApp, said, or is refused; else one is written in that shape (OFFER_MESSAGE, in
 *                 words that fit any dated offer), so the next offer reuses it, with a version per channel the
 *                 workspace sends offers on (channelChoices' own verdict; never a text: texts carry no offers), and the
 *                 words say each left out with its reason; every send types the owner's words into its offer
 *   the offer's   what a send types is read on its own day, not the day it was asked: the owner's phrasing (`say`)
 *   value         where it names no day from today and is not the ask itself, else the offer's words; words that
 *                 name one ("next month", "el mes que viene") are refused, but for an offer of today alone
 *   the note      "Offer: {words}", with the dates, until the offer's last day, unless the receptionist has it, or
 *                 the member asking may not approve one (the words say who may)
 *   the send      at ten on the business's clock on `from` (at Approve where ten has passed today)
 *   the month's   a running one that has not ended is paused while the offer runs, so nobody gets two offers and it
 *   offer         never sends this one on its own cadence or after the offer ends; the words say to resume it after
 *   the pace      an offer that starts today, on a calendar with fewer open slots ahead than half the audience, goes as
 *                 a campaign instead, the open slots a day ahead as many a day, ending with the offer; one that starts
 *                 later is a broadcast to the whole list, and the words say so and that pacing it is dismissing the
 *                 send and asking again on its day
 *   the reminder  never a step: a send enrols its people at its Approve, so who has not booked is known only on the
 *                 day. The words say when to ask for it (nineteen days in, or the offer's last day), where a calendar
 *                 can say who booked, last of what no card carries
 *   the words     what no card carries first (channels left out, a note left out or held, the pause to resume, the
 *                 room, WhatsApp's review of a paced campaign that also goes by email, the reminder), then what the
 *                 cards show (WhatsApp's review of a send it holds, the message, the note, the send's day): the answer's
 *                 detail is cut at 700 characters (answerForCards), so a cut loses what a card says; said in the
 *                 question's language (broadcasts/offer-plan-words.ts), the refusals in English for the model to say
 *   the journey   a campaign on each moment not covered yet that the workspace can run, on its action's pick; the day
 *                 after's review ask only where the Google listing keeps a review link (stageInput); without one, the
 *                 check named only over a review ask the Library holds, else the action's pick, which may be the
 *                 after_visit the set retired; nothing for first contact, the receptionist's own. A moment of the
 *                 business's journey it cannot run yet is said with what comes first, never dropped: an appointment's
 *                 two need the calendar's feed, a proposal's needs deals on, a moment of theirs where the owner says
 *                 some customers get one; the words name what they book in the owner's words, say who a card reaches
 *                 nobody of today, and are said in the question's language; the answer leads with what comes first
 *                 (PlanLead: its headline, the Open to where it is set, and the next question); journey/journey-plan.ts
 */
import { isDayKey, shiftKey } from "../calendar/day-keys";
import type { Note } from "../config/workspace-config/business-profile";
import { PROFILE_LIMITS } from "../config/workspace-config/config-rules";
import type { ConsentChannel } from "../consent/consent-channels";
import { BROADCAST_NAME_MAX } from "../broadcasts/broadcasts";
import { OFFER_PLAN_WORDS, dayReadWrong, isTheAsk } from "../broadcasts/offer-plan-words";
import { CHANNEL_WORDS } from "../broadcasts/reach-for";
import type { AppointmentWord } from "../journey/appointment-word";
import type { JourneyStageId } from "../journey/journey";
import { JOURNEY_PLAN_WORDS, journeyPlan, type PlanLead } from "../journey/journey-plan";
import { parseListToken } from "../people/lists/lists";
import { campaignDayWords, campaignRunsOn, localDate } from "../playbooks/playbook-schedule";
import { PLAYBOOK_DEFAULTS, PLAYBOOK_LIMITS, PLAYBOOK_NAME_MAX } from "../playbooks/playbook-triggers";
import { wallClockAt } from "../shared/clock";
import { LIVE_VERSION_STATES, VERSION_CHANNEL_WORDS } from "../templates/message-versions";
import { SENDER_WORDS } from "../templates/sender-words";
import { starterByName, starterText } from "../templates/starter-lookup";
import { messageLanguageCode } from "../templates/starter-templates";
import { languageBase } from "../templates/template-languages";
import type { MessageRead } from "./ask";
import { clip } from "./ask-answer";
import { sendWaitsForReview, stepToken } from "./plan-steps";

/** What the owner asked for, as the model states it: an offer in their words and dates, or the journey to cover. */
export type PlanIntent =
  | {
      intent: "offer";
      offer: {
        /** The offer in the owner's words ("10% off every service all November"): the note's title, the send's name. */
        words: string;
        /** Its first and last day, YYYY-MM-DD by the business's calendar. */
        from: string;
        until: string;
        /** What it is for, said in the receptionist's note. */
        service?: string;
        /** The list it goes to, by its token (`seg:<id>`, `list:<id>`); the offers list where none is named. */
        who?: string;
        /** The channels it may go by; WhatsApp and email where none is named. A text is never one (texts carry no offers). */
        channels?: ConsentChannel[];
      };
      /** The owner's own phrasing of the offer, kept: what the message says in its place. */
      say?: string;
    }
  | {
      intent: "cover_journey";
      stages?: JourneyStageId[];
      /**
       * What their customers book, in the owner's own words where they said it ("discovery call"): the setup's words
       * name it in place of the workspace's word for an appointment. Words only: it changes no moment.
       */
      books?: string;
      /**
       * The owner said some of their customers get a proposal before they buy: the proposal follow-up is a moment of
       * their journey whether deals are on yet or not, so a setup says how to turn them on where they are off.
       */
      proposals?: boolean;
    };

/** What a plan is made against: the workspace as Ask's reads see it at one moment (Task 17 reads it). */
export interface PlanWorld {
  now: Date;
  /** The business's zone: its today, and ten o'clock there. */
  tz: string;
  /** The language a message is written in, and a reused one is in. */
  language: "en" | "es";
  /** The language a plan's words are said in: the question's (the turn's). Its refusals are English, for the model. */
  says: "en" | "es";
  /**
   * How the business works, as GET playbooks says it: whether its appointments are read from a calendar's feed, from a
   * booking tool's emails, or from neither (an appointment's moments run on the feed alone); whether deals are on (the
   * proposal follow-up runs only then); and what it calls an appointment. What a setup says to connect first.
   */
  shape: { calendar: "feed" | "email" | "none"; dealsOn: boolean; word: AppointmentWord };
  /**
   * Who a campaign on each moment would reach today, by its trigger (GET playbooks' pools: who a run would pick now);
   * absent or null where it was not counted, which is never "nobody".
   */
  reach: Readonly<Record<string, number | null>>;
  /**
   * Whether an offer may go by each channel now, and why not: channelChoices' own entry, the offer's (no number,
   * WhatsApp's pause on offers to US numbers, email not set up to send offers, not checked), so its words are true.
   */
  channels: Record<OfferChannel, { ok: boolean; why: string | null }>;
  /** Whether WhatsApp sends at all: a message about their own appointment (the review ask) goes where an offer may not. */
  whatsappSends: boolean;
  /** Whether the Google listing keeps a review link (db reviewLinkOf; unread is none): the review ask's link is it. */
  reviewLink: boolean;
  /** The Library, as sequences with action messages reads it. */
  messages: MessageRead[];
  /** People's lists offered here and the workspace's own, each with its count (null: not counted). */
  lists: { token: string; name: string; count: number | null }[];
  /** The workspace's campaigns, each with its last day or none: the month's offer among them (trigger everyone_monthly). */
  playbooks: (Record<"id" | "name" | "trigger" | "state", string> & Record<"template_name" | "until", string | null>)[];
  /** The receptionist's notes. */
  notes: Note[];
  /**
   * The calendar's open slots over the days ahead it counts (calendar.room: `days`, at most the booking window's
   * fourteen); null where that is not known, which is never "full".
   */
  room: { open: number; days: number } | null;
  /**
   * The journey's stages this workspace can run (journeyGuide's: an appointment's moments only with a calendar
   * connected, a proposal's only where deals are on), each covered or not and the moment a campaign on it starts from
   * (null for first contact); null where it could not be read. That `before` or `after` is here is how a plan knows a
   * calendar is connected.
   */
  journey: { id: JourneyStageId; covered: boolean; moment: string | null }[] | null;
  /** The built-in offers list's token (`seg:offers_ok`): who an offer goes to where the owner names no list. */
  offersList: string;
  /**
   * Whether the member asking may approve a note for the receptionist (a settings card: an owner's or a partner's). Where
   * not, the plan makes no note, so it is not dead for them at its first step, and its words say the receptionist is not
   * told of the offer until an owner or a partner adds one.
   */
  canNote: boolean;
}

/** One step: the action it is expanded through (its kind) and that action's input, whether it sends, and why. */
export interface PlanStep {
  n: number;
  kind: "message" | "note" | "change" | "broadcast" | "playbook";
  /** Sends nothing: approved with the plan's other silent steps. A send is its own press. */
  silent: boolean;
  input: Record<string, unknown>;
  why: string;
  /** The steps it waits for: every silent step, for a send. */
  after: number[];
}

type StepKind = PlanStep["kind"];
type OfferChannel = "whatsapp" | "email";
type Offer = Extract<PlanIntent, { intent: "offer" }>["offer"];
type ListEntry = PlanWorld["lists"][number];
type Room = NonNullable<PlanWorld["room"]>;
type Audience = { audience_kind: "list" | "saved"; audience_id: string };
type Slot = { position: number; label: string; kind: string };
/** An offer's words for the person, in the question's language. */
type Said = (typeof OFFER_PLAN_WORDS)[PlanWorld["says"]];

/** The hour a send goes at, by the business's clock: the hour a campaign runs at unless told otherwise. */
const SEND_HOUR = PLAYBOOK_DEFAULTS.runHour;
/** The day to ask for a reminder, this many days after the first send: the 20th of a month-long offer from the 1st. */
const REMINDER_AFTER_DAYS = 19;
/** The channels an offer may go by, in the order a message's versions are written. */
const OFFER_CHANNELS: readonly OfferChannel[] = ["whatsapp", "email"];
/** The value kinds a send fills per person, beside the one typed value that carries the offer. */
const PER_PERSON = new Set(["first_name", "business_name", "booking_link", "review_link"]);
const LIVE = LIVE_VERSION_STATES;
/** A WhatsApp version a send its review holds can go by (sendWaitsForReview): approved, as contracts messageHolds says. */
const SENDS_NOW = new Set(["approved"]);
/** A message a plan wrote: "offer", or "offer_2" where that name was held. */
const WRITTEN_NAME = /^offer(?:_\d+)?$/;
const SILENT: Record<StepKind, boolean> = {
  message: true,
  note: true,
  change: true,
  broadcast: false,
  playbook: false,
};

/**
 * The words of the offer message a plan writes, by language: the month's offer starter's shape and its four values in
 * its order (the first name, the business, the offer, the booking link), with "an offer from" where the starter says
 * "this month at", so one message carries a month-long offer, a weekend's or any other, and the next offer reuses it.
 * Its WhatsApp version ends on the STOP line (sender-words.ts) a marketing message carries, in its body, which is all
 * the message action takes.
 */
const OFFER_MESSAGE: Record<PlanWorld["language"], { whatsapp: string; subject: string; email: string }> = {
  en: {
    whatsapp: `Hi {{1}}, an offer from {{2}}: {{3}} Book here: {{4}} or reply with a day that suits you.\n\n${SENDER_WORDS.en.textStop}`,
    subject: "An offer from {{2}}",
    email: "Hi {{1}},\n\nAn offer from {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you.",
  },
  es: {
    whatsapp: `Hola {{1}}, una oferta de {{2}}: {{3}} Reserva aquí: {{4}} o responde con el día que mejor te venga.\n\n${SENDER_WORDS.es.textStop}`,
    subject: "Una oferta de {{2}}",
    email:
      "Hola {{1}}:\n\nUna oferta de {{2}}: {{3}}\n\nReserva aquí: {{4}}, o responde con el día que mejor te venga.",
  },
};

/** A channel's reason as channelChoices gives it, in English, as the refusals say it. */
const whyOf = (why: string | null): string => OFFER_PLAN_WORDS.en.reason(why);

/** A campaign's pace: the open slots a day ahead, rounded up, within what a campaign's cap may be. */
const capOf = (room: Room): number =>
  Math.min(
    PLAYBOOK_LIMITS.cap_per_run.max,
    Math.max(PLAYBOOK_LIMITS.cap_per_run.min, Math.ceil(room.open / Math.max(1, room.days))),
  );

/** A plan refused for a read that failed: what could not be read, that nothing was proposed, and to ask again. */
const unreadWords = (what: string): string =>
  `${what} could not be read just now, so nothing was proposed: say so, and ask again in a moment.`;

/**
 * What a plan says in English: its refusals, the model's to say back in the question's language (each ends on what to
 * do), what its cards are titled and its note says, and each step's why. Its words for the person are an offer's
 * OFFER_PLAN_WORDS and a setup's own (journey-plan.ts), in the question's language. WhatsApp's review is WhatsApp's.
 */
export const PLAN_WORDS = {
  noOffer:
    "intent offer takes offer: its words, from and until, the offer's first and last day. Ask what the offer is and when it runs.",
  noWords: "words is the offer in the owner's words: ask what the offer is.",
  /** The offer's words say a day from today that its message, note and send, first read on its first day, misread. */
  dayFromToday: (phrase: string, from: string): string =>
    `“${phrase}” is said from today, and the offer is first read on ${from}, when it means another day: give words (and say) its days as a customer reads them then (“all November”, never “next month”), and call again.`,
  notADay: "from and until are days on the business's calendar, written YYYY-MM-DD: ask for them again.",
  fromAfterUntil: "until comes before from: an offer's last day is its first day or later. Ask which dates they meant.",
  fromPast:
    "from is a day already past on the business's calendar: an offer starts today or later. Ask when it starts.",
  /** None asked for can carry it: each closed one given, why; an open one not asked, to name; else what to set up. */
  noChannel: (
    closed: readonly { channel: OfferChannel; why: string | null }[],
    open: readonly OfferChannel[],
  ): string =>
    [
      `Nothing ${open.length ? "asked for" : "here"} can carry this offer.`,
      ...closed.map((c) => `${VERSION_CHANNEL_WORDS[c.channel]} cannot: ${whyOf(c.why)}`),
      ...open.map((c) => `${VERSION_CHANNEL_WORDS[c]} can carry it: name it, or leave channels out.`),
      ...(open.length ? [] : [`${CHANNEL_WORDS.noOffersByText} Say so, and what to set up first.`]),
    ].join(" "),
  noChannelNamed:
    "channels names no channel: name WhatsApp, email or both, or leave channels out for every one the workspace sends offers on.",
  /** Texts asked for alone: never a channel an offer goes by, whatever the workspace can send. */
  textOnly: `${CHANNEL_WORDS.noOffersByText} An offer goes by WhatsApp or email: say so, and name either, or leave channels out for every one the workspace sends offers on.`,
  noOffersList:
    "who is not a list this workspace has: name one people with action lists gives, or leave who out for everyone who can receive offers.",
  journeyUnread: JOURNEY_PLAN_WORDS.journeyUnread,
  /** A read the plan is made against that failed (Task 17's world): never a plan on a guess of what it would have said. */
  channelsUnread: unreadWords("Which channels can send"),
  libraryUnread: unreadWords("The message library"),
  playbooksUnread: unreadWords("The campaigns, and so whether the month's offer runs,"),
  listsUnread: unreadWords("The lists an offer goes to"),
  notesUnread: unreadWords("The receptionist's notes"),
  nothingToCover: JOURNEY_PLAN_WORDS.nothingToCover,
  /** What an offer is called: the receptionist's note, the send and the campaign. */
  offerTitle: (words: string): string => `Offer: ${words}`,
  /** What the receptionist's note says: the offer as the message says it, its dates, and what it is for. */
  noteText: (line: string, from: string, until: string, service: string | null): string =>
    `The offer: ${line} It runs from ${from} to ${until}.${service ? ` It is for ${service}.` : ""}`,
  /** That message, WhatsApp the one channel it goes by: no twin; email named where open (never channels left out). */
  reviewRefused: (name: string, emailOpen: boolean): string =>
    `“${name}”, the one message here that carries an offer, waits on WhatsApp's review of its WhatsApp version, and WhatsApp is the one channel ${emailOpen ? "asked for" : "this offer may go by"}: say so, and ${emailOpen ? "that email can carry it now (name it), or " : ""}ask again once WhatsApp has reviewed it.`,
  notOffered: JOURNEY_PLAN_WORDS.notOffered,
  /**
   * What a card says of what an earlier step of its plan makes, named by its token (`@step:n`): not filed yet, so not
   * quoted, and filled in by the commit once that step is approved.
   */
  stepMessage: (n: number): string => `the message made by step ${n}`,
  stepCampaign: (n: number): string => `the campaign made by step ${n}`,
  /** A change to a campaign a step makes: what is said without the campaign's row (its other fields are its step's). */
  stepChangeOnly: (n: number): string =>
    `A change to the campaign made by step ${n} takes state paused, params or until: the rest is the step's own to say.`,
  why: {
    message: "None of your messages carries an offer on every channel this one goes by.",
    // What the note does, never what the receptionist will say of it: a discount in a reply is a person's whatever the
    // price switch says (decision 0051, price-allowance.ts), so the reply that names it may be held for one.
    note: "So the receptionist knows the offer and when it runs.",
    pause: "So nobody gets the month's offer and this one.",
    first: "The offer, on its first day.",
    paced: "The offer, as fast as the calendar can take it.",
    stage: JOURNEY_PLAN_WORDS.whyStage,
    resume: JOURNEY_PLAN_WORDS.whyResume,
  },
} as const;
const SAY = PLAN_WORDS;

/* ------------------------------------------------------------------ the steps */

/** Steps numbered as they are added; a send waits for every silent step before it. */
function planSteps() {
  const steps: PlanStep[] = [];
  const add = (kind: StepKind, input: Record<string, unknown>, why: string): number => {
    const n = steps.length + 1;
    const after = SILENT[kind] ? [] : steps.filter((s) => s.silent).map((s) => s.n);
    steps.push({ n, kind, silent: SILENT[kind], input, why, after });
    return n;
  };
  return { steps, add };
}

/** The first of `named(1)`, `named(2)`, … that is not taken. */
function firstFree(named: (i: number) => string, taken: (name: string) => boolean): string {
  for (let i = 1; ; i += 1) {
    const name = named(i);
    if (!taken(name)) return name;
  }
}

/** A list's token as a broadcast names its audience: a People list by its id, one of the workspace's own as saved. */
function audienceOf(token: string): Audience | null {
  const ref = parseListToken(token);
  if (!ref) return null;
  return { audience_kind: ref.kind === "builtin" ? "list" : "saved", audience_id: ref.id };
}

/* ------------------------------------------------------------------ an offer */

interface OfferDates {
  today: string;
  from: string;
  until: string;
  /** Ten o'clock on `from`, or null where that has passed (today, after ten): the send goes at Approve. */
  firstAt: number | null;
  /** The first and last day as the receptionist's note says them. */
  fromWords: string;
  untilWords: string;
  /** The same as the plan's words say them, in the question's language. */
  fromSaid: string;
  untilSaid: string;
}

/** The offer's days, judged on the business's calendar by the judge a campaign's end is (localDate), or the refusal. */
function offerDates(offer: Offer, world: PlanWorld): OfferDates | { refused: string } {
  if (!isDayKey(offer.from) || !isDayKey(offer.until)) return { refused: SAY.notADay };
  if (offer.until < offer.from) return { refused: SAY.fromAfterUntil };
  const today = localDate(world.tz, world.now);
  if (offer.from < today) return { refused: SAY.fromPast };
  const at = wallClockAt(world.tz, offer.from, SEND_HOUR, 0);
  const S = OFFER_PLAN_WORDS[world.says];
  return {
    today,
    from: offer.from,
    until: offer.until,
    firstAt: at > world.now.getTime() ? at : null,
    fromWords: campaignDayWords(offer.from, world.tz, world.now),
    untilWords: campaignDayWords(offer.until, world.tz, world.now),
    fromSaid: S.day(offer.from, world.tz, world.now),
    untilSaid: S.day(offer.until, world.tz, world.now),
  };
}

/**
 * The channels the offer goes by (asked and open), those open but not asked, what the words say of the rest, and the
 * refusal where none is left: one open but not asked, to name, else every closed one's reason, asked for or not.
 */
function offerChannels(
  asked: readonly ConsentChannel[] | undefined,
  can: PlanWorld["channels"],
  S: Said,
): { on: OfferChannel[]; unasked: OfferChannel[]; said: string[]; refused: string } {
  const want: readonly ConsentChannel[] = asked ?? OFFER_CHANNELS;
  const shut = OFFER_CHANNELS.filter((c) => want.includes(c) && !can[c].ok);
  const unasked = OFFER_CHANNELS.filter((c) => !want.includes(c) && can[c].ok);
  const told = unasked.length ? shut : OFFER_CHANNELS.filter((c) => !can[c].ok);
  return {
    on: OFFER_CHANNELS.filter((c) => want.includes(c) && can[c].ok),
    unasked,
    said: [...(want.includes("sms") ? [S.noText] : []), ...shut.map((c) => S.without(c, can[c].why))],
    refused: SAY.noChannel(
      told.map((c) => ({ channel: c, why: can[c].why })),
      unasked,
    ),
  };
}

/** The owner's words as the offer's value: a sentence, as the starter's own example is. */
const offerLine = (words: string): string => {
  const t = words.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

/**
 * The offer's value as a message read on its first day says it: the owner's phrasing where every day it says reads true
 * then and it is not the ask itself, else the offer's words. Words that say a day reading wrong then ("next month") are
 * refused, by name: they title its note and its send too (broadcasts/offer-plan-words.ts dayReadWrong).
 */
function offerValue(offer: Offer, say: string | undefined, dates: OfferDates): { line: string } | { refused: string } {
  const wrong = (text: string) => dayReadWrong(text, dates.from, dates.until);
  const day = wrong(offer.words);
  if (day) return { refused: SAY.dayFromToday(day, dates.fromWords) };
  const own = say?.trim();
  return { line: offerLine(own && !isTheAsk(own) && !wrong(own) ? own : offer.words) };
}

/** A message's values in order: the offer where it types one, each other filled per person. */
const valuesOf = (slots: readonly Slot[], line: string): string[] =>
  [...slots].sort((a, b) => a.position - b.position).map((s) => (s.kind === "text" ? line : `@${s.kind}`));

/**
 * The month's offer starter's values in the workspace's language, numbered: their labels and kinds, "The offer" ("La
 * oferta") the one typed. One spelling of the offer's value: what a written message takes, and what a reused one must.
 */
function offerSlots(language: PlanWorld["language"]): Slot[] {
  const starter = starterByName("this_months_offer");
  if (!starter) throw new Error("the month's offer starter is gone from the starter set");
  return starterText(starter, messageLanguageCode(language)).slots.map((s, i) => ({
    position: i + 1,
    label: s.label,
    kind: s.kind,
  }));
}

type OfferMessage =
  | { made: false; name: string; id: string; params: string[]; inReview: boolean }
  | { made: true; name: string; input: Record<string, unknown>; params: string[] };

/** A message's version on a channel that a send can go by: one in `states` (LIVE, or SENDS_NOW for WhatsApp's). */
const versionOn = (m: MessageRead, c: OfferChannel, states: ReadonlySet<string>) =>
  m.versions.find((v) => v.channel === c && states.has(v.state));

/**
 * The messages that carry an offer, best first: a marketing one in the workspace's language whose one typed value is the
 * offer's (the starter's "The offer", by its label), every other filled per person, with a version a send can go by on
 * every channel the offer goes by (its WhatsApp version approved where `held`, the send held for its review), and no
 * starter the set retired; the starter first, then one a plan wrote, then the Library's order.
 */
function offerFits(world: PlanWorld, on: readonly OfferChannel[], held: boolean): MessageRead[] {
  const offer = offerSlots(world.language).find((s) => s.kind === "text");
  const takes = (m: MessageRead) => {
    const typed = m.slots.filter((s) => s.kind === "text");
    return (
      typed.length === 1 &&
      typed.every((s) => s.label === offer?.label) &&
      m.slots.every((s) => s.kind === "text" || PER_PERSON.has(s.kind))
    );
  };
  const states = (c: OfferChannel) => (held && c === "whatsapp" ? SENDS_NOW : LIVE);
  const fits = world.messages.filter(
    (m) =>
      // A starter the set replaced is never sent anew (the earlier month's offer carries the same offer value).
      !starterByName(m.name)?.retired &&
      m.category === "marketing" &&
      languageBase(m.language) === world.language &&
      takes(m) &&
      on.every((c) => versionOn(m, c, states(c))),
  );
  const rank = (m: MessageRead) => (m.name === "this_months_offer" ? 0 : WRITTEN_NAME.test(m.name) ? 1 : 2);
  return [...fits].sort((a, b) => rank(a) - rank(b));
}

/**
 * A message that fits (offerFits), reused: its id is its version on the first channel the offer goes by, and it is in
 * review where the WhatsApp version it would send still is.
 */
function reusedMessage(m: MessageRead, on: readonly OfferChannel[], line: string): OfferMessage {
  const version = on.map((c) => versionOn(m, c, LIVE)).find((v) => v !== undefined);
  if (!version) throw new Error(`a message that fits has a version on ${on.join(", ")}: ${m.name}`);
  return {
    made: false,
    name: m.name,
    id: version.id,
    params: valuesOf(m.slots, line),
    inReview: on.includes("whatsapp") && versionOn(m, "whatsapp", LIVE)?.state === "pending",
  };
}

/**
 * A new message for offers, in the shape a plan reuses: the starter's values (offerSlots), OFFER_MESSAGE's words, a
 * WhatsApp version and an email version where the offer goes by each. Its sends type the owner's words into the offer's
 * value, so the next offer sends the same message with its own. Named for what it is, "offer", under a name the Library
 * does not hold.
 */
function writtenMessage(world: PlanWorld, on: readonly OfferChannel[], line: string): OfferMessage {
  const slots = offerSlots(world.language);
  const words = OFFER_MESSAGE[world.language];
  const versions = {
    ...(on.includes("whatsapp") ? { whatsapp: { body: words.whatsapp } } : {}),
    ...(on.includes("email") ? { email: { subject: words.subject, body: words.email } } : {}),
  };
  const held = new Set(world.messages.map((m) => m.name));
  const name = firstFree(
    (i) => (i === 1 ? "offer" : `offer_${i}`),
    (n) => held.has(n) || starterByName(n) !== null,
  );
  return {
    made: true,
    name,
    input: { name, language: world.language, category: "marketing", versions, slots },
    params: valuesOf(slots, line),
  };
}

/**
 * The offer's message for a send of `kind` by `on`, the channels it then goes by and what the words say of it: one that
 * fits reused, else one written. A send WhatsApp's review holds (sendWaitsForReview) is refused at its press while its
 * WhatsApp version is in review, so it reuses one approved; where the one that fits is still in review, no twin is
 * written beside it: the offer goes by its other channel without WhatsApp, and says why, or is refused where WhatsApp is
 * its one channel, to be asked again once WhatsApp has reviewed it (or by email, where email is open but not asked for).
 */
function offerMessage(
  world: PlanWorld,
  on: OfferChannel[],
  line: string,
  kind: "broadcast" | "playbook",
  unasked: readonly OfferChannel[],
): { message: OfferMessage; on: OfferChannel[]; said: string[] } | { refused: string } {
  const held = sendWaitsForReview(kind, on);
  const [ready] = offerFits(world, on, held);
  if (ready) return { message: reusedMessage(ready, on, line), on, said: [] };
  const [waiting] = held ? offerFits(world, on, false) : [];
  if (!waiting) return { message: writtenMessage(world, on, line), on, said: [] };
  const rest = on.filter((c) => c !== "whatsapp");
  if (rest.length === 0) return { refused: SAY.reviewRefused(waiting.name, unasked.includes("email")) };
  const S = OFFER_PLAN_WORDS[world.says];
  return {
    message: reusedMessage(waiting, rest, line),
    on: rest,
    said: [S.without("whatsapp", S.reviewing(waiting.name))],
  };
}

/** The receptionist's note about the offer, or null where one of that title already ends on the offer's last day. */
function offerNote(
  offer: Offer,
  line: string,
  dates: OfferDates,
  notes: readonly Note[],
): Record<string, unknown> | null {
  const title = clip(SAY.offerTitle(offer.words), PROFILE_LIMITS.noteTitle);
  if (notes.some((n) => n.title === title && n.until === dates.until)) return null;
  const service = offer.service?.trim().replace(/[.!?…]+$/, "") || null;
  const text = SAY.noteText(line, dates.fromWords, dates.untilWords, service);
  return { change: { op: "add_note", title, text: clip(text, PROFILE_LIMITS.noteText), until: dates.until } };
}

/**
 * Every running month's offer, paused while the offer runs: on its own cadence it would send this offer, or its own,
 * beside the plan's send, and go on after the offer ends. The words say to resume it after. One past its last day on the
 * business's calendar sends nothing however its state reads (contracts campaignEnded, core run-playbook's judge), so it
 * is left alone, never paused to be resumed.
 */
function monthsOfferPauses(world: PlanWorld, until: string): { input: Record<string, unknown>; said: string }[] {
  // Running by the one rule (campaignRunsOn); a month's offer is no proposal's, so deals do not decide it.
  const at = { tz: world.tz, now: world.now, dealsOn: false };
  return world.playbooks
    .filter((p) => p.trigger === "everyone_monthly" && campaignRunsOn(p, at))
    .map((p) => ({
      input: { playbook_id: p.id, state: "paused" },
      said: OFFER_PLAN_WORDS[world.says].monthsOfferPaused(p.name, until),
    }));
}

/**
 * The day the words say to ask for a reminder: nineteen days in, or the offer's last day where it ends sooner. None
 * where that is its first day, where the offer is paced (its campaign reaches everyone as the calendar can take them),
 * or where no calendar can say who booked.
 */
function reminderDay(world: PlanWorld, dates: OfferDates, paced: boolean): string | null {
  if (paced || !world.journey?.some((s) => s.id === "before" || s.id === "after")) return null;
  const nineteen = shiftKey(dates.from, REMINDER_AFTER_DAYS);
  const day = nineteen <= dates.until ? nineteen : dates.until;
  return day > dates.from ? day : null;
}

/** Everything an offer's plan is made of, read and judged before a step is numbered. */
interface OfferRead {
  offer: Offer;
  dates: OfferDates;
  on: OfferChannel[];
  onSaid: string[];
  audience: ListEntry;
  to: Audience;
  message: OfferMessage;
  /** The calendar's room and the audience, where it has less room than half of it; null where it has more or is not known. */
  tight: { room: Room; audience: number } | null;
  /** The paced campaign's cap, where the room is tight and the offer starts today; null where the offer is a broadcast. */
  cap: number | null;
  /** What the send is: the paced campaign (a playbook) where there is a cap, else the broadcast. */
  kind: "broadcast" | "playbook";
  /** The day to ask for a reminder, or null. */
  reminder: string | null;
  note: ReturnType<typeof receptionistNote>;
  pauses: ReturnType<typeof monthsOfferPauses>;
}

/**
 * The receptionist's note as a step, where the receptionist lacks it and the member asking may approve one, and what
 * the plan says of it: made, already held, or left for an owner or a partner to add (PlanWorld.canNote).
 */
function receptionistNote(
  offer: Offer,
  line: string,
  dates: OfferDates,
  world: PlanWorld,
): { input: Record<string, unknown> | null; said: string } {
  const S = OFFER_PLAN_WORDS[world.says];
  const input = offerNote(offer, line, dates, world.notes);
  if (!input) return { input: null, said: S.noteKnown };
  return world.canNote ? { input, said: S.noteMade(dates.untilSaid) } : { input: null, said: S.noteLeftOut };
}

function offerRead(offer: Offer, say: string | undefined, world: PlanWorld): OfferRead | { refused: string } {
  if (!offer.words.trim()) return { refused: SAY.noWords };
  const dates = offerDates(offer, world);
  if ("refused" in dates) return dates;
  if (offer.channels?.length === 0) return { refused: SAY.noChannelNamed };
  // Texts alone: no channel the workspace could set up would carry it, so not "nothing here can carry an offer".
  if (offer.channels?.every((c) => c === "sms")) return { refused: SAY.textOnly };
  const channels = offerChannels(offer.channels, world.channels, OFFER_PLAN_WORDS[world.says]);
  if (channels.on.length === 0) return { refused: channels.refused };
  const audience = world.lists.find((l) => l.token === (offer.who ?? world.offersList));
  const to = audience ? audienceOf(audience.token) : null;
  if (!audience || !to) return { refused: SAY.noOffersList };
  const value = offerValue(offer, say, dates);
  if ("refused" in value) return value;
  const { line } = value;
  const room = world.room;
  // Room not known is never full (calendar.room's none, or a calendar with no slot either way).
  const tight =
    room && audience.count !== null && room.open * 2 < audience.count ? { room, audience: audience.count } : null;
  // The room is counted over the days from now and a campaign sends from its Approve: an offer is paced to it only on
  // its first day. One that starts later is its broadcast to the whole list, and the words say how to pace it instead.
  const cap = tight && dates.from === dates.today ? capOf(tight.room) : null;
  // The message once the send's kind is known: whether WhatsApp's review holds it decides which versions it may reuse.
  const kind = cap === null ? "broadcast" : "playbook";
  const picked = offerMessage(world, channels.on, line, kind, channels.unasked);
  if ("refused" in picked) return picked;
  return {
    offer,
    dates,
    on: picked.on,
    onSaid: [...channels.said, ...picked.said],
    audience,
    to,
    message: picked.message,
    tight,
    cap,
    kind,
    reminder: reminderDay(world, dates, cap !== null),
    note: receptionistNote(offer, line, dates, world),
    pauses: monthsOfferPauses(world, dates.untilSaid),
  };
}

/** A WhatsApp version the send goes by still to be reviewed: the one the plan writes, or one in review it reuses. */
const awaitsReview = (r: OfferRead): boolean => r.on.includes("whatsapp") && (r.message.made || r.message.inReview);

/** What no card says of the send: the room, WhatsApp's review of a paced campaign by email too, the reminder's day. */
function sendUnseen(r: OfferRead, world: PlanWorld): string[] {
  const S = OFFER_PLAN_WORDS[world.says];
  const room = r.tight
    ? [
        r.cap !== null
          ? S.paced(r.tight.room, r.tight.audience, r.cap)
          : S.roomTight(r.tight.room, r.tight.audience, r.dates.fromSaid),
      ]
    : [];
  return [
    ...room,
    ...(awaitsReview(r) && !sendWaitsForReview(r.kind, r.on) ? [S.whatsappReview] : []),
    ...(r.reminder ? [S.reminderAsk(S.day(r.reminder, world.tz, world.now), r.audience.name)] : []),
  ];
}

/** The broadcast's day and hour, which its card shows: none for the paced campaign, whose words say it starts at Approve. */
function sendDay(r: OfferRead, S: Said): string[] {
  if (r.cap !== null) return [];
  const hour = S.hour(SEND_HOUR);
  return [
    r.dates.firstAt === null
      ? S.firstAtApprove(r.audience.name, hour)
      : S.firstSend(r.audience.name, r.dates.fromSaid, hour),
  ];
}

function offerPlan(r: OfferRead, world: PlanWorld): { steps: PlanStep[]; words: string } {
  const { steps, add } = planSteps();
  const template_id = r.message.made ? stepToken(add("message", r.message.input, SAY.why.message)) : r.message.id;
  if (r.note.input) add("note", r.note.input, SAY.why.note);
  for (const p of r.pauses) add("change", p.input, SAY.why.pause);
  const sends = { template_id, params: r.message.params };
  const title = SAY.offerTitle(r.offer.words);
  if (r.cap !== null)
    add(
      "playbook",
      {
        trigger: "saved_list",
        list: r.audience.token,
        policy_class: "campaign",
        ...sends,
        cap_per_run: r.cap,
        name: clip(title, PLAYBOOK_NAME_MAX),
        channels: r.on,
        until: r.dates.until,
      },
      SAY.why.paced,
    );
  else
    add(
      "broadcast",
      {
        ...sends,
        ...r.to,
        ...(r.dates.firstAt === null ? {} : { scheduled_for: new Date(r.dates.firstAt).toISOString() }),
        name: clip(title, BROADCAST_NAME_MAX),
        channels: r.on,
      },
      SAY.why.first,
    );
  // What no card carries first, then what the cards show: the answer's detail, cut at 700 characters, keeps the first.
  const S = OFFER_PLAN_WORDS[world.says];
  const words = [
    ...r.onSaid,
    ...(r.note.input ? [] : [r.note.said]),
    ...r.pauses.map((p) => p.said),
    ...sendUnseen(r, world),
    // A send WhatsApp's review holds, approved once it is reviewed, as its card says too (plan-steps.ts reviewedStep).
    ...(awaitsReview(r) && sendWaitsForReview(r.kind, r.on) ? [S.reviewFirst] : []),
    r.message.made ? S.writeMessage(r.message.name, r.on) : S.reuseMessage(r.message.name),
    ...(r.note.input ? [r.note.said] : []),
    ...sendDay(r, S),
  ];
  return { steps, words: words.join(" ") };
}

/* ------------------------------------------------------------------ the plan */

/**
 * The steps of an intent against the workspace as it stands, what the plan says, and, for a setup that waits on
 * something, what its answer leads with; or why there is no plan.
 */
export function planOf(
  intent: PlanIntent,
  world: PlanWorld,
): { steps: PlanStep[]; words: string; lead?: PlanLead | null } | { refused: string } {
  if (intent.intent === "cover_journey") return journeyPlan(intent, world);
  const read = offerRead(intent.offer, intent.say, world);
  return "refused" in read ? read : offerPlan(read, world);
}
