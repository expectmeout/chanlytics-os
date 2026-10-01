/**
 * What the provider's API offers over a hosted agent's live call, besides a sentence into it (moved from
 * legacy/pages/live-monitor.jsx, decision 0015): stopping it, and telling the receptionist something NOW.
 * The second is the hand-over -- the receptionist is told the owner is
 * picking up and transfers the caller to the business's own line with the
 * tool it already has, so the owner's phone rings the way it does when a
 * caller asks for a person. The line is a fact the workspace keeps in
 * Settings; without one the button says so and the server refuses besides.
 * Ending a call is armed first: the caller is cut off, and there is no undo.
 */
import { useState } from "react";
import type { ResolvedFacts, LiveCallVM } from "@chanlytics/contracts";
import { endCall, handOverCall } from "@/legacy-bridge/inbox-verbs";
import { gate, useLegacyToast } from "../legacy-verbs";
import { confirmPart } from "../legacy-parts";
import { Icon } from "../kit/icon/icon";
import { useSurface } from "../use-surface";

/** The line the server rang: the route's answer, nested under `data`, names it. */
const rangLine = (data: unknown) =>
  typeof data === "object" && data !== null && "line" in data && typeof data.line === "string" ? data.line : null;

export const LrControls = ({ c }: { c: LiveCallVM }) => {
  const [busy, setBusy] = useState<"hand" | "end" | null>(null);
  const [arm, setArm] = useState(false);
  const [toastNode, flash] = useLegacyToast();
  const F = useSurface("settings")?.facts;
  const Confirm = confirmPart();
  const facts: Partial<ResolvedFacts> = (F && F.facts) || {};
  const line = (facts.handoff_number && facts.handoff_number.value) || null;
  // Only a line Settings has been read to lack disables the button. Before that read it said to add a line
  // the workspace may well have; the server knows the line, and refuses plainly without one.
  const noLine = !!(F && F.facts) && !line;
  const handOver = async () => {
    if (busy) return;
    setBusy("hand");
    const r = await handOverCall(c.callId);
    setBusy(null);
    // The line the server rang: the client nests the route's answer under data, so r.line was never there.
    const rang = (r.ok && rangLine(r.data)) || line;
    if (r.ok)
      flash({
        msg: (
          <>Asked the receptionist to pass the call to {rang || "the business's line"} — it should ring in a moment</>
        ),
      });
    else flash({ tone: "danger", msg: <>Not passed — {r.message}</> });
  };
  const end = async () => {
    if (busy) return;
    setArm(false);
    setBusy("end");
    const r = await endCall(c.callId);
    setBusy(null);
    if (r.ok) flash({ msg: <>Call ended</> });
    else flash({ tone: "danger", msg: <>Not ended — {r.message}</> });
  };
  return (
    <div className="lm-call-controls" data-testid="live-controls">
      <button
        className="btn btn-sm"
        onClick={handOver}
        disabled={!!busy || noLine}
        title={
          line
            ? `Rings ${line}, the business's own line`
            : noLine
              ? "Add the business's own line under Settings to pass calls to it"
              : "Rings the business's own line, from Settings"
        }
        data-testid="live-hand-over"
        {...gate("approve")}
      >
        <Icon name="phone" size={12} /> {busy === "hand" ? "Passing…" : "Pass the call to me"}
      </button>
      {arm ? (
        <Confirm
          question="End the call?"
          detail="The caller is cut off."
          yes="Yes, end it"
          busyLabel="Ending…"
          danger
          busy={busy === "end"}
          onYes={end}
          onNo={() => setArm(false)}
          testid="live-end"
        />
      ) : (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setArm(true)}
          disabled={!!busy}
          data-testid="live-end"
          {...gate("approve")}
        >
          {busy === "end" ? "Ending…" : "End the call"}
        </button>
      )}
      {toastNode}
    </div>
  );
};
