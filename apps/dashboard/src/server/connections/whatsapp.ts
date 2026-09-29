import "server-only";
import { deployment } from "../env";
import { MIN_MS } from "@chanlytics/contracts";
import { callEdge, edgeAnswered } from "../edge";

/** What the browser needs to start signup is read from the edge's environment: a second's work. */
const SIGNUP_CONFIG_TIMEOUT_MS = 10_000;
/** A connect is several Graph calls in a row (exchange, read back, subscribe, register): a minute. */
const CONNECT_TIMEOUT_MS = MIN_MS;

/* ---- Connect your WhatsApp: the edge holds the app secret and does the exchange ---- */

interface SignupConfig {
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
  const r = await callEdge("/api/admin/whatsapp/signup-config", null, {
    method: "GET",
    timeoutMs: SIGNUP_CONFIG_TIMEOUT_MS,
  });
  const j = r.body as (SignupConfig & { ok?: boolean }) | null;
  if (!edgeAnswered(r) || !j?.ok) {
    const said = typeof r.body?.detail === "string" && r.status >= 503 ? r.body.detail : `edge ${r.status}`;
    return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: said };
  }
  return {
    app_id: j.app_id,
    config_id: j.config_id,
    graph_version: j.graph_version,
    ready: j.ready,
    reason: j.reason,
  };
}

type ConnectOutcome =
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
  const r = await callEdge(
    "/api/admin/whatsapp/connect",
    { tenant_id: tenantId, user_id: userId, ...body },
    { workspace: tenantId, user: userId, timeoutMs: CONNECT_TIMEOUT_MS },
  );
  const j = (r.body ?? {}) as {
    ok?: boolean;
    channel_id?: string;
    number_e164?: string | null;
    verified_name?: string | null;
    quality_rating?: string | null;
    registration?: string;
    error?: string;
    detail?: string;
  };
  if (edgeAnswered(r) && j.ok && j.channel_id) {
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
