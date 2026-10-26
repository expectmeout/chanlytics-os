/**
 * POST /api/admin/signup-notify — somebody made a workspace, and the
 * platform mailbox hears about it.
 *
 * The door is api/admin/signup-notify.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this
 * the knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The workspace is the dashboard's, made by its signed-in owner through
 * create_workspace, or by a partner for a business through
 * create_workspace_for_business (0016), which has no owner until the address
 * it was handed to accepts: the notice says which, from the handover on
 * record. The one thing the dashboard cannot do is send the email. A failure
 * here is a shrug: the workspace exists. What travels is the workspace's name,
 * slug and id, the owner's address or the one it waits for, and the partner's
 * code; no customer content exists yet. Signed admin token only.
 */
import { json, refuse } from "../http.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { notify } from "./notify.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";
import { getHandoverInvite } from "../packages/db.js";

interface Body {
  tenant_id?: string;
  email?: string;
}

export async function notifySignup(auth: Admitted, body: Partial<Body>): Promise<Response> {
  const L = logger();
  if (!env.LEAD_TO || !env.LEAD_FROM) return refuse(503, "no_platform_mailbox");
  const db = pg();
  if (!db) return refuse(503, "no_database");
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
  // A partner's workspace waits for the address it was handed to, who has not taken it and may never: nobody signed
  // up, and whoever reads this must not take that address for an owner's. Its handover is open until it is accepted.
  let waiting;
  try {
    waiting = await getHandoverInvite(db, tenantId);
  } catch (e) {
    return refuse(503, "read_failed", errField(e));
  }
  const who = waiting
    ? `was set up by partner ${waiting.partnerCode}, for its owner to accept.\n` +
      `Waiting for: ${waiting.email}, until ${waiting.expiresAt}\n`
    : `signed up.\nOwner: ${email}\n`;
  const next = waiting
    ? "Nobody owns it until they accept. The partner sets it up meanwhile; nothing is provisioned until it is asked for.\n"
    : "Their Setup page tells them what to do next; nothing is provisioned until they ask.\n";
  const sent = await notify(
    // The platform's own mailbox: this is about a workspace, not addressed to one.
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      kind: "alert",
      subject: `New workspace: ${tenant.data.name}`,
      body:
        `${tenant.data.name} (${tenant.data.slug}) ${who}` +
        `Time zone: ${tenant.data.timezone}\n` +
        `Workspace id: ${tenant.data.id}\n` +
        `Created: ${tenant.data.created_at}\n\n` +
        next,
    },
  );
  L.info("signup_told", { tenant_id: tenantId, sent });
  return json(sent ? 200 : 502, { ok: sent, tenant: tenant.data.slug });
}
