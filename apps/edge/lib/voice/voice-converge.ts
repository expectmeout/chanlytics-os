/**
 * POST /api/admin/voice-converge — the phone agent's settings, planned and
 * applied from the edge.
 *
 * The door is api/admin/voice-converge.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this
 * the knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The converger script (tooling/scripts/ops/voice-converge.mjs) needs the
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
 * The LLM (the shell, with its secret tool header) is never touched here.
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
  createAgentVersion,
  updateAgent,
  publishAgentVersion,
  planAgentSettings,
  retellLocalesFor,
  unpublishedLatestNote,
  newDraftNote,
  type LiveAgentSettings,
} from "../packages/channels.js";
import { resolveChannel } from "../packages/db.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import type { Admitted } from "../admin-auth.js";

interface Body {
  agent_id?: string;
  apply?: boolean;
  publish?: boolean;
}

/** The agent as the backup keeps it: every field, the webhook URL without its query string. */
function forRecord(a: Record<string, unknown>): Record<string, unknown> {
  const url = typeof a.webhook_url === "string" ? a.webhook_url.split("?")[0] : a.webhook_url;
  return { ...a, webhook_url: url };
}

/** Which agents: the one named, else every voice channel's (or the refusal to read them). */
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
  return (data ?? []).map((r) => r.external_id).filter((id): id is string => typeof id === "string");
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

export async function convergeVoiceAgents(auth: Admitted, body: Partial<Body>): Promise<Response> {
  const L = logger();
  if (auth.workspace)
    return refuse(403, "platform_only", "this door converges every workspace's agent: the platform's alone");
  const apiKey = env.RETELL_API_KEY;
  if (!apiKey) return refuse(503, "no_provider_key");
  const apply = body.apply === true;
  const publish = body.publish === true;

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
    if (apply && plan.agentPatch) {
      // A published version cannot change: the patch goes on a new draft.
      let working = typeof before.version === "number" ? before.version : null;
      if (before.is_published === true && working !== null) {
        const draft = await createAgentVersion(cfg, agentId, working);
        if (!draft.ok) {
          agents.push({ ...out, error: { step: "create_version", status: draft.status, body: draft.body } });
          continue;
        }
        working = typeof draft.body?.version === "number" ? (draft.body.version as number) : working;
        out.draft_version = working;
      }
      const patched = await updateAgent(cfg, agentId, plan.agentPatch);
      if (!patched.ok) {
        agents.push({ ...out, error: { step: "update", status: patched.status, body: patched.body } });
        continue;
      }
      out.applied = true;
      if (publish && working !== null && working !== before.version) {
        const pub = await publishAgentVersion(cfg, agentId, working, "converged from the edge");
        if (!pub.ok) {
          agents.push({ ...out, error: { step: "publish", status: pub.status, body: pub.body } });
          continue;
        }
        out.published_version = working;
      } else if (working !== null && working !== before.version) {
        out.note = newDraftNote(working, before.version);
      }
      out.after = await readBack(cfg, agentId, opts);
      L.info("voice_converge", {
        agent_id: agentId,
        from: before.version ?? null,
        working,
        published: out.published_version ?? null,
        keys: out.patch_keys,
      });
    }
    agents.push(out);
  }
  return json(200, { ok: true, apply, publish, agents });
}
