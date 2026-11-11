// "Hook first": the result on the first frame under the opening words, then how it got there, then the end card. Everything it
// draws comes from its props, the material the plan's checker compiled (contracts PieceMaterial). Nothing is read from anywhere else.
import { Video } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { PIECE_FRAME } from "../../../packages/contracts/src/content/piece-frame";
import type { PieceMaterial } from "../../../packages/contracts/src/content/piece-timeline";
import { EndCard, INK, Words, useFace } from "./look";

/** One cut: its stretch of its clip, filling the frame, pushing in slightly so a still moment still moves. */
function Cut({ file, trim, frames, fps }: { file: string; trim: number; frames: number; fps: number }) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, frames], [1, 1.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ scale: String(scale) }}>
      <Video
        src={staticFile(file)}
        trimBefore={Math.round(trim * fps)}
        muted
        objectFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
}

function Reel({ timeline, cuts }: Pick<PieceMaterial, "timeline" | "cuts">) {
  let from = 0;
  return (
    <AbsoluteFill>
      {timeline.cuts.map((cut, i) => {
        const at = from;
        from += cut.frames;
        return (
          <Sequence key={i} from={at} durationInFrames={cut.frames}>
            <Cut file={cuts[i] ?? ""} trim={cut.trim} frames={cut.frames} fps={timeline.fps} />
          </Sequence>
        );
      })}
      <Words words={timeline.words} />
    </AbsoluteFill>
  );
}

export function HookCut({ timeline, cuts, logo }: PieceMaterial) {
  useFace();
  const reel = timeline.cuts.reduce((n, c) => n + c.frames, 0);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={reel}>
          <Reel timeline={timeline} cuts={cuts} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: PIECE_FRAME.fade })}
        />
        <TransitionSeries.Sequence durationInFrames={PIECE_FRAME.end}>
          <EndCard end={timeline.end} logo={logo} accent={timeline.accent} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
