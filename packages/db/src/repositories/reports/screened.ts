/**
 * The calls kept off the owner's list in a window (decision 0138): the ledger's `call.screened` rows, each written
 * where a rule acted (contracts voice/screened.ts), counted a call once. The dashboard asks on the session client, so
 * RLS decides what a member reads (`events_member_select`). A read that fails throws: "we could not read" is never
 * "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DbFailure,
  SCREENED_REASONS,
  isOneOf,
  recordOrEmpty,
  type ScreenedCallsDto,
  type TenantId,
} from "@chanlytics/contracts";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** How many rows a read takes at once, and how many reads a window may take: past them the window is not counted. */
const SCREENED_PAGE = 1000;
const SCREENED_PAGES = 10;

/** Said where a window holds more screened calls than the read will count: the reader then draws no line of them. */
const TOO_MANY = { message: "more call.screened rows than a window is counted over" };

/**
 * How many calls were screened between two instants, by why. A call the provider delivered twice, or one refused on
 * each of its tries, wrote its row each time: rows that name one call for one reason are that call once. A row that
 * names no call (a call back set aside as selling names its thread alone) is its own.
 */
export async function countScreenedCalls(
  db: Db,
  tenantId: TenantId,
  window: { fromIso: string; toIso: string },
): Promise<ScreenedCallsDto> {
  const counted = new Set<string>();
  const byReason: ScreenedCallsDto["by_reason"] = {};
  for (let page = 0; ; page += 1) {
    if (page >= SCREENED_PAGES) throw new DbFailure(TOO_MANY, "counting the calls screened");
    const { data, error } = await db
      .from("events")
      .select("id, data")
      .eq("tenant_id", tenantId)
      .eq("kind", "call.screened")
      .gte("created_at", window.fromIso)
      .lt("created_at", window.toIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * SCREENED_PAGE, (page + 1) * SCREENED_PAGE - 1);
    if (error) throw new DbFailure(error, "counting the calls screened");
    for (const row of data) {
      const kept = recordOrEmpty(row.data);
      const reason = kept.reason;
      if (!isOneOf(SCREENED_REASONS, reason)) continue;
      const named = typeof kept.call_id === "string" && kept.call_id ? `${reason}:${kept.call_id}` : row.id;
      if (counted.has(named)) continue;
      counted.add(named);
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
    if (data.length < SCREENED_PAGE) break;
  }
  return { total: counted.size, by_reason: byReason };
}
