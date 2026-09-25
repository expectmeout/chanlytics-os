/**
 * The three on a 2D canvas, as the agency mark: back to front, each tile's shadow first, so every tile shadows the
 * tiles beneath it. `side` is one tile in canvas pixels. The liquid drawing (liquid.ts) reads the same tile looks.
 */
import { CENTRE_Y, type CharacterFrame } from "./character";
import { labOf, labToCss, type Lab, type Palette } from "./colour";

export interface TileLook {
  /** from the centre of the drawing, in canvas pixels */
  x: number;
  y: number;
  size: number;
  radius: number;
  rot: number;
  colour: Lab;
  /**
   * The mark's shadow (primitives.jsx: 0 2px 6px -2px on a 13px tile, so an offset of 0.154 of a side, a blur of
   * σ 0.23 and a spread of -0.154), lower, softer and wider as the tile lifts toward you, tighter as it is pressed,
   * and leaning away from where the tiles look.
   */
  shadow: { x: number; y: number; sigma: number; spread: number; alpha: number };
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** What each tile looks like in this frame, in the order they are drawn: back first. */
export function tilesOf(frame: CharacterFrame, pal: Palette, side: number): TileLook[] {
  return frame.squares
    .slice()
    .sort((a, b) => a.layer - b.layer)
    .map((s) => {
      const size = side * s.size;
      const up = clamp01(s.lift);
      const down = clamp01(-s.lift * 2);
      return {
        x: s.x * side,
        y: s.y * side,
        size,
        radius: Math.min(size / 2, frame.corner * size),
        rot: s.rot,
        colour: labOf(pal, s.shade, s.live, s.charge),
        shadow: {
          x: side * (-frame.gaze[0] * 0.06),
          y: side * (0.154 + 0.2 * up - 0.08 * down - frame.gaze[1] * 0.04),
          sigma: side * (0.23 + 0.15 * up),
          spread: side * (-0.154 + 0.06 * up - 0.05 * down),
          alpha: pal.shadowAlpha * (1 - 0.3 * up) * (1 - 0.6 * down),
        },
      };
    });
}

function roundRect(ctx: CanvasRenderingContext2D, size: number, r: number): void {
  const x = -size / 2;
  const y = -size / 2;
  const rr = Math.max(0, Math.min(r, size / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + size, y, x + size, y + size, rr);
  ctx.arcTo(x + size, y + size, x, y + size, rr);
  ctx.arcTo(x, y + size, x, y, rr);
  ctx.arcTo(x, y, x + size, y, rr);
  ctx.closePath();
}
/**
 * A shadow with a negative spread: the shape, shrunk by the spread, is drawn far off the canvas and its shadow brought
 * back by the offset (shadow offsets and blur are in device pixels, whatever the transform), so only the shadow lands.
 */
const FAR = 20000;
function shadowOf(ctx: CanvasRenderingContext2D, t: TileLook, cx: number, cy: number, pal: Palette): void {
  const sh = t.shadow;
  const size = t.size + 2 * sh.spread;
  if (size <= 0.5 || sh.alpha <= 0.002) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, -FAR, 0);
  ctx.translate(cx + t.x, cy + t.y);
  ctx.rotate(t.rot);
  roundRect(ctx, size, t.radius + sh.spread);
  ctx.shadowColor = labToCss(pal.shadow, sh.alpha);
  ctx.shadowBlur = 2 * sh.sigma;
  ctx.shadowOffsetX = FAR + sh.x;
  ctx.shadowOffsetY = sh.y;
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: CharacterFrame,
  pal: Palette,
  side: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + CENTRE_Y * side;
  for (const t of tilesOf(frame, pal, side)) {
    if (t.size < 0.5) continue;
    shadowOf(ctx, t, cx, cy, pal);
    ctx.save();
    ctx.translate(cx + t.x, cy + t.y);
    ctx.rotate(t.rot);
    roundRect(ctx, t.size, t.radius);
    ctx.fillStyle = labToCss(t.colour);
    ctx.fill();
    ctx.restore();
  }
}
