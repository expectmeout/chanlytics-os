/**
 * lead_round_start: a run row per term, made by its deterministic id, claimed (claim.ts), and only then started at
 * the provider. A round whose answer changed the plan re-judges its probe first (rejudge.ts). A people plan's round
 * (00430) starts its one run in people.ts.
 */

import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels/leads";
import { peoplePlanOf } from "@chanlytics/contracts";
import { CARDS, MAPS_RUN_TIMEOUT_SECS } from "../cards";
import { runIdFor, hashSha256Hex } from "../ids";
import type { LeadMemberRow, LeadPorts, LeadRoundRow } from "../ports";
import { mainAsk, probeAsk, probeYield, runCaps, runsRoom, type TermsAsk, type TermsTried } from "../sizing";
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
  wasWeighed,
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
    wanted.push({ id, term, hash: await hashSha256Hex(await leadPorts.webhookToken(id)), places, cap });
  }
  for (const term of ask.waiting) untried.push({ term, kind: "no_room" });
  return { wanted, untried };
}

/**
 * A start with no run to make. One tried again under a run it began leaves the round to that run. With less left than
 * one run's floor, nothing can start, so the round ends on the word for it, as one with nothing left does, never left
 * queued for the sweep to call the source failed (29 Oct 2026: five leads reserved $0.33 and waited an hour). With room,
 * every term it would ask has read all a term may: there is nothing new to pay for, and it says so.
 */
async function nothingToStart(
  leadPorts: LeadPorts,
  roundId: string,
  phase: Phase,
  untried: TermSaid[],
  room: number,
  begun: boolean,
): Promise<StartOutcome> {
  if (begun) return { kind: "started", phase, runs: untried };
  await leadPorts.db.roundEnd(roundId, room > 0 ? "few_new_matches" : "budget_used");
  return { kind: "spent" };
}

/** The even yield a later round sizes from when its search has judged nothing yet. */
export const UNMEASURED_YIELD = 0.5;

/**
 * The yield a top-up or a renewal sizes from (PRD §0.5, "later rounds use the running yield"): the search's own, over
 * every place its rounds judged, and an even one only when it judged none. A search whose places qualified at a tenth
 * used to ask the provider for a fifth of what it needed, and ended "few new matches" (3 Nov 2026).
 */
async function runningYield(p: LeadPorts, round: LeadRoundRow): Promise<number> {
  const judged = (await p.db.membersOfSearch(round.search_id)).filter(wasWeighed);
  return judged.length ? probeYield(judged) : UNMEASURED_YIELD;
}

/**
 * What a search has asked of its terms, for a start of its main phase: the provider answers a term from the top, so
 * what it read is what a new ask must go past. This round's probe says exactly, and the search's earlier rounds by the
 * places they kept of each term. A main run of this round is one this phase began.
 */
async function termsTried(leadPorts: LeadPorts, round: LeadRoundRow, own: LeadMemberRow[]): Promise<TermsTried> {
  const read = new Map<string, number>();
  const begun = new Set<string>();
  for (const r of await leadPorts.db.runsOfRound(round.id)) {
    if (r.purpose !== "discover" || r.term === null) continue;
    if ((await runIdFor(round.id, "probe", r.term)) === r.id) read.set(r.term, r.items_seen);
    else begun.add(r.term);
  }
  const ours = new Set(own.map((m) => m.lead_id));
  for (const m of await leadPorts.db.membersOfSearch(round.search_id))
    if (!ours.has(m.lead_id) && m.term !== null) read.set(m.term, (read.get(m.term) ?? 0) + 1);
  return { read, begun };
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
  // round never reserved (S6), so the round ends on the word for it instead.
  const leftUsd = round.cost_reserved_usd - round.cost_usd;
  if (leftUsd <= 0) {
    await leadPorts.db.roundEnd(round.id, "budget_used");
    return { kind: "spent" };
  }
  // A people search (00430): one run for its filters, no probe and no terms.
  const people = peoplePlanOf(round.plan);
  if (people) return startPeople(leadPorts, round, people, owner, leftUsd);
  const plan = round.plan;
  const card = CARDS[plan.card];
  const phase: Phase = round.purpose === "probe" && !resume && round.state !== "running" ? "probe" : "main";

  const room = runsRoom(leftUsd);
  let begun = false;
  let ask: TermsAsk;
  if (phase === "probe") {
    ask = probeAsk(plan, room);
  } else {
    // An answer that changed the plan (Include, Change what I asked) re-judges the places the probe already judged
    // under it first: what it lets in comes back, what it now leaves out goes, and the rest is sized from that.
    if (resume && round.answered === "include" && round.purpose === "probe") await rejudgeProbe(leadPorts, round);
    const members = await leadPorts.db.membersOfRound(round.id);
    const judged = members.filter(wasWeighed);
    const counted = members.filter((m) => m.counted).length;
    // Round 1 sizes from its probe; a top-up or a renewal from what the search found in every round before it.
    const other = round.purpose === "probe" ? probeYield(judged) : await runningYield(leadPorts, round);
    // The question said "I'm dropping X: it mostly returned those", and a yes accepted it. An answer that changed the
    // plan is a new plan, and its terms are the owner's: the dropped one finds the very kind they just included.
    const dropTerm = round.answered === "keep" ? (round.question?.dropTerm ?? null) : null;
    const tried = await termsTried(leadPorts, round, members);
    begun = tried.begun.size > 0;
    ask = mainAsk(plan, targetOf(round) - counted, other, dropTerm, room, tried);
  }
  const { wanted, untried } = await runsToStart(leadPorts, round.id, phase, ask, runCaps(plan, ask.perTerm, leftUsd));
  if (!wanted.length) return nothingToStart(leadPorts, round.id, phase, untried, room, begun);
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
  return { kind: "started", phase, runs: [...outcomes, ...untried] };
}
