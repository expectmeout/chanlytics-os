/**
 * The Google sweep: every hour, every listing not read for twenty hours is
 * read again — the rating, the count, the five reviews Google shows — and
 * every connected profile not synced for twenty hours is synced — every
 * review, every reply. What changed reaches the bell (lib/google.ts, shared
 * with the link, the connect and "Check now"). Forty of each per tick, the
 * never-read first, then the oldest; a failure stays on its row and is
 * tried again next hour.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00069).
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { checkListing, connectionsDue, listingsDue, placesKey, profileClient, syncProfile } from "../../lib/google.js";

export const config = { maxDuration: 60 };

/** A bound per tick; a backlog drains over successive hours rather than one long call. */
const MAX_PER_TICK = 40;

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "google" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error: keyErr } = await db.rpc("get_cron_sweep_key");
  if (keyErr || !expected) return json(503, { ok: false, error: "key_unavailable" });
  if (!presented || !secretsMatch(presented, expected as unknown as string)) return json(401, { ok: false, error: "unauthorized" });
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

  const out = { listings_due: 0, listings_read: 0, profiles_due: 0, profiles_synced: 0, fresh: 0, counted: 0, failed: 0 };
  if (places) {
    let due;
    try {
      due = await listingsDue(db, now, MAX_PER_TICK);
    } catch (e) {
      L.error("google_due_read_failed", { error: e instanceof Error ? e.message : String(e) });
      return json(500, { ok: false });
    }
    out.listings_due = due.length;
    await tzOf(due.map((d) => d.tenant_id));
    for (const row of due) {
      try {
        const r = await checkListing(db, row, zones.get(row.tenant_id) ?? "America/New_York", now);
        if (r.ok) { out.listings_read += 1; out.fresh += r.fresh; out.counted += r.counted; }
        else out.failed += 1;
      } catch (e) {
        out.failed += 1;
        L.error("google_sweep_failed", { tenant_id: row.tenant_id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  if (profile) {
    let due;
    try {
      due = await connectionsDue(db, now, MAX_PER_TICK);
    } catch (e) {
      L.error("google_profiles_due_read_failed", { error: e instanceof Error ? e.message : String(e) });
      return json(500, { ok: false, ...out });
    }
    out.profiles_due = due.length;
    await tzOf(due.map((d) => d.tenant_id));
    for (const conn of due) {
      try {
        const r = await syncProfile(db, conn, zones.get(conn.tenant_id) ?? "America/New_York", now);
        if (r.ok) { out.profiles_synced += 1; out.fresh += r.fresh; }
        else out.failed += 1;
      } catch (e) {
        out.failed += 1;
        L.error("google_profile_sweep_failed", { tenant_id: conn.tenant_id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  L.info("google_sweep", out);
  return json(200, { ok: true, ...out });
}
