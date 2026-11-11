/**
 * A video made from a business's own clips, by code (the video maker, first slice): what is asked for, in what a card reads, with
 * nothing behind it to ride into a page. One shape for now, "Hook first": the result on the first frame under a line or two of
 * words, then how it got there, then a card with the business's name. What a plan must pass before anything is spent, and what the
 * template draws from it, are piece-timeline.ts's.
 */
import { nonBlankOrNull, recordOrNull } from "../shared/unknown";

/** The shapes a video is made in. */
export const PIECE_SHAPES = ["hook_cut"] as const;
export type PieceShape = (typeof PIECE_SHAPES)[number];

/**
 * What the shape holds, and how much its words may say and still be read on a phone in two seconds. A stretch may be named a
 * fraction past its clip's end (a length read to the tenth is not its last frame's): up to `overrunS` it is trimmed, past it refused.
 */
export const PIECE_LIMITS = {
  cutsMin: 2,
  cutsMax: 5,
  cutMinS: 1.5,
  cutMaxS: 4,
  reelMinS: 8,
  reelMaxS: 15,
  lines: 2,
  line: 18,
  endLine: 40,
  overrunS: 0.3,
} as const;

/** Where the opening words sit: over a head, or under a face and over the phone app's own caption. */
export const PIECE_WORDS_PLACES = ["high", "low"] as const;
export type PieceWordsPlace = (typeof PIECE_WORDS_PLACES)[number];

/** How long they stay: for the first cut, or for the whole reel where no cut puts a face under them. */
export const PIECE_WORDS_HOLDS = ["first", "all"] as const;
export type PieceWordsHold = (typeof PIECE_WORDS_HOLDS)[number];

/** The two languages a video is worded in. */
export type PieceLanguage = "en" | "es";

/** One cut: a stretch of one of the business's clips, in seconds from the clip's start. */
export interface PieceCut {
  file_id: string;
  from: number;
  to: number;
}

/** What a video is asked to be: the same on the card, at its press and where it is made, so what they agreed to is what is drawn. */
export type PiecePlan = {
  shape: PieceShape;
  /** In the order they play. */
  cuts: PieceCut[];
  /** The opening words, a line each. */
  lines: string[];
  words_at: PieceWordsPlace;
  words_hold: PieceWordsHold;
  /** The end card's own line, over the business's name. */
  end_line: string | null;
  language: PieceLanguage;
  /** The owner said in this thread that the people in the clips agreed: their word, kept on each clip as the video is made. */
  people_agreed: boolean;
};

const secondOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

function cutOf(v: unknown): PieceCut | null {
  const fields = recordOrNull(v);
  if (!fields) return null;
  const fileId = nonBlankOrNull(fields.file_id);
  const from = secondOf(fields.from);
  const to = secondOf(fields.to);
  return fileId !== null && from !== null && to !== null ? { file_id: fileId, from, to } : null;
}

/** The plan a card carries, read back: a card's payload is JSON, and a page's reading of it is never a second shape. */
export function piecePlanOf(payload: Record<string, unknown>): PiecePlan {
  const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  return {
    shape: "hook_cut",
    cuts: listOf(payload.cuts)
      .map(cutOf)
      .filter((c): c is PieceCut => c !== null),
    lines: listOf(payload.lines).filter((l): l is string => typeof l === "string"),
    words_at: payload.words_at === "low" ? "low" : "high",
    words_hold: payload.words_hold === "all" ? "all" : "first",
    end_line: nonBlankOrNull(payload.end_line),
    language: payload.language === "es" ? "es" : "en",
    people_agreed: payload.people_agreed === true,
  };
}

/** Why a plan can't be made. Each is said to the model and to a person in their own words. */
export type PieceWont =
  | "cuts"
  | "file"
  | "not_video"
  | "made"
  | "unkept"
  | "not_ready"
  | "stretch"
  | "past_end"
  | "cut_length"
  | "length"
  | "people"
  | "lines";
