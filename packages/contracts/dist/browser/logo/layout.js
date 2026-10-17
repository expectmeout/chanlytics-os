export const LOGO_PAD = 0.16;
export const LOGO_PLATE_LIGHT = "rgb(255, 255, 255)";
export const LOGO_PLATE_DARK = "rgb(28, 28, 32)";
const CLEAR = 16;
const OPAQUE = 240;
const NEAR = 36;
const AGREE = 0.95;
const WIDE = 2.5;
const SMALL = 96;
const LIGHT_MARK = 0.82;
const lightness = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function rgbaOf(data, pixel) {
  const i = pixel * 4;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
}
function borderOf(width, height) {
  const at = [];
  for (let x = 0; x < width; x++) at.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) at.push(y * width, y * width + width - 1);
  return height === 1 ? at.slice(0, width) : at;
}
function groundOf(px) {
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
function contentOf(px, ground) {
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
export function logoLayout(px) {
  const { width, height } = px;
  if (width < 1 || height < 1 || px.data.length < width * height * 4) return null;
  const ground = groundOf(px);
  if (ground.kind === "busy") {
    const side = Math.min(width, height);
    return {
      mode: "fill",
      crop: { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), w: side, h: side },
      plate: null,
      notes: side < SMALL ? ["small"] : []
    };
  }
  const box = contentOf(px, ground);
  if (!box) return null;
  const notes = [];
  if (Math.max(box.w, box.h) / Math.min(box.w, box.h) > WIDE) notes.push("wide");
  if (Math.max(box.w, box.h) < SMALL) notes.push("small");
  const plate = ground.kind === "solid" ? `rgb(${ground.r}, ${ground.g}, ${ground.b})` : box.light > LIGHT_MARK ? LOGO_PLATE_DARK : LOGO_PLATE_LIGHT;
  return { mode: "fit", crop: { x: box.x, y: box.y, w: box.w, h: box.h }, plate, notes };
}
export function logoDrawRect(layout, side) {
  if (layout.mode === "fill") return { x: 0, y: 0, w: side, h: side };
  const room = side * (1 - 2 * LOGO_PAD);
  const scale = Math.min(room / layout.crop.w, room / layout.crop.h);
  const w = layout.crop.w * scale;
  const h = layout.crop.h * scale;
  return { x: (side - w) / 2, y: (side - h) / 2, w, h };
}
