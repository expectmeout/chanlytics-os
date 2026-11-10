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
import { findAnsweredSince, findBellSeenAt, findContactName, listSentSince } from "@chanlytics/db/notices";
import { getTodayDoneCount } from "@chanlytics/db/people";
import type { GoingRunRow, WaitingRunRow } from "@chanlytics/db/campaigns";
import { load, readerStamp, type Reader, type ReaderContext } from "../shared/reader";
import { goingRuns, waitingRuns } from "./broadcasts";
import { findHeldThreadsBeyond } from "./inbox";
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
 * How many things the members dealt with today (db getTodayDoneCount), by Need you's door; null, logged, where it could not be
 * read. The business's day starts where metrics_summary says it does (its `window.since`, as the bookings' count reads
 * it), the read the day already makes (shared through the turn): no row of the workspace's is read again for it, and the
 * day's start is not worked out a second time here. The page's alone (GET today's route reads it beside the day): Ask's
 * day does not say it.
 */
export async function findDoneToday(rc: ReaderContext): Promise<number | null> {
  try {
    const { window } = (await load(rc, metrics, { days: 1 })).data.metrics;
    return await getTodayDoneCount(rc.ctx.supabase, {
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
export async function getSinceYouLooked(rc: ReaderContext): Promise<TodayVM["since"]> {
  try {
    const db = rc.ctx.supabase;
    const seen = await findBellSeenAt(db, { tenantId: rc.tenantId, userId: rc.userId });
    if (!seen) return { seen_at: null, answered: null };
    // What the sequences sent since (decision 0120), read beside the answers: a read of it that fails is said in the log
    // and leaves the line without it, never without the rest.
    const [result, sent] = await Promise.all([
      findAnsweredSince(db, { tenantId: rc.tenantId, since: seen }),
      listSentSince(db, { tenantId: rc.tenantId, since: seen }).catch((err: unknown) => {
        log.error("today_since_fetch_failed", { tenant_id: rc.tenantId, error: err });
        return null;
      }),
    ]);
    const personName = result.last?.contact_id
      ? await findContactName(db, { tenantId: rc.tenantId, contactId: result.last.contact_id })
      : null;
    return {
      seen_at: seen,
      sent,
      answered: {
        count: result.count,
        // One line, cut at a word under the quote's length, as every receipt is (contracts clipAtWord); a reply with no
        // space in it is cut at the length, never to one letter.
        last: result.last
          ? {
              who: personName ?? "a customer",
              text: clipAtWord(result.last.body.replace(/\s+/g, " "), QUOTE_MAX),
              at: result.last.created_at,
              conversation_id: result.last.conversation_id,
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
 * by their ids (findHeldThreadsBeyond, the Inbox's own read, which the turn cache shares). Every part but the first three is
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
    const held = await findHeldThreadsBeyond(rc, c.data.conversations, e.data.escalations);
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
      stamp: readerStamp(),
    };
  },
};
