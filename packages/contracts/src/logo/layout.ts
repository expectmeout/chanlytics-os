/**
 * How a chosen picture becomes the workspace's square (logo.ts), decided from its pixels alone, so the page that draws it
 * holds no rule of its own and a node test can hold every case.
 *
 * Small businesses' logos come in three kinds, and each is drawn the way it was made:
 *   - A mark on nothing (a transparent PNG): its empty edges are trimmed and it sits contained on a plate, padded so a
 *     square mark's corners stay inside the circle. The plate is light, or dark when the mark itself is mostly light
 *     (a white logo made for a dark website header would vanish on white).
 *   - A mark on a plain ground (a JPEG on white, a name on a coloured card): the ground is trimmed and becomes the plate,
 *     so the padding is the logo's own colour and the seam never shows.
 *   - A picture to its edges (an app icon, a photograph, a round avatar): it fills the square, cropped to its middle.
 * Nothing is cropped from a logo: a wide one is contained, and the owner is told it will look small.
 */

/** The picture as the page read it from a canvas: RGBA, four bytes a pixel, row by row. */
export interface LogoPixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export type LogoMode = "fit" | "fill";
/** What the owner is told before they save. */
export type LogoNote = "wide" | "small";

export interface LogoLayout {
  mode: LogoMode;
  /** The part of the picture drawn, in its own pixels. */
  crop: { x: number; y: number; w: number; h: number };
  /** The square's ground, painted first; null where the picture fills it. */
  plate: string | null;
  notes: LogoNote[];
}

/** How much of the square a contained mark leaves around it, on each side: the kit's mark padding (kit.css .face-mark). */
export const LOGO_PAD = 0.16;
/** The plates, as a canvas paints them. Both read on the sidebar's glass in either theme. */
export const LOGO_PLATE_LIGHT = "rgb(255, 255, 255)";
export const LOGO_PLATE_DARK = "rgb(28, 28, 32)";

/** Below this alpha a pixel is nothing. */
const CLEAR = 16;
/** At or above this alpha a pixel is opaque. */
const OPAQUE = 240;
/** How far, summed over red, green and blue, a colour may be from the ground and still be the ground. */
const NEAR = 36;
/** How much of the border must agree for the border to be a ground. */
const AGREE = 0.95;
/** Past this, longer side over shorter, a contained logo is a thin line in the circle. */
const WIDE = 2.5;
/** Under this many of its own pixels on its longer side, a picture is blown up to the square and looks soft. */
const SMALL = 96;
/** Above this mean lightness a mark on nothing is a light mark, and takes the dark plate. */
const LIGHT_MARK = 0.82;

const lightness = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** A pixel's red, green, blue and alpha; one past the buffer is nothing (logoLayout refuses a buffer too short). */
function rgbaOf(data: ArrayLike<number>, pixel: number): [number, number, number, number] {
  const i = pixel * 4;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
}

/** Every pixel on the picture's edge, once. */
function borderOf(width: number, height: number): number[] {
  const at: number[] = [];
  for (let x = 0; x < width; x++) at.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) at.push(y * width, y * width + width - 1);
  return height === 1 ? at.slice(0, width) : at;
}

type Ground = { kind: "clear" } | { kind: "solid"; r: number; g: number; b: number } | { kind: "busy" };

/** What the picture's edge says it sits on: nothing, one colour, or itself. */
function groundOf(px: LogoPixels): Ground {
  const { data, width, height } = px;
  const edge = borderOf(width, height);
  let clear = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let solid = 0;
  for (const i of edge) {
    const [pr, pg, pb, a] = rgbaOf(data, i);
    if (a < CLEAR) clear++;
    else if (a >= OPAQUE) {
      solid++;
      r += pr;
      g += pg;
      b += pb;
    }
  }
  if (clear >= edge.length * AGREE) return { kind: "clear" };
  if (solid < edge.length * AGREE) return { kind: "busy" };
  const mean = { r: r / solid, g: g / solid, b: b / solid };
  let agree = 0;
  for (const i of edge) {
    const [pr, pg, pb, a] = rgbaOf(data, i);
    const d = Math.abs(pr - mean.r) + Math.abs(pg - mean.g) + Math.abs(pb - mean.b);
    if (a >= OPAQUE && d <= NEAR) agree++;
  }
  if (agree < edge.length * AGREE) return { kind: "busy" };
  return { kind: "solid", r: Math.round(mean.r), g: Math.round(mean.g), b: Math.round(mean.b) };
}

/**
 * The box around what is not the ground, and the mean lightness of what is in it; null when the picture is all ground.
 */
function contentOf(
  px: LogoPixels,
  ground: Ground,
): { x: number; y: number; w: number; h: number; light: number } | null {
  const { data, width, height } = px;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let lit = 0;
  let weight = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = rgbaOf(data, y * width + x);
      if (a < CLEAR) continue;
      if (ground.kind === "solid") {
        const d = Math.abs(r - ground.r) + Math.abs(g - ground.g) + Math.abs(b - ground.b);
        if (a >= OPAQUE && d <= NEAR) continue;
      }
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      lit += lightness(r, g, b) * a;
      weight += a;
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, light: weight ? lit / weight : 0 };
}

/** How the picture is drawn into the square; null when there is nothing in it to draw. */
export function logoLayout(px: LogoPixels): LogoLayout | null {
  const { width, height } = px;
  if (width < 1 || height < 1 || px.data.length < width * height * 4) return null;
  const ground = groundOf(px);
  if (ground.kind === "busy") {
    const side = Math.min(width, height);
    return {
      mode: "fill",
      crop: { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), w: side, h: side },
      plate: null,
      notes: side < SMALL ? ["small"] : [],
    };
  }
  const box = contentOf(px, ground);
  if (!box) return null;
  const notes: LogoNote[] = [];
  if (Math.max(box.w, box.h) / Math.min(box.w, box.h) > WIDE) notes.push("wide");
  if (Math.max(box.w, box.h) < SMALL) notes.push("small");
  const plate =
    ground.kind === "solid"
      ? `rgb(${ground.r}, ${ground.g}, ${ground.b})`
      : box.light > LIGHT_MARK
        ? LOGO_PLATE_DARK
        : LOGO_PLATE_LIGHT;
  return { mode: "fit", crop: { x: box.x, y: box.y, w: box.w, h: box.h }, plate, notes };
}

/** Where the drawn part lands in a square of `side`: the whole square when it fills, centred inside the padding when it fits. */
export function logoDrawRect(layout: LogoLayout, side: number): { x: number; y: number; w: number; h: number } {
  if (layout.mode === "fill") return { x: 0, y: 0, w: side, h: side };
  const room = side * (1 - 2 * LOGO_PAD);
  const scale = Math.min(room / layout.crop.w, room / layout.crop.h);
  const w = layout.crop.w * scale;
  const h = layout.crop.h * scale;
  return { x: (side - w) / 2, y: (side - h) / 2, w, h };
}
