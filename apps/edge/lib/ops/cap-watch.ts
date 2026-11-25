/**
 * A list that stopped at PostgREST's 1,000-row cap, paged (layer 12: decision 0111's seventh rule, which said it only in
 * a log line nothing ships). Either app notes such a read in the pager's memory as it happens (packages/db observe.ts
 * `atCap`, under `db_answer_at_cap:<table>`), so Health shows it under what paged us; the health sweep pages each one
 * noted inside the pager's window that no page has told of yet, once a window, as every condition is paged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AT_CAP_PAGE, listOperatorPages } from "@chanlytics/db/ops";
import type { Database } from "@chanlytics/db/types";
import { pageOperator, pageStates } from "../shared/alerts/page-operator.js";
import { logger } from "../shared/log.js";

/** What the operator reads of one table's reads at the cap. */
function capPage(table: string): { subject: string; body: string } {
  return {
    subject: `A list stopped at 1,000 rows: ${table}`,
    body:
      `A read of ${table} asked for no page and came back holding exactly 1,000 rows, the most the database answers ` +
      `at once, so the list it fed may be cut short.\n\n` +
      `Find it in the logs by db_answer_at_cap and its table: the line carries the request's id. Read it a page at a ` +
      `time (paged.ts) or narrow what it asks for.`,
  };
}

/** Each table noted at the cap inside the window and told of by no page, paged; how many were. A test hands in its pager. */
export async function watchRowCap(
  db: SupabaseClient<Database>,
  { now = Date.now(), page = pageOperator }: { now?: number; page?: typeof pageOperator } = {},
): Promise<number> {
  const { data, error } = await listOperatorPages(db);
  if (error) {
    logger().error("row_cap_watch_unreadable", { error: error.message });
    return 0;
  }
  const untold = pageStates(data, now).filter((s) => s.key.startsWith(`${AT_CAP_PAGE}:`) && s.recent && !s.told);
  for (const s of untold) {
    const words = capPage(s.key.slice(AT_CAP_PAGE.length + 1));
    await page({ db, now: () => now }, s.key, words.subject, words.body);
  }
  return untold.length;
}
