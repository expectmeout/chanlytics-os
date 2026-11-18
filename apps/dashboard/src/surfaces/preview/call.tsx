"use client";

/**
 * A lead's own preview, the call as a screen of its own (decision 0079, L3; the redesign of 17 November 2026): whose
 * call it is and where it stands, AI's three at work while it runs, the microphone's line while the browser asks, how
 * long a call may run, and its two presses, Mute and End. The call itself is the page's (use-call.ts): this draws it.
 * Under the three, the newest of what was said, as the page reads it from its own door while the call runs (the call
 * tells the browser none of it): a read every two seconds, so a line shows a moment after it is said.
 */
import { LEAD_PREVIEW_WORDS as W, PREVIEW_LIMITS, type PreviewPageVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { PvFace, PvThree } from "./head";
import { PvHeard } from "./heard";
import type { Call } from "./use-call";

/** The three on the call's screen, in px. */
const THREE_PX = 88;
/** The lines of the call its screen shows: the last two things said. */
const HEARD_SHOWN = 2;

export function PvCall({ vm, call }: { vm: PreviewPageVM; call: Call }) {
  const live = call.phase === "live";
  return (
    <section className="pv-call" aria-label={W.callStart} data-testid="pv-call">
      <div className="pv-call-top">
        <PvFace vm={vm} size="lg" />
        <span className="pv-called-words">
          <b>{vm.business}</b>
          <span role="status" data-testid="pv-call-status">
            {live ? `${W.live} · ${W.clock(call.seconds)}` : W.connecting}
          </span>
        </span>
      </div>
      <div className="pv-call-stage">
        <PvThree live size={THREE_PX} />
        {live ? null : <p className="pv-by">{W.mic}</p>}
        {live && call.heard.length ? <PvHeard lines={call.heard} newest={HEARD_SHOWN} /> : null}
      </div>
      <p className="pv-quiet">{W.callMax(PREVIEW_LIMITS.aCallMs)}</p>
      <div className="pv-call-acts">
        <Button
          variant="glass"
          size="touch"
          disabled={!live}
          aria-pressed={call.muted}
          onClick={call.mute}
          data-testid="pv-call-mute"
        >
          <Icon name={call.muted ? "sound-off" : "mic"} size={16} />
          {call.muted ? W.unmute : W.mute}
        </Button>
        <Button variant="ink" size="touch" aria-label={W.end} onClick={call.end} data-testid="pv-call-end">
          <Icon name="x" size={14} />
          {W.endShort}
        </Button>
      </div>
    </section>
  );
}
