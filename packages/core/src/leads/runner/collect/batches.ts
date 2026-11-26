/** Collect: batches. */

import {
  LEAD_SITE_READ_USD,
  judgeBatchPlaces,
  planReadsSites,
  type JudgePlaceAnswer,
  type LeadRoundState,
  type LeadRunState,
} from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";
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
import { centerOf, judgesAddressesOnly, memberOf, noEmailRule, takeBatch, type Prepared } from "../places";
import { mayCount } from "../weighed";

/** How many places with a website, none of them read, make a page worth paging: fewer can be chance. */
const UNREAD_SITES_PAGE = 5;
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

/**
 * A batch's places as the workspace holds them (decision 25): those to commit, those the judge must read, those it holds.
 * In a search made for email past its probe, a place left with no address once those that said stop are taken from it is
 * settled by code, as one that came with none is (places.ts noEmailRule).
 */
async function identified(
  leadPorts: LeadPorts,
  round: LeadRoundRow,
  prepared: Prepared[],
  geo: { center: LatLng | null; radiusM: number },
  phase: Phase,
): Promise<{ rows: BatchPlace[]; toJudge: Prepared[]; yoursAt: number[] }> {
  const emailOnly = judgesAddressesOnly(round.plan, phase);
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
    if (emailOnly && !prep.rule) prep.rule = noEmailRule(prep.clean);
    rows.push({ prep, shares: [...idn.shares, ...(within.get(prep.clean.raw.placeId) ?? [])], duplicateOf: dup });
    if (!prep.rule && !dup) toJudge.push(prep);
  }
  return { rows, toJudge, yoursAt };
}

/** The provider's word on a run: its state, what it has cost so far and where its items are. One it no longer has failed. */
async function remoteRunOf(
  leadPorts: LeadPorts,
  run: LeadRunRow,
): Promise<{ state: LeadRunState; usage: number; datasetId: LeadRunRow["dataset_id"] }> {
  const kept = { state: run.state, usage: run.usage_usd, datasetId: run.dataset_id };
  if (FINAL_RUN_STATES.has(run.state)) return kept;
  if (outOfTime(leadPorts)) throw new LeadRetry("out of time before reading the run");
  try {
    const remote = await leadPorts.apify.getRun(run.apify_run_id as string);
    return {
      state: runStateOf(remote.status),
      usage: remote.usageTotalUsd ?? kept.usage,
      datasetId: remote.datasetId ?? kept.datasetId,
    };
  } catch (e) {
    if (!isRefused(e)) throw e;
    return { ...kept, state: "failed" }; // the provider no longer has it: an answer
  }
}

/** A batch's places up to where it commits, each with what the judge said of it, or the rule that settled it. */
function placesOf(
  round: LeadRoundRow,
  run: LeadRunRow,
  rows: BatchPlace[],
  said: Map<Prepared, Said>,
  end: number,
  geo: { center: LatLng | null; radiusM: number },
): CollectPlace[] {
  return rows
    .filter((r) => r.prep.index < end)
    .map((item) => {
      const { answer, judgment, model } = said.get(item.prep) ?? { answer: null, judgment: null, model: null };
      const rule =
        item.duplicateOf && !item.prep.rule
          ? { class: "excluded" as const, reason: DUPLICATE_REASON, token: "duplicate", excluded_by: "duplicate" }
          : item.prep.rule;
      return memberOf(
        round.plan,
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
}

/**
 * The next collect, riding the commit when this invocation will not read on: the page ended, or time is short. One that
 * moved nothing waits under a name of its own: this job holds the name its offset would give it, and a second row for a
 * name is no row at all.
 */
function nextCollectOf(
  leadPorts: LeadPorts,
  at: { to: number; runDone: boolean; isLastOfPage: boolean; stopHere: boolean; waiting: boolean; pageShort: boolean },
): CollectPage["next"] {
  if (at.runDone || (!at.isLastOfPage && !at.stopHere)) return null;
  return {
    kind: "lead_collect",
    seq: at.waiting ? `p${at.to}.w${minute(leadPorts)}` : `p${at.to}`,
    run_after_seconds: at.waiting || (at.isLastOfPage && at.pageShort) ? POLL_SECONDS : 0,
  };
}

/** Of a batch's places, how many have a website, and of those how many the provider read for contacts. */
function sitesOf(prepared: Prepared[]): { withSite: number; read: number } {
  const withSite = prepared.filter((p) => p.clean.raw.website);
  return { withSite: withSite.length, read: withSite.filter((p) => p.clean.raw.contactsRead).length };
}

/** The page a batch commits: its places and judgments, the run's counts, and what comes next for the run and its round. */
function pageOf(
  round: LeadRoundRow,
  parts: {
    places: CollectPlace[];
    judgments: CollectJudgment[];
    usage: number;
    itemsSeen: number;
    alreadyYours: number;
    runState: LeadRunState | null;
    next: CollectPage["next"];
  },
  decision: Awaited<ReturnType<typeof roundDecision>> | null,
): CollectPage {
  return {
    judgment: parts.judgments.length ? parts.judgments : null,
    places: parts.places,
    usage_usd: parts.usage,
    items_seen: parts.itemsSeen,
    already_yours: parts.alreadyYours,
    run_state: parts.runState,
    next: decision?.next ?? parts.next,
    round: decision?.round ?? (round.state === "queued" ? { state: "probing", question: null, ending: null } : null),
  };
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
  const { state: remoteState, usage, datasetId } = await remoteRunOf(leadPorts, run);
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
  // Places with a website on this page, and how many of those the provider read for contacts.
  let withSite = 0;
  let siteRead = 0;

  do {
    const batch = takeBatch(card, plan, items, cursor, judgeBatchPlaces(plan), judgesAddressesOnly(plan, phase));
    const onPage = sitesOf(batch.prepared);
    withSite += onPage.withSite;
    siteRead += onPage.read;
    // Identity, by what the workspace already holds: place ids, suppressions, shared details (decision 25).
    const { rows, toJudge, yoursAt } = await identified(leadPorts, round, batch.prepared, geo, phase);
    const { said, judgments, refused, cutAt } = await judgedBatch(leadPorts, round, run.id, from, toJudge, sites);
    if (refused) judgeRefused = refused;
    // A plan that reads sites commits only as far as they could be read: the rest is the next job's, whole.
    const end = cutAt ?? batch.end;
    const isLastOfPage = end >= items.length;
    const places = placesOf(round, run, rows, said, end, geo);
    // Their own marks, read from their own sites, before the page is committed with everything else about them.
    await markPlaces(
      leadPorts,
      sites,
      marksDue(places, sites),
      markUntil(leadPorts, isLastOfPage || cutAt !== null || outOfTime(leadPorts, JUDGE_MARGIN_MS)),
    );
    newMembers.push(...places);

    const to = base + end;
    const runDone = isLastOfPage && pageShort && remoteFinal;
    // No judge is started short of its bound, nor a place read short of its least, so a batch that would be is the next
    // job's, not a retry of this one.
    const stopHere = !isLastOfPage && (cutAt !== null || outOfTime(leadPorts, JUDGE_MARGIN_MS));
    const waiting = end === cursor && !isLastOfPage;
    const next = nextCollectOf(leadPorts, { to, runDone, isLastOfPage, stopHere, waiting, pageShort });
    const decision = runDone
      ? await roundDecision(
          leadPorts,
          round,
          run,
          phase,
          { state: remoteState, items_seen: seen + end },
          [...members, ...memberRows(newMembers, run.term, run.round_id)],
          Math.max(0, usage - run.usage_usd) + sites.count() * LEAD_SITE_READ_USD,
        )
      : null;
    const page = pageOf(
      round,
      {
        places,
        judgments,
        usage,
        itemsSeen: seen + end,
        alreadyYours: yoursAt.filter((at) => at < end).length,
        runState: runDone ? remoteState : null,
        next,
      },
      decision,
    );
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

  // A page of places with websites, none of them read: the provider stopped reading sites (14 Nov 2026: its contacts
  // service refused the pinned build for a day, unseen, while 233 sites came back empty). The platform is paged, never an
  // owner; best effort, after the commits.
  if (withSite >= UNREAD_SITES_PAGE && siteRead === 0)
    await leadPorts
      .tell?.({ kind: "contacts_unread", actor: run.actor, build: run.build, sites: withSite })
      .catch(logAndGoOn("telling the platform a lead source read no websites"));

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

/**
 * The places of a page whose own site is read for their mark: one that counts or may, since each read is a credit
 * (weighed.ts mayCount), and one whose page the judge's read already brought, which costs nothing more.
 */
function marksDue(places: readonly CollectPlace[], sites: SiteReads): CollectPlace["place"][] {
  return places
    .filter((x) => mayCount(x.member) || (x.place.website_host !== null && sites.asked(x.place.website_host)))
    .map((x) => x.place);
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
function memberRows(places: CollectPlace[], term: string | null, roundId: string): LeadMemberRow[] {
  return places.map((place) => ({
    round_id: roundId,
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
