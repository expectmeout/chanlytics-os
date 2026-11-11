/**
 * The frame a made video is drawn in, and where its opening words sit in it (the video maker, first slice). Drawing's own numbers
 * and nothing else, so the three that draw from them never disagree: the plan's checker (piece-timeline.ts), the storyboard Ask
 * looks at before a card is made, and the template the video is drawn by (tooling/video), which imports this module as it stands.
 * A change here changes what is drawn, so it is a new edition of the template (piece-making.ts PIECE_TEMPLATE, held by its test).
 */
import { PIECE_FACE_ADVANCES, PIECE_FACE_WIDEST } from "./piece-face.generated";
import type { PieceWordsPlace } from "./pieces";

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
} as const;

/** Where the opening words' backing starts at its widest, from the frame's left: a caption starts there too. */
export const PIECE_SIDE = (PIECE_FRAME.width - PIECE_FRAME.wordsWidth) / 2 - PIECE_FRAME.wordsPadSide;

/** Where the words' backing sits and how large its lines are, in the frame's pixels. */
export interface PieceWordsBox {
  top: number;
  height: number;
  size: number;
}

/** How wide a line is at a size, in the template's face: its characters' own widths, from the font (piece-face.generated.ts). */
export function pieceLineWidthOf(line: string, size: number): number {
  const thousandths = Array.from(line).reduce((sum, ch) => sum + (PIECE_FACE_ADVANCES[ch] ?? PIECE_FACE_WIDEST), 0);
  return (thousandths * size) / 1000;
}

/** The words' box: a line never wraps, so the size comes down until the widest fits; high words grow down, low words up. */
export function pieceWordsBoxOf(lines: readonly string[], place: PieceWordsPlace): PieceWordsBox {
  const widest = Math.max(1, ...lines.map((l) => pieceLineWidthOf(l, 1)));
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
export function pieceCardSizeOf(lines: readonly string[]): number {
  const widest = Math.max(1, ...lines.map((l) => pieceLineWidthOf(l, 1)));
  return Math.min(PIECE_CARD.sizeMax, Math.floor(PIECE_FRAME.wordsWidth / widest));
}

/** A quote's words wrapped to a width at one size: a word goes on the next line where it no longer fits this one. */
function wrappedAt(words: readonly string[], size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const longer = line ? `${line} ${word}` : word;
    if (line && pieceLineWidthOf(longer, size) > width) {
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
function evened(words: readonly string[], size: number, lines: string[]): string[] {
  let narrow = Math.max(...words.map((w) => pieceLineWidthOf(w, size)));
  let wide: number = PIECE_FRAME.wordsWidth;
  let kept = lines;
  while (wide - narrow > 1) {
    const width = (narrow + wide) / 2;
    const tried = wrappedAt(words, size, width);
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
export function pieceQuoteLinesOf(text: string): { lines: string[]; size: number } | null {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return null;
  for (const size of PIECE_CARD.quoteSizes) {
    const lines = wrappedAt(words, size, PIECE_FRAME.wordsWidth);
    const fits = lines.every((l) => pieceLineWidthOf(l, size) <= PIECE_FRAME.wordsWidth);
    if (fits && lines.length <= PIECE_CARD.quoteLinesMax) return { lines: evened(words, size, lines), size };
  }
  return null;
}
