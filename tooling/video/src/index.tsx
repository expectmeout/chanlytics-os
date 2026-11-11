// The template's compositions, each named for a plan's shape with a hyphen where the shape has an underscore (the renderer takes no
// underscore in a name; contracts pieceCompositionOf). `sample-clip` is not a shape: it draws a few seconds of moving
// picture with nothing but code, so the image's proof has a clip to cut from without any business's footage (image.mjs).
import { AbsoluteFill, Composition, interpolate, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { PIECE_FRAME } from "../../../packages/contracts/src/content/piece-frame";
import type { PieceMaterial } from "../../../packages/contracts/src/content/piece-timeline";
import { HookCut } from "./hook-cut";

/** What the studio and the bundle's own check draw where nothing was handed in: one cut, so the shape is whole. */
const SAMPLE: PieceMaterial = {
  timeline: {
    width: PIECE_FRAME.width,
    height: PIECE_FRAME.height,
    fps: PIECE_FRAME.fps,
    frames: 90 + PIECE_FRAME.end - PIECE_FRAME.fade,
    cuts: [{ source: "sample", trim: 0, frames: 90 }],
    words: { lines: ["Sample"], top: PIECE_FRAME.wordsHighTop, size: PIECE_FRAME.wordsSizeMax, frames: null },
    end: { line: null, under: null, logo: false, name: "Sample", book: null, address: null },
    accent: "#ffffff",
  },
  cuts: ["sample.mp4"],
  logo: null,
};

/** A clip made of nothing: a field that turns, with the second counted on it, so a cut's place in it can be seen. */
function SampleClip() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const turn = interpolate(frame, [0, durationInFrames], [0, 360]);
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${turn}deg, #24506e, #c98a4b)`,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "sans-serif",
        fontSize: 220,
        fontWeight: 800,
        color: "#fff",
      }}
    >
      {(frame / fps).toFixed(1)}
    </AbsoluteFill>
  );
}

function Root() {
  return (
    <>
      <Composition
        id="hook-cut"
        component={HookCut}
        fps={PIECE_FRAME.fps}
        width={PIECE_FRAME.width}
        height={PIECE_FRAME.height}
        durationInFrames={SAMPLE.timeline.frames}
        defaultProps={SAMPLE}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.timeline.frames,
          fps: props.timeline.fps,
          width: props.timeline.width,
          height: props.timeline.height,
        })}
      />
      <Composition id="sample-clip" component={SampleClip} fps={30} width={720} height={1280} durationInFrames={360} />
    </>
  );
}

registerRoot(Root);
