/**
 * Today's helpers for the legacy page, computed in contracts from the
 * surfaces the page already holds — the calendar, the playbooks, the people,
 * Reports, the bell, the broadcasts, the readings of reach-out replies. Published on window the way the
 * calendar's verbs are, so the page composes and never derives. The mockup's
 * sample (today-sample.ts) publishes the same object, so the two cannot drift.
 */
import {
  todayDay,
  todayAwayGrouped,
  todaySteps,
  todayLeaks,
  todayPeriodLine,
  todayRunWords,
  todayRunsSub,
  todayRunApproved,
  withReplies,
  NOTIFICATION_KIND_GROUPS,
  type ReachOutRepliesDto,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";

/** The readings of reach-out replies as the Inbox's surface holds them (reach-out/replies.ts); none when unread. */
const readings = () => (window as Window & { __REPLIES?: ReachOutRepliesDto | null }).__REPLIES?.replies ?? [];

export const TODAY_HELPERS = {
  day: todayDay,
  periodLine: todayPeriodLine,
  runs: todayRunWords,
  runsSub: todayRunsSub,
  runApproved: todayRunApproved,
  leaks: todayLeaks,
  awayGrouped: todayAwayGrouped,
  // The steps due at the head of the day (0007, amended).
  steps: todaySteps,
  // The queue's handoffs whose thread's reply to a reach-out was read, as that reply's row (Reach out Part 5, PR 8).
  withReplies: (rows: TodayQueueRowVM[]) => withReplies(rows, readings()),
  // What Settings › Notifications says the workspace is told (contracts notification-kinds.ts).
  notificationKinds: NOTIFICATION_KIND_GROUPS,
};
type TodayHelpers = typeof TODAY_HELPERS;

declare global {
  interface Window {
    __today?: TodayHelpers;
  }
}

export function installToday(): void {
  window.__today = TODAY_HELPERS;
}
