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
  standingLine, abilityRows, cannotRows, bookingHeld, bookingTemplate, ruleStrength, GUARDRAIL_KEYS,
  promptBlocks, resolveSystemPrompt, isBaselinePrompt, TenantConfigWriteSchema, type PromptBlockVM,
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
} as const satisfies Record<string, string | null>;

export type FoldSection = keyof typeof FOLD_BLOCK;

/** What consequenceFor reads off the window: the preview the settings read composed, with its inputs. */
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
 * `section` and `channel` are checked as it runs, because the page is untyped:
 * a fold it does not know, or a channel that is not one, is a TypeError naming it.
 */
export function consequenceFor(
  w: ConsequenceWindow,
  section: FoldSection,
  next: unknown,
  channel: "whatsapp" | "voice",
  now: Date,
): PromptBlockVM | null {
  if (!Object.prototype.hasOwnProperty.call(FOLD_BLOCK, section)) {
    throw new TypeError(`consequenceOf knows no fold named ${JSON.stringify(section)}. It knows ${Object.keys(FOLD_BLOCK).join(", ")}.`);
  }
  if (channel !== "whatsapp" && channel !== "voice") {
    throw new TypeError(`consequenceOf needs the channel it will be told on, "whatsapp" or "voice", not ${JSON.stringify(channel)}.`);
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
  return promptBlocks(text, channel, brain).find((b) => b.row === row) ?? null;
}

/** consequenceFor over this tab's window, at this moment: the one the page calls. */
function consequenceOf(section: FoldSection, next: unknown, channel: "whatsapp" | "voice"): PromptBlockVM | null {
  return consequenceFor(window as unknown as ConsequenceWindow, section, next, channel, new Date());
}

/**
 * `isBaselinePrompt` tells the Name row whether the stored prompt is the product's own opening lines, which name the
 * business: a rename writes them again under the new name, as the old form's save did, or the receptionist is told
 * both names. A stored prompt that is anything else is the owner's words, and a rename leaves it alone.
 */
export const BUSINESS_TAB = { standingLine, abilityRows, cannotRows, bookingHeld, bookingTemplate, ruleStrength, GUARDRAIL_KEYS, promptBlocks, consequenceOf, isBaselinePrompt };
export type BusinessTabHelpers = typeof BUSINESS_TAB;

declare global {
  interface Window {
    /** The Business tab's view models, and the block of the prompt each fold writes. */
    __businessTab?: BusinessTabHelpers;
  }
}

export function installBusinessTab(): void {
  window.__businessTab = BUSINESS_TAB;
}
