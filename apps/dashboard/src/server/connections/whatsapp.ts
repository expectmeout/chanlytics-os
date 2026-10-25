import "server-only";
import { deployment } from "../env";
import { MIN_MS } from "@chanlytics/contracts";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "../edge";

/** What the browser needs to start signup is read from the edge's environment: a second's work. */
const SIGNUP_CONFIG_TIMEOUT_MS = 10_000;
/** A connect is several Graph calls in a row (exchange, read back, subscribe, register): a minute. */
const CONNECT_TIMEOUT_MS = MIN_MS;
/** A check of the number is two Graph reads at once, a keeping and, when it turned bad, a notice: half a minute. */
const STANDING_TIMEOUT_MS = 30_000;

/* ---- Connect your WhatsApp: the edge holds the app secret and does the exchange ---- */

interface SignupConfig {
  app_id: string | null;
  config_id: string | null;
  graph_version: string;
  ready: boolean;
  reason: string | null;
  /** The configuration offers keeping the WhatsApp Business app (coexistence, decision 0073, R12). */
  keep_app: boolean;
}

/** What the browser needs to start Embedded Signup; honest about what is missing. */
export async function whatsappSignupConfig(asker: { workspace: string; user: string }): Promise<SignupConfig> {
  if (!deployment.providersLive)
    return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: "preview", keep_app: false };
  // The platform's app config, about no workspace; the token still says who asked for which (defect 25).
  const r = await callEdge("/api/admin/whatsapp/signup-config", null, {
    ...asker,
    method: "GET",
    timeoutMs: SIGNUP_CONFIG_TIMEOUT_MS,
  });
  const j = r.body as (SignupConfig & { ok?: boolean }) | null;
  if (!edgeAnswered(r) || !j?.ok) {
    const said = typeof r.body?.detail === "string" && r.status >= 503 ? r.body.detail : `edge ${r.status}`;
    return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: said, keep_app: false };
  }
  return {
    app_id: j.app_id,
    config_id: j.config_id,
    graph_version: j.graph_version,
    ready: j.ready,
    reason: j.reason,
    keep_app: j.keep_app === true,
  };
}

type ConnectOutcome =
  | {
      ok: true;
      channelId: string;
      /** The number and the account connected: the window's, or the ones the edge read from the token's grant. */
      phoneNumberId: string;
      wabaId: string;
      idsFrom: "message" | "token";
      numberE164: string | null;
      verifiedName: string | null;
      qualityRating: string | null;
      registration: string;
    }
  | { ok: false; reason: EdgeReason; detail?: string };

/**
 * The owner's number becomes a channel: the edge exchanges the code, finds an id the browser did not hear from the token's
 * own grant, registers the number and stores the token. A number that keeps the WhatsApp Business app (`keep_app`,
 * coexistence: decision 0073, R12) is already registered, and the edge asks Meta for the app's contacts and chats (R21).
 */
export async function connectWhatsApp(
  tenantId: string,
  userId: string,
  body: { code: string; phone_number_id?: string; waba_id?: string; keep_app?: true },
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
    phone_number_id?: string;
    waba_id?: string;
    ids_from?: string;
    number_e164?: string | null;
    verified_name?: string | null;
    quality_rating?: string | null;
    registration?: string;
    detail?: string;
  };
  if (edgeAnswered(r) && j.ok && j.channel_id) {
    return {
      ok: true,
      channelId: j.channel_id,
      phoneNumberId: j.phone_number_id ?? body.phone_number_id ?? "",
      wabaId: j.waba_id ?? body.waba_id ?? "",
      idsFrom: j.ids_from === "token" ? "token" : "message",
      numberE164: j.number_e164 ?? null,
      verifiedName: j.verified_name ?? null,
      qualityRating: j.quality_rating ?? null,
      registration: j.registration ?? "registered",
    };
  }
  return { ok: false, reason: edgeReasonOf(r), detail: j.detail };
}

type StandingCheck = { ok: true; kept: string; canSend: string } | { ok: false; reason: EdgeReason; detail?: string };

/**
 * The owner asks what Meta holds about the workspace's number now: the edge reads it with the business's own token, keeps it
 * on the channel (where Connections' row reads it from) and tells the owner if it turned BLOCKED. Answers what was kept and
 * Meta's word for whether the number may send; what Meta said stays on the channel. A preview never asks a real number.
 */
export async function checkWhatsAppStanding(tenantId: string, userId: string): Promise<StandingCheck> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/whatsapp/standing",
    { tenant_id: tenantId, user_id: userId },
    { workspace: tenantId, user: userId, timeoutMs: STANDING_TIMEOUT_MS },
  );
  const j = (r.body ?? {}) as { ok?: boolean; kept?: string; can_send?: string; detail?: string };
  if (edgeAnswered(r) && j.ok && typeof j.kept === "string" && typeof j.can_send === "string")
    return { ok: true, kept: j.kept, canSend: j.can_send };
  return { ok: false, reason: edgeReasonOf(r), detail: j.detail };
}
