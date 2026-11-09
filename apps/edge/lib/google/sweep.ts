/**
 * The Google sweep: every hour, each workspace with a listing not read for twenty hours, or a connected profile not synced for
 * twenty hours, is handed a job (decision 0115, 00569), and that job reads them: the rating, the count, the five reviews
 * Google shows, every review and every reply of a profile. What changed reaches the bell (lib/google's listing-check.ts and
 * profile-sync.ts, shared with the link, the connect and "Check now"). A failure stays on its row and is tried again next hour.
 *
 * This read them itself, forty of each an hour and no more inside a sixty-second function, so at a thousand workspaces a
 * listing was read once a day at best, with nothing left over for the profiles behind it.
 *
 * The route is api/cron/google.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00069).
 */
import type { TenantId } from "@chanlytics/contracts";
import { DEFAULT_TIMEZONE } from "@chanlytics/contracts";
import { handOutJobs } from "@chanlytics/db/jobs";
import { json } from "../shared/http.js";
import { logger, type Logger } from "../shared/log.js";
import { placesKey, profileClient } from "../shared/google/config.js";
import { HAND_OUT_SPREAD_SECONDS } from "../shared/sweep-rotation.js";
import { checkListing, listConnectionsDue, listListingsDue } from "./listing-check.js";

/** A row of each read's page. */
type ListingDue = Awaited<ReturnType<typeof listListingsDue>>[number];
type ConnectionDue = Awaited<ReturnType<typeof listConnectionsDue>>[number];
import { syncProfile } from "./profile-sync.js";
import type { SweepTick } from "../ops/sweep-door.js";
import { listWorkspaceZones } from "@chanlytics/db/workspace";

/** The most rows the clock reads to find the workspaces due: what is beyond them is handed out the next hour. */
const GOOGLE_DUE_A_TICK = 5_000;

/** The most of a workspace's listings, or its connections, one job takes up (a workspace holds one of each today). */
const GOOGLE_A_JOB = 10;

export async function sweepGoogle({ db, L }: SweepTick): Promise<Response> {
  const places = !!placesKey();
  const profile = !!profileClient();
  if (!places && !profile) return json(200, { ok: true, skipped: "no_places_key" });
  const now = new Date();
  const tenants = new Set<TenantId>();
  try {
    if (places) for (const row of await listListingsDue(db, now, GOOGLE_DUE_A_TICK)) tenants.add(row.tenant_id);
  } catch (e) {
    L.error("google_due_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
  try {
    if (profile) for (const row of await listConnectionsDue(db, now, GOOGLE_DUE_A_TICK)) tenants.add(row.tenant_id);
  } catch (e) {
    L.error("google_profiles_due_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
  const handed = await handOutJobs(db, {
    kind: "google_read",
    tenants: [...tenants],
    spreadSeconds: HAND_OUT_SPREAD_SECONDS,
  });
  L.info("google_sweep", { due: tenants.size, handed });
  return json(200, { ok: true, due: tenants.size, handed });
}

/** What one workspace's job came to, for its line. */
type GoogleRead = Record<
  "listings_due" | "listings_read" | "profiles_due" | "profiles_synced" | "fresh" | "counted" | "failed" | "left",
  number
>;

/** One workspace's zone: a zone that cannot be read is said, and the day falls back to the default, as a workspace with none does. */
async function zoneOf(db: SweepTick["db"], tenantId: TenantId, log: Logger): Promise<string> {
  const { data, error } = await listWorkspaceZones(db, [tenantId]);
  if (error) log.warn("google_due_read_failed", { what: "zones", error: error.message });
  return data?.at(0)?.timezone || DEFAULT_TIMEZONE;
}

/** One job's read: where it is, when it stops starting anything, and what it has come to so far. */
interface GoogleTurn {
  db: SweepTick["db"];
  tenantId: TenantId;
  zone: string;
  now: Date;
  deadline: number;
  log: Logger;
  out: GoogleRead;
}

async function readListings(
  { db, tenantId, zone, now, deadline, log, out }: GoogleTurn,
  rows: ListingDue[],
): Promise<void> {
  for (const [i, row] of rows.entries()) {
    if (Date.now() > deadline) {
      out.left += rows.length - i;
      return;
    }
    try {
      const r = await checkListing(db, row, zone, { now });
      if (r.ok) {
        out.listings_read += 1;
        out.fresh += r.fresh;
        out.counted += r.counted;
      } else out.failed += 1;
    } catch (e) {
      out.failed += 1;
      log.error("google_sweep_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

async function syncProfiles(
  { db, tenantId, zone, now, deadline, log, out }: GoogleTurn,
  rows: ConnectionDue[],
): Promise<void> {
  for (const [i, conn] of rows.entries()) {
    if (Date.now() > deadline) {
      out.left += rows.length - i;
      return;
    }
    try {
      const r = await syncProfile(db, conn, zone, now);
      if (r.ok) {
        out.profiles_synced += 1;
        out.fresh += r.fresh;
      } else out.failed += 1;
    } catch (e) {
      out.failed += 1;
      log.error("google_profile_sweep_failed", {
        tenant_id: tenantId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * One workspace's google_read: what is due is asked again, of this workspace alone, when the job runs. A read that fails stays
 * on its row and is tried the next hour; none starts after the deadline, and what is left stays due. Only a page that cannot be
 * read throws, and the ledger tries that again.
 */
async function readWorkspaceGoogle(
  db: SweepTick["db"],
  tenantId: TenantId,
  deadline: number,
  log: Logger,
): Promise<GoogleRead | null> {
  const now = new Date();
  const listings = placesKey() ? await listListingsDue(db, now, GOOGLE_A_JOB, tenantId) : [];
  const connections = profileClient() ? await listConnectionsDue(db, now, GOOGLE_A_JOB, tenantId) : [];
  if (listings.length === 0 && connections.length === 0) return null;
  const out: GoogleRead = {
    listings_due: listings.length,
    listings_read: 0,
    profiles_due: connections.length,
    profiles_synced: 0,
    fresh: 0,
    counted: 0,
    failed: 0,
    left: 0,
  };
  const turn = { db, tenantId, zone: await zoneOf(db, tenantId, log), now, deadline, log, out };
  await readListings(turn, listings);
  await syncProfiles(turn, connections);
  log.info("google_read", { tenant_id: tenantId, ...out });
  return out;
}

/** google_read as the job runner takes it. */
export function googleReader(db: SweepTick["db"]) {
  return {
    read: async (
      job: { tenant_id: TenantId },
      deadline: number,
    ): Promise<{ read: GoogleRead } | { skipped: string }> => {
      const read = await readWorkspaceGoogle(db, job.tenant_id, deadline, logger({ tenant_id: job.tenant_id }));
      return read ? { read } : { skipped: "not due" };
    },
  };
}
