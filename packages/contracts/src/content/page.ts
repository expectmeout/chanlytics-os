/**
 * Campaigns › Content, what its page is handed and what it says: everything Ask made for the business (a post from a photo,
 * a video from its clips) and where each piece stands, read from the records that exist (00613 `pieces`, `files` made here,
 * 00611 `posts`). Pure, with nothing behind it. Every sentence the page says comes from here.
 *
 * A piece can be up on Google and held on Instagram at once: each place keeps its own state, and the tile says the one
 * thing that matters most (the content canvas, "Every state a piece can be in"): what needs the owner, then what is
 * working, then what is done.
 */
import type { FileKind } from "../files/kinds";
import type { FileDto } from "../files/views";
import type { PieceFail, PieceStage } from "./piece-making";
import { pieceWordsIn } from "./piece-words";
import type { PieceLanguage } from "./pieces";
import { POST_ON_ITS_WAY, type PostDto, type PostPlace } from "./posts";

/** How many made pieces a page holds, and the most one read answers (a page that has scrolled reads what it holds again). */
export const CONTENT_PAGE = 24;
export const CONTENT_MAX = 96;
/** The most videos being made, or not made, the page names: a workspace makes three at a time (PIECES_MAKING_MAX). */
export const CONTENT_MAKING_MAX = 12;
/** How many days a video that could not be made stays on the page. */
export const CONTENT_FAILED_DAYS = 7;

/** A video asked for that is no file yet: being made, or not made. */
export interface ContentMakingDto {
  id: string;
  status: "making" | "failed";
  stage: PieceStage;
  failed_why: PieceFail | null;
  /** The words it opens on, a line each, as its plan was pressed. */
  lines: string[];
  language: PieceLanguage;
  /** How many moments it cuts together. */
  moments: number;
  created_at: string;
}

/** One made piece: its file, and its posts at every place, newest first. */
export interface ContentMadeDto {
  file: FileDto;
  posts: PostDto[];
}

/** How the whole stands, whichever page of it a read holds. */
export interface ContentTally {
  /** Everything made here that is still in Files. */
  made: number;
  /** Posts that are up, at any place. */
  posted: number;
}

/**
 * GET content: what is being made (on the first page only), a page of what was made, newest first, and the tally.
 * `next` asks for the page after this; null at the last.
 */
export interface ContentPageDto {
  making: ContentMakingDto[];
  made: ContentMadeDto[];
  next: string | null;
  tally: ContentTally;
}

/** Where a made piece stands, as its tile says it. */
export type ContentMark =
  | { is: "ready" }
  | { is: "going"; place: PostPlace }
  | { is: "posted"; places: PostPlace[] }
  /** Held before its send, or refused: the file's own sheet says why. */
  | { is: "stuck"; place: PostPlace };

/** The newest post at each place: the list comes newest first. */
function newestAtEachPlace(posts: readonly PostDto[]): PostDto[] {
  const seen = new Set<PostPlace>();
  const newest: PostDto[] = [];
  for (const post of posts) {
    if (seen.has(post.place)) continue;
    seen.add(post.place);
    newest.push(post);
  }
  return newest;
}

/** Where a made piece stands, from its posts: what needs the owner first, then what is working, then what is done. */
export function contentMarkOf(posts: readonly PostDto[]): ContentMark {
  const newest = newestAtEachPlace(posts);
  const stuck = newest.find((p) => p.status === "held" || p.status === "failed");
  if (stuck) return { is: "stuck", place: stuck.place };
  const going = newest.find((p) => POST_ON_ITS_WAY.includes(p.status));
  if (going) return { is: "going", place: going.place };
  const up = newest.filter((p) => p.status === "published");
  return up.length > 0 ? { is: "posted", places: up.map((p) => p.place) } : { is: "ready" };
}

const PLACE = { instagram: "Instagram", google: "Google" } as const satisfies Record<PostPlace, string>;

/** Every word the Content page says. */
export const CONTENT_WORDS = {
  tab: "Content",
  /** What a video with no opening words is called. */
  video: "Video",
  ask: "Make something",
  addClips: "Add clips",
  makingTitle: "Being made",
  more: "Show more",
  /** The next page of what was made could not be read: what is on screen stands. */
  moreFailed: "Couldn't read more just now. Try again.",
  /** What a read that failed could not read: "Couldn't read your content". */
  failedWhat: "your content",
  empty: {
    title: "Nothing made yet",
    body: "Ask makes posts from your photos and videos from your clips. Everything it makes shows here.",
    ask: "Ask for one",
    files: "Open Files",
  },
  mark: {
    ready: "Ready",
    readyToPost: "Ready to post",
    going: (place: PostPlace) => `On its way to ${PLACE[place]}`,
    posted: (places: readonly PostPlace[]) => `On ${places.map((p) => PLACE[p]).join(" and ")}`,
    stuck: "Not posted. Open it to see why.",
  },
} as const;

/** A mark in the owner's words. A video is ready and no more: a reel has no road to Instagram from here yet (decision 0121). */
export function contentMarkSaid(mark: ContentMark, kind: FileKind): string {
  if (mark.is === "going") return CONTENT_WORDS.mark.going(mark.place);
  if (mark.is === "posted") return CONTENT_WORDS.mark.posted(mark.places);
  if (mark.is === "stuck") return CONTENT_WORDS.mark.stuck;
  return kind === "video" ? CONTENT_WORDS.mark.ready : CONTENT_WORDS.mark.readyToPost;
}

/** What heads the made pieces, in one line: how many are made, and how many are out. */
export function contentHeadOf(tally: ContentTally): string {
  if (tally.made === 0) return CONTENT_WORDS.empty.title;
  const count = tally.made === 1 ? "1 piece made" : `${tally.made} pieces made`;
  return `${count} · ${tally.posted === 0 ? "none posted yet" : `${tally.posted} posted`}`;
}

/** A video asked for, as its tile says it: its opening words, where it is at, and why where it was not made. */
export function contentMakingSaid(making: ContentMakingDto): { title: string; state: string; failed: string | null } {
  const says = pieceWordsIn(making.language);
  const title = making.lines.join(" ").trim() || CONTENT_WORDS.video;
  if (making.status === "failed")
    return { title, state: says.follows.failedMark, failed: says.failed[making.failed_why ?? "unknown"] };
  return { title, state: says.follows.stage[making.stage](making.moments), failed: null };
}

/**
 * Whether the page should be read again on its own: a video still being made, or a post still on its way. Neither is told
 * to a page by the feed (00611, 00613), so the page asks while one moves and stops when none does.
 */
export function contentMoving(page: ContentPageDto): boolean {
  return page.making.some((m) => m.status === "making") || page.made.some((m) => contentMarkOf(m.posts).is === "going");
}
