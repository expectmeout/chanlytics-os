/**
 * POST /api/admin/you-are-live — the first run's Finish recorded a workspace's first activation of its calls, and its
 * owner is emailed that the receptionist is answering (the "you're live" email, decision 4 of
 * docs/superpowers/specs/2026-09-24-first-run-design.md; canvas C2).
 *
 * The dashboard's capability route calls it once, on the first activation, from production only, and treats a failure
 * as a shrug: the activation is already on record. What it says is the workspace's own: its numbers, where a caller who
 * asks for a person goes, and its test call (who called and how long). Every sentence is contracts' (youAreLiveEmail).
 * Addressed to the workspace's alert addresses only (mail(): no bell row, and nothing to the platform when there are
 * none). Signed admin token only.
 */
import { json, refuse } from "../../lib/http.js";
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { mail, reachesTenant } from "../../lib/ops/notify.js";
import { loadTenantNotifications } from "../../lib/tenant-runtime.js";
import { logger, adminDoor } from "../../lib/log.js";
import { dashboardOrigin } from "../../lib/dashboard-origin.js";
import { parseTenantConfigResult, spokenDuration, youAreLiveEmail } from "../../lib/packages/contracts.js";

const L = logger();

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/you-are-live");
  if (!auth.ok) return auth.response;
  const db = pg();
  if (!db) return refuse(503, "no_database");

  const body = await readBody<{ tenant_id?: string }>(request);
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = typeof ws.tenantId === "string" ? ws.tenantId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id is required");

  const [tenant, voice, kept, cfg, call] = await Promise.all([
    db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle(),
    db
      .from("tenant_channels")
      .select("number_e164")
      .eq("tenant_id", tenantId)
      .eq("kind", "voice")
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    db
      .from("lines")
      .select("e164, forwarding_state, facts")
      .eq("tenant_id", tenantId)
      .eq("kind", "forwarded")
      .neq("forwarding_state", "none")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
    db
      .from("calls")
      .select("from_e164, duration_ms")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .neq("status", "not_connected")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // A read that failed would send a thinner email that says less than is true: none is sent instead.
  const failed = [tenant, voice, kept, cfg, call].find((q) => q.error);
  if (failed?.error) return refuse(503, "read_failed", failed.error.message);
  if (!tenant.data) return refuse(404, "not_found", "no such workspace");

  const target = { tenantId, ...(await loadTenantNotifications(db, tenantId)) };
  // Only the workspace's own people: without an address of theirs there is nobody to tell.
  if (!reachesTenant(target)) {
    L.info("you_are_live_unaddressed", { tenant_id: tenantId });
    return json(200, { ok: true, sent: false, why: "no_address" });
  }
  const parsed = parseTenantConfigResult(cfg.data?.config);
  const brain = parsed.ok ? parsed.config.brain : null;
  // The kept number is said only once a call proved its forwarding, and with the mode saved.
  const proven = kept.data?.forwarding_state === "verified";
  const facts = (kept.data?.facts ?? null) as { mode?: unknown } | null;
  const message = youAreLiveEmail({
    business: brain?.business_name || tenant.data.name,
    own: voice.data?.number_e164 ?? null,
    kept: proven ? (kept.data?.e164 ?? null) : null,
    always: facts?.mode === "always",
    handoff: brain?.profile?.handoff_number ?? null,
    test: call.data
      ? {
          from: call.data.from_e164,
          length: call.data.duration_ms ? spokenDuration(call.data.duration_ms) : null,
        }
      : null,
    todayUrl: `${dashboardOrigin()}/w/${encodeURIComponent(tenant.data.slug)}#/today`,
  });
  const sent = await mail(target, message);
  L.info("you_are_live_sent", { tenant_id: tenantId, sent });
  return json(sent ? 200 : 502, { ok: sent, sent });
});
