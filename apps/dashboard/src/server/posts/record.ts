/**
 * What a kept post remembers (decision 0099, step 3): the photo it came from and what it was asked to be, so a later version starts
 * from what this one did, and Ask keeps the look a person settled on. A member's session has no grant on `made` (00553), so the
 * service role reads it, and only after the caller's own read of the row said it is theirs to see, or for their own workspace.
 */
import "server-only";
import {
  fileSoundOf,
  piecePlanOf,
  postPlanOf,
  recordOrNull,
  type FilePosted,
  type FileRecordDto,
  type PiecePeopleDto,
  type PieceTakeDownDto,
  type PostDto,
  type PostPlan,
} from "@chanlytics/contracts";
import {
  getFileMade,
  findFile,
  findPiecePlanOfFile,
  getNewestMade,
  listFilePosts,
  readFileSound,
  type FileMemberRow,
  type MemberPostRow,
} from "@chanlytics/db/files";
import { findFilePosted } from "@chanlytics/db/events";
import { findConnection } from "@/server/connections/google";
import { readInstagramPostable, instagramPostsOf } from "./instagram";
import { fileMadeOf, readDrawnFrom } from "./made-as";
import { readPieceTakeDown } from "./take-down";
import { readPiecePeople } from "@/server/files/people";
import { log } from "@/server/shared/log";
import { handPostOf, sentPostsOf } from "@/server/readers/content";
import { fileDtoOf } from "@/server/readers/files";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import type { TenantId } from "@chanlytics/contracts";

/**
 * GET files/[id]: one file, and for a post what it came from and what it was asked to be. A video's is what was heard of it
 * besides (stage B): its words and how it sounds, read by id under the caller's RLS, never by the list; and one Ask made, the
 * plan it was drawn by, so its words can be made again.
 */
export async function readFileRecord(ctx: RouteContext, member: Member, row: FileMemberRow): Promise<FileRecordDto> {
  const file = fileDtoOf(row);
  if (row.kind === "video") {
    const ours = row.source === "made";
    const [sound, plan, posts, can] = await Promise.all([
      readFileSound(ctx.supabase, row.id),
      ours ? findPiecePlanOfFile(ctx.supabase, member.tenantId, row.id) : null,
      // A made video's posts: its reel on Instagram (00680), and the one its owner put up by hand.
      ours ? listFilePosts(ctx.supabase, member.tenantId, row.id) : [],
      ours ? readInstagramPostable(member.tenantId) : null,
    ]);
    const drawnBy = recordOrNull(plan);
    return {
      file,
      made: null,
      // Google takes no video from here (contracts PLACE_CAPABILITIES).
      google: null,
      instagram: can === null ? null : { can, posts: instagramPostsOf(posts) },
      ...(ours ? { posts: sentPostsOf(posts) } : {}),
      by_hand: handPostOf(posts),
      sound: fileSoundOf(sound),
      ...(drawnBy ? { video: { plan: piecePlanOf(drawnBy) } } : {}),
    };
  }
  if (row.source !== "made") return { file, made: null, google: null, instagram: null };
  const [kept, connection, posts, can] = await Promise.all([
    getFileMade(serviceDb(), member.tenantId, row.id),
    findConnection(ctx.supabase, member.tenantId),
    listFilePosts(ctx.supabase, member.tenantId, row.id),
    readInstagramPostable(member.tenantId),
  ]);
  const google = { connected: !!connection?.location_name, posted: await onGoogle(member, row.id, posts) };
  const instagram = can === null ? null : { can, posts: instagramPostsOf(posts) };
  // Every place's, whatever the Meta link, so a piece read on its own stands where the page that lists it says; and apart
  // from them the one its owner put up by hand.
  const placed = { google, instagram, posts: sentPostsOf(posts), by_hand: handPostOf(posts) };
  const created = recordOrNull(kept);
  if (!created) return { file, made: null, ...placed };
  // Read under the caller's RLS: a photo removed since, or one they can't see, is no photo to name.
  const from = typeof created.from === "string" ? await findFile(ctx.supabase, created.from) : null;
  return { file, made: fileMadeOf(created, from ? { id: from.id, name: from.name } : null), ...placed };
}

/** A file's posts at every place, newest first, under the caller's RLS: what Ask's card to put a post up checks first. */
export async function readFilePosts(ctx: RouteContext, tenantId: TenantId, fileId: string): Promise<PostDto[]> {
  return sentPostsOf(await listFilePosts(ctx.supabase, tenantId, fileId));
}

/**
 * Where the post is on Google (decision 0121, D16): its newest placement where that says it went up or came down; else what
 * the edge's events say, for a post made before placements were kept, or one whose answer the press never heard.
 */
async function onGoogle(member: Member, fileId: string, posts: readonly MemberPostRow[]): Promise<FilePosted | null> {
  // A post let go (Don't post) says nothing of one that is up: the newest of the others does (contracts newestAtEachPlace).
  const placed = posts.find((p) => p.place === "google" && p.status !== "pulled");
  if (placed?.status === "taken_down") return null;
  if (placed?.status === "published" && placed.external_id)
    return { name: placed.external_id, search_url: placed.permalink, at: placed.published_at ?? placed.created_at };
  return findFilePosted(serviceDb(), member.tenantId, fileId);
}

/** The look a person settled on, as their newest post keeps it: what a card changed, since a card's Save keeps what was pressed. */
type PostLook = Pick<PostPlan, "voice" | "layout" | "book">;

/** What the workspace's newest post looks like, or null before its first. Never costs a turn: a failed read is no look to keep. */
export async function findNewestPostLook(tenantId: TenantId): Promise<PostLook | null> {
  try {
    const created = recordOrNull(await getNewestMade(serviceDb(), tenantId));
    const plan = recordOrNull(created?.plan);
    if (!plan) return null;
    const { voice, layout, book } = postPlanOf(plan);
    return { voice, layout, book };
  } catch (e) {
    log.warn("file_post_look_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * A made piece's standing beyond its posts (GET files/[id]; 00681, 00682): who is in it, in the piece and in each photo or
 * clip it was drawn from, and its newest take-down. Null for anything AI did not make.
 */
export async function readPieceStanding(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  posts: readonly PostDto[],
): Promise<{ people: PiecePeopleDto; take_down: PieceTakeDownDto | null } | null> {
  if (row.source !== "made") return null;
  const drawn = await readDrawnFrom(ctx.supabase, member.tenantId, [row.id]);
  const piece = { id: row.id, drawnFrom: (drawn.get(row.id) ?? []).map((from) => from.id) };
  const [people, takeDown] = await Promise.all([
    readPiecePeople(ctx, member, piece),
    readPieceTakeDown(ctx, member, { ...piece, postIds: posts.map((p) => p.id) }),
  ]);
  return { people, take_down: takeDown };
}
