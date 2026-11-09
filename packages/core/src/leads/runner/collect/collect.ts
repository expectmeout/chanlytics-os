/** Collect: collect. */

import { peoplePlanOf, type LeadEmailState, type LeadRunState } from "@chanlytics/contracts";
import { CARDS, type LeadCheckerRunner } from "../../cards";
import { FINAL_RUN_STATES, runStateOf } from "../../endings";
import type { CollectPage, LeadPorts, LeadRoundRow, LeadRunRow } from "../../ports";
import { checkable, isAgainRun } from "../check";
import { collectPeople } from "../people";
import { settleSiteReads, siteReadsOf } from "../site-reads";
import { CHECK_BATCH, LEASE_SECONDS, LeadRetry, POLL_SECONDS, iso, isRefused, minute, outOfTime } from "../rules";
import { collectHeld, type CollectOutcome } from "./batches";
import { logAndGoOn } from "@chanlytics/log";

export async function collect(
  leadPorts: LeadPorts,
  runId: string,
  seq: string,
  owner: string,
): Promise<CollectOutcome> {
  const run = await leadPorts.db.run(runId);
  if (!run) return { kind: "gone" };
  const round = await leadPorts.db.round(run.round_id);
  if (!round) return { kind: "gone" };
  if (run.purpose === "check") return collectCheck(leadPorts, round, run, owner);
  if (seq === "stop" || seq.startsWith("stop.")) return stopRun(leadPorts, round, run, owner);
  if (round.state === "ended") {
    if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state))
      await leadPorts.apify.abortRun(run.apify_run_id).catch(logAndGoOn("abortRun"));
    return { kind: "round_ended" };
  }
  // A round on its way out decides nothing more (PRD §0.5, decision 17). Stop
  // bumps the generation and schedules its own collect, but it never cancels
  // the polls already out: one of those, arriving after the round reached its
  // checks or had an ending left pending, would read the run as final, ask
  // roundDecision for a verdict and either start the next phase at the
  // provider or write over the ending the owner asked for. Nothing is
  // committed here, and anything still running is stopped.
  if (round.state === "checking" || round.ending_pending !== null) {
    if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state))
      await leadPorts.apify.abortRun(run.apify_run_id).catch(() => undefined);
    return { kind: "round_closing" };
  }
  if (!run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) return { kind: "not_started" };
  const gen = await leadPorts.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    await leadPorts.schedule("lead_collect", { run_id: run.id, seq: `${seq}.b` }, 30);
    return { kind: "busy" };
  }
  const sites = siteReadsOf(leadPorts);
  try {
    // A people search's run (00430): its items are people at companies, kept as companies, each read by its judge.
    if (peoplePlanOf(round.plan)) return await collectPeople(leadPorts, round, run, owner, gen);
    return await collectHeld(leadPorts, round, run, owner, gen, sites);
  } finally {
    await settleSiteReads(leadPorts, round, sites);
    await leadPorts.db.runRelease(run.id, owner, gen);
  }
}

/** Stop: abort at the provider, then the round goes to its checks with "stopped" pending (PRD §0.5, decision 17). */
async function stopRun(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  owner: string,
): Promise<CollectOutcome> {
  if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) await leadPorts.apify.abortRun(run.apify_run_id);
  const gen = await leadPorts.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    // Keyed by the minute, as the checker's poll is: a Stop that meets a busy
    // lease twice would otherwise ask for the one row it already has out.
    await leadPorts.schedule("lead_collect", { run_id: run.id, seq: `stop.${minute(leadPorts)}` }, 30);
    return { kind: "busy" };
  }
  try {
    const page: CollectPage = {
      judgment: null,
      places: [],
      usage_usd: run.usage_usd,
      items_seen: run.items_seen,
      run_state: FINAL_RUN_STATES.has(run.state) ? null : "aborted",
      next: null,
      round: null,
    };
    // A round still on its way sends itself to its checks with "stopped" pending, the checks' job in the same commit.
    if (round.state !== "ended" && round.state !== "checking") {
      page.round = { state: "checking", question: null, ending: null, ending_pending: "stopped" };
      page.next = { kind: "lead_check", batch: 0, run_after_seconds: 0 };
    }
    const res = await leadPorts.db.collectCommit(run.id, owner, gen, run.read_offset, run.read_offset, page);
    if (!res.ok) return { kind: "lost", why: res.why };
    return { kind: "stopped" };
  } finally {
    await leadPorts.db.runRelease(run.id, owner, gen);
  }
}

/** A checker run's collect: read its answers once the run is over, and hand them to lead_check_commit. */
async function collectCheck(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  owner: string,
): Promise<CollectOutcome> {
  // A Check again run commits after its round ended: it decides nothing, and it is never the round's last check.
  const again = isAgainRun(run);
  if (round.state === "ended" && !again) return { kind: "round_ended" };
  if (!run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) return { kind: "not_started" };
  const gen = await leadPorts.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    await leadPorts.schedule("lead_collect", { run_id: run.id, seq: `c${minute(leadPorts)}` }, 30);
    return { kind: "busy" };
  }
  try {
    const card = CARDS[round.plan.card];
    let state: LeadRunState = run.state;
    let datasetId = run.dataset_id;
    let usage = run.usage_usd;
    if (!FINAL_RUN_STATES.has(run.state)) {
      if (outOfTime(leadPorts)) throw new LeadRetry("out of time before reading the checker's run");
      try {
        const remote = await leadPorts.apify.getRun(run.apify_run_id as string);
        state = runStateOf(remote.status);
        datasetId = remote.datasetId ?? datasetId;
        usage = remote.usageTotalUsd ?? usage;
      } catch (e) {
        if (!isRefused(e)) throw e;
        state = "failed";
      }
      if (state === "running") {
        await leadPorts.schedule("lead_collect", { run_id: run.id, seq: `p${minute(leadPorts)}` }, POLL_SECONDS);
        return { kind: "polling" };
      }
    }
    const byEmail = new Map<string, LeadEmailState>();
    let items: unknown[] = [];
    if (state === "succeeded" && datasetId)
      items = (await leadPorts.apify.listItems(datasetId, 0, CHECK_BATCH, [...card.checker.fields])).items;
    for (const it of items) {
      const r = card.checker.mapItem(it);
      if (r) byEmail.set(r.email, r.state);
    }
    const waiting = checkable(await leadPorts.db.membersOfRound(round.id));
    const others = (await leadPorts.db.runsOfRound(round.id)).filter((r) => r.purpose === "check" && r.id !== run.id);
    // A round's last check out answers for every address still waiting, whatever its state: its own answers, and
    // "Couldn't check" for the rest (an address its checker skipped, or one a failed batch could not say was its own),
    // so the round ends. Before that, a run answers only for its own: the round's batches of 500 run side by side, and
    // another's answers may still be on their way. One that succeeded answers what it read; one that did not, what it
    // was given, read back from its input, or nothing when that cannot be read. A Check again is never the last; one
    // whose input cannot be read says "Couldn't check" for every lead still waiting, since nothing after it would.
    const last = !again && others.every((r) => FINAL_RUN_STATES.has(r.state));
    const given = !last && state !== "succeeded" ? await addressesGiven(leadPorts, card.checker, run) : null;
    const answers = (email: string): boolean =>
      last || (state === "succeeded" ? byEmail.has(email) : given ? given.has(email) : again);
    const results = waiting
      .filter((m) => answers(m.email as string))
      .map((m) => ({
        lead_id: m.lead_id,
        email_state: byEmail.get(m.email as string) ?? ("unknown" as const),
        checked_at: iso(leadPorts.now()),
      }));
    const commit = await leadPorts.db.collectCommit(
      run.id,
      owner,
      gen,
      run.read_offset,
      run.read_offset + items.length,
      {
        judgment: null,
        places: [],
        usage_usd: usage,
        items_seen: items.length,
        run_state: FINAL_RUN_STATES.has(run.state) ? null : state,
        next: null,
        round: null,
      },
    );
    if (!commit.ok) return { kind: "lost", why: commit.why };
    // The run's own total, never a delta: the commit above settled it already, so nothing settles twice (E4).
    await leadPorts.db.checkCommit(round.id, run.id, results, usage, last);
    return { kind: "checked", results: results.length, last };
  } finally {
    await leadPorts.db.runRelease(run.id, owner, gen);
  }
}

/** The addresses a checker run was given, from the input the provider keeps for it; null when there is none to read. */
async function addressesGiven(
  leadPorts: LeadPorts,
  checker: LeadCheckerRunner,
  run: LeadRunRow,
): Promise<Set<string> | null> {
  if (!run.apify_run_id) return null;
  if (outOfTime(leadPorts)) throw new LeadRetry("out of time before reading what the checker was given");
  try {
    const emails = checker.emailsOf(await leadPorts.apify.runInput(run.apify_run_id));
    return emails ? new Set(emails) : null;
  } catch (e) {
    if (!isRefused(e)) throw e;
    return null;
  }
}
