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

export interface RefreshPreference {
  /** The historical flag: repaint on the default tables. */
  refreshOnMessageInserts?: boolean;
  /** An explicit list wins over the flag. */
  refreshOnTables?: readonly string[];
}

export function wantsRefresh(o: RefreshPreference, table: string): boolean {
  if (o.refreshOnTables?.length) return o.refreshOnTables.includes(table);
  return !!o.refreshOnMessageInserts && DEFAULT_REFRESH_TABLES.includes(table);
}

/** True when the surface subscribes to anything at all. */
export function subscribesToRealtime(o: RefreshPreference): boolean {
  return !!o.refreshOnMessageInserts || !!o.refreshOnTables?.length;
}
