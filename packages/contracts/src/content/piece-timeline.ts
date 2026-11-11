/**
 * A video's plan checked, and made into what the template draws (the video maker). Pure, with nothing behind it: Ask's
 * tool runs it before a card is made, the press runs it again, and the job that makes the video runs it once more from the rows as
 * they then stand, so a clip removed or a stretch past its end is refused wherever it is found and nothing is spent on it.
 *
 * Everything the template draws is worked out here: each block's frames (a clip's place in its clip, a card's size, a quote's
 * lines, a pair's two names), where the opening words sit and how large, how long they stay, the end card's lines. The template
 * draws its props, and the storyboard Ask looks at before a card is made draws the words' box from the same numbers, so the
 * three never disagree. Whether the words may be said at all (a price, a promise, a character the face can't draw) is the
 * dashboard's, where it is known who said what.
 */
import { PIECE_FRAME, pieceCardSizeOf, pieceQuoteLinesOf, pieceWordsBoxOf } from "./piece-frame";
import { pieceWordsIn } from "./piece-words";
import {
  PIECE_LIMITS,
  type PieceBlock,
  type PieceLanguage,
  type PiecePlan,
  type PieceShot,
  type PieceWont,
  type PieceWordsHold,
} from "./pieces";

/** What is read of a file to check a plan against it. A file not in the list is not the business's, or is gone. */
export interface PieceSource {
  id: string;
  /** `video` for a clip, `image` for a photo. */
  kind: string;
  status: string;
  source: string;
  media_status: string | null;
  /** A clip's length: the row's where a card is made, the playback copy's own where the video is. Null for a photo. */
  seconds: number | null;
  /** Someone recognizable is in it and no one has said they agreed (contracts whoStandsOf: `ask`). */
  people_unasked: boolean;
}

/** The business's own, as the end card and the words wear it. */
export interface PieceLook {
  accent: string | null;
  /** Whether it has a mark to draw: the job fetches it beside the blocks' files, and the name stands in where there is none. */
  logo: boolean;
  name: string;
  book: string | null;
  address: string | null;
}

/** A picture a block shows still, as it is drawn: the file, and the second of a clip it is (null for a photo). */
export interface PieceShotDrawn {
  source: string;
  at: number | null;
}

/** One block as the template draws it: every number worked out. A clip's `trim` is where in its clip it starts, in seconds. */
export type PieceBlockDrawn =
  | { is: "clip"; source: string; trim: number; frames: number; label: string | null }
  | { is: "photo"; source: string; frames: number; label: string | null }
  | { is: "pair"; before: PieceShotDrawn; after: PieceShotDrawn; frames: number; labels: [string, string] }
  | { is: "words"; lines: string[]; size: number; frames: number }
  | { is: "quote"; lines: string[]; size: number; from: string | null; over: PieceShotDrawn | null; frames: number };

/** What the template draws: every number worked out, nothing left for it to decide. */
export interface PieceTimeline {
  width: number;
  height: number;
  fps: number;
  /** The whole video's frames: the blocks', and the end card's less the fade they share. */
  frames: number;
  /** Each block in play order. */
  blocks: PieceBlockDrawn[];
  /** The opening words. `frames` is how long they stay, null for the whole reel; they are never drawn over a card. */
  words: { lines: string[]; top: number; size: number; frames: number | null };
  end: {
    line: string | null;
    under: string | null;
    logo: boolean;
    name: string;
    book: string | null;
    address: string | null;
  };
  accent: string;
}

/** A plan refused: why, and the block it is about (counted from one, as a person counts) where it is about one. */
export type PieceRefused = { ok: false; wont: PieceWont; cut?: number };
export type PieceCompiled = { ok: true; timeline: PieceTimeline } | PieceRefused;

/** What a block is checked against: the files as they stand, whether those in them agreed, and the plan's language. */
interface Checking {
  sources: readonly PieceSource[];
  agreed: boolean;
  language: PieceLanguage;
}
/** A block that passed, as it is drawn and how long it plays; or why it did not. */
type Passed = { block: PieceBlockDrawn; seconds: number } | PieceWont;

const hundredth = (n: number): number => Math.round(n * 100) / 100;
const frameCountOf = (seconds: number): number => Math.round(seconds * PIECE_FRAME.fps);
const inRange = (seconds: number, min: number, max: number): boolean => seconds >= min && seconds <= max;
const sourceNamed = (checking: Checking, id: string): PieceSource | undefined =>
  checking.sources.find((s) => s.id === id);

/** Why a clip can't be cut from, or null. */
function clipWont(source: PieceSource | undefined, agreed: boolean): PieceWont | null {
  if (!source) return "file";
  if (source.kind !== "video") return "not_video";
  if (source.source === "made") return "made";
  if (source.status !== "filed") return "unkept";
  if (source.media_status !== "ready" || !(Number(source.seconds) > 0)) return "not_ready";
  if (source.people_unasked && !agreed) return "people";
  return null;
}

/** Why a photo can't be shown, or null. */
function photoWont(source: PieceSource | undefined, agreed: boolean): PieceWont | null {
  if (!source) return "file";
  if (source.kind !== "image") return "not_photo";
  if (source.source === "made") return "made";
  if (source.status !== "filed") return "unkept";
  if (source.people_unasked && !agreed) return "people";
  return null;
}

/** One stretch's seconds inside its clip, trimmed at the clip's end where it runs a fraction past it, or why it can't be. */
function stretchOf(
  cut: { from: number; to: number },
  clipSeconds: number,
): { from: number; seconds: number } | PieceWont {
  if (!(cut.from >= 0) || !(cut.to > cut.from)) return "stretch";
  if (hundredth(cut.to - clipSeconds) > PIECE_LIMITS.overrunS) return "past_end";
  const seconds = hundredth(Math.min(cut.to, clipSeconds) - cut.from);
  if (!inRange(seconds, PIECE_LIMITS.cutMinS, PIECE_LIMITS.cutMaxS)) return "block_length";
  return { from: hundredth(cut.from), seconds };
}

/** A still picture as it is drawn: a photo, or a moment inside a ready clip; or why it can't be. */
function shotDrawn(shot: PieceShot, checking: Checking): PieceShotDrawn | PieceWont {
  const source = sourceNamed(checking, shot.file_id);
  if (shot.at === null) return photoWont(source, checking.agreed) ?? { source: shot.file_id, at: null };
  const wont = clipWont(source, checking.agreed);
  if (wont || !source) return wont ?? "file";
  return shot.at < Number(source.seconds) ? { source: source.id, at: hundredth(shot.at) } : "past_end";
}

const labelFits = (label: string | null): boolean => label === null || Array.from(label).length <= PIECE_LIMITS.label;

function clipPassed(block: Extract<PieceBlock, { is: "clip" }>, checking: Checking): Passed {
  const source = sourceNamed(checking, block.file_id);
  const wont = clipWont(source, checking.agreed);
  if (wont || !source) return wont ?? "file";
  const stretch = stretchOf(block, Number(source.seconds));
  if (typeof stretch === "string") return stretch;
  if (!labelFits(block.label)) return "label";
  return {
    block: {
      is: "clip",
      source: source.id,
      trim: stretch.from,
      frames: frameCountOf(stretch.seconds),
      label: block.label,
    },
    seconds: stretch.seconds,
  };
}

function photoPassed(block: Extract<PieceBlock, { is: "photo" }>, checking: Checking): Passed {
  const wont = photoWont(sourceNamed(checking, block.file_id), checking.agreed);
  if (wont) return wont;
  if (!inRange(block.seconds, PIECE_LIMITS.photoMinS, PIECE_LIMITS.photoMaxS)) return "block_length";
  if (!labelFits(block.label)) return "label";
  return {
    block: { is: "photo", source: block.file_id, frames: frameCountOf(block.seconds), label: block.label },
    seconds: block.seconds,
  };
}

function pairPassed(block: Extract<PieceBlock, { is: "pair" }>, checking: Checking): Passed {
  const before = shotDrawn(block.before, checking);
  if (typeof before === "string") return before;
  const after = shotDrawn(block.after, checking);
  if (typeof after === "string") return after;
  if (!inRange(block.seconds, PIECE_LIMITS.pairMinS, PIECE_LIMITS.pairMaxS)) return "block_length";
  const [first, second] = pieceWordsIn(checking.language).pair;
  return {
    block: { is: "pair", before, after, frames: frameCountOf(block.seconds), labels: [first, second] },
    seconds: block.seconds,
  };
}

function cardPassed(block: Extract<PieceBlock, { is: "words" }>): Passed {
  const lines = block.lines.map((l) => l.trim());
  const fits =
    lines.length >= 1 &&
    lines.length <= PIECE_LIMITS.cardLines &&
    lines.every((l) => l !== "" && Array.from(l).length <= PIECE_LIMITS.cardLine);
  if (!fits) return "card";
  if (!inRange(block.seconds, PIECE_LIMITS.cardMinS, PIECE_LIMITS.cardMaxS)) return "block_length";
  return {
    block: { is: "words", lines, size: pieceCardSizeOf(lines), frames: frameCountOf(block.seconds) },
    seconds: block.seconds,
  };
}

function quotePassed(block: Extract<PieceBlock, { is: "quote" }>, checking: Checking): Passed {
  const text = block.text.trim();
  const fromFits = block.from === null || Array.from(block.from).length <= PIECE_LIMITS.quoteFrom;
  const wrapped = Array.from(text).length <= PIECE_LIMITS.quote && fromFits ? pieceQuoteLinesOf(text) : null;
  if (!wrapped) return "quote";
  const over = block.over ? shotDrawn(block.over, checking) : null;
  if (typeof over === "string") return over;
  if (!inRange(block.seconds, PIECE_LIMITS.quoteMinS, PIECE_LIMITS.quoteMaxS)) return "block_length";
  return {
    block: {
      is: "quote",
      lines: wrapped.lines,
      size: wrapped.size,
      from: block.from,
      over,
      frames: frameCountOf(block.seconds),
    },
    seconds: block.seconds,
  };
}

/** One block checked by its own kind's rules. */
function blockPassed(block: PieceBlock, checking: Checking): Passed {
  switch (block.is) {
    case "clip":
      return clipPassed(block, checking);
    case "photo":
      return photoPassed(block, checking);
    case "pair":
      return pairPassed(block, checking);
    case "words":
      return cardPassed(block);
    case "quote":
      return quotePassed(block, checking);
  }
}

const linesFit = (lines: readonly string[]): boolean =>
  lines.length >= 1 &&
  lines.length <= PIECE_LIMITS.lines &&
  lines.every((l) => l.trim() !== "" && Array.from(l.trim()).length <= PIECE_LIMITS.line);

/** Whether a block is a picture the opening words may sit over: a card carries its own words. */
const isPicture = (block: { is: string } | undefined): boolean =>
  block !== undefined && block.is !== "words" && block.is !== "quote";

/** The opening words against what the video opens on: over a picture they are a line or two; on a card there are none. */
function openingWont(plan: PiecePlan): PieceRefused | null {
  const onPicture = isPicture(plan.blocks[0]);
  if (plan.lines.length === 0) return onPicture ? { ok: false, wont: "lines" } : null;
  if (!linesFit(plan.lines)) return { ok: false, wont: "lines" };
  return onPicture ? null : { ok: false, wont: "opens_on_card", cut: 1 };
}

/** The end card's own line: its first part large, the rest under it. */
function endLinesOf(line: string | null): { line: string | null; under: string | null } {
  const [first, ...rest] = (line ?? "").split(" · ").map((part) => part.trim());
  return { line: first || null, under: rest.filter(Boolean).join(" · ") || null };
}

const framesHeld = (hold: PieceWordsHold, firstBlock: number): number | null =>
  hold === "all" ? null : Math.max(firstBlock, PIECE_FRAME.wordsFramesMin);

/** The plan as the template draws it, or why it can't be made. `sources` are the files the plan names, as they now stand. */
export function compilePiece(plan: PiecePlan, sources: readonly PieceSource[], look: PieceLook): PieceCompiled {
  if (plan.blocks.length < PIECE_LIMITS.blocksMin || plan.blocks.length > PIECE_LIMITS.blocksMax)
    return { ok: false, wont: "blocks" };
  const opening = openingWont(plan);
  if (opening) return opening;
  const checking: Checking = { sources, agreed: plan.people_agreed, language: plan.language };
  const blocks: PieceBlockDrawn[] = [];
  let reel = 0;
  for (const [i, block] of plan.blocks.entries()) {
    const passed = blockPassed(block, checking);
    if (typeof passed === "string") return { ok: false, wont: passed, cut: i + 1 };
    reel += passed.seconds;
    blocks.push(passed.block);
  }
  if (!inRange(hundredth(reel), PIECE_LIMITS.reelMinS, PIECE_LIMITS.reelMaxS)) return { ok: false, wont: "length" };
  const lines = plan.lines.map((l) => l.trim());
  const box = pieceWordsBoxOf(lines, plan.words_at);
  const reelFrames = blocks.reduce((n, b) => n + b.frames, 0);
  return {
    ok: true,
    timeline: {
      width: PIECE_FRAME.width,
      height: PIECE_FRAME.height,
      fps: PIECE_FRAME.fps,
      frames: reelFrames + PIECE_FRAME.end - PIECE_FRAME.fade,
      blocks,
      words: { lines, top: box.top, size: box.size, frames: framesHeld(plan.words_hold, blocks[0]?.frames ?? 0) },
      end: {
        ...endLinesOf(plan.end_line),
        logo: look.logo,
        name: look.name,
        book: look.book,
        address: look.address,
      },
      accent: look.accent ?? PIECE_FRAME.paper,
    },
  };
}

/**
 * Which blocks open under the opening words: every picture where the words stay, else each picture that begins before they
 * leave. A first picture under two seconds leaves them on the second (they stay their fewest frames,
 * PIECE_FRAME.wordsFramesMin), and a storyboard that drew them on the first alone would hide what they cover there. A card
 * carries its own words, so the opening words are never on one.
 */
export function pieceWordsOnBlocks(timeline: {
  blocks: readonly { is: string; frames: number }[];
  words: { frames: number | null };
}): boolean[] {
  let from = 0;
  return timeline.blocks.map((block) => {
    const on = isPicture(block) && (timeline.words.frames === null || from < timeline.words.frames);
    from += block.frames;
    return on;
  });
}

/**
 * What the machine that draws a video is handed: the timeline, the names each block's files were fetched under beside the
 * template (a block's own, in its own order: a clip's stretch, a photo, a pair's two pictures, a quote's ground; none for a
 * words card), and the business's mark where it has one. The template reads these and nothing else. A type and not an
 * interface: the renderer takes a composition's props as a record, which an interface is not.
 */
export type PieceMaterial = {
  timeline: PieceTimeline;
  files: string[][];
  logo: string | null;
};
