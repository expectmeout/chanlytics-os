/**
 * lead_round_start: a run row per term, made by its deterministic id, claimed (claim.ts), and only then started at
 * the provider. A round whose answer changed the plan re-judges its probe first (rejudge.ts).
 */

import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels";
import { CARDS, MAPS_RUN_TIMEOUT_SECS } from "../cards";
import { runIdFor, sha256Hex } from "../ids";
import type { LeadPorts } from "../ports";
import { mainAsk, probeAsk, probeYield, runCaps } from "../sizing";
import { claimOrRecover, startFailed } from "./claim";
import { rejudgeProbe } from "./rejudge";
import {
  FIRST_COLLECT_SECONDS,
  INPUT_MARKER,
  LeadRetry,
  type Phase,
  outOfTime,
  targetOf,
  wasJudged,
  webhookUrl,
} from "./rules";

/* ------------------------------------------------------------- the start */

export type TermOutcome = "started" | "reconciled" | "refused" | "unknown" | "someone_elses" | "already";
export type StartOutcome =
  | { kind: "not_open" }
  | { kind: "paused" }
  | { kind: "spent" }
  | { kind: "started"; phase: Phase; runs: { term: string; kind: TermOutcome }[] };

export async function startRound(p: LeadPorts, roundId: string, owner: string, resume = false): Promise<StartOutcome> {
  const round = await p.db.round(roundId);
  if (!round || round.state === "ended") return { kind: "not_open" };
  if (!(await p.db.leadSearchesOn(round.tenant_id))) {
    await p.db.roundEnd(round.id, "paused");
    return { kind: "paused" };
  }
  // What this round still has reserved. Nothing left starts nothing: the
  // actor's cap floor is a floor on a cap, never a licence to spend money the
  // round never reserved (S6), so the round ends on the word for it instead.
  const leftUsd = round.cost_reserved_usd - round.cost_usd;
  if (leftUsd <= 0) {
    await p.db.roundEnd(round.id, "budget_used");
    return { kind: "spent" };
  }
  const plan = round.plan;
  const card = CARDS[plan.card];
  const phase: Phase = round.purpose === "probe" && !resume && round.state !== "running" ? "probe" : "main";

  let ask: { terms: string[]; perTerm: number[] };
  if (phase === "probe") {
    ask = probeAsk(plan);
  } else {
    // An answer that changed the plan (Include, Change what I asked) re-judges the places the probe already judged
    // under it first: what it lets in comes back, what it now leaves out goes, and the rest is sized from that.
    if (resume && round.answered === "include" && round.purpose === "probe") await rejudgeProbe(p, round);
    const members = await p.db.membersOfRound(round.id);
    const judged = members.filter(wasJudged);
    const counted = members.filter((m) => m.counted).length;
    // Round 1 sizes from its probe; a top-up or a renewal has no probe of its own and starts from an even yield.
    const y = round.purpose === "probe" ? probeYield(judged) : 0.5;
    // The question said "I'm dropping X: it mostly returned those", and a yes accepted it. An answer that changed the
    // plan is a new plan, and its terms are the owner's: the dropped one finds the very kind they just included.
    const dropTerm = round.answered === "keep" ? (round.question?.dropTerm ?? null) : null;
    ask = mainAsk(plan, targetOf(round) - counted, y, dropTerm);
  }
  const caps = runCaps(plan, ask.perTerm, leftUsd);

  const wanted: { id: string; term: string; hash: string; places: number; cap: number }[] = [];
  for (const [i, term] of ask.terms.entries()) {
    // placesToAsk may give a term nothing at all when little is left (S6): a run asked for no places, or with nothing left to cap it, is never started.
    if (ask.perTerm[i] <= 0 || caps[i] <= 0) continue;
    const id = await runIdFor(round.id, phase, term);
    wanted.push({ id, term, hash: await sha256Hex(await p.webhookToken(id)), places: ask.perTerm[i], cap: caps[i] });
  }
  if (!wanted.length) return { kind: "started", phase, runs: [] };
  const rows = await p.db.runsEnsure(
    wanted.map((w) => ({
      id: w.id,
      tenant_id: round.tenant_id,
      round_id: round.id,
      purpose: "discover",
      term: w.term,
      actor: card.actor,
      build: card.build,
      webhook_token_hash: w.hash,
      cap_usd: w.cap,
    })),
  );

  const outcomes: { term: string; kind: TermOutcome }[] = [];
  for (const w of wanted) {
    const row = rows.find((r) => r.id === w.id);
    if (!row) throw new Error(`lead_round_start: the run row for ${w.term} was not made`);
    if (row.state !== "claimed" && !(row.state === "starting" && row.claimed_by === owner)) {
      outcomes.push({ term: w.term, kind: "already" });
      continue;
    }
    if (outOfTime(p)) throw new LeadRetry("out of time before a start: the ledger tries the rest again");
    const claim = await claimOrRecover(p, card.actor, row, owner);
    if (claim !== "mine") {
      outcomes.push({ term: w.term, kind: claim === "recovered" ? "reconciled" : "someone_elses" });
      continue;
    }
    const token = await p.webhookToken(row.id);
    const input = { ...(card.buildInput(plan, w.term, w.places) as Record<string, unknown>), [INPUT_MARKER]: row.id };
    try {
      const started = await p.apify.startRun(card.actor, input, {
        build: card.build,
        timeoutSecs: MAPS_RUN_TIMEOUT_SECS,
        maxTotalChargeUsd: w.cap,
        webhooks: [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: webhookUrl(p, row.id, token) }],
      });
      await p.db.runRecordStart(row.id, owner, started.id, started.datasetId, w.cap);
      await p.schedule("lead_collect", { run_id: row.id, seq: "p0" }, FIRST_COLLECT_SECONDS);
      outcomes.push({ term: w.term, kind: "started" });
    } catch (e) {
      outcomes.push({ term: w.term, kind: await startFailed(p, row, owner, e) });
    }
  }
  if (outcomes.length && outcomes.every((o) => o.kind === "refused")) await p.db.roundEnd(round.id, "source_failed");
  return { kind: "started", phase, runs: outcomes };
}
