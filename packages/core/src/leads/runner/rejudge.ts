/**
 * An answer that changed the plan re-judges the places the probe already judged. The start (start.ts) calls it
 * before it sizes the main phase; the members are made as the collect makes them (places.ts).
 */

import {
  planNeedsASite,
  LEAD_KIND_KEY,
  judgeBatchPlaces,
  planReadsSites,
  type JudgePlaceAnswer,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import { CARDS, areaCenter } from "../cards";
import { cleanPlace, type CleanPlace } from "../clean";
import { inArea } from "../geo";
import { runIdFor } from "../ids";
import { factsOf, judgeInCalls, opIdFor } from "../judge";
import type { CollectJudgment, CollectPlace, LeadMemberRow, LeadPorts, LeadRoundRow, MemberJudgment } from "../ports";
import { markPlaces } from "./mark-places";
import { askedOf, memberOf } from "./places";
import {
  JUDGE_MARGIN_MS,
  LeadRetry,
  OUT_OF_AREA_REASON,
  PAGE_ITEMS,
  isRefused,
  markUntil,
  outOfTime,
  wasJudged,
  wasWeighed,
} from "./rules";
import { readSitesBeforeJudge, settleSiteReads, findSiteFact, siteReadsOf, type SiteReads } from "./site-reads";

/* ------------------------------------------------- an answer re-judges -- */

/** The version of the plan a member's class was decided under: 1 until an answer changed the plan. */
const versionOf = (m: LeadMemberRow): number => {
  const v = (m.judgment as Partial<MemberJudgment> | null)?.plan_version;
  return typeof v === "number" ? v : 1;
};

/** Every key the plan asks the judge (contracts' rubric): the kind, each exclusion, each criterion. */
/** Whom an answer's plan judges again: a place code left out for having no site to read, only where it no longer needs one. */
const lookedAtUnder = (plan: LeadSearchPlan) => (planNeedsASite(plan) ? wasJudged : wasWeighed);

const keysOf = (plan: LeadSearchPlan): string[] => [
  LEAD_KIND_KEY,
  ...plan.exclusions.map((e) => e.key),
  ...plan.criteria.map((c) => c.key),
];

export type RejudgeOutcome = { changed: number; reused: number; judged: number; unread: number };

/**
 * An answer that changed the plan re-judges the places the probe already judged (00165). The question asked
 * "is that what you meant?" about them; when the owner answers by changing the plan -- Include the thing it left out,
 * or Change what I asked -- those places were still classed by the plan they had just said was wrong, and the main
 * phase never sees them again (a place the workspace holds is skipped), so an Include brought back nothing.
 *
 * A left-out place kept no email and nothing its listing showed (PRD §0.4), so the places are read again from the
 * probe's own items (a read of its dataset, not a run) and cleaned as the collect cleaned them. A stored answer that
 * answers every key the new plan asks is the answer (an Include lifts a key: free, and exactly what was said before);
 * otherwise the places are judged again under the new plan, a batch at a time, before the deadline. Classes are
 * code's, through the collect's own memberOf, against the plan's area. The door (lead_round_rejudge) never overrides
 * the owner's decision and never applies twice. A refused batch is left as it was; a place the source no longer
 * lists (an expired dataset) is left as it was and counted as unread. A new plan that reads sites has them read before
 * each batch, as the collect's does (site-reads.ts); one short of the time leaves the job to be tried again.
 */
export async function rejudgeProbe(leadPorts: LeadPorts, round: LeadRoundRow): Promise<RejudgeOutcome> {
  const sites = siteReadsOf(leadPorts);
  try {
    return await rejudged(leadPorts, round, sites);
  } finally {
    await settleSiteReads(leadPorts, round, sites);
  }
}

async function rejudged(leadPorts: LeadPorts, round: LeadRoundRow, sites: SiteReads): Promise<RejudgeOutcome> {
  const out: RejudgeOutcome = { changed: 0, reused: 0, judged: 0, unread: 0 };
  const plan = round.plan;
  const card = CARDS[plan.card];
  const members = await leadPorts.db.membersOfRound(round.id);
  const looked = lookedAtUnder(plan);
  const pending = members.filter(
    (m) => looked(m) && !m.decided && m.place_id !== null && versionOf(m) < round.plan_version,
  );
  if (!pending.length) return out;

  // The probe's own items, by place id, with the term that found each.
  const listed = new Map<string, { clean: CleanPlace; term: string }>();
  for (const item of await leadPorts.db.runsOfRound(round.id)) {
    if (item.purpose !== "discover" || item.term === null || !item.dataset_id) continue;
    if ((await runIdFor(round.id, "probe", item.term)) !== item.id) continue;
    for (let from = 0; ; from += PAGE_ITEMS) {
      if (outOfTime(leadPorts)) throw new LeadRetry("out of time reading the first places again");
      let items: unknown[];
      try {
        items = (await leadPorts.apify.listItems(item.dataset_id, from, PAGE_ITEMS, [...card.fields])).items;
      } catch (e) {
        // A dataset the source no longer has (expired, deleted): its places stay as they were, and the round runs on.
        if (isRefused(e)) break;
        throw e;
      }
      for (const it of items) {
        const mapped = card.mapItem(it);
        if (mapped && !listed.has(mapped.placeId))
          listed.set(mapped.placeId, { clean: cleanPlace(mapped), term: item.term });
      }
      if (items.length < PAGE_ITEMS) break;
    }
  }
  const found = pending.flatMap((m) => {
    const x = listed.get(m.place_id as string);
    if (!x) out.unread += 1;
    // The term that found it is the one it was judged under.
    return x ? [{ m, clean: x.clean, term: m.term ?? x.term }] : [];
  });
  if (!found.length) return out;
  // What the collect filtered before it judged, filtered again, so a stored answer's email index still points at
  // the same address.
  const supp = await leadPorts.db.suppressed(round.tenant_id, {
    // Every address, free mail included, as the collect asks (a stop is a person's, whatever their domain).
    emails: found.flatMap((x) => x.clean.emails),
    placeIds: found.map((x) => x.clean.raw.placeId),
  });
  // The probe's own geometry, as its collect measured: a city ask has no centre yet, so no place is out of its area.
  const geo = { center: areaCenter(plan), radiusM: plan.area.radius_m };
  const keys = keysOf(plan);
  const nowAsked = askedOf(plan);
  const reuse: typeof found = [];
  const judge: typeof found = [];
  for (const x of found) {
    if (supp.placeIds.has(x.clean.raw.placeId)) continue;
    x.clean.emails = x.clean.emails.filter((e) => !supp.emails.has(e));
    const j = x.m.judgment as Partial<MemberJudgment>;
    const answers = new Set((j.answer?.criteria ?? []).map((c) => c.key));
    // Reused only where every key was answered AND asked in the very same words; an answer kept before the
    // questions were kept with it (no `asked`) is judged again.
    const same = keys.every((k) => answers.has(k) && j.asked?.[k] === nowAsked[k]);
    (same ? reuse : judge).push(x);
  }

  const place = (
    item: (typeof found)[number],
    answer: JudgePlaceAnswer | null,
    opId: string | null,
    model: string | null,
  ): CollectPlace => {
    const rule =
      geo.center && !inArea(geo.center, geo.radiusM, item.clean.raw.location)
        ? { class: "review" as const, reason: OUT_OF_AREA_REASON, token: "out_of_area", excluded_by: null }
        : null;
    const created = memberOf(plan, item.term, item.clean, answer, opId, model, rule, geo, [], null);
    created.member.judgment = { ...created.member.judgment, plan_version: round.plan_version };
    return created;
  };
  const commit = async (xs: typeof found, places: CollectPlace[], judgment: CollectJudgment[] | null) => {
    // Their own marks, for the places the new plan lets back in (a left-out place kept none).
    await markPlaces(
      leadPorts,
      sites,
      places.filter((pl, i) => xs[i]?.m.class === "excluded" && pl.member.class !== "excluded").map((pl) => pl.place),
      markUntil(leadPorts, false),
    );
    const res = await leadPorts.db.roundRejudge(round.id, round.plan_version, places, judgment);
    if (!res.ok) return false;
    out.changed += res.changed;
    return true;
  };

  if (reuse.length) {
    const places = reuse.map((x) => {
      const j = x.m.judgment as Partial<MemberJudgment>;
      return place(x, j.answer ?? null, j.op_id ?? null, j.model ?? null);
    });
    out.reused = reuse.length;
    if (!(await commit(reuse, places, null))) return out;
  }
  const size = judgeBatchPlaces(plan);
  const reads = planReadsSites(plan);
  for (let index = 0; index < judge.length; index += size) {
    if (outOfTime(leadPorts, JUDGE_MARGIN_MS)) throw new LeadRetry("out of time before judging the first places again");
    const batch = judge.slice(index, index + size);
    const site = new Map<(typeof batch)[number], string | null>();
    if (reads) {
      const hosts = batch.flatMap((x) => (x.clean.host ? [x.clean.host] : []));
      await readSitesBeforeJudge(leadPorts, sites, hosts, JUDGE_MARGIN_MS);
      if (hosts.some((h) => !sites.asked(h))) throw new LeadRetry("out of time reading the first places' sites again");
      await Promise.all(batch.map(async (x) => site.set(x, await findSiteFact(sites, x.clean))));
    }
    // In the calls the judge can answer in time, side by side (judgeInCalls), each kept by the places it asked about.
    const calls = await judgeInCalls(
      leadPorts.judge,
      plan,
      batch,
      (x, ref) => factsOf(ref, x.clean, reads ? (site.get(x) ?? null) : undefined),
      (_, request) =>
        opIdFor(
          `rejudge:${round.id}:${round.plan_version}:${request
            .map((x) => x.clean.raw.placeId)
            .sort()
            .join(",")}`,
          0,
          0,
        ),
      round,
      () => !outOfTime(leadPorts, JUDGE_MARGIN_MS),
    );
    // A call refused twice leaves its places as they were; the others are committed together.
    const answered = calls.filter((c) => !c.judged.refused);
    if (!answered.length) continue;
    const notice = answered.flatMap((c) => c.items);
    const places = answered.flatMap(({ items, judged }) =>
      items.map((x, ref) => place(x, judged.answers.get(ref) ?? null, judged.judgment?.op_id ?? null, judged.model)),
    );
    const judgments = answered.flatMap((c) => (c.judged.judgment ? [c.judged.judgment] : []));
    out.judged += notice.length;
    if (!(await commit(notice, places, judgments.length ? judgments : null))) return out;
  }
  return out;
}
