/**
 * The Business tab's helpers for the legacy page: the sentences contracts
 * composes for it, and what each fold will add to the prompt. Published on
 * window as Today's are (today.ts): the page is untyped JSX that reads
 * everything there, and composes rather than derives.
 *
 * Its own module rather than a corner of inbox-verbs.ts, which is a courier
 * whose business logic stays server-side: the fold map and the resolver call
 * below are neither a verb nor a request.
 */
import {
  standingLine,
  ABILITY_CHANNEL_WORDS,
  abilityRows,
  cannotRows,
  bookingHeld,
  bookingTemplate,
  capabilityStatus,
  POLICY_MODES,
  ruleStrength,
  VISION_STRENGTH,
  rulesKept,
  GUARDRAIL_KEYS,
  promptBlocks,
  resolveSystemPrompt,
  hasProfile,
  PROFILE_CROSSING_WORDS,
  TenantConfigWriteSchema,
  openWeekWords,
  hoursZoneWords,
  closuresAheadWords,
  servicesWords,
  servicesToldWords,
  servicesSaveWords,
  blockShareWords,
  promptCostWords,
  promptTotalWords,
  PROMPT_READERS,
  PROMPT_NOW,
  bookingRulesWords,
  BOOKING_RULE_HINTS,
  needsConsultation,
  foldName,
  serviceUndoName,
  servicesFoundWords,
  bookingRuleRefusal,
  TONE_PRESETS,
  handoffWords,
  handoffChatWords,
  handoffCallWords,
  notesWords,
  CHIPS_SHOWN,
  chipsMoreWords,
  instructionsWords,
  fallbacksWords,
  isProductFallback,
  rulesWithoutFieldsWords,
  guardrailsInForce,
  hoursLines,
  MAX_INTERVALS_PER_DAY,
  MAX_CLOSURES,
  PROFILE_LIMITS,
  profileRefusal,
  writtenOutDetail,
  sellsByVM,
  sellsBySaved,
  bookingLinkOptional,
  bookingLinkRowWords,
  BOOKING_LINK_NEEDED,
  type PromptBlockVM,
  type ProfileCrossing,
  type BusinessProfile,
} from "@chanlytics/contracts";
import type { PromptPreviewDto } from "../server/prompt-preview";

/**
 * The prompt block each fold and inline row writes into, named for the keys it
 * saves. A block is named for the heading the composer writes it under
 * (PROMPT_OPENINGS, cut by prompt-blocks.ts), and rows share them: everything
 * above the first heading is "Who you are", the name, the voice, the
 * languages, the address, the number it gives out, the booking link and the
 * website. Consult-first is a line of the booking rules. The hand-off's
 * reasons and the transfer number compose under the one hand-off heading, the
 * number only on a call, so on WhatsApp its row shows the chat hand-off, which
 * the number does not change.
 *
 * Null is a real row that no draft of the brain can show, and each says why.
 * Exported so a test reads this map, not a copy of it.
 */
export const FOLD_BLOCK = {
  business_name: "identity",
  address: "identity",
  website: "identity",
  booking_link: "identity",
  phone_display: "identity",
  tone: "identity",
  languages: "identity",
  hours: "hours",
  closures: "closures",
  services: "services",
  booking_rules: "booking_rules",
  consult_first: "booking_rules",
  notes: "notes",
  escalate_when: "handoff",
  handoff_number: "handoff",
  guardrails: "guardrails",
  extra_instructions: "extra_instructions",
  // The stored prompt, where it is the product's own opening lines: every workspace the product sets up stores them,
  // and the resolver carries them in the owner's place until the owner writes their own, where promptBlocks names them
  // the platform's. They name the business, so a rename writes them again under the new name, and the Name row shows
  // that line changing beside its own. (A stored prompt that is the owner's words is read in extra_instructions, and
  // no row writes it.)
  system_prompt: "platform",
  // Sent in the business's name in place of a reply the model wrote (no model, a failed call, a voice note), never part of the prompt.
  fallbacks: null,
  // The feed's openings follow the prompt, in the block rebuilt for every message and call (prompt-preview.ts `now`).
  calendar: null,
  // A photo's words go in the customer's own turn (the edge's vision.ts), never in the prompt.
  vision: null,
  // In the prompt (the hours heading names it, and closures pass by its clock), but it is the workspace's
  // (tenants.timezone, saved through its own route), not a key of the brain a fold sends, so no draft of it
  // can be resolved here. The hours and closures folds show the zone as saved.
  timezone: null,
  // The create fold of a workspace with no receptionist: the settings read composes no preview where there is no
  // brain (server/prompt-preview.ts), so there are no inputs to resolve its draft with.
  receptionist: null,
  // How customers buy (0008): the workspace's (tenants.sells_by, saved through its own route as the zone is), and not
  // in the prompt at all. It decides whether deals exist here; the receptionist hears a person's deal only where they
  // do, and that is read with the person on every message, never from the brain.
  sells_by: null,
} as const satisfies Record<string, string | null>;

export type FoldSection = keyof typeof FOLD_BLOCK;

/** A block of the prompt a draft would give the receptionist, and the length of that whole prompt. */
export type ConsequenceVM = PromptBlockVM & { total: number };

/** What consequenceFor reads off the window: the settings read's preview, with the inputs it was resolved with. */
export interface ConsequenceWindow {
  __SETTINGS?: { prompt?: PromptPreviewDto | null } | null;
}

/**
 * What one fold will add to the prompt, if the brain it would save were saved.
 *
 * Resolved as the edge resolves it: resolveSystemPrompt, which the edge calls
 * for every WhatsApp message (whatsapp/inbound.ts) and at the start of every
 * call (lib/call-start.ts), with the inputs the settings read resolved the
 * preview with -- the zone, the Autonomy rows and what the platform knows
 * (server/prompt-preview.ts). Composing the
 * draft instead, as this first did, drew rules, a notice period and a
 * hand-off token for a record the edge answers with its stored prompt, left
 * out the Autonomy tab's rules and the provisioned number, and lost the stored
 * prompt the resolver carries into a cleared box.
 *
 * `next` is the whole brain the fold's save would send, checked by the save's
 * own schema (TenantConfigWriteSchema). That schema keeps rules the read's does
 * not: a day that closes after it opens, shifts that do not overlap, closures
 * on real dates. So a Monday typed half-way, closing before it opens, shows
 * nothing rather than a line the save would refuse. Only a brain the save
 * would accept can ever be told to the receptionist: anything else is null,
 * and the field's own error speaks. The brain is checked alone, not with the
 * stored config around it: the rest is not the fold's, and a non-owner's feed
 * address arrives masked, which the save's feed check would refuse.
 *
 * Null too with no preview to take the inputs from -- no receptionist, an
 * Autonomy matrix that could not be read, a config the composer refused --
 * because a prompt resolved without its rules is a wrong prompt, not a partial
 * one. And null when the resolver writes no such block: an empty list, or a
 * record that composes nothing and is answered with its stored prompt, which
 * has no rules block of its own.
 *
 * The block is cut with the brain as its source, so the owner's words are found
 * where the resolver put them: their own, or the stored prompt carried into
 * their place (whoseWords, config.ts).
 *
 * The block comes with `total`, the length of the whole prompt it was cut
 * from: the prompt the draft would give the receptionist, which is what a
 * block's share of everything it reads is measured over. Measured over the
 * stored prompt instead, a sheet with half its services taken out divided a
 * block after the save by a prompt from before it.
 *
 * `section` and `channel` are checked as it runs, because the page is untyped:
 * a fold it does not know, or a channel that is not one, is a TypeError naming it.
 */
export function consequenceFor(
  w: ConsequenceWindow,
  section: FoldSection,
  next: unknown,
  channel: "whatsapp" | "voice",
  now: Date,
): ConsequenceVM | null {
  if (!Object.prototype.hasOwnProperty.call(FOLD_BLOCK, section)) {
    throw new TypeError(
      `consequenceOf knows no fold named ${JSON.stringify(section)}. It knows ${Object.keys(FOLD_BLOCK).join(", ")}.`,
    );
  }
  if (channel !== "whatsapp" && channel !== "voice") {
    throw new TypeError(
      `consequenceOf needs the channel it will be told on, "whatsapp" or "voice", not ${JSON.stringify(channel)}.`,
    );
  }
  const row = FOLD_BLOCK[section];
  if (!row) return null;
  const prompt = w.__SETTINGS?.prompt;
  // No inputs means an older server composed it: one still answering mid-deploy, or a dev session's cache, whose build key never changes.
  if (!prompt?.inputs) return null;
  const parsed = TenantConfigWriteSchema.safeParse({ brain: next });
  // { brain: undefined } parses too, with no brain in it.
  if (!parsed.success || !parsed.data.brain) return null;
  const brain = parsed.data.brain;
  const text = resolveSystemPrompt(brain, channel, prompt.tz, now, prompt.inputs.policy, prompt.inputs.known);
  const block = promptBlocks(text, channel, brain).find((b) => b.row === row);
  return block ? { ...block, total: text.length } : null;
}

/** consequenceFor over this tab's window, at this moment: the one the page calls. */
function consequenceOf(section: FoldSection, next: unknown, channel: "whatsapp" | "voice"): ConsequenceVM | null {
  return consequenceFor(window as unknown as ConsequenceWindow, section, next, channel, new Date());
}

/**
 * Whether saving the brain `next` over the brain `stored` crosses the line the resolver draws, and the words for it
 * (contracts PROFILE_CROSSING_WORDS). The resolver composes a prompt from the profile only while it holds something it
 * composes from (hasProfile), and answers with the stored prompt otherwise, so a save that empties the last such field,
 * or fills the first, changes far more than its own line. Decided here, over the two brains, with the resolver's own
 * test and never a copy of it, so the page only draws the sentence.
 *
 * `stored` is the brain the save goes on, which the page takes from its saver (business-tab-save.jsx, `base()`): the
 * settings read, until a save is out, or taken and not read back yet. This read the settings read itself, as it once
 * did, and a save that went on a newer brain was judged against an older one: with the website's save out, emptying
 * the address said nothing, though its save, landing on a record with no website, stopped the prompt composing.
 *
 * Null when the save crosses nothing; and, as consequenceFor is, for a draft the save's schema refuses, since nothing
 * true can be said of a save that will not go, or when there is no stored brain to compare it with.
 */
export function profileCrossing(
  stored: unknown,
  next: unknown,
): { crossing: ProfileCrossing; sentence: string } | null {
  if (!stored || typeof stored !== "object") return null;
  const parsed = TenantConfigWriteSchema.safeParse({ brain: next });
  if (!parsed.success || !parsed.data.brain) return null;
  const was = hasProfile(((stored as { profile?: unknown }).profile ?? null) as BusinessProfile | null);
  const now = hasProfile(parsed.data.brain.profile ?? null);
  if (was === now) return null;
  const crossing: ProfileCrossing = was ? "stops" : "starts";
  return { crossing, sentence: PROFILE_CROSSING_WORDS[crossing] };
}

/**
 * What the save's own schema (TenantConfigWriteSchema, the one PUT /settings parses with) refuses in a part of the
 * config, each issue with where it is and the schema's sentence. `part` is parsed as it is handed over: `{ brain }`
 * for a fold of the brain, `{ calendar }` for the calendar's. Never the whole stored config, for the reason
 * consequenceFor gives: a non-owner's feed address arrives masked, and the save's feed check would refuse it.
 *
 * For what only the schema can judge: two shifts that overlap, a day that closes before it opens, a date that is not
 * on the calendar, an address the receptionist may not read. The server refuses the same things, but says the first
 * three under no field the owner can see, after a round trip; and consequenceFor goes quiet for such a draft, so a
 * fold's "It will say" vanished with nothing to say why. The page's folds map each issue to the field it is under
 * (business-tab-folds.jsx schemaProblems). Nothing to judge is nothing refused.
 */
export function saveIssues(part: unknown): Array<{ path: Array<string | number>; message: string }> {
  if (!part || typeof part !== "object") return [];
  const parsed = TenantConfigWriteSchema.safeParse(part);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => ({
    path: i.path.filter((p): p is string | number => typeof p === "string" || typeof p === "number"),
    message: i.message,
  }));
}

// openWeekWords and closuresAheadWords are the When you're open card's two sentences with a number in them, and
// hoursZoneWords is the line over the week while it is edited, which names the zone the way that card names it; the
// services row's and sheet's (servicesWords, servicesToldWords, servicesSaveWords, blockShareWords) and the booking
// rules' (bookingRulesWords, BOOKING_RULE_HINTS) are What you offer's. The prompt sheet's are promptBlocks (above) with
// the share it draws a block's cost by, promptCostWords (the exact count, for its description only), promptTotalWords,
// PROMPT_READERS (who reads it, per channel) and PROMPT_NOW (what is sent beside it, and why it is apart).
// needsConsultation and foldName are the rules the services sheet marks a consult-first service by and searches by: the
// Calendar's and the phone tool's own, not copies.
// bookingRuleRefusal is a booking rule's sentence for a number outside its range (business-tab-folds.jsx problemsOf),
// and PROFILE_LIMITS with profileRefusal are the SAME pair for every other cap a fold holds: the most of each thing
// the save would take, read off the schema, and the sentence written from that one number. The page held both, so
// each cap was a literal beside a sentence naming it again. writtenOutDetail is whether one of the three messages
// spells a detail out where the name for it would keep it current (business-tab-answers.jsx).
// What it can do's are the abilities and the limits (abilityRows, cannotRows), the two questions the edge asks of the
// Autonomy tab (bookingHeld, and POLICY_MODES to read the Replies row as stored), the template a call sends the
// booking link as (bookingTemplate), the words each of a row's two channel glyphs is called (ABILITY_CHANNEL_WORDS),
// and capabilityStatus, which is where "this line answers" is decided for Setup and for this card alike -- the card
// reads it off the Setup payload the bridge already publishes (__SETUP) rather than asking the channels itself.
// CHIPS_SHOWN and chipsMoreWords are how many chips any row of the record draws at rest and how the rest are said:
// one number and one spelling for the services, the notes and the rules alike (the kit's RecordChips keeps the cap).
// How it answers' are the voice's starting points (TONE_PRESETS), the hand-off row's (handoffWords, handoffChatWords,
// handoffCallWords), the notes' (notesWords), the owner's own words' (instructionsWords), the three messages'
// (fallbacksWords), and what the rules fold says on a record whose details compose nothing (rulesWithoutFieldsWords),
// which it asks the resolver's own test of (hasProfile), never a copy of it. guardrailsInForce is which rules are in
// force, each with its default applied: the composer's and Ask's one reading, which the rules fold opens its switches by,
// and rulesKept is which of them the row at rest may name -- derived from the three strengths, since a checked rule
// holds with its switch off and an instructed one holds only where the record composes a prompt to put it in.
// What you offer's first row is how customers buy (0008): sellsByVM is its row, its choice and what the answer switches
// on the page (the consult-first row's hint), and sellsBySaved the toast once an answer is taken.
export const BUSINESS_TAB = {
  standingLine,
  rulesKept,
  VISION_STRENGTH,
  ABILITY_CHANNEL_WORDS,
  abilityRows,
  cannotRows,
  bookingHeld,
  bookingTemplate,
  capabilityStatus,
  POLICY_MODES,
  ruleStrength,
  GUARDRAIL_KEYS,
  promptBlocks,
  consequenceOf,
  profileCrossing,
  saveIssues,
  openWeekWords,
  hoursZoneWords,
  closuresAheadWords,
  servicesWords,
  servicesToldWords,
  servicesSaveWords,
  blockShareWords,
  promptCostWords,
  promptTotalWords,
  PROMPT_READERS,
  PROMPT_NOW,
  bookingRulesWords,
  BOOKING_RULE_HINTS,
  needsConsultation,
  foldName,
  serviceUndoName,
  servicesFoundWords,
  bookingRuleRefusal,
  TONE_PRESETS,
  handoffWords,
  handoffChatWords,
  handoffCallWords,
  notesWords,
  CHIPS_SHOWN,
  chipsMoreWords,
  instructionsWords,
  fallbacksWords,
  isProductFallback,
  rulesWithoutFieldsWords,
  hasProfile,
  guardrailsInForce,
  PROFILE_LIMITS,
  profileRefusal,
  writtenOutDetail,
  sellsByVM,
  sellsBySaved,
  bookingLinkOptional,
  bookingLinkRowWords,
  BOOKING_LINK_NEEDED,
};
export type BusinessTabHelpers = typeof BUSINESS_TAB;

/**
 * The two the page reads beside `__businessTab`, under the names the old card read them by: the week's summary, which
 * is the composer's own run-collapsing in the Calendar's words (C3; never a second copy of "which days share their
 * hours", which is how a card and the receptionist start disagreeing), and the caps the write schema keeps, so a fold
 * offers no shift or closed day the save would refuse.
 *
 * Here, with the tab's helpers, rather than in inbox-verbs.ts, where they were the old form's: this module is also what
 * the standalone mockup is handed (serve-legacy.mjs builds it as data/business-tab.js), and the page mounted there drew
 * "Not set" over a week that had hours, and the literal caps, while they were published only to the app.
 */
const CONFIG_LIMITS = { maxIntervalsPerDay: MAX_INTERVALS_PER_DAY, maxClosures: MAX_CLOSURES };

declare global {
  interface Window {
    /** The Business tab's view models, and the block of the prompt each fold writes. */
    __businessTab?: BusinessTabHelpers;
    __hoursLines?: typeof hoursLines;
    __configLimits?: typeof CONFIG_LIMITS;
  }
}

export function installBusinessTab(): void {
  window.__businessTab = BUSINESS_TAB;
  window.__hoursLines = hoursLines;
  window.__configLimits = CONFIG_LIMITS;
}
