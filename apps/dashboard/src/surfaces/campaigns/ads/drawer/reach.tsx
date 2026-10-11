/**
 * What the ad runs on, as one quiet line under its sentence (MOCKUP; the shape of parts/reach.tsx CmReachLine): a dot -- green
 * only when the ad account is active, a payment method exists, the Page and the number are linked and the ad is active; amber
 * with the first reason otherwise -- and "Running · Meta approved it Mon 14 Sep · WhatsApp linked". The line is the press
 * that opens the same dot rows as the platform's standing, with the time they were read.
 */
import type { ReachVM } from "@chanlytics/contracts/ads-page";
import { SHOWN } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Popover } from "../../../kit/popover/popover";
import { routeDoor } from "../../../legacy-verbs";

/** The reasons come after the state, set apart by a dot between them. */
const SEPARATOR = " · ";

/** The line's first word is the state, in the ink; the rest is the reasons, dim (amber where the dot is). */
export function AdReach({ reach }: { reach: ReachVM }) {
  const line = (
    <>
      <span className="cm-reach-dot" data-tone={reach.tone} aria-hidden="true" />
      <span className="cm-reach-said">
        <span className="cm-reach-count">{reach.state}</span>
        {reach.parts.length > 0 ? (
          <span className="cm-reach-first">{`${SEPARATOR}${reach.parts.join(SEPARATOR)}`}</span>
        ) : null}
      </span>
      <Icon name="chevron" size={11} />
    </>
  );
  return (
    <div className="cm-reach-line" data-tone={reach.tone} data-testid="ads-reach">
      <Popover
        label={SHOWN.reach}
        align="start"
        className="cm-reach-box"
        trigger={
          <LinkButton className="cm-reach-press" data-testid="ads-reach-press">
            {line}
          </LinkButton>
        }
      >
        {reach.rows.length > 0 ? (
          <ul className="cm-reach-why">
            {reach.rows.map((row) => (
              <li key={row.text}>
                <span className="cm-reach-dot" data-tone={row.tone} aria-hidden="true" />
                {row.text}
                {row.door ? (
                  <LinkButton className="cm-reach-door" {...routeDoor(row.door.to)}>
                    {row.door.words}
                  </LinkButton>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="ads-read">{reach.read}</p>
      </Popover>
    </div>
  );
}
