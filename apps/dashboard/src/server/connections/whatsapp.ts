import "server-only";
import { deployment } from "../shared/env";
import { MIN_MS } from "@chanlytics/contracts";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "../shared/edge";
import type { TenantId } from "@chanlytics/contracts";

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
export async function getWhatsappSignupConfig(asker: { workspace: string; user: string }): Promise<SignupConfig> {
  if (!deployment.providersLive)
    return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: "preview", keep_app: false };
  // The platform's app config, about no workspace; the token still says who asked for which (defect 25).
  const answer = await callEdge("/api/admin/whatsapp/signup-config", null, {
    ...asker,
    method: "GET",
    timeoutMs: SIGNUP_CONFIG_TIMEOUT_MS,
  });
  const json = answer.body;
  if (!edgeAnswered(answer) || !json?.ok) {
    const sentence =
      typeof answer.body?.detail === "string" && answer.status >= 503 ? answer.body.detail : `edge ${answer.status}`;
    return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: sentence, keep_app: false };
  }
  return {
    app_id: json.app_id ?? null,
    config_id: json.config_id ?? null,
    graph_version: json.graph_version ?? "v25.0",
    ready: json.ready === true,
    reason: json.reason ?? null,
    keep_app: json.keep_app === true,
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
  tenantId: TenantId,
  userId: string,
  body: { code: string; phone_number_id?: string; waba_id?: string; keep_app?: true },
): Promise<ConnectOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const answer = await callEdge(
    "/api/admin/whatsapp/connect",
    { tenant_id: tenantId, user_id: userId, ...body },
    { workspace: tenantId, user: userId, timeoutMs: CONNECT_TIMEOUT_MS },
  );
  const result = answer.body ?? {};
  if (edgeAnswered(answer) && result.ok && result.channel_id) {
    return {
      ok: true,
      channelId: result.channel_id,
      phoneNumberId: result.phone_number_id ?? body.phone_number_id ?? "",
      wabaId: result.waba_id ?? body.waba_id ?? "",
      idsFrom: result.ids_from === "token" ? "token" : "message",
      numberE164: result.number_e164 ?? null,
      verifiedName: result.verified_name ?? null,
      qualityRating: result.quality_rating ?? null,
      registration: result.registration ?? "registered",
    };
  }
  return { ok: false, reason: edgeReasonOf(answer), detail: result.detail };
}

type StandingCheck = { ok: true; kept: string; canSend: string } | { ok: false; reason: EdgeReason; detail?: string };

/**
 * The owner asks what Meta holds about the workspace's number now: the edge reads it with the business's own token, keeps it
 * on the channel (where Connections' row reads it from) and tells the owner if it turned BLOCKED. Answers what was kept and
 * Meta's word for whether the number may send; what Meta said stays on the channel. A preview never asks a real number.
 */
export async function checkWhatsAppStanding(tenantId: TenantId, userId: string): Promise<StandingCheck> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const answer = await callEdge(
    "/api/admin/whatsapp/standing",
    { tenant_id: tenantId, user_id: userId },
    { workspace: tenantId, user: userId, timeoutMs: STANDING_TIMEOUT_MS },
  );
  const body = answer.body ?? {};
  if (edgeAnswered(answer) && body.ok && typeof body.kept === "string" && typeof body.can_send === "string")
    return { ok: true, kept: body.kept, canSend: body.can_send };
  return { ok: false, reason: edgeReasonOf(answer), detail: body.detail };
}
