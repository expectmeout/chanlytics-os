/**
 * The controls on a draft counting down to send (moved from pages/inbox-thread.jsx, decision 0015): the veto bar, and
 * the one line that has the receptionist write the waiting draft again.
 */
import { useState } from "react";
import { Icon } from "../../kit/icon/icon";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { gate, useToast } from "../shell";
import { trustRateFor } from "./shell-thread";
import { steerDraft } from "../verbs";
import type { Thread, Veto } from "../types";

// =============== STEER — rewrite a held draft to the owner's instruction ===============
// The WhatsApp counterpart of the call whisper. One line, and the receptionist
// writes the waiting draft again with it in mind, under the same rules; the
// new draft waits its turn like the first one. Nothing is sent from here.
export const SteerBox = ({ messageId }: { messageId: string }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toastNode, flash] = useToast();
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await steerDraft(messageId, t);
    setBusy(false);
    if (r.ok) {
      setText("");
      flash({ msg: <>Rewritten — the new draft waits its turn like the first one</> });
    } else {
      flash({ tone: "danger", msg: <>Not rewritten — {r.message}</> });
    }
  };
  return (
    <div className="ix-steer" data-testid="steer-box">
      <Icon name="sparkle" size={12} />
      <input
        className="ix-steer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void send();
        }}
        placeholder="Tell it what to change — “mention Saturday is full”, “shorter, in Spanish”"
        maxLength={500}
        disabled={busy}
        aria-label="Instruction for the rewrite"
      />
      <button className="btn btn-sm" onClick={send} disabled={busy || !text.trim()} {...gate("approve")}>
        {busy ? "Rewriting…" : "Rewrite"}
      </button>
      {toastNode}
    </div>
  );
};

// =============== VETO BAR — countdown on a safe draft ===============
/** A thread with a draft counting down: the bar's own. */
type VetoThread = Thread & { veto: Veto };

/** Whether a thread has a draft counting down: the bar's guard, which the type follows. */
export const hasVeto = (thread: Thread): thread is VetoThread => !!thread.veto;

interface VetoBarProps {
  thread: VetoThread;
  remaining: number | null | undefined;
  paused?: boolean;
  onAct?: (threadId: string, act: string) => void;
  onTakeOver?: (threadId: string) => void;
}

/** What the countdown says: the seconds left, the pause while you are away, the send, or the hold. */
function vetoSays(thread: VetoThread, remaining: number | null | undefined, paused: boolean) {
  return remaining != null ? (
    paused ? (
      <>
        Paused at <b>{remaining}s</b> — you're away
      </>
    ) : thread.real && remaining === 0 ? (
      <b>Sending now…</b>
    ) : (
      <>
        <b>Auto-sends in {remaining}s</b>
      </>
    )
  ) : (
    <>Held — manual send</>
  );
}

/** The demo's edit rate for the agent, when the trust digest has one. */
function vetoTrust(thread: VetoThread) {
  const rate = trustRateFor(thread.agent.name);
  return rate !== null ? (
    <span className="ix-veto-trust" data-tip="30-day edit rate — under 5% is the earn-more-autonomy signal">
      {thread.agent.name} · {rate}% edit rate
    </span>
  ) : null;
}

export const VetoBar = ({
  thread,
  remaining,
  paused = false,
  onAct = () => {},
  onTakeOver = () => {},
}: VetoBarProps) => (
  <div className={`ix-veto ${remaining == null ? "held" : paused ? "paused" : remaining <= 10 ? "urgent" : ""}`}>
    <span className="ix-veto-dot"></span>
    <span
      className="ix-veto-msg"
      role="timer"
      data-tip={
        thread.real
          ? "This draft sends itself at zero. Hold stops it, and so does starting to type a reply."
          : "This draft sends itself at zero — Edit, Hold, or typing a reply cancels it"
      }
    >
      {vetoSays(thread, remaining, paused)}
    </span>
    {/* What a screen reader hears: the hold and the send, not a number every second (I3). */}
    <span className="ix-veto-said" role="status">
      {remaining == null
        ? "Held — this draft will not send."
        : thread.real && remaining === 0 && !paused
          ? "Sending now."
          : ""}
    </span>
    {thread.veto.policyClass && <PolicyChip cls={thread.veto.policyClass} />}
    {thread.veto.why && (
      <span className="ix-veto-why" title={thread.veto.why.reason || ""}>
        {thread.veto.why.heldFor === "low_confidence" ? "Not sure enough to send alone · " : ""}
        {thread.veto.why.summary}
        {thread.veto.why.facts.length ? ` · used: ${thread.veto.why.facts.join(", ")}` : ""}
      </span>
    )}
    {vetoTrust(thread)}
    <span className="ix-veto-spacer"></span>
    {remaining != null && (
      <>
        <button className="btn btn-ghost btn-sm" onClick={() => onAct(thread.id, "edit")} {...gate("approve")}>
          Edit
        </button>
        <button className="btn btn-sm" onClick={() => onAct(thread.id, "hold")} {...gate("approve")}>
          Hold
        </button>
      </>
    )}
    <button className="btn btn-ghost btn-sm" onClick={() => onTakeOver(thread.id)} {...gate("approve")}>
      Take over
    </button>
  </div>
);
