/**
 * lead_collect: one batch of a run's items per commit (clean, identity, judge, classify, distance, commit), a Stop,
 * and a checker run's answers. The places it commits are made in places.ts and marked in mark-places.ts; what
 * follows a run's last item is round-decision.ts.
 */

import type { LeadEmailState, LeadRoundState, LeadRunState } from "@chanlytics/contracts";
import { CARDS, areaCenter } from "../cards";
import { FINAL_RUN_STATES, runStateOf } from "../endings";
import { inArea } from "../geo";
import { runIdFor } from "../ids";
import { foldDuplicates, identityOf, shareKeysOf, sharesWithin } from "../identity";
import { factsOf, judgeBatch, opIdFor, type JudgedBatch } from "../judge";
import type {
  CollectCommitResult,
  CollectPage,
  CollectPlace,
  LeadMemberRow,
  LeadPorts,
  LeadRoundRow,
  LeadRunRow,
  LeadShare,
} from "../ports";
import { checkable, isAgainRun } from "./check";
import { markPlaces } from "./mark-places";
import { centerOf, memberOf, takeBatch, type Prepared } from "./places";
import { roundDecision } from "./round-decision";
import {
  CHECK_BATCH,
  DUPLICATE_REASON,
  JUDGE_MARGIN_MS,
  LEASE_SECONDS,
  LeadRetry,
  OUT_OF_AREA_REASON,
  PAGE_ITEMS,
  POLL_SECONDS,
  type Phase,
  iso,
  isRefused,
  minute,
  outOfTime,
} from "./rules";

/* ----------------------------------------------------------- the collect */

export type CollectOutcome =
  | { kind: "gone" }
  | { kind: "not_started" }
  | { kind: "round_ended" }
  | { kind: "round_closing" }
  | { kind: "busy" }
  | { kind: "lost"; why: Exclude<CollectCommitResult, { ok: true }>["why"] }
  | {
      kind: "committed";
      commits: number;
      toOffset: number;
      runState: LeadRunState | null;
      roundState: LeadRoundState | null;
      judgeRefused: string | null;
    }
  | { kind: "checked"; results: number; last: boolean }
  | { kind: "stopped" }
  | { kind: "polling" };

export async function collect(p: LeadPorts, runId: string, seq: string, owner: string): Promise<CollectOutcome> {
  const run = await p.db.run(runId);
  if (!run) return { kind: "gone" };
  const round = await p.db.round(run.round_id);
  if (!round) return { kind: "gone" };
  if (run.purpose === "check") return collectCheck(p, round, run, owner);
  if (seq === "stop" || seq.startsWith("stop.")) return stopRun(p, round, run, owner);
  if (round.state === "ended") {
    if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state))
      await p.apify.abortRun(run.apify_run_id).catch(() => undefined);
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
      await p.apify.abortRun(run.apify_run_id).catch(() => undefined);
    return { kind: "round_closing" };
  }
  if (!run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) return { kind: "not_started" };
  const gen = await p.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    await p.schedule("lead_collect", { run_id: run.id, seq: `${seq}.b` }, 30);
    return { kind: "busy" };
  }
  try {
    return await collectHeld(p, round, run, owner, gen);
  } finally {
    await p.db.runRelease(run.id, owner, gen);
  }
}

async function collectHeld(
  p: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  owner: string,
  gen: number,
): Promise<CollectOutcome> {
  const plan = round.plan;
  const card = CARDS[plan.card];
  const phase: Phase = (await runIdFor(round.id, "probe", run.term ?? "")) === run.id ? "probe" : "main";
  const alreadyFinal = FINAL_RUN_STATES.has(run.state);
  let remoteState: LeadRunState = run.state;
  let usage = run.usage_usd;
  let datasetId = run.dataset_id;
  if (!alreadyFinal) {
    if (outOfTime(p)) throw new LeadRetry("out of time before reading the run");
    try {
      const remote = await p.apify.getRun(run.apify_run_id as string);
      remoteState = runStateOf(remote.status);
      usage = remote.usageTotalUsd ?? usage;
      datasetId = remote.datasetId ?? datasetId;
    } catch (e) {
      if (!isRefused(e)) throw e;
      remoteState = "failed"; // the provider no longer has it: an answer
    }
  }
  const members = await p.db.membersOfRound(round.id);
  const geo = phase === "probe" ? { center: areaCenter(plan), radiusM: plan.area.radius_m } : centerOf(plan, members);

  // The page's own base: takeBatch answers an index into `items`, so both ends
  // of every batch are measured from where this page started reading. `from`
  // walks the batches; the base never moves, or a second batch would be added
  // to an offset that already absorbed the first and the next poll would skip
  // what the owner paid for.
  const base = run.read_offset;
  let from = base;
  const seen = run.items_seen;
  let items: unknown[] = [];
  if (datasetId && !alreadyFinal) {
    if (outOfTime(p)) throw new LeadRetry("out of time before reading the items");
    items = (await p.apify.listItems(datasetId, from, PAGE_ITEMS, [...card.fields])).items;
  }
  const remoteFinal = FINAL_RUN_STATES.has(remoteState);
  const pageShort = items.length < PAGE_ITEMS;
  const newMembers: CollectPlace[] = [];
  let commits = 0;
  let cursor = 0;
  let lastRoundState: LeadRoundState | null;
  let lastRunState: LeadRunState | null;
  let judgeRefused: string | null = null;

  do {
    const { end, prepared } = takeBatch(card, items, cursor);
    const isLastOfPage = end >= items.length;
    // Identity, by what the workspace already holds: place ids, suppressions, shared details (decision 25).
    const cleans = prepared.map((x) => x.clean);
    const { folded } = foldDuplicates(cleans);
    const keys = cleans.map(shareKeysOf);
    const [held, supp, shares] = await Promise.all([
      p.db.placeIdsHeld(
        round.tenant_id,
        cleans.map((c) => c.raw.placeId),
      ),
      // Every address a place carries, free mail included: a share key leaves gmail.com out because it names no
      // business, but a person at a gmail.com address can still have said stop (00174's unsubscribe).
      p.db.suppressed(round.tenant_id, {
        emails: cleans.flatMap((c) => c.emails),
        placeIds: cleans.map((c) => c.raw.placeId),
      }),
      p.db.sharesOf(round.tenant_id, {
        phones: keys.flatMap((k) => k.phones),
        emails: keys.flatMap((k) => k.emails),
        hosts: keys.flatMap((k) => k.hosts),
      }),
    ]);
    const within = sharesWithin(cleans.filter((c) => !folded.has(c.raw.placeId)));
    const toJudge: { prep: Prepared; ref: number }[] = [];
    const rows: { prep: Prepared; shares: LeadShare[]; duplicateOf: string | null }[] = [];
    for (const prep of prepared) {
      const idn = identityOf(prep.clean, held, supp.placeIds, shares);
      if (idn.kind === "already_yours" || idn.kind === "hidden") continue;
      const dup = folded.get(prep.clean.raw.placeId) ?? null;
      if (!prep.rule && geo.center && !inArea(geo.center, geo.radiusM, prep.clean.raw.location))
        prep.rule = { class: "review", reason: OUT_OF_AREA_REASON, token: "out_of_area", excluded_by: null };
      // A suppressed address is not a hidden place, but the email is never offered again.
      prep.clean.emails = prep.clean.emails.filter((e) => !supp.emails.has(e));
      rows.push({ prep, shares: [...idn.shares, ...(within.get(prep.clean.raw.placeId) ?? [])], duplicateOf: dup });
      if (!prep.rule && !dup) toJudge.push({ prep, ref: toJudge.length });
    }
    // The judge: one call for the batch, kept by operation id; refused twice is Needs review (§7.1).
    let judged: JudgedBatch = { answers: new Map(), judgment: null, model: null, refused: false, why: null };
    if (toJudge.length) {
      if (outOfTime(p, JUDGE_MARGIN_MS)) throw new LeadRetry("out of time before the judge");
      judged = await judgeBatch(
        p.judge,
        plan,
        toJudge.map((t) => factsOf(t.ref, t.prep.clean)),
        opIdFor(run.id, from, 0),
      );
      // The members say the plan's sentence; the judge's own word for the refusal rides the outcome, so the collect's line says why.
      if (judged.refused && judged.why) judgeRefused = judged.why;
    }
    const places = rows.map((r) => {
      const ref = toJudge.find((t) => t.prep === r.prep)?.ref;
      const answer = ref === undefined ? null : (judged.answers.get(ref) ?? null);
      const rule =
        r.duplicateOf && !r.prep.rule
          ? { class: "excluded" as const, reason: DUPLICATE_REASON, token: "duplicate", excluded_by: "duplicate" }
          : r.prep.rule;
      return memberOf(
        plan,
        run.term ?? "",
        r.prep.clean,
        answer,
        judged.judgment?.op_id ?? null,
        judged.model,
        rule,
        geo,
        r.shares,
        r.duplicateOf,
      );
    });
    // Their own marks, read from their own sites, before the page is committed with everything else about them.
    await markPlaces(p, places);
    newMembers.push(...places);

    const to = base + end;
    const runDone = isLastOfPage && pageShort && remoteFinal;
    const stopHere = !isLastOfPage && outOfTime(p);
    // The next collect rides the commit when this invocation will not read on: the page ended, or time is short.
    const next: CollectPage["next"] = runDone
      ? null
      : !isLastOfPage && !stopHere
        ? null
        : { kind: "lead_collect", seq: `p${to}`, run_after_seconds: isLastOfPage && pageShort ? POLL_SECONDS : 0 };
    const decision = runDone
      ? await roundDecision(
          p,
          round,
          run,
          phase,
          remoteState,
          [...members, ...memberRows(newMembers, run.term)],
          seen + end,
        )
      : null;
    const page: CollectPage = {
      judgment: judged.judgment,
      places,
      usage_usd: usage,
      items_seen: seen + end,
      run_state: runDone ? remoteState : null,
      next: decision?.next ?? next,
      round: decision?.round ?? (round.state === "queued" ? { state: "probing", question: null, ending: null } : null),
    };
    const res = await p.db.collectCommit(run.id, owner, gen, from, to, page);
    if (!res.ok) return { kind: "lost", why: res.why };
    commits += 1;
    lastRoundState = res.round_state;
    lastRunState = page.run_state;
    from = to;
    if (decision?.after) await decision.after();
    cursor = end;
    if (stopHere || runDone) break;
  } while (cursor < items.length);

  return {
    kind: "committed",
    commits,
    toOffset: from,
    runState: lastRunState,
    roundState: lastRoundState,
    judgeRefused,
  };
}

/** The rows just committed, as members of the round, for a decision made in the same invocation. */
function memberRows(places: CollectPlace[], term: string | null): LeadMemberRow[] {
  return places.map((x) => ({
    place_id: x.place.place_id,
    decided: false,
    lead_id: x.place.place_id,
    class: x.member.class,
    excluded_by: x.member.excluded_by,
    fit: x.member.fit,
    reason: x.member.reason,
    distance_m: x.member.distance_m,
    counted: false,
    judgment: x.member.judgment,
    lat: x.place.lat,
    lng: x.place.lng,
    phone: x.place.phone_e164,
    email: x.place.email,
    email_state: x.place.email_state,
    term,
  }));
}

/** Stop: abort at the provider, then the round goes to its checks with "stopped" pending (PRD §0.5, decision 17). */
async function stopRun(p: LeadPorts, round: LeadRoundRow, run: LeadRunRow, owner: string): Promise<CollectOutcome> {
  if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) await p.apify.abortRun(run.apify_run_id);
  const gen = await p.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    // Keyed by the minute, as the checker's poll is: a Stop that meets a busy
    // lease twice would otherwise ask for the one row it already has out.
    await p.schedule("lead_collect", { run_id: run.id, seq: `stop.${minute(p)}` }, 30);
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
      round:
        round.state === "ended" || round.state === "checking"
          ? null
          : { state: "checking", question: null, ending: null, ending_pending: "stopped" },
    };
    const res = await p.db.collectCommit(run.id, owner, gen, run.read_offset, run.read_offset, page);
    if (!res.ok) return { kind: "lost", why: res.why };
    if (page.round) await p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0);
    return { kind: "stopped" };
  } finally {
    await p.db.runRelease(run.id, owner, gen);
  }
}

/** A checker run's collect: read its answers once the run is over, and hand them to lead_check_commit. */
async function collectCheck(
  p: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  owner: string,
): Promise<CollectOutcome> {
  // A Check again run commits after its round ended: it decides nothing, and it is never the round's last check.
  const again = isAgainRun(run);
  if (round.state === "ended" && !again) return { kind: "round_ended" };
  if (!run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) return { kind: "not_started" };
  const gen = await p.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    await p.schedule("lead_collect", { run_id: run.id, seq: `c${minute(p)}` }, 30);
    return { kind: "busy" };
  }
  try {
    const card = CARDS[round.plan.card];
    let state: LeadRunState = run.state;
    let datasetId = run.dataset_id;
    let usage = run.usage_usd;
    if (!FINAL_RUN_STATES.has(run.state)) {
      if (outOfTime(p)) throw new LeadRetry("out of time before reading the checker's run");
      try {
        const remote = await p.apify.getRun(run.apify_run_id as string);
        state = runStateOf(remote.status);
        datasetId = remote.datasetId ?? datasetId;
        usage = remote.usageTotalUsd ?? usage;
      } catch (e) {
        if (!isRefused(e)) throw e;
        state = "failed";
      }
      if (state === "running") {
        await p.schedule("lead_collect", { run_id: run.id, seq: `p${minute(p)}` }, POLL_SECONDS);
        return { kind: "polling" };
      }
    }
    const byEmail = new Map<string, LeadEmailState>();
    let items: unknown[] = [];
    if (state === "succeeded" && datasetId)
      items = (await p.apify.listItems(datasetId, 0, CHECK_BATCH, [...card.checker.fields])).items;
    for (const it of items) {
      const r = card.checker.mapItem(it);
      if (r) byEmail.set(r.email, r.state);
    }
    const waiting = checkable(await p.db.membersOfRound(round.id));
    // A run that succeeded answers the addresses it was given; one that did not leaves every address still waiting "Couldn't check".
    const results = waiting
      .filter((m) => state !== "succeeded" || byEmail.has(m.email as string))
      .map((m) => ({
        lead_id: m.lead_id,
        email_state: byEmail.get(m.email as string) ?? ("unknown" as const),
        checked_at: iso(p.now()),
      }));
    const others = (await p.db.runsOfRound(round.id)).filter((r) => r.purpose === "check" && r.id !== run.id);
    const answered = new Set(results.map((r) => r.lead_id));
    const last =
      !again && others.every((r) => FINAL_RUN_STATES.has(r.state)) && waiting.every((m) => answered.has(m.lead_id));
    const commit = await p.db.collectCommit(run.id, owner, gen, run.read_offset, run.read_offset + items.length, {
      judgment: null,
      places: [],
      usage_usd: usage,
      items_seen: items.length,
      run_state: FINAL_RUN_STATES.has(run.state) ? null : state,
      next: null,
      round: null,
    });
    if (!commit.ok) return { kind: "lost", why: commit.why };
    // The run's own total, never a delta: the commit above settled it already, so nothing settles twice (E4).
    await p.db.checkCommit(round.id, run.id, results, usage, last);
    return { kind: "checked", results: results.length, last };
  } finally {
    await p.db.runRelease(run.id, owner, gen);
  }
}
