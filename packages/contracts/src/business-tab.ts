/**
 * What the Business tab says, as view models.
 *
 * Named apart from `business-page.ts` (the public /b/<slug> page) and
 * `business-record.ts` (the carrier record). This one is the operator's own tab.
 *
 * Every sentence with a number or a judgement in it is composed here rather
 * than in the page, for the reason Today and Reports already hold to: a
 * sentence written in JSX cannot be tested, and the same sentence written
 * twice is one that will be edited once.
 *
 * The prompt view, which cuts what the receptionist reads into the blocks that
 * wrote it, is `prompt-blocks.ts`.
 */

import { GuardrailsSchema } from "./config";
import { hardLimitsWords } from "./policy";

/**
 * The guardrail keys the profile stores, read off the schema rather than copied
 * from it. A copy would let a new rule reach the schema without a strength here;
 * derived, `STRENGTHS` below fails to compile until somebody says how far it goes.
 *
 * Read inside a call marked pure: a top-level call is a side effect to the bundler,
 * so a bare one kept this list in the four dists that bundle contracts and never use it.
 */
export const GUARDRAIL_KEYS = /* @__PURE__ */ (() => GuardrailsSchema.keyof().options)();
export type GuardrailKey = (typeof GUARDRAIL_KEYS)[number];

/**
 * How far a rule actually goes.
 *
 * The page drew four identical switches over three different guarantees, which
 * is the quietest dishonesty it had. One of these the product cannot break at
 * all; one has a detector on both channels; two are lines in a prompt, and
 * `policy.ts` says in its own header that an instruction is not an enforcement.
 */
export type RuleStrength = "structural" | "checked" | "instructed";

export interface RuleStrengthVM {
  strength: RuleStrength;
  /** The chip beside the rule's name. */
  chip: string;
  /** What actually happens, in the owner's words. */
  sentence: string;
  /** For a checked rule, what happens per channel. Null otherwise. */
  checkedOn: { channel: "whatsapp" | "voice"; words: string }[] | null;
}

const STRENGTHS: Record<GuardrailKey, RuleStrengthVM> = {
  never_confirm_booking: {
    strength: "structural",
    chip: "It cannot anyway",
    sentence:
      "There is no appointments table in this product; nothing in it can create, move or cancel one. Switching this off would not let it book — it would only stop it being told not to claim it had.",
    checkedOn: null,
  },
  never_quote_prices: {
    strength: "checked",
    chip: "Checked, not just told",
    // The sentence says the rule. `checkedOn` says how it lands per channel, and the
    // page draws both -- so the sentence must not say the channels too, or an owner
    // reads the same fact twice, once in prose and once in the two boxes under it.
    // Dollars and pesos are what `violatesNoPrices` knows. "A currency figure" promised
    // more: forty-five euros, or a pound sign, would pass it untouched.
    //
    // The owner's decision (20 Sep 2026): a receptionist never states a price, whatever
    // this switch says. The detectors (violatesNoPrices on a chat reply, spokenBreach on a
    // call) run either way; the switch adds or removes the one prompt line that tells it
    // not to quote one. So the sentence cannot say the switch turns the checking on.
    sentence:
      "A detector reads every reply for a price in dollars or pesos whether this switch is on or off, and it offers a consult or the booking link instead. On, it is also told not to quote one.",
    checkedOn: [
      { channel: "whatsapp", words: "The words are swapped before the customer sees them. A draft sits in between." },
      { channel: "voice", words: "It has already been heard. A correction goes into the live call, and you are told while it is still up." },
    ],
  },
  disclose_ai: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence:
      "A line in what it reads, and nothing checks the answer afterwards. There is no clean signal to check against: the phrase that would catch a denial also catches the correct disclosure.",
    checkedOn: null,
  },
  no_health_advice: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence: "Skin reactions, allergies, pregnancy, medication — a professional advises at the appointment.",
    checkedOn: null,
  },
};

export function ruleStrength(key: GuardrailKey): RuleStrengthVM {
  return STRENGTHS[key];
}

/** The subset of the brain the standing line reads. */
export interface StandingInputs {
  business_name?: string | null;
  booking_link?: string | null;
  profile?: {
    address?: string | null;
    tone?: string | null;
    hours?: Record<string, unknown> | null;
    services?: unknown[] | null;
  } | null;
}

export interface StandingVM {
  /** What it can answer, in one clause. */
  can: string;
  /**
   * What it will not do: state a price. Said whenever there are services to price,
   * whatever the price switch says, because the detector runs either way (the owner's
   * decision, 20 Sep 2026). Null with nothing to price.
   */
  wont: string | null;
  /** The single most useful gap, and the row that fixes it. Null when there is none. */
  missing: { sentence: string; row: string } | null;
}

const has = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : !!v && Object.keys(v as object).length > 0;

/**
 * Three clauses, worst last.
 *
 * The gaps are ordered by what a customer notices: a receptionist with no name
 * cannot introduce itself, one with no hours cannot answer the commonest
 * question, and one with no voice answers in nobody's words. Only
 * the first gap is named — a list of six is a list nobody starts.
 */
export function standingLine(i: StandingInputs): StandingVM {
  const p = i.profile ?? {};
  const gaps: { sentence: string; row: string }[] = [];
  if (!has(i.business_name)) gaps.push({ sentence: "It has no name to introduce itself with.", row: "name" });
  if (!has(i.booking_link)) gaps.push({ sentence: "It has no booking link to send anyone.", row: "booking_link" });
  if (!has(p.hours)) gaps.push({ sentence: "It cannot say when you are open.", row: "hours" });
  if (!has(p.services)) gaps.push({ sentence: "It cannot say what you offer.", row: "services" });
  if (!has(p.address)) gaps.push({ sentence: "It cannot say where you are.", row: "address" });
  if (!has(p.tone)) gaps.push({ sentence: "It has no voice of its own yet — it answers in nobody in particular's words.", row: "tone" });

  const answers: string[] = [];
  if (has(p.address)) answers.push("where you are");
  if (has(p.hours)) answers.push("when you're open");
  if (has(p.services)) answers.push("what you offer");
  if (has(i.booking_link)) answers.push("how to book");

  const can = answers.length
    ? `It can say ${answers.length === 1 ? answers[0] : `${answers.slice(0, -1).join(", ")} and ${answers.at(-1)}`}.`
    : "It cannot answer anyone yet.";

  // Both, because the two channels do different things: chat's replacement offers a
  // consult (layerTwo), and a call's correction offers the booking link (frameGuardrail).
  // "A consult" alone was true on WhatsApp and not on the phone.
  const wont = has(p.services) ? "It offers a consult or the booking link instead of a price." : null;

  return { can, wont, missing: gaps[0] ?? null };
}

/**
 * What the receptionist can do, and what it cannot.
 *
 * The tab sets the inputs to three of the phone agent's four tools
 * (`check_availability`, `send_booking_link`, `transfer_to_staff`) and has
 * never said a tool exists. An owner could not know their phone agent sends
 * the booking link to a caller's WhatsApp.
 *
 * Computed from what the records show, never typed: an ability is ready only
 * when its channel is live and its input is filled. Every sentence below was
 * checked against the code it describes, because the first draft of three of
 * them was not true: the link goes by WhatsApp and never by text, a transfer
 * happens only during opening hours and stays on the line, and a hand-off is a
 * pause that ends, not a stop.
 *
 * Every input is required, and the booleans are checked as it runs: the page
 * that calls this is untyped JSX, and a boolean it left out would be read as
 * false -- a live line drawn dark, a hold drawn as none -- with no error at all.
 */
export interface AbilityInputs {
  voiceLive: boolean;
  whatsappLive: boolean;
  hasCalendarFeed: boolean;
  hasBookingLink: boolean;
  /** An approved booking-link template: the call sends the link as one (template-library bookingTemplate). */
  hasBookingTemplate: boolean;
  hasHandoffNumber: boolean;
  hasEscalateWhen: boolean;
  /**
   * The Autonomy reply row's `limits.pause_hours`, exactly as stored -- usually
   * nothing, because most owners never set it. Read here the way the Autonomy pane
   * reads it (hardLimitsWords), which is the way the edge applies it: nothing, null
   * or 0 is the 24-hour default.
   */
  pauseHours: unknown;
  visionOn: boolean;
  /**
   * The Autonomy tab's Booking row is not on auto, so a person confirms bookings
   * and the link is never sent: bookingHeld(policy), the edge's own question.
   */
  bookingHeld: boolean;
}

/** The inputs that must be true or false. Typed off AbilityInputs, so a new boolean cannot be left off. */
const BOOLEAN_INPUTS: Record<{ [K in keyof AbilityInputs]-?: AbilityInputs[K] extends boolean ? K : never }[keyof AbilityInputs], true> = {
  voiceLive: true,
  whatsappLive: true,
  hasCalendarFeed: true,
  hasBookingLink: true,
  hasBookingTemplate: true,
  hasHandoffNumber: true,
  hasEscalateWhen: true,
  visionOn: true,
  bookingHeld: true,
};

export interface AbilityRowVM {
  id: "answer" | "open_times" | "booking_link" | "transfer" | "handoff" | "vision";
  title: string;
  detail: string;
  channels: { voice: boolean; whatsapp: boolean };
  /** The row on this page that supplies it. Null when nothing does. */
  runsOn: { label: string; row: string } | null;
  ready: boolean;
  /** Only the opt-in ability carries this. */
  on?: boolean;
}

/** How long a hand-off holds, in the words the page says it: "a day", "4 hours", "3 days". */
function heldFor(pauseHours: number): string {
  const hours = Math.max(1, Math.round(pauseHours));
  if (hours % 24 === 0) return hours === 24 ? "a day" : `${hours / 24} days`;
  return hours === 1 ? "an hour" : `${hours} hours`;
}

export function abilityRows(i: AbilityInputs): AbilityRowVM[] {
  if (!i || typeof i !== "object") throw new TypeError("abilityRows needs its inputs: which lines answer, what is filled in, and what the Autonomy tab holds.");
  const notBoolean = Object.keys(BOOLEAN_INPUTS).filter((k) => typeof (i as unknown as Record<string, unknown>)[k] !== "boolean");
  if (notBoolean.length) {
    throw new TypeError(`abilityRows needs true or false for ${notBoolean.join(", ")}: missing or not a boolean, each would be drawn as false.`);
  }
  const both = { voice: i.voiceLive, whatsapp: i.whatsappLive };
  // Nothing is ready on a channel that is not answering. An input filled against a
  // dead line is a setting, not an ability, and drawing it ready would tell an owner
  // the booking link goes out when there is nothing to send it.
  const answering = i.voiceLive || i.whatsappLive;

  // The link goes out on WhatsApp on both channels: in the thread, or on a call as a
  // template to the caller's own WhatsApp (retell-fn deliver({ channel: "whatsapp" })).
  // So a phone-only workspace cannot send it at all, and a call cannot send it without
  // an approved template -- whatever the booking link field holds.
  const callSendsLink = i.voiceLive && i.whatsappLive && i.hasBookingTemplate;
  // Where the booking-link row below is ready. Another row that promises the link after
  // something else promises it only here: with no WhatsApp to send it by, no link, or
  // bookings held on the Autonomy tab, "then the link" would not be true.
  const linkGoes = i.hasBookingLink && i.whatsappLive && !i.bookingHeld;
  // What is missing on this page is said first, because it is what this page can fix.
  // Then the Autonomy tab's hold: with Booking not on auto, a call's send is refused
  // (outbound-gate.ts), and a chat reply CLASSED AS A BOOKING has the link taken back out
  // (steps.ts layerTwo) -- a price or services reply still carries it, which is why the
  // sentence says "when someone asks to book" and not "it sends no link".
  const bookingDetail = !i.hasBookingLink
    ? "No booking link yet, so there is nothing to send."
    : !i.whatsappLive
      ? i.voiceLive
        ? "It goes out on WhatsApp, which isn't connected here, so on a call it offers to have someone follow up instead."
        : "It goes out on WhatsApp, which isn't connected here."
      : i.bookingHeld
        ? "Your Autonomy tab holds bookings for you to confirm, so when someone asks to book, it sends no link: it tells them someone from the team will confirm."
        : !i.voiceLive
          ? "It sends it in the thread."
          : callSendsLink
            ? "On a call it sends it to the caller's WhatsApp, when their number has one, and says so. In chat it sends it in the thread."
            : "In chat it sends it in the thread. On a call it can't yet: sending it to a caller's WhatsApp needs an approved booking-link message.";

  // The base triggers hold with no reasons at all -- they asked for a person, or it
  // cannot help -- so the owner's reasons widen the hand-off; they do not switch it on.
  const handoffWhen = i.hasEscalateWhen
    ? "On your reasons, or when a customer asks for a person or it can't help, it"
    : "When a customer asks for a person or it can't help, it";
  // The stored pause, as the Autonomy pane and the edge read it: nothing stored is a day.
  const pause = heldFor(hardLimitsWords({ pause_hours: i.pauseHours }).hours);

  return [
    {
      id: "answer",
      title: "Answer from your facts",
      // facts_used is the chat brain's (brain.ts); the phone agent reports an outcome, not its facts.
      detail: "Hours, address, services, your notes. In chat it also records which facts it leaned on, so you can see why it said what it said.",
      channels: both,
      runsOn: { label: "Name and hours", row: "name" },
      ready: answering,
    },
    {
      id: "open_times",
      title: "Say which times are open",
      // describeOpenings hands chat up to five days (availability.ts maxDays), not one.
      // With bookings held, check_availability offers a caller no times (retell-availability.ts),
      // while the call still starts with the openings (call-start.ts) and chat is still handed
      // them, so this says only what holds on both: it has them, and a request to book gets no link.
      detail: !i.hasCalendarFeed
        ? linkGoes
          ? "No calendar to read, so it does not guess at open times — it sends the link instead."
          : "No calendar to read, so it does not guess at open times."
        : i.bookingHeld
          ? "It is handed the openings on a call and in chat, but your Autonomy tab holds bookings for you to confirm, so when someone asks to book, no link follows."
          : `On a call it asks the calendar at that moment. In chat it is handed the next few days' openings with each message. It offers up to three that fit${linkGoes ? ", then the link" : ""}.`,
      channels: both,
      runsOn: { label: "The calendar it reads", row: "calendar" },
      ready: answering && i.hasCalendarFeed,
    },
    {
      id: "booking_link",
      title: "Send the booking link",
      detail: bookingDetail,
      channels: { voice: callSendsLink, whatsapp: i.whatsappLive },
      runsOn: { label: "The booking link", row: "booking_link" },
      ready: linkGoes,
    },
    {
      id: "transfer",
      title: "Put a caller through",
      // config.ts: "Use transfer_to_staff during opening hours -- it rings the line a person
      // answers, and you stay on until they pick up."
      detail: i.hasHandoffNumber
        ? "During opening hours it rings the number you gave and stays on until someone picks up. Outside them, or if nobody answers, it takes a message."
        : "No number yet, so it takes a message instead — which is better than a number nobody picks up.",
      channels: { voice: i.voiceLive, whatsapp: false },
      // One row on the page holds both halves of a hand-off (spec 4.5), and so does the prompt.
      runsOn: { label: "The transfer number", row: "handoff" },
      ready: i.voiceLive && i.hasHandoffNumber,
    },
    {
      id: "handoff",
      title: "Hand the thread to you",
      // A hand-off pauses the thread for pause_hours and no longer (inbound.ts, steps.ts);
      // after that the receptionist answers the next message itself, Needs you or not.
      detail: `${handoffWhen} stops answering, the thread turns Needs you in the Inbox, and anyone set to be alerted is emailed. It holds off for ${pause}, then answers the customer's next message itself.`,
      channels: { voice: false, whatsapp: i.whatsappLive },
      runsOn: { label: "Your reasons", row: "handoff" },
      ready: i.whatsappLive,
    },
    {
      id: "vision",
      title: "Look at a photo",
      detail: i.visionOn
        ? "It says what it sees and suggests the next step, under the rules it always keeps."
        : "Off. A photo is passed to a person.",
      channels: { voice: false, whatsapp: i.whatsappLive },
      // The switch sits with the rules it keeps, which is the row that opens it.
      runsOn: { label: i.visionOn ? "Turn it off" : "Turn it on", row: "guardrails" },
      ready: i.whatsappLive && i.visionOn,
      on: i.visionOn,
    },
  ];
}

export interface CannotRowVM {
  id: "book" | "outbound_call" | "sms";
  title: string;
  detail: string;
  /** True when it is a thing the product intends to sell later. */
  soon?: boolean;
}

const CANNOT_ROWS: readonly CannotRowVM[] = [
  {
    id: "book",
    title: "Book, move or cancel an appointment",
    detail:
      "Not a setting you could switch on. There is no appointments table in this product — nothing in it can create, move or cancel one. Your booking link does that, whichever tool is behind it.",
  },
  {
    id: "outbound_call",
    title: "Ring a customer",
    // Not "never dials out": a transfer rings the owner's number, two rows up the same card.
    detail:
      "It answers your line and never calls a customer. The only number it rings is yours, to put a caller through. A call back is a person's, and the receptionist tells you when one is wanted.",
  },
  {
    id: "sms",
    title: "Send a text message",
    detail:
      "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when. The booking link a caller receives goes to their WhatsApp.",
    soon: true,
  },
];

/**
 * Said here so nobody has to find out from a customer.
 *
 * None of these is a setting that could be switched on, and saying so on the
 * page that holds the switches is the difference between a limit and a bug.
 *
 * Texting is the one that changes: it goes live on an active carrier line that
 * is not a rehearsal filing (capabilities.ts), and on such a line "not part of
 * what is sold yet" is not true, so the row is left out. `smsLive` is checked as
 * it runs, like abilityRows' inputs: left out by an untyped page, it would read
 * as not live.
 */
export function cannotRows(i: { smsLive: boolean }): CannotRowVM[] {
  if (typeof i?.smsLive !== "boolean") {
    throw new TypeError("cannotRows needs true or false for smsLive: left out, texting would be drawn as not sold.");
  }
  return CANNOT_ROWS.filter((r) => !(r.id === "sms" && i.smsLive));
}
