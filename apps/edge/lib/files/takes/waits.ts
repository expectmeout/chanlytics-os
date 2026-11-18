/**
 * Why a watched folder's file waits, and what its folder's line says of it (the footage sources plan: "Each budget has
 * a line when it binds"). The code on an item's row (`source_items.why`) is one of these words; the sentence is the
 * owner's, and says what is happening and that it goes on by itself. It never says "Delete one" about a file the
 * owner did not add.
 */
import { FILES_MAX, FILE_VIDEO_MINUTES_MAX, type SourceItemWhy } from "@chanlytics/contracts";

/** Why an item is back to waiting: those of the closed set (contracts SOURCE_ITEM_WHYS) a take itself puts one back for. */
export type TakeWait = Extract<
  SourceItemWhy,
  "budget" | "room" | "library_full" | "videos_off" | "busy" | "length" | "folder" | "pace" | "deadline" | "retry"
>;

/** How many files, in the words a person counts them by: clips where only videos wait, else photos and videos. */
const waitingWordsOf = (count: number, videosOnly: boolean): string => {
  const many = count.toLocaleString("en-US");
  if (videosOnly) return count === 1 ? "1 clip waits" : `${many} clips wait`;
  return count === 1 ? "1 file waits" : `${many} photos and videos wait`;
};

/**
 * What the folder's line says when files wait for something only time or the owner changes; null for a wait that
 * ends by itself within the hour, which needs no line.
 */
export function takeWaitLine(waiting: { why: TakeWait; count: number; videosOnly: boolean }): string | null {
  if (waiting.count <= 0) return null;
  const counted = waitingWordsOf(waiting.count, waiting.videosOnly);
  if (waiting.why === "budget") return `${counted} for tomorrow.`;
  if (waiting.why === "room")
    return `Your videos are full: ${FILE_VIDEO_MINUTES_MAX} minutes at most. ${counted} until there is room.`;
  if (waiting.why === "library_full")
    return `Your Library is full: ${FILES_MAX.toLocaleString("en-US")} files at most. ${counted} until there is room.`;
  return null;
}
