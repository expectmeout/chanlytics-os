/**
 * Campaigns' home, the channels (the spec of 8 October 2026, "A campaign says where it goes"): where the workspace stands on
 * its channels, one line at the head (and in the phone's reach tile, where the head's line is not drawn), and the marks a
 * campaign carries for the channels it goes by, on a moment's card and on a line under the rail. Every word is the view
 * model's (contracts channelsStandingParts, channelMarksOf); this draws it and presses.
 */
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { ChannelStandingPart, LifecycleChannelMark } from "@chanlytics/contracts";
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

/**
 * The channels a campaign goes by, one mark each: a dot in the channel's colour and its word for one it goes by now, a
 * hollow dot and "waits" for one it keeps and cannot send on yet, a hollow dot in the dim ink for one the workspace could
 * send on and the campaign does not tick (what one more tick in its drawer opens). A channel that is neither is not drawn.
 * The whole says itself to a screen reader as one sentence. The word is drawn at every width: a dot alone said which
 * channel by its colour, and nothing to anyone who does not tell the three apart.
 */
export function ChannelMarks({ marks, testid }: { marks: readonly LifecycleChannelMark[]; testid?: string }) {
  const shown = marks.filter((m) => m.state !== "off");
  if (shown.length === 0) return null;
  const words = (state: LifecycleChannelMark["state"]) => shown.filter((m) => m.state === state).map((m) => m.word);
  return (
    <span
      className="cmh-chans"
      role="img"
      aria-label={LIFECYCLE_WORDS.channels.marks(words("on"), words("waits"), words("could"))}
      data-testid={testid}
    >
      {shown.map((m) => (
        <span key={m.channel} className="cmh-chan" data-channel={m.channel} data-state={m.state}>
          <span className="cmh-chan-word">{m.word}</span>
          {m.state === "waits" ? <span className="cmh-chan-waits"> · {LIFECYCLE_WORDS.channels.waits}</span> : null}
        </span>
      ))}
    </span>
  );
}
