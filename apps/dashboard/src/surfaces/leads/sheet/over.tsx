/**
 * The lead sheet over another page (the canvas's W8 and its RecLeadOver board, 18 Oct 2026): a sequence's Leads row opens
 * its lead's sheet over the record, `?lead=<id>` on the record's own address, and Close (or Back) is the same row. It is
 * the one sheet (sheet.tsx), read on its own here: the lead by its id (GET leads/:id, the list's own builder), its place
 * (the one reader), the pick none (Add goes through the picker), no pile and no rows to walk. Its code is loaded as it is
 * first asked for (over-mount.tsx), so a page that never opens a lead pays nothing for it.
 */
import { useEffect, useState } from "react";
import { addressOf, toLeadPeekVM, type LeadPeekVM, type LeadRowDto } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { useCmPhone } from "../../campaigns/parts/split";
import { navigate, refusalToast, useLegacyToast } from "../../legacy-verbs";
import type { PeekActs } from "../peek/types";
import { setLeadStage } from "../surface";
import { closeLeadOver } from "./lead-over";
import { LeadSheet } from "./sheet";
import { useLeadAim } from "./use-aim";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** The lead, read by its id as a row of the list: null while it is read, or where it is not this workspace's. */
function useLeadRow(leadId: string): { row: LeadRowDto | null; failed: boolean } {
  const [got, setGot] = useState<{ id: string; row: LeadRowDto | null; failed: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void api()("GET leads/[id]", { params: { id: leadId } }).then((r) => {
      if (live) setGot({ id: leadId, row: r.ok ? r.data.row : null, failed: !r.ok });
    });
    return () => {
      live = false;
    };
  }, [leadId]);
  return got && got.id === leadId ? { row: got.row, failed: got.failed } : { row: null, failed: false };
}

/** The acts a lead opened over a page has: the stage door, a call from your phone, the person it became, Close. */
function overActs(vm: LeadPeekVM, flash: Flash): PeekActs {
  const none = () => undefined;
  const nothing = () => Promise.resolve(undefined);
  return {
    onClose: closeLeadOver,
    onExpand: none,
    onOpenPerson: (id) => navigate(addressOf({ kind: "person", id })),
    say: flash,
    onStage: async (stage) => {
      const r = await setLeadStage(vm.id, { kind: "stage", stage });
      flash(r.ok ? { tone: "ok", msg: r.data.toast } : refusalToast(r));
    },
    onBack: none,
    onNotAFit: none,
    // Erase stays on Leads, where the lead's whole record is: over a record its ⋯ holds the rare acts alone.
    menu: [],
    onEraseAsk: none,
    onErase: nothing,
    onWhy: nothing,
    onKeep: none,
    onExclude: none,
    onPutBack: none,
    onCopy: (id) => void navigator.clipboard?.writeText(id === vm.id ? (vm.reach.email.address ?? "") : ""),
    onCopyPhone: () => void navigator.clipboard?.writeText(vm.reach.phone ? vm.reach.phone.value : ""),
    // Your phone dials it: an href handed to the browser, never a call placed from here.
    onCall: () => {
      const tel = vm.reach.phone ? vm.reach.phone.tel : null;
      if (tel) window.location.href = tel;
    },
    onLogCall: none,
    onOutcome: none,
    onNote: none,
    onSpokeWith: none,
    onCancelCall: none,
    onSaveCall: nothing,
    onDraft: nothing,
    onTone: nothing,
    onOpenMail: none,
    onCopyDraft: nothing,
    onSaidSent: nothing,
    onNotYet: none,
    reachOut: null,
  };
}

/** The lead over the page: its sheet once its row is read; nothing while it is, and Close where it is not here. */
export function LeadSheetOver({ leadId }: { leadId: string }) {
  const [toast, flash] = useLegacyToast();
  const phone = useCmPhone();
  const { row, failed } = useLeadRow(leadId);
  const aim = useLeadAim({ searches: [], searchId: null });
  useEffect(() => {
    if (failed) closeLeadOver();
  }, [failed]);
  if (!row) return <>{toast}</>;
  const vm = toLeadPeekVM(row, null, reachOuts.zone(), new Date());
  return (
    <>
      <LeadSheet
        row={null}
        vm={vm}
        phone={phone}
        tz={reachOuts.zone()}
        mode={null}
        armed={null}
        draft={null}
        busy={false}
        deck={null}
        on={overActs(vm, flash)}
        aim={aim}
        pile={null}
        searchId={null}
        flash={flash}
        onClose={closeLeadOver}
        over
      />
      {toast}
    </>
  );
}
