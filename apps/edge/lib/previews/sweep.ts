/**
 * The previews sweep (decision 0079): pg_cron asks it every hour ('previews-sweep', 00497) through
 * trigger_previews_sweep, which calls the edge only while a preview is past its thirty days.
 *
 * Each preview past its end that nobody made theirs is ended, the oldest first: its agent at the provider deleted first
 * (every version, and the LLM it was over), since a workspace erased leaves nothing that could name it; then
 * preview_end clears its words and erases its workspace, its counts kept. A provider that would not answer, or says no,
 * leaves the preview for the next hour, never an agent with no workspace behind it. A preview that never had a call has
 * no agent, and ends at once.
 *
 * The work is bounded by time: no preview starts after PREVIEWS_YIELD_AT_MS from the door's first line, and what is left is first
 * in line the next hour. It answers 200 with the counts whatever the provider said, and 503 only when the previews
 * cannot be read. Its lines carry `sweep: "previews"`, and the tick ends in one previews_swept.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteAgent, deleteRetellLlm } from "../packages/channels.js";
import { endPreview, previewsPastTheirEnd, voiceAgentOf, type Database } from "../packages/db.js";
import { json, refuse } from "../http.js";
import { env } from "../env.js";
import { errField, type Logger } from "../log.js";
import type { SweepTick } from "../ops/sweep-door.js";

type Db = SupabaseClient<Database>;

/** No preview starts after this, counted from the door's first line: each is two calls and a write, under ten seconds. */
const PREVIEWS_YIELD_AT_MS = 40_000;
/** The most previews one tick reads. */
const PREVIEWS_PER_TICK = 50;

/** The provider's two deletes, as ports: the real ones, or a test's. */
interface PreviewProvider {
  apiKey: string | undefined;
  deleteAgent: typeof deleteAgent;
  deleteRetellLlm: typeof deleteRetellLlm;
}

/** What became of one preview this round. */
type Swept = "ended" | "held" | "failed";

async function endOne(
  db: Db,
  row: { id: string; tenant_id: string; preview_tenant_id: string | null },
  provider: PreviewProvider,
  L: Logger,
): Promise<Swept> {
  const agent = row.preview_tenant_id ? await voiceAgentOf(db, row.preview_tenant_id) : null;
  if (agent) {
    if (!provider.apiKey) {
      L.warn("preview_end_failed", { preview_id: row.id, step: "agent", why: "no_provider_key" });
      return "held";
    }
    const cfg = { apiKey: provider.apiKey };
    const gone = await provider.deleteAgent(cfg, agent.agentId);
    if (!gone.ok) {
      L.warn("preview_end_failed", { preview_id: row.id, step: "agent", status: gone.status });
      return "held";
    }
    // The LLM costs nothing on its own: one the provider kept is logged and left, and the preview still ends.
    if (agent.llmId) {
      const llm = await provider.deleteRetellLlm(cfg, agent.llmId);
      if (!llm.ok) L.warn("preview_end_failed", { preview_id: row.id, step: "llm", status: llm.status });
    }
  }
  if (await endPreview(db, row.id)) L.info("preview_ended", { preview_id: row.id, agent: !!agent });
  return "ended";
}

export async function sweepPreviews(
  { db, L, started }: SweepTick,
  provider: PreviewProvider = { apiKey: env.RETELL_API_KEY, deleteAgent, deleteRetellLlm },
  now: () => number = Date.now,
): Promise<Response> {
  let rows: Awaited<ReturnType<typeof previewsPastTheirEnd>>;
  try {
    rows = await previewsPastTheirEnd(db, new Date(now()), PREVIEWS_PER_TICK);
  } catch (e) {
    L.error("preview_end_failed", { step: "read", error: errField(e) });
    return refuse(503, "no_database");
  }
  const counts: Record<Swept | "left", number> = { ended: 0, held: 0, failed: 0, left: 0 };
  for (const row of rows) {
    if (now() - started > PREVIEWS_YIELD_AT_MS) {
      counts.left += 1;
      continue;
    }
    try {
      counts[await endOne(db, row, provider, L)] += 1;
    } catch (e) {
      // The provider that gave no answer, or a write that failed: the preview waits for the next hour.
      L.error("preview_end_failed", { preview_id: row.id, step: "end", error: errField(e) });
      counts.failed += 1;
    }
  }
  L.info("previews_swept", { previews: rows.length, ...counts });
  return json(200, { ok: true, previews: rows.length, ...counts });
}
