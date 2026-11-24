// What every shape wears: the face, the opening words on their backing, a block's caption, the spoken words burned in, the two cards,
// and the end card. Each draws what it is handed, in the face the brand kit set (Mona Sans, or Source Serif 4's italic); where the
// words sit and how large they are was worked out by the plan's checker (contracts piece-timeline.ts) from the numbers in
// piece-frame.ts, which this reads too, so the storyboard a person saw and the video agree to the pixel.
import { useEffect, useState, type ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  PIECE_CARD,
  PIECE_FRAME,
  PIECE_SIDE,
  type PieceFace,
} from "../../../packages/contracts/src/content/piece-frame";
import type { PieceCaption } from "../../../packages/contracts/src/content/making/captions";
import type { PieceTimeline } from "../../../packages/contracts/src/content/piece-timeline";

export const FACE = "Mona Sans";
const SERIF = "Source Serif 4";
export const INK = PIECE_FRAME.ink;

/** How a face sets the words a video says: Mona Sans at its heaviest, or Source Serif 4's italic at 600. */
const SETS: Record<PieceFace, { fontFamily: string; fontWeight: number; fontStyle: "normal" | "italic" }> = {
  sans: { fontFamily: FACE, fontWeight: 800, fontStyle: "normal" },
  serif: { fontFamily: SERIF, fontWeight: 600, fontStyle: "italic" },
};
/** A face as it is set: the material an edge a deploy behind sends holds no face, and is set as every video was. */
export const setIn = (face: PieceFace | undefined) => SETS[face ?? "sans"];
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const outExpo = Easing.bezier(0.16, 1, 0.3, 1);

/** The faces' weights, as image.mjs copies them beside the bundle from the posts' own font files. */
const WEIGHTS = [
  [FACE, "600", "normal", "fonts/mona-sans-600.woff"],
  [FACE, "800", "normal", "fonts/mona-sans-800.woff"],
  [SERIF, "600", "italic", "fonts/source-serif-4-600-italic.woff"],
] as const;

/** Holds the render until the face is loaded: a frame drawn before it would be set in whatever the machine has. */
export function useFace(): void {
  const [handle] = useState(() => delayRender("the face"));
  useEffect(() => {
    Promise.all(
      WEIGHTS.map(async ([family, weight, style, file]) => {
        const face = new FontFace(family, `url(${staticFile(file)})`, { weight, style });
        document.fonts.add(await face.load());
      }),
    )
      .then(() => continueRender(handle))
      .catch((e: unknown) => {
        throw e instanceof Error ? e : new Error(String(e));
      });
  }, [handle]);
}

const rise = (frame: number, from: number) => ({
  opacity: interpolate(frame, [from, from + 10], [0, 1], clamp),
  translate: interpolate(frame, [from, from + 14], ["0px 26px", "0px 0px"], { ...clamp, easing: outExpo }),
});

/** The opening words on their backing: each line on one line, at the size it was fitted to, leaving when its frames are up. */
export function Words({ words, face }: { words: PieceTimeline["words"]; face: PieceFace | undefined }) {
  const frame = useCurrentFrame();
  const side = (PIECE_FRAME.width - PIECE_FRAME.wordsWidth) / 2 - PIECE_FRAME.wordsPadSide;
  return (
    <div
      style={{
        position: "absolute",
        top: words.top,
        left: side,
        right: side,
        display: "flex",
        justifyContent: "center",
        opacity: words.frames === null ? 1 : interpolate(frame, [words.frames - 10, words.frames], [1, 0], clamp),
      }}
    >
      <div
        style={{
          padding: `${PIECE_FRAME.wordsPad}px ${PIECE_FRAME.wordsPadSide}px`,
          borderRadius: 28,
          background: "rgba(0,0,0,.52)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: PIECE_FRAME.wordsGap,
          translate: interpolate(frame, [0, 16], ["0px 30px", "0px 0px"], { ...clamp, easing: outExpo }),
        }}
      >
        {words.lines.map((line, i) => (
          <div
            key={i}
            style={{
              ...setIn(face),
              fontSize: words.size,
              lineHeight: PIECE_FRAME.wordsLeading,
              color: "#fff",
              textAlign: "center",
              whiteSpace: "nowrap",
              textShadow: "0 4px 24px rgba(0,0,0,.6)",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

/** White words as every block sets them, in the kit's face: a line never wrapped. */
const setWhite = (face: PieceFace | undefined) =>
  ({ ...setIn(face), lineHeight: PIECE_FRAME.wordsLeading, color: "#fff", whiteSpace: "nowrap" }) as const;

/**
 * A block's own caption: one line on the words' backing, at the foot of its picture and clear of what a phone app draws
 * there. `bottom` is how far its foot stands from the frame's (a pair's upper picture ends at the frame's middle).
 */
export function Label({
  label,
  face,
  bottom = PIECE_FRAME.clearBottom,
}: {
  label: string;
  face: PieceFace | undefined;
  bottom?: number;
}) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        ...setWhite(face),
        position: "absolute",
        left: PIECE_SIDE,
        bottom,
        padding: `${PIECE_FRAME.labelPad}px ${PIECE_FRAME.labelPadSide}px`,
        borderRadius: 18,
        background: "rgba(0,0,0,.52)",
        fontSize: PIECE_FRAME.labelSize,
        ...rise(frame, 3),
      }}
    >
      {label}
    </div>
  );
}

/**
 * The spoken words burned in: each caption over its own frames, centred on the words' backing, its foot where the checker
 * stood it (clear of what a phone app draws, and of a block's own caption). It comes and goes in a few frames, never a jump.
 */
export function Spoken({
  captions,
  face,
}: {
  captions: readonly PieceCaption[] | undefined;
  face: PieceFace | undefined;
}) {
  const frame = useCurrentFrame();
  const on = (captions ?? []).find((c) => frame >= c.from && frame < c.from + c.frames);
  if (!on) return null;
  const local = frame - on.from;
  return (
    <div
      style={{
        position: "absolute",
        left: PIECE_SIDE,
        right: PIECE_SIDE,
        bottom: on.bottom,
        display: "flex",
        justifyContent: "center",
        opacity: interpolate(local, [0, 3, Math.max(4, on.frames - 3), Math.max(5, on.frames)], [0, 1, 1, 0], clamp),
      }}
    >
      <div
        style={{
          padding: `${PIECE_FRAME.captionPad}px ${PIECE_FRAME.captionPadSide}px`,
          borderRadius: 20,
          background: "rgba(0,0,0,.6)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: PIECE_FRAME.captionGap,
        }}
      >
        {on.lines.map((line, i) => (
          <div key={i} style={{ ...setWhite(face), fontSize: PIECE_FRAME.captionSize, textAlign: "center" }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A words card: its lines centred on the cards' ground at the size they were fitted to, under a rule in the business's colour. */
export function WordsCard({
  lines,
  size,
  accent,
  face,
  ground,
}: {
  lines: readonly string[];
  size: number;
  accent: string;
  face: PieceFace | undefined;
  ground: string | undefined;
}) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: ground ?? INK,
        justifyContent: "center",
        alignItems: "center",
        gap: PIECE_FRAME.wordsGap,
        paddingBottom: 2 * PIECE_CARD.lift,
      }}
    >
      <div style={{ width: 96, height: 8, borderRadius: 4, background: accent, marginBottom: 40, ...rise(frame, 0) }} />
      {lines.map((line, i) => (
        <div key={i} style={{ ...setWhite(face), fontSize: size, ...rise(frame, 2 + 3 * i) }}>
          {line}
        </div>
      ))}
    </AbsoluteFill>
  );
}

/**
 * A quote card: someone's own words, wrapped as the checker wrapped them, under an opening mark in the business's colour
 * and over who said it. Its ground is the picture it was given (`children`), darkened so the words read, or the end card's.
 */
export function QuoteCard({
  lines,
  size,
  from,
  accent,
  face,
  ground,
  children,
}: {
  lines: readonly string[];
  size: number;
  from: string | null;
  accent: string;
  face: PieceFace | undefined;
  ground: string | undefined;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const edge = PIECE_SIDE + PIECE_FRAME.wordsPadSide;
  return (
    <AbsoluteFill style={{ backgroundColor: ground ?? INK }}>
      {children}
      {children ? <AbsoluteFill style={{ background: `rgba(0,0,0,${PIECE_CARD.dim})` }} /> : null}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "flex-start",
          gap: PIECE_FRAME.wordsGap,
          padding: `0 ${edge}px ${2 * PIECE_CARD.lift}px`,
        }}
      >
        <div style={{ ...setWhite(face), fontSize: 220, lineHeight: 1, height: 120, color: accent, ...rise(frame, 0) }}>
          “
        </div>
        {lines.map((line, i) => (
          <div key={i} style={{ ...setWhite(face), fontSize: size, ...rise(frame, 2 + 2 * i) }}>
            {line}
          </div>
        ))}
        {from ? (
          <div
            style={{
              ...setWhite(undefined),
              fontWeight: 600,
              fontSize: PIECE_CARD.fromSize,
              color: "rgba(255,255,255,.72)",
              marginTop: 30,
              ...rise(frame, 4 + 2 * lines.length),
            }}
          >
            {from}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/**
 * The end card: its own line, the business's mark where it has one, its name, the kit's own call, its booking line and
 * where it is. Its line and the name are set in the kit's face; the lines under them in Mona Sans, read at a glance.
 */
export function EndCard({
  end,
  logo,
  accent,
  face,
}: {
  end: PieceTimeline["end"];
  logo: string | null;
  accent: string;
  face: PieceFace | undefined;
}) {
  const frame = useCurrentFrame();
  const said = { fontFamily: FACE, textAlign: "center", padding: "0 60px", textWrap: "balance" } as const;
  const voiced = { ...said, ...setIn(face) } as const;
  return (
    <AbsoluteFill
      style={{ backgroundColor: INK, justifyContent: "center", alignItems: "center", gap: 24, paddingBottom: 80 }}
    >
      {end.line ? (
        <div style={{ ...voiced, fontSize: 80, lineHeight: 1.1, color: "#fff", ...rise(frame, 0) }}>{end.line}</div>
      ) : null}
      {end.under ? (
        <div style={{ ...said, fontWeight: 600, fontSize: 44, color: accent, marginBottom: 30, ...rise(frame, 4) }}>
          {end.under}
        </div>
      ) : null}
      {/* A workspace's mark is a small square (contracts LOGO_SIDE): drawn near its own size, never stretched, over the name. */}
      {end.logo && logo ? (
        <Img
          src={staticFile(logo)}
          style={{ width: 240, height: 240, borderRadius: 40, objectFit: "cover", ...rise(frame, 6) }}
        />
      ) : null}
      <div style={{ ...voiced, fontSize: 64, lineHeight: 1.15, color: accent, ...rise(frame, 8) }}>{end.name}</div>
      {end.call ? (
        <div style={{ ...said, fontWeight: 600, fontSize: 48, color: "#fff", marginTop: 12, ...rise(frame, 11) }}>
          {end.call}
        </div>
      ) : null}
      {end.book ? (
        <div style={{ ...said, fontWeight: 600, fontSize: 44, color: "#fff", marginTop: 20, ...rise(frame, 14) }}>
          {end.book}
        </div>
      ) : null}
      {end.address ? (
        <div style={{ ...said, fontWeight: 600, fontSize: 36, color: accent, ...rise(frame, 18) }}>{end.address}</div>
      ) : null}
    </AbsoluteFill>
  );
}
