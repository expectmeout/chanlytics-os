/**
 * Your receptionist's reply counting down its veto window (decision 0071, E5): Today had a count of these and no row.
 * The row says what it will send and when, with Stop (the Inbox's Hold: POST messages/[id]/cancel-send), after which the
 * words are the member's to send as a reply; or Change it with Ask, which rewrites the held draft by an instruction
 * (contracts steerSpec, POST messages/[id]/steer) and lets the new one wait its turn. Left alone, it sends itself.
 */
import { useRef } from "react";
import { NEED_YOU_WORDS as W, sendCountdown } from "@chanlytics/contracts";
import { commitVerb } from "@/bridge/verbs/commit";
import { cancelSend } from "../../inbox/verbs";
import { Button, Meter } from "../../kit";
import { appNavigate } from "../shell";
import { SayToAsk } from "./sheet/ask-line";
import { Acts, Done, Note, Words, useTick, type WorkProps } from "./parts";
import { ReplyWork } from "./reply-work";
import { useRowState } from "./row-state";

/** How often the receptionist's countdown is drawn again. */
const HELD_TICK_MS = 250;

/** The receptionist's held reply as its row offers it: its words and countdown with Stop, or the words, held, to send. */
export function HeldWork(p: WorkProps) {
  const { row, may, flash, keep } = p;
  const held = row.held;
  // Kept by the row, not by this part: the sheet on a phone draws the same row's work after the page does (row-state.ts).
  const [stop, setStop] = useRowState<"no" | "busy" | "held" | "gone">(row.id, "stop", "no");
  const [why, setWhy] = useRowState<string | null>(row.id, "steerWhy", null);
  const [rewrite, setRewrite] = useRowState<"no" | "busy" | "done">(row.id, "rewrite", "no");
  const now = useTick(stop === "no" && rewrite !== "done", HELD_TICK_MS);
  // The grace as first seen, so the meter empties from here: the row may be drawn partway through it.
  const first = useRef(held ? Math.max(1, held.sends_at_ms - Date.now()) : 1);
  if (!held) return null;
  const wire = row.writes?.wire ?? row.channel;

  if (stop === "held") return <ReplyWork {...p} row={{ ...row, prepared: held.text }} by={W.held.heldReply} />;
  if (rewrite === "done") return <Done words={W.held.rewritten} foot={p.foot} />;
  const { seconds, share } = sendCountdown(held.sends_at_ms - first.current, held.sends_at_ms, now);
  if (stop === "gone" || seconds <= 0)
    return (
      <Done
        words={W.sent}
        detail={stop === "gone" ? W.held.gone : W.held.by(wire)}
        act={{ label: W.open, onPress: () => appNavigate(row.cta.to) }}
        foot={p.foot}
      />
    );

  const stopIt = async () => {
    setStop("busy");
    keep({ ...row, status: [W.held.held] });
    // The Inbox's own Hold of the receptionist's draft (inbox/verbs.ts): the one call that withdraws it.
    const r = await cancelSend(held.message_id);
    setStop(r.ok ? "held" : "gone");
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
  };
  // Not kept on the card: the rewrite is a new held reply with its own deadline, which the next read draws in this row's
  // place (keyed by its message, rows.tsx) with its own countdown and Stop. Kept, the old row stood over it unseen.
  const rewriteIt = async (words: string) => {
    setRewrite("busy");
    setWhy(null);
    const r = await commitVerb("steer", { message_id: held.message_id, instruction: words, who: row.who });
    if (!r.ok) {
      setRewrite("no");
      setWhy(r.message);
      return false;
    }
    setRewrite("done");
    return true;
  };
  const going = (
    <Meter
      size="sm"
      parts={[
        { share: Math.max(0.001, share), color: "var(--accent)" },
        { share: Math.max(0, 1 - share), tone: "rest" },
      ]}
      aria-label={W.sendingTo(row.who, wire)}
    />
  );

  return (
    <>
      <Words label={W.held.goesIn(seconds)} asks text={held.text} who={row.who} onChange={null} onRead={p.read} />
      {going}
      {p.whole && may ? (
        <SayToAsk placeholder={W.say.tellHeld} onSay={rewriteIt} busy={rewrite === "busy"} why={why} />
      ) : null}
      {!may ? <Note>{W.viewer}</Note> : null}
      <Acts
        foot={p.foot}
        end={
          <Button
            variant="secondary"
            onClick={() => void stopIt()}
            disabled={stop === "busy" || !may}
            aria-busy={stop === "busy" || undefined}
          >
            {W.held.stopIt}
          </Button>
        }
      />
    </>
  );
}
