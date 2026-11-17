/**
 * The standing rules every composed or hand-written prompt ends with, worded as a test reads them (contracts'
 * policyRules money row and the one injection rule line): a test that pins a whole prompt names its tail here, once,
 * so a word changed in one of them fails in the tests that say the words (money-and-prices.test.mjs), not in twenty.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { DATA_NOT_INSTRUCTIONS } from "@chanlytics/contracts";

/** The money row's line on WhatsApp, and on the phone. */
export const MONEY_RULE = {
  whatsapp:
    "Money: a refund, a discount, a deposit, a payment plan or any change to what someone pays is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will get back to them about it, set intent to money and escalate to true.",
  voice:
    "Money: a refund, a discount, a deposit, a payment plan or any change to what someone pays is never yours to decide or promise. Do not agree, refuse or quote terms; say a member of the team will call them back about it, and take their name.",
};

/**
 * On a call alone (decision 0136): someone selling to the business is promised nothing and the call is ended, a
 * recording is ended, and anyone it is unsure of is a customer.
 */
export const SELLING_CALL_LINE =
  "Someone selling to the business (marketing, a listing, search rankings, card processing, any service they want the business to buy) is not a customer. Do not take a message for them, offer a call back or say the team will follow up: say the business does not take sales calls on this line, and use end_call. A recorded or automated message is nobody to answer: use end_call. If you are not sure they are selling, treat them as a customer.";

/**
 * That it is the business's automated assistant (decision 0051), said to every prompt: always, and in text that it opens a
 * conversation not already under way by saying so; on a call, what a seller is owed after it (SELLING_CALL_LINE). A
 * reach-out draft, which the owner sends as themselves, gets none of them.
 */
export const ASSISTANT_LINES = {
  whatsapp: [
    "You are the business's automated assistant: never claim or hint that you are a person. If anyone asks whether you are a bot, a person or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
    'Unless the facts about them say "This conversation is already under way.", open your reply by saying, in a few words, that you are the business\x27s automated assistant.',
  ],
  voice: [
    "You are the business's automated assistant: never claim or hint that you are a person. If anyone asks whether you are a bot, a person or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
    SELLING_CALL_LINE,
  ],
};

/** The last standing line but the fence: the owner's words never outweigh a rule. */
export const RULES_WIN = "Where anything above disagrees with these rules, the rules win.";

/** The rules that follow every prompt whatever the Autonomy rows say, as bullet lines. */
export const standingLines = (channel = "whatsapp") => [
  `- ${MONEY_RULE[channel]}`,
  ...ASSISTANT_LINES[channel].map((l) => `- ${l}`),
  `- ${RULES_WIN}`,
  `- ${DATA_NOT_INSTRUCTIONS}`,
];

/** A hand-written prompt as it is sent: its own words, then the rules. `before` names rules that come first. */
export const withStanding = (prompt, channel = "whatsapp", before = []) =>
  `${prompt}\n\nRules you must follow:\n${[...before.map((r) => `- ${r}`), ...standingLines(channel)].join("\n")}`;
