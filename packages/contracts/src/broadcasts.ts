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
import { templateTitle } from "./template-library";
import { clockDate, clockWhen } from "./clock";
import { PEOPLE_LISTS, mayReceive, noNumberWords, saidYesTo, type PersonRowVM } from "./people";
import { firstNameOf, type ParamSpec } from "./templates";
import { mayMessageFor, PURPOSE_REFUSALS, type SendPurpose } from "./consent";
import type { RunReach } from "./playbooks";
import { HELD_REASONS } from "./run-words";

export const BROADCAST_STATES = ["pending_approval", "scheduled", "sending", "sent", "canceled", "failed"] as const;
export type BroadcastState = (typeof BROADCAST_STATES)[number];

export const RECIPIENT_STATES = ["queued", "sent", "skipped", "failed"] as const;
export type RecipientState = (typeof RECIPIENT_STATES)[number];

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
/** More than this is not a salon's list; it is a mistake. */
export const BROADCAST_MAX_RECIPIENTS = 2000;
/** Meta's ceiling for one body parameter. */
export const BROADCAST_PARAM_MAX = 1024;
export const BROADCAST_SCHEDULE_MAX_DAYS = 30;
export const BROADCAST_NAME_MAX = 80;
// The reply window and the held reasons live in run-words.ts, where a person's page reads them too.
export { REPLY_WINDOW_HOURS, REPLY_WINDOW_MS, REPLY_WINDOW_WORDS, HELD_REASONS, isReplyTo } from "./run-words";

export type AudienceKind = "everyone" | "list" | "saved" | "playbook";
/** The kinds a person may pick; "playbook" is the sweep's own. */
export const AUDIENCE_KINDS: readonly AudienceKind[] = ["everyone", "list", "saved"];

export interface Audience {
  kind: AudienceKind;
  /** A People list id (kind "list") or a saved list id (kind "saved"). */
  id: string | null;
  label: string;
  /**
   * A playbook's run: who its moment named and why each of the rest was left
   * out (contracts playbookRunReach), kept by the run as it was drawn. Absent
   * on a broadcast a person sent, and on a run made before runs kept it.
   */
  reach?: RunReach;
}

/**
 * The audience of everyone in People, named for its pool as every other audience is ("Regulars", "Lapsed"); its
 * count is who the message reaches, and the lines under it say who said yes. It was "Everyone who said yes", which
 * beside a reach of 0 claimed nobody had, over "1 person on it said yes to offers, with no number to send to". A run
 * keeps the label it was sent under.
 */
export const EVERYONE_LABEL = "Everyone";

/**
 * The people a broadcast may reach: the audience crossed with mayReceive.
 * The route enrols exactly these; the page shows exactly these counts.
 *
 * The purpose is required here for the same reason it is required above -- and
 * because this is the function every caller actually reaches for.
 */
export function eligibleFor(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
  /** What kind of message this audience is for. From the template's category, never assumed. */
  purpose: SendPurpose,
): PersonRowVM[] {
  return audienceMembers(rows, kind, id, savedIds).filter((r) => mayReceive(r, purpose));
}

/**
 * Everyone an audience names, before anyone is left out: a list's members, a
 * saved list's people, or everyone. `eligibleFor` is these, crossed with who
 * may receive -- and a run that says who it left out counts from here.
 */
export function audienceMembers(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
): PersonRowVM[] {
  if (kind === "list") {
    const l = PEOPLE_LISTS.find((x) => x.id === id);
    return l ? rows.filter(l.test) : [];
  }
  if (kind === "saved") return savedIds ? rows.filter((r) => savedIds.has(r.id)) : [];
  return rows;
}

/**
 * A few of the people an audience really means, for a preview to walk through.
 *
 * An audience chip showed a count and nothing else, so the last thing an owner
 * saw before an irreversible send was a number: no way to see who the twenty-
 * three are, and no way to find out that three of them have no first name on
 * file and will be greeted "Hi there" (resolveParams, templates.ts). The rows
 * are already in hand -- the count is a length of exactly this list -- so this
 * takes the same pool and names a handful of it.
 *
 * The order is not the list's: an ordinary person first, then the first person
 * with no name on file if there is one, because that is the case nobody has
 * ever been shown and the one worth seeing. Anyone held back comes last, with
 * the reason in the operator's own words.
 */
export interface PreviewPerson {
  id: string;
  /** What the operator calls them: their name, or the number on file. */
  label: string;
  /** The words the wire puts in a first-name slot, or null when nothing is on file. */
  firstName: string | null;
  /** Why nothing is sent to them, in the operator's words; null when it is. */
  refusal: string | null;
}

export interface AudiencePreview {
  people: PreviewPerson[];
  /** How many the send really reaches, and how many in the list it does not. */
  sending: number;
  held: number;
  /**
   * How many in the list said yes to what this message needs, a number to send it to or not: `sending` is those
   * with one. When nobody can be sent it, this tells the two causes apart -- nobody said yes (get their yes), or the
   * ones who did have no number, whom a door to "get their yes" would ask for an answer they gave (#663's rule).
   */
  saidYes: number;
}

function previewPerson(r: PersonRowVM, refusal: string | null): PreviewPerson {
  return { id: r.id, label: r.name, firstName: firstNameOf(r.givenName, r.waName), refusal };
}

export function audiencePreview(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
  purpose: SendPurpose,
  limit = 5,
): AudiencePreview {
  const pool = audienceMembers(rows, kind, id, savedIds);
  const sending = pool.filter((r) => mayReceive(r, purpose));
  const held = pool.filter((r) => !mayReceive(r, purpose));
  const named = sending.filter((r) => firstNameOf(r.givenName, r.waName) !== null);
  const unnamed = sending.filter((r) => firstNameOf(r.givenName, r.waName) === null);
  // One ordinary person, then the one nobody has seen, then the rest in order.
  const order = [...named.slice(0, 1), ...unnamed.slice(0, 1), ...named.slice(1), ...unnamed.slice(1)];
  const people = order.slice(0, limit).map((r) => previewPerson(r, null));
  // Why a person in the list is not in the send, from the one place that answers
  // it: no number at all, else the consent the purpose asks for.
  for (const r of held.slice(0, 2)) {
    const why = !r.phone
      ? "No phone number on file, so nothing can be sent."
      : (PURPOSE_REFUSALS[
          mayMessageFor(
            { consent: r.consent.state, dnc: r.consent.dnc, marketing_consent: r.consent.marketing },
            purpose,
            { proactive: true },
          ).reason ?? ""
        ] ?? "Held back.");
    people.push(previewPerson(r, why));
  }
  return {
    people,
    sending: sending.length,
    held: held.length,
    saidYes: pool.filter((r) => saidYesTo(r, purpose)).length,
  };
}

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

/**
 * Why a whole broadcast stopped, in the owner's words: the codes the send job writes (core messages/broadcast.ts)
 * and the one the job ledger writes when a run died and none took it up again (jobs settle.ts). Spelled out, as
 * HELD_REASONS is, so the bundler can see through it.
 */
export const BROADCAST_FAILURE_WORDS: Record<string, string> = {
  paused: "the workspace was paused",
  template_not_approved: "WhatsApp no longer approves its template",
  wire_unavailable: "WhatsApp could not be reached",
  run_interrupted: "its send stopped partway and did not start again",
};

/**
 * How to get past each reason a run stops, in one sentence: a failed run says
 * what to do next, not only what went wrong. These are the words for a run that
 * reached nobody; one that reached some first says so (BROADCAST_FAILURE_FIX_AFTER).
 */
export const BROADCAST_FAILURE_FIX: Record<string, string> = {
  paused: "Unpause it under Settings, then send it again.",
  template_not_approved: "Open it in Templates — it can be resubmitted.",
  wire_unavailable: "Nothing was charged and nobody was written to. Try again.",
  run_interrupted: "Nobody got it, so sending it again reaches nobody twice.",
};

/**
 * The same, for a run that reached some people before it stopped. Nothing sends
 * to "the rest": a broadcast sent again enrols its whole list (createBroadcast
 * leaves out nobody it already reached), so the words say who that includes
 * rather than promise a resend that skips them.
 */
const BROADCAST_FAILURE_FIX_AFTER: Record<string, (n: number) => string> = {
  paused: (n) =>
    `Unpause it under Settings. Sending it again reaches the whole list, ${n === 1 ? "the one" : `the ${n}`} who got it included.`,
  wire_unavailable: (n) =>
    `The first ${n === 1 ? "one" : n} got it, then WhatsApp stopped answering. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  run_interrupted: (n) =>
    `${n === 1 ? "One" : n} got it and the rest did not. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
};

/** The next step past a failed run's reason, by how many it reached first; null for a code nobody has written words for. */
export function broadcastFailureFix(failure: string | null | undefined, reached = 0): string | null {
  if (!failure) return null;
  const after = reached > 0 ? BROADCAST_FAILURE_FIX_AFTER[failure] : undefined;
  return after ? after(reached) : BROADCAST_FAILURE_FIX[failure] || null;
}

/** A failed broadcast's reason: its words, a code nobody has written words for yet, or none recorded. */
export function broadcastFailureWords(failure: string | null | undefined): string {
  if (!failure) return "no reason was recorded";
  return BROADCAST_FAILURE_WORDS[failure] ?? "it could not finish";
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
  purpose: SendPurpose,
  label: string,
  pool: readonly Pick<PersonRowVM, "consent">[],
): string {
  if (pool.some((r) => saidYesTo(r, purpose))) return noNumberWords(`“${label}”`, purpose);
  return purpose === "marketing"
    ? "Nobody there has said yes to offers yet — that is a separate answer from saying yes to messages, and only it puts somebody on a promotional broadcast. Record it under “Offers and news” on a person's profile, or get their yes with the phrase and the QR on Broadcasts."
    : "Nobody there has said yes to messages yet. Even a reminder about their own visit needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and the QR on Broadcasts.";
}

/* ---- The number's health: what WhatsApp has said about it, and what that permits ---- */

/** Meta's messaging-limit tiers: business-initiated conversations in a rolling day. */
export const LIMIT_TIERS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

export function dailyLimit(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const n = LIMIT_TIERS[String(tier).toUpperCase()];
  return typeof n === "number" ? n : null;
}

export interface NumberHealthInput {
  /** Meta's quality rating as read at connection: GREEN, YELLOW, RED, UNKNOWN. */
  quality: string | null | undefined;
  /** The newest quality webhook: FLAGGED, UNFLAGGED, DOWNGRADE, UPGRADE. */
  event: string | null | undefined;
  /** The newest messaging limit webhook: TIER_250 and the like. */
  limit: string | null | undefined;
}

export interface NumberHealth {
  canSend: boolean;
  tone: "ok" | "warn" | "danger" | "unknown";
  label: string;
  limitPerDay: number | null;
  refusal: string | null;
}

/**
 * The one reading of a number's health. A flagged or red number cannot
 * broadcast: sending more marketing on it risks the number itself. Anything
 * Meta has not reported is said so, never assumed good or bad.
 */
export function numberHealth(n: NumberHealthInput): NumberHealth {
  const q = String(n.quality ?? "").toUpperCase();
  const ev = String(n.event ?? "").toUpperCase();
  const limit = dailyLimit(n.limit);
  const limitWords =
    limit === null
      ? "daily limit not reported yet"
      : limit === Number.POSITIVE_INFINITY
        ? "no daily limit"
        : `up to ${limit.toLocaleString("en-US")} new conversations a day`;
  if (q === "RED" || ev === "FLAGGED") {
    return {
      canSend: false,
      tone: "danger",
      limitPerDay: limit,
      label: `WhatsApp flagged this number's quality · ${limitWords}`,
      refusal:
        "WhatsApp flagged this number's quality. Sending more marketing now risks the number; wait for it to recover.",
    };
  }
  if (q === "YELLOW" || ev === "DOWNGRADE")
    return {
      canSend: true,
      tone: "warn",
      limitPerDay: limit,
      label: `Number quality: medium · ${limitWords}`,
      refusal: null,
    };
  if (q === "GREEN" || ev === "UNFLAGGED" || ev === "UPGRADE")
    return {
      canSend: true,
      tone: "ok",
      limitPerDay: limit,
      label: `Number quality: good · ${limitWords}`,
      refusal: null,
    };
  return {
    canSend: true,
    tone: "unknown",
    limitPerDay: limit,
    label: `Number quality not reported yet · ${limitWords}`,
    refusal: null,
  };
}

/** Null when the audience fits the day's limit; otherwise the refusal, with the numbers. */
export function overLimitRefusal(h: NumberHealth, audience: number): string | null {
  if (h.limitPerDay === null || audience <= h.limitPerDay) return null;
  return `This number can start up to ${h.limitPerDay.toLocaleString("en-US")} new conversations a day; this audience is ${audience.toLocaleString("en-US")}. Send to a smaller list or split it.`;
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
}

/* ------------------------------ a run's report ------------------------------ */

export type RunFigureId = "sent" | "delivered" | "replied" | "said_yes" | "stopped";

/** The steps a figure's bars take: the canvas draws eight. */
export const RUN_REPORT_STEPS = 8;
/** The spans the bars can cover, in hours: the shortest that holds everything the run heard back, up to the reply window. */
const RUN_REPORT_SPANS_H = [1, 2, 4, 8, 12, 24, 48, 72];

export interface RunFigure {
  id: RunFigureId;
  label: string;
  n: number;
  /** Of what the run sent, rounded; null for "sent" itself, for none, and for a run that reached nobody. */
  pct: number | null;
  /** The sentence under the figure. */
  sub: string;
  /** "ok" for an answer that came, "warn" for a stop -- the one figure that asks the owner to look -- and plain for none. */
  tone: "plain" | "ok" | "warn";
  /** When each came back, in RUN_REPORT_STEPS equal steps from the first send across the report's span. */
  bars: number[];
}

/** The filters over "Everyone it touched". */
export type RunFilterId = "all" | "replied" | "held" | "stopped";
export const RUN_FILTERS: readonly { id: RunFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "replied", label: "Replied" },
  { id: "held", label: "Held back" },
  { id: "stopped", label: "Stopped" },
];

export type RunTone = "plain" | "ok" | "info" | "warn" | "danger";

/** One person's line: what happened to them, in words, with the one door it offers. */
export interface RunPersonVM {
  contact_id: string;
  name: string;
  /** Two letters for the mark, or a dash for someone with no name on file. */
  initials: string;
  pill: { label: string; tone: RunTone };
  words: string;
  door: { label: string; to: string } | null;
  /** The last thing that happened to them, by the business's clock; null for someone the run never sent to. */
  at: string | null;
  /** Their line asks the owner to look: a stop, or a greeting that went out "Hi there". */
  attn: boolean;
  /** The run never sent to them: held back, refused, or not yet. */
  held: boolean;
  in: RunFilterId[];
}

/** One reply, as "What came back" quotes it: their words, and what has happened since. */
export interface RunReplyVM {
  contact_id: string;
  name: string;
  initials: string;
  /** Their first reply's words; null when it had none. */
  quote: string | null;
  outcome: { words: string; tone: RunTone };
  to: string | null;
}

export interface RunReportVM {
  figures: RunFigure[];
  /** What the bars cover, in words: "the first 4 hours" -- the shortest span holding everything heard back, up to the window. */
  span: string;
  /** How many the run was for: everyone enrolled, reached or not. */
  enrolled: number;
  /** How many each filter of "Everyone it touched" holds. */
  groups: Record<RunFilterId, number>;
  people: RunPersonVM[];
  /** Every reply, the first to come first. */
  replies: RunReplyVM[];
  /** Why a failed run stopped and how to get past it; null for a run that did not fail. */
  stop: { words: string; fix: string | null; tone: "warn" | "danger" } | null;
}

type ReportRecipient = Pick<
  BroadcastRecipientDto,
  | "contact_id"
  | "name"
  | "first_name"
  | "state"
  | "reason"
  | "sent_at"
  | "message_status"
  | "conversation_id"
  | "delivered_at"
  | "read_at"
  | "replied"
  | "replied_at"
  | "consent_after"
  | "consent_at"
  | "consent_purpose"
  | "reply_words"
  | "answered_by"
  | "answered_at"
  | "waiting_on_you"
>;

/**
 * Which answer a yes or a stop was, said once for a person and once for a
 * figure: a stop to offers leaves every other message going, so the canvas's
 * "they hear nothing again" is only true of a stop to everything.
 */
export function consentAnswerWords(
  consent: "opted_in" | "opted_out",
  purpose: "marketing" | "conversational" | null,
): string {
  if (consent === "opted_in") return purpose === "marketing" ? "said yes to offers" : "said yes to hearing from you";
  return purpose === "marketing" ? "stopped offers, not messages" : "asked to stop hearing from you";
}

/** "said yes to offers", or both kinds counted apart: "1 to offers · 2 to hearing from you". */
function answersWords(rows: readonly ReportRecipient[], consent: "opted_in" | "opted_out"): string {
  const offers = rows.filter((r) => r.consent_purpose === "marketing").length;
  const rest = rows.length - offers;
  if (offers === 0 || rest === 0) return consentAnswerWords(consent, offers > 0 ? "marketing" : "conversational");
  return consent === "opted_in"
    ? `${offers} to offers · ${rest} to hearing from you`
    : `${offers} stopped offers · ${rest} stopped everything`;
}

const STATUS_WORDS: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "not delivered",
  queued: "sending",
  canceled: "canceled",
};

/** What happened to one person, with the times WhatsApp's receipts gave (00111): "sent 10:31 · delivered 10:32 · read 10:40 · replied 10:52". */
export function receiptWords(
  r: Pick<BroadcastRecipientDto, "sent_at" | "message_status" | "delivered_at" | "read_at" | "replied" | "replied_at">,
  clock: (iso: string | null) => string | null,
): string {
  const parts: string[] = [];
  const sent = clock(r.sent_at);
  parts.push(
    sent ? `sent ${sent}` : (r.message_status && STATUS_WORDS[r.message_status]) || r.message_status || "sent",
  );
  const delivered = clock(r.delivered_at);
  const read = clock(r.read_at);
  if (delivered) parts.push(`delivered ${delivered}`);
  else if (r.message_status === "delivered" || r.message_status === "read") parts.push("delivered");
  if (read) parts.push(`read ${read}`);
  else if (r.message_status === "read") parts.push("read");
  if (r.message_status === "failed") parts.push("not delivered");
  if (r.replied) parts.push(clock(r.replied_at) ? `replied ${clock(r.replied_at)}` : "replied");
  return parts.join(" · ");
}

const initialsOf = (name: string, named: boolean): string =>
  named
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => Array.from(w)[0] ?? "")
        .join("")
        .toUpperCase() || "—"
    : "—";

/**
 * One run's report: the five figures Reports › Campaigns draws for the
 * workspace -- messages sent, delivered, replied, said yes, asked to stop --
 * scoped to this run, from its recipients; everyone it touched, each in the
 * words of what happened to them; every reply, quoted; and, for a failed run,
 * why it stopped and how to get past it.
 *
 * Delivered counts read too: a message read was delivered. Each figure's bars
 * say when its answers came, in eight equal steps from the first send across
 * the shortest span that holds everything the run heard back -- an hour, four,
 * a day, up to the reply window -- so replies that came in the first hour have
 * a shape instead of one bar, and a run whose answers trickled in over three
 * days looks like it.
 */
export function toRunReportVM(
  d: {
    broadcast?: { state?: string; failure?: string | null; params?: readonly ParamSpec[] };
    recipients: readonly ReportRecipient[];
  },
  opts: { windowMs: number; nowMs: number; clock?: (iso: string | null) => string | null },
): RunReportVM {
  const clock = opts.clock ?? ((iso: string | null) => iso);
  const reached = d.recipients.filter((r) => r.state === "sent");
  const sent = reached.length;
  const delivered = reached.filter((r) => r.message_status === "delivered" || r.message_status === "read");
  const replied = reached.filter((r) => r.replied);
  const waiting = replied.filter((r) => r.waiting_on_you).length;
  const yes = reached.filter((r) => r.consent_after === "opted_in");
  const stopped = reached.filter((r) => r.consent_after === "opted_out");
  const starts = reached.map((r) => (r.sent_at ? Date.parse(r.sent_at) : NaN)).filter(Number.isFinite);
  const start = starts.length ? Math.min(...starts) : opts.nowMs;
  const heard = reached
    .flatMap((r) => [r.delivered_at, r.read_at, r.replied ? r.replied_at : null, r.consent_after ? r.consent_at : null])
    .map((s) => (s ? Date.parse(s) : NaN))
    .filter((t) => Number.isFinite(t) && t >= start && t - start <= opts.windowMs);
  const last = heard.length ? Math.max(...heard) - start : 0;
  const windowH = opts.windowMs / 3_600_000;
  const spanH = RUN_REPORT_SPANS_H.find((h) => h <= windowH && h * 3_600_000 > last) ?? windowH;
  const step = (spanH * 3_600_000) / RUN_REPORT_STEPS;
  const bars = (stamps: (string | null)[]): number[] => {
    const out = new Array<number>(RUN_REPORT_STEPS).fill(0);
    for (const s of stamps) {
      const t = s ? Date.parse(s) : NaN;
      if (!Number.isFinite(t)) continue;
      const i = Math.floor((t - start) / step);
      if (i >= 0 && i < RUN_REPORT_STEPS) out[i]! += 1;
    }
    return out;
  };
  const pct = (n: number): number | null => (sent > 0 && n > 0 ? Math.round((n / sent) * 100) : null);
  const never = sent - delivered.length;
  // A first-name slot takes the wire's own first name for each person (firstNameOf), and "there" for someone with none.
  const greets = (d.broadcast?.params ?? []).some((p) => p && p.kind === "first_name");
  // A run that failed or was canceled leaves the people it had not reached queued (jobs settle.ts): they are not
  // "not sent yet" -- nothing more goes to them from this run.
  const state = d.broadcast?.state;
  const cutOff =
    state === "failed"
      ? "the run stopped before them"
      : state === "canceled"
        ? "canceled before it reached them"
        : state === "sent"
          ? "never sent"
          : null;

  const people: RunPersonVM[] = d.recipients.map((r) => {
    const out = r.state === "sent";
    const hiThere = out && greets && !r.first_name;
    const answer = r.consent_after ? consentAnswerWords(r.consent_after, r.consent_purpose) : null;
    const pill: RunPersonVM["pill"] =
      r.consent_after === "opted_out" && out
        ? { label: "Asked to stop", tone: "warn" }
        : r.replied && out
          ? { label: "Replied", tone: "ok" }
          : r.consent_after === "opted_in" && out
            ? { label: "Said yes", tone: "ok" }
            : r.state === "skipped"
              ? { label: "Held back", tone: "plain" }
              : r.state === "failed"
                ? { label: "Not sent", tone: "danger" }
                : r.state === "queued"
                  ? { label: cutOff ? "Not sent" : "Waiting", tone: "plain" }
                  : r.message_status === "failed"
                    ? { label: "Never delivered", tone: "danger" }
                    : r.message_status === "read"
                      ? { label: "Read", tone: "info" }
                      : r.message_status === "delivered"
                        ? { label: "Delivered", tone: "info" }
                        : { label: "Sent", tone: "plain" };
    const quote = r.replied && r.reply_words ? `“${r.reply_words}”` : null;
    const words =
      r.state === "skipped"
        ? (r.reason && HELD_REASONS[r.reason]) || r.reason || "held back"
        : r.state === "failed"
          ? (r.reason && HELD_REASONS[r.reason]) || HELD_REASONS.send_failed || "WhatsApp refused it"
          : r.state === "queued"
            ? (cutOff ?? "not sent yet")
            : r.consent_after === "opted_out"
              ? quote
                ? `${quote} — ${answer}`
                : answer!
              : quote
                ? quote
                : r.consent_after === "opted_in"
                  ? answer!
                  : r.message_status === "failed"
                    ? "WhatsApp could not deliver it"
                    : hiThere
                      ? "greeted “Hi there” — no name on file"
                      : receiptWords(r, clock);
    const door =
      r.consent_after === "opted_out" && out
        ? { label: "See consent", to: `clients/${r.contact_id}` }
        : hiThere
          ? { label: "Add a name", to: `clients/${r.contact_id}` }
          : r.replied && r.conversation_id
            ? { label: "Open the thread", to: `inbox/th-${r.conversation_id}` }
            : null;
    const inn: RunFilterId[] = ["all"];
    if (out && r.replied) inn.push("replied");
    if (r.state === "skipped" || r.state === "failed" || (r.state === "queued" && cutOff)) inn.push("held");
    if (out && r.consent_after === "opted_out") inn.push("stopped");
    return {
      contact_id: r.contact_id,
      name: r.name,
      initials: initialsOf(r.name, !!r.first_name),
      pill,
      words,
      door,
      at: out ? clock(r.replied_at || r.consent_at || r.read_at || r.delivered_at || r.sent_at) : null,
      attn: (out && r.consent_after === "opted_out") || hiThere,
      held: !out,
      in: inn,
    };
  });

  const replies: RunReplyVM[] = replied
    .slice()
    .sort((a, b) => String(a.replied_at ?? "").localeCompare(String(b.replied_at ?? "")))
    .map((r) => ({
      contact_id: r.contact_id,
      name: r.name,
      initials: initialsOf(r.name, !!r.first_name),
      quote: r.reply_words ? `“${r.reply_words}”` : null,
      outcome: r.waiting_on_you
        ? { words: "Waiting on you", tone: "warn" }
        : r.answered_by === "receptionist"
          ? {
              words: `The receptionist answered${clock(r.answered_at) ? ` · ${clock(r.answered_at)}` : ""}`,
              tone: "ok",
            }
          : r.answered_by === "team"
            ? { words: `Your team answered${clock(r.answered_at) ? ` · ${clock(r.answered_at)}` : ""}`, tone: "ok" }
            : { words: "Not answered yet", tone: "plain" },
      to: r.conversation_id ? `inbox/th-${r.conversation_id}` : null,
    }));

  const failed = d.broadcast?.state === "failed";
  const code = d.broadcast?.failure ?? null;
  return {
    enrolled: d.recipients.length,
    span:
      spanH === 1
        ? "the first hour"
        : spanH < 24
          ? `the first ${spanH} hours`
          : spanH === 24
            ? "the first day"
            : `the first ${spanH / 24} days`,
    groups: {
      all: people.length,
      replied: people.filter((p) => p.in.includes("replied")).length,
      held: people.filter((p) => p.in.includes("held")).length,
      stopped: people.filter((p) => p.in.includes("stopped")).length,
    },
    people,
    replies,
    stop: failed
      ? {
          words: broadcastFailureWords(code),
          fix: broadcastFailureFix(code, sent),
          tone: code === "paused" ? "warn" : "danger",
        }
      : null,
    figures: [
      {
        id: "sent",
        label: "Messages sent",
        n: sent,
        pct: null,
        sub: `of ${d.recipients.length} on the list`,
        tone: "plain",
        bars: bars(reached.map((r) => r.sent_at)),
      },
      {
        id: "delivered",
        label: "Delivered",
        n: delivered.length,
        pct: pct(delivered.length),
        sub:
          sent === 0
            ? "nothing has gone out"
            : never > 0
              ? `${never} never reached the handset`
              : "every one reached the handset",
        tone: delivered.length > 0 ? "ok" : "plain",
        bars: bars(delivered.map((r) => r.delivered_at ?? r.read_at)),
      },
      {
        id: "replied",
        label: "Replied",
        n: replied.length,
        pct: pct(replied.length),
        sub:
          waiting > 0
            ? `${waiting} waiting on you in the Inbox`
            : replied.length > 0
              ? "each one is a thread in the Inbox"
              : "nobody has written back yet",
        tone: replied.length > 0 ? "ok" : "plain",
        bars: bars(replied.map((r) => r.replied_at)),
      },
      {
        id: "said_yes",
        label: "Said yes",
        n: yes.length,
        pct: pct(yes.length),
        sub: yes.length > 0 ? answersWords(yes, "opted_in") : "nobody new said yes",
        tone: yes.length > 0 ? "ok" : "plain",
        bars: bars(yes.map((r) => r.consent_at)),
      },
      {
        id: "stopped",
        label: "Asked to stop",
        n: stopped.length,
        pct: pct(stopped.length),
        sub: stopped.length > 0 ? answersWords(stopped, "opted_out") : "nobody asked to stop",
        tone: stopped.length > 0 ? "warn" : "plain",
        bars: bars(stopped.map((r) => r.consent_at)),
      },
    ],
  };
}
