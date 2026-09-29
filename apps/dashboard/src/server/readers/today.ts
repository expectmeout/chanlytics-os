import "server-only";
import type { CallDto, ConversationDto, EscalationDto, LeadSearchDto, MetricsSummaryDto } from "@chanlytics/contracts";
import { load, stamp, type Reader } from "./index";
import { metrics } from "./metrics";
import { conversations } from "./conversations";
import { escalations } from "./escalations";
import { calls } from "./calls";
import { searches } from "./searches";
import { log, errField } from "@/server/log";

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
}

/**
 * Today, as the browser composes the page (legacy-bridge/surface-data.ts,
 * todayOverride): the day's metrics, the newest hundred conversations, the
 * open escalations, the calls and the searches, five reads at once. The calls
 * and the searches are additive, as on the page: a failed read is null, logged
 * under the page's own event, and the rest stands.
 *
 * No escalated thread outside the hundred is fetched here. The Today page
 * makes no such read, and toTodayVM already counts an open escalation whose
 * thread it was not handed as a customer waiting, named "Unknown": that is the
 * page's number, so it is Ask's. The Inbox's fetch by id lives in `inbox`, for
 * inbox.list; when both run in a turn they share the hundred and the
 * escalations through the turn cache. No route answers this; Ask is its only
 * server-side reader until the context plane (Phase 2) is.
 */
export const today: Reader<undefined, TodayRead> = {
  name: "today",
  async read(rc) {
    const [m, c, e, k, s] = await Promise.all([
      load(rc, metrics, { days: 1 }),
      load(rc, conversations, { ids: null }),
      load(rc, escalations, { state: "open" }),
      load(rc, calls, {}).catch((err: unknown) => {
        log.error("today_calls_fetch_failed", { error: errField(err) });
        return null;
      }),
      load(rc, searches, undefined).catch((err: unknown) => {
        log.error("today_searches_fetch_failed", { error: errField(err) });
        return null;
      }),
    ]);
    return {
      data: {
        metrics: m.data.metrics,
        conversations: c.data.conversations,
        escalations: e.data.escalations,
        calls: k ? k.data.calls : null,
        searches: s ? s.data.searches : null,
      },
      rows: [...c.rows, ...(k?.rows ?? [])],
      stamp: stamp(),
    };
  },
};
