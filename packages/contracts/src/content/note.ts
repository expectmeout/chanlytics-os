/**
 * Today's Content card (the content canvas, PhDoors "today"; stage 3 drew one line in its place): read by its own small read,
 * GET content/note (dashboard readers/content.ts contentNote), since the page's own is too much to ask each time Today opens.
 */
import type { ContentLineDto, ContentMadeDto, ContentMakingDto } from "./page";
import { POST_PLACE_SAID, type PostPlace } from "./posts";

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
} as const;
