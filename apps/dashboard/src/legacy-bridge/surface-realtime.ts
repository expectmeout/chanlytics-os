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
export const DEFAULT_REFRESH_TABLES: readonly string[] = ["messages", "conversations", "escalations"];

/** One realtime event, as the rule sees it. */
export interface RealtimeChange {
  table: string;
  /** INSERT | UPDATE | DELETE, or "*" when the source did not say. */
  event: string;
  row: Record<string, unknown>;
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
}

export function wantsRefresh(o: RefreshPreference, table: string, change?: RealtimeChange): boolean {
  const wanted = o.refreshOnTables?.length
    ? o.refreshOnTables.includes(table)
    : !!o.refreshOnMessageInserts && DEFAULT_REFRESH_TABLES.includes(table);
  if (!wanted) return false;
  return o.refreshWhen && change ? o.refreshWhen(change) : true;
}

/** True when the surface subscribes to anything at all. */
export function subscribesToRealtime(o: RefreshPreference): boolean {
  return !!o.refreshOnMessageInserts || !!o.refreshOnTables?.length;
}
