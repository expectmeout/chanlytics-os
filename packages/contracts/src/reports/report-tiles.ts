/**
 * The tiles of a report, and the words that compare them (moved out of reports.ts, which the file-length ratchet holds to 800
 * lines): a number over the period, what it is, a line under it, and the period before beside it. A tile names the figure it
 * says, by one id, where its builder builds it (`metric`): a closed set, so a tile that says what no id names is a compile
 * error rather than a lookup that falls back, and the id is what the figure is called wherever it is read (the page's
 * figures today; a definition's tooltip, Ask's block and the headline of a later phase). Not prefixed by a lens: a tile moves
 * between lenses (the lenses spec, D18) and its id does not. The receptionist's tiles are built here; the campaigns' and
 * Google's are built where their reports are, and name their figures from this same set.
 */
import type { BookingReportVM } from "../calendar/calendar-people";
import { durationWords } from "../shared/clock";
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
  | "messages_sent"
  | "delivered_share"
  | "replied_share"
  | "said_yes"
  | "asked_to_stop"
  | "rating"
  | "reviews"
  | "ratings_gained"
  | "newest_review"
  | "reviews_written"
  | "reviews_answered"
  | "review_reply_time";

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
  meta: tot.newPeople ? "first contact in this period, by evidence" : "nobody new",
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

/** What the page's strip draws of a tile: its figure, its words, and the period before beside it. */
export type ReportStripTile = Pick<ReportTileVM, "id" | "metric" | "label" | "value" | "meta" | "compare">;

/** Booked, from the calendar: a count where one was read, and why there is none where not (moved from the page's strip). */
export function bookedTileOf(booking: BookingReportVM | null): ReportStripTile {
  const tile = { id: "booked", metric: "booked", label: "Booked", compare: null } as const;
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
