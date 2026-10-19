/**
 * What needs you in a sequence to leads, open at the top of its Leads tab (the canvas's People board), laid out from People's
 * one read (00447, contracts peopleNeedsOf), never each batch's run beside it: the emails the check held, a row each with
 * why in amber and its answers under it, "Send all N as they are" over those that may go as written; then the emails
 * handed to you to send from your own inbox, each the row every To send draws (reach-out/to-send.tsx RoToSendRows): your
 * mail app first, the rest under its More, and Sent or Skip at its end (0059). Decided through the verbs Sent's run sheet
 * presses (`sequence_send_decide`, `sequence_send_said`), so a held email decided here is decided everywhere, with the
 * same receipt; "Send all" presses the one verb once for each, and says what went in one toast. A batch whose rows came
 * without their drafts (a server before 00447) is opened in Sent. A customer's sequence holds none of these: its batches
 * wait for an OK, which the record's one notice asks.
 */
import { useState } from "react";
import {
  SEQUENCE_NEEDS_WORDS as N,
  TO_SEND_ROUTE,
  peopleNeedsOf,
  runRoute,
  type ReachOutDecision,
  type SequenceHeldVM,
  type SequencePersonDto,
} from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { StatePill } from "../../kit/pill/state-pill";
import { canDo, refusalToast, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { leadOverDoor } from "../../leads/sheet/lead-over";
import { RoToSendRows } from "../reach-out/to-send";
import { pressed } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** One email the check held: whose (its lead's door), why, and its answers, each the decide verb. */
function HeldRow(p: { h: SequenceHeldVM; may: boolean; busy: boolean; onDecide: (door: ReachOutDecision) => void }) {
  const { h, may, busy, onDecide } = p;
  return (
    <ListRow
      face={{ person: { name: h.name }, size: "sm" }}
      name={
        h.leadId ? (
          <LinkButton size="inherit" {...leadOverDoor(h.leadId)} data-testid="sq-held-lead">
            {h.name}
          </LinkButton>
        ) : (
          h.name
        )
      }
      said={(place) => <div className={`${place} sq-needs sq-held-why`}>{h.why}</div>}
      facts={
        may
          ? h.doors.map(([door, words]) => (
              <LinkButton
                key={door}
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => onDecide(door)}
                data-testid={`sq-held-${door}`}
              >
                {words}
              </LinkButton>
            ))
          : []
      }
      data-testid="sq-held"
    />
  );
}

interface NeedsProps {
  rows: readonly SequencePersonDto[];
  count: number;
  timezone: string;
  flash: Flash;
  onDecided: () => void;
}

/**
 * Needs you, open: the held and the handed-over emails, under one count, the same the list's row and the badge say.
 * Nothing where none holds any.
 */
export function SequenceNeeds({ rows, count, timezone, flash, onDecided }: NeedsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const vm = peopleNeedsOf(rows, { timezone, now: Date.now() });
  if (vm.held.length === 0 && vm.toSend.length === 0 && vm.unread.length === 0) return null;
  const may = canDo("approve");
  // The emails to send this read holds, with or without their drafts: what the part's tally counts.
  const handed = rows.filter((r) => r.group === "to_send").length;
  const decide = async (h: SequenceHeldVM, door: ReachOutDecision) => {
    setBusy(h.id);
    await pressed(
      "sequence_send_decide",
      { send_id: h.id, decision: door, name: h.name, run_id: h.batchId },
      flash,
      onDecided,
    );
    setBusy(null);
  };
  // Each through its own verb, one after another; what went is said once, and the first refusal in its door's words.
  const sendAll = async () => {
    setBusy("all");
    let went = 0;
    let no: ApiRefusal | null = null;
    for (const h of vm.asIs) {
      const r = await commitVerb("sequence_send_decide", {
        send_id: h.id,
        decision: "include",
        name: h.name,
        run_id: h.batchId,
      });
      if (r.ok) went += 1;
      else no ??= r;
    }
    setBusy(null);
    if (no) flash(refusalToast(no));
    else flash({ tone: "ok", msg: N.wentAll(went), undo: null });
    onDecided();
  };
  return (
    <section className="sq-needs-you" aria-label={N.title} data-testid="sq-needs-you">
      <h3 className="sq-group-name">
        <StatePill kind="tone" value="warn" label={N.title} />
        <span className="tally tally-warn">{count}</span>
      </h3>
      {vm.held.length > 0 ? (
        <section className="sq-needs-part" aria-label={N.held} data-testid="sq-needs-held">
          <h4 className="sq-needs-head">
            {N.held}
            <span className="tally tally-warn">{vm.held.length}</span>
            {may && vm.asIs.length > 0 ? (
              <LinkButton
                className="sq-group-act"
                disabled={busy !== null}
                aria-busy={busy === "all" || undefined}
                onClick={() => void sendAll()}
                data-testid="sq-needs-send-all"
              >
                {busy === "all" ? N.sending : N.sendAll(vm.asIs.length)}
              </LinkButton>
            ) : null}
          </h4>
          <div className="sq-group-rows">
            {vm.held.map((h) => (
              <HeldRow key={h.id} h={h} may={may} busy={busy !== null} onDecide={(door) => void decide(h, door)} />
            ))}
          </div>
        </section>
      ) : null}
      {vm.toSend.length > 0 || vm.unread.length > 0 ? (
        <section className="sq-needs-part" aria-label={N.toSend} data-testid="sq-needs-to-send">
          <h4 className="sq-needs-head">
            {N.toSend}
            <span className="tally tally-warn">{handed}</span>
            <LinkButton className="sq-group-act" {...routeDoor(TO_SEND_ROUTE)} data-testid="sq-needs-one-by-one">
              {N.oneByOne} <Icon name="chevron" size={11} />
            </LinkButton>
          </h4>
          <div className="sq-to-send">
            <RoToSendRows
              rows={vm.toSend}
              runOf={(row) => vm.toSend.find((x) => x.id === row.id)?.batchId ?? null}
              onSaid={(said) => {
                flash({ tone: "ok", msg: said, undo: null });
                onDecided();
              }}
            />
          </div>
          {vm.unread.map((id) => (
            <LinkButton key={id} {...routeDoor(runRoute(id))} data-testid={`sq-needs-in-sent-${id}`}>
              {N.inSent} <Icon name="chevron" size={11} />
            </LinkButton>
          ))}
        </section>
      ) : null}
    </section>
  );
}
