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
 *                 offer goes by, is reused: the starter first, then one a plan wrote ("offer"), then any other; else one
 *                 is written in that shape (OFFER_MESSAGE, in words that fit any dated offer), so the next offer reuses
 *                 it, with a version per channel the workspace sends offers on (WhatsApp with a number, email where email
 *                 sends offers, never a text: texts carry no offers); every send types the owner's words into its offer
 *   the note      "Offer: {words}", with the dates, until the offer's last day, unless the receptionist has it
 *   the send      at ten on the business's clock on `from` (at Approve where ten has passed today)
 *   the month's   a running one is paused while the offer runs, so nobody gets two offers and it never sends this one
 *   offer         on its own cadence or after the offer ends; the words say to resume it after
 *   the pace      an offer that starts today, on a calendar with fewer open slots ahead than half the audience, goes as
 *                 a campaign instead, the open slots a day ahead as many a day, ending with the offer; one that starts
 *                 later is a broadcast, and the words say the room is tight and to ask again on its day
 *   the reminder  never a step: a send enrols its people at its Approve, so who has not booked is known only on the
 *                 day. The words end on when to ask for it (nineteen days in, or the offer's last day), where a
 *                 calendar can say who booked
 *   the journey   a campaign on each moment not covered yet that the workspace can run, its moment's starter (the
 *                 review ask the day after, where the Library holds it); nothing for first contact, the receptionist's
 */
import { isDayKey, shiftKey } from "../calendar/day-keys";
import type { Note } from "../config/workspace-config/business-profile";
import { PROFILE_LIMITS } from "../config/workspace-config/config-rules";
import type { ConsentChannel } from "../consent/consent-channels";
import { BROADCAST_NAME_MAX } from "../broadcasts/broadcasts";
import { CHANNEL_WORDS } from "../broadcasts/reach-for";
import { JOURNEY_STAGE_IDS, journeyStageOf, type JourneyStageId } from "../journey/journey";
import { parseListToken } from "../people/lists/lists";
import { campaignDayWords, localDate } from "../playbooks/playbook-schedule";
import { PLAYBOOK_DEFAULTS, PLAYBOOK_LIMITS, PLAYBOOK_NAME_MAX } from "../playbooks/playbook-triggers";
import { clockHour, wallClockAt } from "../shared/clock";
import { DAY_MS } from "../shared/time";
import { joinWords, plural } from "../shared/words";
import { VERSION_CHANNEL_WORDS } from "../templates/message-versions";
import { SENDER_WORDS } from "../templates/sender-words";
import { starterByName, starterText } from "../templates/starter-lookup";
import { messageLanguageCode } from "../templates/starter-templates";
import { languageBase } from "../templates/template-languages";
import type { MessageRead } from "./ask";
import { clip } from "./ask-answer";
import { stepToken } from "./plan-steps";

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
  | { intent: "cover_journey"; stages?: JourneyStageId[] };

/** What a plan is made against: the workspace as Ask's reads see it at one moment (Task 17 reads it). */
export interface PlanWorld {
  now: Date;
  /** The business's zone: its today, and ten o'clock there. */
  tz: string;
  /** The language a message is written in, and a reused one is in. */
  language: "en" | "es";
  /** Whether the workspace can send an offer on each: a WhatsApp number connected; email set up to send offers. */
  channels: { whatsapp: boolean; email_offers: boolean };
  /** The Library, as campaigns with action messages reads it. */
  messages: MessageRead[];
  /** People's lists offered here and the workspace's own, each with its count (null: not counted). */
  lists: { token: string; name: string; count: number | null }[];
  /** The workspace's campaigns: the month's offer among them (trigger everyone_monthly). */
  playbooks: { id: string; name: string; trigger: string; state: string; template_name: string | null }[];
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

/** The hour a send goes at, by the business's clock: the hour a campaign runs at unless told otherwise. */
const SEND_HOUR = PLAYBOOK_DEFAULTS.runHour;
/** The day to ask for a reminder, this many days after the first send: the 20th of a month-long offer from the 1st. */
const REMINDER_AFTER_DAYS = 19;
/** The channels an offer may go by, in the order a message's versions are written. */
const OFFER_CHANNELS: readonly OfferChannel[] = ["whatsapp", "email"];
/** The value kinds a send fills per person, beside the one typed value that carries the offer. */
const PER_PERSON = new Set(["first_name", "business_name", "booking_link", "review_link"]);
/** A version a send can go by: approved, or still in WhatsApp's review. */
const LIVE = new Set(["approved", "pending"]);
/** A message a plan wrote: "offer", or "offer_2" where that name was held. */
const WRITTEN_NAME = /^offer(?:_\d+)?$/;
const SILENT: Record<StepKind, boolean> = {
  message: true,
  note: true,
  change: true,
  broadcast: false,
  playbook: false,
};

/** Each stage of the journey, as a sentence about when it sends says it. */
const STAGE_WORDS: Record<JourneyStageId, string> = {
  first_contact: "at first contact",
  before: "the day before an appointment",
  after: "the day after an appointment",
  proposal: "while a proposal waits",
  quiet: "once they go quiet",
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

const channelWord = (c: OfferChannel): string =>
  c === "whatsapp" ? VERSION_CHANNEL_WORDS.whatsapp : VERSION_CHANNEL_WORDS[c].toLowerCase();

/** "The calendar has 15 open slots in the next 14 days for 40 people". */
const roomWords = (room: Room, audience: number): string =>
  `The calendar has ${room.open > 0 ? plural(room.open, "open slot") : "no open slot"} in the next ${plural(room.days, "day")} for ${plural(audience, "person", "people")}`;

/** A campaign's pace: the open slots a day ahead, rounded up, within what a campaign's cap may be. */
const capOf = (room: Room): number =>
  Math.min(
    PLAYBOOK_LIMITS.cap_per_run.max,
    Math.max(PLAYBOOK_LIMITS.cap_per_run.min, Math.ceil(room.open / Math.max(1, room.days))),
  );

/**
 * What a plan says. Its refusals are the model's to say back (each ends on what to do); its words and each step's why
 * are the person's. WhatsApp's review is WhatsApp's.
 */
export const PLAN_WORDS = {
  noOffer:
    "intent offer takes offer: its words, from and until, the offer's first and last day. Ask what the offer is and when it runs.",
  noWords: "words is the offer in the owner's words: ask what the offer is.",
  notADay: "from and until are days on the business's calendar, written YYYY-MM-DD: ask for them again.",
  fromAfterUntil: "until comes before from: an offer's last day is its first day or later. Ask which dates they meant.",
  fromPast:
    "from is a day already past on the business's calendar: an offer starts today or later. Ask when it starts.",
  noChannel:
    "Nothing here can carry an offer: WhatsApp needs a connected number, email needs email set up to send offers, and texts carry no offers. Say so, and what to set up first.",
  noChannelNamed:
    "channels names no channel: name WhatsApp, email or both, or leave channels out for every one the workspace sends offers on.",
  /** Texts asked for alone: never a channel an offer goes by, whatever the workspace can send. */
  textOnly: `${CHANNEL_WORDS.noOffersByText} An offer goes by WhatsApp or email: say so, and name either, or leave channels out for every one the workspace sends offers on.`,
  noOffersList:
    "who is not a list this workspace has: name one people with action lists gives, or leave who out for everyone who can receive offers.",
  journeyUnread:
    "The journey could not be read just now, so which moments are covered is not known: say so, and try again in a moment.",
  nothingToCover:
    "Every moment asked for is covered already or not offered here (an appointment's moments need a calendar connected, a proposal's needs deals on): say so, and propose nothing.",
  /** What an offer is called: the receptionist's note, the send and the campaign. */
  offerTitle: (words: string): string => `Offer: ${words}`,
  /** What the receptionist's note says: the offer as the message says it, its dates, and what it is for. */
  noteText: (line: string, from: string, until: string, service: string | null): string =>
    `The offer: ${line} It runs from ${from} to ${until}.${service ? ` It is for ${service}.` : ""}`,
  reuseMessage: (name: string): string => `Sends “${name}”, already in the Library, with the offer in its words.`,
  writeMessage: (name: string, on: readonly OfferChannel[]): string =>
    `Writes a message for offers, “${name}”, for ${joinWords(on.map(channelWord))}: this offer goes in its words, and the next offer can send it too.`,
  withoutWhatsApp: "It goes without WhatsApp: no WhatsApp number is connected.",
  withoutEmail: "It goes without email: email is not set up to send offers.",
  noText: CHANNEL_WORDS.noOffersByText,
  noteMade: (until: string): string => `Tells the receptionist about the offer, until ${until}.`,
  noteKnown: "The receptionist already has a note about the offer.",
  /** The pause is a silent step: it applies at the plan's Approve, not on the offer's first day. */
  monthsOfferPaused: (name: string, until: string): string =>
    `Pauses the month's offer, “${name}”, from when you approve it, so nobody gets two offers; resume it after ${until}.`,
  firstSend: (list: string, day: string, at: string): string => `The offer goes to “${list}” on ${day} at ${at}.`,
  firstAtApprove: (list: string, at: string): string =>
    `The offer goes to “${list}” when you approve it, as ${at} today has passed.`,
  /** An offer that starts today, on a calendar with less room than half its audience: a campaign, from its Approve. */
  paced: (room: Room, audience: number): string =>
    `${roomWords(room, audience)}, so the offer goes as a campaign: up to ${capOf(room)} a day, each person once, until it ends, starting when you approve it.`,
  /** The same room for an offer that starts later: the room counted now is not the offer's, so it is asked again then. */
  roomTight: (room: Room, audience: number, from: string): string =>
    `${roomWords(room, audience)}: ask again on ${from} to pace the offer to the room then.`,
  whatsappReview:
    "Its WhatsApp version waits on WhatsApp's review, which may still be running at the first send: whoever it reaches on WhatsApp waits for it.",
  /** The reminder is a question of its own on its day, when who has booked is known: a send counts its people at its Approve. */
  reminderAsk: (day: string, list: string): string =>
    `On ${day}, ask me to send a reminder to whoever on “${list}” has not booked by then: that is its own question on the day, when who has booked is known.`,
  cover: (n: number): string =>
    `Starts ${plural(n, "campaign")}, one on each moment not covered yet, each its own card.`,
  notOffered: (stages: readonly string[]): string => `Not offered here: ${joinWords(stages)}.`,
  pausedOn: (name: string): string => `“${name}” stands paused on its moment: resume it from its drawer.`,
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
    message: "No message in the Library carries an offer on every channel this one goes by.",
    note: "So the receptionist can answer about the offer.",
    pause: "So nobody gets the month's offer and this one.",
    first: "The offer, on its first day.",
    paced: "The offer, as fast as the calendar can take it.",
    stage: (id: JourneyStageId): string => `Nobody hears from you ${STAGE_WORDS[id]} yet.`,
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
  fromWords: string;
  untilWords: string;
}

/** The offer's days, judged on the business's calendar by the judge a campaign's end is (localDate), or the refusal. */
function offerDates(offer: Offer, world: PlanWorld): OfferDates | { refused: string } {
  if (!isDayKey(offer.from) || !isDayKey(offer.until)) return { refused: SAY.notADay };
  if (offer.until < offer.from) return { refused: SAY.fromAfterUntil };
  const today = localDate(world.tz, world.now);
  if (offer.from < today) return { refused: SAY.fromPast };
  const at = wallClockAt(world.tz, offer.from, SEND_HOUR, 0);
  return {
    today,
    from: offer.from,
    until: offer.until,
    firstAt: at > world.now.getTime() ? at : null,
    fromWords: campaignDayWords(offer.from, world.tz, world.now),
    untilWords: campaignDayWords(offer.until, world.tz, world.now),
  };
}

/** The channels the offer goes by (asked, of those the workspace sends offers on), and what the words say of the rest. */
function offerChannels(
  asked: readonly ConsentChannel[] | undefined,
  can: PlanWorld["channels"],
): { on: OfferChannel[]; said: string[] } {
  const want: readonly ConsentChannel[] = asked ?? OFFER_CHANNELS;
  const ready: Record<OfferChannel, boolean> = { whatsapp: can.whatsapp, email: can.email_offers };
  return {
    on: OFFER_CHANNELS.filter((c) => want.includes(c) && ready[c]),
    said: [
      ...(want.includes("sms") ? [SAY.noText] : []),
      ...(want.includes("whatsapp") && !can.whatsapp ? [SAY.withoutWhatsApp] : []),
      ...(want.includes("email") && !can.email_offers ? [SAY.withoutEmail] : []),
    ],
  };
}

/** The owner's words as the offer's value: a sentence, as the starter's own example is. */
const offerLine = (words: string): string => {
  const t = words.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

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

/**
 * The message to reuse: a marketing one in the workspace's language whose one typed value is the offer's (the
 * starter's "The offer", by its label), every other filled per person, with a live version on every channel the offer
 * goes by, and no starter the set retired; the starter first, then one a plan wrote, then the Library's order. Its id is
 * its version on the first of those channels, and it is in review where the WhatsApp version it would send still is.
 */
function reusedMessage(world: PlanWorld, on: readonly OfferChannel[], line: string): OfferMessage | null {
  const offer = offerSlots(world.language).find((s) => s.kind === "text");
  const takes = (m: MessageRead) => {
    const typed = m.slots.filter((s) => s.kind === "text");
    return (
      typed.length === 1 &&
      typed.every((s) => s.label === offer?.label) &&
      m.slots.every((s) => s.kind === "text" || PER_PERSON.has(s.kind))
    );
  };
  const versionOn = (m: MessageRead, c: OfferChannel) => m.versions.find((v) => v.channel === c && LIVE.has(v.state));
  const fits = world.messages.filter(
    (m) =>
      // A starter the set replaced is never sent anew (the earlier month's offer carries the same offer value).
      !starterByName(m.name)?.retired &&
      m.category === "marketing" &&
      languageBase(m.language) === world.language &&
      takes(m) &&
      on.every((c) => versionOn(m, c)),
  );
  const rank = (m: MessageRead) => (m.name === "this_months_offer" ? 0 : WRITTEN_NAME.test(m.name) ? 1 : 2);
  const m = [...fits].sort((a, b) => rank(a) - rank(b)).at(0);
  const version = m ? on.map((c) => versionOn(m, c)).find((v) => v !== undefined) : undefined;
  if (!m || !version) return null;
  return {
    made: false,
    name: m.name,
    id: version.id,
    params: valuesOf(m.slots, line),
    inReview: on.includes("whatsapp") && versionOn(m, "whatsapp")?.state === "pending",
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
 * beside the plan's send, and go on after the offer ends. The words say to resume it after.
 */
function monthsOfferPauses(world: PlanWorld, until: string): { input: Record<string, unknown>; said: string }[] {
  return world.playbooks
    .filter((p) => p.trigger === "everyone_monthly" && p.state === "running")
    .map((p) => ({ input: { playbook_id: p.id, state: "paused" }, said: SAY.monthsOfferPaused(p.name, until) }));
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
  /** The day to ask for a reminder, or null. */
  reminder: string | null;
  note: Record<string, unknown> | null;
  pauses: ReturnType<typeof monthsOfferPauses>;
}

function offerRead(offer: Offer, say: string | undefined, world: PlanWorld): OfferRead | { refused: string } {
  if (!offer.words.trim()) return { refused: SAY.noWords };
  const dates = offerDates(offer, world);
  if ("refused" in dates) return dates;
  if (offer.channels?.length === 0) return { refused: SAY.noChannelNamed };
  // Texts alone: no channel the workspace could set up would carry it, so not "nothing here can carry an offer".
  if (offer.channels?.every((c) => c === "sms")) return { refused: SAY.textOnly };
  const { on, said: onSaid } = offerChannels(offer.channels, world.channels);
  if (on.length === 0) return { refused: SAY.noChannel };
  const audience = world.lists.find((l) => l.token === (offer.who ?? world.offersList));
  const to = audience ? audienceOf(audience.token) : null;
  if (!audience || !to) return { refused: SAY.noOffersList };
  const line = offerLine(say?.trim() ? say : offer.words);
  const message = reusedMessage(world, on, line) ?? writtenMessage(world, on, line);
  const room = world.room;
  // Room not known is never full (calendar.room's none, or a calendar with no slot either way).
  const tight =
    room && audience.count !== null && room.open * 2 < audience.count ? { room, audience: audience.count } : null;
  // The room is counted over the days from now and a campaign sends from its Approve: an offer is paced to it only on
  // its first day. One that starts later is its broadcast, and the words say to ask again then.
  const cap = tight && dates.from === dates.today ? capOf(tight.room) : null;
  return {
    offer,
    dates,
    on,
    onSaid,
    audience,
    to,
    message,
    tight,
    cap,
    reminder: reminderDay(world, dates, cap !== null),
    note: offerNote(offer, line, dates, world.notes),
    pauses: monthsOfferPauses(world, dates.untilWords),
  };
}

/** What the plan says of its send: the broadcast (or the paced campaign), WhatsApp's review, and when to ask for a reminder. */
function sendWords(r: OfferRead, world: PlanWorld): string[] {
  const hour = clockHour(SEND_HOUR);
  const first =
    r.tight && r.cap !== null
      ? [SAY.paced(r.tight.room, r.tight.audience)]
      : [
          r.dates.firstAt === null
            ? SAY.firstAtApprove(r.audience.name, hour)
            : SAY.firstSend(r.audience.name, r.dates.fromWords, hour),
          ...(r.tight ? [SAY.roomTight(r.tight.room, r.tight.audience, r.dates.fromWords)] : []),
        ];
  // A WhatsApp version still to be reviewed and a first send under a day away: WhatsApp's review may still be running.
  const reviewing = r.on.includes("whatsapp") && (r.message.made || r.message.inReview);
  const soon = (r.dates.firstAt ?? world.now.getTime()) - world.now.getTime() < DAY_MS;
  return [
    ...first,
    ...(reviewing && soon ? [SAY.whatsappReview] : []),
    ...(r.reminder ? [SAY.reminderAsk(campaignDayWords(r.reminder, world.tz, world.now), r.audience.name)] : []),
  ];
}

function offerPlan(r: OfferRead, world: PlanWorld): { steps: PlanStep[]; words: string } {
  const { steps, add } = planSteps();
  const template_id = r.message.made ? stepToken(add("message", r.message.input, SAY.why.message)) : r.message.id;
  if (r.note) add("note", r.note, SAY.why.note);
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
  const words = [
    r.message.made ? SAY.writeMessage(r.message.name, r.on) : SAY.reuseMessage(r.message.name),
    ...r.onSaid,
    r.note ? SAY.noteMade(r.dates.untilWords) : SAY.noteKnown,
    ...r.pauses.map((p) => p.said),
    ...sendWords(r, world),
  ];
  return { steps, words: words.join(" ") };
}

/* ------------------------------------------------------------------ the journey */

/**
 * A campaign on a stage's moment: its starter, but the day after's review ask where the Library holds it in this
 * language, by a version it can go by (a live one; WhatsApp's only where a number is connected).
 */
function stageInput(id: JourneyStageId, moment: string, world: PlanWorld): Record<string, unknown> {
  const review =
    id === "after"
      ? world.messages.find((m) => m.name === "after_visit_review" && languageBase(m.language) === world.language)
      : undefined;
  const goes = (review?.versions ?? []).filter(
    (v) => LIVE.has(v.state) && (v.channel !== "whatsapp" || world.channels.whatsapp),
  );
  const version = goes.find((v) => v.channel === "whatsapp") ?? goes.at(0);
  return version ? { trigger: moment, template_id: version.id } : { trigger: moment };
}

function journeyPlan(
  stages: readonly JourneyStageId[] | undefined,
  world: PlanWorld,
): { steps: PlanStep[]; words: string } | { refused: string } {
  const journey = world.journey;
  if (!journey) return { refused: SAY.journeyUnread };
  const { steps, add } = planSteps();
  const missing: string[] = [];
  const paused: string[] = [];
  for (const id of JOURNEY_STAGE_IDS) {
    if (id === "first_contact" || (stages && !stages.includes(id))) continue;
    const stage = journey.find((s) => s.id === id);
    if (!stage) {
      if (stages) missing.push(STAGE_WORDS[id]);
      continue;
    }
    if (stage.covered || !stage.moment) continue;
    // A campaign paused on the moment is resumed from its drawer, never doubled.
    const held = world.playbooks.find((p) => p.state === "paused" && journeyStageOf(p.trigger) === id);
    if (held) paused.push(SAY.pausedOn(held.name));
    else add("playbook", stageInput(id, stage.moment, world), SAY.why.stage(id));
  }
  const said = [...(missing.length ? [SAY.notOffered(missing)] : []), ...paused];
  if (steps.length === 0) return { refused: [SAY.nothingToCover, ...said].join(" ") };
  return { steps, words: [SAY.cover(steps.length), ...said].join(" ") };
}

/* ------------------------------------------------------------------ the plan */

/** The steps of an intent against the workspace as it stands, and what the plan says; or why there is no plan. */
export function planOf(
  intent: PlanIntent,
  world: PlanWorld,
): { steps: PlanStep[]; words: string } | { refused: string } {
  if (intent.intent === "cover_journey") return journeyPlan(intent.stages, world);
  const read = offerRead(intent.offer, intent.say, world);
  return "refused" in read ? read : offerPlan(read, world);
}
