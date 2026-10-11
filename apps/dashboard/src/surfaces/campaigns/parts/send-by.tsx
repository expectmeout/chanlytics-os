/**
 * The Send by row (One message, every channel, step 3; the campaigns-on-every-channel spec, 4.9): one toggle for each
 * channel a campaign may go by, WhatsApp, Text and Email, on the broadcast composer, the playbook composer and a
 * playbook's drawer alike. Each is an independent on or off, drawn as the home draws a campaign's channels (Ruben, 11 Oct
 * 2026, where three switches and their reasons took a row and three lines under it): a small capsule with the channel's
 * dot and its word, the dot filled in the channel's colour where it is on, hollow where it is off, and "waits" after the
 * word, in amber, where a playbook keeps it ticked though it cannot send on it yet. Each is a switch to a screen reader.
 *
 * A channel the workspace cannot send on, or the message cannot go by, is off and does not change when pressed (`fixed`),
 * and so is the one channel left on: drawn faint, its press says why under the row, one at a time, in the line a finger
 * reads (a tooltip is for a pointer and a keyboard alone, which still has it, and a screen reader has it as the toggle's
 * description). A channel turned on that waits says why the same way, as it is turned on. What is on, and why a channel
 * is closed, is parts/channels.ts's.
 *
 * Where the workspace can send on nothing at all (`standing`, parts/channels.ts cmNothingOpen), the row says so once under
 * its toggles: "Nothing can send yet", then each channel with its reason as the door to Settings › Connections that mends
 * it. Three dimmed toggles whose reasons wait for a press were a dead end.
 */
import { useId, useState } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { ChannelStandingPart, ConsentChannel } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { Tooltip } from "../../kit/tooltip/tooltip";
import { CM_VIA_WORDS, type CmViaTick } from "./channels";
import { ChannelsLine } from "./channels-line";

interface CmViaProps {
  ticks: readonly CmViaTick[];
  onTick: (channel: ConsentChannel, on: boolean) => void;
  /** The row's test id; each channel's is `<testid>-<channel>`. */
  testid: string;
  /** The group's name to a screen reader where the row is not "Send by": a playbook's drawer calls it "Goes by". */
  label?: string;
  /** A change is being saved: said to a screen reader, where the toggles only stop taking a press. */
  busy?: boolean;
  /** The workspace's standing where it can send on nothing (cmNothingOpen), said in place of the reasons; else null. */
  standing?: readonly ChannelStandingPart[] | null;
}

/** The mark's state, in the home's words for a channel's dot: on, kept and waiting, or not on. */
const dotState = (tick: CmViaTick): "on" | "waits" | "could" => (!tick.on ? "could" : tick.waiting ? "waits" : "on");

/** One channel: its toggle, its dot and its word, with the reason it is closed (or stays on, or waits) where it has one. */
function CmViaOne(p: {
  tick: CmViaTick;
  onTick: CmViaProps["onTick"];
  onWhy: (channel: ConsentChannel | null) => void;
  whyShown: boolean;
  whyId: string;
  testid: string;
}) {
  const { tick, onTick, onWhy, whyShown, whyId, testid } = p;
  const id = useId();
  const srWhy = `${id}-why`;
  const press = () => {
    if (tick.fixed) {
      onWhy(whyShown ? null : tick.channel);
      return;
    }
    const next = !tick.on;
    onTick(tick.channel, next);
    // Turned on where it waits, it says why at once; turned off, nothing is left to say of it.
    onWhy(next && tick.waiting && tick.why ? tick.channel : null);
  };
  const one = (
    <LinkButton
      role="switch"
      aria-checked={tick.on}
      aria-describedby={tick.why ? srWhy : undefined}
      aria-controls={tick.why ? whyId : undefined}
      className="cm-via-one"
      data-channel={tick.channel}
      data-on={tick.on ? "true" : "false"}
      data-fixed={tick.fixed ? "true" : undefined}
      onClick={press}
      data-testid={testid}
    >
      <span className="cmh-chan" data-channel={tick.channel} data-state={dotState(tick)}>
        <span className="cm-via-word">{tick.word}</span>
        {tick.on && tick.waiting ? <span className="cmh-chan-waits"> · {LIFECYCLE_WORDS.channels.waits}</span> : null}
      </span>
      {tick.why ? (
        <span id={srWhy} className="cm-sr">
          {tick.why}
        </span>
      ) : null}
    </LinkButton>
  );
  return tick.why ? <Tooltip tip={tick.why}>{one}</Tooltip> : one;
}

/**
 * The row: a toggle for each channel, in the page's order, and under it the reason of the one last pressed that has one.
 * Where nothing can send, the standing line takes its place, for every reader: it carries the doors.
 */
export function CmVia({ ticks, onTick, testid, label, busy, standing = null }: CmViaProps) {
  const [why, setWhy] = useState<ConsentChannel | null>(null);
  const whyId = `${testid}-why`;
  const shown = why ? (ticks.find((t) => t.channel === why && t.why) ?? null) : null;
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
          onWhy={setWhy}
          whyShown={why === t.channel}
          whyId={whyId}
          testid={`${testid}-${t.channel}`}
        />
      ))}
      {standing ? (
        <ChannelsLine parts={standing} testid={`${testid}-standing`} />
      ) : (
        <p
          className="cm-via-why"
          id={whyId}
          role="status"
          hidden={shown ? undefined : true}
          data-testid={`${testid}-whys`}
        >
          {shown ? (
            <>
              <span className="cm-via-why-word">{shown.word}</span> {shown.why}
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
