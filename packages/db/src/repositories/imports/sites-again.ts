/**
 * Websites due to be read again (decision 0134, amended: E4): a business's site is read once a month on its own, so the
 * photos and videos it shows since come into the Library with no link pasted. Across every workspace, so the service role's.
 *
 * Due is when its last try started before `triedBefore` and is over: the run of its photos and videos on the ledger
 * (`imports`, source `website_media`, 00626), whose start each read stamps, whether it found anything or failed. A site read
 * before the ledger kept that run is found by its read (`business_reads`) instead, until its first run is on the ledger. Only
 * an active workspace's: a paused, test or lead's preview workspace is never read on its own. The longest waiting first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, type TenantId } from "@chanlytics/contracts";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The run a read of a site's photos and videos keeps on the ledger. */
const SITE_RUN = "website_media";

/** The workspaces whose website is due to be read again, the longest waiting first, at most `limit`. */
export async function listSitesToReadAgain(db: Db, args: { triedBefore: string; limit: number }): Promise<TenantId[]> {
  const [runs, reads] = await Promise.all([
    db
      .from("imports")
      .select("tenant_id, started_at, tenants!inner(status)")
      .eq("source", SITE_RUN)
      .in("state", ["done", "failed"])
      .lt("started_at", args.triedBefore)
      .eq("tenants.status", "active")
      .order("started_at", { ascending: true })
      .limit(args.limit),
    db
      .from("business_reads")
      .select("tenant_id, read_at, tenants!inner(status)")
      .eq("source", "website")
      .lt("read_at", args.triedBefore)
      .eq("tenants.status", "active")
      .order("read_at", { ascending: true })
      .limit(args.limit),
  ]);
  if (runs.error) throw new DbFailure(runs.error, "sites to read again: runs");
  if (reads.error) throw new DbFailure(reads.error, "sites to read again: reads");
  // A read whose workspace has a run on the ledger is that run's to time: its last try may be recent though its read is old.
  const readBefore = reads.data.map((r) => r.tenant_id);
  const timed = new Set<string>();
  if (readBefore.length) {
    const held = await db.from("imports").select("tenant_id").eq("source", SITE_RUN).in("tenant_id", readBefore);
    if (held.error) throw new DbFailure(held.error, "sites to read again: their runs");
    for (const r of held.data) timed.add(r.tenant_id);
  }
  const due = [
    ...runs.data.map((r) => ({ tenantId: r.tenant_id, since: r.started_at ?? "" })),
    ...reads.data.filter((r) => !timed.has(r.tenant_id)).map((r) => ({ tenantId: r.tenant_id, since: r.read_at })),
  ].sort((a, b) => a.since.localeCompare(b.since));
  return [...new Set(due.map((d) => d.tenantId))].slice(0, args.limit);
}
