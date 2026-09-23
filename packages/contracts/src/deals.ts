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
 */
import { foldName, needsConsultation, type ConsultRules } from "./availability";
import { clockDate, wallClockAt, zoneDayKey } from "./clock";
import { isRealDate } from "./config";
import { linkHost } from "./link";
import type { SchemaSet } from "./schema-sets";

export const DEAL_STAGES = ["proposed", "won", "lost", "ended"] as const;
export type DealStage = SchemaSet<"deals.stage">;
export const DEAL_PERS = ["once", "month", "year"] as const;
export type DealPer = SchemaSet<"deals.per">;
export const DEAL_SOURCES = ["person", "payment"] as const;
export type DealSource = SchemaSet<"deals.source">;
/** Why someone passed (00160). The deal's note says the rest in the owner's words. */
export const DEAL_LOST_REASONS = ["price", "timing", "elsewhere", "no_reply", "not_a_fit", "other"] as const;
export type DealLostReason = SchemaSet<"deals.lost_reason">;
export const DEAL_LOST_REASON_WORDS: Record<DealLostReason, string> = {
  price: "Price",
  timing: "Timing",
  elsewhere: "Went elsewhere",
  no_reply: "No reply",
  not_a_fit: "Not a fit",
  other: "Other",
};

/**
 * How a workspace's customers buy (tenants.sells_by, 00160): they book an
 * appointment, or some get a proposal first. Null is not asked yet. The deal
 * layer is there or absent by this answer and nothing else (dealsAreOn).
 */
export const SELLS_BY = ["booking", "proposal"] as const;
export type SellsBy = SchemaSet<"tenants.sells_by">;
export const SELLS_BY_QUESTION = "How customers buy";
export const SELLS_BY_WORDS: Record<SellsBy, { label: string; sentence: string }> = {
  booking: { label: "They book an appointment", sentence: "Bookings, reminders and the booking link." },
  proposal: {
    label: "Some get a proposal first",
    sentence: "Adds deals: a proposal on each person, a Pipeline in People, and a Deals section in Reports.",
  },
};

export function isSellsBy(s: unknown): s is SellsBy {
  return typeof s === "string" && (SELLS_BY as readonly string[]).includes(s);
}

/** What the workspace route answers for anything but the two answers: the question and both labels (deals.test holds them). */
export const SELLS_BY_REFUSAL = "How customers buy: they book an appointment, or some get a proposal first.";

/**
 * Whether deals are on in this workspace (0008): exactly when it says some of
 * its customers get a proposal first. The one predicate every gate reads --
 * the person's page, People's lists and column, the thread, Today, Reports,
 * Ask. A consult-first service is a booking rule, and a deal on file switches
 * nothing.
 */
export function dealsAreOn(sellsBy: string | null | undefined): boolean {
  return sellsBy === "proposal";
}

/** The word a stage wears; "Client" is a stage word, never a word for a person (docs/glossary.md). */
export const DEAL_STAGE_WORDS: Record<DealStage, string> = {
  proposed: "Proposal out",
  won: "Client",
  lost: "Passed",
  ended: "Ended",
};
export const DEAL_PER_WORDS: Record<DealPer, string> = { once: "once", month: "a month", year: "a year" };
/** The line the person's page says where no deal was ever recorded. */
export const DEAL_LINE_NONE = "No proposal yet";
/** A proposal out this long with nothing back is Today's leak. */
export const WAITING_AFTER_DAYS = 7;
/** A consultation this recent with no proposal after it is the next step to take. */
export const CONSULT_FOLLOW_DAYS = 7;

const DAY_MS = 86_400_000;

export function isDealStage(s: unknown): s is DealStage {
  return typeof s === "string" && (DEAL_STAGES as readonly string[]).includes(s);
}

export function isDealLostReason(s: unknown): s is DealLostReason {
  return typeof s === "string" && (DEAL_LOST_REASONS as readonly string[]).includes(s);
}

export function isDealPer(s: unknown): s is DealPer {
  return typeof s === "string" && (DEAL_PERS as readonly string[]).includes(s);
}

/** What a move may empty (deal_record's p_clear, 00160): the link, the valid-until day, the amount with its per, the note. */
export const DEAL_CLEARABLE = ["proposal_url", "valid_until", "amount", "note"] as const;
export type DealClearable = (typeof DEAL_CLEARABLE)[number];

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
  const open = (d: T) => d.stage === "proposed" || d.stage === "won";
  const sorted = [...rows].sort(
    (a, b) => Number(open(b)) - Number(open(a)) || Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  return sorted[0] ?? null;
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

/** "$2,500 a month", "$999.50", "$1,200 a year"; null without an amount. */
export function amountWords(
  cents: number | null | undefined,
  per: string | null | undefined,
  currency = "USD",
): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null;
  const whole = cents % 100 === 0;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
  const p = per && (DEAL_PERS as readonly string[]).includes(per) ? DEAL_PER_WORDS[per as DealPer] : null;
  return p && per !== "once" ? `${money} ${p}` : money;
}

/**
 * Cents from what a person typed ("2,500", "$999.50"), or null for anything
 * that is not an amount. Everything but digits, a point and a minus goes
 * first; letters alone strip to "", and Number("") is 0, which once made
 * "abc" a $0 client; the minus survives the strip, so "-5" is refused rather
 * than read as five dollars.
 */
export function parseAmount(words: string | null | undefined): number | null {
  const digits = String(words || "").replace(/[^0-9.-]/g, "");
  const n = digits ? Number(digits) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** An amount as a deal carries one: its cents, how it recurs and its currency. */
export interface AmountFact {
  amount_cents?: number | null;
  per?: string | null;
  currency?: string | null;
}

/**
 * What a set of deals is worth, summed by how each recurs and joined: "$4,250
 * + $600 a month". Once and no per are one sum; a currency is never added to
 * another. Null when nothing has an amount.
 */
export function amountTotalsWords(items: readonly AmountFact[]): string | null {
  const order = ["once", "month", "year"];
  const sums = new Map<string, { cents: number; per: string; currency: string }>();
  for (const i of items) {
    if (i.amount_cents === null || i.amount_cents === undefined || !Number.isFinite(i.amount_cents)) continue;
    const per = i.per === "month" || i.per === "year" ? i.per : "once";
    const currency = (i.currency || "USD").toUpperCase();
    const key = `${per}|${currency}`;
    const s = sums.get(key) ?? { cents: 0, per, currency };
    s.cents += i.amount_cents;
    sums.set(key, s);
  }
  if (!sums.size) return null;
  return [...sums.values()]
    .sort((a, b) => order.indexOf(a.per) - order.indexOf(b.per) || a.currency.localeCompare(b.currency))
    .map((s) => amountWords(s.cents, s.per, s.currency))
    .join(" + ");
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
  /** "Valid until Sep 30", or "Lapsed Sep 30" once that day has passed by the business's calendar: a proposal's only. */
  validUntil: { day: string; words: string; lapsed: boolean } | null;
  /** Why they passed, and its word: a passed deal's only. */
  reason: { code: DealLostReason; words: string } | null;
}

/** The day a proposal stands until, said by the business's calendar; null for a day that is not one. */
function validUntilOf(day: string | null | undefined, tz: string, nowMs: number): DealVM["validUntil"] {
  if (!day || !isRealDate(day)) return null;
  const at = wallClockAt(tz, day, 12, 0);
  if (!Number.isFinite(at)) return null;
  const lapsed = zoneDayKey(nowMs, tz) > day;
  return { day, words: `${lapsed ? "Lapsed" : "Valid until"} ${clockDate(at, tz, nowMs)}`, lapsed };
}

export function toDealVM(
  d: DealFacts & { id?: string | null; version?: number | null },
  tz: string,
  nowMs: number,
): DealVM | null {
  if (!isDealStage(d.stage)) return null;
  const sinceMs = dealSinceMs(d);
  const since = sinceMs === null ? "" : `since ${clockDate(sinceMs, tz, nowMs)}`;
  const waitingDays =
    d.stage === "proposed" && sinceMs !== null ? Math.max(0, Math.floor((nowMs - sinceMs) / DAY_MS)) : null;
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

/** An act on a deal (0008): most open the deal sheet (deal-sheet.ts) in a mode; a send opens their thread. */
export type DealActId = "propose" | "again" | "edit" | "won" | "lost" | "ended" | "send" | "follow-up";

/**
 * One act, one label, wherever it is drawn: the person page's deal card and its quiet line, the thread's Deal group,
 * and the person's More menu, whose send is the proposal's (people.ts personActs).
 */
export const DEAL_ACT_WORDS: Record<DealActId, string> = {
  propose: "Start a proposal",
  again: "Propose again",
  edit: "Edit proposal",
  won: "Mark as client",
  lost: "Mark as passed",
  ended: "End the engagement",
  send: "Send proposal",
  "follow-up": "Follow up",
};

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

/** A calendar title that is a consultation: it says so, or it names a consult-first service. The fold is availability's. */
export function isConsultationTitle(
  title: string | null | undefined,
  services: readonly { name: string }[] | undefined,
  rules: ConsultRules | null | undefined,
): boolean {
  const t = foldName(String(title ?? "").trim());
  if (!t) return false;
  if (t.includes("consult")) return true;
  return (services ?? []).some((s) => {
    const n = foldName(String(s.name ?? "").trim());
    return !!n && t.includes(n) && needsConsultation(s.name, rules);
  });
}

/**
 * The one rule for a proposal waiting (0006, 0008): out past a week with nothing back since it went. `askedMs` is when
 * the person last wrote or called. Today's leak and the Pipeline both ask it, one row at a time.
 */
export function waitingOnProposal(
  r: { deal: Pick<DealVM, "stage" | "sinceMs"> | null; askedMs: number | null },
  nowMs: number,
): boolean {
  const d = r.deal;
  if (!d || d.stage !== "proposed" || d.sinceMs === null) return false;
  if (nowMs - d.sinceMs < WAITING_AFTER_DAYS * DAY_MS) return false;
  return r.askedMs === null || r.askedMs < d.sinceMs;
}

/** Today's leak: the rows waiting on a proposal, by waitingOnProposal. */
export function proposalsWaiting<T extends { deal: DealVM | null; askedMs: number | null }>(
  rows: readonly T[],
  nowMs: number,
): T[] {
  return rows.filter((r) => waitingOnProposal(r, nowMs));
}

/**
 * The next step nobody has taken (0008): a consultation that ended in the last CONSULT_FOLLOW_DAYS days, and no
 * proposal since. A person with an open deal has had one; a passed or ended deal counts only when it closed before the
 * consultation, which then began something new. `consultedMs` is when their last visit, a consultation, ended.
 */
export function consultationsWithoutProposal<
  T extends { consultedMs: number | null; deal: Pick<DealVM, "stage" | "sinceMs"> | null },
>(rows: readonly T[], nowMs: number): T[] {
  return rows.filter((r) => {
    const at = r.consultedMs;
    if (at === null || at > nowMs || nowMs - at > CONSULT_FOLLOW_DAYS * DAY_MS) return false;
    const d = r.deal;
    if (!d) return true;
    if (d.stage === "proposed" || d.stage === "won") return false;
    return d.sinceMs !== null && d.sinceMs < at;
  });
}

/** What the door can answer, in a sentence the page shows at the control. */
export const DEAL_REFUSALS: Record<string, string> = {
  not_found: "Person not found.",
  bad_stage: "That is not a stage a deal can be in.",
  bad_per: "An amount is once, a month or a year.",
  bad_amount: "An amount cannot be negative.",
  note_too_long: "A note is at most 200 characters.",
  service_too_long: "A service name is at most 80 characters.",
  bad_move: "A new deal starts with a proposal.",
  already_open: "They already have a proposal out or an engagement running for this service.",
  moved: "Someone changed this deal since you opened it. Reload and try again.",
  ended: "An ended engagement is not reopened: record a new proposal.",
  bad_link: "That is not a web address.",
  bad_reason: "A reason for passing is price, timing, went elsewhere, no reply, not a fit or other.",
  bad_clear: "Only the link, the valid-until day, the amount or the note can be emptied.",
};

/** Reports: one cohort (the proposals sent in the period) and the stock (clients now). Computed by the reports route from the table. */
export interface DealReportDto {
  /** Whether the section is drawn: deals are on here (dealsAreOn, 0008) and a deal was ever recorded. */
  any: boolean;
  sent: number;
  won: number;
  lost: number;
  waiting: number;
  clients: number;
  /** The monthly total of running engagements: month amounts, plus year amounts over twelve; once excluded. */
  monthly_cents: number;
}

export interface DealReportVM {
  present: boolean;
  /** "5 proposals went out in the last 30 days." */
  headline: string;
  /** "3 became clients · 1 passed · 1 still waiting"; "" when none went out. */
  parts: string;
  /** "4 clients now · $7,500 a month." */
  stock: string;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function toDealReportVM(dto: DealReportDto | null | undefined, rangeLabel: string): DealReportVM {
  if (!dto || !dto.any) return { present: false, headline: "", parts: "", stock: "" };
  const headline =
    dto.sent === 0
      ? `No proposals went out in the last ${rangeLabel}.`
      : `${plural(dto.sent, "proposal", "proposals")} went out in the last ${rangeLabel}.`;
  const parts =
    dto.sent === 0
      ? ""
      : [
          `${plural(dto.won, "became a client", "became clients")}`,
          `${dto.lost} passed`,
          `${dto.waiting} still waiting`,
        ].join(" · ");
  const monthly = dto.monthly_cents > 0 ? amountWords(dto.monthly_cents, "month") : null;
  const stock =
    dto.clients === 0
      ? "No clients right now."
      : `${plural(dto.clients, "client", "clients")} now${monthly ? ` · ${monthly}` : ""}.`;
  return { present: true, headline, parts, stock };
}
