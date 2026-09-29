/**
 * POST /api/admin/voice-converge — the phone agent's settings, planned and
 * applied from the edge.
 *
 * The converger script (tooling/scripts/ops/voice-converge.mjs) needs the
 * provider key on a laptop, and the key lives here and nowhere else. This
 * endpoint plans the same agent-level settings the script does — the webhook
 * events, the webhook budget, signed recording links, the post-call analysis
 * fields (packages/channels planAgentSettings) — and, with { apply: true },
 * applies them the way the script does: a published version cannot change,
 * so a new draft is created from it and patched, and with { publish: true }
 * the draft is published so a number pinned to latest_published follows it.
 * The LLM (the shell, with its secret tool header) is never touched here.
 *
 * Dry run by default. Idempotent: a converged agent plans nothing. The
 * response carries each agent as it was before any change, its webhook
 * secret stripped, as the backup. Diagnostic-key only.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import {
  getAgentRaw,
  createAgentVersion,
  updateAgent,
  publishAgentVersion,
  planAgentSettings,
  type LiveAgentSettings,
} from "../../lib/packages/channels.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/log.js";

const L = logger();

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

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/voice-converge");
  if (!auth.ok) return auth.response;
  const apiKey = env.RETELL_API_KEY;
  if (!apiKey) return refuse(503, "no_provider_key");
  let body: Body = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    /* dry run over every agent */
  }
  const apply = body.apply === true;
  const publish = body.publish === true;

  // Which agents: the one named, else every voice channel's.
  let agentIds: string[];
  if (typeof body.agent_id === "string" && /^agent_[a-z0-9]+$/i.test(body.agent_id)) {
    agentIds = [body.agent_id];
  } else {
    const db = pg();
    if (!db) return refuse(503, "no_database");
    const { data, error } = await db
      .from("tenant_channels")
      .select("external_id")
      .eq("kind", "voice")
      .eq("status", "active");
    if (error) return refuse(503, "read_failed", error.message);
    agentIds = (data ?? []).map((r) => r.external_id).filter((id): id is string => typeof id === "string");
  }

  const cfg = { apiKey };
  const agents: Record<string, unknown>[] = [];
  for (const agentId of agentIds) {
    const before = await getAgentRaw(cfg, agentId);
    if (!before) {
      agents.push({ agent_id: agentId, error: "unreadable" });
      continue;
    }
    const plan = planAgentSettings(before as unknown as LiveAgentSettings);
    const out: Record<string, unknown> = {
      agent_id: agentId,
      version: before.version ?? null,
      is_published: before.is_published ?? null,
      drift: plan.drift,
      patch_keys: plan.agentPatch ? Object.keys(plan.agentPatch) : [],
      applied: false,
      before: forRecord(before),
    };
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
        out.note = `v${working} is a draft: a pinned line stays on v${before.version} until it is published`;
      }
      const after = await getAgentRaw(cfg, agentId);
      out.after = after
        ? {
            version: after.version ?? null,
            is_published: after.is_published ?? null,
            drift: planAgentSettings(after as unknown as LiveAgentSettings).drift,
          }
        : null;
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
