"use client";

/**
 * A lead's own preview, the call as a screen of its own (decision 0079, L3; the redesign of 17 November 2026, drawn as
 * its canvas draws it): whose call it is and how long it has run; AI's three at work while it runs, and whose turn it
 * is, Speaking or Listening; the microphone's line while the browser asks; under the three the newest of what was said,
 * the caller's quiet and AI's large; how long a call may run; and its two presses, Mute and End, round, their names
 * under them. The call itself is the page's (use-call.ts): this draws it. What was said comes from the page's own door
 * while the call runs (the call tells the browser none of it): a read every two seconds, so a line shows a moment
 * after it is said.
 */
import { LEAD_PREVIEW_WORDS as W, PREVIEW_LIMITS, type PreviewPageVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { PvFace, PvThree } from "./head";
import { PvHeard } from "./heard";
import type { Call } from "./use-call";

/** The three on the call's screen, in px. */
const THREE_PX = 100;
/** The lines of the call its screen shows: the last two things said. */
const HEARD_SHOWN = 2;
/** The glyph on a call's round press. */
const DISC_GLYPH_PX = 24;

export function PvCall({ vm, call }: { vm: PreviewPageVM; call: Call }) {
  const live = call.phase === "live";
  return (
    <section className="pv-call" aria-label={W.callStart} data-testid="pv-call">
      <div className="pv-call-top">
        <PvFace vm={vm} size="lg" />
        <span className="pv-call-who">
          <b>{vm.business}</b>
          <span role="status" data-testid="pv-call-status">
            {live ? `${W.live} · ${W.clock(call.seconds)}` : W.connecting}
          </span>
        </span>
      </div>
      <div className="pv-call-stage">
        <PvThree live={live && call.talking} size={THREE_PX} />
        {live ? (
          <span className="pv-call-turn" data-talking={call.talking || undefined} data-testid="pv-call-turn">
            {call.talking ? W.speaking : W.listening}
          </span>
        ) : (
          <p className="pv-ready">{W.mic}</p>
        )}
        {live && call.heard.length ? <PvHeard lines={call.heard} newest={HEARD_SHOWN} /> : null}
      </div>
      <p className="pv-made">{W.callMax(PREVIEW_LIMITS.aCallMs)}</p>
      <div className="pv-call-acts">
        <span className="pv-call-act">
          <Button
            variant="glass"
            size="touch"
            iconOnly
            className="pv-disc"
            aria-label={call.muted ? W.unmute : W.mute}
            disabled={!live}
            aria-pressed={call.muted}
            onClick={call.mute}
            data-testid="pv-call-mute"
          >
            <Icon name={call.muted ? "sound-off" : "mic"} size={DISC_GLYPH_PX} />
          </Button>
          <span aria-hidden="true">{call.muted ? W.unmute : W.mute}</span>
        </span>
        <span className="pv-call-act">
          <Button
            variant="ink"
            size="touch"
            iconOnly
            className="pv-disc"
            aria-label={W.end}
            onClick={call.end}
            data-testid="pv-call-end"
          >
            {/* The receiver laid down: the phone's glyph, turned. */}
            <span className="pv-hang-up">
              <Icon name="phone" size={DISC_GLYPH_PX} />
            </span>
          </Button>
          <span aria-hidden="true">{W.endShort}</span>
        </span>
      </div>
    </section>
  );
}
