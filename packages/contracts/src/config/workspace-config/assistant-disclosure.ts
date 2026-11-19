/**
 * Whether a text conversation is already under way (decision 0051, "The owner's words").
 *
 * The usage policy of the model the receptionist runs on asks every consumer-facing agent to say it is AI at the start
 * of each session. A call opens with the greeting, which says it (voice/greeting-owner.ts). A text conversation has no
 * opening of its own, and one conversation row holds a person's whole history, so a session is said here: a
 * conversation with no message in the last day starts again, and the receptionist opens its reply by saying it is the
 * business's AI assistant.
 *
 * Two halves that must agree, said from here so each has ONE spelling, as offers-ask.ts does:
 *
 *   - the rule the receptionist is told (compose.ts standingRules): unless the facts about them say the conversation is
 *     under way, open by saying it is the business's AI assistant;
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
  params: {
    /** They have said anything at all before (LeadContext.returning). */
    returning: boolean;
    /** The newest message before the one being answered, as describeLead reads it (LeadContext.lastSeenAt). */
    lastTurnAt: string | null | undefined;
  },
  channel: LeadChannel | undefined,
  now: Date,
): string[] {
  if (channel === "voice" || !params.returning || !params.lastTurnAt) return [];
  const at = Date.parse(params.lastTurnAt);
  return Number.isFinite(at) && now.getTime() - at < CONVERSATION_GAP_MS ? [CONVERSATION_UNDER_WAY] : [];
}

/**
 * A call from someone selling to the business, or from a recording (decision 0136). The receptionist treated a
 * telemarketer as a customer: it took their message and said the team would follow up, the call's analysis asked for a
 * call back, and the number sat in Needs you (17 Nov 2026). It is told what such a caller is, to promise them nothing,
 * and to end the call; and, since a customer taken for a salesperson is the worse mistake, that anyone it is unsure of
 * is a customer. On a call alone: a pitch in a chat is read by the sender's reader (decision 0080), not by the brain.
 * Said here, beside the other standing line about who is on the other end, and placed by compose.ts standingRules.
 */
const SELLING_CALL_RULE =
  "Someone selling to the business (marketing, a listing, search rankings, card processing, any service they want the business to buy) is not a customer. Do not take a message for them, offer a call back or say the team will follow up: say the business does not take sales calls on this line, and use end_call. A recorded or automated message is nobody to answer: use end_call. If you are not sure they are selling, treat them as a customer.";

/**
 * What a call may send: the booking link, where the call's booking line lets it go, and nothing else, ever. On a
 * scripted call of 19 Nov 2026 a caller asked for the price list by email and AI said it was "on its way to your
 * inbox": nothing on a call can email, and nothing had told it so. So any other ask is taken down and passed on, an
 * email address read back, and nothing is said to be sent unless a tool said so. The call's write-up takes such an ask
 * as a to-do (channels CALL_ANALYSIS_FIELDS), so a person sends it.
 */
const NOTHING_ELSE_IS_SENT =
  "Apart from the booking link, and only where these instructions let you send it, you cannot send anything from this call, now or later: no email, no text message, no price list, quote, photos, form or confirmation. When the caller asks for something like that, say you can't send it from the call, take their name, what they want and where it should go (read an email address back to them), and say you will pass it on so someone from the business can get back to them. Never say anything has been sent or is on its way unless a tool said so.";

/**
 * No time for someone to call or write back, not even one the caller asks for: nobody at the business has said they
 * are free then. The same scripted calls: asked for a call back "this afternoon", AI said the team would call this
 * afternoon three times in four while this was the tail of the line above. The time is passed on instead, and the
 * write-up's to-do carries it. The paused line's script says the same (billing pausedVoiceFacts).
 */
const NO_TIME_PROMISED =
  'Never promise when someone from the business will call or write back, not even a time the caller asks for: nobody there has said they are free then. Pass the time on instead: say "I\'ll let the team know you\'d like a call this afternoon", never "they\'ll call you this afternoon".';

/**
 * The standing lines a call alone is told after that it is an AI assistant, in this order: what a seller is owed,
 * nothing but the booking link sent, and no time for a call back (compose.ts standingRules). A chat answers in the
 * thread it is asked in, and a draft is the owner's to send, so neither is told the last two.
 */
export const CALL_RULES = [SELLING_CALL_RULE, NOTHING_ELSE_IS_SENT, NO_TIME_PROMISED] as const;
