/**
 * The voice provider, watched from the health sweep (decision 0092): the two things nothing else read.
 *
 *   - How many calls the provider's account is on, against how many it may hold at once. One account answers every
 *     workspace's line, so its limit is everybody's: a busy workspace can fill it and leave every other line answering
 *     busy (concurrency_limit_reached). At 80% the platform is paged, before a caller is turned away.
 *   - Whether every live agent is still on the product's shell and its settings (voiceShellDrift, agentSettingsDrift):
 *     the prompt and the tools, the webhook and its events, signed recording links, the call's limits (CALL_LIMITS).
 *     A change to the shell that ships leaves the live agents on the old one until they are converged, and a setting
 *     typed into the provider's dashboard is the old way the phone came to say last month's hours. Read once a day (the
 *     sweep's two runs in the 06:00 UTC hour; a page is once per key per pager window), since it is two provider reads
 *     an agent. The page says what to run: the converger, from the edge (tooling/scripts/ops/voice/voice-converge.mjs).
 *
 * Never throws, never fails the sweep: a provider that does not answer is logged and asked again next run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agentSettingsDrift,
  getAgent,
  getConcurrency,
  getRetellLlm,
  voiceShellDrift,
  type RetellConcurrency,
} from "@chanlytics/channels/voice";
import { listActiveVoiceAgents } from "@chanlytics/db/facts";
import { type Database } from "@chanlytics/db/types";
import { edgeFnUrl } from "../../shared/dashboard-origin.js";
import { env } from "../../shared/env.js";
import { errField, logger } from "../../shared/log.js";
import { pageOperator } from "../../shared/alerts/page-operator.js";
import { signatureOnly } from "../../shared/door-auth.js";

type Db = SupabaseClient<Database>;

/** The share of the account's limit that pages: a caller is not yet turned away. */
const CONCURRENCY_PAGE_SHARE = 0.8;

/** The hour (UTC) the agents are read for drift, once a day. */
const DRIFT_HOUR_UTC = 6;

/** Whether the account is near its limit: the share it is on, or null when the provider did not say both numbers. */
function concurrencyShare(c: RetellConcurrency | null): number | null {
  if (!c || c.current === null || c.limit === null || c.limit <= 0) return null;
  return c.current / c.limit;
}

/** One agent's drift: the shell's and the settings', or why it could not be read. */
async function agentDrift(apiKey: string, agentId: string): Promise<string[]> {
  const agent = await getAgent({ apiKey }, agentId);
  if (!agent) return ["the agent could not be read"];
  const llm = agent.llm_id ? await getRetellLlm({ apiKey }, agent.llm_id, agent.llm_version) : null;
  const shell = llm ? voiceShellDrift(llm, edgeFnUrl(), signatureOnly()).drift : ["the shell's LLM could not be read"];
  return [...shell, ...agentSettingsDrift(agent).drift];
}

export async function watchVoice(
  db: Db,
  now: Date = new Date(),
): Promise<{ concurrency: number | null; drifted: number | null }> {
  const log = logger();
  const apiKey = env.RETELL_API_KEY;
  if (!apiKey) return { concurrency: null, drifted: null };
  let share: number | null = null;
  try {
    const concurrency = await getConcurrency({ apiKey });
    share = concurrencyShare(concurrency);
    if (share !== null && share >= CONCURRENCY_PAGE_SHARE && concurrency) {
      await pageOperator(
        { db },
        "voice_concurrency",
        `The voice provider is on ${concurrency.current} of its ${concurrency.limit} calls at once`,
        `Every workspace's line shares the voice provider's account, and it is at ${Math.round(share * 100)}% of the calls it ` +
          `may hold at once. Past it, callers hear a busy line (concurrency_limit_reached). Raise the account's limit with ` +
          `the provider.`,
      );
    }
  } catch (e) {
    log.warn("voice_watch_failed", { part: "concurrency", error: errField(e) });
  }
  if (now.getUTCHours() !== DRIFT_HOUR_UTC) return { concurrency: share, drifted: null };
  const drifted: Array<{ agentId: string; tenantId: string; drift: string[] }> = [];
  try {
    for (const a of await listActiveVoiceAgents(db)) {
      const drift = await agentDrift(apiKey, a.agentId);
      if (drift.length) drifted.push({ ...a, drift });
    }
  } catch (e) {
    log.warn("voice_watch_failed", { part: "drift", error: errField(e) });
    return { concurrency: share, drifted: null };
  }
  if (drifted.length) {
    log.warn("voice_drift_found", { agents: drifted.length });
    await pageOperator(
      { db },
      "voice_drift",
      `${drifted.length} phone ${drifted.length === 1 ? "line has" : "lines have"} drifted from the product's shell`,
      drifted.map((d) => `${d.agentId} (workspace ${d.tenantId}):\n  - ${d.drift.join("\n  - ")}`).join("\n\n") +
        `\n\nConverge them from the edge: node --import tsx tooling/scripts/ops/voice/voice-converge.mjs (a dry run), ` +
        `then --apply --publish.`,
    );
  }
  return { concurrency: share, drifted: drifted.length };
}
