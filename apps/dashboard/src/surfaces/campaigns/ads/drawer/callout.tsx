/**
 * The line at the top of an ad's drawer, only when something blocks or waits (MOCKUP; directions.md, "State language"): plain
 * (the control's ground, the muted ink) for what waits -- in review, setting up, paused in the platform, a price changed in
 * Services, a permission that lapses, an ad that ended and is settling -- warn for what blocks (turned down, a card that
 * failed, an ad that could not be made), red only for a failed account. The door that mends it stands at its end, and the
 * presses it offers (Resume, Update the ad, Fix it, Ask Meta to look again, Make a new one, Try again, Remove what was made)
 * under it. A press that asks the platform for something says so once it is pressed and cannot be pressed twice. The sentence
 * under it never changes shape.
 */
import type { CalloutActId, CalloutVM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { routeDoor } from "../../../legacy-verbs";

export type CalloutAct = CalloutActId;

/** The `data-tone` the campaigns stylesheet knows: plain is its own; warn is the callout as it is drawn; fail is this folder's. */
const calloutTone = (tone: CalloutVM["tone"]): "plain" | "fail" | undefined =>
  tone === "plain" ? "plain" : tone === "fail" ? "fail" : undefined;

interface AdCalloutProps {
  callout: CalloutVM | null;
  onAct: (id: CalloutAct) => void;
  /** The presses already made, which say so and rest until the platform answers. */
  spent: ReadonlySet<CalloutAct>;
}

export function AdCallout({ callout, onAct, spent }: AdCalloutProps) {
  if (!callout) return null;
  const { tone, text, door, acts } = callout;
  return (
    <div className="ads-alert" data-testid="ads-alert">
      <p className="cm-callout" data-tone={calloutTone(tone)} data-testid="ads-callout">
        <Icon name={tone === "plain" ? "info" : "notice"} size={14} />
        <span className="cm-callout-words">{text}</span>
        {door ? (
          <LinkButton className="cm-callout-door" {...routeDoor(door.to)} data-testid="ads-callout-door">
            {door.words}
            <Icon name="chevron" size={11} />
          </LinkButton>
        ) : null}
      </p>
      {acts.length > 0 ? (
        <div className="ads-alert-acts">
          {acts.map((act) => {
            const done = spent.has(act.id);
            return (
              <Button
                key={act.id}
                size="sm"
                disabled={done}
                onClick={() => onAct(act.id)}
                data-testid={`ads-callout-${act.id}`}
              >
                {done ? act.done : act.label}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
