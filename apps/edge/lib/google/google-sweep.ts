/**
 * The Google sweep: every hour, every listing not read for twenty hours is
 * read again — the rating, the count, the five reviews Google shows — and
 * every connected profile not synced for twenty hours is synced — every
 * review, every reply. What changed reaches the bell (lib/google's
 * listing-check.ts and profile-sync.ts, shared with the link, the connect
 * and "Check now"). Forty of each per tick, the never-read first, then the
 * oldest, and none started past the tick's budget (GOOGLE_SWEEP_BUDGET_MS):
 * what it leaves is `remaining`, read the next hour. A failure stays on its
 * row and is tried again next hour.
 *
 * The route is api/cron/google.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00069).
 */
import { json } from "../http.js";
import { placesKey, profileClient } from "./google-config.js";
import { checkListing, connectionsDue, listingsDue } from "./listing-check.js";
import { syncProfile } from "./profile-sync.js";
import type { SweepTick } from "../ops/sweep-door.js";

/** A bound per tick; a backlog drains over successive hours rather than one long call. */
const GOOGLE_PER_TICK = 40;
/**
 * How long into the tick, from the door, a listing or a profile may still be started before the rest of the page is
 * left to the next hour: forty reads and forty syncs in turn, each a call or several of up to ten seconds (channels
 * PLACES_TIMEOUT_MS), is minutes against the sixty-second function (vercel.json), and a tick killed part way answered
 * nothing, so its request read as a timeout and the sweep as broken. A read started at the line still has its own time
 * to finish. What the budget leaves is counted as remaining, unread and unstamped, and keeps its place at the front of
 * the next page, as the calendar's does (sweep-rotation.ts CALENDAR_SWEEP_BUDGET_MS).
 */
const GOOGLE_SWEEP_BUDGET_MS = 35_000;
export async function sweepGoogle({ db, L, started }: SweepTick): Promise<Response> {
  const places = !!placesKey();
  const profile = !!profileClient();
  if (!places && !profile) return json(200, { ok: true, skipped: "no_places_key" });

  const now = new Date();
  const zones = new Map<string, string>();
  const tzOf = async (ids: string[]) => {
    const missing = ids.filter((id) => !zones.has(id));
    if (!missing.length) return;
    const { data: tenants } = await db.from("tenants").select("id, timezone").in("id", missing);
    for (const t of tenants ?? []) zones.set(t.id, t.timezone || "America/New_York");
  };

  const out = {
    listings_due: 0,
    listings_read: 0,
    profiles_due: 0,
    profiles_synced: 0,
    fresh: 0,
    counted: 0,
    failed: 0,
  };
  /** What the budget left of the pages, for the next hour. */
  let remaining = 0;
  // Out of time: the rest of this page is remaining, not read, and not stamped.
  const overBudget = (what: "listings" | "profiles", unread: number): boolean => {
    if (Date.now() - started <= GOOGLE_SWEEP_BUDGET_MS) return false;
    remaining += unread;
    L.warn("google_sweep_over_budget", { what, unread });
    return true;
  };
  if (places) {
    let due;
    try {
      due = await listingsDue(db, now, GOOGLE_PER_TICK);
    } catch (e) {
      L.error("google_due_read_failed", { error: e instanceof Error ? e.message : String(e) });
      return json(500, { ok: false });
    }
    out.listings_due = due.length;
    await tzOf(due.map((d) => d.tenant_id));
    for (const [i, row] of due.entries()) {
      if (overBudget("listings", due.length - i)) break;
      try {
        const r = await checkListing(db, row, zones.get(row.tenant_id) ?? "America/New_York", "keep", now);
        if (r.ok) {
          out.listings_read += 1;
          out.fresh += r.fresh;
          out.counted += r.counted;
        } else out.failed += 1;
      } catch (e) {
        out.failed += 1;
        L.error("google_sweep_failed", { tenant_id: row.tenant_id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  if (profile) {
    let due;
    try {
      due = await connectionsDue(db, now, GOOGLE_PER_TICK);
    } catch (e) {
      L.error("google_profiles_due_read_failed", { error: e instanceof Error ? e.message : String(e) });
      return json(500, { ok: false, ...out });
    }
    out.profiles_due = due.length;
    await tzOf(due.map((d) => d.tenant_id));
    for (const [i, conn] of due.entries()) {
      if (overBudget("profiles", due.length - i)) break;
      try {
        const r = await syncProfile(db, conn, zones.get(conn.tenant_id) ?? "America/New_York", now);
        if (r.ok) {
          out.profiles_synced += 1;
          out.fresh += r.fresh;
        } else out.failed += 1;
      } catch (e) {
        out.failed += 1;
        L.error("google_profile_sweep_failed", {
          tenant_id: conn.tenant_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  L.info("google_sweep", { ...out, remaining });
  return json(200, { ok: true, ...out, remaining });
}
