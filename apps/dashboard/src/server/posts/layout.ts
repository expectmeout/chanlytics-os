/**
 * A post's words and marks, laid out (decision 0099, step 3). Pure: what goes where on a transparent page over the photo, as the
 * tree satori draws, so a node test can hold every case and no model touches a layout (decision 0075). The contrast is by
 * arithmetic: white words on black at 0.6 or more read above 4.5:1 over any photo, so words over a photo only ever stand on that
 * much, and words on a ground of a colour take whichever of black or white reads on it.
 */

import type { PostLayoutName, PostPicture, PostVoice } from "@chanlytics/contracts";

/** A shape a post is made in, and what stays clear of the phone's own controls. */
export interface PostShape {
  name: PostPicture;
  width: number;
  height: number;
  /** What a story's own controls cover, top and foot. */
  clearTop: number;
  clearFoot: number;
}

export const POST_SIZES = {
  square: { name: "square", width: 1080, height: 1080, clearTop: 0, clearFoot: 0 },
  portrait: { name: "portrait", width: 1080, height: 1350, clearTop: 0, clearFoot: 0 },
  story: { name: "story", width: 1080, height: 1920, clearTop: 250, clearFoot: 340 },
  // What Google shows a post in. Past 400 by 300 it takes, and at 4:3 it crops nothing.
  wide: { name: "wide", width: 1200, height: 900, clearTop: 0, clearFoot: 0 },
} as const satisfies Record<PostPicture, PostShape>;

/** What a post says. The line is the post; the rest stands around it where there is something to say. */
export interface PostWords {
  /** Small capitals over the line: what this is, or the business's name. */
  over?: string | null;
  line: string;
  under?: string | null;
  /** How to act on it, in the accent's band: a number, a day, a place. */
  act?: string | null;
}

export interface PostLayoutInput {
  shape: PostShape;
  words: PostWords;
  wordsAt: "top" | "bottom";
  voice: PostVoice;
  layout: PostLayoutName;
  /** The business's one colour, `#rrggbb`; none draws white. */
  accent: string | null;
  /** The business's square mark, ready to draw (a data address); none draws no mark. */
  logo: string | null;
}

/** The node satori takes. */
export interface PostNode {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown; src?: string; width?: number; height?: number };
}

/** A piece of the page, in its pixels. */
interface PostBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const POST_INK = "#0d0b09";
const CREAM = "#faf5e8";
const WHITE = "#ffffff";
/** Pure, for words on a colour: of black and white one always reads past 4.5:1 on any colour at all, and a softer black doesn't. */
const BLACK = "#000000";
/** Behind the words: never less than this, by the arithmetic above. A test holds that the words stand on it. */
export const SCRIM_UNDER_WORDS = 0.74;
/** The light shade the mark stands in, opposite the words: never as dark as the words' own. */
export const SHADE_AT_MOST = 0.5;
const SCRIM_AT_EDGE = 0.92;
const SCRIM_FADE_PX = 300;
const MARGIN_PX = 72;
const LOGO_PX = 104;
/** The ground a mark stands on, so a thin line logo reads on any photo, and how far in the mark sits. */
const LOGO_PLATE = "rgba(13,11,9,0.72)";
const LOGO_INSET_PX = 10;
/** What stands around the words on a ground of their own, and around a framed photo. */
const GROUND_PAD_PX = 56;
const FRAME_MARGIN_PX = 48;
/** What a small line must reach against its ground to be worth setting in the business's colour: large type's own 3:1. */
const COLOUR_READS_AT = 3;
/** The width a character takes of its size in each voice, a little on the long side, so what is laid out for holds what is said. */
const CHAR_EM: Readonly<Record<PostVoice, number>> = { classic: 0.47, modern: 0.54 };
const OVER_PX = 26;
const OVER_GAP_PX = 22;
const UNDER_PX = 34;
const UNDER_LINE = 1.32;
const UNDER_GAP_PX = 22;
const ACT_PX = 28;
const ACT_PAD_Y_PX = 16;
const ACT_GAP_PX = 34;

const box = (style: Record<string, unknown>, ...children: unknown[]): PostNode => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children: children.filter(Boolean) },
});

/** How big a line stands, by how much it has to say: a short one is the picture's headline, a long one still reads on a phone. */
function lineSizeOf(line: string, voice: PostVoice): number {
  const n = Array.from(line).length;
  const size = n <= 16 ? 96 : n <= 26 ? 84 : n <= 40 ? 70 : 58;
  return voice === "modern" ? Math.round(size * 0.92) : size;
}

/** A colour's share of light, by WCAG's reckoning. */
function luminanceOf(color: string): number {
  const share = (at: number) => {
    const v = parseInt(color.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * share(1) + 0.7152 * share(3) + 0.0722 * share(5);
}

const contrastOf = (a: string, b: string): number => {
  const [one, two] = [luminanceOf(a), luminanceOf(b)];
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
};

/** The ink that reads on a colour: black or white, whichever stands further from it. */
function inkOn(color: string): string {
  return contrastOf(BLACK, color) > contrastOf(WHITE, color) ? BLACK : WHITE;
}

/** The business's colour where it reads on this ground, else the fallback: a navy brand's name is lost on a dark scrim. */
const colourOn = (accent: string | null, ground: string, fallback: string): string =>
  accent && contrastOf(accent, ground) >= COLOUR_READS_AT ? accent : fallback;

/** A colour as it is written: a hash and six hex digits. */
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
/** What small type must reach against its ground to be read (WCAG's 4.5 to 1), and what it reaches where it reads well. */
const SMALL_READS_AT = 4.5;
const SMALL_READS_WELL_AT = 7;
/** The lightness a colour is fullest at: lighter than this, it pales towards white. */
const FULLEST_AT = 0.5;
/** Under this spread between its parts a colour has no hue of its own to keep: a black, a grey, a white. */
const HUE_FROM = 0.1;
/** How many times the lightness between two is halved to find the least that reads: past any shade a screen tells apart. */
const HALVINGS = 16;

/** A colour by its hue in degrees, how full it is and how light, each of the last two a share of one. */
interface Shade {
  hue: number;
  fullness: number;
  lightness: number;
}

/** A written colour as its shade, and the spread between its lightest part and its darkest. */
function shadeOf(color: string): Shade & { spread: number } {
  const part = (at: number): number => parseInt(color.slice(at, at + 2), 16) / 255;
  const [r, g, b] = [part(1), part(3), part(5)];
  const lightest = Math.max(r, g, b);
  const spread = lightest - Math.min(r, g, b);
  const lightness = lightest - spread / 2;
  if (spread === 0) return { hue: 0, fullness: 0, lightness, spread };
  const sixth =
    lightest === r ? ((g - b) / spread + 6) % 6 : lightest === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return { hue: sixth * 60, fullness: spread / (1 - Math.abs(2 * lightness - 1)), lightness, spread };
}

/** A shade as it is written (CSS Color 4's own arithmetic). */
function colourOf({ hue, fullness, lightness }: Shade): string {
  const reach = fullness * Math.min(lightness, 1 - lightness);
  const part = (n: number): string => {
    const k = (n + hue / 30) % 12;
    const share = lightness - reach * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(share * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}

/** The least lightness between two at which `reads` holds; it holds at the lighter, by the caller's word. */
function leastLightness(darker: number, lighter: number, reads: (lightness: number) => boolean): number {
  let [under, over] = [darker, lighter];
  for (let i = 0; i < HALVINGS; i++) {
    const between = (under + over) / 2;
    if (reads(between)) over = between;
    else under = between;
  }
  return over;
}

/**
 * The business's colour as it is worn on a dark ground where small type is set in it (a video's end card: its name, and
 * its street under that): the same hue, as light as it must be to be read there. It is lifted until small type reads well
 * on it, where it gets that far with nothing paled; a colour that would have to pale to get there (a red, a violet)
 * comes as full as it gets, and paler only as far as small type needs. One that reads well already is worn as it is, and
 * one with no hue of its own to keep (a black, a grey), or none at all, is the fallback. A gold chosen for white pages
 * stood at 3.97 to 1 on the end card (15 Nov 2026): the name muddy, the street lost on a phone. A post's rule is
 * `colourOn` above: it sets one large line in the colour, and falls back where that is lost.
 */
export function colourOnDark(accent: string | null, ground: string, fallback: string): string {
  if (!accent || !HEX_COLOUR.test(accent)) return fallback;
  const own = shadeOf(accent);
  if (own.spread < HUE_FROM) return fallback;
  const at = (lightness: number): string => colourOf({ ...own, lightness });
  const reads =
    (mark: number) =>
    (lightness: number): boolean =>
      contrastOf(at(lightness), ground) >= mark;
  if (contrastOf(accent, ground) >= SMALL_READS_WELL_AT) return accent;
  if (own.lightness < FULLEST_AT && reads(SMALL_READS_WELL_AT)(FULLEST_AT))
    return at(leastLightness(own.lightness, FULLEST_AT, reads(SMALL_READS_WELL_AT)));
  const fullest = Math.max(own.lightness, FULLEST_AT);
  if (reads(SMALL_READS_AT)(fullest)) return fullest === own.lightness ? accent : at(fullest);
  return at(leastLightness(fullest, 1, reads(SMALL_READS_AT)));
}

const VOICES = {
  classic: {
    line: { fontFamily: "Source Serif 4", fontStyle: "italic", fontWeight: 600, letterSpacing: "-0.01em" },
    under: { fontFamily: "Source Serif 4", fontWeight: 400 },
    over: { fontFamily: "Mona Sans", fontWeight: 600, letterSpacing: "0.22em" },
    act: { fontFamily: "Mona Sans", fontWeight: 600, letterSpacing: "0.02em" },
    lineHeight: 1.08,
  },
  modern: {
    line: { fontFamily: "Mona Sans", fontWeight: 800, letterSpacing: "-0.025em" },
    under: { fontFamily: "Mona Sans", fontWeight: 400 },
    over: { fontFamily: "Mona Sans", fontWeight: 600, letterSpacing: "0.18em" },
    act: { fontFamily: "Mona Sans", fontWeight: 600, letterSpacing: "0.02em" },
    lineHeight: 1.04,
  },
} as const;

/** The colours a post's words are set in, for the ground they stand on. */
interface WordInks {
  over: string;
  line: string;
  under: string;
  actGround: string;
  actInk: string;
}

/** Words over a photo: white on the scrim, whatever the photo is. */
function inksOverPhoto(accent: string | null): WordInks {
  const ground = accent ?? WHITE;
  return {
    over: colourOn(accent, POST_INK, CREAM),
    line: WHITE,
    under: CREAM,
    actGround: ground,
    actInk: inkOn(ground),
  };
}

/** Words on a ground of their own: whichever reads on it, the name in the business's colour where that does too. */
function inksOnGround(ground: string, accent: string | null): WordInks {
  const ink = inkOn(ground);
  return { over: colourOn(accent, ground, ink), line: ink, under: ink, actGround: ink, actInk: ground };
}

/** The words, in the order they are read, from the side they are set to. */
function postWordsOf({ words, voice }: PostLayoutInput, inks: WordInks, side: "center" | "left"): PostNode[] {
  const value = VOICES[voice];
  const set =
    side === "center"
      ? { textAlign: "center", justifyContent: "center" }
      : { textAlign: "left", justifyContent: "flex-start" };
  const parts: (PostNode | null)[] = [
    words.over
      ? box(
          { ...value.over, fontSize: OVER_PX, color: inks.over, textTransform: "uppercase", marginBottom: OVER_GAP_PX },
          words.over,
        )
      : null,
    box(
      {
        ...value.line,
        ...set,
        fontSize: lineSizeOf(words.line, voice),
        lineHeight: value.lineHeight,
        color: inks.line,
        textWrap: "balance",
      },
      words.line,
    ),
    words.under
      ? box(
          {
            ...value.under,
            ...set,
            fontSize: UNDER_PX,
            lineHeight: UNDER_LINE,
            color: inks.under,
            marginTop: UNDER_GAP_PX,
            textWrap: "balance",
          },
          words.under,
        )
      : null,
    words.act
      ? box(
          {
            ...value.act,
            fontSize: ACT_PX,
            color: inks.actInk,
            backgroundColor: inks.actGround,
            padding: `${ACT_PAD_Y_PX}px 34px`,
            borderRadius: 6,
            marginTop: ACT_GAP_PX,
          },
          words.act,
        )
      : null,
  ];
  return parts.filter((p): p is PostNode => !!p);
}

/** Lines some words take, on the long side, so the room laid out always holds them. */
const linesFor = (text: string, px: number, width: number, voice: PostVoice): number =>
  Math.max(1, Math.ceil((Array.from(text).length * px * CHAR_EM[voice]) / width));

/** How tall the words stand, on the long side, at a width. */
function wordsHeightOf({ words, voice }: Pick<PostLayoutInput, "words" | "voice">, width: number): number {
  const v = VOICES[voice];
  const linePx = lineSizeOf(words.line, voice);
  return Math.round(
    (words.over ? OVER_PX * 1.2 + OVER_GAP_PX : 0) +
      linesFor(words.line, linePx, width, voice) * linePx * v.lineHeight +
      (words.under ? linesFor(words.under, UNDER_PX, width, voice) * UNDER_PX * UNDER_LINE + UNDER_GAP_PX : 0) +
      (words.act ? ACT_PX * 1.2 + 2 * ACT_PAD_Y_PX + ACT_GAP_PX : 0),
  );
}

/** How tall the ground the words stand on is: their own height, what stands around them, and what a story's controls cover. */
function groundHeightOf(input: Pick<PostLayoutInput, "shape" | "words" | "voice" | "wordsAt">, inset: number): number {
  const { shape, wordsAt } = input;
  const clear = wordsAt === "bottom" ? shape.clearFoot : shape.clearTop;
  return wordsHeightOf(input, shape.width - 2 * (MARGIN_PX + inset)) + 2 * GROUND_PAD_PX + clear;
}

/**
 * Where the photo shows: the whole page for words over it, and what the words' ground leaves for the others, worked out here so
 * the photo is cropped for the piece it fills and not for a page it is mostly hidden on.
 */
export function postPhotoBox(
  input: Pick<PostLayoutInput, "shape" | "words" | "voice" | "wordsAt" | "layout">,
): PostBox {
  const { shape, wordsAt, layout } = input;
  const page = { left: 0, top: 0, width: shape.width, height: shape.height };
  if (layout === "over" || layout === "left") return page;
  if (layout === "band") {
    const ground = groundHeightOf(input, 0);
    return { ...page, top: wordsAt === "top" ? ground : 0, height: shape.height - ground };
  }
  const ground = groundHeightOf(input, 0);
  return {
    left: FRAME_MARGIN_PX,
    top: wordsAt === "top" ? ground : FRAME_MARGIN_PX,
    width: shape.width - 2 * FRAME_MARGIN_PX,
    height: shape.height - ground - FRAME_MARGIN_PX,
  };
}

/** The mark, on its plate, where it is told to stand. */
function markAt(logo: string | null, style: Record<string, unknown>): PostNode | null {
  if (!logo) return null;
  return box(
    {
      position: "absolute",
      width: LOGO_PX,
      height: LOGO_PX,
      borderRadius: LOGO_PX / 2,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: LOGO_PLATE,
      ...style,
    },
    {
      type: "img",
      props: { src: logo, width: LOGO_PX - 2 * LOGO_INSET_PX, height: LOGO_PX - 2 * LOGO_INSET_PX },
    },
  );
}

/** Words over the photo, centred or from the margin, on a scrim dark enough for any photo; the mark on a light shade opposite. */
function overPhoto(input: PostLayoutInput, side: "center" | "left"): PostNode {
  const { shape, wordsAt, logo, accent } = input;
  const atFoot = wordsAt === "bottom";
  const scrim = (to: string) =>
    `linear-gradient(to ${to}, rgba(0,0,0,0) 0px, rgba(0,0,0,${SCRIM_UNDER_WORDS}) ${SCRIM_FADE_PX}px, rgba(0,0,0,${SCRIM_AT_EDGE}) 100%)`;
  const words = box(
    {
      position: "absolute",
      left: 0,
      right: 0,
      ...(atFoot ? { bottom: 0 } : { top: 0 }),
      flexDirection: "column",
      alignItems: side === "center" ? "center" : "flex-start",
      padding: atFoot
        ? `${SCRIM_FADE_PX}px ${MARGIN_PX}px ${MARGIN_PX + shape.clearFoot}px`
        : `${MARGIN_PX + shape.clearTop + (logo ? LOGO_PX + 28 : 0)}px ${MARGIN_PX}px ${SCRIM_FADE_PX}px`,
      backgroundImage: scrim(atFoot ? "bottom" : "top"),
    },
    ...postWordsOf(input, inksOverPhoto(accent), side),
  );
  const shade =
    atFoot && logo
      ? box({
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 260 + shape.clearTop,
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,${SHADE_AT_MOST}), rgba(0,0,0,0))`,
        })
      : null;
  const mark = markAt(logo, {
    top: 56 + shape.clearTop,
    ...(side === "center" ? { left: (shape.width - LOGO_PX) / 2 } : { left: MARGIN_PX }),
  });
  return box({ position: "relative", width: shape.width, height: shape.height }, shade, words, mark);
}

/** The ground the words stand on when they leave the photo: the business's colour on a band; on a frame, a plain page. */
function groundOf({ layout, accent, voice }: Pick<PostLayoutInput, "layout" | "accent" | "voice">): string {
  if (layout === "band") return accent ?? POST_INK;
  return voice === "classic" ? CREAM : POST_INK;
}

/** Words on a ground of their own beside the photo, which stays sharp and whole: the page is opaque all but the photo's piece. */
function besidePhoto(input: PostLayoutInput): PostNode {
  const { shape, wordsAt, logo, accent } = input;
  const photo = postPhotoBox(input);
  const ground = groundOf(input);
  const atFoot = wordsAt === "bottom";
  const edge = { position: "absolute", backgroundColor: ground } as const;
  const wordsTop = atFoot ? photo.top + photo.height : 0;
  const wordsHeight = atFoot ? shape.height - wordsTop : photo.top;
  // Two boxes: an absolute box that holds its own padding and centres what is in it counts that padding twice, and the words sit low.
  const words = box(
    {
      ...edge,
      left: 0,
      right: 0,
      top: wordsTop,
      height: wordsHeight,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    },
    box(
      {
        flexDirection: "column",
        alignItems: "center",
        padding: `${atFoot ? 0 : shape.clearTop}px ${MARGIN_PX}px ${atFoot ? shape.clearFoot : 0}px`,
      },
      ...postWordsOf(input, inksOnGround(ground, accent), "center"),
    ),
  );
  // What a frame has around the photo, on the three sides the words do not take.
  const rim =
    input.layout === "frame"
      ? [
          box({ ...edge, left: 0, width: photo.left, top: 0, bottom: 0 }),
          box({ ...edge, right: 0, width: photo.left, top: 0, bottom: 0 }),
          atFoot
            ? box({ ...edge, left: 0, right: 0, top: 0, height: photo.top })
            : box({ ...edge, left: 0, right: 0, bottom: 0, height: FRAME_MARGIN_PX }),
        ]
      : [];
  const mark = markAt(logo, {
    top: photo.top + Math.max(FRAME_MARGIN_PX, photo.top === 0 ? shape.clearTop + 56 : 0),
    left: (shape.width - LOGO_PX) / 2,
  });
  return box({ position: "relative", width: shape.width, height: shape.height }, ...rim, words, mark);
}

/** The transparent page over the photo: the mark, and the words where the layout sets them. */
export function postLayout(input: PostLayoutInput): PostNode {
  switch (input.layout) {
    case "over":
      return overPhoto(input, "center");
    case "left":
      return overPhoto(input, "left");
    default:
      return besidePhoto(input);
  }
}

/** Whether the words stand over the photo, so what is under them must be softened and kept clear of its subject. */
export const wordsOverPhoto = (layout: PostLayoutName): boolean => layout === "over" || layout === "left";

/**
 * What of a photo a piece of the page shows: the largest part of that shape the photo holds, around the subject where the look found
 * one, its middle otherwise. Where words lie over the photo it stands a little away from them. Never tighter than the shape needs.
 */
export function postCrop(
  photo: { width: number; height: number },
  shape: Pick<PostShape, "width" | "height">,
  subject: readonly [number, number, number, number] | null,
  wordsAt: "top" | "bottom" | null,
): PostBox {
  const aspect = shape.width / shape.height;
  const width = Math.min(photo.width, Math.round(photo.height * aspect));
  const height = Math.min(photo.height, Math.round(width / aspect));
  const [x1, y1, x2, y2] = subject ?? [0.5, 0.5, 0.5, 0.5];
  const centerX = ((x1 + x2) / 2) * photo.width;
  const centerY = ((y1 + y2) / 2) * photo.height;
  const standsAt = subject && wordsAt ? (wordsAt === "bottom" ? 0.42 : 0.58) : 0.5;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  return {
    left: clamp(centerX - width / 2, photo.width - width),
    top: clamp(centerY - height * standsAt, photo.height - height),
    width,
    height,
  };
}
