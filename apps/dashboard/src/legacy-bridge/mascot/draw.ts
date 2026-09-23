/**
 * The three on a canvas: three rounded squares, the front one last. `side` is one square in canvas pixels.
 */
import type { CharacterFrame } from "./character";
import { colourOf, type Palette } from "./colour";

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
  const cy = h / 2;
  const list = frame.squares.slice().sort((a, b) => a.front - b.front || b.step - a.step);
  for (const s of list) {
    const px = side * s.size;
    if (px < 0.5) continue;
    ctx.save();
    ctx.translate(cx + s.x * side, cy + s.y * side);
    if (s.stretch > 0.002) {
      ctx.rotate(s.angle);
      ctx.scale(1 + s.stretch, 1 / (1 + s.stretch));
      ctx.rotate(-s.angle);
    }
    const k = 1 / (1 + s.squash); // squashed against the ground: the bottom edge stays put
    ctx.translate(0, ((1 - k) * px) / 2);
    ctx.scale(1 + s.squash, k);
    ctx.rotate(s.rot);
    const r = Math.min(px / 2, frame.corner * px);
    const x = -px / 2;
    const y = -px / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + px, y, x + px, y + px, r);
    ctx.arcTo(x + px, y + px, x, y + px, r);
    ctx.arcTo(x, y + px, x, y, r);
    ctx.arcTo(x, y, x + px, y, r);
    ctx.closePath();
    ctx.fillStyle = colourOf(pal, s.shade, s.live);
    ctx.fill();
    ctx.restore();
  }
}
