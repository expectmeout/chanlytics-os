// What every shape wears: the face, the opening words on their backing, and the end card. Each draws what it is handed; where the
// words sit and how large they are was worked out by the plan's checker (contracts piece-timeline.ts) from the numbers in
// piece-frame.ts, which this reads too, so the storyboard a person saw and the video agree to the pixel.
import { useEffect, useState } from "react";
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
import { PIECE_FRAME } from "../../../packages/contracts/src/content/piece-frame";
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
