/** Broadcasts: broadcasts. */

import { MIN_MS } from "../../shared/time";
import { isCount, recordOrNull } from "../../shared/unknown";
import type { ReachOutRunDto } from "../reach-out/dtos";
import { templateTitle } from "../templates/titles";
import { clockDate, clockNearWhen, clockWhen } from "../../shared/clock";
import { noNumberWords } from "../../people/lists/actions";
import type { PersonRowVM } from "../../people/person-row/row-facts";
import type { ParamSpec } from "../templates/params";
import type { AskedPurpose, MessageAbout } from "../../consent/consent";
import { consentGuardWords } from "../../consent/asks";
import { CONSENT_CHANNELS, countsByChannelWords, type ConsentChannel } from "../../consent/channels";
import type { Audience } from "./audience";
import { broadcastFailureWords } from "./failures";
import { answeredYes } from "./reach-any";
import { channelRefuses, type ChannelsReady } from "./reach-for";
import { BROADCAST_STATE_LABELS, type BroadcastState, type RecipientState } from "./states";
import { NUMBERED_SLOT } from "../../shared/words";

export {
  AUDIENCE_KINDS,
  EVERYONE_LABEL,
  EVERYONE_HINT,
  UNKNOWN_AUDIENCE_WORDS,
  CONSENT_LIST_IDS,
  eligibleFor,
  enrolFor,
  saidYesOnAny,
  heldWords,
  audienceMembers,
  audiencePreview,
  audienceTrigger,
} from "./audience";

export type { AudienceKind, Audience, PreviewPerson, AudiencePreview, CampaignHow } from "./audience";

export {
  DEFAULT_CAMPAIGN_CHANNELS,
  NEW_PLAYBOOK_TICKS_EVERY_CHANNEL,
  newCampaignChannels,
  CHANNEL_WORDS,
  CAMPAIGN_MONTH_ALLOWANCE,
  HELD_ON,
  channelRefuses,
  channelNeverCarries,
  offersNote,
  channelsReady,
  channelChoices,
  reachFor,
  reachSplit,
  reachSplitWords,
  heldByAllowance,
  allowanceRoom,
  pastAllowance,
  nextMonthStart,
  monthSentAt,
  allowanceBeforeSend,
  allowanceLine,
  allowanceLines,
} from "./reach-for";

export type { ChannelReady, ChannelsReady, HeldOn, MonthSent, MonthSentRead, ReachRow, ReachSplit } from "./reach-for";

export {
  BROADCAST_FAILURES,
  BROADCAST_FAILURE_WORDS,
  BROADCAST_FAILURE_FIX,
  broadcastFailureFix,
  broadcastFailureWords,
  emailRunStop,
  playbookRunNext,
  stoppedRunFix,
  wireFailure,
} from "./failures";

export type { BroadcastFailure, EmailRunStop, PlaybookRunNextBy, RunStop, WireFailure } from "./failures";

export { LIMIT_TIERS, dailyLimit, numberHealth, overLimitRefusal } from "./number";

export type { NumberHealthInput, NumberHealth } from "./number";

export { RUN_REPORT_STEPS, RUN_FILTERS, consentAnswerWords, receiptWords, toRunReportVM } from "./run-report";

export type { RunFigureId, RunFigure, RunFilterId, RunTone, RunPersonVM, RunReplyVM, RunReportVM } from "./run-report";

export const BROADCAST_GAP_MS = 300;

/**
 * How long a run waits each time WhatsApp says "not now" (channels graphThrottled), in order. The person the send was
 * for goes back in the queue and the run tries again after the next wait; a batch that sends without one starts the
 * count again. Past the last wait, or when the next try would fall outside the day's sending hours, the run stops and
 * says why (core messages/broadcast/batch.ts). About an hour in all.
 */
export const BROADCAST_THROTTLE_WAITS_MS: readonly number[] = [
  MIN_MS,
  2 * MIN_MS,
  5 * MIN_MS,
  10 * MIN_MS,
  15 * MIN_MS,
  30 * MIN_MS,
];

/**
 * How long a run waits before it tries again a person it gave back because somebody holds their thread right now (a call in
 * progress, a teammate speaking: the door's `human_has_it` on a day-before reminder, which passes the 24-hour pause but not
 * a live hold, decision D4). Drawn a little longer at random. Only inside the day's sending hours: past them the person is
 * skipped, as before (core messages/broadcast/batch.ts).
 */
export const BROADCAST_HOLD_WAIT_MS = 10 * MIN_MS;

/** More than this is not a salon's list; it is a mistake. */
export const BROADCAST_MAX_RECIPIENTS = 2000;

/** Meta's ceiling for one body parameter. */
export const BROADCAST_PARAM_MAX = 1024;

export const BROADCAST_SCHEDULE_MAX_DAYS = 30;

export const BROADCAST_NAME_MAX = 80;

// The reply window and the held reasons live in run-words.ts, where a person's page reads them too.
export {
  REPLY_WINDOW_HOURS,
  REPLY_WINDOW_MS,
  REPLY_WINDOW_WORDS,
  runStillMoving,
  RECIPIENT_REASON_HEARD,
  LEFT_OUT_FACTS,
  leftOutByFacts,
  leftOutBy,
  heardWithin,
  breathTouchOf,
  heardFor,
  breathSplit,
  reachAfterBreath,
  heardWords,
  heardTooWords,
  allLeftOutWords,
  breathWaitWords,
  BREATH_WHY,
  HEARD_UNREAD_WORDS,
  goesToOf,
  HELD_REASONS,
  HELD_WHEN_COUNTED,
  DELIVERY_RECEIPTS_TIP,
  DELIVERY_RECEIPTS_WORDS,
  finishedRunHeldWhy,
  isReplyTo,
} from "./run-words";

export type { HeardTouch } from "./run-words";

/** The words a person will read: the body with its numbered slots filled. */
export function renderTemplate(body: string | null | undefined, params: readonly string[]): string {
  return String(body ?? "").replace(NUMBERED_SLOT, (m, n: string) => {
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
  /**
   * What went out by each channel (0030): a recipient naming none went by WhatsApp. Absent from a read that did not
   * count them.
   */
  sent_by?: Record<ConsentChannel, number>;
  /**
   * How many of the people a freed time's run sent to took the time it offered (00498 freed_time_taken, decision 0082):
   * said only for a run that offered one.
   */
  took?: number | null;
}

/** What run_counts says of each run (00374), in the order Sent writes a run's counts. */
const RUN_COUNTED = ["queued", "sent", "skipped", "failed", "delivered", "read", "replied"] as const;

/**
 * run_counts' answer (00374), by run id, read into Sent's counts in the order the page has always written them (a run
 * nobody is on is absent, and the caller says it as zeros), each count a whole number (isCount). Null when the answer is
 * not that shape: a read that failed, never a run with nothing in it.
 */
export function runCountsOf(answer: unknown): Record<string, BroadcastCounts> | null {
  const byRun = recordOrNull(answer);
  if (!byRun) return null;
  const out: Record<string, BroadcastCounts> = {};
  for (const [id, raw] of Object.entries(byRun)) {
    const record = recordOrNull(raw);
    const by = recordOrNull(record?.sent_by);
    if (!record || !by) return null;
    const counts: BroadcastCounts = { queued: 0, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
    for (const k of RUN_COUNTED) {
      const n = record[k];
      if (!isCount(n)) return null;
      counts[k] = n;
    }
    const { whatsapp, sms, email } = by;
    if (!isCount(whatsapp) || !isCount(sms) || !isCount(email)) return null;
    // Who took the freed time (00498): a count, said only for a run that offered one.
    const took = record.took;
    if (took !== undefined && took !== null && !isCount(took)) return null;
    out[id] = { ...counts, sent_by: { whatsapp, sms, email }, ...(took === undefined ? {} : { took }) };
  }
  return out;
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
  /**
   * A freed time's run (00498, decision 0082): the time it offers and the appointment that freed it; null for every other
   * run, absent from a server before it.
   */
  offered_start?: string | null;
  offered_end?: string | null;
  offered_from?: string | null;
  /**
   * The sequence this run is a day of (0060: every run is a sequence's batch), whatever step made it: where a link to the
   * run lands once it has gone (its History, that day open), with no lookup of the run's id to find it.
   */
  sequence_id: string;
  counts: BroadcastCounts;
  /**
   * A reach-out's run that is going or waiting for an OK: how many of its emails the check holds for its owner's say.
   * Absent on any other run, and where it could not be counted (the wiring's second audit,
   * W-campaign-run-template-reachout-4).
   */
  held?: number;
  /** And how many are handed to its owner to send from their inbox (00429), counted as held is. */
  drafted?: number;
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
  /** The time a freed time's run offers, by the business's clock ("tomorrow 3:00 PM", clockNearWhen); null for any other run. */
  offered: string | null;
}

/**
 * What a run is called wherever it is named (its page's head, its row in the Inbox, Today and Ask, a toast): its own name,
 * less the day a sequence's run carries after it (core run-playbook writes "VIP color clients · 2026-10-18"), which read
 * as a code in a phone's head. A one-off keeps its name, never its list's; a reach-out's run, whose audience carries its
 * ids alone, its own ("Early gyms").
 */
export function runTitleOf(run: { name: string; run_for?: string | null }): string {
  const tail = run.run_for ? ` · ${run.run_for}` : null;
  return tail && run.name.endsWith(tail) && run.name.length > tail.length ? run.name.slice(0, -tail.length) : run.name;
}

/** "today 9:00 AM" · "tomorrow 9:00 AM" · "Sep 12 · 10:00 AM", by the business's day and clock (clock.ts). */
export function whenLabel(iso: string, tz: string, now = new Date()): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockWhen(ms, tz, now.getTime()) : "";
}

/**
 * A run's read share (0030): a read is WhatsApp's own receipt, so it is a share of what went by WhatsApp where the counts
 * say; of everything sent where they do not. Null with nothing to share it of.
 */
function readShare(c: BroadcastCounts): number | null {
  const of = c.sent_by ? c.sent_by.whatsapp : c.sent;
  return of > 0 ? Math.round((c.read / of) * 100) : null;
}

/** What a run sent by each channel, in a line's words ("30 on WhatsApp, 6 by text"), where it went by more than one. */
export function sentByWords(by: BroadcastCounts["sent_by"]): string | null {
  return countsByChannelWords(by);
}

export function toBroadcastVM(broadcast: BroadcastDto, tz: string, now = new Date()): BroadcastVM {
  const counts = broadcast.counts;
  const attempted = counts.sent + counts.skipped + counts.failed;
  return {
    ...broadcast,
    stateLabel: BROADCAST_STATE_LABELS[broadcast.state] ?? broadcast.state,
    when: whenLabel(broadcast.finished_at ?? broadcast.started_at ?? broadcast.scheduled_for, tz, now),
    deliveredPct: counts.sent > 0 ? Math.round((counts.delivered / counts.sent) * 100) : null,
    readPct: readShare(counts),
    open: broadcast.state === "scheduled" || broadcast.state === "sending" || broadcast.state === "pending_approval",
    progress: broadcast.recipient_count > 0 ? Math.min(1, attempted / broadcast.recipient_count) : 0,
    failureLabel: broadcast.state === "failed" ? broadcastFailureWords(broadcast.failure) : null,
    offered: broadcast.offered_start ? clockNearWhen(Date.parse(broadcast.offered_start), tz, now.getTime()) : null,
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
 * The QR is in Sent, the ledger's "Get their yes" card since #758. These
 * words are read in a toast on the send screen, which has no QR, and in Ask,
 * which is no page at all -- so they say where it is rather than "on this page".
 *
 * A send that ticks email is said by what each channel it ticks asks of a person (consent/asks.ts, read from the one
 * predicate): by email the business's news asks a yes covering email or a relationship on record and an address that
 * works (decision D1), never "a number". WhatsApp and a text ask what they always did, in the words below.
 */
export function emptyAudienceRefusal(
  purpose: AskedPurpose,
  label: string,
  pool: readonly Pick<PersonRowVM, "consent">[],
  how: { channels: readonly string[]; about: MessageAbout; ready?: ChannelsReady },
): string {
  const ticked = CONSENT_CHANNELS.filter((c) => how.channels.includes(c));
  // No ticked channel carries this message here (reach-for.ts channelRefuses: Meta's pause on offers to US numbers, offers by
  // email not set up, texts never): the first one's reason, since no yes and no number would change it.
  const ready = how.ready;
  if (ready) {
    const refused = ticked.map((c) => channelRefuses(c, purpose, how.about, ready));
    const first = refused[0];
    if (first && refused.every((reason) => reason !== null)) return `Nobody on “${label}” can be sent this: ${first}`;
  }
  if (ticked.includes("email"))
    return `Nobody on “${label}” can be sent this yet. ${consentGuardWords(ticked, purpose, how.about).join(" ")}`;
  // Said, as every page reads the answer (reach-any.ts answeredYes: the row's saidYes is the same call).
  if (pool.some((r) => answeredYes(r, purpose))) return noNumberWords(`“${label}”`, purpose);
  return purpose === "marketing"
    ? "Nobody there has said yes to offers yet — that is a separate answer from saying yes to messages, and only it puts somebody on a promotional send. Record it under “Offers and news” on a person's profile, or get their yes with the phrase and the QR in Sent."
    : "Nobody there has said yes to messages yet. Even a reminder needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and the QR in Sent.";
}

/* ---- One broadcast's people ---- */

export interface BroadcastRecipientDto {
  contact_id: string;
  name: string;
  /** The channel the send picked for them (step 3; reachFor); null on a run made before: WhatsApp. */
  channel?: string | null;
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
  consent_purpose: "marketing" | "email_marketing" | "conversational" | null;
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
