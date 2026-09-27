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
 *
 * This module holds the rules fold: how far each rule goes, what the row says at rest, and the one sentence for
 * a record whose details compose nothing. The other folds' words are its neighbours in this folder.
 */
import { offersBookingLink } from "../no-booking-link";
import { GuardrailsSchema, type GuardrailsInForce } from "../workspace-config/business-profile";
import { NO_FIELDS_COMPOSED_WORDS } from "../workspace-config/resolve";

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
 * What each channel is called, wherever this tab names one.
 *
 * The abilities card draws chat and phone beside every ability, lit for a channel that has it and dim
 * for one that does not. Dim is a colour: it says nothing to a screen reader, and little to
 * anyone reading a phone in daylight. So each glyph carries its name, and the names live here
 * rather than in the JSX that draws them -- one spelling for the four states.
 *
 * Declared above the strengths because the checked rule's two lines open with the same names
 * (`checkedOn` below): the card and the rules fold are one page, and "in chat" is said once for both.
 */
export const ABILITY_CHANNEL_WORDS: Record<"whatsapp" | "voice", { has: string; not: string }> = {
  whatsapp: { has: "in chat", not: "not in chat" },
  voice: { has: "on a call", not: "not on a call" },
};

/** A channel's name where it opens a line rather than sitting inside one. */
const channelOpens = (c: "whatsapp" | "voice"): string => {
  const w = ABILITY_CHANNEL_WORDS[c].has;
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/**
 * How far a rule actually goes.
 *
 * The page drew four identical switches over three different guarantees, which
 * is the quietest dishonesty it had. One of these the product cannot break at
 * all; one has a detector on both channels; two are lines in a prompt, and
 * `policy.ts` says in its own header that an instruction is not an enforcement.
 */
export type RuleStrength = "structural" | "checked" | "instructed" | "power";

export interface RuleStrengthVM {
  strength: RuleStrength;
  /** The chip beside the rule's name. */
  chip: string;
  /** What actually happens, in the owner's words. */
  sentence: string;
  /**
   * For a checked rule, what happens per channel. Null otherwise. `label` opens the line and is the
   * channel's one name on this page (ABILITY_CHANNEL_WORDS); the stored value is never what an owner reads.
   */
  checkedOn: { channel: "whatsapp" | "voice"; label: string; words: string }[] | null;
}

/*
 * Built inside a call marked pure, as GUARDRAIL_KEYS is: `channelOpens` below makes this an expression the
 * bundler cannot prove has no side effect, and a side effect at the top level is one it must KEEP. Left bare, this
 * table and everything it reaches shipped into the four dists that bundle contracts and never draw this tab --
 * jobs carried it six times, once per package re-bundled into it.
 */
const STRENGTHS: Record<GuardrailKey, RuleStrengthVM> = /* @__PURE__ */ (() => ({
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
      {
        channel: "whatsapp",
        label: channelOpens("whatsapp"),
        words: "The words are swapped before the customer sees them. A draft sits in between.",
      },
      {
        channel: "voice",
        label: channelOpens("voice"),
        // What ALWAYS holds is that the owner is told: a correction goes into the call only while its turns are
        // still being delivered, and with that switched off on the agent the same check runs on the final transcript
        // and the owner is told after the fact instead (policy.ts). "Degrading is the point", and the line degrades
        // with it rather than promising the better half of it.
        words:
          "It has already been heard. You are told either way, and a correction goes into the call itself whenever it can still be reached.",
      },
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
}))();

export function ruleStrength(key: GuardrailKey): RuleStrengthVM {
  return STRENGTHS[key];
}

/**
 * The fifth switch in the same fold, and the only one that is not a limit.
 *
 * Not a GuardrailKey: photos are stored as `features.vision` beside the profile rather than in the guardrails, and
 * the switch changes no word of the composed prompt at all -- a photo's words go in the customer's own turn
 * (core/src/inbound/answer.ts). So it is its own export rather than a fifth entry in a table typed over the schema's
 * keys, and its strength is a different kind: the four above say how far a LIMIT goes, and this one says the switch
 * gives the receptionist something it otherwise does not have.
 *
 * Here rather than in the JSX for the reason every other sentence on this tab is: the page drew the badge as a
 * literal and the page's test typed the same literal back, so the two agreed with each other and with nothing else.
 */
export const VISION_STRENGTH: RuleStrengthVM = /* @__PURE__ */ (() => ({
  strength: "power" as const,
  chip: "gives it a power",
  // Two clauses, one per position, and nothing else. "The rules above are limits; this one gives it an ability, so
  // it starts off" went: the dashed rule above the switch says it is apart, the badge beside it says it is a power,
  // and the switch itself says it is off -- three sayings of one thing, and four lines of a phone.
  sentence:
    "On, it says what it sees and suggests the next step, under the rules above. Off, a photo goes to a person.",
  checkedOn: null,
}))();

/**
 * The short name the row at rest says each rule by (the canvas's Record board). Not the switch's label, which is an
 * instruction to the receptionist ("Never quote or confirm a price"); this is what the receptionist does.
 */
export const RULES_AT_REST_WORDS: Record<GuardrailKey, string> = {
  never_quote_prices: "Never quotes a price",
  never_confirm_booking: "Never confirms a booking",
  disclose_ai: "Says it's an assistant",
  no_health_advice: "No health advice",
};

/**
 * The structural rule where nothing tells it not to claim: what it CANNOT do, rather than what it will not say.
 *
 * There is no appointments table in this product, so a booking is beyond it whatever it reads. The switch decides only
 * whether it is told not to claim it had -- so with that line gone (switched off, or a record whose details compose
 * nothing) the row says the part that still holds and drops the part that does not.
 */
const CANNOT_BOOK_WORDS = "Cannot book anything";

/** The photos switch at rest. An ability, so both ways round are worth saying: it is the one that starts off. */
const PHOTOS_AT_REST_WORDS = { on: "Looks at photos", off: "Won't look at photos" } as const;

export interface RulesKeptInputs {
  /** The four, as the fold opens them: `guardrailsInForce` over the stored record, never the raw guardrails. */
  rules: GuardrailsInForce;
  /** `features.vision`. An ability rather than a limit, and it reaches the receptionist without the prompt. */
  vision: boolean;
  /** Whether the record's details compose anything at all (config.ts `hasProfile`). */
  composes: boolean;
}

/**
 * What the row says at rest: the rules the receptionist actually keeps, in the order the schema keeps them.
 *
 * Derived from the three strengths rather than from the switches alone, because the switches do not all decide the
 * same amount (the plan's Task 4.2, and M-2):
 *
 * - **checked** -- named whatever the switch says. The detector reads every reply (`violatesNoPrices` in chat,
 *   `spokenBreach` on a call) whether the switch is on or off, and whatever the profile holds; the switch adds or
 *   removes the one prompt line. A row that dropped the word with the switch off would read as if prices went through
 *   (Task 3.5's review).
 * - **instructed** -- a line in a prompt and nothing else, so it is named only where the record composes one AND the
 *   switch is on. On a record whose details compose nothing the resolver hands back the stored prompt plus Autonomy's
 *   rules (`resolveSystemPrompt`'s no-profile branch), so there is no line to name.
 * - **structural** -- named either way, in different words: the line decides only whether it is told not to CLAIM it
 *   booked, and the product cannot book regardless.
 *
 * Every input is required and checked as it runs, as `abilityRows` is and for the same reason: the page that calls
 * this is untyped JSX, and a rule it left out would read as false -- a rule quietly dropped from the row with nothing
 * to say it had gone.
 */
export function rulesKept(i: RulesKeptInputs): string[] {
  if (typeof i?.vision !== "boolean" || typeof i?.composes !== "boolean") {
    throw new TypeError("rulesKept needs vision and composes as booleans, not what an untyped page left out.");
  }
  const rules = i.rules;
  if (!rules || typeof rules !== "object") throw new TypeError("rulesKept needs the four rules as guardrailsInForce.");
  for (const key of GUARDRAIL_KEYS) {
    if (typeof rules[key] !== "boolean") throw new TypeError(`rulesKept needs ${key} as a boolean.`);
  }
  const kept: string[] = [];
  for (const key of GUARDRAIL_KEYS) {
    const { strength } = ruleStrength(key);
    // A line it actually reads: the switch on, over a record the resolver composes from.
    const told = i.composes && rules[key];
    if (strength === "checked" || told) kept.push(RULES_AT_REST_WORDS[key]);
    else if (strength === "structural") kept.push(CANNOT_BOOK_WORDS);
  }
  kept.push(i.vision ? PHOTOS_AT_REST_WORDS.on : PHOTOS_AT_REST_WORDS.off);
  return kept;
}

/**
 * What the rules fold says, once, on a record whose details compose nothing (config.ts hasProfile false). The resolver
 * answers such a record with its stored prompt as it stands, and adds after it only the Autonomy tab's rules
 * (resolveSystemPrompt's first branch), so none of the four switches changes a word it is TOLD, and there is no rules
 * block for the fold to show. It says nothing of what the receptionist does: the price detector reads every reply
 * whatever the profile holds (whatsapp/steps.ts layerTwo, and spokenBreach on a call), and nothing in the product can
 * confirm a booking anyway. It first said "these four rules do not reach it", which Phase 4 would have drawn beside the
 * price rule's "Checked, not just told".
 *
 * Its opening sentence is NO_FIELDS_COMPOSED_WORDS (config.ts), which the prompt view's note over the same record's
 * stored prompt is also built from (prompt-blocks.ts): the two are on one page, so they are one sentence rather than
 * two that happen to agree (the plan's M-2).
 *
 * Built inside a call marked pure, as GUARDRAIL_KEYS is: a template literal with a substitution in it is an
 * expression the bundler must keep at the top level, and this sentence belongs to one tab of the dashboard.
 */
const rulesWithoutFields = (noLink: boolean): string =>
  `${NO_FIELDS_COMPOSED_WORDS} These four switches change nothing it is told: it answers from its own stored instructions, followed only by ${noLink ? "what to do with no booking link and " : ""}any rules your Autonomy tab adds.`;
export const RULES_WITHOUT_FIELDS_WORDS = /* @__PURE__ */ (() => rulesWithoutFields(false))();
const RULES_WITHOUT_FIELDS_NO_LINK_WORDS = /* @__PURE__ */ (() => rulesWithoutFields(true))();

/**
 * RULES_WITHOUT_FIELDS_WORDS for the record it is said of. A receptionist with no booking link is told what to do
 * instead, first among the rules after its stored prompt (config.ts resolveSystemPrompt), so the sentence names that
 * rule too, by the resolver's own test (offersBookingLink).
 */
export function rulesWithoutFieldsWords(brain: { booking_link?: string | null } | null | undefined): string {
  return offersBookingLink(brain) ? RULES_WITHOUT_FIELDS_WORDS : RULES_WITHOUT_FIELDS_NO_LINK_WORDS;
}
