/**
 * Closing a piece on a phone (the content canvas, board Viewer, "Closing": press ×, or pull it down, and the piece shrinks back
 * into its tile, so you see where you were). The list held under the viewer (kit/motion/held-list.ts) is shown again where it stood, the
 * viewer glides onto its piece's tile, and then the piece closes as it always did, the list put back by the hold. Where the
 * tile is off the screen, or not drawn (a line's piece, the Library's own), or less motion is asked for, it closes at once.
 */
import { showHeld } from "../../../kit/motion/held-list";
import { motionReduced } from "../../../kit/motion/swipe";

/** The glide onto the tile, on the house's ease-out (tokens.css --ease-out). */
const INTO_TILE_MS = 240;
const INTO_TILE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** How much past the glide a close waits for it, at most. */
const INTO_TILE_SPARE_MS = 120;

/** The tile a made piece is drawn as in the grid (body.tsx MadeTile), where it shows. */
const tileOf = (fileId: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-tile="${CSS.escape(fileId)}"]`);

/**
 * Glides the viewer onto its piece's tile, from wherever it stands (× from rest; a thumb's pull down from where it let go);
 * answers whether it did, at once where it cannot (no tile on the screen, less motion asked for).
 */
export async function shrinkIntoTile(viewer: HTMLElement | null, fileId: string): Promise<boolean> {
  if (!viewer || motionReduced() || typeof viewer.animate !== "function") return false;
  const tile = tileOf(fileId);
  if (!tile) return false;
  showHeld(true);
  const to = tile.getBoundingClientRect();
  // Where it stands with nothing moving it: a pull down has it under the finger's transform, which the glide starts from.
  const base = {
    left: viewer.offsetLeft,
    top: viewer.offsetTop,
    width: viewer.offsetWidth,
    height: viewer.offsetHeight,
  };
  if (to.width === 0 || to.bottom <= 0 || to.top >= window.innerHeight || base.width === 0) {
    showHeld(false);
    return false;
  }
  const from = viewer.style.transform || "none";
  const move = `translate(${to.left - base.left}px, ${to.top - base.top}px) scale(${to.width / base.width}, ${to.height / base.height})`;
  viewer.style.transformOrigin = "0 0";
  const glide = viewer.animate(
    [
      { transform: from, opacity: 1 },
      { transform: move, opacity: 0.6 },
    ],
    { duration: INTO_TILE_MS, easing: INTO_TILE_EASE, fill: "forwards" },
  );
  // A close never waits on the screen's clock: where it does not run (a tab out of sight), the piece closes all the same.
  await Promise.race([
    glide.finished.catch(() => undefined),
    new Promise<void>((done) => setTimeout(done, INTO_TILE_MS + INTO_TILE_SPARE_MS)),
  ]);
  return true;
}
