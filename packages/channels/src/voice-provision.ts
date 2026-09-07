/**
 * Provisioning a workspace's phone receptionist — the first converge.
 *
 * A new workspace's line is three provider objects and one row: the Retell
 * LLM that IS the shell (voice-shell.ts: the placeholders, the four tools,
 * the spoken defaults), the agent over it (the product's voice, the webhook
 * with its events, the analysis fields, retention), and a number bound to
 * the agent with the inbound webhook that fills the facts per call. The row
 * in tenant_channels — kind voice, the agent as external_id — is what routes
 * every delivery back to the workspace, and it is written LAST, once a
 * number answers: a row that exists is a line that works.
 *
 * Everything here is pure: the bodies the endpoint sends and the plan it
 * follows, so a dry run prints exactly what an apply does. The converger
 * (voice-converge) keeps a live agent equal to the shell; a freshly
 * provisioned one plans nothing there, and a test proves it. The provider
 * key lives on the edge and nowhere else — the laptop script that used to
 * do this (tooling/scripts/setup_voice.py) is retired.
 */
import {
  desiredVoiceShell,
  availabilityUrl,
  DEFAULT_FN_URL,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  CALL_ANALYSIS_FIELDS,
} from "./voice-shell";

/** The model behind the shell. Temperature 0: the facts are read, not improvised. */
export const VOICE_LLM_DEFAULTS = {
  model: "claude-4.5-haiku",
  model_temperature: 0,
  start_speaker: "agent",
} as const;

/**
 * The product's voice and the call's shape, pinned from the live line so a
 * second workspace sounds like the first. Retention is the product's 90
 * days; the pipeline copies audio into private storage within seconds.
 */
export const VOICE_AGENT_DEFAULTS = {
  voice_id: "11labs-Andrea",
  language: ["en-US", "es-ES", "fr-FR", "de-DE", "hi-IN", "ru-RU", "pt-PT", "ja-JP", "it-IT", "nl-NL"],
  end_call_after_silence_ms: 30000,
  max_call_duration_ms: 3600000,
  data_storage_setting: "everything",
  data_storage_retention_days: 90,
  post_call_analysis_model: "gpt-4.1",
  allow_user_dtmf: true,
} as const;

/** A local US number through Retell's Twilio pool. Toll-free and Telnyx are later levers. */
export const VOICE_NUMBER_DEFAULTS = {
  country_code: "US",
  number_provider: "twilio",
} as const;

/** The product's voice endpoints, from the one base the shell already pins. */
export function voiceEndpoints(fnUrl: string = DEFAULT_FN_URL): { fn: string; availability: string; webhook: string; inbound: string } {
  const base = fnUrl.replace(/\/api\/retell-fn$/, "");
  return {
    fn: fnUrl,
    availability: availabilityUrl(fnUrl),
    webhook: `${base}/api/retell-webhook`,
    inbound: `${base}/api/retell-inbound`,
  };
}

/** The shared secret rides the tool header and, as ?key=, both webhooks (the edge checks each). */
export interface ProvisionSecrets {
  fnSecret: string;
}

export function withKey(url: string, secret: string): string {
  return `${url}?key=${encodeURIComponent(secret)}`;
}

/** The URL without its query string — the only form a response or a log may carry. */
export function stripKey(url: string | null | undefined): string | null {
  return typeof url === "string" ? url.split("?")[0] : null;
}

/** POST /create-retell-llm: the shell, with the secret on its tools. */
export function voiceLlmCreateBody(s: ProvisionSecrets, fnUrl: string = DEFAULT_FN_URL): Record<string, unknown> {
  return { ...VOICE_LLM_DEFAULTS, ...desiredVoiceShell(fnUrl, { "x-fn-secret": s.fnSecret }) };
}

/** POST /create-agent: the voice, the webhook and its events, the analysis fields, retention. */
export function voiceAgentCreateBody(
  o: { llmId: string; llmVersion: number | null; agentName: string },
  s: ProvisionSecrets,
  fnUrl: string = DEFAULT_FN_URL,
): Record<string, unknown> {
  return {
    agent_name: o.agentName,
    response_engine: { type: "retell-llm", llm_id: o.llmId, ...(o.llmVersion === null ? {} : { version: o.llmVersion }) },
    ...VOICE_AGENT_DEFAULTS,
    language: [...VOICE_AGENT_DEFAULTS.language],
    webhook_url: withKey(voiceEndpoints(fnUrl).webhook, s.fnSecret),
    webhook_events: [...VOICE_WEBHOOK_EVENTS],
    webhook_timeout_ms: VOICE_WEBHOOK_TIMEOUT_MS,
    opt_in_signed_url: true,
    post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
  };
}

/** The agent on the number. Pinned to latest_published, a saved draft cannot go live by itself. */
export function voiceNumberBinding(o: { agentId: string; pinned: boolean }): Array<Record<string, unknown>> {
  return [{ agent_id: o.agentId, ...(o.pinned ? { agent_version: "latest_published" } : {}), weight: 1 }];
}

/** POST /create-phone-number: a local number in the area code, bound and answering with the facts. */
export function voiceNumberCreateBody(
  o: { areaCode: number; agentId: string; pinned: boolean; nickname: string },
  s: ProvisionSecrets,
  fnUrl: string = DEFAULT_FN_URL,
): Record<string, unknown> {
  return {
    ...VOICE_NUMBER_DEFAULTS,
    area_code: o.areaCode,
    nickname: o.nickname,
    inbound_agents: voiceNumberBinding(o),
    inbound_webhook_url: withKey(voiceEndpoints(fnUrl).inbound, s.fnSecret),
  };
}

/** PATCH /update-phone-number: an existing Retell number, bound the same way. */
export function voiceNumberBindBody(
  o: { agentId: string; pinned: boolean; nickname: string },
  s: ProvisionSecrets,
  fnUrl: string = DEFAULT_FN_URL,
): Record<string, unknown> {
  return {
    nickname: o.nickname,
    inbound_agents: voiceNumberBinding(o),
    inbound_webhook_url: withKey(voiceEndpoints(fnUrl).inbound, s.fnSecret),
  };
}

/* ---------------------------------- plan ---------------------------------- */

export interface VoiceProvisionRequest {
  /** An existing Retell number to bind, E.164. */
  number?: string | null;
  /** Or an area code to buy a local number in. */
  areaCode?: number | null;
  /** Resume: an LLM a previous run created before the agent step failed. */
  llmId?: string | null;
  /** Resume: an agent a previous run created before the number or the row landed. */
  agentId?: string | null;
}

export interface VoiceProvisionState {
  tenant: { id: string; name: string };
  /** The workspace's voice row, when one exists. */
  channel: { id: string; status: string; agentId: string; number: string | null } | null;
  request: VoiceProvisionRequest;
}

export type ProvisionStepId = "llm" | "agent" | "publish" | "number" | "channel" | "notify";
export type ProvisionAction = "create" | "reuse" | "adopt" | "publish" | "buy" | "bind" | "insert" | "notify" | "skip";

export interface ProvisionStep {
  id: ProvisionStepId;
  action: ProvisionAction;
  detail: string;
}

export interface VoiceProvisionPlan {
  ok: boolean;
  errors: string[];
  /** Nothing to do: the line exists, or the request is not actionable. */
  nothing: boolean;
  reason: string | null;
  steps: ProvisionStep[];
  names: { agent: string; nickname: string };
}

const E164 = /^\+[1-9]\d{6,14}$/;

/** What the endpoint will do, in order. Pure: the dry run prints this; the apply follows it. */
export function planVoiceProvision(st: VoiceProvisionState): VoiceProvisionPlan {
  const errors: string[] = [];
  const r = st.request;
  const number = r.number ?? null;
  const area = r.areaCode ?? null;
  if (number !== null && !E164.test(number)) errors.push("number must be E.164, like +13055550100");
  if (area !== null && !(Number.isInteger(area) && area >= 200 && area <= 999)) errors.push("area_code must be three digits, like 305");
  if (number !== null && area !== null) errors.push("give a number to bind or an area code to buy in, not both");
  if (r.llmId && !/^llm_[a-z0-9]+$/i.test(r.llmId)) errors.push("llm_id does not look like a Retell LLM id");
  if (r.agentId && !/^agent_[a-z0-9]+$/i.test(r.agentId)) errors.push("agent_id does not look like a Retell agent id");
  const names = { agent: `${st.tenant.name} front desk`, nickname: `${st.tenant.name} · Chanlytics` };
  if (errors.length) return { ok: false, errors, nothing: true, reason: null, steps: [], names };

  if (st.channel) {
    const on = st.channel.status === "active";
    return {
      ok: true,
      errors,
      nothing: true,
      reason: on
        ? `already answering on ${st.channel.number ?? "its number"} (agent ${st.channel.agentId}); voice-converge keeps it on the shell`
        : `a voice line exists but is ${st.channel.status} (agent ${st.channel.agentId}); switch it on in Integrations rather than provisioning another`,
      steps: [],
      names,
    };
  }

  const steps: ProvisionStep[] = [];
  if (r.agentId) {
    steps.push({ id: "llm", action: "skip", detail: "the adopted agent brings its own LLM" });
    steps.push({ id: "agent", action: "adopt", detail: `${r.agentId}, read from the provider first` });
  } else {
    steps.push(
      r.llmId
        ? { id: "llm", action: "reuse", detail: `${r.llmId}, read from the provider first` }
        : { id: "llm", action: "create", detail: `the shell: placeholders, the four tools, spoken defaults; ${VOICE_LLM_DEFAULTS.model} at temperature ${VOICE_LLM_DEFAULTS.model_temperature}` },
    );
    steps.push({
      id: "agent",
      action: "create",
      detail: `"${names.agent}": the product's voice, the webhook with its events, the analysis fields, ${VOICE_AGENT_DEFAULTS.data_storage_retention_days}-day retention`,
    });
  }
  steps.push({ id: "publish", action: "publish", detail: "the first version, so the number can pin to latest_published" });
  if (number) steps.push({ id: "number", action: "bind", detail: `${number} → the agent, pinned to latest_published, inbound webhook set` });
  else if (area !== null) steps.push({ id: "number", action: "buy", detail: `a local number in area code ${area} from Retell (Twilio), bound and pinned, inbound webhook set` });
  else steps.push({ id: "number", action: "skip", detail: "no number asked for — give number (an existing Retell number) or area_code (buy one); the row is not written until a number answers" });
  if (number || area !== null) {
    steps.push({ id: "channel", action: "insert", detail: "tenant_channels: kind voice, the agent as external_id, the number, active" });
    steps.push({ id: "notify", action: "notify", detail: "the workspace's bell says the line is ready; a voice.provisioned event" });
  }
  return { ok: true, errors, nothing: false, reason: null, steps, names };
}
