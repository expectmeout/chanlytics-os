/**
 * A video's plan checked, and made into what the template draws (the video maker, first slice). Pure, with nothing behind it: Ask's
 * tool runs it before a card is made, the press runs it again, and the job that makes the video runs it once more from the rows as
 * they then stand, so a clip removed or a stretch past its end is refused wherever it is found and nothing is spent on it.
 *
 * Everything the template draws is worked out here: each cut's place in its clip and its frames, where the words sit and how large,
 * how long they stay, the end card's lines. The template draws its props, and the storyboard Ask looks at before a card is made
 * draws the words' box from the same numbers, so the three never disagree. Whether the words may be said at all (a price, a
 * promise, a character the face can't draw) is the dashboard's, where it is known who said what.
 */
import { PIECE_FRAME, pieceWordsBoxOf } from "./piece-frame";
import { PIECE_LIMITS, type PiecePlan, type PieceWont, type PieceWordsHold } from "./pieces";

/** What is read of a clip to check a plan against it. A clip not in the list is not the business's, or is gone. */
export interface PieceSource {
  id: string;
  kind: string;
  status: string;
  source: string;
  media_status: string | null;
  /** The clip's length: the row's where a card is made, the playback copy's own where the video is. */
  seconds: number | null;
  /** Someone recognizable is in it and no one has said they agreed (contracts whoStandsOf: `ask`). */
  people_unasked: boolean;
}

/** The business's own, as the end card and the words wear it. */
export interface PieceLook {
  accent: string | null;
  /** Whether it has a mark to draw: the job fetches it beside the cuts, and the name stands in where there is none. */
  logo: boolean;
  name: string;
  book: string | null;
  address: string | null;
}

/** What the template draws: every number worked out, nothing left for it to decide. */
export interface PieceTimeline {
  width: number;
  height: number;
  fps: number;
  /** The whole video's frames: the cuts', and the end card's less the fade they share. */
  frames: number;
  /** Each cut in play order: the clip it is from, where in the clip it starts (seconds), and how long it plays (frames). */
  cuts: { source: string; trim: number; frames: number }[];
  /** `frames` is how long the words stay, null for the whole reel. */
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

/** A plan refused: why, and the cut it is about (counted from one, as a person counts) where it is about one. */
export type PieceRefused = { ok: false; wont: PieceWont; cut?: number };
export type PieceCompiled = { ok: true; timeline: PieceTimeline } | PieceRefused;

const hundredth = (n: number): number => Math.round(n * 100) / 100;

/** Why a clip can't be cut from, or null. */
function sourceWont(source: PieceSource | undefined, agreed: boolean): PieceWont | null {
  if (!source) return "file";
  if (source.kind !== "video") return "not_video";
  if (source.source === "made") return "made";
  if (source.status !== "filed") return "unkept";
  if (source.media_status !== "ready" || !(Number(source.seconds) > 0)) return "not_ready";
  if (source.people_unasked && !agreed) return "people";
  return null;
}

/** One cut's seconds inside its clip, trimmed at the clip's end where it runs a fraction past it, or why it can't be. */
function stretchOf(cut: PiecePlan["cuts"][number], clipSeconds: number): { from: number; seconds: number } | PieceWont {
  if (!(cut.from >= 0) || !(cut.to > cut.from)) return "stretch";
  if (hundredth(cut.to - clipSeconds) > PIECE_LIMITS.overrunS) return "past_end";
  const seconds = hundredth(Math.min(cut.to, clipSeconds) - cut.from);
  if (seconds < PIECE_LIMITS.cutMinS || seconds > PIECE_LIMITS.cutMaxS) return "cut_length";
  return { from: hundredth(cut.from), seconds };
}

const linesFit = (lines: readonly string[]): boolean =>
  lines.length >= 1 &&
  lines.length <= PIECE_LIMITS.lines &&
  lines.every((l) => l.trim() !== "" && Array.from(l.trim()).length <= PIECE_LIMITS.line);

/** The end card's own line: its first part large, the rest under it. */
function endLinesOf(line: string | null): { line: string | null; under: string | null } {
  const [first, ...rest] = (line ?? "").split(" · ").map((part) => part.trim());
  return { line: first || null, under: rest.filter(Boolean).join(" · ") || null };
}

const framesHeld = (hold: PieceWordsHold, firstCut: number): number | null =>
  hold === "all" ? null : Math.max(firstCut, PIECE_FRAME.wordsFramesMin);

/** The plan as the template draws it, or why it can't be made. `sources` are the clips the plan names, as they now stand. */
export function compilePiece(plan: PiecePlan, sources: readonly PieceSource[], look: PieceLook): PieceCompiled {
  if (!linesFit(plan.lines)) return { ok: false, wont: "lines" };
  if (plan.cuts.length < PIECE_LIMITS.cutsMin || plan.cuts.length > PIECE_LIMITS.cutsMax)
    return { ok: false, wont: "cuts" };
  const cuts: PieceTimeline["cuts"] = [];
  let reel = 0;
  for (const [i, cut] of plan.cuts.entries()) {
    const source = sources.find((s) => s.id === cut.file_id);
    const wont = sourceWont(source, plan.people_agreed);
    if (wont || !source) return { ok: false, wont: wont ?? "file", cut: i + 1 };
    const stretch = stretchOf(cut, Number(source.seconds));
    if (typeof stretch === "string") return { ok: false, wont: stretch, cut: i + 1 };
    reel += stretch.seconds;
    cuts.push({ source: source.id, trim: stretch.from, frames: Math.round(stretch.seconds * PIECE_FRAME.fps) });
  }
  if (hundredth(reel) < PIECE_LIMITS.reelMinS || hundredth(reel) > PIECE_LIMITS.reelMaxS)
    return { ok: false, wont: "length" };
  const lines = plan.lines.map((l) => l.trim());
  const box = pieceWordsBoxOf(lines, plan.words_at);
  const reelFrames = cuts.reduce((n, c) => n + c.frames, 0);
  return {
    ok: true,
    timeline: {
      width: PIECE_FRAME.width,
      height: PIECE_FRAME.height,
      fps: PIECE_FRAME.fps,
      frames: reelFrames + PIECE_FRAME.end - PIECE_FRAME.fade,
      cuts,
      words: { lines, top: box.top, size: box.size, frames: framesHeld(plan.words_hold, cuts[0]?.frames ?? 0) },
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
 * Which cuts open under the opening words: every one where the words stay, else each that begins before they leave. A first cut
 * under two seconds leaves them on the second (they stay their fewest frames, PIECE_FRAME.wordsFramesMin), and a storyboard
 * that drew them on the first alone would hide what they cover there.
 */
export function pieceWordsOnCuts(timeline: {
  cuts: readonly { frames: number }[];
  words: { frames: number | null };
}): boolean[] {
  let from = 0;
  return timeline.cuts.map((cut) => {
    const on = timeline.words.frames === null || from < timeline.words.frames;
    from += cut.frames;
    return on;
  });
}

/**
 * What the machine that draws a video is handed: the timeline, and the names its files were fetched under beside the template, a
 * cut each in play order, and the business's mark where it has one. The template reads these and nothing else. A type and not an
 * interface: the renderer takes a composition's props as a record, which an interface is not.
 */
export type PieceMaterial = {
  timeline: PieceTimeline;
  cuts: string[];
  logo: string | null;
};
