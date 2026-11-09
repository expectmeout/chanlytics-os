/**
 * A web call's request and its answer, as Retell takes and gives them (decision 0069): pure, so a test reads what is
 * sent. The call itself is voice/retell/agents.ts's (createWebCall), with the rest of the provider's wire.
 */

/** What a browser joins a web call with (POST /v3/create-web-call's answer): the call, its token, its transport. */
export interface WebCallMade {
  call_id: string;
  access_token: string;
  transport: string | null;
  ice_servers: unknown[];
  /** When the token stops letting a browser join, epoch ms. */
  expires_at: number | null;
}

/**
 * A web call's request (decision 0069): the agent, the variables a real call's plan gives it (call-start.ts), the call's
 * own voice and length (agent_override, the saved agent untouched), and what the call is in our records (metadata, the
 * provider's to keep and ours to read back on every delivery and tool call). Pure, so a test reads what is sent.
 */
export function webCallBody(options: {
  agentId: string;
  variables: Record<string, string>;
  voiceId: string | null;
  /** How fast the voice speaks (decision 0073, R7), as a call on the line hears it; null or absent for its own pace. */
  voiceSpeed?: number | null;
  maxMs: number;
  metadata: Record<string, string | number>;
}): Record<string, unknown> {
  return {
    agent_id: options.agentId,
    retell_llm_dynamic_variables: options.variables,
    agent_override: {
      agent: {
        max_call_duration_ms: Math.round(options.maxMs),
        ...(options.voiceId ? { voice_id: options.voiceId } : {}),
        ...(typeof options.voiceSpeed === "number" ? { voice_speed: options.voiceSpeed } : {}),
      },
    },
    metadata: options.metadata,
  };
}

/** The answer as a browser needs it, or null when it is not one: a call id and a token are the least a join needs. */
export function webCallMadeOf(body: Record<string, unknown> | null): WebCallMade | null {
  if (!body || typeof body.call_id !== "string" || typeof body.access_token !== "string") return null;
  return {
    call_id: body.call_id,
    access_token: body.access_token,
    transport: typeof body.transport === "string" ? body.transport : null,
    ice_servers: Array.isArray(body.ice_servers) ? body.ice_servers : [],
    expires_at: typeof body.expires_at === "number" ? body.expires_at : null,
  };
}
