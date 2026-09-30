import "server-only";

import { PLATFORM_DAYS_READ, type PlatformDayRowDto } from "@chanlytics/contracts";
import type { BackOffice } from "./platform";

/**
 * Each workspace's day, counted (00277 platform_metrics, rolled up nightly): the back office's read of the last days.
 *
 * On the platform's handle (backOffice), the only one granted platform_metrics_read. Like field data, it never fails
 * loudly: a read that fails leaves the back office's other cards standing and says it could not be read (null), and
 * a database 00277 has not reached has no days to show (none).
 */
export async function platformDays(office: BackOffice): Promise<PlatformDayRowDto[] | null> {
  const r = await office.db.rpc("platform_metrics_read", { p_days: PLATFORM_DAYS_READ.days }).then(
    (x) => x,
    () => ({ data: null, error: { code: "unreachable", message: "unreadable" } }),
  );
  if (r.error) return r.error.code === "PGRST202" ? [] : null;
  return (r.data ?? []).map((row) => ({
    tenant_id: row.tenant_id,
    name: row.name,
    day: row.day,
    messages_in: counts(row.messages_in),
    messages_out: counts(row.messages_out),
    asks: row.asks,
    answered: row.answered,
    replies_answered: row.replies_answered,
    replies_held: row.replies_held,
    replies_handed_off: row.replies_handed_off,
    brain_p95_ms: row.brain_p95_ms,
    provider_failures: counts(row.provider_failures),
    tokens: Number(row.tokens),
  }));
}

/** A stored {name: count} object as numbers; anything else in it is dropped. */
function counts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v))
    for (const [k, n] of Object.entries(v)) if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
  return out;
}
