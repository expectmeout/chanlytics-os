/**
 * Colour as the look reads and draws it (decision 0075): a CSS colour's common spellings into a triplet, a triplet into
 * the one hex the row keeps, whether a colour could be a brand's accent rather than its paper or ink, and the darkening
 * that keeps white words readable on it (WCAG's 4.5:1). Shared by the site reader (core look/accent.ts) and the letter
 * (letter.ts), so what is read is what is drawn.
 */
export type Rgb = [number, number, number];

/** The one shape the row keeps: lower-case, six hex digits. */
const ACCENT_HEX = /^#[0-9a-f]{6}$/;
export const accentOk = (s: unknown): s is string => typeof s === "string" && ACCENT_HEX.test(s);

const byte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const part = (s: string): number | null => {
  const t = s.trim();
  if (/^-?\d*\.?\d+%$/.test(t)) return byte((parseFloat(t) / 100) * 255);
  if (/^-?\d*\.?\d+$/.test(t)) return byte(parseFloat(t));
  return null;
};

/** `#abc`, `#aabbcc`, `#aabbccdd`, `rgb(…)`, `rgba(…)` with commas, spaces or a slash; anything else is null. */
export function parseCssColour(s: string): Rgb | null {
  const v = s.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) {
    const h =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex.slice(0, 6);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^rgba?\(\s*([^)]*)\)$/.exec(v)?.[1];
  if (fn === undefined) return null;
  const parts = (fn.split("/")[0] ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(part);
  if (parts.length !== 3 || parts.some((p) => p === null)) return null;
  return parts as Rgb;
}

export const hexOfRgb = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((n) => byte(n).toString(16).padStart(2, "0")).join("")}`;

/** HSL's saturation and lightness, 0..1. */
function satLight([r, g, b]: Rgb): { s: number; l: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** A colour a brand would pick as its own: saturated, and neither paper nor ink. */
export function isAccentLike(rgb: Rgb): boolean {
  const { s, l } = satLight(rgb);
  return s >= 0.25 && l >= 0.18 && l <= 0.78;
}

const channel = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminanceOf = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG's contrast of the colour against white; 1 for a value that is no colour. */
export function contrastOnWhite(hex: string): number {
  const rgb = parseCssColour(hex);
  return rgb ? 1.05 / (luminanceOf(rgb) + 0.05) : 1;
}

/** The colour, darkened in steps of six per cent until white words read on it (4.5:1); one that reads is itself. */
export function readableOnWhite(hex: string): string {
  let rgb = parseCssColour(hex);
  if (!rgb) return hex;
  for (let i = 0; i < 40 && 1.05 / (luminanceOf(rgb) + 0.05) < 4.5; i++) rgb = rgb.map((c) => c * 0.94) as Rgb;
  return hexOfRgb(rgb);
}
