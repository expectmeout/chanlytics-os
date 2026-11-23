/**
 * The spoken words burned in (the content loop PRD's 11, pass 4): what a clip's people say, from its heard words
 * (`files.sound.words.cues`, the transcriber's timed stretches), as short lines timed to the words, over the stretch of the
 * clip a block shows. Most people watch a reel with the sound off, and a clip is drawn without its sound until the sound
 * engine lands, so the words are what carries it.
 *
 * Pure: the plan's checker works out every caption (its lines, its frames, where it sits) and the template draws them.
 * A word's time inside its cue is not heard, so it is shared out by its length: close enough for a line to come and go
 * with the words it holds.
 */
import { PIECE_FRAME, pieceFaceHolds, pieceLineWidthOf, type PieceFace } from "../piece-frame";

/** A stretch of speech as the clip's words keep it: from and to, in seconds of the clip, and what was said. */
export interface PieceCue {
  start: number;
  end: number;
  text: string;
}

/** One caption as it is drawn: its lines, the frame of the video it comes on at, how long it stays, and its foot. */
export interface PieceCaption {
  lines: string[];
  from: number;
  frames: number;
  /** How far its backing's foot stands from the frame's foot, in pixels. */
  bottom: number;
}

/** How long a caption may stay, and the least it stays: a line read in a glance, and never a flicker. */
const CAPTION_MOST_S = 2.2;
const CAPTION_LEAST_S = 0.6;
/** A pause this long between two words ends a caption: what follows is the next thought. */
const PAUSE_S = 0.6;
/** A word that ends a sentence ends its caption. */
const CAPTION_SENTENCE_END = /[.!?…]["”’)]*$/u;

/** A word with the seconds it is said in, shared out of its cue by length. */
interface TimedWord {
  text: string;
  start: number;
  end: number;
}

function timedWordsOf(cue: PieceCue): TimedWord[] {
  const words = cue.text.trim().split(/\s+/u).filter(Boolean);
  const total = words.reduce((n, w) => n + Array.from(w).length + 1, 0);
  const span = Math.max(0, cue.end - cue.start);
  let at = cue.start;
  return words.map((text) => {
    const share = total > 0 ? ((Array.from(text).length + 1) / total) * span : 0;
    const word = { text, start: at, end: at + share };
    at += share;
    return word;
  });
}

/** The words said inside a stretch: each whose middle falls in it, from cues the face can draw whole. */
function wordsInside(cues: readonly PieceCue[], from: number, to: number, face: PieceFace): TimedWord[] {
  return cues
    .filter((cue) => cue.end > from && cue.start < to && pieceFaceHolds(cue.text.replace(/\s+/gu, " ").trim(), face))
    .flatMap(timedWordsOf)
    .filter((w) => {
      const middle = (w.start + w.end) / 2;
      return middle >= from && middle < to;
    });
}

/** Whether a word still fits the caption's last line, or a new line is left to start. */
function fitsOn(lines: readonly string[], word: string, face: PieceFace): boolean {
  const last = lines.at(-1);
  if (last === undefined) return true;
  const longer = `${last} ${word}`;
  if (pieceLineWidthOf(longer, PIECE_FRAME.captionSize, face) <= PIECE_FRAME.wordsWidth) return true;
  return lines.length < PIECE_FRAME.captionLines;
}

/** The words grouped into captions: a line or two each, ended by a full line, a sentence's end, a pause, or its most time. */
function captionGroupsOf(words: readonly TimedWord[], face: PieceFace): TimedWord[][] {
  const groups: TimedWord[][] = [];
  let group: TimedWord[] = [];
  let lines: string[] = [];
  for (const word of words) {
    const first = group[0];
    const last = group.at(-1);
    const ends =
      first !== undefined &&
      last !== undefined &&
      (CAPTION_SENTENCE_END.test(last.text) ||
        word.start - last.end > PAUSE_S ||
        word.end - first.start > CAPTION_MOST_S ||
        !fitsOn(lines, word.text, face));
    if (ends) {
      groups.push(group);
      group = [];
    }
    group.push(word);
    lines = captionLinesOf(
      group.map((w) => w.text),
      face,
    );
  }
  if (group.length) groups.push(group);
  return groups;
}

const captionWidthOf = (line: string, face: PieceFace): number => pieceLineWidthOf(line, PIECE_FRAME.captionSize, face);

/** Words laid into lines at the caption's size, each inside the words' width, as many to a line as fit. */
function filledLinesOf(words: readonly string[], face: PieceFace): string[] {
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    const longer = last === undefined ? word : `${last} ${word}`;
    if (last !== undefined && captionWidthOf(longer, face) > PIECE_FRAME.wordsWidth) lines.push(word);
    else if (last === undefined) lines.push(word);
    else lines[lines.length - 1] = longer;
  }
  return lines;
}

/**
 * Words laid into lines: where they take two, broken where the two come out nearest one width, so a caption never ends
 * on one word under a full line ("…crack the / fitting." reads as "Any tighter and / you crack the fitting.").
 */
function captionLinesOf(words: readonly string[], face: PieceFace): string[] {
  const filled = filledLinesOf(words, face);
  if (filled.length !== 2) return filled;
  let best = filled;
  let widest = Math.max(...filled.map((l) => captionWidthOf(l, face)));
  for (let cut = 1; cut < words.length; cut++) {
    const pair = [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
    const wider = Math.max(...pair.map((l) => captionWidthOf(l, face)));
    if (wider < widest) {
      best = pair;
      widest = wider;
    }
  }
  return best;
}

/** Where a caption's foot stands: above what a phone app draws at the foot, and above a block's own caption where it has one. */
function captionBottomOf(labelled: boolean): number {
  const label = labelled
    ? Math.round(PIECE_FRAME.labelSize * PIECE_FRAME.wordsLeading + 2 * PIECE_FRAME.labelPad) + PIECE_FRAME.captionGap
    : 0;
  return PIECE_FRAME.clearBottom + label + PIECE_FRAME.captionLift;
}

/**
 * The captions of one clip block: the words said in its stretch (`from` for `seconds`, in the clip's own time), timed into
 * the video from the block's first frame. None where nothing was heard in it.
 */
export function stretchCaptionsOf(
  cues: readonly PieceCue[],
  stretch: { from: number; seconds: number; firstFrame: number; labelled: boolean },
  face: PieceFace,
): PieceCaption[] {
  const to = stretch.from + stretch.seconds;
  const groups = captionGroupsOf(wordsInside(cues, stretch.from, to, face), face);
  const frameAt = (s: number): number =>
    stretch.firstFrame + Math.round((Math.min(Math.max(s, stretch.from), to) - stretch.from) * PIECE_FRAME.fps);
  const bottom = captionBottomOf(stretch.labelled);
  return groups.map((group, index) => {
    const start = group[0]?.start ?? stretch.from;
    const spokenTo = group.at(-1)?.end ?? start;
    // It stays its least, never past the next caption or the stretch's end.
    const next = groups[index + 1]?.[0]?.start ?? to;
    const end = Math.min(Math.max(spokenTo, start + CAPTION_LEAST_S), next, to);
    const from = frameAt(start);
    return {
      lines: captionLinesOf(
        group.map((w) => w.text),
        face,
      ),
      from,
      frames: Math.max(1, frameAt(end) - from),
      bottom,
    };
  });
}
