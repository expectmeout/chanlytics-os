/**
 * A video's storyboard (decision 0122): each of its blocks in play order, as the video will show it. A clip is its first frame
 * and a photo is itself, with the opening words' backing drawn where the video will draw it; a before-and-after pair is its two
 * pictures, one over the other; a card is its words. It is what Ask looks at before it makes a card, so words that would cover
 * a face are seen and moved before anything is spent, and it is the card's picture, so the person agrees to what they were shown.
 *
 * A clip's frame is a still the clip's folder keeps (cut on the edge the first time it is asked for, as a post's moment is), so
 * a second look at the same plan reads Storage alone. The drawing is posts/compose.ts's, the seam over the picture libraries.
 */
import "server-only";
import {
  PIECE_CARD,
  PIECE_FRAME,
  PIECE_SIDE,
  clockOf,
  pieceWordsOnBlocks,
  type PieceBlockDrawn,
  type PieceShotDrawn,
  type TenantId,
} from "@chanlytics/contracts";
import { composeBoard } from "@/server/posts/compose";
import { readFrame, readPhoto } from "@/server/posts/material";
import type { RouteContext } from "@/server/shared/with-route";
import type { PieceChecked } from "./piece";

/** How far inside a cut its first frame is read: past the frame a cut lands on, which may still be the one before it. */
const INSIDE_S = 0.1;
/** A clip's moment fills what holds it from its middle; a photo from where the frame's numbers hold it. */
const MIDDLE = 0.5;

/** What a tile is drawn for: the plan that passed, whose files are read as the member's own. */
interface Drawing {
  ctx: RouteContext;
  tenantId: TenantId;
  checked: PieceChecked;
}

/** A still as its tile shows it: a photo, or a clip's frame at that second. */
async function readShot(drawing: Drawing, shot: PieceShotDrawn) {
  const file = drawing.checked.files.find((f) => f.id === shot.source);
  if (!file) throw new Error("a block's file was not read");
  return shot.at === null
    ? { bytes: await readPhoto(file), heldAt: PIECE_FRAME.heldAt }
    : { bytes: await readFrame(drawing.ctx, drawing.tenantId, file, shot.at), heldAt: MIDDLE };
}

/** One block's tile. `place` is its own, counted from one; `worded` is whether the opening words are on it. */
async function boardTileOf(drawing: Drawing, block: PieceBlockDrawn, place: number, worded: boolean) {
  if (block.is === "clip") {
    const ends = block.trim + block.frames / drawing.checked.timeline.fps;
    const at = Math.round((block.trim + INSIDE_S) * 100) / 100;
    return {
      kind: "picture" as const,
      shot: await readShot(drawing, { source: block.source, at }),
      label: `${place} · ${clockOf(block.trim, true)} to ${clockOf(ends, true)}`,
      words: worded,
      caption: block.label,
    };
  }
  if (block.is === "photo")
    return {
      kind: "picture" as const,
      shot: await readShot(drawing, { source: block.source, at: null }),
      label: `${place} · photo`,
      words: worded,
      caption: block.label,
    };
  if (block.is === "pair") {
    const [before, after] = await Promise.all([readShot(drawing, block.before), readShot(drawing, block.after)]);
    return {
      kind: "pair" as const,
      before,
      after,
      names: block.labels,
      label: `${place} · before and after`,
      words: worded,
    };
  }
  if (block.is === "words")
    return { kind: "card" as const, lines: block.lines, size: block.size, label: `${place} · words` };
  return {
    kind: "quote" as const,
    lines: block.lines,
    size: block.size,
    from: block.from,
    over: block.over ? await readShot(drawing, block.over) : null,
    label: `${place} · quote`,
  };
}

/**
 * The storyboard of a plan that passed its check, as a JPEG. `plain` is the card's: the stills alone, edge to edge
 * (posts/compose.ts composeBoard); Ask's look keeps each block's number and what it is under it.
 */
export async function drawPieceBoard(
  ctx: RouteContext,
  tenantId: TenantId,
  checked: PieceChecked,
  plain = false,
): Promise<Buffer> {
  const { timeline } = checked;
  // The opening words are on every picture that opens under them: all where they stay, and past the first where it is a short one.
  const worded = timeline.words.lines.length > 0 ? pieceWordsOnBlocks(timeline) : [];
  const drawing: Drawing = { ctx, tenantId, checked };
  const tiles = await Promise.all(
    timeline.blocks.map((block, i) => boardTileOf(drawing, block, i + 1, worded[i] === true)),
  );
  return composeBoard({
    tiles,
    plain,
    words: timeline.words,
    frame: {
      width: PIECE_FRAME.width,
      height: PIECE_FRAME.height,
      pad: PIECE_FRAME.wordsPad,
      padSide: PIECE_FRAME.wordsPadSide,
      gap: PIECE_FRAME.wordsGap,
      leading: PIECE_FRAME.wordsLeading,
      side: PIECE_SIDE,
      clearBottom: PIECE_FRAME.clearBottom,
      caption: {
        size: PIECE_FRAME.labelSize,
        pad: PIECE_FRAME.labelPad,
        padSide: PIECE_FRAME.labelPadSide,
        lift: PIECE_FRAME.labelLift,
      },
      rule: PIECE_FRAME.pairRule,
      card: { lift: PIECE_CARD.lift, dim: PIECE_CARD.dim, fromSize: PIECE_CARD.fromSize },
      ink: PIECE_FRAME.ink,
      paper: PIECE_FRAME.paper,
      accent: timeline.accent,
    },
  });
}
