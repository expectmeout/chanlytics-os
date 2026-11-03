/**
 * What the lead sheet's foot draws beyond its presses: their email handed over, the row every To send draws, its acts
 * alone in the dock (its mail apps, Sent or Skip), They wrote back…, what they replied in five words, which stops
 * their place as a read reply does, in the dock's place, and Rewrite the opening's what should change. Every word is
 * contracts'.
 */
import { toSendRowOf, type LeadPeekVM, type SequencePlaceDto, type ToSendRowVM } from "@chanlytics/contracts";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { RoSaidAsk } from "../../campaigns/reach-out/said-ask";
import { RoToSendRows } from "../../campaigns/reach-out/to-send";
import { RewriteAsk } from "../../campaigns/reach-out/rewrite-ask";
import { refusalToast } from "../../legacy-verbs";
import type { Flash } from "../peek/types";
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
