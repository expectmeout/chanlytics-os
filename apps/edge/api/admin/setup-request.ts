/**
 * POST /api/admin/setup-request — a workspace asked a person at Chanlytics
 * for something the product cannot provision yet, and the platform mailbox
 * hears about it.
 *
 * The ask itself is recorded by the database (setup_request: a bell row
 * for the workspace, a setup.requested event for the platform). This is
 * the one thing Postgres cannot do: send the email. The dashboard calls it
 * after the RPC, from production only, and treats a failure as a shrug —
 * the request is already on record. What travels is the workspace's own
 * name and id and who asked; no customer content exists here to withhold.
 * Diagnostic-key only.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { notify } from "../../lib/ops/notify.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/log.js";

const L = logger();

interface Body {
  tenant_id?: string;
  what?: string;
  by?: string | null;
}

const WHAT: Record<string, { subject: string; how: string }> = {
  line: {
    subject: "asked for a phone line",
    how:
      "Set it up from the edge, dry run first:\n" +
      '  POST /api/admin/voice-provision  { "tenant_id": "<id>", "area_code": <3 digits> }   (x-diag-key)\n' +
      'then the same body with "apply": true. Their Setup page reads the line as ready by itself once the row exists.',
  },
  // Bringing the number they have (S14): a person files the port with the carrier; nothing here provisions it.
  port: {
    subject: "asked to bring their phone number",
    how:
      "Reply for what the losing carrier asks for: the number, the carrier, the account holder's name and service address as the carrier has them, the account number and the port-out PIN, and a recent bill.\n" +
      "File the port with Twilio, and tell them to keep their current service until it completes -- cancelling it first can lose the number. Their Setup row says so meanwhile.",
  },
  // Forwarding in an office phone system (00173, the first run's decision 3): no star code, so a person does it with them.
  forwarding: {
    subject: "asked for help setting up forwarding in their office phone system",
    how:
      "Reply to find a time for a call. Their phone system (RingCentral, Vonage, 8x8 and the like) forwards calls in its own settings, under forwarding or what happens when no one answers: forward unanswered calls to the receptionist's number, which their first run and Setup show.\n" +
      "Put the forwarding before any voicemail. Then have them press Test it on Setup's row for the number they keep.",
  },
  // A configuration the receptionist can no longer read (S8): only a person can repair it.
  repair: {
    subject: "asked for their business settings to be repaired",
    how:
      "Their saved configuration no longer passes the receptionist's checks, so it is silent. GET /api/v1/settings answers the problems as broken.issues, and their Business pane lists them.\n" +
      "Correct tenant_config.config for this workspace; the receptionist answers again within a minute of the fix.",
  },
};

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/setup-request");
  if (!auth.ok) return auth.response;
  if (!env.LEAD_TO || !env.LEAD_FROM) return json(503, { ok: false, error: "no_platform_mailbox" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

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
  const what = typeof body.what === "string" ? body.what : "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !WHAT[what])
    return json(400, { ok: false, error: "tenant_id and a known `what` are required" });

  const tenant = await db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
  if (tenant.error) return json(503, { ok: false, error: tenant.error.message });
  if (!tenant.data) return json(404, { ok: false, error: "no such workspace" });

  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 120) : "a member";
  const w = WHAT[what];
  const sent = await notify(
    // The platform's own mailbox: this is about a workspace, not addressed to one.
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      kind: "alert",
      subject: `${tenant.data.name} ${w.subject}`,
      body:
        `${tenant.data.name} (${tenant.data.slug}) ${w.subject}.\n` +
        `Requested by: ${by}\n` +
        `Workspace id: ${tenant.data.id}\n\n${w.how}\n`,
    },
  );
  L.info("setup_request_told", { tenant: tenantId, what, sent });
  return json(sent ? 200 : 502, { ok: sent, what, tenant: tenant.data.slug });
}
