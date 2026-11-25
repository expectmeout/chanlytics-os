import "server-only";
import {
  BOOKING_DEFAULTS,
  DAY_MS,
  cadenceOf,
  calendarFeedKeyOf,
  lookSaidOf,
  offeringHorizon,
  parseIcs,
  parseTenantConfig,
  planWeekOf,
  shiftKey,
  type BusyBlock,
  type ContentMadeDto,
  type WeekPlanDto,
  type Opportunity,
  type TenantId,
  type WeekPageDto,
} from "@chanlytics/contracts";
import { freshFilesOf, newServicesOf, opportunitiesFrom } from "@chanlytics/core";
import {
  findPiece,
  findWeekRung,
  listClaims,
  listFilesByIds,
  listGoals,
  listNewReviews,
  listPostsByIds,
  listWeekFootage,
  readContentWeek,
} from "@chanlytics/db/files";
import { findGoogleConnection } from "@chanlytics/db/google";
import { findWorkspaceRuntimeRow, findWorkspaceZone } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import { loadFeed } from "../calendar/openings";
import { recordBusy } from "../calendar/record-busy";
import { readInstagramPostable } from "../connections/meta";
import { readBrandKit } from "../workspace/brand-kit";
import { findConfigRow } from "../workspace/config-row";
import { readerStamp, type Reader, type ReaderContext } from "../shared/reader";
import { fileDtoOf } from "./files";
import { sentPostsOf, withRemovedThere } from "./content";
import { readReviewAsk, weekAsHeld } from "./week-today";

/**
 * A week of posts as the Week, Settings › Content and AI read it (00706; the content loop PRD's 10.1, 21.1, 21.2): the
 * plan of the week asked for (this week, or the next from Sunday evening: contracts planWeekOf) with its slots in time
 * order, what the owner claims, what the posts are for, how often they go up; and why to post now, worked out by the one
 * reader in core (opportunitiesFrom) over the same facts the plan reads. One module, so the number AI says is the
 * number the page shows.
 */

/** How far back new reviews and fresh footage count (as the plan reads them, the edge's lib/opportunities). */
const FRESH_DAYS = 14;

/** What both readers read first: the config as stored, the business's zone, the claims and the goals. */
async function readWeekBasics(rc: ReaderContext) {
  const db = rc.ctx.supabase;
  const [row, zone, claims, goals] = await Promise.all([
    findConfigRow(db, rc.tenantId),
    findWorkspaceZone(db, rc.tenantId),
    listClaims(db, rc.tenantId),
    listGoals(db, rc.tenantId),
  ]);
  return { zone: zone ?? "UTC", parsed: parseTenantConfig(row?.config ?? null), claims, goals };
}

/**
 * What the week's slots were made into, as the Week draws them: each made file with its posts, each reel's video, and
 * every file a slot names (its footage, and what it was made into), each read under the member's session.
 */
async function readWeekMade(rc: ReaderContext, week: WeekPlanDto) {
  const db = rc.ctx.supabase;
  const postIds = week.slots.flatMap((s) => (s.post_id ? [s.post_id] : []));
  const pieceIds = [...new Set(week.slots.flatMap((s) => (s.piece_id ? [s.piece_id] : [])))];
  const [posts, pieces] = await Promise.all([
    listPostsByIds(db, rc.tenantId, postIds).then((rows) => withRemovedThere(db, rc.tenantId, rows)),
    Promise.all(pieceIds.map((id) => findPiece(db, id))),
  ]);
  const read = pieces.flatMap((p) => (p ? [{ id: p.id, status: p.status, file_id: p.file_id }] : []));
  const madeIds = [
    ...new Set([...posts.map((p) => p.file_id), ...read.flatMap((p) => (p.file_id ? [p.file_id] : []))]),
  ];
  const sourceIds = week.slots.flatMap((s) => (s.file_id ? [s.file_id] : []));
  const rows = await listFilesByIds(db, rc.tenantId, [...new Set([...sourceIds, ...madeIds])]);
  const madePieces: ContentMadeDto[] = rows
    .filter((row) => madeIds.includes(row.id))
    .map((row) => ({ file: fileDtoOf(row), posts: sentPostsOf(posts.filter((p) => p.file_id === row.id)) }));
  return { files: rows.map(fileDtoOf), made: madePieces, pieces: read };
}

/** Whether each place takes a post now: Instagram through the Meta link, Google where a place is bound. */
async function readWeekPlaces(rc: ReaderContext): Promise<WeekPageDto["places"]> {
  const [instagram, google] = await Promise.all([
    readInstagramPostable(rc.ctx.supabase, rc.tenantId),
    findGoogleConnection(rc.ctx.supabase, rc.tenantId),
  ]);
  return { instagram: instagram === "yes", google: !!google.data?.location_name };
}

export const contentPlan: Reader<{ week?: string | undefined }, WeekPageDto> = {
  name: "content_plan",
  async read(rc, args) {
    const { zone, parsed, claims, goals } = await readWeekBasics(rc);
    const content = parsed?.content;
    const weekOf = args.week ?? planWeekOf(zone, rc.now.getTime());
    const [read, rung, places, runtime, brand, reviewAsk] = await Promise.all([
      readContentWeek(rc.ctx.supabase, rc.tenantId, weekOf),
      findWeekRung(rc.ctx.supabase, rc.tenantId),
      readWeekPlaces(rc),
      findWorkspaceRuntimeRow(rc.ctx.supabase, rc.tenantId),
      readBrandKit(rc.ctx, rc.tenantId, parsed),
      // The plan's proposal to ask for reviews (pass 6): a read that fails leaves the Week as it was.
      readReviewAsk(rc.ctx.supabase, rc.tenantId, rc.now.getTime()).catch(logAndGoOn("the week's review ask", null)),
    ]);
    // Held to its time only while the rung still lets AI approve it, and its time is not long past (00714).
    const week = weekAsHeld(read, rung, rc.now.getTime());
    return {
      data: {
        week_of: weekOf,
        zone,
        week,
        rung,
        ...(await readWeekMade(rc, week)),
        paused_at: runtime.data?.sending_stopped_at ?? null,
        places,
        review_ask: reviewAsk,
        planned: parsed?.features?.content_plan === true,
        claims,
        goals: goals.map((g) => ({ goal: g.goal, detail: g.words })),
        cadence: cadenceOf(content?.cadence),
        quiet_days: content?.quiet_days ?? [],
        languages: content?.languages ?? [],
        lines: content?.lines ?? {},
        look: {
          words: lookSaidOf(brand.kit, { logo: brand.logo_path !== null, accent: brand.accent !== null }),
          colours: [brand.accent, brand.kit.second].filter((c): c is string => c !== null),
        },
      },
      rows: [],
      stamp: readerStamp(),
    };
  },
};

/** The book's busy time over the week, by the feed and the record, as the edge's plan reads it; null with no book. */
async function bookBusy(
  rc: ReaderContext,
  at: { tenantId: TenantId; url: string | null; zone: string; daysAhead: number },
): Promise<BusyBlock[] | null> {
  if (!at.url) return null;
  const feed = await loadFeed(at.tenantId, at.url, { stale: true });
  if (!feed.text) return null;
  const parsed = parseIcs(feed.text, at.zone, { horizon: offeringHorizon(rc.now, at.daysAhead) });
  return [...parsed.busy, ...(await recordBusy(rc.ctx, at.tenantId, rc.now, at.daysAhead))];
}

/** Why to post now, for AI (PRD 12.1 read/opportunities): the reasons this week holds, each with its evidence. */
export const opportunities: Reader<{ week?: string | undefined }, { week_of: string; reasons: Opportunity[] }> = {
  name: "opportunities",
  async read(rc, args) {
    const { zone, parsed, claims, goals } = await readWeekBasics(rc);
    const nowMs = rc.now.getTime();
    const weekOf = args.week ?? planWeekOf(zone, nowMs);
    const profile = parsed?.brain?.profile;
    const daysAhead = Math.max(profile?.booking_rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead, 8);
    const since = new Date(nowMs - FRESH_DAYS * DAY_MS).toISOString();
    const [busy, reviews, files] = await Promise.all([
      profile ? bookBusy(rc, { tenantId: rc.tenantId, url: calendarFeedKeyOf(parsed), zone, daysAhead }) : null,
      listNewReviews(rc.ctx.supabase, rc.tenantId, since),
      listWeekFootage(rc.ctx.supabase, rc.tenantId, since),
    ]);
    const reasons = opportunitiesFrom({
      zone,
      nowMs,
      from: weekOf,
      to: shiftKey(weekOf, 6),
      hours: profile
        ? { hours: profile.hours, closures: profile.closures, rules: profile.booking_rules ?? null }
        : null,
      busy,
      reviews,
      files: freshFilesOf(files),
      claims,
      newServices: newServicesOf(goals),
    });
    return { data: { week_of: weekOf, reasons }, rows: [], stamp: readerStamp() };
  },
};
