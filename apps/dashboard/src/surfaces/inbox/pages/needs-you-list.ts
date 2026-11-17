/**
 * What the Inbox's Needs you lists, says and folds, made of the rows of the one count (needs-you.ts needsYouRowsNow; 0048,
 * amended 15 Nov 2026), and the hook the page reads them by. The Inbox page's own: the rules every page loads stay in
 * rules.ts, and this is no part of what a visitor waits for on any other page.
 */
import { useSyncExternalStore } from "react";
import { needYouCountOf, type NeedYouGroups, type TodayQueueRowVM } from "@chanlytics/contracts";
import { hearNeedsYou, needsYouRowsNow } from "../../needs-you";
import { ixBucketOf, ixSending, ixWaitsOnYou } from "../rules";
import type { Thread } from "../types";

/** What the one count is made of, as needs-you.ts reads it from Today (`needsYouRowsNow`): Need you's groups, the runs' rows. */
interface CountedRows {
  groups: Pick<NeedYouGroups<TodayQueueRowVM>, "next" | "waiting" | "ok" | "old">;
  runs: number;
}

/** Needs you's list, by the one count's rows (`ixNeedsYouOf`). */
export interface IxNeedsYou {
  /** Whether Needs you lists a conversation: the rule puts it there, or the one count holds its person. */
  listed: (t: Thread) => boolean;
  /** The conversations folded at the list's foot, by thread id: whoever has waited past a week, in no count. */
  older: ReadonlySet<string>;
  /**
   * The counted rows that are no conversation the Inbox holds, drawn as rows of their own: someone the count holds whose
   * conversation the Inbox's read has not (a hold it could not read), then a search's question.
   */
  rows: TodayQueueRowVM[];
  /** Whoever has waited past a week whose conversation the Inbox does not hold: folded with the rest. */
  olderRows: TodayQueueRowVM[];
  /** What a conversation Needs you holds by the count alone asks of you, its row's word ("Reply soon"); null for the rest. */
  why: (t: Thread) => string | null;
  /** The one count's row of a conversation, its own or a folded one's: what one person past a week is drawn from. */
  rowOf: (t: Thread) => TodayQueueRowVM | null;
  /** How many: the one count (contracts needYouCountOf), or null while Today has not been read, when the list counts itself. */
  count: number | null;
}

/** No conversation folded. */
const NONE_FOLDED: ReadonlySet<string> = new Set();

/**
 * Needs you's list, made of the rows the badge counts (0048, amended 15 Nov 2026: the tab counted its own list, and said 1
 * under a badge of 2, and 40 under one of 26). It lists every conversation the rule puts there and every one whose person
 * the one count holds (a WhatsApp window shutting on a snoozed conversation, or a teammate's, is Today's row and so its),
 * folds whoever has waited past a week at its foot in no count, and draws a row of its own for what is counted and is no
 * conversation it holds. A conversation the rule puts there that Today's read does not hold yet (a message that came
 * between two reads) is listed, never hidden: the next read counts it. Before Today is read, the list is the rule's alone.
 */
export function ixNeedsYouOf(
  threads: readonly Thread[],
  counted: CountedRows | null,
  nowMs: number = Date.now(),
): IxNeedsYou {
  const own = (t: Thread) => ixBucketOf(t, nowMs) === "escalated";
  if (!counted) {
    const none = () => null;
    return { listed: own, older: NONE_FOLDED, rows: [], olderRows: [], why: none, rowOf: none, count: null };
  }
  const { groups, runs } = counted;
  const conversationOf = (t: Thread) => (t.real ? t.conversationId : null);
  const byConversation = (rows: readonly TodayQueueRowVM[]) =>
    new Map(rows.flatMap((r) => (r.conversationId ? [[r.conversationId, r] as const] : [])));
  const people = [...groups.next, ...groups.waiting];
  const fresh = byConversation(people);
  const old = byConversation(groups.old);
  const rowOf = (t: Thread) => {
    const c = conversationOf(t);
    return c ? (fresh.get(c) ?? old.get(c) ?? null) : null;
  };
  const held = new Set(threads.flatMap((t) => (t.real ? [t.conversationId] : [])));
  const away = (r: TodayQueueRowVM) => !r.conversationId || !held.has(r.conversationId);
  const folded = threads.filter((t) => {
    const c = conversationOf(t);
    return !!c && old.has(c) && !fresh.has(c);
  });
  return {
    listed: (t) => own(t) || rowOf(t) !== null,
    older: folded.length ? new Set(folded.map((t) => t.id)) : NONE_FOLDED,
    rows: [...people.filter(away), ...groups.ok],
    olderRows: groups.old.filter(away),
    why: (t) => (own(t) ? null : (rowOf(t)?.status[0] ?? null)),
    rowOf,
    count: needYouCountOf(groups, runs),
  };
}

/**
 * Whether a bucket lists a conversation: All every one, Needs you what the one count holds, its folded ones among them
 * (ixNeedsYouOf), any other its own (ixBucketOf). The one rule the list and the pane both follow.
 */
export const ixListedIn = (thread: Thread, bucket: string, needsYou?: IxNeedsYou): boolean => {
  if (bucket === "all") return true;
  if (bucket === "escalated" && needsYou) return needsYou.listed(thread);
  return ixBucketOf(thread) === bucket;
};

/** Whether a bucket draws a conversation among its rows: what it lists, less whoever Needs you folds. */
export const ixDrawnIn = (thread: Thread, bucket: string, needsYou?: IxNeedsYou): boolean =>
  ixListedIn(thread, bucket, needsYou) && !(bucket === "escalated" && needsYou?.older.has(thread.id));

/**
 * The thread drawn beside the list as the page opens with no address naming one: the first in the list's own order, a
 * reply about to send, then a thread that needs you. A teammate's thread opened in its place (I2). Never one folded at
 * Needs you's foot (`older`): whoever has waited past a week opens when they are asked for.
 */
export const ixFirstOpen = (threads: readonly Thread[], older: ReadonlySet<string>): string | null => {
  const drawn = threads.filter((x) => !older.has(x.id));
  const first =
    drawn.find((x) => ixSending(x)) ||
    drawn.find((x) => x.state === "needs" || (x.real && ixWaitsOnYou(x))) ||
    drawn[0];
  return first?.id ?? null;
};

/** The rows' ids by group and the runs' rows: what a page drawn from the rows is drawn again for, and nothing else. */
function rowsKeyNow(): string {
  const counted = needsYouRowsNow();
  if (!counted) return "";
  const ids = (rows: readonly TodayQueueRowVM[]) => rows.map((x) => x.id).join(",");
  const { next, waiting, ok, old } = counted.groups;
  return [ids(next), ids(waiting), ids(ok), ids(old), counted.runs].join("|");
}

/** The rows of the one count, as a hook: drawn again when a row comes, goes or moves group, by nothing else. */
export function useNeedsYouRows(): ReturnType<typeof needsYouRowsNow> {
  useSyncExternalStore(hearNeedsYou, rowsKeyNow, rowsKeyNow);
  return needsYouRowsNow();
}
