/**
 * Why a watched folder's file waits (the footage sources plan: "Each budget has a line when it binds"). The code on an
 * item's row (`source_items.why`) is one of these words; the owner's sentence for it is the screens' (contracts
 * files/footage.ts), never written here, so a log line carries the word and the count alone (the review of 20 Nov,
 * finding 9).
 */
import type { SourceItemWhy } from "@chanlytics/contracts";

/** Why an item is back to waiting: those of the closed set (contracts SOURCE_ITEM_WHYS) a take itself puts one back for. */
export type TakeWait = Extract<
  SourceItemWhy,
  "budget" | "room" | "library_full" | "videos_off" | "busy" | "stream_full" | "folder" | "pace" | "deadline" | "retry"
>;
