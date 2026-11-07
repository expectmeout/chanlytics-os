/**
 * A deal is a record (docs/decisions/0004-deals-record.md), and a proposal is
 * part of it (0008).
 *
 * One engagement a person is deciding on or has taken: a proposal out, a
 * client, passed, ended. The proposal's link, its value, the day it stands
 * until and the reason someone passed live on the deal. Everything a page or
 * a receptionist says about one is derived here, once: the words, the line,
 * the chip, the moves the person's page offers, the sentence the receptionist
 * hears, Today's leak and Reports' cohort. Every workspace has the layer (0008,
 * amended 18 Oct 2026). Pure.
 *
 * "Here" is now this folder. This module holds the deal as it is read and said (DealDto, DealVM, toDealVM) and
 * the sentence the receptionist hears; the modules beside it hold the rest: the closed sets and their words
 * (deals/words.ts), amounts (deals/amount.ts), the pace and a proposal's wait
 * (deals/waits.ts), consultations and where a person stands (deals/consultations.ts) and Reports' cohort
 * (deals/report.ts); the deal sheet and the card are sheet/, and the Pipeline is pipeline/.
 */
import { clockDate, wallClockAt, zoneDayKey } from "../shared/clock";
import { isRealDate } from "../config/workspace-config/config-rules";
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
} from "./words";
import { amountWords } from "./amount";

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
  /** The currency its amount is in: an open deal's (open_deals, 0029); people_list's one deal has none, read as USD. */
  deal_currency?: string | null;
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

export function dealFactsOf(dealColumns: Partial<DealColumns> | null | undefined): DealFacts | null {
  if (!dealColumns || !isDealStage(dealColumns.deal_stage)) return null;
  return {
    stage: dealColumns.deal_stage,
    service: dealColumns.deal_service ?? null,
    proposed_at: dealColumns.deal_proposed_at ?? null,
    decided_at: dealColumns.deal_decided_at ?? null,
    ended_at: dealColumns.deal_ended_at ?? null,
    amount_cents: dealColumns.deal_amount_cents ?? null,
    per: dealColumns.deal_per ?? null,
    currency: dealColumns.deal_currency ?? null,
    proposal_url: dealColumns.deal_proposal_url ?? null,
    valid_until: dealColumns.deal_valid_until ?? null,
    lost_reason: dealColumns.deal_lost_reason ?? null,
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
export function dealIsOpen(details: { stage: string } | null | undefined): boolean {
  return !!details && (details.stage === "proposed" || details.stage === "won");
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

/** That count in words, "8 d", and "today" on the day it began: "Proposal out · 0 d" read as a fault (26 Oct 2026). */
export const daysInStageWords = (days: number): string => (days === 0 ? "today" : `${days} d`);

/** When the stage began: the proposal's send, the answer, or the end. */
export function dealSinceMs(dealFacts: DealFacts): number | null {
  const at =
    dealFacts.stage === "proposed"
      ? dealFacts.proposed_at
      : dealFacts.stage === "ended"
        ? dealFacts.ended_at
        : (dealFacts.decided_at ?? dealFacts.proposed_at);
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
  dealFacts: DealFacts & { id?: string | null; version?: number | null },
  tz: string,
  nowMs: number,
): DealVM | null {
  if (!isDealStage(dealFacts.stage)) return null;
  const sinceMs = dealSinceMs(dealFacts);
  const since = sinceMs === null ? "" : `since ${clockDate(sinceMs, tz, nowMs)}`;
  const waitingDays = dealFacts.stage === "proposed" ? wholeDaysSince(sinceMs, nowMs) : null;
  // A proposal carries a value as a client does (0008): the page says it at every stage.
  const amount = amountWords(dealFacts.amount_cents, dealFacts.per, dealFacts.currency ?? "USD");
  const url = dealFacts.proposal_url?.trim() || null;
  const proposedMs = dealFacts.proposed_at ? Date.parse(dealFacts.proposed_at) : NaN;
  const word = DEAL_STAGE_WORDS[dealFacts.stage];
  const sentence = [word, since, amount].filter((x): x is string => !!x).join(" · ");
  const line = [dealFacts.service, sentence].filter((x): x is string => !!x).join(" · ");
  const facts = [dealFacts.service, since, amount].filter((x): x is string => !!x).join(" · ");
  const brief =
    dealFacts.stage === "proposed"
      ? `${word} · ${daysInStageWords(waitingDays ?? 0)}`
      : dealFacts.stage === "won"
        ? [word, dealFacts.service].filter((x): x is string => !!x).join(" · ")
        : null;
  return {
    id: dealFacts.id ?? null,
    version: dealFacts.version ?? null,
    stage: dealFacts.stage,
    word,
    service: dealFacts.service,
    sinceMs,
    since,
    said: sentence,
    line,
    facts,
    brief,
    waitingDays,
    amount,
    amountCents:
      dealFacts.amount_cents === null ||
      dealFacts.amount_cents === undefined ||
      !Number.isFinite(dealFacts.amount_cents)
        ? null
        : dealFacts.amount_cents,
    per: isDealPer(dealFacts.per) ? dealFacts.per : null,
    currency: dealFacts.currency || "USD",
    proposedMs: Number.isFinite(proposedMs) ? proposedMs : null,
    proposal: url ? { url, host: linkHost(url) } : null,
    validUntil: dealFacts.stage === "proposed" ? validUntilOf(dealFacts.valid_until, tz, nowMs) : null,
    reason:
      dealFacts.stage === "lost" && isDealLostReason(dealFacts.lost_reason)
        ? { code: dealFacts.lost_reason, words: DEAL_LOST_REASON_WORDS[dealFacts.lost_reason] }
        : null,
  };
}

/** The People row's deal, from its columns; null where none. */
export function dealOf(dealColumns: Partial<DealColumns> | null | undefined, tz: string, nowMs: number): DealVM | null {
  const f = dealFactsOf(dealColumns);
  return f ? toDealVM({ ...f, id: dealColumns?.deal_id ?? null }, tz, nowMs) : null;
}

/** One of a person's open deals as people_list carries them (`open_deals`, 0029): the one deal's columns, unprefixed. */
export interface OpenDealDto {
  id: string;
  stage: string;
  service: string | null;
  proposed_at: string | null;
  decided_at: string | null;
  ended_at: string | null;
  amount_cents: number | null;
  per: string | null;
  currency: string | null;
  proposal_url: string | null;
  valid_until: string | null;
  lost_reason: string | null;
}

const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * `open_deals` as people_list answers it (jsonb), read into its shape: undefined where the read has no such column (a
 * database before 0029), null where none is open, and each entry kept only with an id and a stage. Never a cast: a
 * value the database did not write as an object is no deal.
 */
export function openDealsFromJson(value: unknown): OpenDealDto[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const out: OpenDealDto[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const value = item as Record<string, unknown>;
    const id = strOrNull(value.id);
    const stage = strOrNull(value.stage);
    if (!id || !stage) continue;
    out.push({
      id,
      stage,
      service: strOrNull(value.service),
      proposed_at: strOrNull(value.proposed_at),
      decided_at: strOrNull(value.decided_at),
      ended_at: strOrNull(value.ended_at),
      amount_cents: typeof value.amount_cents === "number" ? value.amount_cents : null,
      per: strOrNull(value.per),
      currency: strOrNull(value.currency),
      proposal_url: strOrNull(value.proposal_url),
      valid_until: strOrNull(value.valid_until),
      lost_reason: strOrNull(value.lost_reason),
    });
  }
  return out;
}

/**
 * Every open deal of a People row (0029): a proposal out or a client, one per service, newest first. A person may hold
 * several (deals_open_uq is per service), and the one deal the row shows hid the rest from the Pipeline, People's deal
 * lists and the proposal follow-up. From `open_deals` where the read carries it (null: none open); a read from before it
 * (absent) has the one deal, when it is open.
 */
export function openDealsOf(
  row: ({ open_deals?: readonly OpenDealDto[] | null } & Partial<DealColumns>) | null | undefined,
  tz: string,
  nowMs: number,
): DealVM[] {
  if (!row) return [];
  if (row.open_deals === undefined) {
    const one = dealOf(row, tz, nowMs);
    return one && dealIsOpen(one) ? [one] : [];
  }
  return (row.open_deals ?? [])
    .map((item) =>
      dealOf(
        {
          deal_id: item.id,
          deal_stage: item.stage,
          deal_service: item.service,
          deal_proposed_at: item.proposed_at,
          deal_decided_at: item.decided_at,
          deal_ended_at: item.ended_at,
          deal_amount_cents: item.amount_cents,
          deal_per: item.per,
          deal_currency: item.currency,
          deal_proposal_url: item.proposal_url,
          deal_valid_until: item.valid_until,
          deal_lost_reason: item.lost_reason,
        },
        tz,
        nowMs,
      ),
    )
    .filter((d): d is DealVM => d !== null && dealIsOpen(d));
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
  dealFacts: DealFacts | null | undefined,
  nowMs: number,
  tz = "UTC",
  opts: { hasLink?: boolean } = {},
): string | null {
  if (!dealFacts || !isDealStage(dealFacts.stage)) return null;
  const svc = dealFacts.service ? ` (${dealFacts.service})` : "";
  const sinceMs = dealSinceMs(dealFacts);
  const on = sinceMs === null ? "" : ` on ${clockDate(sinceMs, tz, nowMs)}`;
  const since = sinceMs === null ? "" : `, since ${clockDate(sinceMs, tz, nowMs)}`;
  switch (dealFacts.stage) {
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
