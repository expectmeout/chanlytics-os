/**
 * Campaigns, the channels (the spec of 8 October 2026, "A campaign says where it goes"): where the workspace stands on its
 * channels, one line at the home's head (the rail's on a desk, the Moments head on a phone) and under a
 * composer's Send by row where nothing can send at all; and the marks a campaign carries for the channels it goes by, on a
 * moment's card and on a line under the rail. Every word is contracts' (channelsStandingParts, channelMarksOf); this draws
 * it and presses. It stands with the parts because the home and both composers draw it.
 */
import { useState } from "react";
import { CONSENT_CHANNELS, LIFECYCLE_WORDS, VERSION_CHANNEL_WORDS } from "@chanlytics/contracts";
import type { ChannelStandingPart, ConsentChannel, LifecycleChannelMark } from "@chanlytics/contracts";
import { routeDoor } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
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

/** Whether the standing is the workspace's pause alone (its one part, Billing's door), which no chip says. */
export const channelsPaused = (parts: readonly ChannelStandingPart[] | null): boolean =>
  !!parts && parts.length === 1 && parts[0]?.channel === null && !parts[0].open;

/** Whether no channel can send at all: the open clause names none, and the workspace is not paused. */
export const channelsNone = (parts: readonly ChannelStandingPart[] | null): boolean =>
  !!parts && !channelsPaused(parts) && (parts[0]?.channels.length ?? 0) === 0;

/** The door that mends a closed channel (Settings › Connections), where one does; none where every reason has none. */
export const channelsDoor = (parts: readonly ChannelStandingPart[] | null): string | null =>
  parts?.find((p) => !p.open && p.channel && p.door)?.door ?? null;

/**
 * The Moments head's channels (Ruben, 11 Oct 2026, where three sentences and their doors stood): a chip each, in the
 * marks' own look and words (a filled dot in the channel's colour where it sends, a hollow one where it is not set up:
 * what a campaign's "waits" under it answers to), and one "Set up" at the row's end, the door to Settings › Connections.
 * A hollow chip pressed says its reason under the row, one at a time, in contracts' words (channelsStandingParts); an
 * open chip is words, nothing to press. Nothing where the standing could not be read, and the pause is its own line
 * (ChannelsLine), never a chip.
 */
export function ChannelChips({
  parts,
  testid,
  withDoor = true,
}: {
  parts: readonly ChannelStandingPart[] | null;
  testid: string;
  /** Set up at the row's end; none where a card above already holds the one door (nothing can send). */
  withDoor?: boolean;
}) {
  const [why, setWhy] = useState<ConsentChannel | null>(null);
  if (!parts || channelsPaused(parts)) return null;
  const W = LIFECYCLE_WORDS.channels;
  const closed = (c: ConsentChannel) => parts.find((p) => !p.open && p.channel === c) ?? null;
  const door = withDoor ? channelsDoor(parts) : null;
  const said = why ? closed(why) : null;
  const whyId = `${testid}-why`;
  return (
    <div className="cmh-head-chans" role="group" aria-label={W.head} data-testid={testid}>
      <span className="cmh-chans">
        {CONSENT_CHANNELS.map((c) => {
          const word = VERSION_CHANNEL_WORDS[c];
          const part = closed(c);
          const mark = (
            <span className="cmh-chan" data-channel={c} data-state={part ? "waits" : "on"}>
              <span className="cmh-chan-word">{word}</span>
            </span>
          );
          return part ? (
            <LinkButton
              key={c}
              className="cmh-head-chan"
              data-closed="true"
              aria-label={W.notSetUp(word)}
              aria-expanded={why === c}
              aria-controls={whyId}
              onClick={() => setWhy((was) => (was === c ? null : c))}
              data-testid={`${testid}-${c}`}
            >
              {mark}
            </LinkButton>
          ) : (
            <span key={c} className="cmh-head-chan" role="img" aria-label={W.sending(word)}>
              {mark}
            </span>
          );
        })}
      </span>
      {door ? (
        <LinkButton className="cmh-head-setup" {...routeDoor(door)} data-testid={`${testid}-door`}>
          {W.setUp}
          <Icon name="chevron" size={11} />
        </LinkButton>
      ) : null}
      <p className="cmh-chan-why" id={whyId} role="status" hidden={said ? undefined : true}>
        {said ? said.words : null}
      </p>
    </div>
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
