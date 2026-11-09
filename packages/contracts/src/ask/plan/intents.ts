/** Plan: intents. */

import { isDayKey } from "../../shared/zone/day-keys";
import type { Note } from "../../config/workspace-config/business-profile";
import { PROFILE_LIMITS } from "../../config/workspace-config/config-rules";
import type { ConsentChannel } from "../../consent/channels";
import { OFFER_PLAN_WORDS, dayReadWrong, isTheAsk } from "../../campaigns/broadcasts/offer-plan-words";
import { CHANNEL_WORDS } from "../../campaigns/broadcasts/reach-for";
import type { AppointmentWord } from "../../journey/appointment-word";
import type { JourneyStageId } from "../../journey/journey";
import { JOURNEY_PLAN_WORDS } from "../../journey/plan";
import { parseListToken } from "../../people/lists/token";
import { campaignDayWords, localDate } from "../../campaigns/playbooks/schedule";
import { PLAYBOOK_DEFAULTS, PLAYBOOK_LIMITS } from "../../campaigns/playbooks/triggers/kinds";
import { wallClockAt } from "../../shared/clock";
import { LIVE_VERSION_STATES } from "../../campaigns/templates/message-versions/email-rules";
import { VERSION_CHANNEL_WORDS } from "../../campaigns/templates/message-versions/channels";
import { SENDER_WORDS } from "../../campaigns/templates/sender-words";
import { starterByName, starterText } from "../../campaigns/templates/starter-lookup";
import { messageLanguageCode } from "../../campaigns/templates/starter-templates/shapes";
import { languageBase } from "../../campaigns/templates/languages";
import type { MessageRead } from "../ask";
import { clip } from "../answer/shape";
import { sendWaitsForReview } from "../plan-steps";

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
       * their journey whether a deal was recorded yet or not, so a setup starts it.
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
   * booking tool's emails, or from neither (an appointment's moments run on the feed alone); whether a deal was ever
   * recorded here (a whole setup offers the proposal follow-up unasked only then); and what it calls an appointment.
   * What a setup says to connect first.
   */
  shape: { calendar: "feed" | "email" | "none"; hasDeals: boolean; word: AppointmentWord };
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
   * connected, a proposal's only where a deal was recorded or a campaign stands on it), each covered or not and the moment a campaign on it starts from
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
  /** What it does, in one sentence as the card says it (AskPlanStamp.does); a setup's steps have their own cards and say none. */
  does?: string;
}

type StepKind = PlanStep["kind"];

export type OfferChannel = "whatsapp" | "email";

export type Offer = Extract<PlanIntent, { intent: "offer" }>["offer"];

export type ListEntry = PlanWorld["lists"][number];

export type Room = NonNullable<PlanWorld["room"]>;

export type Audience = { audience_kind: "list" | "saved"; audience_id: string };

type Slot = { position: number; label: string; kind: string };

/** An offer's words for the person, in the question's language. */
export type Said = (typeof OFFER_PLAN_WORDS)[PlanWorld["says"]];

/** The hour a send goes at, by the business's clock: the hour a campaign runs at unless told otherwise. */
export const SEND_HOUR = PLAYBOOK_DEFAULTS.runHour;

/** The day to ask for a reminder, this many days after the first send: the 20th of a month-long offer from the 1st. */
export const REMINDER_AFTER_DAYS = 19;

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
const whyOf = (reason: string | null): string => OFFER_PLAN_WORDS.en.reason(reason);

/** A campaign's pace: the open slots a day ahead, rounded up, within what a campaign's cap may be. */
export const capOf = (room: Room): number =>
  Math.min(
    PLAYBOOK_LIMITS.cap_per_run.max,
    Math.max(PLAYBOOK_LIMITS.cap_per_run.min, Math.ceil(room.open / Math.max(1, room.days))),
  );

/** A plan refused for a read that failed: what could not be read, that nothing was proposed, and to ask again. */
const unreadWords = (text: string): string =>
  `${text} could not be read just now, so nothing was proposed: say so, and ask again in a moment.`;

/**
 * What a plan says in English: its refusals, the model's to say back in the question's language (each ends on what to
 * do), what its cards are titled and its note says, and each step's why. Its words for the person are an offer's
 * OFFER_PLAN_WORDS and a setup's own (journey/plan.ts), in the question's language. WhatsApp's review is WhatsApp's.
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

export const SAY = PLAN_WORDS;

/* ------------------------------------------------------------------ the steps */

/** Steps numbered as they are added; a send waits for every silent step before it. */
export function planSteps() {
  const steps: PlanStep[] = [];
  const add = (kind: StepKind, input: Record<string, unknown>, reason: string, does: string): number => {
    const n = steps.length + 1;
    const after = SILENT[kind] ? [] : steps.filter((s) => s.silent).map((s) => s.n);
    steps.push({ n, kind, silent: SILENT[kind], input, why: reason, after, does });
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
export function audienceOf(token: string): Audience | null {
  const ref = parseListToken(token);
  if (!ref) return null;
  return { audience_kind: ref.kind === "builtin" ? "list" : "saved", audience_id: ref.id };
}

/* ------------------------------------------------------------------ an offer */

export interface OfferDates {
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
export function offerDates(offer: Offer, world: PlanWorld): OfferDates | { refused: string } {
  if (!isDayKey(offer.from) || !isDayKey(offer.until)) return { refused: SAY.notADay };
  if (offer.until < offer.from) return { refused: SAY.fromAfterUntil };
  const today = localDate(world.tz, world.now);
  if (offer.from < today) return { refused: SAY.fromPast };
  const at = wallClockAt(world.tz, offer.from, SEND_HOUR, 0);
  const words = OFFER_PLAN_WORDS[world.says];
  return {
    today,
    from: offer.from,
    until: offer.until,
    firstAt: at > world.now.getTime() ? at : null,
    fromWords: campaignDayWords(offer.from, world.tz, world.now),
    untilWords: campaignDayWords(offer.until, world.tz, world.now),
    fromSaid: words.day(offer.from, world.tz, world.now),
    untilSaid: words.day(offer.until, world.tz, world.now),
  };
}

/**
 * The channels the offer goes by (asked and open), those open but not asked, what the words say of the rest, and the
 * refusal where none is left: one open but not asked, to name, else every closed one's reason, asked for or not.
 */
export function offerChannels(
  consentChannels: readonly ConsentChannel[] | undefined,
  can: PlanWorld["channels"],
  words: Said,
): { on: OfferChannel[]; unasked: OfferChannel[]; said: string[]; refused: string } {
  const want: readonly ConsentChannel[] = consentChannels ?? OFFER_CHANNELS;
  const shut = OFFER_CHANNELS.filter((c) => want.includes(c) && !can[c].ok);
  const unasked = OFFER_CHANNELS.filter((c) => !want.includes(c) && can[c].ok);
  const notice = unasked.length ? shut : OFFER_CHANNELS.filter((c) => !can[c].ok);
  return {
    on: OFFER_CHANNELS.filter((c) => want.includes(c) && can[c].ok),
    unasked,
    said: [...(want.includes("sms") ? [words.noText] : []), ...shut.map((c) => words.without(c, can[c].why))],
    refused: SAY.noChannel(
      notice.map((c) => ({ channel: c, why: can[c].why })),
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
 * refused, by name: they title its note and its send too (campaigns/broadcasts/offer-plan-words.ts dayReadWrong).
 */
export function offerValue(
  offer: Offer,
  say: string | undefined,
  dates: OfferDates,
): { line: string } | { refused: string } {
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

export type OfferMessage =
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
function reusedMessage(messageRead: MessageRead, on: readonly OfferChannel[], line: string): OfferMessage {
  const version = on.map((c) => versionOn(messageRead, c, LIVE)).find((v) => v !== undefined);
  if (!version) throw new Error(`a message that fits has a version on ${on.join(", ")}: ${messageRead.name}`);
  return {
    made: false,
    name: messageRead.name,
    id: version.id,
    params: valuesOf(messageRead.slots, line),
    inReview: on.includes("whatsapp") && versionOn(messageRead, "whatsapp", LIVE)?.state === "pending",
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
export function offerMessage(
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
  const words = OFFER_PLAN_WORDS[world.says];
  return {
    message: reusedMessage(waiting, rest, line),
    on: rest,
    said: [words.without("whatsapp", words.reviewing(waiting.name))],
  };
}

/** The receptionist's note about the offer, or null where one of that title already ends on the offer's last day. */
export function offerNote(
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
