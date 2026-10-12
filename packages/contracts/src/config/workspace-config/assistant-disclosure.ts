/**
 * Whether a text conversation is already under way (decision 0051, "The owner's words").
 *
 * The usage policy of the model the receptionist runs on asks every consumer-facing agent to say it is AI at the start
 * of each session. A call opens with the greeting, which says it (voice/greeting-owner.ts). A text conversation has no
 * opening of its own, and one conversation row holds a person's whole history, so a session is said here: a
 * conversation with no message in the last day starts again, and the receptionist opens its reply by saying it is the
 * business's automated assistant.
 *
 * Two halves that must agree, said from here so each has ONE spelling, as offers-ask.ts does:
 *
 *   - the rule the receptionist is told (compose.ts standingRules): unless the facts about them say the conversation is
 *     under way, open by saying it is the business's automated assistant;
 *   - the fact it reads of the person each turn (disclosureFacts, said by describeLead in packages/db).
 *
 * The rule fails open: a reader that could not say (the eval, a lookup that failed) says nothing, and the receptionist
 * introduces itself. Any message counts as the conversation going on, the owner's or a campaign's included, so a person
 * a member has just answered is not told again by the receptionist; a code stamp on the receptionist's own first reply
 * is the named follow-up that would tell those apart.
 */
import { DAY_MS } from "../../shared/time";
import type { LeadChannel } from "./offers-ask";

/** The fact, word for word: the rule names it, so the two cannot drift. */
export const CONVERSATION_UNDER_WAY = "This conversation is already under way.";

/** A conversation quiet for longer than this is a new one, and the receptionist introduces itself again. */
export const CONVERSATION_GAP_MS = DAY_MS;

/**
 * The fact for the lead note, or nothing: said on a text conversation whose newest message before the one being
 * answered is less than a day old. Never on a call, which the greeting opens.
 */
export function disclosureFacts(
  p: {
    /** They have said anything at all before (LeadContext.returning). */
    returning: boolean;
    /** The newest message before the one being answered, as describeLead reads it (LeadContext.lastSeenAt). */
    lastTurnAt: string | null | undefined;
  },
  channel: LeadChannel | undefined,
  now: Date,
): string[] {
  if (channel === "voice" || !p.returning || !p.lastTurnAt) return [];
  const at = Date.parse(p.lastTurnAt);
  return Number.isFinite(at) && now.getTime() - at < CONVERSATION_GAP_MS ? [CONVERSATION_UNDER_WAY] : [];
}
