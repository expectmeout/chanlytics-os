/**
 * A workspace's WhatsApp templates, from the dashboard's Templates pane: written in Chanlytics and submitted to Meta
 * for review, deleted at Meta and from the table, and synced from what Meta holds.
 * api/admin/whatsapp/{templates-create,templates-delete,templates-sync}.ts knock (a signed admin token, the workspace
 * and the body); each verb here is everything its door does after that.
 *
 * Every one acts on the number's own credentials (the channel's Vault secret, else the environment pair) and the WABA
 * id on the channel row, so Meta is spoken to as the business, and a workspace with no channel, no WABA or no token is
 * refused before Meta is asked.
 */
import { json, refuse } from "../http.js";
import { personFor, workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { waCredentialsForTenant } from "../tenant-runtime.js";
import {
  createTemplate,
  mapCategory,
  mapStatus,
  deleteTemplate,
  labelsOf,
  listTemplates,
  templateRow,
  type MetaTemplateComponent,
} from "./meta-templates.js";
import type { Json } from "../packages/db.js";
import { logger } from "../log.js";
import { UUID } from "../packages/contracts.js";

const NAME = /^[a-z0-9_]{1,512}$/;

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
export async function createWhatsappTemplate(
  auth: Admitted,
  body: Partial<{
    tenant_id?: unknown;
    user_id?: unknown;
    name?: unknown;
    language?: unknown;
    category?: unknown;
    components?: unknown;
    body?: unknown;
    examples?: unknown;
    labels?: unknown;
  }>,
): Promise<Response> {
  const L = logger();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  const userId = personFor(auth, body.user_id);
  const name = typeof body.name === "string" ? body.name : "";
  const language = typeof body.language === "string" ? body.language : "";
  const category = typeof body.category === "string" ? body.category.toUpperCase() : "";
  const components = Array.isArray(body.components) ? (body.components as MetaTemplateComponent[]) : null;
  const text = typeof body.body === "string" ? body.body : null;
  const examples = Array.isArray(body.examples) ? (body.examples as unknown[]).map(String) : [];
  // The words a person gave each slot, kept on the row so the composers can say them.
  const labels = Array.isArray(body.labels)
    ? body.labels.map((l: unknown) =>
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

  // The account of the oldest active number, whose credentials waCredentialsForTenant gives: a workspace may hold two.
  const { data: ch } = await db
    .from("tenant_channels")
    .select("id, waba_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ch) return refuse(409, "no_channel");
  if (!ch.waba_id) return refuse(409, "no_waba");
  const creds = await waCredentialsForTenant(db, tenantId);
  const token = creds.outcome === "present" ? creds.credentials.accessToken : null;
  if (!token) return refuse(503, "no_token");
  const made = await createTemplate(token, ch.waba_id, { name, language, category, components });
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

/**
 * POST /api/admin/whatsapp/templates-delete — one template gone from Meta
 * and from the table.
 *
 * Body { tenant_id, template_id }. Meta's delete is by name (and the
 * template's own id, so one language goes and not every language of that
 * name). A template Meta no longer has is deleted here anyway — the row was
 * the stale one. Sends that named it fail from now on, which is the point.
 */
export async function deleteWhatsappTemplate(
  auth: Admitted,
  body: Partial<{ tenant_id?: unknown; template_id?: unknown }>,
): Promise<Response> {
  const L = logger();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  const templateId = typeof body.template_id === "string" ? body.template_id : "";
  if (!UUID.test(tenantId) || !UUID.test(templateId)) return refuse(400, "bad_request");
  const db = pg();
  if (!db) return refuse(503, "no_database");

  const { data: row } = await db
    .from("templates")
    .select("id, name, language, meta_id")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!row) return refuse(404, "not_found");

  const { data: ch } = await db
    .from("tenant_channels")
    .select("id, waba_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ch?.waba_id) return refuse(409, "no_waba");
  const creds = await waCredentialsForTenant(db, tenantId);
  // None on file, or none readable just now: a 503 either way, since this door is tried again by hand.
  if (creds.outcome !== "present") return refuse(503, "no_token");
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
    return refuse(502, "meta_refused", gone.error);
  }
  const { error } = await db.from("templates").delete().eq("id", row.id).eq("tenant_id", tenantId);
  if (error) return refuse(500, "write_failed", error.message);
  L.info("wa_template_deleted", { tenant_id: tenantId, name: row.name, language: row.language, at_meta: gone.ok });
  return json(200, { ok: true, id: row.id, name: row.name, at_meta: gone.ok });
}

/** Meta's own samples: on file, never offered. */
const SAMPLE_TEMPLATES = new Set(["hello_world"]);

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
export async function syncWhatsappTemplates(auth: Admitted, body: Partial<{ tenant_id?: unknown }>): Promise<Response> {
  const L = logger();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant");
  const db = pg();
  if (!db) return refuse(503, "no_database");

  const { data: ch, error: chErr } = await db
    .from("tenant_channels")
    .select("id, waba_id")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
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
