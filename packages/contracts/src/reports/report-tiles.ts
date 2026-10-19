/**
 * The tiles of a report, and the words that compare them (moved out of reports.ts, which the file-length ratchet holds to 800
 * lines): a number over the period, what it is, a line under it, and the period before beside it. A tile names the figure it
 * says, by one id, where its builder builds it (`metric`): a closed set, so a tile that says what no id names is a compile
 * error rather than a lookup that falls back, and the id is what the figure is called wherever it is read (the page's
 * figures today; a definition's tooltip, Ask's block and the headline of a later phase). Not prefixed by a lens: a tile moves
 * between lenses (the lenses spec, D18) and its id does not. The receptionist's tiles are built here; the campaigns' (the lens's
 * strip) and Google's are built where their reports are, and name their figures from this same set.
 */
import type { BookingReportVM } from "./booking-report";
import { durationWords } from "../shared/clock";
import { pct } from "../shared/numbers";
import { plural } from "../shared/words";
import { holdNote } from "./report-speed";
import type { PeriodFacts } from "./reports";

/** Every figure a tile says. */
export type ReportMetric =
  | "customer_messages"
  | "answered_share"
  | "reply_median"
  | "handovers"
  | "calls"
  | "new_people"
  | "booked"
  | "delivered_share"
  | "said_yes"
  | "asked_to_stop"
  | "rating"
  | "reviews"
  | "ratings_gained"
  | "newest_review"
  | "reviews_written"
  | "reviews_answered"
  | "review_reply_time"
  | "handover_first_reply"
  | "handover_settled"
  | "missed_calls_answered"
  | "answered_while_closed"
  | "waiting_on_you"
  | "call_backs"
  | "replies_held_back"
  | "people_reached"
  | "yeses_won"
  | "stops_recorded"
  | "steps_overdue"
  | "steps_due_today"
  | "email_stopped_now"
  | "said_yes_messages"
  | "can_receive_offers"
  | "opted_out_now"
  | "quiet_now"
  | "emails_written"
  | "emails_landed"
  | "emails_bounced"
  | "people_sent_to"
  | "people_wrote_back"
  | "runs_waiting"
  | "runs_failed"
  | "campaign_replies_waiting"
  | "templates_paused"
  | "number_health";

/**
 * The fewest a ratio is of for it to say anything (the reports lenses spec, D9): a share or a median of fewer than this is
 * greyed and says how few it is of. One number for every lens; the reviews' reply time keeps its own, smaller, minimum.
 */
export const REPORT_MIN_N = 5;

/**
 * Whether a share is of some, but too few, to say anything (D9): a count above none and under the fewest (`minN`: REPORT_MIN_N, or
 * the ratio's own where it keeps one, as the reviews' reply time does; required, so a caller names the minimum it judges by).
 * Of none there is no ratio to grey, and its line says why. The one predicate for the kit's greyed Figure, a bar of a rate,
 * and what Ask leaves unsaid, so the three never part.
 */
export const isThinShare = (n: number, minN: number): boolean => n > 0 && n < minN;

/**
 * A share as a lens says it where it is written, not drawn (D9): of five or more a percentage, under that the count it is of
 * ("3 of 4"), and of nothing none at all (`share` is null: a dash with words is the caller's). A percentage of fewer than five
 * is never said. The one spelling for a channel's delivered share, a source's, and Ask's.
 */
export const shareSaid = (share: number | null, count: number, of: number): string | null =>
  share === null ? null : of >= REPORT_MIN_N ? `${share}%` : `${count} of ${of}`;

export interface ReportTileVM {
  id: string;
  /** The figure this tile says: one id, declared by the builder of the tile. */
  metric: ReportMetric;
  label: string;
  value: string;
  meta: string;
  /** Signed change against the previous period, or null when there is no
   *  prior data to compare with (never a fabricated 0%). Ask reads it. */
  delta: { text: string; tone: "pos" | "neg" | "" } | null;
  /** One point per day of the current period (Ask and Today read these). */
  spark: number[];
  /** The period before, in counts ("up from 99"); null when there is nothing to compare with. */
  compare: string | null;
  /** The work page the number opens, as a route ("inbox"): the people or the messages it counts. Set where there is one. */
  door?: string;
  /** What a ratio is of (the replies a median was counted over); set on a ratio, with `minN`, and on no count. */
  n?: number;
  /** The fewest `n` that say anything (REPORT_MIN_N): a ratio of fewer is greyed on the page. */
  minN?: number;
  /**
   * What the number is, where it is not plain ink (the reports lenses spec, D10): `warn` for what needs you (steps overdue),
   * `fail` for what failed (email that stopped working). On the value alone, never its change; set on no tile but those.
   */
  tone?: "warn" | "fail";
}

/** A duration in an owner's words (durationWords), or a dash where there is none. */
export function fmtSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  return durationWords(s);
}

/**
 * Signed change vs the previous period. Null when the previous period has
 * nothing to compare against: "+∞%" and "vs 0" are not information.
 * `upIsGood` decides the tone; a change of zero has none.
 */
export function deltaOf(current: number, previous: number, upIsGood: boolean, noun: string): ReportTileVM["delta"] {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: `same as the prior ${noun}`, tone: "" };
  const up = pct > 0;
  return { text: `${up ? "+" : ""}${pct}% vs prior ${noun}`, tone: up === upIsGood ? "pos" : "neg" };
}

/**
 * A share against the prior period's share, in percentage points — never a
 * percentage of a percentage, and null when either period has nothing to
 * take a share of.
 */
export function pointsDelta(current: number | null, previous: number | null, noun: string): ReportTileVM["delta"] {
  if (current === null || previous === null) return null;
  const pts = current - previous;
  if (pts === 0) return { text: `same share as the prior ${noun}`, tone: "" };
  return { text: `${pts > 0 ? "+" : ""}${pts} pts vs prior ${noun}`, tone: pts > 0 ? "pos" : "neg" };
}

/** "the 30 days before"; one day is "the day before", for a count of one is no number to say (Month on the 1st). */
export const beforeWords = (rangeLabel: string): string =>
  `the ${rangeLabel === plural(1, "day") ? "day" : rangeLabel} before`;

/**
 * A count against the period before, in counts: "up from 99", "down from 23", "same as the 30 days before", and
 * "none the 30 days before" when the period before had people reaching the business but none of this. Null when
 * the period before had no customer message and no call at all (a workspace too young to compare), and when both
 * are zero (nothing against nothing says nothing). Never a percentage: #557 took those out because they lied on
 * small counts.
 */
export function compareWords(
  current: number,
  previous: number,
  rangeLabel: string,
  priorHadAny: boolean,
): string | null {
  if (!priorHadAny || (current === 0 && previous === 0)) return null;
  if (previous === 0) return `none ${beforeWords(rangeLabel)}`;
  if (current === previous) return `same as ${beforeWords(rangeLabel)}`;
  return `${current > previous ? "up" : "down"} from ${previous}`;
}

/**
 * A share against the period before's share, in words: "was 88% the 30 days before". The period before's share only where
 * that period had five or more to take it of (REPORT_MIN_N), else the count it is of in the same place ("was 2 of 3 the 30
 * days before", as shareSaid says it): a share of fewer than five is never said, in a period before any more than in this one
 * (D9). The figure's own label says what is counted ("Delivered", "Wrote back"), so neither form repeats it. None where this
 * period or the period before has nothing to take a share of (`nowOf`, `was.of`), so there is nothing to set beside it. The one
 * rule for the Campaigns lens's Delivered and Wrote back and for the Reach-outs' Landed.
 */
export function shareWasWords(nowOf: number, was: { part: number; of: number }, rangeLabel: string): string | null {
  if (nowOf === 0) return null;
  const said = shareSaid(pct(was.part, was.of), was.part, was.of);
  return said === null ? null : `was ${said} ${beforeWords(rangeLabel)}`;
}

/**
 * Messages answered, as a count of the messages sent: "9 of 24 were answered", "1 of 3 was answered". A message is answered and
 * a person writes back: the Campaigns lens says each message's rate this way, and the Overview's fact of the campaign that drew
 * the most replies says it as the lens does; "wrote back" is left to the people (the lens's strip and head).
 */
export const messagesAnsweredWords = (answered: number, of: number): string =>
  `${answered} of ${of} ${answered === 1 ? "was" : "were"} answered`;

/**
 * The People lens's head until its own read lands, and when it says nothing: how many new people reached the business,
 * against the period before where that was lived in (priorHadAny, as compareWords has it). A quiet period has a sentence
 * too ("Nobody new reached you"): the head is never empty.
 */
export function newPeopleLine(newNow: number, newBefore: number, rangeLabel: string, priorHadAny: boolean): string {
  if (newNow === 0) return "Nobody new reached you in this period.";
  const reached = `${plural(newNow, "new person", "new people")} reached you`;
  if (!priorHadAny) return `${reached}.`;
  return `${reached} (${newBefore === 0 ? "none" : newBefore} ${beforeWords(rangeLabel)}).`;
}

/** A tile: a number over the period, what it is, a line under it, and the period before beside it. */
type ReportTile = (f: PeriodFacts) => ReportTileVM;

const messagesTile: ReportTile = ({ days, current, points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "messages",
  metric: "customer_messages",
  label: "Customer messages",
  value: String(tot.in),
  meta: tot.in
    ? `on ${current.filter((d) => d.messages_in > 0).length} of ${plural(days, "day")}`
    : "none in this period",
  delta: deltaOf(tot.in, prev.in, true, noun),
  spark: points.map((p) => p.in),
  compare: compareWords(tot.in, prev.in, rangeLabel, priorHadAny),
  door: "conversations",
});

const answeredTile: ReportTile = ({ points, tot, noun, answeredTotal, aiShare, prevShare }) => ({
  id: "answered",
  metric: "answered_share",
  label: "Receptionist answered",
  value: aiShare === null ? "—" : `${aiShare}%`,
  meta: answeredTotal
    ? `${tot.ai} of ${answeredTotal} · ${tot.you} by you · ${tot.none} unanswered`
    : "nothing to answer",
  // A share compares in POINTS. Against counts, the share could fall from
  // 100% to 60% while the delta read +20% in green.
  delta: pointsDelta(aiShare, prevShare, noun),
  spark: points.map((p) => p.ai),
  compare: null,
  // A share of the messages that wanted an answer: of few, it says nothing (the page greys it).
  n: answeredTotal,
  minN: REPORT_MIN_N,
});

const replyTile: ReportTile = ({ sortedReply, median, p90, hold }) => ({
  id: "reply",
  metric: "reply_median",
  label: "Median reply time",
  value: fmtSeconds(median),
  // The reply time includes the hold the owner set, and says so where replies waited one (spec D14).
  meta: sortedReply.length
    ? `slowest tenth ${fmtSeconds(p90)} · ${sortedReply.length} replies${holdNote(hold)}`
    : "no receptionist replies yet",
  delta: null,
  spark: [],
  compare: null,
  // A median of the replies counted: of few, it says nothing (the page greys it).
  n: sortedReply.length,
  minN: REPORT_MIN_N,
});

const neededTile: ReportTile = ({ points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "needed",
  metric: "handovers",
  label: "Needed you",
  value: String(tot.escalations),
  meta: tot.escalations ? "times the receptionist stopped" : "the receptionist never stopped",
  delta: deltaOf(tot.escalations, prev.escalations, false, noun),
  spark: points.map((p) => p.escalations),
  compare: compareWords(tot.escalations, prev.escalations, rangeLabel, priorHadAny),
  door: "inbox",
});

const callsTile: ReportTile = ({ dto, points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "calls",
  metric: "calls",
  label: "Calls",
  value: String(tot.calls),
  meta: tot.calls
    ? `${Math.max(1, Math.round(tot.callSeconds / 60))} min on the phone · ${dto.voicemail ?? 0} to voicemail`
    : "no calls",
  delta: deltaOf(tot.calls, prev.calls, true, noun),
  spark: points.map((p) => p.calls),
  compare: compareWords(tot.calls, prev.calls, rangeLabel, priorHadAny),
});

const peopleTile: ReportTile = ({ points, tot, prev, noun, rangeLabel, priorHadAny }) => ({
  id: "people",
  metric: "new_people",
  label: "New people",
  value: String(tot.newPeople),
  meta: tot.newPeople ? "first got in touch in this period" : "nobody new",
  delta: deltaOf(tot.newPeople, prev.newPeople, true, noun),
  spark: points.map((p) => p.newPeople),
  compare: compareWords(tot.newPeople, prev.newPeople, rangeLabel, priorHadAny),
});

/** The six tiles, in the order the view model has always listed them. */
export const REPORT_TILES: readonly ReportTile[] = [
  messagesTile,
  answeredTile,
  replyTile,
  neededTile,
  callsTile,
  peopleTile,
];

/** What the page's strip draws of a tile: its figure, its words, the period before beside it, and the page it opens, the count it is of and the tone of its number where it has them. */
export type ReportStripTile = Pick<
  ReportTileVM,
  "id" | "metric" | "label" | "value" | "meta" | "compare" | "door" | "n" | "minN" | "tone"
>;

/** What the Booked tile says, under its dash, for days that ended before today: the reason booking-report's BOOKED_NEEDS_TODAY gives, in a tile's few words. */
export const BOOKED_ENDED_META = "not counted for days that have ended: it follows people as they stand today";

/** Booked, from the calendar: a count where one was read, and why there is none where not (moved from the page's strip). */
export function bookedTileOf(booking: BookingReportVM | null): ReportStripTile {
  const tile = { id: "booked", metric: "booked", label: "Booked", compare: null } as const;
  // Days that ended before today are never counted (it follows people as they stand today): that is not a missing link.
  if (booking?.calendar === "ended") return { ...tile, value: "—", meta: BOOKED_ENDED_META };
  if (booking && booking.present)
    return {
      ...tile,
      value: String(booking.booked),
      meta: booking.asked ? `of ${booking.asked} who asked` : "nobody asked",
    };
  return {
    ...tile,
    value: "—",
    meta: booking && booking.calendar === "unavailable" ? "the calendar could not be read" : "no calendar link",
  };
}
