/**
 * Where a place draws over a standing video (the content loop PRD's 11: "safe areas for the place's buttons"): its top bar,
 * and at its foot the caption, the buttons and the reply box. A video's words must stay clear of them in every place it
 * goes, so the plan's checker holds each word box it drew (the opening words, a block's caption, the spoken words) inside
 * the strictest of them.
 *
 * In pixels of the 1080x1920 frame every video is drawn in. Instagram's are the bands the template has always kept
 * (PIECE_FRAME.clearTop and clearBottom); no right-hand rail is held yet, since none has been measured on a phone (the
 * PRD's 15.4 walk measures it). A place a video cannot go to (Google takes a picture alone) holds nothing.
 */
import type { PieceCaption } from "./captions";
import { PIECE_FRAME } from "../piece-frame";
import type { PostKind, PostPlace } from "../posts";

/** What a place draws over the frame, from each edge. */
export interface SafeArea {
  top: number;
  bottom: number;
}

export const PLACE_SAFE_AREAS: Readonly<Record<PostPlace, Partial<Record<PostKind, SafeArea>>>> = {
  instagram: {
    reel: { top: PIECE_FRAME.clearTop, bottom: PIECE_FRAME.clearBottom },
    story: { top: PIECE_FRAME.clearTop, bottom: PIECE_FRAME.clearBottom },
  },
  google: {},
  // A Page's reel: held to the same bands until a phone's walk measures Facebook's own.
  facebook: { reel: { top: PIECE_FRAME.clearTop, bottom: PIECE_FRAME.clearBottom } },
};

/** A word box as drawn: what it is, and its top and foot in the frame. */
export interface WordBox {
  is: "words" | "label" | "caption";
  top: number;
  bottom: number;
}

const lineHeightOf = (size: number): number => size * PIECE_FRAME.wordsLeading;

/** A caption's box: its lines and backing, standing on its foot. */
function captionBoxOf(caption: PieceCaption): WordBox {
  const height =
    2 * PIECE_FRAME.captionPad +
    caption.lines.length * lineHeightOf(PIECE_FRAME.captionSize) +
    Math.max(0, caption.lines.length - 1) * PIECE_FRAME.captionGap;
  const foot = PIECE_FRAME.height - caption.bottom;
  return { is: "caption", top: Math.round(foot - height), bottom: Math.round(foot) };
}

/** The word boxes a timeline draws over a picture: the opening words, each block's own caption, each spoken caption. */
export function wordBoxesOf(timeline: {
  words: { lines: readonly string[]; top: number; size: number };
  blocks: readonly { is: string; label?: string | null }[];
  captions: readonly PieceCaption[];
}): WordBox[] {
  const boxes: WordBox[] = [];
  if (timeline.words.lines.length > 0) {
    const n = timeline.words.lines.length;
    const height =
      2 * PIECE_FRAME.wordsPad + n * lineHeightOf(timeline.words.size) + Math.max(0, n - 1) * PIECE_FRAME.wordsGap;
    boxes.push({ is: "words", top: timeline.words.top, bottom: Math.round(timeline.words.top + height) });
  }
  if (timeline.blocks.some((b) => b.label)) {
    const foot = PIECE_FRAME.height - PIECE_FRAME.clearBottom;
    const height = lineHeightOf(PIECE_FRAME.labelSize) + 2 * PIECE_FRAME.labelPad;
    boxes.push({ is: "label", top: Math.round(foot - height), bottom: foot });
  }
  return [...boxes, ...timeline.captions.map(captionBoxOf)];
}

/** The first word box a place draws over, or null where every one is clear of it. */
export function unsafeBoxOf(boxes: readonly WordBox[], area: SafeArea | undefined): WordBox | null {
  if (!area) return null;
  return boxes.find((b) => b.top < area.top || b.bottom > PIECE_FRAME.height - area.bottom) ?? null;
}
