/**
 * Reports' Deals section (0004, 0008): the proposals sent in the period and what became of them, beside what
 * stands now, said as a headline, a stock line, the outcome bars and up to four sentences. The amounts are
 * deal-amount.ts's; the wait for a yes is said as deal-waits.ts says it.
 */
import { leadAnd } from "../leads/leads";
import { plural } from "../shared/words";
import type { PersonCameFrom } from "../people/person-words";
import { isDealLostReason, type DealLostReason } from "./deal-words";
import { amountTotalsWords, amountWords, type AmountFact } from "./deal-amount";
import { yesWaitWords } from "./deal-waits";

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

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Median 9 days to a yes."; one client's wait is theirs, not a median. */
function medianLine(days: number | null, clients: number): string | null {
  if (days === null || !clients) return null;
  const wait = yesWaitWords(days);
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
