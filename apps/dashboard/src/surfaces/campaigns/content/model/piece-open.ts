/**
 * A made piece, opened (the content canvas, "Opening a piece"): its one next step, where it stands at each place, and who
 * stands beside it. Pure: the pane draws what these say.
 */
import {
  instagramKindsFor,
  leadOf,
  pieceStandingOf,
  placementIsOut,
  standingOnItsWay,
  POST_PLACES,
  POST_PULLABLE,
  postPhotoWont,
  postPlaceTakenOf,
  postWaitsForItsTime,
  videoIsSavedOnly,
  type ContentMadeDto,
  type FileDto,
  type InstagramPostKind,
  type PieceLead,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";

/** What can take the piece now, as its record says (GET files/[id]): Instagram that takes a post, Google connected. */
export type PieceTakes = Record<PostPlace, boolean>;

/**
 * The kinds Instagram can take of this piece now: each with none of its own on its way there, since a picture post and a
 * story wait apart (00620; contracts postPlaceTakenOf, the rule Ask's card keeps too).
 */
export const instagramKindsFree = (posts: readonly PostDto[], fileKind = "image"): InstagramPostKind[] =>
  instagramKindsFor(fileKind).filter((kind) => !postPlaceTakenOf(posts, "instagram", kind));

/** What Instagram is posted as: the kind wanted where it can go now, else the one that can. */
export const instagramAsOf = (free: readonly InstagramPostKind[], wanted: InstagramPostKind): InstagramPostKind =>
  free.includes(wanted) ? wanted : (free[0] ?? wanted);

/**
 * What can take the piece now, from its posts and what its record says of each place. Google takes a piece once, and none
 * while one is on its way there (contracts postPlaceTakenOf). Instagram takes one of each kind at a time, so it takes another
 * while either kind is free: the sheet draws a line for each post that waits there, with its own Don't post (model/places.ts),
 * and offers the kind that is free. A Page (pass 5) takes the same kinds the same way. Opening the sheet still arms nothing
 * where a post is on its way (postBothOpening).
 */
export function pieceTakesOf(
  posts: readonly PostDto[],
  can: { instagram: boolean; google: boolean; onGoogle: boolean; facebook?: boolean; fileKind?: string },
): PieceTakes {
  const free = (place: "instagram" | "facebook") =>
    instagramKindsFor(can.fileKind ?? "image").some((kind) => !postPlaceTakenOf(posts, place, kind));
  return {
    instagram: can.instagram && instagramKindsFree(posts, can.fileKind).length > 0,
    google: can.google && !can.onGoogle && !postPlaceTakenOf(posts, "google"),
    facebook: !!can.facebook && free("facebook"),
  };
}

/** The one act that leads. `pull` is the post Don't post would stop, while it still can be. */
export type PieceNext =
  | { is: "post" }
  | { is: "post_to"; place: PostPlace }
  | { is: "again"; place: PostPlace }
  | { is: "going"; place: PostPlace; pull: string | null }
  | { is: "save" }
  /** A post Ask made that was set aside: put back on Made before anything else is done with it. */
  | { is: "put_back" }
  /** A file of the library: kept, where it waits in the inbox; then what Ask makes from it. */
  | { is: "keep" }
  | { is: "make" }
  | { is: "none" };

/** What the one next step reads of a file. */
type PieceFile = Pick<FileDto, "kind" | "source" | "status" | "shows" | "media_status">;

/**
 * A library file's next step, as Files' sheet offered it: kept, where it waits in the inbox; a post made from it, where one can
 * be; else nothing leads. Who is in it is never asked (Ruben, 22 Nov 2026).
 */
function libraryNextOf(file: PieceFile): PieceNext {
  if (file.status === "inbox") return { is: "keep" };
  if (!postPhotoWont(file)) return { is: "make" };
  return { is: "none" };
}

/**
 * What needs the owner, then what is going up now, then the next place it can go, each read from the piece's one
 * standing (contracts pieceStandingOf), as its tile and its status are. A post that waits for its time leads with
 * nothing (pieceTimedOf says it, with its Don't post). Where nothing of it is up any more (its story ran its day, its
 * post came down), the step is to post it again; plain Post is for a piece that never went out. Before the record is
 * read it never guesses a place.
 */
export function pieceNextOf(
  file: PieceFile,
  posts: readonly PostDto[],
  takes: PieceTakes | null,
  nowMs: number,
): PieceNext {
  if (file.source !== "made") return libraryNextOf(file);
  // A video goes to Instagram as a reel (00681), where Instagram takes one now, or it has a post there already. With no
  // such road it is saved, and posted from the phone (contracts videoIsSavedOnly, the rule its tile reads too).
  if (videoIsSavedOnly(file, posts, !!takes?.instagram)) return { is: "save" };
  // Set aside is the owner's "not this one" (Ruben, 16 Nov 2026: it still led with Post): Put back leads, before a post of it
  // or one tried again. What waited went with it (server files/file.ts), and one that stopped needs nobody while it is aside.
  if (file.status === "set_aside") return { is: "put_back" };
  const { placements, lead } = pieceStandingOf(posts, null, nowMs);
  const stuck = placements.find((at) => at.standing.is === "stopped");
  if (stuck) return { is: "again", place: stuck.place };
  // One on its way at a place is the one there (00611 posts_one_on_its_way), whatever went up since it was asked for.
  const going = placements.find((at) => standingOnItsWay(at.standing) && at.standing.is !== "waiting");
  if (going)
    return { is: "going", place: going.place, pull: POST_PULLABLE.includes(going.post.status) ? going.post.id : null };
  // A place is taken where the piece is out, or where a post waits for its time there: a second would be refused. A
  // story that ran its day, or a post that came down, holds nothing: the place takes the piece again.
  const taken = new Set(
    placements.filter((at) => placementIsOut(at) || at.standing.is === "waiting").map((at) => at.place),
  );
  const beenOut = lead.is === "ended" || lead.is === "came_down";
  if (!takes) {
    if (taken.size > 0) return { is: "none" };
    return beenOut ? { is: "again", place: lead.at.place } : { is: "post" };
  }
  const next = POST_PLACES.find((place) => takes[place] && !taken.has(place));
  if (!next) return { is: "none" };
  if (taken.size > 0) return { is: "post_to", place: next };
  return beenOut ? { is: "again", place: next } : { is: "post" };
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
  | { is: "stuck"; why: string | null }
  /** Sent, and the place was never seen holding it. */
  | { is: "unsure" }
  /** No longer there: a story that ran its day, or a post that came down, and when. */
  | { is: "ended"; at: string | null }
  | { is: "down"; at: string | null };

/** What leads among a place's placements (contracts leadOf), as a place's row and cell say it. */
export function standsAtOf(lead: PieceLead): PieceStandsAt {
  if (lead.is === "never") return { is: "none" };
  if (lead.is === "stopped")
    return { is: "stuck", why: lead.at.standing.is === "stopped" ? lead.at.standing.why : null };
  if (lead.is === "unconfirmed") return { is: "unsure" };
  if (lead.is === "going_up") return { is: "going" };
  if (lead.is === "waiting") return { is: "timed", at: lead.when };
  if (lead.is === "up") return { is: "up", at: lead.when };
  return { is: lead.is === "ended" ? "ended" : "down", at: lead.when };
}

/**
 * Where a piece stands at one place: what leads among its placements there (an Instagram post, an Instagram story), by
 * the piece's one standing. A story that ran its day never hides the post that is still up beside it.
 */
export function pieceStandsAt(posts: readonly PostDto[], place: PostPlace, nowMs: number): PieceStandsAt {
  return standsAtOf(leadOf(pieceStandingOf(posts, null, nowMs).placements.filter((at) => at.place === place)));
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
