import "server-only";
import type {
  CallDto,
  ConversationDto,
  EscalationDto,
  LeadSearchDto,
  MetricsSummaryDto,
  PreviewTriedDto,
} from "@chanlytics/contracts";
import type { GoingRunRow, WaitingRunRow } from "@chanlytics/db";
import { load, stamp, type Reader } from "./index";
import { goingRuns, waitingRuns } from "./broadcasts";
import { heldThreadsBeyond } from "./inbox";
import { metrics } from "./metrics";
import { conversations } from "./conversations";
import { escalations } from "./escalations";
import { calls } from "./calls";
import { searches } from "./searches";
import { previewsTried } from "./leads";
import { log } from "@/server/log";

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
 * Today, as the browser composes the page (surfaces/today/surface.ts): the day's metrics, the newest hundred
 * conversations, the open escalations, the calls, the searches and the runs waiting for approval, six reads at once;
 * then, only where an open hold's thread is outside the hundred, those threads by their ids (heldThreadsBeyond, the
 * Inbox's own read, which the turn cache shares). The calls, the searches, the runs and the held threads are additive,
 * as on the page: a failed read is null, logged under the page's own event, and the rest stands (a hold whose thread
 * was not read counts as waiting). The brief is then said with the runs and the held threads beside it (toTodayVM's
 * `beside`), so Ask's Today counts what the badge counts (the wiring's second audit, S7-1 and S7-7).
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
