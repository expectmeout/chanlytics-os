/**
 * POST /api/admin/setup-request — a workspace asked a person at Chanlytics
 * for something the product cannot provision yet, and the platform mailbox
 * hears about it.
 *
 * The door is api/admin/setup-request.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this
 * the knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The ask itself is recorded by the database (setup_request: a bell row
 * for the workspace, a setup.requested event for the platform). This is
 * the one thing Postgres cannot do: send the email. The dashboard calls it
 * after the RPC, from production only, and treats a failure as a shrug —
 * the request is already on record. What travels is the workspace's own
 * name and id and who asked; no customer content exists here to withhold.
 * What the mail tells a person to do is the Console's playbook for the ask
 * (contracts' support-playbooks.ts), so the mail and Support's panel say the
 * same steps. Signed admin token only.
 */
import { json, refuse } from "../http.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { notify } from "./notify.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import { setupAskMail } from "../packages/contracts.js";

interface Body {
  tenant_id?: string;
  what?: string;
  by?: string | null;
}

export async function notifySetupRequest(auth: Admitted, body: Partial<Body>): Promise<Response> {
  const L = logger();
  if (!env.LEAD_TO || !env.LEAD_FROM) return refuse(503, "no_platform_mailbox");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  const what = typeof body.what === "string" ? body.what : "";
  const w = setupAskMail(what);
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !w)
    return refuse(400, "bad_request", "tenant_id and a known `what` are required");

  const tenant = await db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
  if (tenant.error) return refuse(503, "read_failed", tenant.error.message);
  if (!tenant.data) return refuse(404, "not_found", "no such workspace");

  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 120) : "a member";
  const how = w
    .steps({ first: null, workspace: tenant.data.name, me: "Chanlytics", tenantId: tenant.data.id })
    .join("\n");
  const sent = await notify(
    // The platform's own mailbox: this is about a workspace, not addressed to one.
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      kind: "alert",
      subject: `${tenant.data.name} ${w.subject}`,
      body:
        `${tenant.data.name} (${tenant.data.slug}) ${w.subject}.\n` +
        `Requested by: ${by}\n` +
        `Workspace id: ${tenant.data.id}\n\n${how}\n`,
    },
  );
  L.info("setup_request_told", { tenant_id: tenantId, what, sent });
  return json(sent ? 200 : 502, { ok: sent, what, tenant: tenant.data.slug });
}
