/**
 * A video being made (00613, decision 0122): where it stands, why it was not made, the steps of the job that makes it, the
 * machine it is drawn on as its row keeps it, the business's look kept at its press, and the template's edition a deploy draws
 * with. What the plan is and what it must pass are pieces.ts's and piece-timeline.ts's; what it says to a person is piece-words.ts's.
 */
import { isOneOf, nonBlankOrNull, recordOrNull } from "../shared/unknown";
import type { PieceShape } from "./pieces";

/** A shape's composition in the template: its name as the renderer takes one, which is with no underscore. */
export const pieceCompositionOf = (shape: PieceShape): string => shape.split("_").join("-");

/**
 * The template's edition, and the hash of everything its machine image is made of (tooling/video/template-hash.mjs). A video is
 * drawn on a machine started from the image on record for this edition (`piece_images`), so a deploy and its image always agree:
 * a change to the template is a new edition here, with its image built before the change is merged (tooling/video/README.md).
 * tests/content/the-template-has-its-image.test.mjs fails the change that forgets.
 */
export const PIECE_TEMPLATE = { edition: 1, hash: "c6585feea787" } as const;

/** Where a video asked for stands (00613 `pieces`): being made, a file under Made by Ask, or not made. */
export const PIECE_STATUSES = ["making", "made", "failed"] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];

/**
 * Where one being made stands, as its card says it (00613 `pieces.stage`): its job has not begun; a clip's full-size copy is
 * still being made by the video platform, which can take a new clip twenty minutes; a machine is drawing it; it is on its way
 * into Files. Said by the doors as each is reached, and nothing once the video is made or was not.
 */
export const PIECE_STAGES = ["queued", "waiting_clip", "drawing", "saving"] as const;
export type PieceStage = (typeof PIECE_STAGES)[number];

/**
 * Why one was not made, as its owner is told: a clip it was planned from is gone or no longer fits; the machine could not draw
 * it, twice; the video platform would not take or could not read it; or its job ended with nothing known.
 */
export const PIECE_FAILS = ["clips", "draw", "store", "unknown"] as const;
export type PieceFail = (typeof PIECE_FAILS)[number];

/** The most a workspace has being made at once (00613 piece_begin): each is a machine that costs while it draws. */
export const PIECES_MAKING_MAX = 3;

/**
 * The steps of the job that makes one (00613 `piece_make`), one a run: `start` checks the plan against the clips as they now
 * stand, reads which parts of each clip its cuts need and starts the machine; `wait` asks after the drawing until it is done,
 * then sends the video into the video platform as a file. A wait that runs out of its run puts the next on the ledger, a tick on.
 */
const PIECE_STEPS = ["start", "wait"] as const;
export type PieceStep = (typeof PIECE_STEPS)[number];
export const isPieceStep = (value: unknown): value is PieceStep => isOneOf(PIECE_STEPS, value);

/**
 * The machine a video is being drawn on, as its row keeps it while it is (`pieces.machine`). `round` is which try: one or two.
 * `frames` is the video's length as its timeline was compiled at the start, so keeping the drawn video reads no clip again.
 */
export interface PieceMachine {
  name: string;
  cmd_id: string;
  started_at: string;
  round: number;
  frames: number;
}

/** A row's machine read back, or null where it holds none (or something else). */
export function pieceMachineOf(value: unknown): PieceMachine | null {
  const fields = recordOrNull(value);
  const name = nonBlankOrNull(fields?.name);
  const cmdId = nonBlankOrNull(fields?.cmd_id);
  const startedAt = nonBlankOrNull(fields?.started_at);
  if (!name || !cmdId || !startedAt) return null;
  const frames = Number(fields?.frames);
  return {
    name,
    cmd_id: cmdId,
    started_at: startedAt,
    round: fields?.round === 2 ? 2 : 1,
    frames: Number.isInteger(frames) && frames > 0 ? frames : 0,
  };
}

/**
 * How many tries at drawing a row has had: its machine's while one draws, and the count alone between two (a machine that
 * failed is let go, and the row keeps `{ round }` so the next start knows it is the second). None is zero.
 */
export function pieceRoundsOf(value: unknown): number {
  const round = recordOrNull(value)?.round;
  return round === 1 || round === 2 ? round : 0;
}

/** The most tries at drawing one video: a machine that stalls or fails once is replaced by a fresh one, once. */
export const PIECE_ROUNDS_MAX = 2;

/**
 * The business's own as a video wears it, kept at the press (`pieces.look`), so the video drawn is the one its card showed: its
 * colour, where its mark is kept (the workspace logos' bucket) or null for none, its name, its booking line and its address.
 */
export interface PieceLookKept {
  accent: string | null;
  logo_path: string | null;
  name: string;
  book: string | null;
  address: string | null;
}

/** A row's look read back: a row that holds none draws with a name and nothing else. */
export function pieceLookOf(value: unknown): PieceLookKept {
  const fields = recordOrNull(value) ?? {};
  return {
    accent: nonBlankOrNull(fields.accent),
    logo_path: nonBlankOrNull(fields.logo_path),
    name: nonBlankOrNull(fields.name) ?? "",
    book: nonBlankOrNull(fields.book),
    address: nonBlankOrNull(fields.address),
  };
}
