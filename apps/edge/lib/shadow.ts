/**
 * The second model, asked in shadow (scorecard move 10, step 12; decision 0023): a purpose whose answer is a closed set
 * (contracts models.ts `shadow`) is put the same question beside the primary, and the two answers are compared and
 * kept. It changes nothing a customer receives, by construction:
 *
 *   - it asks only when TYPESAFE_SHADOW is '1' AND TYPESAFE_API_KEY is set, and asks nothing otherwise, not even a
 *     read of the database;
 *   - it runs beside the primary, never instead of it: startShadow begins the calls at once and hands back a run,
 *     the primary carries on, and settle (after the primary's answer is in) waits for the shadow no longer than
 *     SHADOW_GRACE_MS, so a slow or dead second model costs the primary's caller a second and a half at most, and
 *     usually nothing;
 *   - its answer is never used: settle compares it with the label the primary gave and writes one row per question to
 *     the usage ledger (contracts shadowBodies; 00278), and returns nothing;
 *   - a failure of any part of it (the call, the read, the write) is logged and ends there: nothing in this module
 *     throws to its caller, and a call that never answered is a ledger row that says so.
 *
 * The key is read here and handed to the adapter, which puts it in one header; nothing here logs it, and the words an
 * error is logged in have been scrubbed of it. What is sent is the customer's own words or one lead's listing facts:
 * never the business's prompt, its facts or a person's name.
 */
import { askSystemOne, type SystemOneReply } from "./packages/channels.js";
import {
  SHADOW_GRACE_MS,
  SYSTEM_ONE_MODEL,
  shadowBodies,
  shadowPortOf,
  type ModelPurpose,
  type ShadowCallOutcome,
  type ShadowCallSpec,
} from "./packages/contracts.js";
import { recordModelUsage } from "./packages/db.js";
import { env } from "./env.js";
import { modelDeps } from "./model.js";
import { pg } from "./pg.js";
import { logger, errField } from "./log.js";

/** How many of one run's calls are in flight at once: a judge's batch is a call a place. */
const IN_FLIGHT = 5;

/** Who a shadow is for: the workspace (the ledger's row) and what the call was about. */
interface ShadowFor {
  tenantId: string | null;
  subjectId?: string | null;
}

/** A shadow underway. `settle` compares and writes it once the primary has answered; it never throws. */
interface ShadowRun {
  /** The primary's label for a question of a call, by the call's ref; null when the primary gave none. */
  settle(primary: (ref: string, question: string) => string | null): Promise<void>;
}

/** Whether a purpose is asked in shadow now: it names a port, the switch is '1', and the key is set. */
function shadowKey(purpose: ModelPurpose): string | null {
  if (shadowPortOf(purpose) === null || env.TYPESAFE_SHADOW !== "1") return null;
  return env.TYPESAFE_API_KEY ?? null;
}

/** What a reply came to, as the ledger says it. */
function outcomeOf(r: SystemOneReply): ShadowCallOutcome {
  if (r.outcome === "ok") return { outcome: "ok", model: r.model, inputTokens: r.inputTokens, answers: r.answers };
  return { outcome: r.outcome === "rejected" ? "rejected" : "unreachable", model: SYSTEM_ONE_MODEL };
}

interface Answered {
  spec: ShadowCallSpec;
  reply: SystemOneReply;
}

/** The calls, `IN_FLIGHT` at a time, each answered or failed, none thrown, in the order they were given. */
async function runCalls(key: string, calls: ShadowCallSpec[], signal: AbortSignal): Promise<Answered[]> {
  const done: Array<Answered | undefined> = [];
  let next = 0;
  const worker = async () => {
    while (next < calls.length && !signal.aborted) {
      const at = next++;
      const spec = calls[at];
      if (spec)
        done[at] = {
          spec,
          reply: await askSystemOne(key, { state: spec.state, questions: spec.questions, signal }, modelDeps()),
        };
    }
  };
  await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, calls.length) }, worker));
  return done.filter((d): d is Answered => d !== undefined);
}

/**
 * Begin a purpose's shadow: null when it is not asked (the switch, the key, the purpose, no workspace or no call), else
 * the calls are on their way and the run's `settle` finishes it. Call it beside the primary's own call, before it.
 */
export function startShadow(purpose: ModelPurpose, who: ShadowFor, calls: ShadowCallSpec[]): ShadowRun | null {
  const key = shadowKey(purpose);
  const tenantId = who.tenantId;
  const port = shadowPortOf(purpose);
  if (!key || !tenantId || !port || calls.length === 0) return null;
  const L = logger({ tenant_id: tenantId });
  const stop = new AbortController();
  const started = runCalls(key, calls, stop.signal).catch((e: unknown) => {
    L.error("shadow_failed", { purpose, error: errField(e) });
    return [];
  });
  return {
    async settle(primary) {
      try {
        const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), SHADOW_GRACE_MS).unref?.());
        const results = await Promise.race([started, late]);
        // A shadow the primary has outrun is left behind: its calls end, and nothing is written for them.
        if (!results) return stop.abort();
        const db = pg();
        if (!db) return;
        const rows = results.flatMap(({ spec, reply }) => {
          if (reply.outcome !== "ok") {
            L.warn("shadow_failed", { purpose, outcome: reply.outcome, status: reply.status, error: reply.error });
          }
          const labels = Object.fromEntries(Object.keys(spec.questions).map((q) => [q, primary(spec.ref, q)]));
          return shadowBodies(
            {
              tenantId,
              purpose,
              port,
              subjectId: who.subjectId ?? null,
              questions: spec.questions,
              primary: labels,
            },
            outcomeOf(reply),
          );
        });
        if (rows.length) await recordModelUsage(db, rows);
      } catch (e) {
        L.error("shadow_write_failed", { purpose, error: errField(e) });
      }
    },
  };
}
