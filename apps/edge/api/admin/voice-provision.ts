/**
 * POST /api/admin/voice-provision — a workspace's phone receptionist, from
 * the edge.
 *
 * What the laptop script did (tooling/scripts/setup_voice.py, retired) with
 * the provider key on someone's machine: create the Retell LLM that is the
 * shell, the agent over it with the product's voice and webhook, publish
 * the first version, bind a number — an existing Retell number, or a local
 * one bought in an area code — with the inbound webhook that fills the
 * facts per call, and write the voice row that routes every delivery back
 * to the workspace. The plan is packages/channels voice-provision.ts, so the
 * dry run prints exactly what the apply sends.
 *
 * Dry run by default. Idempotent: a workspace with a voice row plans
 * nothing; a run that fails after creating the LLM or the agent answers
 * with their ids, and the next run passes them back (llm_id, agent_id) to
 * resume — each is read from the provider before it is trusted. The row is
 * written last, once a number answers. Buying a number costs money every
 * month: only { apply: true } with area_code does it. Secrets never come
 * back: every URL is returned without its query string, and a provider's
 * success body (which echoes the webhook URL) is never echoed.
 * Diagnostic-key only.
 */
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { recordNotification } from "../../lib/notify.js";
import { emitEvent } from "../../lib/workspace/db.js";
import { formatPhoneDisplay } from "../../lib/workspace/contracts.js";
import {
  planVoiceProvision,
  voiceLlmCreateBody,
  voiceAgentCreateBody,
  voiceNumberCreateBody,
  voiceNumberBindBody,
  voiceEndpoints,
  VOICE_AGENT_DEFAULTS,
  VOICE_LLM_DEFAULTS,
  createRetellLlm,
  createAgent,
  createPhoneNumber,
  updatePhoneNumber,
  getRetellLlm,
  getAgentRaw,
  publishAgentVersion,
  planAgentSettings,
  voiceShellDrift,
  type LiveAgentSettings,
  type VoiceProvisionRequest,
} from "../../lib/workspace/channels.js";

interface Body {
  tenant_id?: string;
  number?: string;
  area_code?: number | string;
  llm_id?: string;
  agent_id?: string;
  apply?: boolean;
}

const E164 = /^\+[1-9]\d{6,14}$/;

function requestOf(body: Body): VoiceProvisionRequest {
  const area =
    typeof body.area_code === "number" ? body.area_code
      : typeof body.area_code === "string" && /^\d{3}$/.test(body.area_code.trim()) ? Number(body.area_code.trim())
        : null;
  return {
    number: typeof body.number === "string" && body.number.trim() ? body.number.trim() : null,
    areaCode: area,
    llmId: typeof body.llm_id === "string" && body.llm_id ? body.llm_id : null,
    agentId: typeof body.agent_id === "string" && body.agent_id ? body.agent_id : null,
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const apiKey = process.env.RETELL_API_KEY;
  const fnSecret = process.env.RETELL_FN_SECRET;
  if (!apiKey || !fnSecret) return json(503, { ok: false, error: !apiKey ? "no_provider_key" : "no_fn_secret" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  let body: Body = {};
  try { body = JSON.parse(await request.text()); } catch { /* validated below */ }
  const apply = body.apply === true;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return json(400, { ok: false, error: "tenant_id (a workspace id) is required" });
  }

  const tenant = await db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
  if (tenant.error) return json(503, { ok: false, error: tenant.error.message });
  if (!tenant.data) return json(404, { ok: false, error: "no such workspace" });
  const existing = await db.from("tenant_channels").select("id, status, external_id, number_e164").eq("tenant_id", tenantId).eq("kind", "voice").order("created_at").limit(1).maybeSingle();
  if (existing.error) return json(503, { ok: false, error: existing.error.message });

  const req = requestOf(body);
  const plan = planVoiceProvision({
    tenant: { id: tenant.data.id, name: tenant.data.name },
    channel: existing.data ? { id: existing.data.id, status: existing.data.status, agentId: existing.data.external_id, number: existing.data.number_e164 } : null,
    request: req,
  });
  const ends = voiceEndpoints();
  const out: Record<string, unknown> = {
    ok: plan.ok,
    apply,
    tenant: { id: tenant.data.id, slug: tenant.data.slug, name: tenant.data.name },
    plan,
    // What the apply would create, without a secret in it.
    preview: {
      agent_name: plan.names.agent,
      nickname: plan.names.nickname,
      voice_id: VOICE_AGENT_DEFAULTS.voice_id,
      languages: VOICE_AGENT_DEFAULTS.language.length,
      model: VOICE_LLM_DEFAULTS.model,
      retention_days: VOICE_AGENT_DEFAULTS.data_storage_retention_days,
      webhook_url: ends.webhook,
      inbound_webhook_url: ends.inbound,
      tools_url: ends.fn,
    },
  };
  if (!plan.ok) return json(400, out);
  if (!apply || plan.nothing) return json(200, out);

  // Apply, in the plan's order. Every step reads its own effect before it
  // acts; anything created so far rides in `result`, so a failed run can be
  // resumed instead of repeated.
  const cfg = { apiKey };
  const secrets = { fnSecret };
  const result: Record<string, unknown> = {};
  const fail = (step: string, status: number, detail: unknown) =>
    json(status >= 500 ? 503 : 502, { ...out, ok: false, error: { step, status, detail }, result });

  // 1 + 2. The LLM and the agent — created, reused, or adopted.
  let llmId = req.llmId;
  let llmVersion: number | null = null;
  let agentId: string;
  let agentVersion: number | null = null;
  let published = false;
  if (req.agentId) {
    const a = await getAgentRaw(cfg, req.agentId);
    if (!a) return fail("agent", 404, `${req.agentId} is not readable with this key`);
    const engine = (a.response_engine ?? {}) as Record<string, unknown>;
    if (engine.type !== "retell-llm" || typeof engine.llm_id !== "string") return fail("agent", 422, "the adopted agent is not on a Retell LLM");
    agentId = req.agentId;
    llmId = engine.llm_id;
    llmVersion = typeof engine.version === "number" ? engine.version : null;
    agentVersion = typeof a.version === "number" ? a.version : null;
    published = a.is_published === true;
    result.llm = { llm_id: llmId, version: llmVersion, adopted: true };
    result.agent = { agent_id: agentId, version: agentVersion, adopted: true };
  } else {
    if (llmId) {
      const l = await getRetellLlm(cfg, llmId);
      if (!l) return fail("llm", 404, `${llmId} is not readable with this key`);
      llmVersion = l.version;
      result.llm = { llm_id: llmId, version: llmVersion, reused: true };
    } else {
      const w = await createRetellLlm(cfg, voiceLlmCreateBody(secrets));
      if (!w.ok || typeof w.body?.llm_id !== "string") return fail("llm", w.status, w.body);
      llmId = w.body.llm_id;
      llmVersion = typeof w.body.version === "number" ? w.body.version : null;
      result.llm = { llm_id: llmId, version: llmVersion, created: true };
    }
    const w = await createAgent(cfg, voiceAgentCreateBody({ llmId, llmVersion, agentName: plan.names.agent }, secrets));
    if (!w.ok || typeof w.body?.agent_id !== "string") return fail("agent", w.status, w.body);
    agentId = w.body.agent_id;
    agentVersion = typeof w.body.version === "number" ? w.body.version : null;
    published = w.body.is_published === true;
    result.agent = { agent_id: agentId, version: agentVersion, created: true };
  }

  // 3. Publish the first version, so the number can pin to latest_published.
  //    A refusal is not the end: the number then follows the latest version,
  //    and voice-converge --publish --pin closes that later.
  let pinned = true;
  let publish: Record<string, unknown> | null = null;
  if (!published && agentVersion !== null) {
    const p = await publishAgentVersion(cfg, agentId, agentVersion, "provisioned from the edge");
    if (p.ok) published = true;
    else publish = { ok: false, status: p.status, detail: p.body, note: "the number follows the latest version instead of latest_published; publish and pin with voice-converge later" };
  }
  if (!published) pinned = false;
  result.publish = publish ?? (published ? { ok: true, version: agentVersion } : { ok: false, note: "no version to publish; the number follows the latest version" });

  // 4. The number: bind an existing one, or buy one in the area code.
  let number = req.number;
  let numberType: string | null = null;
  if (number) {
    const w = await updatePhoneNumber(cfg, number, voiceNumberBindBody({ agentId, pinned, nickname: plan.names.nickname }, secrets));
    if (!w.ok) return fail("number", w.status, w.body);
    numberType = typeof w.body?.phone_number_type === "string" ? w.body.phone_number_type : null;
    result.number = { phone_number: number, bound: true, pinned, type: numberType };
  } else if (req.areaCode !== null && req.areaCode !== undefined) {
    const w = await createPhoneNumber(cfg, voiceNumberCreateBody({ areaCode: req.areaCode, agentId, pinned, nickname: plan.names.nickname }, secrets));
    if (!w.ok) return fail("number", w.status, w.body);
    const bought = typeof w.body?.phone_number === "string" ? w.body.phone_number : "";
    if (!E164.test(bought)) return fail("number", 502, "the provider answered without a phone number");
    number = bought;
    numberType = typeof w.body?.phone_number_type === "string" ? w.body.phone_number_type : null;
    result.number = { phone_number: number, bought: true, area_code: req.areaCode, pinned, type: numberType };
  } else {
    return json(200, { ...out, result, note: "agent ready; no number asked for — re-run with number or area_code, and this agent_id, to finish" });
  }

  // 5. The row: the line exists for the product from here on.
  const ins = await db
    .from("tenant_channels")
    .insert({
      tenant_id: tenantId,
      kind: "voice",
      external_id: agentId,
      number_e164: number,
      status: "active",
      config: {
        provider: "retell",
        llm_id: llmId,
        agent_version: agentVersion,
        pinned,
        number_type: numberType,
        provisioned_at: new Date().toISOString(),
        provisioned_by: "voice-provision",
      },
    })
    .select("id")
    .single();
  if (ins.error) return fail("channel", 503, `${ins.error.message} — the number ${number} is bound to ${agentId}; re-run with number and agent_id`);
  result.channel = { id: ins.data.id, status: "active" };

  // 6. Tell the workspace, and the platform.
  const shown = formatPhoneDisplay(number) ?? number;
  await recordNotification(tenantId, {
    kind: "number",
    title: `Your phone line is ready: ${shown}`,
    body: `The receptionist answers calls on ${shown}. Call it from your own phone to hear it; the Live page shows the call as it happens, and Setup now reads the line as ready.`,
    route: "admin/setup",
    about: { type: "setup", id: ins.data.id },
  });
  try {
    await emitEvent(db, tenantId, "voice.provisioned", "setup", "tenant_channel", ins.data.id, {
      agent_id: agentId, llm_id: llmId, number, pinned, bought: !req.number, number_type: numberType,
    });
  } catch (e) {
    console.error("voice_provision_event_failed", e instanceof Error ? e.message : String(e));
  }

  // 7. Read back: a freshly provisioned line plans nothing on either converger.
  const after = await getAgentRaw(cfg, agentId);
  const engine = (after?.response_engine ?? {}) as Record<string, unknown>;
  const llmAfter = llmId ? await getRetellLlm(cfg, llmId, typeof engine.version === "number" ? engine.version : null) : null;
  result.after = {
    agent: after ? planAgentSettings(after as unknown as LiveAgentSettings, { retentionDays: VOICE_AGENT_DEFAULTS.data_storage_retention_days }).drift : ["unreadable"],
    shell: llmAfter ? voiceShellDrift(llmAfter).drift : ["unreadable"],
    published: after?.is_published ?? null,
  };
  console.log("voice_provision", JSON.stringify({ tenant: tenantId, agent_id: agentId, llm_id: llmId, number, pinned, bought: !req.number }));
  return json(200, { ...out, result });
}
