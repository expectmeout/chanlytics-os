/**
 * A post's words and marks, laid out (decision 0099, step 3). Pure: what goes where on a transparent page over the photo, as the
 * tree satori draws, so a node test can hold every case and no model touches a layout (decision 0075). The contrast is by
 * arithmetic: white words on black at 0.6 or more read above 4.5:1 over any photo, so the words only ever stand on that much.
 */

import type { PostShapeName, PostVoice } from "@chanlytics/contracts";

/** A shape a post is made in, and what stays clear of the phone's own controls. */
export interface PostShape {
  name: PostShapeName;
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
} as const satisfies Record<PostShapeName, PostShape>;

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

const INK = "#0d0b09";
const CREAM = "#faf5e8";
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

const box = (style: Record<string, unknown>, ...children: unknown[]): PostNode => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children: children.filter(Boolean) },
});

/** How big a line stands, by how much it has to say: a short one is the picture's headline, a long one still reads on a phone. */
export function lineSizeOf(line: string, voice: PostVoice): number {
  const n = Array.from(line).length;
  const size = n <= 16 ? 96 : n <= 26 ? 84 : n <= 40 ? 70 : 58;
  return voice === "modern" ? Math.round(size * 0.92) : size;
}

/** The ink that reads on a colour: black or white, whichever stands further from it. */
export function inkOn(color: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(color.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? INK : "#ffffff";
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

/** The words, in the order they are read. */
function wordsOf({ words, voice, accent }: PostLayoutInput): PostNode[] {
  const v = VOICES[voice];
  const parts: (PostNode | null)[] = [
    words.over
      ? box(
          { ...v.over, fontSize: 26, color: accent ?? CREAM, textTransform: "uppercase", marginBottom: 22 },
          words.over,
        )
      : null,
    box(
      {
        ...v.line,
        fontSize: lineSizeOf(words.line, voice),
        lineHeight: v.lineHeight,
        color: "#ffffff",
        textAlign: "center",
        justifyContent: "center",
        textWrap: "balance",
      },
      words.line,
    ),
    words.under
      ? box(
          {
            ...v.under,
            fontSize: 34,
            lineHeight: 1.32,
            color: CREAM,
            textAlign: "center",
            justifyContent: "center",
            marginTop: 22,
            textWrap: "balance",
          },
          words.under,
        )
      : null,
    words.act
      ? box(
          {
            ...v.act,
            fontSize: 28,
            color: inkOn(accent ?? "#ffffff"),
            backgroundColor: accent ?? "#ffffff",
            padding: "16px 34px",
            borderRadius: 6,
            marginTop: 34,
          },
          words.act,
        )
      : null,
  ];
  return parts.filter((p): p is PostNode => !!p);
}

/** The transparent page over the photo: the mark at one edge, and the words on their scrim at the edge `wordsAt` names. */
export function postLayout(input: PostLayoutInput): PostNode {
  const { shape, wordsAt, logo } = input;
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
      alignItems: "center",
      padding: atFoot
        ? `${SCRIM_FADE_PX}px ${MARGIN_PX}px ${MARGIN_PX + shape.clearFoot}px`
        : `${MARGIN_PX + shape.clearTop + (logo ? LOGO_PX + 28 : 0)}px ${MARGIN_PX}px ${SCRIM_FADE_PX}px`,
      backgroundImage: scrim(atFoot ? "bottom" : "top"),
    },
    ...wordsOf(input),
  );
  const shade = atFoot
    ? box({
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: 260 + shape.clearTop,
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,${SHADE_AT_MOST}), rgba(0,0,0,0))`,
      })
    : null;
  const mark = logo
    ? box(
        {
          position: "absolute",
          top: 56 + shape.clearTop,
          left: (shape.width - LOGO_PX) / 2,
          width: LOGO_PX,
          height: LOGO_PX,
          borderRadius: LOGO_PX / 2,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: LOGO_PLATE,
        },
        {
          type: "img",
          props: { src: logo, width: LOGO_PX - 2 * LOGO_INSET_PX, height: LOGO_PX - 2 * LOGO_INSET_PX },
        },
      )
    : null;
  return box({ position: "relative", width: shape.width, height: shape.height }, shade, words, mark);
}

/**
 * What of a photo a shape shows: the largest piece of that shape the photo holds, around the subject where the look found one, its
 * middle otherwise. It stands a little away from the words, so the words do not lie on it. Never tighter than the shape needs.
 */
export function postCrop(
  photo: { width: number; height: number },
  shape: Pick<PostShape, "width" | "height">,
  subject: readonly [number, number, number, number] | null,
  wordsAt: "top" | "bottom",
): { left: number; top: number; width: number; height: number } {
  const aspect = shape.width / shape.height;
  const width = Math.min(photo.width, Math.round(photo.height * aspect));
  const height = Math.min(photo.height, Math.round(width / aspect));
  const [x1, y1, x2, y2] = subject ?? [0.5, 0.5, 0.5, 0.5];
  const centerX = ((x1 + x2) / 2) * photo.width;
  const centerY = ((y1 + y2) / 2) * photo.height;
  const standsAt = subject ? (wordsAt === "bottom" ? 0.42 : 0.58) : 0.5;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  return {
    left: clamp(centerX - width / 2, photo.width - width),
    top: clamp(centerY - height * standsAt, photo.height - height),
    width,
    height,
  };
}
