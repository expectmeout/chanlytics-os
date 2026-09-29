/**
 * POST /api/admin/voice-provision — a workspace's phone receptionist on a
 * Retell-owned number, from the edge.
 *
 * What the laptop script did (tooling/scripts/setup_voice.py, retired) with
 * the provider key on someone's machine: create the Retell LLM that is the
 * shell and the agent over it (lib/voice-agent.ts, shared with lines),
 * publish the first version, bind a number — an existing Retell number, or
 * a local one bought in an area code — with the inbound webhook that fills
 * the facts per call, and write the voice row that routes every delivery
 * back to the workspace. The plan is packages/channels voice-provision.ts,
 * so the dry run prints exactly what the apply sends.
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
import { json, refuse } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { edgeFnUrl } from "../../lib/lines/lines.js";
import { pg } from "../../lib/pg.js";
import { recordNotification } from "../../lib/ops/notify.js";
import { emitEvent } from "../../lib/packages/db.js";
import { formatPhoneDisplay, isE164, type EdgeErrorCode } from "../../lib/packages/contracts.js";
import { createVoiceAgent } from "../../lib/voice/voice-agent.js";
import {
  planVoiceProvision,
  voiceNumberCreateBody,
  voiceNumberBindBody,
  voiceEndpoints,
  VOICE_AGENT_DEFAULTS,
  VOICE_LLM_DEFAULTS,
  createPhoneNumber,
  updatePhoneNumber,
  getRetellLlm,
  getAgentRaw,
  planAgentSettings,
  voiceShellDrift,
  type LiveAgentSettings,
  type ProvisionSecrets,
  type RetellConfig,
  type VoiceProvisionPlan,
  type VoiceProvisionRequest,
} from "../../lib/packages/channels.js";
import { env } from "../../lib/env.js";
import { logger, errField } from "../../lib/log.js";

const L = logger();

interface Body {
  tenant_id?: string;
  number?: string;
  area_code?: number | string;
  llm_id?: string;
  agent_id?: string;
  apply?: boolean;
}

function requestOf(body: Body): VoiceProvisionRequest {
  const area =
    typeof body.area_code === "number"
      ? body.area_code
      : typeof body.area_code === "string" && /^\d{3}$/.test(body.area_code.trim())
        ? Number(body.area_code.trim())
        : null;
  return {
    number: typeof body.number === "string" && body.number.trim() ? body.number.trim() : null,
    areaCode: area,
    llmId: typeof body.llm_id === "string" && body.llm_id ? body.llm_id : null,
    agentId: typeof body.agent_id === "string" && body.agent_id ? body.agent_id : null,
  };
}

/**
 * What the door answers about the plan: whose line, what the plan would do, what the apply would create. A request the
 * plan cannot make is `bad_request`, its problems in `detail` and in `plan.errors`.
 */
interface PlanAnswer {
  ok: boolean;
  error?: EdgeErrorCode;
  detail?: string;
  apply: boolean;
  tenant: { id: string; slug: string; name: string };
  plan: VoiceProvisionPlan;
  preview: Record<string, string | number>;
}

/**
 * A step that failed: which, the status it was answered with, and what it was told (the provider's body, as text), with
 * the plan and what was made so far. A step at the provider is `provider_refused`; the channel row, written last, is
 * `write_failed`.
 */
function failedStep(
  out: PlanAnswer,
  result: Record<string, unknown>,
  step: string,
  status: number,
  detail: unknown,
): Response {
  return json(status >= 500 ? 503 : 502, {
    ...out,
    ok: false,
    error: step === "channel" ? "write_failed" : "provider_refused",
    step,
    status,
    detail: typeof detail === "string" ? detail : JSON.stringify(detail),
    result,
  });
}

type ProvisionDb = NonNullable<ReturnType<typeof pg>>;

/** A knock the door let in: the provider's key and the tools' secret, the database, the body as read, and whose line. */
interface ProvisionKnock {
  apiKey: string;
  fnSecret: string;
  db: ProvisionDb;
  body: Body;
  apply: boolean;
  tenantId: string;
}

/**
 * The check, every refusal in its order: the knock, the provider key, the function secret, the database, then the
 * body's workspace. A refused request reads nothing past the refusal.
 */
async function checkProvisionKnock(request: Request): Promise<ProvisionKnock | Response> {
  const auth = authorizeAdmin(request, "/api/admin/voice-provision");
  if (!auth.ok) return auth.response;
  const apiKey = env.RETELL_API_KEY;
  const fnSecret = env.RETELL_FN_SECRET;
  if (!apiKey || !fnSecret) return refuse(503, !apiKey ? "no_provider_key" : "no_fn_secret");
  const db = pg();
  if (!db) return refuse(503, "no_database");

  let body: Body = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    /* validated below */
  }
  const apply = body.apply === true;
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  }
  return { apiKey, fnSecret, db, body, apply, tenantId };
}

/** The workspace and its voice row, if it has one: an unreadable table is `read_failed`, no workspace `not_found`. */
async function readWorkspaceLine(db: ProvisionDb, tenantId: string) {
  const tenant = await db.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle();
  if (tenant.error) return refuse(503, "read_failed", tenant.error.message);
  if (!tenant.data) return refuse(404, "not_found", "no such workspace");
  const existing = await db
    .from("tenant_channels")
    .select("id, status, external_id, number_e164")
    .eq("tenant_id", tenantId)
    .eq("kind", "voice")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing.error) return refuse(503, "read_failed", existing.error.message);
  return { tenant: tenant.data, existing: existing.data };
}

type WorkspaceLine = Exclude<Awaited<ReturnType<typeof readWorkspaceLine>>, Response>;

/** The request as the plan reads it, the plan, and what the door answers about it before anything is applied. */
function planAnswerFor(
  { tenant, existing }: WorkspaceLine,
  knock: ProvisionKnock,
): { req: VoiceProvisionRequest; plan: VoiceProvisionPlan; out: PlanAnswer } {
  const req = requestOf(knock.body);
  const plan = planVoiceProvision({
    tenant: { id: tenant.id, name: tenant.name },
    channel: existing
      ? {
          id: existing.id,
          status: existing.status,
          agentId: existing.external_id,
          number: existing.number_e164,
        }
      : null,
    request: req,
  });
  const ends = voiceEndpoints(edgeFnUrl());
  const out: PlanAnswer = {
    ok: plan.ok,
    apply: knock.apply,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
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
  return { req, plan, out };
}

/** What every call to the provider carries: the key, and the secret the tools and the call-start webhook present. */
interface ProviderAccess {
  cfg: RetellConfig;
  secrets: ProvisionSecrets;
}

type MadeAgent = Extract<Awaited<ReturnType<typeof createVoiceAgent>>, { ok: true }>["agent"];

/** A leg the provider or the row refused: which step, the status it was answered with, and what it was told. */
interface RefusedLeg {
  ok: false;
  step: string;
  status: number;
  detail: unknown;
}

/** The number the line answers on, the kind the provider says it is, whether it was bought, and what the answer says. */
interface BoundNumber {
  ok: true;
  number: string;
  numberType: string | null;
  bought: boolean;
  answer: Record<string, unknown>;
}

export async function POST(request: Request): Promise<Response> {
  const knock = await checkProvisionKnock(request);
  if (knock instanceof Response) return knock;
  const line = await readWorkspaceLine(knock.db, knock.tenantId);
  if (line instanceof Response) return line;
  const { req, plan, out } = planAnswerFor(line, knock);
  if (!plan.ok) return json(400, { ...out, error: "bad_request", detail: plan.errors.join("; ") });
  if (!knock.apply || plan.nothing) return json(200, out);
  return applyProvision(knock, req, plan, out);
}

/**
 * Apply, in the plan's order. Every step reads its own effect before it acts; anything created so far rides in
 * `result`, so a failed run can be resumed instead of repeated.
 */
async function applyProvision(
  knock: ProvisionKnock,
  req: VoiceProvisionRequest,
  plan: VoiceProvisionPlan,
  out: PlanAnswer,
): Promise<Response> {
  const provider: ProviderAccess = { cfg: { apiKey: knock.apiKey }, secrets: { fnSecret: knock.fnSecret } };
  const result: Record<string, unknown> = {};
  const fail = (leg: RefusedLeg) => failedStep(out, result, leg.step, leg.status, leg.detail);

  // 1–3. The LLM, the agent, the first version published — created, reused, or adopted.
  const made = await createVoiceAgent(provider.cfg, provider.secrets, {
    agentName: plan.names.agent,
    llmId: req.llmId,
    agentId: req.agentId,
  });
  if (!made.ok) {
    result.llm = made.partial.llmId ? { llm_id: made.partial.llmId, version: made.partial.llmVersion } : null;
    return fail(made);
  }
  const agent = made.agent;
  result.llm = { llm_id: agent.llmId, version: agent.llmVersion, created: agent.created.llm };
  result.agent = { agent_id: agent.agentId, version: agent.agentVersion, created: agent.created.agent };
  result.publish = agent.publish;

  const bound = await numberLeg(provider, req, plan, agent);
  if (!bound)
    return json(200, {
      ...out,
      result,
      note: "agent ready; no number asked for — re-run with number or area_code, and this agent_id, to finish",
    });
  if (!bound.ok) return fail(bound);
  result.number = bound.answer;

  const row = await voiceRowLeg(knock, agent, bound);
  if (!row.ok) return fail(row);
  result.channel = { id: row.id, status: "active" };

  await announceLeg(knock, row.id, agent, bound);
  const after = await readBackLeg(provider.cfg, agent);
  result.after = after;
  L.info("voice_provision", {
    tenant: knock.tenantId,
    agent_id: agent.agentId,
    llm_id: agent.llmId,
    number: bound.number,
    pinned: agent.pinned,
    bought: bound.bought,
  });
  return json(200, { ...out, result });
}

/** 4. The number: bind an existing one, or buy one in the area code. Neither asked for: null, and the run ends there. */
async function numberLeg(
  provider: ProviderAccess,
  req: VoiceProvisionRequest,
  plan: VoiceProvisionPlan,
  agent: MadeAgent,
): Promise<BoundNumber | RefusedLeg | null> {
  if (req.number) return bindExistingNumber(provider, req.number, plan, agent);
  if (req.areaCode !== null && req.areaCode !== undefined) return buyInAreaCode(provider, req.areaCode, plan, agent);
  return null;
}

async function bindExistingNumber(
  { cfg, secrets }: ProviderAccess,
  number: string,
  plan: VoiceProvisionPlan,
  { agentId, pinned }: MadeAgent,
): Promise<BoundNumber | RefusedLeg> {
  const w = await updatePhoneNumber(
    cfg,
    number,
    voiceNumberBindBody({ agentId, pinned, nickname: plan.names.nickname }, secrets),
  );
  if (!w.ok) return { ok: false, step: "number", status: w.status, detail: w.body };
  const numberType = typeof w.body?.phone_number_type === "string" ? w.body.phone_number_type : null;
  const answer = { phone_number: number, bound: true, pinned, type: numberType };
  return { ok: true, number, numberType, bought: false, answer };
}

async function buyInAreaCode(
  { cfg, secrets }: ProviderAccess,
  areaCode: number,
  plan: VoiceProvisionPlan,
  { agentId, pinned }: MadeAgent,
): Promise<BoundNumber | RefusedLeg> {
  const w = await createPhoneNumber(
    cfg,
    voiceNumberCreateBody({ areaCode, agentId, pinned, nickname: plan.names.nickname }, secrets),
  );
  if (!w.ok) return { ok: false, step: "number", status: w.status, detail: w.body };
  const bought = typeof w.body?.phone_number === "string" ? w.body.phone_number : "";
  if (!isE164(bought))
    return { ok: false, step: "number", status: 502, detail: "the provider answered without a phone number" };
  const numberType = typeof w.body?.phone_number_type === "string" ? w.body.phone_number_type : null;
  const answer = { phone_number: bought, bought: true, area_code: areaCode, pinned, type: numberType };
  return { ok: true, number: bought, numberType, bought: true, answer };
}

/** 5. The row: the line exists for the product from here on. */
async function voiceRowLeg(
  { db, tenantId }: ProvisionKnock,
  { agentId, llmId, agentVersion, pinned }: MadeAgent,
  { number, numberType }: BoundNumber,
): Promise<{ ok: true; id: string } | RefusedLeg> {
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
  if (ins.error)
    return {
      ok: false,
      step: "channel",
      status: 503,
      detail: `${ins.error.message} — the number ${number} is bound to ${agentId}; re-run with number and agent_id`,
    };
  return { ok: true, id: ins.data.id };
}

/** 6. Tell the workspace, and the platform. */
async function announceLeg(
  { db, tenantId }: ProvisionKnock,
  channelId: string,
  { agentId, llmId, pinned }: MadeAgent,
  { number, numberType, bought }: BoundNumber,
): Promise<void> {
  const shown = formatPhoneDisplay(number) ?? number;
  await recordNotification(tenantId, {
    kind: "number",
    title: `Your phone line is ready: ${shown}`,
    body: `The receptionist answers calls on ${shown}. Call it from your own phone to hear it; the Live page shows the call as it happens, and Setup now reads the line as ready.`,
    route: "admin/setup",
    about: { type: "setup", id: channelId },
  });
  try {
    await emitEvent(db, tenantId, "voice.provisioned", "tenant_channel", channelId, {
      agent_id: agentId,
      llm_id: llmId,
      number,
      pinned,
      bought,
      number_type: numberType,
    });
  } catch (e) {
    L.error("voice_provision_event_failed", { error: errField(e) });
  }
}

/** 7. Read back: a freshly provisioned line plans nothing on either converger. */
async function readBackLeg(cfg: RetellConfig, { agentId, llmId }: MadeAgent): Promise<Record<string, unknown>> {
  const after = await getAgentRaw(cfg, agentId);
  const engine = (after?.response_engine ?? {}) as Record<string, unknown>;
  const llmAfter = llmId
    ? await getRetellLlm(cfg, llmId, typeof engine.version === "number" ? engine.version : null)
    : null;
  return {
    agent: after
      ? planAgentSettings(after as unknown as LiveAgentSettings, {
          retentionDays: VOICE_AGENT_DEFAULTS.data_storage_retention_days,
        }).drift
      : ["unreadable"],
    shell: llmAfter ? voiceShellDrift(llmAfter).drift : ["unreadable"],
    published: after?.is_published ?? null,
  };
}
