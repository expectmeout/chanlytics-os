/**
 * Need you's groups (the redesign of 1 Nov 2026): the queue's rows (today-queue.ts) said by what each asks of you and
 * where it stands. One thing is Up next: the first row with a clock (a reply your receptionist sends on its own, a reply
 * window that shuts within two hours), else the oldest who has waited under a week, since a window that shuts cannot be
 * answered later and an old wait still can. The rest of the people wait on you, oldest first; a search waiting for an
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
type GroupRow = Pick<TodayQueueRowVM, "kind" | "act" | "clock_ms" | "waitedMs">;

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
 * The rows by where each stands. Up next is one row (a reply that goes on its own first, then the nearest clock, else the
 * oldest under a week, else the first of the rest), the people after it wait on you or, past a week, are folded at the
 * end, and a search waits for your OK. Asked again over the same rows it answers the same, so a row acted on this visit,
 * kept where it stood, stays in its group.
 */
export function needYouGroupsOf<T extends GroupRow>(rows: readonly T[]): NeedYouGroups<T> {
  const people = rows.filter((r) => {
    const verb = needYouVerbOf(r);
    return verb === "reply" || verb === "call";
  });
  const next =
    people.find((r) => r.kind === "held") ??
    people.find(clockIsNear) ??
    people.find((r) => r.waitedMs < NEED_YOU_OLD_MS) ??
    people[0] ??
    null;
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
