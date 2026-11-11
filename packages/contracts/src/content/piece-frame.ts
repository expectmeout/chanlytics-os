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
} as const;

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
