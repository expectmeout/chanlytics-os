/**
 * POST /api/admin/whatsapp/templates-delete — one template gone from Meta
 * and from the table.
 *
 * Body { tenant_id, template_id }. Meta's delete is by name (and the
 * template's own id, so one language goes and not every language of that
 * name). A template Meta no longer has is deleted here anyway — the row was
 * the stale one. Sends that named it fail from now on, which is the point.
 */
import { json } from "../../../lib/http.js";
import { pg } from "../../../lib/pg.js";
import { waCredentialsForTenant } from "../../../lib/tenant-runtime.js";
import { deleteTemplate } from "../../../lib/meta-templates.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const body = (await request.json().catch(() => null)) as { tenant_id?: unknown; template_id?: unknown } | null;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  if (!UUID.test(tenantId) || !UUID.test(templateId)) return json(400, { ok: false, error: "bad_request" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_db" });

  const { data: row } = await db
    .from("templates")
    .select("id, name, language, meta_id")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!row) return json(404, { ok: false, error: "not_found" });
  const { data: ch } = await db
    .from("tenant_channels")
    .select("id, waba_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!ch?.waba_id) return json(409, { ok: false, error: "no_waba" });
  const creds = await waCredentialsForTenant(db, tenantId);
  if (!creds.accessToken) return json(503, { ok: false, error: "no_token" });

  const gone = await deleteTemplate(creds.accessToken, ch.waba_id, row.name, row.meta_id);
  // Not found at Meta is a delete that already happened.
  if (!gone.ok && gone.status !== 404 && !/does not exist|not found|Unsupported get request/i.test(gone.error)) {
    console.error("wa_template_delete_failed", JSON.stringify({ tenant_id: tenantId, name: row.name, status: gone.status, error: gone.error.slice(0, 300) }));
    return json(502, { ok: false, error: "meta_refused", detail: gone.error });
  }
  const { error } = await db.from("templates").delete().eq("id", row.id);
  if (error) return json(500, { ok: false, error: "write_failed", detail: error.message });
  console.log("wa_template_deleted", JSON.stringify({ tenant_id: tenantId, name: row.name, language: row.language, at_meta: gone.ok }));
  return json(200, { ok: true, id: row.id, name: row.name, at_meta: gone.ok });
}
