/**
 * The period line at the foot of the day's card (today-day.ts): the last seven, thirty or ninety days in one
 * sentence, every number one Reports prints. `ReportsLike` is also what Worth a look reads (today-leaks.ts).
 */

/* -------------------------------- the period ------------------------------ */

/** A Reports tile as Reports builds it; the page draws it with Reports' own component. */
export interface WeekTileLike {
  id: string;
  label: string;
  value: string;
  meta: string;
  delta: { text: string; tone: "pos" | "neg" | "" } | null;
  spark: number[];
  /** The period before, in counts ("up from 99"), as Reports says it; null with nothing to compare. */
  compare?: string | null;
}
/** What the Reports surface publishes, as far as Today reads it. */
export interface ReportsLike {
  vm: {
    days: number;
    rangeLabel: string;
    since: string;
    until: string;
    empty: boolean;
    tiles: WeekTileLike[];
    /** Who answered the period's customer messages: `none` is the number nobody ever answered. */
    answered?: { totals: { in: number; ai: number; you: number; none: number }; share?: number | null };
    /** Why the receptionist stopped, most common first — the period's "driven by". */
    reasons?: Array<{ id: string; label: string; value: number }>;
    /** The reply time as Reports computes it; the period line says the median once. */
    replyTime?: { count: number; medianLabel: string };
    /** Reports' own words for the period ("Last 7 days"), so the foot line never spells them a second time. */
    period?: { now: string };
    /** Reports' own count of the period's calls: a number, never a tile's formatted value. */
    calls?: { total: number };
  };
  /** Null: the offers' read failed on its own and the receptionist's own numbers still stand (the bridge's D9 catch). */
  campaigns: { tiles: WeekTileLike[]; empty: boolean } | null;
  booking: { present: boolean; headline: string; sub: string; pct: number | null; asked?: number; booked?: number };
}

/**
 * The last seven (or thirty, or ninety) days in one sentence at the foot of the day's card, with a door to Reports,
 * which was rebuilt on 19 September to carry exactly this material. Every number is one Reports prints, read from the
 * view model Reports itself draws and never derived a second time here: its period words (`period.now`), the messages
 * tile's comparison in counts, its `answered.share` rounded as its tile rounds it, its `calls.total`. Not its median
 * reply: that is Reports' own figure, and with it the foot ran three lines on a phone (22 Sep). "Messages", not
 * "customer messages": the card's figure above already says whose. It never reads `campaigns`: that read fails on its
 * own (#686), and a period line that dereferenced it took the whole page down.
 */
export function todayPeriodLine(r: ReportsLike | null): { text: string; to: "reports" } | null {
  if (!r || !r.vm) return null;
  const v = r.vm;
  const lead = v.period?.now ?? `Last ${v.rangeLabel}`;
  if (v.empty) return { text: `${lead}: nobody wrote or called.`, to: "reports" };
  const a = v.answered;
  if (!a) return null;
  const messages = v.tiles.find((t) => t.id === "messages");
  const parts = [
    `${a.totals.in} message${a.totals.in === 1 ? "" : "s"}${messages?.compare ? ` (${messages.compare})` : ""}`,
  ];
  if (a.share !== undefined && a.share !== null)
    parts.push(`${Math.round(a.share * 100)}% answered by the receptionist`);
  const callCount = v.calls ? v.calls.total : 0;
  if (callCount) parts.push(`${callCount} call${callCount === 1 ? "" : "s"}`);
  return { text: `${lead}: ${parts.join(", ")}.`, to: "reports" };
}
