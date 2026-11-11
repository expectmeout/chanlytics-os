/**
 * A video made from a business's own clips and photos, by code (the video maker): what is asked for, in what a card reads, with
 * nothing behind it to ride into a page. A video is a sequence of blocks the plan arranges freely (a clip's moment, a photo, a
 * before-and-after pair, a words card, a quote card), under opening words where it opens on a picture, and before the end card
 * with the business's name. "Hook first", the one shape a video had, is a plan of clip blocks, and a payload kept in that shape
 * is read as one. What a plan must pass before anything is spent, and what the template draws from it, are piece-timeline.ts's.
 */
import { nonBlankOrNull, recordOrNull } from "../shared/unknown";

/**
 * The shapes a plan is kept in (00613 `pieces.shape`, held to the database's own set by shared/schema-sets.ts). `hook_cut` is the
 * one a row may hold today; it is read as blocks (piecePlanOf), and a row kept as blocks waits for the door that takes one.
 */
export const PIECE_SHAPES = ["hook_cut"] as const;
export type PieceShape = (typeof PIECE_SHAPES)[number];

/**
 * What a video holds, and how much its words may say and still be read on a phone in two seconds. A stretch may be named a
 * fraction past its clip's end (a length read to the tenth is not its last frame's): up to `overrunS` it is trimmed, past it refused.
 * The blocks together run `reelMinS` to `reelMaxS`: the made file must fit its folder (tooling/video/machine/make.mjs).
 */
export const PIECE_LIMITS = {
  blocksMin: 2,
  blocksMax: 6,
  /** A clip's moment. */
  cutMinS: 1.5,
  cutMaxS: 4,
  photoMinS: 1.5,
  photoMaxS: 3.5,
  pairMinS: 2,
  pairMaxS: 4,
  cardMinS: 1.2,
  cardMaxS: 3,
  quoteMinS: 2.5,
  quoteMaxS: 5,
  reelMinS: 8,
  reelMaxS: 15,
  /** The opening words. */
  lines: 2,
  line: 18,
  endLine: 40,
  /** A block's own caption, one line. */
  label: 22,
  /** A words card. */
  cardLines: 3,
  cardLine: 22,
  /** A quote's characters, and who said it. */
  quote: 140,
  quoteFrom: 28,
  overrunS: 0.3,
} as const;

/** Where the opening words sit: over a head, or under a face and over the phone app's own caption. */
export const PIECE_WORDS_PLACES = ["high", "low"] as const;
export type PieceWordsPlace = (typeof PIECE_WORDS_PLACES)[number];

/** How long they stay: for the first picture, or for the whole reel where no picture puts a face under them. */
export const PIECE_WORDS_HOLDS = ["first", "all"] as const;
export type PieceWordsHold = (typeof PIECE_WORDS_HOLDS)[number];

/** The two languages a video is worded in. */
export type PieceLanguage = "en" | "es";

/** A picture a block shows still: a kept photo (`at` null), or one moment of a clip, in seconds from its start. */
export interface PieceShot {
  file_id: string;
  at: number | null;
}

/** One block: what it shows and for how long. A clip's length is its stretch; every other block says its seconds. */
export type PieceBlock =
  | { is: "clip"; file_id: string; from: number; to: number; label: string | null }
  | { is: "photo"; file_id: string; seconds: number; label: string | null }
  | { is: "pair"; before: PieceShot; after: PieceShot; seconds: number }
  | { is: "words"; lines: string[]; seconds: number }
  | { is: "quote"; text: string; from: string | null; over: PieceShot | null; seconds: number };

/** The kinds of block a plan may hold. */
const PIECE_BLOCKS = ["clip", "photo", "pair", "words", "quote"] as const satisfies readonly PieceBlock["is"][];

/**
 * What a video is asked to be, as it is read: the same on the card, at its press and where it is made, so what they agreed to is
 * what is drawn. `shape` says how it reads, which is always in blocks, whatever shape its payload was kept in.
 */
export type PiecePlan = {
  shape: "blocks";
  /** In the order they play. The end card always follows. */
  blocks: PieceBlock[];
  /** The opening words, a line each, over the first picture. None where the video opens on a card. */
  lines: string[];
  words_at: PieceWordsPlace;
  words_hold: PieceWordsHold;
  /** The end card's own line, over the business's name. */
  end_line: string | null;
  language: PieceLanguage;
  /** The owner said in this thread that the people in the clips agreed: their word, kept on each file as the video is made. */
  people_agreed: boolean;
};

type Fields = Record<string, unknown>;

const secondOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const entriesOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const stringsOf = (v: unknown): string[] => entriesOf(v).filter((l): l is string => typeof l === "string");

function shotOf(v: unknown): PieceShot | null {
  const fields = recordOrNull(v);
  const fileId = nonBlankOrNull(fields?.file_id);
  return fileId === null ? null : { file_id: fileId, at: secondOf(fields?.at) };
}

function clipOf(fields: Fields): PieceBlock | null {
  const fileId = nonBlankOrNull(fields.file_id);
  const from = secondOf(fields.from);
  const to = secondOf(fields.to);
  return fileId !== null && from !== null && to !== null
    ? { is: "clip", file_id: fileId, from, to, label: nonBlankOrNull(fields.label) }
    : null;
}

function photoOf(fields: Fields): PieceBlock | null {
  const fileId = nonBlankOrNull(fields.file_id);
  const seconds = secondOf(fields.seconds);
  return fileId !== null && seconds !== null
    ? { is: "photo", file_id: fileId, seconds, label: nonBlankOrNull(fields.label) }
    : null;
}

function pairOf(fields: Fields): PieceBlock | null {
  const before = shotOf(fields.before);
  const after = shotOf(fields.after);
  const seconds = secondOf(fields.seconds);
  return before && after && seconds !== null ? { is: "pair", before, after, seconds } : null;
}

function wordsCardOf(fields: Fields): PieceBlock | null {
  const seconds = secondOf(fields.seconds);
  return seconds === null ? null : { is: "words", lines: stringsOf(fields.lines), seconds };
}

function quoteCardOf(fields: Fields): PieceBlock | null {
  const text = nonBlankOrNull(fields.text);
  const seconds = secondOf(fields.seconds);
  return text !== null && seconds !== null
    ? { is: "quote", text, from: nonBlankOrNull(fields.from), over: shotOf(fields.over), seconds }
    : null;
}

/** Each kind of block read back from a payload, field by field: one that does not read is left out, never guessed. */
const BLOCK_READERS: Readonly<Record<PieceBlock["is"], (fields: Fields) => PieceBlock | null>> = {
  clip: clipOf,
  photo: photoOf,
  pair: pairOf,
  words: wordsCardOf,
  quote: quoteCardOf,
};

function blockOf(v: unknown): PieceBlock | null {
  const fields = recordOrNull(v);
  const kind = PIECE_BLOCKS.find((k) => k === fields?.is);
  return fields && kind ? BLOCK_READERS[kind](fields) : null;
}

/** A payload's blocks: its own, or the cuts of one kept as "Hook first", each a clip block. */
function blocksOf(payload: Fields): PieceBlock[] {
  const read = Array.isArray(payload.blocks)
    ? payload.blocks.map(blockOf)
    : entriesOf(payload.cuts).map((cut) => clipOf(recordOrNull(cut) ?? {}));
  return read.filter((b): b is PieceBlock => b !== null);
}

/**
 * The plan a card or a row carries, read back: a payload is JSON, and a page's reading of it is never a second shape. One kept
 * as "Hook first" (`cuts`) reads as the same plan in blocks, so one checker and one template draw every video.
 */
export function piecePlanOf(payload: Record<string, unknown>): PiecePlan {
  return {
    shape: "blocks",
    blocks: blocksOf(payload),
    lines: stringsOf(payload.lines),
    words_at: payload.words_at === "low" ? "low" : "high",
    words_hold: payload.words_hold === "all" ? "all" : "first",
    end_line: nonBlankOrNull(payload.end_line),
    language: payload.language === "es" ? "es" : "en",
    people_agreed: payload.people_agreed === true,
  };
}

/** The pictures a block shows still, in its own order. */
function pieceShotsOf(block: PieceBlock): PieceShot[] {
  if (block.is === "pair") return [block.before, block.after];
  return block.is === "quote" && block.over ? [block.over] : [];
}

/** Every file a plan names, once each, in the order the plan first names it: the clips and photos its blocks show. */
export function pieceFileIdsOf(plan: Pick<PiecePlan, "blocks">): string[] {
  const ids = plan.blocks.flatMap((block) =>
    block.is === "clip" || block.is === "photo" ? [block.file_id] : pieceShotsOf(block).map((shot) => shot.file_id),
  );
  return [...new Set(ids)];
}

/** Why a plan can't be made. Each is said to the model and to a person in their own words. */
export type PieceWont =
  | "blocks"
  | "file"
  | "not_video"
  | "not_photo"
  | "made"
  | "unkept"
  | "not_ready"
  | "stretch"
  | "past_end"
  | "block_length"
  | "length"
  | "people"
  | "lines"
  | "opens_on_card"
  | "card"
  | "quote"
  | "label";
