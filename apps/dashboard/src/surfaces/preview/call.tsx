"use client";

/**
 * A lead's own preview, the call as a screen of its own (decision 0079, L3; the redesign of 17 November 2026): whose
 * call it is and where it stands, AI's three at work while it runs, the microphone's line while the browser asks, how
 * long a call may run, and its two presses, Mute and End. The call itself is the page's (use-call.ts): this draws it.
 * What was said is not shown: the call tells the browser none of it (its words are kept on the server).
 */
import { LEAD_PREVIEW_WORDS as W, MIN_MS, PREVIEW_LIMITS, SECOND_MS, type PreviewPageVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { PvFace, PvThree } from "./head";
import type { Call } from "./use-call";

/** The seconds of a minute, for a call's clock. */
const MINUTE_S = MIN_MS / SECOND_MS;
/** A call's length as its clock says it: "0:42". */
const clockOf = (seconds: number): string =>
  `${Math.floor(seconds / MINUTE_S)}:${String(seconds % MINUTE_S).padStart(2, "0")}`;
/** The three on the call's screen, in px. */
const THREE_PX = 88;

export function PvCall({ vm, call }: { vm: PreviewPageVM; call: Call }) {
  const live = call.phase === "live";
  return (
    <section className="pv-call" aria-label={W.callStart} data-testid="pv-call">
      <div className="pv-call-top">
        <PvFace vm={vm} size="lg" />
        <span className="pv-called-words">
          <b>{vm.business}</b>
          <span role="status" data-testid="pv-call-status">
            {live ? `${W.live} · ${clockOf(call.seconds)}` : W.connecting}
          </span>
        </span>
      </div>
      <div className="pv-call-stage">
        <PvThree live size={THREE_PX} />
        {live ? null : <p className="pv-by">{W.mic}</p>}
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
