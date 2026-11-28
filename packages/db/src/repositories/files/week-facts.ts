/**
 * What a week's plan reads of a workspace (00706; the content loop PRD's 10.1, 10.2), under the service role: the
 * footage it could be made from, what went out in the last three weeks and why, the new reviews of four or five stars,
 * and the plans asked for; and, for the week's patterns (the PRD's 9.4), what each of its own posts did: its kind, when,
 * its file's length and what its footage's look said it shows, its reach seven days after it went up, and whether any
 * of its numbers then came while it also ran as an ad. Each a narrow read with its bound; the reasons and the patterns
 * are worked out from them in core (opportunities, content/plan, contentPatternsOf), never here.
 *
 * What goes out is always a made file (a drawn picture, a made video); what a plan picks from, and what a look says a
 * thing shows, is the footage under it. So both reads follow each made file to the footage it was made from
 * (readFootageOfMade): before that, "posted in the last three weeks" named made files, which no footage ever is, and a
 * post's "shows" was its made file's own line ("A post saying ..."), which no two posts share.
 */
import {
  DbFailure,
  isObjectRecord,
  isOneOf,
  listOrEmpty,
  nonBlankOrNull,
  pieceFileIdsOf,
  pieceIntentOf,
  piecePlanOf,
  PLAN_PLACES,
  POST_KINDS,
  recordOrEmpty,
  type PostOutcome,
  type TenantId,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** Where footage the business added came from: never a made file, and never one found on the web (PRD 6.1, rights). */
const OWN_SOURCES = ["upload", "drive", "instagram", "google_profile"] as const;

/** A photo or a clip the week could be made from, as the plan reads it. */
export interface FootageRow {
  id: string;
  kind: "image" | "video";
  name: string;
  at: string;
  /** A clip's length; null for a photo, or a clip not measured. */
  seconds: number | null;
  /** The look's own words of what it shows: its line, what a post could use it for, its moments' words. */
  shows: string[];
  issues: string[];
  moments: { at: number; what: string }[];
  stock: boolean;
}

/** A look's moments: each frame's second and what it shows. */
const momentsOfLook = (look: Record<string, unknown>): { at: number; what: string }[] =>
  listOrEmpty(look.moments).flatMap((m) =>
    isObjectRecord(m) && typeof m.at === "number" && typeof m.what === "string" ? [{ at: m.at, what: m.what }] : [],
  );

/** What a file's look said it shows: its line, what a post could use it for, its moments' words. */
function showsOfLook(json: unknown): string[] {
  const look = recordOrEmpty(json);
  return [nonBlankOrNull(look.use), ...momentsOfLook(look).map((m) => m.what), nonBlankOrNull(look.line)].filter(
    (s): s is string => !!s,
  );
}

const footageOf = (row: {
  id: string;
  kind: string;
  name: string;
  created_at: string;
  seconds: number | null;
  look: unknown;
}): FootageRow | null => {
  if (row.kind !== "image" && row.kind !== "video") return null;
  const look = recordOrEmpty(row.look);
  const moments = momentsOfLook(look);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    at: row.created_at,
    seconds: row.seconds,
    shows: showsOfLook(look),
    issues: listOrEmpty(look.issues).filter((s): s is string => typeof s === "string"),
    moments,
    stock: look.looks_like_stock === true,
  };
};

/** The most footage a week reads: the newest of what the business added and kept. */
const FOOTAGE_MOST = 40;

/**
 * The footage the business added and kept, its look read, newest first: no made file, nothing found on the web, nothing
 * waiting for the owner's word or set aside, nothing away from the shelf, no stock.
 */
export async function listWeekFootage(db: Db, tenantId: TenantId, sinceIso: string): Promise<FootageRow[]> {
  const { data, error } = await db
    .from("files")
    .select("id, kind, name, created_at, seconds, look")
    .eq("tenant_id", tenantId)
    .eq("status", "filed")
    .is("removed_at", null)
    .eq("copy_state", "here")
    .eq("look_status", "done")
    .in("source", [...OWN_SOURCES])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(FOOTAGE_MOST);
  if (error) throw new DbFailure(error, "week footage");
  return data.flatMap((row) => {
    const footage = footageOf(row);
    return footage && !footage.stock ? [footage] : [];
  });
}

/**
 * The most made files one read follows to their footage: past about 200 ids one `.in()` passes the gateway's 8 KiB.
 */
const MADE_MOST = 150;

/**
 * The footage each made file was made from, by the made file's id: a drawn picture's photo or clip (how it was made
 * says so, `files.made.from`), and a made video's clips and photos (the plan its piece was drawn by, a version's own).
 * A made file whose making is not kept names none.
 */
async function readFootageOfMade(
  db: Db,
  tenantId: TenantId,
  madeIds: readonly string[],
): Promise<Map<string, string[]>> {
  const ids = [...new Set(madeIds)].slice(0, MADE_MOST);
  const footage = new Map<string, string[]>();
  if (ids.length === 0) return footage;
  const [files, pieces] = await Promise.all([
    db.from("files").select("id, made").eq("tenant_id", tenantId).in("id", ids).limit(ids.length),
    // A version's drawing row names its own file too: a little over one piece a file.
    db
      .from("pieces")
      .select("file_id, plan")
      .eq("tenant_id", tenantId)
      .in("file_id", ids)
      .limit(ids.length * 2),
  ]);
  if (files.error) throw new DbFailure(files.error, "made files' footage");
  if (pieces.error) throw new DbFailure(pieces.error, "made videos' footage");
  const named = (madeId: string, from: readonly string[]) => {
    if (from.length > 0) footage.set(madeId, [...new Set([...(footage.get(madeId) ?? []), ...from])]);
  };
  for (const file of files.data) {
    const from = nonBlankOrNull(recordOrEmpty(file.made).from);
    if (from) named(file.id, [from]);
  }
  for (const piece of pieces.data)
    if (piece.file_id) named(piece.file_id, pieceFileIdsOf(piecePlanOf(recordOrEmpty(piece.plan))));
  return footage;
}

/**
 * What went out lately: the files posted (each made file, and the footage it was made from, which is what a plan
 * picks), and the reasons the pieces were made for.
 */
export interface RecentlyPosted {
  files: Set<string>;
  reasons: Set<string>;
}

/** The posts set or up since a moment, under the service role: their files, and their pieces' reasons. */
export async function readRecentlyPosted(db: Db, tenantId: TenantId, sinceIso: string): Promise<RecentlyPosted> {
  const { data, error } = await db
    .from("posts")
    .select("file_id, piece_id, status")
    .eq("tenant_id", tenantId)
    .gte("created_at", sinceIso)
    .not("status", "in", "(pulled,failed)")
    // Three weeks of a business's posts: a few dozen at the cadence's most.
    .limit(200);
  if (error) throw new DbFailure(error, "posts lately");
  const rows = data;
  const pieceIds = [...new Set(rows.map((r) => r.piece_id).filter((id): id is string => !!id))];
  const reasons = new Set<string>();
  if (pieceIds.length > 0) {
    const { data: pieces, error: piecesError } = await db
      .from("pieces")
      .select("id, intent, file_id")
      .eq("tenant_id", tenantId)
      .in("id", pieceIds)
      .limit(pieceIds.length);
    if (piecesError) throw new DbFailure(piecesError, "pieces lately");
    for (const piece of pieces) {
      const reason = pieceIntentOf(piece.intent)?.opportunity_id;
      if (reason) reasons.add(reason);
    }
  }
  const madeIds = rows.map((r) => r.file_id);
  const footage = await readFootageOfMade(db, tenantId, madeIds);
  return { files: new Set([...madeIds, ...[...footage.values()].flat()]), reasons };
}

/** A new review as the plan reads it: the reviewer's first name and initial only, never their full name (PRD 10.5). */
export interface ReviewRow {
  id: string;
  rating: number;
  by: string | null;
  words: string;
  at: string;
}

/** "Ana Rodríguez" said as "Ana R.": a first name and an initial, never more. */
const firstNameAndInitial = (author: string | null): string | null => {
  const parts = (author ?? "").trim().split(/\s+/).filter(Boolean);
  const [first, ...rest] = parts;
  if (!first) return null;
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
};

/** The reviews of four or five stars published since a moment, newest first, under the service role. */
export async function listNewReviews(db: Db, tenantId: TenantId, sinceIso: string): Promise<ReviewRow[]> {
  const { data, error } = await db
    .from("google_reviews")
    .select("review_id, rating, author, body, published_at")
    .eq("tenant_id", tenantId)
    .gte("rating", 4)
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    // A fortnight's good reviews: a handful for a small business.
    .limit(20);
  if (error) throw new DbFailure(error, "new reviews");
  return data.flatMap((row) =>
    row.rating !== null && row.body && row.published_at
      ? [
          {
            id: row.review_id,
            rating: row.rating,
            by: firstNameAndInitial(row.author),
            words: row.body,
            at: row.published_at,
          },
        ]
      : [],
  );
}

/**
 * The most posts one read compares: 90 days at the cadence's most is about sixty, and past about 200 ids one `.in()`
 * passes the gateway's 8 KiB.
 */
const OUTCOMES_MOST = 150;

/** The posts up since a moment, with what the patterns compare of each, oldest first. */
export async function listPostOutcomes(db: Db, tenantId: TenantId, sinceIso: string): Promise<PostOutcome[]> {
  const { data: posts, error } = await db
    .from("posts")
    .select("id, place, kind, published_at, file_id")
    .eq("tenant_id", tenantId)
    .in("place", [...PLAN_PLACES])
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: true })
    .limit(OUTCOMES_MOST);
  if (error) throw new DbFailure(error, "post outcomes");
  const up = posts.flatMap((post) =>
    post.published_at && isOneOf(PLAN_PLACES, post.place) && isOneOf(POST_KINDS, post.kind)
      ? [{ ...post, at: post.published_at, place: post.place, kind: post.kind }]
      : [],
  );
  if (up.length === 0) return [];
  const fileIds = [...new Set(up.map((post) => post.file_id))];
  const postIds = up.map((post) => post.id);
  const [files, footage, numbers] = await Promise.all([
    db.from("files").select("id, seconds").eq("tenant_id", tenantId).in("id", fileIds).limit(fileIds.length),
    readFootageOfMade(db, tenantId, fileIds),
    db
      .from("post_observations")
      .select("post_id, availability, value, paid_mixed")
      .eq("tenant_id", tenantId)
      .in("post_id", postIds)
      .eq("metric", "reach")
      .eq("step", "7d")
      .limit(postIds.length),
  ]);
  if (files.error) throw new DbFailure(files.error, "post outcomes' files");
  if (numbers.error) throw new DbFailure(numbers.error, "post outcomes' reach");
  // What a post shows is what its footage's look said: the made file's own look only says it is a post.
  const footageIds = [...new Set([...footage.values()].flat())].slice(0, MADE_MOST);
  const looks =
    footageIds.length === 0
      ? { data: [], error: null }
      : await db
          .from("files")
          .select("id, look")
          .eq("tenant_id", tenantId)
          .in("id", footageIds)
          .limit(footageIds.length);
  if (looks.error) throw new DbFailure(looks.error, "post outcomes' footage");
  const lookOf = new Map(looks.data.map((file) => [file.id, file.look]));
  const fileOf = new Map(files.data.map((file) => [file.id, file]));
  const reachOf = new Map(numbers.data.map((row) => [row.post_id, row]));
  return up.map((post): PostOutcome => {
    const file = fileOf.get(post.file_id);
    const reach = reachOf.get(post.id);
    const shown = (footage.get(post.file_id) ?? []).flatMap((id) => showsOfLook(lookOf.get(id)));
    return {
      postId: post.id,
      place: post.place,
      kind: post.kind,
      at: post.at,
      seconds: file?.seconds ?? null,
      shows: [...new Set(shown)],
      paid: reach?.paid_mixed === true,
      reach: reach?.availability === "available" && reach.value !== null ? Number(reach.value) : null,
    };
  });
}
