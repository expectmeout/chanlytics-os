/**
 * The frame a made video is drawn in, and where its opening words sit in it (the video maker, first slice). Drawing's own numbers
 * and nothing else, so the three that draw from them never disagree: the plan's checker (piece-timeline.ts), the storyboard Ask
 * looks at before a card is made, and the template the video is drawn by (tooling/video), which imports this module as it stands.
 * A change here changes what is drawn, so it is a new edition of the template (piece-making.ts PIECE_TEMPLATE, held by its test).
 */
import {
  PIECE_FACE_ADVANCES,
  PIECE_FACE_WIDEST,
  PIECE_SERIF_ADVANCES,
  PIECE_SERIF_WIDEST,
} from "./piece-face.generated";
import type { PieceWordsPlace } from "./pieces";

/**
 * The faces a video's words may be set in (the brand kit's, config KIT_FACES): Mona Sans at its heaviest, or Source Serif 4's
 * italic at 600. Both are the posts' own files, copied beside the template's bundle.
 */
export type PieceFace = "sans" | "serif";

/**
 * The frame every video is drawn in, and what is fixed of it. `clearTop` and `clearBottom` are what a phone app draws over a reel
 * (its top bar; its caption and buttons): the words stay between them.
 */
export const PIECE_FRAME = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** The end card's frames, and the frames it fades in over the reel's last. */
  end: 66,
  fade: 8,
  /** The end card's ground, and what its lines are set in where the business's colour would not read on it. */
  ink: "#0e0e0e",
  paper: "#ffffff",
  clearTop: 220,
  clearBottom: 450,
  wordsSizeMax: 96,
  wordsWidth: 872,
  /** Where high words start, and where low words end. */
  wordsHighTop: 330,
  wordsLowBottom: 1380,
  /** The words' backing: its padding above and below and at each side, the gap between lines, a line's height as a share of its size. */
  wordsPad: 26,
  wordsPadSide: 44,
  wordsGap: 10,
  wordsLeading: 1.08,
  /** The fewest frames the words stay when they leave with the first cut: two seconds. */
  wordsFramesMin: 60,
  /**
   * A block's own caption: one line on the words' backing, at the foot of its picture and clear of what a phone app draws
   * there. Its size, its backing's padding above and at each side, and how far a pair's upper one stands off the rule.
   */
  labelSize: 46,
  labelPad: 14,
  labelPadSide: 24,
  labelLift: 28,
  /** A before-and-after pair: one picture over the other, this much of the paper between them. */
  pairRule: 6,
  /** How far down a photo is held where it is cropped to fill: a little above its middle, where a person's face and hair are. */
  heldAt: 0.38,
  /**
   * The spoken words burned in (pass 4): a line or two on the words' backing, centred, this far above what a phone app draws
   * at the foot (and above a block's own caption where it has one), at this size, each line inside the words' width.
   */
  captionSize: 58,
  captionLines: 2,
  captionPad: 14,
  captionPadSide: 26,
  captionGap: 6,
  captionLift: 36,
} as const;

/** Where the opening words' backing starts at its widest, from the frame's left: a caption starts there too. */
export const PIECE_SIDE = (PIECE_FRAME.width - PIECE_FRAME.wordsWidth) / 2 - PIECE_FRAME.wordsPadSide;

/** Where the words' backing sits and how large its lines are, in the frame's pixels. */
export interface PieceWordsBox {
  top: number;
  height: number;
  size: number;
}

const FACE_TABLES: Readonly<Record<PieceFace, { advances: Readonly<Record<string, number>>; widest: number }>> = {
  sans: { advances: PIECE_FACE_ADVANCES, widest: PIECE_FACE_WIDEST },
  serif: { advances: PIECE_SERIF_ADVANCES, widest: PIECE_SERIF_WIDEST },
};

/** How wide a line is at a size, in a face: its characters' own widths, from the font (piece-face.generated.ts). */
export function pieceLineWidthOf(line: string, size: number, face: PieceFace): number {
  const { advances, widest } = FACE_TABLES[face];
  const thousandths = Array.from(line).reduce((sum, ch) => sum + (advances[ch] ?? widest), 0);
  return (thousandths * size) / 1000;
}

/** Whether a face's table holds every character of a line: a word it does not hold would be drawn in no face at all. */
export function pieceFaceHolds(line: string, face: PieceFace): boolean {
  const { advances } = FACE_TABLES[face];
  return Array.from(line).every((ch) => advances[ch] !== undefined);
}

/** The words' box: a line never wraps, so the size comes down until the widest fits; high words grow down, low words up. */
export function pieceWordsBoxOf(lines: readonly string[], place: PieceWordsPlace, face: PieceFace): PieceWordsBox {
  const widest = Math.max(1, ...lines.map((l) => pieceLineWidthOf(l, 1, face)));
  const size = Math.min(PIECE_FRAME.wordsSizeMax, Math.floor(PIECE_FRAME.wordsWidth / widest));
  const height = Math.round(
    2 * PIECE_FRAME.wordsPad +
      lines.length * size * PIECE_FRAME.wordsLeading +
      Math.max(0, lines.length - 1) * PIECE_FRAME.wordsGap,
  );
  return { top: place === "low" ? PIECE_FRAME.wordsLowBottom - height : PIECE_FRAME.wordsHighTop, height, size };
}

/**
 * A card's own numbers: a words card's largest size, the sizes a quote is tried at (largest first), the most lines it takes,
 * how far above the frame's middle a card's words are centred (what a phone app draws at the foot is taller than at the
 * head), how dark a quote's picture goes under it, and the size of who said it.
 */
export const PIECE_CARD = {
  sizeMax: 120,
  quoteSizes: [72, 60, 52],
  quoteLinesMax: 7,
  lift: 80,
  dim: 0.65,
  fromSize: 44,
} as const;

/** A words card's size: its widest line fits the words' width, never larger than a card's most. A line never wraps. */
export function pieceCardSizeOf(lines: readonly string[], face: PieceFace): number {
  const widest = Math.max(1, ...lines.map((l) => pieceLineWidthOf(l, 1, face)));
  return Math.min(PIECE_CARD.sizeMax, Math.floor(PIECE_FRAME.wordsWidth / widest));
}

/** A quote's words wrapped to a width at one size: a word goes on the next line where it no longer fits this one. */
function wrappedAt(words: readonly string[], size: number, width: number, face: PieceFace): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const longer = line ? `${line} ${word}` : word;
    if (line && pieceLineWidthOf(longer, size, face) > width) {
      lines.push(line);
      line = word;
    } else line = longer;
  }
  return line ? [...lines, line] : lines;
}

/**
 * The same count of lines at the narrowest width that still holds them, found by halving: the lines come out near one
 * length, so a quote never ends on one word under full lines.
 */
function evened(words: readonly string[], size: number, lines: string[], face: PieceFace): string[] {
  let narrow = Math.max(...words.map((w) => pieceLineWidthOf(w, size, face)));
  let wide: number = PIECE_FRAME.wordsWidth;
  let kept = lines;
  while (wide - narrow > 1) {
    const width = (narrow + wide) / 2;
    const tried = wrappedAt(words, size, width, face);
    if (tried.length <= lines.length) {
      kept = tried;
      wide = width;
    } else narrow = width;
  }
  return kept;
}

/**
 * A quote wrapped by its words at the largest size that keeps it to a card's lines, each inside the frame's width and the
 * lines near one length; null where no size does (too long, or one word wider than the frame), or where it says nothing.
 */
export function pieceQuoteLinesOf(text: string, face: PieceFace): { lines: string[]; size: number } | null {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return null;
  for (const size of PIECE_CARD.quoteSizes) {
    const lines = wrappedAt(words, size, PIECE_FRAME.wordsWidth, face);
    const fits = lines.every((l) => pieceLineWidthOf(l, size, face) <= PIECE_FRAME.wordsWidth);
    if (fits && lines.length <= PIECE_CARD.quoteLinesMax) return { lines: evened(words, size, lines, face), size };
  }
  return null;
}
