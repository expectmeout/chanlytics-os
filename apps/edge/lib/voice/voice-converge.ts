/**
 * POST /api/admin/voice-converge — the phone agent's settings, planned and
 * applied from the edge.
 *
 * The door is api/admin/voice-converge.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this
 * the knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The converger script (tooling/scripts/ops/voice/voice-converge.mjs) needs the
 * provider key on a laptop, and the key lives here and nowhere else. This
 * endpoint plans the same agent-level settings the script does — the webhook
 * events, the webhook budget, signed recording links, the post-call analysis
 * fields, the silence reminders and the locales the agent listens for, from
 * the languages its workspace speaks (packages/channels planAgentSettings) —
 * and, with { apply: true },
 * applies them the way the script does: a published version cannot change,
 * so a new draft is created from it and patched, and with { publish: true }
 * the draft is published so a number pinned to latest_published follows it.
 * A draft that was already the latest takes the patch where it is and is never
 * published for it: it may hold edits made elsewhere, so the answer says so,
 * whether or not anything is applied. What differs from the product's defaults
 * and is the owner's (the voice, the post-call model) comes back as `notes`,
 * and is never changed here.
 * The LLM (the shell: the prompt, its placeholders and defaults, the four
 * tools) is converged here too since decision 0092, so the laptop converger
 * that needed the provider key is a thin client of this door: its plan is
 * planVoiceConvergence's, against the shell the switch says (the tools carry
 * the shared secret's header only while the voice doors still read it,
 * signatureOnly), and its patch goes on the same draft as the agent's.
 * `{ shell: false }` converges the agent's settings alone. `{ pin_number }`, with the agent named, binds that number to
 * latest_published (the old script's --pin), so it follows each version published (pinPlan).
 *
 * Dry run by default. Idempotent: a converged agent plans nothing. The
 * response carries each agent as it was before any change, its webhook
 * secret stripped, as the backup.
 *
 * Cross-workspace: a platform door converging every workspace's voice agent; nothing in the dashboard calls it.
 * Because it acts on any agent by id, it is the platform's alone: a token minted by the platform for this door (the
 * runbook's knock) that names no workspace, or the platform key on an edge that holds no secret. A token that names
 * a workspace is a dashboard's, and is refused (`platform_only`), as the pager's door refuses one.
 */
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import {
  getAgentRaw,
  getPhoneNumber,
  getRetellLlm,
  createAgentVersion,
  updateAgent,
  updateRetellLlm,
  updatePhoneNumber,
  publishAgentVersion,
  planAgentSettings,
  planVoiceConvergence,
  desiredVoiceShell,
  type VoiceConvergencePlan,
  retellLocalesFor,
  unpublishedLatestNote,
  newDraftNote,
  voiceNumberBinding,
  type LiveAgentSettings,
} from "../packages/channels.js";
import { resolveChannel, voiceAgentsBeforeANumber } from "../packages/db.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { env } from "../env.js";
import { edgeFnUrl } from "../dashboard-origin.js";
import { signatureOnly } from "./voice-door-auth.js";
import { logger } from "../log.js";
import type { Admitted } from "../admin-auth.js";

interface Body {
  agent_id?: string;
  apply?: boolean;
  publish?: boolean;
  /** Converge the LLM's shell beside the agent's settings: true unless said false. */
  shell?: boolean;
  /** The named agent's number (E.164), to bind to latest_published. */
  pin_number?: string;
}

/** The agent as the backup keeps it: every field, the webhook URL without its query string. */
function forRecord(a: Record<string, unknown>): Record<string, unknown> {
  const url = typeof a.webhook_url === "string" ? a.webhook_url.split("?")[0] : a.webhook_url;
  return { ...a, webhook_url: url };
}

/**
 * Which agents: the one named, else every voice channel's, and every agent made before its number (voice_agents,
 * decision 0069), so the number bought later answers in an agent on the shell (or the refusal to read them).
 */
async function agentsNamed(body: Body): Promise<string[] | Response> {
  if (typeof body.agent_id === "string" && /^agent_[a-z0-9]+$/i.test(body.agent_id)) return [body.agent_id];
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const { data, error } = await db
    .from("tenant_channels")
    .select("external_id")
    .eq("kind", "voice")
    .eq("status", "active");
  if (error) return refuse(503, "read_failed", error.message);
  let before: string[];
  try {
    before = await voiceAgentsBeforeANumber(db);
  } catch (e) {
    return refuse(503, "read_failed", e instanceof Error ? e.message : String(e));
  }
  const lines = (data ?? []).map((r) => r.external_id).filter((id): id is string => typeof id === "string");
  return [...new Set([...lines, ...before])];
}

/**
 * The locales the agent's workspace speaks, or why the language is left as it is: an agent no workspace was found for, a
 * workspace that could not be read (a blip is never a change to the line), or languages that say nothing certain
 * (retellLocalesFor) keep what it listens for.
 */
async function workspaceLocales(agentId: string): Promise<{ locales: string[] } | { kept: string }> {
  const db = pg();
  const routed = db ? await resolveChannel(db, "voice", agentId) : null;
  if (!db || !routed) return { kept: "no workspace was found for this agent: what it listens for is kept" };
  const rt = await loadTenantRuntime(db, routed);
  if (rt.loadFailed) return { kept: "the workspace could not be read: what the agent listens for is kept" };
  return retellLocalesFor(rt.brain?.profile?.languages);
}

/** One agent's plan, and the answer's record of it before anything is applied: the backup, its webhook secret stripped. */
async function planOne(agentId: string, before: Record<string, unknown>) {
  const spoken = await workspaceLocales(agentId);
  const opts = "locales" in spoken ? { locales: spoken.locales } : {};
  const plan = planAgentSettings(before as unknown as LiveAgentSettings, opts);
  const out: Record<string, unknown> = {
    agent_id: agentId,
    version: before.version ?? null,
    is_published: before.is_published ?? null,
    drift: plan.drift,
    notes: "kept" in spoken ? [...plan.notes, spoken.kept] : plan.notes,
    patch_keys: plan.agentPatch ? Object.keys(plan.agentPatch) : [],
    applied: false,
    before: forRecord(before),
  };
  if (before.is_published !== true) out.note = unpublishedLatestNote(before.version);
  return { opts, plan, out };
}

/**
 * The shell's plan for the LLM the agent points at: the prompt, the placeholders, their spoken defaults and the four
 * tools, with the booking tools posting where the live one does (or this edge) and carrying the shared secret's
 * header only while the voice doors still read it (signatureOnly). Null for an agent on no Retell LLM, or one that
 * could not be read, said in `out`.
 */
async function shellPlanOf(
  cfg: { apiKey: string },
  before: Record<string, unknown>,
  out: Record<string, unknown>,
): Promise<{ llmId: string; plan: VoiceConvergencePlan } | null> {
  const engine = (before.response_engine ?? {}) as { type?: string; llm_id?: string; version?: number | null };
  if (engine.type !== "retell-llm" || typeof engine.llm_id !== "string") {
    out.shell = { error: "not_a_retell_llm" };
    return null;
  }
  const llm = await getRetellLlm(cfg, engine.llm_id, engine.version ?? null);
  if (!llm) {
    out.shell = { error: "llm_unreadable" };
    return null;
  }
  const booking = (llm.general_tools ?? []).find((t) => t.name === "send_booking_link");
  const url = typeof booking?.url === "string" ? booking.url : edgeFnUrl();
  const secret = signatureOnly() ? null : env.RETELL_FN_SECRET;
  const headers = signatureOnly()
    ? null
    : ((booking?.headers as Record<string, string> | undefined) ?? (secret ? { "x-fn-secret": secret } : null));
  const plan = planVoiceConvergence(llm, desiredVoiceShell(url, headers));
  out.shell = {
    llm_id: engine.llm_id,
    llm_version: llm.version,
    drift: plan.drift,
    notes: plan.notes,
    unknown_tools: plan.unknownTools,
    patch_keys: plan.llmPatch ? Object.keys(plan.llmPatch) : [],
  };
  return { llmId: engine.llm_id, plan };
}

/**
 * A number bound to latest_published follows each version published, where one bound to no version follows the latest,
 * a draft included. Refused while the agent's latest version is a draft: the line would switch back to the stale
 * published one. A number that answers in another agent is refused: a pin never moves a line. Planned on a dry run.
 */
async function pinPlan(
  cfg: { apiKey: string },
  p: { agentId: string; number: string; latestPublished: boolean; apply: boolean },
): Promise<Record<string, unknown>> {
  if (!p.latestPublished)
    return { pinned: false, refused: "the latest version is a draft: publish it first, or the line switches back" };
  const bound = await getPhoneNumber(cfg, p.number);
  if (!bound) return { pinned: false, refused: "the number could not be read" };
  const ours = ((bound.inbound_agents ?? []) as Array<{ agent_id?: string; agent_version?: unknown }>).find(
    (a) => a.agent_id === p.agentId,
  );
  if (!ours) return { pinned: false, refused: "the number does not answer in this agent: a pin never moves a line" };
  if (ours.agent_version === "latest_published") return { pinned: true, already: true };
  if (!p.apply) return { pinned: false, would_pin: true };
  const put = await updatePhoneNumber(cfg, p.number, {
    inbound_agents: voiceNumberBinding({ agentId: p.agentId, pinned: true }),
  });
  return put.ok ? { pinned: true } : { pinned: false, error: { step: "pin", status: put.status, body: put.body } };
}

/** The agent read again after the change, planned on the same terms: what the provider now holds. */
async function readBack(cfg: { apiKey: string }, agentId: string, opts: { locales?: string[] }) {
  const after = await getAgentRaw(cfg, agentId);
  if (!after) return null;
  return {
    version: after.version ?? null,
    is_published: after.is_published ?? null,
    drift: planAgentSettings(after as unknown as LiveAgentSettings, opts).drift,
  };
}

/** A step the provider refused: which, its status and its answer. */
type StepFailed = { step: string; status: number; body: unknown };

/**
 * One agent's plan applied. A published version cannot change, so the patches go on a new draft made from it; the
 * shell's first, since a new draft clones the LLM with it and the patch must land on what the draft points at. Published
 * when asked, else the new draft is named. What was done is written on `out`; the step the provider refused, or null.
 */
async function applyOne(
  cfg: { apiKey: string },
  a: {
    agentId: string;
    before: Record<string, unknown>;
    plan: ReturnType<typeof planAgentSettings>;
    shell: Awaited<ReturnType<typeof shellPlanOf>>;
    opts: { locales?: string[] };
    publish: boolean;
  },
  out: Record<string, unknown>,
): Promise<StepFailed | null> {
  const { agentId, before, plan, shell } = a;
  let working = typeof before.version === "number" ? before.version : null;
  if (before.is_published === true && working !== null) {
    const draft = await createAgentVersion(cfg, agentId, working);
    if (!draft.ok) return { step: "create_version", status: draft.status, body: draft.body };
    working = typeof draft.body?.version === "number" ? (draft.body.version as number) : working;
    out.draft_version = working;
  }
  if (shell?.plan.llmPatch) {
    const llmPatched = await updateRetellLlm(cfg, shell.llmId, shell.plan.llmPatch);
    if (!llmPatched.ok) return { step: "update_llm", status: llmPatched.status, body: llmPatched.body };
  }
  if (plan.agentPatch) {
    const patched = await updateAgent(cfg, agentId, plan.agentPatch);
    if (!patched.ok) return { step: "update", status: patched.status, body: patched.body };
  }
  out.applied = true;
  // The version the patches went on, where it is not the one that was there: a new draft to publish or to name.
  const drafted = working !== null && working !== before.version ? working : null;
  if (a.publish && drafted !== null) {
    const pub = await publishAgentVersion(cfg, agentId, drafted, "converged from the edge");
    if (!pub.ok) return { step: "publish", status: pub.status, body: pub.body };
    out.published_version = drafted;
  } else if (drafted !== null) {
    out.note = newDraftNote(drafted, before.version);
  }
  out.after = await readBack(cfg, agentId, a.opts);
  logger().info("voice_converge", {
    agent_id: agentId,
    from: before.version ?? null,
    working,
    published: out.published_version ?? null,
    keys: out.patch_keys,
    shell_keys: shell?.plan.llmPatch ? Object.keys(shell.plan.llmPatch).join(",") : "",
  });
  return null;
}

export async function convergeVoiceAgents(auth: Admitted, body: Partial<Body>): Promise<Response> {
  if (auth.workspace)
    return refuse(403, "platform_only", "this door converges every workspace's agent: the platform's alone");
  const apiKey = env.RETELL_API_KEY;
  if (!apiKey) return refuse(503, "no_provider_key");
  const apply = body.apply === true;
  const publish = body.publish === true;
  const pinNumber = typeof body.pin_number === "string" ? body.pin_number : null;
  if (pinNumber !== null && (!/^\+[1-9]\d{6,14}$/.test(pinNumber) || typeof body.agent_id !== "string"))
    return refuse(400, "bad_request", "pin_number is the named agent's number, in E.164");

  const agentIds = await agentsNamed(body);
  if (agentIds instanceof Response) return agentIds;

  const cfg = { apiKey };
  const agents: Record<string, unknown>[] = [];
  for (const agentId of agentIds) {
    const before = await getAgentRaw(cfg, agentId);
    if (!before) {
      agents.push({ agent_id: agentId, error: "unreadable" });
      continue;
    }
    const { opts, plan, out } = await planOne(agentId, before);
    const shell = body.shell === false ? null : await shellPlanOf(cfg, before, out);
    if (apply && (plan.agentPatch || shell?.plan.llmPatch)) {
      const failed = await applyOne(cfg, { agentId, before, plan, shell, opts, publish }, out);
      if (failed) {
        agents.push({ ...out, error: failed });
        continue;
      }
    }
    if (pinNumber) {
      const latestPublished =
        out.published_version !== undefined || (before.is_published === true && out.draft_version === undefined);
      out.pin = await pinPlan(cfg, { agentId, number: pinNumber, latestPublished, apply });
    }
    agents.push(out);
  }
  return json(200, { ok: true, apply, publish, agents });
}
