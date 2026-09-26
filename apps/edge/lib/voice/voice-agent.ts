/**
 * The workspace's phone receptionist at the provider — the Retell LLM that
 * is the shell and the agent over it — created once and shared by the two
 * ways a workspace gets a line: voice-provision (a Retell-bought number)
 * and lines (a Twilio number over SIP). The bodies are packages/channels
 * voice-provision.ts, so the converger plans nothing against what this
 * makes; a test proves it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
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
} from "../packages/channels.js";

export interface VoiceAgent {
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

export type VoiceAgentResult =
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
  o: { agentName: string; llmId?: string | null; agentId?: string | null },
): Promise<VoiceAgentResult> {
  let llmId = o.llmId ?? null;
  let llmVersion: number | null = null;
  let agentId: string;
  let agentVersion: number | null;
  let published: boolean;
  const created = { llm: false, agent: false };

  if (o.agentId) {
    const a = await getAgentRaw(cfg, o.agentId);
    if (!a)
      return {
        ok: false,
        step: "agent",
        status: 404,
        detail: `${o.agentId} is not readable with this key`,
        partial: { llmId, llmVersion },
      };
    const engine = (a.response_engine ?? {}) as Record<string, unknown>;
    if (engine.type !== "retell-llm" || typeof engine.llm_id !== "string") {
      return {
        ok: false,
        step: "agent",
        status: 422,
        detail: "the adopted agent is not on a Retell LLM",
        partial: { llmId, llmVersion },
      };
    }
    agentId = o.agentId;
    llmId = engine.llm_id;
    llmVersion = typeof engine.version === "number" ? engine.version : null;
    agentVersion = typeof a.version === "number" ? a.version : null;
    published = a.is_published === true;
  } else {
    if (llmId) {
      const l = await getRetellLlm(cfg, llmId);
      if (!l)
        return {
          ok: false,
          step: "llm",
          status: 404,
          detail: `${llmId} is not readable with this key`,
          partial: { llmId: null, llmVersion: null },
        };
      llmVersion = l.version;
    } else {
      const w = await createRetellLlm(cfg, voiceLlmCreateBody(secrets));
      if (!w.ok || typeof w.body?.llm_id !== "string")
        return { ok: false, step: "llm", status: w.status, detail: w.body, partial: { llmId: null, llmVersion: null } };
      llmId = w.body.llm_id;
      llmVersion = typeof w.body.version === "number" ? w.body.version : null;
      created.llm = true;
    }
    const w = await createAgent(cfg, voiceAgentCreateBody({ llmId, llmVersion, agentName: o.agentName }, secrets));
    if (!w.ok || typeof w.body?.agent_id !== "string")
      return { ok: false, step: "agent", status: w.status, detail: w.body, partial: { llmId, llmVersion } };
    agentId = w.body.agent_id;
    agentVersion = typeof w.body.version === "number" ? w.body.version : null;
    published = w.body.is_published === true;
    created.agent = true;
  }

  let publish: Record<string, unknown> | null = null;
  if (!published && agentVersion !== null) {
    const p = await publishAgentVersion(cfg, agentId, agentVersion, "provisioned from the edge");
    if (p.ok) published = true;
    else
      publish = {
        ok: false,
        status: p.status,
        detail: p.body,
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
 * The workspace's receptionist: the agent its active voice row already
 * names, else a new one. Throws in the saga's words when the provider
 * refuses, so the line row records the step and the reason.
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
    const a = await getAgentRaw(cfg, data.external_id);
    const c =
      data.config && typeof data.config === "object" && !Array.isArray(data.config)
        ? (data.config as Record<string, unknown>)
        : {};
    return {
      agentId: data.external_id,
      llmId: typeof c.llm_id === "string" ? c.llm_id : null,
      pinned: a?.is_published === true,
    };
  }
  const r = await createVoiceAgent(cfg, secrets, { agentName: `${tenant.name} front desk` });
  if (!r.ok)
    throw new Error(`receptionist ${r.step}: HTTP ${r.status} ${JSON.stringify(r.detail ?? {}).slice(0, 200)}`);
  return { agentId: r.agent.agentId, llmId: r.agent.llmId, pinned: r.agent.pinned };
}
