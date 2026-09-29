/**
 * POST /api/admin/signup-notify — somebody made a workspace, and the
 * platform mailbox hears about it.
 *
 * The workspace is the dashboard's, made by its signed-in owner through
 * create_workspace; the one thing the dashboard cannot do is send the
 * email. A failure here is a shrug: the workspace exists and its owner is
 * in it. What travels is the workspace's name, slug and id and the owner's
 * address; no customer content exists yet. Diagnostic-key only.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { notify } from "../../lib/ops/notify.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/log.js";

const L = logger();

interface Body {
  tenant_id?: string;
  email?: string;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/signup-notify");
  if (!auth.ok) return auth.response;
  if (!env.LEAD_TO || !env.LEAD_FROM) return refuse(503, "no_platform_mailbox");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  let body: Body = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    /* validated below */
  }
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !email)
    return refuse(400, "bad_request", "tenant_id and email are required");
  const tenant = await db
    .from("tenants")
    .select("id, name, slug, timezone, created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenant.error) return refuse(503, "read_failed", tenant.error.message);
  if (!tenant.data) return refuse(404, "not_found", "no such workspace");
  const sent = await notify(
    // The platform's own mailbox: this is about a workspace, not addressed to one.
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      kind: "alert",
      subject: `New workspace: ${tenant.data.name}`,
      body:
        `${tenant.data.name} (${tenant.data.slug}) signed up.\n` +
        `Owner: ${email}\n` +
        `Time zone: ${tenant.data.timezone}\n` +
        `Workspace id: ${tenant.data.id}\n` +
        `Created: ${tenant.data.created_at}\n\n` +
        "Their Setup page tells them what to do next; nothing is provisioned until they ask.\n",
    },
  );
  L.info("signup_told", { tenant: tenantId, sent });
  return json(sent ? 200 : 502, { ok: sent, tenant: tenant.data.slug });
}
