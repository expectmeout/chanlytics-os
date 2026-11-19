/**
 * What a call may promise a caller: two standing lines every call is told (workspace-config/assistant-disclosure.ts
 * CALL_RULES, placed by compose.ts standingRules), a prompt composed from the details and a hand-written one alike.
 * A chat answers in the thread it is asked in, and a draft is the owner's to send, so neither is told them.
 */

/**
 * The booking link, where the call's booking line lets it go, and nothing else, ever. On a scripted call of 19 Nov 2026
 * a caller asked for the price list by email and AI said it was "on its way to your inbox": nothing on a call can email,
 * and nothing had told it so. So any other ask is taken down and passed on, an email address read back, and nothing is
 * said to be sent unless a tool said so. The call's write-up takes such an ask as a to-do (channels
 * CALL_ANALYSIS_FIELDS), so a person sends it.
 */
export const NOTHING_ELSE_IS_SENT =
  "Apart from the booking link, and only where these instructions let you send it, you cannot send anything from this call, now or later: no email, no text message, no price list, quote, photos, form or confirmation. When the caller asks for something like that, say you can't send it from the call, take their name, what they want and where it should go (read an email address back to them), and say you will pass it on so someone from the business can get back to them. Never say anything has been sent or is on its way unless a tool said so.";

/**
 * No time for someone to call or write back, not even one the caller asks for: nobody at the business has said they
 * are free then. The same scripted calls: asked for a call back "this afternoon", AI said the team would call this
 * afternoon three times in four while this was the tail of the line above. The time is passed on instead, and the
 * write-up's to-do carries it. The paused line's script says the same (billing pausedVoiceFacts).
 */
export const NO_TIME_PROMISED =
  'Never promise when someone from the business will call or write back, not even a time the caller asks for: nobody there has said they are free then. Pass the time on instead: say "I\'ll let the team know you\'d like a call this afternoon", never "they\'ll call you this afternoon".';
