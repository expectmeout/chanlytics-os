/**
 * POST /api/admin/signup-notify — a stranger made a workspace, and the
 * platform mailbox hears about it.
 *
 * The sign-up itself is the dashboard's (service role, the auth user and
 * the workspace in one go); the one thing it cannot do is send the email.
 * A failure here is a shrug: the workspace exists and its owner is on the
 * way in. What travels is the workspace's name, slug and id and the
 * owner's address; no customer content exists yet. Diagnostic-key only.
 */
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { notify } from "../../lib/notify.js";

interface Body {
  tenant_id?: string;
  email?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  if (!process.env.LEAD_TO || !process.env.LEAD_FROM) return json(503, { ok: false, error: "no_platform_mailbox" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  let body: Body = {};
  try { body = JSON.parse(await request.text()); } catch { /* validated below */ }
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !email) return json(400, { ok: false, error: "tenant_id and email are required" });
  const tenant = await db.from("tenants").select("id, name, slug, timezone, created_at").eq("id", tenantId).maybeSingle();
  if (tenant.error) return json(503, { ok: false, error: tenant.error.message });
  if (!tenant.data) return json(404, { ok: false, error: "no such workspace" });
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
  console.log("signup_told", JSON.stringify({ tenant: tenantId, sent }));
  return json(sent ? 200 : 502, { ok: sent, tenant: tenant.data.slug });
}
