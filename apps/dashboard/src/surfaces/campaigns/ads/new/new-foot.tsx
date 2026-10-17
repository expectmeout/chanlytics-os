/**
 * New ad's foot, on every step (the reach-out sheet's foot's shape, reach-out/sheet.tsx): what it says first (and, when a red row stops the
 * press, the door that mends it, beside the reason), Back (Cancel on the first step), and the one primary: "Next: the ad" …
 * "Next: review", then "Turn on · up to $300", the only press that spends and the owner's alone. For a member who is not the
 * owner, the last step's primary asks the owner instead. With something changed, Cancel asks once (UnsavedAsk).
 */
import { GATE, NEW_AD } from "@chanlytics/contracts/ads-page";
import type { DoorVM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { UnsavedAsk } from "../../../kit/record/work";
import type { UnsavedWork } from "../../../kit/record/work";
import { gate, routeDoor } from "../../../legacy-verbs";
import type { Step } from "./new-state";

interface FootProps {
  step: Step;
  work: UnsavedWork;
  /** What it says over its acts: what stops the press (and the door that mends it), else that nothing runs until Turn on. */
  say: { text: string; tone?: "danger"; door?: DoorVM | null };
  /** The primary's words: "Next: where and who", "Turn on · up to $300", or "Ask the owner to turn it on". */
  primary: string;
  /** What stops the primary, said in `say`. */
  stopped: boolean;
  /** Whether the member acting is the owner: only the owner's last primary spends, so it is gated as a money press. */
  owner: boolean;
  onBack: () => void;
  onPrimary: () => void;
}

export function NewFoot({ step, work, say, primary, stopped, owner, onBack, onPrimary }: FootProps) {
  // Cancel, and Escape, with something changed: the one question first, where the buttons were.
  if (work.asking) {
    return (
      <div className="pb-foot">
        <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="ads-new-leave" />
      </div>
    );
  }
  const spends = step === 5 && owner;
  return (
    <div className="pb-foot" data-foot-pair="">
      <span
        className="pb-foot-say"
        data-tone={say.tone}
        role={say.tone === "danger" ? "alert" : undefined}
        data-testid="ads-new-say"
      >
        {say.text}
        {say.door ? (
          <LinkButton className="ads-new-foot-door" {...routeDoor(say.door.to)} data-testid="ads-new-say-door">
            {say.door.words}
            <Icon name="chevron" size={11} />
          </LinkButton>
        ) : null}
      </span>
      <Button variant="quiet" onClick={onBack} data-testid="ads-new-back">
        {step === 1 ? NEW_AD.cancel : NEW_AD.back}
      </Button>
      <Button
        variant="primary"
        disabled={stopped}
        onClick={onPrimary}
        data-testid="ads-new-next"
        {...(spends ? gate("approve", GATE.turnOn) : {})}
      >
        {primary}
      </Button>
    </div>
  );
}
