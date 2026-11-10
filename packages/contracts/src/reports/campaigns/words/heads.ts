/** Words: heads. */

import { DELIVERY_RECEIPTS_WORDS, REPLY_DAYS, REPLY_WINDOW_WORDS } from "../../../campaigns/broadcasts/run-words";
import { plural } from "../../../shared/words";
import { REPORT_MIN_N, beforeWords } from "../../tiles";

/** A figure with nothing to say: a dash, whose meta says why. */
export const NO_FIGURE = "—";

/* ------------------------------------------------------------------------------------------------ the head */

export const NOTHING_WENT_OUT = "Nothing went out in this period.";

/** What the reach-outs wrote, said after "Nothing went out": they are the only thing that did. Nothing where they wrote none. */
export function reachOutsWroteWords(emails: number, businesses: number | undefined): string {
  if (emails === 0) return "";
  const to = businesses === undefined ? "" : ` to ${plural(businesses, "business", "businesses")}`;
  return ` Your cold email sequences wrote ${plural(emails, "email")}${to}.`;
}

/** The people the period's runs reached, and how many of them wrote back, against the period before's. */
interface HeadFacts {
  messages: number;
  people: number;
  runs: number;
  /** Null where the database did not say. */
  wroteBack: number | null;
  before: { sentTo: number | null; wroteBack: number | null };
  /** The period's name as `rangeLabelOf` says it: "30 days". */
  range: string;
}

/**
 * "240 messages to 180 people over 14 runs; 48 of 180 wrote back (41 the 30 days before)." The clause is a share of the
 * people, so it is said only of five or more; its parenthesis is the period before's count, said where that period had
 * people sent to.
 */
export function peopleHeadWords({ messages, people, runs, wroteBack, before, range }: HeadFacts): string {
  const sentence = `${plural(messages, "message")} to ${plural(people, "person", "people")} over ${plural(runs, "run")}`;
  if (people < REPORT_MIN_N || wroteBack === null) return `${sentence}.`;
  const hadPeople = before.sentTo !== null && before.sentTo > 0 && before.wroteBack !== null;
  const was = hadPeople ? ` (${before.wroteBack === 0 ? "none" : before.wroteBack} ${beforeWords(range)})` : "";
  return `${sentence}; ${wroteBack} of ${people} wrote back${was}.`;
}

/** The head without the ledger: the sends alone, over the sources' runs, and the answered messages from five. */
export function sendsHeadWords(sent: { messages: number; runs: number; replied: number }): string {
  const sentence = `${plural(sent.messages, "message")} over ${plural(sent.runs, "run")}`;
  return sent.messages >= REPORT_MIN_N ? `${sentence}; people wrote back to ${sent.replied} of them.` : `${sentence}.`;
}

/* ------------------------------------------------------------------------------------------------ the strip */

const NO_MESSAGE_SENT = "no message went out in this period";

const NOTHING_SENT = "nothing sent";

const NOBODY_SENT_TO = "nobody was sent a message in this period";

export const NOBODY_IN_PERIOD = "nobody in this period";

/** The line under a yes or a stop: it is the answer to a message of yours, within the reply window. */
export const ANSWER_META = `after a message of yours, ${REPLY_WINDOW_WORDS}`;

/** The messages and runs behind the people sent to; with the sends unread (`messages` null), the runs alone. */
export function sentToMeta(messages: number | null, runs: number): string {
  if (messages === null) return plural(runs, "run");
  return messages === 0 ? NO_MESSAGE_SENT : `${plural(messages, "message")} over ${plural(runs, "run")}`;
}

export function deliveredMeta(delivered: number, sent: number): string {
  return sent === 0 ? NOTHING_SENT : `${delivered} of ${sent} · ${DELIVERY_RECEIPTS_WORDS}`;
}

/**
 * Who wrote back, of whom: "48 of 180 people within 3 days", and the people whose time is not over (`counting`, as the
 * database counts them by the clock, whatever day the window ends: 0 once every send has had its time; null, a count it
 * did not send, says nothing of them).
 */
export function wroteBackMeta(facts: { wroteBack: number; people: number; counting: number | null }): string {
  if (facts.people === 0) return NOBODY_SENT_TO;
  const still =
    facts.counting !== null && facts.counting > 0
      ? `, ${facts.counting} sent to in the last ${REPLY_DAYS} may still answer`
      : "";
  return `${facts.wroteBack} of ${plural(facts.people, "person", "people")} ${REPLY_WINDOW_WORDS}${still}`;
}
