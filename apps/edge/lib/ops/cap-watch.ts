/**
 * A list that stopped at PostgREST's 1,000-row cap, paged (layer 12: decision 0111's seventh rule, which said it only in
 * a log line nothing ships). Either app notes such a read in the pager's memory as it happens (packages/db observe.ts
 * `atCap`, under `db_answer_at_cap:<table>`), so Health shows it under what paged us; the health sweep pages each one
 * noted inside the pager's window that no page has told of yet, once a window, as every condition is paged.
 *
 * And a door that refuses signed knocks (28 Nov 2026), noted the same way by the edge's door() under
 * `door_refuses:<path>` once three in a row carried a credential and were refused with none let in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AT_CAP_PAGE, DOOR_REFUSING_PAGE, listOperatorPages } from "@chanlytics/db/ops";
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

/** When the sweep watches, and the pager it pages through: a test hands in its own. */
interface WatchPorts {
  now?: number;
  page?: typeof pageOperator;
}

/** Each condition of one kind (its key's prefix) noted inside the window and told of by no page, paged; how many were. */
async function pageEachNoted(
  db: SupabaseClient<Database>,
  noted: Parameters<typeof pageStates>[0],
  kind: { prefix: string; words: (what: string) => { subject: string; body: string } },
  { now = Date.now(), page = pageOperator }: WatchPorts,
): Promise<number> {
  const untold = pageStates(noted, now).filter((s) => s.key.startsWith(kind.prefix) && s.recent && !s.told);
  for (const s of untold) {
    const words = kind.words(s.key.slice(kind.prefix.length));
    await page({ db, now: () => now }, s.key, words.subject, words.body);
  }
  return untold.length;
}

/** Each table noted at the cap inside the window and told of by no page, paged; how many were. A test hands in its pager. */
export async function watchRowCap(db: SupabaseClient<Database>, ports: WatchPorts = {}): Promise<number> {
  const { data, error } = await listOperatorPages(db);
  if (error) {
    logger().error("row_cap_watch_unreadable", { error: error.message });
    return 0;
  }
  return pageEachNoted(db, data, { prefix: `${AT_CAP_PAGE}:`, words: capPage }, ports);
}

/** What the operator reads of one door that refuses signed knocks. */
function refusingPage(door: string): { subject: string; body: string } {
  return {
    subject: `A door is refusing signed knocks: ${door}`,
    body:
      `Knocks on ${door} that carried a signature or a token have been refused for five minutes or more, three or ` +
      `more in a row, and none was let in since. ` +
      `Until it is mended, nothing that door receives is taken: on /api/whatsapp, no customer's message.

` +
      `Either its signing secret no longer matches the provider's (rotated there, or changed here: META_APP_SECRET ` +
      `for WhatsApp and Instagram), or, on an admin door, the two apps' EDGE_CALL_SECRET differ. Find it in the logs ` +
      `by door_refuses_signed_knocks and its door, or by whatsapp_bad_signature.`,
  };
}

/** Each door noted as refusing signed knocks inside the window and told of by no page, paged; how many were. */
export async function watchRefusingDoors(db: SupabaseClient<Database>, ports: WatchPorts = {}): Promise<number> {
  const { data, error } = await listOperatorPages(db);
  if (error) {
    logger().error("door_watch_unreadable", { error: error.message });
    return 0;
  }
  return pageEachNoted(db, data, { prefix: `${DOOR_REFUSING_PAGE}:`, words: refusingPage }, ports);
}
