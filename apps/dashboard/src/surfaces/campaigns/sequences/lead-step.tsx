/**
 * A sequence to leads' step, open (the canvas's Leads board): each email is written for its business and checked before it
 * goes, so the step has no words of its own to show; the step going now shows the next one as it reads, the first ready
 * business's email of the batch to come with its opening marked (reach-out/approval.tsx RoRunWords), read from that batch's
 * run as its sheet in Sent reads it. A step not going now says how its emails are made, and where it sends from.
 */
import { SEQUENCE_FLOW_WORDS as F } from "@chanlytics/contracts";
import { broadcasts } from "../broadcasts/verbs";
import { RoRunWords } from "../reach-out/approval";
import { reachOuts } from "../reach-out/surface";
import { useSequenceRead } from "./use-record";

/** The next batch's first ready email, as it reads: nothing until it is read, or where it holds none yet. */
function NextEmail({ batch }: { batch: string }) {
  const read = useSequenceRead(batch, broadcasts.detail, broadcasts.peekDetail);
  const vm = read.state === "read" ? reachOuts.run(read.data) : null;
  if (!vm || vm.words.length === 0) return null;
  return (
    <div className="sq-lead-mail" data-testid="sq-lead-sample">
      <p className="sq-ed-k">{F.sample}</p>
      <RoRunWords vm={vm} />
    </div>
  );
}

/** An open step of a sequence to leads: the next email as it reads where its batch is the one to come, and how each is made. */
export function LeadStepOpen({ batch }: { batch: string | null }) {
  return (
    <div className="sq-msg" data-testid="sq-lead-open">
      {batch ? <NextEmail batch={batch} /> : null}
      <p className="sq-msg-meta">{F.checked}</p>
    </div>
  );
}
