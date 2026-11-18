/**
 * How a take ends (the footage sources plan, "Taking a file in"): the item is in, it is passed over and says why, it
 * goes back to waiting until a time, or its fetch is counted as a failed try. Every write names the state it leaves
 * (`taking`), so a take run twice, or one the sync moved meanwhile, changes nothing the second time.
 *
 * And the day's budget, asked in one place before any bytes move: when one binds, every waiting file of the workspace
 * is set to wait for tomorrow with it, and the folder's line says so.
 */
import type { SourceItemRecord, SourceItemWhy, SourceReply } from "@chanlytics/contracts";
import {
  endSourceTake,
  holdSourceTakes,
  moveSourceTake,
  spendSourceTake,
  spendSourceUnits,
  type SourceTakeItem,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../../shared/log.js";
import { TAKE_BUDGETS } from "./budgets.js";
import { takeWaitLine, type TakeWait } from "./waits.js";

type Db = SupabaseClient<Database>;

/** Google's units a job has spent so far: added up as each call is made, and counted once as the job ends. */
export interface UnitsSpent {
  units: number;
}

/** One item being taken: its row, its provider's record, an hour's key, when the job's time ends, and its units. */
export interface Taking {
  db: Db;
  item: SourceTakeItem;
  record: SourceItemRecord;
  accessToken: string;
  log: Logger;
  deadline: number;
  spent: UnitsSpent;
}

/** What became of a take, in a word for its job's line. */
export interface TakeEnd {
  took: string;
}

/** What the take read of the item's bytes, kept on its row: what the sync compares a later listing with. */
const takenFactsOf = (record: SourceItemRecord, bytes: number | null) => ({
  checksum: record.checksum,
  bytes: bytes ?? record.bytes,
  seconds: record.seconds,
  modified_at: record.modifiedAt,
});

/** The item ends in a state that is not waiting: in (with its file), passed over, or let go. */
export async function endTake(
  taking: Pick<Taking, "db" | "item" | "record" | "log">,
  end: {
    state: "in" | "too_big" | "not_media" | "let_go";
    why?: SourceItemWhy;
    fileId?: string | null;
    bytes?: number | null;
  },
): Promise<TakeEnd> {
  const { db, item, record, log } = taking;
  const moved = await moveSourceTake(db, {
    tenantId: item.tenant_id,
    id: item.id,
    from: ["taking"],
    patch: {
      state: end.state,
      why: end.why ?? null,
      take_after: null,
      ...(end.fileId === undefined ? {} : { file_id: end.fileId }),
      ...takenFactsOf(record, end.bytes ?? null),
    },
  });
  const took = end.why ? `${end.state}:${end.why}` : end.state;
  log.info("source_take", { item: item.id, took, moved });
  return { took };
}

/** What the take learned of a clip the video platform is now fetching, kept on its row; its state stays taking. */
export async function keepTakeFacts(taking: Pick<Taking, "db" | "item" | "record">, bytes: number): Promise<void> {
  await moveSourceTake(taking.db, {
    tenantId: taking.item.tenant_id,
    id: taking.item.id,
    from: ["taking"],
    patch: takenFactsOf(taking.record, bytes),
  });
}

/**
 * The item goes back to waiting until a time, with why. `park` sets every other waiting file of the workspace (or
 * every waiting video) to wait for the same thing, so the clock does not hand each one a job to learn it again.
 */
export async function putBack(
  taking: Pick<Taking, "db" | "item" | "log">,
  wait: { why: TakeWait; until: Date; park?: "videos" | "all"; binds?: string },
): Promise<TakeEnd> {
  const { db, item, log } = taking;
  await moveSourceTake(db, {
    tenantId: item.tenant_id,
    id: item.id,
    from: ["taking"],
    patch: { state: "waiting", why: wait.why, take_after: wait.until.toISOString() },
  });
  const videosOnly = wait.park === "videos";
  const parked = wait.park
    ? await holdSourceTakes(db, {
        tenantId: item.tenant_id,
        kind: videosOnly ? "video" : null,
        why: wait.why,
        until: wait.until,
      })
    : 1;
  log.info("source_take_waits", {
    item: item.id,
    why: wait.why,
    ...(wait.binds ? { binds: wait.binds } : {}),
    until: wait.until.toISOString(),
    waiting: parked,
    line: takeWaitLine({ why: wait.why, count: parked, videosOnly }),
  });
  return { took: `waits:${wait.why}` };
}

/**
 * A read of the item's provider that was not a yes. "Not now" is a rest, and no try is spent. Gone or no access is
 * the sync's to say of the item (it marks what left, and never on one refusal); here it is a failed try, so an item
 * that still cannot be read after two more says it failed.
 */
export async function endUnread(
  taking: Pick<Taking, "db" | "item" | "log">,
  reply: Exclude<SourceReply<unknown>, { verdict: "ok" }>,
  now = new Date(),
): Promise<TakeEnd> {
  if (reply.verdict === "pace") return putBack(taking, { why: "pace", until: new Date(now.getTime() + reply.restMs) });
  const changed = await endSourceTake(taking.db, taking.item.tenant_id, taking.item.id, "unreadable", now);
  taking.log.warn("source_take_failed", { item: taking.item.id, why: reply.verdict, changed });
  return { took: `unread:${reply.verdict}` };
}

/** Google's units a call just spent, added to the job's own count. */
export function countUnits(spent: UnitsSpent, units: number): void {
  spent.units += units;
}

/**
 * A job's units written to the day's count, once, as it ends: one round trip a job where each call made its own. A
 * count that could not be written is a line, never a take lost.
 */
export async function keepUnitsSpent(db: Db, spent: UnitsSpent): Promise<void> {
  if (spent.units <= 0) return;
  await spendSourceUnits(db, spent.units).catch(logAndGoOn("source take: count the provider's units", 0));
}

/**
 * The day's budget asked for one take, before any bytes move: `bytes` is the file's size, `unitsToCome` what its
 * download will still cost. Null when the take may go on; when a budget binds, the item and every other waiting file
 * of the workspace wait for tomorrow, and that end is answered.
 */
export async function spendTake(taking: Taking, bytes: number, unitsToCome: number): Promise<TakeEnd | null> {
  const spent = await spendSourceTake(taking.db, {
    tenantId: taking.item.tenant_id,
    itemId: taking.item.id,
    bytes,
    units: unitsToCome,
    platformBytesMax: TAKE_BUDGETS.platformBytesADay,
    workspaceBytesMax: TAKE_BUDGETS.workspaceBytesADay,
    workspaceTakesMax: TAKE_BUDGETS.workspaceTakesADay,
    unitsMax: TAKE_BUDGETS.unitsADay,
  });
  if (spent.fate === "go") return null;
  return putBack(taking, { why: "budget", until: spent.until, park: "all", binds: spent.binds });
}
