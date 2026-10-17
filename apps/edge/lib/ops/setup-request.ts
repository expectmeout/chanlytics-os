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
 * Signed admin token only.
 */
import { json, refuse } from "../http.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { notify } from "./notify.js";
import { env } from "../env.js";
import { logger } from "../log.js";

interface Body {
  tenant_id?: string;
  what?: string;
  by?: string | null;
}

/** What the platform is told to do: words, or words made with the workspace's id (a command to run as it is). */
const WHAT: Record<string, { subject: string; how: string | ((tenantId: string) => string) }> = {
  // The voice door takes a token minted for it, never the platform's key on an edge that holds EDGE_CALL_SECRET
  // (admin-auth.ts): the script mints one, as the dashboard does. The key in a curl was refused there (token_required).
  line: {
    subject: "asked for a phone line",
    how: (tenantId) =>
      "Set it up from the repository with EDGE_CALL_SECRET (the secret the dashboard signs with) in the environment, a dry run first:\n" +
      `  node tooling/scripts/ops/voice/voice-provision.mjs --tenant ${tenantId} --area-code <3 digits>\n` +
      "then the same with --apply. Their Setup page reads the line as ready by itself once the row exists.",
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
      "Reply to find a time for a call. Their phone system (RingCentral, Vonage, 8x8 and the like) forwards calls in its own settings, under forwarding or what happens when no one answers: forward the calls (unanswered, or every call, as their Setup row for the number they keep says) to the receptionist's number, which their first run and Setup show.\n" +
      "Put the forwarding before any voicemail. Then have them press Test it on Setup's row for the number they keep.",
  },
  // A configuration the receptionist can no longer read (S8): only a person can repair it.
  repair: {
    subject: "asked for their business settings to be repaired",
    how:
      "Their saved configuration no longer passes the receptionist's checks, so it is silent. GET /api/v1/settings answers the problems as broken.issues, and their Business pane lists them.\n" +
      "Correct tenant_config.config for this workspace; the receptionist answers again within a minute of the fix.",
  },
  // A name the carriers hold (X4-5): the campaign's name is in its filed confirmation, and only a new campaign changes it.
  name: {
    subject: "asked to change the name the carriers hold for their texting",
    how:
      "They renamed the business in Settings. Their sign-up page and sign say the new name now; the text confirming a START still says the name their campaign was filed under (lines.facts.a2p_campaign_name), and the brand keeps its own (a2p_filed_name).\n" +
      "Reply to confirm the new name is the one customers know them by, and that it is on their business record (its legal or trading name). Then register a new campaign for their line under it -- the carriers vet it again, which takes days -- and retire the old one once the new one is approved.",
  },
};

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
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !WHAT[what])
    return refuse(400, "bad_request", "tenant_id and a known `what` are required");

  const tenant = await db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
  if (tenant.error) return refuse(503, "read_failed", tenant.error.message);
  if (!tenant.data) return refuse(404, "not_found", "no such workspace");

  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 120) : "a member";
  const w = WHAT[what];
  const how = typeof w.how === "function" ? w.how(tenant.data.id) : w.how;
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
