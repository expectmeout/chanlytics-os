/**
 * Colour for the three, in OKLab, so a change of mood blends the way the eye expects. It parses the app's tokens as
 * tokens.css writes them (oklch), plus hex and rgb, and holds the rules about colour:
 * - between rest and work a colour gives up its saturation before its lightness, so coral cools through grey, not brown;
 * - the tiles lie in a stack, so the top one is always the most lit: lightest on a light page, brightest on a dark one;
 * - a charged tile moves toward its strongest colour (the page's full ink at rest, a hotter coral at work), still one
 *   solid colour;
 * - every tile casts the mark's soft shadow, tinted by the page.
 */
import { clamp01, ease } from "./math";

export type Lab = readonly [number, number, number];
export type ThemeName = "light" | "dark";
export interface ThemeTokens {
  bg?: string | null;
  ink?: string | null;
  accent?: string | null;
  /** what is drawn on the accent: the phone's ✦ button's glyph colour */
  accentFg?: string | null;
}
/**
 * Where the three are drawn. `page`: on the page, the app's ink at rest and its coral at work. `accent`: on a coral
 * button (the phone's ✦), in the button's own foreground, faded toward the coral down the stack; there the state shows
 * as motion, since the button is already the accent.
 */
export type Tone = "page" | "accent";
export interface Palette {
  rest: [Lab, Lab, Lab];
  live: [Lab, Lab, Lab];
  /** what a charged tile moves toward: at rest, and at work */
  strongRest: Lab;
  strongLive: Lab;
  shadow: Lab;
  shadowAlpha: number;
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function rgbToLab(r: number, g: number, b: number): Lab {
  return linearToOklab(lin(r), lin(g), lin(b));
}

/**
 * CSS `lab(L a b)`, CIE Lab under D50, to OKLab: through XYZ, adapted to D65 (Bradford) and linear sRGB, per CSS Color 4.
 * The app's build writes every `oklch()` token as `lab()`, so this is the form the page's tokens are read back in.
 */
export function cieLabToOklab(L: number, a: number, b: number): Lab {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const X = xr * 0.9642956764295677;
  const Y = yr;
  const Z = zr * 0.8251046025104602;
  const x = 0.955473421488075 * X - 0.02309845494876471 * Y + 0.06325924320057072 * Z;
  const y = -0.0283697093338637 * X + 1.0099953980813041 * Y + 0.021041441191917323 * Z;
  const z = 0.012314014864481998 * X - 0.020507649298898964 * Y + 1.330365926242124 * Z;
  return linearToOklab(
    3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
  );
}

function linearToOklab(R: number, G: number, B: number): Lab {
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to sRGB, each 0 to 1 (a WebGL colour). */
export function labRgb([L, A, B]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    clamp01(gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/** OKLab to CSS: `rgb(r,g,b)`, or `rgba(...)` under a given alpha. */
export function labToCss(lab: Lab, alpha = 1): string {
  const [r, g, b] = labRgb(lab).map((v) => Math.round(v * 255));
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
}

/**
 * '#rrggbb', '#rgb', 'rgb(r, g, b)', 'oklch(L C H)' or 'lab(L a b)': the forms the app's tokens take, as written and
 * as the browser reads them back after the build. Anything else is null.
 */
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
  if ((m = /^lab\(\s*(-?[\d.]+)%?\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(str))) {
    return cieLabToOklab(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
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
/** more of the same colour: chroma up by k, lightness moved by dl */
const hotter = ([L, a, b]: Lab, dl: number, k: number): Lab => [Math.min(0.97, Math.max(0.05, L + dl)), a * k, b * k];

/** The app's tokens (tokens.css), for when the page gives none. */
const TOKENS: Record<ThemeName, Required<ThemeTokens>> = {
  light: {
    bg: "oklch(0.985 0.003 80)",
    ink: "oklch(0.18 0.01 260)",
    accent: "oklch(0.62 0.19 25)",
    accentFg: "oklch(0.99 0 0)",
  },
  dark: {
    bg: "oklch(0.16 0.005 260)",
    ink: "oklch(0.96 0.004 80)",
    accent: "oklch(0.7 0.18 28)",
    accentFg: "oklch(0.16 0.005 260)",
  },
};
/**
 * How far each tile fades toward the page, back to top. The top tile is the most lit, so on a light page the fade grows
 * up the stack (the back darkest) and on a dark page it shrinks (the back dimmest, the top the full ink). Coral faded
 * far on a dark page turns to brick, so there it fades less.
 */
const FADES: Record<ThemeName, { rest: [number, number, number]; live: [number, number, number] }> = {
  light: { rest: [0.16, 0.44, 0.66], live: [0, 0.24, 0.44] },
  dark: { rest: [0.54, 0.34, 0.1], live: [0.25, 0.13, 0] },
};
/** On the ✦ the tiles fade toward the coral down the stack: the top one nearly the full foreground. */
const ON_ACCENT = { rest: [0.46, 0.26, 0.06], live: [0.3, 0.14, 0] } as const;
/** The mark's shadow on each ground: the page's ink, black on a dark page, a deep coral on the ✦. */
const SHADOW: Record<ThemeName | "accent", { colour: string; alpha: number }> = {
  light: { colour: "oklch(0.25 0.02 260)", alpha: 0.3 },
  dark: { colour: "oklch(0 0 0)", alpha: 0.55 },
  accent: { colour: "oklch(0.32 0.1 25)", alpha: 0.38 },
};

/** Three colours at rest (the ink) and three at work (the accent), back tile to top, with the strongest and the shadow. */
export function palette(theme: ThemeName, tokens: ThemeTokens = {}, tone: Tone = "page"): Palette {
  const base = TOKENS[theme];
  const accent = parseColor(tokens.accent) ?? (parseColor(base.accent) as Lab);
  const onAccent = parseColor(tokens.accentFg) ?? (parseColor(base.accentFg) as Lab);
  if (tone === "accent") {
    const sh = SHADOW.accent;
    const at = (t: readonly number[]) => t.map((f) => mixLab(onAccent, accent, f)) as [Lab, Lab, Lab];
    return {
      rest: at(ON_ACCENT.rest),
      live: at(ON_ACCENT.live),
      strongRest: onAccent,
      strongLive: onAccent,
      shadow: parseColor(sh.colour) as Lab,
      shadowAlpha: sh.alpha,
    };
  }
  const bg = parseColor(tokens.bg) ?? (parseColor(base.bg) as Lab);
  const ink = parseColor(tokens.ink) ?? (parseColor(base.ink) as Lab);
  const f = FADES[theme];
  const sh = SHADOW[theme];
  return {
    rest: [mixLab(ink, bg, f.rest[0]), mixLab(ink, bg, f.rest[1]), mixLab(ink, bg, f.rest[2])],
    live: [mixLab(accent, bg, f.live[0]), mixLab(accent, bg, f.live[1]), mixLab(accent, bg, f.live[2])],
    strongRest: ink,
    strongLive: hotter(accent, theme === "dark" ? 0.05 : 0.015, 1.12),
    shadow: parseColor(sh.colour) as Lab,
    shadowAlpha: sh.alpha,
  };
}

export const clonePalette = (p: Palette): Palette => ({
  rest: [p.rest[0], p.rest[1], p.rest[2]],
  live: [p.live[0], p.live[1], p.live[2]],
  strongRest: p.strongRest,
  strongLive: p.strongLive,
  shadow: p.shadow,
  shadowAlpha: p.shadowAlpha,
});

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
  cur.strongRest = easeLab(cur.strongRest, tgt.strongRest, dt);
  cur.strongLive = easeLab(cur.strongLive, tgt.strongLive, dt);
  cur.shadow = easeLab(cur.shadow, tgt.shadow, dt);
  cur.shadowAlpha = ease(cur.shadowAlpha, tgt.shadowAlpha, dt, 0.3);
  return cur;
}

/**
 * The colour of a tile, in OKLab: `shade` is its colour step (0 to 2, continuous while it moves between steps), `live`
 * how far it is from rest (0) to work (1), `charge` how far it moves toward its strongest. Saturation follows live³,
 * lightness follows live.
 */
export function labOf(pal: Palette, shade: number, live: number, charge = 0): Lab {
  const c = clamp01(shade / 2) * 2;
  const i = Math.min(1, Math.floor(c));
  const f = c - i;
  const r = mixLab(pal.rest[i], pal.rest[i + 1], f);
  const w = mixLab(pal.live[i], pal.live[i + 1], f);
  const s = live * live * live;
  const base: Lab = [r[0] + (w[0] - r[0]) * live, r[1] + (w[1] - r[1]) * s, r[2] + (w[2] - r[2]) * s];
  if (charge <= 0) return base;
  const strong: Lab = [
    pal.strongRest[0] + (pal.strongLive[0] - pal.strongRest[0]) * live,
    pal.strongRest[1] + (pal.strongLive[1] - pal.strongRest[1]) * s,
    pal.strongRest[2] + (pal.strongLive[2] - pal.strongRest[2]) * s,
  ];
  return mixLab(base, strong, clamp01(charge) * 0.65);
}

/** The colour of a tile as CSS (labOf). */
export function colourOf(pal: Palette, shade: number, live: number, charge = 0): string {
  return labToCss(labOf(pal, shade, live, charge));
}
