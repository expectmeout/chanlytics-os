/**
 * How the ad will read, in New ad's step 2: the drawer's own preview (AdPreview: the neutral frame, the capsule, then what
 * happens when they tap, call or send the form), with the Feed | Story | Reel choice held here so it survives a step. The
 * amber line about a price the receptionist never quotes is said once, under "What it's about", not again here.
 */
import { NEW_AD, PREVIEW } from "@chanlytics/contracts/ads-page";
import type { NewAdVM } from "@chanlytics/contracts/ads-page";
import { Segmented } from "../../../kit/segmented/segmented";
import { AdPreview } from "../drawer/preview";
import type { FrameKind } from "../drawer/preview";
import { Sec } from "./new-bits";

const FRAME_ORDER: readonly FrameKind[] = ["feed", "story", "reel"];

interface PreviewBlockProps {
  vm: NewAdVM;
  frame: FrameKind;
  onFrame: (frame: FrameKind) => void;
}

export function PreviewBlock({ vm, frame, onFrame }: PreviewBlockProps) {
  const preview = vm.drawer.preview;
  return (
    <Sec label={PREVIEW.fold} className="ads-new-pv">
      {preview.frames.length > 0 ? (
        <Segmented
          label={NEW_AD.step2.frameLabel}
          value={frame}
          onValueChange={onFrame}
          options={FRAME_ORDER.map((value, at) => ({
            value,
            label: preview.frames.at(at) ?? value,
            testid: `ads-new-frame-${value}`,
          }))}
        />
      ) : null}
      <AdPreview preview={{ ...preview, warn: null }} frame={frame} />
    </Sec>
  );
}
