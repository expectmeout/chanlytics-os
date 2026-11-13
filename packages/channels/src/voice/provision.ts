/**
 * Provisioning a workspace's phone receptionist — the first converge.
 *
 * A new workspace's line is three provider objects and one row: the Retell
 * LLM that IS the shell (voice/shell/agent-plan.ts: the placeholders, the four tools,
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
  CALL_LIMITS,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  CALL_ANALYSIS_FIELDS,
} from "./shell/tools";
import { SILENCE_REMINDER_MS, SILENCE_REMINDERS, CALL_FEEL, CALL_HANDBOOK } from "./shell/agent-plan";
import { E164, PHONE_VOICE_DEFAULT, RETELL_MODELS } from "@chanlytics/contracts";

/** The model behind the shell, in Retell's name for it (contracts RETELL_MODELS). Temperature 0: the facts are read, not improvised. */
export const VOICE_LLM_DEFAULTS = {
  model: RETELL_MODELS.llm,
  model_temperature: 0,
  start_speaker: "agent",
} as const;

/**
 * The product's voice and the call's shape, pinned from the live line so a
 * second workspace sounds like the first. The voice is Tamsin (MiniMax):
 * Ruben chose it on the salon's line on 17 September 2026 (agent v6, then v7)
 * after Andrea (ElevenLabs) had opened every call before that, and a new
 * workspace should sound like the line customers already hear. The converger
 * never touches an existing agent's voice, so this only reaches agents
 * provisioned from now on; a workspace's own choice is sent with each call
 * (contracts PHONE_VOICES, the inbound webhook's agent_override). The call's limits are the shell's (CALL_LIMITS:
 * twenty minutes a call, thirty seconds of silence, a week at the provider), since the pipeline copies the audio
 * into private storage within seconds and keeps its own record.
 */
export const VOICE_AGENT_DEFAULTS = {
  voice_id: PHONE_VOICE_DEFAULT,
  language: ["en-US", "es-ES", "fr-FR", "de-DE", "hi-IN", "ru-RU", "pt-PT", "ja-JP", "it-IT", "nl-NL"],
  end_call_after_silence_ms: CALL_LIMITS.end_call_after_silence_ms,
  // A silent caller is reminded after four seconds, twice (voice/shell/agent-plan.ts SILENCE_REMINDER_MS): the converger holds
  // every live agent to the same. The ten locales stay until a line is converged to its workspace's (retellLocalesOf).
  reminder_trigger_ms: SILENCE_REMINDER_MS,
  reminder_max_count: SILENCE_REMINDERS,
  // How a call sounds and takes turns (voice/shell/agent-plan.ts CALL_FEEL, CALL_HANDBOOK): a new line sounds as every live one is
  // converged to, so the converger plans nothing against what this creates.
  ...CALL_FEEL,
  handbook_config: CALL_HANDBOOK,
  max_call_duration_ms: CALL_LIMITS.max_call_duration_ms,
  data_storage_setting: "everything",
  data_storage_retention_days: CALL_LIMITS.data_storage_retention_days,
  post_call_analysis_model: RETELL_MODELS.analysis,
  allow_user_dtmf: true,
} as const;

/** A local US number through Retell's Twilio pool. Toll-free and Telnyx are later levers. */
export const VOICE_NUMBER_DEFAULTS = {
  country_code: "US",
  number_provider: "twilio",
} as const;

/** The product's voice endpoints, from the one base the shell already pins. */
export function voiceEndpoints(fnUrl: string): {
  fn: string;
  availability: string;
  webhook: string;
  inbound: string;
} {
  const base = fnUrl.replace(/\/api\/retell-fn$/, "");
  return {
    fn: fnUrl,
    availability: availabilityUrl(fnUrl),
    webhook: `${base}/api/retell-webhook`,
    inbound: `${base}/api/retell-inbound`,
  };
}

/**
 * The shared secret rides the tool header and, as ?key=, the call-start webhook (retell-inbound), whose only
 * credential it is. The call webhook (retell-webhook) carries none: Retell signs every delivery with the badged
 * key, and the signature is that door's credential -- a secret in a URL rides in Retell's dashboard and in access
 * logs, and anyone holding it could forge a call_analyzed.
 */
export interface ProvisionSecrets {
  /**
   * The shared secret, or null once the edge opens the voice doors for Retell's signature alone (RETELL_DOORS_SIGNED):
   * then nothing is provisioned with it, neither the tools' header nor the inbound URL's `?key=` (decision 0092).
   */
  fnSecret: string | null;
}

/** The URL with the shared secret as `?key=`, or the URL bare when there is no secret to carry (the signature alone). */
export function withKey(url: string, secret: string | null): string {
  return secret ? `${url}?key=${encodeURIComponent(secret)}` : url;
}

/** The URL without its query string — the only form a response or a log may carry. */
export function stripKey(url: string | null | undefined): string | null {
  return typeof url === "string" ? (url.split("?")[0] ?? url) : null;
}

/** POST /create-retell-llm: the shell, with the secret on its tools while the doors still read one. */
export function voiceLlmCreateBody(provisionSecrets: ProvisionSecrets, fnUrl: string): Record<string, unknown> {
  return {
    ...VOICE_LLM_DEFAULTS,
    ...desiredVoiceShell(fnUrl, provisionSecrets.fnSecret ? { "x-fn-secret": provisionSecrets.fnSecret } : null),
  };
}

/** POST /create-agent: the voice, the webhook and its events, the analysis fields, retention. */
export function voiceAgentCreateBody(
  options: { llmId: string; llmVersion: number | null; agentName: string },
  provisionSecrets: ProvisionSecrets,
  fnUrl: string,
): Record<string, unknown> {
  return {
    agent_name: options.agentName,
    response_engine: {
      type: "retell-llm",
      llm_id: options.llmId,
      ...(options.llmVersion === null ? {} : { version: options.llmVersion }),
    },
    ...VOICE_AGENT_DEFAULTS,
    language: [...VOICE_AGENT_DEFAULTS.language],
    webhook_url: voiceEndpoints(fnUrl).webhook,
    webhook_events: [...VOICE_WEBHOOK_EVENTS],
    webhook_timeout_ms: VOICE_WEBHOOK_TIMEOUT_MS,
    opt_in_signed_url: true,
    post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
  };
}

/**
 * Whether an id is one the provider gives an agent (`agent_…`). A demo workspace's line names one the provider never
 * made (`demo-voice-+12125550189`): there is nothing at the provider to read, provision or converge for it.
 */
export function isRetellAgentId(id: string): boolean {
  return /^agent_[a-z0-9]+$/i.test(id);
}

/** The agent on the number. Pinned to latest_published, a saved draft cannot go live by itself. */
export function voiceNumberBinding(options: { agentId: string; pinned: boolean }): Array<Record<string, unknown>> {
  return [{ agent_id: options.agentId, ...(options.pinned ? { agent_version: "latest_published" } : {}), weight: 1 }];
}

/** POST /create-phone-number: a local number in the area code, bound and answering with the facts. */
export function voiceNumberCreateBody(
  options: { areaCode: number; agentId: string; pinned: boolean; nickname: string },
  provisionSecrets: ProvisionSecrets,
  fnUrl: string,
): Record<string, unknown> {
  return {
    ...VOICE_NUMBER_DEFAULTS,
    area_code: options.areaCode,
    nickname: options.nickname,
    inbound_agents: voiceNumberBinding(options),
    inbound_webhook_url: withKey(voiceEndpoints(fnUrl).inbound, provisionSecrets.fnSecret),
  };
}

/** PATCH /update-phone-number: an existing Retell number, bound the same way. */
export function voiceNumberBindBody(
  options: { agentId: string; pinned: boolean; nickname: string },
  provisionSecrets: ProvisionSecrets,
  fnUrl: string,
): Record<string, unknown> {
  return {
    nickname: options.nickname,
    inbound_agents: voiceNumberBinding(options),
    inbound_webhook_url: withKey(voiceEndpoints(fnUrl).inbound, provisionSecrets.fnSecret),
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

/** What the endpoint will do, in order. Pure: the dry run prints this; the apply follows it. */
export function planVoiceProvision(st: VoiceProvisionState): VoiceProvisionPlan {
  const errors: string[] = [];
  const request = st.request;
  const number = request.number ?? null;
  const area = request.areaCode ?? null;
  if (number !== null && !E164.test(number)) errors.push("number must be E.164, like +13055550100");
  if (area !== null && !(Number.isInteger(area) && area >= 200 && area <= 999))
    errors.push("area_code must be three digits, like 305");
  if (number !== null && area !== null) errors.push("give a number to bind or an area code to buy in, not both");
  if (request.llmId && !/^llm_[a-z0-9]+$/i.test(request.llmId))
    errors.push("llm_id does not look like a Retell LLM id");
  if (request.agentId && !isRetellAgentId(request.agentId))
    errors.push("agent_id does not look like a Retell agent id");
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
        : `a voice line exists but is ${st.channel.status} (agent ${st.channel.agentId}); switch it on in Connections rather than provisioning another`,
      steps: [],
      names,
    };
  }

  const steps: ProvisionStep[] = [];
  if (request.agentId) {
    steps.push({ id: "llm", action: "skip", detail: "the adopted agent brings its own LLM" });
    steps.push({ id: "agent", action: "adopt", detail: `${request.agentId}, read from the provider first` });
  } else {
    steps.push(
      request.llmId
        ? { id: "llm", action: "reuse", detail: `${request.llmId}, read from the provider first` }
        : {
            id: "llm",
            action: "create",
            detail: `the shell: placeholders, the four tools, spoken defaults; ${VOICE_LLM_DEFAULTS.model} at temperature ${VOICE_LLM_DEFAULTS.model_temperature}`,
          },
    );
    steps.push({
      id: "agent",
      action: "create",
      detail: `"${names.agent}": the product's voice, the webhook with its events, the analysis fields, ${VOICE_AGENT_DEFAULTS.data_storage_retention_days}-day retention`,
    });
  }
  steps.push({
    id: "publish",
    action: "publish",
    detail: "the first version, so the number can pin to latest_published",
  });
  if (number)
    steps.push({
      id: "number",
      action: "bind",
      detail: `${number} → the agent, pinned to latest_published, inbound webhook set`,
    });
  else if (area !== null)
    steps.push({
      id: "number",
      action: "buy",
      detail: `a local number in area code ${area} from Retell (Twilio), bound and pinned, inbound webhook set`,
    });
  else
    steps.push({
      id: "number",
      action: "skip",
      detail:
        "no number asked for — give number (an existing Retell number) or area_code (buy one); the row is not written until a number answers",
    });
  if (number || area !== null) {
    steps.push({
      id: "channel",
      action: "insert",
      detail: "tenant_channels: kind voice, the agent as external_id, the number, active",
    });
    steps.push({
      id: "notify",
      action: "notify",
      detail: "the workspace's bell says the line is ready; a voice.provisioned event",
    });
  }
  return { ok: true, errors, nothing: false, reason: null, steps, names };
}
