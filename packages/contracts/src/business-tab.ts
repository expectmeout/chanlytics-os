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
 */

/** The guardrail keys the profile stores. The editor writes exactly these. */
export const GUARDRAIL_KEYS = ["never_quote_prices", "never_confirm_booking", "disclose_ai", "no_health_advice"] as const;
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
    sentence: "A detector reads every reply for a currency figure. It offers a consult or the booking link instead.",
    checkedOn: [
      { channel: "whatsapp", words: "The words are swapped before the customer sees them. A draft sits in between." },
      { channel: "voice", words: "It has already been heard. A correction goes into the live call, and you are told while it is still up." },
    ],
  },
  disclose_ai: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence:
      "A line in what it reads, and it follows it reliably — but nothing checks the answer afterwards. There is no clean signal to check against: the phrase that would catch a denial also catches the correct disclosure.",
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
    guardrails?: Partial<Record<GuardrailKey, boolean>> | null;
  } | null;
}

export interface StandingVM {
  /** What it can answer, in one clause. */
  can: string;
  /** What it deliberately will not do, by a rule the owner set. Null when there is none. */
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
 * question, and one with no voice answers correctly in nobody's words. Only
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
  if (!has(p.tone)) gaps.push({ sentence: "It has no voice of its own yet — it answers correctly, in nobody in particular's words.", row: "tone" });

  const answers: string[] = [];
  if (has(p.address)) answers.push("where you are");
  if (has(p.hours)) answers.push("when you're open");
  if (has(p.services)) answers.push("what you offer");
  if (has(i.booking_link)) answers.push("how to book");

  const can = answers.length
    ? `It can say ${answers.length === 1 ? answers[0] : `${answers.slice(0, -1).join(", ")} and ${answers.at(-1)}`}.`
    : "It cannot answer anyone yet.";

  const quiet = p.guardrails?.never_quote_prices !== false && has(p.services);
  const wont = quiet ? "It offers a consult instead of a price, by your rule." : null;

  return { can, wont, missing: gaps[0] ?? null };
}

/**
 * What the receptionist can do, and what it cannot.
 *
 * The tab sets the inputs to three of the phone agent's four tools
 * (`check_availability`, `send_booking_link`, `transfer_to_staff`) and has
 * never said a tool exists. An owner could not know their phone agent texts
 * the booking link to the number a caller rang from.
 *
 * Computed from what the records show, never typed: an ability is ready only
 * when its channel is live and its input is filled.
 */
export interface AbilityInputs {
  voiceLive: boolean;
  whatsappLive: boolean;
  hasCalendarFeed: boolean;
  hasBookingLink: boolean;
  hasHandoffNumber: boolean;
  hasEscalateWhen: boolean;
  visionOn: boolean;
}

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

export function abilityRows(i: AbilityInputs): AbilityRowVM[] {
  const both = { voice: i.voiceLive, whatsapp: i.whatsappLive };
  // Nothing is ready on a channel that is not answering. An input filled against a
  // dead line is a setting, not an ability, and drawing it ready would tell an owner
  // the booking link goes out when there is nothing to send it.
  const answering = i.voiceLive || i.whatsappLive;
  return [
    {
      id: "answer",
      title: "Answer from your facts",
      detail: "Hours, address, services, your notes — and it records which facts it leaned on.",
      channels: both,
      runsOn: { label: "Name and hours", row: "name" },
      ready: i.voiceLive || i.whatsappLive,
    },
    {
      id: "open_times",
      title: "Say which times are open",
      detail: i.hasCalendarFeed
        ? "On a call it asks the calendar at that moment. In chat it is handed the day's openings with each message. Up to three that fit, then the link."
        : "No calendar to read, so it does not guess at open times — it sends the link instead.",
      channels: both,
      runsOn: { label: "The calendar it reads", row: "calendar" },
      ready: answering && i.hasCalendarFeed,
    },
    {
      id: "booking_link",
      title: "Send the booking link",
      detail: "On a call it texts it to the number they rang from and says so. In chat it sends it in the thread.",
      channels: both,
      runsOn: { label: "The booking link", row: "booking_link" },
      ready: answering && i.hasBookingLink,
    },
    {
      id: "transfer",
      title: "Put a caller through",
      detail: i.hasHandoffNumber
        ? "Dials the number you gave and steps out."
        : "No number yet, so it takes a message instead — which is better than a number nobody picks up.",
      channels: { voice: i.voiceLive, whatsapp: false },
      runsOn: { label: "The transfer number", row: "handoff_number" },
      ready: i.voiceLive && i.hasHandoffNumber,
    },
    {
      id: "handoff",
      title: "Hand the thread to you",
      detail:
        "It stops answering, the thread turns Needs you in the Inbox, and your staff are emailed. It will not pick the thread back up on its own.",
      channels: { voice: false, whatsapp: i.whatsappLive },
      runsOn: { label: "Your reasons", row: "escalate_when" },
      ready: i.whatsappLive && i.hasEscalateWhen,
    },
    {
      id: "vision",
      title: "Look at a photo",
      detail: i.visionOn
        ? "It says what it sees and suggests the next step, under the rules above."
        : "Off. A photo is acknowledged and passed to a person.",
      channels: { voice: false, whatsapp: i.whatsappLive },
      runsOn: { label: "Turn it on", row: "vision" },
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

/**
 * Said here so nobody has to find out from a customer.
 *
 * None of these is a setting that could be switched on, and saying so on the
 * page that holds the switches is the difference between a limit and a bug.
 */
export const CANNOT_ROWS: readonly CannotRowVM[] = [
  {
    id: "book",
    title: "Book, move or cancel an appointment",
    detail:
      "Not a setting you could switch on. There is no appointments table in this product — nothing in it can create, move or cancel one. Your booking link does that, whichever tool is behind it.",
  },
  {
    id: "outbound_call",
    title: "Ring a customer",
    detail:
      "It answers your line; it never dials out. A call back is a person's, and the receptionist tells you when one is wanted.",
  },
  {
    id: "sms",
    title: "Send a text message",
    detail:
      "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when. The booking link a caller receives goes to their WhatsApp.",
    soon: true,
  },
];
