// A video in blocks: whatever the plan arranged, in its order (a clip's moment, a photo, a before-and-after pair, a words card, a
// quote card), under the opening words where it opens on a picture, then the end card. "Hook first" is a plan of clip blocks and
// is drawn here as it was by hook-cut.tsx, frame for frame. Everything drawn comes from the props, the material the plan's
// checker compiled (contracts PieceMaterial): which block, for how long, at what size. Nothing is read from anywhere else.
import { Video } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import type { ReactNode } from "react";
import { AbsoluteFill, Freeze, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { PIECE_FRAME } from "../../../packages/contracts/src/content/piece-frame";
import type {
  PieceBlockDrawn,
  PieceMaterial,
  PieceShotDrawn,
} from "../../../packages/contracts/src/content/piece-timeline";
import { EndCard, INK, Label, QuoteCard, Words, WordsCard, useFace } from "./look";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const FILL = { width: "100%", height: "100%" } as const;
/** Where a photo is held when it is cropped to fill: across its middle, and down it where the frame's numbers say. */
const HELD_AT = `50% ${PIECE_FRAME.heldAt * 100}%`;

/** What it holds, pushing in over its frames so a still moment still moves; `drift` carries it up by that many pixels as it goes. */
function Pushed({
  frames,
  scales,
  drift = 0,
  children,
}: {
  frames: number;
  scales: readonly [number, number];
  drift?: number;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, frames], [scales[0], scales[1]], clamp);
  const lift = interpolate(frame, [0, frames], [drift / 2, -drift / 2], clamp);
  return <AbsoluteFill style={{ scale: String(scale), translate: `0px ${lift}px` }}>{children}</AbsoluteFill>;
}

/** A picture shown still, filling what holds it: a photo, or one moment of a clip, held. */
function Still({ file, shot, fps }: { file: string; shot: PieceShotDrawn; fps: number }) {
  if (shot.at === null)
    return <Img src={staticFile(file)} style={{ ...FILL, objectFit: "cover", objectPosition: HELD_AT }} />;
  return (
    <Freeze frame={0}>
      <Video src={staticFile(file)} trimBefore={Math.round(shot.at * fps)} muted objectFit="cover" style={FILL} />
    </Freeze>
  );
}

type Drawn<K extends PieceBlockDrawn["is"]> = Extract<PieceBlockDrawn, { is: K }>;

/** A clip's moment: its stretch of its clip, filling the frame, pushing in slightly. */
function ClipBlock({ block, file, fps }: { block: Drawn<"clip">; file: string; fps: number }) {
  return (
    <AbsoluteFill>
      <Pushed frames={block.frames} scales={[1, 1.05]}>
        <Video src={staticFile(file)} trimBefore={Math.round(block.trim * fps)} muted objectFit="cover" style={FILL} />
      </Pushed>
      {block.label ? <Label label={block.label} /> : null}
    </AbsoluteFill>
  );
}

/** A photo, filling the frame: it pushes in and drifts up, so a still is never a frozen frame. */
function PhotoBlock({ block, file, fps }: { block: Drawn<"photo">; file: string; fps: number }) {
  return (
    <AbsoluteFill>
      <Pushed frames={block.frames} scales={[1.02, 1.1]} drift={24}>
        <Still file={file} shot={{ source: block.source, at: null }} fps={fps} />
      </Pushed>
      {block.label ? <Label label={block.label} /> : null}
    </AbsoluteFill>
  );
}

/** Before over after: each fills its half of the frame, a rule of the paper between, each under its own name. */
function PairBlock({ block, files, fps }: { block: Drawn<"pair">; files: readonly string[]; fps: number }) {
  const half = (PIECE_FRAME.height - PIECE_FRAME.pairRule) / 2;
  const lower = half + PIECE_FRAME.pairRule;
  const held = (shot: PieceShotDrawn, file: string, top: number) => (
    <div style={{ position: "absolute", left: 0, top, width: "100%", height: half, overflow: "hidden" }}>
      <Pushed frames={block.frames} scales={[1, 1.04]}>
        <Still file={file} shot={shot} fps={fps} />
      </Pushed>
    </div>
  );
  return (
    <AbsoluteFill style={{ backgroundColor: PIECE_FRAME.paper }}>
      {held(block.before, files[0] ?? "", 0)}
      {held(block.after, files[1] ?? "", lower)}
      <Label label={block.labels[0]} bottom={lower + PIECE_FRAME.labelLift} />
      <Label label={block.labels[1]} />
    </AbsoluteFill>
  );
}

/** One block, by its kind. `files` are the names its own files were fetched under, in its own order. */
function Block({
  block,
  files,
  fps,
  accent,
}: {
  block: PieceBlockDrawn;
  files: readonly string[];
  fps: number;
  accent: string;
}) {
  const first = files[0] ?? "";
  switch (block.is) {
    case "clip":
      return <ClipBlock block={block} file={first} fps={fps} />;
    case "photo":
      return <PhotoBlock block={block} file={first} fps={fps} />;
    case "pair":
      return <PairBlock block={block} files={files} fps={fps} />;
    case "words":
      return <WordsCard lines={block.lines} size={block.size} accent={accent} />;
    case "quote":
      return (
        <QuoteCard lines={block.lines} size={block.size} from={block.from} accent={accent}>
          {block.over ? (
            <Pushed frames={block.frames} scales={[1.02, 1.08]}>
              <Still file={first} shot={block.over} fps={fps} />
            </Pushed>
          ) : null}
        </QuoteCard>
      );
  }
}

const isCard = (block: PieceBlockDrawn | undefined): boolean => block?.is === "words" || block?.is === "quote";

function Reel({ timeline, files }: Pick<PieceMaterial, "timeline" | "files">) {
  const frame = useCurrentFrame();
  let from = 0;
  const starts = timeline.blocks.map((block) => {
    const at = from;
    from += block.frames;
    return at;
  });
  // The opening words are over pictures alone: a card carries its own, so they stand aside while one plays.
  const playing = timeline.blocks.filter((_, i) => (starts[i] ?? 0) <= frame).at(-1);
  const worded = timeline.words.lines.length > 0 && !isCard(playing);
  return (
    <AbsoluteFill>
      {timeline.blocks.map((block, i) => (
        <Sequence key={i} from={starts[i] ?? 0} durationInFrames={block.frames}>
          <Block block={block} files={files[i] ?? []} fps={timeline.fps} accent={timeline.accent} />
        </Sequence>
      ))}
      {worded ? <Words words={timeline.words} /> : null}
    </AbsoluteFill>
  );
}

export function Blocks({ timeline, files, logo }: PieceMaterial) {
  useFace();
  const reel = timeline.blocks.reduce((n, block) => n + block.frames, 0);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={reel}>
          <Reel timeline={timeline} files={files} />
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
