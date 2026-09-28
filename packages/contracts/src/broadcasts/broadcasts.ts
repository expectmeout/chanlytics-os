/**
 * Broadcasts: one approved template to the people who said yes.
 *
 * The first honest campaign. Everything a broadcast may do is decided here,
 * once, and executed by execution-tested code on both sides: the route that
 * enrols the recipients and the job that sends to them use the same
 * predicate for "may this person receive an offer", the same renderer for
 * the words, and the same pacing constants.
 *
 * What a broadcast is NOT: a message to people who have not said yes.
 *
 * WHICH yes, though, is a question this file used to answer wrongly. It said:
 * "the category of the template changes Meta's price and its rules, never ours
 * — a proactive message needs the customer's recorded yes whatever the template
 * is called." That is a defensible-sounding rule and the carriers refused a live
 * campaign over it (error 30913). Consent is per PURPOSE, not per direction:
 * express written consent is required specifically for promotional messages
 * (CTIA §5.1), and a single yes that covers both is what "marketing consent was
 * combined with other consents" means.
 *
 * So the template's category is now load-bearing, through
 * `purposeOfTemplate` — which fails CLOSED, because the column is null for
 * exactly the rows most likely to matter.
 */
import { MIN_MS } from "../shared/time";
import type { ReachOutRunDto } from "../reach-out/reach-out-dtos";
import { templateTitle } from "../templates/template-library";
import { clockDate, clockWhen } from "../shared/clock";
import { noNumberWords, saidYesTo, type PersonRowVM } from "../people/people";
import type { ParamSpec } from "../templates/templates";
import type { AskedPurpose } from "../consent/consent";
import type { Audience } from "./broadcast-audience";
import { broadcastFailureWords } from "./broadcast-failures";
export {
  AUDIENCE_KINDS,
  EVERYONE_LABEL,
  eligibleFor,
  audienceMembers,
  heardWords,
  audiencePreview,
} from "./broadcast-audience";
export type { AudienceKind, Audience, PreviewPerson, AudiencePreview } from "./broadcast-audience";
export {
  BROADCAST_FAILURE_WORDS,
  BROADCAST_FAILURE_FIX,
  broadcastFailureFix,
  broadcastFailureWords,
} from "./broadcast-failures";
export { LIMIT_TIERS, dailyLimit, numberHealth, overLimitRefusal } from "./broadcast-number";
export type { NumberHealthInput, NumberHealth } from "./broadcast-number";
export { RUN_REPORT_STEPS, RUN_FILTERS, consentAnswerWords, receiptWords, toRunReportVM } from "./run-report";
export type { RunFigureId, RunFigure, RunFilterId, RunTone, RunPersonVM, RunReplyVM, RunReportVM } from "./run-report";

export const BROADCAST_STATES = ["pending_approval", "scheduled", "sending", "sent", "canceled", "failed"] as const;
export type BroadcastState = (typeof BROADCAST_STATES)[number];

export const RECIPIENT_STATES = ["queued", "sent", "skipped", "failed"] as const;
export type RecipientState = (typeof RECIPIENT_STATES)[number];

/**
 * A reach-out's send (00183 reach_out_sends): planned (a time and a domain), claimed under the domain's capacity,
 * queued as an email row with its job, then what that row became. A wait refusal plans it again (Reach out, Part 3).
 * The check before it goes may hold it (00197): held waits for its owner, who puts it back or skips it (Part 4).
 */
export const REACH_OUT_SEND_STATES = ["planned", "held", "claimed", "queued", "sent", "skipped", "failed"] as const;
export type ReachOutSendState = (typeof REACH_OUT_SEND_STATES)[number];

export const BROADCAST_STATE_LABELS: Record<BroadcastState, string> = {
  pending_approval: "Needs you",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  canceled: "Canceled",
  failed: "Failed",
};

/** How many go in one job, and the breath between two sends. */
export const BROADCAST_CHUNK = 25;
export const BROADCAST_GAP_MS = 300;
/**
 * How long a run waits each time WhatsApp says "not now" (channels graphThrottled), in order. The person the send was
 * for goes back in the queue and the run tries again after the next wait; a batch that sends without one starts the
 * count again. Past the last wait, or when the next try would fall outside the day's sending hours, the run stops and
 * says why (core messages/broadcast.ts). About an hour in all.
 */
export const BROADCAST_THROTTLE_WAITS_MS: readonly number[] = [
  MIN_MS,
  2 * MIN_MS,
  5 * MIN_MS,
  10 * MIN_MS,
  15 * MIN_MS,
  30 * MIN_MS,
];
/** More than this is not a salon's list; it is a mistake. */
export const BROADCAST_MAX_RECIPIENTS = 2000;
/** Meta's ceiling for one body parameter. */
export const BROADCAST_PARAM_MAX = 1024;
export const BROADCAST_SCHEDULE_MAX_DAYS = 30;
export const BROADCAST_NAME_MAX = 80;
// The reply window and the held reasons live in run-words.ts, where a person's page reads them too.
export { REPLY_WINDOW_HOURS, REPLY_WINDOW_MS, REPLY_WINDOW_WORDS, HELD_REASONS, isReplyTo } from "./run-words";

/** The words a person will read: the body with its numbered slots filled. */
export function renderTemplate(body: string | null | undefined, params: readonly string[]): string {
  return String(body ?? "").replace(/\{\{(\d+)\}\}/g, (m, n: string) => {
    const v = params[Number(n) - 1];
    return typeof v === "string" && v !== "" ? v : m;
  });
}

/**
 * One body value as Meta will accept it: trimmed, no line breaks or tabs, no
 * run of four spaces, under the ceiling. Null means "not acceptable".
 */
export function cleanParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > BROADCAST_PARAM_MAX) return null;
  if (/[\n\r\t]/.test(v) || /\s{4,}/.test(v)) return null;
  return v;
}

/** A name when the owner gave none: the template and the day. */
export function broadcastName(templateName: string, tz: string, now = new Date(), title?: string | null): string {
  // The business's day (clock.ts): a broadcast made at 11 PM in New York is named for that day, wherever the server runs.
  const day = clockDate(now.getTime(), tz, now.getTime());
  return `${templateTitle(templateName, title)} · ${day}`.slice(0, BROADCAST_NAME_MAX);
}

export interface BroadcastCounts {
  queued: number;
  sent: number;
  skipped: number;
  failed: number;
  delivered: number;
  read: number;
  replied: number;
}

export interface BroadcastDto {
  id: string;
  name: string;
  template_id: string;
  template_name: string;
  template_language: string;
  /** What fills each numbered slot: typed text, or the person's first name, the business's name, its booking link. */
  params: ParamSpec[];
  audience: Audience;
  state: BroadcastState;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  recipient_count: number;
  failure: string | null;
  created_at: string;
  /** A playbook's run: which one, and which local day it ran for. */
  playbook_id: string | null;
  run_for: string | null;
  counts: BroadcastCounts;
}

export interface BroadcastVM extends BroadcastDto {
  stateLabel: string;
  /** "today 9:00 AM" / "Sep 12 · 10:00 AM". */
  when: string;
  /** Delivered or read, over sent. Null until something was sent. */
  deliveredPct: number | null;
  readPct: number | null;
  /** Still to come: scheduled or sending. */
  open: boolean;
  /** Sent + skipped + failed over enrolled, for the sending row. */
  progress: number;
  /** A failed broadcast's reason in the owner's words; null in any other state. */
  failureLabel: string | null;
}

/** "today 9:00 AM" · "tomorrow 9:00 AM" · "Sep 12 · 10:00 AM", by the business's day and clock (clock.ts). */
export function whenLabel(iso: string, tz: string, now = new Date()): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockWhen(ms, tz, now.getTime()) : "";
}

export function toBroadcastVM(d: BroadcastDto, tz: string, now = new Date()): BroadcastVM {
  const c = d.counts;
  const attempted = c.sent + c.skipped + c.failed;
  return {
    ...d,
    stateLabel: BROADCAST_STATE_LABELS[d.state] ?? d.state,
    when: whenLabel(d.finished_at ?? d.started_at ?? d.scheduled_for, tz, now),
    deliveredPct: c.sent > 0 ? Math.round((c.delivered / c.sent) * 100) : null,
    readPct: c.sent > 0 ? Math.round((c.read / c.sent) * 100) : null,
    open: d.state === "scheduled" || d.state === "sending" || d.state === "pending_approval",
    progress: d.recipient_count > 0 ? Math.min(1, attempted / d.recipient_count) : 0,
    failureLabel: d.state === "failed" ? broadcastFailureWords(d.failure) : null,
  };
}

/**
 * The recipient's row while a send is in flight — and the reason it KEEPS if
 * the run never comes back to overwrite it.
 *
 * deliver() records a broadcast's message only once the provider has accepted
 * it, so a run killed in between leaves no message row at all: a resumed run
 * would find nothing, see the person still queued, and send them the same
 * template a second time. Written before the wire is touched, this is the row
 * saying "a run was mid-send here and nobody knows how it went" — the same
 * answer the ledger gives for an outbound_send whose run did not report back.
 */
export const OUTCOME_UNKNOWN = "outcome_unknown";

/**
 * Why an audience came out empty, in the owner's words, for the purpose they
 * actually picked.
 *
 * The route used to refuse every empty audience with "Nobody there has said yes
 * to offers yet" -- which for a `utility` template names a consent that message
 * does not need and sends the owner to record an answer that would not help.
 *
 * Written out here rather than composed from `PURPOSE_REFUSALS`, and that is a
 * decision rather than a duplication: those sentences are about ONE PERSON, for a
 * reader looking at that person ("This customer has not said yes to OFFERS"), and
 * splicing one into an audience-level refusal produces a sentence that repeats
 * itself and calls an empty set "this customer". One source of truth is for FACTS.
 * The fact here is the reason code, which both registries key on and which a test
 * holds them both complete against; the prose is written for its own reader.
 *
 * An empty audience has two causes, and only one of them is a missing yes: the
 * ones who said it may have no number to send to -- someone who has only ever
 * emailed, or a walk-in recorded with a yes and no number. That case is said in
 * People's words (`noNumberWords`, #663), naming the audience as the send screen
 * does, and without the QR, which would ask them for an answer they gave. So the
 * caller hands in the audience's name and everyone on it, before anyone is left
 * out (`audienceMembers`), and the refusal says which cause it is.
 *
 * The QR is on Broadcasts, the ledger's "Get their yes" card since #758. These
 * words are read in a toast on the send screen, which has no QR, and in Ask,
 * which is no page at all -- so they say where it is rather than "on this page".
 */
export function emptyAudienceRefusal(
  purpose: AskedPurpose,
  label: string,
  pool: readonly Pick<PersonRowVM, "consent">[],
): string {
  if (pool.some((r) => saidYesTo(r, purpose))) return noNumberWords(`“${label}”`, purpose);
  return purpose === "marketing"
    ? "Nobody there has said yes to offers yet — that is a separate answer from saying yes to messages, and only it puts somebody on a promotional broadcast. Record it under “Offers and news” on a person's profile, or get their yes with the phrase and the QR on Broadcasts."
    : "Nobody there has said yes to messages yet. Even a reminder about their own visit needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and the QR on Broadcasts.";
}

/* ---- One broadcast's people ---- */

export interface BroadcastRecipientDto {
  contact_id: string;
  name: string;
  /** What a first-name slot says to them, by the wire's own rule (firstNameOf) over their card as it reads now; null is "Hi there". */
  first_name: string | null;
  phone: string | null;
  state: RecipientState;
  /** Why they were held back or not reached, as the job recorded it. */
  reason: string | null;
  sent_at: string | null;
  /** The message's status from WhatsApp's receipts: sent, delivered, read, failed. */
  message_status: string | null;
  conversation_id: string | null;
  /** Their thread heard from them after the broadcast reached them. */
  replied: boolean;
  /** When WhatsApp's receipts said so (00111 stamps each status as it arrives), and when the first reply came. */
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  /**
   * What they said about hearing from the business AFTER the run reached them
   * and inside the reply window -- a yes, or a stop -- off the consent ledger
   * both doors write (00013), and when. The latest inside the window stands.
   * Null for anyone the run did not reach, or who said nothing in the window.
   */
  consent_after: "opted_in" | "opted_out" | null;
  consent_at: string | null;
  /** Which answer that was: to offers (the offers door names its purpose, 00095), or to hearing from the business at all. */
  consent_purpose: "marketing" | "conversational" | null;
  /** Their first reply's words, on one line. Null when it had none -- a photo, a voice note -- or there was no reply. */
  reply_words: string | null;
  /** Who answered that reply first, and when: the receptionist, or someone on the team. A note or a later template is not an answer. */
  answered_by: "receptionist" | "team" | null;
  answered_at: string | null;
  /** They replied, and their thread waits on a person now. */
  waiting_on_you: boolean;
}

export interface BroadcastDetailDto {
  broadcast: BroadcastDto;
  recipients: BroadcastRecipientDto[];
  /** A reach-out run's own block (Reach out, Part 4 F13): its sends are reach_out_sends, never recipients. */
  reach_out?: ReachOutRunDto | null;
}
