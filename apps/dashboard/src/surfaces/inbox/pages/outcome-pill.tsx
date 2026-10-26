/**
 * The pill on a Conversations row (conversations-page.tsx draws it): how the person stands, by the Inbox's rule first
 * and the conversation's outcome after, in the map's tones and the page's own words where it knows better. Moved out
 * of the page, which had grown past the 800 lines a file may hold.
 */
import { heldPill, type StateKind } from "@chanlytics/contracts";
import type { ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { holderName } from "../../holder-names";

// The row's outcome as the one pill draws it. The words a page knows better
// stay here (which channel answered, what you chose); the tones are the map's,
// so "Needs you" is amber here as it is in the Inbox and on a playbook.
// Who answered a handled chat, in the pill's words; a call keeps its own.
const CV_ANSWERED: Record<string, string> = {
  team: "Your team replied",
  broadcast: "Sent once",
  playbook: "Campaign sent",
};

/** What the row's pill says of how a person stands: its family, its state, and words of the page's own where it has some. */
interface OutcomeSaid {
  kind: StateKind;
  value: string;
  label?: ReactNode;
}

interface OutcomeOf {
  outcome: string;
  /** Who has the thread (contracts standingOf), read before the outcome: the Inbox's own word for the same row. */
  standing?: string | null;
  /** The teammate who has it, by user id, where `standing` is `theirs`: named as the Inbox's row names them (heldPill). */
  holderId?: string | null;
  decidedAction?: string | null;
  channel: string;
  answeredBy?: string | null;
}

function outcomeSaid({
  outcome,
  standing = null,
  holderId = null,
  decidedAction,
  channel,
  answeredBy = null,
}: OutcomeOf): OutcomeSaid {
  if (decidedAction)
    return {
      kind: "thread",
      value: "decided",
      label: (
        <>
          <Icon name="check" size={9} />
          Handled · you chose {decidedAction}
        </>
      ),
    };
  if (outcome === "live") return { kind: "call", value: "live" };
  // Who has the person's thread is the Inbox's rule, said in the Inbox's words, and a call stands as its thread does
  // (cv-rules.ts cvCallsStandAsTheirThread). "Needs you" here read "Receptionist replied" over an open escalation, and
  // "Needs you" over a thread you had taken over (the 2 Oct 2026 audit); a call after it read "Hung up early".
  if (standing === "needs_you") return { kind: "thread", value: "escalated" };
  if (standing === "yours") return { kind: "thread", value: "yours" };
  if (standing === "theirs")
    return { kind: "thread", value: "theirs", label: heldPill("theirs", holderName(holderId)) };
  if (standing === "snoozed") return { kind: "thread", value: "snoozed" };
  if (outcome === "missed") return { kind: "call", value: "missed" };
  // A call's own story beats "handled": the caller who asked for a call back, the one who hung up in seconds, the
  // one who reached the voicemail, and the dial the provider could not place (contracts toCallVM decides each).
  if (outcome === "callback" || outcome === "abandoned" || outcome === "voicemail" || outcome === "failed")
    return { kind: "call", value: outcome };
  if (outcome === "booked") return { kind: "thread", value: "booked" };
  if (outcome === "escalated") return { kind: "thread", value: "escalated" };
  // A call that was simply handled says what Live and the thread's call card say of it: the call's own word.
  if (outcome === "handled" && channel === "phone") return { kind: "call", value: "handled" };
  if (outcome === "handled")
    return {
      kind: "thread",
      value: "handled",
      label: (answeredBy && CV_ANSWERED[answeredBy]) || "Receptionist replied",
    };
  // The customer had the last word — it is your turn, not theirs; this read "Customer's turn" for a year.
  return { kind: "thread", value: "open" };
}

// On a desk the pill gives way to the name in the row's first line (kit .pill-fit): "Robin Exa…" stood beside a whole
// "Receptionist replied", where the name is what the row is for.
export const OutcomePill = (p: OutcomeOf) => {
  const said = outcomeSaid(p);
  return <StatePill kind={said.kind} value={said.value} label={said.label} fit className="cv-row-state" />;
};
