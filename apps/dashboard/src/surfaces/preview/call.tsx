"use client";

// Chanlytics — a lead's own receptionist, Call it (decision 0079, L3).
//
// A call in the browser to the business's own receptionist, as a caller would make one: the rehearsal's own call
// (legacy-bridge/rehearse/call.ts, the vendor's web client loaded on the press), made by the preview's door
// (POST previews/<token>/call), which counts it against the preview's six minutes, three at most a call. The page says
// where the call stands (connecting, on the call, ended), lets them mute it and end it, and says what is left; a
// microphone the browser kept off, and a call that could not start, are said in the page's own words. What was said on
// the call is the rehearsal's, read by whoever makes the workspace theirs; the page keeps no transcript of its own.

import { useEffect, useRef, useState } from "react";
import { LEAD_PREVIEW_WORDS as W, MIN_MS } from "@chanlytics/contracts";
import { startCall, type CallSession } from "@/legacy-bridge/rehearse/call";
import { Button } from "../kit/button/button";
import { Panel } from "../kit/panel/panel";
import { previewVerbs } from "./verbs";

type Phase = "idle" | "connecting" | "live" | "ended";
/** The least a call can be (the provider's floor): less than this left, and no call starts. */
const CALL_FLOOR_MS = MIN_MS;

export function PvCall({ token, leftMs }: { token: string; leftMs: number }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(leftMs);
  const [muted, setMuted] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const session = useRef<CallSession | null>(null);

  // A page left mid-call ends the call.
  useEffect(() => () => session.current?.end(), []);

  const call = async () => {
    if (phase === "connecting" || phase === "live") return;
    setTrouble(null);
    setMuted(false);
    setPhase("connecting");
    session.current = await startCall(
      async () => {
        const r = await previewVerbs.call(token);
        if (!r.ok) return { ok: false, message: r.message ?? W.callFailed };
        setLeft(r.data.left_ms);
        return { ok: true, started: { rehearsal_id: r.data.rehearsal_id, call: r.data.call } };
      },
      {
        onStarted: () => undefined,
        onStatus: (s) => setPhase(s),
        onEnd: (reason) => {
          session.current = null;
          setPhase("ended");
          if (reason?.startsWith("error_")) setTrouble(W.dropped);
        },
        onError: (kind, words) => {
          session.current = null;
          setPhase((was) => (was === "live" ? "ended" : "idle"));
          setTrouble(kind === "mic" ? W.micBlocked : kind === "refused" ? (words ?? W.callFailed) : W.callFailed);
        },
      },
    );
  };
  const end = () => session.current?.end();
  const mute = () => {
    session.current?.mute(!muted);
    setMuted(!muted);
  };

  const used = left < CALL_FLOOR_MS;
  const status = phase === "connecting" ? W.connecting : phase === "live" ? W.live : null;
  return (
    <Panel as="section" className="pv-section" aria-labelledby="pv-call-title" data-testid="pv-call">
      <h2 className="pv-section-title" id="pv-call-title">
        {W.callTitle}
      </h2>
      <p className="pv-quiet">{W.callSub}</p>
      {status ? (
        <p className="pv-by" role="status" data-testid="pv-call-status">
          {status}
        </p>
      ) : null}
      {phase === "connecting" ? <p className="pv-quiet">{W.mic}</p> : null}
      {trouble ? (
        <p className="pv-quiet" role="alert" data-testid="pv-call-trouble">
          {trouble}
        </p>
      ) : null}
      {phase === "ended" && !trouble ? (
        <p className="pv-by" data-testid="pv-call-heard">
          {W.heard}
        </p>
      ) : null}
      <div className="pv-ask-acts">
        <p className="pv-quiet" data-testid="pv-call-left">
          {used ? W.callUsed : W.callLeft(left)}
        </p>
        {phase === "live" ? (
          <span className="pv-end">
            <Button size="sm" onClick={mute} aria-pressed={muted} data-testid="pv-call-mute">
              {muted ? W.unmute : W.mute}
            </Button>
            <Button size="sm" variant="primary" onClick={end} data-testid="pv-call-end">
              {W.end}
            </Button>
          </span>
        ) : (
          <Button
            variant="primary"
            onClick={() => void call()}
            disabled={used || phase === "connecting"}
            data-testid="pv-call-start"
          >
            {W.callStart}
          </Button>
        )}
      </div>
    </Panel>
  );
}
