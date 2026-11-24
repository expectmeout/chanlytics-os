/**
 * content_plan: a week of posts planned (00706; the content loop PRD's 10.2), begun by the weekly clock on Sunday evening
 * in the business's zone (content_plans_hand_out) or by the owner's ask. It reads why to post now (lib/opportunities: the
 * book's open time, new reviews, fresh footage, the offers that run, the services said to be new), what the posts are for
 * and how often, the footage the business added and what went out in the last three weeks; plans the week (core planWeek);
 * keeps the moments of the clips it picked where none are kept (PRD 10.3, from the look's own moments: no model asked);
 * has AI word the week in one call (week-words.ts), each creative's words held to the one claims rule; writes the week
 * ready; holds it to its time where the owner let AI approve the week (week-go.ts); and tells the owner (plan-notices.ts). Nothing is made: a week's posts are made after its approval (Ruben, 23 Nov
 * 2026), so a week nobody approves costs its words alone. A plan no longer drafting is left as it is, so a try again is
 * safe.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asTenantId,
  contentPreviewOf,
  DAY_MS,
  dayInZone,
  metaLinesOf,
  parseTenantConfig,
  PATTERN_DAYS,
  recordOrEmpty,
  shiftKey,
  type InstagramPostable,
  type PostPlace,
  type TenantId,
} from "@chanlytics/contracts";
import {
  contentPatternsOf,
  newServicesOf,
  opportunitiesFrom,
  planWeek,
  type FootageFact,
  type GoalFact,
  type WeekAsked,
} from "@chanlytics/core";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import {
  countMoments,
  findPlanForJob,
  keepMoments,
  listClaims,
  listGoals,
  listPostOutcomes,
  listWeekFootage,
  readRecentlyPosted,
  writePlan,
  type FootageRow,
} from "@chanlytics/db/files";
import { findGoogleConnection } from "@chanlytics/db/google";
import { findWorkspaceZone, getTenantConfig } from "@chanlytics/db/workspace";
import { jsonCopyOf } from "@chanlytics/db/shared";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob } from "@chanlytics/jobs";
import { logAndGoOn } from "@chanlytics/log";
import { FOOTAGE_DAYS, readOpportunityFacts } from "../opportunities/book.js";
import { logger } from "../shared/log.js";
import { notifyWeek } from "./plan-notices.js";
import { holdReadyWeek, type WeekGoes } from "./week-go.js";
import { creativesAsked, ownerWordsOf, slotsWithWords, writeWeekWords, type WordsWriter } from "./week-words.js";

type Db = SupabaseClient<Database>;

/** How far back what went out counts against a clip or a reason (PRD 10.2, step 1). */
const POSTED_DAYS = 21;

/** Whether each place takes a post now: Instagram through the Meta link where it is switched on, Google where a place is bound. */
async function postablePlacesOf(
  db: Db,
  tenantId: TenantId,
  config: unknown,
): Promise<Partial<Record<PostPlace, InstagramPostable>>> {
  const [meta, google] = await Promise.all([
    contentPreviewOf(config) ? findMetaInstagramRow(db, tenantId) : Promise.resolve(null),
    findGoogleConnection(db, tenantId),
  ]);
  const kept = recordOrEmpty(meta?.config);
  const instagram: InstagramPostable =
    !meta || kept.token_lapsed_at ? "not_connected" : metaLinesOf(kept.scopes).publish ? "yes" : "line_off";
  return { instagram, google: google.data?.location_name ? "yes" : "not_connected" };
}

/** A clip or photo as the plan reads it, with what went out lately and its kept moments. */
const footageFactOf = (
  row: FootageRow,
  posted: ReadonlySet<string>,
  moments: ReadonlyMap<string, number>,
): FootageFact => ({
  id: row.id,
  kind: row.kind,
  shows: row.shows,
  name: row.name,
  issues: row.issues,
  at: row.at,
  postedRecently: posted.has(row.id),
  moments: Math.max(moments.get(row.id) ?? 0, row.moments.length),
  seconds: row.seconds,
});

/** What the week is planned from, read for one workspace. */
async function readWeekAsked(db: Db, plan: { tenant_id: string; week_of: string }, nowMs: number) {
  const tenantId = asTenantId(plan.tenant_id);
  const [zone, configRow, claims, goals] = await Promise.all([
    findWorkspaceZone(db, tenantId),
    getTenantConfig(db, tenantId),
    listClaims(db, tenantId),
    listGoals(db, tenantId),
  ]);
  const config = configRow?.config ?? null;
  const parsed = parseTenantConfig(config);
  const content = parsed?.content;
  const since = (days: number) => new Date(nowMs - days * DAY_MS).toISOString();
  const [places, footage, posted, outcomes, facts] = await Promise.all([
    postablePlacesOf(db, tenantId, config),
    listWeekFootage(db, tenantId, since(FOOTAGE_DAYS)),
    readRecentlyPosted(db, tenantId, since(POSTED_DAYS)),
    listPostOutcomes(db, tenantId, since(PATTERN_DAYS)),
    readOpportunityFacts(
      db,
      {
        tenantId,
        zone: zone ?? "UTC",
        config,
        claims,
        newServices: newServicesOf(goals),
      },
      { from: plan.week_of, to: shiftKey(plan.week_of, 6), nowMs },
    ),
  ]);
  const moments = await countMoments(
    db,
    tenantId,
    footage.filter((f) => f.kind === "video").map((f) => f.id),
  );
  const goalFacts: GoalFact[] = goals.map((g) => ({
    goal: g.goal,
    service: g.service,
    days: g.days,
    weight: g.weight,
  }));
  const given: WeekAsked = {
    zone: zone ?? "UTC",
    nowMs,
    weekOf: plan.week_of,
    cadence: content?.cadence,
    quietDays: content?.quiet_days ?? [],
    places,
    goals: goalFacts,
    opportunities: opportunitiesFrom(facts),
    footage: footage.map((row) => footageFactOf(row, posted.files, moments)),
    usedReasons: posted.reasons,
    // What the business's own posts of the last 90 days showed, and how sure each is (PRD 9.4).
    patterns: contentPatternsOf(outcomes, zone ?? "UTC"),
  };
  return { tenantId, week: given, footage, config: parsed, claims, languages: content?.languages ?? [] };
}

/**
 * The moments of the clips a week picked, kept where none are (PRD 10.3, on demand): each of the look's own moments, a
 * span of three seconds around its frame, best first, with no model asked. A clip whose look named none keeps none.
 */
async function keepPickedMoments(
  db: Db,
  tenantId: TenantId,
  picked: { footage: readonly FootageRow[]; fileIds: ReadonlySet<string>; kept: ReadonlyMap<string, number> },
): Promise<number> {
  let kept = 0;
  for (const row of picked.footage) {
    if (row.kind !== "video" || !picked.fileIds.has(row.id) || (picked.kept.get(row.id) ?? 0) > 0) continue;
    if (row.moments.length === 0) continue;
    kept += await keepMoments(db, tenantId, {
      id: row.id,
      moments: row.moments.map((m, rank) => ({
        start_s: Math.max(0, m.at - 1.5),
        end_s: m.at + 1.5,
        shows: [m.what],
        words: null,
        score: Math.max(0.1, 1 - rank * 0.15),
        confidence: 0.6,
        model_edition: 2,
      })),
    });
  }
  return kept;
}

/**
 * The job: the week planned, worded and written ready, then told; a plan no longer drafting, or gone, is left as it is.
 * `writeWords` is the real call; a test hands its own.
 */
export async function planTheWeek(
  db: Db,
  job: ClaimedJob,
  writeWords: WordsWriter = writeWeekWords,
): Promise<void | { skipped: string }> {
  const planId = typeof job.payload.plan_id === "string" ? job.payload.plan_id : "";
  const plan = await findPlanForJob(db, planId);
  if (!plan) return { skipped: "gone" };
  if (plan.status !== "drafting") return { skipped: plan.status };
  const nowMs = Date.now();
  const { tenantId, week, footage, config, claims, languages } = await readWeekAsked(db, plan, nowMs);
  const drafted = planWeek(week, randomUUID);
  const fileIds = new Set(drafted.slots.flatMap((s) => (s.file_id ? [s.file_id] : [])));
  const kept = await countMoments(db, tenantId, [...fileIds]);
  const moments = await keepPickedMoments(db, tenantId, { footage, fileIds, kept });
  const shows = new Map(footage.map((row) => [row.id, row.shows.join("; ")]));
  const business = { config, zone: week.zone, nowMs, claims };
  const words = await writeWords(
    { ...business, languages, creatives: creativesAsked(drafted.slots, shows, week.zone) },
    { tenantId, planId: plan.id },
  );
  const slots = slotsWithWords(drafted.slots, words, {
    words: ownerWordsOf(business),
    claims,
    today: dayInZone(week.zone, nowMs).key,
  });
  const written = await writePlan(db, tenantId, {
    id: plan.id,
    slots: jsonCopyOf(slots),
    fewer: drafted.fewer,
  });
  const log = logger({ tenant_id: tenantId });
  if (written.fate !== "ready") return { skipped: written.fate };
  const asks = drafted.slots.filter((s) => s.state === "needs_footage").length;
  log.info("plan_drafted", {
    plan_id: plan.id,
    slots: written.slots,
    blocked: slots.filter((s) => s.state === "blocked").length,
    worded: words.size,
    asks,
    fewer: drafted.fewer !== null,
    moments,
    opportunities: week.opportunities.length,
    patterns: week.patterns.filter((p) => p.level !== "too_little").length,
  });
  // Under a rung that lets AI approve the week, it is held to its time (00714): 8:00 AM, or now where it sends it.
  // A hold that fails leaves the week waiting for the owner's press, as a week that asks does, and the owner is told.
  const held = await holdReadyWeek(db, { tenantId, planId: plan.id, zone: week.zone, nowMs }).catch(
    logAndGoOn<WeekGoes>("holding a ready week to its time", "asks"),
  );
  await notifyWeek(db, { tenantId, planId: plan.id, weekOf: plan.week_of, zone: week.zone, slots, asks, held });
}
