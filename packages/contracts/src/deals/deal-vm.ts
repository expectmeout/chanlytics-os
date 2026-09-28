/**
 * A deal is a record (docs/decisions/0004-deals-record.md), and a proposal is
 * part of it (0008).
 *
 * One engagement a person is deciding on or has taken: a proposal out, a
 * client, passed, ended. The proposal's link, its value, the day it stands
 * until and the reason someone passed live on the deal. Everything a page or
 * a receptionist says about one is derived here, once: the words, the line,
 * the chip, the moves the person's page offers, the sentence the receptionist
 * hears, Today's leak, Reports' cohort, and the one switch the whole layer
 * hangs on (dealsAreOn). Pure.
 *
 * "Here" is now this folder. This module holds the deal as it is read and said (DealDto, DealVM, toDealVM) and
 * the sentence the receptionist hears; the modules beside it hold the rest: the closed sets and their words
 * (deal-words.ts), how a workspace sells (sells-by.ts), amounts (deal-amount.ts), the pace and a proposal's wait
 * (deal-waits.ts), consultations and where a person stands (deal-consultations.ts) and Reports' cohort
 * (deal-report.ts); the deal sheet and the card are sheet/, and the Pipeline is pipeline/.
 */
import { clockDate, wallClockAt, zoneDayKey } from "../shared/clock";
import { isRealDate } from "../config/workspace-config/config-schema";
import { linkHost } from "../shared/link";
import { DAY_MS } from "../shared/time";
import {
  DEAL_LOST_REASON_WORDS,
  DEAL_STAGE_WORDS,
  isDealLostReason,
  isDealPer,
  isDealStage,
  type DealLostReason,
  type DealPer,
  type DealStage,
} from "./deal-words";
import { amountWords } from "./deal-amount";

/** The columns the people read carries for a person (people_list, 00156): the newest open or current deal, else the newest of any. */
export interface DealColumns {
  deal_id: string | null;
  deal_stage: string | null;
  deal_service: string | null;
  deal_proposed_at: string | null;
  deal_decided_at: string | null;
  deal_ended_at: string | null;
  deal_amount_cents: number | null;
  deal_per: string | null;
  /** Its link, the day it stands until and why they passed (00160); absent on a row read before them. */
  deal_proposal_url?: string | null;
  deal_valid_until?: string | null;
  deal_lost_reason?: string | null;
}

/** A deal as the door returns it and the person's page lists them. */
export interface DealDto {
  id: string;
  contact_id: string;
  service: string | null;
  stage: string;
  proposed_at: string;
  decided_at: string | null;
  ended_at: string | null;
  amount_cents: number | null;
  per: string | null;
  currency: string;
  note: string | null;
  version: number;
  created_at: string;
  /** The proposal's web address (00160); absent on a read before the column existed. */
  proposal_url?: string | null;
  /** The last day the proposal stands, `YYYY-MM-DD` by the business's calendar. */
  valid_until?: string | null;
  /** Why they passed, on a passed deal. */
  lost_reason?: string | null;
}

/** What every reader needs of a deal, from either shape. */
export interface DealFacts {
  stage: string;
  service: string | null;
  proposed_at: string | null;
  decided_at: string | null;
  ended_at: string | null;
  amount_cents?: number | null;
  per?: string | null;
  currency?: string | null;
  proposal_url?: string | null;
  valid_until?: string | null;
  lost_reason?: string | null;
}

export function dealFactsOf(r: Partial<DealColumns> | null | undefined): DealFacts | null {
  if (!r || !isDealStage(r.deal_stage)) return null;
  return {
    stage: r.deal_stage,
    service: r.deal_service ?? null,
    proposed_at: r.deal_proposed_at ?? null,
    decided_at: r.deal_decided_at ?? null,
    ended_at: r.deal_ended_at ?? null,
    amount_cents: r.deal_amount_cents ?? null,
    per: r.deal_per ?? null,
    proposal_url: r.deal_proposal_url ?? null,
    valid_until: r.deal_valid_until ?? null,
    lost_reason: r.deal_lost_reason ?? null,
  };
}

/**
 * The one rule for which of a person's deals the pages show: an open or
 * current one first (proposed, won), then the newest. The lateral join in
 * people_list orders the same way.
 */
export function pickCurrentDeal<T extends { stage: string; created_at: string }>(rows: readonly T[]): T | null {
  const sorted = [...rows].sort(
    (a, b) => Number(dealIsOpen(b)) - Number(dealIsOpen(a)) || Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  return sorted[0] ?? null;
}

/** Whether a deal is open (0004): a proposal out, or a client. A pass or an end is history. */
export function dealIsOpen(d: { stage: string } | null | undefined): boolean {
  return !!d && (d.stage === "proposed" || d.stage === "won");
}

/**
 * The proposal link a person has now (0008), one rule for their page, the thread and the receptionist: their current
 * deal's while it is a proposal out, and none while it is anything else -- a client, a pass, an end; the link on the
 * person (00154) only for someone with no deal at all, read until that column retires. `current` is the deal the page
 * shows (pickCurrentDeal's, or people_list's row), as a row carries it (`proposal_url`) or as a view model says it
 * (`proposal.url`).
 */
export function proposalLinkOf(
  current: { stage: string; proposal_url?: string | null; proposal?: { url: string } | null } | null | undefined,
  personLink: string | null | undefined,
): string | null {
  if (!current) return personLink?.trim() || null;
  if (current.stage !== "proposed") return null;
  return (current.proposal_url ?? current.proposal?.url)?.trim() || null;
}

/**
 * Whole days since a moment, as a deal counts its time in a stage: 0 on the day it began, never below it; null without
 * the moment. A proposal's wait (DealVM.waitingDays) and the Pipeline's time in stage are this one count.
 */
export function wholeDaysSince(atMs: number | null, nowMs: number): number | null {
  return atMs === null ? null : Math.max(0, Math.floor((nowMs - atMs) / DAY_MS));
}

/** When the stage began: the proposal's send, the answer, or the end. */
export function dealSinceMs(d: DealFacts): number | null {
  const at =
    d.stage === "proposed" ? d.proposed_at : d.stage === "ended" ? d.ended_at : (d.decided_at ?? d.proposed_at);
  const ms = at ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** A deal as a page says it. */
export interface DealVM {
  id: string | null;
  version: number | null;
  stage: DealStage;
  word: string;
  service: string | null;
  sinceMs: number | null;
  /** "since Sep 12"; "" when the date is unknown. */
  since: string;
  /**
   * "Proposal out · since Sep 12 · $1,200", "Client · since Oct 1 · $2,500 a month": the stage and its facts, without
   * the service.
   */
  said: string;
  /** The service in front of `said`, for a line that stands alone. */
  line: string;
  /** Everything but the stage's word: "Ad management · since Oct 1 · $2,500 a month", under `word` on the card's row. */
  facts: string;
  /** The chip beside the wires and the row's second line: "Proposal out · 6 d", "Client · Ad management"; null where the visit says more. */
  brief: string | null;
  /** Days since the proposal went, for a proposal out; null otherwise. */
  waitingDays: number | null;
  /** The deal's amount in words at every stage: a proposal's value, a client's agreed amount (0008). Null without one. */
  amount: string | null;
  /** The same amount as stored, for a box that edits it (the deal sheet): its cents and how it recurs; null without one. */
  amountCents: number | null;
  per: DealPer | null;
  /** The currency it is in: what the sheet's box says it in (amountWords). */
  currency: string;
  /** When the proposal went (its proposed_at), at every stage: the deal card's Proposal out step. Null when unknown. */
  proposedMs: number | null;
  /**
   * The proposal's link and the host it lives at; null where the deal carries none. On a person's page it also says
   * whether it went (`sent`, from the thread's own messages, as PersonVM.proposal does), and whether a message carrying
   * it is still on its way (`sending`: queued, in the seconds its send can be undone); a People row can say neither.
   */
  proposal: { url: string; host: string; sent?: { at: string; via: string | null } | null; sending?: boolean } | null;
  /**
   * "Valid until Sep 30", or "Lapsed Sep 30" once that day has passed by the business's calendar: a proposal's only.
   * `date` is the day alone ("Sep 30"), for a column whose heading already says what it is.
   */
  validUntil: { day: string; date: string; words: string; lapsed: boolean } | null;
  /** Why they passed, and its word: a passed deal's only. */
  reason: { code: DealLostReason; words: string } | null;
}

/** The day a proposal stands until, said by the business's calendar; null for a day that is not one. */
function validUntilOf(day: string | null | undefined, tz: string, nowMs: number): DealVM["validUntil"] {
  if (!day || !isRealDate(day)) return null;
  const at = wallClockAt(tz, day, 12, 0);
  if (!Number.isFinite(at)) return null;
  const lapsed = zoneDayKey(nowMs, tz) > day;
  const date = clockDate(at, tz, nowMs);
  return { day, date, words: `${lapsed ? "Lapsed" : "Valid until"} ${date}`, lapsed };
}

export function toDealVM(
  d: DealFacts & { id?: string | null; version?: number | null },
  tz: string,
  nowMs: number,
): DealVM | null {
  if (!isDealStage(d.stage)) return null;
  const sinceMs = dealSinceMs(d);
  const since = sinceMs === null ? "" : `since ${clockDate(sinceMs, tz, nowMs)}`;
  const waitingDays = d.stage === "proposed" ? wholeDaysSince(sinceMs, nowMs) : null;
  // A proposal carries a value as a client does (0008): the page says it at every stage.
  const amount = amountWords(d.amount_cents, d.per, d.currency ?? "USD");
  const url = d.proposal_url?.trim() || null;
  const proposedMs = d.proposed_at ? Date.parse(d.proposed_at) : NaN;
  const word = DEAL_STAGE_WORDS[d.stage];
  const said = [word, since, amount].filter((x): x is string => !!x).join(" · ");
  const line = [d.service, said].filter((x): x is string => !!x).join(" · ");
  const facts = [d.service, since, amount].filter((x): x is string => !!x).join(" · ");
  const brief =
    d.stage === "proposed"
      ? `${word} · ${waitingDays ?? 0} d`
      : d.stage === "won"
        ? [word, d.service].filter((x): x is string => !!x).join(" · ")
        : null;
  return {
    id: d.id ?? null,
    version: d.version ?? null,
    stage: d.stage,
    word,
    service: d.service,
    sinceMs,
    since,
    said,
    line,
    facts,
    brief,
    waitingDays,
    amount,
    amountCents:
      d.amount_cents === null || d.amount_cents === undefined || !Number.isFinite(d.amount_cents)
        ? null
        : d.amount_cents,
    per: isDealPer(d.per) ? d.per : null,
    currency: d.currency || "USD",
    proposedMs: Number.isFinite(proposedMs) ? proposedMs : null,
    proposal: url ? { url, host: linkHost(url) } : null,
    validUntil: d.stage === "proposed" ? validUntilOf(d.valid_until, tz, nowMs) : null,
    reason:
      d.stage === "lost" && isDealLostReason(d.lost_reason)
        ? { code: d.lost_reason, words: DEAL_LOST_REASON_WORDS[d.lost_reason] }
        : null,
  };
}

/** The People row's deal, from its columns; null where none. */
export function dealOf(r: Partial<DealColumns> | null | undefined, tz: string, nowMs: number): DealVM | null {
  const f = dealFactsOf(r);
  return f ? toDealVM({ ...f, id: r?.deal_id ?? null }, tz, nowMs) : null;
}

/**
 * The sentence the receptionist hears about this person's deal, beside the
 * owner's note (describeLead). One per stage; never an amount; nothing
 * without a deal. Channel-neutral: "hand over" is what both do. Where a
 * proposal link is on file -- the deal's (00160), else the person's while it
 * is still read (00154) -- that link's own rule stands for a price question,
 * so the proposal's sentence points at it instead of promising a follow-up.
 */
export function dealSentence(
  d: DealFacts | null | undefined,
  nowMs: number,
  tz = "UTC",
  opts: { hasLink?: boolean } = {},
): string | null {
  if (!d || !isDealStage(d.stage)) return null;
  const svc = d.service ? ` (${d.service})` : "";
  const sinceMs = dealSinceMs(d);
  const on = sinceMs === null ? "" : ` on ${clockDate(sinceMs, tz, nowMs)}`;
  const since = sinceMs === null ? "" : `, since ${clockDate(sinceMs, tz, nowMs)}`;
  switch (d.stage) {
    case "won":
      return `They are a client${svc}${since}. Offer them the service itself, not a consultation. Anything about their engagement or what it costs goes to a person: say someone will follow up, and hand over.`;
    case "proposed":
      return opts.hasLink
        ? `A proposal${svc} went out to them${on} and is waiting on their answer. If they ask about it, send them the proposal link and state none of its figures, then hand over.`
        : `A proposal${svc} went out to them${on} and is waiting on their answer. If they ask about it, say the person who sent it will follow up, and hand over. Never discuss its price.`;
    case "lost":
      return `They passed on a proposal${svc}${on}. Do not bring it up; if they ask again, hand over to a person.`;
    case "ended":
      return `A former client${svc}: the engagement ended${on}. Treat them as any customer.`;
  }
}
