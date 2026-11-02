/**
 * Need you's groups (the redesign of 1 Nov 2026): the queue's rows (today-queue.ts) said by what each asks of you and
 * where it stands. One thing is Up next: the first in Need you's order (needYouOrder), which is what is worth most to
 * the business now. A row with a clock first (a reply your receptionist sends on its own, a reply window that shuts
 * within two hours), since a window that shuts cannot be answered later and an old wait still can; then whoever has
 * waited under a week, by what their row is worth (a booking, a call back, a lead's reply to a reach-out, then the
 * rest), the longest wait first among equals. The rest of the people wait on you in that order; a search waiting for an
 * answer waits for your OK, with the runs the page adds there; whoever has waited past a week is folded at the end. A
 * call worth a listen and a lead who tried their preview are Ask found's, worth a look and nobody waiting on you.
 *
 * Pure: the page and the tests read the same groups. The rows come sorted (todayQueue), so each group keeps their order.
 */
import { DAY_MS, HOUR_MS } from "../shared/time";
import type { TodayQueueRowVM } from "../today/today-vm";

/** What a row asks of you: the filters the strip over Need you offers, each one of these. */
export type NeedYouVerb = "reply" | "call" | "approve";

/** Where a row stands in Need you. */
export type NeedYouGroupId = "next" | "waiting" | "ok" | "old";

/** A row with a clock this near is Up next, before any wait: two hours, the closing window's own warning. */
export const NEED_YOU_CLOCK_MS = 2 * HOUR_MS;

/** A wait this long is folded at the end, Over a week, where Mark all done lets it go. */
export const NEED_YOU_OLD_MS = 7 * DAY_MS;

/** The row's facts the groups read. */
type GroupRow = Pick<TodayQueueRowVM, "kind" | "act" | "clock_ms" | "waitedMs" | "booking">;

/**
 * What a row asks of you: a call back, or a hold whose reason asks for one, is a call; a search waiting for an answer is
 * yours to approve, as a run is; every other person is a reply. Null for what nobody waits on: a call worth a listen, a
 * lead who tried their preview, a step and a visit to mark (To do's).
 */
export function needYouVerbOf(r: Pick<TodayQueueRowVM, "kind" | "act">): NeedYouVerb | null {
  if (r.kind === "callback" || (r.kind === "handoff" && r.act === "call_back")) return "call";
  if (r.kind === "search") return "approve";
  if (r.kind === "handoff" || r.kind === "window" || r.kind === "reply" || r.kind === "held") return "reply";
  return null;
}

/** Whether a row's clock is near enough to put it before every wait: it shuts, or goes, within two hours. */
export const clockIsNear = (r: Pick<TodayQueueRowVM, "clock_ms">): boolean =>
  typeof r.clock_ms === "number" && r.clock_ms <= NEED_YOU_CLOCK_MS;

/** Whether a row has waited past a week, which folds it at the end (a reply that goes on its own never has). */
const waitedPastAWeek = (r: Pick<TodayQueueRowVM, "kind" | "waitedMs">): boolean =>
  r.kind !== "held" && r.waitedMs >= NEED_YOU_OLD_MS;

/**
 * What a row is worth to the business beside the others, the most first (2 Nov 2026: "rank by value"): someone asking to
 * book (a time they picked, or an ask for one), then a call back, then a lead who answered a reach-out, then anyone else
 * waiting on a word, with a search waiting for your answer by its wait among them (the sweep stops it after a day), and
 * what Ask found last.
 */
function needYouWorthOf(r: Pick<TodayQueueRowVM, "kind" | "act" | "booking">): number {
  if (r.booking || r.act === "confirm") return 0;
  const verb = needYouVerbOf(r);
  if (verb === "call") return 1;
  if (r.kind === "reply") return 2;
  return verb ? 3 : 4;
}

/**
 * Need you's order, the queue's and Up next's: a clock near enough first, the nearest before the rest; then the waits
 * under a week before those past it; then what each is worth (needYouWorthOf); the longest wait first among equals.
 */
export function needYouOrder(a: GroupRow, b: GroupRow): number {
  const near = Number(clockIsNear(b)) - Number(clockIsNear(a));
  if (near) return near;
  if (clockIsNear(a)) return (a.clock_ms ?? 0) - (b.clock_ms ?? 0);
  const old = Number(waitedPastAWeek(a)) - Number(waitedPastAWeek(b));
  if (old) return old;
  const worth = needYouWorthOf(a) - needYouWorthOf(b);
  if (worth) return worth;
  return b.waitedMs - a.waitedMs;
}

/** Need you's rows by where each stands, each group in the queue's order; Ask found's apart. */
export interface NeedYouGroups<T> {
  next: T[];
  waiting: T[];
  ok: T[];
  old: T[];
  /** A call worth a listen and a lead who tried their preview: Ask found's, never in Need you's count. */
  found: T[];
}

/**
 * The rows by where each stands. Up next is one row (a reply that goes on its own first, then the first in Need you's
 * order), the people after it wait on you or, past a week, are folded at the end, and a search waits for your OK. Asked
 * again over the same rows it answers the same, so a row acted on this visit, kept where it stood, stays in its group.
 */
export function needYouGroupsOf<T extends GroupRow>(rows: readonly T[]): NeedYouGroups<T> {
  const people = rows.filter((r) => {
    const verb = needYouVerbOf(r);
    return verb === "reply" || verb === "call";
  });
  const next = people.find((r) => r.kind === "held") ?? [...people].sort(needYouOrder)[0] ?? null;
  const rest = people.filter((r) => r !== next);
  return {
    next: next ? [next] : [],
    waiting: rest.filter((r) => r.waitedMs < NEED_YOU_OLD_MS || clockIsNear(r)),
    ok: rows.filter((r) => needYouVerbOf(r) === "approve"),
    old: rest.filter((r) => r.waitedMs >= NEED_YOU_OLD_MS && !clockIsNear(r)),
    found: rows.filter((r) => r.kind === "call" || r.kind === "tried"),
  };
}

/** The clock in a row's words, after "closes" or "sends": "11:52 AM" from "closes 11:52 AM · in 1h 38m". */
const windowClockOf = (when: string): string => when.replace(/^closes /, "").split(" · ")[0] ?? when;

/**
 * How long a row has waited, or when its clock runs out, in the few words beside its name: "3h", "6d", "closes 11:52 AM";
 * `long` where it should be seen (the amber ink): a wait past a day, or a clock near enough to put the row first. A reply
 * your receptionist sends on its own says so, since its seconds are its row's to count. Null where the row has nothing to
 * say there.
 */
export function needYouWaitOf(
  r: Pick<TodayQueueRowVM, "kind" | "when" | "waitedMs" | "clock_ms">,
  goesAlone: string,
): { words: string; long: boolean } | null {
  if (r.kind === "held") return { words: goesAlone, long: true };
  if (r.kind === "window") return { words: `closes ${windowClockOf(r.when)}`, long: clockIsNear(r) };
  if (!r.when) return null;
  if (!r.when.startsWith("waited ")) return { words: r.when, long: false };
  return { words: r.when.slice("waited ".length), long: r.waitedMs >= DAY_MS || clockIsNear(r) };
}
