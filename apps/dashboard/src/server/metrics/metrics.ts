/**
 * The numbers behind Today, and the wires they are counted on.
 *
 * `metrics_summary` answers the routing rows. A workspace's email line is its
 * mailbox and this deployment's mail domain, which the database cannot see,
 * so it is added here, from `emailSetupFor`, the same read Setup and
 * Connections make. Both readers of the function come through this one door,
 * so the page's Today and Ask's Today count the same lines.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailWires, type MetricsSummaryDto } from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db";
import { emailSetupFor } from "../connections/email";
import { log, errField } from "@/server/log";

/** Null when the function answered nothing, or answered its own error; each caller refuses in its own words. */
export async function metricsSummaryFor(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  days: number,
): Promise<MetricsSummaryDto | null> {
  // Together, not waterfalled: one indexed row must not sit behind three
  // plpgsql aggregates on Today's wall clock.
  const [res, email] = await Promise.all([
    supabase.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: days }),
    // A mailbox that cannot be read is a line that cannot be counted, which is
    // its own state (callsRead is the same shape), never a blank Today and
    // never a count that is short by one.
    emailSetupFor(supabase, tenantId).catch((e: unknown) => {
      log.error("today_email_line_read_failed", { error: errField(e) });
      return null;
    }),
  ]);
  if (res.error) throw new Error(res.error.message);
  const dto = res.data as unknown as MetricsSummaryDto | null;
  if (!dto || (dto as unknown as { error?: string }).error) return null;
  if (email === null) return { ...dto, linesRead: false };
  const wires = emailWires(email);
  // Untouched where there is no email line: a deployment without the channel
  // gets exactly the payload the function answered.
  return wires.length ? { ...dto, channels: [...(dto.channels ?? []), ...wires] } : dto;
}
