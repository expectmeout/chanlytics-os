/**
 * The questions a lead's own preview offers first, written for its business as the preview is built (decision 0079,
 * amended 18 November 2026; the edge's previews/starters.ts asks the model for them): the one reader of the model's
 * answer and of the list the preview's workspace keeps (config `preview.starters`).
 *
 *   previewStartersWrittenOf  the questions as written, read for what each is: short, a customer's, and never a price
 *                             it would refuse or a time to come in (many businesses go to the customer)
 *
 * The page offers these where some were written, and the ones it makes from the record where none were
 * (lead-preview.ts previewPageOf). Nothing here is told to the receptionist: a question is something a customer says.
 */

/** The questions a page offers of the ones written. */
export const PREVIEW_STARTERS_MOST = 3;

/** A question's length, in characters: a customer's first message, never a paragraph. */
const QUESTION_LEAST = 8;
const QUESTION_MOST = 90;

/**
 * A question about what something costs, in the words that are a price's alone: the preview's receptionist quotes none.
 * "Charge" and "rate" count only where they are money's ("do you charge", "your rates"), since a thing that will not
 * charge and a thing someone rates are ordinary questions of other trades.
 */
const ASKS_A_PRICE =
  /\b(?:how much|pric(?:e[sd]?|ing)|cost(?:s|ing)?|fees?|quotes?|estimates?|cheap\w*|discounts?|coupons?)\b|\b(?:you|they) charge\b|\bcharge (?:for|per|extra)\b|\b(?:your|hourly|daily|flat) rates?\b|[$€£]/i;

/** A question that asks when the customer may come in: many businesses go to the customer, and it sees no calendar. */
const ASKS_A_VISIT_TIME =
  /\bcome in\b|\b(?:come|stop|drop|swing) by\b|\bwhat time (?:can|could|should|may) i\b|\bwhen (?:can|could|should|may) i (?:come|stop|drop|bring|get in|be seen)\b/i;

/** A link or an address: a question holds neither. */
const HOLDS_A_LINK = /https?:|www\.|\S@\S/i;

/** One question as it is offered, or null: a short line of a customer's, within the rule. */
function starterOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, "")
    .trim();
  if (text.length < QUESTION_LEAST || text.length > QUESTION_MOST) return null;
  if (HOLDS_A_LINK.test(text) || ASKS_A_PRICE.test(text) || ASKS_A_VISIT_TIME.test(text)) return null;
  return text;
}

/**
 * The questions written for a business, read for what each is: the model's list, or the one its workspace keeps (the
 * same reading, so a list stored by an older or a newer build is held to today's rule). Each once, the first
 * PREVIEW_STARTERS_MOST; none for anything that is not a list.
 */
export function previewStartersWrittenOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const kept: string[] = [];
  for (const item of raw) {
    const question = starterOf(item);
    if (question && !kept.some((held) => held.toLowerCase() === question.toLowerCase())) kept.push(question);
    if (kept.length === PREVIEW_STARTERS_MOST) break;
  }
  return kept;
}
