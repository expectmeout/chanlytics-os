const ACCENT_HEX = /^#[0-9a-f]{6}$/;
export const accentOk = (s) => typeof s === "string" && ACCENT_HEX.test(s);
const byte = (n) => Math.max(0, Math.min(255, Math.round(n)));
const part = (s) => {
  const t = s.trim();
  if (/^-?\d*\.?\d+%$/.test(t)) return byte(parseFloat(t) / 100 * 255);
  if (/^-?\d*\.?\d+$/.test(t)) return byte(parseFloat(t));
  return null;
};
export function parseCssColour(s) {
  const v = s.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) {
    const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(v)?.[1];
  if (fn === void 0) return null;
  const parts = (fn.split("/")[0] ?? "").split(/[\s,]+/).filter(Boolean).slice(0, 3).map(part);
  if (parts.length !== 3 || parts.some((p) => p === null)) return null;
  return parts;
}
export const hexOfRgb = ([r, g, b]) => `#${[r, g, b].map((n) => byte(n).toString(16).padStart(2, "0")).join("")}`;
function satLight([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}
export function isAccentLike(rgb) {
  const { s, l } = satLight(rgb);
  return s >= 0.25 && l >= 0.18 && l <= 0.78;
}
const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminanceOf = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export function contrastOnWhite(hex) {
  const rgb = parseCssColour(hex);
  return rgb ? 1.05 / (luminanceOf(rgb) + 0.05) : 1;
}
export function readableOnWhite(hex) {
  let rgb = parseCssColour(hex);
  if (!rgb) return hex;
  for (let i = 0; i < 40 && 1.05 / (luminanceOf(rgb) + 0.05) < 4.5; i++) rgb = rgb.map((c) => c * 0.94);
  return hexOfRgb(rgb);
}
