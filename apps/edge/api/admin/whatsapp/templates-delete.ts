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
import { authorizeAdmin, workspaceFor } from "../../../lib/admin-auth.js";
import { pg } from "../../../lib/pg.js";
import { waCredentialsForTenant } from "../../../lib/tenant-runtime.js";
import { deleteTemplate } from "../../../lib/whatsapp/meta-templates.js";
import { logger } from "../../../lib/log.js";

const L = logger();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/whatsapp/templates-delete");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as { tenant_id?: unknown; template_id?: unknown } | null;
  const ws = workspaceFor(auth, body?.tenant_id);
  if (!ws.ok) return ws.response;
  if (body) body.tenant_id = ws.tenantId ?? undefined;
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
  // None on file, or none readable just now: a 503 either way, since this door is tried again by hand.
  if (creds.outcome !== "present") return json(503, { ok: false, error: "no_token" });
  const accessToken = creds.credentials.accessToken;

  // Meta's delete takes a name, and the template's own id NARROWS it to one
  // language. WITHOUT the id it removes every language of that name and locks
  // the name for thirty days — so a row that was never synced (the seeded
  // booking_link_v1 predates the column; a sync only writes what Meta returns)
  // must not be sent to Meta at all. It is still removed from here: Meta has
  // no id for it, which is as close to "Meta does not have it" as this door
  // can get, and refusing the local delete too left the row undeletable for
  // ever — the sync the refusal told the operator to run can never fill in an
  // id for a template Meta never had.
  const gone = row.meta_id
    ? await deleteTemplate(accessToken, ch.waba_id, row.name, row.meta_id)
    : ({ ok: false, status: 404, error: "not synced: no template id on file, so Meta was not asked" } as const);
  if (!row.meta_id)
    L.warn("wa_template_delete_unsynced", { tenant_id: tenantId, name: row.name, language: row.language });
  // Not found at Meta is a delete that already happened.
  if (!gone.ok && gone.status !== 404 && !/does not exist|not found|Unsupported get request/i.test(gone.error)) {
    L.error("wa_template_delete_failed", {
      tenant_id: tenantId,
      name: row.name,
      status: gone.status,
      error: gone.error.slice(0, 300),
    });
    return json(502, { ok: false, error: "meta_refused", detail: gone.error });
  }
  const { error } = await db.from("templates").delete().eq("id", row.id);
  if (error) return json(500, { ok: false, error: "write_failed", detail: error.message });
  L.info("wa_template_deleted", { tenant_id: tenantId, name: row.name, language: row.language, at_meta: gone.ok });
  return json(200, { ok: true, id: row.id, name: row.name, at_meta: gone.ok });
}
