/**
 * lead_round_start: a run row per term, made by its deterministic id, claimed (claim.ts), and only then started at
 * the provider. A round whose answer changed the plan re-judges its probe first (rejudge.ts). A people plan's round
 * (00430) starts its one run in people.ts.
 */

import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels/leads";
import { peoplePlanOf } from "@chanlytics/contracts";
import { CARDS, MAPS_RUN_TIMEOUT_SECS } from "../cards";
import { retryRunIdFor, runIdFor, hashSha256Hex } from "../ids";
import type { LeadPorts, LeadRoundRow } from "../ports";
import { probeAsk, runCaps, runsRoom, type TermsAsk } from "../sizing";
import { claimOrRecover, startFailed } from "./claim";
import { planMainAsk } from "./main-ask";
import { startPeople } from "./people";
import { rejudgeProbe } from "./rejudge";
import { findNextAreas } from "./round-decision";
import { FIRST_COLLECT_SECONDS, INPUT_MARKER, LeadRetry, type Phase, heldBack, outOfTime, webhookUrl } from "./rules";

/* ------------------------------------------------------------- the start */

/**
 * no_room: a term past the runs the round's reserve holds the actor's floor for (runCaps), said and never started.
 * later: a term of the main phase whose turn comes once the one before it has read its area (main-ask.ts).
 */
export type TermOutcome =
  "started" | "reconciled" | "refused" | "unknown" | "someone_elses" | "already" | "no_room" | "later";
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
 * The runs a start makes, one per term it asks, and the terms it does not start. placesToAsk may give a term nothing at
 * all when little is left (S6): a run asked for no places is never started, and is not said. Nor is one past the runs
 * the reserve holds the actor's floor for (runCaps): the caps of the runs that start never add up to more than the round
 * reserved, and a term it could not afford is said beside the round's runs (no_room), with no row and no call to the
 * provider.
 */
async function runsToStart(
  leadPorts: LeadPorts,
  roundId: string,
  phase: Phase,
  ask: TermsAsk,
  caps: number[],
  tries: ReadonlyMap<string, number>,
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
    // A term whose main runs failed starts its next try under a row of its own (retries.ts); the first is the plain id.
    const id =
      phase === "main"
        ? await retryRunIdFor(roundId, term, tries.get(term) ?? 0)
        : await runIdFor(roundId, phase, term);
    wanted.push({ id, term, hash: await hashSha256Hex(await leadPorts.webhookToken(id)), places, cap });
  }
  for (const term of ask.waiting) untried.push({ term, kind: "no_room" });
  for (const term of ask.later ?? []) untried.push({ term, kind: "later" });
  return { wanted, untried };
}

/**
 * A round with no run it can make ends at its limit, never left queued for the sweep to call the source failed (29 Oct
 * 2026: five leads reserved $0.33 and waited an hour). Either what it reserved holds no run's floor, or every term it
 * would ask has read all a term may in its area and there is nothing new to pay for there. It names where the search
 * looks next before it ends (decision 0133), so a search that widens carries on there with a reserve of its own, and a
 * top-up of a search whose area is read (Carry on, the rest when the leads renew, Look up to 50 miles) carries on there
 * instead of ending where it began. What the round reserved is its own estimate: that it ran out is never said as the
 * month's searching (contracts endingOfRound).
 */
async function endAtItsLimit(leadPorts: LeadPorts, round: LeadRoundRow): Promise<StartOutcome> {
  const nearby = await findNextAreas(leadPorts, round);
  if (nearby.length) await leadPorts.db.roundNearby(round.id, nearby);
  await leadPorts.db.roundEnd(round.id, "few_new_matches");
  return { kind: "spent" };
}

export async function startRound(
  leadPorts: LeadPorts,
  roundId: string,
  owner: string,
  resume = false,
): Promise<StartOutcome> {
  const round = await leadPorts.db.round(roundId);
  if (!round || round.state === "ended") return { kind: "not_open" };
  // Searching switched off for this workspace, or a workspace that may no longer spend (its plan lapsed or its card
  // failed since the door reserved): nothing new reaches the provider, and the round ends as a switched-off one does.
  const held = await heldBack(leadPorts, round.tenant_id);
  if (held) {
    await leadPorts.db.roundEnd(round.id, "paused");
    return { kind: held };
  }
  // What this round still has reserved. Nothing left starts nothing: the
  // actor's cap floor is a floor on a cap, never a licence to spend money the
  // round never reserved (S6), so the round ends at its limit instead.
  const leftUsd = round.cost_reserved_usd - round.cost_usd;
  if (leftUsd <= 0) return endAtItsLimit(leadPorts, round);
  // A people search (00430): one run for its filters, no probe and no terms.
  const people = peoplePlanOf(round.plan);
  if (people) return startPeople(leadPorts, round, people, owner, leftUsd);
  const plan = round.plan;
  const card = CARDS[plan.card];
  const phase: Phase = round.purpose === "probe" && !resume && round.state !== "running" ? "probe" : "main";

  const room = runsRoom(leftUsd);
  let begun: TermSaid[] = [];
  let ask: TermsAsk;
  let tries: ReadonlyMap<string, number> = new Map();
  if (phase === "probe") {
    ask = probeAsk(plan, room);
  } else {
    // An answer that changed the plan (Include, Change what I asked) re-judges the places the probe already judged
    // under it first: what it lets in comes back, what it now leaves out goes, and the rest is sized from that.
    if (resume && round.answered === "include" && round.purpose === "probe") await rejudgeProbe(leadPorts, round);
    const runs = await leadPorts.db.runsOfRound(round.id);
    const main = await planMainAsk(leadPorts, round, runs, await leadPorts.db.membersOfRound(round.id), room);
    // A term this phase began is its run's: a start tried again finds it and starts no other beside it.
    begun = main.begun.map((term) => ({ term, kind: "already" as const }));
    tries = main.tries;
    ask = main.ask;
  }
  const caps = runCaps(plan, ask.perTerm, leftUsd);
  const { wanted, untried } = await runsToStart(leadPorts, round.id, phase, ask, caps, tries);
  // One tried again under a run it began leaves the round to that run.
  if (!wanted.length)
    return begun.length ? { kind: "started", phase, runs: [...begun, ...untried] } : endAtItsLimit(leadPorts, round);
  const rows = await leadPorts.db.runsEnsure(
    wanted.map((item) => ({
      id: item.id,
      tenant_id: round.tenant_id,
      round_id: round.id,
      purpose: "discover",
      term: item.term,
      actor: card.actor,
      build: card.build,
      webhook_token_hash: item.hash,
      cap_usd: item.cap,
    })),
  );

  const outcomes: TermSaid[] = [];
  for (const item of wanted) {
    const row = rows.find((r) => r.id === item.id);
    if (!row) throw new Error(`lead_round_start: the run row for ${item.term} was not made`);
    if (row.state !== "claimed" && !(row.state === "starting" && row.claimed_by === owner)) {
      outcomes.push({ term: item.term, kind: "already" });
      continue;
    }
    if (outOfTime(leadPorts)) throw new LeadRetry("out of time before a start: the ledger tries the rest again");
    const claim = await claimOrRecover(leadPorts, card.actor, row, owner);
    if (claim !== "mine") {
      outcomes.push({ term: item.term, kind: claim === "recovered" ? "reconciled" : "someone_elses" });
      continue;
    }
    const token = await leadPorts.webhookToken(row.id);
    const input = {
      ...(card.buildInput(plan, item.term, item.places) as Record<string, unknown>),
      [INPUT_MARKER]: row.id,
    };
    try {
      const started = await leadPorts.apify.startRun(card.actor, input, {
        build: card.build,
        timeoutSecs: MAPS_RUN_TIMEOUT_SECS,
        maxTotalChargeUsd: item.cap,
        webhooks: [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: webhookUrl(leadPorts, row.id, token) }],
      });
      await leadPorts.db.runRecordStart(row.id, owner, started.id, started.datasetId, item.cap);
      await leadPorts.schedule("lead_collect", { run_id: row.id, seq: "p0" }, FIRST_COLLECT_SECONDS);
      outcomes.push({ term: item.term, kind: "started" });
    } catch (e) {
      outcomes.push({ term: item.term, ...(await startFailed(leadPorts, row, owner, e)) });
    }
  }
  if (outcomes.length && outcomes.every((o) => o.kind === "refused"))
    await leadPorts.db.roundEnd(round.id, "source_failed");
  return { kind: "started", phase, runs: [...begun, ...outcomes, ...untried] };
}
