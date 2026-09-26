import "server-only";
import type { CallDto, ConversationDto, EscalationDto, LeadSearchDto, MetricsSummaryDto } from "@chanlytics/contracts";
import { load, stamp, type Reader } from "./index";
import { inbox } from "./inbox";
import { metrics } from "./metrics";
import { calls } from "./calls";
import { searches } from "./searches";

export interface TodayRead {
  metrics: MetricsSummaryDto;
  /** The Inbox's threads: the escalated ones outside the newest hundred first, then the hundred. */
  conversations: ConversationDto[];
  escalations: Array<EscalationDto & { conversation_id: string }>;
  /** Null: the calls read failed, which is its own state on the page, never none. */
  calls: CallDto[] | null;
  /** Null: the searches read failed, and the queue says nothing about them. */
  searches: LeadSearchDto[] | null;
}

/**
 * Today, as the browser composes it (legacy-bridge/surface-data.ts,
 * todayOverride): the day's metrics, the threads and their open escalations,
 * the calls and the searches, at once. The calls and the searches are
 * additive, as on the page: a failed read is null, logged under the page's own
 * event, and the rest stands. The threads are the Inbox's, its escalated fetch
 * included, where the page's Today holds the newest hundred alone: a customer
 * waiting outside the hundred is named from their thread, and one a person has
 * taken over is not counted, as the Inbox counts them. No route answers this;
 * Ask is its only server-side reader until the context plane (Phase 2) is.
 */
export const today: Reader<undefined, TodayRead> = {
  name: "today",
  async read(rc) {
    const [m, i, k, s] = await Promise.all([
      load(rc, metrics, { days: 1 }),
      load(rc, inbox, undefined),
      load(rc, calls, {}).catch((e: unknown) => {
        console.error("today_calls_fetch_failed", e instanceof Error ? e.message : e);
        return null;
      }),
      load(rc, searches, undefined).catch((e: unknown) => {
        console.error("today_searches_fetch_failed", e instanceof Error ? e.message : e);
        return null;
      }),
    ]);
    return {
      data: {
        metrics: m.data.metrics,
        conversations: i.data.conversations,
        escalations: i.data.escalations,
        calls: k ? k.data.calls : null,
        searches: s ? s.data.searches : null,
      },
      rows: [...i.rows, ...(k?.rows ?? [])],
      stamp: stamp(),
    };
  },
};
