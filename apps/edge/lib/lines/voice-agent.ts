/**
 * The workspace's phone receptionist at the provider — the Retell LLM that
 * is the shell and the agent over it — created once and shared by the two
 * ways a workspace gets a line: voice-provision (a Retell-bought number)
 * and lines (a Twilio number over SIP). The bodies are packages/channels
 * voice-provision.ts, so the converger plans nothing against what this
 * makes; a test proves it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepVoiceAgent, findVoiceAgent } from "@chanlytics/db/facts";
import type { Database } from "@chanlytics/db/types";
import {
  voiceLlmCreateBody,
  voiceAgentCreateBody,
  createRetellLlm,
  createAgent,
  getRetellLlm,
  getAgentRaw,
  publishAgentVersion,
  type RetellConfig,
  type ProvisionSecrets,
} from "@chanlytics/channels/voice";
import { edgeFnUrl } from "../shared/dashboard-origin.js";

interface VoiceAgent {
  llmId: string;
  llmVersion: number | null;
  agentId: string;
  agentVersion: number | null;
  published: boolean;
  /** Whether a number may pin to latest_published: the first version published. */
  pinned: boolean;
  created: { llm: boolean; agent: boolean };
  publish: Record<string, unknown>;
}

type VoiceAgentResult =
  | { ok: true; agent: VoiceAgent }
  | {
      ok: false;
      step: "llm" | "agent";
      status: number;
      detail: unknown;
      partial: { llmId: string | null; llmVersion: number | null };
    };

/**
 * Create the receptionist, or adopt one a failed run left behind: `llmId`
 * reuses an LLM, `agentId` adopts an agent — each read from the provider
 * before it is trusted. A refusal to publish is not the end: the number
 * then follows the latest version, and voice-converge --publish --pin
 * closes that later.
 */
export async function createVoiceAgent(
  cfg: RetellConfig,
  secrets: ProvisionSecrets,
  options: { agentName: string; llmId?: string | null; agentId?: string | null },
): Promise<VoiceAgentResult> {
  let llmId = options.llmId ?? null;
  let llmVersion: number | null = null;
  let agentId: string;
  let agentVersion: number | null;
  let published: boolean;
  const created = { llm: false, agent: false };
  // Where its tools post: this edge's own address, never one a package defaults to.
  const fnUrl = edgeFnUrl();

  if (options.agentId) {
    const agentRaw = await getAgentRaw(cfg, options.agentId);
    if (!agentRaw)
      return {
        ok: false,
        step: "agent",
        status: 404,
        detail: `${options.agentId} is not readable with this key`,
        partial: { llmId, llmVersion },
      };
    const engine = (agentRaw.response_engine ?? {}) as Record<string, unknown>;
    if (engine.type !== "retell-llm" || typeof engine.llm_id !== "string") {
      return {
        ok: false,
        step: "agent",
        status: 422,
        detail: "the adopted agent is not on a Retell LLM",
        partial: { llmId, llmVersion },
      };
    }
    agentId = options.agentId;
    llmId = engine.llm_id;
    llmVersion = typeof engine.version === "number" ? engine.version : null;
    agentVersion = typeof agentRaw.version === "number" ? agentRaw.version : null;
    published = agentRaw.is_published === true;
  } else {
    if (llmId) {
      const retellLlm = await getRetellLlm(cfg, llmId);
      if (!retellLlm)
        return {
          ok: false,
          step: "llm",
          status: 404,
          detail: `${llmId} is not readable with this key`,
          partial: { llmId: null, llmVersion: null },
        };
      llmVersion = retellLlm.version;
    } else {
      const w = await createRetellLlm(cfg, voiceLlmCreateBody(secrets, fnUrl));
      if (!w.ok || typeof w.body?.llm_id !== "string")
        return { ok: false, step: "llm", status: w.status, detail: w.body, partial: { llmId: null, llmVersion: null } };
      llmId = w.body.llm_id;
      llmVersion = typeof w.body.version === "number" ? w.body.version : null;
      created.llm = true;
    }
    const agent = await createAgent(
      cfg,
      voiceAgentCreateBody({ llmId, llmVersion, agentName: options.agentName }, secrets, fnUrl),
    );
    if (!agent.ok || typeof agent.body?.agent_id !== "string")
      return { ok: false, step: "agent", status: agent.status, detail: agent.body, partial: { llmId, llmVersion } };
    agentId = agent.body.agent_id;
    agentVersion = typeof agent.body.version === "number" ? agent.body.version : null;
    published = agent.body.is_published === true;
    created.agent = true;
  }

  let publish: Record<string, unknown> | null = null;
  if (!published && agentVersion !== null) {
    const result = await publishAgentVersion(cfg, agentId, agentVersion, "provisioned from the edge");
    if (result.ok) published = true;
    else
      publish = {
        ok: false,
        status: result.status,
        detail: result.body,
        note: "the number follows the latest version instead of latest_published; publish and pin with voice-converge later",
      };
  }
  publish ??= published
    ? { ok: true, version: agentVersion }
    : { ok: false, note: "no version to publish; the number follows the latest version" };
  return {
    ok: true,
    agent: { llmId, llmVersion, agentId, agentVersion, published, pinned: published, created, publish },
  };
}

/**
 * The workspace's receptionist: the agent its active voice row already names, else the one made before any number
 * (voice_agents: a rehearsal made it, decision 0069), else a new one, kept there so the next asker finds it. A number
 * bought after a rehearsal so answers in the agent the owner already heard. Throws in the saga's words when the
 * provider refuses, so the line row records the step and the reason.
 */
export async function ensureVoiceAgent(
  db: SupabaseClient<Database>,
  cfg: RetellConfig,
  secrets: ProvisionSecrets,
  tenant: { id: string; name: string },
): Promise<{ agentId: string; llmId: string | null; pinned: boolean }> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("external_id, config")
    .eq("tenant_id", tenant.id)
    .eq("kind", "voice")
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reading the voice row: ${error.message}`);
  if (data?.external_id) {
    const agentRaw = await getAgentRaw(cfg, data.external_id);
    const item =
      data.config && typeof data.config === "object" && !Array.isArray(data.config)
        ? (data.config as Record<string, unknown>)
        : {};
    return {
      agentId: data.external_id,
      llmId: typeof item.llm_id === "string" ? item.llm_id : null,
      pinned: agentRaw?.is_published === true,
    };
  }
  const before = await findVoiceAgent(db, tenant.id);
  if (before) {
    const a = await getAgentRaw(cfg, before.agentId);
    if (a) return { agentId: before.agentId, llmId: before.llmId, pinned: a.is_published === true };
  }
  const voiceAgent = await createVoiceAgent(cfg, secrets, { agentName: `${tenant.name} front desk` });
  if (!voiceAgent.ok)
    throw new Error(
      `receptionist ${voiceAgent.step}: HTTP ${voiceAgent.status} ${JSON.stringify(voiceAgent.detail ?? {}).slice(0, 200)}`,
    );
  // Kept before it is used: two asking at once keep the first, and the second's agent is left unused at the provider.
  const kept = await keepVoiceAgent(db, {
    tenantId: tenant.id,
    agentId: voiceAgent.agent.agentId,
    llmId: voiceAgent.agent.llmId,
  });
  if (kept.agentId === voiceAgent.agent.agentId)
    return { agentId: kept.agentId, llmId: kept.llmId, pinned: voiceAgent.agent.pinned };
  const first = await getAgentRaw(cfg, kept.agentId);
  return { agentId: kept.agentId, llmId: kept.llmId, pinned: first?.is_published === true };
}
