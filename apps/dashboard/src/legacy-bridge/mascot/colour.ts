/**
 * Colour for the three, in OKLab, so a change of mood blends the way the eye expects. It parses the app's tokens as
 * tokens.css writes them (oklch), plus hex and rgb, and holds the one rule about mood: between rest and work a
 * colour gives up its saturation before its lightness, so coral cools through grey, not brown.
 */
export type Lab = readonly [number, number, number];
export type ThemeName = "light" | "dark";
export interface ThemeTokens {
  bg?: string | null;
  ink?: string | null;
  accent?: string | null;
}
export interface Palette {
  rest: [Lab, Lab, Lab];
  live: [Lab, Lab, Lab];
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = lin(r),
    G = lin(g),
    B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function labToCss([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const to = (v: number) => Math.round(gam(clamp01(v)) * 255);
  const r = to(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = to(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b = to(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return `rgb(${r},${g},${b})`;
}

/** '#rrggbb', '#rgb', 'rgb(r, g, b)' or 'oklch(L C H)': the forms the app's tokens take. Anything else is null. */
export function parseColor(value: string | Lab | null | undefined): Lab | null {
  if (Array.isArray(value)) return value as Lab;
  const str = String(value ?? "")
    .trim()
    .toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^#([0-9a-f]{6})$/.exec(str))) {
    const n = parseInt(m[1], 16);
    return rgbToLab(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  if ((m = /^#([0-9a-f]{3})$/.exec(str))) {
    const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16) / 255);
    return rgbToLab(r, g, b);
  }
  if ((m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(str))) {
    const L = parseFloat(m[1]) / (m[2] ? 100 : 1);
    const C = parseFloat(m[3]);
    const h = (parseFloat(m[4]) * Math.PI) / 180;
    return [L, C * Math.cos(h), C * Math.sin(h)];
  }
  if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(str))) {
    return rgbToLab(+m[1] / 255, +m[2] / 255, +m[3] / 255);
  }
  return null;
}

export const mixLab = (p: Lab, q: Lab, t: number): Lab => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
  p[2] + (q[2] - p[2]) * t,
];

/** The app's tokens (tokens.css), for when the page gives none. */
const TOKENS: Record<ThemeName, Required<ThemeTokens>> = {
  light: { bg: "oklch(0.985 0.003 80)", ink: "oklch(0.18 0.01 260)", accent: "oklch(0.62 0.19 25)" },
  dark: { bg: "oklch(0.16 0.005 260)", ink: "oklch(0.96 0.004 80)", accent: "oklch(0.7 0.18 28)" },
};
/**
 * How far each square fades toward the page, first to last, the way the mark fades. On a dark page coral faded far
 * turns to brick, so there it fades less.
 */
const FADES: Record<ThemeName, { rest: [number, number, number]; live: [number, number, number] }> = {
  light: { rest: [0.16, 0.44, 0.66], live: [0, 0.24, 0.44] },
  dark: { rest: [0.1, 0.34, 0.54], live: [0, 0.13, 0.25] },
};

/** Three colours at rest (the ink) and three at work (the accent), first square to last. */
export function palette(theme: ThemeName, tokens: ThemeTokens = {}): Palette {
  const base = TOKENS[theme];
  const bg = parseColor(tokens.bg) ?? (parseColor(base.bg) as Lab);
  const ink = parseColor(tokens.ink) ?? (parseColor(base.ink) as Lab);
  const accent = parseColor(tokens.accent) ?? (parseColor(base.accent) as Lab);
  const f = FADES[theme];
  return {
    rest: [mixLab(ink, bg, f.rest[0]), mixLab(ink, bg, f.rest[1]), mixLab(ink, bg, f.rest[2])],
    live: [mixLab(accent, bg, f.live[0]), mixLab(accent, bg, f.live[1]), mixLab(accent, bg, f.live[2])],
  };
}

export const clonePalette = (p: Palette): Palette => ({
  rest: [p.rest[0], p.rest[1], p.rest[2]],
  live: [p.live[0], p.live[1], p.live[2]],
});

const ease = (cur: number, tgt: number, dt: number, tau: number) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
const easeLab = (cur: Lab, tgt: Lab, dt: number): Lab => [
  ease(cur[0], tgt[0], dt, 0.3),
  ease(cur[1], tgt[1], dt, 0.3),
  ease(cur[2], tgt[2], dt, 0.3),
];
/** Moves `cur` toward `tgt` by one frame, so a theme change is a blend, and returns `cur`. */
export function easePalette(cur: Palette, tgt: Palette, dt: number): Palette {
  for (let k = 0; k < 3; k++) {
    cur.rest[k] = easeLab(cur.rest[k], tgt.rest[k], dt);
    cur.live[k] = easeLab(cur.live[k], tgt.live[k], dt);
  }
  return cur;
}

/**
 * The colour of a square: `shade` is which step it stands on (0 to 2, continuous while it moves between steps),
 * `live` how far it is from rest (0) to work (1). Saturation follows live³, lightness follows live.
 */
export function colourOf(pal: Palette, shade: number, live: number): string {
  const c = clamp01(shade / 2) * 2;
  const i = Math.min(1, Math.floor(c));
  const f = c - i;
  const r = mixLab(pal.rest[i], pal.rest[i + 1], f);
  const w = mixLab(pal.live[i], pal.live[i + 1], f);
  const s = live * live * live;
  return labToCss([r[0] + (w[0] - r[0]) * live, r[1] + (w[1] - r[1]) * s, r[2] + (w[2] - r[2]) * s]);
}
