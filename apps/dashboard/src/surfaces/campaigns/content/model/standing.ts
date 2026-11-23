/**
 * Where a made piece stands, as its screens are handed it (piece-standing.tsx reads it once; the phone's viewer, the
 * desk's pane and the list of places draw from it): its lines, its one status, the act that leads, and the presses
 * its lines offer. A type alone, so the parts that draw it and the hook that reads it lean one way.
 */
import type { ReactNode } from "react";
import type { GoesPresses } from "../viewer/goes";
import type { GoesLine, goesPillOf } from "./goes";
import type { ViewerClock } from "./viewer-line";

export interface PieceStanding {
  lines: GoesLine[];
  /** The piece's one status from its lines; null where it has no placement yet, and its usual status says it. */
  pill: ReturnType<typeof goesPillOf>;
  /** The coral act a line that needs the owner leads with, in place of the piece's usual next step. */
  lead: { words: string; press: () => void } | null;
  /**
   * Whether the list opens to be read, with nothing switched on: a line needs the owner for something another post
   * would not mend. Look again and Try again are the ones a post does mend, and they arm its place as before.
   */
  opensToRead: boolean;
  /** A take-down is under way or waits for the owner: nothing leads with a new post meanwhile. */
  holdsLead: boolean;
  goes: GoesPresses;
  clock: ViewerClock & { zone: string };
  /** Take down, where something of it is up and this person may: opens its card. Null where it is not offered. */
  takeDown: (() => void) | null;
  /** The sheet a piece opens over itself: Take down's card. */
  sheets: ReactNode;
  /** What its results are read by (00696): the piece's file, and a post of it that went up, null before one did. */
  results: { fileId: string; upPostId: string | null };
}
