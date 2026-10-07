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

/** The rules that follow every prompt whatever the Autonomy rows say, as bullet lines. */
export const standingLines = (channel = "whatsapp") => [`- ${MONEY_RULE[channel]}`, `- ${DATA_NOT_INSTRUCTIONS}`];

/** A hand-written prompt as it is sent: its own words, then the rules. `before` names rules that come first. */
export const withStanding = (prompt, channel = "whatsapp", before = []) =>
  `${prompt}\n\nRules you must follow:\n${[...before.map((r) => `- ${r}`), ...standingLines(channel)].join("\n")}`;
