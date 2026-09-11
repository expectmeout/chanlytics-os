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
import { json } from "../../../lib/http.js";
import { pg } from "../../../lib/pg.js";
import { waCredentialsForTenant } from "../../../lib/tenant-runtime.js";
import { labelsOf, listTemplates, templateRow } from "../../../lib/meta-templates.js";

/** Meta's own samples: on file, never offered. */
const SAMPLE_TEMPLATES = new Set(["hello_world"]);
import type { Json } from "../../../lib/workspace/db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const body = (await request.json().catch(() => null)) as { tenant_id?: unknown } | null;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
  if (!UUID.test(tenantId)) return json(400, { ok: false, error: "bad_tenant" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_db" });

  const { data: ch, error: chErr } = await db
    .from("tenant_channels")
    .select("id, waba_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (chErr) return json(500, { ok: false, error: "channel_read_failed", detail: chErr.message });
  if (!ch) return json(409, { ok: false, error: "no_channel" });
  if (!ch.waba_id) return json(409, { ok: false, error: "no_waba" });

  const creds = await waCredentialsForTenant(db, tenantId);
  if (!creds?.accessToken) return json(503, { ok: false, error: "no_token" });

  const listed = await listTemplates(creds.accessToken, ch.waba_id);
  if (!listed.ok) {
    console.error("wa_templates_list_failed", JSON.stringify({ tenant_id: tenantId, status: listed.status, error: listed.error.slice(0, 200) }));
    return json(502, { ok: false, error: "meta_failed", detail: listed.error });
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
    const { error } = await db
      .from("templates")
      .upsert(known.map((r) => ({ ...r, components: r.components as unknown as Json, variables: r.variables as unknown as Json })), { onConflict: "tenant_id,channel,name,language" });
    if (error) return json(500, { ok: false, error: "write_failed", detail: error.message });
  }
  if (fresh.length) {
    const { error } = await db
      .from("templates")
      .upsert(fresh.map((r) => ({ ...r, components: r.components as unknown as Json, variables: r.variables as unknown as Json, hidden_at: now.toISOString() })), { onConflict: "tenant_id,channel,name,language" });
    if (error) return json(500, { ok: false, error: "write_failed", detail: error.message });
  }
  const approved = rows.filter((r) => r.meta_status === "approved").length;
  const marketing = rows.filter((r) => r.meta_status === "approved" && r.category === "marketing").length;
  console.log("wa_templates_synced", JSON.stringify({ tenant_id: tenantId, seen: rows.length, approved, marketing }));
  return json(200, { ok: true, seen: rows.length, approved, marketing, synced_at: now.toISOString() });
}
