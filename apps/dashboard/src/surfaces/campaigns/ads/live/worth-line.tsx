/**
 * What bookings are worth beside what was spent (the Ads tracking plan's T6), as the ad's drawer and Reports › Ads both
 * draw it: the model's one line, and under it in the same paragraph how many it leaves out, with the door to where a
 * service is given its amount. Every word is the model's (worth-model.ts `worthOf`); each page hands the class its own quiet
 * line is drawn in.
 */
import { LinkButton } from "../../../kit/link-button/link-button";
import { routeDoor } from "../../../frame-verbs";
import type { WorthVM } from "./worth-model";
import { SHEET } from "./words";

export function WorthLine(props: {
  worth: WorthVM | null;
  /** The page's own class for a quiet line. */
  className: string;
  testid: string;
  /** The page's own way to a route, where it has one (a drawer closes as it goes). */
  onGo?: (route: string) => void;
}) {
  const { worth, className, testid, onGo } = props;
  if (!worth) return null;
  return (
    <p className={className} data-testid={`${testid}-says`}>
      {worth.line ? <span data-testid={testid}>{worth.line}</span> : null}
      {worth.line && worth.leftOut ? <br /> : null}
      {worth.leftOut ? (
        <span data-testid={`${testid}-left-out`}>
          {worth.leftOut}{" "}
          {worth.door ? (
            <LinkButton {...routeDoor(worth.door, onGo)} data-testid={`${testid}-door`}>
              {SHEET.worthDoor}
            </LinkButton>
          ) : null}
        </span>
      ) : null}
    </p>
  );
}
