/** Words: lines. */

import { broadcastFailureWords, readFailure } from "../../../campaigns/broadcasts/failure-words";
import { HELD_REASONS, REPLY_DAYS, REPLY_WINDOW_WORDS } from "../../../campaigns/broadcasts/run-words";
import { failureWordsOf } from "../../../conversations/message-words";
import { pct } from "../../../shared/numbers";
import { capitalize, joinWords, plural } from "../../../shared/words";
import { ownWord } from "../../mix";
import { REPORT_MIN_N, isThinShare, messagesAnsweredWords } from "../../tiles";

/* ------------------------------------------------------------------------------------------------ the funnel */

export const NO_MESSAGE_WENT_OUT = "No message went out in this period.";

/** The verb of a count: "1 was", "0 were", "2 were". */
const wasWere = (n: number): string => (n === 1 ? "was" : "were");

/**
 * The funnel's own sentence: of the messages, how many were delivered, (of WhatsApp's own, how many were read,) and how
 * many were answered, as its last row says it. Shares from five messages, the counts under that.
 */
export function funnelLine(fields: {
  sent: number;
  delivered: number;
  read: number;
  readOf: number;
  replied: number;
}): string {
  if (fields.sent < REPORT_MIN_N) {
    return `Of ${plural(fields.sent, "message")}, ${fields.delivered} ${wasWere(fields.delivered)} delivered and ${fields.replied} ${wasWere(fields.replied)} answered.`;
  }
  // A read is a share of WhatsApp's own sends alone: said from five of them, as the head says its people (the Read row keeps the count).
  const read = fields.readOf >= REPORT_MIN_N ? `, ${pct(fields.read, fields.readOf)}% of WhatsApp's were read` : "";
  return `${pct(fields.delivered, fields.sent)}% were delivered${read} and ${pct(fields.replied, fields.sent)}% were answered ${REPLY_WINDOW_WORDS}, of ${plural(fields.sent, "message")}.`;
}

/* ------------------------------------------------------------------------------------------------ held, stopped, failed */

export const HELD_EMPTY = "Nobody was held back in this period.";

const HELD_OTHER = "Another reason";

/** A reason of the product's own stays; any other word the database sent is "other" (the rows are summed under it). */
export const heldKeyOf = (key: string): string => (ownWord(HELD_REASONS, key) === undefined ? "other" : key);

export const heldReasonWords = (key: string): string => capitalize(ownWord(HELD_REASONS, key) ?? HELD_OTHER);

/** How many of those planned were held back: the messages sent and the people held make the messages planned. */
export const heldBackLine = (held: number, sent: number): string =>
  `${held} of the ${plural(sent + held, "message")} planned ${wasWere(held)} held back or could not be sent.`;

/** Under the Runs that stopped card: the window counts a campaign's and a broadcast's runs; a reach-out's are its own part's (00405). */
const REACH_OUTS_UNDER = "Runs to leads are not counted here.";

export const STOPPED_EMPTY = `No run failed or was canceled in this period. ${REACH_OUTS_UNDER}`;

export const CANCELED_KEY = "canceled";

/** A failure the product has words for stays; any other code is "other" (the rows are summed under it). */
export const stoppedKeyOf = (key: string): string => (readFailure(key) === null ? "other" : key);

export const stoppedWords = (key: string): string =>
  key === CANCELED_KEY ? "Canceled" : capitalize(broadcastFailureWords(key));

export const stoppedLine = (failed: number, canceled: number): string =>
  `${plural(failed, "run")} failed and ${canceled} ${wasWere(canceled)} canceled. ${REACH_OUTS_UNDER}`;

export const FAILED_WHY_EMPTY = "No sent message failed in this period.";

const UNRECORDED_REASON = "Reason not recorded";

/**
 * A failed send's reason in the words the Inbox's thread uses for the same row (failureWordsOf), without their full stop.
 * The words are what its row is counted under: sends that read alike are one row, whatever channel they went by.
 */
export function failedReasonWords(row: { channel: string; code: number | null; kind: string | null }): string {
  const words = failureWordsOf(row.channel, { code: row.code ?? null, kind: row.kind ?? null });
  return words === null ? UNRECORDED_REASON : words.replace(/\.$/, "");
}

export const failedWhyLine = (total: number): string =>
  `${plural(total, "message")} failed after ${total === 1 ? "it was" : "they were"} sent, for the provider's own reason.`;

/* ------------------------------------------------------------------------------------------------ by message, by run */

const BY_MESSAGE_LINE = `A reply is counted only for messages sent more than ${REPLY_DAYS} ago, so each has had its time.`;

/** Under every message's rate: a reply is counted only of sends that have had their time, and how many have not. */
export const byMessageLine = (tooNew: number): string =>
  tooNew === 0
    ? BY_MESSAGE_LINE
    : `${BY_MESSAGE_LINE} ${tooNew} sent since ${tooNew === 1 ? "is" : "are"} not counted yet.`;

/**
 * One message's bar, in words: how many of the sends that have had their time were answered ("30 of 110 were answered": a
 * send is answered, a person writes back), and the share from five of them (isThinShare: under that, the count alone).
 */
export function messageRateWords(message: { sent: number; mature: number; replied: number }): string {
  if (message.mature === 0) return `${message.sent} sent in the last ${REPLY_DAYS}, too new to say`;
  const sentence = messagesAnsweredWords(message.replied, message.mature);
  return isThinShare(message.mature, REPORT_MIN_N) ? sentence : `${sentence}  ${pct(message.replied, message.mature)}%`;
}

/** The runs behind the sends: "From 12 campaign runs and 2 one-off broadcasts." Null where there were none. */
export function runsLineWords(moment: number, broadcast: number): string | null {
  const kinds = [
    moment > 0 ? plural(moment, "campaign run") : null,
    broadcast > 0 ? plural(broadcast, "one-off send") : null,
  ].filter((kind): kind is string => kind !== null);
  return kinds.length === 0 ? null : `From ${joinWords(kinds)}.`;
}
