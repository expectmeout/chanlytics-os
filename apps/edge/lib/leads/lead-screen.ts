/**
 * The judge's screen (decision 0085). Before the judge reads a batch, the second model (TypeSafe's Jev) is asked of every
 * place the questions that leave one out, the kind and each exclusion, word for word as the shadow asks them (contracts
 * judgeScreenCalls), and a place it fails at the judge's floor or over (contracts screenFloorOf) is left out on its
 * answer (contracts screenedAnswer): the judge is never asked of it. Opus judges the rest, as it always did.
 *
 * Asked only where TYPESAFE_SCREEN names the workspace ('1' for every one) and TYPESAFE_API_KEY is set; otherwise it asks
 * nothing, not even the building of a call, and every place goes to the judge. A call that failed, or ran past the
 * screen's bound, screens nothing: its place goes to the judge. Each call is a row of the usage ledger, by the second
 * model's port and no shadow (its answer is used, never compared), paid in the round the judge's own rows name. Nothing
 * here throws to the collect.
 */
import { askSystemOne, type LeadJudge, type LeadScreen, type SystemOneReply } from "../packages/channels.js";
import {
  SECOND_MS,
  SHADOW_TIMEOUT_MS,
  SHADOW_WRITE_MS,
  SYSTEM_ONE_MODEL,
  judgeScreenCalls,
  screenFloorOf,
  screenedAnswer,
  shadowSwitchOn,
  systemOneDollars,
  type AiUsageBody,
  type LeadSearchPlan,
  type PlaceFacts,
} from "../packages/contracts.js";
import { recordModelUsage } from "../packages/db.js";
import { env } from "../env.js";
import { errField, logger } from "../log.js";
import { modelDeps } from "../model.js";
import { pg } from "../pg.js";

/** How many places are asked at once: TypeSafe's rate is the account's, shared by every search running. */
const IN_FLIGHT = 8;
/** The most a batch's screen may take: past it, what has not answered goes to the judge, which has its own bound to keep. */
const SCREEN_BOUND_MS = 8 * SECOND_MS;

/** The key when the screen is on for a workspace: the judge's route names a floor, the switch names it, the key is set. */
function screenKey(tenantId: string | undefined): string | null {
  if (!tenantId || screenFloorOf("lead_judge") === null || !shadowSwitchOn(env.TYPESAFE_SCREEN, tenantId)) return null;
  return env.TYPESAFE_API_KEY ?? null;
}

/** Every call, IN_FLIGHT at a time, each answered or failed and none thrown, all ended at the screen's bound. */
async function askAll(key: string, calls: ReturnType<typeof judgeScreenCalls>): Promise<SystemOneReply[]> {
  const signal = AbortSignal.timeout(SCREEN_BOUND_MS);
  const replies: SystemOneReply[] = [];
  let next = 0;
  const worker = async () => {
    while (next < calls.length) {
      const at = next++;
      const c = calls[at];
      if (!c) continue;
      replies[at] = await askSystemOne(
        key,
        { state: c.state, questions: c.questions, timeoutMs: SHADOW_TIMEOUT_MS, signal },
        modelDeps(),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, calls.length) }, worker));
  return replies;
}

/** One call as the usage ledger keeps it: the second model's port, not a shadow, so nothing compared. */
function screenUsageOf(tenantId: string, roundId: string | undefined, reply: SystemOneReply): AiUsageBody {
  const ok = reply.outcome === "ok";
  return {
    tenant_id: tenantId,
    purpose: "lead_judge",
    model_asked: SYSTEM_ONE_MODEL,
    model: ok ? reply.model : SYSTEM_ONE_MODEL,
    outcome: ok ? "answered" : reply.outcome === "rejected" ? "rejected" : "unreachable",
    input_tokens: ok ? reply.inputTokens : 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    usd: ok ? systemOneDollars(reply.inputTokens) : 0,
    prompt_hash: null,
    user_id: null,
    subject_id: roundId ?? null,
    port: "typesafe",
    shadow: false,
  };
}

/** The calls' rows, written no longer than the shadow's own write may take: the judge never waits on the ledger. */
async function keepUsage(rows: AiUsageBody[], L: ReturnType<typeof logger>): Promise<void> {
  const db = pg();
  if (!db || rows.length === 0) return;
  const write = recordModelUsage(db, rows).catch((e: unknown) => {
    L.error("lead_screen_failed", { stage: "usage", error: errField(e) });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tooSlow = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SHADOW_WRITE_MS);
  });
  await Promise.race([write, tooSlow]);
  clearTimeout(timer);
}

/** The places of one batch the screen leaves out, by their refs, or null when it asks nothing or could not ask. */
async function screenPlaces(
  plan: LeadSearchPlan,
  places: PlaceFacts[],
  tenantId?: string,
  roundId?: string,
): Promise<LeadScreen | null> {
  const key = screenKey(tenantId);
  const floor = screenFloorOf("lead_judge");
  if (!key || floor === null || !tenantId || places.length === 0) return null;
  const L = logger({ tenant_id: tenantId });
  try {
    const calls = judgeScreenCalls(plan, places);
    const replies = await askAll(key, calls);
    await keepUsage(
      replies.map((r) => screenUsageOf(tenantId, roundId, r)),
      L,
    );
    const failed = replies.filter((r) => r.outcome !== "ok").length;
    if (failed) L.warn("lead_screen_failed", { stage: "calls", calls: failed, of: calls.length });
    let model: string = SYSTEM_ONE_MODEL;
    const answers = calls.flatMap((c, at) => {
      const r = replies[at];
      if (r?.outcome !== "ok") return [];
      model = r.model;
      const a = screenedAnswer(plan, c.ref, r.answers, floor);
      return a ? [a] : [];
    });
    return { answers, model };
  } catch (e) {
    L.error("lead_screen_failed", { stage: "screen", error: errField(e) });
    return null;
  }
}

/** The judge with its screen before it (decision 0085): every place it answers is never put to the judge. */
export function screened(inner: LeadJudge): LeadJudge {
  return { ...inner, screen: screenPlaces };
}
