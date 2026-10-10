/**
 * Which realtime events repaint which surface.
 *
 * The runner holds ONE subscription and used to fan every event out to every
 * realtime-refreshed surface. When the calls table joined the watch list,
 * each transcript turn of a live call (an UPDATE every few seconds) re-ran
 * the Inbox, Today, Conversations, People and Reports fetches — three of
 * them plpgsql aggregates — per open tab. A surface now says which tables
 * it cares about; the historical trio stays the default for the surfaces
 * that never said.
 *
 * Pure, so the rule is tested without a browser.
 */
import type { MessageStatus } from "@chanlytics/contracts";

export const DEFAULT_REFRESH_TABLES: readonly string[] = ["messages", "conversations", "escalations"];

/**
 * What a thread has to draw of a message once it has left the queue: the ticks (sent, delivered, read) and the two
 * ends (failed, canceled). Not `received`, an inbound row's meta stamped after the fact, which no tick follows, and not
 * `queued`, a row still waiting.
 */
export const LEFT_THE_QUEUE: readonly MessageStatus[] = ["sent", "delivered", "read", "failed", "canceled"];

/** One realtime event, as the rule sees it. */
export interface RealtimeChange {
  table: string;
  /** INSERT | UPDATE | DELETE, or "*" when the source did not say. */
  event: string;
  row: Record<string, unknown>;
}

/**
 * A transcript turn of a call in progress: an UPDATE of a call that stays ongoing, told every few seconds. It changes nothing a
 * figure counts, so the surfaces that count calls (Today, the Receptionist lens) leave it out of their rule; a call starting (an
 * INSERT) or ending (an UPDATE that leaves another status) is not a turn. Live, which draws the transcript, hears each.
 */
export function isLiveCallTurn(change: RealtimeChange): boolean {
  return change.table === "calls" && change.event === "UPDATE" && change.row.status === "ongoing";
}

export interface RefreshPreference {
  /** The historical flag: repaint on the default tables. */
  refreshOnMessageInserts?: boolean;
  /** An explicit list wins over the flag. */
  refreshOnTables?: readonly string[];
  /**
   * A finer rule on top of the table list, judged per event. Today wants a
   * call STARTING and ENDING, not the transcript turn every few seconds in
   * between — those are UPDATEs that leave the status ongoing.
   */
  refreshWhen?: (change: RealtimeChange) => boolean;
  /**
   * The statuses a message's UPDATE re-applies this surface for (00327). A message's update is told for every receipt
   * a provider sends, and the default tables were an arrival's before it, so a surface hears an update only by naming
   * what it draws of it: the Inbox and Conversations their ticks, Today a send that failed. Absent, it hears none, as
   * before. An update's notice carries the statuses its statement left, each a change of its own.
   */
  refreshOnMessageStatuses?: readonly MessageStatus[];
}

export function wantsRefresh(o: RefreshPreference, table: string, change?: RealtimeChange): boolean {
  const wanted = o.refreshOnTables?.length
    ? o.refreshOnTables.includes(table)
    : !!o.refreshOnMessageInserts && DEFAULT_REFRESH_TABLES.includes(table);
  if (!wanted) return false;
  // A message's update, heard only for the statuses the surface named (refreshOnMessageStatuses).
  if (change && table === "messages" && change.event === "UPDATE")
    if (!o.refreshOnMessageStatuses?.some((s) => s === change.row.status)) return false;
  return o.refreshWhen && change ? o.refreshWhen(change) : true;
}

/** True when the surface subscribes to anything at all. */
export function subscribesToRealtime(o: RefreshPreference): boolean {
  return !!o.refreshOnMessageInserts || !!o.refreshOnTables?.length;
}

/** How long the live feed may be down before the shell says so: the client rejoins a blip within seconds. */
export const REALTIME_GRACE_MS = 5000;

export interface FeedWatch {
  onStatus(status: string): void;
  /** The runner is tearing down: its own close is not a drop, and nothing more is said. */
  stop(): void;
}

/**
 * What the live feed's own reports mean for the page. Every rejoin after the
 * first join reads what was missed, because the feed replays nothing it
 * missed. A drop is said only once it outlasts the grace, so a blip the
 * client rejoins within seconds never flashes a line, and it is said once
 * however many errors follow; the feed's return is said at once.
 */
export function feedWatch(opts: {
  graceMs: number;
  onDown: (down: boolean) => void;
  onReconnect: () => void;
}): FeedWatch {
  let joined = false;
  let down = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    onStatus(status) {
      if (stopped) return;
      if (status === "SUBSCRIBED") {
        clear();
        if (down) {
          down = false;
          opts.onDown(false);
        }
        if (joined) opts.onReconnect();
        joined = true;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        timer ??= setTimeout(() => {
          timer = null;
          if (stopped || down) return;
          down = true;
          opts.onDown(true);
        }, opts.graceMs);
      }
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}
