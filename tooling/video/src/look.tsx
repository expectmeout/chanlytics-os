// What every shape wears: the face, the opening words on their backing, a block's caption, the two cards, and the end card. Each draws what it is handed; where the
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
import { PIECE_CARD, PIECE_FRAME, PIECE_SIDE } from "../../../packages/contracts/src/content/piece-frame";
import type { PieceTimeline } from "../../../packages/contracts/src/content/piece-timeline";

export const FACE = "Mona Sans";
export const INK = PIECE_FRAME.ink;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const outExpo = Easing.bezier(0.16, 1, 0.3, 1);

/** The face's weights, as image.mjs copies them beside the bundle from the posts' own font files. */
const WEIGHTS = [
  ["600", "fonts/mona-sans-600.woff"],
  ["800", "fonts/mona-sans-800.woff"],
] as const;

/** Holds the render until the face is loaded: a frame drawn before it would be set in whatever the machine has. */
export function useFace(): void {
  const [handle] = useState(() => delayRender("the face"));
  useEffect(() => {
    Promise.all(
      WEIGHTS.map(async ([weight, file]) => {
        const face = new FontFace(FACE, `url(${staticFile(file)})`, { weight });
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
export function Words({ words }: { words: PieceTimeline["words"] }) {
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
              fontFamily: FACE,
              fontWeight: 800,
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

/** White words as every block sets them: the face at its heaviest, a line never wrapped. */
const SET = {
  fontFamily: FACE,
  fontWeight: 800,
  lineHeight: PIECE_FRAME.wordsLeading,
  color: "#fff",
  whiteSpace: "nowrap",
} as const;

/**
 * A block's own caption: one line on the words' backing, at the foot of its picture and clear of what a phone app draws
 * there. `bottom` is how far its foot stands from the frame's (a pair's upper picture ends at the frame's middle).
 */
export function Label({ label, bottom = PIECE_FRAME.clearBottom }: { label: string; bottom?: number }) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        ...SET,
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

/** A words card: its lines centred on the end card's ground at the size they were fitted to, under a rule in the business's colour. */
export function WordsCard({ lines, size, accent }: { lines: readonly string[]; size: number; accent: string }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: INK,
        justifyContent: "center",
        alignItems: "center",
        gap: PIECE_FRAME.wordsGap,
        paddingBottom: 2 * PIECE_CARD.lift,
      }}
    >
      <div style={{ width: 96, height: 8, borderRadius: 4, background: accent, marginBottom: 40, ...rise(frame, 0) }} />
      {lines.map((line, i) => (
        <div key={i} style={{ ...SET, fontSize: size, ...rise(frame, 2 + 3 * i) }}>
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
  children,
}: {
  lines: readonly string[];
  size: number;
  from: string | null;
  accent: string;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const edge = PIECE_SIDE + PIECE_FRAME.wordsPadSide;
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
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
        <div style={{ ...SET, fontSize: 220, lineHeight: 1, height: 120, color: accent, ...rise(frame, 0) }}>“</div>
        {lines.map((line, i) => (
          <div key={i} style={{ ...SET, fontSize: size, ...rise(frame, 2 + 2 * i) }}>
            {line}
          </div>
        ))}
        {from ? (
          <div
            style={{
              ...SET,
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

/** The end card: its own line, the business's mark where it has one, its name, its booking line and where it is. */
export function EndCard({ end, logo, accent }: { end: PieceTimeline["end"]; logo: string | null; accent: string }) {
  const frame = useCurrentFrame();
  const said = { fontFamily: FACE, textAlign: "center", padding: "0 60px", textWrap: "balance" } as const;
  return (
    <AbsoluteFill
      style={{ backgroundColor: INK, justifyContent: "center", alignItems: "center", gap: 24, paddingBottom: 80 }}
    >
      {end.line ? (
        <div style={{ ...said, fontWeight: 800, fontSize: 80, lineHeight: 1.1, color: "#fff", ...rise(frame, 0) }}>
          {end.line}
        </div>
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
      <div style={{ ...said, fontWeight: 800, fontSize: 64, lineHeight: 1.15, color: accent, ...rise(frame, 8) }}>
        {end.name}
      </div>
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
