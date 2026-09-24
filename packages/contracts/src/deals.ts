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
import { leadAnd } from "./leads";
import { linkHost } from "./link";
import type { PersonCameFrom } from "./people";
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

/** The answer a new workspace's create card has chosen before anyone presses (0008): most businesses book one. */
export const SELLS_BY_FIRST: SellsBy = "booking";

/** "Needs a consult first", where deals are on (0008): a consultation for one of those is where a deal starts. */
export const CONSULT_FIRST_DEAL_HINT = "A consultation for these is the first step of a deal.";

/** What Settings › Business says of the answer (0008): its row, the choice, and what the answer switches there. */
export interface SellsByVM {
  /** The row's label, and the choice's name. */
  question: string;
  /** The answer's label; null where it was never said. */
  value: string | null;
  /** What the row says with no answer. */
  empty: string;
  /** The row's act, and what a screen reader hears it as: its words with the question. */
  act: string;
  name: string;
  /** The two answers, each with what choosing it means: the kit's RecordToggleGroup options. */
  choices: { value: SellsBy; label: string; hint: string }[];
  /** What stops a Save with neither chosen: the route's own refusal. */
  refusal: string;
  /** What the create card has chosen before anyone presses: the answer, or they book an appointment. */
  first: SellsBy;
  /** Deals are on here (dealsAreOn). */
  dealsOn: boolean;
  /** The hint the consult-first row carries where deals are on; null where they are off. */
  consultHint: string | null;
}

/**
 * The view model of the answer for the Business tab. `answer` is the workspace's `sells_by` as the workspace list
 * carries it; anything but the two answers is never said. Pure.
 */
export function sellsByVM(answer: string | null | undefined): SellsByVM {
  const said = isSellsBy(answer) ? answer : null;
  const on = dealsAreOn(said);
  const verb = said ? "Change" : "Choose";
  return {
    question: SELLS_BY_QUESTION,
    value: said ? SELLS_BY_WORDS[said].label : null,
    empty: "Not said yet",
    act: said ? "Change" : "Choose one",
    name: `${verb} ${SELLS_BY_QUESTION.toLowerCase()}`,
    choices: SELLS_BY.map((a) => ({ value: a, label: SELLS_BY_WORDS[a].label, hint: SELLS_BY_WORDS[a].sentence })),
    refusal: SELLS_BY_REFUSAL,
    first: said ?? SELLS_BY_FIRST,
    dealsOn: on,
    consultHint: on ? CONSULT_FIRST_DEAL_HINT : null,
  };
}

/**
 * The toast once an answer is saved (0008): what it switched. Turning deals off says that those on file are kept,
 * since every surface hides them and answering "proposal" again brings them back.
 */
export function sellsBySaved(was: string | null | undefined, now: SellsBy): string {
  if (dealsAreOn(now)) return "Saved — deals are on.";
  return dealsAreOn(was)
    ? "Saved — deals are off. Any already recorded are kept."
    : "Saved — customers book an appointment.";
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
/** How many decided proposals a workspace needs before its pace is said (0008, amended; 00167). */
export const PACE_AFTER_DECIDED = 5;
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

/**
 * The consult-first service a calendar title names, as Settings spells it: what a proposal started from that
 * consultation is for (0008). The longest name the title holds, so "Kitchen remodel" wins over "Remodel"; null where
 * it names none. The fold is availability's.
 */
export function consultServiceOf(
  title: string | null | undefined,
  services: readonly { name: string }[] | undefined,
  rules: ConsultRules | null | undefined,
): string | null {
  const t = foldName(String(title ?? "").trim());
  if (!t) return null;
  let best: { name: string; folded: string } | null = null;
  for (const s of services ?? []) {
    const name = String(s.name ?? "").trim();
    const folded = foldName(name);
    if (!folded || !t.includes(folded) || !needsConsultation(name, rules)) continue;
    if (!best || folded.length > best.folded.length) best = { name, folded };
  }
  return best ? best.name : null;
}

/** A calendar title that is a consultation: it says so, or it names a consult-first service (consultServiceOf). */
export function isConsultationTitle(
  title: string | null | undefined,
  services: readonly { name: string }[] | undefined,
  rules: ConsultRules | null | undefined,
): boolean {
  const t = foldName(String(title ?? "").trim());
  if (!t) return false;
  if (t.includes("consult")) return true;
  return consultServiceOf(title, services, rules) !== null;
}

/**
 * Whether anything came back since a proposal went (0008): they wrote or called after it. `askedMs` is when the person
 * last did either. What "nothing back" is measured against, and what the Pipeline's "Heard back" says.
 */
export function heardSinceProposal(r: {
  deal: Pick<DealVM, "stage" | "sinceMs"> | null;
  askedMs: number | null;
}): boolean {
  const d = r.deal;
  return !!d && d.stage === "proposed" && d.sinceMs !== null && r.askedMs !== null && r.askedMs >= d.sinceMs;
}

/* ------------------------------------------------ a workspace's pace (0008, amended) */

/** A workspace's pace as the server reads it (00167 deal_pace): the median whole days from proposal to yes, and how many. */
export interface DealPaceDto {
  median_days: number | null;
  decided: number;
}

/** A workspace's pace once it has one: how long its proposals usually take to be decided, and when one is waiting. */
export interface DealPaceVM {
  medianDays: number;
  decided: number;
  /** How long a proposal out goes with nothing back before it waits on the owner (waitAfterDays). */
  waitDays: number;
  /** "Usually decided in 12 days". */
  words: string;
}

/**
 * The days a proposal out goes with nothing back before it waits on the owner: the workspace's pace and a fifth, kept
 * between three and thirty; a week where it has none.
 */
export function waitAfterDays(pace: Pick<DealPaceVM, "medianDays"> | null | undefined): number {
  if (!pace) return WAITING_AFTER_DAYS;
  return Math.min(30, Math.max(3, Math.round(pace.medianDays * 1.2)));
}

/** "Usually decided in 12 days", "Usually decided in a day", "Usually decided the same day". */
export function dealPaceWords(medianDays: number): string {
  if (medianDays === 0) return "Usually decided the same day";
  if (medianDays === 1) return "Usually decided in a day";
  return `Usually decided in ${medianDays} days`;
}

/** A workspace's pace: null until five of its proposals are decided, or where none was read. */
export function dealPaceOf(dto: DealPaceDto | null | undefined): DealPaceVM | null {
  if (!dto || typeof dto.median_days !== "number" || !Number.isFinite(dto.median_days)) return null;
  if (!(dto.decided >= PACE_AFTER_DECIDED)) return null;
  const medianDays = Math.max(0, Math.round(dto.median_days));
  return {
    medianDays,
    decided: dto.decided,
    waitDays: waitAfterDays({ medianDays }),
    words: dealPaceWords(medianDays),
  };
}

/**
 * The one rule for a proposal waiting (0006, 0008): out past the workspace's pace by a fifth -- a week while it has
 * none (waitAfterDays) -- with nothing back since it went. Today's leak, the Pipeline and the deal card all ask it,
 * one row at a time, and each hands it the workspace's pace: there is no pace a caller may leave out.
 */
export function waitingOnProposal(
  r: { deal: Pick<DealVM, "stage" | "sinceMs"> | null; askedMs: number | null },
  nowMs: number,
  pace: Pick<DealPaceVM, "medianDays"> | null,
): boolean {
  const d = r.deal;
  if (!d || d.stage !== "proposed" || d.sinceMs === null) return false;
  if (nowMs - d.sinceMs < waitAfterDays(pace) * DAY_MS) return false;
  return !heardSinceProposal(r);
}

/** Today's leak: the rows waiting on a proposal, by waitingOnProposal. */
export function proposalsWaiting<T extends { deal: DealVM | null; askedMs: number | null }>(
  rows: readonly T[],
  nowMs: number,
  pace: Pick<DealPaceVM, "medianDays"> | null,
): T[] {
  return rows.filter((r) => waitingOnProposal(r, nowMs, pace));
}

/**
 * Whether a consultation that ended at `endedMs` has had no proposal since (0008), given the person's deal: none on
 * file, or one that passed or ended before it, which the consultation then began again. An open deal has had its
 * proposal; a pass or an end at or after the consultation answered one. The one rule for the step not taken, which
 * the week's count (consultationsWithoutProposal) and the Calendar's peek (calendarPeekDeal) both ask.
 */
export function noProposalSince(deal: Pick<DealVM, "stage" | "sinceMs"> | null | undefined, endedMs: number): boolean {
  if (!deal) return true;
  if (dealIsOpen(deal)) return false;
  return deal.sinceMs !== null && deal.sinceMs < endedMs;
}

/**
 * The next step nobody has taken (0008): a consultation that ended in the last CONSULT_FOLLOW_DAYS days with no
 * proposal since (noProposalSince), the oldest first, a tie by name and then id, which is the order the Pipeline lists
 * them in and Today names its first two. `consultedMs` is when their last visit, a consultation, ended; a row without
 * a number there has no consultation to follow.
 */
export function consultationsWithoutProposal<
  T extends {
    id?: string;
    name?: string;
    consultedMs: number | null;
    deal: Pick<DealVM, "stage" | "sinceMs"> | null;
  },
>(rows: readonly T[], nowMs: number): T[] {
  const endOf = (r: T): number => r.consultedMs as number;
  return rows
    .filter((r) => {
      const at = r.consultedMs;
      if (typeof at !== "number" || !Number.isFinite(at)) return false;
      if (at > nowMs || nowMs - at > CONSULT_FOLLOW_DAYS * DAY_MS) return false;
      return noProposalSince(r.deal, at);
    })
    .sort(
      (a, b) =>
        endOf(a) - endOf(b) ||
        String(a.name ?? "").localeCompare(String(b.name ?? "")) ||
        String(a.id ?? "").localeCompare(String(b.id ?? "")),
    );
}

/**
 * Their count, in the one sentence the Pipeline's Consultations say it in and Today's row re-prints word for word:
 * "2 held in the last week, no proposal yet". The week is the rule's own (CONSULT_FOLLOW_DAYS).
 */
export function consultsHeldWords(n: number): string {
  return `${n} held in the last week, no proposal yet`;
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

/**
 * Reports (0004, 0008): one cohort -- the proposals sent in the period and what became of them -- and beside it the
 * stock, what stands now whenever it began: the clients with what they bring in a month, and the proposals still open.
 * Computed by the reports route from one read of the table and the People rows it already holds.
 */
export interface DealReportDto {
  /** Whether the section is drawn: deals are on here (dealsAreOn, 0008) and a deal was ever recorded. */
  any: boolean;
  /** The cohort: the proposals sent in the period, and of them how many became clients (an ended engagement too),
   *  passed, or are still waiting. */
  sent: number;
  won: number;
  lost: number;
  waiting: number;
  clients: number;
  /** The monthly total of running engagements: month amounts, plus year amounts over twelve; once excluded. */
  monthly_cents: number;
  /** The cohort's clients: whole days from the proposal to the yes, their median, rounded; null with none. */
  median_days_to_yes: number | null;
  /** Every proposal out now, whenever it went: how many, and the amount of each that carries one (amountTotalsWords). */
  open: { count: number; amounts: AmountFact[] };
  /** The cohort's clients by where their person first came from (people_list's came_from), most first. A client whose
   *  person says nothing, or is no longer in People, is counted in `won` and in no row here. */
  sources: { came_from: PersonCameFrom; count: number }[];
  /** The cohort's passes by the reason given, most first. No reason is not a reason: a pass without one is counted in
   *  `lost` and in no row here. */
  reasons: { reason: DealLostReason; count: number }[];
}

/** One of the cohort's outcomes as a bar, in the kit's BarList shape: its count, and its share of the cohort beside it. */
export interface DealOutcomeVM {
  id: "won" | "waiting" | "lost";
  label: string;
  value: number;
  /** "3  60%": the count, then its share of the proposals sent. */
  display: string;
}

/** Which fact a line says, so a page can key it. */
export type DealReportLineId = "median" | "sources" | "reasons" | "open";

export interface DealReportVM {
  present: boolean;
  /** "5 proposals went out in the last 30 days." */
  headline: string;
  /** "4 clients now · $7,500 a month." */
  stock: string;
  /** What became of the period's proposals, as bars out of the cohort's size: each outcome's count and its share,
   *  said there and nowhere else. Null when none went out. */
  outcomes: { title: string; max: number; rows: DealOutcomeVM[] } | null;
  /** Up to four sentences, each only when it has something to say: how long a yes took, where the new clients came
   *  from, why people passed, and what is still open. */
  lines: { id: DealReportLineId; text: string }[];
}

const DEAL_OUTCOMES_TITLE = "What became of the proposals";
/** The cohort's outcomes, in the order the bars draw them. */
const DEAL_OUTCOME_WORDS: Record<DealOutcomeVM["id"], string> = {
  won: "Became clients",
  waiting: "Still waiting",
  lost: "Passed",
};

/**
 * Where a new client came from, as the sources line says it: People's Came from (PERSON_CAME_FROM_WORDS) in a
 * sentence, since a column's labels cannot all follow "came from" ("Added by hand"); a lead is Leads, the page it was
 * found on. `n` is how many, for the one phrase that takes a verb of its own. Null for a value this build does not know.
 */
function cameFromSaid(key: PersonCameFrom, n: number): string | null {
  switch (key) {
    case "whatsapp":
      return "came from WhatsApp";
    case "sms":
      return "came by text";
    case "email":
      return "came by email";
    case "call":
      return "came by phone";
    case "calendar":
      return "came from your calendar";
    case "manual":
      return n === 1 ? "was added by hand" : "were added by hand";
    case "import":
      return "came from your imported history";
    case "lead":
      return "came from Leads";
    default:
      return null;
  }
}

/** Each reason as the reasons line says it, where the sheet's label will not stand in a sentence ("Went elsewhere was…"). */
const DEAL_LOST_REASON_SAID: Record<DealLostReason, string> = {
  price: "price",
  timing: "timing",
  elsewhere: "going elsewhere",
  no_reply: "no reply",
  not_a_fit: "not being a fit",
  other: "something else",
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Median 9 days to a yes."; one client's wait is theirs, not a median. */
function medianLine(days: number | null, clients: number): string | null {
  if (days === null || !clients) return null;
  const wait = days === 0 ? "under a day" : plural(days, "day", "days");
  return clients === 1 ? `${upper(wait)} to a yes.` : `Median ${wait} to a yes.`;
}

/** "2 of 3 new clients came from Leads.": the source the most of them share; "Your new client came by phone." for one. */
function sourcesLine(sources: DealReportDto["sources"], clients: number): string | null {
  if (!clients) return null;
  const top = sources
    .filter((s) => s.count > 0 && cameFromSaid(s.came_from, s.count) !== null)
    .sort((a, b) => b.count - a.count)[0];
  if (!top) return null;
  const said = cameFromSaid(top.came_from, top.count);
  return clients === 1 ? `Your new client ${said}.` : `${top.count} of ${clients} new clients ${said}.`;
}

/**
 * Why people passed, by the reason most of them gave (0008). No reason is not one: the line names only reasons given,
 * and says how many gave none only where that could change the answer (were they all the runner-up's, it would tie or
 * lead). A reason nobody else gave is said as the only one; a tie at the top names every reason in it.
 */
function reasonsLine(reasons: DealReportDto["reasons"], passed: number): string | null {
  const given = reasons.filter((r) => r.count > 0 && isDealLostReason(r.reason)).sort((a, b) => b.count - a.count);
  const said = given.reduce((s, r) => s + r.count, 0);
  if (!said || !passed) return null;
  const top = given[0].count;
  const tied = given.filter((r) => r.count === top);
  const names = upper(leadAnd(tied.map((r) => DEAL_LOST_REASON_SAID[r.reason])));
  const none = Math.max(0, passed - said);
  if (given.length === 1) {
    if (passed === 1) return `${names} was the reason given for passing.`;
    return `${names} was the ${none ? "only reason" : "reason"} given for passing, ${top} of ${passed}.`;
  }
  const runnerUp = given.find((r) => r.count < top)?.count ?? 0;
  const end = none > 0 && (tied.length > 1 || runnerUp + none >= top) ? `; ${none} gave no reason.` : ".";
  return tied.length > 1
    ? `${names} were the most common reasons for passing, ${top} each of ${passed}${end}`
    : `${names} was the most common reason for passing, ${top} of ${passed}${end}`;
}

/** "$4,250 still open across 3 proposals.": every proposal out now, and what those with an amount add up to. */
function openLine(open: DealReportDto["open"]): string | null {
  if (!open.count) return null;
  const worth = amountTotalsWords(open.amounts);
  if (!worth) return `${plural(open.count, "proposal", "proposals")} still open.`;
  return open.count === 1
    ? `${worth} still open in 1 proposal.`
    : `${worth} still open across ${open.count} proposals.`;
}

export function toDealReportVM(dto: DealReportDto | null | undefined, rangeLabel: string): DealReportVM {
  if (!dto || !dto.any) return { present: false, headline: "", stock: "", outcomes: null, lines: [] };
  const headline =
    dto.sent === 0
      ? `No proposals went out in the last ${rangeLabel}.`
      : `${plural(dto.sent, "proposal", "proposals")} went out in the last ${rangeLabel}.`;
  const monthly = dto.monthly_cents > 0 ? amountWords(dto.monthly_cents, "month") : null;
  const stock =
    dto.clients === 0
      ? "No clients right now."
      : `${plural(dto.clients, "client", "clients")} now${monthly ? ` · ${monthly}` : ""}.`;
  // Each outcome out of the proposals sent, so the three bars are the cohort and nothing else (0004).
  const outcomes =
    dto.sent === 0
      ? null
      : {
          title: DEAL_OUTCOMES_TITLE,
          max: dto.sent,
          rows: (["won", "waiting", "lost"] as const).map((id) => ({
            id,
            label: DEAL_OUTCOME_WORDS[id],
            value: dto[id],
            display: `${dto[id]}  ${Math.round((dto[id] / dto.sent) * 100)}%`,
          })),
        };
  const said: [DealReportLineId, string | null][] = [
    ["median", medianLine(dto.median_days_to_yes, dto.won)],
    ["sources", sourcesLine(dto.sources, dto.won)],
    ["reasons", reasonsLine(dto.reasons, dto.lost)],
    ["open", openLine(dto.open)],
  ];
  const lines = said.flatMap(([id, text]) => (text ? [{ id, text }] : []));
  return { present: true, headline, stock, outcomes, lines };
}
