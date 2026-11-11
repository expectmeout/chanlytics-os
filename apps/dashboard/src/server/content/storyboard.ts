/**
 * A video's storyboard (decision 0122): the first frame of each of its cuts, in play order, with the opening words' backing drawn
 * where the video will draw it. It is what Ask looks at before it makes a card, so words that would cover a face are seen and
 * moved before anything is spent, and it is the card's picture, so the person agrees to what they were shown.
 *
 * Each frame is a still the clip's folder keeps (cut on the edge the first time it is asked for, as a post's moment is), so a
 * second look at the same plan reads Storage alone. The drawing is posts/compose.ts's, the seam over the picture libraries.
 */
import "server-only";
import { PIECE_FRAME, clockOf, pieceWordsOnCuts, type TenantId } from "@chanlytics/contracts";
import { composeBoard } from "@/server/posts/compose";
import { readFrame } from "@/server/posts/material";
import type { RouteContext } from "@/server/shared/with-route";
import type { PieceChecked } from "./piece";

/** How far inside a cut its first frame is read: past the frame a cut lands on, which may still be the one before it. */
const INSIDE_S = 0.1;

/**
 * The storyboard of a plan that passed its check, as a JPEG. `plain` is the card's: the stills alone (posts/compose.ts
 * composeBoard); Ask's look keeps each cut's number and seconds under it.
 */
export async function drawPieceBoard(
  ctx: RouteContext,
  tenantId: TenantId,
  checked: PieceChecked,
  plain = false,
): Promise<Buffer> {
  const { timeline, files } = checked;
  // The words are on every cut that opens under them: all where they stay, and past the first where it is a short one.
  const worded = pieceWordsOnCuts(timeline);
  const tiles = await Promise.all(
    timeline.cuts.map(async (cut, i) => {
      const file = files.find((f) => f.id === cut.source);
      if (!file) throw new Error("a cut's clip was not read");
      const ends = cut.trim + cut.frames / timeline.fps;
      return {
        frame: await readFrame(ctx, tenantId, file, Math.round((cut.trim + INSIDE_S) * 100) / 100),
        label: `${i + 1} · ${clockOf(cut.trim, true)} to ${clockOf(ends, true)}`,
        words: worded[i] === true,
      };
    }),
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
    },
  });
}
