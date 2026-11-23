/**
 * Today's Content card (the content canvas, PhDoors "today"; stage 3 drew one line in its place): read by its own small read,
 * GET content/note (dashboard readers/content.ts contentNote), since the page's own is too much to ask each time Today opens.
 */
import type { FileDto } from "../files/views";
import type { ContentLineDto, ContentMadeDto, ContentMakingDto } from "./page";
import { POST_PLACE_SAID, type PostPlace } from "./posts";
import { TAKE_DOWN_UNCONFIRMED_MS, takeDownUnconfirmedSaid } from "./placements/take-down-late";

/**
 * A take-down Today names (the canvas's Today 2 and 5): a post still up that its place left to the owner to delete
 * (`by_hand`), or one its place has not answered about in a day (`unconfirmed`, nothing for the owner to do).
 */
export interface ContentDownDto {
  is: "by_hand" | "unconfirmed";
  file: FileDto;
  place: PostPlace;
}

/** How many take-downs Today names: the newest few; the piece itself holds every line. */
export const CONTENT_TODAY_DOWN = 2;

/**
 * Where an open take-down stands for Today, from its action: the owner's to finish, late with no answer, or still being
 * asked, which Today does not name (null). A post its owner chose to leave up asks nothing of anyone (null).
 */
export function contentDownOf(
  action: { outcome: string; started_at: string },
  nowMs: number,
): ContentDownDto["is"] | null {
  if (action.outcome === "left_up") return null;
  if (action.outcome !== "pending") return "by_hand";
  return nowMs - Date.parse(action.started_at) > TAKE_DOWN_UNCONFIRMED_MS ? "unconfirmed" : null;
}

/**
 * Today's Content card (the content canvas, PhDoors "today"): this week's pieces at their own shape, what is being made,
 * how many of the week's are ready to post, and the newest post that did not go out, with its file; nothing in it is a page of
 * Content's.
 */
export interface ContentTodayDto {
  /** Made in the last seven days, newest first, a few (CONTENT_TODAY_PIECES): each with its posts. */
  week: ContentMadeDto[];
  /** Videos being made now, but one whose file has arrived: that is a piece of the week's. */
  making: ContentMakingDto[];
  /**
   * Of every piece made in the last seven days, not only the few shown, those with no post yet: ready to post. Null where
   * the week holds more pieces than the read looks through (a page of Content's): a count it could not finish is not said.
   */
  ready: number | null;
  /** The newest post that did not go out and is still the newest at its place, with its file; none where none. */
  stopped: ContentLineDto | null;
  /**
   * The take-downs still open that Today names, the owner's to finish first (CONTENT_TODAY_DOWN at most). Absent from
   * an answer a build before pass 1b gave, which names none: the two apps deploy in either order.
   */
  down?: ContentDownDto[];
  /**
   * The week's points (00706; the PRD's 12.5), where the workspace plans its weeks: the week ready to approve, with its
   * size and days, and what AI asks to be filmed. Each opens the Week. Absent from an older build's answer, and null
   * where nothing of the week waits on the owner.
   */
  plan?: { ready: { size: string; days: string } | null; film: string[] } | null;
  /**
   * A post set to go that waits for a new version's approval (00708; the version board, cell 5): the soonest, with its
   * piece's file (the version that asks) and that version's number. Absent from an older build's answer; null where none.
   */
  version?: { file: FileDto; n: number; at: string } | null;
}

/** How many of the week's pieces Today's card shows. */
export const CONTENT_TODAY_PIECES = 6;

/** The card's words. */
export const CONTENT_TODAY_WORDS = {
  title: "Content",
  /** "2 ready to post": the week's pieces with no post yet. */
  ready: (n: number) => `${n} ready to post`,
  all: "All",
  /** A post that stopped opens straight to its sheet, where it is posted again: the piece's own word for it. */
  postAgain: "Post again",
  /** "Didn't post to Instagram. Instagram was busy." */
  didntPost: (place: PostPlace, reason: string | null) =>
    `Didn't post to ${POST_PLACE_SAID[place]}.${reason ? ` ${reason}` : ""}`,
  /** A take-down under a piece's name: the owner's to finish there, or a place that has not answered in a day. */
  down: (down: Pick<ContentDownDto, "is" | "place">) =>
    down.is === "by_hand"
      ? `Delete it in ${POST_PLACE_SAID[down.place]} · Chanlytics couldn't`
      : takeDownUnconfirmedSaid(down.place),
  /** "Approve version 2 · goes up Tue, 6:00 PM": a post set to go waits for a new version's approval. */
  versionWaits: (n: number, at: string) => `Approve version ${n} · goes up ${at}`,
} as const;
