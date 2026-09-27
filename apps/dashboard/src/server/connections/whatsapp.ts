import "server-only";
import { deployment } from "../deployment";
import { edgeHeaders, edgeUrl } from "../edge";

/* ---- Connect your WhatsApp: the edge holds the app secret and does the exchange ---- */

export interface SignupConfig {
  app_id: string | null;
  config_id: string | null;
  graph_version: string;
  ready: boolean;
  reason: string | null;
}

/** What the browser needs to start Embedded Signup; honest about what is missing. */
export async function whatsappSignupConfig(): Promise<SignupConfig> {
  if (!deployment.providersLive)
    return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: "preview" };
  try {
    const r = await fetch(`${edgeUrl()}/api/admin/whatsapp/signup-config`, {
      headers: edgeHeaders("/api/admin/whatsapp/signup-config"),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as (SignupConfig & { ok?: boolean }) | null;
    if (!r.ok || !j?.ok)
      return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: `edge ${r.status}` };
    return {
      app_id: j.app_id,
      config_id: j.config_id,
      graph_version: j.graph_version,
      ready: j.ready,
      reason: j.reason,
    };
  } catch (e) {
    return {
      app_id: null,
      config_id: null,
      graph_version: "v25.0",
      ready: false,
      reason: e instanceof Error ? e.message : "unreachable",
    };
  }
}

export type ConnectOutcome =
  | {
      ok: true;
      channelId: string;
      numberE164: string | null;
      verifiedName: string | null;
      qualityRating: string | null;
      registration: string;
    }
  | { ok: false; reason: string; detail?: string };

/** The owner's number becomes a channel: the edge exchanges the code, registers the number and stores the token. */
export async function connectWhatsApp(
  tenantId: string,
  userId: string,
  body: { code: string; phone_number_id: string; waba_id: string },
): Promise<ConnectOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await fetch(`${edgeUrl()}/api/admin/whatsapp/connect`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/whatsapp/connect", { workspace: tenantId, user: userId }),
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, ...body }),
  });
  const j = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    channel_id?: string;
    number_e164?: string | null;
    verified_name?: string | null;
    quality_rating?: string | null;
    registration?: string;
    error?: string;
    detail?: string;
  };
  if (r.ok && j.ok && j.channel_id) {
    return {
      ok: true,
      channelId: j.channel_id,
      numberE164: j.number_e164 ?? null,
      verifiedName: j.verified_name ?? null,
      qualityRating: j.quality_rating ?? null,
      registration: j.registration ?? "registered",
    };
  }
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}
