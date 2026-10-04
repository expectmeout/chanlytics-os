/**
 * The Send by row (One message, every channel, step 3; the campaigns-on-every-channel spec, 4.9): one switch for each
 * channel a campaign may go by, WhatsApp, Text and Email, on the broadcast composer and the playbook composer alike. Each
 * is an independent on or off, so each is the kit's Switch beside its word. A channel the workspace cannot send on, or the
 * message cannot go by, is off and does not change when pressed: it is drawn as unavailable (the kit dims a switch that is
 * read-only, and its word goes faint), and says why: on hover and on keyboard focus in the kit's tooltip, and to a screen
 * reader as the switch's own description (a tooltip is for a pointer and a keyboard alone). The one channel that is on
 * stays on, dimmed too, since it takes no press. A playbook's channel that waits for a line or a version is neither: it is
 * on and live, its word underlined as a thing with a reason to read. What is on, and why a channel is closed, is
 * parts/channels.ts's.
 */
import { useId } from "react";
import type { ConsentChannel } from "@chanlytics/contracts";
import { Switch } from "../../kit/switch/switch";
import { Tooltip } from "../../kit/tooltip/tooltip";
import { CM_VIA_WORDS, type CmViaTick } from "./channels";

interface CmViaProps {
  ticks: readonly CmViaTick[];
  onTick: (channel: ConsentChannel, on: boolean) => void;
  /** The row's test id; each channel's is `<testid>-<channel>`. */
  testid: string;
}

/** One channel: its switch and its word, with the reason it is closed (or stays on) where it has one. */
function CmViaOne({ tick, onTick, testid }: { tick: CmViaTick; onTick: CmViaProps["onTick"]; testid: string }) {
  const id = useId();
  const wordId = `${id}-word`;
  const whyId = `${id}-why`;
  const one = (
    <span className="cm-via-one" data-channel={tick.channel} data-on={tick.on ? "true" : "false"} data-testid={testid}>
      <Switch
        labelledBy={wordId}
        describedBy={tick.why ? whyId : undefined}
        checked={tick.on}
        readOnly={tick.fixed}
        onCheckedChange={(on) => {
          if (!tick.fixed) onTick(tick.channel, on);
        }}
      />
      <span
        id={wordId}
        className="cm-via-word"
        data-fixed={tick.fixed && !tick.on ? "true" : undefined}
        data-waiting={tick.waiting ? "true" : undefined}
      >
        {tick.word}
      </span>
      {tick.why ? (
        <span id={whyId} className="cm-sr">
          {tick.why}
        </span>
      ) : null}
    </span>
  );
  return tick.why ? <Tooltip tip={tick.why}>{one}</Tooltip> : one;
}

/** The row: a switch for each channel, in the page's order. */
export function CmVia({ ticks, onTick, testid }: CmViaProps) {
  return (
    <div className="cm-via" role="group" aria-label={CM_VIA_WORDS.label} data-testid={testid}>
      {ticks.map((t) => (
        <CmViaOne key={t.channel} tick={t} onTick={onTick} testid={`${testid}-${t.channel}`} />
      ))}
    </div>
  );
}
