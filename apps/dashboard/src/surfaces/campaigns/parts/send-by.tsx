/**
 * The channels a campaign goes by (One message, every channel, step 3; the campaigns-on-every-channel spec, 4.9), on the
 * broadcast composer, the playbook composer and a playbook's drawer alike: a word of the campaign's sentence (Ruben,
 * 11 Oct 2026, "Option B") that says them -- each on one's dot and name, "WhatsApp or Email", "· waits" after one kept that
 * cannot send yet -- and opens their list in the kit's popover. It stood as a row of capsules under its own word, Send by.
 *
 * The list is one row a channel, WhatsApp, Text and Email, each an independent on or off and a switch to a screen reader:
 * its dot (filled in the channel's colour where it is on, hollow where it is off, as the home draws a campaign's
 * channels), its word, under them how many of the people it reaches now it carries there or why it is closed, and a
 * check where it is on. A channel the workspace cannot send on, or the message cannot go by, is off and does not change
 * when pressed (`fixed`), and so is the one channel left on; each says why under its word, where a finger reads it. What
 * is on, and why a channel is closed, is parts/channels.ts's.
 *
 * Where the workspace can send on nothing at all (`standing`, parts/channels.ts cmNothingOpen), the list says so once
 * under its rows: "Nothing can send yet", then each channel with its reason as the door to Settings › Connections that
 * mends it.
 */
import { Fragment, useId } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { ChannelStandingPart, ConsentChannel } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Token } from "../../kit/picker/picker";
import { Popover } from "../../kit/popover/popover";
import { CM_VIA_WORDS, type CmViaTick } from "./channels";
import { ChannelsLine } from "./channels-line";

interface CmViaProps {
  ticks: readonly CmViaTick[];
  onTick: (channel: ConsentChannel, on: boolean) => void;
  /** The list's test id; each channel's is `<testid>-<channel>`, and the sentence's word `<testid>-word`. */
  testid: string;
  /** The group's name to a screen reader where it is not "Send by": a playbook's drawer calls it "Goes by". */
  label?: string;
  /** A change is being saved: said to a screen reader, where the rows only stop taking a press. */
  busy?: boolean;
  /** The workspace's standing where it can send on nothing (cmNothingOpen), said under the rows; else null. */
  standing?: readonly ChannelStandingPart[] | null;
  /** How many of the people it reaches now each channel carries ("12 people"), said under its word. */
  counts?: Partial<Record<ConsentChannel, string>>;
}

/** The mark's state, in the home's words for a channel's dot: on, kept and waiting, or not on. */
const dotState = (tick: CmViaTick): "on" | "waits" | "could" => (!tick.on ? "could" : tick.waiting ? "waits" : "on");

/** One channel: its dot and word, its count or its reason under them, and its check. */
function CmViaOne({
  tick,
  onTick,
  sub,
  testid,
}: {
  tick: CmViaTick;
  onTick: CmViaProps["onTick"];
  sub: string | null;
  testid: string;
}) {
  const id = useId();
  const srWhy = `${id}-why`;
  return (
    <LinkButton
      role="switch"
      aria-checked={tick.on}
      aria-describedby={tick.why ? srWhy : undefined}
      className="cm-via-one"
      data-channel={tick.channel}
      data-on={tick.on ? "true" : "false"}
      data-fixed={tick.fixed ? "true" : undefined}
      onClick={() => (tick.fixed ? undefined : onTick(tick.channel, !tick.on))}
      data-testid={testid}
    >
      <span className="cmh-chan" data-channel={tick.channel} data-state={dotState(tick)}>
        <span className="cm-via-word">{tick.word}</span>
        {tick.on && tick.waiting ? <span className="cmh-chan-waits"> · {LIFECYCLE_WORDS.channels.waits}</span> : null}
      </span>
      <span
        className="cm-via-sub"
        id={tick.why ? srWhy : undefined}
        data-warn={tick.why ? "true" : undefined}
        data-testid={tick.why ? `${testid}-why` : undefined}
      >
        {sub}
      </span>
      <span className="cm-via-tick" aria-hidden="true">
        {tick.on ? <Icon name="check" size={14} /> : null}
      </span>
    </LinkButton>
  );
}

/** The list: a row for each channel, in the page's order; where nothing can send, the standing line under them. */
function CmVia({ ticks, onTick, testid, label, busy, standing = null, counts }: CmViaProps) {
  return (
    <div
      className="cm-via"
      role="group"
      aria-label={label ?? CM_VIA_WORDS.label}
      aria-busy={busy ? true : undefined}
      data-testid={testid}
    >
      {ticks.map((t) => (
        <CmViaOne
          key={t.channel}
          tick={t}
          onTick={onTick}
          sub={t.why ?? counts?.[t.channel] ?? null}
          testid={`${testid}-${t.channel}`}
        />
      ))}
      {standing ? <ChannelsLine parts={standing} testid={`${testid}-standing`} /> : null}
    </div>
  );
}

/**
 * The channels as a word of the sentence: the ones on, "or" between them (a person gets it on one of them), and the press
 * that opens the list with the line that says a person gets it once. A role that may not change them reads the word.
 */
export function CmViaWord(props: CmViaProps & { readOnly?: boolean }) {
  const { ticks, testid, readOnly = false } = props;
  const S = LIFECYCLE_WORDS.compose.sentence;
  const on = ticks.filter((t) => t.on);
  const face =
    on.length === 0
      ? S.noChannel
      : on.map((t, i) => (
          <Fragment key={t.channel}>
            {i === 0 ? null : <span className="cm-via-or">{i === on.length - 1 ? " or " : ", "}</span>}
            <span className="cmh-chan" data-channel={t.channel} data-state={dotState(t)}>
              {t.word}
              {t.waiting ? <span className="cmh-chan-waits"> · {LIFECYCLE_WORDS.channels.waits}</span> : null}
            </span>
          </Fragment>
        ));
  const said = `${S.channelsLabel}: ${on.map((t) => t.word).join(", ") || S.noChannel}`;
  const word = (
    <Token className="cm-via-token" aria-label={said} data-testid={`${testid}-word`}>
      {face}
    </Token>
  );
  if (readOnly) return word;
  return (
    <Popover label={S.channelsLabel} align="start" size="flush" className="cm-via-box" trigger={word}>
      <CmVia {...props} />
      {props.standing ? null : <p className="cm-via-note">{S.channelsNote}</p>}
    </Popover>
  );
}
