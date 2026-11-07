/**
 * What the lead sheet's foot draws beyond its presses: their email handed over, the row every To send draws, its acts
 * alone in the dock (its mail apps, Sent or Skip), They wrote back…, what they replied in five words, which stops
 * their place as a read reply does, in the dock's place, Rewrite the opening's what should change, what Approve asks
 * before a batch goes, and what Take out asks. Every word is contracts'.
 */
import { toSendRowOf, type LeadPeekVM, type SequencePlaceDto, type ToSendRowVM } from "@chanlytics/contracts";
import { leadApproveAskOf } from "./model/now";
import { leadLeaveAskOf } from "./model/dock";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { RoSaidAsk } from "../../campaigns/reach-out/said-ask";
import { RoToSendRows } from "../../campaigns/reach-out/to-send";
import { RewriteAsk } from "../../campaigns/reach-out/rewrite-ask";
import { Confirm } from "../../kit/confirm/confirm";
import { LinkButton } from "../../kit/link-button/link-button";
import { refusalToast } from "../../frame-verbs";
import type { Flash, PeekActs } from "../peek/types";
import type { SheetWaiting } from "./facts";
import { approveOne, openRunFor, type SheetRun } from "./run";
import type { SheetUiState } from "./sheet-ui";

interface DockAskProps {
  vm: LeadPeekVM;
  flash: Flash;
  /** Said once what was asked is done: their place is read again. */
  moved: () => void;
}

/** Their email handed over, its acts alone; nothing where their place holds no draft. */
export function SheetToSend(p: DockAskProps & { place: SequencePlaceDto | null; tz: string }) {
  const row = p.place ? p.place.place : null;
  if (!row || !row.draft || !row.send_id) return null;
  const vmRow: ToSendRowVM = toSendRowOf(
    {
      send_id: row.send_id,
      lead_id: p.vm.id,
      business_name: p.vm.name,
      angle: row.draft.angle,
      to: row.draft.to,
      subject: row.draft.subject,
      text: row.draft.text,
      drafted_at: row.draft.drafted_at,
      follow_up: row.draft.follow_up,
    },
    { timezone: p.tz, now: Date.now() },
  );
  return (
    <span className="lw-dock-send" data-testid="lead-sheet-to-send">
      <RoToSendRows
        dock
        rows={[vmRow]}
        runOf={() => row.batch_id}
        onSaid={(said) => {
          p.flash({ tone: "ok", msg: said, undo: null });
          p.moved();
        }}
      />
    </span>
  );
}

/** They wrote back…: what they replied, in five words, which stops their place as a read reply does. */
export function SheetSaidAsk(
  p: DockAskProps & { busy: { on: boolean; set: (on: boolean) => void }; onBack: () => void },
) {
  const { vm, flash, busy } = p;
  return (
    <div className="lw-dock-ask" data-testid="lead-sheet-said">
      <RoSaidAsk
        business={vm.name}
        busy={busy.on}
        onSay={(intent, more) => {
          busy.set(true);
          void reachOuts
            .sayReply(vm.id, { intent, ...more })
            .then((r) => {
              if (!r.ok) return flash(refusalToast(r));
              flash({
                tone: "ok",
                msg: reachOuts.saidReplyWords(vm.name, intent, r.data.resume_at ?? null, more.refer_to ?? null),
              });
              p.onBack();
              p.moved();
            })
            .finally(() => busy.set(false));
        }}
        onBack={p.onBack}
        testid="lead-sheet-said"
      />
    </div>
  );
}

/**
 * Rewrite the opening, asked in the dock's place (00505; campaigns/reach-out/rewrite-ask.tsx): the email said as being
 * written while it is, and the Undo a landed rewrite keeps beside it.
 */
export function SheetRewrite(p: {
  row: { send_id: string | null; batch_id: string | null };
  name: string;
  flash: Flash;
  moved: () => void;
  put: (next: Partial<SheetUiState>) => void;
}) {
  const sendId = p.row.send_id;
  if (!sendId) return null;
  return (
    <RewriteAsk
      sendId={sendId}
      runId={p.row.batch_id}
      name={p.name}
      flash={p.flash}
      moved={p.moved}
      onBack={() => p.put({ ask: null })}
      onWriting={(on) => p.put({ writing: on })}
      onLanded={(kept) => p.put({ undo: kept ? { sendId, kept } : null })}
      testid="lead-sheet-rewrite"
    />
  );
}

/**
 * The acts the sheet's questions press, where an email of your own, sent from the mailbox or said sent, brings the card
 * back from the draft, reads their History again and, while a sequence they stand in would write on, asks Take out next.
 * Its Undo takes the question back with it. A call asks nothing: one that reached them moves the lead past what the send
 * door writes to (contracts outreachRefusalOf), and the rest leave its sequence running.
 */
export function wroteActsOf(
  on: PeekActs,
  p: { stands: boolean; ask: () => void; unask: () => void; moved: () => void },
): PeekActs {
  const afterwards = (kept: boolean) => {
    if (kept) {
      on.onBack();
      p.moved();
      if (p.stands) p.ask();
    }
    return kept;
  };
  return {
    ...on,
    onSaidSent: () => on.onSaidSent().then(afterwards),
    onSend: () =>
      on
        .onSend(() => {
          p.unask();
          p.moved();
        })
        .then(afterwards),
  };
}

/**
 * Take out, asked in the dock's place (the review of 4 Nov 2026: two ways to stop, each hidden, now one with two answers):
 * out of the sequence that runs for them and what follows, and Never write to them again under it, the stop door's own
 * question. Once you said you sent an email of your own, the same question, said for why.
 */
export function SheetLeaveAsk(p: {
  vm: LeadPeekVM;
  place: SequencePlaceDto;
  wrote: boolean;
  busy: boolean;
  onYes: () => void;
  onNever: () => void;
  onNo: () => void;
}) {
  const ask = leadLeaveAskOf({ name: p.vm.name, place: p.place, wrote: p.wrote });
  return (
    <Confirm
      question={ask.question}
      detail={
        <>
          {ask.detail}
          {ask.never ? (
            <span className="lw-leave-never">
              <LinkButton className="lw-link" onClick={p.onNever} data-testid="lead-sheet-leave-never">
                {ask.never}
              </LinkButton>
            </span>
          ) : null}
        </>
      }
      yes={ask.yes}
      no={ask.no}
      busy={p.busy}
      onYes={p.onYes}
      onNo={p.onNo}
      testid="lead-sheet-leave"
    />
  );
}

/**
 * What Approve asks before their batch goes, in the dock's place: how many, from where and over how long, the held emails
 * that stay with you, and the way to read every email of it (the run's own screen, and back to this lead).
 */
export function SheetApproveAsk(p: {
  run: SheetRun;
  waiting: SheetWaiting | null;
  at: { sequenceId: string; runId: string };
  busy: { on: boolean; set: (on: boolean) => void };
  onClose: () => void;
}) {
  const w = p.waiting;
  const ask = leadApproveAskOf({
    n: w ? w.ready : 1,
    held: w ? w.held : 0,
    from: w ? w.from : null,
    pace: w ? w.pace : null,
  });
  return (
    <Confirm
      question={ask.question}
      detail={
        <>
          {ask.detail}
          {ask.read ? (
            <span className="lw-approve-read">
              <LinkButton
                onClick={() => openRunFor(p.run, p.at.sequenceId, p.at.runId)}
                data-testid="lead-sheet-approve-read"
              >
                {ask.read}
              </LinkButton>
            </span>
          ) : null}
        </>
      }
      yes={ask.yes}
      no={ask.no}
      busy={p.busy.on}
      onYes={() => {
        p.onClose();
        p.busy.set(true);
        void approveOne(p.run).finally(() => p.busy.set(false));
      }}
      onNo={p.onClose}
      testid="lead-sheet-approve"
    />
  );
}
