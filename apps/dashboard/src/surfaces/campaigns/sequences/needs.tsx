/**
 * What needs you in a sequence to leads, open at the top of its Leads tab (the canvas's People board): for each batch that
 * holds them, the emails the check held, each with why and its answers at its end, and "Send all N as they are" over the
 * ones that may go as written; then the emails handed to you to send from your own inbox, each with its doors into your
 * mail and its Sent or Skip (0059). Read from the batch's run, the read its sheet in Sent makes (GET broadcasts/:id, kept
 * for the run, so opening it there is at once), and decided through the same verbs (`sequence_send_decide`,
 * `sequence_send_said`: reach-out/approval.tsx, to-send.tsx), so a held email decided here is decided everywhere, with
 * the same receipt. "Send all" presses the one verb once for each, and says what went in one toast. A customer's sequence
 * holds none of these: its batches wait for an OK, which the record's one notice asks.
 */
import { useState } from "react";
import { SEQUENCE_NEEDS_WORDS as N, TO_SEND_ROUTE, type ReachOutDecision } from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { FailedRead } from "../../kit/empty/empty";
import { StatePill } from "../../kit/pill/state-pill";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { canDo, refusalToast, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { broadcasts } from "../broadcasts/verbs";
import { RoRunHeld, useRoRunDoors } from "../reach-out/approval";
import { reachOuts } from "../reach-out/surface";
import { RoToSend } from "../reach-out/to-send";
import { useSequenceRead } from "./use-record";

/** The held that may go as they are: those whose answers include sending it as written. */
const goesAsIs = (doors: readonly (readonly [ReachOutDecision, string])[]) =>
  doors.some(([door]) => door === "include");

type Flash = (flash: LegacyFlash) => void;

/** One batch's held and handed-over emails, read from its run. */
function NeedsBatch({ id, flash, onDecided }: { id: string; flash: Flash; onDecided: () => void }) {
  const [again, setAgain] = useState(0);
  const [sending, setSending] = useState(false);
  const read = useSequenceRead(id, broadcasts.detail, broadcasts.peekDetail, again);
  const decided = () => {
    setAgain((n) => n + 1);
    onDecided();
  };
  const doors = useRoRunDoors(id, decided);
  if (read.state === "failed")
    return <FailedRead what={N.failed} why={read.why} onRetry={decided} testid={`sq-needs-failed-${id}`} />;
  if (read.state === "reading") return <p className="sq-more">{N.reading}</p>;
  const d = read.data;
  const vm = reachOuts.run(d);
  const toSend = reachOuts.toSend(d);
  const may = canDo("approve");
  const asIs = vm ? vm.held.filter((h) => goesAsIs(h.doors)) : [];
  // Each through its own verb, one after another; what went is said once, and the first refusal in its door's words.
  const sendAll = async () => {
    setSending(true);
    let went = 0;
    let no: ApiRefusal | null = null;
    for (const h of asIs) {
      const r = await commitVerb("sequence_send_decide", {
        send_id: h.id,
        decision: "include",
        name: h.name,
        run_id: id,
      });
      if (r.ok) went += 1;
      else no ??= r;
    }
    setSending(false);
    if (no) flash(refusalToast(no));
    else flash({ tone: "ok", msg: N.wentAll(went), undo: null });
    decided();
  };
  return (
    <>
      {vm && vm.held.length > 0 ? (
        <section className="sq-needs-part" aria-label={N.held} data-testid="sq-needs-held">
          <h4 className="sq-needs-head">
            {N.held}
            <span className="tally tally-warn">{vm.held.length}</span>
            {may && asIs.length > 0 ? (
              <LinkButton
                className="sq-group-act"
                disabled={sending}
                aria-busy={sending || undefined}
                onClick={() => void sendAll()}
                data-testid="sq-needs-send-all"
              >
                {sending ? N.sending : N.sendAll(asIs.length)}
              </LinkButton>
            ) : null}
          </h4>
          <RoRunHeld vm={vm} may={may} busy={doors.busy} said={doors.said} onDecide={doors.decide} />
        </section>
      ) : null}
      {toSend ? (
        <section className="sq-needs-part" aria-label={N.toSend} data-testid="sq-needs-to-send">
          <h4 className="sq-needs-head">
            {N.toSend}
            <span className="tally tally-warn">{toSend.rows.length}</span>
            <LinkButton className="sq-group-act" {...routeDoor(TO_SEND_ROUTE)} data-testid="sq-needs-one-by-one">
              {N.oneByOne} <Icon name="chevron" size={11} />
            </LinkButton>
          </h4>
          <RoToSend d={d} onSaid={decided} bare />
        </section>
      ) : null}
    </>
  );
}

/**
 * Needs you, open: the held and the handed-over emails of each batch that holds them, under one count, the same the list's
 * row and the badge say. Nothing where none holds any.
 */
export function SequenceNeeds(p: { batches: string[]; count: number; flash: Flash; onDecided: () => void }) {
  const { batches, count, flash, onDecided } = p;
  if (batches.length === 0) return null;
  return (
    <section className="sq-needs-you" aria-label={N.title} data-testid="sq-needs-you">
      <h3 className="sq-group-name">
        <StatePill kind="tone" value="warn" label={N.title} />
        <span className="tally tally-warn">{count}</span>
      </h3>
      {batches.map((id) => (
        <NeedsBatch key={id} id={id} flash={flash} onDecided={onDecided} />
      ))}
    </section>
  );
}
