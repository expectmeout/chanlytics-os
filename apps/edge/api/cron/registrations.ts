/**
 * The registration sweep: every hour, every line whose registration is
 * still with the carriers is asked where it stands, and a campaign that
 * could not be filed while the brand was in progress is filed now.
 *
 * Without this, "waiting on carriers" was a state nothing ever left: the
 * campaign is only filed by a status check, and nothing was calling one.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00077).
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { dashboardOrigin } from "../../lib/billing.js";
import { registerLine, syncRegistration } from "../../lib/a2p.js";

export const config = { maxDuration: 60 };

/** A bound per tick; a backlog drains over successive hours rather than one long call. */
const MAX_PER_TICK = 20;

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "registrations" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error: keyErr } = await db.rpc("get_cron_sweep_key");
  if (keyErr || !expected) return json(503, { ok: false, error: "key_unavailable" });
  if (!presented || !secretsMatch(presented, expected as unknown as string)) return json(401, { ok: false, error: "unauthorized" });

  // Only lines the carriers still hold, oldest first, so a backlog drains in order.
  const { data: lines, error } = await db
    .from("lines")
    .select("*")
    .eq("sms_state", "registering")
    .not("brand_sid", "is", null)
    .order("state_since", { ascending: true })
    .limit(MAX_PER_TICK);
  if (error) return json(503, { ok: false, error: error.message });
  if (!lines?.length) return json(200, { ok: true, checked: 0 });

  const origin = dashboardOrigin();
  let filed = 0;
  let moved = 0;
  for (const line of lines) {
    try {
      const r = await syncRegistration(db, line);
      if (!r.ok) continue;
      if (r.smsState !== "registering") moved++;
      // The wait's own ending: the brand is through, so the campaign can go.
      if (r.brand === "APPROVED" && !line.campaign_sid) {
        const rec = await db.from("business_records").select("*").eq("tenant_id", line.tenant_id).maybeSingle();
        const tenant = await db.from("tenants").select("name, slug").eq("id", line.tenant_id).maybeSingle();
        const fresh = await db.from("lines").select("*").eq("id", line.id).maybeSingle();
        if (rec.data && tenant.data && fresh.data) {
          const out = await registerLine(db, {
            line: fresh.data,
            record: rec.data,
            workspaceName: tenant.data.name,
            optInUrl: `${origin}/yes/${tenant.data.slug}`,
            privacyUrl: `${origin}/privacy`,
            termsUrl: `${origin}/terms`,
            mock: fresh.data.reg_mock,
          });
          if (out.ok) filed++;
        }
      }
    } catch (e) {
      L.error("registration_sweep_line_failed", { line_id: line.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  L.info("registration_sweep", { checked: lines.length, campaigns_filed: filed, states_moved: moved });
  return json(200, { ok: true, checked: lines.length, campaigns_filed: filed, states_moved: moved });
}
