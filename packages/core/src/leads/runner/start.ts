/**
 * lead_round_start: a run row per term, made by its deterministic id, claimed (claim.ts), and only then started at
 * the provider. A round whose answer changed the plan re-judges its probe first (rejudge.ts). A people plan's round
 * (00430) starts its one run in people.ts.
 */

import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels";
import { peoplePlanOf } from "@chanlytics/contracts";
import { CARDS, MAPS_RUN_TIMEOUT_SECS } from "../cards";
import { runIdFor, sha256Hex } from "../ids";
import type { LeadPorts } from "../ports";
import { mainAsk, probeAsk, probeYield, runCaps } from "../sizing";
import { claimOrRecover, startFailed } from "./claim";
import { startPeople } from "./people";
import { rejudgeProbe } from "./rejudge";
import {
  FIRST_COLLECT_SECONDS,
  INPUT_MARKER,
  LeadRetry,
  type Phase,
  heldBack,
  outOfTime,
  targetOf,
  wasJudged,
  webhookUrl,
} from "./rules";

/* ------------------------------------------------------------- the start */

/** no_room: a term past the runs the round's reserve holds the actor's floor for (runCaps), said and never started. */
export type TermOutcome = "started" | "reconciled" | "refused" | "unknown" | "someone_elses" | "already" | "no_room";
/** What became of one term's run; a refused one carries the provider's own words, for the log line that says it. */
type TermSaid = { term: string; kind: TermOutcome; why?: string };
export type StartOutcome =
  | { kind: "not_open" }
  | { kind: "paused" | "may_not_spend" }
  | { kind: "spent" }
  | { kind: "started"; phase: Phase; runs: TermSaid[] };

/** A run a start makes: its deterministic id, its token's hash, and what it asks for and may charge. */
type WantedRun = { id: string; term: string; hash: string; places: number; cap: number };

/**
 * The runs a start makes, one per term in the plan's order, and the terms it does not start. placesToAsk may give a
 * term nothing at all when little is left (S6): a run asked for no places is never started, and is not said. Nor is one
 * past the runs the reserve holds the actor's floor for (runCaps): the caps of the runs that start never add up to more
 * than the round reserved, and a term it could not afford is said beside the round's runs (no_room), with no row and no
 * call to the provider.
 */
async function runsToStart(
  p: LeadPorts,
  roundId: string,
  phase: Phase,
  ask: { terms: string[]; perTerm: number[] },
  caps: number[],
): Promise<{ wanted: WantedRun[]; untried: TermSaid[] }> {
  const wanted: WantedRun[] = [];
  const untried: TermSaid[] = [];
  for (const [i, term] of ask.terms.entries()) {
    const places = ask.perTerm[i] ?? 0;
    const cap = caps[i] ?? 0;
    if (places <= 0) continue;
    if (cap <= 0) {
      untried.push({ term, kind: "no_room" });
      continue;
    }
    const id = await runIdFor(roundId, phase, term);
    wanted.push({ id, term, hash: await sha256Hex(await p.webhookToken(id)), places, cap });
  }
  return { wanted, untried };
}

/**
 * A start with no run to make. Where every term it would ask of had no room (runCaps: less left than one run's floor),
 * nothing can start, so the round ends on the word for it, as one with nothing left does, never left queued for the
 * sweep to call the source failed (29 Oct 2026: five leads reserved $0.33 and waited an hour). Otherwise it is said as
 * started, with the terms it did not start.
 */
async function nothingToStart(p: LeadPorts, roundId: string, phase: Phase, untried: TermSaid[]): Promise<StartOutcome> {
  if (untried.length > 0 && untried.every((t) => t.kind === "no_room")) {
    await p.db.roundEnd(roundId, "budget_used");
    return { kind: "spent" };
  }
  return { kind: "started", phase, runs: untried };
}

export async function startRound(p: LeadPorts, roundId: string, owner: string, resume = false): Promise<StartOutcome> {
  const round = await p.db.round(roundId);
  if (!round || round.state === "ended") return { kind: "not_open" };
  // Searching switched off for this workspace, or a workspace that may no longer spend (its plan lapsed or its card
  // failed since the door reserved): nothing new reaches the provider, and the round ends as a switched-off one does.
  const held = await heldBack(p, round.tenant_id);
  if (held) {
    await p.db.roundEnd(round.id, "paused");
    return { kind: held };
  }
  // What this round still has reserved. Nothing left starts nothing: the
  // actor's cap floor is a floor on a cap, never a licence to spend money the
  // round never reserved (S6), so the round ends on the word for it instead.
  const leftUsd = round.cost_reserved_usd - round.cost_usd;
  if (leftUsd <= 0) {
    await p.db.roundEnd(round.id, "budget_used");
    return { kind: "spent" };
  }
  // A people search (00430): one run for its filters, no probe and no terms.
  const people = peoplePlanOf(round.plan);
  if (people) return startPeople(p, round, people, owner, leftUsd);
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
  const { wanted, untried } = await runsToStart(p, round.id, phase, ask, runCaps(plan, ask.perTerm, leftUsd));
  if (!wanted.length) return nothingToStart(p, round.id, phase, untried);
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

  const outcomes: TermSaid[] = [];
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
      outcomes.push({ term: w.term, ...(await startFailed(p, row, owner, e)) });
    }
  }
  if (outcomes.length && outcomes.every((o) => o.kind === "refused")) await p.db.roundEnd(round.id, "source_failed");
  return { kind: "started", phase, runs: [...outcomes, ...untried] };
}
