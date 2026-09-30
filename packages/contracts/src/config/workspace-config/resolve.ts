/**
 * Which instructions a workspace's receptionist is given: a prompt composed from its profile when the profile
 * holds anything to compose (hasProfile), its stored prompt when not (resolveSystemPrompt), and whose words stand
 * in the owner's place (whoseWords), which the Business tab's instructions box opens with (instructionsDraft).
 */
import { resolveFacts, type KnownFacts } from "../facts";
import { offersBookingLink } from "../no-booking-link";
import { BASELINE_CLOSING, BASELINE_OPENING, isBaselinePrompt, type BrainConfig } from "./brain-config";
import type { BusinessProfile } from "./business-profile";
import { composeSystemPrompt, noLinkBooking, standingRules, PROMPT_OPENINGS } from "./compose";

/**
 * What the Business form's instructions box opens with (S4).
 *
 * The owner's own instructions when they have written some. Otherwise the
 * prompt a profile carries in their place, shown so nothing the receptionist
 * follows is out of sight and marked `carried` so the form can say where it
 * came from -- unless it is the product's baseline, which no owner wrote. A
 * save then keeps what the box holds as the owner's and puts the baseline back
 * as the prompt: the text is stored once, and an emptied box stays empty
 * instead of filling itself again from the copy left behind.
 *
 * ONE rule with the prompt view: whoseWords (plan Task 3.8, shipped 22 Sep).
 * Own words open as the owner's; a prompt standing in the owner's place (carried
 * or a workspace's own, whichever the resolver does with it) opens marked
 * carried; the product's own opening lines and nothing to read open an empty box.
 * Kept exactly as stored, spaces and all, so a save writes back what was there.
 *
 * Phase 1 left the two disagreeing on one case, knowingly: the baseline stored
 * in the OWNER'S own field, where a save before S4 copied it. The box opened it
 * as the owner's words because routing it here made it open EMPTY and the live
 * form's next Save deleted the field -- and a workspace whose only composed
 * field was that copy fell from a composed prompt to the bare baseline, losing
 * its hand-off and every rule line. That save is gone: the fold that replaced
 * the form sends nothing at all when its box is left as it opened
 * (business-tab-folds.jsx, holdsChanges), so an empty box deletes nothing by
 * being looked at. What a save with something typed in it should do with that
 * copy is open, and nothing in production has it (the count under plan Task 3.8).
 */
export function instructionsDraft(
  brain: { system_prompt?: string | null; profile?: { extra_instructions?: string | null } | null } | null | undefined,
): { text: string; carried: boolean } {
  const whose = whoseWords(brain);
  if (whose.kind === "own") return { text: whose.text, carried: false };
  // carried and prompt alike: words the owner did not write into their own field, shown so
  // nothing the receptionist follows is out of sight, and marked so the box can say where
  // they came from. baseline and none open empty -- the product's lines are never the owner's.
  return whose.kind === "carried" || whose.kind === "prompt"
    ? { text: whose.text, carried: true }
    : { text: "", carried: false };
}

/**
 * What a record whose details compose nothing is told, in ONE sentence.
 *
 * Two places on the Business tab say it: the rules fold, where the rules block would be
 * (business-tab.ts RULES_WITHOUT_FIELDS_WORDS), and the prompt view, over the stored prompt the
 * resolver hands such a record back (prompt-blocks.ts). They were two sentences saying the same
 * thing in two spellings, which is two sentences to keep true; both are built from this one now,
 * so an owner reading the page twice reads the same words. `hasProfile`, below, is what decides
 * whether either is said.
 */
export const NO_FIELDS_COMPOSED_WORDS = "None of the details on this page are composed into what it reads yet.";

/** True when a profile carries anything worth composing from. */
export function hasProfile(p: BusinessProfile | undefined | null): boolean {
  if (!p) return false;
  // Seven days that are all closed is a SHAPE, not a fact. The editor writes
  // every day on save, so counting keys would let an owner who opened the form
  // and pressed Save with nothing filled in switch their receptionist onto a
  // composed prompt containing no hours, no services and no address — strictly
  // worse than the hand-written one it replaced. At least one real opening
  // time has to exist before this counts.
  const statedHours = !!p.hours && Object.values(p.hours).some((h) => (h?.open && h?.close) || h?.intervals?.length);
  // NOT closures. Their contents EXPIRE: a profile whose only fact is a closure
  // would compose a real prompt while it was upcoming and, the day after it
  // passed, compose one with no hours, no address and no services — while this
  // still returned true, so it could never fall back to the hand-written
  // prompt either. A prompt that changes what it says because a date went by,
  // from a config nobody touched.
  return !!(
    p.address ||
    p.tone ||
    p.extra_instructions ||
    statedHours ||
    p.services?.length ||
    p.languages?.length ||
    p.escalate_when?.length ||
    p.website ||
    p.notes?.length
  );
}

/**
 * The instructions this workspace's receptionist should actually receive.
 *
 * ONE resolver, so no caller has to remember the precedence. A workspace that
 * has filled in its profile gets a prompt composed from those facts; one that
 * has not keeps the prompt it already had, byte for byte, with the standing
 * rules after it (compose.ts standingRules: the Autonomy rows in force, the
 * money charter, the rule that a customer's words are data).
 *
 * That fallback is the whole reason this can ship: the pilot's hand-written
 * prompt is live and answering real customers, and a migration that changed
 * what its receptionist says the moment the code deployed would be a
 * behaviour change nobody asked for. The standing rules are the one change it
 * takes: money and someone else's instructions are never the receptionist's,
 * in any workspace's words (the scorecard, 29 September 2026).
 */
export function resolveSystemPrompt(
  brain: BrainConfig,
  channel: "whatsapp" | "voice" = "whatsapp",
  /** IANA zone from `tenants.timezone`. Labels the hours; never a second copy. */
  tz?: string | null,
  /** Only used to drop closures that have already passed. */
  now: Date = new Date(),
  /** The workspace's Autonomy rows, so Booking and FAQ under "ask" reach a hand-written prompt too. */
  policy?: Record<string, { mode: string }> | null,
  /**
   * What the platform knows independently of what was typed: the channel rows
   * it provisioned, the Google listing it verified.
   *
   * The prompt is the one place these facts are SPOKEN, so it is the one place
   * they have to be resolved rather than read raw. Typed still wins — see
   * facts.ts for why silently overriding a live receptionist's words would be
   * the worse bug — but a workspace that never typed a number now says the line
   * it actually answers instead of nothing, and the disagreement is nameable
   * everywhere else because it is computed here.
   */
  known?: KnownFacts | null,
): string {
  if (!hasProfile(brain.profile)) {
    // A stored prompt says nothing of a link it does not have: a receptionist with none is told what to do instead,
    // first among the rules that follow it.
    // The standing rules (the money row, the fence) are said to every prompt, so the rules always follow it.
    const rules = [...(offersBookingLink(brain) ? [] : [noLinkBooking(channel)]), ...standingRules(policy, channel)];
    return `${brain.system_prompt}\n\n${PROMPT_OPENINGS.rules}\n${rules.map((r) => `- ${r}`).join("\n")}`;
  }
  const profile = brain.profile as BusinessProfile;
  const facts = resolveFacts(brain, known);
  const resolved = {
    business_name: facts.business_name.value ?? brain.business_name,
    phone_display: facts.phone_display.value,
    booking_link: facts.booking_link.value ?? brain.booking_link ?? null,
  };
  // NOTHING a workspace already had may be lost by filling in a form.
  //
  // Filling in only the opening hours switched a live receptionist from a
  // 5,000-character hand-written prompt to a 700-character composed one: the
  // address, every service and duration, and the languages it spoke all
  // disappeared, silently, on a line real customers were texting. The profile
  // was doing what it was told; the DEFAULT was wrong.
  //
  // So an existing prompt is carried as extra instructions until the owner
  // has written their own. Once they have, theirs wins — they have seen the
  // old text in the form and decided what to keep. ownWordsOf states that
  // rule, so anything looking for these words in the prompt uses the same one.
  const carried = { ...profile, extra_instructions: ownWordsOf(brain) ?? undefined };
  return composeSystemPrompt(resolved, carried, channel, tz, now, policy);
}

/**
 * The owner's own words, as the receptionist is given them.
 *
 * What they have written into the form, once there is anything in it. Until
 * then the workspace's prompt stands in their place: carried whole when the
 * profile composes, so filling in one field loses nothing, and read as it
 * stands when it does not. The one statement of that rule. resolveSystemPrompt
 * composes with it, and anything that has to find those words in what the
 * resolver returned looks for them with it, rather than with a copy that can
 * drift.
 */
export function ownWordsOf(
  brain: { system_prompt?: string | null; profile?: { extra_instructions?: string | null } | null } | null | undefined,
): string | null {
  const own = brain?.profile?.extra_instructions;
  return own?.trim() ? own : (brain?.system_prompt ?? null);
}

/** Whose words stand in the owner's place: see whoseWords. */
export type WhoseWords =
  { kind: "own" | "carried" | "prompt" | "baseline"; text: string } | { kind: "none"; text: null };

/**
 * Whose words the receptionist is given in the owner's place, decided once.
 *
 * The words are ownWordsOf's, the resolver's own rule. This says whose they are,
 * for the prompt view (promptBlocks) and for the instructions box, which asks
 * here too (instructionsDraft): the two read the owner's field by one rule, so
 * the box can never open as the owner's what the view charges to the platform.
 *
 *   baseline  the product's own opening lines. In the stored prompt that is
 *             isBaselinePrompt, which reads only the opening and the closing:
 *             only the product writes that prompt. In the OWNER'S field it is
 *             stricter (isBaselineInOwnersField), because there an owner may
 *             have typed their own sentences where the business's name goes,
 *             and calling those the platform's would disown words they wrote.
 *   own       what the owner wrote into the profile's own field.
 *   carried   the profile composes, but its own field is blank, so the stored
 *             prompt stands in: the resolver carries it into the owner's place.
 *   prompt    nothing composes, so the stored prompt is simply the workspace's
 *             prompt, read as it stands. "Composes" is the resolver's own test
 *             (hasProfile): no profile at all, or one holding nothing the
 *             resolver composes from, and the resolver hands the prompt back.
 *   none      nothing to read.
 */
export function whoseWords(
  brain: { system_prompt?: string | null; profile?: { extra_instructions?: string | null } | null } | null | undefined,
): WhoseWords {
  const text = ownWordsOf(brain);
  if (!text?.trim()) return { kind: "none", text: null };
  // The owner's own field first, and under the strict test: the loose one read
  // "…Salon, a family salon since 1998. We never book walk-ins after 5pm. …" as
  // the product's, and would have charged an owner's own words to the platform.
  if (brain?.profile?.extra_instructions?.trim())
    return { kind: isBaselineInOwnersField(text) ? "baseline" : "own", text };
  if (isBaselinePrompt(text.trim())) return { kind: "baseline", text };
  // The profile arrives as the brain stores it; hasProfile reads only what it counts.
  return { kind: hasProfile(brain?.profile as BusinessProfile | null | undefined) ? "carried" : "prompt", text };
}

/**
 * The product's baseline, and only it, when it sits in the OWNER'S own field.
 *
 * isBaselinePrompt reads the opening and the closing and accepts anything
 * between them, which is right for the stored prompt: only the product writes
 * that. In the owner's field it is not -- an owner may have typed their own
 * sentences where the business's name goes. So here the part between must read
 * as a name: something there, on one line, with no sentence break. A name that
 * happens to hold one ("Dr. Rivera's") is read as the owner's, which is the safe
 * way to be wrong: their words shown as theirs, never theirs disowned.
 */
function isBaselineInOwnersField(text: string): boolean {
  const t = text.trim();
  if (!isBaselinePrompt(t)) return false;
  const name = t.slice(BASELINE_OPENING.length, t.length - BASELINE_CLOSING.length);
  return name.trim().length > 0 && name.length <= 120 && !/[\r\n]/.test(name) && !/[.!?]\s/.test(name);
}
