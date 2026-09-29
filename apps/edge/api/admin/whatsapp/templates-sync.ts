/**
 * POST /api/admin/whatsapp/templates-sync — one workspace's templates, as
 * Meta holds them, into the templates table.
 *
 * Body { tenant_id }. The number's credentials come from the same place a
 * send takes them (the channel's Vault secret, else the environment pair),
 * and the WABA id from the channel row. Every template Meta returns is
 * upserted on (tenant, channel, name, language); a row Meta does not return
 * is left exactly as it was — the one hand-written row is the booking-link
 * template the phone agent sends, and a sync that could silence it is not a
 * sync. Labels a person gave a variable are kept when the positions match.
 */
import { json, refuse } from "../../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../../lib/admin-auth.js";
import { pg } from "../../../lib/pg.js";
import { waCredentialsForTenant } from "../../../lib/tenant-runtime.js";
import { labelsOf, listTemplates, templateRow } from "../../../lib/whatsapp/meta-templates.js";
import { logger } from "../../../lib/log.js";

/** Meta's own samples: on file, never offered. */
const SAMPLE_TEMPLATES = new Set(["hello_world"]);
import type { Json } from "../../../lib/packages/db.js";

const L = logger();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/whatsapp/templates-sync");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { tenant_id?: unknown } | null;
  const ws = workspaceFor(auth, body?.tenant_id);
  if (!ws.ok) return ws.response;
  if (body) body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant");
  const db = pg();
  if (!db) return refuse(503, "no_database");

  const { data: ch, error: chErr } = await db
    .from("tenant_channels")
    .select("id, waba_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (chErr) return refuse(500, "channel_read_failed", chErr.message);
  if (!ch) return refuse(409, "no_channel");
  if (!ch.waba_id) return refuse(409, "no_waba");

  const creds = await waCredentialsForTenant(db, tenantId);
  // None on file, or none readable just now: a 503 either way, since this door is tried again by hand.
  if (creds.outcome !== "present") return refuse(503, "no_token");

  const listed = await listTemplates(creds.credentials.accessToken, ch.waba_id);
  if (!listed.ok) {
    L.error("wa_templates_list_failed", {
      tenant_id: tenantId,
      status: listed.status,
      error: listed.error.slice(0, 200),
    });
    return refuse(502, "meta_failed", listed.error);
  }

  const { data: existing } = await db
    .from("templates")
    .select("name, language, variables")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp");
  const keep = new Map((existing ?? []).map((r) => [`${r.name}|${r.language}`, labelsOf(r.variables)]));
  const now = new Date();
  const rows = listed.templates.map((t) => templateRow(t, tenantId, keep.get(`${t.name}|${t.language}`) ?? [], now));
  // Meta's sample lives in every new account and is nobody's message: hidden
  // from the composers on first sight. Rows already on file keep whatever
  // the workspace decided — hidden_at is not in the upsert.
  const fresh = rows.filter((r) => !keep.has(`${r.name}|${r.language}`) && SAMPLE_TEMPLATES.has(r.name));
  const known = rows.filter((r) => !fresh.includes(r));
  if (known.length) {
    const { error } = await db.from("templates").upsert(
      known.map((r) => ({
        ...r,
        components: r.components as unknown as Json,
        variables: r.variables as unknown as Json,
      })),
      { onConflict: "tenant_id,channel,name,language" },
    );
    if (error) return refuse(500, "write_failed", error.message);
  }
  if (fresh.length) {
    const { error } = await db.from("templates").upsert(
      fresh.map((r) => ({
        ...r,
        components: r.components as unknown as Json,
        variables: r.variables as unknown as Json,
        hidden_at: now.toISOString(),
      })),
      { onConflict: "tenant_id,channel,name,language" },
    );
    if (error) return refuse(500, "write_failed", error.message);
  }
  const approved = rows.filter((r) => r.meta_status === "approved").length;
  const marketing = rows.filter((r) => r.meta_status === "approved" && r.category === "marketing").length;
  L.info("wa_templates_synced", { tenant_id: tenantId, seen: rows.length, approved, marketing });
  return json(200, { ok: true, seen: rows.length, approved, marketing, synced_at: now.toISOString() });
}
