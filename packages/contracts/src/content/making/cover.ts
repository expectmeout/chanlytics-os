/**
 * A video's cover (the content loop PRD's 11): the frame a place shows before it plays, and the still the app shows for it.
 * It is taken from the best moment of the clips the video shows: a moment the look named for its clip (best first) or a
 * moment kept with its score (`file_moments`, pass 3), where it falls inside the stretch a block shows, clear of the cut
 * at either end. Where no moment does, the first picture's own middle stands in.
 *
 * Pure: the job works it out from the timeline it compiled, and the machine draws that frame as a still beside the video.
 */
import { recordOrNull } from "../../shared/unknown";
import { PIECE_FRAME } from "../piece-frame";

/** A moment of a clip, in its own seconds, with how good it is (0 to 1) where that was kept; null where only its order was. */
export interface ClipMoment {
  at: number;
  score: number | null;
}

/** The cover: the second of the video it is, and where it came from. */
export interface PieceCover {
  at: number;
  from: "moment" | "first";
}

/** How far a cover stands from a cut: a frame in a cut's first or last moment is caught mid-movement. */
const CLEAR_OF_CUT_S = 0.3;

/** A moment's worth: its kept score, else its place in its look's best-first list. */
const worthOf = (moment: ClipMoment, index: number, count: number): number =>
  moment.score ?? 1 - index / Math.max(1, count);

const round = (s: number): number => Math.round(s * 100) / 100;

/** A stretch of the video a cover may not stand in: a spoken caption's frames. */
interface Spoken {
  from: number;
  frames: number;
}

/**
 * The second nearest `at` inside [least, most] with no spoken caption on: a cover shows the picture and its opening words,
 * never half a sentence. `at` itself where it is clear, or where nothing in the stretch is.
 */
function clearOfWords(at: number, least: number, most: number, spoken: readonly Spoken[]): number {
  const on = (s: number): boolean => {
    const frame = Math.round(s * PIECE_FRAME.fps);
    return spoken.some((c) => frame >= c.from && frame < c.from + c.frames);
  };
  if (!on(at)) return at;
  const step = 1 / PIECE_FRAME.fps;
  for (let d = step; at - d >= least || at + d <= most; d += step) {
    if (at - d >= least && !on(at - d)) return at - d;
    if (at + d <= most && !on(at + d)) return at + d;
  }
  return at;
}

/**
 * The cover of a timeline's video: `moments` are each clip's, by the clip's id. The best moment inside a clip block wins,
 * the earlier of two equal ones, moved to the nearest frame of its stretch where no spoken caption is on.
 */
export function pieceCoverOf(
  timeline: {
    blocks: readonly { is: string; frames: number; source?: string; trim?: number }[];
    captions: readonly Spoken[];
  },
  moments: ReadonlyMap<string, readonly ClipMoment[]>,
): PieceCover {
  let best: { at: number; worth: number; least: number; most: number } | null = null;
  let first = 0;
  for (const block of timeline.blocks) {
    const startS = first / PIECE_FRAME.fps;
    first += block.frames;
    if (block.is !== "clip" || block.source === undefined || block.trim === undefined) continue;
    const seconds = block.frames / PIECE_FRAME.fps;
    const own = moments.get(block.source) ?? [];
    for (const [index, moment] of own.entries()) {
      const into = moment.at - block.trim;
      if (into < CLEAR_OF_CUT_S || into > seconds - CLEAR_OF_CUT_S) continue;
      const worth = worthOf(moment, index, own.length);
      if (!best || worth > best.worth)
        best = { at: startS + into, worth, least: startS + CLEAR_OF_CUT_S, most: startS + seconds - CLEAR_OF_CUT_S };
    }
  }
  if (best) return { at: round(clearOfWords(best.at, best.least, best.most, timeline.captions)), from: "moment" };
  const opening = timeline.blocks[0]?.frames ?? PIECE_FRAME.fps;
  return { at: round(opening / PIECE_FRAME.fps / 2), from: "first" };
}

/** The moments a clip's look named (`files.look.moments`, best first, files/look.ts), as a cover reads them: no score, an order. */
export function clipMomentsOf(look: unknown): ClipMoment[] {
  const moments = recordOrNull(look)?.moments;
  if (!Array.isArray(moments)) return [];
  return moments.flatMap((m) => {
    const at = recordOrNull(m)?.at;
    return typeof at === "number" && Number.isFinite(at) && at >= 0 ? [{ at, score: null }] : [];
  });
}
