/**
 * A deal is a record (docs/decisions/0004-deals-record.md).
 *
 * One engagement a person is deciding on or has taken: a proposal out, a
 * client, passed, ended. Everything a page or a receptionist says about one
 * is derived here, once: the words, the line, the chip, the moves the
 * person's page offers, the sentence the receptionist hears, Today's leak,
 * Reports' cohort. Pure.
 */
import { foldName, needsConsultation, type ConsultRules } from "./availability";
import { clockDate } from "./clock";
import type { SchemaSet } from "./schema-sets";

export const DEAL_STAGES = ["proposed", "won", "lost", "ended"] as const;
export type DealStage = SchemaSet<"deals.stage">;
export const DEAL_PERS = ["once", "month", "year"] as const;
export type DealPer = SchemaSet<"deals.per">;
export const DEAL_SOURCES = ["person", "payment"] as const;
export type DealSource = SchemaSet<"deals.source">;

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

const DAY_MS = 86_400_000;

export function isDealStage(s: unknown): s is DealStage {
  return typeof s === "string" && (DEAL_STAGES as readonly string[]).includes(s);
}

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
  /** "Proposal out · since Sep 12", "Client · since Oct 1 · $2,500 a month": the stage and its facts, without the service. */
  said: string;
  /** The service in front of `said`, for a line that stands alone. */
  line: string;
  /** Everything but the stage's word: "Ad management · since Oct 1 · $2,500 a month", under `word` on the card's row. */
  facts: string;
  /** The chip beside the wires and the row's second line: "Proposal out · 6 d", "Client · Ad management"; null where the visit says more. */
  brief: string | null;
  /** Days since the proposal went, for a proposal out; null otherwise. */
  waitingDays: number | null;
  /** The client's amount in words; null for every other stage and without one. */
  amount: string | null;
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
  const amount = d.stage === "won" ? amountWords(d.amount_cents, d.per, d.currency ?? "USD") : null;
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
  };
}

/** The People row's deal, from its columns; null where none. */
export function dealOf(r: Partial<DealColumns> | null | undefined, tz: string, nowMs: number): DealVM | null {
  const f = dealFactsOf(r);
  return f ? toDealVM({ ...f, id: r?.deal_id ?? null }, tz, nowMs) : null;
}

/** A move the person's page offers: where it goes, its words, and whether it moves the row it was pressed on or starts a new one. */
export interface DealMove {
  to: DealStage;
  label: string;
  sameRow: boolean;
}

/** From each stage, the moves in the order the page draws them. An ended engagement is re-signed as a new row. */
export const DEAL_MOVES: Record<DealStage | "none", readonly DealMove[]> = {
  none: [{ to: "proposed", label: "Proposal sent", sameRow: false }],
  proposed: [
    { to: "won", label: "Became a client", sameRow: true },
    { to: "lost", label: "Passed", sameRow: true },
  ],
  won: [{ to: "ended", label: "Ended", sameRow: true }],
  lost: [{ to: "proposed", label: "Proposal sent again", sameRow: true }],
  ended: [{ to: "proposed", label: "Proposal sent", sameRow: false }],
};

export function dealMoves(d: DealVM | null): readonly DealMove[] {
  return DEAL_MOVES[d ? d.stage : "none"];
}

/**
 * The sentence the receptionist hears about this person's deal, beside the
 * owner's note (describeLead). One per stage; never an amount; nothing
 * without a deal. Channel-neutral: "hand over" is what both do. Where the
 * person has a proposal link on file (contacts.proposal_url, 00154), that
 * link's own rule stands for a price question, so the proposal's sentence
 * points at it instead of promising a follow-up.
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

/** Whether the workspace's profile or its records make deals a thing here: the person's page draws its section, People its lists. */
export function dealsAreAThing(consultFirst: readonly string[] | undefined, anyDeal: boolean): boolean {
  return anyDeal || (Array.isArray(consultFirst) && consultFirst.length > 0);
}

/** Today's leak: proposals out past a week with nothing back since they went. `askedMs` is when the person last wrote or called. */
export function proposalsWaiting<T extends { deal: DealVM | null; askedMs: number | null }>(
  rows: readonly T[],
  nowMs: number,
): T[] {
  return rows.filter((r) => {
    const d = r.deal;
    if (!d || d.stage !== "proposed" || d.sinceMs === null) return false;
    if (nowMs - d.sinceMs < WAITING_AFTER_DAYS * DAY_MS) return false;
    return r.askedMs === null || r.askedMs < d.sinceMs;
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
};

/** Reports: one cohort (the proposals sent in the period) and the stock (clients now). Computed by the reports route from the table. */
export interface DealReportDto {
  /** Whether any deal was ever recorded here: the section is drawn only then. */
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
