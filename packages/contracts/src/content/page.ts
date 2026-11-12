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
import type { ContentView } from "./address";
import type { PieceFail, PieceStage } from "./piece-making";
import { pieceWordsIn } from "./piece-words";
import type { PieceLanguage } from "./pieces";
import { POST_ON_ITS_WAY, POST_PLACE_SAID, type PostDto, type PostPlace } from "./posts";

/** How many made pieces a page holds, and the most one read answers (a page that has scrolled reads what it holds again). */
export const CONTENT_PAGE = 24;
export const CONTENT_MAX = 96;
/** The most videos being made, or not made, the page names: a workspace makes three at a time (PIECES_MAKING_MAX). */
export const CONTENT_MAKING_MAX = 12;
/** How many days a video that could not be made stays on the page. */
export const CONTENT_FAILED_DAYS = 7;
/** How many lines a view of posts holds a page, and the most stopped posts Needs you looks through. */
export const CONTENT_LINES_PAGE = 24;
export const CONTENT_STOPPED_MAX = 48;

/** A video asked for that is no file yet: being made, or not made. */
export interface ContentMakingDto {
  id: string;
  status: "making" | "failed";
  stage: PieceStage;
  failed_why: PieceFail | null;
  /** The words it opens on, a line each, as its plan was pressed: its opening words, or its first card's. */
  lines: string[];
  language: PieceLanguage;
  /** How many blocks it puts together. */
  moments: number;
  /** The first picture it shows (a clip's file or a photo), dim on its tile while it is made; null where the plan names none. */
  first_picture: string | null;
  created_at: string;
}

/** One made piece: its file, and its posts at every place, newest first. */
export interface ContentMadeDto {
  file: FileDto;
  posts: PostDto[];
}

/** One post at one place, with the piece it is of: a line of Needs you, Scheduled or Posted. */
export interface ContentLineDto {
  post: PostDto;
  file: FileDto;
}

/** How the whole stands, whichever page of it a read holds. */
export interface ContentTally {
  /** Everything made here that is still in Files. */
  made: number;
  /** Posts that are up, at any place. */
  posted: number;
  /** Posts that stopped and are still the newest at their place, and videos that could not be made. */
  needs: number;
  /** Videos being made now. */
  making: number;
  /** Posts that wait for their time. */
  scheduled: number;
}

/**
 * GET content, for one view of Made: what is being made (on the first page of All, and in Being made and Needs you), a page
 * of what was made (All), or a page of lines (Needs you, Scheduled, Posted), and the tally of every view. `next` asks for the
 * page after this; null at the last.
 */
export interface ContentPageDto {
  /** The view this answers. */
  view: ContentView;
  making: ContentMakingDto[];
  made: ContentMadeDto[];
  lines: ContentLineDto[];
  next: string | null;
  tally: ContentTally;
}

/** How many a view holds, from the tally: what the views' control says beside each. */
export function contentViewCountOf(tally: ContentTally, view: ContentView): number {
  if (view === "all") return tally.made;
  if (view === "posted") return tally.posted;
  return tally[view];
}

/** Which views draw lines (when, where, what to do), and which draw tiles (the piece, to look at). */
export const contentViewDrawsLines = (view: ContentView): boolean =>
  view === "needs" || view === "scheduled" || view === "posted";

/** Where a made piece stands, as its tile says it. */
export type ContentMark =
  | { is: "ready" }
  | { is: "going"; place: PostPlace }
  | { is: "posted"; places: PostPlace[] }
  /** Held before its send, or refused: the file's own sheet says why. */
  | { is: "stuck"; place: PostPlace };

/** The newest post at each place: the list comes newest first. */
export function newestAtEachPlace(posts: readonly PostDto[]): PostDto[] {
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

/** Every word the Content page says. */
export const CONTENT_WORDS = {
  tab: "Content",
  /** What a video with no opening words is called. */
  video: "Video",
  ask: "Make something",
  /** The head's door to the Library: clips where the workspace takes videos, photos where it does not. */
  addClips: "Add clips",
  addPhotos: "Add photos",
  makingTitle: "Being made",
  more: "Show more",
  /** The next page of what was made could not be read: what is on screen stands. */
  moreFailed: "Couldn't read more just now. Try again.",
  /** What a read that failed could not read: "Couldn't read your content". */
  failedWhat: "your content",
  empty: {
    title: "Nothing made yet",
    body: "Ask makes posts from your photos and videos from your clips. Everything it makes shows here.",
    /** Where the workspace takes no videos (features.video_preview): Ask makes no video there, so it says none. */
    bodyPhotos: "Ask makes posts from your photos. Everything it makes shows here.",
    ask: "Ask for one",
    files: "Open Library",
  },
  mark: {
    ready: "Ready",
    readyToPost: "Ready to post",
    going: (place: PostPlace) => `On its way to ${POST_PLACE_SAID[place]}`,
    posted: (places: readonly PostPlace[]) => `On ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")}`,
    stuck: "Not posted. Open it to see why.",
  },
  /** An open piece: its step, where it stands at a place, and its acts. */
  piece: {
    step: {
      post: "Post",
      postTo: (place: PostPlace) => `Post to ${POST_PLACE_SAID[place]}`,
      again: "Try again",
      keep: "Keep it",
      make: "Make a post",
      save: "Save video",
      dontPost: "Don't post",
      /** A post that waits for its time: "Instagram story goes up tomorrow 9:00 PM". */
      timed: (post: string, when: string) => `${post} goes up ${when}`,
    },
    stands: {
      none: "Not yet",
      going: "Posting",
      timed: (when: string) => when,
      up: (when: string | null) => (when ? `Posted ${when}` : "Posted"),
      stuck: "Didn't post",
    },
    place: POST_PLACE_SAID,
    of: (at: number, of: number) => `${at} of ${of}`,
    before: "The one before",
    after: "The next one",
    save: "Save",
    ask: "Ask about it",
    more: "More",
    changeIt: "Change it",
    rename: "Rename",
    videoNote: "Instagram can't take a video from here yet.",
    makePost: "Make a post from it",
    video: (clock: string) => `Video · ${clock}`,
    picture: "Picture post",
    photo: "Photo",
    clip: (clock: string) => `Clip · ${clock}`,
    gone: "That piece isn't here any more.",
  },
  /** A made video's words, made again (campaigns/content/video-again.tsx): More › Change it on a video Ask made. */
  again: {
    says: "A new video is made from the same moments, with these words. This one stays.",
    line: (n: number) => `Line ${n}`,
    endLine: "End card",
    language: "Language",
    languages: { en: "English", es: "Español" },
    make: "Make it again",
    cancel: "Cancel",
    needsLine: "It opens on a line: write one.",
    making: "Making it again. It's in Made in about a minute.",
  },
  /** Content's two lists, as the control at the list's top says them. */
  lists: { made: "Made", library: "Library", label: "Show what" },
  /** Made's views, as the control beside Made says them, and what each says when it holds nothing. */
  views: {
    name: { all: "All", needs: "Needs you", making: "Being made", scheduled: "Scheduled", posted: "Posted" },
    label: "Show",
    empty: {
      all: "Nothing made yet.",
      needs: "Nothing needs you.",
      making: "Nothing is being made.",
      scheduled: "Nothing is waiting for its time.",
      posted: "Nothing is posted yet.",
    },
    thisWeek: "This week",
    earlier: "Earlier",
    open: "Open",
    grid: "Grid",
    list: "List",
    columns: { piece: "Piece", stands: "Where it stands" },
    count: (n: number) => (n === 1 ? "1 piece, newest first" : `${n} pieces, newest first`),
  },
  /** The composer: one post, to every place switched on. */
  post: {
    title: "Post it",
    asWhat: "On Instagram, as",
    words: "Words",
    wordsNote: "Written from the post. Change them as you like.",
    when: "When",
    now: "Now",
    evening: "This evening",
    morning: "Tomorrow morning",
    send: (places: readonly PostPlace[]) => `Post to ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")}`,
    cancel: "Not now",
    nowhere: "Choose where it goes.",
    wordsNeeded: "Write the words that go with it.",
    tooLongForGoogle: "Google takes 1,500 characters at most. Shorten the words, or turn Google off.",
    sent: (places: readonly PostPlace[]) => `On its way to ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")}.`,
    /** Set for its time, at every place it went to (00616): `at` is the time as the page's clock says it. */
    set: (places: readonly PostPlace[], at: string) =>
      `Set for ${at} on ${places.map((p) => POST_PLACE_SAID[p]).join(" and ")}.`,
    oneFailed: (place: PostPlace, reason: string) => `${POST_PLACE_SAID[place]}: ${reason}`,
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
