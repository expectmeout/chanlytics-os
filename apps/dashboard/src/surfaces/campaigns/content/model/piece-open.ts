/**
 * A made piece, opened (the content canvas, "Opening a piece"): its one next step, where it stands at each place, and who
 * stands beside it. Pure: the pane draws what these say.
 */
import {
  INSTAGRAM_POST_KINDS,
  POST_ON_ITS_WAY,
  POST_PLACES,
  POST_PULLABLE,
  newestAtEachPlace,
  postPhotoWont,
  postPlaceTakenOf,
  postStoppedWhyOf,
  postWaitsForItsTime,
  whoStandsOf,
  type ContentMadeDto,
  type FileDto,
  type InstagramPostKind,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";

/** What can take the piece now, as its record says (GET files/[id]): Instagram that takes a post, Google connected. */
export type PieceTakes = Record<PostPlace, boolean>;

/**
 * The kinds Instagram can take of this piece now: each with none of its own on its way there, since a picture post and a
 * story wait apart (00620; contracts postPlaceTakenOf, the rule Ask's card keeps too).
 */
export const instagramKindsFree = (posts: readonly PostDto[]): InstagramPostKind[] =>
  INSTAGRAM_POST_KINDS.filter((kind) => !postPlaceTakenOf(posts, "instagram", kind));

/** What Instagram is posted as: the kind wanted where it can go now, else the one that can. */
export const instagramAsOf = (free: readonly InstagramPostKind[], wanted: InstagramPostKind): InstagramPostKind =>
  free.includes(wanted) ? wanted : (free[0] ?? wanted);

/**
 * What can take the piece now, from its posts and what its record says of each place. Google takes a piece once, and none
 * while one is on its way there (contracts postPlaceTakenOf). Instagram takes one of each kind at a time, so it takes another
 * while either kind is free: the sheet draws a line for each post that waits there, with its own Don't post (model/places.ts),
 * and offers the kind that is free. Opening the sheet still arms nothing where a post is on its way (postBothOpening).
 */
export function pieceTakesOf(
  posts: readonly PostDto[],
  can: { instagram: boolean; google: boolean; onGoogle: boolean },
): PieceTakes {
  return {
    instagram: can.instagram && instagramKindsFree(posts).length > 0,
    google: can.google && !can.onGoogle && !postPlaceTakenOf(posts, "google"),
  };
}

/** The one act that leads. `pull` is the post Don't post would stop, while it still can be. */
export type PieceNext =
  | { is: "post" }
  | { is: "post_to"; place: PostPlace }
  | { is: "again"; place: PostPlace }
  | { is: "going"; place: PostPlace; pull: string | null }
  | { is: "save" }
  /** A file of the library: kept, where it waits in the inbox; then what Ask makes from it. */
  | { is: "keep" }
  | { is: "make" }
  | { is: "none" };

/** What the one next step reads of a file. */
type PieceFile = Pick<
  FileDto,
  "kind" | "source" | "status" | "shows" | "media_status" | "who_in_it" | "look_status" | "people"
>;

/**
 * A library file's next step, as Files' sheet offered it: kept, where it waits in the inbox; a post made from it, where one can
 * be and who is in it is settled; else nothing leads, and its details ask what is missing (who is in it).
 */
function libraryNextOf(file: PieceFile): PieceNext {
  if (file.status === "inbox") return { is: "keep" };
  if (!postPhotoWont(file) && whoStandsOf(file).is !== "ask") return { is: "make" };
  return { is: "none" };
}

/**
 * What needs the owner, then what is going up now, then the next place it can go. A post that waits for its time leads with
 * nothing (pieceTimedOf says it, with its Don't post). Before the record is read it never guesses a place.
 */
export function pieceNextOf(
  file: PieceFile,
  posts: readonly PostDto[],
  takes: PieceTakes | null,
  nowMs: number,
): PieceNext {
  if (file.source !== "made") return libraryNextOf(file);
  // A video is no picture or story: a reel waits for its own road (decision 0121).
  if (file.kind === "video") return { is: "save" };
  const newest = newestAtEachPlace(posts);
  const stuck = newest.find((p) => p.status === "held" || p.status === "failed");
  if (stuck) return { is: "again", place: stuck.place };
  // One on its way at a place is the one there (00611 posts_one_on_its_way), whatever went up since it was asked for.
  const going = posts.find((p) => POST_ON_ITS_WAY.includes(p.status) && !postWaitsForItsTime(p, nowMs));
  if (going) return { is: "going", place: going.place, pull: POST_PULLABLE.includes(going.status) ? going.id : null };
  // A place is taken where the piece is up, or where a post waits for its time there: a second would be refused.
  const taken = new Set([
    ...newest.filter((p) => p.status === "published").map((p) => p.place),
    ...posts.filter((p) => POST_ON_ITS_WAY.includes(p.status)).map((p) => p.place),
  ]);
  if (!takes) return taken.size === 0 ? { is: "post" } : { is: "none" };
  const next = POST_PLACES.find((place) => takes[place] && !taken.has(place));
  if (!next) return { is: "none" };
  return taken.size === 0 ? { is: "post" } : { is: "post_to", place: next };
}

/** The post that waits for its time, where one does: what the foot says goes up when, with its Don't post. */
export function pieceTimedOf(posts: readonly PostDto[], nowMs: number): PostDto | null {
  return posts.find((p) => postWaitsForItsTime(p, nowMs)) ?? null;
}

/** Where a piece stands at one place. */
export type PieceStandsAt =
  | { is: "none" }
  | { is: "going" }
  | { is: "timed"; at: string }
  | { is: "up"; at: string | null }
  | { is: "stuck"; why: string | null };

/** Where a piece stands at one place, from the newest post there. */
export function pieceStandsAt(posts: readonly PostDto[], place: PostPlace, nowMs: number): PieceStandsAt {
  const post = newestAtEachPlace(posts).find((p) => p.place === place);
  if (!post) return { is: "none" };
  if (post.status === "published") return { is: "up", at: post.published_at };
  if (post.status === "held" || post.status === "failed") return { is: "stuck", why: postStoppedWhyOf(post) };
  if (POST_ON_ITS_WAY.includes(post.status))
    return postWaitsForItsTime(post, nowMs) ? { is: "timed", at: post.scheduled_for } : { is: "going" };
  return { is: "none" };
}

/** Where a piece stands among the made pieces the page holds, and who is before and after it. Null where it is not among them. */
export function pieceBesideOf(
  pieces: readonly Pick<ContentMadeDto, "file">[],
  id: string,
): { at: number; of: number; before: string | null; after: string | null } | null {
  const i = pieces.findIndex((m) => m.file.id === id);
  if (i < 0) return null;
  return {
    at: i + 1,
    of: pieces.length,
    before: pieces[i - 1]?.file.id ?? null,
    after: pieces[i + 1]?.file.id ?? null,
  };
}

/** How many pieces after the open one are asked for before they are shown. */
const AHEAD = 2;

/** Which pieces to ask for now, after the open one. Pure: what was asked for already is handed in. */
export function piecesToReadAhead(
  pieces: readonly Pick<ContentMadeDto, "file">[],
  openId: string,
  already: ReadonlySet<string>,
): string[] {
  const at = pieces.findIndex((m) => m.file.id === openId);
  if (at < 0) return [];
  return pieces
    .slice(at + 1, at + 1 + AHEAD)
    .map((m) => m.file.id)
    .filter((id) => !already.has(id));
}
