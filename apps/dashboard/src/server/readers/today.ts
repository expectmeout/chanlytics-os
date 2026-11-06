import "server-only";
import {
  NEED_YOU_DONE_VERBS,
  QUOTE_MAX,
  clipAtWord,
  type CallDto,
  type ConversationDto,
  type EscalationDto,
  type LeadSearchDto,
  type MetricsSummaryDto,
  type PreviewTriedDto,
  type TodayVM,
} from "@chanlytics/contracts";
import {
  answeredSince,
  bellSeenAt,
  contactNameOf,
  todayDoneCount,
  type GoingRunRow,
  type WaitingRunRow,
} from "@chanlytics/db";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import { goingRuns, waitingRuns } from "./broadcasts";
import { heldThreadsBeyond } from "./inbox";
import { metrics } from "./metrics";
import { conversations } from "./conversations";
import { escalations } from "./escalations";
import { calls } from "./calls";
import { searches } from "./searches";
import { previewsTried } from "./leads";
import { log } from "@/server/shared/log";

interface TodayRead {
  metrics: MetricsSummaryDto;
  /** The newest hundred, as the Today page reads them. */
  conversations: ConversationDto[];
  /** The open escalations, newest first: one whose thread is not among the hundred is still a customer waiting. */
  escalations: Array<EscalationDto & { conversation_id: string }>;
  /** Null: the calls read failed, which is its own state on the page, never none. */
  calls: CallDto[] | null;
  /** Null: the searches read failed, and the queue says nothing about them. */
  searches: LeadSearchDto[] | null;
  /** The runs waiting for a word (toTodayVM counts those that still wait: runsThatWait); null where the read failed. */
  runs: WaitingRunRow[] | null;
  /** The threads of open holds past the hundred, read by their ids; null where that read failed. */
  heldThreads: ConversationDto[] | null;
  /** The runs set to go on their own in the next day (decision 0064: Going today); null where the read failed. */
  going: GoingRunRow[] | null;
  /** The leads who tried their own receptionist lately (decision 0079); null where the read failed. */
  previewsTried: PreviewTriedDto[] | null;
}

/**
 * How many things the members dealt with today (db todayDoneCount), by Need you's door; null, logged, where it could not be
 * read. The business's day starts where metrics_summary says it does (its `window.since`, as the bookings' count reads
 * it), the read the day already makes (shared through the turn): no row of the workspace's is read again for it, and the
 * day's start is not worked out a second time here. The page's alone (GET today's route reads it beside the day): Ask's
 * day does not say it.
 */
export async function doneToday(rc: ReaderContext): Promise<number | null> {
  try {
    const { window } = (await load(rc, metrics, { days: 1 })).data.metrics;
    return await todayDoneCount(rc.ctx.supabase, {
      tenantId: rc.tenantId,
      since: window.since,
      verbs: NEED_YOU_DONE_VERBS,
    });
  } catch (err) {
    log.error("today_done_fetch_failed", { tenant_id: rc.tenantId, error: err });
    return null;
  }
}

/**
 * Since this member last looked (Today in three zones, 2 Nov 2026): when they last closed the bell or marked it read, and
 * what the receptionist answered since, how many and the last of its words to whom. Null, logged, where it failed. The
 * page's alone, read beside the day by GET today's route.
 */
export async function sinceYouLooked(rc: ReaderContext): Promise<TodayVM["since"]> {
  try {
    const db = rc.ctx.supabase;
    const seen = await bellSeenAt(db, { tenantId: rc.tenantId, userId: rc.userId });
    if (!seen) return { seen_at: null, answered: null };
    const a = await answeredSince(db, { tenantId: rc.tenantId, since: seen });
    const who = a.last?.contact_id
      ? await contactNameOf(db, { tenantId: rc.tenantId, contactId: a.last.contact_id })
      : null;
    return {
      seen_at: seen,
      answered: {
        count: a.count,
        // One line, cut at a word under the quote's length, as every receipt is (contracts clipAtWord); a reply with no
        // space in it is cut at the length, never to one letter.
        last: a.last
          ? {
              who: who ?? "a customer",
              text: clipAtWord(a.last.body.replace(/\s+/g, " "), QUOTE_MAX),
              at: a.last.created_at,
            }
          : null,
      },
    };
  } catch (err) {
    log.error("today_since_fetch_failed", { tenant_id: rc.tenantId, error: err });
    return null;
  }
}

/**
 * Today, as the page makes the day (GET today, Today in three zones: one request where the page made six) and as Ask
 * reads it: the day's metrics, the newest hundred conversations, the open escalations, the calls, the searches and the
 * runs waiting for approval, read at once; then, only where an open hold's thread is outside the hundred, those threads
 * by their ids (heldThreadsBeyond, the Inbox's own read, which the turn cache shares). Every part but the first three is
 * additive, as on the page: a failed read is null, logged under the page's own event, and the rest stands (a hold whose
 * thread was not read counts as waiting). The brief is then said with the runs and the held threads beside it
 * (toTodayVM's `beside`), so Ask's Today counts what the badge counts (the wiring's second audit, S7-1 and S7-7). What the
 * page alone says beside the day (done today, since you looked, the workspace's word) GET today's route reads.
 */
export const today: Reader<undefined, TodayRead> = {
  name: "today",
  async read(rc) {
    const [m, c, e, k, s, r, g, t] = await Promise.all([
      load(rc, metrics, { days: 1 }),
      load(rc, conversations, { ids: null }),
      load(rc, escalations, { state: "open" }),
      load(rc, calls, {}).catch((err: unknown) => {
        log.error("today_calls_fetch_failed", { error: err });
        return null;
      }),
      load(rc, searches, undefined).catch((err: unknown) => {
        log.error("today_searches_fetch_failed", { error: err });
        return null;
      }),
      load(rc, waitingRuns, undefined).catch((err: unknown) => {
        log.error("today_runs_fetch_failed", { error: err });
        return null;
      }),
      load(rc, goingRuns, undefined).catch((err: unknown) => {
        log.error("today_runs_fetch_failed", { error: err });
        return null;
      }),
      load(rc, previewsTried, undefined).catch((err: unknown) => {
        log.error("today_previews_fetch_failed", { error: err });
        return null;
      }),
    ]);
    const held = await heldThreadsBeyond(rc, c.data.conversations, e.data.escalations);
    if (held.threads === null) log.error("today_held_threads_fetch_failed", { asked: held.missing.length });
    return {
      data: {
        metrics: m.data.metrics,
        conversations: c.data.conversations,
        escalations: e.data.escalations,
        calls: k ? k.data.calls : null,
        searches: s ? s.data.searches : null,
        runs: r ? r.data.runs : null,
        heldThreads: held.threads,
        going: g ? g.data.runs : null,
        previewsTried: t ? t.data.previews : null,
      },
      rows: [...c.rows, ...(k?.rows ?? []), ...(r?.rows ?? []), ...(g?.rows ?? [])],
      stamp: stamp(),
    };
  },
};
