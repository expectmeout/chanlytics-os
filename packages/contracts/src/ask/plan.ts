/**
 * A plan of Ask's, with no model (the marketing manager's spec §5.4, D3): the owner's intent, an offer ("10% off every
 * service all November") or the journey to cover, and a snapshot of the workspace (PlanWorld) give the steps, as data,
 * and nothing is read or written here. Each step is the input of one of Ask's own actions, which the server expands it
 * through as its own card (a message, a list, a note for the receptionist, a change to a campaign, a broadcast, a
 * campaign); a step that names what an earlier step makes carries its token (`@step:n`), which the commit fills from
 * what the plan made (resolveSteps). The steps that send nothing are silent and are approved together; a send is its
 * own press and waits for them (`after`).
 *
 * The rules, each a row of the table test (tooling/scripts/tests/ask/plan/plan-of.test.mjs):
 *
 *   the message   a marketing message in the workspace's language whose values take the offer (one typed value, the
 *                 rest filled per person) and that holds a version on every channel the offer goes by is reused, the
 *                 month's offer's own first; else one is written from the month's offer starter, the owner's words in
 *                 place of its offer, a version per channel the workspace sends offers on (WhatsApp with a number, email
 *                 where email sends offers, never a text: texts carry no offers)
 *   the list      the reminder's list (who of the first send's list has not booked since the offer began) is reused
 *                 wherever a list of the workspace has the same rule, whatever its name, else made
 *   the note      "Offer: {words}", with the dates, until the offer's last day, unless the receptionist has it
 *   the sends     at ten on the business's clock: the first on `from` (at Approve where ten has passed today), a
 *                 reminder nineteen days later where the offer still runs, a calendar can say who booked and its list is
 *                 not empty
 *   the month's   running on the reused message, its words change; running on another, it is paused while the offer
 *   offer         runs, and the words say to resume it after
 *   the pace      a calendar with fewer open slots than half the audience sends the offer as a campaign instead, as
 *                 many a day as it has room for, ending with the offer
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
import { asListRule, listRuleParts, type ListCondition, type ListRule } from "../people/lists/list-rules";
import { parseListToken } from "../people/lists/lists";
import { campaignDayWords, localDate } from "../playbooks/playbook-schedule";
import { PLAYBOOK_DEFAULTS, PLAYBOOK_LIMITS, PLAYBOOK_NAME_MAX } from "../playbooks/playbook-triggers";
import { clockHour, wallClockAt } from "../shared/clock";
import { DAY_MS } from "../shared/time";
import { joinWords, plural } from "../shared/words";
import { VERSION_CHANNEL_WORDS } from "../templates/message-versions";
import { starterByName, starterEmailText, starterText } from "../templates/starter-lookup";
import { messageLanguageCode } from "../templates/starter-templates";
import { languageBase } from "../templates/template-languages";
import { TEMPLATE_NAME_MAX, slugTemplateName } from "../templates/templates";
import type { MessageRead } from "./ask";
import { clip } from "./ask-answer";

/** What the owner asked for, as the model states it: an offer in their words and dates, or the journey to cover. */
export type PlanIntent =
  | {
      intent: "offer";
      offer: {
        /** The offer in the owner's words ("10% off every service all November"): the note's title, the sends' names. */
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
  /** People's lists offered here and the workspace's own, each with its rule (null where kept by hand) and count (null: not counted). */
  lists: { token: string; name: string; rule: unknown; count: number | null }[];
  /** The workspace's campaigns: the month's offer among them (trigger everyone_monthly). */
  playbooks: { id: string; name: string; trigger: string; state: string; template_name: string | null }[];
  /** The receptionist's notes. */
  notes: Note[];
  /** The open slots on the calendar ahead (calendar.room); null where that is not known, which is never "full". */
  room: { open: number } | null;
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
  kind: "message" | "list" | "note" | "change" | "broadcast" | "playbook";
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
type Audience = { audience_kind: "list" | "saved"; audience_id: string };

/** The token a step's input names what an earlier step makes by: `@step:2` is step 2's list. */
export const STEP_TOKEN = /^@step:(\d+)$/;

export function stepToken(n: number): string {
  return `@step:${n}`;
}

/** The hour a send goes at, by the business's clock: the hour a campaign runs at unless told otherwise. */
const SEND_HOUR = PLAYBOOK_DEFAULTS.runHour;
/** The reminder goes this many days after the first send: the 20th of a month-long offer that starts on the 1st. */
const REMINDER_AFTER_DAYS = 19;
/** The channels an offer may go by, in the order a message's versions are written. */
const OFFER_CHANNELS: readonly OfferChannel[] = ["whatsapp", "email"];
/** The value kinds a send fills per person, beside the one typed value that carries the offer. */
const PER_PERSON = new Set(["first_name", "business_name", "booking_link", "review_link"]);
/** A version a send can go by: approved, or still in WhatsApp's review. */
const LIVE = new Set(["approved", "pending"]);
const SILENT: Record<StepKind, boolean> = {
  message: true,
  list: true,
  note: true,
  change: true,
  broadcast: false,
  playbook: false,
};
const NOT_BOOKED: ListCondition = { field: "booked", op: "is", yes: false };
/** No appointment since the offer began, read on the reminder's day: the last one before it, or none ever. */
const NONE_SINCE: ListCondition = {
  any: [
    { field: "last_visit", op: "more_than", days: REMINDER_AFTER_DAYS },
    { field: "last_visit", op: "never" },
  ],
};

/** Each stage of the journey, as a sentence about when it sends says it. */
const STAGE_WORDS: Record<JourneyStageId, string> = {
  first_contact: "at first contact",
  before: "the day before an appointment",
  after: "the day after an appointment",
  proposal: "while a proposal waits",
  quiet: "once they go quiet",
};

const channelWord = (c: OfferChannel): string =>
  c === "whatsapp" ? VERSION_CHANNEL_WORDS.whatsapp : VERSION_CHANNEL_WORDS[c].toLowerCase();

/** The pace a campaign sends at: as many a day as the calendar has open slots, within what a campaign's cap may be. */
const capOf = (open: number): number =>
  Math.min(PLAYBOOK_LIMITS.cap_per_run.max, Math.max(PLAYBOOK_LIMITS.cap_per_run.min, Math.floor(open)));

/**
 * What a plan says. Its refusals are the model's to say back (each ends on what to do); its words and each step's why
 * are the person's. The breath is a send's own (people who heard from a campaign or a broadcast that week wait), and
 * WhatsApp's review is WhatsApp's.
 */
export const PLAN_WORDS = {
  noWords: "words is the offer in the owner's words: ask what the offer is.",
  notADay: "from and until are days on the business's calendar, written YYYY-MM-DD: ask for them again.",
  fromAfterUntil: "until comes before from: an offer's last day is its first day or later. Ask which dates they meant.",
  fromPast:
    "from is a day already past on the business's calendar: an offer starts today or later. Ask when it starts.",
  noChannel:
    "Nothing here can carry an offer: WhatsApp needs a connected number, email needs email set up to send offers, and texts carry no offers. Say so, and what to set up first.",
  noOffersList:
    "who is not a list this workspace has: name one people with action lists gives, or leave who out for everyone who can receive offers.",
  journeyUnread:
    "The journey could not be read just now, so which moments are covered is not known: say so, and try again in a moment.",
  nothingToCover:
    "Every moment asked for is covered already or not offered here (an appointment's moments need a calendar connected, a proposal's needs deals on): say so, and propose nothing.",
  reuseMessage: (name: string): string => `Sends “${name}”, already in the Library, with the offer in its words.`,
  writeMessage: (name: string, on: readonly OfferChannel[]): string =>
    `Writes the offer as a new message, “${name}”, for ${joinWords(on.map(channelWord))}.`,
  withoutWhatsApp: "It goes without WhatsApp: no WhatsApp number is connected.",
  withoutEmail: "It goes without email: email is not set up to send offers.",
  noText: CHANNEL_WORDS.noOffersByText,
  noteMade: (until: string): string => `Tells the receptionist about the offer, until ${until}.`,
  noteKnown: "The receptionist already has a note about the offer.",
  monthsOfferPaused: (name: string, until: string): string =>
    `Pauses the month's offer, “${name}”, so nobody gets two offers: resume it after ${until}.`,
  monthsOfferSays: (name: string, until: string): string =>
    `The month's offer, “${name}”, says this offer from now on: change its words back after ${until}.`,
  firstSend: (list: string, day: string, at: string): string => `The offer goes to “${list}” on ${day} at ${at}.`,
  firstAtApprove: (list: string, at: string): string =>
    `The offer goes to “${list}” when you approve it, as ${at} today has passed.`,
  paced: (open: number, audience: number): string =>
    `The calendar has ${open > 0 ? plural(open, "open slot") : "no open slot"} ahead for ${plural(audience, "person", "people")}, so the offer goes as a campaign: up to ${capOf(open)} a day, each person once, until it ends.`,
  approveOn: (day: string): string => `The campaign starts its runs the day it is approved: approve it on ${day}.`,
  reminderNew: (day: string, at: string, from: string): string =>
    `A reminder goes on ${day} at ${at} to a new list of whoever has not booked since ${from}; anyone who heard from you in the week before is left out.`,
  reminderTo: (day: string, at: string, list: string): string =>
    `A reminder goes on ${day} at ${at} to “${list}”; anyone who heard from you in the week before is left out.`,
  countZero: (list: string): string => `There is no reminder: nobody is on “${list}” today.`,
  reminderAfterEnd: (day: string): string => `There is no reminder: the offer ends before ${day}.`,
  reminderPaced: "There is no reminder: the campaign already sends the offer as fast as the calendar can take it.",
  reminderNoCalendar: (from: string): string =>
    `There is no reminder: who has booked since ${from} can be told only from a connected calendar.`,
  reminderUnwritable: (list: string): string =>
    `There is no reminder: who on “${list}” has not booked cannot be written as a list.`,
  whatsappReview:
    "Its WhatsApp version waits on WhatsApp's review, which may still be running at the first send: whoever it reaches on WhatsApp waits for it.",
  cover: (n: number): string =>
    `Starts ${plural(n, "campaign")}, one on each moment not covered yet, each its own card.`,
  notOffered: (stages: readonly string[]): string => `Not offered here: ${joinWords(stages)}.`,
  pausedOn: (name: string): string => `“${name}” stands paused on its moment: resume it from its drawer.`,
  why: {
    message: "No message in the Library carries an offer on every channel this one goes by.",
    list: "The reminder goes only to whoever has not booked since the offer began.",
    note: "So the receptionist can answer about the offer.",
    pause: "So nobody gets the month's offer and this one.",
    says: "The month's offer sends the same message, so it carries this offer.",
    first: "The offer, on its first day.",
    paced: "The offer, as fast as the calendar can take it.",
    second: "A reminder to whoever has not booked.",
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

/** A list's token as a broadcast names its audience: a People list by its id, one of the workspace's own (or a step's) as saved. */
function audienceOf(token: string): Audience | null {
  if (STEP_TOKEN.test(token)) return { audience_kind: "saved", audience_id: token };
  const ref = parseListToken(token);
  if (!ref) return null;
  return { audience_kind: ref.kind === "builtin" ? "list" : "saved", audience_id: ref.id };
}

/**
 * Every `@step:n` in a step's input, at any depth, filled with the id step n made; or the first step it names that made
 * nothing. The input it is given is left as it was.
 */
export function resolveSteps(
  payload: Record<string, unknown>,
  made: Record<number, { kind: string; id: string }>,
): Record<string, unknown> | { unresolved: number } {
  let unresolved: number | null = null;
  const fill = (v: unknown): unknown => {
    if (typeof v === "string") {
      const m = STEP_TOKEN.exec(v);
      if (!m) return v;
      const n = Number(m[1]);
      const step = made[n];
      if (step) return step.id;
      unresolved ??= n;
      return v;
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  const out = Object.fromEntries(Object.entries(payload).map(([k, x]) => [k, fill(x)]));
  return unresolved === null ? out : { unresolved };
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
const valuesOf = (slots: MessageRead["slots"], line: string): string[] =>
  [...slots].sort((a, b) => a.position - b.position).map((s) => (s.kind === "text" ? line : `@${s.kind}`));

type OfferMessage =
  | { made: false; name: string; id: string; params: string[]; inReview: boolean }
  | { made: true; name: string; input: Record<string, unknown>; params: string[] };

/**
 * The message to reuse: a marketing one in the workspace's language whose values take the offer (one typed value, every
 * other filled per person) with a live version on every channel the offer goes by; the one the month's offer runs on
 * first, then the month's offer starter, then the Library's order. Its id is its version on the first of those channels.
 */
function reusedMessage(world: PlanWorld, on: readonly OfferChannel[], line: string): OfferMessage | null {
  const takes = (m: MessageRead) =>
    m.slots.filter((s) => s.kind === "text").length === 1 &&
    m.slots.every((s) => s.kind === "text" || PER_PERSON.has(s.kind));
  const versionOn = (m: MessageRead, c: OfferChannel) => m.versions.find((v) => v.channel === c && LIVE.has(v.state));
  const fits = world.messages.filter(
    (m) =>
      m.category === "marketing" &&
      languageBase(m.language) === world.language &&
      takes(m) &&
      on.every((c) => versionOn(m, c)),
  );
  const monthly = new Set(world.playbooks.filter((p) => p.trigger === "everyone_monthly").map((p) => p.template_name));
  const m = fits.find((x) => monthly.has(x.name)) ?? fits.find((x) => x.name === "this_months_offer") ?? fits.at(0);
  const version = m ? on.map((c) => versionOn(m, c)).find((v) => v !== undefined) : undefined;
  if (!m || !version) return null;
  return {
    made: false,
    name: m.name,
    id: version.id,
    params: valuesOf(m.slots, line),
    inReview: on.includes("whatsapp") && m.versions.some((v) => v.channel === "whatsapp" && v.state === "pending"),
  };
}

/** A starter's words with the offer written in place of its value `at`, the values after it numbered down by one. */
const withOffer = (s: string, at: number, line: string): string =>
  s.replace(/\{\{(\d+)\}\}/g, (whole: string, d: string) => {
    const n = Number(d);
    return n === at ? line : n > at ? `{{${n - 1}}}` : whole;
  });

/**
 * A new message, written from the month's offer starter in the workspace's language: the owner's words in place of the
 * offer's value, a WhatsApp version (its footer, the STOP line, under its words) and an email version where it goes by
 * each, the starter's other values kept. Named for the offer, under a name the Library does not hold.
 */
function writtenMessage(world: PlanWorld, on: readonly OfferChannel[], line: string, words: string): OfferMessage {
  const starter = starterByName("this_months_offer");
  if (!starter) throw new Error("the month's offer starter is gone from the starter set");
  const code = messageLanguageCode(world.language);
  const text = starterText(starter, code);
  const email = starterEmailText(starter, code);
  const at = text.slots.findIndex((s) => s.kind === "text") + 1;
  const slots = text.slots
    .filter((s) => s.kind !== "text")
    .map((s, i) => ({ position: i + 1, label: s.label, kind: s.kind }));
  const versions = {
    ...(on.includes("whatsapp")
      ? { whatsapp: { body: [withOffer(text.body, at, line), text.footer].filter(Boolean).join("\n\n") } }
      : {}),
    ...(on.includes("email") && email
      ? { email: { subject: withOffer(email.subject, at, line), body: withOffer(email.body, at, line) } }
      : {}),
  };
  const base = slugTemplateName(`offer ${words}`) || "offer";
  const held = new Set(world.messages.map((m) => m.name));
  const name = firstFree(
    (i) => (i === 1 ? base : `${base.slice(0, TEMPLATE_NAME_MAX - `_${i}`.length)}_${i}`),
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
  const title = clip(`Offer: ${offer.words}`, PROFILE_LIMITS.noteTitle);
  if (notes.some((n) => n.title === title && n.until === dates.until)) return null;
  const parts = [
    `The offer: ${line}`,
    `It runs from ${dates.fromWords} to ${dates.untilWords}.`,
    ...(offer.service?.trim() ? [offerLine(`It is for ${offer.service.trim()}`)] : []),
  ];
  return {
    change: { op: "add_note", title, text: clip(parts.join(" "), PROFILE_LIMITS.noteText), until: dates.until },
  };
}

/** Each running month's offer: its words changed where it runs on the reused message, else paused while the offer runs. */
function monthsOfferChanges(
  world: PlanWorld,
  message: OfferMessage,
  until: string,
): { input: Record<string, unknown>; why: string; said: string }[] {
  return world.playbooks
    .filter((p) => p.trigger === "everyone_monthly" && p.state === "running")
    .map((p) =>
      !message.made && p.template_name === message.name
        ? {
            input: { playbook_id: p.id, params: message.params },
            why: SAY.why.says,
            said: SAY.monthsOfferSays(p.name, until),
          }
        : {
            input: { playbook_id: p.id, state: "paused" },
            why: SAY.why.pause,
            said: SAY.monthsOfferPaused(p.name, until),
          },
    );
}

type Reminder =
  | { kind: "make"; day: string; at: number; name: string; all: ListCondition[] }
  | { kind: "reuse"; day: string; at: number; name: string; to: Audience }
  | { kind: "none"; said: string };

/** A rule's chips in any order, another list it reads by its token: two rules that say the same say it alike. */
const ruleSaid = (rule: ListRule): string => [...listRuleParts(rule, (token) => token)].sort().join("\n");

/**
 * The reminder: nineteen days after the first send, to who of its list has not booked since the offer began (that list's
 * rule, the offers list's said as said yes to offers, with no appointment booked and none since), on a list of the
 * workspace with the same rule where there is one, else a new one. None where the offer ends first, the first send is
 * paced, no calendar can say who booked, the rule cannot be written, or the list it would reuse holds nobody.
 */
function reminderOf(world: PlanWorld, audience: ListEntry, dates: OfferDates, paced: boolean): Reminder {
  const day = shiftKey(dates.from, REMINDER_AFTER_DAYS);
  if (day > dates.until)
    return { kind: "none", said: SAY.reminderAfterEnd(campaignDayWords(day, world.tz, world.now)) };
  if (paced) return { kind: "none", said: SAY.reminderPaced };
  if (!world.journey?.some((s) => s.id === "before" || s.id === "after"))
    return { kind: "none", said: SAY.reminderNoCalendar(dates.fromWords) };
  const saidYes: ListCondition = { field: "said_yes", op: "is", to: "offers", yes: true };
  const base = audience.token === world.offersList ? [saidYes] : asListRule(audience.rule)?.all;
  const rule = base ? asListRule({ all: [...base, NOT_BOOKED, NONE_SINCE] }) : null;
  if (!rule) return { kind: "none", said: SAY.reminderUnwritable(audience.name) };
  const at = wallClockAt(world.tz, day, SEND_HOUR, 0);
  const want = ruleSaid(rule);
  for (const l of world.lists) {
    const r = asListRule(l.rule);
    const to = audienceOf(l.token);
    if (!r || !to || ruleSaid(r) !== want) continue;
    return l.count === 0 ? { kind: "none", said: SAY.countZero(l.name) } : { kind: "reuse", day, at, name: l.name, to };
  }
  const taken = new Set(world.lists.map((l) => l.name.toLowerCase()));
  const name = firstFree(
    (i) => `Not booked since ${dates.fromWords}${i === 1 ? "" : ` (${i})`}`,
    (n) => taken.has(n.toLowerCase()),
  );
  return { kind: "make", day, at, name, all: rule.all };
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
  /** The paced campaign's cap, where the calendar has less room than half the audience; null where the offer is a broadcast. */
  cap: number | null;
  reminder: Reminder;
  note: Record<string, unknown> | null;
  changes: ReturnType<typeof monthsOfferChanges>;
}

function offerRead(offer: Offer, say: string | undefined, world: PlanWorld): OfferRead | { refused: string } {
  if (!offer.words.trim()) return { refused: SAY.noWords };
  const dates = offerDates(offer, world);
  if ("refused" in dates) return dates;
  const { on, said: onSaid } = offerChannels(offer.channels, world.channels);
  if (on.length === 0) return { refused: SAY.noChannel };
  const audience = world.lists.find((l) => l.token === (offer.who ?? world.offersList));
  const to = audience ? audienceOf(audience.token) : null;
  if (!audience || !to) return { refused: SAY.noOffersList };
  const line = offerLine(say?.trim() ? say : offer.words);
  const message = reusedMessage(world, on, line) ?? writtenMessage(world, on, line, offer.words);
  const room = world.room;
  // Room not known is never full (calendar.room's none, or a calendar with no slot either way).
  const cap = room && audience.count !== null && room.open * 2 < audience.count ? capOf(room.open) : null;
  return {
    offer,
    dates,
    on,
    onSaid,
    audience,
    to,
    message,
    cap,
    reminder: reminderOf(world, audience, dates, cap !== null),
    note: offerNote(offer, line, dates, world.notes),
    changes: monthsOfferChanges(world, message, dates.untilWords),
  };
}

/** What the plan says of its sends: the first (or the paced campaign), then the reminder or why there is none. */
function sendWords(r: OfferRead, world: PlanWorld): string[] {
  const hour = clockHour(SEND_HOUR);
  const first =
    r.cap !== null
      ? [
          SAY.paced(world.room?.open ?? 0, r.audience.count ?? 0),
          ...(r.dates.from > r.dates.today ? [SAY.approveOn(r.dates.fromWords)] : []),
        ]
      : [
          r.dates.firstAt === null
            ? SAY.firstAtApprove(r.audience.name, hour)
            : SAY.firstSend(r.audience.name, r.dates.fromWords, hour),
        ];
  const rem = r.reminder;
  const day = rem.kind === "none" ? "" : campaignDayWords(rem.day, world.tz, world.now);
  const reminder =
    rem.kind === "none"
      ? rem.said
      : rem.kind === "make"
        ? SAY.reminderNew(day, hour, r.dates.fromWords)
        : SAY.reminderTo(day, hour, rem.name);
  // A WhatsApp version still to be reviewed and a first send under a day away: WhatsApp's review may still be running.
  const reviewing = r.on.includes("whatsapp") && (r.message.made || r.message.inReview);
  const soon = (r.dates.firstAt ?? world.now.getTime()) - world.now.getTime() < DAY_MS;
  return [...first, reminder, ...(reviewing && soon ? [SAY.whatsappReview] : [])];
}

function offerPlan(r: OfferRead, world: PlanWorld): { steps: PlanStep[]; words: string } {
  const { steps, add } = planSteps();
  const template_id = r.message.made ? stepToken(add("message", r.message.input, SAY.why.message)) : r.message.id;
  const rem = r.reminder;
  const remindTo =
    rem.kind === "make"
      ? audienceOf(stepToken(add("list", { name: rem.name, all: rem.all, cannot: "" }, SAY.why.list)))
      : rem.kind === "reuse"
        ? rem.to
        : null;
  if (r.note) add("note", r.note, SAY.why.note);
  for (const c of r.changes) add("change", c.input, c.why);
  const sends = { template_id, params: r.message.params };
  const named = (lead: string, max: number) => clip(`${lead}: ${r.offer.words}`, max);
  if (r.cap !== null)
    add(
      "playbook",
      {
        trigger: "saved_list",
        list: r.audience.token,
        policy_class: "campaign",
        ...sends,
        cap_per_run: r.cap,
        name: named("Offer", PLAYBOOK_NAME_MAX),
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
        name: named("Offer", BROADCAST_NAME_MAX),
        channels: r.on,
      },
      SAY.why.first,
    );
  if (remindTo && rem.kind !== "none")
    add(
      "broadcast",
      {
        ...sends,
        ...remindTo,
        scheduled_for: new Date(rem.at).toISOString(),
        name: named("Reminder", BROADCAST_NAME_MAX),
        channels: r.on,
      },
      SAY.why.second,
    );
  const words = [
    r.message.made ? SAY.writeMessage(r.message.name, r.on) : SAY.reuseMessage(r.message.name),
    ...r.onSaid,
    r.note ? SAY.noteMade(r.dates.untilWords) : SAY.noteKnown,
    ...r.changes.map((c) => c.said),
    ...sendWords(r, world),
  ];
  return { steps, words: words.join(" ") };
}

/* ------------------------------------------------------------------ the journey */

/** A campaign on a stage's moment: its starter, but the day after's review ask where the Library holds it in this language. */
function stageInput(id: JourneyStageId, moment: string, world: PlanWorld): Record<string, unknown> {
  const review =
    id === "after"
      ? world.messages.find((m) => m.name === "after_visit_review" && languageBase(m.language) === world.language)
      : undefined;
  const version = review ? (review.versions.find((v) => v.channel === "whatsapp") ?? review.versions.at(0)) : undefined;
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
