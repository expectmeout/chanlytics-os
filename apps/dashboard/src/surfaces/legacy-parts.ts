/**
 * The components a surface that has left the shell still draws from a page that has not (decision 0015).
 *
 * `legacy-verbs.ts` is the verbs; this is the parts. A house component that other pages still draw (`Confirm`,
 * `StatePill`) is JSX the frame loads and publishes on `window`; a TSX surface cannot import it, so it draws it through a
 * door here, and the element it draws is that very component: the tree is what the JSX drew, node for node. Each door is a
 * line to delete on the day the surface that draws it imports the kit's own instead. Campaigns, Inbox and People have: they
 * import `kit/confirm`, `kit/pill/state-pill`, `kit/policy-chip`, `kit/record` and `kit/field-error` by their paths, since a
 * door draws nothing where the frame did not publish its part, and a Confirm that draws nothing leaves a foot with no act
 * to press the day the surface is drawn outside the shell. What is left here is what Leads, Live and the Calendar draw.
 *
 * A part is asked for as it is drawn, never when this module loads: the surface's module may load before the frame's
 * scripts have, and the part exists once they have. A surface that draws where the part is not (a test that loads the
 * page alone) draws nothing in its place, as it drew where the JSX had no part to name.
 */
import type { ComponentType, ReactNode } from "react";
import { windowValue } from "./legacy-verbs";

declare global {
  interface Window {
    Confirm?: ComponentType<ConfirmProps>;
    StatePill?: ComponentType<StatePillProps>;
  }
}

/** A part that is not there draws nothing: what a JSX page drew where its store had no such row. The one spelling of it:
 *  the kit's head and the lead peek's doors answer the same where a part or a standing is not. */
export const nothing = (): null => null;

/** The part the frame published under this name, or a component that draws nothing. */
function part<P>(name: "Confirm" | "StatePill"): ComponentType<P> {
  const found = windowValue(name);
  return (typeof found === "function" ? found : nothing) as ComponentType<P>;
}

/** The one way an act is confirmed (the kit's `Confirm`): the question, what it does, a Yes that names the verb, a quiet No. */
interface ConfirmProps {
  question: ReactNode;
  detail?: ReactNode;
  yes?: string;
  no?: string;
  onYes?: () => void;
  onNo?: () => void;
  busy?: boolean;
  busyLabel?: string;
  danger?: boolean;
  typed?: string | null;
  value?: string;
  onType?: ((value: string) => void) | null;
  ready?: boolean | null;
  error?: ReactNode;
  block?: boolean;
  className?: string;
  testid?: string | null;
}
export const confirmPart = (): ComponentType<ConfirmProps> => part<ConfirmProps>("Confirm");

/** The one pill for a state (the kit's `StatePill`): its tone from contracts, its words the page's or the state's own. */
interface StatePillProps {
  kind: string;
  value: unknown;
  label?: ReactNode;
  className?: string;
  title?: string | null;
  tip?: string | null;
  testid?: string | null;
}
export const statePillPart = (): ComponentType<StatePillProps> => part<StatePillProps>("StatePill");
