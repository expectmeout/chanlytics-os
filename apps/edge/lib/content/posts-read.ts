/**
 * posts_read (the content status review's piece 4): once a day, each place a workspace posts to is asked for its own list
 * of posts, and the list is held against the posts Chanlytics calls up there. A post the list no longer names is asked
 * about by its own id, the same question a read of its numbers asks (observe.ts askWhetherGone), and only one the place
 * no longer holds is taken down here and its owner told once (settleGone): one move and one notice, whichever read finds
 * it first. So a post removed at its place, by its owner there or by the place, is noticed within a day, for a year.
 *
 * Never judged: a story (no place's list names one, and it ends by itself in a day; its own two reads ask about it), a
 * post with no id at its place, one that went to another account than the one connected now, one whose take-down is
 * still asking, and anything at a place whose list could not be read. A failed or refused read says nothing: tomorrow's
 * asks again, and nothing is shown to anyone.
 *
 * One job a workspace (decision 0115), handed out by the health sweep through posts_read_due. A job whose payload says
 * `dry` reads and asks as ever and moves nothing: its line says what it would have moved. A dry read also asks the list
 * of a place where nothing is held, a month back, so a place no real account has shown yet can be read once, and timed,
 * before a post depends on it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, HOUR_MS, POST_PLACES, type PlaceAdapter, type PostPlace, type TenantId } from "@chanlytics/contracts";
import { listPostsHeldAt } from "@chanlytics/db/content";
import type { PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob } from "@chanlytics/jobs";
import { errField, logger } from "../shared/log.js";
import { askWhetherGone, settleGone } from "./observe.js";
import type { PlaceList } from "./place-list.js";

type Db = SupabaseClient<Database>;

/** How long a post is watched after it went up: a year. Past it Chanlytics still calls it up, and no longer asks. */
const POSTS_WATCHED_MS = 365 * DAY_MS;

/** A post up for less than this is left to its first read of numbers: its place may not list it yet. */
const POSTS_SETTLED_MS = HOUR_MS;

/** The most posts one read asks a place about by their own id; the rest are asked on the days after. */
const ASKS_A_READ = 20;

/** How far back a dry read asks the list of a place where nothing is held. */
const DRY_LIST_MS = 30 * DAY_MS;

/** A place as the daily read asks it, for one workspace's account there. */
export interface HeldPlace {
  /** The account's own list of posts since a time. */
  list: (since: Date, deadline: number) => Promise<PlaceList>;
  /** Whether a post is one this list would name: it went to this account, and is of a kind the list holds. */
  holds: (post: PostRow) => boolean;
  /** The adapter a post missing from the list is asked of, by its own id. */
  placeOf: (post: PostRow) => PlaceAdapter;
}

/** A place's own way to find the workspace's account there, or why it cannot be asked now (not connected). */
export type HeldPlaceOf = (db: Db, tenantId: TenantId) => Promise<HeldPlace | { cant: string }>;

/** The places the daily read asks, each by its own finder, handed in by the job runner's wiring. */
export type HeldPlaces = Readonly<Partial<Record<PostPlace, HeldPlaceOf>>>;

/** What one place's read came to, for its line. */
interface PlaceRead {
  place: PostPlace;
  /** How the list read: whole or short, refused, no answer, or a place that could not be asked. */
  read: "whole" | "short" | "refused" | "unknown" | "cant";
  held: number;
  listed: number;
  calls: number;
  missing: number;
  asked: number;
  gone: number;
  ms: number;
  said?: string;
}

/** What one read is handed besides the place: where it runs, when it stops asking, and whether it only looks. */
interface ReadTurn {
  db: Db;
  tenantId: TenantId;
  nowMs: number;
  deadline: number;
  dry: boolean;
}

/** The posts the place's list does not name, though it reaches back to when each went up. */
function missingFrom(ownList: Extract<PlaceList, { is: "read" }>, posts: readonly PostRow[]): PostRow[] {
  return posts.filter((post) => {
    if (!post.external_id || !post.published_at || ownList.ids.has(post.external_id)) return false;
    return ownList.backToMs === null || Date.parse(post.published_at) >= ownList.backToMs;
  });
}

/**
 * Each missing post asked about by its own id; one the place no longer holds is taken down, and its owner told. Where
 * more are missing than one read asks about, each day begins where the day before left off, so none waits for ever.
 */
async function settleMissing(turn: ReadTurn, held: HeldPlace, missing: readonly PostRow[]) {
  const counts = { asked: 0, gone: 0 };
  const from = missing.length > ASKS_A_READ ? (Math.floor(turn.nowMs / DAY_MS) * ASKS_A_READ) % missing.length : 0;
  for (const post of [...missing.slice(from), ...missing.slice(0, from)].slice(0, ASKS_A_READ)) {
    if (Date.now() > turn.deadline) break;
    counts.asked += 1;
    if (!(await askWhetherGone(held.placeOf(post), post, turn.nowMs))) continue;
    if (turn.dry || (await settleGone(turn.db, turn.tenantId, post, "list"))) counts.gone += 1;
  }
  return counts;
}

/** One place asked: which it is, how its account is found, and the workspace's posts Chanlytics calls up there. */
interface PlaceAsked {
  place: PostPlace;
  placeOf: HeldPlaceOf;
  up: readonly PostRow[];
}

/** One place's read: its list, held against the workspace's posts there. Null where none of them is this account's. */
async function askPlace(turn: ReadTurn, { place, placeOf, up }: PlaceAsked): Promise<PlaceRead | null> {
  const began = Date.now();
  const read = { place, held: 0, listed: 0, calls: 0, missing: 0, asked: 0, gone: 0 };
  const held = await placeOf(turn.db, turn.tenantId);
  if ("cant" in held) return { ...read, read: "cant", ms: Date.now() - began };
  const posts = up.filter((post) => held.holds(post));
  const oldest = posts.at(-1)?.published_at;
  if (!oldest && !turn.dry) return null;
  // An hour before the oldest: a place may date a post a little before Chanlytics learned it was up.
  const since = oldest ? Date.parse(oldest) - HOUR_MS : turn.nowMs - DRY_LIST_MS;
  const ownList = await held.list(new Date(since), turn.deadline);
  const counted = { ...read, held: posts.length, calls: ownList.calls };
  if (ownList.is !== "read") return { ...counted, read: ownList.is, said: ownList.said, ms: Date.now() - began };
  const missing = missingFrom(ownList, posts);
  const settled = await settleMissing(turn, held, missing);
  return {
    ...counted,
    read: ownList.backToMs === null ? "whole" : "short",
    listed: ownList.ids.size,
    missing: missing.length,
    ...settled,
    ms: Date.now() - began,
  };
}

/**
 * posts_read: each place the workspace has a post up at, asked what it holds. A place that cannot be asked, or whose
 * read fails, is said on its line and judged nothing, and never keeps the others from being asked. Only the workspace's
 * own posts that cannot be read throw, and the ledger tries that again.
 */
export async function readPostsHeld(
  db: Db,
  job: ClaimedJob,
  deadline: number,
  places: HeldPlaces,
): Promise<{ read: PlaceRead[] } | { skipped: string }> {
  const log = logger({ tenant_id: job.tenant_id });
  const turn: ReadTurn = { db, tenantId: job.tenant_id, nowMs: Date.now(), deadline, dry: job.payload.dry === "yes" };
  const reads: PlaceRead[] = [];
  for (const place of POST_PLACES) {
    const placeOf = places[place];
    if (!placeOf) continue;
    const up = await listPostsHeldAt(db, job.tenant_id, {
      place,
      after: new Date(turn.nowMs - POSTS_WATCHED_MS).toISOString(),
      upTo: new Date(turn.nowMs - POSTS_SETTLED_MS).toISOString(),
    });
    if (up.length === 0 && !turn.dry) continue;
    const read = await askPlace(turn, { place, placeOf, up }).catch((e: unknown) => {
      log.error("posts_read_failed", { place, error: errField(e) });
      return null;
    });
    if (!read) continue;
    log.info("posts_read", { ...read, dry: turn.dry });
    reads.push(read);
  }
  return reads.length > 0 ? { read: reads } : { skipped: "nothing up" };
}
