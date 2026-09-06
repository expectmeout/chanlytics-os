/**
 * The calendar sweep: every hour, every workspace with a calendar connected
 * has the people its appointments name put in People — a phone in the
 * event is the key, the name as the event gives it, consent untouched.
 *
 * The same read the receptionists use (one fetch per five minutes, parsed
 * once), the same pure extraction the dashboard applies when an owner opens
 * the Calendar, so a person is created once whichever path saw them first.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database.
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { feedItemsFor } from "../../lib/availability.js";
import { addPeopleFromCalendar } from "../../lib/calendar-people.js";
import { parseTenantConfig, peopleFromItems } from "../../lib/workspace/contracts.js";

export const config = { maxDuration: 60 };

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "calendar" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error: keyErr } = await db.rpc("get_cron_sweep_key");
  if (keyErr || !expected) return json(503, { ok: false, error: "key_unavailable" });
  if (!presented || !secretsMatch(presented, expected as unknown as string)) return json(401, { ok: false, error: "unauthorized" });

  const now = new Date();
  const { data: configs, error } = await db.from("tenant_config").select("tenant_id, config");
  if (error) {
    L.error("calendar_configs_read_failed", { error: error.message });
    return json(500, { ok: false });
  }

  const out = { tenants: 0, seen: 0, added: 0, named: 0, failed: 0 };
  for (const row of configs ?? []) {
    const cfg = parseTenantConfig(row.config);
    const url = cfg?.calendar?.ical_url ?? null;
    if (!url) continue;
    out.tenants += 1;
    try {
      const { data: tenant } = await db.from("tenants").select("timezone").eq("id", row.tenant_id).maybeSingle();
      const tz = tenant?.timezone || "America/New_York";
      const items = await feedItemsFor(row.tenant_id, url, tz, now, cfg?.brain?.profile?.booking_rules?.max_days_ahead ?? 14);
      if (!items) { out.failed += 1; continue; }
      const people = peopleFromItems(items, (cfg?.brain?.profile?.services ?? []).map((s) => s.name), now.getTime());
      const r = await addPeopleFromCalendar(db, row.tenant_id, people);
      out.seen += r.seen; out.added += r.added; out.named += r.named;
      if (r.added || r.named) L.info("calendar_people_added", { tenant_id: row.tenant_id, ...r });
    } catch (e) {
      out.failed += 1;
      L.error("calendar_sweep_failed", { tenant_id: row.tenant_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  L.info("calendar_sweep", out);
  return json(200, { ok: true, ...out });
}
