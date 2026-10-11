/**
 * New ad's five steps, one in view at a time (MOCKUP): what should people do, the ad, where and who, budget, review. Each is
 * its own file (step-door, step-ad, step-where, step-budget, step-review); this picks the one in view and gives it its
 * title, which takes the focus as the step changes so a screen reader hears where it is.
 */
import type { Ref } from "react";
import { NEW_AD } from "@chanlytics/contracts/ads-page";
import type { StepProps } from "./new-bits";
import type { Step } from "./new-state";
import { StepAd } from "./step-ad";
import { StepBudget } from "./step-budget";
import { StepDoor } from "./step-door";
import { StepReview } from "./step-review";
import { StepWhere } from "./step-where";

type BodyProps = StepProps & { step: Step };

function Body({ step, ...p }: BodyProps) {
  switch (step) {
    case 1:
      return <StepDoor {...p} />;
    case 2:
      return <StepAd {...p} />;
    case 3:
      return <StepWhere {...p} />;
    case 4:
      return <StepBudget {...p} />;
    default:
      return <StepReview {...p} />;
  }
}

/** The step in view, under its title. */
export function StepBody({ ref, ...p }: BodyProps & { ref?: Ref<HTMLHeadingElement> }) {
  return (
    <section className="ads-new-step" data-step={p.step} aria-labelledby="ads-new-step-title">
      <h3 className="ads-new-title" id="ads-new-step-title" tabIndex={-1} ref={ref}>
        {NEW_AD.steps.at(p.step - 1)}
      </h3>
      <Body {...p} />
    </section>
  );
}
