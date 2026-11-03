/**
 * Need you's groups (Today in three zones, 2 Nov 2026): the queue's rows (today-queue.ts) said by what each asks of you
 * and where it stands. One thing is Up next: the first in Need you's order (needYouOrder), which is what is worth most to
 * the business now. A row with a clock first (a reply your receptionist sends on its own, a reply window that shuts
 * within two hours), since a window that shuts cannot be answered later and an old wait still can; then whoever has
 * waited under a week, by what their row is worth (a reply that never reached them, a booking, a call back, a lead's
 * reply to a reach-out, then the rest), the longest wait first among equals. The rest of the people wait on you in that
 * order, five drawn; a search waiting for an answer waits for your OK, with the runs the page adds there, three drawn;
 * whoever has waited past a week is Older, one row at the end, and nobody counts them twice: the one count is the rows
 * above To do (needYouCountOf), which the badge, the tabs, the title and the head say. A call worth a listen and a lead
 * who tried their preview are Ask found's, worth a look and nobody waiting on you.
 *
 * Pure: the page and the tests read the same groups. The rows come sorted (todayQueue), so each group keeps their order.
 */
import type { DecisionVerb } from "../shared/enums";
import { DAY_MS, HOUR_MS } from "../shared/time";
import type { TodayQueueRowVM } from "../today/today-vm";

/** What a row asks of you: a reply, a call, or your OK. */
export type NeedYouVerb = "reply" | "call" | "approve";

/** Where a row stands in Need you. */
export type NeedYouGroupId = "next" | "waiting" | "ok" | "old";

/** A row with a clock this near is Up next, before any wait: two hours, the closing window's own warning. */
export const NEED_YOU_CLOCK_MS = 2 * HOUR_MS;

/** A wait this long is Older, one row at the end, where Mark all done lets it go, and out of the count. */
export const NEED_YOU_OLD_MS = 7 * DAY_MS;

/**
 * How many rows each group draws (the canvas of 2 Nov 2026, "caps by group, not six in all"): who waits on you, five;
 * what waits for your OK, three; your own to-dos, three. Up next is one row and Older one. The foot says what is past
 * them and opens the Inbox; the count is every row, drawn or not.
 */
export const NEED_YOU_CAPS = { waiting: 5, ok: 3, todo: 3 } as const;

/**
 * The members' decisions "N done today" counts, by Need you's door (Today in three zones, 2 Nov 2026): a reply sent, a
 * draft approved or a run's OK, a hold closed or handed back, a visit marked, a review answered, a time asked for by text
 * answered. Each subject once a day, however often it moved, and none taken back (db waiting-on-you.ts todayDoneCount).
 * Each a verb the decisions ledger keeps (DECISION_VERBS), or the count would read nothing for it and say so to nobody.
 */
export const NEED_YOU_DONE_VERBS = [
  "reply",
  "approve",
  "resolve",
  "hand_back",
  "mark_visit",
  "reply_review",
  "answer_booking_request",
  "send_broadcast",
] as const satisfies readonly DecisionVerb[];

/** The row's facts the groups read. */
type GroupRow = Pick<TodayQueueRowVM, "kind" | "act" | "clock_ms" | "waitedMs" | "booking" | "failed">;

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
 * What a row is worth to the business beside the others, the most first (2 Nov 2026: "rank by value"): a reply of yours
 * that never reached them (as far as they know, nobody answered), then someone asking to book (a time they picked, or an
 * ask for one), then a call back, then a lead who answered a reach-out, then anyone else waiting on a word, with a search
 * waiting for your answer by its wait among them (the sweep stops it after a day), and what Ask found last.
 */
function needYouWorthOf(r: Pick<TodayQueueRowVM, "kind" | "act" | "booking" | "failed">): number {
  if (r.failed) return -1;
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
  /** Whoever has waited past a week: one row, Older, at the end, and no part of the count. */
  old: T[];
  /** A call worth a listen and a lead who tried their preview: Ask found's, never in Need you's count. */
  found: T[];
}

/** Whether a person's row is Older: waited past a week, with no clock near. */
const isOlder = (r: GroupRow): boolean => waitedPastAWeek(r) && !clockIsNear(r);

/**
 * The rows by where each stands. Up next is one row (a reply that goes on its own first, then the first in Need you's
 * order of those under a week), the people after it wait on you or, past a week, are Older, and a search waits for your
 * OK. Asked again over the same rows it answers the same, so a row acted on this visit, kept where it stood, stays in its
 * group.
 */
export function needYouGroupsOf<T extends GroupRow>(rows: readonly T[]): NeedYouGroups<T> {
  const people = rows.filter((r) => {
    const verb = needYouVerbOf(r);
    return verb === "reply" || verb === "call";
  });
  const fresh = people.filter((r) => !isOlder(r));
  const next = fresh.find((r) => r.kind === "held") ?? [...fresh].sort(needYouOrder)[0] ?? null;
  return {
    next: next ? [next] : [],
    waiting: fresh.filter((r) => r !== next),
    ok: rows.filter((r) => needYouVerbOf(r) === "approve"),
    old: people.filter(isOlder),
    found: rows.filter((r) => r.kind === "call" || r.kind === "tried"),
  };
}

/**
 * How many need you: every row above To do, drawn or past its group's cap (Up next, who waits on you, what waits for your
 * OK with the runs waiting for a word beside it), and nothing Older (the canvas of 2 Nov 2026, D2: one count, the rows you
 * can see). The badge, the strip's Inbox tab, the phone's tab, the title and Today's head say this one number (the
 * dashboard's needs-you.ts needsYouNow); the Inbox page's own Needs you chip counts the rows its list holds (0048, amended
 * 2 Nov 2026), so a week-old hold and a run not folded are in it and not in this.
 */
export function needYouCountOf(groups: Pick<NeedYouGroups<unknown>, "next" | "waiting" | "ok">, runs: number): number {
  return groups.next.length + groups.waiting.length + groups.ok.length + runs;
}

/** The clock in a row's words, after "closes" or "sends": "11:52 AM" from "closes 11:52 AM · in 1h 38m". */
const windowClockOf = (when: string): string => when.replace(/^closes /, "").split(" · ")[0] ?? when;

/**
 * How long a row has waited, or when its clock runs out, in the few words beside its name: "3h", "6d", "closes 11:52 AM";
 * `long` where it should be seen (the amber ink): a wait past the business's own target (a day where it set none), or a
 * clock near enough to put the row first. A reply
 * your receptionist sends on its own says so, since its seconds are its row's to count. Null where the row has nothing to
 * say there.
 */
export function needYouWaitOf(
  r: Pick<TodayQueueRowVM, "kind" | "when" | "waitedMs" | "clock_ms" | "failed">,
  goesAlone: string,
  /** The business's own target for answering (config answerWithinMsOf): a wait past it is the amber; a day by default. */
  withinMs: number = DAY_MS,
): { words: string; long: boolean } | null {
  if (r.kind === "held") return { words: goesAlone, long: true };
  if (r.kind === "window") return { words: `closes ${windowClockOf(r.when)}`, long: clockIsNear(r) };
  if (!r.when) return null;
  if (!r.when.startsWith("waited ")) return { words: r.when, long: false };
  // A reply that never reached them is seen whatever its wait: as far as they know, nobody answered.
  return { words: r.when.slice("waited ".length), long: !!r.failed || r.waitedMs >= withinMs || clockIsNear(r) };
}
