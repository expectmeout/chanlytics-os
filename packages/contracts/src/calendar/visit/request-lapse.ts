/**
 * A time a customer asked for that the owner never answered (decision 0061, as amended 22 Nov 2026). The request has a
 * clock: its owner is nudged once before it runs out, and when it does, AI tells the customer once, the conversation
 * goes back to AI, and the request closes as not confirmed in time. Where the message may not go, nothing is sent and
 * the request waits on a person's reply, as it does after Can't.
 *
 * Here: the clock's three lengths, why a run-out is not told, and every sentence the server says of one (the nudge,
 * the note, the hold's line, what the model is asked to write). The pages' own words are booking-request.ts's. Pure,
 * and the server's alone: no page imports this module.
 */
import type { JobNews } from "../../today/notifications/feed-input";
import { addressOf } from "../../activity/record-address";
import { clockTime } from "../../shared/clock";
import { HOUR_MS } from "../../shared/time";

/*
 * The nudge's two lengths are the database's (00679 booking_requests_due), which is what lists a request to nudge: two
 * hours before it runs out, and only for a request that lives longer than four, so a short one is never nudged on top
 * of the first alert or of the watchdog's "still waiting" two hours in.
 */
/**
 * How long after a request ran out the customer may still be told. Past it, "we couldn't confirm" arriving out of
 * nowhere helps nobody: the same two hours every late reply is held to (core shared/reply-horizon.ts).
 */
export const REQUEST_TOLD_WITHIN_MS = 2 * HOUR_MS;

/**
 * Why a request that ran out is not told to the customer (LapseHold), in the order the rule asks (core lapseHoldOf):
 *
 *   hold_moved       the conversation's hold is no longer the request's (a failed send took it, a person resolved it):
 *                    the request closes and the hold is left as it stands.
 *   late             more than REQUEST_TOLD_WITHIN_MS after it ran out.
 *   person_answered  a person typed a reply since the customer asked: they may have sorted it out by hand.
 *   opted_out        the customer asked to stop.
 *   person_has_it    a person took the conversation over, or a call is in progress on it.
 *   paused           the workspace is paused (billing).
 *   asks_first       the reply setting in force does not let AI speak by itself: Asks you, Stays quiet, or any mode
 *                    while everything is stopped (decision 0139).
 *   no_wire          the conversation's wire is not one a request is told on (WhatsApp or a text), or the request kept
 *                    no number.
 *   window_closed    WhatsApp's reply window closed since they last wrote.
 *   not_written      AI had no words: the day's budget, a refusal, a price it may not say, a failure on its last try.
 */
export type LapseHold =
  | "hold_moved"
  | "late"
  | "person_answered"
  | "opted_out"
  | "person_has_it"
  | "paused"
  | "asks_first"
  | "no_wire"
  | "window_closed"
  | "not_written";

/** The wires a request that ran out is told on: the ones a request is taken on (decision 0061, point 2). */
export const LAPSE_WIRES = ["whatsapp", "sms"] as const;

/** What the request's and the hold's lines say once it ran out. */
export const REQUEST_LAPSE_WORDS = {
  /** The line the conversation's hold takes when the customer could not be told: theirs to answer, as after Can't. */
  reply: (when: string, service: string | null) =>
    `${when}${service ? ` · ${service}` : ""} wasn't confirmed in time: reply to them`,
} as const;

/**
 * What AI is asked to write to the customer, handed to the draft writer as an instruction (edge drafts/writer.ts), which
 * adds what is open on the calendar now. The writer's own checks hold what it writes: no price it was not given, and no
 * promise of when the team will answer.
 */
export function requestLapseInstruction(when: string, service: string | null): string {
  return (
    `They asked to book ${when}${service ? ` for ${service}` : ""} and were told the team would confirm it. ` +
    "Nobody confirmed it in time, and that time is no longer held for them. Tell them so, plainly and kindly, in the " +
    "language they write in, and say sorry that it couldn't be confirmed. If open times are listed below, offer one " +
    "or two of them; if none are, ask what other time would suit them. Confirm no time yourself, and say nothing " +
    "about when the team will answer."
  );
}

/** What a request's notices say of it: who asked, for when, in the business's words. */
export interface RequestSaid {
  appointmentId: string;
  conversationId: string;
  /** Who asked, or null where the record names nobody. */
  who: string | null;
  /** The time asked for, short, on the business's clock (slotShort). */
  when: string;
  service: string | null;
}

const whose = (name: string | null): string => (name ? `${name}'s` : "A customer's");
const requestLine = (request: RequestSaid): string =>
  `${request.when}${request.service ? ` · ${request.service}` : ""}`;

/**
 * The owner's nudge, two hours before a request runs out: who is waiting, for what time, and when it stops being held.
 * A wait on them, as the watchdog's "still waiting" is: the bell, the phones and the mail, opening the conversation.
 * `onceKey` keeps it to one however often the clock asks.
 */
export function requestNudgeNews(request: RequestSaid, expiresAtMs: number, tz: string) {
  const until = clockTime(expiresAtMs, tz);
  return {
    kind: "deadman" as const,
    onceKey: `booking_nudge:${request.appointmentId}`,
    route: addressOf({ kind: "conversation", id: request.conversationId }),
    about: { type: "conversation", id: request.conversationId },
    subject: `${whose(request.who)} time stops being held at ${until}`.slice(0, 200),
    body:
      `They asked for ${requestLine(request)} and are still waiting to hear.\n\n` +
      `Press Booked it or Can't before ${until}. After that the time is free for someone else, ` +
      "and AI tells them it couldn't be confirmed.",
    redactedBody:
      "A time a customer asked for in this workspace is about to stop being held, and nobody could be told.",
  };
}

/**
 * The owner's one note once a request ran out and AI's message to the customer is queued: who, which time, and that AI
 * is letting them know. Said as under way, never as done: the message may still wait its hold window, and the send door
 * has the last word. News and no wait: a line on the bell that opens the conversation, where AI's message is.
 */
export function requestLapsedNews(request: RequestSaid): Omit<JobNews, "sourceEvent"> {
  return {
    kind: "booking_lapsed",
    route: addressOf({ kind: "conversation", id: request.conversationId }),
    about: { type: "conversation", id: request.conversationId },
    subject: `${whose(request.who)} time wasn't confirmed`.slice(0, 200),
    body: `${requestLine(request)}\nAI is letting them know it couldn't be confirmed.`,
    redactedBody: "A time a customer asked for ran out with no answer, and nobody could be told.",
  };
}
