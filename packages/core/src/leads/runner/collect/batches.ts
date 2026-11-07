/** Collect: batches. */

import {
  LEAD_SITE_READ_USD,
  judgeBatchPlaces,
  planReadsSites,
  type JudgePlaceAnswer,
  type LeadRoundState,
  type LeadRunState,
} from "@chanlytics/contracts";
import { CARDS, areaCenter } from "../../cards";
import { FINAL_RUN_STATES, runStateOf } from "../../endings";
import { inArea, type LatLng } from "../../geo";
import { runIdFor } from "../../ids";
import { foldDuplicates, identityOf, shareKeysOf, sharesWithin } from "../../identity";
import { factsOf, judgeInCalls, opIdFor } from "../../judge";
import type {
  CollectCommitResult,
  CollectJudgment,
  CollectPage,
  CollectPlace,
  LeadMemberRow,
  LeadPorts,
  LeadRoundRow,
  LeadRunRow,
  LeadShare,
} from "../../ports";
import { markPlaces } from "../mark-places";
import { readSitesBeforeJudge, findSiteFact, type SiteReads } from "../site-reads";
import { centerOf, memberOf, takeBatch, type Prepared } from "../places";
import { roundDecision } from "../round-decision";
import {
  DUPLICATE_REASON,
  JUDGE_MARGIN_MS,
  SCREEN_MARGIN_MS,
  LeadRetry,
  OUT_OF_AREA_REASON,
  PAGE_ITEMS,
  POLL_SECONDS,
  type Phase,
  isRefused,
  markUntil,
  minute,
  outOfTime,
} from "../rules";

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
      /** The businesses' sites it read, each a credit (site-reads.ts). */
      siteReads: number;
    }
  | { kind: "checked"; results: number; last: boolean }
  | { kind: "stopped" }
  | { kind: "polling" };

/** A batch's places as the workspace holds them (decision 25): those to commit, those the judge must read, those it holds. */
async function identified(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  prepared: Prepared[],
  geo: { center: LatLng | null; radiusM: number },
): Promise<{ rows: BatchPlace[]; toJudge: Prepared[]; yoursAt: number[] }> {
  const cleans = prepared.map((x) => x.clean);
  const { folded } = foldDuplicates(cleans);
  const keys = cleans.map(shareKeysOf);
  const [held, supp, shares] = await Promise.all([
    leadPorts.db.placeIdsHeld(
      round.tenant_id,
      cleans.map((c) => c.raw.placeId),
    ),
    // Every address a place carries, free mail included: a share key leaves gmail.com out because it names no
    // business, but a person at a gmail.com address can still have said stop (00174's unsubscribe).
    leadPorts.db.suppressed(round.tenant_id, {
      emails: cleans.flatMap((c) => c.emails),
      placeIds: cleans.map((c) => c.raw.placeId),
    }),
    leadPorts.db.sharesOf(round.tenant_id, {
      phones: keys.flatMap((k) => k.phones),
      emails: keys.flatMap((k) => k.emails),
      hosts: keys.flatMap((k) => k.hosts),
    }),
  ]);
  const within = sharesWithin(cleans.filter((c) => !folded.has(c.raw.placeId)));
  const toJudge: Prepared[] = [];
  const rows: BatchPlace[] = [];
  const yoursAt: number[] = [];
  for (const prep of prepared) {
    const idn = identityOf(prep.clean, held, supp.placeIds, shares);
    if (idn.kind === "already_yours") yoursAt.push(prep.index);
    if (idn.kind === "already_yours" || idn.kind === "hidden") continue;
    const dup = folded.get(prep.clean.raw.placeId) ?? null;
    if (!prep.rule && geo.center && !inArea(geo.center, geo.radiusM, prep.clean.raw.location))
      prep.rule = { class: "review", reason: OUT_OF_AREA_REASON, token: "out_of_area", excluded_by: null };
    // A suppressed address is not a hidden place, but the email is never offered again.
    prep.clean.emails = prep.clean.emails.filter((e) => !supp.emails.has(e));
    rows.push({ prep, shares: [...idn.shares, ...(within.get(prep.clean.raw.placeId) ?? [])], duplicateOf: dup });
    if (!prep.rule && !dup) toJudge.push(prep);
  }
  return { rows, toJudge, yoursAt };
}

/**
 * One run's page, under its lease (collect above). A place the workspace already holds was read and paid for and is
 * skipped: it is counted on the run (`already_yours`, 00506), so what a main phase pays again for its probe's places is
 * measured before anything is changed for it.
 */
export async function collectHeld(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  owner: string,
  gen: number,
  sites: SiteReads,
): Promise<CollectOutcome> {
  const plan = round.plan;
  const card = CARDS[plan.card];
  const phase: Phase = (await runIdFor(round.id, "probe", run.term ?? "")) === run.id ? "probe" : "main";
  const alreadyFinal = FINAL_RUN_STATES.has(run.state);
  let remoteState: LeadRunState = run.state;
  let usage = run.usage_usd;
  let datasetId = run.dataset_id;
  if (!alreadyFinal) {
    if (outOfTime(leadPorts)) throw new LeadRetry("out of time before reading the run");
    try {
      const remote = await leadPorts.apify.getRun(run.apify_run_id as string);
      remoteState = runStateOf(remote.status);
      usage = remote.usageTotalUsd ?? usage;
      datasetId = remote.datasetId ?? datasetId;
    } catch (e) {
      if (!isRefused(e)) throw e;
      remoteState = "failed"; // the provider no longer has it: an answer
    }
  }
  const members = await leadPorts.db.membersOfRound(round.id);
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
    if (outOfTime(leadPorts)) throw new LeadRetry("out of time before reading the items");
    items = (await leadPorts.apify.listItems(datasetId, from, PAGE_ITEMS, [...card.fields])).items;
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
    const batch = takeBatch(card, plan, items, cursor, judgeBatchPlaces(plan));
    // Identity, by what the workspace already holds: place ids, suppressions, shared details (decision 25).
    const { rows, toJudge, yoursAt } = await identified(leadPorts, round, batch.prepared, geo);
    const { said, judgments, refused, cutAt } = await judgedBatch(leadPorts, round, run.id, from, toJudge, sites);
    if (refused) judgeRefused = refused;
    // A plan that reads sites commits only as far as they could be read: the rest is the next job's, whole.
    const end = cutAt ?? batch.end;
    const isLastOfPage = end >= items.length;
    const waiting = end === cursor && !isLastOfPage;
    const yours = yoursAt.filter((at) => at < end).length;
    const places = rows
      .filter((r) => r.prep.index < end)
      .map((item) => {
        const { answer, judgment, model } = said.get(item.prep) ?? { answer: null, judgment: null, model: null };
        const rule =
          item.duplicateOf && !item.prep.rule
            ? { class: "excluded" as const, reason: DUPLICATE_REASON, token: "duplicate", excluded_by: "duplicate" }
            : item.prep.rule;
        return memberOf(
          plan,
          run.term ?? "",
          item.prep.clean,
          answer,
          judgment?.op_id ?? null,
          model,
          rule,
          geo,
          item.shares,
          item.duplicateOf,
        );
      });
    // Their own marks, read from their own sites, before the page is committed with everything else about them.
    await markPlaces(
      leadPorts,
      sites,
      places.filter((x) => x.member.class !== "excluded").map((x) => x.place),
      markUntil(leadPorts, isLastOfPage || cutAt !== null || outOfTime(leadPorts, JUDGE_MARGIN_MS)),
    );
    newMembers.push(...places);

    const to = base + end;
    const runDone = isLastOfPage && pageShort && remoteFinal;
    // No judge is started short of its bound, nor a place read short of its least, so a batch that would be is the next
    // job's, not a retry of this one.
    const stopHere = !isLastOfPage && (cutAt !== null || outOfTime(leadPorts, JUDGE_MARGIN_MS));
    // The next collect rides the commit when this invocation will not read on: the page ended, or time is short. One that
    // moved nothing waits under a name of its own: this job holds the name its offset would give it, and a second row
    // for a name is no row at all.
    const next: CollectPage["next"] = runDone
      ? null
      : !isLastOfPage && !stopHere
        ? null
        : {
            kind: "lead_collect",
            seq: waiting ? `p${to}.w${minute(leadPorts)}` : `p${to}`,
            run_after_seconds: waiting || (isLastOfPage && pageShort) ? POLL_SECONDS : 0,
          };
    const decision = runDone
      ? await roundDecision(
          leadPorts,
          round,
          run,
          phase,
          { state: remoteState, items_seen: seen + end },
          [...members, ...memberRows(newMembers, run.term)],
          Math.max(0, usage - run.usage_usd) + sites.count() * LEAD_SITE_READ_USD,
        )
      : null;
    const page: CollectPage = {
      judgment: judgments.length ? judgments : null,
      places,
      usage_usd: usage,
      items_seen: seen + end,
      already_yours: yours,
      run_state: runDone ? remoteState : null,
      next: decision?.next ?? next,
      round: decision?.round ?? (round.state === "queued" ? { state: "probing", question: null, ending: null } : null),
    };
    const res = await leadPorts.db.collectCommit(run.id, owner, gen, from, to, page);
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
    siteReads: sites.count(),
  };
}

/** A place of a batch that is committed: what it is, what it shares with those the workspace holds, and whose copy it is. */
type BatchPlace = { prep: Prepared; shares: LeadShare[]; duplicateOf: string | null };

/**
 * What was said of one place: its answer, the judgment it was kept under (null when its call refused, or the screen
 * answered it), and the model that answered.
 */
type Said = { answer: JudgePlaceAnswer | null; judgment: CollectJudgment | null; model: string | null };

/**
 * The screen over one batch (decision 0085): the places a second model is sure are left out, with their answers and its
 * model, by the place they are. None where the deployment has no screen, it is off, or it could not ask: every place
 * is then the judge's, as before.
 */
async function screened(leadPorts: LeadPorts, round: LeadRoundRow, toJudge: Prepared[]): Promise<Map<Prepared, Said>> {
  const out = new Map<Prepared, Said>();
  if (!leadPorts.judge.screen) return out;
  // A screen that throws, which it promises not to, screens nothing: the judge is asked as it always was.
  const sentence = await leadPorts.judge
    .screen(
      round.plan,
      toJudge.map((prep, ref) => factsOf(ref, prep.clean)),
      round.tenant_id,
      round.id,
    )
    .catch(() => null);
  for (const answer of sentence?.answers ?? []) {
    const prep = toJudge[answer.ref];
    if (prep && sentence) out.set(prep, { answer, judgment: null, model: sentence.model });
  }
  return out;
}

/**
 * The judge over one batch: the screen first (decision 0085), then, where the plan reads sites, what the places it left
 * in say of themselves, then those places, in the calls the judge can answer in time, side by side (core judgeInCalls),
 * each kept by its operation id; a call refused twice is Needs review (§7.1). What each place was told, and under which
 * judgment; and `cutAt`, the item the batch stops short of where a site could not be asked for in time, since a place
 * judged without a site for want of time would read as a site that says nothing.
 */
async function judgedBatch(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  runId: string,
  from: number,
  toJudge: Prepared[],
  sites: SiteReads,
): Promise<{ said: Map<Prepared, Said>; judgments: CollectJudgment[]; refused: string | null; cutAt: number | null }> {
  const out: Awaited<ReturnType<typeof judgedBatch>> = {
    said: new Map<Prepared, Said>(),
    judgments: [],
    refused: null,
    cutAt: null,
  };
  if (!toJudge.length) return out;
  if (outOfTime(leadPorts, JUDGE_MARGIN_MS)) throw new LeadRetry("out of time before the judge");
  // The screen only where the judge keeps its whole bound after it; short of that, the judge reads every place itself.
  const left = outOfTime(leadPorts, JUDGE_MARGIN_MS + SCREEN_MARGIN_MS)
    ? new Map<Prepared, Said>()
    : await screened(leadPorts, round, toJudge);
  for (const [prep, said] of left) out.said.set(prep, said);
  const unsaid = toJudge.filter((prep) => !left.has(prep));
  if (!unsaid.length) return out;
  const reads = planReadsSites(round.plan);
  if (reads) {
    await readSitesBeforeJudge(
      leadPorts,
      sites,
      unsaid.flatMap((x) => (x.clean.host ? [x.clean.host] : [])),
      JUDGE_MARGIN_MS,
    );
    out.cutAt = unsaid.find((x) => x.clean.host && !sites.asked(x.clean.host))?.index ?? null;
  }
  const cutAt = out.cutAt;
  const rest = cutAt === null ? unsaid : unsaid.filter((x) => x.index < cutAt);
  const site = new Map<Prepared, string | null>();
  if (reads) await Promise.all(rest.map(async (x) => site.set(x, await findSiteFact(sites, x.clean))));
  const calls = await judgeInCalls(
    leadPorts.judge,
    round.plan,
    rest,
    (prep, ref) => factsOf(ref, prep.clean, reads ? (site.get(prep) ?? null) : undefined),
    (call) => opIdFor(runId, from, call),
    round,
    // A refused answer is asked once more only with the judge's whole bound still left: past it, Needs review.
    () => !outOfTime(leadPorts, JUDGE_MARGIN_MS),
  );
  for (const { items: asked, judged } of calls) {
    if (judged.refused && judged.why) out.refused = judged.why;
    if (judged.judgment) out.judgments.push(judged.judgment);
    asked.forEach((prep, ref) =>
      out.said.set(prep, { answer: judged.answers.get(ref) ?? null, judgment: judged.judgment, model: judged.model }),
    );
  }
  return out;
}

/** The rows just committed, as members of the round, for a decision made in the same invocation. */
function memberRows(places: CollectPlace[], term: string | null): LeadMemberRow[] {
  return places.map((place) => ({
    place_id: place.place.place_id,
    decided: false,
    lead_id: place.place.place_id,
    class: place.member.class,
    excluded_by: place.member.excluded_by,
    fit: place.member.fit,
    reason: place.member.reason,
    distance_m: place.member.distance_m,
    counted: false,
    judgment: place.member.judgment,
    lat: place.place.lat,
    lng: place.place.lng,
    phone: place.place.phone_e164,
    email: place.place.email,
    email_state: place.place.email_state,
    term,
  }));
}
