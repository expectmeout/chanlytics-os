/**
 * A row's door in a reach-out's People (canvas B's Campaigns, the drawer's point 2): each lead's real inverse at the point
 * it is at. Waiting in a run that waits for its owner's say: Open the run, where Approve and Skip stay. Waiting on a list
 * its owner adds to, nothing on its way: Leave out (00423 reach_out_leave_out), with its undo in the toast. Written to:
 * Stop writing to them, asked first, since it is final. Done: none, its name is the door to the lead. Each is an
 * operator's, as the doors are; a role that may not is shown none (the block's head says who may).
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { REACH_OUT_ADD_WORDS, REACH_OUT_STOP_WORDS } from "@chanlytics/contracts";
import type { ReachOutChainDto, ReachOutLeadLineDto } from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { LinkButton } from "../../kit/link-button/link-button";
import { canDo, refusalToast, routeDoor } from "../../legacy-verbs";
import { reachOuts } from "./surface";

/** What the toast raises (the shell's one flash), with its Undo where an act has one. */
export type PeopleFlash = (flash: { tone?: string; msg: ReactNode; undo?: (() => unknown) | null }) => void;

/** The groups of a reach-out's People, in the order a lead moves through them. */
type PeopleGroup = "waiting" | "writing" | "done";

/** A door's answer, as the toast reads it: done, or its refusal (said as the shell's refusalToast says one). */
type Said = { ok: boolean } | null | undefined;

interface PersonDoorProps {
  chain: ReachOutChainDto;
  group: PeopleGroup;
  line: ReachOutLeadLineDto;
  /** Its reach-out is fed by a list its owner adds to (and takes from). */
  listFed: boolean;
  flash: PeopleFlash | undefined;
  /** A lead moved: the block reads again, and every page that hears `reach_out:leads` does. */
  moved: () => void;
}

export function PersonDoor({ chain, group, line, listFed, flash, moved }: PersonDoorProps) {
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  if (!canDo("approve") || group === "done") return null;
  const name = line.business_name ?? "this business";
  const say = (r: Said, ok: string, undo: (() => unknown) | null = null) =>
    flash?.(r && r.ok ? { tone: "ok", msg: ok, undo } : refusalToast(r as Parameters<typeof refusalToast>[0]));
  const run = chain.next.waiting_run_id;
  if (group === "waiting" && line.held && run)
    return (
      <span className="ro-person-door">
        <LinkButton {...routeDoor(`broadcasts/run:${run}`)} data-testid="ro-person-run">
          Open the run
        </LinkButton>
      </span>
    );
  if (group === "waiting") {
    if (!listFed) return null;
    const leave = async () => {
      setBusy(true);
      const r = await reachOuts.leaveOut(chain.root_id, line.lead_id).finally(() => setBusy(false));
      const back =
        r && r.ok
          ? async () => {
              say(await reachOuts.undoOperation(r.data.op_id, r.data.version), REACH_OUT_ADD_WORDS.backOn(name));
              moved();
            }
          : null;
      say(r, REACH_OUT_ADD_WORDS.leftOut(name), back);
      moved();
    };
    return (
      <span className="ro-person-door">
        <LinkButton onClick={() => void leave()} disabled={busy} data-testid="ro-person-leave">
          {REACH_OUT_ADD_WORDS.leaveOut}
        </LinkButton>
      </span>
    );
  }
  const W = REACH_OUT_STOP_WORDS;
  const stop = async () => {
    setSure(false);
    setBusy(true);
    const r = await reachOuts.stopLead(line.lead_id).finally(() => setBusy(false));
    say(r, r && r.ok && r.data && r.data.already ? W.already(name) : W.done(name));
    moved();
  };
  return sure ? (
    <div className="ro-person-ask">
      <Confirm
        question={W.ask(name)}
        detail={W.detail}
        yes={W.yes}
        danger
        busy={busy}
        onYes={() => void stop()}
        onNo={() => setSure(false)}
        testid="ro-person-stop"
      />
    </div>
  ) : (
    <span className="ro-person-door">
      <LinkButton tone="danger" onClick={() => setSure(true)} disabled={busy} data-testid="ro-person-stop-ask">
        {W.yes}…
      </LinkButton>
    </span>
  );
}
