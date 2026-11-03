/**
 * A trial that has used what it includes (decision 0090: the trial covers everything, up to contracts' TRIAL_INCLUDES)
 * starts its plan: Stripe ends the trial now (startPlanNowFor, Billing's own "Start my plan now") and the owner is told
 * once on the bell. At four fifths of either the minutes or the replies the owner is told once that it is near. What a
 * trial used is the database's (trial_use, 00512); what it means is contracts' (trialSpentOf). The lines sweep carries
 * it every quarter hour, beside the numbers of workspaces that stopped paying: a trial's cost is its number and its
 * minutes. This file decides over ports, so the tests run it against a world in memory.
 */
import { TRIAL_SPENT_WORDS, trialSpentOf, trialUseWords } from "../packages/contracts.js";

/** How many trials one tick looks at: a quarter hour's work, the rest the next tick's. */
export const TRIALS_PER_TICK = 200;

export interface TrialUse {
  callSeconds: number;
  replies: number;
}

export interface TrialPorts {
  /** The workspaces on a trial with a subscription to end early. */
  ids(): Promise<string[]>;
  useOf(tenantId: string): Promise<TrialUse>;
  /** Stripe ends the trial now and the row follows (Billing's start-now); ok false with what Stripe said. */
  startPlan(tenantId: string): Promise<{ ok: boolean; detail?: string }>;
  /** A bell row kept once under `onceKey`: true when it is kept, now or before. */
  tell(tenantId: string, onceKey: string, title: string, body: string): Promise<boolean>;
  log: {
    info(event: string, f: Record<string, unknown>): void;
    error(event: string, f: Record<string, unknown>): void;
  };
}

export interface TrialsResult {
  looked: number;
  near: number;
  started: number;
  failed: number;
  unreadable: number;
}

/** The trials looked at, the near told, the plans started early, and what could not be read or started. */
export async function sweepSpentTrials(p: TrialPorts, max = TRIALS_PER_TICK): Promise<TrialsResult> {
  const out: TrialsResult = { looked: 0, near: 0, started: 0, failed: 0, unreadable: 0 };
  const ids = (await p.ids()).slice(0, max);
  for (const tenantId of ids) {
    out.looked += 1;
    let use: TrialUse;
    try {
      use = await p.useOf(tenantId);
    } catch (e) {
      out.unreadable += 1;
      p.log.error("trial_use_unreadable", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const s = trialSpentOf(use);
    const words = trialUseWords(use);
    if (s.spent) {
      const r = await p.startPlan(tenantId);
      if (r.ok) {
        out.started += 1;
        await p.tell(tenantId, `trial_spent:${tenantId}`, TRIAL_SPENT_WORDS.title, TRIAL_SPENT_WORDS.detail(words));
        p.log.info("trial_spent_plan_started", { tenant_id: tenantId, share: s.share });
      } else {
        out.failed += 1;
        await p.tell(
          tenantId,
          `trial_spent_failed:${tenantId}`,
          TRIAL_SPENT_WORDS.failedTitle,
          TRIAL_SPENT_WORDS.failed,
        );
        p.log.error("trial_spent_plan_refused", { tenant_id: tenantId, detail: r.detail ?? null });
      }
    } else if (s.near) {
      if (await p.tell(tenantId, `trial_near:${tenantId}`, TRIAL_SPENT_WORDS.nearTitle, TRIAL_SPENT_WORDS.near(words)))
        out.near += 1;
    }
  }
  return out;
}
