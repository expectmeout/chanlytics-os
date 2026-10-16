/**
 * Campaigns, the channels (the spec of 8 October 2026, "A campaign says where it goes"): where the workspace stands on its
 * channels, one line at the home's head (the rail's on a desk, the Moments head on a phone) and under a
 * composer's Send by row where nothing can send at all; and the marks a campaign carries for the channels it goes by, on a
 * moment's card and on a line under the rail. Every word is contracts' (channelsStandingParts, channelMarksOf); this draws
 * it and presses. It stands with the parts because the home and both composers draw it.
 */
import type { ChannelStandingPart } from "@chanlytics/contracts";
import { routeDoor } from "../../legacy-verbs";
import { LinkButton } from "../../kit/link-button/link-button";

/**
 * The head's channel line: the open channels as one clause, then each closed one with its reason, a door to Settings ›
 * Connections where a setting mends it. Nothing where the readiness could not be read.
 */
export function ChannelsLine({ parts, testid }: { parts: readonly ChannelStandingPart[] | null; testid: string }) {
  if (!parts) return null;
  return (
    <span className="cmh-channels" data-testid={testid}>
      {parts.map((p, i) => (
        <span
          key={p.channel ?? "open"}
          className="cmh-channel"
          data-open={p.open ? "true" : "false"}
          data-channel={p.channel ?? undefined}
        >
          {i > 0 ? (
            <span className="cmh-channel-dot" aria-hidden="true">
              ·
            </span>
          ) : null}
          {p.door ? (
            <LinkButton className="cmh-channel-door" {...routeDoor(p.door)} data-testid={`${testid}-door`}>
              {p.words}
            </LinkButton>
          ) : (
            p.words
          )}
        </span>
      ))}
    </span>
  );
}
