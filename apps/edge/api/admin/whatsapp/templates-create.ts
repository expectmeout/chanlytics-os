/**
 * POST /api/admin/whatsapp/templates-create — a template written in
 * Chanlytics, submitted to Meta for review, kept as a row.
 *
 * Body { tenant_id, user_id, name, language, category, components, body,
 * examples }. The dashboard already checked what Meta refuses at the wire;
 * this sends the create call on the number's own credentials, keeps Meta's
 * answer (pending, sometimes approved at once, sometimes rejected with a
 * reason) as the row's status, and hands Meta's own words back when it says
 * no, so the person can fix the message rather than guess.
 */
import { json, refuse } from "../../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../../lib/admin-auth.js";
import { pg } from "../../../lib/pg.js";
import { waCredentialsForTenant } from "../../../lib/tenant-runtime.js";
import {
  createTemplate,
  mapCategory,
  mapStatus,
  type MetaTemplateComponent,
} from "../../../lib/whatsapp/meta-templates.js";
import type { Json } from "../../../lib/packages/db.js";
import { logger } from "../../../lib/log.js";

const L = logger();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[a-z0-9_]{1,512}$/;

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/whatsapp/templates-create");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    tenant_id?: unknown;
    user_id?: unknown;
    name?: unknown;
    language?: unknown;
    category?: unknown;
    components?: unknown;
    body?: unknown;
    examples?: unknown;
  } | null;
  const ws = workspaceFor(auth, body?.tenant_id);
  if (!ws.ok) return ws.response;
  if (body) body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
  const userId = typeof body?.user_id === "string" && UUID.test(body.user_id) ? body.user_id : null;
  const name = typeof body?.name === "string" ? body.name : "";
  const language = typeof body?.language === "string" ? body.language : "";
  const category = typeof body?.category === "string" ? body.category.toUpperCase() : "";
  const components = Array.isArray(body?.components) ? (body.components as MetaTemplateComponent[]) : null;
  const text = typeof body?.body === "string" ? body.body : null;
  const examples = Array.isArray(body?.examples) ? (body.examples as unknown[]).map(String) : [];
  // The words a person gave each slot, kept on the row so the composers can say them.
  const labels = Array.isArray((body as { labels?: unknown })?.labels)
    ? (body as { labels: unknown[] }).labels.map((l) =>
        String(l ?? "")
          .trim()
          .slice(0, 40),
      )
    : [];
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant");
  if (!NAME.test(name) || !language || !["MARKETING", "UTILITY"].includes(category) || !components || !text) {
    return refuse(400, "bad_template");
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");

  const { data: ch } = await db
    .from("tenant_channels")
    .select("id, waba_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!ch) return refuse(409, "no_channel");
  if (!ch.waba_id) return refuse(409, "no_waba");
  const creds = await waCredentialsForTenant(db, tenantId);
  // None on file, or none readable just now: a 503 either way, since this door is tried again by hand.
  if (creds.outcome !== "present") return refuse(503, "no_token");

  const made = await createTemplate(creds.credentials.accessToken, ch.waba_id, {
    name,
    language,
    category,
    components,
  });
  if (!made.ok) {
    L.error("wa_template_create_failed", {
      tenant_id: tenantId,
      name,
      status: made.status,
      error: made.error.slice(0, 300),
    });
    return refuse(502, "meta_refused", made.error);
  }

  const status = mapStatus(made.data.status);
  const positions = [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  const variables = positions.map((n) => ({
    position: n,
    label: labels[n - 1] || `Value ${n}`,
    example: examples[n - 1] ?? null,
  }));
  const row = {
    tenant_id: tenantId,
    channel: "whatsapp",
    name,
    language,
    meta_status: status,
    category: mapCategory(made.data.category ?? category),
    meta_id: made.data.id,
    components: components as unknown as Json,
    body_preview: text,
    variables: variables as unknown as Json,
    rejected_reason: null,
    synced_at: new Date().toISOString(),
    source: "chanlytics",
    created_by: userId,
  };
  const { data: saved, error } = await db
    .from("templates")
    .upsert(row, { onConflict: "tenant_id,channel,name,language" })
    .select("id")
    .single();
  if (error || !saved) return refuse(500, "write_failed", error?.message);
  L.info("wa_template_created", { tenant_id: tenantId, name, language, status, meta_id: made.data.id });
  return json(200, { ok: true, id: saved.id, meta_id: made.data.id, meta_status: status });
}
